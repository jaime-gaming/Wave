import { describe, expect, it } from 'vitest';
import { borrowedName } from './fileName';

describe('borrowedName', () => {
  it('names a kept song with the extension a player expects', () => {
    expect(borrowedName('After hours', 'audio/mpeg')).toBe('After hours.mp3');
    expect(borrowedName('After hours', 'audio/x-wav')).toBe('After hours.wav');
    expect(borrowedName('After hours', 'audio/flac; codecs=1')).toBe('After hours.flac');
    expect(borrowedName(undefined, 'audio/mp4')).toBe('Borrowed song.m4a');
    // An unknown type still gets a name, and never a made-up one.
    expect(borrowedName('After hours', 'application/octet-stream')).toBe('After hours.audio');
  });
});
