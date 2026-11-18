"""Render the animated feature film from real screenshots and the intro's CC0 piano score.

Install Pillow and imageio-ffmpeg, then run from the repository root. The source
screenshots and soundtrack are checked in; no user library or network is used.
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

# Screens are genuine captures. Captions describe new 0.2.2 changes, not native parity.
slides = [
    ("A little more Wave", "What's new in 0.2.2", "home-desktop.png"),
    ("Mix, with the music", "Lyrics can help guide the next song in", "now-playing-desktop.png"),
    ("A more even sound", "Balance your library or revisit one song", "volume-fix-desktop.png"),
    ("A player at your fingertips", "Play, seek and adjust volume from the keyboard", "now-playing-desktop.png"),
    ("More of your music, in view", "Artwork for your native library", "windows-home-dark.png"),
    ("Your music. Your wavelength.", "wave.jaime-gaming.com", "home-mobile.png"),
]
SECONDS = 5
with tempfile.TemporaryDirectory() as directory:
    tmp = Path(directory)
    for i, (title, subtitle, image) in enumerate(slides):
        canvas = Image.new('RGB', (1280, 720), '#f8f9fd')
        draw = ImageDraw.Draw(canvas)
        draw.rounded_rectangle((36, 35, 1244, 685), 28, fill='#eef1f9')
        draw.text((82, 76), title, font=ImageFont.truetype(str(BOLD), 48), fill='#202b43')
        draw.text((84, 147), subtitle, font=ImageFont.truetype(str(FONT), 24), fill='#606e89')
        screenshot = Image.open(MEDIA / image).convert('RGB')
        screenshot.thumbnail((1050, 460), Image.Resampling.LANCZOS)
        canvas.paste(screenshot, ((1280 - screenshot.width) // 2, 218))
        canvas.save(tmp / f'{i:02}.png')
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    inputs = []
    filters = []
    for i in range(len(slides)):
        inputs += ['-loop', '1', '-framerate', '30', '-t', str(SECONDS), '-i', str(tmp / f'{i:02}.png')]
        # Each real image moves gently; short fades keep the transitions calm.
        filters.append(
            f'[{i}:v]scale=1408:792,zoompan=z=\'min(zoom+0.00035,1.06)\':'
            f'x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d=1:s=1280x720:fps=30,'
            f'fade=t=in:st=0:d=0.45,fade=t=out:st=4.55:d=0.45,setsar=1[v{i}]'
        )
    filters.append(''.join(f'[v{i}]' for i in range(len(slides))) + f'concat=n={len(slides)}:v=1:a=0[v]')
    duration = SECONDS * len(slides)
    subprocess.run([ffmpeg, '-y', *inputs, '-i', str(MEDIA / 'wave-promo.mp4'),
                    '-filter_complex', ';'.join(filters), '-map', '[v]', '-map', f'{len(slides)}:a:0',
                    '-t', str(duration), '-af', f'afade=t=in:st=0:d=1,afade=t=out:st={duration-2}:d=2',
                    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart',
                    str(MEDIA / 'wave-whats-new.mp4')], check=True)
