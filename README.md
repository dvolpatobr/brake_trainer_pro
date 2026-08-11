# Brake Trainer Pro

Treinador web de frenagem para sim racing, feito para Chrome e Edge com WebHID e armazenamento local.

- leitura de brake axis e steering wheel angle
- leitura de brake, steering e throttle com seleção por eixo
- modos de treino para memória muscular, modulação e trail braking
- desafios locais de brake precision, trail braking e input synchronization
- carteira de piloto com notas por habilidade sem backend
- persistência em `localStorage`
- interface web em HTML/CSS/JavaScript

## Execução local

Sirva a pasta raiz com um servidor local:

```bash
python3 -m http.server 8000
```

Depois abra:

```text
http://localhost:8000/web/index.html
```

## Publicação

O fluxo de deploy para GitHub Pages está em [`.github/workflows/web-pages.yml`](.github/workflows/web-pages.yml).

## Estrutura

- `web/` para a aplicação web
- `.github/workflows/` para o deploy automatizado

## Observação

A versão do repositório agora é somente web. O foco é o uso no navegador com WebHID.

## Versionamento

- O label visível no rodapé de todas as páginas é controlado por `APP_VERSION` em [`web/app.js`](web/app.js).
- Sempre que qualquer alteração for feita neste repositório, incremente esse label antes de finalizar a mudança.
