# obsidian-crypt — Claude Code Context

## What This Is

An Obsidian plugin that provides per-folder encryption for binary files. Users lock/unlock top-level "scope" folders with a passphrase. Binary files (PDFs, images, spreadsheets) get AES-256-GCM encrypted at rest; markdown is never touched.

## Architecture

```
src/
├── main.ts           — Plugin entry: 4 commands, ribbon icon, settings tab
├── crypto.ts         — PBKDF2 key derivation + AES-256-GCM (Web Crypto API only)
├── meta.ts           — .vault-meta.json schema, read/write, migration
├── modals/
│   ├── LockModal.ts  — Folder selection + passphrase (with confirm)
│   ├── UnlockModal.ts — Locked folder selection + passphrase
│   ├── AddDocModal.ts — File picker + folder/subfolder selection
│   └── StatusModal.ts — Overview of all scopes + lock state + doc counts
└── settings.ts       — Settings tab (4 configurable options)
```

Build output: `main.js` (single bundle via esbuild), `styles.css`, `manifest.json`.

## Key Concepts

- **Scope**: A top-level vault folder matching a configurable regex (default: `^\d{4}$` for year folders). Scopes are the unit of lock/unlock.
- **Target files**: Binary files with extensions in the configurable list. Markdown and `.enc` files are excluded.
- **`.vault-meta.json`**: Per-scope metadata file storing lock state, PBKDF2 salt, per-file IVs, and file manifest. Updated atomically after each file operation for crash recovery.
- **Passphrase**: Never stored. Derived into a key via PBKDF2-SHA256 with per-scope salt.

## Crypto Design

- PBKDF2-SHA256, 100k iterations (configurable), 16-byte random salt per scope
- AES-256-GCM, random 12-byte IV per file
- Web Crypto API only — zero npm runtime dependencies
- Lock: `file.pdf` → encrypt → `file.pdf.enc`, delete plaintext, update manifest
- Unlock: verify passphrase on first file, then decrypt all → restore plaintext names
- Atomic: one file at a time, manifest updated after each, resumable on crash

## Settings (in `data.json` at runtime)

| Key | Type | Default |
|-----|------|---------|
| `scopePattern` | regex string | `^\d{4}$` |
| `targetExtensions` | string[] | pdf, csv, xlsx, xls, png, jpg, jpeg, heic, tiff |
| `pbkdf2Iterations` | number | 100000 |
| `docTypeTags` | string[] | [] |

## Build

```bash
npm install
npm run build       # production build → main.js
npm run dev         # watch mode
```

No runtime npm dependencies. Dev deps: typescript, esbuild, obsidian types.

## Conventions

- All file I/O goes through `this.app.vault` API (readBinary, createBinary, delete, modify, etc.) — never Node `fs` directly (must work on mobile)
- Exception: AddDocModal uses Electron `dialog` for desktop file picker with DOM `<input>` fallback
- Modals extend Obsidian's `Modal` class; settings extend `PluginSettingTab`
- Plugin ID: `obsidian-crypt`; command prefix: `obsidian-crypt:`

## Mobile (iOS)

- Lock/Unlock work identically — Web Crypto is available in WebKit
- AddDocModal: skip native file picker on mobile, show notice to use share sheet instead
- Use `Platform.isMobile` to detect

## Known Issues / TODOs

- No tests yet — need a test harness that mocks the Obsidian vault API
- AddDocModal's Electron `require("electron").remote.dialog` may not work in newer Obsidian versions; DOM `<input>` fallback covers this but needs verification
- No passphrase change flow (unlock with old, re-lock with new is the manual workaround)
- No integrity check command (verify all manifest files exist and decrypt without full decryption)
- No auto-lock timer

## Out of Scope (v1)

- Per-subfolder locking (only per-scope)
- CPA export / zip generation
- PDF OCR / text extraction
- Scaffolding new scope folder structures
