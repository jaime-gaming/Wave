package io.github.jaimegaming.wave.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.jaimegaming.wave.DailyMix
import io.github.jaimegaming.wave.Playlist
import io.github.jaimegaming.wave.Song
import io.github.jaimegaming.wave.listeningTime

// --- Home ------------------------------------------------------------------

/**
 * The morning screen: what was heard last, today's mixes, and what arrived.
 *
 * Nothing here is generated. "Jump back in" is the library's own history, the
 * mixes are the listener's tags rotated by date, and the albums are the files.
 */
@Composable
fun HomeScreen(state: WaveState, onAddMusic: () -> Unit, onOpenSong: (Song) -> Unit) {
    val songs = state.songs
    val mixes = state.mixes()
    val recent = state.summary.recent.take(6)
    val added = songs.sortedByDescending { it.addedAt }.take(8)
    val favorites = state.favorites()
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
        contentPadding = PaddingValues(bottom = 24.dp),
    ) {
        item {
            ScreenTitle(
                title = "Home",
                subtitle = when {
                    songs.isEmpty() -> "Nothing here yet"
                    state.summary.weekSeconds > 0 -> "You listened for ${listeningTime(state.summary.weekSeconds)} this week"
                    else -> "${songs.size} songs on this phone"
                },
            )
        }
        if (songs.isEmpty()) {
            item {
                EmptyState(
                    title = "Your library is empty",
                    body = "Wave plays the files on this phone. Nothing is uploaded and nothing is streamed.",
                    actionLabel = "Add music",
                    onAction = onAddMusic,
                )
            }
            return@LazyColumn
        }
        val current = state.player.current?.let { playing -> songs.find { it.id == playing.id } }
        if (current != null) {
            item {
                SectionTitle("Playing now", action = "Queue") { state.queueOpen = true }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(20.dp))
                        .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                        .clickable { state.nowPlayingOpen = true }
                        .padding(12.dp),
                ) {
                    Cover(current, size = 72.dp, radius = 16.dp)
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            text = current.title,
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.onBackground,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = current.artist,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = "${clockTime(state.player.time)} / ${clockTime(current.duration)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }
            }
        }
        if (mixes.isNotEmpty()) {
            item {
                SectionTitle("Made from your tags")
                LazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    items(mixes, key = { "mix-" + it.label }) { mix -> MixTile(mix) { state.open = Open.Mix(mix.label) } }
                }
            }
        }
        if (recent.isNotEmpty()) {
            item {
                SectionTitle(
                    text = "Jump back in",
                    action = "Listening",
                    onAction = { state.destination = Destination.Listening },
                )
                LazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    items(recent, key = { "recent-" + it.id }) { song -> CoverTile(song, onOpenSong) }
                }
            }
        }
        if (favorites.isNotEmpty()) {
            item {
                SectionTitle(
                    text = "Favorites",
                    action = "All",
                    onAction = {
                        state.destination = Destination.Library
                        state.shelf = Shelf.Favorites
                    },
                )
                LazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    items(favorites.take(10), key = { "fav-" + it.id }) { song -> CoverTile(song, onOpenSong) }
                }
            }
        }
        item {
            SectionTitle(
                text = "Recently added",
                action = if (songs.size > 8) "All songs" else null,
                onAction = if (songs.size > 8) ({ state.destination = Destination.Library }) else null,
            )
        }
        items(added, key = { "added-" + it.id }) { song ->
            SongRow(
                song = song,
                playing = state.player.current?.id == song.id,
                onPlay = { onOpenSong(song) },
                onFavorite = { state.toggleFavorite(song) },
                onMore = { state.options = song },
            )
        }
    }
}

