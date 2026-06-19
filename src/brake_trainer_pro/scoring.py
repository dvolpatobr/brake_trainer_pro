from __future__ import annotations

from dataclasses import dataclass


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def percent_error(actual: float, target: float) -> float:
    return abs(actual - target)


def linear_score(error_pct: float, span: float = 20.0) -> float:
    return clamp(100.0 * (1.0 - min(1.0, error_pct / span)))


def smoothness_score(delta_pct: float, scale: float = 8.0) -> float:
    return clamp(100.0 * (1.0 - min(1.0, abs(delta_pct) / scale)))


def reaction_score(delay_ms: int, ideal_ms: int = 300, span_ms: int = 900) -> float:
    if delay_ms <= ideal_ms:
        return 100.0
    return clamp(100.0 * (1.0 - min(1.0, (delay_ms - ideal_ms) / span_ms)))


@dataclass
class ScoreBreakdown:
    precision: float = 0.0
    timing: float = 0.0
    smoothness: float = 0.0
    consistency: float = 0.0
    reaction: float = 0.0
    coordination: float = 0.0
    adherence: float = 0.0
    bonus: float = 0.0

    def total(self) -> float:
        components = [
            self.precision,
            self.timing,
            self.smoothness,
            self.consistency,
            self.reaction,
            self.coordination,
            self.adherence,
        ]
        base = sum(components) / max(1, sum(1 for item in components if item > 0))
        return clamp(base + self.bonus)
