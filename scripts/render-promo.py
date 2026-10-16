"""Compose the approved 60-second product film from real Wave screen recordings.

This changes presentation media only. App screens remain actual captured UI.
Dependencies: Pillow, numpy, av, fonttools, brotli; FFmpeg with libx264/AAC.
"""

import argparse
import json
import subprocess
from datetime import datetime
from functools import lru_cache
from pathlib import Path

import av
import numpy as np
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image, ImageDraw, ImageFilter, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument("--ffmpeg", default="ffmpeg")
parser.add_argument("--preview", action="store_true")
parser.add_argument("--output", default=".cache/promo-v2/promo-master.mp4")
args = parser.parse_args()
ROOT = Path(".cache/promo-v2")
ROOT.mkdir(parents=True, exist_ok=True)
W, H, FPS = 1920, 1080, 30
INK = (30, 36, 51)
MUTED = (104, 113, 134)
ACCENT = (79, 102, 163)
manifest = json.loads((ROOT / "captures.json").read_text())
font_source = Path(
    "node_modules/@fontsource-variable/nunito-sans/files/nunito-sans-latin-wght-normal.woff2"
)
for weight in (450, 550, 750, 850):
    target = ROOT / f"nunito-{weight}.ttf"
    if not target.exists():
        font = TTFont(font_source)
        font.flavor = None
        instance = instantiateVariableFont(font, {"wght": weight}, inplace=False)
        instance.save(target)


@lru_cache(maxsize=80)
def font(size, weight=750):
    return ImageFont.truetype(str(ROOT / f"nunito-{weight}.ttf"), round(size))


def clamp(x):
    return max(0, min(1, float(x)))


def smooth(x):
    x = clamp(x)
    return x * x * x * (x * (x * 6 - 15) + 10)


def ease(x):
    return 1 - (1 - clamp(x)) ** 4


y, x = np.mgrid[0:H, 0:W]
light = np.exp(-(((x - 1270) / 920) ** 2 + ((y - 510) / 760) ** 2))
base = np.zeros((H, W, 3), dtype=np.uint8)
for i, (start, end) in enumerate([(251, 243), (252, 246), (254, 253)]):
    base[:, :, i] = np.clip(start + (end - start) * light, 0, 255).astype(np.uint8)
BACKGROUND = Image.fromarray(base).convert("RGBA")
del base, light, y, x


class Clip:
    def __init__(self, name):
        self.name = name
        self.data = manifest[name]
        self.container = None
        self.current = None
        self.time = -1
        self.open()

    def open(self):
        if self.container:
            self.container.close()
        self.container = av.open(self.data["file"])
        created = datetime.fromisoformat(
            self.container.metadata["creation_time"]
        ).timestamp()
        self.start = max(0, self.data["startAt"] / 1000 - created + 0.05)
        self.length = max(0.1, (self.data["endAt"] - self.data["startAt"]) / 1000 - 0.3)
        self.container.seek(max(0, int((self.start - 0.25) * av.time_base)))
        self.decoder = self.container.decode(video=0)
        self.time = -1
        self.current = None

    def frame(self, p):
        target = self.start + clamp(p) * self.length
        if self.current is not None and target < self.time - 0.1:
            self.open()
        while self.current is None or self.time < target:
            try:
                f = next(self.decoder)
                self.time = float(f.time or 0)
                self.current = f.to_image().convert("RGBA")
            except StopIteration:
                break
        if self.current is None:
            raise RuntimeError("No frame: " + self.name)
        width, height = self.data["viewport"]["width"], self.data["viewport"]["height"]
        return (
            self.current.crop((0, 0, width, height)) if width < 1440 else self.current
        )


@lru_cache(maxsize=14)
def clip(name):
    return Clip(name)


