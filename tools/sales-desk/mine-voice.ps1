<#
    Reads Earl's own sent emails out of Outlook and writes them to a local file so his
    real writing can be used as the voice reference, instead of guessing at a house style.

    Everything stays on this machine. Nothing is uploaded anywhere by this script.

        .\mine-voice.ps1                    # last 400 sent items across the s4digital accounts
        .\mine-voice.ps1 -Max 800
        .\mine-voice.ps1 -Account tuk       # a different account
#>

[CmdletBinding()]
param(
    [string] $Account = 's4digi',
    [int]    $Max     = 400,
    [string] $Out     = (Join-Path $PSScriptRoot 'voice-corpus.json')
)

$ErrorActionPreference = 'Stop'

try {
    $ol = New-Object -ComObject Outlook.Application
    $ns = $ol.GetNamespace('MAPI')
} catch {
    Write-Host 'Could not talk to Outlook. Is it open?' -ForegroundColor Red
    exit 1
}

# COM enumeration falls over mid-loop while Outlook is busy, so always go by index
function Get-SafeList {
    param($Collection, [int]$Limit = 0)
    $out = @()
    try {
        $n = $Collection.Count
        if ($Limit -gt 0 -and $n -gt $Limit) { $n = $Limit }
        for ($k = 1; $k -le $n; $k++) {
            try { $out += $Collection.Item($k) } catch { }
        }
    } catch { }
    return $out
}

$stores = @()
for ($k = 1; $k -le $ns.Stores.Count; $k++) {
    try {
        $s = $ns.Stores.Item($k)
        if ($s.DisplayName -like "*$Account*") { $stores += $s }
    } catch { }
}
if (-not $stores) {
    Write-Host "No mailbox matching '$Account' is loaded in Outlook." -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host ("Reading Sent Items from {0} mailbox(es)" -f $stores.Count) -ForegroundColor Cyan

$corpus = @()
foreach ($s in $stores) {
    $folder = $null
    try { $folder = $s.GetDefaultFolder(5) } catch { continue }
    Write-Host ("  " + $folder.FolderPath) -NoNewline

    $items = $folder.Items
    try { $items.Sort("[SentOn]", $true) } catch { }
    $got = 0

    foreach ($m in (Get-SafeList $items $Max)) {
        try {
            if ($m.Class -ne 43) { continue }        # olMail only

            $body = "" + $m.Body
            if (-not $body) { continue }

            # Cut the quoted thread below the reply, and anything after the sign-off,
            # so we learn how he writes rather than how other people write to him.
            $lines = $body -split "`r`n|`n"
            $keep = @()
            foreach ($ln in $lines) {
                $t = $ln.Trim()
                if ($t -match '^(From|Sent|To|Cc|Subject):\s') { break }
                if ($t -match '^-{2,}\s*$') { break }
                if ($t -match '^On .+ wrote:$') { break }
                if ($t -match '^_{5,}') { break }
                if ($t -match '^>') { continue }
                $keep += $ln
            }
            $clean = ($keep -join "`n").Trim()
            if ($clean.Length -lt 60 -or $clean.Length -gt 4000) { continue }

            $corpus += [pscustomobject]@{
                subject  = "" + $m.Subject
                to       = "" + $m.To
                sentOn   = if ($m.SentOn) { $m.SentOn.ToString('yyyy-MM-dd') } else { '' }
                isReply  = [bool]($m.Subject -match '^\s*(RE|FW|FWD)\s*:')
                words    = ($clean -split '\s+').Count
                body     = $clean
            }
            $got++
        } catch { }
    }
    Write-Host ("  -> " + $got + " usable") -ForegroundColor Green
}

if (-not $corpus.Count) {
    Write-Host 'Nothing usable found.' -ForegroundColor Yellow
    exit 0
}

$corpus | ConvertTo-Json -Depth 4 | Set-Content -Path $Out -Encoding UTF8

$cold = @($corpus | Where-Object { -not $_.isReply })
Write-Host ''
Write-Host ("Wrote {0} emails to {1}" -f $corpus.Count, $Out) -ForegroundColor Cyan
Write-Host ("  first contact / new threads : {0}" -f $cold.Count)
Write-Host ("  replies in a thread          : {0}" -f ($corpus.Count - $cold.Count))
Write-Host ("  median length                : {0} words" -f
            (($corpus | Sort-Object words)[[int]($corpus.Count / 2)]).words)
Write-Host ''
Write-Host 'Stays on this machine. Nothing was uploaded.' -ForegroundColor DarkGray
Write-Host ''
