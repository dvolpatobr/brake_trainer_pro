# Guia de Inicialização - Brake Trainer Pro

Este documento descreve o procedimento passo a passo para configurar e executar o projeto Brake Trainer Pro. Instruções específicas para **Windows 11**.

## Pré-requisitos

- **Python 3.9+** (3.12+ recomendado) - [Download Python](https://www.python.org/downloads/)
- **Git** - [Download Git for Windows](https://git-scm.com/download/win)
- **Terminal**: PowerShell ou Command Prompt (recomendado: PowerShell)
- **Acesso à internet** para clonar repositório e baixar dependências

### Verificar Instalação

Abra o PowerShell e verifique se Python está instalado:

```powershell
python --version
git --version
```

## Passo 1: Clonar o Repositório

Abra o PowerShell e execute:

```powershell
git clone https://github.com/dvolpatobr/brake_trainer_pro.git
cd brake_trainer_pro
```

## Passo 2: Criar um Ambiente Virtual (venv)

**IMPORTANTE**: Se receber erro de permissão ao executar scripts, abra o PowerShell como **Administrador**.

```powershell
# Criar o ambiente virtual
python -m venv venv

# Ativar o ambiente virtual
venv\Scripts\Activate
```

**Você saberá que o ambiente está ativado quando verá `(venv)` no seu prompt:**

```
(venv) PS C:\Users\seu_usuario\brake_trainer_pro>
```

### Solução: Erro de Execução de Script

Se receber erro: `cannot be loaded because running scripts is disabled on this system`

Execute como administrador:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
# Digite 'Y' para confirmar
```

Depois tente ativar novamente.

## Passo 3: Atualizar pip e Ferramentas de Build

Com o ambiente virtual ativado:

```powershell
python -m pip install --upgrade pip setuptools wheel
```

Isso pode levar alguns minutos na primeira vez.

## Passo 4: Instalar Dependências do Projeto

Com o venv ativado, instale o projeto em modo editável:

```powershell
pip install -e .
```

Este comando instalará:
- **PyQt6** (>=6.7) - Interface gráfica moderna
- **pygame-ce** (>=2.5.6) - Suporte a HID/DirectInput para joysticks e pedais

### Monitorar a Instalação

A instalação deve exibir algo como:

```
Collecting PyQt6>=6.7
Collecting pygame>=2.6
...
Successfully installed PyQt6-6.10.2 pygame-2.6.1 brake-trainer-pro-0.1.0
```

Se houver erros, veja a seção **Solução de Problemas**.

## Passo 5: Executar a Aplicação

Com o venv ativado, execute:

```powershell
brake-trainer-pro
```

**Ou alternativamente:**

```powershell
python -m brake_trainer_pro
```

A janela principal da aplicação deve aparecer em alguns segundos.

### Versão web local
Para testar o protótipo web em Chrome/Edge no próprio computador, execute um servidor local a partir da raiz do projeto:

```powershell
python -m http.server 8000
```

Em seguida, abra no navegador:

```text
http://localhost:8000/web/index.html
```

O WebHID funciona em HTTPS ou local host no Chrome/Edge.

## Desativar o Ambiente Virtual

Quando terminar com o desenvolvimento:

```powershell
deactivate
```

O `(venv)` desaparecerá do seu prompt.

## Próximas Vezes

Para executar novamente no futuro:

```powershell
cd C:\caminho\para\brake_trainer_pro
venv\Scripts\Activate
brake-trainer-pro
```

## Solução de Problemas - Windows 11

### ❌ Erro: "Python is not recognized"

**Solução**: Python não está no PATH do Windows

1. Abra: `Configurações > Variáveis de Ambiente`
2. Adicione o caminho Python (ex: `C:\Users\seu_usuario\AppData\Local\Programs\Python\Python312`)
3. Reinicie o PowerShell

Ou reinstale Python marcando **"Add Python to PATH"** durante a instalação.

### ❌ Erro: "cannot be loaded because running scripts is disabled"

Execute como administrador:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### ❌ Erro: "Python version X.Y not in '>=3.12'"

Se usar Python 3.9, edite `pyproject.toml`:

```toml
requires-python = ">=3.9"
```

Depois reinstale:

```powershell
pip install -e . --no-cache-dir
```

### ❌ Erro: "PyQt6 installation failed"

Tente instalar novamente com:

```powershell
pip install --no-cache-dir PyQt6>=6.7
```

Se persistir, garanta que tem Visual C++ Redistributable instalado:
[Download Visual C++ Redistributable](https://support.microsoft.com/en-us/help/2977003)

### ❌ Erro: "Failed to build wheel"

Limpe o cache e tente novamente:

```powershell
pip cache purge
pip install -e .
```

### ⚠️ Aviso: Fonte "Segoe UI" não encontrada

Isso é apenas um aviso visual e não afeta a funcionalidade. Você pode ignorá-lo.

## Documentação Adicional

- [Estrutura do Projeto](docs/structure.md)
- [Arquitetura da Aplicação](docs/architecture.md)
- [Build para Windows 11](docs/windows-build.md)
- [Empacotamento e Instalação](docs/packaging.md)

## Executar Testes

Para validar a instalação, execute os testes:

```powershell
pip install pytest
pytest tests/
```

## Build para Distribuição (Windows 11)

Para criar um executável `.exe` para distribuir:

```powershell
pip install pyinstaller
python scripts/windows/build_release.ps1
```

Veja [docs/windows-build.md](docs/windows-build.md) para detalhes completos.

## Suporte e Contribuição

Para problemas não listados:

1. Verifique [GitHub Issues](https://github.com/dvolpatobr/brake_trainer_pro/issues)
2. Abra uma nova issue com detalhes do erro
3. Inclua a saída de: `python --version` e `pip --version`

---

**Última atualização**: 2026-06-20
