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

    def saveExcelConfig(self, cfg: dict) -> dict:
        """Сохраняет config.ini и изображения подписей/печатей в %APPDATA%\\PdfStampStudio\\."""
        try:
            app_data = os.environ.get("APPDATA") or os.path.expanduser("~")
            studio_dir = os.path.join(app_data, "PdfStampStudio")
            sig_dir = os.path.join(studio_dir, "signatures")
            stamp_dir = os.path.join(studio_dir, "stamps")
            os.makedirs(sig_dir, exist_ok=True)
            os.makedirs(stamp_dir, exist_ok=True)

            def save_b64(b64_str, target_path):
                if b64_str and ',' in b64_str:
                    b64_str = b64_str.split(',', 1)[1]
                if b64_str:
                    with open(target_path, 'wb') as f:
                        f.write(base64.b64decode(b64_str))

            sig1 = cfg.get('signer1', {})
            if sig1.get('imageBase64'):
                save_b64(sig1['imageBase64'], os.path.join(sig_dir, sig1.get('imageFile', 'sig_zatybek.png')))

            sig2 = cfg.get('signer2', {})
            if sig2.get('imageBase64'):
                save_b64(sig2['imageBase64'], os.path.join(sig_dir, sig2.get('imageFile', 'sig_satybaldina.png')))

            stamp = cfg.get('stamp', {})
            if stamp.get('imageBase64'):
                save_b64(stamp['imageBase64'], os.path.join(stamp_dir, stamp.get('imageFile', 'stamp.png')))

            ini_path = os.path.join(studio_dir, "config.ini")
            gen = cfg.get('general', {})
            ini_lines = [
                "[General]",
                f"AutoOpenPdf={1 if gen.get('autoOpenPdf', True) else 0}",
                f"Suffix={gen.get('suffix', '_утвержденный')}",
                "",
                "[Signer1]",
                f"Enabled={1 if sig1.get('enabled', True) else 0}",
                f"FullName={sig1.get('fullName', 'Затыбек А. А.')}",
                f"Keywords={sig1.get('keywords', 'Затыбек,Инженер-химик')}",
                f"ImageFile={sig1.get('imageFile', 'sig_zatybek.png')}",
                f"OffsetX={sig1.get('offsetX', 70)}",
                f"OffsetY={sig1.get('offsetY', -12)}",
                f"Width={sig1.get('width', 110)}",
                f"Height={sig1.get('height', 42)}",
                "",
                "[Signer2]",
                f"Enabled={1 if sig2.get('enabled', True) else 0}",
                f"FullName={sig2.get('fullName', 'Сатыбалдина З. С.')}",
                f"Keywords={sig2.get('keywords', 'Сатыбалдина,Заведующий лабораторией')}",
                f"ImageFile={sig2.get('imageFile', 'sig_satybaldina.png')}",
                f"OffsetX={sig2.get('offsetX', 100)}",
                f"OffsetY={sig2.get('offsetY', -12)}",
                f"Width={sig2.get('width', 110)}",
                f"Height={sig2.get('height', 42)}",
                "",
                "[Stamp]",
                f"Enabled={1 if stamp.get('enabled', True) else 0}",
                f"AnchorName={stamp.get('anchorName', 'Сатыбалдина')}",
                f"ImageFile={stamp.get('imageFile', 'stamp.png')}",
                f"OffsetX={stamp.get('offsetX', 40)}",
                f"OffsetY={stamp.get('offsetY', -32)}",
                f"Width={stamp.get('size', 95)}",
                f"Height={stamp.get('size', 95)}",
                ""
            ]
            with open(ini_path, 'w', encoding='utf-8') as f:
                f.write("\n".join(ini_lines))

            return {"success": True, "path": ini_path}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def saveAndInstallExcelAddin(self, cfg: dict) -> dict:
        """Сохраняет настройки и запускает установку надстройки в Excel."""
        save_res = self.saveExcelConfig(cfg)
        if not save_res.get("success"):
            return save_res
        return self.installExcelAddin()

    def getExcelConfig(self) -> dict:
        """Считывает текущий config.ini из %APPDATA%\\PdfStampStudio\\config.ini."""
        try:
            import configparser
            app_data = os.environ.get("APPDATA") or os.path.expanduser("~")
            ini_path = os.path.join(app_data, "PdfStampStudio", "config.ini")
            if not os.path.exists(ini_path):
                return {}
            cp = configparser.ConfigParser()
            cp.read(ini_path, encoding='utf-8')
            res = {
                "general": {
                    "autoOpenPdf": cp.get("General", "AutoOpenPdf", fallback="1") == "1",
                    "suffix": cp.get("General", "Suffix", fallback="_утвержденный")
                },
                "signer1": {
                    "enabled": cp.get("Signer1", "Enabled", fallback="1") == "1",
                    "fullName": cp.get("Signer1", "FullName", fallback="Затыбек А. А."),
                    "keywords": cp.get("Signer1", "Keywords", fallback="Затыбек,Инженер-химик"),
                    "imageFile": cp.get("Signer1", "ImageFile", fallback="sig_zatybek.png"),
                    "offsetX": float(cp.get("Signer1", "OffsetX", fallback="70")),
                    "offsetY": float(cp.get("Signer1", "OffsetY", fallback="-12")),
                    "width": float(cp.get("Signer1", "Width", fallback="110")),
                    "height": float(cp.get("Signer1", "Height", fallback="42")),
                },
                "signer2": {
                    "enabled": cp.get("Signer2", "Enabled", fallback="1") == "1",
                    "fullName": cp.get("Signer2", "FullName", fallback="Сатыбалдина З. С."),
                    "keywords": cp.get("Signer2", "Keywords", fallback="Сатыбалдина,Заведующий лабораторией"),
                    "imageFile": cp.get("Signer2", "ImageFile", fallback="sig_satybaldina.png"),
                    "offsetX": float(cp.get("Signer2", "OffsetX", fallback="100")),
                    "offsetY": float(cp.get("Signer2", "OffsetY", fallback="-12")),
                    "width": float(cp.get("Signer2", "Width", fallback="110")),
                    "height": float(cp.get("Signer2", "Height", fallback="42")),
                },
                "stamp": {
                    "enabled": cp.get("Stamp", "Enabled", fallback="1") == "1",
                    "anchorName": cp.get("Stamp", "AnchorName", fallback="Сатыбалдина"),
                    "imageFile": cp.get("Stamp", "ImageFile", fallback="stamp.png"),
                    "offsetX": float(cp.get("Stamp", "OffsetX", fallback="40")),
                    "offsetY": float(cp.get("Stamp", "OffsetY", fallback="-32")),
                    "size": float(cp.get("Stamp", "Width", fallback="95")),
                }
            }
            return res
        except Exception:
            return {}

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
            title="PDF Stamp Studio — Подписи и печать (ТОО Ecology Expert)",
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
