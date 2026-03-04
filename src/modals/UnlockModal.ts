import { App, Modal, Notice, Setting } from "obsidian";
import type CryptPlugin from "../main";
import { decrypt, deriveKey, fromBase64 } from "../crypto";
import { readMeta, writeMeta } from "../meta";

export class UnlockModal extends Modal {
	plugin: CryptPlugin;
	selectedScope: string | null = null;
	passphrase = "";

	constructor(app: App, plugin: CryptPlugin) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Unlock Folder" });

		const scopes = await this.plugin.getLockedScopes();
		if (scopes.length === 0) {
			contentEl.createEl("p", { text: "No locked folders found." });
			return;
		}

		new Setting(contentEl).setName("Folder").addDropdown((dd) => {
			dd.addOption("", "Select a folder...");
			for (const s of scopes) {
				dd.addOption(s, s);
			}
			dd.onChange((v) => {
				this.selectedScope = v || null;
			});
		});

		new Setting(contentEl).setName("Passphrase").addText((text) => {
			text.inputEl.type = "password";
			text.inputEl.autocomplete = "off";
			text.setPlaceholder("Enter passphrase");
			text.onChange((v) => {
				this.passphrase = v;
			});
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
		if (!meta || meta.state !== "locked") {
			new Notice(`${this.selectedScope} is not locked.`);
			return;
		}

		this.close();
		new Notice(`Unlocking ${this.selectedScope}...`);

		try {
			const salt = fromBase64(meta.salt);
			const key = await deriveKey(
				this.passphrase,
				salt,
				meta.pbkdf2_iterations
			);

			// Verify passphrase on first file before proceeding
			const entries = Object.entries(meta.files);
			if (entries.length > 0) {
				const [relPath, entry] = entries[0];
				const encPath = `${this.selectedScope}/${relPath}`;
				const encFile = this.app.vault.getAbstractFileByPath(encPath);
				if (encFile) {
					const iv = fromBase64(entry.iv);
					const ciphertext = await this.app.vault.readBinary(encFile as any);
					await decrypt(key, iv, ciphertext); // throws on wrong passphrase
				}
			}

			let count = 0;
			for (const [relPath, entry] of entries) {
				const encPath = `${this.selectedScope}/${relPath}`;
				const encFile = this.app.vault.getAbstractFileByPath(encPath);
				if (!encFile) continue;

				const iv = fromBase64(entry.iv);
				const ciphertext = await this.app.vault.readBinary(encFile as any);
				const plaintext = await decrypt(key, iv, ciphertext);

				const plainPath = encPath.replace(/\.enc$/, "");
				await this.app.vault.createBinary(plainPath, plaintext);
				await this.app.vault.delete(encFile as any);
				count++;
			}

			meta.state = "unlocked";
			meta.locked_at = null;
			await writeMeta(this.app.vault, this.selectedScope!, meta);

			new Notice(
				`${this.selectedScope} unlocked — ${count} document${count !== 1 ? "s" : ""} decrypted.`
			);
		} catch (e) {
			const msg = (e as Error).message || String(e);
			if (msg.includes("decrypt") || msg.includes("operation")) {
				new Notice("Wrong passphrase. No files were modified.");
			} else {
				console.error("Crypt: unlock failed", e);
				new Notice(`Unlock failed: ${msg}`);
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
		this.passphrase = "";
	}
}
