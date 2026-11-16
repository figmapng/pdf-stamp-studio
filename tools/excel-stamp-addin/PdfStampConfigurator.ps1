# =========================================================================
# PDF Stamp Studio — Windows Native GUI Configurator (Zero Dependency)
# Ешқандай Python орнатуды қажет етпейді, кез келген Windows-та бірден ашылады!
# =========================================================================

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$appData = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData)
$studioDir = Join-Path $appData "PdfStampStudio"
$sigDir = Join-Path $studioDir "signatures"
$stampDir = Join-Path $studioDir "stamps"
$xlstartDir = Join-Path $appData "Microsoft\Excel\XLSTART"
$targetXlam = Join-Path $xlstartDir "PdfStampStudio.xlam"
$iniPath = Join-Path $studioDir "config.ini"

if (-not (Test-Path $studioDir)) { New-Item -ItemType Directory -Path $studioDir -Force | Out-Null }
if (-not (Test-Path $sigDir)) { New-Item -ItemType Directory -Path $sigDir -Force | Out-Null }
if (-not (Test-Path $stampDir)) { New-Item -ItemType Directory -Path $stampDir -Force | Out-Null }
if (-not (Test-Path $xlstartDir)) { New-Item -ItemType Directory -Path $xlstartDir -Force | Out-Null }

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$basPath = Join-Path $scriptDir "vba\PdfStampModule.bas"

# INI оқу функциясы
function Read-IniFile($path) {
    $ini = @{}
    if (Test-Path $path) {
        $section = ""
        Get-Content $path | ForEach-Object {
            $line = $_.Trim()
            if ($line.StartsWith("[") -and $line.EndsWith("]")) {
                $section = $line.Substring(1, $line.Length - 2)
                $ini[$section] = @{}
            } elseif ($line.Contains("=") -and $section -ne "") {
                $parts = $line.Split("=", 2)
                $ini[$section][$parts[0].Trim()] = $parts[1].Trim()
            }
        }
    }
    return $ini
}

$cfg = Read-IniFile $iniPath

# Негізгі терезе (Form)
$form = New-Object System.Windows.Forms.Form
$form.Text = "PDF Stamp Studio — Excel баптау бағдарламасы"
$form.Size = New-Object System.Drawing.Size(680, 760)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(248, 250, 252)
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)

# Header
$header = New-Object System.Windows.Forms.Panel
$header.Size = New-Object System.Drawing.Size(680, 65)
$header.Dock = "Top"
$header.BackColor = [System.Drawing.Color]::FromArgb(30, 41, 59)

$headerTitle = New-Object System.Windows.Forms.Label
$headerTitle.Text = "📑 PDF Stamp Studio — Баптау және Excel-ге орнату"
$headerTitle.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$headerTitle.ForeColor = [System.Drawing.Color]::White
$headerTitle.Location = New-Object System.Drawing.Point(20, 12)
$headerTitle.AutoSize = $true

$headerSub = New-Object System.Windows.Forms.Label
$headerSub.Text = "Excel хаттамалары үшін 1 кликпен қол мен мөр қоятын жүйе"
$headerSub.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$headerSub.ForeColor = [System.Drawing.Color]::FromArgb(148, 163, 184)
$headerSub.Location = New-Object System.Drawing.Point(22, 38)
$headerSub.AutoSize = $true

$header.Controls.Add($headerTitle)
$header.Controls.Add($headerSub)
$form.Controls.Add($header)

$currentY = 75

# Helper: GroupBox жасау
function Create-GroupBox($title, $y, $height) {
    $gb = New-Object System.Windows.Forms.GroupBox
    $gb.Text = " $title "
    $gb.Location = New-Object System.Drawing.Point(20, $y)
    $gb.Size = New-Object System.Drawing.Size(625, $height)
    $gb.ForeColor = [System.Drawing.Color]::FromArgb(15, 23, 42)
    $gb.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
    $form.Controls.Add($gb)
    return $gb
}

# --- GROUP 1: SIGNER 1 ---
$gb1 = Create-GroupBox "✍️ 1-қол қоюшы (Мысалы: Инженер-химик)" $currentY 160
$currentY += 170

