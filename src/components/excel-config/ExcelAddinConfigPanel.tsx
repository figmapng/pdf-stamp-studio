import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Save,
  Download,
  Trash2,
  RefreshCw,
  FolderArchive,
  Image as ImageIcon,
  Sliders,
  Info,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Switch,
  Badge,
} from '../ui';

export interface ExcelAddinConfig {
  general: {
    autoOpenPdf: boolean;
    suffix: string;
  };
  signer1: {
    enabled: boolean;
    fullName: string;
    keywords: string;
    imageFile: string;
    imageBase64?: string;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  };
  signer2: {
    enabled: boolean;
    fullName: string;
    keywords: string;
    imageFile: string;
    imageBase64?: string;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  };
  stamp: {
    enabled: boolean;
    anchorName: string;
    imageFile: string;
    imageBase64?: string;
    offsetX: number;
    offsetY: number;
    size: number;
  };
}

const DEFAULT_EXCEL_CONFIG: ExcelAddinConfig = {
  general: {
    autoOpenPdf: true,
    suffix: '_утвержденный',
  },
  signer1: {
    enabled: true,
    fullName: 'Затыбек А. А.',
    keywords: 'Затыбек,Инженер-химик',
    imageFile: 'sig_zatybek.png',
    offsetX: 70,
    offsetY: -12,
    width: 110,
    height: 42,
  },
  signer2: {
    enabled: true,
    fullName: 'Сатыбалдина З. С.',
    keywords: 'Сатыбалдина,Заведующий лабораторией',
    imageFile: 'sig_satybaldina.png',
    offsetX: 100,
    offsetY: -12,
    width: 110,
    height: 42,
  },
  stamp: {
    enabled: true,
    anchorName: 'Сатыбалдина',
    imageFile: 'stamp.png',
    offsetX: 40,
    offsetY: -32,
    size: 95,
  },
};

