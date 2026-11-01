import { describe, expect, it } from 'vitest';
import {
  bestRelease,
  catalogueQuery,
  detailsPatch,
  needsDetails,
  scoreRelease,
  type CatalogueRelease,
} from './catalogue';
import { makeTrack } from '../test/fixtures';

const release: CatalogueRelease = {
  title: 'Says',
  artist: 'Nils Frahm',
  album: 'Spaces',
  year: 2013,
  genre: 'Electronic',
  duration: 214,
  artworkUrl: 'https://example.test/600x600bb.jpg',
};

describe('deciding what is worth asking about', () => {
  it('notices a song that does not know what it is', () => {
    expect(needsDetails(makeTrack({ title: 'Track 03', fileName: 'Track 03.mp3' }))).toBe(true);
    expect(
      needsDetails(
        makeTrack({ artist: 'Unknown artist', album: 'Unknown album', year: undefined }),
      ),
    ).toBe(true);
  });

  it('leaves a complete song and a song the listener edited alone', () => {
    const complete = makeTrack({
      title: 'Signal',
      artist: 'Wave Tests',
      album: 'First light',
      artwork: 'data:image/jpeg;base64,x',
      year: 2021,
      genres: ['Ambient'],
    });
    expect(needsDetails(complete)).toBe(false);
    expect(needsDetails({ ...complete, editedAt: Date.now() })).toBe(false);
    // A YouTube song is a reference, not a file, and has nothing to refine.
    expect(needsDetails({ ...complete, source: 'youtube' })).toBe(false);
  });

  it('never sends the word "unknown" to anybody', () => {
    expect(catalogueQuery(makeTrack({ artist: 'Unknown artist', title: 'Says' }))).toBe('Says');
    expect(catalogueQuery(makeTrack({ artist: 'Nils Frahm', title: 'Says' }))).toBe(
      'Nils Frahm Says',
    );
  });
});

describe('matching a release to a track', () => {
  const track = makeTrack({
    title: 'Says',
    artist: 'Unknown artist',
    album: 'Unknown album',
    artwork: undefined,
    duration: 214,
  });

  it('accepts the recording with the same running time', () => {
    expect(scoreRelease(track, release)).toBeGreaterThan(0.6);
    expect(bestRelease(track, [release])).toBe(release);
  });

  it('refuses a different act, however similar the title', () => {
    const known = makeTrack({ title: 'Says', artist: 'Nils Frahm', duration: 214 });
    const cover = { ...release, artist: 'The Karaoke Collective' };
    expect(scoreRelease(known, cover)).toBe(0);
    expect(bestRelease(known, [cover])).toBeUndefined();
    // With no artist to go on, the title still has to be convincing.
    expect(scoreRelease(track, { ...release, title: 'Something else entirely' })).toBe(0);
  });

  it('accepts a title the provider decorated', () => {
    // A file says "Says"; the release says "Says (feat. Somebody) - Remastered".
    // That is the same recording, and the bracket used to hide it.
    const decorated = { ...release, title: 'Says (feat. Somebody) - 2013 Remastered' };
    expect(scoreRelease(track, decorated)).toBeGreaterThan(0.6);
    expect(bestRelease(track, [decorated])).toBe(decorated);
  });

  it('refuses an edition that is minutes off', () => {
    expect(bestRelease(track, [{ ...release, duration: 640 }])).toBeUndefined();
  });
});

describe('what may be written', () => {
  const bare = makeTrack({
    title: 'Says',
    artist: 'Unknown artist',
    album: 'Unknown album',
    artwork: undefined,
    duration: 214,
  });

  it('fills the gaps and nothing else', () => {
    const { patch, filled } = detailsPatch(bare, release);
    expect(patch).toEqual({
      artist: 'Nils Frahm',
      album: 'Spaces',
      year: 2013,
      genres: ['Electronic'],
    });
    expect(filled).toEqual(['artist', 'album', 'year', 'genre']);
    // The running time belongs to the decoded file, never to a catalogue.
    expect(patch).not.toHaveProperty('duration');
  });

  it('keeps a title the file already carried', () => {
    const { patch } = detailsPatch({ ...bare, title: 'Says' }, release);
    expect(patch).not.toHaveProperty('title');
  });

  it('repairs a title that is really a filename', () => {
    const { patch } = detailsPatch(
      { ...bare, title: 'nils_frahm_-_says', fileName: 'nils_frahm_-_says.mp3' },
      release,
    );
    expect(patch.title).toBe('Says');
  });

  it('repairs a filename even when nothing is known about the album', () => {
    const { patch, filled } = detailsPatch(
      { ...bare, title: 'nils_frahm_-_says', fileName: 'nils_frahm_-_says.mp3' },
      { ...release, album: 'Unknown album' },
    );
    expect(patch.title).toBe('Says');
    expect(filled).toContain('title');
  });

  it('splits the styles a provider lists in one string', () => {
    const { patch } = detailsPatch(bare, { ...release, genre: 'Electronic / Ambient' });
    expect(patch.genres).toEqual(['Electronic', 'Ambient']);
  });

  it('does nothing at all once the listener has edited the song', () => {
    const edited = { ...bare, editedAt: Date.now() };
    expect(detailsPatch(edited, release)).toEqual({ patch: {}, filled: [] });
  });

  it('never writes a blank over a real value', () => {
    const { patch } = detailsPatch(bare, { ...release, album: '', genre: '' });
    expect(patch).not.toHaveProperty('album');
    expect(patch).not.toHaveProperty('genres');
  });
});
