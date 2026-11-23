import { describe, expect, it } from 'vitest';

import { profile, report } from '../test/fixtures.js';
import { bandFact, outdoorFacts } from './verdict.js';

describe('bandFact names only the sensitive members the household has', () => {
  it.each([
    [{ hasChildren: true, hasElderly: false, hasRespiratory: true }, ['children', 'heartOrLung']],
    [{ hasChildren: false, hasElderly: true, hasRespiratory: false }, ['olderAdults']],
    [{ hasChildren: false, hasElderly: false, hasRespiratory: false }, []],
  ])('%j → %j', (flags, members) => {
    expect(bandFact(161, profile(flags))).toEqual({ level: 'unhealthy', members });
  });
});

describe('outdoorFacts for an asked time the forecast does not reach', () => {
  it('judges it on the current reading instead of inventing a forecast', () => {
    const f = outdoorFacts('Can I go for a walk at 7:30?', { ...report({ usAqi: 161 }), hourly: [] }, profile());
    expect(f.moments.map((m) => [m.time, m.aqi])).toEqual([[{ hours: [7], minute: 30, dayPart: null }, 161]]);
  });
});
