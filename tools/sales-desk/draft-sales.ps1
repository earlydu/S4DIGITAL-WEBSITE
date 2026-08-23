<#
    Creates one Outlook draft per company from sales-sequence.csv.

    Nothing is sent. Every message is saved to Drafts on the chosen account so you can
    read it, tweak it and press send yourself.

    Usage:
      .\draft-sales.ps1 -DryRun            # show what would be created, touch nothing
      .\draft-sales.ps1 -Ranks 1,2,3       # the first email for those rows
      .\draft-sales.ps1 -Touch 2 -Ranks 4  # follow-up one
      .\draft-sales.ps1 -Touch 3 -Ranks 4  # follow-up two, the easy exit
#>

[CmdletBinding()]
param(
    [string]   $Csv     = (Join-Path $PSScriptRoot 'sales-sequence.csv'),
    [string]   $Account = 's4digi',
    [int[]]    $Ranks,
    [string]   $Signature = 'EARL S4',
    [string]   $LinkTarget = 'https://s4digi.com/work',
    [ValidateSet('1','2','3')]
    [string]   $Touch = '1',
    [switch]   $DryRun
)

$ErrorActionPreference = 'Stop'
$SignatureLink = 'href="' + $LinkTarget + '"'

if (-not (Test-Path $Csv)) {
    Write-Host "Cannot find $Csv" -ForegroundColor Red
    exit 1
}

$rows = Import-Csv -Path $Csv | Where-Object { $_.email }
if ($Ranks) {
    $rows = $rows | Where-Object { $Ranks -contains [int]$_.rank }
}
if (-not $rows) {
    Write-Host 'Nothing to do - no rows matched.' -ForegroundColor Yellow
    exit 0
}

Write-Host ''
Write-Host ("{0} draft(s) to create  (touch {1})." -f @($rows).Count, $Touch) -ForegroundColor Cyan

# ---- connect to Outlook -------------------------------------------------
try {
    $outlook = New-Object -ComObject Outlook.Application
} catch {
    Write-Host 'Could not start Outlook. Is the desktop app installed?' -ForegroundColor Red
    exit 1
}
$session = $outlook.GetNamespace('MAPI')

