# Why Wave, next to Spotify, Apple Music and YouTube Music

Most people already pay for a streaming service, and most of them also own music: a shelf of
CDs, a folder of downloads from Bandcamp, a hard drive of FLACs. Wave is for that second
library. It plays the files you have, on the three devices you actually use, and it treats them
better than any service can.

This page is an honest comparison. Wave wins some of it, the services win the rest, and it says
which is which.

## The short version

|                 | Wave                           | Spotify / Apple Music / YouTube Music          |
| --------------- | ------------------------------ | ---------------------------------------------- |
| Catalogue       | Only what you own              | Tens of millions of songs                      |
| Cost            | Zero                           | Monthly, per person, or with ads               |
| Account         | None                           | Required, plus a subscription check            |
| Audio           | Your file, unmodified          | Re-encoded stream at the service's bitrate     |
| Works offline   | Always, for your whole library | Only downloaded tracks, tied to a subscription |
| Data            | Stays on your device           | Their servers, their analytics                 |
| Open source     | Yes                            | No                                             |
| Recommendations | None, on purpose               | The reason most people stay                    |

## Where Wave is genuinely better

**Your files are not re-encoded.** A streaming service sends you a compressed copy at a fixed
bitrate. Wave hands your file to the decoder as it is: a FLAC plays as a FLAC, a 24-bit WAV as a
24-bit WAV. Mix, the crossfade between two songs, changes only how they are joined, never the
audio itself, and the change is undone when the join finishes.

**There is nothing to subscribe to.** No account, no trial, no family plan, no ads between
songs, no "this song is not available in your country". The app works the first time you open
it, and it keeps working if you stop paying for everything else.

**It works offline by default.** Your library is on your device because that is where it was
imported. There is no cached subset to manage and no expiry date on it.

**Nothing is measured except what you see.** No analytics, no telemetry, no listening data
leaving the device. The only two things that ever go out are a lyric search (off until you turn
it on, title and artist only) and clip discovery (title and artist, from public YouTube
front-ends). Remix, the weekly recap, is computed from plays this device wrote down.

**Files you cannot stream are still yours.** Live recordings, bootlegs, an album that was
pulled from a service, your own band's demo, music from a country your streaming account does
not cover. A service can lose a licence overnight; your folder does not.

**You can read the code.** Wave is MIT-licensed and small enough to audit. You can also host the
web build yourself, so the whole player can be a static page you control.

**Remix, without a gamified feed.** A weekly recap is a nice thing to look at. Wave's is one
card and one playlist: the week's time, the songs you played most, and a list you can play or
save. It does not score you, compare you with friends, or decide what you should hear next.

## Where the streaming services are the better choice

It would be dishonest to leave these out.

- **You want to hear something you do not own.** Wave has no catalogue. Buying or ripping the
  file is the only way to add it, with one exception: a YouTube song can be added by link, and
  that needs a connection.
- **You want recommendations that learn.** Wave's daily mixes group what you already have by
  the genre tags in your files. A service knows far more about what you might like next.
- **You listen on the move, away from your library.** There is no cloud copy and no sync: each
  device has its own library. Device linking moves a song from one of your devices to another
  by transfer, not by keeping both in the cloud.
- **You want other people's playlists, podcasts, or the social side.** None of that is here.
- **You do not want to manage files.** Importing is a few clicks, but a library you own is a
  library you keep. Wave is a player, not a backup: keep the originals somewhere safe.

## Why not just use VLC, foobar2000 or MusicBee?

You could, and for pure playback on one machine they are good tools. Wave is aimed at the
living room version of the same idea: a library you browse rather than a folder you open, with
lyrics that follow the sung line, daily mixes, a real crossfade, a weekly recap, and the same
library shape on the web, on Windows and on Android — including the lock screen, headset
buttons and the car. If you want a file player and nothing else, they are lighter; if you want
the collection to feel like a collection, that is what Wave is for.

## What Wave will never do

- It will not lower the quality of your audio.
- It will not convert, normalise or "enhance" your files on disk.
- It will not upload your library, ask you to sign in, or show you an ad.
- It will not delete saved things to make room.
