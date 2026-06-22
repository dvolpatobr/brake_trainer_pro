# Arquitetura Brake Trainer Pro

## Objetivo

Aplicacao desktop local para treinar frenagem em simuladores, com leitura de HID/DirectInput, perfis salvos em JSON + SQLite e motor de treino orientado a exercicios.

## Camadas

### 1. Entrada de hardware

- `DeviceManager` enumera joysticks e eixos via `pygame`
- `AxisBinding` define dispositivo, eixo, range bruto, inversao e deadzone
- `LiveInput` normaliza brake e steering para a aplicacao

### 2. Dominio de treino

- `TrainingSession` encapsula um modo
- cada modo possui uma classe propria em `training.py`
- os modos produzem `ExerciseStatus` e `SamplePoint`

### 3. Persistencia

- `ConfigStore` salva o estado atual em JSON
- `Database` grava perfis, sessoes e samples em SQLite
- exportacao em CSV e JSON eh suportada diretamente

### 4. Interface

- `MainWindow` organiza Live, Stats e Settings
- gauges e charts sao widgets customizados em Qt
- a UI nao conhece detalhes de hardware alem das bindings

## Fluxo

1. A UI carrega a configuracao atual.
2. O `DeviceManager` enumera os dispositivos conectados.
3. O usuario escolhe brake e steering.
4. A sessao inicia com um `ModeId`.
5. A cada tick, o app lê o input, atualiza o modo e renderiza score/feedback.
6. Ao finalizar, a sessao e persistida no SQLite.

## Extensao futura

- calibração assistida por dispositivo
- telemetria de simuladores via UDP/shared memory
- ranking local e cloud sync
- atualizador com manifest remoto assinado

## Protótipo Web

- `web/` contém uma versão estática para Chrome/Edge com WebHID.
- desafios são salvos em `localStorage` no navegador.
- o protótipo funciona em HTTPS ou localhost, sem backend.
- limitações: suporte HID genérico, dependência de navegador, sem calibração nativa e sem sincronização entre dispositivos.

