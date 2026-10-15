using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
namespace Wave.Windows;
public record Song(string Id,string Title,string Artist,string Album,string FileName,string Path,double Duration=0,bool Favorite=false,string Lyrics="",long CheckedAt=0) { public string Caption => $"{Artist} · {Album} · {FileName}"; }
public record Preferences(double Crossfade=0,bool OnlineLyrics=false);
public sealed class Library {
 public string Folder { get; } = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Wave");
 private string Index=>System.IO.Path.Combine(Folder,"library.json");
 public Library(){Directory.CreateDirectory(System.IO.Path.Combine(Folder,"audio"));}
 public List<Song> Load()=>File.Exists(Index)?JsonSerializer.Deserialize<List<Song>>(File.ReadAllText(Index))??[]:[];
 public void Save(List<Song> songs){var temp=Index+".tmp";File.WriteAllText(temp,JsonSerializer.Serialize(songs));File.Move(temp,Index,true);}
 public Preferences LoadPreferences(){var path=System.IO.Path.Combine(Folder,"preferences.json");return File.Exists(path)?JsonSerializer.Deserialize<Preferences>(File.ReadAllText(path))??new():new();}
 public void SavePreferences(Preferences value){var path=System.IO.Path.Combine(Folder,"preferences.json");File.WriteAllText(path+".tmp",JsonSerializer.Serialize(value));File.Move(path+".tmp",path,true);}
 public async Task<int> Import(IEnumerable<string> paths){var songs=Load();int count=0;foreach(var path in paths){var info=new FileInfo(path);if(info.Length is <=0 or >209715200)throw new IOException("Choose a nonempty file up to 200 MB.");await using var stream=File.OpenRead(path);var hash=Convert.ToHexString(await SHA256.HashDataAsync(stream)).ToLowerInvariant();if(songs.Any(song=>song.Id==hash))continue;var destination=System.IO.Path.Combine(Folder,"audio",hash+info.Extension.ToLowerInvariant());File.Copy(path,destination,true);var metadata=Metadata.Read(path);var song=new Song(hash,metadata.Title??System.IO.Path.GetFileNameWithoutExtension(path),metadata.Artist??"Unknown artist",metadata.Album??"Unknown album",info.Name,destination,metadata.Duration);songs.Add(song);try{Save(songs);}catch{File.Delete(destination);throw;}count++;}return count;}
}
public record Tags(string? Title=null,string? Artist=null,string? Album=null,double Duration=0);
public static class Metadata {
 public static Tags Read(string path){try{using var stream=File.OpenRead(path);using var reader=new BinaryReader(stream);var header=reader.ReadBytes(12);if(header.Length<12)return new();string? title=null,artist=null,album=null;double duration=0;
 if(Encoding.ASCII.GetString(header,0,4)=="RIFF"&&Encoding.ASCII.GetString(header,8,4)=="WAVE"){uint rate=0,size=0;while(stream.Position+8<=stream.Length){var id=Encoding.ASCII.GetString(reader.ReadBytes(4));uint length=reader.ReadUInt32();long end=stream.Position+length+(length%2);if(end>stream.Length)break;if(id=="fmt "&&length>=16){reader.ReadBytes(8);rate=reader.ReadUInt32();}else if(id=="data")size=length;else if(id=="LIST"&&length<=1048576){var data=reader.ReadBytes((int)length);if(data.Length>=4&&Encoding.ASCII.GetString(data,0,4)=="INFO")for(int at=4;at+8<=data.Length;){var key=Encoding.ASCII.GetString(data,at,4);int n=BitConverter.ToInt32(data,at+4);if(n<0||at+8+n>data.Length)break;var value=Encoding.UTF8.GetString(data,at+8,n).TrimEnd('\0');if(key=="INAM")title=value;if(key=="IART")artist=value;if(key=="IPRD")album=value;at+=8+n+(n%2);}}stream.Position=end;}if(rate>0)duration=(double)size/rate;}
 else if(Encoding.ASCII.GetString(header,0,3)=="ID3"&&(header[3]==3||header[3]==4)){int total=(header[6]<<21)|(header[7]<<14)|(header[8]<<7)|header[9];if(total<=1048576){stream.Position=10;var data=reader.ReadBytes(total);for(int at=0;at+10<=data.Length;){var key=Encoding.ASCII.GetString(data,at,4);int n=header[3]==4?(data[at+4]<<21)|(data[at+5]<<14)|(data[at+6]<<7)|data[at+7]:(data[at+4]<<24)|(data[at+5]<<16)|(data[at+6]<<8)|data[at+7];if(n<=0||at+10+n>data.Length)break;if(key is "TIT2" or "TPE1" or "TALB"){byte encoding=data[at+10];var bytes=data.AsSpan(at+11,n-1).ToArray();var decoder=encoding switch{0=>Encoding.Latin1,1=>Encoding.Unicode,2=>Encoding.BigEndianUnicode,_=>Encoding.UTF8};var value=decoder.GetString(bytes).Trim('\0','\uFEFF');if(key=="TIT2")title=value;if(key=="TPE1")artist=value;if(key=="TALB")album=value;}at+=10+n;}}}
 return new(title,artist,album,duration);}catch{return new();}}
}
