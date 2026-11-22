import { describe, expect, it } from 'vitest';
import { profile, report } from '../test/fixtures';
import { bandGuidance, outdoorFacts } from './verdict';

describe('bandGuidance names only the sensitive members the household has', () => {
  it('skips older adults when there are none', () => {
    const line = bandGuidance(161, profile({ hasChildren: true, hasElderly: false, hasRespiratory: true }));
    expect(line).toContain('This household has children, someone with a heart or lung condition (US EPA');
    expect(line).not.toContain('older adults');
  });

  it('names older adults when the household has them', () => {
    const line = bandGuidance(161, profile({ hasChildren: false, hasElderly: true, hasRespiratory: false }));
    expect(line).toContain('This household has older adults (US EPA sensitive groups)');
  });

  it('adds no household note when nobody is in a sensitive group', () => {
    const line = bandGuidance(161, profile({ hasChildren: false, hasElderly: false, hasRespiratory: false }));
    expect(line).toMatch(/^US EPA guidance for .* air \(US AQI .*\): .*\.$/);
    expect(line).not.toContain('This household');
  });
});

describe('outdoorFacts for an asked time the forecast does not reach', () => {
  it('judges it on the current reading instead of inventing a forecast', () => {
    const f = outdoorFacts('Can I go for a walk at 7:30?', { ...report({ usAqi: 161 }), hourly: [] }, profile());
    expect(f.lines[0]).toMatch(/^US EPA activity guidance at 07:30 \(US AQI ≈ 161\)/);
  });
});
