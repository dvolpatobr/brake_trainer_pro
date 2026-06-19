from __future__ import annotations

from collections import deque

from PyQt6.QtCore import Qt, QRectF, QSize
from PyQt6.QtGui import QColor, QPainter, QPen, QFont
from PyQt6.QtWidgets import QWidget, QVBoxLayout, QLabel, QFrame


class StatCard(QFrame):
    def __init__(self, title: str, value: str = "0") -> None:
        super().__init__()
        self.setObjectName("StatCard")
        self.title_label = QLabel(title)
        self.value_label = QLabel(value)
        self.value_label.setObjectName("StatValue")
        self.value_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout = QVBoxLayout(self)
        layout.addWidget(self.title_label)
        layout.addWidget(self.value_label)
        self.setMinimumHeight(88)

    def set_value(self, value: str) -> None:
        self.value_label.setText(value)


class TelemetryGauge(QWidget):
    def __init__(self, title: str, suffix: str = "%") -> None:
        super().__init__()
        self.title = title
        self.suffix = suffix
        self.value = 0.0
        self.target = 0.0
        self.subtext = ""
        self.setMinimumSize(QSize(240, 240))

    def set_state(self, value: float, target: float = 0.0, subtext: str = "") -> None:
        self.value = value
        self.target = target
        self.subtext = subtext
        self.update()

    def paintEvent(self, event) -> None:  # noqa: N802
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        rect = self.rect().adjusted(12, 12, -12, -12)
        painter.fillRect(self.rect(), QColor("#10141d"))
        painter.setPen(QPen(QColor("#2b3240"), 2))
        painter.setBrush(QColor("#141a24"))
        painter.drawRoundedRect(rect, 18, 18)
        painter.setPen(QColor("#d6deea"))
        font = QFont()
        font.setPointSize(11)
        font.setBold(True)
        painter.setFont(font)
        painter.drawText(rect.adjusted(12, 10, -12, -rect.height() + 44), Qt.AlignmentFlag.AlignHCenter, self.title)
        center_x = rect.center().x()
        center_y = rect.bottom() - 24
        radius = min(rect.width(), rect.height()) * 0.38
        arc_rect = QRectF(center_x - radius, center_y - radius, radius * 2, radius * 2)
        painter.setPen(QPen(QColor("#243041"), 14))
        painter.drawArc(arc_rect, 210 * 16, 120 * 16)
        active_pen = QPen(QColor("#55d6be"), 14)
        painter.setPen(active_pen)
        painter.drawArc(arc_rect, 210 * 16, int(max(0.0, min(120.0, self.value / 100.0 * 120.0)) * 16))
        painter.setPen(QPen(QColor("#ffb347"), 8))
        painter.drawArc(arc_rect, int((210 + max(0.0, min(120.0, self.target / 100.0 * 120.0))) * 16), 2)
        angle = 210 + (self.value / 100.0) * 120.0
        radians = angle * 3.14159265 / 180.0
        needle_x = center_x + radius * 0.9 * __import__("math").cos(radians)
        needle_y = center_y + radius * 0.9 * __import__("math").sin(radians)
        painter.setPen(QPen(QColor("#eaf0f8"), 4))
        painter.drawLine(center_x, center_y, int(needle_x), int(needle_y))
        painter.setBrush(QColor("#eaf0f8"))
        painter.drawEllipse(center_x - 6, center_y - 6, 12, 12)
        font.setPointSize(24)
        font.setBold(True)
        painter.setFont(font)
        painter.setPen(QColor("#ffffff"))
        painter.drawText(rect.adjusted(0, 44, 0, -36), Qt.AlignmentFlag.AlignHCenter, f"{self.value:.0f}{self.suffix}")
        if self.subtext:
            font.setPointSize(9)
            font.setBold(False)
            painter.setFont(font)
            painter.setPen(QColor("#9aa8bb"))
            painter.drawText(rect.adjusted(12, 0, -12, -12), Qt.AlignmentFlag.AlignBottom | Qt.AlignmentFlag.AlignHCenter, self.subtext)


class TrendWidget(QWidget):
    def __init__(self, title: str) -> None:
        super().__init__()
        self.title = title
        self.series_brake: deque[float] = deque(maxlen=180)
        self.series_target: deque[float] = deque(maxlen=180)
        self.series_score: deque[float] = deque(maxlen=180)
        self.setMinimumHeight(180)

    def push(self, brake: float, target: float, score: float) -> None:
        self.series_brake.append(brake)
        self.series_target.append(target)
        self.series_score.append(score)
        self.update()

    def paintEvent(self, event) -> None:  # noqa: N802
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        rect = self.rect().adjusted(10, 10, -10, -10)
        painter.fillRect(self.rect(), QColor("#0f131a"))
        painter.setPen(QPen(QColor("#2b3240"), 2))
        painter.setBrush(QColor("#141a24"))
        painter.drawRoundedRect(rect, 16, 16)
        painter.setPen(QColor("#d6deea"))
        painter.drawText(rect.adjusted(12, 10, -12, -rect.height() + 32), Qt.AlignmentFlag.AlignLeft, self.title)
        if not self.series_brake:
            return
        import math

        def draw_line(series: deque[float], color: str, scale: float) -> None:
            painter.setPen(QPen(QColor(color), 2))
            points = list(series)
            if len(points) < 2:
                return
            x_step = rect.width() / max(1, len(points) - 1)
            prev_x = rect.left()
            prev_y = rect.bottom() - (points[0] / scale) * (rect.height() - 36) - 12
            for index, value in enumerate(points[1:], start=1):
                x = rect.left() + index * x_step
                y = rect.bottom() - (value / scale) * (rect.height() - 36) - 12
                painter.drawLine(int(prev_x), int(prev_y), int(x), int(y))
                prev_x, prev_y = x, y

        draw_line(self.series_target, "#ffb347", 100.0)
        draw_line(self.series_brake, "#55d6be", 100.0)
        draw_line(self.series_score, "#9cdbff", 100.0)

