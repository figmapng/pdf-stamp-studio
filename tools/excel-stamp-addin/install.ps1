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

# 2. Создание или проверка config.ini
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
    Write-Host "✓ Базовые настройки config.ini созданы." -ForegroundColor Green
}

# 3. Копирование демонстрационных PNG файлов
$assetDir = Join-Path $scriptDir "assets"
if (Test-Path $assetDir) {
    Get-ChildItem -Path $assetDir -Filter "*.png" | ForEach-Object {
        if ($_.Name -like "sig*") {
            Copy-Item $_.FullName -Destination $sigDir -Force
            Write-Host "✓ Подпись скопирована: $($_.Name)" -ForegroundColor Green
        } elseif ($_.Name -like "stamp*") {
            Copy-Item $_.FullName -Destination $stampDir -Force
            Write-Host "✓ Печать скопирована: $($_.Name)" -ForegroundColor Green
        }
    }
}

# 4. Регистрация Надежных расположений (Trusted Locations) в реестре Windows
# Это гарантирует, что Excel НИКОГДА не заблокирует макрос и не покажет предупреждений!
$officeVersions = @("16.0", "15.0", "14.0")
foreach ($ver in $officeVersions) {
    try {
        $locKey = "HKCU:\Software\Microsoft\Office\$ver\Excel\Security\Trusted Locations\PdfStampStudio"
        if (-not (Test-Path $locKey)) { New-Item -Path $locKey -Force | Out-Null }
        Set-ItemProperty -Path $locKey -Name "Path" -Value $xlstartDir -Force
        Set-ItemProperty -Path $locKey -Name "AllowSubFolders" -Value 1 -Type DWord -Force
        Set-ItemProperty -Path $locKey -Name "Description" -Value "PDF Stamp Studio Trusted Location" -Force

        # Разрешение программного доступа к модели VBA
        $secKey = "HKCU:\Software\Microsoft\Office\$ver\Excel\Security"
        if (Test-Path $secKey) {
            Set-ItemProperty -Path $secKey -Name "AccessVBOM" -Value 1 -Type DWord -Force
        }
    } catch {}
}

# 5. Компиляция .xlam через Excel и внедрение ленты RibbonX
Write-Host "Запуск Excel для компиляции надстройки..." -ForegroundColor Yellow

$ribbonXml = if (Test-Path $xmlPath) {
    Get-Content $xmlPath -Raw -Encoding UTF8
} else {
    @"
<customUI xmlns="http://schemas.microsoft.com/office/2009/07/customui">
  <ribbon>
    <tabs>
      <tab idMso="TabHome">
        <group id="PdfStampStudioGroup" label="PDF Stamp Studio">
          <button id="btnPdfStampStudio"
                  label="Создать PDF с подписями"
                  size="large"
                  imageMso="FileSaveAsPdfOrXps"
                  onAction="PdfStampRibbonCallback"
                  screentip="Создать PDF с подписями и печатью"
                  supertip="Автоматически находит строки Инженер-химик Затыбек А. А. и Заведующий лабораторией Сатыбалдина З. С., проставляет подписи и печать, и сохраняет единый PDF (Ctrl+Shift+P)"/>
        </group>
      </tab>
    </tabs>
  </ribbon>
</customUI>
"@
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
Write-Host "1) На вкладке 'Главная' в правой части панели появится кнопка:" -ForegroundColor White
Write-Host "   'Создать PDF с подписями'" -ForegroundColor Yellow
Write-Host "2) Либо используйте горячие клавиши: Ctrl + Shift + P" -ForegroundColor White
Write-Host ""
