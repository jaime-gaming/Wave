package io.github.jaimegaming.wave

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import io.github.jaimegaming.wave.ui.Destination
import io.github.jaimegaming.wave.ui.Opening
import io.github.jaimegaming.wave.ui.WaveApp
import io.github.jaimegaming.wave.ui.WaveTheme

/**
 * The phone app, in one place: edge to edge, in Wave's own theme, drawing
 * [WaveApp]. Everything else lives in `ui`, where a reader can find it.
 */
class MainActivity : ComponentActivity() {
    private val notifications =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Draw under the system bars and keep content clear of the cutout and the
        // gesture bar, the way a full-screen music app is expected to look.
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        // The lock-screen controls are a notification; without this permission the
        // music still plays but the controls stay hidden.
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            notifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        val version = try {
            packageManager.getPackageInfo(packageName, 0).versionName ?: ""
        } catch (_: Exception) {
            ""
        }
        setContent {
            WaveTheme { WaveApp(version = version, opening = opening()) }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }

    /** Where a shortcut, the widget or the notification asked the app to open. */
    private fun opening(): Opening = when (intent?.getStringExtra(EXTRA_DESTINATION)) {
        "search" -> Opening.Where(Destination.Search)
        "listening" -> Opening.Where(Destination.Listening)
        "favorites" -> Opening.Favorites
        else -> if (intent?.getBooleanExtra(EXTRA_OPEN_PLAYER, false) == true) Opening.Player else Opening.Default
    }

    companion object {
        const val EXTRA_OPEN_PLAYER = "wave.openPlayer"
        const val EXTRA_DESTINATION = "wave.destination"
    }
}