export const ExcelAddinConfigPanel: React.FC = () => {
  const [cfg, setCfg] = useState<ExcelAddinConfig>(DEFAULT_EXCEL_CONFIG);
  const [isDesktop, setIsDesktop] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uninstallLoading, setUninstallLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    // Проверка, запущено ли приложение в WebView2 настольного приложения
    const hasPywebview = Boolean((window as any).pywebview?.api);
    setIsDesktop(hasPywebview);

    // Загрузка сохраненного конфига из localStorage или через API
    try {
      const saved = localStorage.getItem('EXCEL_ADDIN_CONFIG');
      if (saved) {
        setCfg(JSON.parse(saved));
      }
    } catch {}

    if (hasPywebview && (window as any).pywebview?.api?.getExcelConfig) {
      (window as any).pywebview.api
        .getExcelConfig()
        .then((remoteCfg: any) => {
          if (remoteCfg && typeof remoteCfg === 'object') {
            setCfg((prev) => ({ ...prev, ...remoteCfg }));
          }
        })
        .catch(() => {});
    }
  }, []);

  const saveToLocal = (next: ExcelAddinConfig) => {
    setCfg(next);
    try {
      localStorage.setItem('EXCEL_ADDIN_CONFIG', JSON.stringify(next));
    } catch {}
  };

  const handleInstall = async () => {
    setLoading(true);
    setStatus(null);
    try {
      saveToLocal(cfg);
      const api = (window as any).pywebview?.api;
      if (api?.saveAndInstallExcelAddin) {
        const res = await api.saveAndInstallExcelAddin(cfg);
        if (res?.success) {
          setStatus({
            type: 'success',
            text: '🎉 Успешно установлено в Microsoft Excel! Откройте любой файл Excel — на вкладке «Главная» появилась кнопка «Создать PDF с подписями» (или Ctrl+Shift+P).',
          });
        } else {
          throw new Error(res?.error || 'Ошибка при установке надстройки в Excel.');
        }
      } else if (api?.installExcelAddin) {
        const res = await api.installExcelAddin();
        if (res?.success) {
          setStatus({
            type: 'success',
            text: '🎉 Кнопка успешно добавлена в Microsoft Excel! Откройте Excel и проверьте вкладку «Главная».',
          });
        } else {
          throw new Error(res?.error || 'Сбой при установке.');
        }
      } else {
        // Запущено в обычном браузере
        setStatus({
          type: 'success',
          text: '✓ Настройки сохранены! Для автоматической установки в Excel скачайте и запустите «Установить_в_Excel.bat» ниже.',
        });
      }
    } catch (e: any) {
      setStatus({
        type: 'error',
        text: e.message || 'Ошибка установки в Excel.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUninstall = async () => {
    setUninstallLoading(true);
    setStatus(null);
    try {
      const api = (window as any).pywebview?.api;
      if (api?.uninstallExcelAddin) {
        const res = await api.uninstallExcelAddin();
        if (res?.success) {
          setStatus({
            type: 'success',
            text: '✓ Надстройка успешно удалена из Microsoft Excel.',
          });
        } else {
          throw new Error(res?.error || 'Ошибка удаления.');
        }
      } else {
        setStatus({
          type: 'success',
          text: 'Для удаления запустите «Удалить_из_Excel.bat» из архива.',
        });
      }
    } catch (e: any) {
      setStatus({
        type: 'error',
        text: e.message || 'Ошибка удаления надстройки.',
      });
    } finally {
      setUninstallLoading(false);
    }
  };

  const handleImageUpload = (
    target: 'signer1' | 'signer2' | 'stamp',
    file: File,
  ) => {
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setCfg((prev) => {
        const updated = {
          ...prev,
          [target]: {
            ...prev[target],
            imageFile: file.name,
            imageBase64: b64,
          },
        };
        saveToLocal(updated);
        return updated;
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="rounded-2xl border border-emerald-300 bg-gradient-to-r from-emerald-950 via-slate-900 to-indigo-950 p-6 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  ⚡ Настройка и Установка кнопки в Microsoft Excel
                  <Badge variant="success" className="text-[11px] bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
                    Excel 2010–365
                  </Badge>
                </h2>
                <p className="text-xs text-emerald-200/80">
                  ТОО «Ecology Expert» — Автоматическая расстановка подписей и печати для протоколов в 1 клик
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="lg"
              onClick={handleInstall}
              disabled={loading || uninstallLoading}
              className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-5 shadow-md shadow-emerald-950/40"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {isDesktop ? '⚡ Установить кнопку в Excel' : '💾 Сохранить настройки'}
            </Button>

            <Button
              variant="ghost"
              size="md"
              onClick={handleUninstall}
              disabled={loading || uninstallLoading}
              className="text-rose-300 hover:text-white hover:bg-rose-950/40 text-xs border border-rose-900/50"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Удалить из Excel
            </Button>
          </div>
        </div>
      </div>

      {/* Status banner */}
      {status && (
        <div
          className={`flex items-start gap-3 rounded-xl border p-4 text-xs leading-relaxed shadow-sm ${
            status.type === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-rose-300 bg-rose-50 text-rose-900'
          }`}
        >
          {status.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
          )}
          <div>
            <div className="font-bold text-sm">
              {status.type === 'success' ? 'Успешно выполнено!' : 'Ошибка!'}
            </div>
            <div className="mt-0.5">{status.text}</div>
          </div>
        </div>
      )}

      {/* Main Form Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Signer 1: Затыбек А. А. */}
        <Card className="border-indigo-200/70 shadow-xs">
          <CardHeader className="bg-indigo-50/50 border-b border-indigo-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-xs">
                  1
                </div>
                <CardTitle className="text-sm font-bold text-indigo-950">
                  1-й подписывающий: Инженер-химик
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">Активен:</span>
                <Switch
                  checked={cfg.signer1.enabled}
                  onCheckedChange={(val) =>
                    saveToLocal({
                      ...cfg,
                      signer1: { ...cfg.signer1, enabled: val },
                    })
                  }
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div>
              <label className="text-xs font-semibold text-slate-700">ФИО сотрудника:</label>
              <Input
                value={cfg.signer1.fullName}
                onChange={(e) =>
                  saveToLocal({
                    ...cfg,
                    signer1: { ...cfg.signer1, fullName: e.target.value },
                  })
                }
                className="mt-1"
                placeholder="Затыбек А. А."
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">
                Искать в таблице по словам (через запятую):
              </label>
              <Input
                value={cfg.signer1.keywords}
                onChange={(e) =>
                  saveToLocal({
                    ...cfg,
                    signer1: { ...cfg.signer1, keywords: e.target.value },
                  })
                }
                className="mt-1 font-mono text-xs"
                placeholder="Затыбек,Инженер-химик"
              />
            </div>

            {/* Image Preview & Upload */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Файл подписи (.png):</span>
                <span className="font-mono text-slate-500 text-[11px]">{cfg.signer1.imageFile}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-32 items-center justify-center rounded border border-slate-200 bg-white p-1">
                  <img
                    src={cfg.signer1.imageBase64 || '/demo-assets/sig_zatybek.png'}
                    alt="Подпись 1"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-xs">
                  <ImageIcon className="h-3.5 w-3.5 text-slate-500" />
                  Выбрать файл...
                  <input
                    type="file"
                    accept="image/png"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleImageUpload('signer1', e.target.files[0]);
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Coordinates / Geometry */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-semibold text-slate-600">Смещение X (вправо, px):</label>
                <Input
                  type="number"
                  value={cfg.signer1.offsetX}
                  onChange={(e) =>
                    saveToLocal({
                      ...cfg,
                      signer1: { ...cfg.signer1, offsetX: Number(e.target.value) || 0 },
                    })
                  }
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600">Смещение Y (вверх/вниз, px):</label>
                <Input
                  type="number"
                  value={cfg.signer1.offsetY}
                  onChange={(e) =>
                    saveToLocal({
                      ...cfg,
                      signer1: { ...cfg.signer1, offsetY: Number(e.target.value) || 0 },
                    })
                  }
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600">Ширина (px):</label>
                <Input
                  type="number"
                  value={cfg.signer1.width}
                  onChange={(e) =>
                    saveToLocal({
                      ...cfg,
                      signer1: { ...cfg.signer1, width: Number(e.target.value) || 110 },
                    })
                  }
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600">Высота (px):</label>
                <Input
                  type="number"
                  value={cfg.signer1.height}
                  onChange={(e) =>
                    saveToLocal({
                      ...cfg,
                      signer1: { ...cfg.signer1, height: Number(e.target.value) || 42 },
                    })
                  }
                  className="mt-1 font-mono text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Signer 2: Сатыбалдина З. С. */}
        <Card className="border-indigo-200/70 shadow-xs">
          <CardHeader className="bg-indigo-50/50 border-b border-indigo-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-xs">
                  2
                </div>
                <CardTitle className="text-sm font-bold text-indigo-950">
                  2-й подписывающий: Заведующий лабораторией
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">Активен:</span>
                <Switch
                  checked={cfg.signer2.enabled}
                  onCheckedChange={(val) =>
                    saveToLocal({
                      ...cfg,
                      signer2: { ...cfg.signer2, enabled: val },
                    })
                  }
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div>
              <label className="text-xs font-semibold text-slate-700">ФИО сотрудника:</label>
              <Input
                value={cfg.signer2.fullName}
                onChange={(e) =>
                  saveToLocal({
                    ...cfg,
                    signer2: { ...cfg.signer2, fullName: e.target.value },
                  })
                }
                className="mt-1"
                placeholder="Сатыбалдина З. С."
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">
                Искать в таблице по словам (через запятую):
              </label>
              <Input
                value={cfg.signer2.keywords}
                onChange={(e) =>
                  saveToLocal({
                    ...cfg,
                    signer2: { ...cfg.signer2, keywords: e.target.value },
                  })
                }
                className="mt-1 font-mono text-xs"
                placeholder="Сатыбалдина,Заведующий лабораторией"
              />
            </div>

            {/* Image Preview & Upload */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Файл подписи (.png):</span>
                <span className="font-mono text-slate-500 text-[11px]">{cfg.signer2.imageFile}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-32 items-center justify-center rounded border border-slate-200 bg-white p-1">
                  <img
                    src={cfg.signer2.imageBase64 || '/demo-assets/sig_satybaldina.png'}
                    alt="Подпись 2"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-xs">
                  <ImageIcon className="h-3.5 w-3.5 text-slate-500" />
                  Выбрать файл...
                  <input
                    type="file"
                    accept="image/png"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleImageUpload('signer2', e.target.files[0]);
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Coordinates / Geometry */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-semibold text-slate-600">Смещение X (вправо, px):</label>
                <Input
                  type="number"
                  value={cfg.signer2.offsetX}
                  onChange={(e) =>
                    saveToLocal({
                      ...cfg,
                      signer2: { ...cfg.signer2, offsetX: Number(e.target.value) || 0 },
                    })
                  }
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600">Смещение Y (вверх/вниз, px):</label>
                <Input
                  type="number"
                  value={cfg.signer2.offsetY}
                  onChange={(e) =>
                    saveToLocal({
                      ...cfg,
                      signer2: { ...cfg.signer2, offsetY: Number(e.target.value) || 0 },
                    })
                  }
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600">Ширина (px):</label>
                <Input
                  type="number"
                  value={cfg.signer2.width}
                  onChange={(e) =>
                    saveToLocal({
                      ...cfg,
                      signer2: { ...cfg.signer2, width: Number(e.target.value) || 110 },
                    })
                  }
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600">Высота (px):</label>
                <Input
                  type="number"
                  value={cfg.signer2.height}
                  onChange={(e) =>
                    saveToLocal({
                      ...cfg,
                      signer2: { ...cfg.signer2, height: Number(e.target.value) || 42 },
                    })
                  }
                  className="mt-1 font-mono text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Печать организации */}
        <Card className="border-emerald-200/70 shadow-xs">
          <CardHeader className="bg-emerald-50/50 border-b border-emerald-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-xs">
                  3
                </div>
                <CardTitle className="text-sm font-bold text-emerald-950">
                  Мекеме мөрі / Печать ТОО «Ecology Expert»
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">Активна:</span>
                <Switch
                  checked={cfg.stamp.enabled}
                  onCheckedChange={(val) =>
                    saveToLocal({
                      ...cfg,
                      stamp: { ...cfg.stamp, enabled: val },
                    })
                  }
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Привязать печать к строке/фамилии:
              </label>
              <Input
                value={cfg.stamp.anchorName}
                onChange={(e) =>
                  saveToLocal({
                    ...cfg,
                    stamp: { ...cfg.stamp, anchorName: e.target.value },
                  })
                }
                className="mt-1"
                placeholder="Сатыбалдина"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Печать ставится в строку руководителя лаборатории с наложением на подпись.
              </p>
            </div>

            {/* Stamp Image Preview & Upload */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Файл круглой печати (.png):</span>
                <span className="font-mono text-slate-500 text-[11px]">{cfg.stamp.imageFile}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-200 bg-white p-1">
                  <img
                    src={cfg.stamp.imageBase64 || '/demo-assets/stamp.png'}
                    alt="Печать"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-xs">
                  <ImageIcon className="h-3.5 w-3.5 text-slate-500" />
                  Выбрать печать...
                  <input
                    type="file"
                    accept="image/png"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleImageUpload('stamp', e.target.files[0]);
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Coordinates / Geometry */}
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-semibold text-slate-600">Смещение X (px):</label>
                <Input
                  type="number"
                  value={cfg.stamp.offsetX}
                  onChange={(e) =>
                    saveToLocal({
                      ...cfg,
                      stamp: { ...cfg.stamp, offsetX: Number(e.target.value) || 0 },
                    })
                  }
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600">Смещение Y (px):</label>
                <Input
                  type="number"
                  value={cfg.stamp.offsetY}
                  onChange={(e) =>
                    saveToLocal({
                      ...cfg,
                      stamp: { ...cfg.stamp, offsetY: Number(e.target.value) || 0 },
                    })
                  }
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600">Размер (px):</label>
                <Input
                  type="number"
                  value={cfg.stamp.size}
                  onChange={(e) =>
                    saveToLocal({
                      ...cfg,
                      stamp: { ...cfg.stamp, size: Number(e.target.value) || 95 },
                    })
                  }
                  className="mt-1 font-mono text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Общие параметры и экспорт */}
        <Card className="border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <CardHeader className="bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-slate-600" />
                <CardTitle className="text-sm font-bold text-slate-900">
                  Параметры создания утвержденного PDF
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Суффикс для готового файла PDF:
                </label>
                <Input
                  value={cfg.general.suffix}
                  onChange={(e) =>
                    saveToLocal({
                      ...cfg,
                      general: { ...cfg.general, suffix: e.target.value },
                    })
                  }
                  className="mt-1 font-mono text-xs"
                  placeholder="_утвержденный"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Пример: если исходный файл «Протокол_№12.xlsx», то PDF будет «Протокол_№12_утвержденный.pdf»
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <div>
                  <div className="text-xs font-semibold text-slate-800">
                    Автоматически открывать созданный PDF
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Сразу после создания открывать файл для быстрой проверки
                  </div>
                </div>
                <Switch
                  checked={cfg.general.autoOpenPdf}
                  onCheckedChange={(val) =>
                    saveToLocal({
                      ...cfg,
                      general: { ...cfg.general, autoOpenPdf: val },
                    })
                  }
                />
              </div>
            </CardContent>
          </div>

          {/* Quick Download of Installer archive */}
          <div className="p-4 bg-emerald-50/50 border-t border-emerald-100 rounded-b-xl space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-emerald-950 flex items-center gap-1.5">
                <FolderArchive className="h-4 w-4 text-emerald-600" />
                Скачать архив для установки на другие ПК:
              </span>
              <Badge variant="neutral" className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200">
                ~300 КБ
              </Badge>
            </div>
            <a
              href="/download/Excel_Addin_Installer.zip"
              download="Excel_Addin_Installer.zip"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Скачать Excel_Addin_Installer.zip
            </a>
          </div>
        </Card>
      </div>

      {/* Bottom Action Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Info className="h-4 w-4 text-indigo-500 shrink-0" />
          <span>
            При нажатии на кнопку ниже настройки запишутся в <code>config.ini</code>, а макрос автоматически пропишется в реестре Excel.
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="primary"
            size="lg"
            onClick={handleInstall}
            disabled={loading || uninstallLoading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 shadow-sm"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            )}
            ⚡ Сохранить и Установить в Excel
          </Button>
        </div>
      </div>
    </div>
  );
};
