# =========================================================================
# PDF Stamp Studio - Excel add-in installer (PowerShell)
# Excel 2007 .. Microsoft 365, 32/64-bit, any Windows language.
#
# Builds PdfStampStudio.xlam with the real Microsoft Excel, adds the ribbon group
# "Podpisi i pechat" on the Home tab, and installs it into XLSTART.
#
# Things this script deliberately handles:
#   * WPS Office pretending to be Excel (COM ProgID hijack)  -> verified by name + version
#   * the user's Excel already running and holding the old .xlam locked
#   * Excel 2007 (needs the 2006 ribbon schema) and Excel 2010+ (2009 schema)
#   * "Trust access to the VBA project object model" switched off (set temporarily, restored)
#   * non-ASCII user names / code pages (VBA source is converted to pure ASCII)
#   * clear error text + install.log instead of silent failure
#
# NOTE: this file must stay UTF-8 WITH BOM (Windows PowerShell 5.1 needs it for Cyrillic text).
# =========================================================================

[CmdletBinding()]
param(
    [switch]$Uninstall = $false
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$appData = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData)
$studioDir = Join-Path $appData "PdfStampStudio"
$xlstartDir = Join-Path $appData "Microsoft\Excel\XLSTART"
$targetXlam = Join-Path $xlstartDir "PdfStampStudio.xlam"
$legacyAddinXlam = Join-Path (Join-Path $appData "Microsoft\AddIns") "PdfStampStudio.xlam"
$buildXlam = Join-Path $env:TEMP "PdfStampStudio_build.xlam"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$basPath = Join-Path $scriptDir "vba\PdfStampModule.bas"
$xmlPath = Join-Path $scriptDir "customUI14.xml"
$logPath = Join-Path $studioDir "install.log"

function Write-Log($message) {
    try {
        if (-not (Test-Path $studioDir)) { New-Item -ItemType Directory -Path $studioDir -Force | Out-Null }
        Add-Content -Path $logPath -Value ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $message) -Encoding UTF8
    } catch {}
}

function Fail($message) {
    [Console]::Error.WriteLine($message)
    Write-Log "FAILED: $message"
    exit 1
}

# VBA imports a .bas in the system ANSI code page. To work on every Windows, each string literal
# containing non-ASCII text becomes U("\uXXXX...") (decoded by the add-in itself).
function ConvertTo-AsciiVba($SourcePath, $TargetPath) {
    $src = [System.IO.File]::ReadAllText($SourcePath, [System.Text.Encoding]::UTF8)
    $out = New-Object System.Text.StringBuilder
    foreach ($line in ($src -split "`r?`n")) {
        $converted = [regex]::Replace($line, '"([^"]*)"', {
            param($m)
            $text = $m.Groups[1].Value
            if ($text -notmatch '[^\x00-\x7F]') { return $m.Value }
            $tokens = New-Object System.Collections.Generic.List[string]
            foreach ($ch in $text.ToCharArray()) {
                if ([int]$ch -lt 128) { $tokens.Add([string]$ch) }
                else { $tokens.Add('\u' + ([int]$ch).ToString('X4')) }
            }
            $chunks = New-Object System.Collections.Generic.List[string]
            $cur = ''
            foreach ($tk in $tokens) {
                if (($cur.Length + $tk.Length) -gt 200) { $chunks.Add($cur); $cur = '' }
                $cur += $tk
            }
            if ($cur.Length -gt 0) { $chunks.Add($cur) }
            $parts = $chunks | ForEach-Object { '"' + $_ + '"' }
            return 'U(' + ($parts -join (' & _' + "`r`n")) + ')'
        })
        # anything non-ASCII left (inside comments) becomes '?'
        $converted = [regex]::Replace($converted, '[^\x00-\x7F]', '?')
        [void]$out.Append($converted + "`r`n")
    }
    [System.IO.File]::WriteAllText($TargetPath, $out.ToString(), [System.Text.Encoding]::ASCII)
}

# Finds the REAL Microsoft Excel. With WPS Office installed, the ProgID "Excel.Application" can point
# to WPS (it calls itself version 12.0 and has no VBProject), so every candidate is verified.
function Test-RealExcel($app) {
    try {
        if ($null -eq $app) { return $false }
        if ($app.Name -ne 'Microsoft Excel') { return $false }
        $ver = [int][double]([string]$app.Version)
        if ($ver -lt 12) { return $false }

        # Real Excel runs from EXCEL.EXE; WPS Spreadsheets (also "version 12.0") runs from et.exe / wps*.exe.
        $exe = ''
        try { $exe = [string]$app.FullName } catch {}
        if ($exe -ne '') {
            $ok = ($exe -match '(?i)\\excel\.exe$')
            Write-Log "Excel candidate: exe=$exe version=$ver real=$ok"
            return $ok
        }
        # cannot read the path: only trust modern versions (WPS reports 12.0)
        Write-Log "Excel candidate without path: version=$ver"
        return ($ver -ge 14)
    } catch { return $false }
}