@Composable
private fun MixTile(mix: DailyMix, onOpen: () -> Unit) {
    Column(
        modifier = Modifier
            .width(148.dp)
            .clip(RoundedCornerShape(18.dp))
            .clickable(onClick = onOpen),
    ) {
        // The mix tile is the sleeve of its first song under a wash of the tag's
        // own name; no separate artwork, so nothing is invented.
        Box {
            Cover(mix.songs.first(), size = 148.dp, radius = 18.dp)
            Text(
                text = mix.label,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .padding(12.dp)
                    .background(MaterialTheme.colorScheme.background.copy(alpha = 0.62f), RoundedCornerShape(8.dp))
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }
        Text(
            text = "${mix.songs.size} songs",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

@Composable
private fun CoverTile(song: Song, onOpen: (Song) -> Unit) {
    Column(
        modifier = Modifier
            .width(124.dp)
            .clip(RoundedCornerShape(16.dp))
            .clickable { onOpen(song) },
    ) {
        Cover(song, size = 124.dp, radius = 16.dp)
        Text(
            text = song.title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 8.dp),
        )
        Text(
            text = song.artist,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

// --- Search ----------------------------------------------------------------

/**
 * Search that answers while it is being typed, and says where a match was found.
 *
 * The list is ranked, not filtered: a title that starts with what was typed comes
 * before one that contains it, and an artist match says so instead of silently
 * appearing under a song whose title has nothing to do with the words.
 */
@Composable
fun SearchScreen(state: WaveState, onOpenSong: (Song) -> Unit) {
    val results = state.visible()
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
        contentPadding = PaddingValues(bottom = 24.dp),
    ) {
        item {
            ScreenTitle(
                title = "Search",
                subtitle = if (state.songs.isEmpty()) "Add music to search it" else "${state.songs.size} songs",
            )
            OutlinedTextField(
                value = state.query,
                onValueChange = { state.query = it },
                placeholder = { Text("Songs, artists, albums") },
                singleLine = true,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 10.dp),
            )
        }
        if (state.query.isBlank()) {
            item {
                val mixes = state.mixes()
                if (mixes.isNotEmpty()) {
                    SectionTitle("Tags")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        mixes.take(3).forEach { mix ->
                            Text(
                                text = mix.label,
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                                    .clickable { state.query = mix.label }
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                            )
                        }
                    }
                }
                SectionTitle("Try a few")
                state.artists().keys.take(6).forEach { artist ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .clickable { state.query = artist }
                            .padding(vertical = 10.dp, horizontal = 4.dp),
                    ) {
                        Text(artist, style = MaterialTheme.typography.titleMedium)
                    }
                }
            }
            return@LazyColumn
        }
        if (results.isEmpty()) {
            item {
                EmptyState(
                    title = "No match",
                    body = "Nothing in the library answers to \"${state.query}\".",
                    actionLabel = "Clear",
                    onAction = { state.query = "" },
                )
            }
            return@LazyColumn
        }
        item { SectionTitle("${results.size} songs") }
        items(results, key = { it.id }) { song ->
            SongRow(
                song = song,
                playing = state.player.current?.id == song.id,
                onPlay = { onOpenSong(song) },
                onFavorite = { state.toggleFavorite(song) },
                onMore = { state.options = song },
            )
        }
    }
}

// --- Library ---------------------------------------------------------------

/**
 * The collection, one shelf at a time.
 *
 * A shelf is a filter, not a page: songs, albums, artists, playlists and the
 * favourites, with the same search over all of them. Opening an album or a
 * playlist comes back to the same shelf, so the library remembers where you were.
 */
@Composable
fun LibraryScreen(state: WaveState, onAddMusic: () -> Unit, onOpenSong: (Song) -> Unit) {
    val target = state.open
    if (target != null) {
        CollectionScreen(state, onOpenSong)
        return
    }
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
        contentPadding = PaddingValues(bottom = 24.dp),
    ) {
        item {
            ScreenTitle(
                title = "Library",
                subtitle = when {
                    state.songs.isEmpty() -> "Empty"
                    state.query.isBlank() -> "${state.songs.size} songs · ${state.albums().size} albums"
                    else -> "${state.visible().size} of ${state.songs.size} songs"
                },
                trailing = {
                    Text(
                        text = "+ Add",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .clickable(onClick = onAddMusic)
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                    )
                },
            )
            OutlinedTextField(
                value = state.query,
                onValueChange = { state.query = it },
                placeholder = { Text("Search this library") },
                singleLine = true,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 10.dp),
            )
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(top = 12.dp),
            ) {
                items(Shelf.values().toList(), key = { it.name }) { item ->
                    val selected = state.shelf == item
                    Text(
                        text = item.label,
                        style = MaterialTheme.typography.labelLarge,
                        color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(
                                if (selected) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.surfaceContainerHigh,
                            )
                            .clickable { state.shelf = item }
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                    )
                }
            }
        }
        when (state.shelf) {
            Shelf.Albums -> {
                val albums = state.albums().filter { (name, list) ->
                    state.query.isBlank() || name.contains(state.query, ignoreCase = true) || list.isNotEmpty()
                }
                items(albums.entries.toList(), key = { "album-" + it.key }) { entry ->
                    CollectionRow(
                        title = entry.key,
                        detail = "${entry.value.size} songs · ${entry.value.first().artist}",
                        song = entry.value.first(),
                        onOpen = { state.open = Open.Album(entry.key) },
                    )
                }
            }
            Shelf.Artists -> {
                val artists = state.artists()
                items(artists.entries.toList(), key = { "artist-" + it.key }) { entry ->
                    CollectionRow(
                        title = entry.key,
                        detail = "${entry.value.size} songs",
                        song = entry.value.first(),
                        onOpen = { state.open = Open.Artist(entry.key) },
                    )
                }
            }
            Shelf.Playlists -> {
                item {
                    if (state.playlists.isEmpty()) {
                        EmptyState(
                            title = "No playlists yet",
                            body = "A playlist is any order you like over the songs already here.",
                            actionLabel = "New playlist",
                            onAction = { state.newPlaylistOpen = true },
                        )
                    } else {
                        SectionTitle("Your playlists", action = "New") { state.newPlaylistOpen = true }
                    }
                }
                items(state.playlists, key = { it.id }) { playlist ->
                    PlaylistRow(
                        playlist = playlist,
                        songs = state.playlistSongs(playlist),
                        onOpen = { state.open = Open.Playlist(playlist.id) },
                        onMore = { state.playlistEditor = playlist },
                    )
                }
            }
            else -> {
                val list = if (state.shelf == Shelf.Favorites) {
                    if (state.query.isBlank()) state.favorites() else state.visible().filter { it.favorite }
                } else {
                    state.visible()
                }
                if (list.isEmpty()) {
                    item {
                        if (state.songs.isEmpty()) {
                            EmptyState(
                                title = "Nothing to play yet",
                                body = "Add the files already on this phone to hear them here.",
                                actionLabel = "Add music",
                                onAction = onAddMusic,
                            )
                        } else {
                            EmptyState(
                                title = if (state.shelf == Shelf.Favorites) "No favorites yet" else "No matching songs",
                                body = if (state.shelf == Shelf.Favorites) {
                                    "Tap the heart on any song and it will wait here."
                                } else {
                                    "Try a shorter word, or clear the search."
                                },
                                actionLabel = if (state.shelf == Shelf.Favorites) null else "Clear search",
                                onAction = if (state.shelf == Shelf.Favorites) null else ({ state.query = "" }),
                            )
                        }
                    }
                }
                items(list, key = { it.id }) { song ->
                    SongRow(
                        song = song,
                        playing = state.player.current?.id == song.id,
                        onPlay = { onOpenSong(song) },
                        onFavorite = { state.toggleFavorite(song) },
                        onMore = { state.options = song },
                    )
                }
            }
        }
    }
}