$lbl1_1 = New-Object System.Windows.Forms.Label
$lbl1_1.Text = "Аты-жөні:"
$lbl1_1.Location = New-Object System.Drawing.Point(15, 25)
$lbl1_1.AutoSize = $true
$lbl1_1.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$txt1_Name = New-Object System.Windows.Forms.TextBox
$txt1_Name.Location = New-Object System.Drawing.Point(180, 22)
$txt1_Name.Size = New-Object System.Drawing.Size(425, 22)
$txt1_Name.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$txt1_Name.Text = if ($cfg["Signer1"]["FullName"]) { $cfg["Signer1"]["FullName"] } else { "Затыбек А. А." }
$gb1.Controls.Add($lbl1_1)
$gb1.Controls.Add($txt1_Name)

$lbl1_2 = New-Object System.Windows.Forms.Label
$lbl1_2.Text = "Іздейтін сөздер (үтірмен):"
$lbl1_2.Location = New-Object System.Drawing.Point(15, 55)
$lbl1_2.AutoSize = $true
$lbl1_2.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$txt1_Kw = New-Object System.Windows.Forms.TextBox
$txt1_Kw.Location = New-Object System.Drawing.Point(180, 52)
$txt1_Kw.Size = New-Object System.Drawing.Size(425, 22)
$txt1_Kw.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$txt1_Kw.Text = if ($cfg["Signer1"]["Keywords"]) { $cfg["Signer1"]["Keywords"] } else { "Затыбек,Инженер-химик" }
$gb1.Controls.Add($lbl1_2)
$gb1.Controls.Add($txt1_Kw)

$lbl1_3 = New-Object System.Windows.Forms.Label
$lbl1_3.Text = "Қолтаңба файлы (.png):"
$lbl1_3.Location = New-Object System.Drawing.Point(15, 85)
$lbl1_3.AutoSize = $true
$lbl1_3.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$txt1_File = New-Object System.Windows.Forms.TextBox
$txt1_File.Location = New-Object System.Drawing.Point(180, 82)
$txt1_File.Size = New-Object System.Drawing.Size(320, 22)
$txt1_File.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$txt1_File.Text = if ($cfg["Signer1"]["ImageFile"]) { $cfg["Signer1"]["ImageFile"] } else { "sig_zatybek.png" }

$btn1_Browse = New-Object System.Windows.Forms.Button
$btn1_Browse.Text = "Шолу..."
$btn1_Browse.Location = New-Object System.Drawing.Point(510, 80)
$btn1_Browse.Size = New-Object System.Drawing.Size(95, 25)
$btn1_Browse.Add_Click({
    $dlg = New-Object System.Windows.Forms.OpenFileDialog
    $dlg.Filter = "PNG суреттер (*.png)|*.png|Барлық файлдар (*.*)|*.*"
    if ($dlg.ShowDialog() -eq "OK") { $txt1_File.Text = $dlg.FileName }
})
$gb1.Controls.Add($lbl1_3)
$gb1.Controls.Add($txt1_File)
$gb1.Controls.Add($btn1_Browse)

$lbl1_Coords = New-Object System.Windows.Forms.Label
$lbl1_Coords.Text = "Ығысу X: +70  |  Ығысу Y: -12  |  Ені: 110  |  Биіктігі: 42"
$lbl1_Coords.ForeColor = [System.Drawing.Color]::Gray
$lbl1_Coords.Location = New-Object System.Drawing.Point(180, 115)
$lbl1_Coords.AutoSize = $true
$lbl1_Coords.Font = New-Object System.Drawing.Font("Segoe UI", 8)
$gb1.Controls.Add($lbl1_Coords)


# --- GROUP 2: SIGNER 2 ---
$gb2 = Create-GroupBox "✍️ 2-қол қоюшы (Мысалы: Зертхана меңгерушісі)" $currentY 160
$currentY += 170

