import AppKit
import Foundation

// A simulator can report a successful screenshot while the app is still on a
// blank white launch screen. Sample the content area, away from the status bar.
// This only detects an obvious blank screen; it is not a visual UI test.
guard CommandLine.arguments.count == 2,
      let data = try? Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])),
      let image = NSBitmapImageRep(data: data),
      image.pixelsWide > 0, image.pixelsHigh > 0 else {
    fputs("Could not read iOS screenshot\n", stderr)
    exit(1)
}

var white = 0
var sampled = 0
for y in 0..<70 {
    for x in 0..<50 {
        let pixelX = Int((Double(x) + 0.5) * Double(image.pixelsWide) / 50)
        let pixelY = Int((0.12 + (Double(y) + 0.5) * 0.78 / 70) * Double(image.pixelsHigh))
        guard let color = image.colorAt(x: pixelX, y: pixelY)?.usingColorSpace(NSColorSpace.deviceRGB) else { continue }
        sampled += 1
        if color.redComponent > 0.9 && color.greenComponent > 0.9 && color.blueComponent > 0.9 {
            white += 1
        }
    }
}

guard sampled > 0, Double(white) / Double(sampled) < 0.95 else {
    fputs("iOS screenshot is blank or still on the launch screen\n", stderr)
    exit(1)
}
