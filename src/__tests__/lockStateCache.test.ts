import { describe, it, expect } from "vitest";
import { LockStateCache, resolveMenuTitle } from "../lockStateCache";
import { META_FILENAME, type VaultMeta } from "../meta";
import { makeMockVault } from "./helpers";

function metaJson(state: VaultMeta["state"]): string {
	return JSON.stringify({
		version: 1,
		state,
		salt: "c2FsdA==",
		pbkdf2_iterations: 100000,
		locked_at: state === "locked" ? "2026-01-01T00:00:00Z" : null,
		files: {},
	});
}

describe("resolveMenuTitle", () => {
	it("uses the scope's leaf folder name", () => {
		expect(resolveMenuTitle("2024", true)).toBe("Crypt: Unlock 2024");
		expect(resolveMenuTitle("2024", false)).toBe("Crypt: Lock 2024");
	});

	it("strips parent path when scopeRoot is set", () => {
		expect(resolveMenuTitle("Archive/2024", true)).toBe("Crypt: Unlock 2024");
		expect(resolveMenuTitle("Archive/2024", false)).toBe("Crypt: Lock 2024");
	});

	it("falls back to the full path if no folder separator", () => {
		expect(resolveMenuTitle("", false)).toBe("Crypt: Lock ");
	});
});

describe("LockStateCache", () => {
	it("returns 'unknown' for scopes that have not been refreshed", () => {
		const vault = makeMockVault();
		const cache = new LockStateCache(vault as any, () => ["2024"]);
		expect(cache.get("2024")).toBe("unknown");
		expect(cache.isLocked("2024")).toBe(false);
	});

	it("populates state from meta files on refresh", async () => {
		const vault = makeMockVault({
			[`2024/${META_FILENAME}`]: metaJson("locked"),
			[`2025/${META_FILENAME}`]: metaJson("unlocked"),
		});
		const cache = new LockStateCache(vault as any, () => ["2024", "2025"]);

		await cache.refresh();

		expect(cache.get("2024")).toBe("locked");
		expect(cache.get("2025")).toBe("unlocked");
		expect(cache.isLocked("2024")).toBe(true);
		expect(cache.isLocked("2025")).toBe(false);
	});

	it("treats 'locking' as locked (matches existing behavior)", async () => {
		const vault = makeMockVault({
			[`2024/${META_FILENAME}`]: metaJson("locking"),
		});
		const cache = new LockStateCache(vault as any, () => ["2024"]);

		await cache.refresh();

		expect(cache.get("2024")).toBe("locking");
		expect(cache.isLocked("2024")).toBe(true);
	});

	it("marks scopes with no meta file as 'unknown'", async () => {
		const vault = makeMockVault();
		const cache = new LockStateCache(vault as any, () => ["2024"]);

		await cache.refresh();

		expect(cache.get("2024")).toBe("unknown");
		expect(cache.isLocked("2024")).toBe(false);
	});

	it("drops scopes that no longer match the pattern", async () => {
		const vault = makeMockVault({
			[`2024/${META_FILENAME}`]: metaJson("locked"),
			[`2025/${META_FILENAME}`]: metaJson("locked"),
		});
		let scopes = ["2024", "2025"];
		const cache = new LockStateCache(vault as any, () => scopes);

		await cache.refresh();
		expect(cache.scopes().sort()).toEqual(["2024", "2025"]);

		scopes = ["2025"];
		await cache.refresh();
		expect(cache.scopes()).toEqual(["2025"]);
		expect(cache.get("2024")).toBe("unknown");
	});

	it("notifies listeners on refresh", async () => {
		const vault = makeMockVault({
			[`2024/${META_FILENAME}`]: metaJson("locked"),
		});
		const cache = new LockStateCache(vault as any, () => ["2024"]);

		let calls = 0;
		const detach = cache.onChange(() => calls++);

		await cache.refresh();
		expect(calls).toBe(1);

		await cache.refresh();
		expect(calls).toBe(2);

		detach();
		await cache.refresh();
		expect(calls).toBe(2);
	});
});
