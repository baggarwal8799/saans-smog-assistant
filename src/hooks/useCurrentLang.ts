import { createContext, use } from 'react';

import type { Lang } from '../../core/types.js';

/** App provides the toggled language; ErrorBoundary sits outside it and reads the saved language itself. */
export const LanguageContext = createContext<Lang>('en');

/** The language to render in, for any component under App. The state and toggle live in useLanguageState. */
export function useCurrentLang(): Lang {
  return use(LanguageContext);
}
