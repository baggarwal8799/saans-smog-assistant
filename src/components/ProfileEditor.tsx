import { useState } from 'react';
import { commuteKey, cookingKey, heatingKey, t, type MessageKey } from '../lib/i18n';
import { MAX_COMMUTE_KM } from '../lib/impact';
import { sanitizeProfile } from '../lib/profile';
import { COMMUTE_MODES, COOKING_FUELS, HEATING_TYPES, type Lang, type Profile } from '../lib/types';

/**
 * The household editor. It is its own chunk, loaded only when someone opens "Edit household", because most visits
 * read the plan for the sample or saved household and never change it.
 */
interface Props {
  lang: Lang;
  profile: Profile;
  /** Prefix for field ids; the form itself gets `${base}-form`, which the toggle button controls. */
  base: string;
  /** The id of the "saved on this device" note that describes the form. */
  describedBy: string;
  onChange: (profile: Profile) => void;
}

type BoolKey = 'hasChildren' | 'hasElderly' | 'hasRespiratory' | 'hasPurifier' | 'burnsWaste';
type NumKey = 'householdSize' | 'commuteKm' | 'exerciseMinutes';

const NUMBERS: readonly { key: NumKey; min: number; max: number; step: number }[] = [
  { key: 'householdSize', min: 1, max: 20, step: 1 },
  { key: 'commuteKm', min: 0, max: 100, step: 1 },
  { key: 'exerciseMinutes', min: 0, max: 240, step: 5 },
];
/** The distance box follows the per-mode bound sanitizeProfile applies, and says what it is. */
function commuteLimit(lang: Lang, p: Profile): { max: number; hint: string } {
  const max = MAX_COMMUTE_KM[p.commuteMode];
  const mode = t(lang, commuteKey(p.commuteMode));
  return { max, hint: t(lang, 'commuteKmHint', { max, mode: lang === 'en' ? mode.toLowerCase() : mode }) };
}

const BOOLS: readonly BoolKey[] = ['hasChildren', 'hasElderly', 'hasRespiratory', 'hasPurifier', 'burnsWaste'];

interface NumberFieldProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** A short line under the box, e.g. the distance limit for the chosen mode. */
  hint?: string;
  onCommit: (value: number) => void;
}

/**
 * Keeps the raw text while the user types, so clearing the box to retype does not snap back to a default.
 * Valid numbers are committed as they are typed; the box shows the cleaned value again once focus leaves.
 */
function NumberField({ id, label, value, min, max, step, hint, onCommit }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(e.target.valueAsNumber)) onCommit(e.target.valueAsNumber);
        }}
        onBlur={() => setDraft(null)}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="note">
          {hint}
        </p>
      )}
    </div>
  );
}

export function ProfileEditor({ lang, profile, base, describedBy, onChange }: Props) {
  const update = (patch: Partial<Profile>) => onChange(sanitizeProfile({ ...profile, ...patch }));
  const id = (k: string) => `${base}-${k}`;
  return (
  <form id={id('form')} className="grid" onSubmit={(e) => e.preventDefault()} aria-describedby={describedBy}>
    {NUMBERS.filter(({ key }) => !(key === 'commuteKm' && profile.commuteMode === 'wfh')).map(({ key, min, max, step }) => (
      <NumberField
        key={key}
        id={id(key)}
        label={t(lang, key as MessageKey)}
        value={profile[key]}
        min={min}
        {...(key === 'commuteKm' ? commuteLimit(lang, profile) : { max })}
        step={step}
        onCommit={(v) => update({ [key]: v })}
      />
    ))}

    <div className="field">
      <label htmlFor={id('commute')}>{t(lang, 'commuteMode')}</label>
      <select id={id('commute')} value={profile.commuteMode} onChange={(e) => update({ commuteMode: e.target.value as Profile['commuteMode'] })}>
        {COMMUTE_MODES.map((m) => (
          <option key={m} value={m}>
            {t(lang, commuteKey(m))}
          </option>
        ))}
      </select>
    </div>

    <div className="field">
      <label htmlFor={id('cooking')}>{t(lang, 'cooking')}</label>
      <select id={id('cooking')} value={profile.cooking} onChange={(e) => update({ cooking: e.target.value as Profile['cooking'] })}>
        {COOKING_FUELS.map((f) => (
          <option key={f} value={f}>
            {t(lang, cookingKey(f))}
          </option>
        ))}
      </select>
    </div>

    <div className="field">
      <label htmlFor={id('heating')}>{t(lang, 'heating')}</label>
      <select id={id('heating')} value={profile.heating} onChange={(e) => update({ heating: e.target.value as Profile['heating'] })}>
        {HEATING_TYPES.map((h) => (
          <option key={h} value={h}>
            {t(lang, heatingKey(h))}
          </option>
        ))}
      </select>
    </div>

    <fieldset className="checks">
      <legend className="visually-hidden">{t(lang, 'profileHeading')}</legend>
      {BOOLS.map((key) => (
        <div className="check" key={key}>
          <input id={id(key)} type="checkbox" checked={profile[key]} onChange={(e) => update({ [key]: e.target.checked })} />
          <label htmlFor={id(key)}>{t(lang, key)}</label>
        </div>
      ))}
    </fieldset>
  </form>
  );
}
