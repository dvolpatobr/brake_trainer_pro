from __future__ import annotations

import csv
import json
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Iterable

from .models import AppConfig, ModeId, SamplePoint, SessionSummary


SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    config_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_name TEXT NOT NULL,
    mode_id TEXT NOT NULL,
    mode_label TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    score REAL NOT NULL,
    brake_peak_pct REAL NOT NULL,
    steering_peak_deg REAL NOT NULL,
    avg_error_pct REAL NOT NULL,
    max_error_pct REAL NOT NULL,
    notes TEXT NOT NULL DEFAULT ""
);

CREATE TABLE IF NOT EXISTS session_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    t_ms INTEGER NOT NULL,
    brake_pct REAL NOT NULL,
    steering_deg REAL NOT NULL,
    target_pct REAL NOT NULL,
    score REAL NOT NULL,
    error_pct REAL NOT NULL,
    combo INTEGER NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
"""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._init()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init(self) -> None:
        with self._conn() as conn:
            conn.executescript(SCHEMA)

    def upsert_profile(self, config: AppConfig) -> None:
        payload = json.dumps(config.to_dict(), ensure_ascii=False)
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO profiles(name, config_json, created_at)
                VALUES (?, ?, ?)
                ON CONFLICT(name) DO UPDATE SET config_json=excluded.config_json
                """,
                (config.profile_name, payload, _utc_now()),
            )

    def load_profile(self, name: str) -> AppConfig | None:
        with self._conn() as conn:
            row = conn.execute("SELECT config_json FROM profiles WHERE name = ?", (name,)).fetchone()
        if row is None:
            return None
        return AppConfig.from_dict(json.loads(row["config_json"]))

    def list_profiles(self) -> list[str]:
        with self._conn() as conn:
            rows = conn.execute("SELECT name FROM profiles ORDER BY name").fetchall()
        return [row["name"] for row in rows]

    def save_session(self, summary: SessionSummary, samples: Iterable[SamplePoint]) -> int:
        ended_at = _utc_now()
        with self._conn() as conn:
            cursor = conn.execute(
                """
                INSERT INTO sessions (
                    profile_name, mode_id, mode_label, started_at, ended_at,
                    duration_ms, score, brake_peak_pct, steering_peak_deg,
                    avg_error_pct, max_error_pct, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    summary.profile_name,
                    summary.mode_id,
                    summary.mode_label,
                    summary.started_at,
                    ended_at,
                    summary.duration_ms,
                    summary.score,
                    summary.brake_peak_pct,
                    summary.steering_peak_deg,
                    summary.avg_error_pct,
                    summary.max_error_pct,
                    summary.notes,
                ),
            )
            session_id = int(cursor.lastrowid)
            conn.executemany(
                """
                INSERT INTO session_samples (
                    session_id, t_ms, brake_pct, steering_deg, target_pct, score, error_pct, combo
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        session_id,
                        sample.t_ms,
                        sample.brake_pct,
                        sample.steering_deg,
                        sample.target_pct,
                        sample.score,
                        sample.error_pct,
                        sample.combo,
                    )
                    for sample in samples
                ],
            )
        return session_id

    def recent_sessions(self, limit: int = 30) -> list[sqlite3.Row]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM sessions ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return rows

    def stats_summary(self) -> dict[str, float]:
        with self._conn() as conn:
            total = conn.execute("SELECT COUNT(*) AS value FROM sessions").fetchone()["value"]
            best = conn.execute("SELECT COALESCE(MAX(score), 0) AS value FROM sessions").fetchone()["value"]
            avg_week = conn.execute(
                """
                SELECT COALESCE(AVG(score), 0) AS value
                FROM sessions
                WHERE started_at >= ?
                """,
                ((datetime.now(timezone.utc) - timedelta(days=7)).isoformat(),),
            ).fetchone()["value"]
            avg_month = conn.execute(
                """
                SELECT COALESCE(AVG(score), 0) AS value
                FROM sessions
                WHERE started_at >= ?
                """,
                ((datetime.now(timezone.utc) - timedelta(days=30)).isoformat(),),
            ).fetchone()["value"]
        return {
            "total_sessions": float(total),
            "best_score": float(best),
            "weekly_average": float(avg_week),
            "monthly_average": float(avg_month),
        }

    def export_csv(self, path: Path) -> Path:
        rows = self.recent_sessions(limit=10_000)
        columns = [
            "id",
            "profile_name",
            "mode_id",
            "mode_label",
            "started_at",
            "ended_at",
            "duration_ms",
            "score",
            "brake_peak_pct",
            "steering_peak_deg",
            "avg_error_pct",
            "max_error_pct",
            "notes",
        ]
        with path.open("w", newline="", encoding="utf-8") as fp:
            writer = csv.writer(fp)
            writer.writerow(columns)
            for row in rows:
                writer.writerow([row[column] for column in columns])
        return path

    def export_json(self, path: Path) -> Path:
        rows = self.recent_sessions(limit=10_000)
        data = [dict(row) for row in rows]
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        return path
