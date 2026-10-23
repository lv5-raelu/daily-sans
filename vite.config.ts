import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: { main: 'index.html', fight: 'vendor/c2-sans-fight/daily.html' },
    },
  },
});
