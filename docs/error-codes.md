# Startup error codes

Every dialog BlurAutoClicker shows when it cannot open its window carries a code in the title bar and in the text. The same code goes into `Diagnostics/Logs/session.log` as `[Startup] Dialog E00X: ...`, so a report can be a single code instead of a pasted dialog.

Codes are permanent. Never reuse or renumber one, even if the wording around it changes.

| Code | Meaning                                               | Usual cause                                                                                                          |
| ---- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| E001 | Windows policy blocked the WebView2 runtime           | Software Restriction Policy, AppLocker, or a hardening tool blocking `msedgewebview2.exe`                            |
| E002 | WebView2 could not use a resource it needs            | Another copy of the app, or a leftover `msedgewebview2.exe` from an earlier crash, holding `EBWebView` open          |
| E003 | WebView2 failed to start, unclassified                | Broken or half-removed runtime, unusual environment                                                                  |
| E004 | WebView2 Runtime not found, bundled installer started | Fresh Windows install without the runtime; the app launched its own installer                                        |
| E005 | WebView2 Runtime not found, no installer available    | Portable build missing the bootstrapper, the installer failed to launch, or it failed signature verification         |
| E006 | Portable build cannot use its own folder              | Extracted into Program Files or another read-only location                                                           |
| E007 | Window creation timed out                             | WebView2 or the disk stalled; a security tool scanning the app's files                                               |
| E008 | Window created, interface never reported ready        | Page failed to load, script error before mount, browser process died after the window appeared, slow or blocked disk |
| E009 | Fatal panic                                           | A bug; the panic report is in `Diagnostics/PanicReports`                                                             |

## Where each code comes from

- E001-E003: `classify()` in `src-tauri/src/webview_guard.rs`, applied to the error returned by `create_main_window` in any build that got past the portable checks below, so a portable build with a usable folder can also report these.
- E004-E006: the portable branches of the window-creation failure in `src-tauri/src/lib.rs`.
- E007: `window_timeout()` in `src-tauri/src/webview_guard.rs`.
- E008: `silent_startup_failure()`, raised by the frontend watchdog.
- E009: the panic hook in `src-tauri/src/lib.rs`.

## Reporting a bug

Send the code plus `Diagnostics/Logs/session.log`. The log line for every dialog contains the whole text the dialog showed, so the code and the log together are enough to place the failure. Every dialog, including the panic one, writes its full text to the log; the panic message and backtrace additionally get their own file in `Diagnostics/PanicReports`.
