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

// Hindi users get Hindi from the first frame: the first render waits for the Hindi chunk, so English never flashes.
// If it cannot load (offline), the page starts in English.
const savedLang = loadLang();
const ready = savedLang === 'en' ? Promise.resolve() : loadDictionary(savedLang).catch(() => undefined);

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');
const mount = root;
// ready never rejects (a failed Hindi load is caught above), so there is nothing to handle.
void ready.then(() => {
  createRoot(mount).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
