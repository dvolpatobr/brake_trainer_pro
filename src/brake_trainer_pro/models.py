from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any


class ModeId(str, Enum):
    HOLD_TARGET = "hold_target"
    BRAKE_MODULATION = "brake_modulation"
    THRESHOLD_BRAKING = "threshold_braking"
    RANDOM_TARGET = "random_target"
    MEMORY_MUSCLE_TEST = "memory_muscle_test"
    TRAIL_BRAKING_TRAINER = "trail_braking_trainer"
    CORNER_ENTRY_TRAINER = "corner_entry_trainer"
    CHICANE_CHALLENGE = "chicane_challenge"
    BRAKE_RHYTHM = "brake_rhythm"
    QUALIFYING_CHALLENGE = "qualifying_challenge"


MODE_LABELS: dict[ModeId, str] = {
    ModeId.HOLD_TARGET: "Hold Target",
    ModeId.BRAKE_MODULATION: "Brake Modulation",
    ModeId.THRESHOLD_BRAKING: "Threshold Braking",
    ModeId.RANDOM_TARGET: "Random Target",
    ModeId.MEMORY_MUSCLE_TEST: "Memory Muscle Test",
    ModeId.TRAIL_BRAKING_TRAINER: "Trail Braking Trainer",
    ModeId.CORNER_ENTRY_TRAINER: "Corner Entry Trainer",
    ModeId.CHICANE_CHALLENGE: "Chicane Challenge",
    ModeId.BRAKE_RHYTHM: "Brake Rhythm",
    ModeId.QUALIFYING_CHALLENGE: "Qualifying Challenge",
}


@dataclass
class AxisBinding:
    device_id: str = ""
    device_name: str = ""
    axis_index: int = 0
    raw_min: float = -1.0
    raw_max: float = 1.0
    invert: bool = False
    deadzone: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict[str, Any] | None) -> "AxisBinding":
        payload = payload or {}
        return cls(
            device_id=str(payload.get("device_id", "")),
            device_name=str(payload.get("device_name", "")),
            axis_index=int(payload.get("axis_index", 0)),
            raw_min=float(payload.get("raw_min", -1.0)),
            raw_max=float(payload.get("raw_max", 1.0)),
            invert=bool(payload.get("invert", False)),
            deadzone=float(payload.get("deadzone", 0.0)),
        )


@dataclass
class TrailCurvePoint:
    steering_deg: float
    brake_pct: float


@dataclass
class AppConfig:
    profile_name: str = "Default"
    brake: AxisBinding = field(default_factory=AxisBinding)
    steering: AxisBinding = field(default_factory=AxisBinding)
    wheel_range_deg: float = 540.0
    hold_tolerance_pct: float = 2.0
    memory_show_ms: int = 2000
    hold_time_ms: int = 3000
    qualifying_duration_ms: int = 120_000
    trail_curve: list[TrailCurvePoint] = field(
        default_factory=lambda: [
            TrailCurvePoint(0.0, 100.0),
            TrailCurvePoint(30.0, 70.0),
            TrailCurvePoint(60.0, 40.0),
            TrailCurvePoint(90.0, 20.0),
            TrailCurvePoint(120.0, 0.0),
        ]
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "profile_name": self.profile_name,
            "brake": self.brake.to_dict(),
            "steering": self.steering.to_dict(),
            "wheel_range_deg": self.wheel_range_deg,
            "hold_tolerance_pct": self.hold_tolerance_pct,
            "memory_show_ms": self.memory_show_ms,
            "hold_time_ms": self.hold_time_ms,
            "qualifying_duration_ms": self.qualifying_duration_ms,
            "trail_curve": [asdict(point) for point in self.trail_curve],
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any] | None) -> "AppConfig":
        payload = payload or {}
        curve = [
            TrailCurvePoint(
                steering_deg=float(point.get("steering_deg", 0.0)),
                brake_pct=float(point.get("brake_pct", 0.0)),
            )
            for point in payload.get("trail_curve", [])
        ]
        if not curve:
            curve = cls().trail_curve
        return cls(
            profile_name=str(payload.get("profile_name", "Default")),
            brake=AxisBinding.from_dict(payload.get("brake")),
            steering=AxisBinding.from_dict(payload.get("steering")),
            wheel_range_deg=float(payload.get("wheel_range_deg", 540.0)),
            hold_tolerance_pct=float(payload.get("hold_tolerance_pct", 2.0)),
            memory_show_ms=int(payload.get("memory_show_ms", 2000)),
            hold_time_ms=int(payload.get("hold_time_ms", 3000)),
            qualifying_duration_ms=int(payload.get("qualifying_duration_ms", 120_000)),
            trail_curve=curve,
        )


@dataclass
class DetectedDevice:
    device_id: str
    name: str
    axes: int
    buttons: int
    hats: int = 0


@dataclass
class LiveInput:
    brake_pct: float = 0.0
    steering_angle_deg: float = 0.0
    raw_brake: float = 0.0
    raw_steering: float = 0.0
    brake_device_name: str = ""
    steering_device_name: str = ""


@dataclass
class ExerciseStatus:
    mode_id: ModeId
    title: str
    objective: str
    metric: str
    difficulty: str
    feedback: str
    target_pct: float = 0.0
    target_visible: bool = True
    target_label: str = ""
    progress_pct: float = 0.0
    score: float = 0.0
    combo: int = 0
    elapsed_ms: int = 0
    remaining_ms: int = 0
    ideal_brake_pct: float = 0.0
    ideal_steering_deg: float = 0.0


@dataclass
class SamplePoint:
    t_ms: int
    brake_pct: float
    steering_deg: float
    target_pct: float
    score: float
    error_pct: float
    combo: int


@dataclass
class SessionSummary:
    profile_name: str
    mode_id: str
    mode_label: str
    started_at: str
    duration_ms: int
    score: float
    brake_peak_pct: float
    steering_peak_deg: float
    avg_error_pct: float
    max_error_pct: float
    notes: str = ""
