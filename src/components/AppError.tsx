import { Component, type ReactNode } from 'react';

/**
 * The one thing between a broken render and a blank page.
 *
 * Wave keeps everything on the device, so a screen that throws is a screen that
 * can be reloaded back to the same library — nothing is lost. What it must not do
 * is go white and silent, which is what an unhandled render error does to the
 * whole app. This keeps the page readable, says what happened in a sentence, and
 * offers the two honest ways out: reload, or start over with the library intact.
 */
export class AppError extends Component<{ children: ReactNode }, { message: string | null }> {
  state: { message: string | null } = { message: null };

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown) {
    // The console keeps the trace; the page keeps the person calm and moving.
    console.error('Wave could not draw this screen:', error);
  }

  render() {
    if (this.state.message === null) return this.props.children;
    return (
      <div className="app-crash" role="alert">
        <h1>Wave hit a snag drawing this screen.</h1>
        <p>
          Your music is still on this device and nothing was changed. Reload to carry on where you
          were.
        </p>
        <div className="app-crash-actions">
          <button className="primary-button" onClick={() => location.reload()}>
            Reload
          </button>
          <button
            className="tonal-button"
            onClick={() => {
              // A fresh start that keeps the library: the drawing state is what
              // broke, not the files.
              this.setState({ message: null });
            }}
          >
            Try this screen again
          </button>
        </div>
        <p className="app-crash-detail">{this.state.message}</p>
      </div>
    );
  }
}
