#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
PDF Stamp Studio — Программа настройки для Windows
Настройка подписывающих лиц и печати организации с автоматической установкой в Excel.
"""

import os
import sys
import shutil
import configparser
import subprocess
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

APP_FOLDER = "PdfStampStudio"

def get_appdata_dir() -> str:
    app_data = os.environ.get("APPDATA")
    if not app_data:
        app_data = os.path.expanduser("~")
    target = os.path.join(app_data, APP_FOLDER)
    os.makedirs(os.path.join(target, "signatures"), exist_ok=True)
    os.makedirs(os.path.join(target, "stamps"), exist_ok=True)
    return target

def get_config_path() -> str:
    return os.path.join(get_appdata_dir(), "config.ini")

class ConfiguratorApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("PDF Stamp Studio — Настройка надстройки для Excel")
        self.geometry("720x780")
        self.minsize(640, 680)

        # Style setup
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except Exception:
            pass

        self.config_path = get_config_path()
        self.base_dir = os.path.dirname(os.path.abspath(__file__))

        self._build_ui()
        self._load_config()

    def _build_ui(self):
        # Header banner
        header = tk.Frame(self, bg="#1e1e2d", height=70)
        header.pack(fill="x")
        header.pack_propagate(False)

        title_lbl = tk.Label(
            header,
            text="📑 PDF Stamp Studio — Настройка и Установка в Excel",
            font=("Segoe UI", 13, "bold"),
            fg="#ffffff",
            bg="#1e1e2d"
        )
        title_lbl.pack(side="left", padx=20, pady=12)

        subtitle_lbl = tk.Label(
            header,
            text="Создание утвержденных PDF протоколов в 1 клик",
            font=("Segoe UI", 9),
            fg="#a1a1b5",
            bg="#1e1e2d"
        )
        subtitle_lbl.pack(side="left", padx=5, pady=16)

        # Scrollable container
        canvas = tk.Canvas(self, borderwidth=0, highlightthickness=0)
        scrollbar = ttk.Scrollbar(self, orient="vertical", command=canvas.yview)
        self.scrollable_frame = ttk.Frame(canvas, padding=(15, 15))

        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw", width=680)
        canvas.configure(yscrollcommand=scrollbar.set)

        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        # Section 1: Signer 1
        self._build_signer1_section()

        # Section 2: Signer 2
        self._build_signer2_section()

        # Section 3: Stamp
        self._build_stamp_section()

        # Section 4: General Settings
        self._build_general_section()

        # Bottom Actions
        actions_frame = ttk.Frame(self.scrollable_frame, padding=(0, 15))
        actions_frame.pack(fill="x", pady=10)

        self.btn_install = tk.Button(
            actions_frame,
            text="🚀 Сохранить и установить в Excel",
            font=("Segoe UI", 11, "bold"),
            bg="#10b981",
            fg="#ffffff",
            activebackground="#059669",
            activeforeground="#ffffff",
            padx=18,
            pady=10,
            cursor="hand2",
            relief="flat",
            command=self.save_and_install
        )
        self.btn_install.pack(side="left", fill="x", expand=True, padx=(0, 6))

        self.btn_save = tk.Button(
            actions_frame,
            text="💾 Только сохранить",
            font=("Segoe UI", 10),
            bg="#e2e8f0",
            fg="#1e293b",
            activebackground="#cbd5e1",
            padx=14,
            pady=10,
            cursor="hand2",
            relief="flat",
            command=self.save_config_only
        )
        self.btn_save.pack(side="left", padx=4)

        self.btn_uninstall = tk.Button(
            actions_frame,
            text="🗑️ Удалить из Excel",
            font=("Segoe UI", 9),
            bg="#fee2e2",
            fg="#b91c1c",
            activebackground="#fecaca",
            padx=10,
            pady=10,
            cursor="hand2",
            relief="flat",
            command=self.uninstall_addin
        )
        self.btn_uninstall.pack(side="right")

    def _build_signer1_section(self):
        group = ttk.LabelFrame(self.scrollable_frame, text=" ✍️ 1-й подписывающий (Инженер-химик) ", padding=10)
        group.pack(fill="x", pady=6)

        self.sig1_enabled = tk.BooleanVar(value=True)
        ttk.Checkbutton(group, text="Включено", variable=self.sig1_enabled).grid(row=0, column=0, columnspan=2, sticky="w", pady=2)

        ttk.Label(group, text="ФИО сотрудника:").grid(row=1, column=0, sticky="w", pady=3)
        self.sig1_name = ttk.Entry(group, width=35)
        self.sig1_name.grid(row=1, column=1, sticky="ew", pady=3)

        ttk.Label(group, text="Ключевые слова (через запятую):").grid(row=2, column=0, sticky="w", pady=3)
        self.sig1_keywords = ttk.Entry(group, width=35)
        self.sig1_keywords.grid(row=2, column=1, sticky="ew", pady=3)

        ttk.Label(group, text="Файл подписи (.png):").grid(row=3, column=0, sticky="w", pady=3)
        file_frame = ttk.Frame(group)
        file_frame.grid(row=3, column=1, sticky="ew", pady=3)
        self.sig1_path = ttk.Entry(file_frame)
        self.sig1_path.pack(side="left", fill="x", expand=True, padx=(0, 5))
        ttk.Button(file_frame, text="Обзор...", command=lambda: self._browse_file(self.sig1_path)).pack(side="right")

        # Coordinates
        coord_frame = ttk.Frame(group)
        coord_frame.grid(row=4, column=0, columnspan=2, sticky="ew", pady=5)
        ttk.Label(coord_frame, text="Смещение X:").pack(side="left")
        self.sig1_offx = ttk.Spinbox(coord_frame, from_=-200, to=400, width=5)
        self.sig1_offx.pack(side="left", padx=(3, 15))

        ttk.Label(coord_frame, text="Смещение Y:").pack(side="left")
        self.sig1_offy = ttk.Spinbox(coord_frame, from_=-200, to=400, width=5)
        self.sig1_offy.pack(side="left", padx=(3, 15))

        ttk.Label(coord_frame, text="Ширина:").pack(side="left")
        self.sig1_w = ttk.Spinbox(coord_frame, from_=20, to=300, width=5)
        self.sig1_w.pack(side="left", padx=(3, 15))

        ttk.Label(coord_frame, text="Высота:").pack(side="left")
        self.sig1_h = ttk.Spinbox(coord_frame, from_=10, to=200, width=5)
        self.sig1_h.pack(side="left", padx=3)

        group.columnconfigure(1, weight=1)

    def _build_signer2_section(self):
        group = ttk.LabelFrame(self.scrollable_frame, text=" ✍️ 2-й подписывающий (Заведующий лабораторией) ", padding=10)
        group.pack(fill="x", pady=6)

        self.sig2_enabled = tk.BooleanVar(value=True)
        ttk.Checkbutton(group, text="Включено", variable=self.sig2_enabled).grid(row=0, column=0, columnspan=2, sticky="w", pady=2)

        ttk.Label(group, text="ФИО сотрудника:").grid(row=1, column=0, sticky="w", pady=3)
        self.sig2_name = ttk.Entry(group, width=35)
        self.sig2_name.grid(row=1, column=1, sticky="ew", pady=3)

        ttk.Label(group, text="Ключевые слова (через запятую):").grid(row=2, column=0, sticky="w", pady=3)
        self.sig2_keywords = ttk.Entry(group, width=35)
        self.sig2_keywords.grid(row=2, column=1, sticky="ew", pady=3)

        ttk.Label(group, text="Файл подписи (.png):").grid(row=3, column=0, sticky="w", pady=3)
        file_frame = ttk.Frame(group)
        file_frame.grid(row=3, column=1, sticky="ew", pady=3)
        self.sig2_path = ttk.Entry(file_frame)
        self.sig2_path.pack(side="left", fill="x", expand=True, padx=(0, 5))
        ttk.Button(file_frame, text="Обзор...", command=lambda: self._browse_file(self.sig2_path)).pack(side="right")

        # Coordinates
        coord_frame = ttk.Frame(group)
        coord_frame.grid(row=4, column=0, columnspan=2, sticky="ew", pady=5)
        ttk.Label(coord_frame, text="Смещение X:").pack(side="left")
        self.sig2_offx = ttk.Spinbox(coord_frame, from_=-200, to=400, width=5)
        self.sig2_offx.pack(side="left", padx=(3, 15))

        ttk.Label(coord_frame, text="Смещение Y:").pack(side="left")
        self.sig2_offy = ttk.Spinbox(coord_frame, from_=-200, to=400, width=5)
        self.sig2_offy.pack(side="left", padx=(3, 15))

        ttk.Label(coord_frame, text="Ширина:").pack(side="left")
        self.sig2_w = ttk.Spinbox(coord_frame, from_=20, to=300, width=5)
        self.sig2_w.pack(side="left", padx=(3, 15))

        ttk.Label(coord_frame, text="Высота:").pack(side="left")
        self.sig2_h = ttk.Spinbox(coord_frame, from_=10, to=200, width=5)
        self.sig2_h.pack(side="left", padx=3)

        group.columnconfigure(1, weight=1)

    def _build_stamp_section(self):
        group = ttk.LabelFrame(self.scrollable_frame, text=" 🔵 Печать организации (ТОО Ecology Expert) ", padding=10)
        group.pack(fill="x", pady=6)

        self.stamp_enabled = tk.BooleanVar(value=True)
        ttk.Checkbutton(group, text="Включено", variable=self.stamp_enabled).grid(row=0, column=0, columnspan=2, sticky="w", pady=2)

        ttk.Label(group, text="Привязка к слову / ФИО:").grid(row=1, column=0, sticky="w", pady=3)
        self.stamp_anchor = ttk.Entry(group, width=35)
        self.stamp_anchor.grid(row=1, column=1, sticky="ew", pady=3)

        ttk.Label(group, text="Файл печати (.png):").grid(row=2, column=0, sticky="w", pady=3)
        file_frame = ttk.Frame(group)
        file_frame.grid(row=2, column=1, sticky="ew", pady=3)
        self.stamp_path = ttk.Entry(file_frame)
        self.stamp_path.pack(side="left", fill="x", expand=True, padx=(0, 5))
        ttk.Button(file_frame, text="Обзор...", command=lambda: self._browse_file(self.stamp_path)).pack(side="right")

        # Coordinates
        coord_frame = ttk.Frame(group)
        coord_frame.grid(row=3, column=0, columnspan=2, sticky="ew", pady=5)
        ttk.Label(coord_frame, text="Смещение X:").pack(side="left")
        self.stamp_offx = ttk.Spinbox(coord_frame, from_=-200, to=400, width=5)
        self.stamp_offx.pack(side="left", padx=(3, 15))

        ttk.Label(coord_frame, text="Смещение Y:").pack(side="left")
        self.stamp_offy = ttk.Spinbox(coord_frame, from_=-200, to=400, width=5)
        self.stamp_offy.pack(side="left", padx=(3, 15))

        ttk.Label(coord_frame, text="Размер:").pack(side="left")
        self.stamp_size = ttk.Spinbox(coord_frame, from_=30, to=300, width=5)
        self.stamp_size.pack(side="left", padx=(3, 15))

        group.columnconfigure(1, weight=1)

    def _build_general_section(self):
        group = ttk.LabelFrame(self.scrollable_frame, text=" ⚙️ Дополнительные параметры ", padding=10)
        group.pack(fill="x", pady=6)

        ttk.Label(group, text="Суффикс имени файла PDF:").grid(row=0, column=0, sticky="w", pady=3)
        self.gen_suffix = ttk.Entry(group, width=25)
        self.gen_suffix.grid(row=0, column=1, sticky="w", pady=3)

        self.gen_autoopen = tk.BooleanVar(value=True)
        ttk.Checkbutton(group, text="Автоматически открывать PDF после создания", variable=self.gen_autoopen).grid(row=1, column=0, columnspan=2, sticky="w", pady=3)

    def _browse_file(self, entry_widget):
        file_path = filedialog.askopenfilename(
            title="Выберите изображение PNG",
            filetypes=[("PNG images", "*.png"), ("All files", "*.*")]
        )
        if file_path:
            entry_widget.delete(0, tk.END)
            entry_widget.insert(0, file_path)

    def _load_config(self):
        config = configparser.ConfigParser()
        if os.path.exists(self.config_path):
            config.read(self.config_path, encoding="utf-8")

        # Defaults
        self.sig1_enabled.set(config.getboolean("Signer1", "Enabled", fallback=True))
        self.sig1_name.delete(0, tk.END)
        self.sig1_name.insert(0, config.get("Signer1", "FullName", fallback="Затыбек А. А."))
        self.sig1_keywords.delete(0, tk.END)
        self.sig1_keywords.insert(0, config.get("Signer1", "Keywords", fallback="Затыбек,Инженер-химик"))
        self.sig1_path.delete(0, tk.END)
        self.sig1_path.insert(0, config.get("Signer1", "ImageFile", fallback="sig_zatybek.png"))
        self.sig1_offx.set(config.get("Signer1", "OffsetX", fallback="70"))
        self.sig1_offy.set(config.get("Signer1", "OffsetY", fallback="-12"))
        self.sig1_w.set(config.get("Signer1", "Width", fallback="110"))
        self.sig1_h.set(config.get("Signer1", "Height", fallback="42"))

        self.sig2_enabled.set(config.getboolean("Signer2", "Enabled", fallback=True))
        self.sig2_name.delete(0, tk.END)
        self.sig2_name.insert(0, config.get("Signer2", "FullName", fallback="Сатыбалдина З. С."))
        self.sig2_keywords.delete(0, tk.END)
        self.sig2_keywords.insert(0, config.get("Signer2", "Keywords", fallback="Сатыбалдина,Заведующий лабораторией"))
        self.sig2_path.delete(0, tk.END)
        self.sig2_path.insert(0, config.get("Signer2", "ImageFile", fallback="sig_satybaldina.png"))
        self.sig2_offx.set(config.get("Signer2", "OffsetX", fallback="100"))
        self.sig2_offy.set(config.get("Signer2", "OffsetY", fallback="-12"))
        self.sig2_w.set(config.get("Signer2", "Width", fallback="110"))
        self.sig2_h.set(config.get("Signer2", "Height", fallback="42"))

        self.stamp_enabled.set(config.getboolean("Stamp", "Enabled", fallback=True))
        self.stamp_anchor.delete(0, tk.END)
        self.stamp_anchor.insert(0, config.get("Stamp", "AnchorName", fallback="Сатыбалдина"))
        self.stamp_path.delete(0, tk.END)
        self.stamp_path.insert(0, config.get("Stamp", "ImageFile", fallback="stamp.png"))
        self.stamp_offx.set(config.get("Stamp", "OffsetX", fallback="40"))
        self.stamp_offy.set(config.get("Stamp", "OffsetY", fallback="-32"))
        self.stamp_size.set(config.get("Stamp", "Width", fallback="95"))

        self.gen_suffix.delete(0, tk.END)
        self.gen_suffix.insert(0, config.get("General", "Suffix", fallback="_утвержденный"))
        self.gen_autoopen.set(config.getboolean("General", "AutoOpenPdf", fallback=True))

    def _copy_asset(self, source_path: str, target_subfolder: str, default_name: str) -> str:
        appdata_dir = get_appdata_dir()
        dest_dir = os.path.join(appdata_dir, target_subfolder)
        os.makedirs(dest_dir, exist_ok=True)

        if not source_path or not os.path.exists(source_path):
            return default_name

        dest_name = os.path.basename(source_path)
        dest_path = os.path.join(dest_dir, dest_name)
        if os.path.abspath(source_path) != os.path.abspath(dest_path):
            shutil.copy2(source_path, dest_path)
        return dest_name

    def save_config_only(self, silent=False):
        appdata_dir = get_appdata_dir()

        sig1_img = self._copy_asset(self.sig1_path.get().strip(), "signatures", "sig_zatybek.png")
        sig2_img = self._copy_asset(self.sig2_path.get().strip(), "signatures", "sig_satybaldina.png")
        stamp_img = self._copy_asset(self.stamp_path.get().strip(), "stamps", "stamp.png")

        config = configparser.ConfigParser()
        config["General"] = {
            "AutoOpenPdf": "1" if self.gen_autoopen.get() else "0",
            "Suffix": self.gen_suffix.get().strip() or "_утвержденный"
        }
        config["Signer1"] = {
            "Enabled": "1" if self.sig1_enabled.get() else "0",
            "FullName": self.sig1_name.get().strip(),
            "Keywords": self.sig1_keywords.get().strip(),
            "ImageFile": sig1_img,
            "OffsetX": str(self.sig1_offx.get()),
            "OffsetY": str(self.sig1_offy.get()),
            "Width": str(self.sig1_w.get()),
            "Height": str(self.sig1_h.get())
        }
        config["Signer2"] = {
            "Enabled": "1" if self.sig2_enabled.get() else "0",
            "FullName": self.sig2_name.get().strip(),
            "Keywords": self.sig2_keywords.get().strip(),
            "ImageFile": sig2_img,
            "OffsetX": str(self.sig2_offx.get()),
            "OffsetY": str(self.sig2_offy.get()),
            "Width": str(self.sig2_w.get()),
            "Height": str(self.sig2_h.get())
        }
        size_val = str(self.stamp_size.get())
        config["Stamp"] = {
            "Enabled": "1" if self.stamp_enabled.get() else "0",
            "AnchorName": self.stamp_anchor.get().strip(),
            "ImageFile": stamp_img,
            "OffsetX": str(self.stamp_offx.get()),
            "OffsetY": str(self.stamp_offy.get()),
            "Width": size_val,
            "Height": size_val
        }

        with open(self.config_path, "w", encoding="utf-8") as f:
            config.write(f)

        if not silent:
            messagebox.showinfo(
                "Сохранено",
                f"Параметры успешно сохранены!\n\nПуть: {self.config_path}"
            )

    def save_and_install(self):
        self.save_config_only(silent=True)

        ps1_script = os.path.join(self.base_dir, "install.ps1")
        if not os.path.exists(ps1_script):
            messagebox.showerror("Ошибка", f"Файл install.ps1 не найден:\n{ps1_script}")
            return

        cmd = [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", ps1_script
        ]

        try:
            res = subprocess.run(cmd, capture_output=True, text=True, check=True)
            messagebox.showinfo(
                "Успешно установлено!",
                "ПОЗДРАВЛЯЕМ!\n\n"
                "Надстройка Excel успешно установлена!\n\n"
                "Теперь откройте любой файл Excel и нажмите кнопку 'Создать PDF с подписями' "
                "в верхней панели либо нажмите сочетание клавиш Ctrl + Shift + P."
            )
        except Exception as e:
            messagebox.showerror(
                "Ошибка при установке",
                f"Ошибка запуска скрипта PowerShell:\n{e}"
            )

    def uninstall_addin(self):
        if not messagebox.askyesno("Подтверждение", "Вы действительно хотите удалить надстройку из Excel?"):
            return

        ps1_script = os.path.join(self.base_dir, "install.ps1")
        cmd = [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", ps1_script,
            "-Uninstall"
        ]
        try:
            subprocess.run(cmd, capture_output=True, text=True, check=True)
            messagebox.showinfo("Удалено", "Надстройка Excel успешно удалена.")
        except Exception as e:
            messagebox.showerror("Ошибка", f"Ошибка при удалении надстройки:\n{e}")

if __name__ == "__main__":
    app = ConfiguratorApp()
    app.mainloop()
