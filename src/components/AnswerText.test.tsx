import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AnswerText, toBlocks } from './AnswerText.js';

describe('AnswerText', () => {
  it('turns bullet lines into a real list and keeps other lines as paragraphs', () => {
    expect(toBlocks('No, not this evening.\n• Keep them in\n- Air the house at 14:00\n\nTotal: 40% less.')).toEqual([
      { kind: 'p', text: 'No, not this evening.' },
      { kind: 'ul', items: ['Keep them in', 'Air the house at 14:00'] },
      { kind: 'p', text: 'Total: 40% less.' },
    ]);
  });

  it('also splits bullets the model put on a single line', () => {
    expect(toBlocks('No, he should stay in. • Walk indoors at 10:00. • Wear an N95 outside.')).toEqual([
      { kind: 'p', text: 'No, he should stay in.' },
      { kind: 'ul', items: ['Walk indoors at 10:00.', 'Wear an N95 outside.'] },
    ]);
  });

  it('renders text only, so model output cannot inject markup', () => {
    render(<AnswerText text={'<img src=x onerror=alert(1)>\n• <b>bold</b>'} />);
    expect(screen.getByRole('list')).toHaveTextContent('<b>bold</b>');
    expect(document.querySelector('img')).toBeNull();
  });
});
