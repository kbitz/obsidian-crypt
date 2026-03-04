/**
 * PBKDF2 key derivation + AES-256-GCM encrypt/decrypt.
 * Uses Web Crypto API only — zero npm runtime deps.
 */

const SALT_BYTES = 16;
const IV_BYTES = 12;

export function generateSalt(): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

export function generateIV(): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(IV_BYTES));
}

export async function deriveKey(
	passphrase: string,
	salt: Uint8Array,
	iterations: number
): Promise<CryptoKey> {
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(passphrase),
		"PBKDF2",
		false,
		["deriveKey"]
	);

	return crypto.subtle.deriveKey(
		{ name: "PBKDF2", salt, iterations, hash: "SHA-256" },
		keyMaterial,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"]
	);
}

export async function encrypt(
	key: CryptoKey,
	iv: Uint8Array,
	plaintext: ArrayBuffer
): Promise<ArrayBuffer> {
	return crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
}

export async function decrypt(
	key: CryptoKey,
	iv: Uint8Array,
	ciphertext: ArrayBuffer
): Promise<ArrayBuffer> {
	return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
}

export function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}
