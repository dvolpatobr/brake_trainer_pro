from __future__ import annotations

import sys


def main() -> int:
    try:
        from PyQt6.QtWidgets import QApplication
    except Exception as exc:  # pragma: no cover - runtime guard
        print("PyQt6 nao esta instalado:", exc)
        return 1

    from .ui.main_window import MainWindow

    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())

