# Guia de Inicialização - Brake Trainer Pro

Este documento descreve o procedimento passo a passo para configurar e executar o projeto Brake Trainer Pro em sua máquina local.

## Pré-requisitos

- **Python 3.9+** (3.12+ recomendado)
- **Git**
- **pip** (gerenciador de pacotes Python)

Verifique se você tem Python instalado:

```bash
python3 --version
```

## Passo 1: Clonar o Repositório

Clone o repositório do projeto para sua máquina:

```bash
git clone https://github.com/dvolpatobr/brake_trainer_pro.git
cd brake_trainer_pro
```

## Passo 2: Criar um Ambiente Virtual (venv)

Um ambiente virtual isolado evita conflitos de dependências com outros projetos Python.

### macOS/Linux:

```bash
python3 -m venv venv
source venv/bin/activate
```

### Windows:

```bash
python -m venv venv
venv\Scripts\activate
```

Você saberá que o ambiente está ativado quando o nome `(venv)` aparecer no seu prompt.

## Passo 3: Atualizar pip e Ferramentas de Build

Com o ambiente virtual ativado, atualize pip, setuptools e wheel:

```bash
pip install --upgrade pip setuptools wheel
```

## Passo 4: Instalar Dependências

Instale o projeto e todas as suas dependências em modo editable:

```bash
pip install -e .
```

Este comando vai instalar:
- **PyQt6** (>=6.7) - Interface gráfica
- **pygame** (>=2.6) - Suporte a eventos HID/DirectInput

## Passo 5: Executar a Aplicação

Com o ambiente virtual ativado, execute a aplicação:

```bash
brake-trainer-pro
```

Ou alternativamente:

```bash
python -m brake_trainer_pro
```

A janela principal da aplicação deve aparecer.

## Desativar o Ambiente Virtual

Quando terminar, desative o ambiente virtual:

```bash
deactivate
```

## Solução de Problemas

### Erro: "Python version X.Y not in '>=3.12'"

Se você receber um erro sobre versão Python insuficiente, ajuste `pyproject.toml`:

```toml
requires-python = ">=3.9"  # Ajuste conforme sua versão
```

### Erro: "PyQt6 não está instalado"

Garanta que a instalação completa foi feita:

```bash
pip install -e . --no-cache-dir
```

### Erro de permissão no Windows

Se receber erro de permissão ao ativar o venv, execute o PowerShell como administrador.

## Próximos Passos

1. Consulte [docs/structure.md](docs/structure.md) para entender a arquitetura do projeto
2. Veja [docs/architecture.md](docs/architecture.md) para detalhes sobre os componentes principais
3. Para compilar para Windows, consulte [docs/windows-build.md](docs/windows-build.md)

## Executar Testes

Se deseja executar os testes do projeto:

```bash
pip install pytest
pytest tests/
```

## Build para Distribuição

Para criar um executável standalone para Windows:

```bash
pip install pyinstaller
python scripts/windows/build_release.ps1
```

Veja [docs/windows-build.md](docs/windows-build.md) para instruções detalhadas.
