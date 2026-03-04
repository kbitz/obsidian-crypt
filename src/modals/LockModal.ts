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
	writeMeta,
} from "../meta";
import { addScopeDropdown, addPassphraseField, pluralize, todayISO } from "./shared";

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

		addScopeDropdown(contentEl, scopes, (v) => {
			this.selectedScope = v;
		});

		addPassphraseField(contentEl, (v) => {
			this.passphrase = v;
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

		this.close();
		new Notice(`Locking ${scope}...`);

		try {
			// Reuse existing salt on re-lock; only generate fresh salt for new scopes
			const salt = existing ? fromBase64(existing.salt) : generateSalt();
			const key = await deriveKey(
				this.passphrase,
				salt,
				this.plugin.settings.pbkdf2Iterations
			);

			const meta = existing ?? createEmptyMeta(
				toBase64(salt),
				this.plugin.settings.pbkdf2Iterations
			);

			// Clear stale file entries before re-populating
			meta.files = {};

			// Set intermediate state for crash recovery
			meta.state = "locking";
			await writeMeta(this.app.vault, scope, meta);

			const files = this.plugin.getTargetFiles(scope);
			let count = 0;
			const today = todayISO();

			for (const file of files) {
				const iv = generateIV();
				const plaintext = await this.app.vault.readBinary(file);
				const ciphertext = await encrypt(key, iv, plaintext);

				const encPath = file.path + ".enc";
				await this.app.vault.adapter.writeBinary(encPath, new Uint8Array(ciphertext));
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
