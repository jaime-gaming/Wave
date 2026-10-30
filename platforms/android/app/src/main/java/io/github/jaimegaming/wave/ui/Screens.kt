package io.github.jaimegaming.wave.ui

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.TextButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
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
import io.github.jaimegaming.wave.WeekRecap
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
            // The five places the collection can be seen, as tiles rather than a
            // list: three across, then two, the way the phone site wraps them.
            shortcuts.chunked(3).forEach { row ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    row.forEach { (shelf, icon, amount) ->
                        ShortcutTile(shelf, icon, amount, Modifier.weight(1f)) {
                            state.shelf = shelf
                            state.destination = Destination.Library
                            state.open = null
                        }
                    }
                    repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
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

/**
 * One collection shortcut. Icon on the left, the count on the right, the name
 * under both — the same three pieces as `.home-shortcut` on the web, in a card
 * the size of a thumb.
 */
@Composable
private fun ShortcutTile(shelf: Shelf, icon: String, amount: Int, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(22.dp))
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            WaveIcon(icon, 19.dp, MaterialTheme.colorScheme.primary)
            Spacer(Modifier.weight(1f))
            Text(
                text = amount.toString(),
                fontSize = 22.sp,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
        Text(
            text = shelf.label,
            fontSize = 13.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 12.dp),
        )
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
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun RemixScreen(state: WaveState) {
    val recap = state.recap
    val songs = recap.songs
    var confirming by remember { mutableStateOf(false) }
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
                Text(
                    weekRange(recap.start, recap.end),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                // Clearing is asked twice, in the page rather than in a dialog:
                // the second thought belongs where the first one was.
                if (confirming) {
                    Text(
                        "Yes, clear",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.clip(RoundedCornerShape(10.dp))
                            .clickable { confirming = false; state.clearHistory() }
                            .padding(horizontal = 8.dp, vertical = 8.dp),
                    )
                    Text(
                        "Keep it",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.clip(RoundedCornerShape(10.dp))
                            .clickable { confirming = false }
                            .padding(horizontal = 8.dp, vertical = 8.dp),
                    )
                } else {
                    Text(
                        "Clear history",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.clip(RoundedCornerShape(10.dp))
                            .clickable { confirming = true }
                            .padding(8.dp),
                    )
                }
            }
            // The week in one figure, with the sleeve of the song that earned it.
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                Column(Modifier.weight(1f).padding(bottom = 4.dp)) {
                    Text(
                        text = listeningTime(recap.seconds),
                        fontSize = 52.sp,
                        lineHeight = 56.sp,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                        letterSpacing = (-2).sp,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        text = "${count(recap.plays, "play")} · ${count(recap.tracks, "song")} · ${count(recap.artists, "artist")}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                    val delta = recap.seconds - recap.previousSeconds
                    if (recap.previousSeconds > 0) {
                        Text(
                            text = (if (delta >= 0) "+" else "−") + listeningTime(kotlin.math.abs(delta)) + " vs last week",
                            style = MaterialTheme.typography.labelMedium,
                            color = if (delta >= 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 6.dp),
                        )
                    }
                }
                recap.topSongs.firstOrNull()?.let { (hero, _) ->
                    Column(
                        horizontalAlignment = Alignment.End,
                        modifier = Modifier.padding(start = 16.dp),
                    ) {
                        Cover(hero, size = 112.dp, radius = 20.dp)
                        Text(
                            "MOST PLAYED",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 6.dp),
                        )
                    }
                }
            }
        }
        item { WeekBars(recap.days) }
        item {
            // Three things worth knowing, as one line of type rather than three
            // cards: the genre, the hour, the artist that carried the week.
            val peakHour = recap.hours.indices.maxByOrNull { recap.hours[it] }
            NotesLine(recap, peakHour) { artist ->
                state.destination = Destination.Library
                state.shelf = Shelf.Artists
                state.open = Open.Artist(artist)
            }
        }
        if (songs.isNotEmpty()) {
            item {
                Column(Modifier.fillMaxWidth().padding(bottom = 2.dp)) {
                    Text(
                        "Your Remix",
                        style = MaterialTheme.typography.titleLarge,
                        fontSize = 20.sp,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                    )
                    Text(
                        "${count(songs.size, "song")} from your week and, when needed, earlier favorites.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 8.dp),
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
                // Quiet chips rather than a leaderboard.
                androidx.compose.foundation.layout.FlowRow(
                    modifier = Modifier.fillMaxWidth().padding(top = 16.dp, bottom = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    recap.topArtists.forEach { (artist, plays) ->
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(16.dp))
                                .background(MaterialTheme.colorScheme.surfaceContainer)
                                .clickable {
                                    state.destination = Destination.Library
                                    state.shelf = Shelf.Artists
                                    state.open = Open.Artist(artist)
                                }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                artist,
                                style = MaterialTheme.typography.labelLarge,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.widthIn(max = 170.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                count(plays, "play"),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
        item {
            Text(
                text = "${listeningTime(state.summary.totalSeconds)} listened all time · " +
                    "${count(state.plays.size, "play")} · counted on this device, never uploaded.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
            )
        }
    }
}
/**
 * The genre, the hour and the artist that carried the week, as one wrapping line
 * of type. The artist is the only part that goes anywhere, so it is the only
 * part that is coloured like a link.
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun NotesLine(recap: WeekRecap, peakHour: Int?, onArtist: (String) -> Unit) {
    androidx.compose.foundation.layout.FlowRow(
        modifier = Modifier.fillMaxWidth().padding(top = 4.dp, bottom = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        recap.genres.firstOrNull()?.let { genre ->
            Text(
                "Mostly ${genre.genre.lowercase()}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (peakHour != null && recap.hours.any { it > 0 }) {
            Text(
                "Usually around " + peakHour.toString().padStart(2, '0') + ":00",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        recap.topArtists.firstOrNull()?.let { (artist, _) ->
            Text(
                "$artist most of all",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable { onArtist(artist) }
                    .padding(vertical = 2.dp),
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
    Column(Modifier.padding(top = 20.dp, bottom = 14.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().height(64.dp),
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
fun SettingsScreen(state: WaveState, version: String, onAddMusic: () -> Unit, onBack: () -> Unit) {
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    val appearance = LocalAppearanceChoice.current
    BackHandler(enabled = selected != null) { selected = null }
    LazyColumn(
        modifier = Modifier.wavePage(),
        contentPadding = PaddingValues(start = 14.dp, end = 14.dp, bottom = 24.dp),
    ) {
        item {
            ScreenTitle("Settings", "Playback, appearance, lyrics and storage")
            Row(
                modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable {
                    if (selected == null) onBack() else selected = null
                }.padding(vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                WaveIcon("back", 18.dp, MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(8.dp))
                Text(if (selected == null) "Back" else "All settings", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
            }
        }
        if (selected == null) {
            val sections = listOf(
                "Appearance" to "palette",
                "Playback" to "sliders",
                "Lyrics" to "lyrics",
                "Library" to "library",
                "Storage" to "storage",
                "About" to "info",
            )
            items(sections, key = { it.first }) { (title, icon) ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp).clip(RoundedCornerShape(18.dp))
                        .background(MaterialTheme.colorScheme.surfaceContainer)
                        .clickable { selected = title }.padding(horizontal = 14.dp, vertical = 15.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    WaveIcon(icon, 22.dp, MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(14.dp))
                    Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, modifier = Modifier.weight(1f))
                    WaveIcon("chevron", 20.dp, MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        } else {
            item {
                SectionTitle(selected.orEmpty())
                when (selected) {
                    "Appearance" -> {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            listOf("dark", "light", "system").forEach { mode ->
                                val active = appearance?.mode == mode
                                Text(
                                    mode.replaceFirstChar { it.uppercase() },
                                    color = if (active) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                    style = MaterialTheme.typography.labelLarge,
                                    modifier = Modifier.weight(1f).clip(RoundedCornerShape(14.dp))
                                        .background(if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainer)
                                        .clickable { appearance?.select?.invoke(mode) }.padding(vertical = 12.dp),
                                )
                            }
                        }
                    }
                    "Playback" -> {
                        SettingSwitch("Mix", "One song blends into the next instead of stopping between them.", state.mixEnabled) { state.setMix(it) }
                        Divider()
                        SectionTitle("Sleep timer")
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf(0, 15, 30, 60).forEach { minutes ->
                                val active = state.sleepMinutes == minutes
                                Text(
                                    if (minutes == 0) "Off" else "$minutes min",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = if (active) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.clip(RoundedCornerShape(10.dp))
                                        .background(if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerHigh)
                                        .clickable { state.setSleepTimer(minutes) }.padding(horizontal = 12.dp, vertical = 8.dp),
                                )
                            }
                        }
                    }
                    "Lyrics" -> SettingSwitch(
                        "Look up lyrics online",
                        "Off by default. Wave asks a lyric service for the song that is playing.",
                        state.onlineLyrics,
                    ) { state.setLyricsOnline(it) }
                    "Library" -> {
                        StatRow(state.songs.size.toString() to "songs", state.albums().size.toString() to "albums", state.favorites().size.toString() to "favorites")
                        Text("Add music", color = MaterialTheme.colorScheme.primary, modifier = Modifier.clickable(onClick = onAddMusic).padding(vertical = 14.dp))
                    }
                    "Storage" -> {
                        Body("Your music and listening history stay on this device.")
                        Text("Manage listening history", color = MaterialTheme.colorScheme.primary, modifier = Modifier.clickable { state.destination = Destination.Remix }.padding(vertical = 14.dp))
                    }
                    "About" -> {
                        Body("Wave $version")
                        Body("Your files stay on this phone. Mix changes only how playback is joined.")
                    }
                }
            }
        }
    }
}
