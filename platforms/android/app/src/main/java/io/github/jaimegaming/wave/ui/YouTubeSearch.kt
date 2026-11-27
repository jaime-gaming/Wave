package io.github.jaimegaming.wave.ui

import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import io.github.jaimegaming.wave.OnlineVideo
import io.github.jaimegaming.wave.YouTubeCatalogue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext


@Composable
fun YouTubeSearch(query: String, localPlaying: Boolean, pauseLocal: () -> Unit) {
    var notice by remember { mutableStateOf(false) }
    var searching by remember { mutableStateOf(false) }
    var results by remember { mutableStateOf<List<OnlineVideo>>(emptyList()) }
    var message by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<OnlineVideo?>(null) }
    val latestQuery by rememberUpdatedState(query)
    val scope = rememberCoroutineScope()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) selected = null
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    val directId = YouTubeCatalogue.videoIdFromLink(query)
    LaunchedEffect(query) { results = emptyList(); message = null }
    LaunchedEffect(localPlaying) { if (localPlaying) selected = null }
    Column(Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
        Text(Loc.t("YouTube"), style = MaterialTheme.typography.titleMedium)
        if (directId != null) {
            TextButton(onClick = {
                pauseLocal()
                selected = OnlineVideo(directId, Loc.t("YouTube"), "YouTube")
            }) { Text(Loc.t("Play")) }
        } else {
            TextButton(onClick = { notice = true }, enabled = !searching && query.trim().length >= 2) {
                Text(Loc.t(if (searching) "Searching YouTube…" else "Search online"))
            }
        }
        message?.let { Text(Loc.t(it), color = MaterialTheme.colorScheme.onSurfaceVariant) }
        results.forEach { video ->
            Column(Modifier.fillMaxWidth().clickable {
                pauseLocal()
                selected = video
            }.padding(vertical = 10.dp)) {
                Text(video.title, style = MaterialTheme.typography.bodyLarge)
                Text(video.author, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    if (notice) AlertDialog(
        onDismissRequest = { notice = false },
        title = { Text(Loc.t("Search online")) },
        text = { Text(Loc.t("Your search is sent to Wave and YouTube. Playing a video connects to YouTube.")) },
        confirmButton = { TextButton(onClick = {
            notice = false
            val phrase = query
            searching = true
            message = null
            scope.launch {
                try {
                    val found = withContext(Dispatchers.IO) { YouTubeCatalogue.search(phrase) }
                    if (latestQuery == phrase) {
                        results = found
                        if (found.isEmpty()) message = "No matching songs found. Try another search or paste a YouTube link."
                    }
                } catch (error: Exception) {
                    if (error is CancellationException) throw error
                    if (latestQuery == phrase) message = "Search is unreachable right now."
                } finally { searching = false }
            }
        }) { Text(Loc.t("Search online")) } },
        dismissButton = { TextButton(onClick = { notice = false }) { Text(Loc.t("Cancel")) } },
    )
    selected?.let { video ->
        AlertDialog(
            onDismissRequest = { selected = null },
            title = { Text(video.title) },
            text = { EmbeddedYouTube(video.id) },
            confirmButton = { TextButton(onClick = { selected = null }) { Text(Loc.t("Close")) } },
        )
    }
}

@Composable
private fun EmbeddedYouTube(id: String) {
    val context = LocalContext.current
    val web = remember(id) {
        WebView(context).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = true
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean =
                    request?.isForMainFrame == true
            }
            loadDataWithBaseURL("https://wave.jaime-gaming.com/", """
                <!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
                <style>html,body{margin:0;background:#0f121c;height:100%}iframe{width:100%;height:100%;border:0}</style>
                <iframe src="https://www.youtube-nocookie.com/embed/$id?playsinline=1" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe>
            """.trimIndent(), "text/html", "UTF-8", null)
        }
    }
    DisposableEffect(web) { onDispose { web.stopLoading(); web.loadUrl("about:blank"); web.destroy() } }
    AndroidView(factory = { web }, modifier = Modifier.fillMaxWidth().height(220.dp))
}
