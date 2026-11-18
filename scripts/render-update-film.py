"""Create a short, silent feature update from the checked-in web screenshots.

Requires Pillow and imageio-ffmpeg. No browser data or third-party music is used.
"""
from pathlib import Path
import subprocess
import tempfile

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "docs/media"
FONT = ROOT / "platforms/windows/Wave.Windows/Assets/NunitoSans-Regular.ttf"
BOLD = ROOT / "platforms/windows/Wave.Windows/Assets/NunitoSans-Bold.ttf"
if not FONT.exists() or not BOLD.exists():
    FONT = BOLD = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')

slides = [
    ("Wave", "New ways to enjoy your music", "home-desktop.png"),
    ("Daily Mix", "A fresh selection from your own library", "daily-mix-desktop.png"),
    ("Your listening, in Remix", "Explore your listening history", "remix-details-desktop.png"),
    ("Fix volume", "Balance local recordings or reanalyze a song", "volume-fix-desktop.png"),
    ("A player that makes room", "Lyrics, keyboard controls and smoother Mix", "now-playing-desktop.png"),
    ("Your music. Your wavelength.", "wave.jaime-gaming.com", "home-mobile.png"),
]
with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    for i, (title, subtitle, image) in enumerate(slides):
        canvas = Image.new('RGB', (1280, 720), '#12131a')
        draw = ImageDraw.Draw(canvas)
        draw.rounded_rectangle((38, 36, 1242, 684), 30, fill='#1d202b')
        draw.text((80, 84), title, font=ImageFont.truetype(str(BOLD), 48), fill='#f5f5fa')
        draw.text((82, 153), subtitle, font=ImageFont.truetype(str(FONT), 24), fill='#b9bfce')
        screenshot = Image.open(MEDIA / image).convert('RGB')
        screenshot.thumbnail((1040, 440), Image.Resampling.LANCZOS)
        x, y = (1280 - screenshot.width) // 2, 235
        canvas.paste(screenshot, (x, y))
        canvas.save(tmp / f'{i:02}.png')
    manifest = tmp / 'slides.txt'
    manifest.write_text(''.join(f"file '{tmp / f'{i:02}.png'}'\nduration 3\n" for i in range(len(slides))) + f"file '{tmp / '05.png'}'\n")
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-f', 'concat', '-safe', '0', '-i', str(manifest),
                    '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '22', '-movflags', '+faststart',
                    '-an', str(MEDIA / 'wave-whats-new.mp4')], check=True)