@Composable
private fun CollectionRow(title: String, detail: String, song: Song, onOpen: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .clickable(onClick = onOpen)
            .padding(vertical = 8.dp, horizontal = 4.dp),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    ) {
        Cover(song, size = 52.dp, radius = 12.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = detail,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text("›", fontSize = 20.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun PlaylistRow(playlist: Playlist, songs: List<Song>, onOpen: () -> Unit, onMore: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .clickable(onClick = onOpen)
            .padding(vertical = 8.dp, horizontal = 4.dp),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    ) {
        if (songs.isNotEmpty()) {
            Cover(songs.first(), size = 52.dp, radius = 12.dp)
        } else {
            Box(
                Modifier
                    .width(52.dp)
                    .height(52.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceContainerHigh),
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                text = playlist.name,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = if (songs.isEmpty()) "Empty" else "${songs.size} songs",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            text = "⋯",
            fontSize = 18.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .clip(RoundedCornerShape(10.dp))
                .clickable(onClick = onMore)
                .padding(horizontal = 12.dp, vertical = 8.dp),
        )
    }
}

/** An album, an artist, a playlist or a mix, opened as a list of its songs. */
@Composable
private fun CollectionScreen(state: WaveState, onOpenSong: (Song) -> Unit) {
    val songs = state.openSongs()
    val title = state.openTitle()
    val playlist = (state.open as? Open.Playlist)?.let { target -> state.playlists.find { it.id == target.id } }
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
        contentPadding = PaddingValues(bottom = 24.dp),
    ) {
        item {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text(
                    text = "‹",
                    fontSize = 26.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .clickable { state.open = null }
                        .padding(horizontal = 10.dp, vertical = 2.dp),
                )
                Spacer(Modifier.weight(1f))
                if (playlist != null) {
                    Text(
                        text = "Rename or delete",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .clickable { state.playlistEditor = playlist }
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                    )
                }
            }
            ScreenTitle(
                title = title,
                subtitle = if (songs.isEmpty()) "Empty" else "${songs.size} songs",
            )
            if (songs.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text(
                        text = "▶ Play",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(MaterialTheme.colorScheme.primary)
                            .clickable {
                                state.playAll(songs)
                                state.nowPlayingOpen = true
                            }
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                    )
                    Text(
                        text = "Shuffle",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                            .clickable {
                                state.shuffleAll(songs)
                                state.nowPlayingOpen = true
                            }
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                    )
                }
            }
        }
        items(songs, key = { it.id }) { song ->
            SongRow(
                song = song,
                playing = state.player.current?.id == song.id,
                onPlay = { onOpenSong(song) },
                onFavorite = { state.toggleFavorite(song) },
                onMore = {
                    state.options = song
                    // The sheet can offer "Remove from this playlist"; the song
                    // itself stays in the library.
                    state.optionsPlaylist = playlist
                },
            )
        }
    }
}

