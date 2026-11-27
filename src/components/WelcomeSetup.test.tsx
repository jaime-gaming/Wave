import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { WelcomeSetup } from './WelcomeSetup';

const props = () => ({
  animations: false,
  onAnimations: vi.fn(),
  largeText: false,
  onLargeText: vi.fn(),
  theme: 'system' as const,
  onTheme: vi.fn(),
  name: '',
  onName: vi.fn(),
  automaticLyrics: false,
  onAutomaticLyrics: vi.fn(),
  wordSources: false,
  onWordSources: vi.fn(),
  mixEnabled: false,
  onMixEnabled: vi.fn(),
  volumeFix: false,
  onVolumeFix: vi.fn(),
  progress: null,
  error: '',
  message: '',
  onAdd: vi.fn(),
  onFinish: vi.fn(),
});
it('introduces one step at a time, offers preferences and does not finish on add', async () => {
  const options = props();
  const user = userEvent.setup();
  render(<WelcomeSetup {...options} />);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Get started' }));
  expect(await screen.findByRole('textbox', { name: 'Your name' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  expect(await screen.findByRole('switch', { name: 'Larger text' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  expect(await screen.findByRole('switch', { name: 'Fix volume' })).toBeInTheDocument();
  await user.click(screen.getByRole('switch', { name: 'Mix' }));
  expect(options.onMixEnabled).toHaveBeenCalledWith(true);
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  expect(await screen.findByRole('switch', { name: 'Find lyrics automatically' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  expect(await screen.findByRole('switch', { name: 'Try more lyrics sources' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(await screen.findByRole('button', { name: 'Add my music' }));
  expect(options.onAdd).toHaveBeenCalledOnce();
  expect(options.onFinish).not.toHaveBeenCalled();
});
it('shows progress and does not permit finishing while files are being imported', () => {
  render(<WelcomeSetup {...props()} progress={{ done: 2, total: 8 }} />);
  expect(screen.getByRole('progressbar', { name: 'Adding music' })).toHaveValue(2);
  expect(screen.getByRole('status')).toHaveTextContent('2 of 8 files');
  expect(screen.queryByRole('button', { name: 'Explore Wave' })).not.toBeInTheDocument();
});
it('can go back and skip without enabling online lookups', async () => {
  const options = props();
  const user = userEvent.setup();
  render(<WelcomeSetup {...options} />);
  await user.click(screen.getByRole('button', { name: 'Get started' }));
  await screen.findByRole('heading', { name: 'What should we call you?' });
  await user.click(screen.getByRole('button', { name: 'Back' }));
  expect(await screen.findByRole('heading', { name: 'Welcome to Wave' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Explore Wave' }));
  expect(options.onFinish).toHaveBeenCalledOnce();
  expect(options.onAutomaticLyrics).not.toHaveBeenCalled();
});
it('advances with Enter in the name field without hijacking buttons or selectors', async () => {
  const user = userEvent.setup();
  const options = props();
  render(<WelcomeSetup {...options} />);
  await user.click(screen.getByRole('button', { name: 'Get started' }));
  const name = await screen.findByRole('textbox', { name: 'Your name' });
  await user.type(name, 'Alex{Enter}');
  expect(await screen.findByRole('heading', { name: 'Make it yours' })).toBeInTheDocument();
  const select = screen.getByLabelText('Theme');
  select.focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('heading', { name: 'Make it yours' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Back' }));
  expect(
    await screen.findByRole('heading', { name: 'What should we call you?' }),
  ).toBeInTheDocument();
});
it('updates its decorative preview when personalization changes', () => {
  const options = props();
  const view = render(<WelcomeSetup {...options} name="Alex" theme="light" largeText />);
  const preview = view.container.querySelector('.welcome-preview')!;
  expect(preview).toHaveClass('welcome-preview--light', 'is-large-text');
  expect(preview).toHaveTextContent('Alex');
  expect(preview.closest('.welcome-visual')).toHaveAttribute('aria-hidden', 'true');
  view.rerender(<WelcomeSetup {...options} name="Alex" theme="dark" />);
  expect(view.container.querySelector('.welcome-preview')).toHaveClass('welcome-preview--dark');
});

it('lights the remaining lyric lines when extra sources are enabled', async () => {
  const { WelcomePreview } = await import('./WelcomePreview');
  const previewProps = {
    step: 5,
    name: '',
    theme: 'system' as const,
    largeText: false,
    volumeFix: false,
    automaticLyrics: false,
    wordSources: false,
  };
  const view = render(<WelcomePreview {...previewProps} />);
  expect(view.container.querySelector('.welcome-preview-lyrics')).not.toHaveClass('is-expanded');
  view.rerender(<WelcomePreview {...previewProps} wordSources />);
  expect(view.container.querySelector('.welcome-preview-lyrics')).toHaveClass('is-expanded');
});

it('shows imported songs in the preview and highlights Explore only after there is music', async () => {
  const { makeTrack } = await import('../test/fixtures');
  const options = props();
  const user = userEvent.setup();
  const view = render(<WelcomeSetup {...options} />);
  await user.click(screen.getByRole('button', { name: 'Get started' }));
  for (let step = 0; step < 5; step++) {
    await screen.findByRole('button', { name: 'Continue' });
    await user.click(screen.getByRole('button', { name: 'Continue' }));
  }
  expect(await screen.findByRole('button', { name: 'Add my music' })).toHaveClass('filled-button');
  expect(screen.getByRole('button', { name: 'Explore Wave' })).toHaveClass('text-button');
  view.rerender(
    <WelcomeSetup {...options} tracks={[makeTrack({ title: 'Signal', artist: 'Artist' })]} />,
  );
  expect(screen.getByRole('button', { name: 'Add more music' })).toHaveClass('tonal-button');
  expect(screen.getByRole('button', { name: 'Explore Wave' })).toHaveClass('filled-button');
  await screen.findByRole('heading', { name: 'Ready to listen' });
  await waitFor(() =>
    expect(view.container.querySelector('.welcome-preview')).toHaveTextContent('Signal'),
  );
  expect(view.container.querySelector('.welcome-preview')).toHaveTextContent('Artist');
});

it('shows the current step and a truthful summary of choices', async () => {
  const user = userEvent.setup();
  render(<WelcomeSetup {...props()} mixEnabled wordSources />);
  expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Get started' }));
  for (let index = 0; index < 5; index++) {
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
  }
  expect(await screen.findByText('Step 7 of 7')).toBeInTheDocument();
  const summary = screen.getByLabelText('Your choices');
  expect(summary).toHaveTextContent('Mix: On');
  expect(summary).toHaveTextContent('Fix volume: Off');
  expect(summary).toHaveTextContent('Try more lyrics sources: On');
});
