import { vi } from "vitest";

export function makeMockVault(files: Record<string, string> = {}) {
	return {
		getAbstractFileByPath: vi.fn((path: string) =>
			path in files ? { path } : null
		),
		read: vi.fn(async (file: { path: string }) => {
			if (file.path in files) return files[file.path];
			throw new Error("File not found");
		}),
		modify: vi.fn(async (file: { path: string }, content: string) => {
			files[file.path] = content;
		}),
		create: vi.fn(async (path: string, content: string) => {
			files[path] = content;
		}),
	};
}
