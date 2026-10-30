# Harpa Laser — o patch original do Elka Synthex (Preset 46)

Documentação de referência do som que esta Harpa Laser modela: o célebre
"Preset 46" do sintetizador **Elka Synthex**, popularizado como harpa laser por
Jean-Michel Jarre. Guardado aqui para referência histórica e para orientar
futuras melhorias de timbre.

> Projeto por **Mauricio Jabur — MauMaker**. Construído com **Kiro**.

## Como o som é descrito

Baseia-se em parâmetros específicos de síntese: sincronização de osciladores
(Hard Sync), modulação de largura de pulso (PWM) cruzada e o uso de glide
(portamento) para a curva de pitch descendente (o característico "baooooo").

### Configurações originais do patch (Elka Synthex)

- **LFO:** onda triangular roteada para PW2 (Depth: 3, Frequency: 3, Delay: 0).
- **Tuning:** OSC 2 Sync ligado (On).
- **OSC 1:** Oitava 8', Transpose 0, onda de pulso (Pulse), Pulse Width −1, Volume 7.
- **OSC 2:** Oitava 2', Transpose 7, waveform OSC1 PWM + Ring Mod, Pulse Width −1.
- **Envelopes / Glide:** a curva característica de queda de tom ("baooooo") vem
  do módulo de Glide (velocidade e quantidade) modulando o oscilador
  sincronizado — **não** de um envelope de pitch comum.

## Como a nossa implementação se relaciona

Tone.js não tem Hard Sync nativo, então a nossa voz (`LaserVoice` em `app.js`)
é uma **aproximação**: em vez do escravo sincronizado rasgando harmônicos,
usamos um "pitch sweep" descendente no OSC2 somado ao PWM via LFO.

| Parâmetro original | Nossa implementação | Situação |
|---|---|---|
| OSC2 Sync (Hard Sync) On | sweep de pitch do OSC2 no ataque | aproximação |
| OSC1 Oitava 8', pulse, PW −1 | OSC1 pulse, `osc1Width` | próximo |
| OSC2 Oitava 2', Transpose 7 | OSC2 `+31` semitons (2 oitavas + 7) | equivale |
| LFO triangular → PW2 | LFO triangular → `osc2.width` (único, compartilhado) | temos |
| Glide modula o OSC sincronizado | glide/portamento + sweep do OSC2 | aproximação |
| Ring Mod no OSC2 | não implementado | falta |

### O que ficou de fora (e por quê)

- **Hard Sync real:** exigiria um `AudioWorklet` DSP de baixo nível ou tabelas
  de onda pré-sincronizadas. Muito custo/risco de desempenho (alvo inclui
  Raspberry Pi) para uma diferença sutil frente à aproximação atual.
- **Ring Modulation:** possível (multiplicar os dois osciladores), fica como
  experimento futuro por adicionar um nó por voz.

## Diferenças de arquitetura nossas (melhorias para o caso de uso)

- **Key tracking do filtro:** o cutoff acompanha a nota (fator × frequência),
  para graves e agudos terem o mesmo brilho relativo — e sobreviver à troca de
  nota base.
- **Compensação de ganho do filtro:** recupera volume quando o filtro fecha.
- **Escalas "perdoadoras" e nota base configuráveis:** pensado para festivais,
  onde qualquer combinação de notas deve soar bem.
- **Presets de "vibe"** (fábrica + do usuário) e otimizações para rodar leve no
  navegador do Raspberry Pi.
