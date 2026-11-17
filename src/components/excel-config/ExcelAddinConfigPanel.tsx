import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, RefreshCw, Trash2 } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '../ui';
import { getDesktopApi, type ExcelStatus } from '../../lib/desktopSync';

interface Props {
  language: AppLanguage;
}

const TEXT = {
  ru: {
    title: 'Кнопка в Excel',
    lead: 'Подписи и печать ставятся прямо из Excel, без сохранения файла и без переноса в программу.',
    steps: [
      'Откройте протокол в Excel.',
      'На вкладке «Главная» нажмите «1. Показать подписи» — подписи и печать появятся на листе. Если положение неточное, перетащите картинку мышью.',
      'Нажмите «2. Сохранить PDF» — все листы сохранятся в один PDF в том же порядке. Файл Excel не изменится.',
    ],
    profilesNote:
      'Подписи, печати и имена настраиваются на вкладке «Подпись и печать». Изменения сразу попадают в Excel.',
    status: 'Состояние',
    installed: 'Кнопка установлена в Excel',
    notInstalled: 'Кнопка ещё не установлена',
    profiles: (s: number, st: number) => `Подписантов: ${s} · Печатей: ${st}`,
    install: 'Установить кнопку в Excel',
    reinstall: 'Переустановить',
    uninstall: 'Удалить из Excel',
    working: 'Подождите…',
    done: 'Готово. Закройте и снова откройте Excel — на вкладке «Главная» появится группа «Подписи и печать».',
    uninstalled: 'Кнопка удалена из Excel.',
    browserOnly:
      'Установка кнопки доступна в программе для Windows. В браузере можно подготовить подписи и печати для PDF.',
    needExcel: 'Для работы нужен установленный Microsoft Excel (2010 и новее).',
    download: 'Скачать программу для Windows',
  },
  kk: {
    title: 'Excel батырмасы',
    lead: 'Қолтаңба мен мөр Excel ішінен тікелей қойылады: файлды сақтап, бағдарламаға салудың қажеті жоқ.',
    steps: [
      'Хаттаманы Excel-де ашыңыз.',
      '«Главная» қойындысында «1. Показать подписи» түймесін басыңыз — қолтаңба мен мөр парақта пайда болады. Орны дәл болмаса, суретті тінтуірмен жылжытыңыз.',
      '«2. Сохранить PDF» түймесін басыңыз — барлық парақ бір PDF-ке сол ретпен сақталады. Excel файлы өзгермейді.',
    ],
    profilesNote:
      'Қолтаңба, мөр және аттар «Қол мен мөр» қойындысында бапталады. Өзгерістер Excel-ге бірден түседі.',
    status: 'Күйі',
    installed: 'Батырма Excel-ге орнатылған',
    notInstalled: 'Батырма әлі орнатылмаған',
    profiles: (s: number, st: number) => `Қол қоюшылар: ${s} · Мөрлер: ${st}`,
    install: 'Excel-ге батырма орнату',
    reinstall: 'Қайта орнату',
    uninstall: 'Excel-ден жою',
    working: 'Күте тұрыңыз…',
    done: 'Дайын. Excel-ді жауып, қайта ашыңыз — «Главная» қойындысында «Подписи и печать» тобы пайда болады.',
    uninstalled: 'Батырма Excel-ден жойылды.',
    browserOnly:
      'Батырманы орнату Windows бағдарламасында қолжетімді. Браузерде PDF үшін қолтаңба мен мөрді дайындауға болады.',
    needExcel: 'Microsoft Excel (2010 және одан жаңа) орнатылған болуы керек.',
    download: 'Windows бағдарламасын жүктеу',
  },
} as const;

export const ExcelAddinConfigPanel: React.FC<Props> = ({ language }) => {
  const t = TEXT[language];
  const api = getDesktopApi();
  const [excel, setExcel] = useState<ExcelStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const a = getDesktopApi();
    if (!a?.getExcelStatus) return;
    try {
      setExcel(await a.getExcelStatus());
    } catch {
      setExcel(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onReady = () => void refresh();
    window.addEventListener('pywebviewready', onReady);
    return () => window.removeEventListener('pywebviewready', onReady);
  }, [refresh]);

  const run = async (kind: 'install' | 'uninstall') => {
    const a = getDesktopApi();
    const fn = kind === 'install' ? a?.installExcelAddin : a?.uninstallExcelAddin;
    if (!fn) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fn();
      if (!res.success) throw new Error(res.error || 'Error');
      setMessage({ ok: true, text: kind === 'install' ? t.done : t.uninstalled });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-[var(--color-primary)]" aria-hidden="true" />
            <CardTitle>{t.title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-[var(--color-text-secondary)]">{t.lead}</p>

          <ol className="flex flex-col gap-2">
            {t.steps.map((step, i) => (
              <li key={step} className="flex gap-3 text-sm">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-subtle)] text-xs font-semibold text-[var(--color-primary)]">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <p className="rounded-[var(--radius-md)] bg-[var(--color-primary-subtle)] px-3 py-2 text-sm">
            {t.profilesNote}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.status}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {api ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{excel?.installed ? t.installed : t.notInstalled}</Badge>
                {excel && (
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    {t.profiles(excel.signers, excel.stamps)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void run('install')} disabled={busy}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  {busy ? t.working : excel?.installed ? t.reinstall : t.install}
                </Button>
                {excel?.installed && (
                  <Button variant="ghost" onClick={() => void run('uninstall')} disabled={busy}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    {t.uninstall}
                  </Button>
                )}
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">{t.needExcel}</p>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--color-text-secondary)]">{t.browserOnly}</p>
              <div>
                <a
                  href="/download/PdfStampSetup.exe"
                  download="PdfStampSetup.exe"
                  className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 text-sm font-semibold text-white hover:opacity-90"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {t.download}
                </a>
              </div>
            </>
          )}

          {message && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-sm"
            >
              {message.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--color-success)]" aria-hidden="true" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 text-[var(--color-danger)]" aria-hidden="true" />
              )}
              <span>{message.text}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
