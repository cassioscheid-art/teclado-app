# Teclado

App web para aprender a tocar teclado, inspirado no Artie. As notas caem na tela,
você toca no seu teclado MIDI e o app avalia na hora se acertou a nota e o tempo.

## O que já funciona

- **Notas caindo** com o nome de cada nota (Dó, Ré, Mi...), cores por mão
  (azul = direita, verde = esquerda) e as teclas certas acendendo no piano.
- **Feedback em tempo real**: Perfeito, Bom, Perdeu ou Nota errada, com precisão,
  sequência de acertos e estrelas no final. O recorde de cada música fica salvo no aparelho.
- **Entrada MIDI** pela Web MIDI API (USB ou Bluetooth), mais o piano na tela (toque,
  vários dedos) e o teclado do computador (A W S E D F T G Y H U J K; Z/X mudam a oitava).
- **Biblioteca** com 9 músicas em domínio público, em Fácil, Médio e Difícil.
- **Ferramentas de treino**: velocidade de 25% a 150%, mão esquerda, direita ou ambas
  (a outra mão é tocada pelo app), Wait Mode, repetir um trecho por compassos e metrônomo.
- **PWA**: dá para adicionar à tela de início e funciona offline depois da primeira visita.

## iPhone e iPad

O Safari do iOS **não suporta Web MIDI**. O caminho escolhido:

1. **Agora**: abrir o app no navegador gratuito *Web MIDI Browser* (App Store), que
   adiciona Web MIDI ao WebView. O app detecta o MIDI sozinho. No Safari comum dá para
   praticar pelo piano na tela.
2. **Próximo passo**: empacotar o mesmo código com Capacitor e um plugin nativo de
   CoreMIDI, para publicar na App Store. Só o arquivo `src/input.ts` precisa de uma
   segunda implementação; o resto do app não muda.

## Rodar

```bash
npm install
npm run dev      # servidor local (aceita acesso pela rede, para testar no celular)
npm test         # testes do motor de prática
npm run build    # gera a versão final em dist/
```

## Estrutura

| Arquivo | Função |
| --- | --- |
| `src/songs.ts` | Músicas e o formato de notação (`C4:1 R:0.5 C4+E4:2`) |
| `src/engine.ts` | Relógio, avaliação das notas, Wait Mode, mãos, loop, pontuação |
| `src/render.ts` | Desenho das notas caindo e do teclado no canvas |
| `src/input.ts` | Teclado MIDI, teclado do computador |
| `src/audio.ts` | Sintetizador simples com Web Audio |
| `src/main.ts` | Telas e controles |

### Adicionar uma música

Em `src/songs.ts`, cada mão é uma sequência de notas com duração em tempos
(semínima = 1). `R` é pausa e `+` forma acordes:

```ts
song(
  { id: 'minha-musica', title: 'Minha Música', composer: 'Autor', level: 'Fácil', bpm: 90, beatsPerBar: 4 },
  'C4 D4 E4:2 | E4 D4 C4:2',   // mão direita
  'C3:4 | G2:2 C3:2',          // mão esquerda
),
```
