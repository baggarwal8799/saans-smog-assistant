import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import { resetCooldowns } from '../../api/_lib/cooldown';

// The app waits on purpose (the 1.2 s auto-summary delay), and a coverage run slows every render. The default 1 s
// wait for findBy/waitFor is shorter than that delay, so a loaded machine failed tests that were correct.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  // A model's quota cooldown is module state; each test starts with every model available.
  resetCooldowns();
  // Typed as always present, but absent in the node environment the server tests use.
  (globalThis.localStorage as Storage | undefined)?.clear();
});
