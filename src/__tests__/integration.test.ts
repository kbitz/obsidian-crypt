/**
 * Integration tests simulating the full lock/unlock workflow
 * as performed by LockModal.doLock and UnlockModal.doUnlock,
 * against an in-memory mock vault.
 *
 * All file paths and byte content below are synthetic test fixtures —
 * no real files are read from disk.
 */
import { describe, it, expect } from "vitest";
import {
	generateSalt,
	generateIV,
	deriveKey,
	encrypt,
	decrypt,
	toBase64,
	fromBase64,
} from "../crypto";
import {
	createEmptyMeta,
	type VaultMeta,
	type FileEntry,
} from "../meta";

const ITERATIONS = 1000;

/** Minimal in-memory vault: maps path → ArrayBuffer */
type MemVault = Map<string, ArrayBuffer>;

/** Simulate LockModal.doLock — same logic as the real modal (with #1 salt fix) */
async function lockScope(
	vault: MemVault,
	scopePath: string,
	filePaths: string[],
	passphrase: string,
	existingMeta?: VaultMeta,
): Promise<VaultMeta> {
	// Reuse existing salt on re-lock (#1 fix)
	const salt = existingMeta ? fromBase64(existingMeta.salt) : generateSalt();
	const key = await deriveKey(passphrase, salt, ITERATIONS);
	const meta = existingMeta ?? createEmptyMeta(toBase64(salt), ITERATIONS);
	meta.files = {}; // Clear stale entries (#5 fix)

	for (const filePath of filePaths) {
		const plaintext = vault.get(filePath);
		if (!plaintext) throw new Error(`File not found: ${filePath}`);

		const iv = generateIV();
		const ciphertext = await encrypt(key, iv, plaintext);

		const encPath = filePath + ".enc";
		vault.set(encPath, ciphertext);
		vault.delete(filePath);

		const relative = filePath.slice(scopePath.length + 1);
		const subfolder = relative.includes("/")
			? relative.substring(0, relative.lastIndexOf("/"))
			: "";

		const entry: FileEntry = {
			original_name: filePath.split("/").pop()!,
			iv: toBase64(iv),
			added: "2026-03-04",
			subfolder,
			size_bytes: plaintext.byteLength,
		};
		meta.files[relative + ".enc"] = entry;
	}

	meta.state = "locked";
	meta.locked_at = new Date().toISOString();
	return meta;
}

/** Simulate UnlockModal.doUnlock — same logic as the real modal */
async function unlockScope(
	vault: MemVault,
	scopePath: string,
	meta: VaultMeta,
	passphrase: string,
): Promise<number> {
	const salt = fromBase64(meta.salt);
	const key = await deriveKey(passphrase, salt, meta.pbkdf2_iterations);

	const entries = Object.entries(meta.files);

	// Verify on first file (same as UnlockModal)
	if (entries.length > 0) {
		const [relPath, entry] = entries[0];
		const encPath = `${scopePath}/${relPath}`;
		const ciphertext = vault.get(encPath);
		if (ciphertext) {
			await decrypt(key, fromBase64(entry.iv), ciphertext);
		}
	}

	let count = 0;
	for (const [relPath, entry] of entries) {
		const encPath = `${scopePath}/${relPath}`;
		const ciphertext = vault.get(encPath);
		if (!ciphertext) continue;

		const iv = fromBase64(entry.iv);
		const plaintext = await decrypt(key, iv, ciphertext);

		const plainPath = encPath.replace(/\.enc$/, "");
		vault.set(plainPath, plaintext);
		vault.delete(encPath);
		count++;
	}

	meta.state = "unlocked";
	meta.locked_at = null;
	return count;
}

describe("lock/unlock single file", () => {
	it("encrypts and restores a single file", async () => {
		const vault: MemVault = new Map();
		const original = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 1, 2, 3]);
		vault.set("scope/file-a.pdf", original.buffer);

		const meta = await lockScope(vault, "scope", ["scope/file-a.pdf"], "pass1234");

		// Plaintext gone, .enc exists
		expect(vault.has("scope/file-a.pdf")).toBe(false);
		expect(vault.has("scope/file-a.pdf.enc")).toBe(true);
		expect(meta.state).toBe("locked");
		expect(Object.keys(meta.files)).toEqual(["file-a.pdf.enc"]);

		// Ciphertext is not the same as plaintext
		const ct = new Uint8Array(vault.get("scope/file-a.pdf.enc")!);
		expect(ct).not.toEqual(original);

		// Unlock
		const count = await unlockScope(vault, "scope", meta, "pass1234");

		expect(count).toBe(1);
		expect(vault.has("scope/file-a.pdf")).toBe(true);
		expect(vault.has("scope/file-a.pdf.enc")).toBe(false);
		expect(new Uint8Array(vault.get("scope/file-a.pdf")!)).toEqual(original);
	});
});

