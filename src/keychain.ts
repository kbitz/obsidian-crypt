/**
 * macOS Keychain integration via the `security` CLI.
 * Desktop-only — all functions no-op gracefully on non-mac platforms.
 */

import { Platform } from "obsidian";

const SERVICE = "obsidian-crypt";
export const UNIVERSAL_ACCOUNT = "__universal__";

function isMacDesktop(): boolean {
	return !Platform.isMobile && process.platform === "darwin";
}

function exec(args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const { execFile } = require("child_process");
		execFile("/usr/bin/security", args, (err: Error | null, stdout: string, stderr: string) => {
			if (err) reject(new Error(stderr || err.message));
			else resolve(stdout);
		});
	});
}

export async function getPassphrase(scope: string): Promise<string | null> {
	if (!isMacDesktop()) return null;
	try {
		const out = await exec([
			"find-generic-password",
			"-s", SERVICE,
			"-a", scope,
			"-w",
		]);
		return out.trimEnd();
	} catch {
		return null;
	}
}

export async function savePassphrase(scope: string, passphrase: string): Promise<void> {
	if (!isMacDesktop()) return;
	// Delete first to avoid "already exists" error on update
	try {
		await exec(["delete-generic-password", "-s", SERVICE, "-a", scope]);
	} catch {
		// fine if it didn't exist
	}
	await exec([
		"add-generic-password",
		"-s", SERVICE,
		"-a", scope,
		"-w", passphrase,
	]);
}

export async function deletePassphrase(scope: string): Promise<void> {
	if (!isMacDesktop()) return;
	try {
		await exec(["delete-generic-password", "-s", SERVICE, "-a", scope]);
	} catch {
		// fine if it didn't exist
	}
}
