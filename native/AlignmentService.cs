using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Companion;

internal sealed class AlignmentService : IDisposable
{
    private readonly Dictionary<string, CancellationTokenSource> active = new();
    private readonly SemaphoreSlim worker = new(1);
    private readonly string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AMLL Companion", "Alignment");
    public event Action<object>? Progress;
    private static (string Python, string Script, string Models)? Runtime()
    {
        var bundled = Path.Combine(AppContext.BaseDirectory, "alignment");
        if (File.Exists(Path.Combine(bundled, "python", "python.exe"))
            && File.Exists(Path.Combine(bundled, "worker.py")) && File.Exists(Path.Combine(bundled, "models", "model_q4.onnx")))
            return (Path.Combine(bundled, "python", "python.exe"), Path.Combine(bundled, "worker.py"), Path.Combine(bundled, "models"));
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory != null; directory = directory.Parent) {
            var embedded = Path.Combine(directory.FullName, ".tools", "ctc-runtime");
            if (File.Exists(Path.Combine(embedded, "python", "python.exe")) && File.Exists(Path.Combine(embedded, "worker.py"))
                && File.Exists(Path.Combine(embedded, "models", "model_q4.onnx")))
                return (Path.Combine(embedded, "python", "python.exe"), Path.Combine(embedded, "worker.py"), Path.Combine(embedded, "models"));
            var python = Path.Combine(directory.FullName, ".tools", "ctc-env", "Scripts", "python.exe");
            var script = Path.Combine(directory.FullName, "alignment", "worker.py");
            var models = Path.Combine(directory.FullName, ".tools", "ctc-model");
            if (File.Exists(python) && File.Exists(script) && File.Exists(Path.Combine(models, "model_q4.onnx"))) return (python, script, models);
        }
        return null;
    }
    public object Status() => new { available = Runtime() != null };
    public void Cancel(string id) { if (active.TryGetValue(id, out var source)) source.Cancel(); }
    private void Report(string id, string message) => Progress?.Invoke(new { requestId = id, message });
    private static string Normalize(string value) => Regex.Replace(value.Normalize(NormalizationForm.FormKC).ToLowerInvariant(), @"[\s\p{P}\p{S}]", "");
    internal static string? LowRateUrl(JsonElement response, long trackId, double duration)
    {
        if (!response.TryGetProperty("code", out var code) || code.GetInt32() != 200
            || !response.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array) return null;
        foreach (var entry in data.EnumerateArray()) {
            if (!entry.TryGetProperty("id", out var id) || !id.TryGetInt64(out var value) || value != trackId
                || !entry.TryGetProperty("br", out var bitrate) || !bitrate.TryGetInt32(out var br) || br is <= 0 or > 128000
                || (entry.TryGetProperty("freeTrialInfo", out var trial) && trial.ValueKind != JsonValueKind.Null)
                || (entry.TryGetProperty("time", out var time) && time.TryGetDouble(out var ms) && Math.Abs(ms-duration) > 3000)
                || !entry.TryGetProperty("url", out var url) || url.ValueKind != JsonValueKind.String) continue;
            return WebLyricsHttp.ValidateUrl(url.GetString()!).AbsoluteUri;
        }
        return null;
    }
    public async Task<JsonElement> AlignAsync(JsonElement input)
    {
        var runtime = Runtime() ?? throw new InvalidOperationException("当前版本未安装逐字对齐引擎");
        var id = input.GetProperty("requestId").GetString() ?? "";
        if (id.Length is < 1 or > 100 || active.ContainsKey(id)) throw new ArgumentException("无效的对齐任务");
        var lines = input.GetProperty("lines");
        var duration = input.GetProperty("duration").GetDouble();
        if (lines.ValueKind != JsonValueKind.Array || lines.GetArrayLength() is < 1 or > 1000 || duration is < 1000 or > 1200000)
            throw new ArgumentException("对齐需要有效的逐行歌词和完整歌曲时长");
        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("mms-ctc-q4-v1" + input.GetProperty("musicKey").GetString() + lines.GetRawText())));
        Directory.CreateDirectory(root);
        var cache = Path.Combine(root, key + ".json");
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(12));
        active[id] = timeout;
        var locked = false;
        string? audio = null;
        try {
            if (File.Exists(cache)) {
                using var saved = JsonDocument.Parse(await File.ReadAllTextAsync(cache, timeout.Token));
                return saved.RootElement.Clone();
            }
            Report(id, "等待本地对齐引擎…");
            await worker.WaitAsync(timeout.Token); locked = true;
            var candidates = input.GetProperty("candidates").EnumerateArray().Take(4).ToArray();
            string failure = "没有找到匹配的完整音频，继续显示逐行歌词";
            foreach (var candidate in candidates) {
                timeout.Token.ThrowIfCancellationRequested();
                audio = Path.Combine(root, Guid.NewGuid().ToString("N") + ".audio");
                try {
                    var server = candidate.GetProperty("server").GetString();
                    if (server is not ("netease" or "tencent")) continue;
                    var trackId = candidate.GetProperty("id").GetString() ?? "";
                    if (!Regex.IsMatch(trackId, "^[a-zA-Z0-9]{1,64}$")) continue;
                    Report(id, "正在获取匹配音频，逐行歌词继续播放…");
                    var metadata = await WebLyricsHttp.QueryAsync("get", JsonSerializer.SerializeToElement(new {
                        url = $"https://api.injahow.cn/meting/?server={server}&type=song&id={Uri.EscapeDataString(trackId)}"
                    }), timeout.Token);
                    using var document = JsonDocument.Parse(metadata.GetProperty("text").GetString()!);
                    if (document.RootElement.ValueKind != JsonValueKind.Array || document.RootElement.GetArrayLength() == 0) continue;
                    var song = document.RootElement[0];
                    var titles = candidate.TryGetProperty("titles", out var alternateTitles)
                        ? alternateTitles.EnumerateArray().Select(t => Normalize(t.GetString() ?? "")).ToArray()
                        : [Normalize(candidate.GetProperty("title").GetString() ?? "")];
                    var artist = Normalize(song.GetProperty("artist").ToString());
                    if (!titles.Contains(Normalize(song.GetProperty("name").GetString() ?? "")) || !candidate.GetProperty("artists").EnumerateArray()
                        .Any(a => Normalize(a.GetString() ?? "").Length > 0 && artist.Contains(Normalize(a.GetString()!)))) continue;
                    var fallbackUrl = song.GetProperty("url").GetString()!;
                    var audioUrl = fallbackUrl;
                    if (server == "netease" && long.TryParse(trackId, out var numericId)) {
                        try {
                            var lowRate = await WebLyricsHttp.QueryAsync("get", JsonSerializer.SerializeToElement(new {
                                url = $"https://music.163.com/api/song/enhance/player/url?ids=%5B{numericId}%5D&br=128000"
                            }), timeout.Token);
                            using var lowRateJson = JsonDocument.Parse(lowRate.GetProperty("text").GetString()!);
                            audioUrl = LowRateUrl(lowRateJson.RootElement, numericId, duration) ?? fallbackUrl;
                        } catch (Exception) when (!timeout.IsCancellationRequested) { }
                    }
                    try { await WebLyricsHttp.DownloadAudioAsync(audioUrl, audio, timeout.Token); }
                    catch (Exception) when (audioUrl != fallbackUrl && !timeout.IsCancellationRequested) {
                        await WebLyricsHttp.DownloadAudioAsync(fallbackUrl, audio, timeout.Token);
                    }
                    Report(id, "正在本地对齐，逐行歌词继续播放…");
                    var result = await RunAsync(runtime, new { audio, lines, duration, language = input.GetProperty("language").GetString() }, id, timeout.Token);
                    if (result.GetProperty("alignedLines").GetInt32() == 0) { failure = "对齐结果未通过校验，保留逐行歌词"; continue; }
                    var temporary = cache + ".tmp";
                    await File.WriteAllTextAsync(temporary, result.GetRawText(), timeout.Token);
                    File.Move(temporary, cache, true);
                    foreach (var old in new DirectoryInfo(root).GetFiles("*.json").OrderByDescending(f => f.LastWriteTimeUtc).Skip(100)) old.Delete();
                    return result;
                } catch (Exception e) when (!timeout.IsCancellationRequested) { failure = e.Message; }
                finally { if (File.Exists(audio)) File.Delete(audio); audio = null; }
            }
            throw new InvalidOperationException(failure);
        } finally {
            if (locked) worker.Release();
            active.Remove(id);
            if (audio != null && File.Exists(audio)) File.Delete(audio);
        }
    }
    private async Task<JsonElement> RunAsync((string Python, string Script, string Models) runtime, object payload, string id, CancellationToken token)
    {
        using var process = new Process { StartInfo = new ProcessStartInfo(runtime.Python) {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
            StandardInputEncoding = new UTF8Encoding(false), StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8,
        }};
        process.StartInfo.ArgumentList.Add(runtime.Script);
        process.StartInfo.ArgumentList.Add("--models"); process.StartInfo.ArgumentList.Add(runtime.Models);
        process.StartInfo.Environment["PYTHONIOENCODING"] = "utf-8";
        process.StartInfo.Environment["PYTHONUTF8"] = "1";
        process.Start();
        try {
            var stdout = process.StandardOutput.ReadToEndAsync(token);
            var stderr = Task.Run(async () => {
                while (await process.StandardError.ReadLineAsync(token) is { } line) {
                    if (!line.StartsWith('{')) continue;
                    try { using var message = JsonDocument.Parse(line); var p = message.RootElement;
                        if (p.TryGetProperty("percent", out var percent)) Report(id, $"正在分析音频：{percent.GetInt32()}%");
                        else if (p.TryGetProperty("line", out var n)) Report(id, $"正在本地对齐：{n.GetInt32()} / {p.GetProperty("total").GetInt32()} 行");
                    } catch (JsonException) { }
                }
            }, token);
            await process.StandardInput.WriteAsync(JsonSerializer.Serialize(payload)); process.StandardInput.Close();
            await process.WaitForExitAsync(token); await stderr;
            using var result = JsonDocument.Parse(await stdout);
            if (!result.RootElement.GetProperty("ok").GetBoolean()) throw new InvalidOperationException(result.RootElement.GetProperty("error").GetString());
            return result.RootElement.GetProperty("data").Clone();
        } finally { try { if (!process.HasExited) process.Kill(true); } catch (InvalidOperationException) { } }
    }
    public void Dispose() { foreach (var source in active.Values.ToArray()) source.Cancel(); }
}
