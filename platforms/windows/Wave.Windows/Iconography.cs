using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Media;
using System.Windows.Shapes;

namespace Wave.Windows;










internal static class Iconography
{

    private static string Key(string name) =>
        "Icon" + string.Concat(name.Split('-', StringSplitOptions.RemoveEmptyEntries).Select(part => char.ToUpperInvariant(part[0]) + part[1..]));


    internal static Path Draw(string name, double size = 20, double thickness = 1.7, Brush? brush = null)
    {


        if (name == "pause") thickness = Math.Max(thickness, 2.4);
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


        var tint = new Binding(nameof(Control.Foreground))
        {
            RelativeSource = new RelativeSource(RelativeSourceMode.FindAncestor, typeof(Control), 1),
            FallbackValue = Brushes.Transparent,
        };
        path.SetBinding(Shape.StrokeProperty, tint);
        return path;
    }


    internal static StackPanel With(string name, string text, double size = 20, double gap = 12)
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal };
        row.Children.Add(Draw(name, size));
        row.Children.Add(new TextBlock { Text = text, Margin = new Thickness(gap, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center });
        return row;
    }


    internal static void Set(Button button, string name, double size = 20) => button.Content = Draw(name, size);
}
