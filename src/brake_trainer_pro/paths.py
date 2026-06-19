from __future__ import annotations

import os
from pathlib import Path


APP_NAME = "BrakeTrainerPro"


def _base_data_dir() -> Path:
    if os.name == "nt":
        appdata = os.environ.get("APPDATA")
        if appdata:
            return Path(appdata) / APP_NAME
    return Path.home() / f".{APP_NAME.lower()}"


def app_data_dir() -> Path:
    path = _base_data_dir()
    path.mkdir(parents=True, exist_ok=True)
    return path


def config_path() -> Path:
    return app_data_dir() / "config.json"


def database_path() -> Path:
    return app_data_dir() / "brake_trainer.db"


def export_dir() -> Path:
    path = app_data_dir() / "exports"
    path.mkdir(parents=True, exist_ok=True)
    return path