$lbl2_1 = New-Object System.Windows.Forms.Label
$lbl2_1.Text = "Аты-жөні:"
$lbl2_1.Location = New-Object System.Drawing.Point(15, 25)
$lbl2_1.AutoSize = $true
$lbl2_1.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$txt2_Name = New-Object System.Windows.Forms.TextBox
$txt2_Name.Location = New-Object System.Drawing.Point(180, 22)
$txt2_Name.Size = New-Object System.Drawing.Size(425, 22)
$txt2_Name.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$txt2_Name.Text = if ($cfg["Signer2"]["FullName"]) { $cfg["Signer2"]["FullName"] } else { "Сатыбалдина З. С." }
$gb2.Controls.Add($lbl2_1)
$gb2.Controls.Add($txt2_Name)

$lbl2_2 = New-Object System.Windows.Forms.Label
$lbl2_2.Text = "Іздейтін сөздер (үтірмен):"
$lbl2_2.Location = New-Object System.Drawing.Point(15, 55)
$lbl2_2.AutoSize = $true
$lbl2_2.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$txt2_Kw = New-Object System.Windows.Forms.TextBox
$txt2_Kw.Location = New-Object System.Drawing.Point(180, 52)
$txt2_Kw.Size = New-Object System.Drawing.Size(425, 22)
$txt2_Kw.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$txt2_Kw.Text = if ($cfg["Signer2"]["Keywords"]) { $cfg["Signer2"]["Keywords"] } else { "Сатыбалдина,Заведующий лабораторией" }
$gb2.Controls.Add($lbl2_2)
$gb2.Controls.Add($txt2_Kw)

$lbl2_3 = New-Object System.Windows.Forms.Label
$lbl2_3.Text = "Қолтаңба файлы (.png):"
$lbl2_3.Location = New-Object System.Drawing.Point(15, 85)
$lbl2_3.AutoSize = $true
$lbl2_3.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$txt2_File = New-Object System.Windows.Forms.TextBox
$txt2_File.Location = New-Object System.Drawing.Point(180, 82)
$txt2_File.Size = New-Object System.Drawing.Size(320, 22)
$txt2_File.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$txt2_File.Text = if ($cfg["Signer2"]["ImageFile"]) { $cfg["Signer2"]["ImageFile"] } else { "sig_satybaldina.png" }

$btn2_Browse = New-Object System.Windows.Forms.Button
$btn2_Browse.Text = "Шолу..."
$btn2_Browse.Location = New-Object System.Drawing.Point(510, 80)
$btn2_Browse.Size = New-Object System.Drawing.Size(95, 25)
$btn2_Browse.Add_Click({
    $dlg = New-Object System.Windows.Forms.OpenFileDialog
    $dlg.Filter = "PNG суреттер (*.png)|*.png|Барлық файлдар (*.*)|*.*"
    if ($dlg.ShowDialog() -eq "OK") { $txt2_File.Text = $dlg.FileName }
})
$gb2.Controls.Add($lbl2_3)
$gb2.Controls.Add($txt2_File)
$gb2.Controls.Add($btn2_Browse)

$lbl2_Coords = New-Object System.Windows.Forms.Label
$lbl2_Coords.Text = "Ығысу X: +100  |  Ығысу Y: -12  |  Ені: 110  |  Биіктігі: 42"
$lbl2_Coords.ForeColor = [System.Drawing.Color]::Gray
$lbl2_Coords.Location = New-Object System.Drawing.Point(180, 115)
$lbl2_Coords.AutoSize = $true
$lbl2_Coords.Font = New-Object System.Drawing.Font("Segoe UI", 8)
$gb2.Controls.Add($lbl2_Coords)


# --- GROUP 3: STAMP ---
$gb3 = Create-GroupBox "🔵 Мекеме мөрі (Печать)" $currentY 125
$currentY += 135

$lbl3_1 = New-Object System.Windows.Forms.Label
$lbl3_1.Text = "Байланыстыратын адам/сөз:"
$lbl3_1.Location = New-Object System.Drawing.Point(15, 25)
$lbl3_1.AutoSize = $true
$lbl3_1.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$txt3_Anchor = New-Object System.Windows.Forms.TextBox
$txt3_Anchor.Location = New-Object System.Drawing.Point(180, 22)
$txt3_Anchor.Size = New-Object System.Drawing.Size(425, 22)
$txt3_Anchor.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$txt3_Anchor.Text = if ($cfg["Stamp"]["AnchorName"]) { $cfg["Stamp"]["AnchorName"] } else { "Сатыбалдина" }
$gb3.Controls.Add($lbl3_1)
$gb3.Controls.Add($txt3_Anchor)

