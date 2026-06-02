     1|# Windows Release Trust
     2|
     3|## What SmartScreen Is
     4|
     5|Windows Defender SmartScreen uses reputation signals for downloaded apps and installers. A GitHub-downloaded Windows installer can trigger `Windows protected your PC` when the file is unsigned or does not yet have enough reputation.
     6|
     7|## What This Repo Already Uses
     8|
     9|This repository already uses Tauri updater signatures for update metadata and updater artifacts. That is separate from Windows Authenticode signing.
    10|
    11|The updater signing flow uses the Tauri updater key configured for releases, typically through `TAURI_SIGNING_PRIVATE_KEY`. That protects the updater channel, but it does not remove SmartScreen warnings for a Windows installer downloaded from GitHub Releases.
    12|
    13|## Unsigned Build Path
    14|
    15|Build the app with the default configuration:
    16|
    17|```powershell
    18|npm exec tauri build
    19|```
    20|
    21|Expected outcome:
    22|
    23|- the build should succeed
    24|- the generated installer or executable may still be `NotSigned`
    25|- SmartScreen warnings may still appear for downloaded installers
    26|
    27|## Optional Signed Build Path
    28|
    29|Build the app with the Windows signing overlay:
    30|
    31|```powershell
    32|.\node_modules\.bin\tauri.cmd build --config src-tauri/tauri.windows.signing.conf.json
    33|```
    34|
    35|Required environment variables for `trusted-signing-cli` mode:
    36|
    37|- `BLUR_WINDOWS_SIGNING_MODE=trusted-signing-cli`
    38|- `BLUR_TRUSTED_SIGNING_ENDPOINT`
    39|- `BLUR_TRUSTED_SIGNING_ACCOUNT`
    40|- `BLUR_TRUSTED_SIGNING_PROFILE`
    41|- `BLUR_TRUSTED_SIGNING_DESCRIPTION` optional, defaults to `MrSchnirschuhHub`
    42|- `AZURE_CLIENT_ID`
    43|- `AZURE_CLIENT_SECRET`
    44|- `AZURE_TENANT_ID`
    45|
    46|Expected outcome once valid signing credentials exist:
    47|
    48|- the wrapper calls `trusted-signing-cli`
    49|- signed artifacts can be produced
    50|- SmartScreen behavior may improve, but this is not guaranteed by the repo alone
    51|
    52|If `BLUR_WINDOWS_SIGNING_MODE` is unset or set to `none`, the wrapper exits successfully without signing so the build can still complete.
    53|
    54|## Verify Signature State
    55|
    56|Check the built installer:
    57|
    58|```powershell
    59|Get-AuthenticodeSignature src-tauri\target\release\bundle\nsis\MrSchnirschuhHub_3.4.0_x64-setup.exe
    60|```
    61|
    62|Check the built executable:
    63|
    64|```powershell
    65|Get-AuthenticodeSignature src-tauri\target\release\MrSchnirschuhHub.exe
    66|```
    67|
    68|`NotSigned` is expected for unsigned builds. `Valid` is the expected status after successful Authenticode signing.
    69|
    70|## Best-Effort Post-Release Steps
    71|
    72|After publishing a release:
    73|
    74|1. Download the exact release asset that users will receive.
    75|2. Verify its signature state with `Get-AuthenticodeSignature`.
    76|3. If the file is unsigned or newly signed, submit the release asset to Microsoft Security Intelligence for analysis: <https://www.microsoft.com/en-us/wdsi/filesubmission>
    77|4. Monitor user reports and SmartScreen behavior after release.
    78|
    79|Submitting a file for analysis is best effort. It does not guarantee SmartScreen warnings will disappear.
    80|
    81|## Release Checklist
    82|
    83|1. Build the release with `npm exec tauri build` or `.\node_modules\.bin\tauri.cmd build --config src-tauri/tauri.windows.signing.conf.json`.
    84|2. Verify installer and executable signature state.
    85|3. Test the installer on a clean Windows machine or VM.
    86|4. Publish the release asset.
    87|5. Submit the published asset for Microsoft analysis if the file is unsigned or newly signed.
    88|