function Get-RunningExcel {
    try {
        $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application')
        if (Test-RealExcel $app) { return $app }
    } catch {}
    return $null
}

function Get-ExcelApp {
    # 1) explicit Microsoft Excel CLSID (independent of ProgID overrides)
    try {
        $type = [Type]::GetTypeFromCLSID([Guid]'00024500-0000-0000-C000-000000000046')
        $app = [Activator]::CreateInstance($type)
        if (Test-RealExcel $app) { Write-Log "Excel via CLSID, version $($app.Version)"; return @{ App = $app; Own = $true } }
        Write-Log "CLSID gave a non-Excel app: name=$($app.Name) version=$($app.Version)"
        try { $app.Quit() } catch {}
    } catch { Write-Log "CLSID start failed: $($_.Exception.Message)" }

    # 2) plain ProgID
    try {
        $app = New-Object -ComObject Excel.Application
        if (Test-RealExcel $app) { Write-Log "Excel via ProgID, version $($app.Version)"; return @{ App = $app; Own = $true } }
        Write-Log "ProgID gave a non-Excel app: name=$($app.Name) version=$($app.Version)"
        try { $app.Quit() } catch {}
    } catch { Write-Log "ProgID start failed: $($_.Exception.Message)" }

    # 3) an Excel the user already has open
    $running = Get-RunningExcel
    if ($running) { Write-Log "Attached to running Excel, version $($running.Version)"; return @{ App = $running; Own = $false } }

    return $null
}

# Closes our add-in inside the user's running Excel so the file is not locked
function Close-AddinInRunningExcel {
    try {
        $app = Get-RunningExcel
        if ($null -eq $app) { return }
        for ($i = $app.Workbooks.Count; $i -ge 1; $i--) {
            $w = $app.Workbooks.Item($i)
            if ($w.Name -eq 'PdfStampStudio.xlam') { $w.Close($false); Write-Log "Closed add-in in running Excel" }
        }
        Start-Sleep -Milliseconds 700
    } catch { Write-Log "Close-AddinInRunningExcel: $($_.Exception.Message)" }
}

# Loads the new add-in into the already running Excel so the ribbon appears without a restart
function Open-AddinInRunningExcel($path) {
    try {
        $app = Get-RunningExcel
        if ($null -eq $app) { return }
        $app.Workbooks.Open($path) | Out-Null
        Write-Log "Add-in loaded into running Excel"
    } catch { Write-Log "Open-AddinInRunningExcel: $($_.Exception.Message)" }
}

function Copy-WithRetry($src, $dst) {
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            Copy-Item -Path $src -Destination $dst -Force -ErrorAction Stop
            return $true
        } catch {
            Write-Log "Copy attempt $attempt failed: $($_.Exception.Message)"
            Close-AddinInRunningExcel
            Start-Sleep -Milliseconds 800
        }
    }
    return $false
}

function Remove-WithRetry($path) {
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            if (Test-Path $path) { Remove-Item -Path $path -Force -ErrorAction Stop }
            return $true
        } catch {
            Write-Log "Remove attempt $attempt failed: $($_.Exception.Message)"
            Close-AddinInRunningExcel
            Start-Sleep -Milliseconds 800
        }
    }
    return $false
}

