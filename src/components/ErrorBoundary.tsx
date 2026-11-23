import { Component, type ErrorInfo, type JSX, type ReactNode } from 'react';

import { isLangReady, t } from '../../core/i18n.js';
import { loadLang } from '../lib/storage.js';

interface Props {
  children: ReactNode;
  onReload?: () => void;
}

/**
 * The last line of defence: a render error anywhere in the app shows a plain message and a reload button instead
 * of a blank page. It reads the saved language itself, because the app that knew it is the part that failed.
 */
export class ErrorBoundary extends Component<Readonly<Props>, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Saans could not render', error, info.componentStack);
  }

  override render(): JSX.Element {
    const { children, onReload = () => globalThis.location.reload() } = this.props;
    return this.state.failed ? <AppCrashed onReload={onReload} /> : <>{children}</>;
  }
}

function AppCrashed({ onReload }: Readonly<{ onReload: () => void }>) {
  const saved = loadLang();
  const lang = isLangReady(saved) ? saved : 'en';
  return (
    <main id="main" className="app-crashed" lang={lang}>
      <h1>{t(lang, 'appName')}</h1>
      <p role="alert" className="error">
        {t(lang, 'appCrashed')}
      </p>
      <button type="button" onClick={onReload}>
        {t(lang, 'reloadPage')}
      </button>
    </main>
  );
}
