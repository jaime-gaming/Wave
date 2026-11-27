import { Component, type ReactNode } from 'react';
import { translateNow } from '../i18n/dictionary';

export class AppError extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state: { crashed: boolean } = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(translateNow('Wave could not draw this screen:'), error);
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div className="app-crash" role="alert">
        <span className="app-crash-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <path
              d="M6 18c3-7 5-7 8 0s5 7 8 0 4-5 4-5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M23 6l3 3m0-3-3 3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="app-crash-eyebrow">Wave</span>
        <h1>{translateNow('We couldn’t open this screen')}</h1>
        <p>
          {translateNow(
            'Try again or return to Home. Reloading does not delete your library, but playback may stop.',
          )}
        </p>
        <div className="app-crash-actions">
          <button className="primary-button" onClick={() => location.reload()}>
            {translateNow('Reload Wave')}
          </button>
          <button
            className="tonal-button"
            onClick={() => {
              this.setState({ crashed: false });
            }}
          >
            {translateNow('Try this screen again')}
          </button>
          <a className="app-crash-home" href={import.meta.env.BASE_URL}>
            {translateNow('Return to Home')}
          </a>
        </div>
      </div>
    );
  }
}
