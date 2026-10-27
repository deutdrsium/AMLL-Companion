using System.Net.Http;
using System.Text.Json;

namespace Companion;

// Fixed endpoint: the WebView cannot use this bridge as an arbitrary HTTP proxy.
internal static class LyricsHttp
{
    private static readonly HttpClient Client = new() { Timeout = TimeSpan.FromSeconds(10) };
    public static async Task<object> SearchAsync(string title)
    {
        if (string.IsNullOrWhiteSpace(title) || title.Length > 1000) throw new ArgumentException("无效歌曲名");
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://lrclib.net/api/search?track_name=" + Uri.EscapeDataString(title));
        request.Headers.UserAgent.ParseAdd("AMLLCompanion/0.5.6");
        request.Headers.Accept.ParseAdd("application/json");
        request.Headers.CacheControl = new() { NoCache = true };
        using var response = await Client.SendAsync(request);
        if (!response.IsSuccessStatusCode) return new { status = (int)response.StatusCode, rows = (object?)null };
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        if (document.RootElement.ValueKind != JsonValueKind.Array) throw new InvalidOperationException("LRCLIB 原生请求返回了无效响应");
        return new { status = (int)response.StatusCode, rows = document.RootElement.Clone() };
    }
}
