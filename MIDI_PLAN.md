# Harpa Laser — Plano de integração MIDI

Documento de planejamento (não é código). Avalia e define como a Harpa Laser
passa a falar **MIDI** — recebendo do hardware de lasers e, opcionalmente,
reenviando para um sintetizador externo (M-VAVE FM-1). Escrito para ser
discutido e ajustado antes de qualquer implementação.

> Projeto por **Mauricio Jabur — MauMaker**. Construído com **Kiro**.

---

## 1. Contexto e peças envolvidas

- **Hardware da harpa (controlador):** fileira de emissores laser + sensores.
  Hoje, ao interromper um feixe, ele emite uma **tecla de teclado USB-HID**
  (Z X C V B N M , . / A S). O roadmap é passar a emitir **MIDI por USB**.
  É sempre um **emissor** de eventos; nunca produz som.
- **App web (`app.js` + `index.html`):** recebe os eventos e **sintetiza** o
  som com Tone.js (classes `LaserVoice` / `LaserHarp`). Dono das **escalas**,
  da **nota base** e dos **presets** (vibes).
- **M-VAVE FM-1:** sintetizador FM de 6 operadores (estilo DX7), com MIDI por
  USB-C, BLE e TRS. Pode ser um **destino de som alternativo** ao Tone.js.
  Não conhece as escalas do app.

### Decisão de conexão: USB

USB-MIDI *class-compliant* — plug-and-play no Chrome, igual ao teclado HID de
hoje. BLE foi descartado: num teste com controlador BLE a latência/estabilidade
não serviram, e num festival o espectro Bluetooth é hostil. USB fica para o
palco; BLE, no máximo, para protótipo de bancada.

### ⚠️ Risco a confirmar antes de implementar: o navegador de palco

A **Web MIDI API** (`navigator.requestMIDIAccess`) é um recurso do
**Chromium/Blink**. Navegadores com engine **WebKit/WPE (ex.: Cog)** e
**Safari/iOS** historicamente **não** implementam Web MIDI. Se o runtime de
festival não for Chromium de verdade, este plano inteiro não roda — a detecção
de recurso (abaixo) é a primeira linha de defesa, mas a decisão de ambiente
precisa ser fechada antes. **Apple está fora de escopo** por decisão do projeto.

---

## 2. Dois cenários mutuamente exclusivos (OU/OU)

O hardware é plugado **ou** no PC **ou** no FM-1 — nunca nos dois ao mesmo
tempo, e **nunca** com o PC reencaminhando para o FM-1. São dois mundos
separados:

| Cenário | Caminho | Quem decide a altura da nota | PC no meio? |
|---|---|---|---|
| **PC** | harpa → PC → Tone.js | a **escala do site** (`KEY_MAP`) | sim (é o synth) |
| **FM-1** | harpa → FM-1 | a **nota MIDI literal** recebida | não |

Como os dois cenários **não coexistem**, não há necessidade de o navegador
reenviar nada para o FM-1. A web só participa do cenário PC.

### O que cada cenário quer receber

- **Cenário PC (Tone.js):** o hardware manda **índice de corda** (0..11 =
  corda 1..12). A web consulta `KEY_MAP[i].note` e aplica a escala atual.
- **Cenário FM-1:** o hardware manda **altura musical real** (ex.: nota 60 =
  Dó), porque o FM-1 toca o que chega. A escala do site **não participa**.

### Abordagem preferida: hardware IDÊNTICO nos dois cenários (sem chave)

Desejo do projeto: manter o firmware dos lasers comum aos dois cenários. Dá
para conseguir **sem chave física**, deixando o hardware **sempre falar a mesma
língua** e pondo a adaptação no lado flexível (a web).

Regra: **o hardware sempre manda altura musical real** — uma **escala fixa**
(provavelmente **pentatônica menor em C2**, o default do app; dórico também é
candidato), uma **nota MIDI fixa por corda** (corda 1 sempre a mesma nota, etc.).

- **Cenário FM-1:** o FM-1 toca essas notas direto. Funciona sem nada a mais.
- **Cenário PC:** a web **remapeia** cada nota fixa de volta para um **índice de
  corda** (`MIDINOTE_TO_INDEX`, análogo ao `CODE_TO_INDEX` de hoje) e aplica a
  escala / nota base **atuais do site** por cima. Ou seja: a escala fixa do
  hardware é só um "endereço de corda"; a altura final é a do seletor do site.

