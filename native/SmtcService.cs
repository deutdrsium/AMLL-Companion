using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Windows.Threading;

namespace Companion;

internal record Music(string MusicId, string MusicName, string AlbumName, string[] Artists, double Duration);
internal record SessionEntry(string Id, string Name);
internal record Capabilities(bool Play = false, bool Pause = false, bool Previous = false, bool Next = false, bool Seek = false, bool Shuffle = false, bool Repeat = false);
internal record PlayerState(bool Connected, string Error, Music? Music, string Cover, double Position, double MonotonicAt, double ClockAtSend, string LastUpdatedTime, long TimelineRevision, bool Playing, double Rate, string Repeat, bool Shuffle, Capabilities Controls, string Source, SessionEntry[] Sessions, string SelectedSession, string Selection);

// Adapts UniLyric's upstream engine events. No Windows SMTC implementation here.
internal sealed class SmtcService(Dispatcher dispatcher) : IDisposable
{
    private Process? bridge;
    private readonly SemaphoreSlim commandLock = new(1, 1);
    private readonly PlaybackClock clock = new();
    private Music? music;
    private string cover = "", error = "", selection = "auto", selected = "", source = "";
    private string repeat = "off";
    private bool shuffle, disposed;
    private Capabilities controls = new();
    private SessionEntry[] sessions = [];
    private int trackUpdates;
    private double? pendingSeek;
    private double pendingSeekAt;
    public object Diagnostics() => new { engine = "UniLyric smtc-suite 2.6.1", trackUpdates, highFrequencyUpdates = false };
    public event Action<PlayerState>? Changed;

