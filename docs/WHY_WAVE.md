# Why Wave, next to Spotify, Apple Music and YouTube Music

Most people already pay for a streaming service, and most of them also own music: a shelf of
CDs, a folder of downloads from Bandcamp, a hard drive of FLACs. Wave is for that second
library. It plays the files you have in the browser and in the Windows, Android and iOS clients,
with a focus on a library that remains under your control.

This page is an honest comparison. Wave wins some of it, the services win the rest, and it says
which is which.

## The short version

|                 | Wave                                               | Spotify / Apple Music / YouTube Music            |
| --------------- | -------------------------------------------------- | ------------------------------------------------ |
| Catalogue       | Only what you own                                  | Tens of millions of songs                        |
| Cost            | Zero                                               | Monthly, per person, or with ads                 |
| Account         | None                                               | Required, plus a subscription check              |
| Audio           | Your file, unmodified                              | Re-encoded stream at the service's bitrate       |
| Works offline   | Local library when the app and codec are available | Download support depends on the service and plan |
| Data            | Local library; optional services receive queries   | Provider-operated accounts and services          |
| Open source     | Yes                                                | No                                               |
| Recommendations | Local mixes and listening-based suggestions        | Catalogue-wide recommendations                   |

## Where Wave is genuinely better

**Your files are not re-encoded.** Wave plays your source file rather than creating a new
compressed copy. Codec support and actual output quality depend on the platform, decoder and audio
device; Mix overlaps tracks and adjusts their playback levels without modifying the files on disk.

**There is nothing to subscribe to.** For local playback there is no Wave account, trial, family
plan or Wave advertising between songs. You can use your own files without a Wave subscription.

**Your imported library is local.** Saved files can play without a connection when the installed
app, browser cache and audio codecs are available. YouTube and online lookups need a connection;
keep original files and backups in case app data is cleared.

**Listening history stays local.** Remix is computed from plays on the device. Optional lyrics,
metadata, artist-photo and clip lookups, YouTube, playlist migration and device linking can contact
third parties or another device when used. See [Privacy](../PRIVACY.md) for exactly what is sent.

**Files you cannot stream are still yours.** Live recordings, bootlegs, an album that was
pulled from a service, your own band's demo, music from a country your streaming account does
not cover. A service can lose a licence overnight; your folder does not.

**You can read the code.** Wave is MIT-licensed and small enough to audit. You can also host the
web client yourself; online metadata and YouTube features additionally use API endpoints described
in the [hosting guide](PLATFORMS.md#browser-and-cloudflare).

**Remix, without a gamified feed.** A weekly recap is a nice thing to look at. Wave's is one
card and one playlist: the week's time, the songs you played most, and a list you can play or
save. It does not score you, compare you with friends, or decide what you should hear next.

## Where the streaming services are the better choice

It would be dishonest to leave these out.

- **You want to hear something you do not own.** Wave has no catalogue. Importing a local
  file is the main route; YouTube can also be searched or added by link on the web, and needs a
  connection.
- **You want recommendations that learn.** Wave's daily mixes group what you already have by
  local metadata and listening signals. A service can recommend across a much larger catalogue.
- **You listen on the move, away from your library.** There is no cloud copy and no sync: each
  device has its own library. Web device linking can transfer selected songs between web clients, not keep both libraries in the
  cloud.
- **You want a social feed or a podcast catalogue.** Wave does not provide those. On the web,
  public playlist links or exported lists can be reviewed for import, but matches are not guaranteed.
- **You do not want to manage files.** Importing is a few clicks, but a library you own is a
  library you keep. Wave is a player, not a backup: keep the originals somewhere safe.

## Why not just use VLC, foobar2000 or MusicBee?

You could, and for pure playback on one machine they are good tools. Wave is aimed at the
living room version of the same idea: a library you browse rather than a folder you open, with
lyrics that follow the sung line, daily mixes, a real crossfade, a weekly recap, and the same
library shape on the web, Windows, Android and iOS. System media controls and other features
vary by platform. If you want a file player and nothing else, they are lighter; if you want
the collection to feel like a collection, that is what Wave is for.

## What Wave will never do

- It will not deliberately re-encode your imported files; playback quality depends on your device and codecs.
- It will not convert, normalise or "enhance" your files on disk.
- It will not automatically upload your library, ask for a Wave account, or add Wave advertising.
  Explicit device transfers and third-party services have their own data flows and policies.
- It will not intentionally delete saved music to make room; browsers or operating systems can clear app data, so keep backups.
