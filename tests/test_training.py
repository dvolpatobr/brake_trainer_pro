from __future__ import annotations

from pathlib import Path
import random
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from brake_trainer_pro.models import AppConfig, ModeId
from brake_trainer_pro.training import TrainingSession


class TrainingTests(unittest.TestCase):
    def test_trail_braking_scoring(self) -> None:
        random.seed(7)
        config = AppConfig()
        session = TrainingSession(config, ModeId.TRAIL_BRAKING_TRAINER)
        outcome = session.step(100.0, 0.0, 16)
        self.assertGreaterEqual(outcome.status.score, 0.0)
        self.assertLessEqual(outcome.status.score, 100.0)
        self.assertAlmostEqual(outcome.status.target_pct, 100.0)

    def test_hold_target_generates_status(self) -> None:
        random.seed(1)
        config = AppConfig()
        session = TrainingSession(config, ModeId.HOLD_TARGET)
        outcome = session.step(45.0, 0.0, 16)
        self.assertEqual(outcome.status.mode_id, ModeId.HOLD_TARGET)


if __name__ == "__main__":
    unittest.main()

