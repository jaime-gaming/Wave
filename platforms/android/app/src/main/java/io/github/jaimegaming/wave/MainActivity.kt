package io.github.jaimegaming.wave

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import io.github.jaimegaming.wave.ui.WaveApp
import io.github.jaimegaming.wave.ui.WaveTheme

/**
 * The phone app, in one place: edge to edge, in Wave's own theme, drawing
 * [WaveApp]. Everything else lives in `ui`, where a reader can find it.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Draw under the system bars and keep content clear of the cutout and the
        // gesture bar, the way Android expects a full-screen music app to look.
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val version = try {
            packageManager.getPackageInfo(packageName, 0).versionName ?: ""
        } catch (_: Exception) {
            ""
        }
        setContent {
            WaveTheme { WaveApp(version = version) }
        }
    }
}
