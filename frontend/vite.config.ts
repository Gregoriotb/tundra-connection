import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Spec: ARCHITECTURE.md — frontend en Vercel, backend en Railway.
// Sin alias `@/` (regla del stack del Orquestor).

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
  },
});
