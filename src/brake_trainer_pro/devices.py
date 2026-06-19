from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from .models import AxisBinding, DetectedDevice, LiveInput


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


class DeviceBackendUnavailable(RuntimeError):
    pass


@dataclass
class AxisSnapshot:
    device_id: str
    device_name: str
    axis_index: int
    raw_value: float


class DeviceManager:
    def __init__(self) -> None:
        self._pygame = None
        self._joysticks: dict[str, object] = {}
        self._ready = False

    def _ensure_backend(self) -> None:
        if self._ready:
            return
        try:
            import pygame
        except Exception as exc:  # pragma: no cover - import guard
            raise DeviceBackendUnavailable(
                "pygame nao esta disponivel neste ambiente."
            ) from exc
        pygame.init()
        pygame.joystick.init()
        self._pygame = pygame
        self._ready = True

    def refresh(self) -> list[DetectedDevice]:
        self._ensure_backend()
        assert self._pygame is not None
        self._joysticks.clear()
        devices: list[DetectedDevice] = []
        for index in range(self._pygame.joystick.get_count()):
            joystick = self._pygame.joystick.Joystick(index)
            joystick.init()
            device_id = str(getattr(joystick, "get_instance_id", joystick.get_id)())
            self._joysticks[device_id] = joystick
            devices.append(
                DetectedDevice(
                    device_id=device_id,
                    name=joystick.get_name(),
                    axes=joystick.get_numaxes(),
                    buttons=joystick.get_numbuttons(),
                    hats=joystick.get_numhats(),
                )
            )
        return devices

    def get_joystick(self, device_id: str):
        joystick = self._joysticks.get(device_id)
        if joystick is None:
            self.refresh()
            joystick = self._joysticks.get(device_id)
        return joystick

    def read_axis(self, binding: AxisBinding) -> AxisSnapshot | None:
        if not binding.device_id:
            return None
        joystick = self.get_joystick(binding.device_id)
        if joystick is None:
            return None
        axis_count = joystick.get_numaxes()
        if binding.axis_index < 0 or binding.axis_index >= axis_count:
            return None
        assert self._pygame is not None
        self._pygame.event.pump()
        raw = float(joystick.get_axis(binding.axis_index))
        return AxisSnapshot(
            device_id=binding.device_id,
            device_name=joystick.get_name(),
            axis_index=binding.axis_index,
            raw_value=raw,
        )

    def read_input(self, brake: AxisBinding, steering: AxisBinding, wheel_range_deg: float) -> LiveInput:
        brake_snapshot = self.read_axis(brake)
        steering_snapshot = self.read_axis(steering)
        brake_pct = self._normalize(brake_snapshot.raw_value if brake_snapshot else 0.0, brake)
        steering_raw = self._normalize(steering_snapshot.raw_value if steering_snapshot else 0.0, steering)
        steering_angle_deg = (steering_raw * 2.0 - 1.0) * wheel_range_deg
        return LiveInput(
            brake_pct=brake_pct * 100.0,
            steering_angle_deg=steering_angle_deg,
            raw_brake=brake_snapshot.raw_value if brake_snapshot else 0.0,
            raw_steering=steering_snapshot.raw_value if steering_snapshot else 0.0,
            brake_device_name=brake_snapshot.device_name if brake_snapshot else "",
            steering_device_name=steering_snapshot.device_name if steering_snapshot else "",
        )

    def _normalize(self, raw_value: float, binding: AxisBinding) -> float:
        if binding.invert:
            raw_value = -raw_value
        minimum = binding.raw_min
        maximum = binding.raw_max
        if maximum == minimum:
            return 0.0
        normalized = (raw_value - minimum) / (maximum - minimum)
        if binding.deadzone > 0:
            midpoint = 0.5
            if abs(normalized - midpoint) < binding.deadzone:
                normalized = midpoint
        return _clamp(normalized, 0.0, 1.0)

    @staticmethod
    def axis_candidates(devices: Iterable[DetectedDevice]) -> list[tuple[str, int, str]]:
        candidates: list[tuple[str, int, str]] = []
        for device in devices:
            for axis in range(device.axes):
                candidates.append((device.device_id, axis, f"{device.name} - Axis {axis}"))
        return candidates
