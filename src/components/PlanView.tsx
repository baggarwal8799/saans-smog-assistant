import { co2Summary, doseHeadline, impactChips } from '../lib/chips';
import { formatNumber, t, tn } from '../lib/i18n';
import type { Lang, Plan, RecCategory, Recommendation } from '../lib/types';

interface Props {
  lang: Lang;
  plan: Plan;
}

const CATEGORIES: readonly RecCategory[] = ['routine', 'indoor', 'swap', 'community'];

function ImpactChips({ lang, rec }: Readonly<{ lang: Lang; rec: Recommendation }>) {
  return (
    <span className="chips">
      <span className="visually-hidden">{t(lang, 'impact')}: </span>
      {impactChips(rec.impact, lang).map((c) => (
        <span key={c.text} className={`chip ${c.kind}`}>
          {c.text}
        </span>
      ))}
    </span>
  );
}

/** One of the top three actions: full text visible, the working one tap away. */
function Step({ lang, rec }: Readonly<{ lang: Lang; rec: Recommendation }>) {
  return (
    <li className="step">
      <article aria-labelledby={`rec-${rec.id}`}>
        <h4 id={`rec-${rec.id}`} tabIndex={-1}>
          {rec.title}
        </h4>
        <p className="step-kind">{t(lang, rec.category)}</p>
        <p>{rec.detail}</p>
        <ImpactChips lang={lang} rec={rec} />
        <details className="why">
          <summary>
            {t(lang, 'whyNumber')}
            {/* Each toggle gets a distinct accessible name, so screen-reader users can tell them apart. */}
            <span className="visually-hidden">: {rec.title}</span>
          </summary>
          <p>{rec.impact.explanation}</p>
        </details>
      </article>
    </li>
  );
}

/** Everything else: one line with its impact, expanding to the detail and the working. */
function Row({ lang, rec }: Readonly<{ lang: Lang; rec: Recommendation }>) {
  return (
    <li className="row-item">
      <details>
        <summary>
          <span className="row-title" id={`rec-${rec.id}`}>
            {rec.title}
          </span>
          <ImpactChips lang={lang} rec={rec} />
        </summary>
        <div className="row-body">
          <p>{rec.detail}</p>
          <p className="row-why">
            <strong>{t(lang, 'whyNumber')}:</strong> {rec.impact.explanation}
          </p>
        </div>
      </details>
    </li>
  );
}

const STEP_HEADINGS = { safety: 'safetyHeading', first: 'doFirstHeading' } as const;

/** A numbered group of full steps: "Safety first" and "Do these first" share it. */
interface StepsProps {
  lang: Lang;
  kind: keyof typeof STEP_HEADINGS;
  recs: readonly Recommendation[];
}

function Steps({ lang, kind, recs }: Readonly<StepsProps>) {
  if (recs.length === 0) return null;
  return (
    <section aria-labelledby={`${kind}-heading`} className={`steps ${kind}`}>
      <h3 id={`${kind}-heading`}>{t(lang, STEP_HEADINGS[kind])}</h3>
      <ol className="steps-list">
        {recs.map((r) => (
          <Step key={r.id} lang={lang} rec={r} />
        ))}
      </ol>
    </section>
  );
}

function DoseBars({ lang, plan }: Readonly<Props>) {
  const { baselineUg, withPlanUg, people } = plan.dose;
  const each = baselineUg - withPlanUg;
  const width = (v: number) => `${Math.max(3, Math.round((v / Math.max(baselineUg, 1)) * 100))}%`;
  const rows = [
    { key: 'now', label: t(lang, 'doseToday'), value: baselineUg },
    { key: 'plan', label: t(lang, 'doseWithPlan'), value: withPlanUg },
  ] as const;
  return (
    <div className="dose">
      <p className="dose-label">{t(lang, 'doseLabel')}</p>
      <dl className="dose-rows">
        {rows.map((r) => (
          <div key={r.key} className={`dose-row ${r.key}`}>
            <dt>{r.label}</dt>
            <dd>
              <span className="dose-track" aria-hidden="true">
                <span className="dose-fill" style={{ width: width(r.value) }} />
              </span>
              <span className="dose-value">{formatNumber(lang, r.value)} µg</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="dose-cut">{doseHeadline(plan, lang)}</p>
      {people > 1 && each > 0 && (
        <p className="note">
          {t(lang, 'doseHousehold', {
            people: tn(lang, 'peopleCount', people),
            each: formatNumber(lang, each),
            total: formatNumber(lang, people * each),
          })}
        </p>
      )}
    </div>
  );
}

export function PlanView({ lang, plan }: Readonly<Props>) {
  // Life-safety items get their own group, so they never take a "Do these first" slot.
  const safety = plan.recommendations.filter((r) => r.safety);
  const urgent = plan.recommendations.filter((r) => !r.safety && r.priority === 1);
  const rest = plan.recommendations.filter((r) => !r.safety && r.priority !== 1);
  const summary = co2Summary(plan, lang);

  return (
    <section aria-labelledby="plan-heading" className="plan">
      <h2 id="plan-heading">{t(lang, 'planHeading')}</h2>

      <Steps lang={lang} kind="safety" recs={safety} />
      <Steps lang={lang} kind="first" recs={urgent} />

      <section aria-labelledby="impact-heading" className="impact-summary">
        <h3 id="impact-heading">{t(lang, 'impactHeading')}</h3>
        <DoseBars lang={lang} plan={plan} />
        <p className="co2-line">
          <span className="co2-label">{t(lang, 'co2Label')}: </span>
          {summary.strong ? <strong>{summary.text}</strong> : summary.text}
        </p>
        <p className="note">{t(lang, 'doseNote')}</p>
      </section>

      <section aria-labelledby="more-heading" className="more">
        <h3 id="more-heading">{t(lang, 'moreHeading')}</h3>
        {CATEGORIES.map((key) => {
          const recs = rest.filter((r) => r.category === key);
          if (recs.length === 0) return null;
          return (
            <section key={key} aria-labelledby={`cat-${key}`} className="category">
              <h4 id={`cat-${key}`}>{t(lang, key)}</h4>
              <ul className="rows">
                {recs.map((r) => (
                  <Row key={r.id} lang={lang} rec={r} />
                ))}
              </ul>
            </section>
          );
        })}
      </section>
    </section>
  );
}
