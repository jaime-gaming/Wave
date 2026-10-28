package io.github.jaimegaming.wave.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.only
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.sp
import io.github.jaimegaming.wave.Song

/**
 * The shell: one screen at a time, a bar that stays, and a nav that never covers
 * content.
 *
 * Everything the phone version does is reachable from here in two taps at most:
 * the three destinations, the player, and the two ways into a song (play it, or
 * open it to edit it).
 */
@Composable
fun WaveApp(version: String) {
    val context = LocalContext.current
    val state = rememberWaveState(context)
    val player = state.player
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        state.importMusic(uris)
    }
    val addMusic: () -> Unit = { picker.launch(arrayOf("audio/*")) }

    DisposableEffect(Unit) {
        onDispose { state.dispose() }
    }
    val currentSong = player.current?.let { playing -> state.songs.find { it.id == playing.id } }
    LaunchedEffect(currentSong?.id, state.onlineLyrics) {
        currentSong?.let { state.maybeLookupLyrics(it) }
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
                                    onClick = { state.destination = item },
                                    icon = {
                                        Text(
                                            text = when (item) {
                                                Destination.Home -> "⌂"
                                                Destination.Library -> "♫"
                                                Destination.Settings -> "⚙"
                                            },
                                            fontSize = 17.sp,
                                        )
                                    },
                                    label = { Text(item.label) },
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
                        Destination.Library -> LibraryScreen(state, addMusic, open)
                        Destination.Settings -> SettingsScreen(state, version, addMusic)
                    }
                }
            }
        }
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
    }
}
