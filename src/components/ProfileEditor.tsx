import { type ReactElement, useState } from 'react';

import { commuteKey, cookingKey, heatingKey, type MessageKey, t } from '../../core/i18n.js';
import { MAX_COMMUTE_KM } from '../../core/impact.js';
import { EXERCISE_MINUTES_RANGE, HOUSEHOLD_SIZE_RANGE, sanitizeProfile } from '../../core/profile.js';
import { COMMUTE_MODES, COOKING_FUELS, HEATING_TYPES, type Lang, type Profile } from '../../core/types.js';
import { useCurrentLang } from '../hooks/useCurrentLang.js';

interface Props {
  profile: Profile;
  /** Prefix for field ids; the form itself gets `${base}-form`, which the toggle button controls. */
  base: string;
  describedBy: string;
  onChange: (profile: Profile) => void;
}

const BOOLS = ['hasChildren', 'hasElderly', 'hasRespiratory', 'hasPurifier', 'burnsWaste'] as const;
type NumKey = Extract<keyof Profile & MessageKey, 'householdSize' | 'commuteKm' | 'exerciseMinutes'>;

/** 'byMode': the distance box takes its bound from the chosen commute mode. */
const NUMBERS: readonly { key: NumKey; min: number; max: number | 'byMode'; step: number }[] = [
  { key: 'householdSize', ...HOUSEHOLD_SIZE_RANGE, step: 1 },
  { key: 'commuteKm', min: 0, max: 'byMode', step: 1 },
  { key: 'exerciseMinutes', ...EXERCISE_MINUTES_RANGE, step: 5 },
];
/** The same per-mode bound the saved household is clamped to, so the box and the plan agree. */
function commuteLimit(lang: Lang, p: Profile): { max: number; hint: string } {
  const max = MAX_COMMUTE_KM[p.commuteMode];
  const mode = t(lang, commuteKey(p.commuteMode));
  return { max, hint: t(lang, 'commuteKmHint', { max, mode: lang === 'en' ? mode.toLowerCase() : mode }) };
}

interface NumberFieldProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hint?: string | undefined;
  onCommit: (value: number) => void;
}

/**
 * Keeps the raw text while the user types, so clearing the box to retype does not snap back to a default.
 * Valid numbers are committed as they are typed; the box shows the cleaned value again once focus leaves.
 */
function NumberField({ id, label, value, min, max, step, hint, onCommit }: Readonly<NumberFieldProps>) {
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

interface SelectFieldProps<T extends string> {
  id: string;
  label: string;
  value: T;
  options: readonly T[];
  optionLabel: (option: T) => string;
  onChange: (value: T) => void;
}

function SelectField<T extends string>(props: Readonly<SelectFieldProps<T>>) {
  const { id, label, value, options, optionLabel, onChange } = props;
  // The DOM types the value as any string, so match it to an option rather than cast.
  const choose = (v: string) => {
    const picked = options.find((o) => o === v);
    if (picked !== undefined) onChange(picked);
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => choose(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {optionLabel(o)}
          </option>
        ))}
      </select>
    </div>
  );
}

interface PartProps {
  profile: Profile;
  id: (k: string) => string;
  update: (patch: Partial<Profile>) => void;
}

/** A household that works from home has no commute, so its distance box is left out. */
const shownNumbers = (p: Profile) => NUMBERS.filter(({ key }) => !(key === 'commuteKm' && p.commuteMode === 'wfh'));

const boundOf = (lang: Lang, p: Profile, max: number | 'byMode'): { max: number; hint?: string } =>
  max === 'byMode' ? commuteLimit(lang, p) : { max };

function NumberFields({ profile, id, update }: Readonly<PartProps>) {
  const lang = useCurrentLang();
  const fields = shownNumbers(profile).map((field) => ({ ...field, ...boundOf(lang, profile, field.max) }));
  return (
    <>
      {fields.map(({ key, min, max, hint, step }) => (
        <NumberField
          key={key}
          id={id(key)}
          label={t(lang, key)}
          value={profile[key]}
          min={min}
          max={max}
          hint={hint}
          step={step}
          onCommit={(v) => update({ [key]: v })}
        />
      ))}
    </>
  );
}

function HouseholdChecks({ profile, id, update }: Readonly<PartProps>) {
  const lang = useCurrentLang();
  return (
    <fieldset className="checks">
      <legend className="visually-hidden">{t(lang, 'profileHeading')}</legend>
      {BOOLS.map((key) => (
        <div className="check" key={key}>
          <input
            id={id(key)}
            type="checkbox"
            checked={profile[key]}
            onChange={(e) => update({ [key]: e.target.checked })}
          />
          <label htmlFor={id(key)}>{t(lang, key)}</label>
        </div>
      ))}
    </fieldset>
  );
}

/** Its own chunk, loaded on "Edit household": most visits read the plan and never change the household. */
export function ProfileEditor({ profile, base, describedBy, onChange }: Readonly<Props>): ReactElement {
  const lang = useCurrentLang();
  const update = (patch: Partial<Profile>) => onChange(sanitizeProfile({ ...profile, ...patch }));
  const id = (k: string) => `${base}-${k}`;
  return (
    <form id={id('form')} className="grid" onSubmit={(e) => e.preventDefault()} aria-describedby={describedBy}>
      <NumberFields profile={profile} id={id} update={update} />

      <SelectField
        id={id('commute')}
        label={t(lang, 'commuteMode')}
        value={profile.commuteMode}
        options={COMMUTE_MODES}
        optionLabel={(o) => t(lang, commuteKey(o))}
        onChange={(commuteMode) => update({ commuteMode })}
      />

      <SelectField
        id={id('cooking')}
        label={t(lang, 'cooking')}
        value={profile.cooking}
        options={COOKING_FUELS}
        optionLabel={(o) => t(lang, cookingKey(o))}
        onChange={(cooking) => update({ cooking })}
      />

      <SelectField
        id={id('heating')}
        label={t(lang, 'heating')}
        value={profile.heating}
        options={HEATING_TYPES}
        optionLabel={(o) => t(lang, heatingKey(o))}
        onChange={(heating) => update({ heating })}
      />

      <HouseholdChecks profile={profile} id={id} update={update} />
    </form>
  );
}
