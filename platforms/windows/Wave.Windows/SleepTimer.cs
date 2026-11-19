using System;

namespace Wave.Windows;

/// <summary>A session-only deadline, independent of UI timer ticks and sleep/resume.</summary>
internal sealed class SleepTimer
{
    private DateTimeOffset? deadline;
    public void Set(int minutes, DateTimeOffset now) => deadline = minutes > 0 ? now.AddMinutes(Math.Min(minutes, 180)) : null;
    public int RemainingMinutes(DateTimeOffset now) => deadline is { } end ? Math.Max(0, (int)Math.Ceiling((end - now).TotalMinutes)) : 0;
    public bool Expired(DateTimeOffset now) => deadline is { } end && now >= end;
    public void Cancel() => deadline = null;
}
