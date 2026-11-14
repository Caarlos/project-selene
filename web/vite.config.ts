import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  base: './', // static hosting under any sub-path
  plugins: [react(), tailwindcss()],
  // localhost only: never expose the dev server (WARNING.md)
  server: {host: '127.0.0.1', port: 5173, strictPort: true},
  preview: {host: '127.0.0.1', port: 4173, strictPort: true},
  test: {include: ['src/**/*.test.ts']},
});