$accounts = @()
foreach ($a in $session.Accounts) { $accounts += $a }
if (-not $accounts) {
    Write-Host 'Outlook has no accounts configured.' -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host 'Accounts found:'
foreach ($a in $accounts) { Write-Host ("  - " + $a.DisplayName + "  <" + $a.SmtpAddress + ">") }

$matches = @($accounts | Where-Object {
    $_.SmtpAddress -like "*$Account*" -or $_.DisplayName -like "*$Account*"
})

# An account with no DeliveryStore is a dead entry - Outlook will happily set it as
# the From address, then park the message in the Outbox forever because there is no
# transport behind it. Always prefer one that actually has a mailbox attached.
$sender = $matches | Where-Object {
    try { $null -ne $_.DeliveryStore } catch { $false }
} | Select-Object -First 1

if (-not $sender -and $matches) {
    Write-Host ("WARNING: every account matching '$Account' is missing a delivery store. " +
                "Mail sent from it will stick in the Outbox.") -ForegroundColor Red
    $sender = $matches[0]
}
if ($matches.Count -gt 1) {
    Write-Host ("Note: $($matches.Count) accounts match '$Account'; using the one with a mailbox.") -ForegroundColor DarkGray
}

if (-not $sender) {
    Write-Host ''
    Write-Host ("No account matched '$Account'. Falling back to the default account.") -ForegroundColor Yellow
    $sender = $accounts[0]
}
Write-Host ''
Write-Host ("Sending account: " + $sender.SmtpAddress) -ForegroundColor Green

# ---- find that account's OWN Drafts folder ------------------------------
# GetDefaultFolder() on the session returns the DEFAULT account's Drafts, which is
# not the same thing. Go via the matching store so the drafts land where you expect.
$olFolderDrafts = 16
$drafts = $null
foreach ($store in $session.Stores) {
    if ($store.DisplayName -eq $sender.SmtpAddress) {
        try { $drafts = $store.GetDefaultFolder($olFolderDrafts) } catch { }
        break
    }
}
if (-not $drafts) {
    $drafts = $session.GetDefaultFolder($olFolderDrafts)
    Write-Host ("Could not open Drafts for " + $sender.SmtpAddress +
                " - falling back to " + $drafts.FolderPath) -ForegroundColor Yellow
}
Write-Host ("Drafts folder:   " + $drafts.FolderPath) -ForegroundColor Green
Write-Host ''
$existing = @{}
foreach ($item in $drafts.Items) {
    try {
        if ($item.To) { $existing[($item.To + '|' + $item.Subject).ToLower()] = $true }
    } catch { }
}

# ---- plain text -> simple HTML paragraphs -------------------------------
function ConvertTo-HtmlBody {
    param([string]$Text)
    $enc = [System.Web.HttpUtility]::HtmlEncode($Text)
    if (-not $enc) { $enc = $Text }
    $paras = $enc -split "(`r`n|`n){2,}"
    $out = ''
    foreach ($p in $paras) {
        $p = $p.Trim()
        if ($p -and $p -ne "`n" -and $p -ne "`r`n") {
            $p = $p -replace "`r`n|`n", '<br>'
            # make any bare s4digi URL in the body a real link
            $p = $p -replace '(?<![">])\b((?:www\.|https?://)[^\s<]*s4digi\.com[^\s<,.;)]*)',
                             '<a href="https://s4digi.com/work">$1</a>'
            $out += '<p style="font-family:Calibri,sans-serif;font-size:11pt">' + $p + '</p>'
        }
    }
    return $out
}
Add-Type -AssemblyName System.Web

# ---- load the named Outlook signature, logo and all ----------------------
$sigDir  = Join-Path $env:APPDATA 'Microsoft\Signatures'
$sigFile = Get-ChildItem $sigDir -Filter "$Signature*.htm" -ErrorAction SilentlyContinue |
           Select-Object -First 1
$sigHtml = ''
if ($sigFile) {
    $sigHtml = Get-Content $sigFile.FullName -Raw -Encoding UTF8

    # The .htm points at its _files folder relatively, so the logo would arrive broken.
    # Rewrite to an absolute file:// URI - Outlook embeds it as an attachment on send.
    $abs = ([System.Uri](Join-Path $sigDir ($sigFile.BaseName + '_files'))).AbsoluteUri + '/'
    $sigHtml = $sigHtml -replace '(?<attr>src|href)="[^"]*_files/', ('${attr}="' + $abs)

    # The signature file has href="s4digi.com" with no scheme, which is a dead relative
    # link in every mail client. Point every s4digi link at the work page instead.
    $sigHtml = $sigHtml -replace 'href="\s*(?:https?://)?(?:www\.)?s4digi\.com/?\s*"', $SignatureLink

    # Leave the logo as an absolute file:// reference. That is exactly what Outlook does
    # with its own signatures: it renders in the draft, and Outlook embeds it on send.
    # A cid: reference is technically tidier but often shows blank while you are drafting.
    $sigImage = $null
    $m = [regex]::Match($sigHtml, 'src="(file:[^"]*)"')
    if ($m.Success) {
        $candidate = ([System.Uri]$m.Groups[1].Value).LocalPath
        if (Test-Path $candidate) { $sigImage = $candidate }
    }
    $imgOk = [bool]$sigImage
    Write-Host ("Signature:       " + $sigFile.Name) -ForegroundColor Green
    Write-Host ("  logo image:    " + $(if ($imgOk) { 'found and embedded' } else { 'NOT FOUND' })) -ForegroundColor $(if ($imgOk) { 'Green' } else { 'Yellow' })
    Write-Host ("  links go to:   " + $LinkTarget) -ForegroundColor Green
} else {
    Write-Host ("No signature file matching '$Signature*' - Outlook's own default will be used.") -ForegroundColor Yellow
}
Write-Host ''

$made = 0
$skipped = 0

foreach ($r in $rows) {
    # match on the subject actually being used, or a follow-up looks like a duplicate
    # of the first email and gets skipped
    $subject = switch ($Touch) {
        '2' { 'Re: ' + $r.subject }
        '3' { 'Re: ' + $r.subject }
        default { $r.subject }
    }
    $key = ($r.email + '|' + $subject).ToLower()
    if ($existing.ContainsKey($key)) {
        Write-Host ("  skip  {0,3}  {1}  (already in Drafts)" -f $r.rank, $r.company) -ForegroundColor DarkGray
        $skipped++
        continue
    }

    if ($DryRun) {
        Write-Host ("  would draft  {0,3}  {1,-38} -> {2}" -f $r.rank, $r.company, $r.email)
        $made++
        continue
    }

    # created straight inside that account's Drafts, not the default one
    $mail = $drafts.Items.Add('IPM.Note')
    $mail.To      = $r.email
    $mail.Subject = $subject

    $text = switch ($Touch) { '2' { $r.touch2 } '3' { $r.touch3 } default { $r.touch1 } }
    # the CSV body ends with the plain-text sign-off; drop it so we don't sign twice
    $text = ($text -split "(`r`n|`n)--(`r`n|`n)")[0].TrimEnd()

    if ($sigHtml) {
        $mail.HTMLBody = (ConvertTo-HtmlBody -Text $text) + $sigHtml
    } else {
        $null = $mail.GetInspector
        $mail.HTMLBody = (ConvertTo-HtmlBody -Text $text) + $mail.HTMLBody
    }
    $mail.SendUsingAccount = $sender
    $mail.Save()                            # Drafts. Never .Send()

    Write-Host ("  drafted  {0,3}  {1,-38} -> {2}" -f $r.rank, $r.company, $r.email) -ForegroundColor Green
    $made++
}

Write-Host ''
if ($DryRun) {
    Write-Host ("Dry run. {0} would be created, {1} already exist." -f $made, $skipped) -ForegroundColor Cyan
} else {
    Write-Host ("Done. {0} draft(s) created, {1} skipped as duplicates." -f $made, $skipped) -ForegroundColor Cyan
    Write-Host ('Find them in Outlook under ' + $drafts.FolderPath) -ForegroundColor Cyan
    Write-Host ('Each one will send from ' + $sender.SmtpAddress + '. Nothing has been sent.') -ForegroundColor Cyan
}
Write-Host ''
