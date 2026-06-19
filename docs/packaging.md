# Empacotamento com PyInstaller

## Build

```powershell
pip install pyinstaller
pyinstaller build\brake_trainer_pro.spec
```

## Saida

O executavel final sera gerado em `dist/BrakeTrainerPro/`.

## Atualizacao futura

O arquivo `update_checker.py` ja usa um manifest JSON remoto simples:

```json
{
  "version": "0.2.0",
  "download_url": "https://...",
  "release_notes": "..."
}
```

