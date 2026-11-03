import { describe, expect, it } from 'vitest';
import { isLink, parsePlaylistText, readCsv, splitArtistTitle } from './importFile';

describe('reading an exported playlist', () => {
  it('reads an m3u with durations, album tags and a playlist name', () => {
    const list = parsePlaylistText(
      [
        '#EXTM3U',
        '#PLAYLIST:Sunday mornings',
        '#EXTINF:214,Nils Frahm - Says',
        'Music/Nils Frahm/Says.flac',
        '#EXTINF:301 album="Spaces",Aphex Twin - Rhubarb',
        'Music/Aphex Twin/Rhubarb.mp3',
      ].join('\n'),
    );
    expect(list.source).toBe('m3u');
    expect(list.name).toBe('Sunday mornings');
    expect(list.entries).toMatchObject([
      { artist: 'Nils Frahm', title: 'Says', duration: 214 },
      { artist: 'Aphex Twin', title: 'Rhubarb', duration: 301, album: 'Spaces' },
    ]);
  });

  it('reads a CSV export whose durations are in milliseconds', () => {
    const csv = [
      '"Track name","Artist name(s)","Album name","Duration (ms)"',
      '"Says","Nils Frahm","Spaces","214500"',
      '"Rhubarb, part 2","Aphex Twin","Selected","301000"',
    ].join('\n');
    const list = parsePlaylistText(csv);
    expect(list.source).toBe('csv');
    expect(list.entries).toMatchObject([
      { title: 'Says', artist: 'Nils Frahm', album: 'Spaces', duration: 215 },
      { title: 'Rhubarb, part 2', artist: 'Aphex Twin', duration: 301 },
    ]);
  });

  it('keeps the commas inside quoted CSV fields', () => {
    expect(readCsv('a,"b,c","d""e"\n1,2,3')[0]).toEqual(['a', 'b,c', 'd"e']);
  });

  it('reads plain text, one song per line', () => {
    const list = parsePlaylistText('1. Portishead – Roads\nBoards of Canada - Roygbiv\n\n');
    expect(list.source).toBe('text');
    expect(list.entries).toMatchObject([
      { artist: 'Portishead', title: 'Roads' },
      { artist: 'Boards of Canada', title: 'Roygbiv' },
    ]);
  });

  it('reads a hand-copied list of tags with no file paths between them', () => {
    const list = parsePlaylistText(
      '#EXTM3U\n#EXTINF:214,Nils Frahm - Says\n#EXTINF:301,Aphex Twin - Rhubarb',
    );
    expect(list.entries).toMatchObject([
      { artist: 'Nils Frahm', title: 'Says' },
      { artist: 'Aphex Twin', title: 'Rhubarb' },
    ]);
  });

  it('never mistakes a link for a song list', () => {
    expect(isLink('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toBe(true);
    expect(
      parsePlaylistText('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'),
    ).toMatchObject({
      entries: [],
    });
    expect(isLink('#EXTM3U')).toBe(false);
  });

  it('splits the first dash only, so a title keeps its own', () => {
    expect(splitArtistTitle('Sleaford Mods - Jobseeker - live')).toEqual({
      artist: 'Sleaford Mods',
      title: 'Jobseeker - live',
    });
  });
});
