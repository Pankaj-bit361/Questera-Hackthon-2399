import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Studio's live preview runs the video code in studio/remotion, which shares a few CommonJS modules with the Node
// renderer (timing, brand kit, colours). The browser gets them as ES modules with a default export.
function studioCommonJs() {
  const match = /[\\/](studio[\\/]remotion|Questera-Backend[\\/]studio)[\\/](timing|brandkit|color)\.cjs$/;
  return {
    name: 'studio-commonjs',
    enforce: 'pre',
    transform(code, id) {
      if (!match.test(id.split('?')[0])) return null;
      return { code: `const module = { exports: {} };\nconst exports = module.exports;\n${code}\nexport default module.exports;\n`, map: null };
    },
  };
}

export default defineConfig({
  plugins: [studioCommonJs(), react()],
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    historyApiFallback: true,
    proxy: {'/api/motion': {target:'http://127.0.0.1:4701',changeOrigin:true}, '/api/studio': {target:'http://127.0.0.1:4702',changeOrigin:true}},
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
});