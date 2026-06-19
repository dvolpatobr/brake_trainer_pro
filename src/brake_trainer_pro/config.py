from __future__ import annotations

import json
from pathlib import Path

from .models import AppConfig
from .paths import config_path


class ConfigStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or config_path()

    def load(self) -> AppConfig:
        if not self.path.exists():
            return AppConfig()
        payload = json.loads(self.path.read_text(encoding="utf-8"))
        return AppConfig.from_dict(payload)

    def save(self, config: AppConfig) -> None:
        self.path.write_text(
            json.dumps(config.to_dict(), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

