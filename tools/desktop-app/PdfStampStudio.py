#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
PDF Stamp Studio — Настольное приложение для Windows
Полноценный графический интерфейс (как на сайте) с локальным сервером,
поддержкой файлов Excel (.xlsx/.xls) и PDF, а также установкой кнопки в Microsoft Excel.
"""

import os
import sys
import atexit
import json
import base64
import socket
import shutil
import tempfile
import threading
import subprocess
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

def get_base_dir() -> str:
    """Определяет базовую папку (поддержка PyInstaller _MEIPASS)."""
    if hasattr(sys, '_MEIPASS'):
        return sys._MEIPASS
    return os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

def get_dist_dir() -> str:
    base = get_base_dir()
    d = os.path.join(base, 'dist')
    if os.path.isdir(d):
        return d
    return os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'dist'))

def get_free_port() -> int:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


def get_studio_dir() -> str:
    app_data = os.environ.get("APPDATA") or os.path.expanduser("~")
    return os.path.join(app_data, "PdfStampStudio")

def _ini_text(value) -> str:
    """Значение для INI: одна строка, без символов, ломающих формат."""
    return str(value if value is not None else "").replace("\r", " ").replace("\n", " ").strip()

def write_excel_profiles(payload: dict) -> str:
    """Сохраняет профили (как на вкладке «Профили») в формате, который читает Excel-надстройка."""
    studio_dir = get_studio_dir()
    assets_dir = os.path.join(studio_dir, "assets")
    os.makedirs(assets_dir, exist_ok=True)

    # Старые картинки удаляем: в папке остаются только текущие профили
    for name in os.listdir(assets_dir):
        if name.lower().endswith(".png"):
            try:
                os.remove(os.path.join(assets_dir, name))
            except OSError:
                pass

    def save_png(b64_str, file_name):
        if not b64_str:
            return ""
        if "," in b64_str:
            b64_str = b64_str.split(",", 1)[1]
        with open(os.path.join(assets_dir, file_name), "wb") as f:
            f.write(base64.b64decode(b64_str))
        return file_name

    signers = payload.get("signers", []) or []
    stamps = payload.get("stamps", []) or []

    lines = [
        "[General]",
        "AutoOpenPdf=1",
        "Suffix=",
        f"AppPath={_ini_text(sys.executable if getattr(sys, 'frozen', False) else '')}",
        f"SignerCount={len(signers)}",
        f"StampCount={len(stamps)}",
        "",
    ]
    for i, sg in enumerate(signers, 1):
        image = save_png(sg.get("imageBase64"), f"signer_{i}.png")
        lines += [
            f"[Signer{i}]",
            f"Id={_ini_text(sg.get('id'))}",
            f"Enabled={1 if sg.get('enabled', True) else 0}",
            f"FullName={_ini_text(sg.get('fullName'))}",
            "Names=" + "|".join(_ini_text(n).replace("|", " ") for n in sg.get("names", []) if _ini_text(n)),
            "Roles=" + "|".join(_ini_text(r).replace("|", " ") for r in sg.get("roles", []) if _ini_text(r)),
            f"ImageFile={image}",
            f"WidthPt={float(sg.get('widthPt', 110) or 110)}",
            "",
        ]
    for i, st in enumerate(stamps, 1):
        image = save_png(st.get("imageBase64"), f"stamp_{i}.png")
        lines += [
            f"[Stamp{i}]",
            f"Id={_ini_text(st.get('id'))}",
            f"Enabled={1 if st.get('enabled', True) else 0}",
            f"Label={_ini_text(st.get('label'))}",
            f"Owner={_ini_text(st.get('owner'))}",
            f"Relation={_ini_text(st.get('relation'))}",
            f"AnchorPosition={_ini_text(st.get('anchorPosition') or 'AUTO')}",
            f"WidthPt={float(st.get('widthPt', 112) or 112)}",
            f"OverlapRatio={float(st.get('overlapRatio', 0.3) or 0.3)}",
            f"Rotation={float(st.get('rotation', 0) or 0)}",
            f"ImageFile={image}",
            "",
        ]

    text = "\n".join(lines)
    ini_path = os.path.join(studio_dir, "config.ini")
    # UTF-8 copy (status checks, fallback) and UTF-16 copy (read by the Excel add-in without ADODB)
    for name, enc in (("config.ini", "utf-8"), ("config16.ini", "utf-16")):
        target = os.path.join(studio_dir, name)
        tmp_path = target + ".tmp"
        with open(tmp_path, "w", encoding=enc, newline="\r\n") as f:
            f.write(text)
        os.replace(tmp_path, target)
    return ini_path

OFFICE_CONVERT_PS1 = r"""
param([string]$InPath, [string]$OutPath, [string]$Kind)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# Office answers "busy" (RPC_E_CALL_REJECTED 0x80010001 / RETRYLATER 0x8001010A) while it starts up
# or while a dialog (licence, sign-in, first run) waits for a click. Short waits are retried.
function Test-Busy([string]$msg) {
    return ($msg -match '0x80010001|0x8001010A|RPC_E_CALL_REJECTED|RPC_E_SERVERCALL_RETRYLATER')
}

