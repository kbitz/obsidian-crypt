import { App, Modal, Notice, Setting } from "obsidian";
import type CryptPlugin from "../main";
import {
	deriveKey,
	encrypt,
	fromBase64,
	generateIV,
	generateSalt,
	toBase64,
} from "../crypto";
import {
	createEmptyMeta,
	createFileEntry,
	readMeta,
	vaultWriteBinary,
	writeMeta,
} from "../meta";
import { addScopeDropdown, addPassphraseField, pluralize, todayISO } from "./shared";
import { getPassphrase, savePassphrase } from "../keychain";

export class LockModal extends Modal {
	plugin: CryptPlugin;
	selectedScope: string | null = null;
	passphrase = "";
	confirm = "";

	constructor(app: App, plugin: CryptPlugin, initialScope?: string) {
		super(app);
		this.plugin = plugin;
		if (initialScope) this.selectedScope = initialScope;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Lock Folder" });

		const scopes = this.plugin.getScopes();
		if (scopes.length === 0) {
			contentEl.createEl("p", {
				text: "No folders match the scope pattern.",
			});
			return;
		}

		addScopeDropdown(contentEl, scopes, (v) => {
			this.selectedScope = v;
		}, this.selectedScope);

		let passphraseInput: HTMLInputElement | null = null;
		let confirmInput: HTMLInputElement | null = null;

		addPassphraseField(contentEl, (v) => {
			this.passphrase = v;
		}, (el) => { passphraseInput = el; });

		new Setting(contentEl).setName("Confirm passphrase").addText((text) => {
			text.inputEl.type = "password";
			text.inputEl.autocomplete = "off";
			text.setPlaceholder("Confirm passphrase");
			text.onChange((v) => {
				this.confirm = v;
			});
			confirmInput = text.inputEl;
		});

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Lock")
				.setCta()
				.onClick(() => this.doLock())
		);

		// Auto-fill from keychain in universal mode
		if (this.plugin.settings.useKeychain && this.plugin.settings.useUniversalPassphrase) {
			const account = this.plugin.keychainAccount("");
			getPassphrase(account).then((saved) => {
				if (saved) {
					this.passphrase = saved;
					this.confirm = saved;
					if (passphraseInput) passphraseInput.value = saved;
					if (confirmInput) confirmInput.value = saved;
				}
			});
		}
	}

	async doLock(): Promise<void> {
		const scope = this.selectedScope;
		if (!scope) {
			new Notice("Select a folder first.");
			return;
		}
		if (!this.passphrase || this.passphrase.length < 4) {
			new Notice("Passphrase must be at least 4 characters.");
			return;
		}
		if (this.passphrase !== this.confirm) {
			new Notice("Passphrases do not match.");
			return;
		}

		const existing = await readMeta(this.app.vault, scope);
		if (existing && existing.state === "locked") {
			new Notice(`${scope} is already locked.`);
			return;
		}

		const passphrase = this.passphrase;
		this.close();
		new Notice(`Locking ${scope}...`);

		try {
			// Reuse existing salt on re-lock; only generate fresh salt for new scopes
			const salt = existing ? fromBase64(existing.salt) : generateSalt();
			const key = await deriveKey(
				passphrase,
				salt,
				this.plugin.settings.pbkdf2Iterations
			);

			const meta = existing ?? createEmptyMeta(
				toBase64(salt),
				this.plugin.settings.pbkdf2Iterations
			);

			// Save existing entries for crash recovery, then clear for re-population
			const previousFiles = { ...meta.files };
			meta.files = {};

			// Set intermediate state for crash recovery
			meta.state = "locking";
			await writeMeta(this.app.vault, scope, meta);
			this.plugin.lockCache.refresh();

			const files = this.plugin.getTargetFiles(scope);
			let count = 0;
			const today = todayISO();

			for (const file of files) {
				const encPath = file.path + ".enc";
				const relativeEnc = encPath.slice(scope.length + 1);

				// Skip files whose .enc already exists (partial prior lock)
				if (this.app.vault.getAbstractFileByPath(encPath) && previousFiles[relativeEnc]) {
					meta.files[relativeEnc] = previousFiles[relativeEnc];
					await this.app.vault.delete(file);
					await writeMeta(this.app.vault, scope, meta);
					count++;
					continue;
				}

				const iv = generateIV();
				const plaintext = await this.app.vault.readBinary(file);
				const ciphertext = await encrypt(key, iv, plaintext);

				await vaultWriteBinary(this.app.vault, encPath, ciphertext);
				await this.app.vault.delete(file);

				const relative = file.path.slice(scope.length + 1);
				const subfolder = relative.includes("/")
					? relative.substring(0, relative.lastIndexOf("/"))
					: "";

				meta.files[relative + ".enc"] = createFileEntry(
					file.name, toBase64(iv), today, subfolder, plaintext.byteLength
				);

				await writeMeta(this.app.vault, scope, meta);
				count++;
			}

			meta.state = "locked";
			meta.locked_at = new Date().toISOString();
			await writeMeta(this.app.vault, scope, meta);

			if (this.plugin.settings.useKeychain) {
				try {
					await savePassphrase(this.plugin.keychainAccount(scope), passphrase);
				} catch (e) {
					console.error("Crypt: keychain save failed", e);
				}
			}

			new Notice(
				`${scope} locked — ${pluralize(count, "document")} encrypted.`
			);
		} catch (e) {
			console.error("Crypt: lock failed", e);
			new Notice(`Lock failed: ${(e as Error).message}`);
		}
	}

	onClose(): void {
		this.contentEl.empty();
		this.passphrase = "";
		this.confirm = "";
	}
}
