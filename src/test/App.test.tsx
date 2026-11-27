import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { getTracks, saveTrack, deleteTrack, toggleTrackFavorite } from '../data/library';
import { makeTrack } from './fixtures';

vi.mock('../data/library', () => ({
  getTracks: vi.fn(),
  openLibrary: vi.fn().mockResolvedValue({ getAll: vi.fn().mockResolvedValue([]), close: vi.fn() }),
  getCustomizations: vi.fn().mockResolvedValue({ artists: [], albums: [] }),
  saveArtistProfile: vi.fn(),
  saveAlbumOrder: vi.fn(),
  saveTrackLyrics: vi.fn(),
  saveTrack: vi.fn(),
  deleteTrack: vi.fn(),
  toggleTrackFavorite: vi.fn(),
  getPlaylists: vi.fn().mockResolvedValue([]),
  editTrackMetadata: vi.fn(),
  restoreTrackMetadata: vi.fn(),
}));
beforeEach(() => {
  history.replaceState(null, '', '/');
  vi.mocked(getTracks).mockResolvedValue([
    makeTrack(),
    makeTrack({ id: 'night', title: 'Night', artist: 'Other', album: 'After hours' }),
  ]);
  vi.mocked(saveTrack).mockResolvedValue(undefined);
  vi.mocked(deleteTrack).mockResolvedValue(undefined);
  vi.mocked(toggleTrackFavorite).mockImplementation(async (id) =>
    makeTrack({ id, favorite: true }),
  );
});
describe('application', () => {
  it('keeps Home unmounted through setup and only records completion when skipped', async () => {
    vi.mocked(getTracks).mockResolvedValue([]);
    localStorage.setItem('wave-animations-enabled', 'false');
    const user = userEvent.setup();
    render(<App />);
    const welcome = await screen.findByRole(
      'dialog',
      { name: 'Welcome to Wave' },
      { timeout: 4000 },
    );
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(localStorage.getItem('wave-welcome-done')).toBeNull();
    await user.click(within(welcome).getByRole('button', { name: 'Explore Wave' }));
    expect(await screen.findByRole('main')).toBeInTheDocument();
    expect(localStorage.getItem('wave-welcome-done')).toBe('true');
  });
  it('stays in setup while local music is saved and only finishes on request', async () => {
    vi.mocked(getTracks).mockResolvedValue([]);
    localStorage.setItem('wave-animations-enabled', 'false');
    let finishSave!: () => void;
    vi.mocked(saveTrack).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('dialog', { name: 'Welcome to Wave' }, { timeout: 4000 });
    await user.click(screen.getByRole('button', { name: 'Get started' }));
    await user.type(await screen.findByRole('textbox', { name: 'Your name' }), 'Alex');
    for (let step = 0; step < 5; step++) {
      await user.click(await screen.findByRole('button', { name: 'Continue' }));
    }
    await user.click(await screen.findByRole('button', { name: 'Add my music' }));
    await user.click(await screen.findByRole('button', { name: /from this device/i }));
    const input = screen.getByLabelText('Choose music files', { selector: 'input' });
    fireEvent.change(input, {
      target: { files: [new File(['music'], 'Signal.wav', { type: 'audio/wav' })] },
    });
    expect(await screen.findByRole('progressbar', { name: 'Adding music' })).toBeInTheDocument();
    await waitFor(() => expect(saveTrack).toHaveBeenCalled());
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(localStorage.getItem('wave-welcome-done')).toBeNull();
    await act(async () => finishSave());
    expect(await screen.findByRole('button', { name: 'Add more music' })).toHaveClass(
      'tonal-button',
    );
    const explore = screen.getByRole('button', { name: 'Explore Wave' });
    expect(explore).toHaveClass('filled-button');
    await user.click(explore);
    expect(await screen.findByRole('main')).toBeInTheDocument();
    expect(localStorage.getItem('wave-listener-name')).toBe('Alex');
    expect(localStorage.getItem('wave-welcome-done')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Remix' }));
    expect(await screen.findByText('Your Remix, Alex')).toBeInTheDocument();
  });
  it('shows an honest empty collection without sample songs', async () => {
    vi.mocked(getTracks).mockResolvedValue([]);
    localStorage.setItem('wave-welcome-done', 'true');
    render(<App />);
    expect(await screen.findByText('No songs yet')).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: 'Play' }))
      expect(button).toBeDisabled();
    expect(screen.queryByText('Signal')).not.toBeInTheDocument();
  });
  it('searches songs and displays the no-results state', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: 'Play Signal by Wave Tests' });
    expect(screen.queryByRole('searchbox', { name: 'Search library' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.type(await screen.findByRole('searchbox', { name: 'Search library' }), 'night');
    expect(
      screen.queryByRole('button', { name: 'Play Signal by Wave Tests' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Night by Other' })).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Search library' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search library' }), 'missing');
    expect(screen.getByText('No tracks found.')).toBeInTheDocument();
  });
  it('saves a favorite and browses it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Favorite Signal' }));
    await waitFor(() => expect(toggleTrackFavorite).toHaveBeenCalledWith('signal'));
    await user.click(screen.getByRole('button', { name: /Favorites/ }));
    expect(
      await screen.findByRole('button', { name: 'Play Signal by Wave Tests' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play Night by Other' })).not.toBeInTheDocument();
  });
  it('opens settings and changes theme', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    const dialog = await screen.findByRole('region', { name: 'Settings' });
    await user.click(within(dialog).getByRole('button', { name: 'Appearance' }));
    await user.click(within(dialog).getByRole('button', { name: 'Light' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('wave-theme')).toBe('light');
    await user.click(within(dialog).getByRole('button', { name: 'Back to settings' }));
    expect(within(dialog).getByRole('button', { name: 'Appearance' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Back from settings' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Settings' })).not.toBeInTheDocument(),
    );
  });
  it('requires confirmation before deleting a library track', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Options for Signal' }));
    await user.click(screen.getByRole('button', { name: 'Remove from library' }));
    expect(deleteTrack).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove track' }));
    await waitFor(() => expect(deleteTrack).toHaveBeenCalledWith('signal'));
    expect(
      screen.queryByRole('button', { name: 'Play Signal by Wave Tests' }),
    ).not.toBeInTheDocument();
  });
});
