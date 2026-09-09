<#
.SYNOPSIS
    Redeploy the Brick & Beam mockup to GitHub Pages.

.DESCRIPTION
    Copies "Brick & Beam v3.dc.html" to index.html (GitHub Pages needs an
    index.html; the .dc.html file stays the working source of truth for the
    design-component tooling), stages an explicit list of files only, commits,
    and pushes to origin main.

.PARAMETER Message
    Commit message. Defaults to "Update mockup".

.EXAMPLE
    .\deploy.ps1
    .\deploy.ps1 "Fix hero copy"
#>

param(
    [Parameter(Position = 0)]
    [string]$Message = "Update mockup"
)

$ErrorActionPreference = "Stop"

# Always operate from the directory this script lives in, regardless of
# where it was invoked from.
$repoRoot = $PSScriptRoot
Set-Location -LiteralPath $repoRoot

$sourceHtml = Join-Path $repoRoot "Brick & Beam v3.dc.html"
$indexHtml  = Join-Path $repoRoot "index.html"

if (-not (Test-Path -LiteralPath $sourceHtml)) {
    Write-Error "Source file not found: `"$sourceHtml`". Aborting — nothing was staged or pushed."
    exit 1
}

# 1. Copy the working source to the generated index, overwriting it.
Write-Host "Copying `"Brick & Beam v3.dc.html`" -> index.html ..."
Copy-Item -LiteralPath $sourceHtml -Destination $indexHtml -Force

# 2. Stage EXPLICIT paths only. Never `git add -A` / `git add .` — other
#    sessions may be mid-write on files not listed here.
$explicitPaths = @(
    "Brick & Beam v3.dc.html",
    "film-engine.js",
    "support.js",
    "README.md",
    "assets",
    ".gitignore",
    ".nojekyll",
    "deploy.ps1"
)

Write-Host "Force-adding generated index.html ..."
git add -f -- "index.html"
if ($LASTEXITCODE -ne 0) {
    Write-Error "git add -f -- index.html failed (exit $LASTEXITCODE)."
    exit 1
}

foreach ($path in $explicitPaths) {
    $full = Join-Path $repoRoot $path
    if (Test-Path -LiteralPath $full) {
        Write-Host "Staging `"$path`" ..."
        git add -- "$path"
        if ($LASTEXITCODE -ne 0) {
            Write-Error "git add -- `"$path`" failed (exit $LASTEXITCODE)."
            exit 1
        }
    } else {
        Write-Host "Skipping `"$path`" (not found)."
    }
}

# 3. Commit — but don't error out if there is nothing staged to commit.
#    Every commit this script makes must carry the required attribution
#    trailer. `git commit -m subject -m trailer` joins the two with a
#    blank line between them, which is exactly the shape a trailer needs.
$attributionTrailer = "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
$staged = git diff --cached --name-only
if ([string]::IsNullOrWhiteSpace($staged)) {
    Write-Host "Nothing to commit (working tree matches last commit). Skipping commit, will still push."
} else {
    Write-Host "Committing with message: $Message"
    if ($Message.Contains("Co-Authored-By")) {
        # Caller already supplied a trailer of their own — don't double it up.
        git commit -m "$Message"
    } else {
        git commit -m "$Message" -m "$attributionTrailer"
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Error "git commit failed (exit $LASTEXITCODE)."
        exit 1
    }
}

# 4. Push to origin main.
Write-Host "Pushing to origin main ..."
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Error "git push origin main failed (exit $LASTEXITCODE)."
    exit 1
}

# 5. Print the live URL.
$liveUrl = "https://haydnm17.github.io/brick-beam/"
Write-Host ""
Write-Host "Deployed. Live at: $liveUrl"
Write-Host "(GitHub Pages / CDN can take a few seconds to a couple of minutes to reflect the change.)"