def text_layer(image, text, xy, size=78, weight=850, color=INK, alpha=1, tracking=-2):
    layer = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(layer)
    f = font(size, weight)
    tx, ty = xy
    for ch in text:
        d.text(
            (round(tx), round(ty + f.getmetrics()[0])),
            ch,
            font=f,
            fill=(*color, round(255 * clamp(alpha))),
            anchor="ls",
            stroke_width=0,
        )
        tx += d.textlength(ch, font=f) + tracking
    image.alpha_composite(layer)


def text_width(text, size, weight=850, tracking=-2):
    f = font(size, weight)
    d = ImageDraw.Draw(Image.new("L", (1, 1)))
    return d.textlength(text, font=f) + max(0, len(text) - 1) * tracking


def wave(image, xy, width=50, progress=1, alpha=1):
    scale = 4
    canvas = Image.new("RGBA", (round(width * scale), round(width * 0.8 * scale)))
    d = ImageDraw.Draw(canvas)
    segments = [
        ((4, 7), (7, 7), (7, 23), (12, 23)),
        ((12, 23), (17, 23), (17, 7), (20, 7)),
        ((20, 7), (23, 7), (23, 23), (28, 23)),
        ((28, 23), (33, 23), (33, 7), (36, 7)),
    ]
    pts = []
    for a, b, c, e in segments:
        for t in np.linspace(0, 1, 50):
            xx = (
                (1 - t) ** 3 * a[0]
                + 3 * (1 - t) ** 2 * t * b[0]
                + 3 * (1 - t) * t * t * c[0]
                + t**3 * e[0]
            )
            yy = (
                (1 - t) ** 3 * a[1]
                + 3 * (1 - t) ** 2 * t * b[1]
                + 3 * (1 - t) * t * t * c[1]
                + t**3 * e[1]
            )
            pts.append((xx / 40 * width * scale, yy / 40 * width * scale))
    pts = pts[: max(1, round(len(pts) * clamp(progress)))]
    stroke = round(width * 0.106 * scale)
    color = (*ACCENT, round(255 * alpha))
    for px, py in pts:
        d.ellipse(
            (px - stroke / 2, py - stroke / 2, px + stroke / 2, py + stroke / 2),
            fill=color,
        )
    canvas = canvas.resize((round(width), round(width * 0.8)), Image.Resampling.LANCZOS)
    image.alpha_composite(canvas, (round(xy[0]), round(xy[1])))


def chrome(image, footer=True):
    wave(image, (94, 58), 48)
    text_layer(image, "Wave", (154, 56), 31, 750, INK, tracking=-0.7)
    if not footer:
        return
    text_layer(image, "0.1.0", (94, 1015), 21, 550, MUTED, tracking=0)
    right = "Web app · Demo collection"
    text_layer(
        image,
        right,
        (W - 96 - text_width(right, 21, 550, 0), 1015),
        21,
        550,
        MUTED,
        tracking=0,
    )


def title(image, lines, subtitle, elapsed, size=80, y=305):
    for i, line in enumerate(lines):
        a = ease((elapsed - 0.08 * i) / 0.65)
        text_layer(
            image,
            line,
            (98, y + i * size * 1.05 + 45 * (1 - a)),
            size,
            850,
            INK,
            a,
            tracking=-2.7,
        )
    top = y + len(lines) * size * 1.05 + 34
    for i, line in enumerate(subtitle):
        a = smooth((elapsed - 0.24 - i * 0.08) / 0.55)
        text_layer(
            image,
            line,
            (101, top + i * 40 + 16 * (1 - a)),
            29,
            450,
            MUTED,
            a,
            tracking=-0.25,
        )


@lru_cache(maxsize=14)
def shadow_template(w, h, radius, pad=64):
    mask = Image.new("L", (w + pad * 2, h + pad * 2))
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle(
        (pad + 3, pad + 22, pad + w - 3, pad + h + 22), radius=radius, fill=43
    )
    mask = mask.filter(ImageFilter.GaussianBlur(22))
    result = Image.new("RGBA", mask.size, (35, 47, 74, 0))
    result.putalpha(mask)
    ImageDraw.Draw(result).rounded_rectangle(
        (pad, pad, pad + w, pad + h),
        radius=radius,
        fill=(255, 255, 255, 255),
        outline=(211, 218, 230, 255),
        width=2,
    )
    return result


