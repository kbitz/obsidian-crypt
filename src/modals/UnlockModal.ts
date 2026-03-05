import { App, Modal, Notice, Setting } from "obsidian";
import type CryptPlugin from "../main";
import { decrypt, deriveKey, fromBase64 } from "../crypto";
import { readMeta, vaultWriteBinary, writeMeta } from "../meta";
import { addScopeDropdown, pluralize } from "./shared";
import { getPassphrase, deletePassphrase } from "../keychain";

export class UnlockModal extends Modal {
	plugin: CryptPlugin;
	selectedScope: string | null = null;
	passphrase = "";

	private initialScope?: string;

	constructor(app: App, plugin: CryptPlugin, initialScope?: string) {
		super(app);
		this.plugin = plugin;
		this.initialScope = initialScope;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Unlock Folder" });

		this.loadScopes().then(null, (e) => {
			console.error("Crypt: failed to load scopes", e);
			contentEl.createEl("p", { text: "Failed to load locked folders." });
		});
	}

	private async loadScopes(): Promise<void> {
		const { contentEl } = this;

		const scopes = await this.plugin.getLockedScopes();
		if (scopes.length === 0) {
			contentEl.createEl("p", { text: "No locked folders found." });
			return;
		}

		let passphraseInput: HTMLInputElement | null = null;

		const onScopeChange = async (v: string | null) => {
			this.selectedScope = v;
			if (v && this.plugin.settings.useKeychain) {
				const saved = await getPassphrase(v);
				if (saved && passphraseInput) {
					this.passphrase = saved;
					passphraseInput.value = saved;
				}
			}
		};

		addScopeDropdown(contentEl, scopes, onScopeChange, this.initialScope);

		if (this.initialScope) {
			this.selectedScope = this.initialScope;
			// Trigger keychain lookup for pre-selected scope
			onScopeChange(this.initialScope);
		}

		new Setting(contentEl).setName("Passphrase").addText((text) => {
			text.inputEl.type = "password";
			text.inputEl.autocomplete = "off";
			text.setPlaceholder("Enter passphrase");
			text.onChange((v) => {
				this.passphrase = v;
			});
			passphraseInput = text.inputEl;
		});

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Unlock")
				.setCta()
				.onClick(() => this.doUnlock())
		);
	}

	async doUnlock(): Promise<void> {
		if (!this.selectedScope) {
			new Notice("Select a folder first.");
			return;
		}
		if (!this.passphrase) {
			new Notice("Enter the passphrase.");
			return;
		}

		const meta = await readMeta(this.app.vault, this.selectedScope);
		if (!meta || (meta.state !== "locked" && meta.state !== "locking")) {
			new Notice(`${this.selectedScope} is not locked.`);
			return;
		}

		// Capture before close() wipes them
		const scope = this.selectedScope;
		const passphrase = this.passphrase;
		this.close();
		new Notice(`Unlocking ${scope}...`);

		const salt = fromBase64(meta.salt);
		let key: CryptoKey;
		try {
			key = await deriveKey(
				passphrase,
				salt,
				meta.pbkdf2_iterations
			);
		} catch (e) {
			console.error("Crypt: key derivation failed", e);
			new Notice(`Unlock failed: ${(e as Error).message}`);
			return;
		}

		// Verify passphrase on first file before proceeding
		const entries = Object.entries(meta.files);
		let verifiedPlaintext: ArrayBuffer | null = null;
		if (entries.length > 0) {
			const [relPath, entry] = entries[0];
			const encPath = `${scope}/${relPath}`;
			const encFile = this.app.vault.getAbstractFileByPath(encPath);
			if (encFile) {
				try {
					const iv = fromBase64(entry.iv);
					const ciphertext = await this.app.vault.readBinary(encFile as any);
					verifiedPlaintext = await decrypt(key, iv, ciphertext);
				} catch {
					new Notice("Wrong passphrase. No files were modified.");
					return;
				}
			}
		}

		try {
			let count = 0;
			for (let i = 0; i < entries.length; i++) {
				const [relPath, entry] = entries[i];
				const encPath = `${scope}/${relPath}`;
				const encFile = this.app.vault.getAbstractFileByPath(encPath);
				if (!encFile) continue;

				let plaintext: ArrayBuffer;
				if (i === 0 && verifiedPlaintext) {
					// Reuse already-decrypted result from verification
					plaintext = verifiedPlaintext;
				} else {
					const iv = fromBase64(entry.iv);
					const ciphertext = await this.app.vault.readBinary(encFile as any);
					plaintext = await decrypt(key, iv, ciphertext);
				}

				const plainPath = encPath.replace(/\.enc$/, "");
				await vaultWriteBinary(this.app.vault, plainPath, plaintext);
				await this.app.vault.delete(encFile as any);
				count++;
			}

			meta.state = "unlocked";
			meta.locked_at = null;
			await writeMeta(this.app.vault, scope, meta);

			if (this.plugin.settings.useKeychain) {
				try {
					await deletePassphrase(scope);
				} catch (e) {
					console.error("Crypt: keychain delete failed", e);
				}
			}

			new Notice(
				`${scope} unlocked — ${pluralize(count, "document")} decrypted.`
			);
		} catch (e) {
			console.error("Crypt: unlock failed", e);
			new Notice(`Unlock failed: ${(e as Error).message}`);
		}
	}

	onClose(): void {
		this.contentEl.empty();
		this.passphrase = "";
	}
}
