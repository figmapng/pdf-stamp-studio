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

    ini_path = os.path.join(studio_dir, "config.ini")
    tmp_path = ini_path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8", newline="\r\n") as f:
        f.write("\n".join(lines))
    os.replace(tmp_path, ini_path)
    return ini_path

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

    def convertExcelToPdf(self, b64_data: str, file_name: str) -> str:
        """Конвертирует файл Excel (.xlsx/.xls) в PDF через установленный Microsoft Excel."""
        try:
            raw_bytes = base64.b64decode(b64_data)
            with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as tmp_in:
                tmp_in.write(raw_bytes)
                tmp_in_path = tmp_in.name

            tmp_out_path = tmp_in_path.replace('.xlsx', '.pdf')

            # PowerShell скрипт автоматизации Excel COM
            ps_script = f"""
            $excel = New-Object -ComObject Excel.Application
            $excel.Visible = $false
            $excel.DisplayAlerts = $false
            try {{
                $wb = $excel.Workbooks.Open('{tmp_in_path}')
                $wb.ExportAsFixedFormat(0, '{tmp_out_path}', 0, $true, $false)
                $wb.Close($false)
            }} finally {{
                $excel.Quit()
                [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
            }}
            """

            res = subprocess.run(
                ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_script],
                capture_output=True,
                text=True,
                check=False
            )

            if not os.path.exists(tmp_out_path) or os.path.getsize(tmp_out_path) == 0:
                err_msg = res.stderr or res.stdout or "Не удалось запустить Microsoft Excel для экспорта."
                raise RuntimeError(err_msg)

            with open(tmp_out_path, 'rb') as f:
                pdf_bytes = f.read()

            try:
                os.remove(tmp_in_path)
                os.remove(tmp_out_path)
            except Exception:
                pass

            return base64.b64encode(pdf_bytes).decode('utf-8')

        except Exception as e:
            raise RuntimeError(f"Ошибка конвертации Excel: {e}")

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

    def installExcelAddin(self) -> dict:
        """Запускает установщик надстройки в Excel."""
        base = get_base_dir()
        install_script = os.path.join(base, 'tools', 'excel-stamp-addin', 'install.ps1')
        if not os.path.exists(install_script):
            install_script = os.path.join(os.path.dirname(__file__), '..', 'excel-stamp-addin', 'install.ps1')

        cmd = [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", install_script
        ]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, check=True)
            return {"success": True, "output": res.stdout}
        except subprocess.CalledProcessError as e:
            return {"success": False, "error": e.stderr or e.stdout}

    def uninstallExcelAddin(self) -> dict:
        """Удаляет надстройку из Excel."""
        base = get_base_dir()
        install_script = os.path.join(base, 'tools', 'excel-stamp-addin', 'install.ps1')
        if not os.path.exists(install_script):
            install_script = os.path.join(os.path.dirname(__file__), '..', 'excel-stamp-addin', 'install.ps1')

        cmd = [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", install_script,
            "-Uninstall"
        ]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, check=True)
            return {"success": True, "output": res.stdout}
        except subprocess.CalledProcessError as e:
            return {"success": False, "error": e.stderr or e.stdout}

    def isDesktop(self) -> bool:
        """Возвращает True если приложение запущено на рабочем столе Windows."""
        return True

def main():
    port = get_free_port()
    server = start_server(port)
    url = f"http://127.0.0.1:{port}/index.html"

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
