import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/frontend',
  base: './',
  plugins: [tailwindcss()],
  build: {
    outDir: '../../static/frontend',
    emptyOutDir: true,
  },
});