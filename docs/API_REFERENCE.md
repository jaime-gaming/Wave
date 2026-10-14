# Referencia de API de Wave 📚

Este documento proporciona una referencia completa de las APIs, clases y funciones disponibles en Wave para desarrolladores que deseen extender o integrar la aplicación.

---

## 📋 Tabla de Contenidos

1. [API de Reproducción](#-api-de-reproducci%C3%B3n)
2. [API de Biblioteca](#-api-de-biblioteca)
3. [API de Búsqueda](#-api-de-b%C3%BAsqueda)
4. [API de Playlists](#-api-de-playlists)
5. [API de Configuración](#-api-de-configuraci%C3%B3n)
6. [Modelos de Datos](#-modelos-de-datos)
7. [Eventos](#-eventos)
8. [Extensiones](#-extensiones)

---

## 🎵 API de Reproducción

### MediaPlayerController

Clase principal para controlar la reproducción de música.

```kotlin
class MediaPlayerController(
    private val context: Context,
    private val queueManager: QueueManager
)
```

#### Métodos

| Método | Descripción | Parámetros | Retorno |
|--------|-------------|-------------|---------|
| `play()` | Inicia la reproducción | - | `Unit` |
| `pause()` | Pausa la reproducción | - | `Unit` |
| `stop()` | Detiene la reproducción | - | `Unit` |
| `next()` | Salta a la siguiente canción | - | `Unit` |
| `previous()` | Retrocede a la canción anterior | - | `Unit` |
| `seekTo(position: Long)` | Salta a una posición específica | `position` (ms) | `Unit` |
| `setVolume(volume: Float)` | Ajusta el volumen | `volume` (0.0 - 1.0) | `Unit` |
| `setRepeatMode(mode: RepeatMode)` | Configura el modo de repetición | `mode` | `Unit` |
| `setShuffle(enabled: Boolean)` | Habilita/deshabilita el modo aleatorio | `enabled` | `Unit` |
| `getCurrentSong()` | Obtiene la canción actual | - | `Song?` |
| `getCurrentPosition()` | Obtiene la posición actual | - | `Long` (ms) |
| `getDuration()` | Obtiene la duración de la canción actual | - | `Long` (ms) |
| `isPlaying()` | Verifica si está reproduciendo | - | `Boolean` |

#### Ejemplo de Uso

```kotlin
val player = MediaPlayerController(context, queueManager)

// Reproducir una canción
player.play()

// Pausar
player.pause()

// Saltar a la siguiente canción
player.next()

// Ajustar volumen
player.setVolume(0.8f)

// Configurar modo de repetición
player.setRepeatMode(RepeatMode.ALL)

// Habilitar modo aleatorio
player.setShuffle(true)
```

### RepeatMode

Enumeración para los modos de repetición.

```kotlin
enum class RepeatMode {
    NONE,       // No repetir
    ONE,        // Repetir una canción
    ALL         // Repetir todas las canciones
}
```

### PlayerState

Clase que representa el estado del reproductor.

```kotlin
data class PlayerState(
    val isPlaying: Boolean,
    val currentSong: Song?,
    val currentPosition: Long,
    val duration: Long,
    val repeatMode: RepeatMode,
    val isShuffled: Boolean,
    val queue: List<Song>,
    val currentQueueIndex: Int
)
```

---

## 📚 API de Biblioteca

### MusicLibrary

Clase principal para acceder a la biblioteca de música.

```kotlin
class MusicLibrary(
    private val songRepository: SongRepository,
    private val albumRepository: AlbumRepository,
    private val artistRepository: ArtistRepository
)
```

#### Métodos

| Método | Descripción | Parámetros | Retorno |
|--------|-------------|-------------|---------|
| `getAllSongs()` | Obtiene todas las canciones | - | `List<Song>` |
| `getSongById(id: String)` | Obtiene una canción por ID | `id` | `Song?` |
| `getAllAlbums()` | Obtiene todos los álbumes | - | `List<Album>` |
| `getAlbumById(id: String)` | Obtiene un álbum por ID | `id` | `Album?` |
| `getAllArtists()` | Obtiene todos los artistas | - | `List<Artist>` |
| `getArtistById(id: String)` | Obtiene un artista por ID | `id` | `Artist?` |
| `getSongsByAlbum(albumId: String)` | Obtiene canciones de un álbum | `albumId` | `List<Song>` |
| `getSongsByArtist(artistId: String)` | Obtiene canciones de un artista | `artistId` | `List<Song>` |
| `getAlbumsByArtist(artistId: String)` | Obtiene álbumes de un artista | `artistId` | `List<Album>` |
| `getRecentSongs(limit: Int)` | Obtiene canciones recientes | `limit` | `List<Song>` |
| `getFrequentSongs(limit: Int)` | Obtiene canciones más escuchadas | `limit` | `List<Song>` |

#### Ejemplo de Uso

```kotlin
val library = MusicLibrary(songRepository, albumRepository, artistRepository)

// Obtener todas las canciones
val songs = library.getAllSongs()

// Obtener un álbum específico
val album = library.getAlbumById("album_123")

// Obtener canciones de un artista
val artistSongs = library.getSongsByArtist("artist_456")

// Obtener álbumes de un artista
val artistAlbums = library.getAlbumsByArtist("artist_456")
```

---

## 🔍 API de Búsqueda

### SearchManager

Clase para realizar búsquedas en la biblioteca.

```kotlin
class SearchManager(
    private val songRepository: SongRepository,
    private val albumRepository: AlbumRepository,
    private val artistRepository: ArtistRepository
)
```

#### Métodos

| Método | Descripción | Parámetros | Retorno |
|--------|-------------|-------------|---------|
| `searchSongs(query: String)` | Busca canciones | `query` | `List<Song>` |
| `searchAlbums(query: String)` | Busca álbumes | `query` | `List<Album>` |
| `searchArtists(query: String)` | Busca artistas | `query` | `List<Artist>` |
| `searchAll(query: String)` | Busca en todo | `query` | `SearchResult` |
| `searchByGenre(genre: String)` | Busca por género | `genre` | `List<Song>` |
| `searchByYear(year: Int)` | Busca por año | `year` | `List<Song>` |

#### SearchResult

Clase que contiene los resultados de búsqueda.

```kotlin
data class SearchResult(
    val songs: List<Song>,
    val albums: List<Album>,
    val artists: List<Artist>
)
```

#### Ejemplo de Uso

```kotlin
val searchManager = SearchManager(songRepository, albumRepository, artistRepository)

// Buscar canciones
val songs = searchManager.searchSongs("love")

// Buscar en todo
val results = searchManager.searchAll("summer")

// Buscar por género
val rockSongs = searchManager.searchByGenre("Rock")

// Buscar por año
val songs2020 = searchManager.searchByYear(2020)
```

---

## 🎧 API de Playlists

### PlaylistManager

Clase para gestionar playlists.

```kotlin
class PlaylistManager(
    private val playlistRepository: PlaylistRepository
)
```

#### Métodos

| Método | Descripción | Parámetros | Retorno |
|--------|-------------|-------------|---------|
| `getAllPlaylists()` | Obtiene todas las playlists | - | `List<Playlist>` |
| `getPlaylistById(id: String)` | Obtiene una playlist por ID | `id` | `Playlist?` |
| `createPlaylist(name: String, description: String?)` | Crea una nueva playlist | `name`, `description` | `Playlist` |
| `updatePlaylist(id: String, name: String, description: String?)` | Actualiza una playlist | `id`, `name`, `description` | `Playlist` |
| `deletePlaylist(id: String)` | Elimina una playlist | `id` | `Unit` |
| `addSongToPlaylist(playlistId: String, songId: String)` | Añade una canción a una playlist | `playlistId`, `songId` | `Unit` |
| `removeSongFromPlaylist(playlistId: String, songId: String)` | Elimina una canción de una playlist | `playlistId`, `songId` | `Unit` |
| `reorderPlaylist(playlistId: String, fromIndex: Int, toIndex: Int)` | Reordena canciones en una playlist | `playlistId`, `fromIndex`, `toIndex` | `Unit` |
| `getPlaylistSongs(playlistId: String)` | Obtiene canciones de una playlist | `playlistId` | `List<Song>` |

#### Ejemplo de Uso

```kotlin
val playlistManager = PlaylistManager(playlistRepository)

// Crear una nueva playlist
val playlist = playlistManager.createPlaylist("My Favorites", "My favorite songs")

// Añadir una canción a la playlist
playlistManager.addSongToPlaylist(playlist.id, "song_123")

// Obtener todas las playlists
val playlists = playlistManager.getAllPlaylists()

// Obtener canciones de una playlist
val songs = playlistManager.getPlaylistSongs(playlist.id)

// Eliminar una playlist
playlistManager.deletePlaylist(playlist.id)
```

---

## ⚙️ API de Configuración

### SettingsManager

Clase para gestionar la configuración de la aplicación.

```kotlin
class SettingsManager(
    private val preferences: Preferences
)
```

#### Métodos

| Método | Descripción | Parámetros | Retorno |
|--------|-------------|-------------|---------|
| `getTheme()` | Obtiene el tema actual | - | `Theme` |
| `setTheme(theme: Theme)` | Configura el tema | `theme` | `Unit` |
| `getLanguage()` | Obtiene el idioma actual | - | `String` |
| `setLanguage(language: String)` | Configura el idioma | `language` | `Unit` |
| `getRepeatMode()` | Obtiene el modo de repetición | - | `RepeatMode` |
| `setRepeatMode(mode: RepeatMode)` | Configura el modo de repetición | `mode` | `Unit` |
| `isShuffleEnabled()` | Verifica si el modo aleatorio está habilitado | - | `Boolean` |
| `setShuffleEnabled(enabled: Boolean)` | Habilita/deshabilita el modo aleatorio | `enabled` | `Unit` |
| `getVolume()` | Obtiene el volumen | - | `Float` |
| `setVolume(volume: Float)` | Configura el volumen | `volume` | `Unit` |
| `getEqualizerSettings()` | Obtiene la configuración del ecualizador | - | `EqualizerSettings` |
| `setEqualizerSettings(settings: EqualizerSettings)` | Configura el ecualizador | `settings` | `Unit` |

#### Theme

Enumeración para los temas disponibles.

```kotlin
enum class Theme {
    SYSTEM,     // Seguir el tema del sistema
    LIGHT,      // Tema claro
    DARK        // Tema oscuro
}
```

#### EqualizerSettings

Clase que representa la configuración del ecualizador.

```kotlin
data class EqualizerSettings(
    val bands: List<EqualizerBand>
)

data class EqualizerBand(
    val frequency: Int,    // Frecuencia en Hz
    val gain: Int          // Ganancia en dB (-15 a 15)
)
```

#### Ejemplo de Uso

```kotlin
val settingsManager = SettingsManager(preferences)

// Configurar tema oscuro
settingsManager.setTheme(Theme.DARK)

// Configurar modo de repetición
settingsManager.setRepeatMode(RepeatMode.ALL)

// Habilitar modo aleatorio
settingsManager.setShuffleEnabled(true)

// Configurar volumen
settingsManager.setVolume(0.8f)

// Configurar ecualizador
val bands = listOf(
    EqualizerBand(60, 5),
    EqualizerBand(170, 3),
    EqualizerBand(310, 0),
    EqualizerBand(600, -2),
    EqualizerBand(1000, 4)
)
settingsManager.setEqualizerSettings(EqualizerSettings(bands))
```

---

## 📦 Modelos de Datos

### Song

Modelo que representa una canción.

```kotlin
data class Song(
    val id: String,            // ID único
    val title: String,         // Título de la canción
    val artist: String,        // Artista
    val album: String,         // Álbum
    val albumId: String,       // ID del álbum
    val artistId: String,      // ID del artista
    val duration: Long,       // Duración en milisegundos
    val path: String,          // Ruta del archivo
    val trackNumber: Int?,     // Número de pista
    val year: Int?,            // Año de lanzamiento
    val genre: String?,        // Género
    val bitrate: Int?,         // Tasa de bits en kbps
    val sampleRate: Int?,      // Tasa de muestreo en Hz
    val dateAdded: Long,       // Fecha de adición (timestamp)
    val dateModified: Long,    // Fecha de modificación (timestamp)
    val playCount: Int = 0,    // Número de reproducciones
    val lastPlayed: Long? = null // Última vez reproducida (timestamp)
)
```

### Album

Modelo que representa un álbum.

```kotlin
data class Album(
    val id: String,            // ID único
    val title: String,         // Título del álbum
    val artist: String,        // Artista
    val artistId: String,      // ID del artista
    val year: Int?,            // Año de lanzamiento
    val genre: String?,        // Género
    val trackCount: Int,       // Número de pistas
    val duration: Long,       // Duración total en milisegundos
    val artPath: String?,      // Ruta de la portada
    val dateAdded: Long,       // Fecha de adición (timestamp)
    val dateModified: Long     // Fecha de modificación (timestamp)
)
```

### Artist

Modelo que representa un artista.

```kotlin
data class Artist(
    val id: String,            // ID único
    val name: String,          // Nombre del artista
    val albumCount: Int,       // Número de álbumes
    val songCount: Int,        // Número de canciones
    val duration: Long,       // Duración total en milisegundos
    val artPath: String?,      // Ruta de la imagen del artista
    val dateAdded: Long,       // Fecha de adición (timestamp)
    val dateModified: Long     // Fecha de modificación (timestamp)
)
```

### Playlist

Modelo que representa una playlist.

```kotlin
data class Playlist(
    val id: String,            // ID único
    val name: String,          // Nombre de la playlist
    val description: String?,  // Descripción
    val songCount: Int,        // Número de canciones
    val duration: Long,       // Duración total en milisegundos
    val artPath: String?,      // Ruta de la imagen de la playlist
    val dateCreated: Long,     // Fecha de creación (timestamp)
    val dateModified: Long     // Fecha de modificación (timestamp)
)
```

---

## 📡 Eventos

### PlayerEvents

Eventos relacionados con el reproductor.

```kotlin
sealed class PlayerEvent {
    data class PlaySong(val song: Song) : PlayerEvent()
    data class PlaySongAtIndex(val index: Int) : PlayerEvent()
    object Play : PlayerEvent()
    object Pause : PlayerEvent()
    object Next : PlayerEvent()
    object Previous : PlayerEvent()
    data class SeekTo(val position: Long) : PlayerEvent()
    data class SetVolume(val volume: Float) : PlayerEvent()
    data class SetRepeatMode(val mode: RepeatMode) : PlayerEvent()
    data class SetShuffle(val enabled: Boolean) : PlayerEvent()
    data class QueueUpdated(val queue: List<Song>) : PlayerEvent()
    data class PlaybackError(val error: String) : PlayerEvent()
}
```

### LibraryEvents

Eventos relacionados con la biblioteca.

```kotlin
sealed class LibraryEvent {
    data class SongsLoaded(val songs: List<Song>) : LibraryEvent()
    data class AlbumsLoaded(val albums: List<Album>) : LibraryEvent()
    data class ArtistsLoaded(val artists: List<Artist>) : LibraryEvent()
    data class ScanStarted : LibraryEvent()
    data class ScanCompleted(val count: Int) : LibraryEvent()
    data class ScanError(val error: String) : LibraryEvent()
}
```

### PlaylistEvents

Eventos relacionados con playlists.

```kotlin
sealed class PlaylistEvent {
    data class PlaylistsLoaded(val playlists: List<Playlist>) : PlaylistEvent()
    data class PlaylistCreated(val playlist: Playlist) : PlaylistEvent()
    data class PlaylistUpdated(val playlist: Playlist) : PlaylistEvent()
    data class PlaylistDeleted(val playlistId: String) : PlaylistEvent()
    data class SongAddedToPlaylist(val playlistId: String, val song: Song) : PlaylistEvent()
    data class SongRemovedFromPlaylist(val playlistId: String, val songId: String) : PlaylistEvent()
}
```

---

## 🔧 Extensiones

### Extensiones de String

```kotlin
// Formatear duración en milisegundos a string legible
fun Long.formatDuration(): String {
    val minutes = this / 60000
    val seconds = (this % 60000) / 1000
    return String.format("%d:%02d", minutes, seconds)
}

// Formatear tamaño de archivo en bytes a string legible
fun Long.formatFileSize(): String {
    if (this < 1024) return "$this B"
    val kb = this / 1024
    if (kb < 1024) return "%.2f KB".format(kb)
    val mb = kb / 1024
    return "%.2f MB".format(mb)
}
```

### Extensiones de Context

```kotlin
// Obtener el color primario del tema
fun Context.getPrimaryColor(): Color {
    return MaterialTheme.colorScheme.primary
}

// Mostrar un toast
fun Context.showToast(message: String) {
    Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
}

// Obtener el tamaño de la pantalla
fun Context.getScreenSize(): Pair<Int, Int> {
    val displayMetrics = resources.displayMetrics
    return Pair(displayMetrics.widthPixels, displayMetrics.heightPixels)
}
```

### Extensiones de Compose

```kotlin
// Modificador para hacer clicable con ripple
fun Modifier.clickableWithRipple(
    onClick: () -> Unit
): Modifier = composed {
    clickable(
        interactionSource = remember { MutableInteractionSource() },
        indication = rememberRipple()
    ) {
        onClick()
    }
}

// Modificador para aplicar padding condicional
fun Modifier.conditionalPadding(
    condition: Boolean,
    padding: PaddingValues
): Modifier = if (condition) padding(padding) else this

// Función para obtener el color dominante de una imagen
@Composable
fun rememberDominantColorState(): DominantColorState {
    return remember { DominantColorState() }
}
```

---

## 📖 Ejemplos de Integración

### Ejemplo 1: Crear un Reproductor Personalizado

```kotlin
class CustomPlayer(
    private val context: Context,
    private val mediaPlayerController: MediaPlayerController
) {
    fun playSong(song: Song) {
        mediaPlayerController.loadSong(song)
        mediaPlayerController.play()
    }

    fun pause() {
        mediaPlayerController.pause()
    }

    fun getCurrentState(): PlayerState {
        return mediaPlayerController.getCurrentState()
    }
}
```

### Ejemplo 2: Crear una Nueva Pantalla de Búsqueda

```kotlin
@Composable
fun CustomSearchScreen(
    searchManager: SearchManager,
    onSongClick: (Song) -> Unit
) {
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf(SearchResult(emptyList(), emptyList(), emptyList())) }

    Column(modifier = Modifier.fillMaxSize()) {
        SearchBar(
            query = query,
            onQueryChange = { query = it },
            onSearch = {
                results = searchManager.searchAll(query)
            }
        )

        if (results.songs.isNotEmpty()) {
            SongList(songs = results.songs, onSongClick = onSongClick)
        }
    }
}
```

### Ejemplo 3: Añadir un Nuevo Filtro de Búsqueda

```kotlin
class CustomSearchManager(
    private val songRepository: SongRepository
) {
    fun searchByMood(mood: String): List<Song> {
        // Implementación personalizada para buscar por estado de ánimo
        return when (mood.lowercase()) {
            "happy" -> songRepository.getSongsByGenre("Pop")
            "sad" -> songRepository.getSongsByGenre("Blues")
            "energetic" -> songRepository.getSongsByTempoRange(120, 200)
            else -> emptyList()
        }
    }
}
```

---

## 🔄 Migraciones

### De Versión 0.x a 1.0

#### Cambios en la API

- **MediaPlayerController**: El método `loadSong` ahora recibe un `Song` en lugar de un `String` (ruta)
- **MusicLibrary**: Los métodos ahora devuelven `Flow<List<T>>` en lugar de `List<T>` para soporte reactivo
- **PlaylistManager**: Se añadió soporte para reordenar canciones

#### Migración de Código

```kotlin
// Antes (0.x)
val songs = library.getAllSongs()

// Después (1.0)
val songs by library.getAllSongs().collectAsState(initial = emptyList())
```

---

## 📚 Documentación Adicional

- [Arquitectura de Wave](ARCHITECTURE.md) - Descripción detallada de la arquitectura
- [Guía de Desarrollo](DEVELOPMENT.md) - Cómo contribuir y desarrollar
- [Roadmap](ROADMAP.md) - Características planeadas y hoja de ruta

---

## 🤝 Soporte

Si tienes preguntas sobre la API o necesitas ayuda con la integración:

1. **Abre un Issue** en [GitHub Issues](https://github.com/jaime-gaming/Wave/issues)
2. **Crea una Discusión** en [GitHub Discussions](https://github.com/jaime-gaming/Wave/discussions)
3. **Revisa los ejemplos** en el directorio `samples/` (si existe)

---

**Nota**: Esta API está en desarrollo activo y puede cambiar. Los cambios significativos serán documentados en el [CHANGELOG](../CHANGELOG.md).
