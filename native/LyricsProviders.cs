using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;

namespace Companion;

internal sealed class LyricsProviders : IDisposable
{
    private readonly Dictionary<string, CancellationTokenSource> active = new();
    public void Cancel(string id) { if (active.TryGetValue(id, out var task)) task.Cancel(); }
    public async Task<JsonElement> QueryAsync(JsonElement input)
    {
        var id = input.GetProperty("requestId").GetString() ?? "";
        var provider = input.GetProperty("provider").GetString();
        var operation = input.GetProperty("operation").GetString();
        if (provider is not ("kugou" or "netease" or "qq" or "kuwo" or "migu" or "web") || operation is not ("search" or "get") || id.Length is < 1 or > 100 || active.ContainsKey(id))
            throw new ArgumentException("无效歌词查询");
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(22));
        active[id] = timeout;
        if (provider == "web") {
            try { return await WebLyricsHttp.QueryAsync(operation!, input.GetProperty("data"), timeout.Token); }
            finally { active.Remove(id); }
        }
        using var process = new Process { StartInfo = new ProcessStartInfo(Path.Combine(AppContext.BaseDirectory, "unilyric-bridge.exe"), "--lyrics") {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
            StandardInputEncoding = new UTF8Encoding(false), StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8,
        }};
        try {
            process.Start();
            var output = process.StandardOutput.ReadToEndAsync(timeout.Token);
            var errors = process.StandardError.ReadToEndAsync(timeout.Token);
            await process.StandardInput.WriteLineAsync(input.GetRawText());
            process.StandardInput.Close();
            await process.WaitForExitAsync(timeout.Token);
            var text = await output;
            if (process.ExitCode != 0) throw new InvalidOperationException($"{provider} 歌词模块失败：{await errors}");
            using var document = JsonDocument.Parse(text);
            var root = document.RootElement;
            if (!root.GetProperty("ok").GetBoolean()) throw new InvalidOperationException(root.GetProperty("error").GetString());
            return root.GetProperty("data").Clone();
        } finally {
            active.Remove(id);
            try { if (!process.HasExited) process.Kill(true); } catch (InvalidOperationException) { }
        }
    }
    public void Dispose() { foreach (var source in active.Values.ToArray()) source.Cancel(); }
}
