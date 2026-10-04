# Maelstrom Purge — instruções para o Claude Code

Trabalho de Computação Gráfica. A nota depende principalmente da **documentação do uso de IA**,
então todo prompt que altera o jogo precisa ser registrado.

## Regras
- Pré-requisito: renderizar com **WebGPU** (`three/webgpu`, `WebGPURenderer`). Shaders em TSL/WGSL, nunca GLSL.
- Seguir o método de `docs/PROMPT_DESENVOLVIMENTO.md`.
- A cada prompt do usuário que mude o jogo, adicionar um novo capítulo em
  `docs/DIARIO_DE_DESENVOLVIMENTO.md` com: prompt literal do usuário, o que a IA fez,
  antes, depois, erros (com a mensagem real) e correções, e o hash do commit quando houver.
- Erros da própria IA também entram no diário, sem suavizar.
- Qualquer shader criado ou alterado deve ser registrado em `docs/SHADERS.md` (origem, adaptações, integração).
- Prints de antes/depois em `docs/prints/capNN-antes.png` / `capNN-depois.png`.
- Rodar `npm run build` após cada mudança e registrar o resultado.

## Mapa do código (desde o Capítulo 7)
- `src/main.js` — classe `Game`: estados (menu/playing/paused/dead/complete/victory), ondas, portal, execuções. Expõe `window.__game`.
- `src/engine/` — renderer WebGPU + pós (bloom/vinhetas), áudio procedural, input.
- `src/shaders/` — todos os shaders em TSL (`world.js` cenário, `entities.js` inimigos/partículas/efeitos).
- `src/game/` — level (grade, DDA, BFS), levels (mapas ASCII + ondas), rig (animação procedural), enemies, weapons, player, projectiles, pickups, effects, assets.
- Cuidado com TSL: não use nomes de variáveis que encubram funções importadas (`max`, `min`…); `assign` só dentro de `Fn()`; `smoothstep` sempre com borda0 < borda1.

## Evidências (antes/depois)
- `tools/captura/` grava MP4 + prints com Edge headless (ver README). Grave o "antes" ANTES de alterar o código.
- Salve em `docs/prints/capNN/` e use `.txt` para logs (o `.gitignore` ignora `*.log`).
