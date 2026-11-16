import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {Feedback} from './ui/Feedback';
import {InteractionLayer} from './components/InteractionLayer';
import './style.css';

import 'katex/dist/katex.min.css';
createRoot(document.getElementById('root')!).render(<><App/><InteractionLayer/><Feedback/></>);
if(import.meta.env.PROD&&'serviceWorker' in navigator){window.addEventListener('load',()=>{void navigator.serviceWorker.register(import.meta.env.BASE_URL+'sw.js').catch(()=>{console.warn('离线应用缓存尚未安装，请保持联网直到下次加载完成。');});});}