function Invoke-Retry([scriptblock]$Action, [int]$Tries, [int]$DelayMs) {
    for ($i = 1; $i -le $Tries; $i++) {
        try { return (& $Action) }
        catch {
            if ((Test-Busy $_.Exception.Message) -and $i -lt $Tries) { Start-Sleep -Milliseconds $DelayMs; continue }
            throw
        }
    }
}

# Real Word/Excel only (WPS Office can answer to the same ProgIDs).
function Test-Real($app, [string]$title, [string]$exePattern) {
    try {
        if ($null -eq $app) { return $false }
        if ($app.Name -ne $title) { return $false }
        $exe = [string]$app.FullName
        if ($exe -ne '') { return ($exe -match $exePattern) }
        return $true
    } catch { return $false }
}

function Get-OfficeApp([string]$progId, [string]$clsid, [string]$title, [string]$exePattern) {
    try {
        $type = [Type]::GetTypeFromCLSID([Guid]$clsid)
        $app = [Activator]::CreateInstance($type)
        if (Test-Real $app $title $exePattern) { return @{ App = $app; Own = $true } }
        try { $app.Quit() } catch {}
    } catch {}
    try {
        $app = New-Object -ComObject $progId
        if (Test-Real $app $title $exePattern) { return @{ App = $app; Own = $true } }
        try { $app.Quit() } catch {}
    } catch {}
    try {
        $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject($progId)
        if (Test-Real $app $title $exePattern) { return @{ App = $app; Own = $false } }
    } catch {}
    return $null
}

function Get-ProcIds([string]$procName) {
    return @(Get-Process -Name $procName -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
}

function Convert-Once([bool]$Visible, [int]$Tries, [int]$DelayMs) {
    $procName = 'EXCEL'
    if ($Kind -eq 'word') { $procName = 'WINWORD' }
    $before = Get-ProcIds $procName
    $app = $null
    $own = $true
    $ok = $false
    try {
        if ($Kind -eq 'word') {
            $found = Get-OfficeApp 'Word.Application' '000209FF-0000-0000-C000-000000000046' 'Microsoft Word' '(?i)\\winword\.exe$'
        } else {
            $found = Get-OfficeApp 'Excel.Application' '00024500-0000-0000-C000-000000000046' 'Microsoft Excel' '(?i)\\excel\.exe$'
        }
        if ($null -eq $found) { throw 'Microsoft Office не найден (возможно, его подменяет другая программа, например WPS Office).' }
        $app = $found.App
        # no new process = we got the user's own, already running Office: never hide or close it
        $own = $found.Own -and (@(Get-ProcIds $procName).Count -gt @($before).Count)

        if ($own) {
            Invoke-Retry { $app.Visible = $Visible } $Tries $DelayMs | Out-Null
            if ($Kind -eq 'word') { Invoke-Retry { $app.DisplayAlerts = 0 } $Tries $DelayMs | Out-Null }
            else { Invoke-Retry { $app.DisplayAlerts = $false } $Tries $DelayMs | Out-Null }
        }

        if ($Kind -eq 'word') {
            Invoke-Retry { $null = $app.Documents.Count } $Tries $DelayMs | Out-Null
            $doc = Invoke-Retry { $app.Documents.Open($InPath, $false, $true, $false) } $Tries $DelayMs
            Invoke-Retry { $doc.ExportAsFixedFormat($OutPath, 17) } $Tries $DelayMs | Out-Null
            Invoke-Retry { $doc.Close($false) } $Tries $DelayMs | Out-Null
        } else {
            $wb = Invoke-Retry { $app.Workbooks.Open($InPath, 0, $true) } $Tries $DelayMs
            Invoke-Retry { $wb.ExportAsFixedFormat(0, $OutPath) } $Tries $DelayMs | Out-Null
            Invoke-Retry { $wb.Close($false) } $Tries $DelayMs | Out-Null
        }
        $ok = $true
    } finally {
        if ($app -and $own) { try { $app.Quit() } catch {} }
        if ($app) { try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null } catch {} }
        if (-not $ok) {
            # remove the stuck Office process WE started (never one the user already had)
            Start-Sleep -Milliseconds 300
            foreach ($id in (Get-ProcIds $procName)) {
                if ($before -notcontains $id) { try { Stop-Process -Id $id -Force } catch {} }
            }
        }
    }
}

