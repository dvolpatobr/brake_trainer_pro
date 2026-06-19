from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from brake_trainer_pro.database import Database
from brake_trainer_pro.models import AppConfig, SamplePoint, SessionSummary


class DatabaseTests(unittest.TestCase):
    def test_store_session_and_export(self) -> None:
        with TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "data.sqlite"
            db = Database(db_path)
            config = AppConfig(profile_name="Test")
            db.upsert_profile(config)
            samples = [
                SamplePoint(0, 10.0, 0.0, 12.0, 80.0, 2.0, 1),
                SamplePoint(16, 12.0, 1.0, 12.0, 82.0, 0.0, 2),
            ]
            summary = SessionSummary(
                profile_name="Test",
                mode_id="hold_target",
                mode_label="Hold Target",
                started_at="2026-01-01T00:00:00+00:00",
                duration_ms=16,
                score=82.0,
                brake_peak_pct=12.0,
                steering_peak_deg=1.0,
                avg_error_pct=1.0,
                max_error_pct=2.0,
            )
            session_id = db.save_session(summary, samples)
            self.assertGreater(session_id, 0)
            csv_path = db.export_csv(Path(tmp) / "sessions.csv")
            json_path = db.export_json(Path(tmp) / "sessions.json")
            self.assertTrue(csv_path.exists())
            self.assertTrue(json_path.exists())
            self.assertGreaterEqual(len(db.recent_sessions()), 1)


if __name__ == "__main__":
    unittest.main()

