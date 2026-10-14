# Contribuir a Wave 🌊

¡Gracias por tu interés en contribuir a Wave! Este documento te guiará a través del proceso de contribución.

---

## 📋 Código de Conducta

Al contribuir a este proyecto, aceptas cumplir con nuestro [Código de Conducta](CODE_OF_CONDUCT.md). Sé respetuoso y amable con todos los colaboradores.

---

## 🎯 ¿Cómo puedo contribuir?

### 🐛 Reportar Bugs

1. **Verifica si ya existe** - Busca en los [Issues](https://github.com/jaime-gaming/Wave/issues) para ver si el bug ya ha sido reportado.

2. **Crea un nuevo Issue** - Si el bug no existe, crea uno nuevo con:
   - Un **título claro y descriptivo**
   - Una **descripción detallada** del problema
   - **Pasos para reproducir** el error
   - **Capturas de pantalla o videos** (si aplica)
   - **Información del entorno**:
     - Versión de la aplicación
     - Sistema operativo
     - Navegador (si es web)
     - Dispositivo (si es móvil)

3. **Etiqueta el Issue** - Usa etiquetas apropiadas como `bug`, `enhancement`, `help wanted`, etc.

### 🚀 Proponer Nuevas Características

1. **Abre un Issue de Discusión** - Describe tu idea y su caso de uso.
2. **Espera feedback** - El equipo revisará la propuesta.
3. **Implementa** - Si es aprobada, puedes implementarla y enviar un Pull Request.

### 💻 Enviar Pull Requests

1. **Forkea el repositorio**
2. **Crea una rama** para tu característica o corrección:
   ```bash
   git checkout -b feature/nueva-caracteristica
   # o
   git checkout -b fix/arreglar-bug
   ```

3. **Haz tus cambios**
   - Sigue el **estilo de código** del proyecto
   - Añade **comentarios** donde sea necesario
   - Mantén los **commits atómicos** (un cambio por commit)

4. **Ejecuta las pruebas**
   ```bash
   ./gradlew test
   ```

5. **Haz commit de tus cambios**
   ```bash
   git commit -m "Añade nueva característica"
   ```
   - Usa **mensajes de commit claros**
   - Sigue el formato: `tipo(tipo): descripción`
     - `feat: añade nueva característica`
     - `fix: corrige bug de reproducción`
     - `docs: actualiza README`
     - `refactor: mejora estructura del código`
     - `chore: actualiza dependencias`

6. **Push a tu fork**
   ```bash
   git push origin feature/nueva-caracteristica
   ```

7. **Abre un Pull Request**
   - Usa un **título claro**
   - Proporciona una **descripción detallada** de los cambios
   - Relaciona el PR con el Issue correspondiente (si existe)
   - Incluye **capturas de pantalla** si hay cambios visuales

---

## 📝 Convenciones de Código

### 🏗️ Estructura del Código

- **Kotlin** - Sigue las [guías de estilo de Kotlin](https://kotlinlang.org/docs/coding-conventions.html)
- **Jetpack Compose** - Sigue las mejores prácticas de Compose
- **Nombres** - Usa nombres descriptivos y en inglés
  - Clases: `PascalCase` (ej: `MusicPlayerService`)
  - Funciones: `camelCase` (ej: `playSong`)
  - Variables: `camelCase` (ej: `currentSong`)
  - Constantes: `UPPER_SNAKE_CASE` (ej: `MAX_VOLUME`)

### 🎨 Convenciones de UI

- **Componentes Compose** - Usa nombres descriptivos
- **Preview** - Añade `@Preview` a los componentes para visualización
- **Tema** - Usa los colores y estilos definidos en el tema
- **Espaciado** - Usa `dp` para dimensiones

### 📦 Organización de Archivos

- **ViewModels** - En `presentation/viewmodel/`
- **Screens** - En `presentation/screens/`
- **Components** - En `presentation/components/`
- **Models** - En `data/model/`
- **Repositories** - En `data/repository/`

---

## 🧪 Pruebas

### Ejecutar Pruebas

```bash
# Pruebas unitarias
./gradlew test

# Pruebas de instrumentación (Android)
./gradlew connectedAndroidTest
```

### Escribir Pruebas

- **Pruebas Unitarias** - Usa JUnit y MockK
- **Pruebas de UI** - Usa Compose Testing
- **Cobertura** - Intenta mantener una buena cobertura de código

---

## 🔧 Configuración del Entorno

### Prerrequisitos

- **JDK 17+**
- **Gradle 8.0+**
- **Android Studio** (para desarrollo móvil)
- **Git**

### Configuración Inicial

1. Clona el repositorio:
   ```bash
   git clone https://github.com/jaime-gaming/Wave.git
   ```

2. Abre el proyecto en Android Studio o tu IDE preferido

3. Sincroniza las dependencias de Gradle

4. ¡Listo para empezar a codificar!

---

## 📚 Recursos

- [Documentación de Kotlin](https://kotlinlang.org/docs/home.html)
- [Jetpack Compose](https://developer.android.com/jetpack/compose)
- [Material Design 3](https://m3.material.io/)
- [Guía de Contribución de GitHub](https://guides.github.com/activities/contributing-to-open-source/)

---

## 🙏 Reconocimientos

Gracias a todos los colaboradores que han ayudado a mejorar Wave. ¡Tu contribución es valiosa!

---

**¿Preguntas?** Abre un Issue o contacta al equipo de desarrollo.

¡Feliz codificación! 🎉
