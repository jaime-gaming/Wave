# Arquitectura de Wave 🏗️

Este documento describe la arquitectura general de la aplicación Wave, incluyendo el diseño de patrones, flujo de datos y organización de módulos.

---

## 📐 Patrones de Arquitectura

Wave sigue una arquitectura basada en **Clean Architecture** con elementos de **MVVM (Model-View-ViewModel)** adaptados para Jetpack Compose.

### Capas Principales

```
┌─────────────────────────────────────────────────┐
│                    PRESENTATION                    │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │
│  │    Screens    │  │  ViewModels  │  │Components│ │
│  └──────────────┘  └──────────────┘  └─────────┘ │
├─────────────────────────────────────────────────┤
│                     DOMAIN                         │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │
│  │  Use Cases    │  │   Models     │  │ Repo    │ │
│  └──────────────┘  └──────────────┘  │Interfaces│ │
│                                          └─────────┘ │
├─────────────────────────────────────────────────┤
│                      DATA                          │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │
│  │ Repositories  │  │  DataSource  │  │  Models  │ │
│  │  (Impl)       │  │  (Impl)      │  │  (DTO)   │ │
│  └──────────────┘  └──────────────┘  └─────────┘ │
└─────────────────────────────────────────────────┘
```

---

## 🗂️ Estructura de Directorios

```
app/
└── src/
    └── main/
        ├── kotlin/
        │   └── com/
        │       └── wave/
        │           ├── data/
        │           │   ├── model/              # Modelos de datos (DTOs, Entidades)
        │           │   │   ├── Song.kt          # Modelo de canción
        │           │   │   ├── Album.kt         # Modelo de álbum
        │           │   │   ├── Artist.kt        # Modelo de artista
        │           │   │   └── Playlist.kt      # Modelo de playlist
        │           │   ├── repository/          # Implementaciones de repositorios
        │           │   │   ├── SongRepository.kt
        │           │   │   └── ...
        │           │   └── datasource/          # Fuentes de datos
        │           │       ├── local/          # Datos locales
        │           │       │   └── MusicScanner.kt
        │           │       └── remote/         # Datos remotos (futuro)
        │           │
        │           ├── domain/                 # Capa de dominio (lógica de negocio)
        │           │   ├── model/              # Modelos de dominio
        │           │   ├── repository/          # Interfaces de repositorios
        │           │   └── usecase/            # Casos de uso
        │           │       ├── GetSongsUseCase.kt
        │           │       └── ...
        │           │
        │           └── presentation/           # Capa de presentación
        │               ├── components/          # Componentes reutilizables de Compose
        │               │   ├── MusicPlayer.kt   # Componente de reproductor
        │               │   ├── SongCard.kt      # Tarjeta de canción
        │               │   └── ...
        │               ├── navigation/          # Navegación
        │               │   ├── NavGraph.kt     # Grafo de navegación
        │               │   └── Routes.kt        # Rutas de navegación
        │               ├── screens/             # Pantallas
        │               │   ├── HomeScreen.kt    # Pantalla de inicio
        │               │   ├── LibraryScreen.kt # Pantalla de biblioteca
        │               │   ├── PlayerScreen.kt  # Pantalla del reproductor
        │               │   └── ...
        │               └── viewmodel/           # ViewModels
        │                   ├── MusicViewModel.kt
        │                   └── ...
        │
        └── resources/
            ├── drawable/       # Recursos gráficos
            ├── values/         # Strings, colores, estilos
            │   ├── colors.xml
            │   ├── strings.xml
            │   └── themes.xml
            └── font/           # Fuentes personalizadas
```

---

## 🔄 Flujo de Datos

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│   Screen     │────▶│  ViewModel   │────▶│  Use Case    │────▶│ Repository  │
│  (Compose)   │     │  (State)     │     │  (Domain)    │     │  (Data)     │
└─────────────┘     └──────────────┘     └──────────────┘     └─────────────┘
                                 │
                                 ▼
                         ┌──────────────┐
                         │ Data Source   │
                         │  (Local/DB)  │
                         └──────────────┘
