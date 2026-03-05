import { Menu, Plugin, TAbstractFile, TFile, TFolder } from "obsidian";
import { CryptSettingTab, DEFAULT_SETTINGS, type CryptSettings } from "./settings";
import { LockModal } from "./modals/LockModal";
import { UnlockModal } from "./modals/UnlockModal";
import { AddDocModal } from "./modals/AddDocModal";
import { StatusModal } from "./modals/StatusModal";
import { readMeta, META_FILENAME } from "./meta";

export default class CryptPlugin extends Plugin {
	settings: CryptSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerExtensions(["enc"], "enc");

		this.addCommand({
			id: "lock-folder",
			name: "Lock Folder",
			callback: () => new LockModal(this.app, this).open(),
		});

		this.addCommand({
			id: "unlock-folder",
			name: "Unlock Folder",
			callback: () => new UnlockModal(this.app, this).open(),
		});

		this.addCommand({
			id: "add-file",
			name: "Add File",
			callback: () => new AddDocModal(this.app, this).open(),
		});

		this.addCommand({
			id: "status",
			name: "Status",
			callback: () => new StatusModal(this.app, this).open(),
		});

		this.addRibbonIcon("lock", "Crypt Status", () => {
			new StatusModal(this.app, this).open();
		});

		this.addSettingTab(new CryptSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
				const scope = this.resolveScope(file);
				if (!scope) return;

				menu.addItem((item) => {
					item.setTitle("Crypt: Lock / Unlock")
						.setIcon("lock")
						.onClick(async () => {
							const meta = await readMeta(this.app.vault, scope);
							const isLocked = meta?.state === "locked" || meta?.state === "locking";
							if (isLocked) {
								new UnlockModal(this.app, this, scope).open();
							} else {
								new LockModal(this.app, this, scope).open();
							}
						});
				});
			})
		);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Get top-level folders matching the scope pattern. */
	getScopes(): string[] {
		let re: RegExp;
		try {
			re = new RegExp(this.settings.scopePattern);
		} catch {
			return [];
		}

		const root = this.app.vault.getRoot();
		const scopes: string[] = [];
		for (const child of root.children) {
			if (child instanceof TFolder && re.test(child.name)) {
				scopes.push(child.name);
			}
		}
		return scopes.sort();
	}

	/** Get scopes that have a locked .vault-meta.json. */
	async getLockedScopes(): Promise<string[]> {
		const locked: string[] = [];
		for (const scope of this.getScopes()) {
			const meta = await readMeta(this.app.vault, scope);
			if (meta?.state === "locked" || meta?.state === "locking") {
				locked.push(scope);
			}
		}
		return locked;
	}

	/** Resolve a file or folder to its parent scope, or null if not in a scope. */
	resolveScope(file: TAbstractFile): string | null {
		const scopes = new Set(this.getScopes());
		// Walk up the path to find a scope folder
		const parts = file.path.split("/");
		if (parts.length > 0 && scopes.has(parts[0])) {
			return parts[0];
		}
		return null;
	}

	/** Find all target files (by extension) under a scope folder, excluding .enc and meta files. */
	getTargetFiles(scopePath: string): TFile[] {
		const folder = this.app.vault.getAbstractFileByPath(scopePath);
		if (!(folder instanceof TFolder)) return [];

		const exts = new Set(
			this.settings.targetExtensions.map((e) => e.toLowerCase())
		);
		const files: TFile[] = [];

		const walk = (f: TFolder) => {
			for (const child of f.children) {
				if (child instanceof TFile) {
					if (
						child.name === META_FILENAME ||
						child.extension === "enc" ||
						child.extension === "md"
					) {
						continue;
					}
					if (exts.has(child.extension.toLowerCase())) {
						files.push(child);
					}
				} else if (child instanceof TFolder) {
					walk(child);
				}
			}
		};
		walk(folder);
		return files;
	}
}
