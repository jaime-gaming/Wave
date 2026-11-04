using System;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Animation;

namespace Wave.Windows;

/// <summary>
/// The window's movement, in one place.
///
/// Two shapes only, because two is what the interface actually needs: an
/// entrance that rises a hair and fades in, and a settle for something that
/// changes under the pointer. Both respect the Animations preference and
/// Windows' own "show animations" system setting, and both collapse to nothing
/// when either says no — no page should ever depend on an animation having
/// finished to be usable.
/// </summary>
internal static class Motion
{
    public static bool Enabled(bool preference) =>
        preference && SystemParameters.ClientAreaAnimation;

    /// <summary>Fades an element in while it rises a few pixels into place.</summary>
    public static void Rise(FrameworkElement element, bool enabled, double distance = 8, int milliseconds = 260)
    {
        if (!enabled) { element.Opacity = 1; return; }
        var offset = element.RenderTransform as TranslateTransform;
        if (offset == null) element.RenderTransform = offset = new TranslateTransform();
        var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
        element.BeginAnimation(UIElement.OpacityProperty,
            new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(milliseconds)) { EasingFunction = ease });
        offset.BeginAnimation(TranslateTransform.YProperty,
            new DoubleAnimation(distance, 0, TimeSpan.FromMilliseconds(milliseconds)) { EasingFunction = ease });
    }

    /// <summary>
    /// A short overshoot for something that arrives rather than appears: a new
    /// cover, an opened page. Small enough to read as weight, not as a bounce.
    /// </summary>
    public static void Settle(FrameworkElement element, bool enabled, double from = 0.94, int milliseconds = 220)
    {
        if (!enabled) { element.Opacity = 1; return; }
        var scale = element.RenderTransform as ScaleTransform;
        if (scale == null || scale.IsFrozen) element.RenderTransform = scale = new ScaleTransform(1, 1);
        element.RenderTransformOrigin = new Point(0.5, 0.5);
        var ease = new BackEase { Amplitude = 0.12, EasingMode = EasingMode.EaseOut };
        var duration = TimeSpan.FromMilliseconds(milliseconds);
        element.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(0, 1, duration) { EasingFunction = ease });
        scale.BeginAnimation(ScaleTransform.ScaleXProperty, new DoubleAnimation(from, 1, duration) { EasingFunction = ease });
        scale.BeginAnimation(ScaleTransform.ScaleYProperty, new DoubleAnimation(from, 1, duration) { EasingFunction = ease });
    }

    /// <summary>Fades a surface between two colours, used when a page swaps content.</summary>
    public static void Fade(FrameworkElement element, bool enabled, double from = 0.35, int milliseconds = 180)
    {
        if (!enabled) { element.Opacity = 1; return; }
        element.BeginAnimation(UIElement.OpacityProperty,
            new DoubleAnimation(from, 1, TimeSpan.FromMilliseconds(milliseconds))
            { EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut } });
    }
}