```

1. **Screen (Vista)** - Componentes de Compose que observan el estado
2. **ViewModel** - Mantiene el estado de la UI y maneja eventos
3. **Use Case** - Contiene la lógica de negocio
4. **Repository** - Abstracción para acceso a datos
5. **Data Source** - Implementación concreta del acceso a datos

---

## 🎯 Componentes Clave

### 1. Capa de Presentación

#### ViewModels

Los ViewModels en Wave son responsables de:
- Mantener el estado de la UI
- Procesar eventos del usuario
- Coordinar entre diferentes casos de uso
- Manejar la navegación

Ejemplo:
```kotlin
class MusicViewModel(
    private val getSongsUseCase: GetSongsUseCase,
    private val playSongUseCase: PlaySongUseCase
) : ViewModel() {
    private val _state = MutableStateFlow(MusicState())
    val state: StateFlow<MusicState> = _state.asStateFlow()

    fun loadSongs() = viewModelScope.launch {
        _state.value = _state.value.copy(isLoading = true)
        val songs = getSongsUseCase()
        _state.value = _state.value.copy(songs = songs, isLoading = false)
    }
}
```

#### Screens

Las pantallas son componentes de Compose que:
- Observan el estado de los ViewModels
- Manejan eventos del usuario
- Muestran la interfaz de usuario

Ejemplo:
```kotlin
@Composable
fun HomeScreen(viewModel: MusicViewModel = viewModel()) {
    val state by viewModel.state.collectAsState()

    when {
        state.isLoading -> LoadingScreen()
        state.songs.isEmpty() -> EmptyLibraryScreen()
        else -> SongListScreen(songs = state.songs)
    }
}
```

### 2. Capa de Dominio

#### Use Cases

Los casos de uso encapsulan la lógica de negocio:
- Son independientes de frameworks
- Son fáciles de probar
- Contienen reglas de negocio

Ejemplo:
```kotlin
class GetSongsUseCase(
    private val songRepository: SongRepository
) {
    suspend operator fun invoke(): List<Song> {
        return songRepository.getAllSongs().sortedBy { it.title }
    }
}
```

#### Repositories (Interfaces)

Las interfaces de repositorio definen el contrato para el acceso a datos:

```kotlin
interface SongRepository {
    suspend fun getAllSongs(): List<Song>
    suspend fun getSongById(id: String): Song?
    suspend fun searchSongs(query: String): List<Song>
}
```

### 3. Capa de Datos

#### Repositories (Implementaciones)

Las implementaciones concretas de los repositorios:

```kotlin
class SongRepositoryImpl(
    private val localDataSource: SongLocalDataSource
) : SongRepository {
    override suspend fun getAllSongs(): List<Song> {
        return localDataSource.getAllSongs()
    }
    // ...
}
```

#### Data Sources

Fuentes de datos concretas:

```kotlin
class SongLocalDataSource(
    private val musicScanner: MusicScanner
) {
    suspend fun getAllSongs(): List<Song> {
        return musicScanner.scanMusicFiles()
    }
}
```

---

## 🎵 Módulo de Reproducción

### Arquitectura del Reproductor

```
┌─────────────────────────────────────────────────┐
│                 MusicPlayerService                 │
│  ┌─────────────────────────────────────────────┐│
│  │              MediaPlayerController            ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌───────┐ ││
│  │  │   Player    │  │   Queue     │  │ Timer │ ││
│  │  │  (ExoPlayer)│  │  Manager    │  │       │ ││
│  │  └─────────────┘  └─────────────┘  └───────┘ ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────────┐
              │           Audio Focus               │
              │         (Android Audio)            │
              └───────────────────────────────────┘