    public Task StartAsync()
    {
        try
        {
            bridge = new Process { StartInfo = new ProcessStartInfo(Path.Combine(AppContext.BaseDirectory, "unilyric-bridge.exe")) {
                UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true,
                RedirectStandardOutput = true, RedirectStandardError = true,
                StandardInputEncoding = new UTF8Encoding(false), StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            }};
            bridge.Start();
            _ = ReadUpdatesAsync(bridge);
            _ = ReadErrorsAsync(bridge);
        }
        catch (Exception ex) { error = $"UniLyric 引擎启动失败：{ex.Message}"; Emit(); }
        return Task.CompletedTask;
    }
    private async Task ReadUpdatesAsync(Process process)
    {
        try
        {
            while (await process.StandardOutput.ReadLineAsync() is { } line)
            {
                using var document = JsonDocument.Parse(line);
                var update = document.RootElement.Clone();
                await dispatcher.InvokeAsync(async () => { if (!disposed) await OnUpdateAsync(update); }).Task.Unwrap();
            }
            if (!disposed) await dispatcher.InvokeAsync(() => { Clear(); error = "UniLyric 引擎已退出，请重新启动应用"; Emit(); });
        }
        catch (Exception ex) { if (!disposed) await dispatcher.InvokeAsync(() => { error = $"UniLyric 引擎连接失败：{ex.Message}"; Emit(); }); }
    }
    private async Task ReadErrorsAsync(Process process)
    {
        try {
            var message = await process.StandardError.ReadToEndAsync();
            if (!disposed && !string.IsNullOrWhiteSpace(message)) await dispatcher.InvokeAsync(() => { error = message.Trim(); Emit(); });
        } catch (ObjectDisposedException) { }
    }
    public PlayerState Snapshot() => new(selected != "", error, music, cover, clock.Position, clock.AnchorAt, PlaybackClock.Now, "", clock.Revision, clock.Playing, clock.Rate, repeat, shuffle, controls, source, sessions, selected, selection);
    private void Emit() { if (!disposed) Changed?.Invoke(Snapshot()); }
    private static string Text(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString()! : "";
    private static double Number(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var n) ? n : 0;
    private static bool Flag(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True;
    private void Clear()
    {
        music = null; cover = ""; controls = new(); selected = ""; source = "";
        clock.Duration = 0; clock.Reset(0, false, 1, PlaybackClock.Now);
    }
    private async Task OnUpdateAsync(JsonElement update)
    {
        var payload = update.GetProperty("payload");
        switch (Text(update, "type"))
        {
            case "SessionsChanged":
                var raw = payload.EnumerateArray().ToArray();
                sessions = raw.Select(s => new SessionEntry(Text(s, "session_id"), Text(s, "display_name"))).ToArray();
                var next = selection == "auto"
                    ? raw.FirstOrDefault(s => Text(s, "source_app_user_model_id").Contains("Apple", StringComparison.OrdinalIgnoreCase))
                    : raw.FirstOrDefault(s => Text(s, "session_id") == selection);
                if (selection == "auto" && next.ValueKind == JsonValueKind.Undefined)
                    next = raw.FirstOrDefault(s => Text(s, "session_id") == selected);
                if (selection == "auto" && next.ValueKind == JsonValueKind.Undefined) next = raw.FirstOrDefault();
                var nextId = next.ValueKind == JsonValueKind.Undefined ? "" : Text(next, "session_id");
                if (nextId != selected) {
                    Clear(); selected = nextId; error = "";
                    if (nextId != "") {
                        source = Text(next, "source_app_user_model_id");
                        await SendAsync(new { command = "select", session = nextId });
                    }
                }
                break;
            case "TrackChanged":
                if (selected == "") break;
                trackUpdates++;
                var title = Text(payload, "title");
                var artist = Text(payload, "artist");
                var album = Text(payload, "album_title");
                var changed = music is null || music.MusicName != title || music.AlbumName != album || string.Join("", music.Artists) != artist;
                if (changed) cover = "";
                clock.Duration = Number(payload, "duration_ms");
                music = new("", title, album, string.IsNullOrWhiteSpace(artist) ? [] : [artist], clock.Duration);
                var playing = Text(payload, "playback_status") == "Playing";
                var position = Number(payload, "position_ms");
                var now = PlaybackClock.Now;
                if (now - pendingSeekAt > 5000) pendingSeek = null;
                var seekConfirmed = pendingSeek is double requested && Math.Abs(position - requested) < 1000;
                clock.ObserveEngine(position, Text(payload, "timeline_token"), playing, now, changed, seekConfirmed);
                if (changed || seekConfirmed) pendingSeek = null;
                var bits = (int)Number(payload, "control_bits");
                controls = new((bits & 1) != 0, (bits & 2) != 0, (bits & 8) != 0, (bits & 4) != 0, (bits & 16) != 0, (bits & 32) != 0, (bits & 64) != 0);
                repeat = Text(payload, "repeat_mode").ToLowerInvariant();
                shuffle = Flag(payload, "is_shuffle_active");
                var image = Text(payload, "cover_base64");
                // Upstream emits null on timeline/status updates; preserve the current cover.
                if (image.Length > 0) cover = CoverUrl(image);
                error = "";
                break;
            case "SelectedSessionVanished":
                if (payload.GetString() == selected) Clear();
                break;
            case "Error": error = payload.GetString() ?? "UniLyric 引擎错误"; break;
        }
        Emit();
    }
    private static string CoverUrl(string base64)
    {
        var bytes = Convert.FromBase64String(base64);
        // SMTC MIME metadata is unreliable; use the image signature, including BMP covers.
        var mime = bytes.AsSpan().StartsWith(new byte[] { 0x89, 0x50, 0x4e, 0x47 }) ? "image/png"
            : bytes.AsSpan().StartsWith(new byte[] { 0xff, 0xd8 }) ? "image/jpeg"
            : bytes.AsSpan().StartsWith("GIF8"u8) ? "image/gif"
            : bytes.AsSpan().StartsWith("BM"u8) ? "image/bmp"
            : bytes.Length >= 12 && bytes.AsSpan(8, 4).SequenceEqual("WEBP"u8) ? "image/webp" : "application/octet-stream";
        return $"data:{mime};base64,{base64}";
    }
    public async Task SelectAsync(string id)
    {
        if (id != "auto" && !sessions.Any(s => s.Id == id)) throw new ArgumentException("媒体会话已结束");
        selection = id;
        var target = id == "auto" ? sessions.FirstOrDefault(s => s.Id.Contains("Apple", StringComparison.OrdinalIgnoreCase))?.Id
            ?? sessions.FirstOrDefault()?.Id ?? "" : id;
        if (target != selected) {
            Clear(); selected = target; source = target;
            if (target != "") await SendAsync(new { command = "select", session = target });
        }
        Emit();
    }
    private async Task SendAsync(object value)
    {
        await commandLock.WaitAsync();
        try {
            if (disposed || bridge is null || bridge.HasExited) throw new InvalidOperationException("UniLyric 引擎未运行");
            await bridge.StandardInput.WriteLineAsync(JsonSerializer.Serialize(value));
            await bridge.StandardInput.FlushAsync();
        } finally { commandLock.Release(); }
    }
    public async Task CommandAsync(string command, JsonElement value)
    {
        if (selected == "") throw new InvalidOperationException("当前没有可控制的媒体会话");
        if (command == "seekPlayProgress") {
            var position = value.GetProperty("progress").GetDouble();
            if (!double.IsFinite(position) || position < 0 || position > clock.Duration) throw new ArgumentOutOfRangeException(nameof(position));
            await SendAsync(new { command, progress = (ulong)Math.Round(position) });
            pendingSeek = position;
            pendingSeekAt = PlaybackClock.Now;
        } else await SendAsync(value);
    }
    public void Dispose()
    {
        disposed = true;
        if (bridge is not null) {
            if (!bridge.HasExited) {
                bridge.StandardInput.Close();
                if (!bridge.WaitForExit(2000)) bridge.Kill(true);
            }
            bridge.Dispose();
        }
    }
}
