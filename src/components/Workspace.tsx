import { type ReactElement, Suspense, useState } from 'react';

import { COORD_DECIMALS, placeKey } from '../../core/place.js';
import type { AirReport, Place, Plan, Profile } from '../../core/types.js';
import { useCurrentLang } from '../hooks/useCurrentLang.js';
import { answerContextId } from '../lib/answerContext.js';
import { lazyPart } from './lazyPart.js';
import { PlanView } from './PlanView.js';
import { ProfileForm } from './ProfileForm.js';
import { AnswerSkeleton, PlanSkeleton } from './Skeleton.js';

// Ask Saans (with its answer renderer and API client) is its own chunk. It is fetched as soon as a place is set, in
// parallel with the air data, so it is ready by the time the plan renders: no waterfall, and nothing on first paint.
const loadAssistant = () => import('./Assistant.js');
const Assistant = lazyPart(() => loadAssistant().then((m) => m.Assistant));

/** A failure here is shown later by lazyPart, where the part would render. */
export function preloadAssistant(): void {
  loadAssistant().catch(() => undefined);
}

interface Household {
  profile: Profile;
  sample: boolean;
  onEdit: (p: Profile) => void;
}

interface Results {
  report: AirReport | null;
  plan: Plan | null;
  loading: boolean;
}

interface Props {
  place: Place;
  household: Readonly<Household>;
  results: Readonly<Results>;
}

export function Workspace({ place, household, results }: Readonly<Props>): ReactElement {
  const lang = useCurrentLang();
  const { report, plan, loading } = results;
  // Gemini explains the first plan at each place on its own. Household edits and the language toggle keep the
  // "Explain my plan" button instead, so clicking through the form never spends the free AI quota.
  const [summarized, setSummarized] = useState<ReadonlySet<string>>(() => new Set());
  const summaryKey = placeKey(place, COORD_DECIMALS.summary);

  return (
    <div className="workspace">
      <div className="household-area">
        <ProfileForm profile={household.profile} sample={household.sample} onChange={household.onEdit} />
      </div>
      <PlanArea plan={plan} loading={loading} />
      {report && (
        <div className="ask-area">
          <Suspense fallback={<AnswerSkeleton />}>
            <Assistant
              key={answerContextId({ lang, place, profile: household.profile, at: report.current.time })}
              place={place}
              profile={household.profile}
              autoSummary={!summarized.has(summaryKey)}
              onAutoSummary={() => setSummarized((s) => new Set(s).add(summaryKey))}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}

function PlanArea({ plan, loading }: Readonly<Pick<Results, 'plan' | 'loading'>>) {
  if (!plan && !loading) return null;
  return <div className="plan-area">{plan ? <PlanView plan={plan} /> : <PlanSkeleton />}</div>;
}
