# =========================================================================
# PDF Stamp Studio — Автоматический установщик надстройки Excel (PowerShell)
# =========================================================================

[CmdletBinding()]
param(
    [switch]$Uninstall = $false
)

$ErrorActionPreference = "Stop"

$appData = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData)
$studioDir = Join-Path $appData "PdfStampStudio"
$sigDir = Join-Path $studioDir "signatures"
$stampDir = Join-Path $studioDir "stamps"
$xlstartDir = Join-Path $appData "Microsoft\Excel\XLSTART"
$targetXlam = Join-Path $xlstartDir "PdfStampStudio.xlam"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$basPath = Join-Path $scriptDir "vba\PdfStampModule.bas"

if ($Uninstall) {
    Write-Host "[PDF Stamp Studio] Удаление надстройки..." -ForegroundColor Yellow
    if (Test-Path $targetXlam) {
        Remove-Item $targetXlam -Force
        Write-Host "✓ Файл PdfStampStudio.xlam удален из папки XLSTART." -ForegroundColor Green
    }
    Write-Host "✓ Готово! Excel теперь запускается в стандартном режиме." -ForegroundColor Green
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

Write-Host "✓ Системные папки готовы: $studioDir" -ForegroundColor Green

# 2. Создание или проверка шаблона config.ini
$iniPath = Join-Path $studioDir "config.ini"
if (-not (Test-Path $iniPath)) {
    $defaultIni = @"
[General]
AutoOpenPdf=1
Suffix=_утвержденный

[Signer1]
Enabled=1
FullName=Затыбек А. А.
Keywords=Затыбек,Инженер-химик
ImageFile=sig_zatybek.png
OffsetX=70
OffsetY=-12
Width=110
Height=42

[Signer2]
Enabled=1
FullName=Сатыбалдина З. С.
Keywords=Сатыбалдина,Заведующий лабораторией
ImageFile=sig_satybaldina.png
OffsetX=100
OffsetY=-12
Width=110
Height=42

[Stamp]
Enabled=1
AnchorName=Сатыбалдина
ImageFile=stamp.png
OffsetX=40
OffsetY=-32
Width=95
Height=95
"@
    Set-Content -Path $iniPath -Value $defaultIni -Encoding UTF8
    Write-Host "✓ Создан базовый файл config.ini." -ForegroundColor Green
}

# 3. Копирование демонстрационных PNG файлов
$assetDir = Join-Path $scriptDir "assets"
if (Test-Path $assetDir) {
    Get-ChildItem -Path $assetDir -Filter "*.png" | ForEach-Object {
        if ($_.Name -like "sig*") {
            Copy-Item $_.FullName -Destination $sigDir -Force
            Write-Host "✓ Файл подписи скопирован: $($_.Name)" -ForegroundColor Green
        } elseif ($_.Name -like "stamp*") {
            Copy-Item $_.FullName -Destination $stampDir -Force
            Write-Host "✓ Файл печати скопирован: $($_.Name)" -ForegroundColor Green
        }
    }
}

# 4. Компиляция надстройки .xlam через Excel и размещение в XLSTART
Write-Host "Запуск Excel для регистрации надстройки (в фоновом режиме)..." -ForegroundColor Yellow

$regPaths = @(
    "HKCU:\Software\Microsoft\Office\16.0\Excel\Security",
    "HKCU:\Software\Microsoft\Office\15.0\Excel\Security",
    "HKCU:\Software\Microsoft\Office\14.0\Excel\Security"
)

$prevRegValues = @{}
foreach ($rp in $regPaths) {
    if (Test-Path $rp) {
        $val = (Get-ItemProperty -Path $rp -Name "AccessVBOM" -ErrorAction SilentlyContinue).AccessVBOM
        $prevRegValues[$rp] = $val
        Set-ItemProperty -Path $rp -Name "AccessVBOM" -Value 1 -Type DWord -Force
    }
}

$excel = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    
    $wb = $excel.Workbooks.Add()
    $wb.VBProject.VBComponents.Import($basPath) | Out-Null
    $wb.IsAddin = $true
    
    # 55 = xlOpenXMLAddIn (.xlam)
    $wb.SaveAs($targetXlam, 55)
    $wb.Close($false)
    Write-Host "✓ Надстройка PdfStampStudio.xlam успешно создана и помещена в XLSTART!" -ForegroundColor Green
}
catch {
    Write-Warning "Ошибка при автоматической сборке через Excel: $_"
    Write-Host "Используется резервный режим установки..." -ForegroundColor Yellow
}
finally {
    if ($excel) {
        $excel.Quit()
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
        [System.GC]::Collect()
        [System.GC]::WaitForPendingFinalizers()
    }
    
    # Восстановление настроек реестра
    foreach ($rp in $regPaths) {
        if ($prevRegValues.ContainsKey($rp)) {
            $orig = $prevRegValues[$rp]
            if ($null -ne $orig) {
                Set-ItemProperty -Path $rp -Name "AccessVBOM" -Value $orig -Type DWord -Force
            }
        }
    }
}

Write-Host ""
Write-Host "=================================================" -ForegroundColor Green
Write-Host " ПОЗДРАВЛЯЕМ! УСТАНОВКА ЗАВЕРШЕНА УСПЕШНО!" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
Write-Host "Теперь откройте любой файл Excel:" -ForegroundColor Cyan
Write-Host "1) В верхней панели появится кнопка 'Создать PDF с подписями';" -ForegroundColor White
Write-Host "2) Либо нажмите сочетание клавиш Ctrl + Shift + P." -ForegroundColor White
Write-Host ""