$lbl3_2 = New-Object System.Windows.Forms.Label
$lbl3_2.Text = "Мөр файлы (.png):"
$lbl3_2.Location = New-Object System.Drawing.Point(15, 55)
$lbl3_2.AutoSize = $true
$lbl3_2.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$txt3_File = New-Object System.Windows.Forms.TextBox
$txt3_File.Location = New-Object System.Drawing.Point(180, 52)
$txt3_File.Size = New-Object System.Drawing.Size(320, 22)
$txt3_File.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$txt3_File.Text = if ($cfg["Stamp"]["ImageFile"]) { $cfg["Stamp"]["ImageFile"] } else { "stamp.png" }

$btn3_Browse = New-Object System.Windows.Forms.Button
$btn3_Browse.Text = "Шолу..."
$btn3_Browse.Location = New-Object System.Drawing.Point(510, 50)
$btn3_Browse.Size = New-Object System.Drawing.Size(95, 25)
$btn3_Browse.Add_Click({
    $dlg = New-Object System.Windows.Forms.OpenFileDialog
    $dlg.Filter = "PNG суреттер (*.png)|*.png|Барлық файлдар (*.*)|*.*"
    if ($dlg.ShowDialog() -eq "OK") { $txt3_File.Text = $dlg.FileName }
})
$gb3.Controls.Add($lbl3_2)
$gb3.Controls.Add($txt3_File)
$gb3.Controls.Add($btn3_Browse)

$lbl3_Coords = New-Object System.Windows.Forms.Label
$lbl3_Coords.Text = "Ығысу X: +40  |  Ығысу Y: -32  |  Өлшемі: 95 x 95"
$lbl3_Coords.ForeColor = [System.Drawing.Color]::Gray
$lbl3_Coords.Location = New-Object System.Drawing.Point(180, 85)
$lbl3_Coords.AutoSize = $true
$lbl3_Coords.Font = New-Object System.Drawing.Font("Segoe UI", 8)
$gb3.Controls.Add($lbl3_Coords)


# --- ACTION BUTTONS ---
$btnInstall = New-Object System.Windows.Forms.Button
$btnInstall.Text = "🚀 Сақтау және Excel-ге орнату"
$btnInstall.Location = New-Object System.Drawing.Point(20, $currentY + 15)
$btnInstall.Size = New-Object System.Drawing.Size(390, 45)
$btnInstall.BackColor = [System.Drawing.Color]::FromArgb(16, 185, 129)
$btnInstall.ForeColor = [System.Drawing.Color]::White
$btnInstall.Font = New-Object System.Drawing.Font("Segoe UI", 10.5, [System.Drawing.FontStyle]::Bold)
$btnInstall.FlatStyle = "Flat"
$btnInstall.FlatAppearance.BorderSize = 0
$btnInstall.Cursor = [System.Windows.Forms.Cursors]::Hand

$btnSaveOnly = New-Object System.Windows.Forms.Button
$btnSaveOnly.Text = "💾 Тек сақтау"
$btnSaveOnly.Location = New-Object System.Drawing.Point(420, $currentY + 15)
$btnSaveOnly.Size = New-Object System.Drawing.Size(120, 45)
$btnSaveOnly.BackColor = [System.Drawing.Color]::FromArgb(226, 232, 240)
$btnSaveOnly.ForeColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
$btnSaveOnly.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
$btnSaveOnly.FlatStyle = "Flat"
$btnSaveOnly.FlatAppearance.BorderSize = 0
$btnSaveOnly.Cursor = [System.Windows.Forms.Cursors]::Hand