```

### Componentes del Reproductor

1. **MusicPlayerService** - Servicio en segundo plano
2. **MediaPlayerController** - Controlador principal
3. **Player** - Instancia de ExoPlayer
4. **QueueManager** - Gestión de la cola de reproducción
5. **AudioFocusManager** - Manejo de enfoque de audio

---

## 📊 Gestión de Estado

Wave utiliza **StateFlow** y **SharedFlow** para la gestión de estado:

### StateFlow
- Para estado que cambia con el tiempo
- Los colectores reciben el valor actual al suscribirse
- Ideal para el estado de la UI

### SharedFlow
- Para eventos puntuales
- Los colectores reciben solo nuevos valores
- Ideal para eventos como clics o navegación

### Ejemplo de Estado

```kotlin
data class MusicState(
    val songs: List<Song> = emptyList(),
    val currentSong: Song? = null,
    val isPlaying: Boolean = false,
    val currentPosition: Long = 0,
    val isLoading: Boolean = false,
    val error: String? = null
)
```

---

## 🔌 Inyección de Dependencias

Wave utiliza **Hilt** para la inyección de dependencias:

### Módulos de Hilt

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides
    @Singleton
    fun provideSongRepository(
        localDataSource: SongLocalDataSource
    ): SongRepository {
        return SongRepositoryImpl(localDataSource)
    }

    @Provides
    @Singleton
    fun provideMusicScanner(): MusicScanner {
        return MusicScannerImpl()
    }
}
```

### Inyección en ViewModels

```kotlin
@HiltViewModel
class MusicViewModel @Inject constructor(
    private val getSongsUseCase: GetSongsUseCase,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {
    // ...
}
```

---

## 🎨 Arquitectura de UI

### Componentes Reutilizables

Wave sigue el patrón de **componentes atómicos**:

```
┌─────────────────────┐
│      Screens         │  (Pantallas completas)
├─────────────────────┤
│     Organisms        │  (Componentes complejos)
├─────────────────────┤
│      Molecules       │  (Grupos de átomos)
├─────────────────────┤
│       Atoms          │  (Componentes básicos)
└─────────────────────┘
```

### Ejemplo de Composición

```kotlin
@Composable
fun PlayerScreen() {
    Column {
        PlayerHeader()       // Organism
        PlayerControls()     // Organism
        ProgressSlider()     // Molecule
        SongInfo()          // Molecule
    }
}

@Composable
fun PlayerControls() {
    Row {
        PreviousButton()    // Atom
        PlayPauseButton()   // Atom
        NextButton()        // Atom
    }
}
```

---

## 🗺️ Navegación

Wave utiliza **Jetpack Navigation Compose** para la navegación:

### Grafo de Navegación

```kotlin
@Composable
fun NavGraph() {
    NavHost(
        navController = navController,
        startDestination = Routes.Home
    ) {
        composable(Routes.Home) { HomeScreen() }
        composable(Routes.Library) { LibraryScreen() }
        composable(Routes.Player) { PlayerScreen() }
        composable(
            route = Routes.AlbumDetail + "/{albumId}",
            arguments = listOf(navArgument("albumId") { type = NavType.StringType })
        ) { backStackEntry ->
            val albumId = backStackEntry.arguments?.getString("albumId")
            AlbumDetailScreen(albumId)
        }
    }
}
```

### Routes

```kotlin
object Routes {
    const val Home = "home"
    const val Library = "library"
    const val Player = "player"
    const val AlbumDetail = "album"
    const val ArtistDetail = "artist"
    const val PlaylistDetail = "playlist"
    const val Search = "search"
    const val Settings = "settings"
}
```

---

## 💾 Almacenamiento

### Escaneo de Música

El proceso de escaneo de música local:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   MusicScanner   │────▶│  FileSystem      │────▶│   Metadata       │
│  (Service)       │     │  (Local Files)   │     │  (ID3, Vorbis)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                          │
                          ▼
                  ┌─────────────────┐
                  │    Database      │
                  │  (Room/SQLite)  │
                  └─────────────────┘
```

### Base de Datos

Wave utiliza **Room** para el almacenamiento local:

```kotlin
@Entity(tableName = "songs")
data class SongEntity(
    @PrimaryKey val id: String,
    val title: String,
    val artist: String,
    val album: String,
    val duration: Long,
    val path: String,
    val albumArt: String?,
    val trackNumber: Int?,
    val year: Int?,
    val genre: String?
)

@Dao
interface SongDao {
    @Query("SELECT * FROM songs")
    suspend fun getAllSongs(): List<SongEntity>

    @Query("SELECT * FROM songs WHERE id = :id")
    suspend fun getSongById(id: String): SongEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSongs(songs: List<SongEntity>)

    @Query("DELETE FROM songs")
    suspend fun deleteAllSongs()
}
```

---

## 🎨 Tematización

Wave utiliza **Material Design 3** con tema dinámico:

### Definición del Tema

```kotlin
val WaveTheme = MaterialTheme(
    colorScheme = colorScheme,
    typography = Typography,
    shapes = Shapes,
    content = content
)

