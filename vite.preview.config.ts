// Builds a single self-contained preview page (demo mode, seeded with the real history).
// Build with `--mode demo` so .env.production (the real Supabase) is not loaded.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-preview',
    assetsInlineLimit: 100000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
