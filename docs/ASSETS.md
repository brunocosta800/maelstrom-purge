# Registro de Assets — origem, licença e uso

| Asset | Origem | Licença | Onde é usado |
|---|---|---|---|
| `src/assets/Mobs/` — **Imp** e **Puglin** (GLB + texturas 2048², 3 variações de cor) | Quaternius — *Bestiary: Dungeon Monsters* (versão gratuita), enviado pelo grupo no Capítulo 7 | Quaternius Asset License v1.0 — uso livre (pessoal, educacional e comercial), sem crédito obrigatório; proibido revender os assets em si (ver `src/assets/Mobs/License_Standard.txt`) | Inimigos **Imp**, **Imp de Elite** (textura `BaseColor_3`), **Arquidemônio** (chefe, textura `BaseColor_2`, escala 3×) e **Puglin** |
| `src/assets/Sci-Fi Gun Pack by @Quaternius/FBX/` — 7 armas | Quaternius — *Sci-Fi Gun Pack*, enviado pelo grupo no Capítulo 7 | Licença Quaternius (ver `License.docx` no pacote) | Pistola (`Pistol`), Escopeta (`LongPistol`), Metralhadora (`Rifle`), Canhão de Plasma (`Ray Gun`), Railgun (`Sniper rifle`), Lança-Raios (`Lightning Gun`) — na mão e como item no chão |
| `public/characterMedium.fbx` + `public/Textures/zombieA.png`, `zombieC.png` | Commit inicial `2252980` — ⟨preencher origem⟩ | ⟨preencher⟩ | Inimigo **Zumbi** (mantido do jogo original) |
| `public/revolver.glb`, `smg.glb`, `shotgun.glb` | Commit inicial `2252980` — ⟨preencher origem⟩ | ⟨preencher⟩ | **Não usados** desde o Capítulo 7 (substituídos pelo Sci-Fi Gun Pack); mantidos para o histórico |
| Fontes *Chakra Petch* e *Rajdhani* | Google Fonts | SIL Open Font License | Interface (HUD e menus). Sem internet, o navegador usa uma fonte reserva |
| Sons e música | Gerados em tempo real (Web Audio API), sem arquivos | — | Todos os efeitos sonoros e a trilha |

## Observações técnicas
- Os modelos da Quaternius **não têm animações** na versão gratuita e vêm em **T-pose**. Toda a animação
  (caminhar, atacar, arremessar, dor, atordoado, morte) é **procedural**, feita girando os ossos em código
  (`src/game/rig.js`).
- Os materiais Phong das armas (FBX) vieram com cores muito escuras (espaço de cor linear tratado como sRGB);
  foram convertidos para PBR com correção de cor em `prepareGuns()` (`src/game/weapons.js`).
- O Vite só copia para o build arquivos referenciados com **string literal** em `new URL('...', import.meta.url)`;
  por isso cada caminho está escrito por extenso em `src/game/assets.js`.
