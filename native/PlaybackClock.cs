using System.Diagnostics;

namespace Companion;

// UTC is used once to interpret SMTC's timestamp; all subsequent advancement is monotonic.
internal sealed class PlaybackClock
{
    public static double Now => Stopwatch.GetTimestamp() * 1000d / Stopwatch.Frequency;
    public double Position { get; private set; }
    public double AnchorAt { get; private set; } = Now;
    public double Duration { get; set; }
    public double Rate { get; private set; } = 1;
    public bool Playing { get; private set; }
    public long Revision { get; private set; }
    public DateTimeOffset LastUpdatedTime { get; private set; }
    private string timelineToken = "";

    public void ObserveEngine(double position, string token, bool playing, double now, bool trackChanged, bool explicitSeek = false)
    {
        var fresh = token != timelineToken;
        timelineToken = token;
        if (trackChanged || explicitSeek) { Reset(position, playing, 1, now); return; }
        if (!fresh) {
            // Cover/session snapshots can carry an old paused position. They are not timeline samples.
            if (playing != Playing) Reset(At(now), playing, 1, now, false);
            return;
        }
        var delta = Math.Abs(position - At(now));
        // SMTC positions can be quantized to whole seconds. Small corrections are slewed in the renderer.
        Reset(position, playing, 1, now, delta > 2000);
    }

    public double At(double now) => Math.Clamp(Position + (Playing ? Math.Max(0, now - AnchorAt) * Rate : 0), 0, Math.Max(0, Duration));

    public void Reset(double position, bool playing, double rate, double now, bool discontinuity = true)
    {
        Position = Math.Clamp(position, 0, Math.Max(0, Duration));
        AnchorAt = now;
        Playing = playing;
        Rate = double.IsFinite(rate) && rate > 0 ? rate : 1;
        if (discontinuity) Revision++;
    }

    public void Observe(double position, DateTimeOffset updated, DateTimeOffset utcNow, double now, bool playing, double rate, bool force = false)
    {
        var age = updated <= DateTimeOffset.UnixEpoch ? 0 : Math.Max(0, (utcNow - updated).TotalMilliseconds);
        var target = position + (playing ? age * rate : 0);
        var sameTimestamp = updated == LastUpdatedTime;
        LastUpdatedTime = updated;
        if (!force && sameTimestamp && (playing != Playing || rate != Rate))
        {
            Reset(At(now), playing, rate, now);
            return;
        }
        if (!force && sameTimestamp) return;
        // Repeated timeline notifications do not keep nudging otherwise smooth animation.
        var delta = Math.Abs(target - At(now));
        if (force || playing != Playing || rate != Rate || delta > 150)
            Reset(target, playing, rate, now, force || delta > 750);
    }
}
