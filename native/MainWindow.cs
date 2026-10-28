using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shell;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace Companion;

internal sealed class MainWindow : Window
{
    private readonly WebView2 web = new();
    private readonly SmtcService smtc;
    private readonly LyricsProviders lyrics = new();
    private readonly string[] args;
    private bool ready, floating, fullscreen, closed;
    private Rect normalBounds = new(100, 100, 1280, 820);
    private Rect fullscreenBounds;
    private WindowState previousState;
    private bool previousTopmost;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private const string Origin = "https://companion.local";

    public MainWindow(string[] arguments)
    {
        args = arguments;
        Title = "AMLL Companion"; Width = 1280; Height = 820; MinWidth = 320; MinHeight = 200;
        Icon = BitmapFrame.Create(new Uri("pack://application:,,,/Assets/app.ico"));
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        WindowStyle = WindowStyle.None; ResizeMode = ResizeMode.CanResize; Background = new SolidColorBrush(Color.FromRgb(25, 23, 27));
        WindowChrome.SetWindowChrome(this, new WindowChrome { CaptionHeight = 0, ResizeBorderThickness = new Thickness(5), CornerRadius = new CornerRadius(OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000) ? 0 : 12), GlassFrameThickness = new Thickness(0) });
        web.Margin = new Thickness(0); Content = web;
        SourceInitialized += (_, _) => {
            var handle = new WindowInteropHelper(this).Handle;
            var corners = 2; // DWMWCP_ROUND; DWM keeps maximized/fullscreen edges square.
            DwmSetWindowAttribute(handle, 33, ref corners, sizeof(int));
            var border = unchecked((int)0xfffffffe); // DWMWA_COLOR_NONE, no system outline.
            DwmSetWindowAttribute(handle, 34, ref border, sizeof(int));
        };
        smtc = new SmtcService(Dispatcher);
        smtc.Changed += state => { if (ready) Post(new { type = "player:state", value = state }); };
        Loaded += async (_, _) => await InitializeAsync();
        StateChanged += (_, _) => { if (ready) Post(new {type="window:state", value=WindowSnapshot()}); };
        Closed += (_, _) => { closed = true; lyrics.Dispose(); smtc.Dispose(); web.Dispose(); };
    }

    private async Task InitializeAsync()
    {
        try
        {
            var userFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AMLL Companion", args.Contains("--automation") ? "TestWebView2" : "WebView2");
            var options = new CoreWebView2EnvironmentOptions(args.Contains("--automation") ? "--remote-debugging-port=9223 --remote-debugging-address=127.0.0.1" : "");
            var environment = await CoreWebView2Environment.CreateAsync(null, userFolder, options);
            await web.EnsureCoreWebView2Async(environment);
            var core = web.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreDevToolsEnabled = args.Contains("--automation");
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.SetVirtualHostNameToFolderMapping("companion.local", Path.Combine(AppContext.BaseDirectory, "wwwroot"), CoreWebView2HostResourceAccessKind.DenyCors);
            core.NavigationStarting += (_, e) => { if (!e.Uri.StartsWith(Origin + "/", StringComparison.Ordinal)) e.Cancel = true; };
            core.NewWindowRequested += (_, e) => e.Handled = true;
            core.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
            core.WebMessageReceived += OnMessage;
            await core.AddScriptToExecuteOnDocumentCreatedAsync(BridgeScript);
            core.Navigate(Origin + "/index.html");
            await smtc.StartAsync();
        }
        catch (WebView2RuntimeNotFoundException) { MessageBox.Show("请先安装 Microsoft Edge WebView2 Evergreen Runtime，再启动应用。\nhttps://developer.microsoft.com/microsoft-edge/webview2/", Title); Close(); }
        catch (Exception ex) { Program.WriteError(ex); MessageBox.Show(ex.Message, Title); Close(); }
    }

    private async void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!e.Source.StartsWith(Origin + "/", StringComparison.Ordinal)) return;
        long id = 0;
        try
        {
            using var document = JsonDocument.Parse(e.WebMessageAsJson);
            var root = document.RootElement; id = root.GetProperty("id").GetInt64();
            var method = root.GetProperty("method").GetString();
            var value = root.GetProperty("value");
            object? result = null;
            switch (method)
            {
                case "snapshot": ready = true; result = smtc.Snapshot(); break;
                case "lyricsSearch": result = await LyricsHttp.SearchAsync(value.GetString() ?? ""); break;
                case "providerQuery": result = await lyrics.QueryAsync(value); break;
                case "providerCancel": lyrics.Cancel(value.GetString() ?? ""); break;
                case "alignmentStatus": result = new { available = false }; break;
                case "alignLyrics": throw new InvalidOperationException("逐字识别功能暂时停用");
                case "alignmentCancel": break;
                case "command": await smtc.CommandAsync(value.GetProperty("command").GetString() ?? "", value); break;
                case "sessions": await smtc.SelectAsync(value.GetString() ?? "auto"); break;
                case "window": WindowAction(value.GetString() ?? ""); result = WindowSnapshot(); break;
                case "windowState": result = WindowSnapshot(); break;
                case "automation":
                    if (!args.Contains("--automation")) throw new InvalidOperationException("Automation is disabled");
                    if (value.TryGetProperty("diagnostics", out _)) { result = smtc.Diagnostics(); break; }
                    Width = Math.Clamp(value.GetProperty("width").GetDouble(), MinWidth, 3840); Height = Math.Clamp(value.GetProperty("height").GetDouble(), MinHeight, 2160); result = WindowSnapshot(); break;
                default: throw new ArgumentException("未知请求");
            }
            Post(new { type = "reply", id, result });
        }
        catch (Exception ex) { Post(new { type = "reply", id, error = ex.Message }); }
    }

    private object WindowSnapshot() => new { mode = fullscreen ? "fullscreen" : floating ? "floating" : "normal", topmost = Topmost, maximized = WindowState == WindowState.Maximized };
    private void WindowAction(string action)
    {
        switch (action)
        {
            case var resize when resize.StartsWith("resize-"):
                if (fullscreen || WindowState != WindowState.Normal) return;
                var hit = resize[7..] switch { "w"=>10, "e"=>11, "n"=>12, "nw"=>13, "ne"=>14, "s"=>15, "sw"=>16, "se"=>17, _=>throw new ArgumentException("未知缩放方向") };
                ReleaseCapture(); SendMessage(new WindowInteropHelper(this).Handle, 0x0112, new IntPtr(0xf000 + hit - 9), IntPtr.Zero); break;
            case "minimize": WindowState = WindowState.Minimized; break;
            case "maximize": if (floating) ToggleFloating(); WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized; break;
            case "close": Close(); return;
            case "drag":
                if (fullscreen) return;
                ReleaseCapture(); SendMessage(new WindowInteropHelper(this).Handle, 0x00A1, new IntPtr(2), IntPtr.Zero); break;
            case "fullscreen": ToggleFullscreen(); break;
            case "floating": if (fullscreen) ToggleFullscreen(); ToggleFloating(); break;
            case "pin": Topmost = !Topmost; break;
            case "exitFullscreen": if (fullscreen) ToggleFullscreen(); break;
            default: throw new ArgumentException("未知窗口操作");
        }
        Post(new { type = "window:state", value = WindowSnapshot() });
    }

    private void ToggleFloating()
    {
        if (!floating)
        {
            normalBounds = WindowState == WindowState.Normal ? new Rect(Left, Top, Width, Height) : RestoreBounds;
            previousState = WindowState; previousTopmost = Topmost;
            WindowState = WindowState.Normal; Width = 380; Height = Math.Min(620, SystemParameters.WorkArea.Height - 48); Topmost = true;
            var area = SystemParameters.WorkArea; Left = area.Right - Width - 24; Top = area.Bottom - Height - 24;
        }
        else
        {
            Topmost = previousTopmost; Left = normalBounds.Left; Top = normalBounds.Top; Width = normalBounds.Width; Height = normalBounds.Height; WindowState = previousState;
        }
        floating = !floating;
    }
    private void ToggleFullscreen()
    {
        if (!fullscreen)
        {
            if (floating) ToggleFloating();
            fullscreenBounds = WindowState == WindowState.Normal ? new Rect(Left, Top, Width, Height) : RestoreBounds;
            previousState = WindowState; WindowState = WindowState.Normal;
            var monitor = MonitorFromWindow(new WindowInteropHelper(this).Handle, 2);
            var info = new MonitorInfo { Size = Marshal.SizeOf<MonitorInfo>() }; GetMonitorInfo(monitor, ref info);
            var source = PresentationSource.FromVisual(this); var transform = source?.CompositionTarget?.TransformFromDevice ?? Matrix.Identity;
            var topLeft = transform.Transform(new Point(info.Monitor.Left, info.Monitor.Top));
            var bottomRight = transform.Transform(new Point(info.Monitor.Right, info.Monitor.Bottom));
            ResizeMode = ResizeMode.NoResize; web.Margin = new Thickness(0); Left = topLeft.X; Top = topLeft.Y; Width = bottomRight.X - topLeft.X; Height = bottomRight.Y - topLeft.Y;
        }
        else
        {
            ResizeMode = ResizeMode.CanResize; web.Margin = new Thickness(5); Left = fullscreenBounds.Left; Top = fullscreenBounds.Top; Width = fullscreenBounds.Width; Height = fullscreenBounds.Height; WindowState = previousState;
        }
        fullscreen = !fullscreen;
    }
    private void Post(object value)
    {
        if (closed || Dispatcher.HasShutdownStarted) return;
        if (!Dispatcher.CheckAccess()) {
            Dispatcher.BeginInvoke(new Action(() => Post(value)));
            return;
        }
        if (web.CoreWebView2 is not null) web.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(value, JsonOptions));
    }

    [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
    [DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] private static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] private static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
    [StructLayout(LayoutKind.Sequential)] private struct NativeRect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)] private struct MonitorInfo { public int Size; public NativeRect Monitor, Work; public uint Flags; }

    private const string BridgeScript = """
    (() => {
      if (location.origin !== 'https://companion.local') return;
      let next = 0;
      const pending = new Map(), listeners = new Set(), windowListeners = new Set(), alignmentListeners = new Set();
      chrome.webview.addEventListener('message', ({data}) => {
        if(data.type === 'player:state') listeners.forEach(fn => fn(data.value));
        if(data.type === 'window:state') windowListeners.forEach(fn => fn(data.value));
        if(data.type === 'alignment:progress') alignmentListeners.forEach(fn => fn(data.value));
        if(data.type === 'reply') { const request=pending.get(data.id); if(!request)return; pending.delete(data.id); clearTimeout(request.timer); data.error ? request.reject(new Error(data.error)) : request.resolve(data.result); }
      });
      const invoke = (method, value=null) => new Promise((resolve,reject) => {
        const id=++next; const timer=setTimeout(()=>{pending.delete(id);reject(new Error('系统请求超时'));},method==='alignLyrics'?750000:method==='providerQuery'?30000:15000);
        pending.set(id,{resolve,reject,timer}); chrome.webview.postMessage({id,method,value});
      });
      window.companion = Object.freeze({
        native: true, snapshot:()=>invoke('snapshot'), command:value=>invoke('command',value),
        lyricsSearch:title=>invoke('lyricsSearch',title),
        providerQuery:value=>invoke('providerQuery',value), cancelProvider:id=>invoke('providerCancel',id),
        alignmentStatus:()=>invoke('alignmentStatus'), alignLyrics:value=>invoke('alignLyrics',value), cancelAlignment:id=>invoke('alignmentCancel',id),
        subscribeAlignment:fn=>{alignmentListeners.add(fn);return()=>alignmentListeners.delete(fn)},
        subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},
        selectSession:id=>invoke('sessions',id), window:action=>invoke('window',action), windowState:()=>invoke('windowState'),
        subscribeWindow:fn=>{windowListeners.add(fn);return()=>windowListeners.delete(fn)},
        automation:value=>invoke('automation',value)
      });
    })();
    """;
}
