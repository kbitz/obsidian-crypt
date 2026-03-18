# Crypt — Per-Folder Encryption for Obsidian

Crypt encrypts binary files (PDFs, images, spreadsheets) inside your Obsidian vault on a per-folder basis. Lock a folder with a passphrase and its binary contents are encrypted at rest using AES-256-GCM. Markdown files are never touched.

## Why

If you store sensitive documents alongside your notes — tax forms, receipts, medical records, scanned IDs — Crypt lets you keep them encrypted when you're not actively using them. Your passphrase is never stored; it's used to derive an encryption key and then discarded.

## How It Works

1. **Lock a folder** — Pick a scope folder, enter a passphrase (with confirmation). Each binary file is encrypted in place (`file.pdf` → `file.pdf.enc`), the plaintext is deleted, and a manifest is saved.
2. **Unlock a folder** — Pick a locked folder, enter the passphrase. The plugin verifies it against the first file, then decrypts everything back to its original name.
3. **Add a file** — Import a file from your filesystem into a scope folder. On desktop, uses a native file picker; on mobile, prompts you to use the share sheet.
4. **Status** — See all scope folders at a glance: which are locked, which are unlocked, and how many files each contains.

Operations are atomic per-file — if something interrupts mid-lock, the manifest tracks progress so it can resume cleanly.

## Commands

| Command | Description |
|---------|-------------|
| `Crypt: Lock Folder` | Encrypt all target files in a scope folder |
| `Crypt: Unlock Folder` | Decrypt all files in a locked scope folder |
| `Crypt: Add File` | Import a file into a scope folder |
| `Crypt: Status` | Show lock state of all scope folders |

A ribbon icon (lock) also opens the Status view. You can also right-click any scope folder in the file explorer to lock or unlock it from the context menu.

## Scope Folders

A "scope" is a top-level vault folder that matches a configurable regex pattern. By default, the pattern is `^\d{4}$`, which matches year-named folders like `2024`, `2025`, etc. Only scope folders can be locked or unlocked.

You can change the pattern in settings to match whatever folder naming scheme you use. If your scope folders live inside a subfolder (e.g. `Documents/2024`), set the **Scope root** setting to that parent folder.

## What Gets Encrypted

Binary files with extensions in the target list: **pdf, csv, xlsx, xls, png, jpg, jpeg, heic, tiff** (configurable in settings).

Files that are always skipped:
- Markdown (`.md`) files
- Already-encrypted (`.enc`) files
- The `.vault-meta.json` manifest itself

## Cryptography

| Parameter | Value |
|-----------|-------|
| Key derivation | PBKDF2-SHA256, 100,000 iterations (configurable, min 10,000) |
| Encryption | AES-256-GCM |
| Salt | Random 16 bytes, unique per scope folder |
| IV | Random 12 bytes, unique per file |
| Implementation | Web Crypto API — zero runtime dependencies |

Your passphrase is never stored anywhere by default. It's derived into a `CryptoKey`, used for the operation, then discarded. On macOS, you can optionally save passphrases to the system Keychain for convenience (see Settings).

## Platform Support

Works on both desktop and mobile (iOS/Android). The Web Crypto API is available in all environments Obsidian runs in.

The only difference is the **Add File** command: on desktop it opens a native file picker, on mobile it shows a notice to use the OS share sheet instead.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Scope root | *(empty)* | Folder to look inside for scope folders (empty = vault root) |
| Scope pattern | `^\d{4}$` | Regex for top-level folders eligible for encryption |
| Target extensions | pdf, csv, xlsx, xls, png, jpg, jpeg, heic, tiff | File types to encrypt (comma-separated) |
| PBKDF2 iterations | 100,000 | Key derivation iterations (min 10,000) |
| Document type tags | *(empty)* | Optional tags for the Add File modal (e.g., W-2, K-1) |
| Save passphrases to Keychain | off | macOS only — store/retrieve passphrases from the system Keychain |
| Universal passphrase | off | Use the same passphrase for all scope folders (requires Keychain) |

## Installation

### From Obsidian Community Plugins

1. Open **Settings → Community plugins → Browse**
2. Search for **"Crypt"**
3. Click **Install**, then **Enable**

> **Note:** If Crypt is not yet listed in the community plugin browser, use one of the methods below.

### With BRAT (Beta Reviewers Auto-update Tool)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) lets you install plugins directly from GitHub before they appear in the community browser.

1. Install **BRAT** from Obsidian's Community Plugins
2. Open **Settings → BRAT → Add Beta plugin**
3. Enter: `kbitz/obsidian-crypt`
4. Click **Add Plugin**, then enable **Crypt** in Community Plugins

BRAT will also keep the plugin updated automatically.

### Manual Install

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/kbitz/obsidian-crypt/releases/latest)
2. Create a folder at `.obsidian/plugins/obsidian-crypt/` in your vault
3. Copy the three files into that folder
4. Open **Settings → Community plugins** and enable **Crypt**

### From Source

```bash
git clone https://github.com/kbitz/obsidian-crypt.git
cd obsidian-crypt
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/obsidian-crypt/` in your vault, then enable **Crypt** in Community Plugins settings.

## License

[MIT](LICENSE)