@lru_cache(maxsize=14)
def rounded_mask(w, h, r):
    im = Image.new("L", (w, h))
    ImageDraw.Draw(im).rounded_rectangle((0, 0, w - 1, h - 1), radius=r, fill=255)
    return im


def perspective(sprite, amount):
    if abs(amount) < 0.05:
        return sprite
    w, h = sprite.size
    s = amount
    destination = [(s, s * 0.15), (w - s * 0.15, 0), (w, h - s * 0.15), (0, h)]
    source = [(0, 0), (w, 0), (w, h), (0, h)]
    A = []
    B = []
    for (x, y), (u, v) in zip(destination, source):
        A.extend(
            [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]
        )
        B.extend([u, v])
    coeff = np.linalg.solve(np.array(A, dtype=float), np.array(B, dtype=float))
    return sprite.transform(
        sprite.size, Image.Transform.PERSPECTIVE, coeff, Image.Resampling.BICUBIC
    )


def window(
    image, source, rect, elapsed, progress=0, portrait=False, alpha=1, crop=None
):
    x, y, w, h = rect
    w, h = round(w), round(h)
    pad = 64
    if crop:
        source = source.crop(crop)
    radius = 44 if portrait else 30
    sprite = shadow_template(w, h, radius).copy()
    inset = 8 if portrait else 5
    # Source pixels are cropped/resized only; controls and their state are never fabricated.
    ui = source.resize((w - inset * 2, h - inset * 2), Image.Resampling.LANCZOS)
    sprite.paste(
        ui,
        (pad + inset, pad + inset),
        rounded_mask(w - inset * 2, h - inset * 2, radius - inset),
    )
    entrance = ease(elapsed / 0.85)
    amount = (18 if portrait else 34) * (1 - entrance)
    sprite = perspective(sprite, amount)
    zoom = 0.94 + 0.06 * entrance + 0.007 * clamp(progress)
    if abs(zoom - 1) > 0.0001:
        size = (round(sprite.width * zoom), round(sprite.height * zoom))
        sprite = sprite.resize(size, Image.Resampling.BICUBIC)
    fade = clamp(elapsed / 0.36) * alpha
    if fade < 1:
        sprite.putalpha(sprite.getchannel("A").point(lambda a: round(a * fade)))
    dx = 100 * (1 - entrance)
    dy = 50 * (1 - entrance)
    if portrait:
        dx = 80 * (1 - entrance)
        dy = 100 * (1 - entrance)
    px = round(x - pad + dx + (1 - zoom) * w / 2)
    py = round(y - pad + dy + (1 - zoom) * h / 2)
    image.alpha_composite(sprite, (px, py))


# Absolute chapter timings implement the approved storyboard, not wall-clock sleeps.
SCENES = [
    (
        5,
        12,
        "collection",
        ["Bring your", "collection."],
        ["Songs. Albums. Artists.", "Favorites, all in one place."],
    ),
    (
        12,
        19,
        "daily",
        ["Discover it", "again."],
        ["Browse a daily mix.", "Save it as your own playlist."],
    ),
    (
        19,
        22.8,
        "search",
        ["Find it."],
        ["Search your collection.", "Edit the details."],
    ),
    (
        22.8,
        26,
        "ordering",
        ["Make it", "yours."],
        ["Your playlists.", "Your preferred order."],
    ),
    (
        26,
        30,
        "playback",
        ["Keep the", "music", "moving."],
        ["Full-screen listening.", "Your original audio."],
    ),
    (
        30,
        33,
        "queue",
        ["Up next.", "Your call."],
        ["Add songs. Move them.", "Keep listening."],
    ),
    (33, 35, "mix", ["Keep it", "flowing."], ["Automatic Mix.", "Local Autoplay."]),
    (
        35,
        40,
        "lyrics",
        ["Follow", "every line."],
        ["Synchronized lyrics.", "Saved for offline listening."],
    ),
    (
        40,
        44,
        "editor",
        ["Find.", "Preview.", "Save."],
        ["Search without playing.", "Keep the result you choose."],
    ),
    (
        44,
        48,
        "appearance",
        ["Your space."],
        ["Light or dark.", "Your preferred text size."],
    ),
    (48, 54, "mobile", ["Your way."], ["At your desk.", "Or in your hand."]),
]


