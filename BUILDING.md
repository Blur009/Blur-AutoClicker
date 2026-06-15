# Building From Source

This project is Windows-first. The maintained desktop build path uses the Rust `x86_64-pc-windows-msvc` toolchain plus Node.js.

## Prerequisites

- Node.js 20 or newer
- Rust via `rustup`
- Microsoft C++ Build Tools / Visual Studio Build Tools

## Setup

```powershell
git clone https://github.com/Blur009/Blur-AutoClicker.git
cd Blur-AutoClicker
npm install
rustup default stable-x86_64-pc-windows-msvc
```

## Run in development

```powershell
npm run dev
```

## Build a release bundle

```powershell
npm run build
```

The built Windows installer is written to `src-tauri/target/release/bundle/nsis/`.

## Validation

```powershell
npm run lint
npm run frontend:build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for pull request guidelines and workflow.