try {
    try {
        Convert-Once $false 12 700
    } catch {
        if (-not (Test-Busy $_.Exception.Message)) { throw }
        # Office is most likely waiting on a dialog that stays invisible in the hidden window
        # (licence, sign-in, first run). Start it VISIBLE so the user can click through it.
        Convert-Once $true 150 1000
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
"""

def get_work_root() -> str:
    """Рабочая папка без имени пользователя в пути: для кириллических имён %TEMP% превращается в 8.3
    (C:\\Users\\7CA9~1\\...), и Word/Excel такой путь не открывают."""
    candidates = []
    for env_name, parts in (("PROGRAMDATA", ("PdfStampStudio", "tmp")),
                            ("PUBLIC", ("Documents", "PdfStampStudio", "tmp"))):
        base = os.environ.get(env_name)
        if base:
            candidates.append(os.path.join(base, *parts))
    for c in candidates:
        try:
            os.makedirs(c, exist_ok=True)
            probe = os.path.join(c, ".write-test")
            with open(probe, "w") as f:
                f.write("x")
            os.remove(probe)
            if c.isascii() and "~" not in c:
                return c
        except OSError:
            continue
    return tempfile.gettempdir()

OFFICE_SERVER_PS1 = r"""
$ErrorActionPreference = 'Stop'
try { [Console]::InputEncoding = [System.Text.Encoding]::UTF8 } catch {}
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# Long-running helper: keeps ONE hidden Word and ONE hidden Excel alive, so only the first file pays the
# start-up cost (10-30 s). Protocol (one line each way):
#   CONVERT<TAB>kind<TAB>in<TAB>out   -> OK | ERR<TAB>message
#   WARM<TAB>kind                     -> OK | ERR<TAB>message
#   QUIT
function Test-Busy([string]$msg) {
    return ($msg -match '0x80010001|0x8001010A|RPC_E_CALL_REJECTED|RPC_E_SERVERCALL_RETRYLATER')
}

function Invoke-Retry([scriptblock]$Action, [int]$Tries, [int]$DelayMs) {
    for ($i = 1; $i -le $Tries; $i++) {
        try { return (& $Action) }
        catch {
            if ((Test-Busy $_.Exception.Message) -and $i -lt $Tries) { Start-Sleep -Milliseconds $DelayMs; continue }
            throw
        }
    }
}

function Test-Real($app, [string]$title, [string]$exePattern) {
    try {
        if ($null -eq $app) { return $false }
        if ($app.Name -ne $title) { return $false }
        $exe = [string]$app.FullName
        if ($exe -ne '') { return ($exe -match $exePattern) }
        return $true
    } catch { return $false }
}

function Get-OfficeApp([string]$progId, [string]$clsid, [string]$title, [string]$exePattern) {
    try {
        $type = [Type]::GetTypeFromCLSID([Guid]$clsid)
        $app = [Activator]::CreateInstance($type)
        if (Test-Real $app $title $exePattern) { return @{ App = $app; Own = $true } }
        try { $app.Quit() } catch {}
    } catch {}
    try {
        $app = New-Object -ComObject $progId
        if (Test-Real $app $title $exePattern) { return @{ App = $app; Own = $true } }
        try { $app.Quit() } catch {}
    } catch {}
    try {
        $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject($progId)
        if (Test-Real $app $title $exePattern) { return @{ App = $app; Own = $false } }
    } catch {}
    return $null
}

function Get-ProcIds([string]$procName) {
    return @(Get-Process -Name $procName -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
}

$script:apps = @{}

# --- default printer guard ---------------------------------------------------------------------
# Word/Excel ask the default printer for page metrics before exporting a PDF. When that printer is a
# network printer that is not reachable, Windows shows "Waiting for printer connection" and Office
# stalls for 1-3 minutes. While converting, a local virtual printer is made the default and the
# user's printer is restored right after (also after a crash, from printer_backup.txt).
$winKey = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Windows'
$devKey = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Devices'
$script:backupFile = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'printer_backup.txt'
$script:printerBackup = $null

function Get-DefaultPrinterInfo {
    try {
        $dev = (Get-ItemProperty -Path $winKey -Name Device -ErrorAction Stop).Device
        if (-not $dev) { return $null }
        $parts = $dev.Split(',')
        $port = ''
        if ($parts.Count -ge 3) { $port = $parts[2] }
        return @{ Name = $parts[0]; Port = $port }
    } catch { return $null }
}

function Test-PrinterRisky($info) {
    if ($null -eq $info) { return $false }
    return (($info.Name -like '\\*') -or ($info.Port -match '^(Ne\d+:|IP_|WSD|http)'))
}

function Find-SafePrinterName {
    try {
        $names = (Get-Item -Path $devKey -ErrorAction Stop).Property
        foreach ($n in @('Microsoft Print to PDF', 'Microsoft XPS Document Writer')) {
            if ($names -contains $n) { return $n }
        }
    } catch {}
    return $null
}

function Restore-Printer {
    $b = $script:printerBackup
    $script:printerBackup = $null
    if ($null -eq $b) { return }
    try { (New-Object -ComObject WScript.Network).SetDefaultPrinter($b.Name) } catch {}
    try {
        if ($null -ne $b.Mode -and "$($b.Mode)" -ne '') {
            Set-ItemProperty -Path $winKey -Name LegacyDefaultPrinterMode -Value ([int]$b.Mode) -Type DWord
        }
    } catch {}
    try { Remove-Item $script:backupFile -Force -ErrorAction SilentlyContinue } catch {}
}

function Enter-SafePrinter {
    if ($null -ne $script:printerBackup) { return }
    $info = Get-DefaultPrinterInfo
    if (-not (Test-PrinterRisky $info)) { return }
    $safe = Find-SafePrinterName
    if ($null -eq $safe) { return }
    $mode = $null
    try { $mode = (Get-ItemProperty -Path $winKey -Name LegacyDefaultPrinterMode -ErrorAction Stop).LegacyDefaultPrinterMode } catch {}
    $script:printerBackup = @{ Name = $info.Name; Mode = $mode }
    try { Set-Content -Path $script:backupFile -Value @($info.Name, "$mode") -Encoding UTF8 } catch {}
    try { (New-Object -ComObject WScript.Network).SetDefaultPrinter($safe) } catch { Restore-Printer }
}

# a previous helper may have died while the safe printer was active: put the user's printer back
function Restore-FromFile {
    try {
        if (-not (Test-Path $script:backupFile)) { return }
        $lines = @(Get-Content -Path $script:backupFile -Encoding UTF8)
        if ($lines.Count -ge 1 -and $lines[0]) {
            $mode = $null
            if ($lines.Count -ge 2 -and $lines[1]) { $mode = $lines[1] }
            $script:printerBackup = @{ Name = $lines[0]; Mode = $mode }
            Restore-Printer
        }
    } catch {}
}

function Close-App([string]$kind) {
    $entry = $script:apps[$kind]
    $script:apps.Remove($kind)
    if ($null -eq $entry) { return }
    if ($entry.Own) { try { $entry.App.Quit() } catch {} }
    try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($entry.App) | Out-Null } catch {}
    if ($entry.Own) {
        Start-Sleep -Milliseconds 300
        foreach ($id in (Get-ProcIds $entry.ProcName)) {
            if ($entry.Before -notcontains $id) { try { Stop-Process -Id $id -Force } catch {} }
        }
    }
}

function Get-App([string]$kind, [bool]$visible, [int]$tries, [int]$delayMs) {
    $entry = $script:apps[$kind]
    if ($entry) {
        $alive = $true
        try { $null = $entry.App.Name } catch { $alive = $false }
        if ($alive -and ($entry.Visible -eq $visible -or -not $entry.Own)) { return $entry }
        Close-App $kind
    }

    $procName = 'EXCEL'
    if ($kind -eq 'word') { $procName = 'WINWORD' }
    $before = Get-ProcIds $procName

    if ($kind -eq 'word') {
        $found = Get-OfficeApp 'Word.Application' '000209FF-0000-0000-C000-000000000046' 'Microsoft Word' '(?i)\\winword\.exe$'
    } else {
        $found = Get-OfficeApp 'Excel.Application' '00024500-0000-0000-C000-000000000046' 'Microsoft Excel' '(?i)\\excel\.exe$'
    }
    if ($null -eq $found) { throw 'Microsoft Office не найден (возможно, его подменяет другая программа, например WPS Office).' }

    $app = $found.App
    # no new process = this is the user's own, already running Office: never hide or close it
    $own = $found.Own -and (@(Get-ProcIds $procName).Count -gt @($before).Count)
    $entry = @{ App = $app; Own = $own; Visible = $visible; ProcName = $procName; Before = $before }
    $script:apps[$kind] = $entry

    try {
        if ($own) {
            Invoke-Retry { $app.Visible = $visible } $tries $delayMs | Out-Null
            if ($kind -eq 'word') { Invoke-Retry { $app.DisplayAlerts = 0 } $tries $delayMs | Out-Null }
            else { Invoke-Retry { $app.DisplayAlerts = $false } $tries $delayMs | Out-Null }
        }
        if ($kind -eq 'word') { Invoke-Retry { $null = $app.Documents.Count } $tries $delayMs | Out-Null }
        else { Invoke-Retry { $null = $app.Workbooks.Count } $tries $delayMs | Out-Null }
    } catch {
        Close-App $kind
        throw
    }
    return $entry
}

function Convert-With([string]$kind, [string]$inPath, [string]$outPath, [bool]$visible, [int]$tries, [int]$delayMs) {
    $entry = Get-App $kind $visible $tries $delayMs
    $app = $entry.App
    if ($kind -eq 'word') {
        $doc = Invoke-Retry { $app.Documents.Open($inPath, $false, $true, $false) } $tries $delayMs
        try {
            # print-quality PDF without bookmarks / structure tags / document properties (faster)
            try {
                Invoke-Retry { $doc.ExportAsFixedFormat($outPath, 17, $false, 0, 0, 1, 1, 0, $false, $false, 0, $false, $false, $false) } $tries $delayMs | Out-Null
            } catch {
                if (Test-Busy $_.Exception.Message) { throw }
                Invoke-Retry { $doc.ExportAsFixedFormat($outPath, 17) } $tries $delayMs | Out-Null
            }
        } finally {
            try { $doc.Close($false) } catch {}
        }
    } else {
        $wb = Invoke-Retry { $app.Workbooks.Open($inPath, 0, $true) } $tries $delayMs
        try {
            Invoke-Retry { $wb.ExportAsFixedFormat(0, $outPath) } $tries $delayMs | Out-Null
        } finally {
            try { $wb.Close($false) } catch {}
        }
    }
    # a visible start-up was only needed to let the user click through a dialog: hide it again
    if ($visible -and $entry.Own) {
        try { $app.Visible = $false; $entry.Visible = $false } catch {}
    }
}

function Convert-File([string]$kind, [string]$inPath, [string]$outPath) {
    Enter-SafePrinter
    try {
        try {
            Convert-With $kind $inPath $outPath $false 12 700
        } catch {
            if (-not (Test-Busy $_.Exception.Message)) { Close-App $kind; throw }
            # Office is most likely waiting on a dialog that is invisible in the hidden window
            # (licence, sign-in, first run). Restart it VISIBLE so the user can click through it.
            Close-App $kind
            try { Convert-With $kind $inPath $outPath $true 150 1000 }
            catch { Close-App $kind; throw }
        }
    } finally {
        Restore-Printer
    }
}

function Send([string]$text) {
    [Console]::Out.WriteLine($text)
    [Console]::Out.Flush()
}

Restore-FromFile

try {
    while ($true) {
        $line = [Console]::In.ReadLine()
        if ($null -eq $line) { break }
        $parts = $line.Split("`t")
        $cmd = $parts[0]
        if ($cmd -eq 'QUIT') { break }
        try {
            if ($cmd -eq 'WARM') {
                Enter-SafePrinter
                try { Get-App $parts[1] $false 12 700 | Out-Null }
                finally { Restore-Printer }
                Send 'OK'
            } elseif ($cmd -eq 'CONVERT') {
                Convert-File $parts[1] $parts[2] $parts[3]
                Send 'OK'
            } else {
                Send ("ERR`tunknown command")
            }
        } catch {
            $m = ($_.Exception.Message -replace "[\r\n\t]+", ' ')
            Send ("ERR`t" + $m)
        }
    }
} finally {
    Restore-Printer
    Close-App 'word'
    Close-App 'excel'
}
"""


class OfficeServer:
    """Keeps one PowerShell helper (with hidden Word/Excel inside) running between conversions."""

    IDLE_SECONDS = 600

    def __init__(self):
        self._proc = None
        self._lock = threading.Lock()
        self._idle = None
        self._script_path = None

    # -- process handling ---------------------------------------------------
    def _alive(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def _start(self) -> None:
        work = get_work_root()
        os.makedirs(work, exist_ok=True)
        self._script_path = os.path.join(work, 'office_server.ps1')
        with open(self._script_path, 'w', encoding='utf-8-sig') as f:
            f.write(OFFICE_SERVER_PS1)
        kwargs = {}
        if os.name == 'nt':
            kwargs['creationflags'] = 0x08000000  # CREATE_NO_WINDOW
        self._proc = subprocess.Popen(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", self._script_path],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            encoding='utf-8', errors='replace', bufsize=1, **kwargs
        )

    def _kill(self) -> None:
        proc, self._proc = self._proc, None
        if proc is not None:
            try:
                proc.kill()
            except Exception:
                pass

    def _arm_idle_timer(self) -> None:
        if self._idle is not None:
            self._idle.cancel()
        self._idle = threading.Timer(self.IDLE_SECONDS, self.shutdown)
        self._idle.daemon = True
        self._idle.start()

    def shutdown(self) -> None:
        """Asks the helper to close Word/Excel and exit."""
        with self._lock:
            if self._idle is not None:
                self._idle.cancel()
                self._idle = None
            if self._alive():
                try:
                    self._proc.stdin.write("QUIT\n")
                    self._proc.stdin.flush()
                    self._proc.wait(timeout=8)
                except Exception:
                    self._kill()
            self._proc = None

    # -- requests -----------------------------------------------------------
    def request(self, line: str, timeout: float):
        """Returns (ok, text). Raises OfficeServerError when the helper itself is not usable."""
        with self._lock:
            if self._idle is not None:
                self._idle.cancel()
            try:
                if not self._alive():
                    self._start()
                self._proc.stdin.write(line + "\n")
                self._proc.stdin.flush()
            except Exception as e:
                self._kill()
                raise OfficeServerError(str(e))

            result = {}

            def _read():
                try:
                    result['line'] = self._proc.stdout.readline()
                except Exception as e:  # pipe closed
                    result['error'] = str(e)

            reader = threading.Thread(target=_read, daemon=True)
            reader.start()
            reader.join(timeout)
            if reader.is_alive():
                self._kill()
                raise OfficeServerError("timeout")
            reply = (result.get('line') or '').rstrip("\r\n")
            if not reply:
                self._kill()
                raise OfficeServerError(result.get('error') or "helper stopped")
            self._arm_idle_timer()
            if reply == 'OK':
                return True, ''
            if reply.startswith("ERR\t"):
                return False, reply[4:]
            return False, reply


class OfficeServerError(Exception):
    pass


OFFICE = OfficeServer()
atexit.register(OFFICE.shutdown)


class QuietHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=get_dist_dir(), **kwargs)

    def log_message(self, format, *args):
        # Отключаем спам в консоль
        pass

    def end_headers(self):
        # Добавляем заголовки для правильной работы WASM и кэширования
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

def start_server(port: int) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(('127.0.0.1', port), QuietHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server

class DesktopApi:
    """JavaScript bridge API для взаимодействия с Windows и Microsoft Excel."""

    def _convert_one_shot(self, kind: str, in_path: str, out_path: str, work_dir: str) -> str:
        """Запасной путь: отдельный запуск PowerShell на каждый файл (медленнее). Возвращает текст ошибки."""
        script_path = os.path.join(work_dir, 'convert.ps1')
        with open(script_path, 'w', encoding='utf-8-sig') as f:
            f.write(OFFICE_CONVERT_PS1)
        kwargs = {}
        if os.name == 'nt':
            kwargs['creationflags'] = 0x08000000  # CREATE_NO_WINDOW
        try:
            res = subprocess.run(
                ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script_path,
                 "-InPath", in_path, "-OutPath", out_path, "-Kind", kind],
                capture_output=True, encoding='utf-8', errors='replace', check=False, timeout=240, **kwargs
            )
        except subprocess.TimeoutExpired:
            return "Office не ответил за 4 минуты. Закройте окна Word/Excel и повторите."
        return (res.stderr or res.stdout or '').strip()

    def convertOfficeToPdf(self, b64_data: str, file_name: str) -> str:
        """Превращает Word (.doc/.docx) или Excel (.xls/.xlsx/.xlsm) в PDF через установленный Microsoft Office."""
        ext = os.path.splitext(file_name)[1].lower()
        if ext in ('.doc', '.docx'):
            kind = 'word'
        elif ext in ('.xls', '.xlsx', '.xlsm'):
            kind = 'excel'
        else:
            raise RuntimeError(f"Неподдерживаемый тип файла: {ext or file_name}")
        app = 'Microsoft Word' if kind == 'word' else 'Microsoft Excel'

        work_dir = tempfile.mkdtemp(prefix='pss_', dir=get_work_root())
        try:
            in_path = os.path.join(work_dir, 'input' + ext)
            out_path = os.path.join(work_dir, 'output.pdf')
            with open(in_path, 'wb') as f:
                f.write(base64.b64decode(b64_data))

            detail = ''
            done = False
            # 1) fast path: a helper process that keeps Word/Excel running between files
            try:
                ok, text = OFFICE.request(f"CONVERT\t{kind}\t{in_path}\t{out_path}", timeout=330)
                done = ok
                detail = text
            except OfficeServerError as e:
                detail = f"helper: {e}"
                # 2) fallback: one PowerShell run per file
                detail = self._convert_one_shot(kind, in_path, out_path, work_dir) or detail

            if not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
                if '0x80010001' in detail or 'RPC_E_CALL_REJECTED' in detail:
                    detail = f"{app} занят. Закройте окна и диалоги Word/Excel и повторите. ({detail})"
                raise RuntimeError(f"Не удалось открыть файл в {app}. {detail}".strip())
            _ = done

            with open(out_path, 'rb') as f:
                return base64.b64encode(f.read()).decode('utf-8')
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)

    def prewarmOffice(self) -> bool:
        """Заранее запускает Word и Excel в фоне (скрыто), чтобы первый файл не ждал их запуска."""
        def _warm():
            for kind in ('word', 'excel'):
                try:
                    OFFICE.request(f"WARM\t{kind}", timeout=120)
                except Exception:
                    break
        threading.Thread(target=_warm, daemon=True).start()
        return True

    def convertExcelToPdf(self, b64_data: str, file_name: str) -> str:
        """Совместимость со старым именем."""
        return self.convertOfficeToPdf(b64_data, file_name)

    def saveFile(self, b64_data: str, file_name: str) -> dict:
        """Сохраняет файл через окно «Сохранить как» (в WebView2 кнопка «Скачать» сама не работает)."""
        try:
            import webview
            ext = os.path.splitext(file_name)[1].lower()
            if ext == '.pdf':
                types = ('PDF (*.pdf)',)
            elif ext == '.zip':
                types = ('ZIP (*.zip)',)
            else:
                types = ('Все файлы (*.*)',)

            downloads = os.path.join(os.path.expanduser('~'), 'Downloads')
            start_dir = downloads if os.path.isdir(downloads) else os.path.expanduser('~')

            dialog_type = webview.FileDialog.SAVE if hasattr(webview, 'FileDialog') else webview.SAVE_DIALOG
            result = webview.windows[0].create_file_dialog(
                dialog_type, directory=start_dir, save_filename=file_name, file_types=types
            )
            if not result:
                return {"success": False, "cancelled": True}
            path = result if isinstance(result, str) else result[0]
            if ext and not path.lower().endswith(ext):
                path += ext

            if "," in b64_data:
                b64_data = b64_data.split(",", 1)[1]
            with open(path, "wb") as f:
                f.write(base64.b64decode(b64_data))

            if os.name == 'nt':
                try:
                    subprocess.Popen(['explorer', '/select,', path])
                except Exception:
                    pass
            return {"success": True, "path": path}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def syncProfiles(self, payload: dict) -> dict:
        """Пишет подписи, печати и config.ini в %APPDATA%\\PdfStampStudio для кнопки в Excel."""
        try:
            return {"success": True, "path": write_excel_profiles(payload)}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def getExcelStatus(self) -> dict:
        """Состояние кнопки Excel: установлена ли надстройка и сколько профилей настроено."""
        try:
            studio_dir = get_studio_dir()
            ini_path = os.path.join(studio_dir, "config.ini")
            signers = stamps = 0
            if os.path.exists(ini_path):
                with open(ini_path, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.startswith("SignerCount="):
                            signers = int(line.split("=", 1)[1].strip() or 0)
                        elif line.startswith("StampCount="):
                            stamps = int(line.split("=", 1)[1].strip() or 0)
            app_data = os.environ.get("APPDATA") or os.path.expanduser("~")
            xlam = os.path.join(app_data, "Microsoft", "Excel", "XLSTART", "PdfStampStudio.xlam")
            return {
                "installed": os.path.exists(xlam),
                "signers": signers,
                "stamps": stamps,
                "configPath": ini_path,
            }
        except Exception:
            return {"installed": False, "signers": 0, "stamps": 0, "configPath": ""}

    def _run_install_script(self, extra_args=None) -> dict:
        base = get_base_dir()
        install_script = os.path.join(base, 'tools', 'excel-stamp-addin', 'install.ps1')
        if not os.path.exists(install_script):
            install_script = os.path.join(os.path.dirname(__file__), '..', 'excel-stamp-addin', 'install.ps1')

        cmd = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", install_script] + (extra_args or [])
        kwargs = {}
        if os.name == 'nt':
            kwargs['creationflags'] = 0x08000000  # CREATE_NO_WINDOW
        try:
            res = subprocess.run(
                cmd, capture_output=True, encoding='utf-8', errors='replace',
                check=False, timeout=300, **kwargs
            )
        except subprocess.TimeoutExpired:
            return {"success": False, "error": "Установка не завершилась за 5 минут. Закройте все окна Excel и повторите."}
        except Exception as e:
            return {"success": False, "error": f"Не удалось запустить установщик: {e}"}

        if res.returncode != 0:
            detail = (res.stderr or res.stdout or "").strip()
            log_path = os.path.join(get_studio_dir(), "install.log")
            return {"success": False, "error": (detail or "Ошибка установки.") + f"\n(Журнал: {log_path})"}
        return {"success": True, "output": res.stdout}

    def installExcelAddin(self) -> dict:
        """Собирает надстройку и ставит кнопки в Excel."""
        return self._run_install_script()

    def uninstallExcelAddin(self) -> dict:
        """Удаляет надстройку из Excel."""
        return self._run_install_script(["-Uninstall"])

    def isDesktop(self) -> bool:
        """Возвращает True если приложение запущено на рабочем столе Windows."""
        return True

def main():
    port = get_free_port()
    server = start_server(port)
    url = f"http://127.0.0.1:{port}/index.html?desktop=1"

    api = DesktopApi()

    try:
        import webview
        # Запуск в современном окне WebView2 (Edge Chromium)
        window = webview.create_window(
            title="PDF Stamp Studio — Подписи и печать",
            url=url,
            js_api=api,
            width=1280,
            height=850,
            min_size=(960, 640),
            background_color='#0f172a'
        )
        webview.start(debug=False)
    except Exception as e:
        # Fallback: открытие в системном браузере (Google Chrome, Edge)
        print(f"Запуск в окне браузера ({e})...")
        webbrowser.open(url)
        # Ожидание завершения процесса
        try:
            import time
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass

if __name__ == '__main__':
    main()
