using System.Windows;
using System.IO;

namespace Companion;

internal static class Program
{
    [STAThread]
    public static int Main(string[] args)
    {
        if (args.Contains("--self-test")) return ClockTests.Run();
        using var singleInstance = new Mutex(true, args.Contains("--automation") ? "Local\\AMLLCompanion.Automation" : "Local\\AMLLCompanion.Native", out var created);
        if (!created) return 0;
        var app = new Application();
        app.DispatcherUnhandledException += (_, e) => { WriteError(e.Exception); MessageBox.Show(e.Exception.Message, "AMLL Companion"); e.Handled = true; };
        return app.Run(new MainWindow(args));
    }
    public static void WriteError(Exception ex)
    {
        var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AMLL Companion");
        Directory.CreateDirectory(folder); File.AppendAllText(Path.Combine(folder, "error.log"), $"{DateTimeOffset.Now:O} {ex}\n");
    }
}
