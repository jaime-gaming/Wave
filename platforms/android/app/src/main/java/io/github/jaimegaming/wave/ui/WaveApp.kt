package io.github.jaimegaming.wave.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.compose.ui.unit.sp
import io.github.jaimegaming.wave.Song

/**
 * The shell: one screen at a time, a bar that stays, and a nav that never covers
 * content.
 *
 * Everything the phone version does is reachable from here in two taps at most:
 * the five destinations, the player, the queue, and every way into a song.
 */
@Composable
fun WaveApp(version: String, opening: Opening = Opening.Default) {
    val context = LocalContext.current
    val state = rememberWaveState(context)
    val player = state.player
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        state.importMusic(uris)
    }
    val folder = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { tree ->
        tree?.let { state.importFolder(it) }
    }
    val addMusic: () -> Unit = { state.addOpen = true }
    // Reading the music the system already indexes needs the audio permission; a
    // refusal is answered in words rather than by an empty list.
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        if (grants.values.any { it }) state.importFromDevice()
        else state.notice = "Wave needs permission to read the music on this device."
    }
    val importDevice: () -> Unit = {
        val audio = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Manifest.permission.READ_MEDIA_AUDIO
        } else {
            Manifest.permission.READ_EXTERNAL_STORAGE
        }
        if (ContextCompat.checkSelfPermission(context, audio) == PackageManager.PERMISSION_GRANTED) {
            state.importFromDevice()
        } else {
            permission.launch(arrayOf(audio))
        }
    }

    LaunchedEffect(opening) {
        when (opening) {
            is Opening.Where -> state.destination = opening.destination
            Opening.Favorites -> {
                state.destination = Destination.Library
                state.shelf = Shelf.Favorites
            }
            Opening.Player -> if (player.current != null) state.nowPlayingOpen = true
            Opening.Default -> Unit
        }
    }
    DisposableEffect(Unit) {
        onDispose { state.dispose() }
    }
    val currentSong = player.current?.let { playing -> state.songs.find { it.id == playing.id } ?: playing }
    LaunchedEffect(currentSong?.id, state.onlineLyrics) {
        currentSong?.let { state.maybeLookupLyrics(it) }
    }

    // Back closes what is open, in the order it was opened, before it leaves.
    BackHandler(enabled = state.nowPlayingOpen) { state.nowPlayingOpen = false }
    BackHandler(enabled = !state.nowPlayingOpen && state.queueOpen) { state.queueOpen = false }
    BackHandler(enabled = !state.nowPlayingOpen && !state.queueOpen && state.open != null) {
        state.open = null
    }

    Box(Modifier.fillMaxSize()) {
        if (state.nowPlayingOpen && currentSong != null) {
            Box(Modifier.windowInsetsPadding(WindowInsets.safeDrawing)) {
                NowPlayingScreen(
                    song = currentSong,
                    state = state,
                    onCollapse = { state.nowPlayingOpen = false },
                    onEdit = { state.editing = currentSong },
                )
            }
        } else {
            Scaffold(
                containerColor = MaterialTheme.colorScheme.background,
                contentWindowInsets = WindowInsets.safeDrawing,
                bottomBar = {
                    Column(
                        Modifier.windowInsetsPadding(
                            WindowInsets.safeDrawing.only(
                                WindowInsetsSides.Horizontal + WindowInsetsSides.Bottom,
                            ),
                        ),
                    ) {
                        if (currentSong != null) {
                            MiniPlayer(
                                player = player,
                                song = currentSong,
                                onOpen = { state.nowPlayingOpen = true },
                            )
                        }
                        NavigationBar(containerColor = MaterialTheme.colorScheme.background) {
                            Destination.values().forEach { item ->
                                NavigationBarItem(
                                    selected = state.destination == item,
                                    onClick = {
                                        state.destination = item
                                        if (item != Destination.Library) state.open = null
                                    },
                                    icon = { Text(item.glyph, fontSize = 17.sp) },
                                    label = { Text(item.label, fontSize = 11.sp, maxLines = 1) },
                                )
                            }
                        }
                    }
                },
            ) { padding ->
                Column(Modifier.padding(padding)) {
                    Notice(state.notice) { state.clearMessage() }
                    val open: (Song) -> Unit = { song ->
                        state.play(song)
                        state.nowPlayingOpen = true
                    }
                    when (state.destination) {
                        Destination.Home -> HomeScreen(state, addMusic, open)
                        Destination.Search -> SearchScreen(state, open)
                        Destination.Library -> LibraryScreen(state, addMusic, open)
                        Destination.Remix -> RemixScreen(state, open)
                        Destination.Settings -> SettingsScreen(state, version, addMusic)
                    }
                }
            }
        }
        AddMusicSheet(
            open = state.addOpen,
            busy = state.busy,
            onDismiss = { state.addOpen = false },
            onFiles = {
                state.addOpen = false
                picker.launch(arrayOf("audio/*"))
            },
            onDevice = {
                state.addOpen = false
                importDevice()
            },
            onFolder = {
                state.addOpen = false
                folder.launch(null)
            },
        )
        SongOptionsSheet(state, onQueue = { state.queueOpen = true })
        AddToPlaylistSheet(state)
        state.editing?.let { song ->
            EditSongDialog(
                song = song,
                onDismiss = { state.editing = null },
                onSave = { updated ->
                    state.update(updated)
                    state.notice = "Song updated."
                },
            )
        }
        state.playlistEditor?.let { playlist ->
            PlaylistEditorDialog(
                playlist = playlist,
                onDismiss = { state.playlistEditor = null },
                onRename = { name ->
                    state.renamePlaylist(playlist, name)
                    state.playlistEditor = null
                },
                onDelete = {
                    state.deletePlaylist(playlist)
                    state.playlistEditor = null
                },
            )
        }
        if (state.newPlaylistOpen) {
            NewPlaylistDialog(
                onDismiss = { state.newPlaylistOpen = false },
                onCreate = { name ->
                    state.createPlaylist(name)
                    state.newPlaylistOpen = false
                },
            )
        }
        if (state.queueOpen) QueueSheet(state, onDismiss = { state.queueOpen = false })
    }
}
