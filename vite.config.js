import { defineConfig } from 'vite';

// base relativa: o mesmo build funciona na raiz (npm run preview) e em
// https://brunocosta800.github.io/maelstrom-purge/ (GitHub Pages)
export default defineConfig({
    base: './',
    build: { chunkSizeWarningLimit: 1500 },
});
