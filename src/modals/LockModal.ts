import { App, Modal, Notice, Setting, TFile, TFolder } from "obsidian";
import type CryptPlugin from "../main";
import {
	deriveKey,
	encrypt,
	generateIV,
	generateSalt,
	toBase64,
} from "../crypto";
import {
	createEmptyMeta,
	readMeta,
	writeMeta,
	type FileEntry,
} from "../meta";

export class LockModal extends Modal {
	plugin: CryptPlugin;
	selectedScope: string | null = null;
	passphrase = "";
	confirm = "";

	constructor(app: App, plugin: CryptPlugin) {
		super(app);
		this.plugin = plugin;
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

		new Setting(contentEl).setName("Confirm passphrase").addText((text) => {
			text.inputEl.type = "password";
			text.inputEl.autocomplete = "off";
			text.setPlaceholder("Confirm passphrase");
			text.onChange((v) => {
				this.confirm = v;
			});
		});

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Lock")
				.setCta()
				.onClick(() => this.doLock())
		);
	}

	async doLock(): Promise<void> {
		if (!this.selectedScope) {
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

		const existing = await readMeta(this.app.vault, this.selectedScope);
		if (existing && existing.state === "locked") {
			new Notice(`${this.selectedScope} is already locked.`);
			return;
		}

		this.close();
		new Notice(`Locking ${this.selectedScope}...`);

		try {
			const salt = generateSalt();
			const key = await deriveKey(
				this.passphrase,
				salt,
				this.plugin.settings.pbkdf2Iterations
			);

			const meta = existing ?? createEmptyMeta(
				toBase64(salt),
				this.plugin.settings.pbkdf2Iterations
			);
			if (!existing) {
				meta.salt = toBase64(salt);
			}

			const files = this.plugin.getTargetFiles(this.selectedScope);
			let count = 0;

			for (const file of files) {
				const iv = generateIV();
				const plaintext = await this.app.vault.readBinary(file);
				const ciphertext = await encrypt(key, iv, plaintext);

				const encPath = file.path + ".enc";
				await this.app.vault.createBinary(encPath, ciphertext);
				await this.app.vault.delete(file);

				const relative = file.path.slice(this.selectedScope!.length + 1);
				const subfolder = relative.includes("/")
					? relative.substring(0, relative.lastIndexOf("/"))
					: "";

				const entry: FileEntry = {
					original_name: file.name,
					iv: toBase64(iv),
					added: new Date().toISOString().slice(0, 10),
					subfolder,
					size_bytes: plaintext.byteLength,
				};
				meta.files[relative + ".enc"] = entry;

				await writeMeta(this.app.vault, this.selectedScope!, meta);
				count++;
			}

			meta.state = "locked";
			meta.locked_at = new Date().toISOString();
			await writeMeta(this.app.vault, this.selectedScope!, meta);

			new Notice(
				`${this.selectedScope} locked — ${count} document${count !== 1 ? "s" : ""} encrypted.`
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