def intro(t):
    im = BACKGROUND.copy()
    wave(im, (895, 145), 130, ease((t - 0.1) / 1.4), smooth(t / 0.3))
    for i, (line, color) in enumerate([("Your music.", INK), ("In Wave.", ACCENT)]):
        a = ease((t - 0.65 - i * 0.22) / 0.8)
        size = 144
        xx = (W - text_width(line, size)) / 2
        text_layer(
            im,
            line,
            (xx, 353 + i * 166 + 60 * (1 - a)),
            size,
            850,
            color,
            a,
            tracking=-5,
        )
    label = "Wave 0.1.0"
    a = smooth((t - 2) / 0.6)
    text_layer(
        im,
        label,
        ((W - text_width(label, 30, 550, 0)) / 2, 792 + 15 * (1 - a)),
        30,
        550,
        MUTED,
        a,
        tracking=0,
    )
    return im


def outro(t):
    im = BACKGROUND.copy()
    a = ease(t / 0.8)
    wave(im, (882, 175 + 25 * (1 - a)), 156, ease(t / 1.1), a)
    line = "Wave"
    size = 166
    tw = text_width(line, size)
    text_layer(
        im, line, ((W - tw) / 2, 397 + 45 * (1 - a)), size, 850, INK, a, tracking=-5
    )
    version = "0.1.0"
    v = smooth((t - 0.55) / 0.6)
    text_layer(
        im,
        version,
        ((W - text_width(version, 31, 550, 0)) / 2, 610 + 18 * (1 - v)),
        31,
        550,
        MUTED,
        v,
        tracking=0,
    )
    url = "github.com/jaime-gaming/Wave"
    b = ease((t - 0.9) / 0.65)
    text_layer(
        im,
        url,
        ((W - text_width(url, 43, 750, -0.7)) / 2, 741 + 20 * (1 - b)),
        43,
        750,
        ACCENT,
        b,
        tracking=-0.7,
    )
    return im


def scene(index, t):
    start, end, name, lines, sub = SCENES[index]
    local = t - start
    duration = end - start
    p = clamp(local / duration)
    im = BACKGROUND.copy()
    chrome(im, name != "playback")
    if name == "playback":
        text = "Keep the music moving."
        a = ease(local / 0.7)
        text_layer(
            im,
            text,
            ((W - text_width(text, 76, 850, -2.5)) / 2, 95 + 35 * (1 - a)),
            76,
            850,
            INK,
            a,
            tracking=-2.5,
        )
        window(im, clip(name).frame(p), (320, 222, 1280, 800), local, p)
    elif name == "queue":
        title(im, lines, sub, local, 80, 300)
        camera = smooth((local - 0.4) / 1.5)
        source = clip(name).frame(p).crop((950 * camera, 0, 1440, 900))
        rect = (
            530 + 640 * camera,
            160 - 72 * camera,
            1290 - 784 * camera,
            806 + 124 * camera,
        )
        window(im, source, rect, local, p)
    elif name == "lyrics":
        title(im, lines, sub, local, 80, 300)
        camera = smooth((local - 0.8) / 2.6)
        source = (
            clip(name)
            .frame(p)
            .crop((620 * camera, 180 * camera, 1440, 900 - 207.5 * camera))
        )
        window(im, source, (530, 160, 1290, 806), local, p)
    elif name == "mobile":
        title(im, lines, sub, local, 90, 345)
        first = clip("mobile-home").frame(p)
        second = clip("mobile-player").frame(p)
        window(im, first, (884, 104, 406, 878), local, p, True)
        window(im, second, (1334, 145, 390, 844), max(0, local - 0.2), p, True)
    elif name == "editor":
        title(im, lines, sub, local, 94, 235)
        frame = clip(name).frame(p)
        # The original surrounding app is a quiet depth layer behind the real dialog crop.
        ghost = frame.resize((1200, 750)).filter(ImageFilter.GaussianBlur(12))
        ghost.putalpha(rounded_mask(1200, 750, 40).point(lambda a: round(a * 0.10)))
        im.alpha_composite(ghost, (640, 192))
        window(im, frame, (1115, 85, 500, 887), local, p, crop=(480, 24, 960, 876))
    elif name == "ordering":
        title(im, lines, sub, local, 88, 322)
        window(
            im,
            clip(name).frame(p),
            (973, 110, 740, 855),
            local,
            p,
            crop=(350, 0, 1090, 855),
        )
    elif name == "mix":
        title(im, lines, sub, local, 88, 330)
        window(
            im,
            clip(name).frame(p),
            (642, 220, 1140, 748),
            local,
            p,
            crop=(420, 225, 1380, 855),
        )
    else:
        title(im, lines, sub, local, 80, 300 if len(lines) < 3 else 235)
        rect = (530, 160, 1290, 806)
        if name == "appearance":
            rect = (590, 160, 1230, 769)
        window(im, clip(name).frame(p), rect, local, p)
    return im


