import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileDown,
  FileSpreadsheet,
  ImagePlus,
  RefreshCw,
  Settings as SettingsIcon,
  Trash2,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '../ui';
import { getDesktopApi, type ExcelStatus } from '../../lib/desktopSync';

interface Props {
  language: AppLanguage;
}

const TEXT = {
  ru: {
    title: 'Кнопка в Excel',
    lead: 'Подписи и печать ставятся прямо из Excel — без сохранения файла и без переноса в программу.',
    whereTitle: 'Где искать кнопки',
    whereBody:
      'После установки откройте протокол в Excel. На вкладке «Главная» (верхняя лента) справа появится группа «Подписи и печать».',
    ribbonAlt: 'Лента Excel: вкладка «Главная», справа группа «Подписи и печать» с четырьмя кнопками',
    steps: [
      {
        title: 'Показать подписи',
        body: 'Программа найдёт подписантов в файле и поставит подпись и печать на лист. Если положение неточное — перетащите картинку мышью.',
      },
      {
        title: 'Сохранить PDF',
        body: 'Все листы сохранятся в один PDF в том же порядке, рядом с файлом Excel. Сам файл Excel не изменится.',
      },
    ],
    extras: [
      { name: 'Убрать', body: 'убирает подписи и печать с листа, ничего не сохраняя.' },
      { name: 'Настройки', body: 'открывает эту программу: подписи, печати, имена.' },
    ],
    hotkey: 'Быстрый вариант: Ctrl+Shift+P — первое нажатие показывает подписи, второе сохраняет PDF.',
    profilesNote:
      'Подписи, печати и имена настраиваются на вкладке «Подпись и печать». Нажмите там «Сохранить» — изменения сразу попадут в Excel.',
    status: 'Состояние',
    installed: 'Кнопка установлена в Excel',
    notInstalled: 'Кнопка ещё не установлена',
    profiles: (s: number, st: number) => `Подписантов: ${s} · Печатей: ${st}`,
    install: 'Установить кнопку в Excel',
    reinstall: 'Переустановить',
    uninstall: 'Удалить из Excel',
    working: 'Подождите…',
    done: 'Готово! Кнопки установлены. Откройте Excel → вкладка «Главная» → справа группа «Подписи и печать». Если её нет, закройте Excel полностью и откройте снова.',
    uninstalled: 'Кнопка удалена из Excel.',
    browserOnly:
      'Установка кнопки доступна в программе для Windows. В браузере можно подготовить подписи и печати для PDF.',
    needExcel: 'Для работы нужен установленный Microsoft Excel (2010 и новее).',
    download: 'Скачать программу для Windows',
  },
  kk: {
    title: 'Excel батырмасы',
    lead: 'Қолтаңба мен мөр Excel ішінен тікелей қойылады: файлды сақтап, бағдарламаға салудың қажеті жоқ.',
    whereTitle: 'Батырмалар қай жерде тұрады',
    whereBody:
      'Орнатқаннан кейін хаттаманы Excel-де ашыңыз. «Главная» қойындысында (жоғарғы лента) оң жақта «Подписи и печать» тобы пайда болады.',
    ribbonAlt: 'Excel лентасы: «Главная» қойындысы, оң жақта төрт батырмасы бар «Подписи и печать» тобы',
    steps: [
      {
        title: 'Показать подписи',
        body: 'Бағдарлама файлдан қол қоюшыларды тауып, қолтаңба мен мөрді параққа қояды. Орны дәл болмаса, суретті тінтуірмен жылжытыңыз.',
      },
      {
        title: 'Сохранить PDF',
        body: 'Барлық парақ бір PDF-ке сол ретпен, Excel файлының қасына сақталады. Excel файлының өзі өзгермейді.',
      },
    ],
    extras: [
      { name: 'Убрать', body: 'парақтағы қолтаңба мен мөрді ештеңе сақтамай алып тастайды.' },
      { name: 'Настройки', body: 'осы бағдарламаны ашады: қолтаңба, мөр, аттар.' },
    ],
    hotkey: 'Жылдам жолы: Ctrl+Shift+P — бірінші басу қолтаңбаны көрсетеді, екінші басу PDF сақтайды.',
    profilesNote:
      'Қолтаңба, мөр және аттар «Қол мен мөр» қойындысында бапталады. Ол жерде «Сақтау» батырмасын басыңыз — өзгерістер Excel-ге бірден түседі.',
    status: 'Күйі',
    installed: 'Батырма Excel-ге орнатылған',
    notInstalled: 'Батырма әлі орнатылмаған',
    profiles: (s: number, st: number) => `Қол қоюшылар: ${s} · Мөрлер: ${st}`,
    install: 'Excel-ге батырма орнату',
    reinstall: 'Қайта орнату',
    uninstall: 'Excel-ден жою',
    working: 'Күте тұрыңыз…',
    done: 'Дайын! Батырмалар орнатылды. Excel-ді ашыңыз → «Главная» қойындысы → оң жақта «Подписи и печать» тобы. Көрінбесе, Excel-ді толық жауып, қайта ашыңыз.',
    uninstalled: 'Батырма Excel-ден жойылды.',
    browserOnly:
      'Батырманы орнату Windows бағдарламасында қолжетімді. Браузерде PDF үшін қолтаңба мен мөрді дайындауға болады.',
    needExcel: 'Microsoft Excel (2010 және одан жаңа) орнатылған болуы керек.',
    download: 'Windows бағдарламасын жүктеу',
  },
} as const;