describe("lock/unlock folder with subfolders", () => {
	// Synthetic test fixtures — arbitrary bytes, no real file content
	const files: Array<{ path: string; data: Uint8Array }> = [
		{ path: "scope/file-a.pdf", data: new Uint8Array([1, 2, 3, 4]) },
		{ path: "scope/subfolder-1/file-b.jpg", data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 10, 20]) },
		{ path: "scope/subfolder-1/file-c.png", data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
		{ path: "scope/subfolder-2/file-d.xlsx", data: new Uint8Array(256).fill(0x42) },
	];

	it("encrypts all files across subfolders", async () => {
		const vault: MemVault = new Map();
		for (const f of files) vault.set(f.path, f.data.buffer);

		const meta = await lockScope(
			vault,
			"scope",
			files.map((f) => f.path),
			"folder-pass",
		);

		// All plaintext files gone
		for (const f of files) {
			expect(vault.has(f.path)).toBe(false);
			expect(vault.has(f.path + ".enc")).toBe(true);
		}

		// Manifest has correct subfolder info
		expect(meta.files["file-a.pdf.enc"].subfolder).toBe("");
		expect(meta.files["subfolder-1/file-b.jpg.enc"].subfolder).toBe("subfolder-1");
		expect(meta.files["subfolder-1/file-c.png.enc"].subfolder).toBe("subfolder-1");
		expect(meta.files["subfolder-2/file-d.xlsx.enc"].subfolder).toBe("subfolder-2");

		expect(Object.keys(meta.files)).toHaveLength(4);
	});

	it("restores all files with correct content", async () => {
		const vault: MemVault = new Map();
		for (const f of files) vault.set(f.path, f.data.buffer);

		const meta = await lockScope(
			vault,
			"scope",
			files.map((f) => f.path),
			"folder-pass",
		);

		const count = await unlockScope(vault, "scope", meta, "folder-pass");

		expect(count).toBe(4);
		for (const f of files) {
			expect(vault.has(f.path)).toBe(true);
			expect(vault.has(f.path + ".enc")).toBe(false);
			expect(new Uint8Array(vault.get(f.path)!)).toEqual(f.data);
		}
	});

	it("rejects wrong passphrase without modifying any files", async () => {
		const vault: MemVault = new Map();
		for (const f of files) vault.set(f.path, f.data.buffer);

		const meta = await lockScope(
			vault,
			"scope",
			files.map((f) => f.path),
			"right-pass",
		);

		// Snapshot vault state before failed unlock
		const encPaths = [...vault.keys()];

		await expect(
			unlockScope(vault, "scope", meta, "wrong-pass"),
		).rejects.toThrow();

		// Vault unchanged — all .enc files still there, no plaintext restored
		expect([...vault.keys()].sort()).toEqual(encPaths.sort());
	});
});

describe("re-lock round-trip (#1 salt reuse)", () => {
	it("lock → unlock → re-lock → unlock with same passphrase", async () => {
		const vault: MemVault = new Map();
		const original = new Uint8Array([0xca, 0xfe, 0xba, 0xbe, 1, 2, 3, 4]);
		vault.set("scope/report.pdf", original.buffer);

		const passphrase = "round-trip-pass";

		// First lock
		const meta1 = await lockScope(vault, "scope", ["scope/report.pdf"], passphrase);
		expect(meta1.state).toBe("locked");
		expect(vault.has("scope/report.pdf")).toBe(false);

		// First unlock
		const count1 = await unlockScope(vault, "scope", meta1, passphrase);
		expect(count1).toBe(1);
		expect(new Uint8Array(vault.get("scope/report.pdf")!)).toEqual(original);

		// Re-lock with existing meta (reuses salt)
		const meta2 = await lockScope(
			vault, "scope", ["scope/report.pdf"], passphrase, meta1
		);
		expect(meta2.state).toBe("locked");
		expect(meta2.salt).toBe(meta1.salt); // Same salt reused
		expect(vault.has("scope/report.pdf")).toBe(false);

		// Second unlock — must succeed with same passphrase
		const count2 = await unlockScope(vault, "scope", meta2, passphrase);
		expect(count2).toBe(1);
		expect(new Uint8Array(vault.get("scope/report.pdf")!)).toEqual(original);
	});

	it("re-lock clears stale file entries", async () => {
		const vault: MemVault = new Map();
		vault.set("scope/a.pdf", new Uint8Array([1, 2]).buffer);
		vault.set("scope/b.pdf", new Uint8Array([3, 4]).buffer);

		const passphrase = "stale-test";

		// Lock both files
		const meta = await lockScope(
			vault, "scope", ["scope/a.pdf", "scope/b.pdf"], passphrase
		);
		expect(Object.keys(meta.files)).toHaveLength(2);

		// Unlock
		await unlockScope(vault, "scope", meta, passphrase);

		// Delete b.pdf from vault, re-lock only a.pdf
		vault.delete("scope/b.pdf");
		const meta2 = await lockScope(
			vault, "scope", ["scope/a.pdf"], passphrase, meta
		);

		// Stale entry for b.pdf.enc should be gone
		expect(Object.keys(meta2.files)).toHaveLength(1);
		expect(meta2.files["a.pdf.enc"]).toBeDefined();
		expect(meta2.files["b.pdf.enc"]).toBeUndefined();
	});
});

describe("locking intermediate state (#6)", () => {
	it("lockScope sets state to locked after completion", async () => {
		const vault: MemVault = new Map();
		vault.set("scope/doc.pdf", new Uint8Array([10, 20]).buffer);

		const meta = await lockScope(vault, "scope", ["scope/doc.pdf"], "pass");
		expect(meta.state).toBe("locked");
	});
});
