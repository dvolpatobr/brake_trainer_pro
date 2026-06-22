# Brake Trainer Pro

Treinador local de frenagem para sim racing com suporte a HID/DirectInput e uma versão web protótipo.

- leitura de brake axis e steering wheel angle
- modos de treino para memória muscular, modulação e trail braking
- persistência em SQLite para a versão desktop
- protótipo web para Chrome/Edge usando WebHID e localStorage
- interface moderna em PyQt6 para desktop

## Execução

### Desktop
```bash
python -m brake_trainer_pro
```

### Web
Abra `web/index.html` em um servidor local com HTTPS/localhost ou publique em GitHub Pages.

## Build Windows 11

Veja [docs/windows-build.md](docs/windows-build.md) para o fluxo completo de empacotamento com PyInstaller e Inno Setup.

## Estrutura

- `src/brake_trainer_pro/`
- `tests/`
- `web/` para o protótipo do Brake Trainer Pro em HTML/CSS/JS
- `build/` para empacotamento com PyInstaller

## Observação

A versão principal da aplicação segue como desktop PyQt6. O diretório `web/` contém um protótipo estático para Chrome/Edge com WebHID, persistindo desafios no localStorage e publicável via GitHub Pages.
