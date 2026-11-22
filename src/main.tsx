import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadDictionary } from './lib/i18n';
import { loadLang } from './lib/profile';
// Weight files, not subset files: only these carry unicode-range, so English pages skip the Devanagari woff2s.
import '@fontsource/baloo-2/600.css';
import '@fontsource/baloo-2/800.css';
import '@fontsource/mukta/400.css';
import '@fontsource/mukta/600.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/topbar.css';
import './styles/sky.css';
import './styles/reading.css';
import './styles/ribbon.css';
import './styles/workspace.css';
import './styles/plan.css';
import './styles/rows.css';
import './styles/loading.css';

// Someone who chose Hindi gets it from the first frame: the Hindi chunk is requested before React starts, and the
// first render waits for it, so the page never flashes English. If it cannot load (offline), the page starts in English.
const savedLang = loadLang();
const ready = savedLang === 'en' ? Promise.resolve() : loadDictionary(savedLang).catch(() => undefined);

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');
const mount = root;
void ready.then(() =>
  createRoot(mount).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
