using System.Diagnostics;
using System.Text.Json;
using Companion;
using System.Reflection;
if (args.Contains("--selection")) {
    foreach (var sample in new[] {
        (Id: 42L, Br: 128000, Time: 200000, Trial: (object?)null, Expected: true),
        (Id: 43L, Br: 128000, Time: 200000, Trial: (object?)null, Expected: false),
        (Id: 42L, Br: 320000, Time: 200000, Trial: (object?)null, Expected: false),
        (Id: 42L, Br: 128000, Time: 30000, Trial: (object?)null, Expected: false),
        (Id: 42L, Br: 128000, Time: 200000, Trial: (object?)new {start=0,end=30}, Expected: false),
    }) {
        var response = JsonSerializer.SerializeToElement(new {code=200,data=new[] {new {id=sample.Id,br=sample.Br,time=sample.Time,freeTrialInfo=sample.Trial,url="https://music.example.org/audio.mp3"}}});
        if ((AlignmentService.LowRateUrl(response,42,200000) != null) != sample.Expected) throw new Exception("Low bitrate selection failed");
    }
    Console.WriteLine("PASS: low bitrate selection checks ID, bitrate, duration and preview status");
    return;
}
using var input=JsonDocument.Parse(await File.ReadAllTextAsync(args[0]));
using var service=new AlignmentService();
if (args.Contains("--cancel")) {
    using var cancel = new CancellationTokenSource(TimeSpan.FromSeconds(90));
    var before = Process.GetProcessesByName("python").Select(p => { using(p) return p.Id; }).ToHashSet();
    var cancelTimer = new Stopwatch();
    service.Progress += _ => { cancelTimer.Start(); cancel.Cancel(); };
    var runtime = typeof(AlignmentService).GetMethod("Runtime", BindingFlags.NonPublic | BindingFlags.Static)!.Invoke(null, null)!;
    var run = typeof(AlignmentService).GetMethod("RunAsync", BindingFlags.NonPublic | BindingFlags.Instance)!;
    var task = (Task<JsonElement>)run.Invoke(service, new object[] {runtime, input.RootElement, "cancel-probe", cancel.Token})!;
    try { await task; throw new Exception("Worker did not cancel"); }
    catch (OperationCanceledException) when (cancelTimer.IsRunning) { }
    foreach (var process in Process.GetProcessesByName("python")) {
        using(process) {
            if (!before.Contains(process.Id) && !process.WaitForExit(5000)) throw new Exception("Cancelled worker is still running");
        }
    }
    if (cancelTimer.ElapsedMilliseconds > 6000) throw new Exception("Worker cancellation was too slow");
    Console.WriteLine("PASS: actual model inference cancelled; child process exited");
    return;
}
service.Progress += message => Console.WriteLine(JsonSerializer.Serialize(message));
var result=await service.AlignAsync(input.RootElement);
if(result.GetProperty("alignedLines").GetInt32()<1)throw new Exception("No lines aligned");
var timer=Stopwatch.StartNew();
var cached=await service.AlignAsync(input.RootElement);
if(timer.ElapsedMilliseconds>1000 || cached.GetRawText()!=result.GetRawText())throw new Exception("Cache did not return the same alignment");
Console.WriteLine($"PASS native download, model process and cache; aligned={result.GetProperty("alignedLines")}");
