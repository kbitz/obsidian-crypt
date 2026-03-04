# Obsidian Crypt

Per-folder encryption for binary files in Obsidian. Lock and unlock folders with a passphrase using AES-256-GCM.

## Features

- **Lock Folder** — Encrypt all binary files (PDFs, images, spreadsheets) in a scope folder
- **Unlock Folder** — Decrypt files with the original passphrase
- **Add File** — Import a file into a scope folder (encrypts immediately if locked)
- **Status** — Overview of all scopes with lock state and document counts

## How it works

- Markdown files are **never** encrypted — only binary files matching configured extensions
- When locked: `document.pdf` → `document.pdf.enc` (ciphertext), plaintext deleted
- When unlocked: `document.pdf.enc` → `document.pdf` (plaintext restored)
- Metadata stored in `.vault-meta.json` per scope folder (salt, IVs, file manifest)
- Passphrase is **never** stored on disk

## Crypto

- PBKDF2-SHA256 key derivation (100k iterations default, configurable)
- AES-256-GCM authenticated encryption
- Random 16-byte salt per scope, random 12-byte IV per file
- Web Crypto API only — zero npm runtime dependencies
- Atomic: files processed one at a time, manifest updated after each

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Scope pattern | `^\d{4}$` | Regex for top-level folders to offer for lock/unlock |
| Target extensions | pdf, csv, xlsx, xls, png, jpg, jpeg, heic, tiff | File types to encrypt |
| PBKDF2 iterations | 100,000 | Key derivation iterations |
| Document type tags | (empty) | Optional tags for the Add File modal |

## Install

Build from source:

```bash
npm install
npm run build
```

Then symlink or copy `main.js`, `manifest.json`, and `styles.css` into your vault's `.obsidian/plugins/obsidian-crypt/` directory.

## Mobile (iOS)

Lock/Unlock works identically (Web Crypto available in WebKit). The Add File command shows a notice to use the iOS share sheet instead of the native file picker.
