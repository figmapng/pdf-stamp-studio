import React, { useId } from 'react';
import { ShieldCheck, Trash2 } from 'lucide-react';
import type { DetectionThresholds, OcrConfig } from '../../types';
import type { Translations } from '../../i18n';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Select,
  Switch,
} from '../ui';

interface SettingsPanelProps {
  ocrConfig: OcrConfig;
  onOcrConfigChange: (next: OcrConfig) => void;
  enableOpenCv: boolean;
  onEnableOpenCvChange: (next: boolean) => void;
  thresholds: DetectionThresholds;
  onThresholdsChange: (next: DetectionThresholds) => void;
  rememberProfiles: boolean;
  onRememberProfilesChange: (next: boolean) => void;
  onClearSavedPreferences: () => void;
  t: Translations;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  ocrConfig,
  onOcrConfigChange,
  enableOpenCv,
  onEnableOpenCvChange,
  thresholds,
  onThresholdsChange,
  rememberProfiles,
  onRememberProfilesChange,
  onClearSavedPreferences,
  t,
}) => {
  const scaleId = useId();
  const opencvId = useId();
  const cdnId = useId();
  const rememberId = useId();
  const minScoreId = useId();
  const marginId = useId();

  const toggleLanguage = (lang: string) => {
    const exists = ocrConfig.languages.includes(lang);
    const nextLangs = exists
      ? ocrConfig.languages.filter((l) => l !== lang)
      : [...ocrConfig.languages, lang];
    onOcrConfigChange({
      ...ocrConfig,
      languages: nextLangs.length > 0 ? nextLangs : ['rus'],
    });
  };

  return (
    <section aria-labelledby="settings-heading" className="space-y-6">
      <h2 id="settings-heading" className="text-xl font-bold text-[var(--color-text-primary)]">
        {t.settings.heading}
      </h2>

      {/* Privacy Card */}
      <div className="space-y-2 rounded-[var(--radius-lg)] border border-emerald-200 bg-[var(--color-success-subtle)] p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-success)]">
          <ShieldCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          <h3>{t.settings.privacyTitle}</h3>
        </div>
        <p className="text-xs leading-relaxed text-[var(--color-success)]">
          {t.settings.privacyDesc}
        </p>
      </div>

      <details className="group rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--color-text-primary)]">
          {t.settings.advancedTitle}
        </summary>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        {/* OCR & CV settings */}
        <Card>
          <CardContent className="space-y-4">
            <fieldset>
              <legend className="text-sm font-semibold text-[var(--color-text-primary)]">
                {t.settings.ocrLangsLabel}
              </legend>
              <div className="mt-2.5 flex flex-wrap gap-4">
                {[
                  { code: 'kaz', label: 'Қазақша (kaz)' },
                  { code: 'rus', label: 'Русский (rus)' },
                  { code: 'eng', label: 'Latin / English (eng)' },
                ].map((item) => (
                  <Checkbox
                    key={item.code}
                    checked={ocrConfig.languages.includes(item.code)}
                    onChange={() => toggleLanguage(item.code)}
                    label={item.label}
                  />
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={scaleId}
                className="text-xs font-semibold text-[var(--color-text-secondary)]"
              >
                {t.settings.ocrScaleLabel}
              </label>
              <Select
                id={scaleId}
                value={ocrConfig.renderScale}
                onChange={(e) =>
                  onOcrConfigChange({ ...ocrConfig, renderScale: Number(e.target.value) })
                }
              >
                <option value={1.5}>{t.settings.scaleFast}</option>
                <option value={2.0}>{t.settings.scaleBalanced}</option>
                <option value={2.5}>{t.settings.scaleHigh}</option>
              </Select>
            </div>

            <div className="pt-1">
              <Switch
                id={opencvId}
                checked={enableOpenCv}
                onCheckedChange={onEnableOpenCvChange}
                label={t.settings.openCvLabel}
              />
            </div>

            <Checkbox
              id={cdnId}
              checked={ocrConfig.allowCdnFallback}
              onChange={(e) =>
                onOcrConfigChange({ ...ocrConfig, allowCdnFallback: e.target.checked })
              }
              label={t.settings.allowCdnLabel}
            />
          </CardContent>
        </Card>

        {/* Thresholds & Local Storage opt-in */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t.settings.thresholdsTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={minScoreId}
                  className="text-xs font-semibold text-[var(--color-text-secondary)]"
                >
                  {t.settings.minScoreLabel}
                </label>
                <Input
                  id={minScoreId}
                  type="number"
                  step={0.02}
                  min={0.5}
                  max={0.98}
                  className="font-mono tabular-nums"
                  value={thresholds.autoReadyMinScore}
                  onChange={(e) =>
                    onThresholdsChange({
                      ...thresholds,
                      autoReadyMinScore: Math.max(0.5, Math.min(0.98, Number(e.target.value) || 0.78)),
                    })
                  }
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={marginId}
                  className="text-xs font-semibold text-[var(--color-text-secondary)]"
                >
                  {t.settings.ambiguityMarginLabel}
                </label>
                <Input
                  id={marginId}
                  type="number"
                  step={0.01}
                  min={0.02}
                  max={0.3}
                  className="font-mono tabular-nums"
                  value={thresholds.ambiguityMargin}
                  onChange={(e) =>
                    onThresholdsChange({
                      ...thresholds,
                      ambiguityMargin: Math.max(0.02, Math.min(0.3, Number(e.target.value) || 0.08)),
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-3 border-t border-[var(--color-border-subtle)] pt-3">
              <Checkbox
                id={rememberId}
                checked={rememberProfiles}
                onChange={(e) => onRememberProfilesChange(e.target.checked)}
                label={t.settings.rememberTextProfilesLabel}
              />

              <Button variant="destructive" size="sm" onClick={onClearSavedPreferences}>
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                {t.settings.clearPrefsBtn}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      </details>

    </section>
  );
};
