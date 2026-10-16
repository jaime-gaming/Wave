import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { getTracks, saveTrack, deleteTrack, toggleTrackFavorite } from '../data/library';
import { makeTrack } from './fixtures';

vi.mock('../data/library', () => ({
  getTracks: vi.fn(),
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
  it('shows an honest empty collection without sample songs', async () => {
    vi.mocked(getTracks).mockResolvedValue([]);
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
