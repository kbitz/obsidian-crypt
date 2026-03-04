/**
 * .vault-meta.json schema, read/write, migration.
 */

import { Vault } from "obsidian";

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
	state: "locked" | "unlocked";
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

export async function readMeta(
	vault: Vault,
	scopePath: string
): Promise<VaultMeta | null> {
	const metaPath = `${scopePath}/${META_FILENAME}`;
	const file = vault.getAbstractFileByPath(metaPath);
	if (!file) return null;

	try {
		const content = await vault.read(file as any);
		const parsed = JSON.parse(content) as VaultMeta;
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
	if (existing) {
		await vault.modify(existing as any, content);
	} else {
		await vault.create(metaPath, content);
	}
}

function migrate(meta: VaultMeta): VaultMeta {
	// Future migrations go here. For now, version 1 is current.
	return meta;
}
