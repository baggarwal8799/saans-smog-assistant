import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { profile } from '../test/fixtures';
import { ProfileEditor } from './ProfileEditor';
import { ProfileForm, householdLine } from './ProfileForm';

const editor = (lang: 'en' | 'hi', p: ReturnType<typeof profile>, onChange = vi.fn()) =>
  render(<ProfileEditor lang={lang} profile={p} base="h" describedBy="saved" onChange={onChange} />);

describe('ProfileForm commute distance', () => {
  it('bounds the distance box by the chosen mode and says the bound', () => {
    editor('en', profile({ commuteMode: 'walk', commuteKm: 5 }));
    const box = screen.getByLabelText('One-way commute distance (km)', { selector: 'input' });
    expect(box).toHaveAttribute('max', '10');
    expect(box).toHaveAccessibleDescription('Up to 10 km one way for walk.');
  });

  it('clamps a typed distance to the mode bound, in Hindi too', () => {
    const onChange = vi.fn();
    editor('hi', profile({ commuteMode: 'bicycle', commuteKm: 5 }), onChange);
    const box = screen.getByLabelText('एक तरफ़ की दूरी (किमी)', { selector: 'input' });
    expect(box).toHaveAccessibleDescription('साइकिल: एक तरफ़ ज़्यादा से ज़्यादा 30 किमी।');
    fireEvent.change(box, { target: { value: '80' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ commuteMode: 'bicycle', commuteKm: 30 }));
  });
});

describe('ProfileForm loads its editor on demand', () => {
  it('has no form in the page until "Edit household" is opened, then shows a busy placeholder and the fields', async () => {
    const user = userEvent.setup();
    const { container } = render(<ProfileForm lang="en" profile={profile({})} onChange={() => undefined} />);
    const edit = screen.getByRole('button', { name: 'Edit household' });
    expect(container.querySelector('form')).toBeNull();
    // Nothing to control while closed, so no dangling aria-controls.
    expect(edit).not.toHaveAttribute('aria-controls');
    await user.click(edit);
    const done = screen.getByRole('button', { name: 'Done' });
    const controlled = () => document.getElementById(done.getAttribute('aria-controls') ?? '');
    // The placeholder or the form always carries the controlled id.
    expect(controlled()).not.toBeNull();
    expect(await screen.findByLabelText('People at home')).toBeInTheDocument();
    expect(controlled()?.tagName).toBe('FORM');
    await user.click(done);
    expect(container.querySelector('form')).toBeNull();
  });

  it('prefetches the editor on hover and focus without opening it', () => {
    const { container } = render(<ProfileForm lang="en" profile={profile({})} onChange={() => undefined} />);
    const edit = screen.getByRole('button', { name: 'Edit household' });
    fireEvent.pointerEnter(edit);
    fireEvent.focus(edit);
    expect(edit).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('form')).toBeNull();
  });
});

describe('householdLine', () => {
  it('counts one person in the singular, in English and Hindi', () => {
    expect(householdLine('en', profile({ householdSize: 1, hasChildren: false }))).toMatch(/^1 person, /);
    expect(householdLine('en', profile({ householdSize: 3 }))).toMatch(/^3 people, /);
    expect(householdLine('hi', profile({ householdSize: 1 }))).toMatch(/^1 व्यक्ति, /);
    expect(householdLine('hi', profile({ householdSize: 3 }))).toMatch(/^3 लोग, /);
  });
});
