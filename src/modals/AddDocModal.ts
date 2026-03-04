import { App, Modal, Notice, Platform, Setting, TFolder } from "obsidian";
import type CryptPlugin from "../main";
import { deriveKey, encrypt, fromBase64, generateIV, toBase64 } from "../crypto";
import { readMeta, writeMeta, createEmptyMeta, type FileEntry } from "../meta";

export class AddDocModal extends Modal {
	plugin: CryptPlugin;
	selectedScope: string | null = null;
	selectedSubfolder = "";
	selectedTag = "";

	constructor(app: App, plugin: CryptPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Add File" });

		if (Platform.isMobile) {
			contentEl.createEl("p", {
				text: "On mobile, use the iOS share sheet to add files to a docs/ folder, then lock the folder. The native file picker is not available on mobile.",
			});
			return;
		}

		const scopes = this.plugin.getScopes();
		if (scopes.length === 0) {
			contentEl.createEl("p", {
				text: "No folders match the scope pattern.",
			});
			return;
		}

		const subfolderSetting = new Setting(contentEl)
			.setName("Subfolder")
			.setDesc("Target subfolder within the scope folder");

		new Setting(contentEl).setName("Scope folder").addDropdown((dd) => {
			dd.addOption("", "Select a folder...");
			for (const s of scopes) {
				dd.addOption(s, s);
			}
			dd.onChange((v) => {
				this.selectedScope = v || null;
				// Refresh subfolder options
				if (this.selectedScope) {
					this.populateSubfolders(subfolderSetting);
				}
			});
		});

		subfolderSetting.addDropdown((dd) => {
			dd.addOption("", "(root)");
			dd.onChange((v) => {
				this.selectedSubfolder = v;
			});
		});

		if (this.plugin.settings.docTypeTags.length > 0) {
			new Setting(contentEl).setName("Document type").addDropdown((dd) => {
				dd.addOption("", "(none)");
				for (const tag of this.plugin.settings.docTypeTags) {
					dd.addOption(tag, tag);
				}
				dd.onChange((v) => {
					this.selectedTag = v;
				});
			});
		}

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Choose File...")
				.setCta()
				.onClick(() => this.pickFile())
		);
	}

	private populateSubfolders(setting: Setting): void {
		if (!this.selectedScope) return;
		const folder = this.app.vault.getAbstractFileByPath(this.selectedScope);
		if (!(folder instanceof TFolder)) return;

		const subfolders: string[] = [];
		const walk = (f: TFolder, prefix: string) => {
			for (const child of f.children) {
				if (child instanceof TFolder) {
					const rel = prefix ? `${prefix}/${child.name}` : child.name;
					subfolders.push(rel);
					walk(child, rel);
				}
			}
		};
		walk(folder, "");

		// Rebuild the dropdown
		setting.clear();
		setting.setName("Subfolder").setDesc("Target subfolder within the scope folder");
		setting.addDropdown((dd) => {
			dd.addOption("", "(root)");
			for (const sf of subfolders) {
				dd.addOption(sf, sf);
			}
			dd.onChange((v) => {
				this.selectedSubfolder = v;
			});
		});
	}

	private async pickFile(): Promise<void> {
		if (!this.selectedScope) {
			new Notice("Select a scope folder first.");
			return;
		}

		try {
			// Electron file dialog
			const electron = require("electron");
			const result = await electron.remote.dialog.showOpenDialog({
				properties: ["openFile"],
				filters: [
					{
						name: "Documents",
						extensions: this.plugin.settings.targetExtensions,
					},
				],
			});

			if (result.canceled || result.filePaths.length === 0) return;

			const filePath = result.filePaths[0];
			const fileName = filePath.split(/[/\\]/).pop()!;
			const fs = require("fs");
			const data: Buffer = fs.readFileSync(filePath);
			const arrayBuffer = data.buffer.slice(
				data.byteOffset,
				data.byteOffset + data.byteLength
			);

			await this.importFile(fileName, arrayBuffer);
		} catch {
			// Fallback: use input element if Electron dialog unavailable
			const input = document.createElement("input");
			input.type = "file";
			input.accept = this.plugin.settings.targetExtensions
				.map((e) => `.${e}`)
				.join(",");
			input.onchange = async () => {
				const file = input.files?.[0];
				if (!file) return;
				const buf = await file.arrayBuffer();
				await this.importFile(file.name, buf);
			};
			input.click();
		}
	}

	private async importFile(
		fileName: string,
		data: ArrayBuffer
	): Promise<void> {
		const scope = this.selectedScope!;
		const subfolder = this.selectedSubfolder;
		const destDir = subfolder ? `${scope}/${subfolder}` : scope;
		const destPath = `${destDir}/${fileName}`;

		const meta = await readMeta(this.app.vault, scope);
		const isLocked = meta?.state === "locked";

		if (isLocked && meta) {
			// Encrypt immediately
			new Notice("Encrypting and adding file...");
			// We need a passphrase — prompt inline
			const passphrase = await this.promptPassphrase();
			if (!passphrase) return;

			const salt = fromBase64(meta.salt);
			const key = await deriveKey(passphrase, salt, meta.pbkdf2_iterations);

			// Verify key against an existing file first
			const existing = Object.entries(meta.files);
			if (existing.length > 0) {
				try {
					const [relPath, entry] = existing[0];
					const encPath = `${scope}/${relPath}`;
					const encFile = this.app.vault.getAbstractFileByPath(encPath);
					if (encFile) {
						const { decrypt } = await import("../crypto");
						const iv = fromBase64(entry.iv);
						const ct = await this.app.vault.readBinary(encFile as any);
						await decrypt(key, iv, ct);
					}
				} catch {
					new Notice("Wrong passphrase.");
					return;
				}
			}

			const iv = generateIV();
			const ciphertext = await encrypt(key, iv, data);
			await this.app.vault.createBinary(destPath + ".enc", ciphertext);

			const relative = (destPath + ".enc").slice(scope.length + 1);
			const entry: FileEntry = {
				original_name: fileName,
				iv: toBase64(iv),
				added: new Date().toISOString().slice(0, 10),
				tag: this.selectedTag || undefined,
				subfolder,
				size_bytes: data.byteLength,
			};
			meta.files[relative] = entry;
			await writeMeta(this.app.vault, scope, meta);
		} else {
			// Unlocked — copy as plaintext
			await this.app.vault.createBinary(destPath, data);

			if (meta) {
				const relative = destPath.slice(scope.length + 1);
				const entry: FileEntry = {
					original_name: fileName,
					iv: "",
					added: new Date().toISOString().slice(0, 10),
					tag: this.selectedTag || undefined,
					subfolder,
					size_bytes: data.byteLength,
				};
				meta.files[relative] = entry;
				await writeMeta(this.app.vault, scope, meta);
			}
		}

		this.close();
		new Notice(`Added ${fileName} to ${destDir}.`);
	}

	private promptPassphrase(): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new PassphrasePrompt(this.app, resolve);
			modal.open();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class PassphrasePrompt extends Modal {
	private resolve: (value: string | null) => void;
	private passphrase = "";

	constructor(app: App, resolve: (value: string | null) => void) {
		super(app);
		this.resolve = resolve;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Enter passphrase to encrypt" });

		new Setting(contentEl).setName("Passphrase").addText((text) => {
			text.inputEl.type = "password";
			text.inputEl.autocomplete = "off";
			text.onChange((v) => {
				this.passphrase = v;
			});
		});

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("OK")
				.setCta()
				.onClick(() => {
					this.close();
					this.resolve(this.passphrase || null);
				})
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