def frame_at(t):
    if t < 5:
        return intro(t)
    if t >= 54:
        current = outro(t - 54)
        if t < 54.55:
            return Image.blend(
                scene(len(SCENES) - 1, 53.999), current, smooth((t - 54) / 0.55)
            )
        return current
    index = next(i for i, s in enumerate(SCENES) if s[0] <= t < s[1])
    current = scene(index, t)
    elapsed = t - SCENES[index][0]
    if elapsed < 0.42:
        previous = (
            intro(4.999)
            if index == 0
            else scene(index - 1, SCENES[index - 1][1] - 0.001)
        )
        current = Image.blend(previous, current, smooth(elapsed / 0.42))
    return current


if args.preview:
    for t in [1.7, 4, 7, 14.5, 21.2, 24.6, 28, 31.4, 34, 37.5, 42, 46, 50.5, 57.5]:
        frame_at(t).convert("RGB").save(ROOT / f"preview-{t:g}.jpg", quality=92)
    print("Preview frames saved.")
else:
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    sound = ROOT / "piano-score.wav"
    if not sound.exists():
        raise SystemExit("Run scripts/score-promo.py first.")
    command = [
        args.ffmpeg,
        "-y",
        "-f",
        "rawvideo",
        "-vcodec",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{W}x{H}",
        "-r",
        str(FPS),
        "-i",
        "pipe:0",
        "-i",
        str(sound),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-t",
        "60",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "19",
        "-profile:v",
        "high",
        "-level:v",
        "4.1",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-af",
        "loudnorm=I=-18:TP=-1.5:LRA=9",
        "-movflags",
        "+faststart",
        "-map_metadata",
        "-1",
        "-metadata",
        "title=Wave — Your music. In Wave.",
        "-metadata",
        "comment=Real Wave interface recordings; original acoustic-piano score using CC0 VCSL samples",
        str(output),
    ]
    with (ROOT / "encode.log").open("w") as log:
        process = subprocess.Popen(
            command, stdin=subprocess.PIPE, stdout=log, stderr=log
        )
        try:
            for number in range(FPS * 60):
                image = frame_at(number / FPS).convert("RGB")
                process.stdin.write(image.tobytes())
                if number % 150 == 0:
                    print(f"Rendered {number / FPS:.0f}/60s", flush=True)
            process.stdin.close()
            code = process.wait()
            if code:
                raise RuntimeError("FFmpeg failed; inspect " + str(ROOT / "encode.log"))
        except BaseException:
            process.kill()
            process.wait()
            raise
    print("Rendered", output)
