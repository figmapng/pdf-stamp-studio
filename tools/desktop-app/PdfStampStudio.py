#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
PDF Stamp Studio — Настольное приложение для Windows
Полноценный графический интерфейс (как на сайте) с локальным сервером,
поддержкой файлов Excel (.xlsx/.xls) и PDF, а также установкой кнопки в Microsoft Excel.
"""

import os
import sys
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
            "Enabled=1",
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
$app = $null
try {
    if ($Kind -eq 'word') {
        $app = New-Object -ComObject Word.Application
        $app.Visible = $false
        $app.DisplayAlerts = 0
        $app.AutomationSecurity = 3
        $doc = $app.Documents.Open($InPath, $false, $true, $false)
        $doc.ExportAsFixedFormat($OutPath, 17)
        $doc.Close($false)
    } else {
        $app = New-Object -ComObject Excel.Application
        $app.Visible = $false
        $app.DisplayAlerts = $false
        $app.AutomationSecurity = 3
        $wb = $app.Workbooks.Open($InPath, 0, $true)
        $wb.ExportAsFixedFormat(0, $OutPath)
        $wb.Close($false)
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
} finally {
    if ($app) {
        try { $app.Quit() } catch {}
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null
    }
}
"""

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

    def convertOfficeToPdf(self, b64_data: str, file_name: str) -> str:
        """Превращает Word (.doc/.docx) или Excel (.xls/.xlsx/.xlsm) в PDF через установленный Microsoft Office."""
        ext = os.path.splitext(file_name)[1].lower()
        if ext in ('.doc', '.docx'):
            kind = 'word'
        elif ext in ('.xls', '.xlsx', '.xlsm'):
            kind = 'excel'
        else:
            raise RuntimeError(f"Неподдерживаемый тип файла: {ext or file_name}")

        work_dir = tempfile.mkdtemp(prefix='pss_')
        try:
            in_path = os.path.join(work_dir, 'input' + ext)
            out_path = os.path.join(work_dir, 'output.pdf')
            script_path = os.path.join(work_dir, 'convert.ps1')
            with open(in_path, 'wb') as f:
                f.write(base64.b64decode(b64_data))
            with open(script_path, 'w', encoding='utf-8-sig') as f:
                f.write(OFFICE_CONVERT_PS1)

            kwargs = {}
            if os.name == 'nt':
                kwargs['creationflags'] = 0x08000000  # CREATE_NO_WINDOW
            try:
                res = subprocess.run(
                    ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script_path,
                     "-InPath", in_path, "-OutPath", out_path, "-Kind", kind],
                    capture_output=True, text=True, check=False, timeout=240, **kwargs
                )
            except subprocess.TimeoutExpired:
                raise RuntimeError("Office не ответил за 4 минуты. Закройте окна Word/Excel и повторите.")

            if not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
                app = 'Microsoft Word' if kind == 'word' else 'Microsoft Excel'
                detail = (res.stderr or res.stdout or '').strip()
                raise RuntimeError(f"Не удалось открыть файл в {app}. {detail}".strip())

            with open(out_path, 'rb') as f:
                return base64.b64encode(f.read()).decode('utf-8')
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)

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
