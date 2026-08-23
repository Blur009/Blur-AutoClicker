# Building From Source

This project has native Windows and macOS desktop backends behind the same unchanged Tauri/React interface.

## Prerequisites

- Node.js 20 or newer
- Rust via `rustup`
- Windows: Microsoft C++ Build Tools / Visual Studio Build Tools
- macOS: Xcode Command Line Tools (`xcode-select --install`)

## Setup

```shell
git clone https://github.com/Blur009/Blur-AutoClicker.git
cd Blur-AutoClicker
npm ci
```

The repository's `rust-toolchain.toml` selects the supported Rust toolchain automatically.

## Run in development

```shell
npm run dev
```

On macOS, approve the Accessibility prompt on first launch. The permission can also be enabled manually in **System Settings → Privacy & Security → Accessibility**. Restart the app after changing the permission if macOS requests it.

## Build a release bundle

```shell
npm run build
```

- Windows installer: `src-tauri/target/release/bundle/nsis/`
- macOS app: `src-tauri/target/release/bundle/macos/`
- macOS disk image: `src-tauri/target/release/bundle/dmg/`

## Build the portable zip

The portable zip contains the exe plus the VC++ runtime DLLs, crashpad handler
and WebView2 bootstrapper, and ships a `portable.txt` marker that activates
portable mode at runtime. Build the release first, then:

```powershell
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-portable.ps1
```

The zip is written to `BlurAutoClicker-v<version>-portable.zip` in the repo
root. Running the script locally without `-Tag` defaults the tag to `dev`,
producing `BlurAutoClicker-vdev-portable.zip`; CI passes the real tag (e.g.
`-Tag v3.9.1`) so the version in the filename is correct. Portable mode keeps
all app data (settings, stats, logs, WebView2 user data) inside a `Data/`
folder next to the exe; there is no in-app auto-update — users download new
versions from GitHub Releases.

## Validation

```shell
npm run lint
npm run frontend:build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

Or run the complete project check:

```shell
npm run check
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for pull request guidelines and workflow.
