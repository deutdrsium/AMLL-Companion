using System.IO;

namespace Companion;

internal static class ClockTests
{
    public static int Run()
    {
        void Check(bool ok, string message) { if (!ok) throw new Exception(message); }
        var utc = DateTimeOffset.Parse("2026-10-27T00:00:00Z");
        var clock = new PlaybackClock { Duration = 180000 };
        clock.Observe(10000, utc.AddSeconds(-2), utc, 1000, true, 1, true);
        Check(clock.At(1000) == 12000, "SMTC LastUpdatedTime must be included");
        Check(clock.At(2000) == 13000, "monotonic advancement");
        var revision = clock.Revision;
        clock.Observe(10000, utc.AddSeconds(-2), utc.AddSeconds(1), 2000, true, 1);
        Check(clock.Revision == revision, "duplicate timeline must not seek");
        clock.Observe(10000, utc.AddSeconds(-2), utc.AddSeconds(2), 2500, false, 1);
        Check(clock.At(9000) == 13500, "pause with stale SMTC timestamp must freeze the extrapolated position");
        clock.Reset(clock.At(2500), false, 1, 2500);
        Check(clock.At(9000) == 13500, "pause freezes position");
        clock.Reset(60000, true, 1, 9000);
        Check(clock.At(10000) == 61000, "seek resets anchor");
        clock.Reset(0, true, 2, 10000);
        Check(clock.At(11000) == 2000, "playback rate");
        Check(clock.At(999999) == 180000, "duration clamp");
        var engine = new PlaybackClock { Duration = 180000 };
        engine.ObserveEngine(10000, "1", true, 0, true);
        var engineRevision = engine.Revision;
        engine.ObserveEngine(10300, "2", true, 1000, false);
        Check(engine.Revision == engineRevision, "quantized source timestamp is not a seek");
        engine.ObserveEngine(10000, "2", true, 2000, false);
        Check(engine.At(2000) == 11300, "cover update with same timeline token cannot reset time");
        engine.ObserveEngine(10000, "2", false, 2000, false);
        Check(engine.At(5000) == 11300, "pause must not use stale raw source position");
        engine.ObserveEngine(60000, "3", true, 5000, false);
        Check(engine.Revision == engineRevision + 1, "external seek resets layout");
        engine.ObserveEngine(60500, "4", true, 5100, false, true);
        Check(engine.Revision == engineRevision + 2, "small explicit seek resets layout");
        File.WriteAllText(Path.Combine(AppContext.BaseDirectory, "clock-tests.txt"), "PASS: monotonic clock, duplicate tokens, quantization, stale pause, explicit/external seek");
        return 0;
    }
}
