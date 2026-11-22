import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DELHI, profile } from '../test/fixtures';
import { AirRibbon } from './AirRibbon';
import { toBlocks } from './AnswerText';
import { LocationPicker } from './LocationPicker';
import { householdLine } from './ProfileForm';

describe('AirRibbon with no forecast', () => {
  it('renders nothing rather than an empty chart', () => {
    const { container } = render(<AirRibbon lang="en" hours={[]} best={null} worst={null} stayIn={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('AnswerText bullet glyphs inside a sentence', () => {
  it.each([
    ['no space before it', 'PM2.5 rose 50•80 µg/m³ today.'],
    ['no space after it', 'Keep the windows shut •all evening.'],
  ])('a • with %s stays in the paragraph, not a list', (_label, text) => {
    expect(toBlocks(text)).toEqual([{ kind: 'p', text }]);
  });
});

describe('householdLine', () => {
  it('names elderly members and a heart or lung condition when the household has them', () => {
    const line = householdLine('en', profile({ hasChildren: false, hasElderly: true, hasRespiratory: true }));
    expect(line).toContain('elderly, heart or lung condition');
    expect(line).not.toContain('children');
  });

  it('leaves both out when nobody is elderly or has a condition', () => {
    const line = householdLine('en', profile({ hasElderly: false, hasRespiratory: false }));
    expect(line).not.toContain('elderly');
    expect(line).not.toContain('heart or lung condition');
  });
});

describe('LocationPicker while changing a chosen place', () => {
  it('shows the search with a compact heading and no opening lede', async () => {
    render(<LocationPicker lang="en" selected={DELHI} onSelect={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Change place' }));
    const heading = screen.getByRole('heading', { name: 'How’s the air where you are?' });
    expect(heading).toHaveClass('locate-title', 'compact');
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(document.querySelector('.locate-lede')).toBeNull();
  });
});
