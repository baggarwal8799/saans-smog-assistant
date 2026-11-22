import { Suspense, useId, useState } from 'react';
import { commuteKey, cookingKey, heatingKey, t, tn } from '../lib/i18n';
import type { Lang, Profile } from '../lib/types';
import { lazyPart } from './lazyPart';
import { FieldsSkeleton } from './Skeleton';

// The editor is fetched on first use, and already on hover or focus of "Edit household", so a click rarely waits.
const loadEditor = () => import('./ProfileEditor');
const ProfileEditor = lazyPart(() => loadEditor().then((m) => m.ProfileEditor));

interface Props {
  lang: Lang;
  profile: Profile;
  /** True while the household is the sample one the app starts with. */
  sample?: boolean;
  onChange: (profile: Profile) => void;
}

/** "4 people, children, car 10 km, LPG cylinder, no heating": what the plan currently assumes. */
export function householdLine(lang: Lang, p: Profile): string {
  const parts = [
    tn(lang, 'peopleCount', p.householdSize),
    p.hasChildren ? t(lang, 'withChildren') : '',
    p.hasElderly ? t(lang, 'withElderly') : '',
    p.hasRespiratory ? t(lang, 'withPatient') : '',
    p.commuteMode === 'wfh' ? t(lang, commuteKey('wfh')) : `${t(lang, commuteKey(p.commuteMode))} ${p.commuteKm} km`,
    t(lang, cookingKey(p.cooking)),
    t(lang, heatingKey(p.heating)),
    p.hasPurifier ? t(lang, 'withPurifier') : '',
  ];
  return parts.filter(Boolean).join(', ');
}

const prefetch = (): void => void loadEditor().catch(() => undefined);

export function ProfileForm({ lang, profile, sample = false, onChange }: Props) {
  const base = useId();
  const [editing, setEditing] = useState(false);
  const id = (k: string) => `${base}-${k}`;

  return (
    <section aria-labelledby="profile-heading" className="household">
      <div className="household-head">
        <h2 id="profile-heading">{t(lang, 'profileHeading')}</h2>
        <button
          type="button"
          className="ghost"
          aria-expanded={editing}
          aria-controls={editing ? id('form') : undefined}
          onPointerEnter={prefetch}
          onFocus={prefetch}
          onClick={() => setEditing((v) => !v)}
        >
          {t(lang, editing ? 'doneEditing' : 'editHousehold')}
        </button>
      </div>
      <p className="household-line">{householdLine(lang, profile)}</p>
      {!editing && <p className={sample ? 'note sample-note' : 'note'}>{t(lang, sample ? 'householdSample' : 'householdHint')}</p>}
      {editing && (
        <Suspense
          fallback={
            // Holds the form's id while it loads, so the button never controls a missing element.
            <div id={id('form')} role="status" aria-busy="true">
              <span className="visually-hidden">{t(lang, 'loadingForm')}</span>
              <FieldsSkeleton />
            </div>
          }
        >
          <ProfileEditor lang={lang} profile={profile} base={base} describedBy={id('saved')} onChange={onChange} />
        </Suspense>
      )}
      <p id={id('saved')} className="note">
        {t(lang, 'profileSaved')}
      </p>
    </section>
  );
}
