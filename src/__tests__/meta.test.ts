import { describe, it, expect } from "vitest";
import {
	createEmptyMeta,
	readMeta,
	writeMeta,
	META_FILENAME,
	CURRENT_VERSION,
	VaultMeta,
} from "../meta";
import { makeMockVault } from "./helpers";

describe("createEmptyMeta", () => {
	it("returns correct structure", () => {
		const meta = createEmptyMeta("c2FsdA==", 100000);
		expect(meta).toEqual({
			version: CURRENT_VERSION,
			state: "unlocked",
			salt: "c2FsdA==",
			pbkdf2_iterations: 100000,
			locked_at: null,
			files: {},
		});
	});
});

describe("readMeta", () => {
	it("returns null when file does not exist", async () => {
		const vault = makeMockVault();
		const result = await readMeta(vault as any, "2024");
		expect(result).toBeNull();
		expect(vault.getAbstractFileByPath).toHaveBeenCalledWith(
			`2024/${META_FILENAME}`
		);
	});

	it("parses valid meta file", async () => {
		const meta: VaultMeta = {
			version: 1,
			state: "locked",
			salt: "dGVzdHNhbHQ=",
			pbkdf2_iterations: 100000,
			locked_at: "2026-01-01T00:00:00Z",
			files: {
				"doc.pdf.enc": {
					original_name: "doc.pdf",
					iv: "dGVzdGl2",
					added: "2026-01-01T00:00:00Z",
					subfolder: "",
					size_bytes: 1024,
				},
			},
		};

		const vault = makeMockVault({
			[`2024/${META_FILENAME}`]: JSON.stringify(meta),
		});

		const result = await readMeta(vault as any, "2024");
		expect(result).toEqual(meta);
	});

	it("returns null on invalid JSON", async () => {
		const vault = makeMockVault({
			[`2024/${META_FILENAME}`]: "not json{{{",
		});
		const result = await readMeta(vault as any, "2024");
		expect(result).toBeNull();
	});
});

describe("writeMeta", () => {
	it("creates file when it does not exist", async () => {
		const files: Record<string, string> = {};
		const vault = makeMockVault(files);
		const meta = createEmptyMeta("c2FsdA==", 100000);

		await writeMeta(vault as any, "2024", meta);

		expect(vault.adapter.write).toHaveBeenCalledWith(
			`2024/${META_FILENAME}`,
			JSON.stringify(meta, null, 2)
		);
	});

	it("modifies file when it already exists", async () => {
		const metaPath = `2024/${META_FILENAME}`;
		const files: Record<string, string> = { [metaPath]: "{}" };
		const vault = makeMockVault(files);
		const meta = createEmptyMeta("c2FsdA==", 100000);

		await writeMeta(vault as any, "2024", meta);

		expect(vault.modify).toHaveBeenCalled();
		expect(vault.create).not.toHaveBeenCalled();
	});

	it("writes pretty-printed JSON", async () => {
		const files: Record<string, string> = {};
		const vault = makeMockVault(files);
		const meta = createEmptyMeta("c2FsdA==", 100000);

		await writeMeta(vault as any, "2024", meta);

		const written = vault.adapter.write.mock.calls[0][1];
		expect(written).toBe(JSON.stringify(meta, null, 2));
		expect(written).toContain("\n"); // pretty-printed
	});
});
