# Guía de Desarrollo de Wave 🛠️

Este documento proporciona instrucciones detalladas para configurar el entorno de desarrollo, compilar, ejecutar y depurar la aplicación Wave.

---

## 📋 Requisitos Previos

### Software Requerido

| Herramienta | Versión Mínima | Recomendada | Descarga |
|-------------|----------------|-------------|----------|
| **JDK** | 17 | 21 | [Adoptium](https://adoptium.net/) |
| **Gradle** | 8.0 | 8.4 | [Gradle](https://gradle.org/install/) |
| **Android Studio** | 2022.3.1 | 2024.1.1 | [Android Studio](https://developer.android.com/studio) |
| **Git** | 2.30+ | Latest | [Git](https://git-scm.com/) |

### Requisitos del Sistema

- **RAM**: 8GB mínimo (16GB recomendado)
- **Espacio en Disco**: 10GB libre
- **Sistema Operativo**: Windows 10+, macOS 10.15+, Linux (distribuciones recientes)

---

## 🚀 Configuración Inicial

### 1. Clonar el Repositorio

```bash
# Clonar el repositorio
git clone https://github.com/jaime-gaming/Wave.git

# Navegar al directorio del proyecto
cd Wave

# Configurar el repositorio remoto upstream (opcional)
git remote add upstream https://github.com/jaime-gaming/Wave.git
```

### 2. Configurar el Entorno

#### Opción A: Usar Android Studio

1. Abrir Android Studio
2. Seleccionar **File > Open**
3. Navegar al directorio del proyecto y seleccionarlo
4. Esperar a que Android Studio sincronice las dependencias de Gradle

#### Opción B: Usar Línea de Comandos

```bash
# Instalar dependencias (usando el wrapper de Gradle)
./gradlew build --refresh-dependencies
```

### 3. Configurar el SDK de Android

Asegúrate de tener instalados los siguientes componentes del SDK:

```bash
# Listar paquetes instalados
sdkmanager --list

# Instalar paquetes necesarios
sdkmanager "platforms;android-34"
sdkmanager "build-tools;34.0.0"
sdkmanager "platform-tools"
sdkmanager "emulator"
```

---

## 🏗️ Estructura del Proyecto

### Módulos Principales

```
Wave/
├── app/                      # Módulo principal de la aplicación
│   ├── src/
│   │   └── main/
│   │       ├── kotlin/        # Código Kotlin
│   │       └── resources/     # Recursos (XML, imágenes, etc.)
│   └── build.gradle.kts      # Configuración de Gradle del módulo
├── gradle/                   # Scripts de Gradle
│   └── wrapper/
│       ├── gradle-wrapper.jar
│       └── gradle-wrapper.properties
├── .github/                  # Configuración de GitHub Actions
├── docs/                     # Documentación
└── build.gradle.kts          # Configuración de Gradle del proyecto
```

---

## 📦 Compilación del Proyecto

### Compilar para Depuración

```bash
# Compilar el proyecto completo
./gradlew assembleDebug

# Compilar solo el módulo app
./gradlew :app:assembleDebug
```

### Compilar para Producción

```bash
# Compilar APK de lanzamiento
./gradlew assembleRelease

# Compilar bundle de aplicación (AAB)
./gradlew bundleRelease
```

### Limpiar el Proyecto

```bash
# Limpiar archivos generados
./gradlew clean

# Limpiar y reconstruir
./gradlew clean build
```

---

## 🎮 Ejecución de la Aplicación

### Usando Android Studio

1. Conectar un dispositivo Android o iniciar un emulador
2. Hacer clic en el botón **Run (▶️)** en la barra de herramientas
3. Seleccionar el dispositivo o emulador
4. Esperar a que la aplicación se instale y ejecute

### Usando Línea de Comandos

```bash
# Instalar en un dispositivo conectado
./gradlew installDebug

# Ejecutar en un dispositivo conectado
adb shell am start -n com.wave.music/.MainActivity
```

### Usando Emulador

```bash
# Listar emuladores disponibles
emulator -list-avds

# Iniciar un emulador
emulator -avd Pixel_6_API_34

# Instalar y ejecutar
./gradlew installDebug
```

---

## 🐛 Depuración

### Depuración con Android Studio

1. Establecer puntos de interrupción en el código
2. Hacer clic en el botón **Debug (🛠️)**
3. Usar la ventana **Debug** para inspeccionar variables
4. Usar la consola **Logcat** para ver logs

### Depuración desde Línea de Comandos

```bash
# Ver logs de la aplicación
adb logcat | grep "Wave\|Music\|Player"

# Filtrar por tag específico
adb logcat Wave:D *:S

# Guardar logs a un archivo
adb logcat -d > wave_logs.txt
```

### Niveles de Log

```kotlin
// En el código Kotlin
Log.v("TAG", "Mensaje verbose")    // Verbose
Log.d("TAG", "Mensaje debug")      // Debug
Log.i("TAG", "Mensaje info")       // Info
Log.w("TAG", "Mensaje warning")    // Warning
Log.e("TAG", "Mensaje error")      // Error
```

### Depuración de UI con Compose

```kotlin
// Habilitar herramientas de depuración de Compose
@Composable
fun MyScreen() {
    // Ver límites de recomposición
    ComposeTheme {
        LayoutInspector {
            MyContent()
        }
    }
}

// Ver información de recomposición
@Composable
fun DebugRecomposition() {
    var count by remember { mutableStateOf(0) }
    SideEffect { count++ }
    Text("Recompositions: $count")
}
```

---

## 🧪 Pruebas

### Ejecutar Pruebas Unitarias

```bash
# Ejecutar todas las pruebas unitarias
./gradlew test

# Ejecutar pruebas de un módulo específico
./gradlew :app:test

# Ejecutar pruebas de un paquete específico
./gradlew test --tests "com.wave.*"

# Ejecutar una clase de prueba específica
./gradlew test --tests "com.wave.MusicViewModelTest"

# Ejecutar un método de prueba específico
./gradlew test --tests "com.wave.MusicViewModelTest.testPlaySong"
```

### Ejecutar Pruebas de Instrumentación

```bash
# Ejecutar pruebas en un dispositivo conectado
./gradlew connectedAndroidTest

# Ejecutar pruebas de UI con Compose
./gradlew connectedAndroidTest -P android.testInstrumentationRunnerArguments.class=com.wave.ComposeTest
```

### Escribir Pruebas

#### Pruebas Unitarias con JUnit y MockK

```kotlin
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class MusicViewModelTest {
    private lateinit var viewModel: MusicViewModel
    private val getSongsUseCase: GetSongsUseCase = mockk()

    @Before
    fun setup() {
        viewModel = MusicViewModel(getSongsUseCase)
    }

    @Test
    fun `loadSongs should update state with songs`() = runTest {
        // Given
        val expectedSongs = listOf(
            Song(id = "1", title = "Song 1", artist = "Artist 1"),
            Song(id = "2", title = "Song 2", artist = "Artist 2")
        )
        coEvery { getSongsUseCase() } returns expectedSongs

        // When
        viewModel.loadSongs()

        // Then
        val state = viewModel.state.value
        assertEquals(expectedSongs, state.songs)
        assertEquals(false, state.isLoading)
    }
}
```

#### Pruebas de UI con Compose Testing

```kotlin
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Rule
import org.junit.Test

class PlayerScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun playButton_click_triggersPlay() {
        // Arrange
        val viewModel = MusicViewModel()
        composeTestRule.setContent {
            PlayerScreen(viewModel = viewModel)
        }

        // Act
        composeTestRule.onNodeWithText("Play").performClick()

        // Assert
        assert(viewModel.state.value.isPlaying)
    }
}
```

---

## 🔧 Configuración Avanzada

### Configurar Variables de Entorno

Crear un archivo `.env` en la raíz del proyecto:

```properties
# Configuración de desarrollo
DEBUG_MODE=true
LOG_LEVEL=DEBUG

# Configuración de API (futuro)
# API_BASE_URL=https://api.example.com
# API_KEY=your_api_key
```

### Configurar Build Variants

```kotlin
// En build.gradle.kts
android {
    buildTypes {
        debug {
            isMinifyEnabled = false
            isShrinkResources = false
            buildConfigField("String", "BASE_URL", '"https://dev-api.example.com"')
        }
        
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("String", "BASE_URL", '"https://api.example.com"')
        }
        
        staging {
            initWith(debug)
            buildConfigField("String", "BASE_URL", '"https://staging-api.example.com"')
        }
    }
    
    flavorDimensions += "version"
    productFlavors {
        free {
            dimension = "version"
            buildConfigField("Boolean", "IS_PAID", "false")
        }
        paid {
            dimension = "version"
            buildConfigField("Boolean", "IS_PAID", "true")
        }
    }
}
```

---

## 📊 Análisis de Código

### Ejecutar Análisis de Código

```bash
# Ejecutar lint
./gradlew lint

# Ejecutar lint con HTML report
./gradlew lintDebug -P lintHtmlReport=true

# Ejecutar detekt (análisis estático de Kotlin)
./gradlew detekt

# Ejecutar ktlint (formateo de código)
./gradlew ktlintCheck

# Formatear código con ktlint
./gradlew ktlintFormat
```

### Configurar detekt

Crear archivo `detekt.yml`:

```yaml
build:
  maxIssues: 0
  ignoreFailures: false

config:
  validation: true
  warningsAsErrors: true

complexity:
  TooManyFunctions:
    thresholdInFiles: 15
    thresholdInClasses: 15
    thresholdInInterfaces: 15
    thresholdInObjects: 15
    thresholdInEnums: 15

style:
  WildcardImport:
    active: true
    excludes: ['**/Test*.kt']
  
  MagicNumber:
    active: true
    excludes: ['**/test/**']

formatting:
  MaximumLineLength:
    maxLineLength: 120
    excludeCommentStatements: true
```

---

## 🚀 Despliegue

### Generar APK para Distribución

```bash
# Generar APK de lanzamiento
./gradlew assembleRelease

# El APK se generará en:
# app/build/outputs/apk/release/app-release.apk
```

### Generar App Bundle (AAB)

```bash
# Generar bundle de aplicación
./gradlew bundleRelease

# El AAB se generará en:
# app/build/outputs/bundle/release/app-release.aab
```

### Firmar la Aplicación

1. **Generar keystore** (solo una vez):
   ```bash
   keytool -genkey -v -keystore wave-release.keystore \
       -alias wave -keyalg RSA -keysize 2048 -validity 10000
   ```

2. **Configurar signingConfig** en `build.gradle.kts`:
   ```kotlin
   android {
       signingConfigs {
           release {
               storeFile = file("wave-release.keystore")
               storePassword = System.getenv("STORE_PASSWORD") ?: ""
               keyAlias = System.getenv("KEY_ALIAS") ?: "wave"
               keyPassword = System.getenv("KEY_PASSWORD") ?: ""
           }
       }
       
       buildTypes {
           release {
               signingConfig = signingConfigs.getByName("release")
           }
       }
   }
   ```

3. **Compilar con firma**:
   ```bash
   STORE_PASSWORD=your_password KEY_PASSWORD=your_password ./gradlew assembleRelease
   ```

---

## 🔄 Actualización de Dependencias

### Verificar Dependencias Obsoletas

```bash
# Usar el plugin de Gradle Versions
./gradlew dependencyUpdates
```

### Actualizar Dependencias

1. Editar el archivo `build.gradle.kts`
2. Actualizar las versiones de las dependencias
3. Ejecutar:
   ```bash
   ./gradlew build --refresh-dependencies
   ```

### Ejemplo de Gestión de Dependencias

```kotlin
// En build.gradle.kts
object Versions {
    const val KOTLIN = "1.9.0"
    const val COMPOSE = "1.5.0"
    const val LIFECYCLE = "2.6.2"
    const val ROOM = "2.5.2"
    const val HILT = "2.48"
    const val MEDIA3 = "1.2.0"
}

dependencies {
    implementation("org.jetbrains.kotlin:kotlin-stdlib:${Versions.KOTLIN}")
    implementation("androidx.compose.ui:ui:${Versions.COMPOSE}")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:${Versions.LIFECYCLE}")
    implementation("androidx.room:room-runtime:${Versions.ROOM}")
    implementation("com.google.dagger:hilt-android:${Versions.HILT}")
    implementation("androidx.media3:media3-exoplayer:${Versions.MEDIA3}")
}
```

---

## 📁 Gestión de Recursos

### Añadir Nuevos Recursos

#### Imágenes

1. Colocar imágenes en `app/src/main/res/drawable/`
2. Para diferentes densidades, crear directorios:
   - `drawable-mdpi/` (160 dpi)
   - `drawable-hdpi/` (240 dpi)
   - `drawable-xhdpi/` (320 dpi)
   - `drawable-xxhdpi/` (480 dpi)
   - `drawable-xxxhdpi/` (640 dpi)

#### Strings

Editar `app/src/main/res/values/strings.xml`:

```xml
<resources>
    <string name="app_name">Wave</string>
    <string name="welcome_message">Bienvenido a Wave</string>
    <string name="play">Reproducir</string>
    <string name="pause">Pausar</string>
</resources>
```

#### Colores

Editar `app/src/main/res/values/colors.xml`:

```xml
<resources>
    <color name="primary">#6200EE</color>
    <color name="primary_variant">#3700B3</color>
    <color name="secondary">#03DAC6</color>
    <color name="background">#FFFFFF</color>
    <color name="surface">#FFFFFF</color>
    <color name="error">#B00020</color>
</resources>
```

#### Estilos

Editar `app/src/main/res/values/themes.xml`:

```xml
<resources xmlns:tools="http://schemas.android.com/tools">
    <style name="Theme.Wave" parent="Theme.Material3.DayNight.NoActionBar">
        <item name="colorPrimary">@color/primary</item>
        <item name="colorSecondary">@color/secondary</item>
        <item name="colorBackground">@color/background</item>
        <item name="colorSurface">@color/surface</item>
        <item name="colorError">@color/error</item>
    </style>
</resources>
```

---

## 🎵 Pruebas con Música Local

### Añadir Música de Prueba

1. Crear un directorio `test_music` en la raíz del proyecto
2. Copiar archivos de música (MP3, FLAC, etc.) a este directorio
3. Configurar el escáner de música para usar este directorio:

```kotlin
// En MusicScanner.kt
class MusicScanner {
    fun scanMusicFiles(): List<Song> {
        val musicDir = File("test_music")
        // ... lógica de escaneo
    }
}
```

### Simular Diferentes Escenarios

```kotlin
// En pruebas unitarias
val testSongs = listOf(
    Song(
        id = "1",
        title = "Test Song 1",
        artist = "Test Artist",
        album = "Test Album",
        duration = 180000,
        path = "/test_music/song1.mp3"
    ),
    Song(
        id = "2",
        title = "Test Song 2",
        artist = "Test Artist",
        album = "Test Album",
        duration = 240000,
        path = "/test_music/song2.mp3"
    )
)
```

---

## 🔍 Solución de Problemas Comunes

### Problema: Gradle Sync Failed

**Soluciones:**
1. Refrescar dependencias: `./gradlew build --refresh-dependencies`
2. Limpiar caché de Gradle: `./gradlew clean`
3. Eliminar directorio `.gradle` y volver a sincronizar
4. Verificar conexión a internet
5. Verificar versión de JDK

### Problema: Emulador no Inicia

**Soluciones:**
1. Verificar que HAXM esté instalado (en Windows/macOS)
2. Aumentar memoria del emulador en AVD Manager
3. Usar un emulador con menos requisitos (ej: Pixel 2 en lugar de Pixel 6)
4. Habilitar virtualización en BIOS

### Problema: Aplicación se Cierra al Iniciar

**Soluciones:**
1. Verificar logs con `adb logcat`
2. Buscar `NullPointerException` o `ClassNotFoundException`
3. Verificar que todas las dependencias estén correctamente configuradas
4. Verificar permisos en AndroidManifest.xml

### Problema: Compose Preview no Funciona

**Soluciones:**
1. Asegurarse de que el componente tenga `@Preview`
2. Verificar que no haya errores de compilación
3. Reiniciar Android Studio
4. Invalidar caché: **File > Invalidate Caches / Restart**

---

## 📚 Recursos de Aprendizaje

### Kotlin
- [Documentación Oficial](https://kotlinlang.org/docs/home.html)
- [Kotlin Koans](https://kotlinlang.org/docs/koans.html)
- [Kotlin for Java Developers](https://kotlinlang.org/docs/java-to-kotlin.html)

### Jetpack Compose
- [Documentación Oficial](https://developer.android.com/jetpack/compose)
- [Compose Samples](https://github.com/android/compose-samples)
- [Compose Academy](https://www.compose.academy/)

### Android Development
- [Android Developers](https://developer.android.com/)
- [Android Basics in Kotlin](https://developer.android.com/courses/android-basics-kotlin/course)
- [Advanced Android in Kotlin](https://developer.android.com/courses/advanced-android-kotlin/course)

### Arquitectura
- [Guide to App Architecture](https://developer.android.com/jetpack/guide)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [MVVM Pattern](https://developer.android.com/jetpack/guide#recommended-app-arch)

---

## 🤝 Comunidad

- **GitHub Issues**: [https://github.com/jaime-gaming/Wave/issues](https://github.com/jaime-gaming/Wave/issues)
- **Discussions**: [https://github.com/jaime-gaming/Wave/discussions](https://github.com/jaime-gaming/Wave/discussions)
- **Pull Requests**: [https://github.com/jaime-gaming/Wave/pulls](https://github.com/jaime-gaming/Wave/pulls)

---

**¡Feliz desarrollo!** 🎉

Si tienes alguna pregunta o problema, no dudes en abrir un Issue en el repositorio.
