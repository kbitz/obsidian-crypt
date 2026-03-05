/**
 * .vault-meta.json schema, read/write, migration.
 */

import type { TFile, Vault } from "obsidian";

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

	// Try vault index first, fall back to adapter (index may lag after adapter.write)
	let content: string;
	const file = vault.getAbstractFileByPath(metaPath);
	if (file && isFile(file)) {
		try {
			content = await vault.read(file as any);
		} catch {
			return null;
		}
	} else {
		try {
			content = await vault.adapter.read(metaPath);
		} catch {
			return null;
		}
	}

	try {
		return migrate(JSON.parse(content));
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

/**
 * Write binary data using vault-level APIs so the file appears in Obsidian's index.
 * Falls back to adapter.writeBinary if the index is stale (e.g. retry after crash).
 */
export async function vaultWriteBinary(
	vault: Vault,
	path: string,
	data: ArrayBuffer
): Promise<void> {
	const existing = vault.getAbstractFileByPath(path);
	if (existing && isFile(existing)) {
		await vault.modifyBinary(existing as TFile, data);
	} else {
		try {
			await vault.createBinary(path, data);
		} catch {
			// File exists on disk but not in index — overwrite via adapter
			await vault.adapter.writeBinary(path, new Uint8Array(data));
		}
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
