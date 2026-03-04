import { describe, it, expect } from "vitest";
import {
	generateSalt,
	generateIV,
	deriveKey,
	encrypt,
	decrypt,
	toBase64,
	fromBase64,
} from "./crypto";

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