> Começa com uma **tabela hardcoded** das notas que o hardware emite (a
> pentatônica menor em C2, por corda). Se um dia a escala do hardware mudar,
> muda-se a tabela. Simples e suficiente para o palco.

Por que o hardware fala "altura" e não "índice": o FM-1 é **rígido** (toca o que
chega); a web é **código nosso, flexível**. Faz sentido o elemento rígido ditar
a língua e o esperto se adaptar.

> **Condição para fechar 100%:** o hardware precisa mandar **notas fixas por
> corda** (sempre a mesma nota por feixe, independentemente de qualquer
> "musicalidade"). É o comportamento natural dele. Só assim a web sabe
> "nota X = corda N".

**Plano B (se algo impedir o remapeamento):** uma **chave física** no hardware
alternando modo índice (PC) / modo altura (FM-1). Fica como alternativa, não
como primeira escolha.

> **Trade-off assumido:** no cenário FM-1, **perde-se o seletor de escala do
> site** — ele não está na corrente. Custo aceito, não um problema a resolver.

---

## 3. Recebendo notas (substituir o teclado HID por MIDI)

Esta é a troca mais barata e de maior retorno. Hoje o disparo converge num
ponto só:

```
tecla física  →  CODE_TO_INDEX.get(code)  →  índice  →  updateNote(índice)
                                                          → harp.triggerAttack(KEY_MAP[i].note)
```

Com MIDI, acrescenta-se um caminho **paralelo**, sem remover o teclado (ótimo
para ensaio sem o hardware). O hardware manda **altura real (nota fixa por
corda)**; a web remapeia de volta para índice de corda:

```
Note On  (nota fixa da corda)  →  MIDINOTE_TO_INDEX.get(nota)  →  mesmo updateNote()
Note Off (nota fixa da corda)  →  release do mesmo índice
```

### Mapeamento das cordas

- O hardware emite uma **nota MIDI base + índice** por feixe. Proposta: usar uma
  base configurável (ex.: `MIDI_BASE_NOTE = 48`), com corda `i` = `base + i`.
- A web monta `MIDINOTE_TO_INDEX` análogo ao `CODE_TO_INDEX` atual.
- `KEY_COUNT` continua mandando quantas cordas existem; índices fora da faixa
  são ignorados (robustez, como o `slice` já faz com as teclas).

### Pontos de toque no código (previstos)

- **Novo módulo de MIDI** (ex.: função `initMidi()`), chamado no setup, análogo
  a `bindControls()`. Deve ser **tolerante a ausência** de Web MIDI (feature
  detection): se não houver, não faz nada e o app segue no teclado/toque.
- **Reuso de `updateNote(index)`**: o MIDI não deve ter um caminho de síntese
  próprio — deve cair no mesmo `updateNote`/`triggerAttack`/`triggerRelease`
  que teclado e toque já usam. Isso mantém escala, destaque visual e pool de
  vozes coerentes de graça.
- **Despertar do áudio:** o primeiro evento MIDI precisa respeitar a regra do
  navegador de só iniciar áudio após gesto do usuário. Note On **não é** gesto
  confiável para `Tone.start()`. Estratégia: manter o botão "Ativar áudio" e
  tratar o MIDI como já-destravado só depois do primeiro gesto — ou exibir aviso
  "toque uma vez para ativar o áudio" enquanto o contexto estiver suspenso.
- **Estado "preso":** garantir Note Off/`blur` liberando vozes, como o
  `window.blur` já faz, para não deixar corda soando se um evento se perder.

### ✅ Habilitação do MIDI: toggle persistente (FEITO)

O MIDI nasce **desligado por default**, para que visitantes da demo nunca vejam
o popup "permitir MIDI" (`requestMIDIAccess` é o que o dispara). Um **toggle**
no painel "Ajustes do sintetizador" (`#ctrl-midi`) liga/desliga, com a
preferência **persistida** em `localStorage` (`MIDI_ENABLED_KEY`) — o PC do
palco lembra que é modo controlador; o notebook da demo fica mudo e sem popup.

- **Sem reload:** ligar chama `enableMidi()` na hora (popup no clique, momento
  natural); desligar remove os handlers e solta cordas presas. A **permissão**
  do navegador, uma vez dada, não é revogável por nós — mas sem handlers nada
  acontece e nenhum popup reaparece.
