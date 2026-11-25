import { defineConfig } from 'vite'

// Pages serves the site from /threshold/, everything else from the root.
export default defineConfig({
  base: process.env.BASE ?? '/',
  build: { target: 'es2023' },
})
