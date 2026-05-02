import 'dotenv/config';
import { defineConfig, type Plugin } from 'vite';

function extraHead(): Plugin {
  return {
    name: 'extra-head',
    transformIndexHtml(html) {
      return html.replace('<!-- EXTRA_HEAD -->', process.env.EXTRA_HEAD || '');
    },
  };
}

export default defineConfig({
  plugins: [extraHead()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
