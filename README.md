# Wave 🌊

**Tu Spotify local para escuchar música sin conexión**

Una aplicación web moderna construida con **Jetpack Compose** y **Material Design 3** que te permite reproducir tu música local con una experiencia similar a Spotify.

---

## ⚠️ DISCLAIMER

* Este proyecto es una implementación independiente y no está afiliado, patrocinado o respaldado por Spotify AB.
* El nombre "Wave" es solo para fines descriptivos y no infringe ninguna marca registrada.

---

## ✨ Características

### 🎨 Interfaz de Usuario Moderna

* **Material Design 3** - Diseño moderno con tema dinámico
* **Jetpack Compose** - Interfaz reactiva y fluida
* **Tema Adaptable** - Modo claro/oscuro automático o manual
* **Animaciones Suaves** - Transiciones fluidas entre pantallas
* **Diseño Responsivo** - Adaptable a diferentes tamaños de pantalla

### 🎵 Reproducción de Música

* **Reproducción Local** - Escucha tu música almacenada en el dispositivo
* **Gestión de Colas** - Control total sobre el orden de reproducción
* **Modos de Reproducción** - Aleatorio, repetir uno, repetir todos
* **Barra de Progreso** - Control de reproducción con visualización de tiempo
* **Controles Globales** - Controla la música desde cualquier lugar

### 📚 Gestión de Biblioteca

* **Escaneo Automático** - Detección de archivos de música en tu sistema
* **Organización por** - Canciones, Álbumes, Artistas, Géneros, Carpetas
* **Búsqueda Rápida** - Encuentra tus canciones al instante
* **Soporte de Formatos** - MP3, FLAC, WAV, OGG, AAC y más
* **Metadatos** - Visualización de información de canciones (título, artista, álbum, duración)

### 🎧 Experiencia de Usuario

* **Playlists Personalizadas** - Crea y gestiona tus propias listas
* **Historial de Reproducción** - Registra tus canciones escuchadas
* **Favoritos** - Marca tus canciones y álbumes preferidos
* **Reproducción Continua** - Sin interrupciones entre canciones

---

## 🛠️ Stack Tecnológico

| Categoría | Tecnología |
|-----------|------------|
| **Lenguaje** | Kotlin 100% |
| **UI Framework** | Jetpack Compose |
| **Design System** | Material Design 3 |
| **State Management** | StateFlow / SharedFlow |
| **Async** | Kotlin Coroutines |
| **Build System** | Gradle (KTS) |
| **Testing** | JUnit, Kotlin Test |

---

## 📋 Requisitos

* **Java 17+** (para desarrollo)
* **Gradle 8.0+**
* **Navegador moderno** (Chrome, Firefox, Edge, Safari) para la versión web
* **Android Studio** (si se compila para Android)

---

## 🚀 Primeros Pasos

### Prerrequisitos

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/jaime-gaming/Wave.git
   cd Wave
   ```

2. **Configurar el entorno**
   - Instalar [JDK 17+](https://adoptium.net/)
   - Instalar [Gradle](https://gradle.org/install/) o usar el wrapper incluido

3. **Compilar el proyecto**
   ```bash
   ./gradlew build
   ```

4. **Ejecutar la aplicación**
   ```bash
   ./gradlew run
   ```
   O abre el proyecto en Android Studio y haz clic en Run (▶️)

---

## 📁 Estructura del Proyecto

```
Wave/
├── app/
│   └── src/
│       └── main/
│           ├── kotlin/
│           │   └── com/
│           │       └── wave/
│           │           ├── data/
│           │           │   ├── model/          # Modelos de datos (Song, Album, Artist)
│           │           │   ├── repository/    # Repositorios de datos
│           │           │   └── service/       # Servicios (MusicService, etc.)
│           │           ├── presentation/
│           │           │   ├── components/    # Componentes reutilizables de Compose
│           │           │   ├── navigation/    # Navegación
│           │           │   ├── screens/       # Pantallas de la aplicación
│           │           │   └── viewmodel/     # ViewModels
│           │           └── ui/
│           │               └── theme/          # Tema, colores, tipografía
│           └── resources/
│               ├── drawable/       # Recursos gráficos
│               └── values/         # Strings, colores, estilos
├── docs/                    # Documentación técnica
├── gradle/                  # Configuración de Gradle
├── .github/                 # Workflows de GitHub Actions
├── LICENSE                  # Licencia MIT
├── README.md                # Este archivo
└── build.gradle.kts         # Configuración principal de Gradle
```

---

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Sigue estos pasos:

1. **Forkea el proyecto**
2. **Crea tu rama de característica** (`git checkout -b feature/NuevaCaracteristica`)
3. **Haz commit de tus cambios** (`git commit -m 'Añade NuevaCaracteristica'`)
4. **Push a la rama** (`git push origin feature/NuevaCaracteristica`)
5. **Abre un Pull Request**

Para más detalles, consulta [CONTRIBUTING.md](CONTRIBUTING.md)

---

## 📜 Licencia

Este proyecto está bajo la **Licencia MIT** - mira el archivo [LICENSE](LICENSE) para más detalles.

---

## 🙌 Agradecimientos

* Inspirado en [PixelPlayer](https://github.com/PixelPlayerHQ/PixelPlayer)
* Construido con ❤️ usando tecnologías modernas de Kotlin
* Diseño basado en Material Design 3

---

**Hecho con ❤️ por [Jaime Gaming](https://github.com/jaime-gaming)**

*Wave - Tu música, tu forma*
