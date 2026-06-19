# Windows 11 Build Flow

## O que gera

- pasta executavel em `dist\\BrakeTrainerPro\\`
- instalador Inno Setup em `dist\\installer\\BrakeTrainerPro-Setup.exe`

## Requisitos

- Windows 11 x64
- Python 3.12 x64
- Inno Setup 6

## Comandos

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\windows\build_release.ps1
```

## O que o script faz

1. Atualiza `pip`.
2. Instala o projeto em modo editavel.
3. Instala `PyInstaller`.
4. Gera a pasta do app com PyInstaller.
5. Se `ISCC.exe` estiver disponivel, compila o instalador.

## Observacoes

- O build usa `build\\brake_trainer_pro.spec`.
- O instalador assume que o bundle do PyInstaller ja existe em `dist\\BrakeTrainerPro`.
- Para CI, a mesma pipeline pode rodar em `windows-latest` com o Inno Setup instalado via `choco`.

