import { Setting } from "obsidian";

export function addScopeDropdown(
	contentEl: HTMLElement,
	scopes: string[],
	onChange: (value: string | null) => void,
	initialValue?: string | null
): void {
	new Setting(contentEl).setName("Folder").addDropdown((dd) => {
		dd.addOption("", "Select a folder...");
		for (const s of scopes) {
			dd.addOption(s, s);
		}
		if (initialValue && scopes.includes(initialValue)) {
			dd.setValue(initialValue);
		}
		dd.onChange((v) => {
			onChange(v || null);
		});
	});
}

export function addPassphraseField(
	contentEl: HTMLElement,
	onChange: (value: string) => void,
	onInput?: (el: HTMLInputElement) => void,
	placeholder = "Enter passphrase"
): void {
	new Setting(contentEl).setName("Passphrase").addText((text) => {
		text.inputEl.type = "password";
		text.inputEl.autocomplete = "off";
		text.setPlaceholder(placeholder);
		text.onChange(onChange);
		if (onInput) onInput(text.inputEl);
	});
}

export function pluralize(count: number, word: string): string {
	return `${count} ${word}${count !== 1 ? "s" : ""}`;
}

export function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}
