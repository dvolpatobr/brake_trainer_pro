# Brake Trainer Pro

Treinador local de frenagem para sim racing com suporte a HID/DirectInput, foco em:

- leitura de brake axis e steering wheel angle
- modos de treino para memória muscular, modulação e trail braking
- persistência em SQLite
- perfis e exportação CSV/JSON
- interface moderna em PyQt6

## Execucao

```bash
python -m brake_trainer_pro
```

## Estrutura

- `src/brake_trainer_pro/`
- `tests/`
- `build/` para empacotamento com PyInstaller

## Observacao

Esta primeira entrega prioriza uma base funcional e extensivel. A leitura de HID e o motor de treino ja estao prontos para evoluir com calibração fina por dispositivo.
