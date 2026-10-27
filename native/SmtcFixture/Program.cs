using System.Diagnostics;
using System.Text.Json;
using Windows.Media;
using Windows.Media.Playback;

Console.InputEncoding = new System.Text.UTF8Encoding(false);
Console.OutputEncoding = new System.Text.UTF8Encoding(false);

using var player = new MediaPlayer();
player.CommandManager.IsEnabled = false;
var smtc = player.SystemMediaTransportControls;
using var artworkStream = new Windows.Storage.Streams.InMemoryRandomAccessStream();
if (args.Length > 0) {
    using var writer = new Windows.Storage.Streams.DataWriter(artworkStream.GetOutputStreamAt(0));
    writer.WriteBytes(await File.ReadAllBytesAsync(args[0]));
    await writer.StoreAsync();
    await writer.FlushAsync();
    smtc.DisplayUpdater.Thumbnail = Windows.Storage.Streams.RandomAccessStreamReference.CreateFromStream(artworkStream);
    using var check = await smtc.DisplayUpdater.Thumbnail.OpenReadAsync();
    Console.WriteLine(JsonSerializer.Serialize(new { imageMime = check.ContentType }));
}
smtc.IsEnabled = true;
smtc.IsPlayEnabled = true; smtc.IsPauseEnabled = true; smtc.IsPreviousEnabled = true; smtc.IsNextEnabled = true;
double position = 6500;
var anchor = Stopwatch.GetTimestamp();
var playing = true;
var title = args.Length > 1 ? args[1] : "微光之间";
var artist = args.Length > 2 ? args[2] : "AMLL Studio";
var album = args.Length > 3 ? args[3] : "夜色来信";
var duration = args.Length > 4 ? double.Parse(args[4]) : 180000;
var sync = new object();
double Current() => position + (playing ? Stopwatch.GetElapsedTime(anchor).TotalMilliseconds : 0);
void Publish(bool metadata = false)
{
    if (metadata)
    {
        smtc.DisplayUpdater.Type = MediaPlaybackType.Music;
        smtc.DisplayUpdater.MusicProperties.Title = title;
        smtc.DisplayUpdater.MusicProperties.Artist = artist;
        smtc.DisplayUpdater.MusicProperties.AlbumTitle = album;
        smtc.DisplayUpdater.Update();
    }
    smtc.PlaybackStatus = playing ? MediaPlaybackStatus.Playing : MediaPlaybackStatus.Paused;
    smtc.UpdateTimelineProperties(new SystemMediaTransportControlsTimelineProperties
    {
        StartTime = TimeSpan.Zero, EndTime = TimeSpan.FromMilliseconds(duration), MinSeekTime = TimeSpan.Zero, MaxSeekTime = TimeSpan.FromMilliseconds(duration), Position = TimeSpan.FromMilliseconds(Math.Clamp(Current(), 0, duration))
    });
}
void SetPlaying(bool value)
{
    lock(sync) { position = Current(); anchor = Stopwatch.GetTimestamp(); playing = value; Publish(); }
    Console.WriteLine(JsonSerializer.Serialize(new { command = value ? "resume" : "pause", position }));
}
smtc.ButtonPressed += (_, e) =>
{
    if (e.Button == SystemMediaTransportControlsButton.Pause) SetPlaying(false);
    if (e.Button == SystemMediaTransportControlsButton.Play) SetPlaying(true);
    if (e.Button is SystemMediaTransportControlsButton.Next or SystemMediaTransportControlsButton.Previous)
    {
        lock(sync) { title = title == "微光之间" ? "夜色慢慢落下" : "微光之间"; position = 0; anchor = Stopwatch.GetTimestamp(); Publish(true); }
        Console.WriteLine(JsonSerializer.Serialize(new { command = "track", title }));
    }
};
smtc.PlaybackPositionChangeRequested += (_, e) =>
{
    lock(sync) { position = e.RequestedPlaybackPosition.TotalMilliseconds; anchor = Stopwatch.GetTimestamp(); Publish(); }
    Console.WriteLine(JsonSerializer.Serialize(new { command = "seek", position }));
};
smtc.AutoRepeatModeChangeRequested += (_, e) => { smtc.AutoRepeatMode = e.RequestedAutoRepeatMode; Console.WriteLine("{\"command\":\"repeat\"}"); };
smtc.ShuffleEnabledChangeRequested += (_, e) => { smtc.ShuffleEnabled = e.RequestedShuffleEnabled; Console.WriteLine("{\"command\":\"shuffle\"}"); };
Publish(true);
Console.WriteLine("READY");
while (Console.ReadLine() is { } line)
{
    if (line == "quit") break;
    if (line == "pause") SetPlaying(false);
    if (line == "play") SetPlaying(true);
    if (line == "next") { lock(sync) { title = "夜色慢慢落下"; position=0; anchor=Stopwatch.GetTimestamp(); Publish(true); } }
    if (line.StartsWith("seek:") && double.TryParse(line[5..], out var value)) { lock(sync) { position=value; anchor=Stopwatch.GetTimestamp(); Publish(); } }
    if (line == "snapshot") Console.WriteLine(JsonSerializer.Serialize(new { position = Current(), playing, title }));
    if (line.StartsWith("cover:")) {
        var file = await Windows.Storage.StorageFile.GetFileFromPathAsync(line[6..]);
        lock(sync) {
            smtc.DisplayUpdater.Thumbnail = Windows.Storage.Streams.RandomAccessStreamReference.CreateFromFile(file);
            Publish(true);
        }
    }
}
smtc.IsEnabled = false;
