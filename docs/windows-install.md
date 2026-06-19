# Instalacao Windows 11

## Requisitos

- Python 3.12
- Windows 11
- Drivers do volante/pedais instalados e reconhecidos como DirectInput

## Passos

1. Criar ambiente virtual.
2. Instalar dependencias do projeto.
3. Executar `brake-trainer-pro`.

## Exemplo

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -U pip
pip install -e .
python -m brake_trainer_pro.main
```

## Observacoes de HID

- Alguns pedais reportam o eixo em `0..1`
- Outros usam `-1..1`
- A tela de Settings permite ajustar `raw min`, `raw max` e `invert`

