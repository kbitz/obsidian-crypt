/**
 * In-memory map of scope path → lock state. Single source of truth for both
 * the dynamic context-menu label and the file-explorer padlock icons.
 *
 * Refreshed by reading every scope's .vault-meta.json. Stays in sync via the
 * vault create/modify/delete events the plugin registers in main.ts.
 */

import type { Vault } from "obsidian";
import { readMeta } from "./meta";

export type LockState = "locked" | "unlocked" | "locking" | "unknown";

export class LockStateCache {
	private states = new Map<string, LockState>();
	private listeners: Array<() => void> = [];

	constructor(
		private vault: Vault,
		private getScopes: () => string[]
	) {}

	async refresh(): Promise<void> {
		const scopes = this.getScopes();
		const next = new Map<string, LockState>();
		for (const scope of scopes) {
			const meta = await readMeta(this.vault, scope);
			next.set(scope, meta?.state ?? "unknown");
		}
		this.states = next;
		this.emit();
	}

	get(scopePath: string): LockState {
		return this.states.get(scopePath) ?? "unknown";
	}

	/** Treats "locking" as locked — matches existing behavior in main.ts and UnlockModal. */
	isLocked(scopePath: string): boolean {
		const s = this.get(scopePath);
		return s === "locked" || s === "locking";
	}

	scopes(): string[] {
		return Array.from(this.states.keys());
	}

	onChange(fn: () => void): () => void {
		this.listeners.push(fn);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== fn);
		};
	}

	private emit(): void {
		for (const l of this.listeners) l();
	}
}

/** Pure function — derives the context-menu title from a scope path and lock state. */
export function resolveMenuTitle(scopePath: string, isLocked: boolean): string {
	const name = scopePath.split("/").pop() || scopePath;
	return isLocked ? `Crypt: Unlock ${name}` : `Crypt: Lock ${name}`;
}
