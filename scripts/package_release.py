"""Package an already-built web client; never create tags or upload native binaries."""

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import zipfile
from datetime import UTC, datetime
from pathlib import Path


def package_release(root: Path, output: Path) -> list[Path]:
    version = json.loads((root / "package.json").read_text())["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("A stable semantic version is required")
    commit = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=root, text=True
    ).strip()
    timestamp = int(
        subprocess.check_output(
            ["git", "show", "-s", "--format=%ct", "HEAD"], cwd=root, text=True
        ).strip()
    )
    date = datetime.fromtimestamp(timestamp, UTC).timetuple()[:6]
    dist = root / "dist"
    if not (dist / "index.html").is_file():
        raise ValueError("Build the web client before packaging")
    if output.resolve().is_relative_to(dist.resolve()):
        raise ValueError("Keep release output outside dist")
    output.mkdir(parents=True, exist_ok=True)
    base = f"Wave-{version}-web"
    archive = output / f"{base}.zip"
    entries = {
        str(file.relative_to(dist)): file.read_bytes()
        for file in dist.rglob("*")
        if file.is_file()
    }
    for name in ["LICENSE", "THIRD_PARTY_NOTICES.md", "PRIVACY.md"]:
        entries[name] = (root / name).read_bytes()
    entries["release.json"] = (
        json.dumps(
            {
                "version": version,
                "tag": f"v{version}",
                "commit": commit,
                "basePath": "./",
            },
            indent=2,
        )
        + "\n"
    ).encode()
    entries["README.txt"] = (
        f"Wave {version} — web client\n\n"
        "Serve this directory with a static HTTP(S) server; do not open index.html directly.\n"
        "Assets use relative URLs, supporting root and subdirectory hosting.\n"
        "Libraries belong to a browser profile and site origin; retain that origin when updating.\n"
        "This archive is not a Windows or Android installer.\n"
        "Review the included privacy and third-party notices before hosting.\n\n"
        f"Source: https://github.com/jaime-gaming/Wave/tree/{commit}\n"
        "SHA-256 checksums accompany the release; they are not publisher signatures.\n"
    ).encode()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zipped:
        for name, content in sorted(entries.items()):
            info = zipfile.ZipInfo(f"{base}/{name}", date_time=date)
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            zipped.writestr(info, content, compresslevel=9)
    film = root / "docs" / "media" / f"wave-{version}-promo.mp4"
    packaged_film = output / film.name
    shutil.copyfile(film, packaged_film)
    assets = [archive, packaged_film]
    checksums = output / "SHA256SUMS.txt"
    checksums.write_text(
        "".join(
            f"{hashlib.sha256(asset.read_bytes()).hexdigest()}  {asset.name}\n"
            for asset in assets
        ),
        encoding="utf-8",
    )
    return [*assets, checksums]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    for asset in package_release(Path(__file__).resolve().parents[1], args.output):
        print(asset)
