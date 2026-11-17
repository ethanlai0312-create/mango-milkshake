import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
const gateway='http://127.0.0.1:5178';
export default defineConfig({plugins:[react()],base:'./',build:{chunkSizeWarningLimit:900},server:{host:'127.0.0.1',allowedHosts:['localhost','127.0.0.1'],cors:false,proxy:{'/backend':{target:gateway,changeOrigin:true,configure(proxy){proxy.on('proxyReq',(out,request)=>{
 // The local development reverse proxy preserves the browser's same-origin contract.
 // A foreign Origin is never rewritten into a trusted one.
 if(request.headers.origin==='http://'+request.headers.host)out.setHeader('origin',gateway);
});}}}}});
