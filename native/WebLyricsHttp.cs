using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace Companion;

// Untrusted search results are read as bounded text, never opened or executed.
internal static class WebLyricsHttp
{
    private static readonly HttpClient Client = CreateClient();
    private static readonly HttpClient Resolver = new() { Timeout = TimeSpan.FromSeconds(6) };
    private static bool IsFakeIp(IPAddress address) {
        var b = address.GetAddressBytes();
        return b.Length == 4 && b[0] == 198 && b[1] is 18 or 19;
    }
    internal static bool IsPublic(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
        var b = address.GetAddressBytes();
        if (address.AddressFamily == AddressFamily.InterNetworkV6)
            return (b[0] & 0xe0) == 0x20 && !(b[0] == 0x20 && b[1] == 0x02); // Global unicast, no 6to4.
        return b[0] is not (0 or 10 or 127) && b[0] < 224
            && !(b[0] == 169 && b[1] == 254) && !(b[0] == 172 && b[1] >= 16 && b[1] <= 31)
            && !(b[0] == 192 && b[1] == 168) && !(b[0] == 100 && b[1] >= 64 && b[1] <= 127)
            && !(b[0] == 198 && b[1] is 18 or 19);
    }
    private static HttpClient CreateClient()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        var handler = new SocketsHttpHandler {
            AllowAutoRedirect = false, UseCookies = false, UseProxy = false,
            AutomaticDecompression = DecompressionMethods.All,
            ConnectCallback = async (context, token) => {
                var addresses = await Dns.GetHostAddressesAsync(context.DnsEndPoint.Host, token);
                // TUN proxies commonly return benchmark-range Fake-IP addresses. Resolve the
                // public destination independently instead of allowing private-IP downloads.
                if (addresses.Length > 0 && addresses.All(IsFakeIp)) {
                    using var request = new HttpRequestMessage(HttpMethod.Get,
                        "https://cloudflare-dns.com/dns-query?type=A&name=" + Uri.EscapeDataString(context.DnsEndPoint.Host));
                    request.Headers.Accept.ParseAdd("application/dns-json");
                    using var response = await Resolver.SendAsync(request, token);
                    response.EnsureSuccessStatusCode();
                    using var dns = JsonDocument.Parse(await response.Content.ReadAsStringAsync(token));
                    addresses = dns.RootElement.TryGetProperty("Answer", out var answers)
                        ? answers.EnumerateArray().Where(a => a.GetProperty("type").GetInt32() == 1)
                            .Select(a => IPAddress.Parse(a.GetProperty("data").GetString()!)).ToArray()
                        : [];
                }
                if (addresses.Length == 0 || addresses.Any(a => !IsPublic(a)))
                    throw new HttpRequestException("歌词链接不是公网地址");
                // Connect to the inspected IP, preventing a second DNS lookup/rebinding.
                Exception? last = null;
                foreach (var address in addresses) {
                    var socket = new Socket(address.AddressFamily, SocketType.Stream, ProtocolType.Tcp);
                    try {
                        await socket.ConnectAsync(new IPEndPoint(address, context.DnsEndPoint.Port), token);
                        return new NetworkStream(socket, ownsSocket: true);
                    } catch (Exception e) { socket.Dispose(); last = e; token.ThrowIfCancellationRequested(); }
                }
                throw new HttpRequestException("无法连接歌词网站", last);
            },
        };
        var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(12) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("AMLL-Companion/0.6.10 (+https://github.com/deutdrsium/AMLL-Companion)");
        return client;
    }
    internal static Uri ValidateUrl(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var url) || url.Scheme is not ("https" or "http")
            || !url.IsDefaultPort || url.UserInfo.Length != 0 || url.IsLoopback || !url.Host.Contains('.')
            || url.Host.EndsWith(".local", StringComparison.OrdinalIgnoreCase)
            || (IPAddress.TryParse(url.Host.Trim('[', ']'), out var ip) && !IsPublic(ip)))
            throw new ArgumentException("无效的公网歌词链接");
        return url;
    }
    internal static async Task DownloadAudioAsync(string value, string path, CancellationToken token)
    {
        var url = ValidateUrl(value);
        for (var redirects = 0; redirects <= 4; redirects++) {
            using var response = await Client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, token);
            if ((int)response.StatusCode is >= 300 and < 400 && response.Headers.Location is { } location) {
                url = ValidateUrl(new Uri(url, location).AbsoluteUri); continue;
            }
            response.EnsureSuccessStatusCode();
            var type = response.Content.Headers.ContentType?.MediaType ?? "";
            if (!type.StartsWith("audio/") && type != "application/octet-stream") throw new InvalidOperationException("聚合接口未返回音频");
            const int maxBytes = 40 * 1024 * 1024;
            if (response.Content.Headers.ContentLength > maxBytes) throw new InvalidOperationException("音频超过 40 MB 限制");
            await using var input = await response.Content.ReadAsStreamAsync(token);
            await using var output = File.Create(path);
            var buffer = new byte[65536];
            int count, total = 0;
            while ((count = await input.ReadAsync(buffer, token)) > 0) {
                total += count;
                if (total > maxBytes) throw new InvalidOperationException("音频超过 40 MB 限制");
                await output.WriteAsync(buffer.AsMemory(0, count), token);
            }
            return;
        }
        throw new InvalidOperationException("音频重定向过多");
    }
    public static async Task<JsonElement> QueryAsync(string operation, JsonElement data, CancellationToken token)
    {
        string value;
        if (operation == "search") {
            var title = data.GetProperty("title").GetString() ?? "";
            var artist = data.GetProperty("artist").GetString() ?? "";
            if (title.Length is < 1 or > 300 || artist.Length is < 1 or > 300) throw new ArgumentException("缺少歌名或歌手");
            var query = $"\"{title.Replace("\"", " ")}\" \"{artist.Replace("\"", " ")}\" (\"[00:\" OR \"filetype:lrc\" OR \".lrc\")";
            if (data.TryGetProperty("relaxed", out var relaxed) && relaxed.ValueKind == JsonValueKind.True)
                query = $"\"{title.Replace("\"", " ")}\" \"{artist.Replace("\"", " ")}\" lrc";
            value = "https://html.duckduckgo.com/html/?q=" + Uri.EscapeDataString(query);
        } else if (operation == "get") value = data.GetProperty("url").GetString() ?? "";
        else throw new ArgumentException("无效网页歌词操作");
        var url = ValidateUrl(value);
        for (var redirects = 0; redirects <= 4; redirects++) {
            using var response = await Client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, token);
            if ((int)response.StatusCode is >= 300 and < 400 && response.Headers.Location is { } location) {
                url = ValidateUrl(new Uri(url, location).AbsoluteUri);
                continue;
            }
            response.EnsureSuccessStatusCode();
            const int maxBytes = 2 * 1024 * 1024;
            if (response.Content.Headers.ContentLength > maxBytes) throw new InvalidOperationException("歌词网页过大");
            var type = response.Content.Headers.ContentType?.MediaType ?? "";
            if (!(type.Length == 0 || type.StartsWith("text/") || type is "application/octet-stream" or "application/x-lrc" or "application/json" or "application/xhtml+xml"))
                throw new InvalidOperationException("链接不是歌词文本");
            await using var stream = await response.Content.ReadAsStreamAsync(token);
            using var buffer = new MemoryStream();
            var bytes = new byte[8192];
            int count;
            while ((count = await stream.ReadAsync(bytes, token)) > 0) {
                if (buffer.Length + count > maxBytes) throw new InvalidOperationException("歌词网页过大");
                buffer.Write(bytes, 0, count);
            }
            var encoding = new UTF8Encoding(false, true) as Encoding;
            var charset = response.Content.Headers.ContentType?.CharSet?.Trim('"', '\'');
            if (!string.IsNullOrEmpty(charset)) { try { encoding = Encoding.GetEncoding(charset); } catch (ArgumentException) { } }
            string text;
            var payload = buffer.ToArray();
            if (payload.Length >= 2 && payload[0] == 0xff && payload[1] == 0xfe) encoding = Encoding.Unicode;
            if (payload.Length >= 2 && payload[0] == 0xfe && payload[1] == 0xff) encoding = Encoding.BigEndianUnicode;
            try { text = encoding.GetString(payload); }
            catch (DecoderFallbackException) { text = Encoding.GetEncoding("GB18030").GetString(payload); }
            if (text.Contains('\0')) throw new InvalidOperationException("链接返回了二进制文件");
            return JsonSerializer.SerializeToElement(new { text, url = url.AbsoluteUri, contentType = type });
        }
        throw new InvalidOperationException("歌词链接重定向过多");
    }
}
