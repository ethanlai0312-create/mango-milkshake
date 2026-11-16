import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

const fromVite=createRequire(import.meta.resolve('vite'));
const {rolldown}=await import(pathToFileURL(fromVite.resolve('rolldown')).href);
const destination=process.argv[2];
if(!destination)throw Error('Provide the output path');
const bundle=await rolldown({input:fileURLToPath(new URL('../shared/rich-text.ts',import.meta.url))});
try{
 await bundle.write({file:destination,format:'esm',codeSplitting:false});
}finally{
 await bundle.close();
}
