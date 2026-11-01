import { describe, expect, it, vi } from 'vitest';
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

  it('explains why a Spotify link cannot be read on its own', async () => {
    setup();
    await userEvent.type(
      screen.getByRole('textbox', { name: /playlist, song list or link/i }),
      'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    );
    await userEvent.click(screen.getByRole('button', { name: /read this list/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot be read from the link/i);
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