# Writes the ribbon XML into the .xlam (zip). Excel 2010+ reads customUI14.xml, Excel 2007 reads customUI.xml.
function Inject-RibbonX($filePath, $xmlContent) {
    $xml2006 = $xmlContent.Replace('http://schemas.microsoft.com/office/2009/07/customui', 'http://schemas.microsoft.com/office/2006/01/customui')
    $zip = [System.IO.Compression.ZipFile]::Open($filePath, [System.IO.Compression.ZipArchiveMode]::Update)
    try {
        foreach ($pair in @(@("customUI/customUI14.xml", $xmlContent), @("customUI/customUI.xml", $xml2006))) {
            $old = $zip.GetEntry($pair[0])
            if ($old) { $old.Delete() }
            $entry = $zip.CreateEntry($pair[0])
            $sw = New-Object System.IO.StreamWriter($entry.Open(), (New-Object System.Text.UTF8Encoding($false)))
            $sw.Write($pair[1])
            $sw.Close()
        }

        $relsEntry = $zip.GetEntry("_rels/.rels")
        if (-not $relsEntry) { throw "_rels/.rels не найден в надстройке" }
        $sr = New-Object System.IO.StreamReader($relsEntry.Open(), [System.Text.Encoding]::UTF8)
        $relsText = $sr.ReadToEnd()
        $sr.Close()

        if (-not $relsText.Contains('Id="rIdPssUi14"')) {
            $items = '<Relationship Id="rIdPssUi14" Type="http://schemas.microsoft.com/office/2007/relationships/ui/extensibility" Target="customUI/customUI14.xml"/>' +
                     '<Relationship Id="rIdPssUi06" Type="http://schemas.microsoft.com/office/2006/relationships/ui/extensibility" Target="customUI/customUI.xml"/>'
            $relsText = $relsText.Replace("</Relationships>", $items + "</Relationships>")
            $relsEntry.Delete()
            $newRels = $zip.CreateEntry("_rels/.rels")
            $sw2 = New-Object System.IO.StreamWriter($newRels.Open(), (New-Object System.Text.UTF8Encoding($false)))
            $sw2.Write($relsText)
            $sw2.Close()
        }
    } finally {
        $zip.Dispose()
    }

    $check = [System.IO.Compression.ZipFile]::OpenRead($filePath)
    try {
        if (-not $check.GetEntry("customUI/customUI14.xml")) { throw "customUI14.xml не найден в архиве после записи" }
    } finally { $check.Dispose() }
    Write-Log "Ribbon injected (2007 + 2010 schemas)"
}

# Registers a trusted location for XLSTART and (temporarily) VBA object-model access.
$script:vbomBackup = @{}
function Enable-BuildAccess {
    foreach ($ver in @("12.0", "14.0", "15.0", "16.0")) {
        try {
            $secKey = "HKCU:\Software\Microsoft\Office\$ver\Excel\Security"
            if (-not (Test-Path $secKey)) { continue }

            $locKey = "$secKey\Trusted Locations\PdfStampStudio"
            if (-not (Test-Path $locKey)) { New-Item -Path $locKey -Force | Out-Null }
            Set-ItemProperty -Path $locKey -Name "Path" -Value ($xlstartDir + "\") -Force
            Set-ItemProperty -Path $locKey -Name "AllowSubFolders" -Value 1 -Type DWord -Force
            Set-ItemProperty -Path $locKey -Name "Description" -Value "PDF Stamp Studio" -Force

            $old = (Get-ItemProperty -Path $secKey -Name "AccessVBOM" -ErrorAction SilentlyContinue).AccessVBOM
            $script:vbomBackup[$secKey] = $old
            Set-ItemProperty -Path $secKey -Name "AccessVBOM" -Value 1 -Type DWord -Force

            # a company policy can force the value off; nothing we can do, but log it
            $policy = "HKCU:\Software\Policies\Microsoft\Office\$ver\Excel\Security"
            if (Test-Path $policy) {
                $pv = (Get-ItemProperty -Path $policy -Name "AccessVBOM" -ErrorAction SilentlyContinue).AccessVBOM
                if ($null -ne $pv) { Write-Log "Policy AccessVBOM=$pv for Office $ver" }
            }
        } catch { Write-Log "Enable-BuildAccess ($ver): $($_.Exception.Message)" }
    }
}

function Restore-BuildAccess {
    foreach ($k in @($script:vbomBackup.Keys)) {
        try {
            if ($null -eq $script:vbomBackup[$k]) { Remove-ItemProperty -Path $k -Name "AccessVBOM" -ErrorAction SilentlyContinue }
            else { Set-ItemProperty -Path $k -Name "AccessVBOM" -Value $script:vbomBackup[$k] -Type DWord -Force }
        } catch {}
    }
}

function Remove-TrustedLocations {
    foreach ($ver in @("12.0", "14.0", "15.0", "16.0")) {
        try {
            $locKey = "HKCU:\Software\Microsoft\Office\$ver\Excel\Security\Trusted Locations\PdfStampStudio"
            if (Test-Path $locKey) { Remove-Item -Path $locKey -Recurse -Force -ErrorAction SilentlyContinue }
        } catch {}
    }
}

# ---------------------------------------------------------------- uninstall
if ($Uninstall) {
    Write-Log "Uninstall started"
    Close-AddinInRunningExcel
    if (-not (Remove-WithRetry $targetXlam)) {
        Fail "Не удалось удалить надстройку: файл занят. Закройте Excel полностью и повторите."
    }
    Remove-WithRetry $legacyAddinXlam | Out-Null
    Remove-TrustedLocations
    Write-Log "Uninstall OK"
    Write-Host "Готово: надстройка удалена из Excel." -ForegroundColor Green
    exit 0
}

# ---------------------------------------------------------------- install
Write-Host "PDF Stamp Studio: установка надстройки в Excel" -ForegroundColor Cyan
Write-Log "Install started (target: $targetXlam)"

foreach ($dir in @($studioDir, $xlstartDir)) {
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}
if (-not (Test-Path $basPath)) { Fail "Не найден файл надстройки: $basPath" }
if (-not (Test-Path $xmlPath)) { Fail "Не найден файл ленты: $xmlPath" }

Enable-BuildAccess
$ribbonXml = [System.IO.File]::ReadAllText($xmlPath, [System.Text.Encoding]::UTF8)

$excel = $null
$excelOwn = $true
$buildError = $null
try {
    $found = Get-ExcelApp
    if ($null -eq $found) { throw "EXCEL_NOT_FOUND" }
    $excel = $found.App
    $excelOwn = $found.Own
    if ($excelOwn) {
        $excel.Visible = $false
        $excel.DisplayAlerts = $false
    }

    $asciiBas = Join-Path $env:TEMP "PdfStampModule_ascii.bas"
    ConvertTo-AsciiVba -SourcePath $basPath -TargetPath $asciiBas
    Write-Log "ASCII module written"

    $wb = $excel.Workbooks.Add()
    $vbp = $null
    try { $vbp = $wb.VBProject } catch { $vbp = $null }
    if ($null -eq $vbp) { throw "VBA_ACCESS_DENIED" }
    $vbp.VBComponents.Import($asciiBas) | Out-Null
    Write-Log "VBA module imported"
    Remove-Item $asciiBas -Force -ErrorAction SilentlyContinue
    $wb.IsAddin = $true

    # Build in TEMP: the file in XLSTART may be locked by a running Excel.
    if (Test-Path $buildXlam) { Remove-Item $buildXlam -Force -ErrorAction SilentlyContinue }
    $prevAlerts = $excel.DisplayAlerts
    $excel.DisplayAlerts = $false
    $wb.SaveAs($buildXlam, 55)   # 55 = xlOpenXMLAddIn (.xlam)
    $wb.Close($false)
    $excel.DisplayAlerts = $prevAlerts
    Write-Log "xlam built"
}
catch {
    $buildError = $_.Exception.Message
    Write-Log "Build failed: $($_ | Out-String)"
}
finally {
    Restore-BuildAccess
    if ($excel) {
        if ($excelOwn) { try { $excel.Quit() } catch {} }
        try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null } catch {}
        [System.GC]::Collect()
        [System.GC]::WaitForPendingFinalizers()
    }
}

