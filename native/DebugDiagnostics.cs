using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Threading.Channels;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;

namespace Companion;

internal sealed class DebugDiagnostics : IDisposable
{
    private readonly Channel<string> queue = Channel.CreateBounded<string>(new BoundedChannelOptions(512) {
        SingleReader = true, FullMode = BoundedChannelFullMode.DropOldest
    });
    private readonly Task writer;
    private readonly long started = Stopwatch.GetTimestamp();
    private DispatcherTimer? timer;
    private Dictionary<int, (TimeSpan cpu, long at)> previous = new();

    public DebugDiagnostics()
    {
        var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AMLL Companion", "Logs");
        Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, $"debug-{DateTime.Now:yyyyMMdd-HHmmss-fff}-{Environment.ProcessId}.jsonl");
        var stream = new StreamWriter(new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.Read));
        writer = Task.Run(async () => {
            using (stream) {
                try {
                    await foreach (var line in queue.Reader.ReadAllAsync()) {
                        await stream.WriteLineAsync(line);
                        await stream.FlushAsync();
                    }
                } catch (IOException ex) { Debug.WriteLine(ex); }
            }
        });
        Write("session.start", new { version = typeof(Program).Assembly.GetName().Version?.ToString(),
            pid = Environment.ProcessId, os = Environment.OSVersion.ToString(), processors = Environment.ProcessorCount });
    }

    public void Write(string name, object? data = null) => queue.Writer.TryWrite(JsonSerializer.Serialize(new {
        timestamp = DateTimeOffset.Now, elapsedMs = Math.Round(Stopwatch.GetElapsedTime(started).TotalMilliseconds, 1),
        @event = name, data
    }));

    public void Attach(CoreWebView2Environment environment)
    {
        Write("webview.ready", new { version = environment.BrowserVersionString });
        var lastTick = Stopwatch.GetTimestamp();
        var sampling = false;
        timer = new DispatcherTimer(DispatcherPriority.Background) { Interval = TimeSpan.FromSeconds(5) };
        timer.Tick += async (_, _) => {
            var now = Stopwatch.GetTimestamp();
            var uiLagMs = Math.Max(0, Stopwatch.GetElapsedTime(lastTick, now).TotalMilliseconds - 5000);
            lastTick = now;
            if (sampling) return;
            sampling = true;
            try {
                var processes = environment.GetProcessInfos().Select(p => (id: p.ProcessId, kind: p.Kind.ToString()))
                    .Prepend((id: Environment.ProcessId, kind: "host")).DistinctBy(p => p.id).ToArray();
                var samples = await Task.Run(() => Sample(processes));
                Write("native.sample", new { uiLagMs = Math.Round(uiLagMs, 1), processes = samples });
            } catch (Exception ex) { Write("diagnostics.error", new { message = ex.Message }); }
            finally { sampling = false; }
        };
        timer.Start();
    }

    private List<object> Sample((int id, string kind)[] processes)
    {
        var samples = new List<object>();
        var current = new Dictionary<int, (TimeSpan cpu, long at)>();
        foreach (var (id, kind) in processes) {
            try {
                using var process = Process.GetProcessById(id);
                var now = Stopwatch.GetTimestamp();
                var cpu = process.TotalProcessorTime;
                double? cpuPercent = previous.TryGetValue(id, out var old)
                    ? Math.Round((cpu - old.cpu).TotalMilliseconds / Stopwatch.GetElapsedTime(old.at, now).TotalMilliseconds * 100, 1) : null;
                current[id] = (cpu, now);
                samples.Add(new { pid = id, kind, cpuPercent,
                    workingSetMiB = Math.Round(process.WorkingSet64 / 1048576d, 1),
                    privateMiB = Math.Round(process.PrivateMemorySize64 / 1048576d, 1) });
            } catch (Exception ex) when (ex is ArgumentException or InvalidOperationException or System.ComponentModel.Win32Exception) {
                samples.Add(new { pid = id, kind, unavailable = ex.Message });
            }
        }
        previous = current;
        return samples;
    }

    public void Dispose()
    {
        timer?.Stop();
        Write("session.end");
        queue.Writer.TryComplete();
        writer.GetAwaiter().GetResult();
    }
}
