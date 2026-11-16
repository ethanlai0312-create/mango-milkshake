import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>({plugins:[react()],base:'./',build:{chunkSizeWarningLimit:900},server:mode==='local-test'?{proxy:{'/backend':{target:'http://127.0.0.1:5178',changeOrigin:true}}}:undefined}));
