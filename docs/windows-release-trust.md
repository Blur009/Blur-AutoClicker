# Windows Release Trust

## What SmartScreen Is

Windows Defender SmartScreen uses reputation signals for downloaded apps and installers. A GitHub-downloaded Windows installer can trigger `Windows protected your PC` when the file is unsigned or does not yet have enough reputation.

## What This Repo Already Uses

This repository already uses Tauri updater signatures for update metadata and updater artifacts. That is separate from Windows Authenticode signing.

The updater signing flow uses the Tauri updater key configured for releases, typically through `TAURI_SIGNING_PRIVATE_KEY`. That protects the updater channel, but it does not remove SmartScreen warnings for a Windows installer downloaded from GitHub Releases.

## Unsigned Build Path

Build the app with the default configuration:

```powershell
npm exec tauri build
```

Expected outcome:

- the build should succeed
- the generated installer or executable may still be `NotSigned`
- SmartScreen warnings may still appear for downloaded installers

## Optional Signed Build Path

Build the app with the Windows signing overlay:

```powershell
.\node_modules\.bin\tauri.cmd build --config src-tauri/tauri.windows.signing.conf.json
```

Required environment variables for `trusted-signing-cli` mode:

- `BLUR_WINDOWS_SIGNING_MODE=trusted-signing-cli`
- `BLUR_TRUSTED_SIGNING_ENDPOINT`
- `BLUR_TRUSTED_SIGNING_ACCOUNT`
- `BLUR_TRUSTED_SIGNING_PROFILE`
- `BLUR_TRUSTED_SIGNING_DESCRIPTION` optional, defaults to `BlurAutoClicker`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_TENANT_ID`

Expected outcome once valid signing credentials exist:

- the wrapper calls `trusted-signing-cli`
- signed artifacts can be produced
- SmartScreen behavior may improve, but this is not guaranteed by the repo alone

If `BLUR_WINDOWS_SIGNING_MODE` is unset or set to `none`, the wrapper exits successfully without signing so the build can still complete.

## Verify Signature State

Check the built installer:

```powershell
Get-AuthenticodeSignature src-tauri\target\release\bundle\nsis\BlurAutoClicker_3.4.0_x64-setup.exe
```

Check the built executable:

```powershell
Get-AuthenticodeSignature src-tauri\target\release\BlurAutoClicker.exe
```

`NotSigned` is expected for unsigned builds. `Valid` is the expected status after successful Authenticode signing.

## Best-Effort Post-Release Steps

After publishing a release:

1. Download the exact release asset that users will receive.
2. Verify its signature state with `Get-AuthenticodeSignature`.
3. If the file is unsigned or newly signed, submit the release asset to Microsoft Security Intelligence for analysis: <https://www.microsoft.com/en-us/wdsi/filesubmission>
4. Monitor user reports and SmartScreen behavior after release.

Submitting a file for analysis is best effort. It does not guarantee SmartScreen warnings will disappear.

## Release Checklist

1. Build the release with `npm exec tauri build` or `.\node_modules\.bin\tauri.cmd build --config src-tauri/tauri.windows.signing.conf.json`.
2. Verify installer and executable signature state.
3. Test the installer on a clean Windows machine or VM.
4. Publish the release asset.
5. Submit the published asset for Microsoft analysis if the file is unsigned or newly signed.
