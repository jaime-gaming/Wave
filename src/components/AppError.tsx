import { Component, type ReactNode } from 'react';

/**
 * The one thing between a broken render and a blank page.
 *
 * Wave keeps everything on the device, so a screen that throws is a screen that
 * can be reloaded back to the same library — nothing is lost. What it must not do
 * is go white and silent, which is what an unhandled render error does to the
 * whole app.
 *
 * The page is written for the person looking at it, not for a console: no stack
 * trace, no error text, no file names. It says what happened in one sentence,
 * promises what was not touched, and offers the two honest ways out. The reason
 * itself goes to the console, where it is useful and where nobody has to read it.
 */
export class AppError extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state: { crashed: boolean } = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: unknown) {
    // The console keeps the trace; the page keeps the person calm and moving.
    console.error('Wave could not draw this screen:', error);
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div className="app-crash" role="alert">
        {/* A record that has stopped turning: the bars are where the sound was. */}
        <span className="app-crash-mark" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <h1>This screen stopped. Your music didn’t.</h1>
        <p>
          Nothing on this device was changed. Reload to carry on where you were — the player picks
          up from the same place.
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
              this.setState({ crashed: false });
            }}
          >
            Try this screen again
          </button>
        </div>
      </div>
    );
  }
}
