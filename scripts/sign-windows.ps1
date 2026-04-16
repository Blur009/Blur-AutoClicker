param(
    [Parameter(Mandatory = $true)]
    [string]$ArtifactPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ArtifactPath)) {
    Write-Error "Artifact not found: $ArtifactPath"
}

$resolvedArtifactPath = (Resolve-Path -LiteralPath $ArtifactPath).Path
$mode = $env:BLUR_WINDOWS_SIGNING_MODE

if ([string]::IsNullOrWhiteSpace($mode) -or $mode -eq "none") {
    Write-Host "Skipping Windows signing for $resolvedArtifactPath"
    exit 0
}

if ($mode -ne "trusted-signing-cli") {
    Write-Error "Unsupported BLUR_WINDOWS_SIGNING_MODE '$mode'. Supported values: none, trusted-signing-cli."
}

$requiredEnvVars = @(
    "BLUR_TRUSTED_SIGNING_ENDPOINT",
    "BLUR_TRUSTED_SIGNING_ACCOUNT",
    "BLUR_TRUSTED_SIGNING_PROFILE",
    "AZURE_CLIENT_ID",
    "AZURE_CLIENT_SECRET",
    "AZURE_TENANT_ID"
)

$missingEnvVars = foreach ($envVar in $requiredEnvVars) {
    $value = [Environment]::GetEnvironmentVariable($envVar)
    if ([string]::IsNullOrWhiteSpace($value)) {
        $envVar
    }
}

if ($missingEnvVars.Count -gt 0) {
    Write-Error ("Missing required environment variables for trusted-signing-cli: " + ($missingEnvVars -join ", "))
}

$description = if ([string]::IsNullOrWhiteSpace($env:BLUR_TRUSTED_SIGNING_DESCRIPTION)) {
    "BlurAutoClicker"
} else {
    $env:BLUR_TRUSTED_SIGNING_DESCRIPTION
}

& trusted-signing-cli `
    -e $env:BLUR_TRUSTED_SIGNING_ENDPOINT `
    -a $env:BLUR_TRUSTED_SIGNING_ACCOUNT `
    -c $env:BLUR_TRUSTED_SIGNING_PROFILE `
    -d $description `
    $resolvedArtifactPath

exit $LASTEXITCODE
