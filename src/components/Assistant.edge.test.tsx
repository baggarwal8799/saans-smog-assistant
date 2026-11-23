import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withInstantAnswers } from '../../test/assistantClient.js';
import { DELHI, profile } from '../../test/fixtures.js';
import { LanguageContext } from '../hooks/useCurrentLang.js';
import * as client from '../lib/assistantClient.js';
import { Assistant } from './Assistant.js';

vi.mock('../lib/assistantClient.js', (importOriginal) => withInstantAnswers(importOriginal));

const ask = vi.mocked(client.askAssistant);
const show = () =>
  render(
    <LanguageContext value="en">
      <Assistant place={DELHI} profile={profile()} />
    </LanguageContext>,
  );
const box = () => screen.getByLabelText('Your question');

describe('the question form', () => {
  it('sends nothing when the question is only spaces, even if the form is submitted', () => {
    ask.mockClear();
    show();
    fireEvent.change(box(), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
    fireEvent.submit(box().closest('form') as HTMLFormElement);
    expect(ask).not.toHaveBeenCalled();
  });

  it('flags a question over the limit, says the limit and will not send it', () => {
    show();
    fireEvent.change(box(), { target: { value: 'a'.repeat(client.QUESTION_MAX + 1) } });
    expect(box()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(`${client.QUESTION_MAX + 1}/${client.QUESTION_MAX}`, { exact: false })).toHaveTextContent(
      `Please keep your question under ${client.QUESTION_MAX} characters.`,
    );
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
  });

  it('at the limit is still valid and has no warning', () => {
    show();
    fireEvent.change(box(), { target: { value: 'a'.repeat(client.QUESTION_MAX) } });
    expect(box()).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByText(/Please keep your question/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Ask' })).toBeEnabled();
  });
});