$btnUninstall = New-Object System.Windows.Forms.Button
$btnUninstall.Text = "🗑️ Өшіру"
$btnUninstall.Location = New-Object System.Drawing.Point(550, $currentY + 15)
$btnUninstall.Size = New-Object System.Drawing.Size(95, 45)
$btnUninstall.BackColor = [System.Drawing.Color]::FromArgb(254, 226, 226)
$btnUninstall.ForeColor = [System.Drawing.Color]::FromArgb(185, 28, 28)
$btnUninstall.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$btnUninstall.FlatStyle = "Flat"
$btnUninstall.FlatAppearance.BorderSize = 0
$btnUninstall.Cursor = [System.Windows.Forms.Cursors]::Hand

$form.Controls.Add($btnInstall)
$form.Controls.Add($btnSaveOnly)
$form.Controls.Add($btnUninstall)

# Файлдарды көшіру және INI жазу функциясы
function Save-Settings() {
    $sig1_val = $txt1_File.Text.Trim()
    if ($sig1_val -and (Test-Path $sig1_val)) {
        Copy-Item $sig1_val (Join-Path $sigDir (Split-Path -Leaf $sig1_val)) -Force
        $sig1_name = Split-Path -Leaf $sig1_val
    } else {
        $sig1_name = "sig_zatybek.png"
    }

    $sig2_val = $txt2_File.Text.Trim()
    if ($sig2_val -and (Test-Path $sig2_val)) {
        Copy-Item $sig2_val (Join-Path $sigDir (Split-Path -Leaf $sig2_val)) -Force
        $sig2_name = Split-Path -Leaf $sig2_val
    } else {
        $sig2_name = "sig_satybaldina.png"
    }

    $stamp_val = $txt3_File.Text.Trim()
    if ($stamp_val -and (Test-Path $stamp_val)) {
        Copy-Item $stamp_val (Join-Path $stampDir (Split-Path -Leaf $stamp_val)) -Force
        $stamp_name = Split-Path -Leaf $stamp_val
    } else {
        $stamp_name = "stamp.png"
    }

    $iniContent = @"
[General]
AutoOpenPdf=1
Suffix=_бекітілген

[Signer1]
Enabled=1
FullName=$($txt1_Name.Text.Trim())
Keywords=$($txt1_Kw.Text.Trim())
ImageFile=$sig1_name
OffsetX=70
OffsetY=-12
Width=110
Height=42

[Signer2]
Enabled=1
FullName=$($txt2_Name.Text.Trim())
Keywords=$($txt2_Kw.Text.Trim())
ImageFile=$sig2_name
OffsetX=100
OffsetY=-12
Width=110
Height=42

[Stamp]
Enabled=1
AnchorName=$($txt3_Anchor.Text.Trim())
ImageFile=$stamp_name
OffsetX=40
OffsetY=-32
Width=95
Height=95
"@
    Set-Content -Path $iniPath -Value $iniContent -Encoding UTF8
}

$btnSaveOnly.Add_Click({
    Save-Settings
    [System.Windows.Forms.MessageBox]::Show("Баптаулар сәтті сақталды!`n`nЖол: $iniPath", "Сақталды", "OK", "Information")
})

$btnInstall.Add_Click({
    Save-Settings
    $ps1 = Join-Path $scriptDir "install.ps1"
    & powershell -NoProfile -ExecutionPolicy Bypass -File $ps1
    [System.Windows.Forms.MessageBox]::Show(
        "ҚҰТТЫҚТАЙМЫЗ!`n`nExcel Add-in сәтті орнатылды!`n`nЕнді кез келген Excel файлын ашып, 'PDF жасау және қол қою' батырмасын немесе Ctrl + Shift + P пернелерін басыңыз.",
        "Сәтті орнатылды!",
        "OK",
        "Information"
    )
})

$btnUninstall.Add_Click({
    $res = [System.Windows.Forms.MessageBox]::Show("Excel Add-in өшіргіңіз келе ме?", "Растау", "YesNo", "Question")
    if ($res -eq "Yes") {
        $ps1 = Join-Path $scriptDir "install.ps1"
        & powershell -NoProfile -ExecutionPolicy Bypass -File $ps1 -Uninstall
        [System.Windows.Forms.MessageBox]::Show("Excel Add-in сәтті өшірілді.", "Өшірілді", "OK", "Information")
    }
})

[void]$form.ShowDialog()
