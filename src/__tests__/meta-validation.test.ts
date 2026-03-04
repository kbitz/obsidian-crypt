import { describe, it, expect } from "vitest";
import { readMeta, CURRENT_VERSION, META_FILENAME } from "../meta";
import { makeMockVault } from "./helpers";

describe("meta validation (#14)", () => {
	it("returns null for object missing 'version'", async () => {
		const vault = makeMockVault({
			[`2024/${META_FILENAME}`]: JSON.stringify({
				state: "locked",
				salt: "abc",
				files: {},
			}),
		});
		expect(await readMeta(vault as any, "2024")).toBeNull();
	});

	it("returns null for object missing 'state'", async () => {
		const vault = makeMockVault({
			[`2024/${META_FILENAME}`]: JSON.stringify({
				version: 1,
				salt: "abc",
				files: {},
			}),
		});
		expect(await readMeta(vault as any, "2024")).toBeNull();
	});

	it("returns null for object missing 'salt'", async () => {
		const vault = makeMockVault({
			[`2024/${META_FILENAME}`]: JSON.stringify({
				version: 1,
				state: "locked",
				files: {},
			}),
		});
		expect(await readMeta(vault as any, "2024")).toBeNull();
	});

	it("returns null for object missing 'files'", async () => {
		const vault = makeMockVault({
			[`2024/${META_FILENAME}`]: JSON.stringify({
				version: 1,
				state: "locked",
				salt: "abc",
			}),
		});
		expect(await readMeta(vault as any, "2024")).toBeNull();
	});

	it("returns null when version is not a number", async () => {
		const vault = makeMockVault({
			[`2024/${META_FILENAME}`]: JSON.stringify({
				version: "one",
				state: "locked",
				salt: "abc",
				files: {},
			}),
		});
		expect(await readMeta(vault as any, "2024")).toBeNull();
	});

	it("returns null when files is null", async () => {
		const vault = makeMockVault({
			[`2024/${META_FILENAME}`]: JSON.stringify({
				version: 1,
				state: "locked",
				salt: "abc",
				files: null,
			}),
		});
		expect(await readMeta(vault as any, "2024")).toBeNull();
	});

	it("returns null for a non-object (array)", async () => {
		const vault = makeMockVault({
			[`2024/${META_FILENAME}`]: JSON.stringify([1, 2, 3]),
		});
		expect(await readMeta(vault as any, "2024")).toBeNull();
	});

	it("accepts valid meta with 'locking' state (#6)", async () => {
		const meta = {
			version: CURRENT_VERSION,
			state: "locking",
			salt: "dGVzdA==",
			pbkdf2_iterations: 100000,
			locked_at: null,
			files: {},
		};
		const vault = makeMockVault({
			[`2024/${META_FILENAME}`]: JSON.stringify(meta),
		});
		const result = await readMeta(vault as any, "2024");
		expect(result).toEqual(meta);
	});
});
