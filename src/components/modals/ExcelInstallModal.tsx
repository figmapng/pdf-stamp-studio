import React, { useState, useEffect } from 'react';
import {
  Download,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  FolderArchive,
  RefreshCw,
  Trash2,
  Laptop,
  HelpCircle,
} from 'lucide-react';
import { Dialog } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import type { Translations } from '../../i18n';

interface ExcelInstallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t?: Translations;
  language: 'ru' | 'kk';
}

export const ExcelInstallModal: React.FC<ExcelInstallModalProps> = ({
  open,
  onOpenChange,
  language,
}) => {
  const [isDesktop, setIsDesktop] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uninstallLoading, setUninstallLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    const hasPywebview = Boolean((window as any).pywebview?.api);
    setIsDesktop(hasPywebview);
  }, [open]);

  const handleInstallDesktop = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const api = (window as any).pywebview?.api;
      if (!api?.installExcelAddin) {
        throw new Error('Функция установки доступна в настольном приложении для Windows.');
      }
      const res = await api.installExcelAddin();
      if (res?.success) {
        setStatusMessage({
          type: 'success',
          text:
            language === 'ru'
              ? '🎉 Кнопка успешно добавлена в Microsoft Excel! Откройте любой файл Excel — на вкладке «Главная» появилась кнопка «Создать PDF с подписями» (или Ctrl+Shift+P).'
              : '🎉 Батырма Microsoft Excel-ге сәтті орнатылды! Кез келген Excel файлын ашыңыз — «Басты» (Главная) бөлімінде батырма пайда болды (немесе Ctrl+Shift+P).',
        });
      } else {
        throw new Error(res?.error || 'Произошла неизвестная ошибка при установке.');
      }
    } catch (e: any) {
      setStatusMessage({
        type: 'error',
        text: e.message || 'Ошибка установки надстройки в Excel.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUninstallDesktop = async () => {
    setUninstallLoading(true);
    setStatusMessage(null);
    try {
      const api = (window as any).pywebview?.api;
      if (!api?.uninstallExcelAddin) {
        throw new Error('Функция удаления доступна в настольном приложении.');
      }
      const res = await api.uninstallExcelAddin();
      if (res?.success) {
        setStatusMessage({
          type: 'success',
          text:
            language === 'ru'
              ? 'Надстройка успешно удалена из Microsoft Excel.'
              : 'Қондырма Microsoft Excel-ден сәтті өшірілді.',
        });
      } else {
        throw new Error(res?.error || 'Ошибка при удалении надстройки.');
      }
    } catch (e: any) {
      setStatusMessage({
        type: 'error',
        text: e.message || 'Ошибка удаления надстройки из Excel.',
      });
    } finally {
      setUninstallLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        language === 'ru'
          ? '⚡ Установка кнопки в Microsoft Excel'
          : '⚡ Microsoft Excel-ге батырма орнату'
      }
      description={
        language === 'ru'
          ? 'Позволяет в 1 клик прямо внутри Microsoft Excel ставить подписи, печать ТОО «Ecology Expert» и сохранять PDF для всех ваших файлов.'
          : 'Microsoft Excel ішінде 1 кликпен «Ecology Expert» ЖШС қолтаңбаларын, мөрін қойып, барлық файлдардан PDF жасауға мүмкіндік береді.'
      }
      className="w-full max-w-xl"
    >
      <div className="space-y-4 py-2">
        {/* Status banner if available */}
        {statusMessage && (
          <div
            className={`flex items-start gap-2.5 rounded-lg border p-3.5 text-xs leading-relaxed ${
              statusMessage.type === 'success'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : 'border-rose-300 bg-rose-50 text-rose-900'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            )}
            <div className="font-medium">{statusMessage.text}</div>
          </div>
        )}

        {/* Desktop 1-Click Action */}
        {isDesktop && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-indigo-950">
                <Laptop className="h-4 w-4 text-indigo-600" />
                {language === 'ru'
                  ? 'Установка прямо с этого компьютера'
                  : 'Осы компьютерге тікелей орнату'}
              </div>
              <Badge variant="neutral" className="border-indigo-300 bg-white text-indigo-700 text-[11px]">
                Windows 10/11
              </Badge>
            </div>
            <p className="text-xs text-indigo-900/80 leading-normal">
              {language === 'ru'
                ? 'Нажмите кнопку ниже: программа автоматически пропишет надстройку в Excel (вкладка «Главная») и настроит доверенную зону без предупреждений безопасности.'
                : 'Төмендегі батырманы басыңыз: бағдарлама Excel-дің «Басты» бөліміне батырманы өздігінен қосады.'}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                variant="primary"
                size="md"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
                onClick={handleInstallDesktop}
                disabled={loading || uninstallLoading}
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                )}
                {language === 'ru'
                  ? '⚡ Установить кнопку в Excel (1 клик)'
                  : '⚡ Excel-ге батырманы орнату (1 клик)'}
              </Button>
              <Button
                variant="ghost"
                size="md"
                className="text-slate-600 hover:text-rose-600 hover:bg-rose-50 text-xs"
                onClick={handleUninstallDesktop}
                disabled={loading || uninstallLoading}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {language === 'ru' ? 'Удалить из Excel' : 'Excel-ден өшіру'}
              </Button>
            </div>
          </div>
        )}

        {/* Options to Download */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {language === 'ru' ? 'Файлы для скачивания и установки' : 'Жүктеп алып орнату файлдары'}
          </h4>

          {/* Option A: Quick ZIP installer */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100/70 transition-colors">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <FolderArchive className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  {language === 'ru'
                    ? 'Быстрый установщик Excel (.zip)'
                    : 'Жедел Excel орнатқышы (.zip)'}
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                    ~300 КБ
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {language === 'ru'
                    ? 'Распакуйте и запустите «Установить_в_Excel.bat». Кнопка появится во всех версиях Excel (2010–365).'
                    : 'Архивті ашып, «Установить_в_Excel.bat» басыңыз. Батырма Excel-дің барлық нұсқаларына түседі.'}
                </p>
              </div>
            </div>
            <a
              href="/download/Excel_Addin_Installer.zip"
              download="Excel_Addin_Installer.zip"
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              {language === 'ru' ? 'Скачать .zip' : 'Жүктеу .zip'}
            </a>
          </div>

          {/* Option B: Windows Desktop App EXE */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100/70 transition-colors">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                <Laptop className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  {language === 'ru'
                    ? 'Настольная программа для Windows (.exe)'
                    : 'Windows бағдарламасы (.exe)'}
                  <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">
                    Дизайн сайта
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {language === 'ru'
                    ? 'Интерфейс точно как на сайте, просмотр и перетаскивание файлов Excel (.xlsx/.xls) и PDF.'
                    : 'Сайттағыдай дизайн, Excel (.xlsx/.xls) және PDF файлдарын сүйреп ашу.'}
                </p>
              </div>
            </div>
            <a
              href="/download/PdfStampSetup.exe"
              download="PdfStampSetup.exe"
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              {language === 'ru' ? 'Скачать .exe' : 'Жүктеу .exe'}
            </a>
          </div>
        </div>

        {/* How it works info */}
        <div className="rounded-lg border border-slate-200 bg-white p-3.5 text-xs space-y-2 text-slate-600">
          <div className="font-bold text-slate-800 flex items-center gap-1.5">
            <HelpCircle className="h-4 w-4 text-slate-500" />
            {language === 'ru' ? 'Как работает кнопка в Excel:' : 'Excel-дегі батырма қалай істейді:'}
          </div>
          <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed">
            <li>
              {language === 'ru'
                ? 'Кнопка появится на вкладке «Главная» в правой части панели.'
                : 'Батырма «Басты» (Главная) бөлімінде пайда болады.'}
            </li>
            <li>
              {language === 'ru'
                ? 'При нажатии находит «Затыбек А. А.», «Сатыбалдина З. С.», ставит подписи и круглую печать ТОО «Ecology Expert» точно на линии.'
                : 'Басқан кезде «Затыбек А. А.», «Сатыбалдина З. С.» тауып, қолтаңбалар мен «Ecology Expert» ЖШС мөрін сызыққа қояды.'}
            </li>
            <li>
              {language === 'ru'
                ? 'Сохраняет готовый утвержденный единый PDF файл и сразу открывает его.'
                : 'Дайын PDF файлын сақтап, экранға бірден ашып көрсетеді.'}
            </li>
          </ul>
        </div>
      </div>
    </Dialog>
  );
};
