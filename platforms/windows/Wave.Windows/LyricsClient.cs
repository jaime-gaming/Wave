using System.IO;
using System.Net;
using System.Net.Http;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
namespace Wave.Windows;
public sealed class LyricsClient : IDisposable {
 private readonly HttpClient http=new(){Timeout=TimeSpan.FromSeconds(15)};
 private DateTime retryAt=DateTime.MinValue;
 public LyricsClient(){http.DefaultRequestHeaders.UserAgent.ParseAdd("Wave/0.1.0 (https://github.com/jaime-gaming/Wave)");}
 public static string Canonical(string value)=>Regex.Replace(Regex.Replace(value.Normalize(NormalizationForm.FormD),@"\p{M}","").ToLowerInvariant(),@"[^\p{L}\p{N}]+"," ").Trim();
 public async Task<string> Find(Song song,CancellationToken token=default){if(DateTime.UtcNow<retryAt)throw new IOException("Lyrics service is cooling down.");string title=song.Title,artist=song.Artist;if(artist=="Unknown artist"){var pieces=System.IO.Path.GetFileNameWithoutExtension(song.FileName).Split(" - ");if(pieces.Length!=2)return "";artist=pieces[0];title=pieces[1];}var query=$"track_name={Uri.EscapeDataString(title)}&artist_name={Uri.EscapeDataString(artist)}";if(song.Duration is >=1 and <=3600)query+=$"&duration={song.Duration.ToString(CultureInfo.InvariantCulture)}";
 async Task<JsonDocument?> Get(string path){using var response=await http.GetAsync("https://lrclib.net/api/"+path,HttpCompletionOption.ResponseHeadersRead,token);if(response.StatusCode==HttpStatusCode.NotFound)return null;if((int)response.StatusCode is 429 or 503){retryAt=DateTime.UtcNow.AddSeconds(Math.Max(60,response.Headers.RetryAfter?.Delta?.TotalSeconds??60));throw new IOException("Lyrics service is busy.");}response.EnsureSuccessStatusCode();await using var stream=await response.Content.ReadAsStreamAsync(token);using var buffer=new MemoryStream();var bytes=new byte[8192];while(true){var count=await stream.ReadAsync(bytes,token);if(count==0)break;if(buffer.Length+count>600000)throw new IOException("Lyrics response too large.");buffer.Write(bytes,0,count);}return JsonDocument.Parse(buffer.ToArray());}
 string? Match(JsonElement item){if(!item.TryGetProperty("trackName",out var t)||!item.TryGetProperty("artistName",out var a)||Canonical(t.GetString()??"")!=Canonical(title)||Canonical(a.GetString()??"")!=Canonical(artist))return null;if(song.Duration>0&&(!item.TryGetProperty("duration",out var d)||Math.Abs(d.GetDouble()-song.Duration)>3))return null;foreach(var key in new[]{"syncedLyrics","plainLyrics"})if(item.TryGetProperty(key,out var l)&&l.ValueKind==JsonValueKind.String&&!string.IsNullOrWhiteSpace(l.GetString()))return l.GetString()![..Math.Min(100000,l.GetString()!.Length)];return null;}
 using(var exact=await Get("get?"+query)){if(exact!=null&&Match(exact.RootElement) is string result)return result;}
 await Task.Delay(300,token);using var search=await Get($"search?track_name={Uri.EscapeDataString(title)}&artist_name={Uri.EscapeDataString(artist)}");if(search?.RootElement.ValueKind==JsonValueKind.Array)foreach(var record in search.RootElement.EnumerateArray().Take(20))if(Match(record) is string result)return result;return "";
 }
 public void Dispose()=>http.Dispose();
 public static List<(double Time,string Text)> Parse(string raw){var output=new List<(double,string)>();var regex=new Regex(@"\[(\d{1,4}):([0-5]\d)(?:[.:](\d{1,3}))?\]");double offset=0;var header=Regex.Match(raw,@"\[offset:([+-]?\d+)\]");if(header.Success)offset=double.Parse(header.Groups[1].Value,CultureInfo.InvariantCulture)/1000;foreach(var row in raw.Split('\n'))foreach(Match stamp in regex.Matches(row)){double time=double.Parse(stamp.Groups[1].Value,CultureInfo.InvariantCulture)*60+double.Parse(stamp.Groups[2].Value,CultureInfo.InvariantCulture);if(stamp.Groups[3].Success)time+=double.Parse("0."+stamp.Groups[3].Value,CultureInfo.InvariantCulture);output.Add((Math.Max(0,time-offset),regex.Replace(row,"").Trim()));if(output.Count==2000)return output.OrderBy(line=>line.Item1).ToList();}return output.OrderBy(line=>line.Item1).ToList();}
}
