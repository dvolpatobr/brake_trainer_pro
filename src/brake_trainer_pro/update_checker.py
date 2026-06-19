from __future__ import annotations

import json
from dataclasses import dataclass
from urllib.request import urlopen


@dataclass
class UpdateInfo:
    current_version: str
    latest_version: str
    download_url: str = ""
    release_notes: str = ""

    @property
    def update_available(self) -> bool:
        return self.latest_version != self.current_version


def check_update(manifest_url: str, current_version: str) -> UpdateInfo | None:
    try:
        with urlopen(manifest_url, timeout=4) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return None
    return UpdateInfo(
        current_version=current_version,
        latest_version=str(payload.get("version", current_version)),
        download_url=str(payload.get("download_url", "")),
        release_notes=str(payload.get("release_notes", "")),
    )
