# Prompt de Desenvolvimento — Maelstrom Purge

Este é o "prompt-mestre" que o grupo usa com as IAs (Claude Code e outras) para evoluir o jogo.
Ele existe para que **toda iteração siga o mesmo método** e gere evidência para o relatório
(prompt → resposta → erro/acerto → correção → antes/depois).

---

## 1. Prompt-mestre (contexto fixo, colado no início de cada sessão com qualquer IA)

```text
Você é um desenvolvedor de jogos 3D para web trabalhando no projeto "Maelstrom Purge",
um FPS cyberpunk feito com Three.js + Vite, para a disciplina de Computação Gráfica.

Restrições obrigatórias:
1. A aplicação DEVE renderizar com WebGPU (THREE.WebGPURenderer, importado de 'three/webgpu').
   Não use WebGLRenderer. Shaders devem ser escritos em TSL (Three Shading Language) ou WGSL,
   nunca em GLSL / ShaderMaterial / onBeforeCompile.
2. Mantenha o estilo do código existente (src/main.js, comentários em português, nomes em inglês).
3. Faça mudanças pequenas e incrementais: uma funcionalidade por prompt.
4. Antes de alterar, descreva o estado ATUAL do jogo relacionado ao pedido (o "antes").
5. Depois de alterar, rode `npm run build` e informe qualquer erro ou aviso, sem esconder falhas.
6. Ao final, entregue um resumo no formato:
   - O que mudou (arquivos e funções)
   - Como o jogo ficou (o "depois")
   - Erros encontrados e como foram corrigidos
   - Riscos / o que ainda pode quebrar
   - Origem de qualquer shader usado (escrito do zero, adaptado de onde, o que foi alterado)
```

## 2. Template de cada iteração (o pedido específico)

```text
Iteração N — <título curto>
Objetivo: <o que o jogador deve ver/sentir de diferente>
Estado atual: <o que acontece hoje / bug observado>
Critério de pronto: <como vamos verificar que funcionou>
Restrições extras: <ex.: não mexer no sistema de armas>
```

## 3. Regras de registro (o que o grupo faz depois de cada resposta da IA)

1. Copiar o prompt enviado e o trecho relevante da resposta para `docs/DIARIO_DE_DESENVOLVIMENTO.md`.
2. Tirar print do jogo **antes** e **depois** e salvar em `docs/prints/` com o nome
   `capNN-antes.png` / `capNN-depois.png`.
3. Se a IA errou, registrar: o erro (mensagem do console/build ou comportamento visual),
   a hipótese, a correção feita e **quem** corrigiu (a IA após novo prompt, ou o grupo manualmente).
4. Fazer um commit por iteração, com a mensagem `capNN: <título>` — o hash vira evidência.
5. Quando a mesma tarefa for feita por mais de uma IA, preencher a tabela de comparação
   no fim do diário.
