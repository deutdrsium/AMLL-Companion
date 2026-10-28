using System.Net;
using Companion;
if (args.Length == 2 && args[0] == "--json") {
    Console.OutputEncoding = new System.Text.UTF8Encoding(false);
    var metadata = await WebLyricsHttp.QueryAsync("get", System.Text.Json.JsonSerializer.SerializeToElement(new {url=args[1]}), CancellationToken.None);
    Console.WriteLine(metadata.GetProperty("text").GetString());
    return;
}
foreach (var address in new[] { "127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.1.1", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2002:7f00:1::" })
    if (WebLyricsHttp.IsPublic(IPAddress.Parse(address))) throw new Exception($"Accepted nonpublic address: {address}");
foreach (var address in new[] { "1.1.1.1", "8.8.8.8", "2606:4700:4700::1111" })
    if (!WebLyricsHttp.IsPublic(IPAddress.Parse(address))) throw new Exception($"Rejected public address: {address}");
foreach (var url in new[] { "file:///C:/test.lrc", "http://localhost/a", "http://127.1/a", "http://2130706433/a", "http://[::1]/a", "http://10.0.0.1/a", "https://user:password@example.com/a", "http://example.com:1234/a" }) {
    try { WebLyricsHttp.ValidateUrl(url); } catch (ArgumentException) { continue; }
    throw new Exception($"Accepted invalid URL: {url}");
}
Console.WriteLine("PASS: public URL and resolved IP restrictions");
if (args.Length > 0 && args[0] == "--live") {
    var result = await WebLyricsHttp.QueryAsync("search", System.Text.Json.JsonSerializer.SerializeToElement(new { title = "七里香", artist = "周杰伦" }), CancellationToken.None);
    var text = result.GetProperty("text").GetString()!;
    Console.WriteLine($"Native DuckDuckGo HTTP: {text.Length} characters; challenge={text.Contains("challenge-form")}; results={System.Text.RegularExpressions.Regex.Matches(text, "result__a").Count}; noResults={text.Contains("no-results")}");
    if (text.Contains("no-results")) {
        result = await WebLyricsHttp.QueryAsync("search", System.Text.Json.JsonSerializer.SerializeToElement(new { title = "七里香", artist = "周杰伦", relaxed = true }), CancellationToken.None);
        text = result.GetProperty("text").GetString()!;
        Console.WriteLine($"Native relaxed search: challenge={text.Contains("challenge-form")}; results={System.Text.RegularExpressions.Regex.Matches(text, "result__a").Count}");
    }
    if (args.Length > 1) {
        var lyric = await WebLyricsHttp.QueryAsync("get", System.Text.Json.JsonSerializer.SerializeToElement(new { url = args[1] }), CancellationToken.None);
        var count = System.Text.RegularExpressions.Regex.Matches(lyric.GetProperty("text").GetString()!, @"\[\d{2}:\d{2}").Count;
        if (count < 3) throw new Exception("Live download is not synchronized LRC");
        Console.WriteLine($"PASS: real native LRC download, {count} timestamps");
    }
}
