/**
 * .vault-meta.json schema, read/write, migration.
 */

import type { Vault } from "obsidian";

export const META_FILENAME = ".vault-meta.json";
export const CURRENT_VERSION = 1;

export interface FileEntry {
	original_name: string;
	iv: string; // base64
	added: string; // ISO date
	tag?: string;
	subfolder: string;
	size_bytes: number;
}

export interface VaultMeta {
	version: number;
	state: "locked" | "unlocked" | "locking";
	salt: string; // base64
	pbkdf2_iterations: number;
	locked_at: string | null;
	files: Record<string, FileEntry>;
}

export function createEmptyMeta(
	salt: string,
	iterations: number
): VaultMeta {
	return {
		version: CURRENT_VERSION,
		state: "unlocked",
		salt,
		pbkdf2_iterations: iterations,
		locked_at: null,
		files: {},
	};
}

export function createFileEntry(
	name: string,
	iv: string,
	added: string,
	subfolder: string,
	sizeBytes: number,
	tag?: string
): FileEntry {
	return {
		original_name: name,
		iv,
		added,
		subfolder,
		size_bytes: sizeBytes,
		...(tag ? { tag } : {}),
	};
}

/** Duck-type check: file-like objects have a string `path` property and no `children`. */
function isFile(obj: unknown): boolean {
	return (
		typeof obj === "object" &&
		obj !== null &&
		"path" in obj &&
		typeof (obj as Record<string, unknown>).path === "string" &&
		!("children" in obj)
	);
}

export async function readMeta(
	vault: Vault,
	scopePath: string
): Promise<VaultMeta | null> {
	const metaPath = `${scopePath}/${META_FILENAME}`;
	const file = vault.getAbstractFileByPath(metaPath);
	if (!file || !isFile(file)) return null;

	try {
		const content = await vault.read(file as any);
		const parsed = JSON.parse(content);
		return migrate(parsed);
	} catch {
		return null;
	}
}

export async function writeMeta(
	vault: Vault,
	scopePath: string,
	meta: VaultMeta
): Promise<void> {
	const metaPath = `${scopePath}/${META_FILENAME}`;
	const content = JSON.stringify(meta, null, 2);
	const existing = vault.getAbstractFileByPath(metaPath);
	if (existing && isFile(existing)) {
		await vault.modify(existing as any, content);
	} else {
		await vault.adapter.write(metaPath, content);
	}
}

function migrate(raw: unknown): VaultMeta | null {
	if (
		typeof raw !== "object" ||
		raw === null ||
		!("version" in raw) ||
		!("state" in raw) ||
		!("salt" in raw) ||
		!("files" in raw)
	) {
		return null;
	}

	const meta = raw as VaultMeta;

	if (
		typeof meta.version !== "number" ||
		typeof meta.state !== "string" ||
		typeof meta.salt !== "string" ||
		typeof meta.files !== "object" ||
		meta.files === null
	) {
		return null;
	}

	// Future migrations go here. For now, version 1 is current.
	return meta;
}
