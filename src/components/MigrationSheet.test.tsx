import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MigrationSheet } from './MigrationSheet';
import { makeTrack } from '../test/fixtures';
import type { Track } from '../domain/types';

const tracks: Track[] = [
  makeTrack({ id: 'says', title: 'Says', artist: 'Nils Frahm', album: 'Spaces', duration: 214 }),
  makeTrack({
    id: 'rhubarb',
    title: 'Rhubarb',
    artist: 'Aphex Twin',
    album: 'Spaces',
    duration: 301,
  }),
];

const setup = (library: Track[] = tracks) => {
  const onSave = vi.fn().mockResolvedValue(true);
  const onClose = vi.fn();
  render(<MigrationSheet tracks={library} onSave={onSave} onClose={onClose} />);
  return { onSave, onClose };
};

afterEach(() => vi.unstubAllGlobals());

describe('bringing playlists over', () => {
  it('previews the match before writing anything', async () => {
    const { onSave } = setup();
    await userEvent.type(
      screen.getByRole('textbox', { name: /playlist, song list or link/i }),
      '#EXTM3U\n#EXTINF:214,Nils Frahm - Says\n#EXTINF:301,Aphex Twin - Rhubarb\n#EXTINF:200,Unknown - Not here',
    );
    await userEvent.click(screen.getByRole('button', { name: /read this list/i }));
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    expect(screen.getByText(/1 not in your library/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('writes only the songs it matched, in the list order', async () => {
    const { onSave } = setup();
    await userEvent.type(
      screen.getByRole('textbox', { name: /playlist, song list or link/i }),
      '#EXTM3U\n#EXTINF:301,Aphex Twin - Rhubarb\n#EXTINF:214,Nils Frahm - Says',
    );
    await userEvent.click(screen.getByRole('button', { name: /read this list/i }));
    await userEvent.click(screen.getByRole('button', { name: /create playlist with 2/i }));
    expect(onSave).toHaveBeenCalledWith(expect.any(String), ['rhubarb', 'says']);
    expect(await screen.findByText(/is here/i)).toBeInTheDocument();
  });

  it('attempts a public Spotify link and offers file import if unavailable', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({ error: 'unavailable' }) });
    vi.stubGlobal('fetch', fetch);
    setup();
    await userEvent.type(
      screen.getByRole('textbox', { name: /playlist, song list or link/i }),
      'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    );
    await userEvent.click(screen.getByRole('button', { name: /read this list/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/public link could not be read/i);
    expect(fetch).toHaveBeenCalledWith(
      '/api/import-playlist',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('says nothing matched rather than creating an empty playlist', async () => {
    const { onSave } = setup([]);
    await userEvent.type(
      screen.getByRole('textbox', { name: /playlist, song list or link/i }),
      'Nils Frahm - Says',
    );
    await userEvent.click(screen.getByRole('button', { name: /read this list/i }));
    expect(screen.getByRole('button', { name: /create playlist with 0/i })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });
});

it('previews public URL metadata without saving or uploading the library', async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ text: '#EXTM3U\n#EXTINF:214,Nils Frahm - Says', partial: true }),
  });
  vi.stubGlobal('fetch', fetch);
  const { onSave } = setup();
  await userEvent.type(
    screen.getByRole('textbox', { name: /playlist, song list or link/i }),
    'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
  );
  await userEvent.click(screen.getByRole('button', { name: /read this list/i }));
  expect(await screen.findByText('1 of 1')).toBeInTheDocument();
  expect(screen.getByText(/list may be incomplete/i)).toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
  });
});
