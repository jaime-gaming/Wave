import AppKit
import Foundation

func isNearWhite(_ red: CGFloat, _ green: CGFloat, _ blue: CGFloat) -> Bool {
    red > 0.985 && green > 0.985 && blue > 0.985
}

func hasContent(white: Int, sampled: Int) -> Bool {
    sampled > 0 && Double(white) / Double(sampled) < 0.95
}

func isRendered(_ image: NSBitmapImageRep) -> Bool {
    guard image.pixelsWide > 0, image.pixelsHigh > 0 else { return false }
    var white = 0
    var sampled = 0
    for y in 0..<70 {
        for x in 0..<50 {
            let pixelX = Int((Double(x) + 0.5) * Double(image.pixelsWide) / 50)
            let pixelY = Int((0.12 + (Double(y) + 0.5) * 0.78 / 70) * Double(image.pixelsHigh))
            guard let color = image.colorAt(x: pixelX, y: pixelY)?.usingColorSpace(NSColorSpace.deviceRGB) else { continue }
            sampled += 1
            // Wave's light background is nearly white, but is not the pure white
            // launch screen. The former must not be mistaken for a blank capture.
            if isNearWhite(color.redComponent, color.greenComponent, color.blueComponent) {
                white += 1
            }
        }
    }
    return hasContent(white: white, sampled: sampled)
}

if CommandLine.arguments == [CommandLine.arguments[0], "--self-test"] {
    guard isNearWhite(1, 1, 1),
          !isNearWhite(0.96, 0.97, 0.99),
          !isNearWhite(0, 0, 0),
          !hasContent(white: 0, sampled: 0),
          !hasContent(white: 3500, sampled: 3500),
          hasContent(white: 0, sampled: 3500) else {
        fputs("iOS screenshot validator self-test failed\n", stderr)
        exit(1)
    }
    print("iOS screenshot validator self-test passed")
    exit(0)
}

guard CommandLine.arguments.count == 2,
      let data = try? Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])),
      let image = NSBitmapImageRep(data: data) else {
    fputs("Could not read iOS screenshot\n", stderr)
    exit(1)
}
guard isRendered(image) else {
    fputs("iOS screenshot is blank or still on the launch screen\n", stderr)
    exit(1)
}
