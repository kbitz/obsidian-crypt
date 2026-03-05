import { App, Platform, PluginSettingTab, Setting } from "obsidian";
import type CryptPlugin from "./main";

export interface CryptSettings {
	scopePattern: string;
	targetExtensions: string[];
	pbkdf2Iterations: number;
	docTypeTags: string[];
	useKeychain: boolean;
}

export const DEFAULT_SETTINGS: CryptSettings = {
	scopePattern: "^\\d{4}$",
	targetExtensions: [
		"pdf", "csv", "xlsx", "xls", "png", "jpg", "jpeg", "heic", "tiff",
	],
	pbkdf2Iterations: 100000,
	docTypeTags: [],
	useKeychain: false,
};

export class CryptSettingTab extends PluginSettingTab {
	plugin: CryptPlugin;

	constructor(app: App, plugin: CryptPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Scope pattern")
			.setDesc(
				"Regex matching top-level folders eligible for lock/unlock. Default matches year folders (2024, 2025, etc.)."
			)
			.addText((text) =>
				text
					.setPlaceholder("^\\d{4}$")
					.setValue(this.plugin.settings.scopePattern)
					.onChange(async (value) => {
						this.plugin.settings.scopePattern = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Target extensions")
			.setDesc("Comma-separated list of file extensions to encrypt.")
			.addText((text) =>
				text
					.setPlaceholder("pdf, csv, xlsx, ...")
					.setValue(this.plugin.settings.targetExtensions.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.targetExtensions = value
							.split(",")
							.map((s) => s.trim().toLowerCase())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("PBKDF2 iterations")
			.setDesc(
				"Number of key derivation iterations. Higher = slower but more secure. Default: 100,000."
			)
			.addText((text) =>
				text
					.setPlaceholder("100000")
					.setValue(String(this.plugin.settings.pbkdf2Iterations))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n >= 10000) {
							this.plugin.settings.pbkdf2Iterations = n;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Document type tags")
			.setDesc(
				"Comma-separated list of optional tags for the Add File modal (e.g., W-2, K-1, Tax Return). Leave empty to disable."
			)
			.addText((text) =>
				text
					.setPlaceholder("W-2, K-1, Tax Return, ...")
					.setValue(this.plugin.settings.docTypeTags.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.docTypeTags = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);

		if (!Platform.isMobile && process.platform === "darwin") {
			new Setting(containerEl)
				.setName("Save passphrases to Keychain")
				.setDesc(
					"Store and retrieve passphrases from the macOS Keychain. When enabled, lock saves the passphrase and unlock auto-fills it."
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.useKeychain)
						.onChange(async (value) => {
							this.plugin.settings.useKeychain = value;
							await this.plugin.saveSettings();
						})
				);
		}
	}
}
