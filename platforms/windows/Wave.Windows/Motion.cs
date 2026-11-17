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
    public static void Rise(FrameworkElement element, bool enabled, double distance = 10, int milliseconds = 280)
    {
        if (!enabled) { element.BeginAnimation(UIElement.OpacityProperty, null); element.Opacity = 1; element.RenderTransform = Transform.Identity; return; }
        var offset = element.RenderTransform as TranslateTransform;
        if (offset == null || offset.IsFrozen) element.RenderTransform = offset = new TranslateTransform();
        var ease = new QuinticEase { EasingMode = EasingMode.EaseOut };
        element.BeginAnimation(UIElement.OpacityProperty,
            new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(milliseconds)) { EasingFunction = ease });
        offset.BeginAnimation(TranslateTransform.YProperty,
            new DoubleAnimation(distance, 0, TimeSpan.FromMilliseconds(milliseconds)) { EasingFunction = ease });
    }

    /// <summary>
    /// A restrained, non-overshooting settle for content that arrives: a new
    /// cover, an opened page. Small enough to read as weight, not as a bounce.
    /// </summary>
    public static void Settle(FrameworkElement element, bool enabled, double from = 0.96, int milliseconds = 260)
    {
        if (!enabled) { element.BeginAnimation(UIElement.OpacityProperty, null); element.Opacity = 1; element.RenderTransform = Transform.Identity; return; }
        var scale = element.RenderTransform as ScaleTransform;
        if (scale == null || scale.IsFrozen) element.RenderTransform = scale = new ScaleTransform(1, 1);
        element.RenderTransformOrigin = new Point(0.5, 0.5);
        var ease = new QuinticEase { EasingMode = EasingMode.EaseOut };
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
        var duration = TimeSpan.FromMilliseconds(260);
        var ease = new QuinticEase { EasingMode = EasingMode.EaseOut };
        offset.BeginAnimation(TranslateTransform.XProperty, new DoubleAnimation(18 * direction, 0, duration) { EasingFunction = ease, FillBehavior = FillBehavior.Stop });
        element.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(0, 1, duration) { EasingFunction = ease, FillBehavior = FillBehavior.Stop });
    }

    /// <summary>Compresses the expanded player back down into the bottom mini-player bar.</summary>
    public static void CollapseToMini(FrameworkElement element, bool enabled, Action onComplete)
    {
        if (!enabled)
        {
            element.Opacity = 1;
            element.RenderTransform = Transform.Identity;
            onComplete();
            return;
        }
        var scale = new ScaleTransform(1, 1);
        var offset = new TranslateTransform(0, 0);
        var group = new TransformGroup();
        group.Children.Add(scale);
        group.Children.Add(offset);
        element.RenderTransformOrigin = new Point(0.5, 0.96);
        element.RenderTransform = group;
        var duration = TimeSpan.FromMilliseconds(240);
        var ease = new QuinticEase { EasingMode = EasingMode.EaseInOut };
        var fade = new DoubleAnimation(1, 0, duration) { EasingFunction = ease };
        fade.Completed += (_, _) =>
        {
            element.BeginAnimation(UIElement.OpacityProperty, null);
            element.Opacity = 1;
            element.RenderTransform = Transform.Identity;
            onComplete();
        };
        element.BeginAnimation(UIElement.OpacityProperty, fade);
        scale.BeginAnimation(ScaleTransform.ScaleXProperty, new DoubleAnimation(1, 0.92, duration) { EasingFunction = ease });
        scale.BeginAnimation(ScaleTransform.ScaleYProperty, new DoubleAnimation(1, 0.86, duration) { EasingFunction = ease });
        offset.BeginAnimation(TranslateTransform.YProperty, new DoubleAnimation(0, 128, duration) { EasingFunction = ease });
    }

    /// <summary>Animate only a button's glyph. Rapid presses replace rather than accumulate.</summary>
    public static void IconAction(System.Windows.Controls.Button button, bool enabled, string kind)
    {
        if (button.Content is not FrameworkElement glyph) return;
        if (!enabled) { glyph.RenderTransform = Transform.Identity; return; }
        // For Repeat1, spin only the arrow loop path so the centered "1" remains upright and steady.
        var targetGlyph = kind == "repeat" && glyph is System.Windows.Controls.Grid stack && stack.Children.Count > 0 && stack.Children[0] is FrameworkElement arrows
            ? arrows
            : glyph;
        var scale = new ScaleTransform(1, 1);
        var rotate = new RotateTransform();
        var offset = new TranslateTransform();
        var transforms = new TransformGroup();
        transforms.Children.Add(scale); transforms.Children.Add(rotate); transforms.Children.Add(offset);
        targetGlyph.RenderTransformOrigin = new Point(.5, .5);
        targetGlyph.RenderTransform = transforms;
        void Animate(Animatable target, DependencyProperty property, double baseline, double peak) {
            var animation = new DoubleAnimationUsingKeyFrames { Duration = TimeSpan.FromMilliseconds(260), FillBehavior = FillBehavior.Stop };
            animation.KeyFrames.Add(new EasingDoubleKeyFrame(baseline, KeyTime.FromTimeSpan(TimeSpan.Zero)));
            animation.KeyFrames.Add(new EasingDoubleKeyFrame(peak, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(90)), new CubicEase { EasingMode = EasingMode.EaseOut }));
            animation.KeyFrames.Add(new EasingDoubleKeyFrame(baseline, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(260)), new CubicEase { EasingMode = EasingMode.EaseOut }));
            target.BeginAnimation(property, animation);
        }
        if (kind == "repeat")
        {
            var spin = new DoubleAnimation(0, 360, TimeSpan.FromMilliseconds(520))
            {
                EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut },
                FillBehavior = FillBehavior.Stop,
            };
            rotate.BeginAnimation(RotateTransform.AngleProperty, spin);
            return;
        }
        Animate(scale, ScaleTransform.ScaleXProperty, 1, kind == "favorite" ? 1.18 : .93);
        Animate(scale, ScaleTransform.ScaleYProperty, 1, kind == "favorite" ? 1.18 : kind == "shuffle" ? 1.12 : .93);
        if (kind == "shuffle")
        {
            Animate(offset, TranslateTransform.XProperty, 0, 2.2);
            if (targetGlyph is System.Windows.Shapes.Path path &&
                Application.Current?.TryFindResource("IconShuffleParallel") is Geometry parallel &&
                Application.Current?.TryFindResource("IconShuffle") is Geometry crossed)
            {
                path.Data = parallel;
                var restore = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(280) };
                restore.Tick += (_, _) => { restore.Stop(); path.Data = crossed; };
                restore.Start();
            }
        }
    }

}
