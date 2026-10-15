package io.github.jaimegaming.wave

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity:ComponentActivity() {
    override fun onCreate(savedInstanceState:Bundle?) { super.onCreate(savedInstanceState);setContent { Wave() } }
    @Composable private fun Wave() {
        val repository=remember { Library(applicationContext) };val player=remember { Player() };val client=remember { LyricsClient() };val scope=rememberCoroutineScope()
        val preferences=remember { getSharedPreferences("wave",MODE_PRIVATE) }
        var songs by remember { mutableStateOf(repository.load()) };var page by remember { mutableStateOf("Home") };var query by remember { mutableStateOf("") };var busy by remember { mutableStateOf(false) };var message by remember { mutableStateOf("") };var lyricsOpen by remember { mutableStateOf(true) };var editing by remember { mutableStateOf<Song?>(null) }
        var online by remember { mutableStateOf(preferences.getBoolean("lyrics",false)) };var fade by remember { mutableFloatStateOf(preferences.getFloat("crossfade",0f)) }
        player.crossfade=fade.toDouble()
        DisposableEffect(Unit) { onDispose { player.dispose() } }
        fun update(song:Song) { val updated=songs.map { if(it.id==song.id)song else it };repository.save(updated);songs=updated }
        fun fetch(song:Song) { scope.launch { busy=true;try { val raw=withContext(Dispatchers.IO) { client.find(song) };val latest=songs.find { it.id==song.id };if(latest!=null&&latest.title==song.title&&latest.artist==song.artist&&latest.lyrics.isEmpty())update(latest.copy(lyrics=raw,checkedAt=System.currentTimeMillis()));message=if(raw.isEmpty())"No matching lyrics." else "" }catch(error:Exception) { message=error.message ?: "Lyrics lookup failed" }finally { busy=false } } }
        LaunchedEffect(player.current?.id) { lyricsOpen=true }
        LaunchedEffect(player.current?.id,online) { val song=songs.find { it.id==player.current?.id };if(online&&song!=null&&song.lyrics.isEmpty()&&System.currentTimeMillis()-song.checkedAt>900000)fetch(song) }
        val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris -> scope.launch { busy=true;try { val added=withContext(Dispatchers.IO) { repository.importFiles(uris) };songs=repository.load();message="$added tracks added; identical files skipped." } catch(error:Exception) { songs=repository.load();message=error.message ?: "Import failed" }finally { busy=false } } }
        val colors=darkColorScheme(primary=Color(0xFFB0C7FF),background=Color(0xFF10141F),surface=Color(0xFF1D2230),surfaceVariant=Color(0xFF282E3E))
        MaterialTheme(colorScheme=colors) {
            Scaffold(containerColor=colors.background,bottomBar={ Column {
                if(player.current!=null&&page!="Now playing") Surface(shape=MaterialTheme.shapes.large,color=colors.surfaceVariant,modifier=Modifier.padding(horizontal=12.dp).fillMaxWidth().height(64.dp)) { Row(Modifier.padding(12.dp)) { Column(Modifier.weight(1f).clickable { page="Now playing";lyricsOpen=true }) { Text(player.current!!.title,maxLines=1,fontWeight=FontWeight.Bold);Text(player.current!!.artist,maxLines=1,fontSize=12.sp) };TextButton(onClick={ player.toggle() }) { Text(if(player.playing)"Pause" else "Play") };TextButton(onClick={ player.next() }) { Text("Next") } } }
                if(page!="Now playing") NavigationBar { listOf("Home","Library","Settings").forEach { name -> NavigationBarItem(selected=page==name,onClick={ page=name },icon={ Text(when(name){"Home"->"⌂";"Library"->"♫";else->"⚙"}) },label={ Text(name) }) } }
            }}) { padding ->
                Column(Modifier.padding(padding).padding(horizontal=20.dp).fillMaxSize()) {
                    Row(Modifier.padding(vertical=20.dp).fillMaxWidth()) { Canvas(Modifier.size(40.dp,32.dp)) { val p=Path().apply { moveTo(4f,7f);cubicTo(7f,7f,7f,23f,12f,23f);cubicTo(17f,23f,17f,7f,20f,7f);cubicTo(23f,7f,23f,23f,28f,23f);cubicTo(33f,23f,33f,7f,36f,7f) };scale(size.width/40,size.height/32,pivot=androidx.compose.ui.geometry.Offset.Zero) { drawPath(p,colors.primary,style=Stroke(4.5f,cap=androidx.compose.ui.graphics.StrokeCap.Round)) } };Text("Wave",fontSize=24.sp,fontWeight=FontWeight.Bold,modifier=Modifier.padding(start=10.dp).weight(1f));if(page!="Settings"&&page!="Now playing")TextButton(enabled=!busy,onClick={ picker.launch(arrayOf("audio/*")) }) { Text("Add music") } }
                    Text(page,fontSize=32.sp,fontWeight=FontWeight.Bold)
                    if(message.isNotEmpty())Text(message,color=colors.primary,fontSize=13.sp,modifier=Modifier.padding(vertical=8.dp))
                    if(player.message.isNotEmpty())Text(player.message,color=colors.error,fontSize=13.sp)
                    when(page) {
                        "Settings" -> LazyColumn(verticalArrangement=Arrangement.spacedBy(18.dp),modifier=Modifier.fillMaxWidth()) {
                            item { TextButton(onClick={page="Home"}) {Text("Back")} }
                            item { Text("Playback",fontWeight=FontWeight.Bold,modifier=Modifier.padding(top=20.dp));Text("Crossfade: ${fade.toInt()} s");Slider(value=fade,onValueChange={ fade=it;preferences.edit().putFloat("crossfade",it).apply() },valueRange=0f..12f,steps=11);Text("Equal-power overlap. Original files stay unchanged.",fontSize=13.sp) }
                            item { Row { Text("Automatic lyrics",modifier=Modifier.weight(1f));Switch(online,onCheckedChange={ online=it;preferences.edit().putBoolean("lyrics",it).apply() }) };Text("LRCLIB receives song metadata and your connection IP, never audio. Optional and off initially.",fontSize=13.sp) }
                            item { Text("Storage",fontWeight=FontWeight.Bold);Text("${songs.size} original files in app-private storage. Uninstalling deletes them; retain your originals.",fontSize=13.sp) }
                            item { Text("Privacy & rights",fontWeight=FontWeight.Bold);Text("No analytics or accounts. Use music and lyrics you may lawfully access. See the repository privacy information.",fontSize=13.sp) }
                        }
                        "Now playing" -> { val song=songs.find { it.id==player.current?.id }
                            if(song!=null)LazyColumn(verticalArrangement=Arrangement.spacedBy(14.dp)) {
                                item { TextButton(onClick={ page="Home" }) { Text("Collapse") };Text(song.title,fontSize=28.sp,fontWeight=FontWeight.Bold);Text(song.artist);Slider(value=player.time.toFloat().coerceIn(0f,song.duration.coerceAtLeast(1.0).toFloat()),onValueChange={ player.seek(it.toDouble()) },valueRange=0f..song.duration.coerceAtLeast(1.0).toFloat());Row { TextButton(onClick={ player.previous() }) { Text("Previous") };FilledTonalButton(onClick={ player.toggle() }) { Text(if(player.playing)"Pause" else "Play") };TextButton(onClick={ player.next() }) { Text("Next") } } }
                                item { TextButton(onClick={ lyricsOpen=!lyricsOpen }) { Text(if(lyricsOpen)"Lyrics ▴" else "Lyrics ▾") } }
                                if(lyricsOpen) { val lines=parseLrc(song.lyrics);val active=lines.indexOfLast { it.time<=player.time }
                                    if(song.lyrics.isBlank()) item { Text("No lyrics yet.");TextButton(enabled=!busy,onClick={ fetch(song) }) { Text("Search online") };TextButton(onClick={ editing=song }) { Text("Edit song and lyrics") } }
                                    else if(lines.isEmpty()) item { Text(song.lyrics) }
                                    else items(lines) { line -> Text(line.text.ifBlank { "♪" },fontSize=23.sp,fontWeight=if(lines.indexOf(line)==active)FontWeight.Bold else FontWeight.Normal,color=if(lines.indexOf(line)==active)colors.primary else colors.onSurfaceVariant,modifier=Modifier.fillMaxWidth().clickable { player.seek(line.time) }.padding(vertical=10.dp)) }
                                }
                            }
                        }
                        else -> {
                            if(page=="Home")Text("${songs.size} songs · ${songs.map { it.artist to it.album }.distinct().size} albums · ${songs.count { it.favorite }} favorites",fontSize=13.sp,modifier=Modifier.padding(vertical=14.dp))
                            OutlinedTextField(value=query,onValueChange={ query=it },label={ Text("Search songs, artists, albums") },modifier=Modifier.fillMaxWidth(),singleLine=true)
                            val visible=songs.filter { (it.title+" "+it.artist+" "+it.album).contains(query,true) }
                            if(visible.isEmpty())Text(if(songs.isEmpty())"Add your music to get started." else "No matching songs.",modifier=Modifier.padding(20.dp))
                            LazyColumn { items(visible,key={ it.id }) { song -> ListItem(headlineContent={ Text(song.title,maxLines=1) },supportingContent={ Text("${song.artist} · ${song.album}\n${song.filename}",maxLines=2) },trailingContent={ Row { TextButton(onClick={ update(song.copy(favorite=!song.favorite)) }) { Text(if(song.favorite)"♥" else "♡") };TextButton(onClick={ editing=song }) { Text("⋮") } } },modifier=Modifier.clickable { player.play(visible,song) }) } }
                        }
                    }
                }
            }
            editing?.let { original -> var title by remember(original.id) { mutableStateOf(original.title) };var artist by remember(original.id) { mutableStateOf(original.artist) };var album by remember(original.id) { mutableStateOf(original.album) };var lyrics by remember(original.id) { mutableStateOf(original.lyrics) }
                AlertDialog(onDismissRequest={ editing=null },title={ Text("Edit song") },text={ Column { OutlinedTextField(title,{ title=it },label={ Text("Title") });OutlinedTextField(artist,{ artist=it },label={ Text("Artist") });OutlinedTextField(album,{ album=it },label={ Text("Album") });OutlinedTextField(lyrics,{ lyrics=it },label={ Text("Lyrics / LRC") },modifier=Modifier.height(140.dp)) } },confirmButton={ TextButton(enabled=title.isNotBlank()&&lyrics.length<=100000,onClick={ update(original.copy(title=title.trim(),artist=artist.trim(),album=album.trim(),lyrics=lyrics,checkedAt=0));editing=null }) { Text("Save") } },dismissButton={ TextButton(onClick={ editing=null }) { Text("Cancel") } })
            }
        }
    }
}
