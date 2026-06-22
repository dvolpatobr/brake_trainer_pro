# Guia de Inicialização - macOS/Linux

Se você está em **macOS ou Linux**, use este guia em vez do padrão (que é focado em Windows 11).

## Pré-requisitos

- **Python 3.9+** (3.12+ recomendado)
- **Git**
- **Gerenciador de pacotes**: brew (macOS) ou apt/dnf (Linux)

### Verificar Instalação

```bash
python3 --version
git --version
```

## Passo 1: Clonar o Repositório

```bash
git clone https://github.com/dvolpatobr/brake_trainer_pro.git
cd brake_trainer_pro
```

## Passo 2: Criar um Ambiente Virtual (venv)

```bash
# Criar o ambiente virtual
python3 -m venv venv

# Ativar o ambiente virtual
source venv/bin/activate
```

Você saberá que o ambiente está ativado quando `(venv)` aparecer no seu prompt.

## Passo 3: Atualizar pip e Ferramentas de Build

Com o venv ativado:

```bash
pip install --upgrade pip setuptools wheel
```

## Passo 4: Instalar Dependências

```bash
pip install -e .
```

Este comando instalará:
- **PyQt6** (>=6.7) - Interface gráfica
- **pygame-ce** (>=2.5.6) - Suporte a HID/DirectInput

## Passo 5: Executar a Aplicação

Com o venv ativado:

```bash
brake-trainer-pro
```

Ou:

```bash
python -m brake_trainer_pro
```

### Versão web local
Para testar o protótipo web em Chrome/Edge no próprio computador, execute um servidor local a partir da raiz do projeto:

```bash
python3 -m http.server 8000
```

Depois abra:

```text
http://localhost:8000/web/index.html
```

## Desativar o Ambiente Virtual

Quando terminar:

```bash
deactivate
```

## Solução de Problemas

### ❌ Erro: "Python 3.9+ não encontrado"

**macOS com Homebrew:**
```bash
brew install python@3.12
python3.12 -m venv venv
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install python3.12 python3.12-venv
python3.12 -m venv venv
```

### ❌ Erro: "PyQt6 installation failed"

Instale as dependências de sistema primeiro:

**macOS:**
```bash
brew install qt6
```

**Ubuntu/Debian:**
```bash
sudo apt install libqt6core6 libqt6gui6
```

Depois tente novamente:
```bash
pip install -e .
```

### ❌ Erro: "pygame compilation failed"

Instale as bibliotecas SDL necessárias:

**macOS:**
```bash
brew install sdl2 sdl2_image sdl2_mixer sdl2_ttf
```

**Ubuntu/Debian:**
```bash
sudo apt install libsdl2-dev libsdl2-image-dev libsdl2-mixer-dev libsdl2-ttf-dev
```

Depois tente novamente:
```bash
pip install pygame --no-cache-dir
```

## Executar Testes

```bash
pip install pytest
pytest tests/
```

## Build para Distribuição (macOS)

Para criar um app bundle:

```bash
pip install pyinstaller
pyinstaller src/brake_trainer_pro/__main__.py --onefile --windowed
```

## Próximos Passos

- Para detalhes sobre Windows, veja [GETTING_STARTED.md](GETTING_STARTED.md)
- Consulte [docs/](docs/) para documentação completa
- Veja [docs/windows-build.md](docs/windows-build.md) para build Windows

---

**Última atualização**: 2026-06-20
