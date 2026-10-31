# Harpa Laser 🎹

Um instrumento de síntese de áudio para o navegador, modelado no som da
**harpa laser** do Elka Synthex (o célebre Preset 46, popularizado por
Jean-Michel Jarre). Toca com o teclado do computador, com o toque na tela, e
roda leve até no navegador de um Raspberry Pi.

> Feito para levar a festivais de tecnologia: fácil de tocar para quem nunca
> encostou num sintetizador, e gostoso para quem sabe.

**Projeto de [Mauricio Jabur — MauMaker](https://github.com/maujabur). Construído com [Kiro](https://kiro.dev).**

🔗 **Toque agora:** https://maujabur.github.io/laser-harp/

---

## O que ela faz

- **Até 12 teclas** (combinando com harpas físicas de 10 e 12 feixes),
  tocáveis pelo teclado do computador (Z X C V B N M , . / A S) ou por
  toque/mouse. O número de teclas e de vozes é
  [configurável pela URL](#teclas-e-vozes-pela-url).
- **Escalas "perdoadoras"** — pentatônicas por padrão, para que qualquer
  combinação de notas soe bem mesmo para quem não é músico. Maior e dórico
  como tempero.
- **Nota base configurável** — escolha a nota da 1ª tecla; as outras seguem a
  escala subindo.
- **Síntese dual-oscilador** com o caráter da harpa laser: dois osciladores,
  pitch sweep (o "poinnn"), PWM por LFO, e uma cadeia de chorus.
- **Controles em tempo real**: forma de onda por oscilador, intervalo entre
  osciladores, glide, filtro com *key tracking*, ressonância, chorus, sweep,
  mix e envelope ADSR completo.
- **Presets de "vibe"**: de fábrica, de uma coleção web, e os seus próprios.
- **Save geral**: a última configuração é lembrada e restaurada ao abrir.
- **Import/export** de vibes em arquivo `.harpa.json` — leve suas vibes num
  pen drive entre máquinas.
- **Volume** com atalho de teclado (↑ / ↓) e persistência.

## Como tocar

1. Abra a página. O navegador bloqueia áudio até o primeiro gesto, então o
   **primeiro toque** (numa tecla ou no botão "Ativar áudio") liga o som.
2. A partir daí, toque nas teclas na tela ou use o teclado do computador.
3. Abra **"Ajustes do sintetizador"** para moldar o som, ou escolha um
   **Preset (vibe)** no topo.

## Teclas e vozes pela URL

Por padrão a harpa abre com o máximo: **12 teclas** e **12 vozes** de
polifonia. Você pode pedir menos pela URL — útil para aliviar máquinas mais
modestas (menos teclas e vozes = menos osciladores alocados):

| Parâmetro | Apelido em inglês | O que faz |
|-----------|-------------------|-----------|
| `teclas`  | `keys`            | Número de teclas (1 a 12) |
| `vozes`   | `voices`          | Número de vozes / polifonia (1 a 12) |

Exemplos:

```
?teclas=10            # 10 teclas; vozes acompanham (10)
?teclas=10&vozes=6    # 10 teclas e 6 vozes
?vozes=4              # 12 teclas, mas só 4 vozes simultâneas
```

Regras:

- Sem parâmetro, fica no **máximo possível** (12).
- Pedir **mais** que o máximo também fica no máximo — nunca quebra.
- Se você escolher só `teclas`, as **vozes acompanham** o número de teclas; se
  escolher só `vozes`, as teclas ficam no máximo.
- O número **efetivamente em uso** aparece na linha de versão, no topo da
  página (ex.: `… · 10 teclas · 6 vozes`), ao lado das versões de HTML e JS.

## Presets e vibes

O seletor "Preset (vibe)" reúne três grupos:

- **De fábrica** — embutidos no app (Harpa Clássica, Pad Etéreo, Pluck Curto,
  Drone Profundo, Sino Cristalino, Oriental).
- **Da coleção** — carregados da pasta [`presets/`](presets/) (veja abaixo).
- **Minhas vibes** — salvas por você no navegador (localStorage).

Ao mexer num controle, o seletor mostra **"✎ Não salvo"** — você saiu do
preset. Escolher outro preset descarta as alterações e carrega o preset limpo.
Para guardar, dê um nome e clique **Salvar vibe**.

### Exportar / importar

- **Exportar arquivo** baixa a configuração atual como `.harpa.json`.
- **Importar arquivo** lê um `.harpa.json` e o adiciona às suas vibes.
- Vibes são comparadas **pelo som** (não pelo nome): importar algo idêntico a
  um preset existente apenas o seleciona, em vez de criar uma cópia.

## A coleção (pasta web)

Para instalar vibes numa máquina nova, elas vêm junto no repositório, na pasta
[`presets/`](presets/):

```
presets/
  index.json              # lista os arquivos da coleção
  gamelao.harpa.json
  baixo-sintetico.harpa.json
  nuvem-dorica.harpa.json
```

**Para adicionar um preset à coleção:** coloque o `.harpa.json` na pasta e
inclua o nome do arquivo na lista `files` de `index.json`.

> ⚠️ A coleção é carregada via `fetch`, que **só funciona servida por um
> servidor** (como o GitHub Pages). Abrindo o `index.html` direto do disco
> (`file://`), o navegador bloqueia o `fetch` e o app roda apenas com os
> presets de fábrica — o que é esperado.

## Rodando localmente

Como a coleção precisa de um servidor, rode um servidor estático simples:

```bash
# Python 3
python3 -m http.server 8000
# depois abra http://localhost:8000
```

Sem servidor, abrir o `index.html` direto funciona para tudo, exceto a coleção.

## Projetado para o Raspberry Pi

O som é propositalmente leve para rodar no navegador de um Pi:

- Reverb removido (o "rabo" ao soltar a tecla vem do release do envelope).
- Filtro low-pass de 12 dB/oct.
- Um único LFO de PWM compartilhado por todas as vozes.

## Arquitetura (visão rápida)

- **`index.html`** — UI e estilos (tema fósforo-verde), sem dependências de
  build. Usa [Tone.js](https://tonejs.github.io/) via CDN.
- **`app.js`** — toda a lógica: síntese (classes `LaserVoice` e `LaserHarp`),
  escalas, presets, save geral, import/export e coleção.
- **`presets/`** — a coleção de vibes carregada por `fetch`.
- **`SYNTHEX_PATCH.md`** — referência do patch original do Synthex e como a
  nossa implementação se relaciona com ele.

Uma vibe (preset) é um objeto JSON plano com os parâmetros do som (ondas,
intervalo, filtro, ADSR, etc.) mais escala e nota base. O mesmo formato serve
para presets de fábrica, coleção, vibes do usuário e arquivos `.harpa.json`.

## Créditos

Projeto por **Mauricio Jabur — MauMaker**. Construído com **Kiro**.
Síntese sobre [Tone.js](https://tonejs.github.io/). Som inspirado no Elka
Synthex (Preset 46).
