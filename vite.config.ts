import { defineConfig } from 'vite'

// Pages serves the site from /threshold/, everything else from the root.
export default defineConfig({
  base: process.env.BASE ?? '/',
  // its own port: other projects' dev servers sit on 5173 and Vite would quietly move up one
  server: { port: 5178, strictPort: true },
  preview: { port: 4178, strictPort: true },
  build: {
    target: 'es2023',
    // the tour chunk is three.js plus the AO pass; it loads late and only once
    chunkSizeWarningLimit: 1100,
  },
})
