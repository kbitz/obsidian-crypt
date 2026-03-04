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

const ITERATIONS = 1000; // low for test speed

describe("generateSalt", () => {
	it("returns 16 bytes", () => {
		expect(generateSalt().byteLength).toBe(16);
	});

	it("returns unique values", () => {
		const a = generateSalt();
		const b = generateSalt();
		expect(toBase64(a)).not.toBe(toBase64(b));
	});
});

describe("generateIV", () => {
	it("returns 12 bytes", () => {
		expect(generateIV().byteLength).toBe(12);
	});
});

describe("toBase64 / fromBase64", () => {
	it("round-trips arbitrary bytes", () => {
		const original = new Uint8Array([0, 1, 127, 128, 255]);
		const result = fromBase64(toBase64(original));
		expect(result).toEqual(original);
	});

	it("round-trips empty array", () => {
		const original = new Uint8Array(0);
		expect(fromBase64(toBase64(original))).toEqual(original);
	});
});

describe("deriveKey", () => {
	it("derives a key without throwing", async () => {
		const salt = generateSalt();
		const key = await deriveKey("test-passphrase", salt, ITERATIONS);
		expect(key).toBeDefined();
		expect(key.type).toBe("secret");
	});
});

describe("encrypt / decrypt round-trip", () => {
	it("recovers plaintext", async () => {
		const salt = generateSalt();
		const iv = generateIV();
		const key = await deriveKey("my-passphrase", salt, ITERATIONS);

		const plaintext = new TextEncoder().encode("hello world").buffer;
		const ciphertext = await encrypt(key, iv, plaintext);
		const recovered = await decrypt(key, iv, ciphertext);

		expect(new Uint8Array(recovered)).toEqual(
			new Uint8Array(plaintext)
		);
	});

	it("works with empty plaintext", async () => {
		const salt = generateSalt();
		const iv = generateIV();
		const key = await deriveKey("pass", salt, ITERATIONS);

		const plaintext = new ArrayBuffer(0);
		const ciphertext = await encrypt(key, iv, plaintext);
		const recovered = await decrypt(key, iv, ciphertext);

		expect(new Uint8Array(recovered).byteLength).toBe(0);
	});

	it("works with large binary data", async () => {
		const salt = generateSalt();
		const iv = generateIV();
		const key = await deriveKey("pass", salt, ITERATIONS);

		const plaintext = new Uint8Array(1024 * 100); // 100KB
		for (let i = 0; i < plaintext.length; i++) plaintext[i] = i % 256;
		const ciphertext = await encrypt(key, iv, plaintext.buffer);
		const recovered = await decrypt(key, iv, ciphertext);

		expect(new Uint8Array(recovered)).toEqual(plaintext);
	});

	it("ciphertext differs from plaintext", async () => {
		const salt = generateSalt();
		const iv = generateIV();
		const key = await deriveKey("pass", salt, ITERATIONS);

		const plaintext = new TextEncoder().encode("secret data").buffer;
		const ciphertext = await encrypt(key, iv, plaintext);

		expect(new Uint8Array(ciphertext)).not.toEqual(
			new Uint8Array(plaintext)
		);
	});

	it("fails with wrong passphrase", async () => {
		const salt = generateSalt();
		const iv = generateIV();
		const rightKey = await deriveKey("right", salt, ITERATIONS);
		const wrongKey = await deriveKey("wrong", salt, ITERATIONS);

		const ciphertext = await encrypt(
			rightKey,
			iv,
			new TextEncoder().encode("secret").buffer
		);

		await expect(decrypt(wrongKey, iv, ciphertext)).rejects.toThrow();
	});

	it("fails with wrong IV", async () => {
		const salt = generateSalt();
		const key = await deriveKey("pass", salt, ITERATIONS);

		const iv1 = generateIV();
		const iv2 = generateIV();

		const ciphertext = await encrypt(
			key,
			iv1,
			new TextEncoder().encode("secret").buffer
		);

		await expect(decrypt(key, iv2, ciphertext)).rejects.toThrow();
	});

	it("different IVs produce different ciphertext", async () => {
		const salt = generateSalt();
		const key = await deriveKey("pass", salt, ITERATIONS);
		const plaintext = new TextEncoder().encode("same data").buffer;

		const iv1 = generateIV();
		const iv2 = generateIV();

		const ct1 = await encrypt(key, iv1, plaintext);
		const ct2 = await encrypt(key, iv2, plaintext);

		expect(new Uint8Array(ct1)).not.toEqual(new Uint8Array(ct2));
	});
});

describe("file lock/unlock simulation", () => {
	it("encrypts a file, stores salt+IV as base64, then decrypts from stored values", async () => {
		const passphrase = "correct horse battery staple";

		// --- LOCK phase: encrypt a "file" and store metadata ---
		const salt = generateSalt();
		const iv = generateIV();
		const key = await deriveKey(passphrase, salt, ITERATIONS);

		// Simulate a binary file (PDF-like header + random content)
		const fileContent = new Uint8Array(2048);
		fileContent.set([0x25, 0x50, 0x44, 0x46]); // %PDF
		for (let i = 4; i < fileContent.length; i++) fileContent[i] = i % 256;

		const ciphertext = await encrypt(key, iv, fileContent.buffer);

		// Store salt and IV as base64 (as .vault-meta.json would)
		const storedSalt = toBase64(salt);
		const storedIV = toBase64(iv);

		// --- UNLOCK phase: re-derive key from stored metadata ---
		const restoredSalt = fromBase64(storedSalt);
		const restoredIV = fromBase64(storedIV);
		const restoredKey = await deriveKey(passphrase, restoredSalt, ITERATIONS);

		const recovered = await decrypt(restoredKey, restoredIV, ciphertext);

		expect(new Uint8Array(recovered)).toEqual(fileContent);
	});

	it("multiple files with independent IVs and shared key", async () => {
		const passphrase = "vault-password";
		const salt = generateSalt();
		const key = await deriveKey(passphrase, salt, ITERATIONS);

		const files = [
			{ name: "report.pdf", data: new Uint8Array([1, 2, 3, 4, 5]) },
			{ name: "photo.jpg", data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) },
			{ name: "sheet.xlsx", data: new Uint8Array(512).fill(0x42) },
		];

		// Lock: encrypt each file with its own IV, store metadata
		const manifest: Array<{ name: string; iv: string; ciphertext: ArrayBuffer }> = [];
		for (const file of files) {
			const iv = generateIV();
			const ct = await encrypt(key, iv, file.data.buffer);
			manifest.push({ name: file.name, iv: toBase64(iv), ciphertext: ct });
		}

		// Unlock: re-derive key, decrypt each file using stored IV
		const unlockKey = await deriveKey(passphrase, salt, ITERATIONS);
		for (let i = 0; i < files.length; i++) {
			const iv = fromBase64(manifest[i].iv);
			const recovered = await decrypt(unlockKey, iv, manifest[i].ciphertext);
			expect(new Uint8Array(recovered)).toEqual(files[i].data);
		}
	});

	it("rejects unlock with wrong passphrase on first file", async () => {
		const salt = generateSalt();
		const iv = generateIV();
		const lockKey = await deriveKey("right-pass", salt, ITERATIONS);

		const fileData = new Uint8Array([10, 20, 30]);
		const ciphertext = await encrypt(lockKey, iv, fileData.buffer);

		// Try to unlock with wrong passphrase
		const wrongKey = await deriveKey("wrong-pass", salt, ITERATIONS);
		await expect(decrypt(wrongKey, iv, ciphertext)).rejects.toThrow();
	});
});
