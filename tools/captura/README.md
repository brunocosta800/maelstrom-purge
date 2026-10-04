# Captura de gameplay (evidências do diário)

Grava vídeo MP4 + prints do jogo rodando de verdade em WebGPU, usando o Edge em modo headless.
Foi assim que foram gerados `docs/prints/cap07/antes.mp4` e `depois.mp4`.

```bash
cd tools/captura
npm install                      # puppeteer-core + ffmpeg (fica só nesta pasta)
# em outro terminal, na raiz do projeto: npm run dev
node capture.mjs http://localhost:5173/ ../../docs/prints/capNN/antes cen_antes.mjs
LEVEL=2 SECS=40 node capture.mjs http://localhost:5173/ ../../docs/prints/capNN/depois cen_play.mjs
```

- `capture.mjs` — abre o navegador, simula o Pointer Lock (headless não tem), grava os frames via CDP e monta o MP4.
- `bot.js` — **bot de mira automática**, injetado só durante a gravação: mira no inimigo visível mais próximo e atira.
  As gravações "depois" usam esse bot (não é um humano jogando) — deixe isso claro na apresentação.
- `cen_*.mjs` — roteiros: `cen_antes` (jogo antigo), `cen_play` (partida com bot; `LEVEL`, `SECS`, `GOD=1` invencível,
  `DIFF=facil|normal|pesadelo`), `cen_flow` (pausa/morte/fim de fase), `cen_showcase` (execução + chefe), `cen_guns` (armas).
- O jogo expõe `window.__game` para esses roteiros.
