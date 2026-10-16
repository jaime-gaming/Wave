"""Isolated contracts for release packaging; no repository or tag mutations."""

import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from package_release import package_release


class PackageReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "package.json").write_text('{"version":"0.1.0"}')
        (self.root / "dist" / "assets").mkdir(parents=True)
        (self.root / "dist" / "index.html").write_text("<main>Package fixture</main>")
        (self.root / "dist" / "assets" / "index.js").write_text(
            "export const fixture = true;"
        )
        for name in ["LICENSE", "THIRD_PARTY_NOTICES.md", "PRIVACY.md"]:
            (self.root / name).write_text(f"Fixture: {name}")
        media = self.root / "docs" / "media"
        media.mkdir(parents=True)
        (media / "wave-0.1.0-promo.mp4").write_bytes(b"isolated media fixture")
        self.git = patch(
            "package_release.subprocess.check_output",
            side_effect=lambda args, **kwargs: (
                "a" * 40 if args[1] == "rev-parse" else "1792180800"
            ),
        )
        self.git.start()
        self.addCleanup(self.git.stop)

    def test_archives_static_files_not_source_or_native_artifacts(self):
        (self.root / "private.key").write_text("not a release input")
        assets = package_release(self.root, self.root / "out")
        self.assertEqual(len(assets), 3)
        with zipfile.ZipFile(assets[0]) as archive:
            prefix = "Wave-0.1.0-web/"
            self.assertIn(prefix + "assets/index.js", archive.namelist())
            self.assertNotIn(prefix + "private.key", archive.namelist())
            self.assertNotIn(prefix + "package.json", archive.namelist())
            metadata = json.loads(archive.read(prefix + "release.json"))
            self.assertEqual(metadata["commit"], "a" * 40)
            self.assertEqual(metadata["basePath"], "./")
            self.assertEqual(archive.read(prefix + "LICENSE"), b"Fixture: LICENSE")
            self.assertIsNone(archive.testzip())
        for line in assets[2].read_text().splitlines():
            digest, name = line.split("  ", 1)
            self.assertEqual(
                digest,
                hashlib.sha256((assets[2].parent / name).read_bytes()).hexdigest(),
            )

    def test_repeated_packaging_is_byte_identical(self):
        first = package_release(self.root, self.root / "first")
        second = package_release(self.root, self.root / "second")
        for a, b in zip(first, second):
            self.assertEqual(a.read_bytes(), b.read_bytes())

    def test_missing_build_fails_before_creating_archive(self):
        (self.root / "dist" / "index.html").unlink()
        with self.assertRaisesRegex(ValueError, "Build the web client"):
            package_release(self.root, self.root / "out")
        self.assertFalse((self.root / "out").exists())

    def test_rejects_output_inside_the_input_tree(self):
        with self.assertRaisesRegex(ValueError, "outside dist"):
            package_release(self.root, self.root / "dist" / "release")


if __name__ == "__main__":
    unittest.main()
