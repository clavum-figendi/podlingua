import {defineConfig} from 'vite';
export default defineConfig({
  base:'/podlingua/',
  worker:{format:'es'},
  build:{target:'es2022',chunkSizeWarningLimit:1800},
});
