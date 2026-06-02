     1|     1|# Contributing to Blur Auto Clicker
     2|     2|
     3|     3|Thanks for helping improve Blur Auto Clicker.
     4|     4|
     5|     5|## Project scope
     6|     6|
     7|     7|- Blur Auto Clicker is a Windows-first desktop app built with Tauri 2, Rust, React, and TypeScript.
     8|     8|- Keep changes focused. Avoid unrelated refactors in the same pull request.
     9|     9|- If your change affects the UI, include screenshots or a short recording in the pull request.
    10|    10|
    11|    11|## Prerequisites
    12|    12|
    13|    13|- Node.js 20 or newer
    14|    14|- Rust via `rustup`
    15|    15|- Microsoft C++ Build Tools / Visual Studio Build Tools
    16|    16|- Windows with the Rust `x86_64-pc-windows-msvc` toolchain installed
    17|    17|
    18|    18|## Setup
    19|    19|
    20|    20|```powershell
    21|    21|git clone https://github.com/MrSchnirschuh/MrSchnirschuhHub.git
    22|    22|cd MrSchnirschuhHub
    23|    23|npm install
    24|    24|rustup default stable-x86_64-pc-windows-msvc
    25|    25|```
    26|    26|
    27|    27|## Local development
    28|    28|
    29|    29|Run the app in development:
    30|    30|
    31|    31|```powershell
    32|    32|npm run dev
    33|    33|```
    34|    34|
    35|    35|Build the frontend only:
    36|    36|
    37|    37|```powershell
    38|    38|npm run frontend:build
    39|    39|```
    40|    40|
    41|    41|Build the desktop app bundle:
    42|    42|
    43|    43|```powershell
    44|    44|npm run build
    45|    45|```
    46|    46|
    47|    47|## Validation
    48|    48|
    49|    49|Run the relevant local checks before opening a pull request:
    50|    50|
    51|    51|```powershell
    52|    52|npm run lint
    53|    53|npm run frontend:build
    54|    54|cargo fmt --manifest-path src-tauri/Cargo.toml --check
    55|    55|cargo check --manifest-path src-tauri/Cargo.toml --locked
    56|    56|cargo test --manifest-path src-tauri/Cargo.toml --locked
    57|    57|```
    58|    58|
    59|    59|Include the exact commands you ran in the pull request description.
    60|    60|
    61|    61|## Branches and pull requests
    62|    62|
    63|    63|- Open feature and fix pull requests against `dev`.
    64|    64|- Keep pull requests small enough to review comfortably.
    65|    65|- Link the related issue when there is one, or write `N/A`.
    66|    66|- Use the issue forms before opening a new issue.
    67|    67|
    68|    68|## Generated files
    69|    69|
    70|    70|- Some files are generated, including schema output under `src-tauri/gen/`.
    71|    71|- Only commit generated files when they were intentionally updated as part of the change.
    72|    72|- If generated files changed unexpectedly, review them before committing.
    73|    73|