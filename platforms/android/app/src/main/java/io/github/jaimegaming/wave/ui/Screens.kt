package io.github.jaimegaming.wave.ui

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.TextButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.jaimegaming.wave.DailyMix
import io.github.jaimegaming.wave.DaySlice
import io.github.jaimegaming.wave.count
import io.github.jaimegaming.wave.Playlist
import io.github.jaimegaming.wave.Song
import io.github.jaimegaming.wave.listeningTime
import io.github.jaimegaming.wave.weekRange

// --- Home ------------------------------------------------------------------

/** The same Home composition as the mobile site, backed by the native library. */
@Composable
fun HomeScreen(state: WaveState, onAddMusic: () -> Unit, onOpenSong: (Song) -> Unit) {
    if (state.open is Open.Mix) {
        CollectionScreen(state, onOpenSong)
        return
    }
    val songs = state.songs
    val mixes = state.mixes()
    val albums = state.albums().entries.sortedByDescending { entry ->
        entry.value.maxOfOrNull { it.addedAt } ?: 0L
    }
    val added = songs.sortedByDescending { it.addedAt }.take(6)
    val shortcuts = listOf(
        Triple(Shelf.Songs, "song", songs.size),
        Triple(Shelf.Albums, "album", albums.size),
        Triple(Shelf.Artists, "artist", state.artists().size),
        Triple(Shelf.Playlists, "playlist", state.playlists.size),
        Triple(Shelf.Favorites, "favorite", state.favorites().size),
    )
    LazyColumn(
        modifier = Modifier.wavePage(),
        contentPadding = PaddingValues(start = 14.dp, end = 14.dp, bottom = 24.dp),
    ) {
        item {
            ScreenTitle(
                title = "Home",
                subtitle = "${count(songs.size, "song")} · ${count(albums.size, "album")}",
            )
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Your collection",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                    fontSize = 18.sp,
                    modifier = Modifier.weight(1f),
                )
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(18.dp))
                        .background(MaterialTheme.colorScheme.primaryContainer)
                        .clickable(onClick = onAddMusic)
                        .padding(horizontal = 14.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    WaveIcon("plus", 16.dp, MaterialTheme.colorScheme.onSurface)
                    Spacer(Modifier.width(8.dp))
                    Text("Add music", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface)
                }
            }
            shortcuts.forEachIndexed { index, (shelf, icon, amount) ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 6.dp)
                        .height(46.dp)
                        .clip(RoundedCornerShape(17.dp))
                        .background(if (index == 0) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainer)
                        .clickable {
                            state.shelf = shelf
                            state.destination = Destination.Library
                            state.open = null
                        }
                        .padding(horizontal = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    WaveIcon(icon, 18.dp, MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(14.dp))
                    Text(shelf.label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
                    Text(amount.toString(), fontSize = 19.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                }
            }
        }
        if (mixes.isNotEmpty()) {
            item { SectionTitle("Daily mixes") }
            itemsIndexed(mixes, key = { _, mix -> "mix-" + mix.label }) { index, mix ->
                DailyMixRow(mix, index + 1) { state.open = Open.Mix(mix.label) }
            }
        }
        if (albums.isNotEmpty()) {
            item {
                SectionTitle("Recently added albums", action = "All albums") {
                    state.shelf = Shelf.Albums
                    state.destination = Destination.Library
                }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(albums.take(6), key = { "album-" + it.key }) { entry ->
                        Column(
                            modifier = Modifier
                                .width(144.dp)
                                .clip(RoundedCornerShape(18.dp))
                                .background(MaterialTheme.colorScheme.surfaceContainer)
                                .clickable {
                                    state.destination = Destination.Library
                                    state.shelf = Shelf.Albums
                                    state.open = Open.Album(entry.key)
                                }
                                .padding(8.dp),
                        ) {
                            Cover(entry.value.first(), size = 128.dp, radius = 13.dp)
                            Text(entry.key, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp))
                            Text(entry.value.first().artist, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
        item {
            SectionTitle(if (songs.isEmpty()) "Your music" else "Recently added songs", action = if (songs.isEmpty()) null else "All songs", onAction = {
                state.shelf = Shelf.Songs
                state.destination = Destination.Library
            })
            if (songs.isEmpty()) {
                EmptyState(
                    title = "Your library is empty",
                    body = "Add music from this device to get started.",
                    actionLabel = "Add music",
                    onAction = onAddMusic,
                )
            }
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
private fun DailyMixRow(mix: DailyMix, number: Int, onOpen: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 10.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .clickable(onClick = onOpen)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Cover(mix.songs.first(), size = 64.dp, radius = 14.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text("Daily mix $number", style = MaterialTheme.typography.titleMedium, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
            Text(mix.label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        WaveIcon("arrow", 20.dp, MaterialTheme.colorScheme.primary)
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
        modifier = Modifier.wavePage(),
        contentPadding = PaddingValues(start = 14.dp, end = 14.dp, bottom = 24.dp),
    ) {
        item {
            ScreenTitle(
                title = "Search",
                subtitle = if (state.songs.isEmpty()) "Add music to search it" else count(state.songs.size, "song"),
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
        item { SectionTitle(count(results.size, "song")) }
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
        modifier = Modifier.wavePage(),
        contentPadding = PaddingValues(start = 14.dp, end = 14.dp, bottom = 24.dp),
    ) {
        item {
            ScreenTitle(
                title = "Library",
                subtitle = when {
                    state.songs.isEmpty() -> "Empty"
                    state.query.isBlank() ->
                        "${count(state.songs.size, "song")} · ${count(state.albums().size, "album")}"
                    else -> "${state.visible().size} of ${state.songs.size} songs"
                },
            )
            val categories = Shelf.values().toList()
            categories.chunked(3).forEach { row ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    row.forEach { shelf ->
                        val selected = state.shelf == shelf
                        val amount = when (shelf) {
                            Shelf.Songs -> state.songs.size
                            Shelf.Albums -> state.albums().size
                            Shelf.Artists -> state.artists().size
                            Shelf.Playlists -> state.playlists.size
                            Shelf.Favorites -> state.favorites().size
                        }
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .height(44.dp)
                                .clip(RoundedCornerShape(16.dp))
                                .background(if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainer)
                                .clickable { state.shelf = shelf }
                                .padding(horizontal = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            val tint = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
                            Text(shelf.label, style = MaterialTheme.typography.labelLarge, color = tint, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                            Text(amount.toString(), style = MaterialTheme.typography.labelSmall, color = tint)
                        }
                    }
                }
            }
            OutlinedTextField(
                value = state.query,
                onValueChange = { state.query = it },
                placeholder = { Text("Search this library") },
                singleLine = true,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            )
            if (state.shelf == Shelf.Songs || state.shelf == Shelf.Favorites) {
                SectionTitle(if (state.shelf == Shelf.Favorites) "Favorites" else "All songs")
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
                        detail = "${count(entry.value.size, "song")} · ${entry.value.first().artist}",
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
                        detail = count(entry.value.size, "song"),
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
                text = if (songs.isEmpty()) "Empty" else count(songs.size, "song"),
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
    val mix = state.open as? Open.Mix
    val mixNumber = mix?.let { selected -> state.mixes().indexOfFirst { it.label == selected.label } + 1 } ?: 0
    val playlist = (state.open as? Open.Playlist)?.let { target -> state.playlists.find { it.id == target.id } }
    LazyColumn(
        modifier = Modifier.wavePage(),
        contentPadding = PaddingValues(start = 14.dp, end = 14.dp, bottom = 24.dp),
    ) {
        item {
            ScreenTitle(
                title = if (mix != null) "Daily mixes" else title,
                subtitle = "${count(state.songs.size, "song")} · ${count(state.albums().size, "album")}",
            )
            Row(
                modifier = Modifier.clip(RoundedCornerShape(12.dp)).clickable { state.open = null }.padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                WaveIcon("back", 18.dp, MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(8.dp))
                Text(if (mix != null) "Back to Home" else "Back", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            }
            if (mix != null && songs.isNotEmpty()) {
                Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Cover(songs.first(), size = 120.dp, radius = 18.dp)
                    Spacer(Modifier.width(16.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Daily mix $mixNumber", style = MaterialTheme.typography.headlineMedium, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                        Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp))
                        Body(count(songs.size, "song"))
                    }
                }
            } else {
                Body(if (songs.isEmpty()) "Empty" else count(songs.size, "song"), Modifier.padding(vertical = 10.dp))
            }
            if (playlist != null) {
                Text(
                    text = "Rename or delete",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable { state.playlistEditor = playlist }.padding(vertical = 8.dp),
                )
            }
            if (songs.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                    Text(
                        text = if (mix != null) "Play mix" else "Play",
                        style = MaterialTheme.typography.labelLarge,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        color = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.primary)
                            .clickable { state.playAll(songs) }.padding(horizontal = 8.dp, vertical = 12.dp),
                    )
                    Text(
                        text = "Shuffle",
                        style = MaterialTheme.typography.labelLarge,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.primaryContainer)
                            .clickable { state.shuffleAll(songs) }.padding(horizontal = 8.dp, vertical = 12.dp),
                    )
                    if (mix != null) {
                        Text(
                            text = "Save as playlist",
                            style = MaterialTheme.typography.labelLarge,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            color = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.weight(1.4f).clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.primaryContainer)
                                .clickable { state.saveDailyMix(title, songs) }.padding(horizontal = 8.dp, vertical = 12.dp),
                        )
                    }
                }
            }
        }
        items(songs, key = { it.id }) { song ->
            SongRow(
                song = song,
                playing = state.player.current?.id == song.id,
                onPlay = { onOpenSong(song) },
                onFavorite = { state.toggleFavorite(song) },
                onMore = { state.options = song; state.optionsPlaylist = playlist },
            )
        }
    }
}

// --- Remix ----------------------------------------------------------------

/** A seven-day recap and a playable selection, matching the mobile website. */
@Composable
fun RemixScreen(state: WaveState) {
    val recap = state.recap
    val songs = recap.songs
    var confirmClear by remember { mutableStateOf(false) }
    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("Clear listening history?") },
            text = { Text("Your songs and playlists will stay. Listening history will be removed from this device.") },
            confirmButton = {
                TextButton(onClick = { confirmClear = false; state.clearHistory() }) { Text("Clear history") }
            },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Keep it") } },
        )
    }
    LazyColumn(
        modifier = Modifier.wavePage(),
        contentPadding = PaddingValues(start = 14.dp, end = 14.dp, bottom = 24.dp),
    ) {
        item { ScreenTitle(title = "Remix", subtitle = "The songs you played this week") }
        if (state.plays.isEmpty()) {
            item {
                EmptyState(
                    title = "No week to look back on yet",
                    body = "Play a song and this page fills in with your week and a Remix of your music.",
                )
            }
            return@LazyColumn
        }
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(weekRange(recap.start, recap.end), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                Text(
                    "Clear history",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable { confirmClear = true }.padding(8.dp),
                )
            }
            Text(
                text = listeningTime(recap.seconds),
                fontSize = 52.sp,
                lineHeight = 58.sp,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                letterSpacing = (-2).sp,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(top = 14.dp),
            )
            Text(
                text = "${count(recap.plays, "play")} · ${count(recap.tracks, "song")} · ${count(recap.artists, "artist")}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
            val delta = recap.seconds - recap.previousSeconds
            if (recap.previousSeconds > 0) {
                Body((if (delta >= 0) "+" else "−") + listeningTime(kotlin.math.abs(delta)) + " vs last week", Modifier.padding(top = 4.dp))
            }
        }
        item { WeekBars(recap.days) }
        if (songs.isNotEmpty()) {
            item {
                Divider()
                SectionTitle("Your Remix")
                Body("${count(songs.size, "song")} from your week and, when needed, earlier favorites.")
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                ) {
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(18.dp))
                            .background(MaterialTheme.colorScheme.primary)
                            .clickable { state.playAll(songs) }
                            .padding(horizontal = 12.dp, vertical = 13.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        WaveIcon("play", 17.dp, MaterialTheme.colorScheme.onPrimary)
                        Spacer(Modifier.width(7.dp))
                        Text("Play Remix", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onPrimary)
                    }
                    Text(
                        text = "Save as playlist",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(18.dp))
                            .background(MaterialTheme.colorScheme.primaryContainer)
                            .clickable { state.saveRemix() }
                            .padding(horizontal = 12.dp, vertical = 13.dp),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                }
            }
            itemsIndexed(songs, key = { _, song -> "remix-" + song.id }) { position, song ->
                val plays = recap.topSongs.firstOrNull { it.first.id == song.id }?.second
                RemixRow(song, position + 1, plays, state.player.current?.id == song.id) {
                    state.player.play(songs, song)
                }
            }
        }
        if (recap.topArtists.isNotEmpty()) {
            item {
                Divider()
                SectionTitle("Artists this week")
                recap.topArtists.forEach { (artist, plays) ->
                    Row(
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable {
                            state.destination = Destination.Library
                            state.shelf = Shelf.Artists
                            state.open = Open.Artist(artist)
                        }.padding(vertical = 10.dp, horizontal = 4.dp),
                    ) {
                        Text(artist, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                        Text(count(plays, "play"), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        item {
            Divider()
            SectionTitle("More about this week")
            Body(recap.genres.firstOrNull()?.let { "Most played genre: ${it.genre} · ${listeningTime(it.seconds)}" } ?: "Most played genre: untagged")
        }
        if (recap.hours.any { it > 0 }) item { HourStrip(recap.hours) }
        item {
            Divider()
            Body(
                "${listeningTime(state.summary.totalSeconds)} listened all time · ${count(state.plays.size, "play")}. " +
                    "Counted on this device, never uploaded.",
                Modifier.padding(top = 12.dp),
            )
        }
    }
}

/**
 * The week as seven bars.
 *
 * One column per day, height in proportion to the day's minutes, grown once when
 * the screen opens with the same spring the web page uses. Quiet days keep a
 * stub so the week never changes width.
 */
@Composable
private fun WeekBars(days: List<DaySlice>) {
    if (days.isEmpty()) return
    val peak = (days.maxOfOrNull { it.seconds } ?: 0).coerceAtLeast(1)
    var grown by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<Int?>(null) }
    LaunchedEffect(days) { grown = true }
    Column(Modifier.padding(top = 24.dp, bottom = 20.dp)) {
        Divider()
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 18.dp).height(64.dp),
            horizontalArrangement = Arrangement.spacedBy(7.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            days.forEachIndexed { index, day ->
                val share = if (day.seconds == 0) 0.04f else (day.seconds.toFloat() / peak).coerceAtLeast(0.09f)
                val height by animateFloatAsState(
                    targetValue = if (grown) share else 0f,
                    animationSpec = spring(dampingRatio = 0.85f, stiffness = Spring.StiffnessMediumLow),
                    label = "week bar",
                )
                val dayName = java.text.SimpleDateFormat("EEE d", java.util.Locale.getDefault()).format(java.util.Date(day.at))
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp)
                        .semantics { contentDescription = "$dayName: ${listeningTime(day.seconds)}" }
                        .clickable { selected = index },
                    contentAlignment = Alignment.BottomCenter,
                ) {
                    Box(
                        Modifier.fillMaxWidth().height(64.dp * height.coerceIn(0f, 1f))
                            .clip(RoundedCornerShape(topStart = 7.dp, topEnd = 7.dp))
                            .background(if (index == days.lastIndex || selected == index) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerHigh),
                    )
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            days.forEach { day ->
                Text(
                    weekdayLetter(day.at),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        val day = selected?.let { days.getOrNull(it) } ?: days.maxByOrNull { it.seconds }
        if (day != null && day.seconds > 0) {
            val label = java.text.SimpleDateFormat("EEE", java.util.Locale.getDefault()).format(java.util.Date(day.at))
            Body(if (selected == null) "Most on $label, ${listeningTime(day.seconds)}" else "$label · ${listeningTime(day.seconds)} · ${count(day.plays, "play")}", Modifier.padding(top = 10.dp))
        }
    }
}

/**
 * When in the day: one thin column per hour, the busiest lit.
 *
 * A week of listening has a shape in the clock as well as in the calendar, and
 * this is that shape without a chart library or an axis.
 */
@Composable
private fun HourStrip(hours: List<Int>) {
    val peakHour = hours.indices.maxByOrNull { hours[it] } ?: 0
    val peak = hours.maxOrNull()?.coerceAtLeast(1) ?: 1
    var grown by remember { mutableStateOf(false) }
    LaunchedEffect(hours) { grown = true }
    Column(Modifier.padding(top = 4.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "When you listen",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "Around " + peakHour.toString().padStart(2, '0') + ":00",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .padding(top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(3.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            hours.forEachIndexed { hour, plays ->
                val share = if (plays == 0) 0.06f else (plays.toFloat() / peak).coerceAtLeast(0.1f)
                val height by animateFloatAsState(
                    targetValue = if (grown) share else 0f,
                    animationSpec = spring(dampingRatio = 0.72f, stiffness = Spring.StiffnessMediumLow),
                    label = "hour column",
                )
                Box(
                    Modifier
                        .weight(1f)
                        .height(44.dp * height.coerceIn(0f, 1f))
                        .clip(RoundedCornerShape(3.dp))
                        .background(
                            if (hour == peakHour) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.primary.copy(alpha = 0.34f),
                        ),
                )
            }
        }
    }
}

/** "M", "T", "W" — the first letter of the local weekday. */
private fun weekdayLetter(at: Long): String =
    java.text.SimpleDateFormat("EEEEE", java.util.Locale.getDefault())
        .format(java.util.Date(at))
        .take(1)
        .uppercase(java.util.Locale.getDefault())

/** One song of the Remix: its place, its count, and a way in. */
@Composable
private fun RemixRow(song: Song, position: Int, plays: Int?, playing: Boolean, onPlay: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .clickable(onClick = onPlay)
            .padding(vertical = 6.dp, horizontal = 4.dp),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    ) {
        Text(
            text = "$position",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(20.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.End,
        )
        Spacer(Modifier.width(12.dp))
        Cover(song, size = 46.dp, radius = 11.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                text = song.title,
                style = MaterialTheme.typography.titleMedium,
                color = if (playing) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = song.artist,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (plays != null) {
            Text(
                text = "${plays}×",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// --- Settings --------------------------------------------------------------

@Composable
fun SettingsScreen(state: WaveState, version: String, onAddMusic: () -> Unit) {
    val albums = state.albums().size
    LazyColumn(
        modifier = Modifier.wavePage(),
        contentPadding = PaddingValues(start = 14.dp, end = 14.dp, bottom = 24.dp),
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
                onChange = { state.setLyricsOnline(it) },
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
