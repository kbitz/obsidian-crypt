import { Plugin, TFile, TFolder } from "obsidian";
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
