from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from brake_trainer_pro.config import ConfigStore
from brake_trainer_pro.models import AppConfig


class ConfigTests(unittest.TestCase):
    def test_roundtrip(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "config.json"
            store = ConfigStore(path)
            config = AppConfig(profile_name="Race", wheel_range_deg=720.0)
            store.save(config)
            loaded = store.load()
            self.assertEqual(loaded.profile_name, "Race")
            self.assertEqual(loaded.wheel_range_deg, 720.0)


if __name__ == "__main__":
    unittest.main()