if ($buildError) {
    if ($buildError -eq "EXCEL_NOT_FOUND") {
        Fail "Не найден Microsoft Excel (возможно, его подменяет WPS Office). Откройте Microsoft Excel, оставьте его запущенным и повторите установку."
    }
    if ($buildError -eq "VBA_ACCESS_DENIED" -or $buildError -match "VBProject|Programmatic|программн") {
        Fail "Excel не разрешил программе собрать надстройку. Откройте Excel: Файл -> Параметры -> Центр управления безопасностью -> Параметры центра управления безопасностью -> Параметры макросов -> включите «Доверять доступ к объектной модели проектов VBA», затем повторите установку. (Если параметр недоступен, его запретил администратор.)"
    }
    Fail $buildError
}

if (-not (Test-Path $buildXlam)) { Fail "Файл надстройки не был создан. Подробности: $logPath" }

try {
    Start-Sleep -Milliseconds 400
    Inject-RibbonX $buildXlam $ribbonXml
} catch {
    Fail "Не удалось встроить кнопки в ленту Excel: $($_.Exception.Message)"
}

if (-not (Copy-WithRetry $buildXlam $targetXlam)) {
    Fail "Не удалось записать надстройку в папку Excel: файл занят. Закройте Excel полностью и повторите установку."
}
Remove-Item $buildXlam -Force -ErrorAction SilentlyContinue
Remove-WithRetry $legacyAddinXlam | Out-Null
Write-Log "Deployed to XLSTART"

# make the ribbon appear right away if the user's Excel is open
Open-AddinInRunningExcel $targetXlam

Write-Log "Install OK"
Write-Host "Готово. На вкладке 'Главная' в Excel появится группа 'Подписи и печать'." -ForegroundColor Green
exit 0
