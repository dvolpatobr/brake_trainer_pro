from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean

from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtWidgets import (
    QApplication,
    QCheckBox,
    QComboBox,
    QFileDialog,
    QFormLayout,
    QFrame,
    QGridLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QDoubleSpinBox,
    QScrollArea,
    QTabWidget,
    QTableWidget,
    QTableWidgetItem,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from ..config import ConfigStore
from ..database import Database
from ..devices import DeviceBackendUnavailable, DeviceManager
from ..models import AppConfig, DetectedDevice, MODE_LABELS, ModeId, SessionSummary
from ..paths import export_dir
from ..training import TrainingSession
from .widgets import StatCard, TelemetryGauge, TrendWidget


def _mode_items() -> list[tuple[str, ModeId]]:
    return [(label, mode_id) for mode_id, label in MODE_LABELS.items()]


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Brake Trainer Pro")
        self.resize(1200, 800)
        self.config_store = ConfigStore()
        self.config = self.config_store.load()
        self.db = Database(self._database_path())
        self.device_manager = DeviceManager()
        self.devices: list[DetectedDevice] = []
        self.current_session: TrainingSession | None = None
        self.last_tick = datetime.now(timezone.utc)
        self._loading_controls = False

        self._build_ui()
        self._apply_theme()
        self.refresh_devices()
        self.refresh_profiles()
        self.refresh_stats()

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.tick)
        self.timer.start(33)

    def _database_path(self) -> Path:
        return self.config_store.path.parent / "brake_trainer.db"

    def _build_ui(self) -> None:
        root = QWidget()
        self.setCentralWidget(root)
        root_layout = QVBoxLayout(root)
        header = QHBoxLayout()
        title_box = QVBoxLayout()
        title = QLabel("Brake Trainer Pro")
        title.setObjectName("AppTitle")
        subtitle = QLabel("Telemetry + sim racing brake training")
        subtitle.setObjectName("AppSubtitle")
        title_box.addWidget(title)
        title_box.addWidget(subtitle)
        header.addLayout(title_box)
        header.addStretch(1)
        self.profile_name = QLineEdit(self.config.profile_name)
        self.profile_name.setPlaceholderText("Nome do perfil")
        self.btn_refresh_devices = QPushButton("Recarregar HID")
        self.btn_refresh_devices.clicked.connect(self.refresh_devices)
        self.btn_save_profile = QPushButton("Salvar Perfil")
        self.btn_save_profile.clicked.connect(self.save_profile)
        self.btn_refresh_profiles = QPushButton("Atualizar Perfis")
        self.btn_refresh_profiles.clicked.connect(self.refresh_profiles)
        header.addWidget(self.profile_name)
        header.addWidget(self.btn_refresh_devices)
        header.addWidget(self.btn_save_profile)
        header.addWidget(self.btn_refresh_profiles)
        root_layout.addLayout(header)

        tabs = QTabWidget()
        root_layout.addWidget(tabs, 1)
        
        # Live tab with scroll
        live_tab_widget = QWidget()
        live_scroll = QScrollArea()
        live_scroll.setWidget(live_tab_widget)
        live_scroll.setWidgetResizable(True)
        tabs.addTab(live_scroll, "Live")
        
        # Stats tab with scroll
        stats_tab_widget = QWidget()
        stats_scroll = QScrollArea()
        stats_scroll.setWidget(stats_tab_widget)
        stats_scroll.setWidgetResizable(True)
        tabs.addTab(stats_scroll, "Stats")
        
        # Settings tab with scroll
        settings_tab_widget = QWidget()
        settings_scroll = QScrollArea()
        settings_scroll.setWidget(settings_tab_widget)
        settings_scroll.setWidgetResizable(True)
        tabs.addTab(settings_scroll, "Settings")
        
        self._build_live_tab(live_tab_widget)
        self._build_stats_tab(stats_tab_widget)
        self._build_settings_tab(settings_tab_widget)

        self.statusBar().showMessage("Pronto")

    def _build_live_tab(self, parent: QWidget) -> None:
        layout = QGridLayout(parent)
        controls = QGroupBox("Sessao")
        controls_layout = QFormLayout(controls)
        self.mode_combo = QComboBox()
        for label, mode_id in _mode_items():
            self.mode_combo.addItem(label, mode_id.value)
        self.mode_combo.currentIndexChanged.connect(self._mode_changed)
        self.btn_start = QPushButton("Iniciar")
        self.btn_start.clicked.connect(self.start_session)
        self.btn_stop = QPushButton("Encerrar")
        self.btn_stop.clicked.connect(self.stop_session)
        self.btn_stop.setEnabled(False)
        self.current_mode_label = QLabel("Nenhum")
        self.feedback_label = QLabel("Selecione um modo e inicie a sessao.")
        self.feedback_label.setWordWrap(True)
        controls_layout.addRow("Modo", self.mode_combo)
        controls_layout.addRow("Status", self.current_mode_label)
        controls_layout.addRow("Feedback", self.feedback_label)
        buttons_row = QHBoxLayout()
        buttons_row.addWidget(self.btn_start)
        buttons_row.addWidget(self.btn_stop)
        controls_layout.addRow(buttons_row)

        device_box = QGroupBox("Dispositivos")
        device_layout = QFormLayout(device_box)
        self.brake_device_combo = QComboBox()
        self.steer_device_combo = QComboBox()
        self.brake_axis_combo = QComboBox()
        self.steer_axis_combo = QComboBox()
        self.brake_invert = QCheckBox("Inverter")
        self.steer_invert = QCheckBox("Inverter")
        self.brake_min = QDoubleSpinBox()
        self.brake_max = QDoubleSpinBox()
        self.steer_min = QDoubleSpinBox()
        self.steer_max = QDoubleSpinBox()
        self.wheel_range = QDoubleSpinBox()
        for spin in [self.brake_min, self.brake_max, self.steer_min, self.steer_max]:
            spin.setDecimals(3)
            spin.setRange(-1.0, 1.0)
            spin.setSingleStep(0.05)
        self.brake_min.setValue(self.config.brake.raw_min)
        self.brake_max.setValue(self.config.brake.raw_max)
        self.steer_min.setValue(self.config.steering.raw_min)
        self.steer_max.setValue(self.config.steering.raw_max)
        self.wheel_range.setRange(180.0, 1080.0)
        self.wheel_range.setValue(self.config.wheel_range_deg)
        self.brake_invert.setChecked(self.config.brake.invert)
        self.steer_invert.setChecked(self.config.steering.invert)
        device_layout.addRow("Brake device", self.brake_device_combo)
        device_layout.addRow("Brake axis", self.brake_axis_combo)
        device_layout.addRow("Brake range min", self.brake_min)
        device_layout.addRow("Brake range max", self.brake_max)
        device_layout.addRow("Brake invert", self.brake_invert)
        device_layout.addRow("Steer device", self.steer_device_combo)
        device_layout.addRow("Steer axis", self.steer_axis_combo)
        device_layout.addRow("Steer range min", self.steer_min)
        device_layout.addRow("Steer range max", self.steer_max)
        device_layout.addRow("Steer invert", self.steer_invert)
        device_layout.addRow("Wheel range deg", self.wheel_range)

        self.brake_gauge = TelemetryGauge("Brake")
        self.steer_gauge = TelemetryGauge("Steering", suffix=" deg")
        self.score_card = StatCard("Score", "0")
        self.combo_card = StatCard("Combo", "0")
        self.target_card = StatCard("Target", "0")
        self.elapsed_card = StatCard("Elapsed", "0s")
        self.trend = TrendWidget("Recent Trend")
        self.history_log = QTextEdit()
        self.history_log.setReadOnly(True)
        self.history_log.setPlaceholderText("Historico da sessao")

        layout.addWidget(controls, 0, 0)
        layout.addWidget(device_box, 1, 0)
        right = QVBoxLayout()
        top_cards = QHBoxLayout()
        for card in [self.score_card, self.combo_card, self.target_card, self.elapsed_card]:
            top_cards.addWidget(card)
        right.addLayout(top_cards)
        right.addWidget(self.brake_gauge)
        right.addWidget(self.steer_gauge)
        right.addWidget(self.trend, 1)
        right.addWidget(self.history_log, 1)
        container = QWidget()
        container.setLayout(right)
        layout.addWidget(container, 0, 1, 2, 1)
        layout.setColumnStretch(1, 2)

        self.brake_device_combo.currentIndexChanged.connect(self._device_selection_changed)
        self.steer_device_combo.currentIndexChanged.connect(self._device_selection_changed)

    def _build_stats_tab(self, parent: QWidget) -> None:
        layout = QVBoxLayout(parent)
        cards = QHBoxLayout()
        self.total_sessions_card = StatCard("Total", "0")
        self.best_score_card = StatCard("Best", "0")
        self.weekly_avg_card = StatCard("Weekly", "0")
        self.monthly_avg_card = StatCard("Monthly", "0")
        for card in [self.total_sessions_card, self.best_score_card, self.weekly_avg_card, self.monthly_avg_card]:
            cards.addWidget(card)
        layout.addLayout(cards)
        self.sessions_table = QTableWidget(0, 7)
        self.sessions_table.setHorizontalHeaderLabels(
            ["Data", "Perfil", "Modo", "Score", "Duração", "Erro Médio", "Erro Máx"]
        )
        layout.addWidget(self.sessions_table, 1)
        buttons = QHBoxLayout()
        self.btn_export_csv = QPushButton("Exportar CSV")
        self.btn_export_json = QPushButton("Exportar JSON")
        self.btn_export_csv.clicked.connect(self.export_csv)
        self.btn_export_json.clicked.connect(self.export_json)
        buttons.addWidget(self.btn_export_csv)
        buttons.addWidget(self.btn_export_json)
        buttons.addStretch(1)
        layout.addLayout(buttons)

    def _build_settings_tab(self, parent: QWidget) -> None:
        layout = QVBoxLayout(parent)
        group = QGroupBox("Ajustes")
        form = QFormLayout(group)
        self.hold_tolerance = QDoubleSpinBox()
        self.hold_tolerance.setRange(0.5, 10.0)
        self.hold_tolerance.setValue(self.config.hold_tolerance_pct)
        self.hold_tolerance.setSingleStep(0.5)
        self.memory_show = QSpinBox()
        self.memory_show.setRange(250, 5000)
        self.memory_show.setValue(self.config.memory_show_ms)
        self.hold_time = QSpinBox()
        self.hold_time.setRange(500, 10000)
        self.hold_time.setValue(self.config.hold_time_ms)
        self.qualifying_duration = QSpinBox()
        self.qualifying_duration.setRange(30_000, 600_000)
        self.qualifying_duration.setValue(self.config.qualifying_duration_ms)
        form.addRow("Hold tolerance", self.hold_tolerance)
        form.addRow("Memory show ms", self.memory_show)
        form.addRow("Hold time ms", self.hold_time)
        form.addRow("Qualifying ms", self.qualifying_duration)
        layout.addWidget(group)
        self.profile_list = QComboBox()
        self.btn_load_profile = QPushButton("Carregar Perfil")
        self.btn_load_profile.clicked.connect(self.load_selected_profile)
        row = QHBoxLayout()
        row.addWidget(self.profile_list)
        row.addWidget(self.btn_load_profile)
        row.addStretch(1)
        layout.addLayout(row)
        self.settings_note = QLabel(
            "Os ajustes de raw min/max e invert permitem adaptar pedals DirectInput com ranges diferentes."
        )
        self.settings_note.setWordWrap(True)
        layout.addWidget(self.settings_note)
        layout.addStretch(1)

    def _apply_theme(self) -> None:
        self.setStyleSheet(
            """
            QWidget { background: #0b0f14; color: #e6eef8; font-family: "Segoe UI", "Inter", sans-serif; }
            QGroupBox {
                border: 1px solid #2a3240;
                border-radius: 12px;
                margin-top: 12px;
                padding: 10px;
                background: #10151d;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 12px;
                padding: 0 4px;
                color: #96a5ba;
            }
            QPushButton {
                background: #1d2633;
                border: 1px solid #334055;
                border-radius: 10px;
                padding: 8px 14px;
            }
            QPushButton:hover { background: #263244; }
            QPushButton:disabled { color: #647084; }
            QLineEdit, QComboBox, QDoubleSpinBox, QSpinBox, QTextEdit, QTableWidget {
                background: #0f1319;
                border: 1px solid #2a3240;
                border-radius: 10px;
                padding: 6px;
                selection-background-color: #55d6be;
            }
            QLabel#AppTitle { font-size: 26px; font-weight: 700; }
            QLabel#AppSubtitle { color: #9aa8bb; }
            QLabel#StatValue { font-size: 22px; font-weight: 700; }
            QFrame#StatCard {
                background: #111821;
                border: 1px solid #2a3240;
                border-radius: 14px;
            }
            """
        )

    def _mode_changed(self) -> None:
        if self.current_session is None:
            mode_id = ModeId(self.mode_combo.currentData())
            self.current_mode_label.setText(MODE_LABELS[mode_id])

    def _device_selection_changed(self) -> None:
        self._populate_axis_combos()
        self._sync_config_from_controls()

    def _populate_axis_combos(self) -> None:
        for combo in [self.brake_axis_combo, self.steer_axis_combo]:
            combo.blockSignals(True)
            combo.clear()
            combo.blockSignals(False)
        brake_device = self._current_device_from_combo(self.brake_device_combo)
        steer_device = self._current_device_from_combo(self.steer_device_combo)
        self._fill_axis_combo(self.brake_axis_combo, brake_device)
        self._fill_axis_combo(self.steer_axis_combo, steer_device)
        self.brake_axis_combo.setCurrentIndex(min(self.config.brake.axis_index, max(0, self.brake_axis_combo.count() - 1)))
        self.steer_axis_combo.setCurrentIndex(min(self.config.steering.axis_index, max(0, self.steer_axis_combo.count() - 1)))

    def _fill_axis_combo(self, combo: QComboBox, device: DetectedDevice | None) -> None:
        combo.blockSignals(True)
        combo.clear()
        axis_count = device.axes if device else 1
        for index in range(axis_count):
            combo.addItem(f"Axis {index}", index)
        combo.blockSignals(False)

    def _current_device_from_combo(self, combo: QComboBox) -> DetectedDevice | None:
        device_id = combo.currentData()
        for device in self.devices:
            if device.device_id == device_id:
                return device
        return self.devices[0] if self.devices else None

    def refresh_devices(self) -> None:
        try:
            self.devices = self.device_manager.refresh()
        except DeviceBackendUnavailable as exc:
            QMessageBox.warning(self, "HID indisponivel", str(exc))
            self.devices = []
        self._fill_device_combo(self.brake_device_combo, self.config.brake.device_id)
        self._fill_device_combo(self.steer_device_combo, self.config.steering.device_id)
        self._populate_axis_combos()
        if self.devices:
            self.btn_start.setEnabled(True)
            self.statusBar().showMessage(f"{len(self.devices)} dispositivo(s) encontrado(s).")
        else:
            self.btn_start.setEnabled(False)
            self.statusBar().showMessage("Nenhum dispositivo HID encontrado.")

    def _fill_device_combo(self, combo: QComboBox, preferred_device_id: str) -> None:
        combo.blockSignals(True)
        combo.clear()
        for device in self.devices:
            combo.addItem(f"{device.name} ({device.axes} axes)", device.device_id)
        if combo.count():
            index = combo.findData(preferred_device_id)
            combo.setCurrentIndex(index if index >= 0 else 0)
        combo.blockSignals(False)

    def refresh_profiles(self) -> None:
        self.profile_list.blockSignals(True)
        self.profile_list.clear()
        profiles = self.db.list_profiles()
        if self.config.profile_name not in profiles:
            self.db.upsert_profile(self.config)
            profiles = self.db.list_profiles()
        self.profile_list.addItems(profiles)
        index = self.profile_list.findText(self.config.profile_name)
        if index >= 0:
            self.profile_list.setCurrentIndex(index)
        self.profile_list.blockSignals(False)
        self.refresh_stats()

    def load_selected_profile(self) -> None:
        name = self.profile_list.currentText().strip()
        if not name:
            return
        profile = self.db.load_profile(name)
        if profile is None:
            return
        self.config = profile
        self._loading_controls = True
        self.profile_name.setText(profile.profile_name)
        self.hold_tolerance.setValue(profile.hold_tolerance_pct)
        self.memory_show.setValue(profile.memory_show_ms)
        self.hold_time.setValue(profile.hold_time_ms)
        self.qualifying_duration.setValue(profile.qualifying_duration_ms)
        self.brake_min.setValue(profile.brake.raw_min)
        self.brake_max.setValue(profile.brake.raw_max)
        self.steer_min.setValue(profile.steering.raw_min)
        self.steer_max.setValue(profile.steering.raw_max)
        self.brake_invert.setChecked(profile.brake.invert)
        self.steer_invert.setChecked(profile.steering.invert)
        self.wheel_range.setValue(profile.wheel_range_deg)
        self._fill_device_combo(self.brake_device_combo, profile.brake.device_id)
        self._fill_device_combo(self.steer_device_combo, profile.steering.device_id)
        self._populate_axis_combos()
        self._loading_controls = False
        self.statusBar().showMessage(f"Perfil {name} carregado.")

    def save_profile(self) -> None:
        self._sync_config_from_controls()
        self.db.upsert_profile(self.config)
        self.refresh_profiles()
        self.statusBar().showMessage(f"Perfil {self.config.profile_name} salvo.")

    def _sync_config_from_controls(self) -> None:
        if self._loading_controls:
            return
        self.config.profile_name = self.profile_name.text().strip() or "Default"
        brake_device = self._current_device_from_combo(self.brake_device_combo)
        steer_device = self._current_device_from_combo(self.steer_device_combo)
        self.config.brake.device_id = brake_device.device_id if brake_device else ""
        self.config.brake.device_name = brake_device.name if brake_device else ""
        self.config.brake.axis_index = int(self.brake_axis_combo.currentData() or 0)
        self.config.brake.raw_min = self.brake_min.value()
        self.config.brake.raw_max = self.brake_max.value()
        self.config.brake.invert = self.brake_invert.isChecked()
        self.config.steering.device_id = steer_device.device_id if steer_device else ""
        self.config.steering.device_name = steer_device.name if steer_device else ""
        self.config.steering.axis_index = int(self.steer_axis_combo.currentData() or 0)
        self.config.steering.raw_min = self.steer_min.value()
        self.config.steering.raw_max = self.steer_max.value()
        self.config.steering.invert = self.steer_invert.isChecked()
        self.config.wheel_range_deg = self.wheel_range.value()
        self.config.hold_tolerance_pct = self.hold_tolerance.value()
        self.config.memory_show_ms = self.memory_show.value()
        self.config.hold_time_ms = self.hold_time.value()
        self.config.qualifying_duration_ms = self.qualifying_duration.value()

    def start_session(self) -> None:
        self._sync_config_from_controls()
        mode_id = ModeId(self.mode_combo.currentData())
        self.current_session = TrainingSession(self.config, mode_id)
        self.btn_start.setEnabled(False)
        self.btn_stop.setEnabled(True)
        self.current_mode_label.setText(MODE_LABELS[mode_id])
        self.history_log.clear()
        self.brake_gauge.set_state(0.0, 0.0, "Sessao ativa")
        self.steer_gauge.set_state(0.0, 0.0, "Sessao ativa")
        self.feedback_label.setText("Sessao iniciada.")

    def stop_session(self) -> None:
        if self.current_session is None:
            return
        self._finalize_current_session()
        self.current_session = None
        self.btn_start.setEnabled(True)
        self.btn_stop.setEnabled(False)
        self.feedback_label.setText("Sessao encerrada.")

    def _finalize_current_session(self) -> None:
        assert self.current_session is not None
        samples = self.current_session.samples()
        if not samples:
            return
        brake_peak = max(sample.brake_pct for sample in samples)
        steering_peak = max(abs(sample.steering_deg) for sample in samples)
        avg_error = mean(sample.error_pct for sample in samples)
        max_error = max(sample.error_pct for sample in samples)
        summary = SessionSummary(
            profile_name=self.config.profile_name,
            mode_id=self.current_session.mode_id.value,
            mode_label=MODE_LABELS[self.current_session.mode_id],
            started_at=self.current_session.exercise.started_at,
            duration_ms=samples[-1].t_ms,
            score=samples[-1].score,
            brake_peak_pct=brake_peak,
            steering_peak_deg=steering_peak,
            avg_error_pct=avg_error,
            max_error_pct=max_error,
            notes=self.current_session.exercise.feedback,
        )
        self.db.save_session(summary, samples)
        self.refresh_stats()
        self.refresh_profiles()

    def _read_input(self) -> tuple[float, float]:
        self._sync_config_from_controls()
        live = self.device_manager.read_input(
            self.config.brake,
            self.config.steering,
            self.config.wheel_range_deg,
        )
        return live.brake_pct, live.steering_angle_deg

    def tick(self) -> None:
        brake_pct, steering_deg = self._read_input()
        self.brake_gauge.set_state(brake_pct, self.current_target_pct(), f"{self.config.brake.device_name or 'Brake'}")
        self.steer_gauge.set_state(steering_deg, 0.0, f"{self.config.steering.device_name or 'Steering'}")
        if self.current_session is None:
            self.score_card.set_value("0")
            self.combo_card.set_value("0")
            self.target_card.set_value("0")
            self.elapsed_card.set_value("0s")
            return
        now = datetime.now(timezone.utc)
        dt_ms = max(16, int((now - self.last_tick).total_seconds() * 1000))
        self.last_tick = now
        outcome = self.current_session.step(brake_pct, steering_deg, dt_ms)
        status = outcome.status
        self.current_mode_label.setText(f"{status.title} - {MODE_LABELS[status.mode_id]}")
        self.feedback_label.setText(status.feedback)
        self.score_card.set_value(f"{status.score:.1f}")
        self.combo_card.set_value(str(status.combo))
        self.target_card.set_value(f"{status.target_pct:.0f}%")
        seconds = status.elapsed_ms // 1000
        self.elapsed_card.set_value(f"{seconds}s")
        self.trend.push(brake_pct, status.target_pct, status.score)
        self.history_log.append(
            f"{status.elapsed_ms:06d}ms | brake {brake_pct:05.1f}% | steer {steering_deg:06.1f}deg | target {status.target_pct:05.1f}% | score {status.score:05.1f}"
        )
        if outcome.completed:
            self.stop_session()

    def current_target_pct(self) -> float:
        if self.current_session is None:
            return 0.0
        if not self.current_session.exercise.history:
            return 0.0
        return self.current_session.exercise.history[-1].target_pct

    def refresh_stats(self) -> None:
        summary = self.db.stats_summary()
        self.total_sessions_card.set_value(str(int(summary["total_sessions"])))
        self.best_score_card.set_value(f'{summary["best_score"]:.1f}')
        self.weekly_avg_card.set_value(f'{summary["weekly_average"]:.1f}')
        self.monthly_avg_card.set_value(f'{summary["monthly_average"]:.1f}')
        rows = self.db.recent_sessions(limit=200)
        self.sessions_table.setRowCount(len(rows))
        for row_index, row in enumerate(rows):
            values = [
                row["started_at"].split("T")[0],
                row["profile_name"],
                row["mode_label"],
                f'{row["score"]:.1f}',
                f'{row["duration_ms"] / 1000.0:.1f}s',
                f'{row["avg_error_pct"]:.1f}',
                f'{row["max_error_pct"]:.1f}',
            ]
            for col_index, value in enumerate(values):
                self.sessions_table.setItem(row_index, col_index, QTableWidgetItem(value))

    def export_csv(self) -> None:
        path, _ = QFileDialog.getSaveFileName(self, "Exportar CSV", str(export_dir() / "sessions.csv"), "CSV (*.csv)")
        if not path:
            return
        self.db.export_csv(Path(path))
        self.statusBar().showMessage(f"CSV exportado em {path}")

    def export_json(self) -> None:
        path, _ = QFileDialog.getSaveFileName(self, "Exportar JSON", str(export_dir() / "sessions.json"), "JSON (*.json)")
        if not path:
            return
        self.db.export_json(Path(path))
        self.statusBar().showMessage(f"JSON exportado em {path}")

