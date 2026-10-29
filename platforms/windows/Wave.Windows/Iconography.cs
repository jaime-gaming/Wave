using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Media;
using System.Windows.Shapes;

namespace Wave.Windows;

/// <summary>
/// The window's icons, drawn rather than typed.
///
/// A font glyph is whatever the machine happens to have: the platform icon font
/// is missing on some Windows builds and a missing glyph shows up as an empty
/// box. These are the same line drawings the browser uses, on the same 24-unit
/// grid with the same round caps — and they come from the one dictionary in
/// App.xaml, so a list built in code draws exactly what the XAML draws.
/// </summary>
internal static class Iconography
{
    /// <summary>The resource key for an icon name like "arrow-up-right".</summary>
    private static string Key(string name) =>
        "Icon" + string.Concat(name.Split('-', StringSplitOptions.RemoveEmptyEntries).Select(part => char.ToUpperInvariant(part[0]) + part[1..]));

    /// <summary>A stroked icon at the requested size, coloured by whatever it sits in.</summary>
    internal static Path Draw(string name, double size = 20, double thickness = 1.7, Brush? brush = null)
    {
        var path = new Path
        {
            Data = (Geometry)(Application.Current.TryFindResource(Key(name))
                ?? throw new ArgumentException($"There is no icon called {name}.")),
            StrokeThickness = thickness,
            StrokeStartLineCap = PenLineCap.Round,
            StrokeEndLineCap = PenLineCap.Round,
            StrokeLineJoin = PenLineJoin.Round,
            Stretch = Stretch.Uniform,
            Width = size,
            Height = size,
            VerticalAlignment = VerticalAlignment.Center,
            SnapsToDevicePixels = true,
        };
        if (brush != null) { path.Stroke = brush; return path; }
        // Inside a control the icon takes that control's own colour, so a hover, a
        // disabled button and the selected navigation item all tint it.
        var tint = new Binding(nameof(Control.Foreground))
        {
            RelativeSource = new RelativeSource(RelativeSourceMode.FindAncestor, typeof(Control), 1),
            FallbackValue = Brushes.Transparent,
        };
        path.SetBinding(Shape.StrokeProperty, tint);
        return path;
    }

    /// <summary>An icon next to a word, for the places where the word is the point.</summary>
    internal static StackPanel With(string name, string text, double size = 20, double gap = 12)
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal };
        row.Children.Add(Draw(name, size));
        row.Children.Add(new TextBlock { Text = text, Margin = new Thickness(gap, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center });
        return row;
    }

    /// <summary>Puts an icon in a button, keeping the words in the tooltip.</summary>
    internal static void Set(Button button, string name, double size = 20) => button.Content = Draw(name, size);
}