- **Na carga:** só pede acesso se a preferência salva for "ligado" (quem nunca
  optou nunca vê popup).
- **Diagnóstico no palco:** a linha de versão mostra `· MIDI on` quando ativo, e
  há um rótulo de status ao lado do toggle (ligado / desligado / pedindo
  permissão / permissão negada / indisponível neste navegador).
- Preferido ao `?midi=1` na URL: não há risco de "esquecer a flag" e descobrir
  no palco — a máquina lembra a escolha.

---

## 4. Expressão por corda (distância da mão) — item de futuro

### Requisito

A distância da mão ao longo do feixe deve controlar **um aspecto da síntese, por
corda, de forma independente e contínua**.

### Alvo escolhido: brilho (cutoff do filtro)

Mão perto = som mais aberto/brilhante; mão longe = mais abafado. É o mapeamento
mais "harpa laser" e o mais expressivo.

### A distância JÁ existe no hardware

O hardware hoje verifica a distância **muitas vezes por segundo**, mas a reduz a
um liga/desliga por limiar. Para expressão, basta **parar de descartar** esse
valor e enviá-lo junto — não há sensor novo nem leitura extra. (Afinação
futura: enviar só quando a distância muda além de um limiarzinho, para não
inundar a conexão MIDI com valores repetidos.)

### A expressão também se separa por cenário

Como os dois cenários **não coexistem** (seção 2), não é preciso uma solução
única que agrade PC e FM-1 ao mesmo tempo:

- **Cenário PC (Tone.js):** a web recebe a distância e roteia ao parâmetro da
  voz correspondente. Aqui **poly aftertouch (polyphonic key pressure) é o
  caminho mais simples** — o hardware manda poly aftertouch da mesma nota (da
  corda), e a web acha a voz pelo `Map` `active` (nota→voz) que o `LaserHarp`
  já mantém. **Não é preciso MPE nem um canal por corda.**
- **Cenário FM-1:** a expressão é o que o FM-1 entender nativamente (channel
  pressure / CC / mod wheel), decidido no **firmware**. A web não participa.

> **MPE deixa de ser necessário.** Ele só faria sentido se PC e FM-1 recebessem
> a mesma mensagem ao mesmo tempo — o que o desenho OU/OU evita. Isto só diz
> respeito ao cenário PC (lado da web); o cenário FM-1 é assunto de firmware.

### Fundação comum: cutoff (e afins) em TEMPO REAL

Decisão de arquitetura que serve a dois propósitos de uma vez:

1. **Hoje, o slider de filtro NÃO afeta a nota que já soa.** `setFilterKeyTrack`
   (`ctrl-cutoff`) só muda a variável `filterKeyTrack`; o cutoff real é
   calculado uma vez, no `attack` ("vale da próxima nota em diante"). Mover o
   slider com uma corda segurada não muda nada. (Ressonância `setFilterQ` e mix
   `setOsc2Level` já usam `rampTo` e **mudam ao vivo** — o filtro é a exceção.)
2. **A expressão precisa mexer no cutoff de uma corda que já está soando.**

É o **mesmo mecanismo**. Em vez de dois caminhos separados, eles convergem:

- O **slider de filtro** define o **centro** do brilho (valor base, por key
  tracking).
- A **distância da mão** vira um **fator que empurra** o cutoff para cima/baixo
  em torno desse centro.

Assim, ajustar o slider já se ouve na hora (útil para avaliar o som **sem MIDI
nenhum**, só no teclado), e quando a expressão entra, ela modula a partir do
valor do slider. Um mecanismo, dois usos.

> Ajuste previsto em `LaserVoice`: um `setExpression(valor01)` que recalcula/
> empurra `filter.frequency` da voz com uma rampa curta, sobre o valor base do
> key tracking. `LaserHarp` acha a voz pela nota ativa e encaminha. O slider de
> filtro passa a aplicar o novo cutoff às vozes ativas pelo mesmo caminho.

### O que a distância controla (decisão musical, a confirmar)

Candidatos, todos **já existentes por voz** em `LaserVoice`:

| Alvo | Sensação | Como |
|---|---|---|
| **Cutoff do filtro** (recomendado) | mão perto = mais brilho | `filter.frequency` da voz |
| Mix do OSC2 | mão perto = mais "poinnn"/harmônicos | `setOsc2Level` |
| Volume da voz | mão perto = mais forte | ganho da voz |