// --- Listening -------------------------------------------------------------

/**
 * What has been listened to, and nothing else.
 *
 * The page answers three questions — how much, what most, and when last — and
 * then gets out of the way. The only action near the numbers is the one that
 * clears them.
 */
@Composable
fun ListeningScreen(state: WaveState, onOpenSong: (Song) -> Unit) {
    val summary = state.summary
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
        contentPadding = PaddingValues(bottom = 24.dp),
    ) {
        item { ScreenTitle(title = "Listening") }
        if (state.plays.isEmpty()) {
            item {
                EmptyState(
                    title = "Nothing counted yet",
                    body = "A song counts once you have heard half of it, or thirty seconds of a long one.",
                )
            }
            return@LazyColumn
        }
        item {
            StatRow(
                listeningTime(summary.totalSeconds) to "listened",
                summary.weekPlays.toString() to "plays this week",
                summary.uniqueSongs.toString() to "songs heard",
            )
            SectionTitle("Most played")
        }
        items(summary.topSongs, key = { "top-" + it.first.id }) { (song, count) ->
            SongRow(
                song = song,
                playing = state.player.current?.id == song.id,
                onPlay = { onOpenSong(song) },
                onFavorite = { state.toggleFavorite(song) },
                onMore = { state.options = song },
                trailing = "$count plays",
            )
        }
        if (summary.topArtists.isNotEmpty()) {
            item {
                SectionTitle("Most played artists")
                summary.topArtists.forEach { (artist, count) ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .clickable {
                                state.destination = Destination.Library
                                state.shelf = Shelf.Artists
                                state.open = Open.Artist(artist)
                            }
                            .padding(vertical = 10.dp, horizontal = 4.dp),
                    ) {
                        Text(
                            text = artist,
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onBackground,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            text = "$count plays",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
        item {
            SectionTitle("Recently played")
        }
        items(summary.recent.take(12), key = { "seen-" + it.id }) { song ->
            SongRow(
                song = song,
                playing = state.player.current?.id == song.id,
                onPlay = { onOpenSong(song) },
                onFavorite = { state.toggleFavorite(song) },
                onMore = { state.options = song },
            )
        }
        item {
            SectionTitle("History")
            Body("Wave counts what you hear on this phone. The numbers never leave it.")
            Text(
                text = "Clear history",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .padding(top = 12.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .clickable { state.clearHistory() }
                    .padding(horizontal = 10.dp, vertical = 8.dp),
            )
        }
    }
}

// --- Settings --------------------------------------------------------------

@Composable
fun SettingsScreen(state: WaveState, version: String, onAddMusic: () -> Unit) {
    val albums = state.albums().size
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
        contentPadding = PaddingValues(bottom = 24.dp),
    ) {
        item { ScreenTitle(title = "Settings") }
        item {
            SectionTitle("Playback")
            SettingSwitch(
                title = "Mix",
                detail = "One song blends into the next instead of stopping between them.",
                checked = state.mixEnabled,
                onChange = { state.setMix(it) },
            )
            Divider()
            SectionTitle("Sleep timer")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(0, 15, 30, 60).forEach { minutes ->
                    val selected = state.sleepMinutes == minutes
                    val label = if (minutes == 0) "Off" else "$minutes min"
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelLarge,
                        color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(
                                if (selected) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.surfaceContainerHigh,
                            )
                            .clickable { state.setSleepTimer(minutes) }
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                    )
                }
            }
            if (state.sleepMinutes > 0) {
                Body("Stopping in ${state.sleepMinutes} min.", Modifier.padding(top = 8.dp))
            }
            Divider()
        }
        item {
            SectionTitle("Lyrics")
            SettingSwitch(
                title = "Look up lyrics online",
                detail = "Off by default. When on, Wave asks a lyric service for the song that is playing.",
                checked = state.onlineLyrics,
                onChange = { state.setOnlineLyrics(it) },
            )
            Divider()
        }
        item {
            SectionTitle("Library")
            StatRow(
                state.songs.size.toString() to "songs",
                albums.toString() to "albums",
                state.favorites().size.toString() to "favorites",
            )
            Text(
                text = "Add music",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .padding(top = 14.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .clickable(onClick = onAddMusic)
                    .padding(horizontal = 10.dp, vertical = 8.dp),
            )
            Divider()
        }
        item {
            SectionTitle("About")
            Body("Wave $version")
            Body("Your files stay on this phone. Nothing is uploaded, and Mix changes only how playback is joined.")
            Spacer(Modifier.height(18.dp))
        }
    }
}
