import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("restore_data", Path(__file__).parents[1] / "scripts/restore_data.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RestoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = self.root / "data"
        self.data.mkdir()
        (self.data / "newer-only.dat").write_text("preserve me")
        self.archive = self.root / "backup.tgz"

    def make_archive(self, files, link=False):
        with tarfile.open(self.archive, "w:gz") as tar:
            for name, content in files.items():
                info = tarfile.TarInfo(name)
                payload = content.encode()
                info.size = len(payload)
                tar.addfile(info, io.BytesIO(payload))
            if link:
                info = tarfile.TarInfo("world/escape")
                info.type, info.linkname = tarfile.SYMTYPE, "/etc"
                tar.addfile(info)

    def test_clean_restore_keeps_previous_and_bind_root(self):
        self.make_archive({"./world/level.dat": "old world"})
        inode = self.data.stat().st_ino
        result = module.restore(self.archive, self.data, self.root / "restore")
        self.assertEqual(self.data.stat().st_ino, inode)
        self.assertFalse((self.data / "newer-only.dat").exists())
        self.assertEqual((self.data / "world/level.dat").read_text(), "old world")
        self.assertEqual((Path(result["previous_data"]) / "newer-only.dat").read_text(), "preserve me")

    def test_traversal_rejected_before_mutation(self):
        self.make_archive({"world/level.dat": "old", "../outside": "bad"})
        with self.assertRaises(ValueError): module.restore(self.archive, self.data, self.root / "restore")
        self.assertTrue((self.data / "newer-only.dat").exists())

    def test_link_rejected(self):
        self.make_archive({"world/level.dat": "old"}, link=True)
        with self.assertRaises(ValueError): module.verify(self.archive)

    def test_release_mismatch_keeps_current_world(self):
        self.make_archive({"world/level.dat": "old", ".deployment-lock.json": '{"minecraft":"26.2"}'})
        lock = self.root / "lock.json"
        lock.write_text('{"minecraft":"26.3"}')
        with self.assertRaisesRegex(ValueError, "lock differs"):
            module.restore(self.archive, self.data, self.root / "restore", lock)
        self.assertTrue((self.data / "newer-only.dat").exists())

    def test_matching_release_can_restore(self):
        lock = self.root / "lock.json"
        lock.write_text('{"minecraft":"26.3"}')
        self.make_archive({"world/level.dat": "old", ".deployment-lock.json": lock.read_text()})
        module.restore(self.archive, self.data, self.root / "restore", lock)
        self.assertTrue((self.data / "world/level.dat").exists())

    def test_truncated_archive_rejected(self):
        self.make_archive({"world/level.dat": "old"})
        self.archive.write_bytes(self.archive.read_bytes()[:-12])
        with self.assertRaises((EOFError, tarfile.TarError)):
            module.verify(self.archive)


if __name__ == "__main__": unittest.main()