Brilho (cutoff) é o mapeamento mais "harpa laser" e o mais expressivo. É escolha
tua; a arquitetura suporta qualquer um **por voz**.

### Ajuste de arquitetura necessário (pequeno, localizado)

Hoje `LaserVoice` calcula o cutoff **uma vez, no `attack`**, via key tracking —
não há como mexer no brilho de **uma corda que já está soando**. Para expressão
em tempo real:

- Adicionar à `LaserVoice` um método tipo `setExpression(valor01)` que mapeia
  0..1 para o parâmetro escolhido (ex.: multiplica/empurra `filter.frequency`
  com uma rampa curta, sobre o valor base do key tracking).
- `LaserHarp` acha a voz pela nota ativa (já mantém o `Map` `active`:
  nota→voz) e encaminha a expressão para a voz certa.

Isso é um acréscimo cirúrgico, **não** uma reforma da síntese.

---

## 5. Ordem de implementação sugerida (lado da web)

Só o **cenário PC** envolve o app web. O cenário FM-1 é 100% firmware e não
gera trabalho aqui. Fatiado para dar valor cedo e isolar risco:

1. ✅ **Cutoff em tempo real (FEITO).** O slider de filtro (`ctrl-cutoff`) agora
   afeta as vozes que já soam. Implementado em `LaserVoice.applyFilter()`
   (recalcula cutoff + compensação a partir de `f1`, `filterKeyTrack` e
   `expression`), chamado pelo ataque e por `setFilterKeyTrack`/`setExpression`.
   `LaserHarp.setExpression(note, mult)` acha a voz pela nota ativa (fundação da
   fatia 3). **Útil já hoje, sem MIDI** — dá para avaliar o filtro ao vivo no
   teclado.
2. ✅ **Entrada MIDI básica (FEITO).** `initMidi()` com feature detection;
   `HARDWARE_MIDI_NOTES` (tabela hardcoded: penta menor C2, nota por corda) e
   `MIDINOTE_TO_INDEX` (nota fixa → índice); Note On/Off caindo em `updateNote`
   via `activeMidi`, espelhando o teclado (inclusive `retune`/`blur`). O
   hardware toca a harpa web por MIDI, com escalas e presets do site intactos.
   Ensaiável com qualquer teclado MIDI tocando as notas da penta menor em C2.
3. ✅ **Expressão (distância → cutoff) (FEITO).** `handleMidiMessage` trata
   **poly aftertouch** (0xA0): nota do hardware → índice → nota atual da corda →
   `harp.setExpression`. `aftertouchToExpression` mapeia 0..127 para o
   multiplicador de cutoff `[EXPR_NEUTRAL=1.0 .. EXPR_MAX=2.5]×` — **0 = neutro**
   (sem mão perto soa como o slider; a mão só adiciona brilho). O `attack`
   reseta a expressão para 1× (não vaza brilho entre cordas no voice stealing).
   `EXPR_NEUTRAL`/`EXPR_MAX` são constantes para afinar a gosto no palco.
   **Teste sem hardware:** `window.harpTestExpression(aftertouch, [index])` pelo
   console simula a distância da mão.

Cada fatia é independente e reversível. A fatia 1 melhora a edição de som hoje;
a fatia 2 cumpre os itens 1 e 2 da tua avaliação original (USB + escalas); a
fatia 3 entrega o item 3 (expressão por corda).

> Fora do escopo da web: saída MIDI, reenvio ao FM-1 e alocação de canais/MPE.
> Isso vive no firmware do hardware, não neste app.

---

## 6. Decisões fechadas

1. **Ambiente:** navegador é **Chromium** (o projeto controla todo o ambiente).
   Web MIDI disponível. ✅
2. **Expressão:** a distância da mão controla o **brilho (cutoff do filtro)**. ✅
3. **Hardware comum sem chave:** o firmware manda **altura real (nota fixa por
   corda)** nos dois cenários; a web remapeia para índice no cenário PC. Chave
   física fica como plano B. ✅
4. **Distância contínua:** já medida muitas vezes por segundo no hardware; basta
   enviá-la por MIDI (poly aftertouch) em vez de descartá-la. ✅

### Ainda em aberto (não bloqueiam o início)

- Nota MIDI fixa de cada corda (a tabela `MIDINOTE_TO_INDEX`): quais notas o
  firmware emitirá por feixe.
- Limiar de envio da distância (evitar inundar o MIDI com valores repetidos) —
  afinação do lado do firmware.
