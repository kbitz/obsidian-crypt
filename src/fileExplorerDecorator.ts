/**
 * Paints a lock/unlock icon next to each scope folder in the file explorer.
 * Desktop only — Obsidian mobile's file explorer DOM differs.
 */

import { Platform, setIcon, type Plugin, type WorkspaceLeaf } from "obsidian";
import type { LockStateCache } from "./lockStateCache";

const STATE_ATTR = "data-crypt-state";
const ICON_CLASS = "crypt-folder-icon";

interface FileExplorerView {
	containerEl: HTMLElement;
	// Obsidian internal — present in the bundled file-explorer view, used by
	// many community plugins. Map of vault path → { selfEl?: HTMLElement }.
	fileItems?: Record<string, { selfEl?: HTMLElement; el?: HTMLElement }>;
}

export class FileExplorerDecorator {
	constructor(
		private plugin: Plugin,
		private cache: LockStateCache
	) {}

	start(): void {
		if (Platform.isMobile) return;

		const repaint = () => this.paint();
		const app = this.plugin.app;

		app.workspace.onLayoutReady(repaint);
		this.plugin.registerEvent(app.workspace.on("layout-change", repaint));

		const detach = this.cache.onChange(repaint);
		this.plugin.register(detach);
		this.plugin.register(() => this.clear());
	}

	private paint(): void {
		const leaf = this.fileExplorerLeaf();
		if (!leaf) return;
		const view = leaf.view as unknown as FileExplorerView;

		this.clear(view.containerEl);

		for (const scope of this.cache.scopes()) {
			const titleEl = this.titleElement(view, scope);
			if (!titleEl) continue;

			const isLocked = this.cache.isLocked(scope);
			titleEl.setAttribute(STATE_ATTR, isLocked ? "locked" : "unlocked");

			const icon = titleEl.createSpan({ cls: ICON_CLASS });
			setIcon(icon, isLocked ? "lock" : "unlock");
		}
	}

	private titleElement(view: FileExplorerView, scopePath: string): HTMLElement | null {
		const item = view.fileItems?.[scopePath];
		if (item?.selfEl) return item.selfEl;
		if (item?.el) {
			const inner = item.el.querySelector<HTMLElement>(".nav-folder-title");
			if (inner) return inner;
		}
		const escaped = scopePath.replace(/"/g, '\\"');
		return view.containerEl.querySelector<HTMLElement>(
			`.nav-folder-title[data-path="${escaped}"]`
		);
	}

	private fileExplorerLeaf(): WorkspaceLeaf | null {
		return this.plugin.app.workspace.getLeavesOfType("file-explorer")[0] ?? null;
	}

	private clear(root?: HTMLElement): void {
		const r = root ?? this.fileExplorerLeaf()?.view.containerEl;
		if (!r) return;
		r.querySelectorAll<HTMLElement>(`[${STATE_ATTR}]`).forEach((el) => {
			el.removeAttribute(STATE_ATTR);
		});
		r.querySelectorAll<HTMLElement>(`.${ICON_CLASS}`).forEach((el) => {
			el.remove();
		});
	}
}
