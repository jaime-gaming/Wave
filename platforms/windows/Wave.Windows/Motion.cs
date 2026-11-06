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
        if (!enabled) { element.BeginAnimation(UIElement.OpacityProperty, null); element.Opacity = 1; element.RenderTransform = Transform.Identity; return; }
        var offset = element.RenderTransform as TranslateTransform;
        if (offset == null) element.RenderTransform = offset = new TranslateTransform();
        var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
        element.BeginAnimation(UIElement.OpacityProperty,
            new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(milliseconds)) { EasingFunction = ease });
        offset.BeginAnimation(TranslateTransform.YProperty,
            new DoubleAnimation(distance, 0, TimeSpan.FromMilliseconds(milliseconds)) { EasingFunction = ease });
    }

    /// <summary>
    /// A restrained, non-overshooting settle for content that arrives: a new
    /// cover, an opened page. Small enough to read as weight, not as a bounce.
    /// </summary>
    public static void Settle(FrameworkElement element, bool enabled, double from = 0.975, int milliseconds = 220)
    {
        if (!enabled) { element.BeginAnimation(UIElement.OpacityProperty, null); element.Opacity = 1; element.RenderTransform = Transform.Identity; return; }
        var scale = element.RenderTransform as ScaleTransform;
        if (scale == null || scale.IsFrozen) element.RenderTransform = scale = new ScaleTransform(1, 1);
        element.RenderTransformOrigin = new Point(0.5, 0.5);
        var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
        var duration = TimeSpan.FromMilliseconds(milliseconds);
        element.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(0, 1, duration) { EasingFunction = ease });
        scale.BeginAnimation(ScaleTransform.ScaleXProperty, new DoubleAnimation(from, 1, duration) { EasingFunction = ease });
        scale.BeginAnimation(ScaleTransform.ScaleYProperty, new DoubleAnimation(from, 1, duration) { EasingFunction = ease });
    }

    /// <summary>Fades a surface between two colours, used when a page swaps content.</summary>
    public static void Fade(FrameworkElement element, bool enabled, double from = 0.35, int milliseconds = 180)
    {
        if (!enabled) { element.BeginAnimation(UIElement.OpacityProperty, null); element.Opacity = 1; element.RenderTransform = Transform.Identity; return; }
        element.BeginAnimation(UIElement.OpacityProperty,
            new DoubleAnimation(from, 1, TimeSpan.FromMilliseconds(milliseconds))
            { EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut } });
    }
    /// <summary>Small directional page travel, never a bounce or a layout resize.</summary>
    public static void Slide(FrameworkElement element, bool enabled, int direction = 1)
    {
        if (!enabled) { element.BeginAnimation(UIElement.OpacityProperty, null); element.Opacity = 1; element.RenderTransform = Transform.Identity; return; }
        var offset = new TranslateTransform();
        element.RenderTransform = offset;
        var duration = TimeSpan.FromMilliseconds(240);
        var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
        offset.BeginAnimation(TranslateTransform.XProperty, new DoubleAnimation(18 * direction, 0, duration) { EasingFunction = ease, FillBehavior = FillBehavior.Stop });
        element.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(0, 1, duration) { EasingFunction = ease, FillBehavior = FillBehavior.Stop });
    }

    /// <summary>Animate only a button's glyph. Rapid presses replace rather than accumulate.</summary>
    public static void IconAction(System.Windows.Controls.Button button, bool enabled, string kind)
    {
        if (button.Content is not FrameworkElement glyph) return;
        if (!enabled) { glyph.RenderTransform = Transform.Identity; return; }
        var scale = new ScaleTransform(1, 1);
        var rotate = new RotateTransform();
        var offset = new TranslateTransform();
        var transforms = new TransformGroup();
        transforms.Children.Add(scale); transforms.Children.Add(rotate); transforms.Children.Add(offset);
        glyph.RenderTransformOrigin = new Point(.5, .5);
        glyph.RenderTransform = transforms;
        void Animate(Animatable target, DependencyProperty property, double baseline, double peak) {
            var animation = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(260), FillBehavior = FillBehavior.Stop };
            animation.KeyFrames.Add(new EasingDoubleKeyFrame(baseline, KeyTime.FromTimeSpan(TimeSpan.Zero)));
            animation.KeyFrames.Add(new EasingDoubleKeyFrame(peak, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(90)), new CubicEase { EasingMode = EasingMode.EaseOut }));
            animation.KeyFrames.Add(new EasingDoubleKeyFrame(baseline, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(260)), new CubicEase { EasingMode = EasingMode.EaseOut }));
            target.BeginAnimation(property, animation);
        }
        Animate(scale, ScaleTransform.ScaleXProperty, 1, kind == "favorite" ? 1.18 : .91);
        Animate(scale, ScaleTransform.ScaleYProperty, 1, kind == "favorite" ? 1.18 : .91);
        if (kind == "repeat") Animate(rotate, RotateTransform.AngleProperty, 0, 80);
        if (kind == "shuffle") Animate(offset, TranslateTransform.XProperty, 0, 3);
    }

}
