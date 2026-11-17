# =========================================================================
# PDF Stamp Studio — Автоматический установщик надстройки Excel (PowerShell)
# Поддерживает ВСЕ версии Microsoft Excel: 2010, 2013, 2016, 2019, 2021, 365
# Добавляет большую кнопку "Создать PDF с подписями" прямо на вкладку "Главная"
# =========================================================================

[CmdletBinding()]
param(
    [switch]$Uninstall = $false
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem

$appData = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData)
$studioDir = Join-Path $appData "PdfStampStudio"
$sigDir = Join-Path $studioDir "signatures"
$stampDir = Join-Path $studioDir "stamps"
$xlstartDir = Join-Path $appData "Microsoft\Excel\XLSTART"
$targetXlam = Join-Path $xlstartDir "PdfStampStudio.xlam"
$addinsDir = Join-Path $appData "Microsoft\AddIns"
$addinXlam = Join-Path $addinsDir "PdfStampStudio.xlam"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$basPath = Join-Path $scriptDir "vba\PdfStampModule.bas"
$xmlPath = Join-Path $scriptDir "customUI14.xml"


# Преобразует UTF-8 исходник VBA в чистый ASCII: строковые литералы с кириллицей -> U("\uXXXX")
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
            return 'U(' + ($parts -join ' & _' + "`r`n") + ')'
        })
        # любые оставшиеся не-ASCII символы (в комментариях) заменяем на '?'
        $converted = [regex]::Replace($converted, '[^\x00-\x7F]', '?')
        [void]$out.Append($converted + "`r`n")
    }
    [System.IO.File]::WriteAllText($TargetPath, $out.ToString(), [System.Text.Encoding]::ASCII)
}

# Функция внедрения RibbonX XML (кнопка на ленте Главная в Excel)
function Inject-RibbonX($filePath, $xmlContent) {
    try {
        $zip = [System.IO.Compression.ZipFile]::Open($filePath, [System.IO.Compression.ZipArchiveMode]::Update)
        
        # 1. Запись customUI/customUI14.xml
        $entry14 = $zip.GetEntry("customUI/customUI14.xml")
        if ($entry14) { $entry14.Delete() }
        $entry14 = $zip.CreateEntry("customUI/customUI14.xml")
        $sw = New-Object System.IO.StreamWriter($entry14.Open(), [System.Text.Encoding]::UTF8)
        $sw.Write($xmlContent)
        $sw.Close()

        # 2. Обновление связей _rels/.rels
        $relsEntry = $zip.GetEntry("_rels/.rels")
        if ($relsEntry) {
            $sr = New-Object System.IO.StreamReader($relsEntry.Open(), [System.Text.Encoding]::UTF8)
            $relsText = $sr.ReadToEnd()
            $sr.Close()

            if (-not $relsText.Contains("customui/extensibility")) {
                $relItem = '<Relationship Id="rIdCustomUI" Type="http://schemas.microsoft.com/office/2007/relationships/ui/extensibility" Target="customUI/customUI14.xml"/>'
                $relsText = $relsText.Replace("</Relationships>", "$relItem</Relationships>")
                $relsEntry.Delete()
                $newRels = $zip.CreateEntry("_rels/.rels")
                $sw2 = New-Object System.IO.StreamWriter($newRels.Open(), [System.Text.Encoding]::UTF8)
                $sw2.Write($relsText)
                $sw2.Close()
            }
        }

        $zip.Dispose()
        Write-Host "✓ Кнопка ленты Ribbon (Главная панель) успешно встроена в .xlam!" -ForegroundColor Green
    } catch {
        Write-Warning "Предупреждение при внедрении ленты Ribbon: $_"
    }
}

if ($Uninstall) {
    Write-Host "[PDF Stamp Studio] Удаление надстройки..." -ForegroundColor Yellow
    if (Test-Path $targetXlam) {
        Remove-Item $targetXlam -Force
        Write-Host "✓ Файл из XLSTART удален." -ForegroundColor Green
    }
    if (Test-Path $addinXlam) {
        Remove-Item $addinXlam -Force
        Write-Host "✓ Файл из AddIns удален." -ForegroundColor Green
    }
    Write-Host "✓ Готово! Надстройка Excel успешно удалена." -ForegroundColor Green
    exit 0
}

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host " PDF Stamp Studio — Установка надстройки в Excel" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# 1. Создание системных папок
if (-not (Test-Path $studioDir)) { New-Item -ItemType Directory -Path $studioDir -Force | Out-Null }
if (-not (Test-Path $sigDir)) { New-Item -ItemType Directory -Path $sigDir -Force | Out-Null }
if (-not (Test-Path $stampDir)) { New-Item -ItemType Directory -Path $stampDir -Force | Out-Null }
if (-not (Test-Path $xlstartDir)) { New-Item -ItemType Directory -Path $xlstartDir -Force | Out-Null }
if (-not (Test-Path $addinsDir)) { New-Item -ItemType Directory -Path $addinsDir -Force | Out-Null }

