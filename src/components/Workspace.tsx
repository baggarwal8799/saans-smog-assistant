import { Suspense, useMemo, useState } from 'react';
import type { AirReport, Lang, Place, Plan, Profile } from '../lib/types';
import { lazyPart } from './lazyPart';
import { PlanView } from './PlanView';
import { ProfileForm } from './ProfileForm';
import { AnswerSkeleton, PlanSkeleton } from './Skeleton';

// Ask Saans (with its answer renderer and API client) is its own chunk. It is fetched as soon as a place is set, in
// parallel with the air data, so it is ready by the time the plan renders: no waterfall, and nothing on first paint.
const loadAssistant = () => import('./Assistant');
const Assistant = lazyPart(() => loadAssistant().then((m) => m.Assistant));

/** Start fetching the Ask Saans chunk; a failure here is shown later by lazyPart, where the part would render. */
export function preloadAssistant(): void {
  loadAssistant().catch(() => undefined);
}

interface Props {
  lang: Lang;
  place: Place;
  household: Profile;
  sample: boolean;
  onEditProfile: (p: Profile) => void;
  report: AirReport | null;
  plan: Plan | null;
  loading: boolean;
}

/** The household form, the plan and Ask Saans, shown once a place is set. */
export function Workspace({ lang, place, household, sample, onEditProfile, report, plan, loading }: Readonly<Props>) {
  // Gemini explains the first plan at each place on its own. Household edits and the language toggle keep the
  // "Explain my plan" button instead, so clicking through the form never spends the free AI quota.
  const [summarized, setSummarized] = useState<ReadonlySet<string>>(() => new Set());
  const placeKey = `${place.lat.toFixed(3)},${place.lon.toFixed(3)}`;
  // Remount the assistant whenever its inputs change, so an old answer never describes a different situation.
  const assistantKey = useMemo(
    () => (report ? JSON.stringify({ lang, place, profile: household, at: report.current.time }) : ''),
    [lang, place, household, report],
  );

  return (
    <div className="workspace">
      <div className="household-area">
        <ProfileForm lang={lang} profile={household} sample={sample} onChange={onEditProfile} />
      </div>
      {plan ? (
        <div className="plan-area">
          <PlanView lang={lang} plan={plan} />
        </div>
      ) : (
        loading && (
          <div className="plan-area">
            <PlanSkeleton />
          </div>
        )
      )}
      {report && (
        <div className="ask-area">
          <Suspense fallback={<AnswerSkeleton />}>
            <Assistant
              key={assistantKey}
              lang={lang}
              place={place}
              profile={household}
              autoSummary={!summarized.has(placeKey)}
              onAutoSummary={() => setSummarized((s) => new Set(s).add(placeKey))}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