private val DarkColorScheme = darkColorScheme(
    primary = Purple80,
    secondary = PurpleGrey80,
    tertiary = Pink80
)

private val LightColorScheme = lightColorScheme(
    primary = Purple40,
    secondary = PurpleGrey40,
    tertiary = Pink40
)
```

### Colores Dinámicos

```kotlin
val colorScheme = if (darkTheme) {
    DarkColorScheme
} else {
    LightColorScheme
}
```

---

## 🔧 Configuración del Proyecto

### Build Gradle

```kotlin
// build.gradle.kts
android {
    compileSdk = 34
    
    defaultConfig {
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }
    
    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            isMinifyEnabled = false
        }
    }
}

dependencies {
    // Kotlin
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.0")
    
    // Compose
    implementation("androidx.compose.ui:ui:1.5.0")
    implementation("androidx.compose.material3:material3:1.1.1")
    implementation("androidx.compose.ui:ui-tooling-preview:1.5.0")
    
    // Navigation
    implementation("androidx.navigation:navigation-compose:2.7.4")
    
    // ViewModel
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.6.2")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.6.2")
    
    // Room
    implementation("androidx.room:room-runtime:2.5.2")
    kapt("androidx.room:room-compiler:2.5.2")
    implementation("androidx.room:room-ktx:2.5.2")
    
    // Hilt
    implementation("com.google.dagger:hilt-android:2.48")
    kapt("com.google.dagger:hilt-compiler:2.48")
    
    // Media3
    implementation("androidx.media3:media3-exoplayer:1.2.0")
    implementation("androidx.media3:media3-ui:1.2.0")
    implementation("androidx.media3:media3-session:1.2.0")
    
    // Coil (Image Loading)
    implementation("io.coil-kt:coil-compose:2.4.0")
    
    // Testing
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    testImplementation("org.mockito.kotlin:mockito-kotlin:4.1.0")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
}
```

---

## 📊 Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                        │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    UI Components                           │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │  │
│  │  │ Screens  │  │ ViewModels│  │Navigation │  │Theming  │ │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │  │
│  └─────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                         DOMAIN LAYER                           │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    Business Logic                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │  │
│  │  │Use Cases │  │  Models   │  │Interfaces │              │  │
│  │  └──────────┘  └──────────┘  └──────────┘              │  │
│  └─────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                          DATA LAYER                             │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    Data Access                             │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │  │
│  │  │Repostories│  │DataSources│  │   Models  │              │  │
│  │  └──────────┘  └──────────┘  └──────────┘              │  │
│  └─────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                        INFRASTRUCTURE                          │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │  │
│  │  │  Hilt    │  │  Room    │  │ ExoPlayer │  │ Coroutines│ │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Buenas Prácticas

### 1. Separación de Responsabilidades

- **ViewModels** - Solo lógica de presentación
- **Use Cases** - Lógica de negocio
- **Repositories** - Acceso a datos
- **Screens** - Solo UI

### 2. Inmutabilidad

- Usa `val` en lugar de `var` cuando sea posible
- Los modelos de datos deben ser `data class` inmutables
- Usa `StateFlow` para estado mutable

### 3. Pruebas

- Prueba ViewModels con MockK
- Prueba Use Cases con datos de prueba
- Prueba UI con Compose Testing

### 4. Rendimiento

- Usa `remember` para evitar recreaciones innecesarias
- Usa `derivedStateOf` para estados computados
- Usa `LazyColumn`/`LazyRow` para listas grandes

### 5. Accesibilidad

- Usa `Modifier.semantics` para accesibilidad
- Proporciona textos alternativos para imágenes
- Asegúrate de que el contraste de colores sea adecuado

---

## 📚 Recursos Adicionales

- [Documentación de Jetpack Compose](https://developer.android.com/jetpack/compose)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [MVVM Pattern](https://developer.android.com/jetpack/guide)
- [Material Design 3](https://m3.material.io/)

---

**Nota:** Esta arquitectura puede evolucionar a medida que el proyecto crece. Los cambios significativos serán documentados en el CHANGELOG.