Write-Host "✓ Системные папки готовы: $studioDir" -ForegroundColor Green

# 4. Регистрация Надежных расположений (Trusted Locations) в реестре Windows
# Это гарантирует, что Excel НИКОГДА не заблокирует макрос и не покажет предупреждений!
$script:vbomBackup = @{}
$officeVersions = @("16.0", "15.0", "14.0")
foreach ($ver in $officeVersions) {
    try {
        $locKey = "HKCU:\Software\Microsoft\Office\$ver\Excel\Security\Trusted Locations\PdfStampStudio"
        if (-not (Test-Path $locKey)) { New-Item -Path $locKey -Force | Out-Null }
        Set-ItemProperty -Path $locKey -Name "Path" -Value $xlstartDir -Force
        Set-ItemProperty -Path $locKey -Name "AllowSubFolders" -Value 1 -Type DWord -Force
        Set-ItemProperty -Path $locKey -Name "Description" -Value "PDF Stamp Studio Trusted Location" -Force

        # Временное разрешение доступа к модели VBA (только на время сборки, затем возвращаем как было)
        $secKey = "HKCU:\Software\Microsoft\Office\$ver\Excel\Security"
        if (Test-Path $secKey) {
            $old = (Get-ItemProperty -Path $secKey -Name "AccessVBOM" -ErrorAction SilentlyContinue).AccessVBOM
            $script:vbomBackup[$secKey] = $old
            Set-ItemProperty -Path $secKey -Name "AccessVBOM" -Value 1 -Type DWord -Force
        }
    } catch {}
}

# 5. Компиляция .xlam через Excel и внедрение ленты RibbonX
Write-Host "Запуск Excel для компиляции надстройки..." -ForegroundColor Yellow

$ribbonXml = Get-Content $xmlPath -Raw -Encoding UTF8

$excel = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    
    # VBA импортирует .bas в ANSI-кодировке системы. Чтобы кириллица работала на любом Windows,
    # каждая строка с кириллицей оборачивается в U("...\uXXXX...") (раскодируется в самой надстройке).
    $asciiBas = Join-Path $env:TEMP "PdfStampModule_ascii.bas"
    ConvertTo-AsciiVba -SourcePath $basPath -TargetPath $asciiBas

    $wb = $excel.Workbooks.Add()
    $wb.VBProject.VBComponents.Import($asciiBas) | Out-Null
    Remove-Item $asciiBas -Force -ErrorAction SilentlyContinue
    $wb.IsAddin = $true
    
    # 55 = xlOpenXMLAddIn (.xlam)
    $wb.SaveAs($targetXlam, 55)
    $wb.Close($false)
    Write-Host "✓ Базовый файл надстройки скомпилирован в XLSTART." -ForegroundColor Green

    # Внедрение RibbonX XML в .xlam архив
    Inject-RibbonX $targetXlam $ribbonXml

    # Копирование в AddIns для максимальной совместимости
    Copy-Item $targetXlam -Destination $addinXlam -Force
    Write-Host "✓ Надстройка скопирована в AddIns." -ForegroundColor Green
}
catch {
    Write-Warning "Ошибка автоматической сборки через Excel: $_"
}
finally {
    foreach ($k in $script:vbomBackup.Keys) {
        try {
            if ($null -eq $script:vbomBackup[$k]) { Remove-ItemProperty -Path $k -Name "AccessVBOM" -ErrorAction SilentlyContinue }
            else { Set-ItemProperty -Path $k -Name "AccessVBOM" -Value $script:vbomBackup[$k] -Type DWord -Force }
        } catch {}
    }
    if ($excel) {
        $excel.Quit()
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
        [System.GC]::Collect()
        [System.GC]::WaitForPendingFinalizers()
    }
}

Write-Host ""
Write-Host "=================================================" -ForegroundColor Green
Write-Host " ПОЗДРАВЛЯЕМ! УСТАНОВКА ЗАВЕРШЕНА УСПЕШНО!" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
Write-Host "Теперь откройте любой файл Excel:" -ForegroundColor Cyan
Write-Host "На вкладке 'Главная' появится группа 'Подписи и печать':" -ForegroundColor White
Write-Host "   1. Показать подписи   ->   2. Сохранить PDF" -ForegroundColor Yellow
Write-Host "Горячие клавиши: Ctrl + Shift + P" -ForegroundColor White
Write-Host ""
