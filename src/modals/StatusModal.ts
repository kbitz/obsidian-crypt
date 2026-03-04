import { App, Modal } from "obsidian";
import type CryptPlugin from "../main";
import { readMeta } from "../meta";

export class StatusModal extends Modal {
	plugin: CryptPlugin;

	constructor(app: App, plugin: CryptPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Crypt Status" });

		this.renderTable().then(null, (e) => {
			console.error("Crypt: failed to render status", e);
			contentEl.createEl("p", { text: "Failed to load status." });
		});
	}

	private async renderTable(): Promise<void> {
		const { contentEl } = this;

		const scopes = this.plugin.getScopes();
		if (scopes.length === 0) {
			contentEl.createEl("p", {
				text: "No folders match the scope pattern.",
			});
			return;
		}

		const table = contentEl.createEl("table", { cls: "crypt-status-table" });
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { text: "Folder" });
		headerRow.createEl("th", { text: "State" });
		headerRow.createEl("th", { text: "Documents" });
		headerRow.createEl("th", { text: "Locked at" });

		const tbody = table.createEl("tbody");

		for (const scope of scopes) {
			const meta = await readMeta(this.app.vault, scope);
			const row = tbody.createEl("tr");
			row.createEl("td", { text: scope });

			if (meta) {
				const stateCell = row.createEl("td");
				stateCell.createEl("span", {
					text: meta.state,
					cls: `crypt-badge crypt-badge-${meta.state}`,
				});

				row.createEl("td", {
					text: String(Object.keys(meta.files).length),
				});
				row.createEl("td", {
					text: meta.locked_at
						? new Date(meta.locked_at).toLocaleDateString()
						: "—",
				});
			} else {
				row.createEl("td", { text: "no metadata" });
				row.createEl("td", { text: "—" });
				row.createEl("td", { text: "—" });
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