const GREEN = '#217346';

/** A drawing of the Excel ribbon that shows exactly where the new buttons appear. */
const RibbonIllustration: React.FC<{ alt: string }> = ({ alt }) => {
  const tabs = ['Файл', 'Главная', 'Вставка', 'Разметка страницы', 'Формулы', 'Данные'];
  const placeholderGroups = ['Буфер обмена', 'Шрифт', 'Выравнивание', 'Число'];
  const buttons = [
    { n: '1', icon: ImagePlus, label: 'Показать подписи' },
    { n: '2', icon: FileDown, label: 'Сохранить PDF' },
    { n: '', icon: Trash2, label: 'Убрать' },
    { n: '', icon: SettingsIcon, label: 'Настройки' },
  ];

  return (
    <div
      role="img"
      aria-label={alt}
      className="select-none overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-white shadow-[var(--shadow-xs)]"
    >
      <div
        className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-white"
        style={{ background: GREEN }}
      >
        <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
        протокол.xlsx — Excel
      </div>

      <div className="flex gap-4 overflow-x-auto border-b border-slate-200 bg-slate-100 px-3 pt-1.5 text-[11px] text-slate-600">
        {tabs.map((tab) => (
          <span
            key={tab}
            className={`shrink-0 pb-1.5 ${tab === 'Главная' ? 'border-b-2 font-bold' : ''}`}
            style={tab === 'Главная' ? { color: GREEN, borderColor: GREEN } : undefined}
          >
            {tab}
          </span>
        ))}
      </div>

      <div className="flex items-stretch gap-2 overflow-x-auto bg-slate-50 p-2">
        {placeholderGroups.map((g) => (
          <div
            key={g}
            className="hidden shrink-0 flex-col justify-between rounded border border-slate-200 bg-white px-2 py-1.5 sm:flex"
          >
            <div className="flex gap-1">
              <span className="h-5 w-5 rounded bg-slate-200" />
              <span className="h-5 w-5 rounded bg-slate-200" />
              <span className="h-5 w-5 rounded bg-slate-200" />
            </div>
            <div className="mt-2 text-center text-[9px] text-slate-400">{g}</div>
          </div>
        ))}

        <div className="relative shrink-0 rounded border-2 border-[var(--color-primary)] bg-white px-2 pb-1 pt-2 shadow-[0_0_0_3px_rgba(79,70,229,0.15)]">
          <span className="absolute -top-2.5 left-2 rounded bg-[var(--color-primary)] px-1.5 text-[9px] font-bold text-white">
            Новое
          </span>
          <div className="flex gap-2">
            {buttons.map(({ n, icon: Icon, label }) => (
              <div key={label} className="relative flex w-[72px] flex-col items-center gap-1 px-1 py-1">
                {n && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-primary)] text-[9px] font-bold text-white">
                    {n}
                  </span>
                )}
                <Icon className="h-6 w-6 text-[var(--color-primary)]" strokeWidth={1.6} aria-hidden="true" />
                <span className="text-center text-[10px] leading-tight text-slate-700">
                  {n ? `${n}. ` : ''}
                  {label}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1 border-t border-slate-100 pt-0.5 text-center text-[9px] font-semibold text-[var(--color-primary)]">
            Подписи и печать
          </div>
        </div>
      </div>
    </div>
  );
};

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

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">{t.whereTitle}</h3>
            <p className="text-sm text-[var(--color-text-secondary)]">{t.whereBody}</p>
            <RibbonIllustration alt={t.ribbonAlt} />
          </div>

          <ol className="flex flex-col gap-3">
            {t.steps.map((step, i) => (
              <li key={step.title} className="flex gap-3 text-sm">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span>
                  <strong>
                    «{i + 1}. {step.title}»
                  </strong>{' '}
                  — {step.body}
                </span>
              </li>
            ))}
          </ol>

          <ul className="flex flex-col gap-1 text-sm text-[var(--color-text-secondary)]">
            {t.extras.map((e) => (
              <li key={e.name}>
                <strong className="text-[var(--color-text-primary)]">«{e.name}»</strong> — {e.body}
              </li>
            ))}
            <li>{t.hotkey}</li>
          </ul>

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
                  href="https://github.com/figmapng/pdf-stamp-studio/releases/download/v1.0.0-addin/PdfStampStudioSetup.exe"
                  target="_blank"
                  rel="noopener noreferrer"
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
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]" aria-hidden="true" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-danger)]" aria-hidden="true" />
              )}
              <span>{message.text}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
