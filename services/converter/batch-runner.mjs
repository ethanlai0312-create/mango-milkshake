import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const endpoint=process.env.MANGO_API;
const token=process.env.MANGO_WORKER_TOKEN;
if(!token?.startsWith('mw_'))throw new Error('Set your scoped MANGO_WORKER_TOKEN');
async function api(action,p={}){const r=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action,...p})});const data=await r.json();if(!r.ok)throw new Error(data.error);return data.data;}
const inputDir=path.resolve('work/conversion-input'),outputDir=path.resolve('work/conversion-output');
if(!inputDir.startsWith(path.resolve('work')+path.sep)||!outputDir.startsWith(path.resolve('work')+path.sep))throw new Error('Invalid workspace');
let built=false,failures=0;const startedAt=Date.now();
for(let i=0;i<12&&Date.now()-startedAt<600000;i++){
 const job=await api('workerClaim');if(!job){console.log('No queued conversions');break;}
 try{
  await fs.rm(inputDir,{recursive:true,force:true});await fs.rm(outputDir,{recursive:true,force:true});await fs.mkdir(inputDir,{recursive:true});await fs.mkdir(outputDir,{recursive:true});
  const ext=job.input_name.split('.').pop().toLowerCase();if(!/^[a-z0-9]{1,8}$/.test(ext))throw new Error('Invalid extension');
  const input=await fetch(job.input_url);if(!input.ok)throw new Error('Input download failed');await pipeline(Readable.fromWeb(input.body),createWriteStream(path.join(inputDir,'input.'+ext))); await fs.chmod(outputDir,0o777);
  if(!built){const build=spawnSync('docker',['build','-t','mango-converter','services/converter'],{stdio:'inherit',timeout:600000});if(build.status!==0)throw new Error('Converter build failed');built=true;}
  const containerName='mango-conversion-'+job.id;const run=spawnSync('docker',['run','--name',containerName,'--rm','--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--read-only','--memory','1g','--cpus','2','--pids-limit','128','--tmpfs','/tmp:rw,nosuid,nodev,size=512m','-v',inputDir+':/input:ro','-v',outputDir+':/output:rw','mango-converter','/input/input.'+ext,job.target],{stdio:'pipe',encoding:'utf8',maxBuffer:1000000,timeout:120000});spawnSync('docker',['rm','--force',containerName],{stdio:'ignore',timeout:10000});if(run.status!==0){const diagnostic=String(run.stderr??'');throw new Error(run.error?.code==='ETIMEDOUT'?'转换超过120秒资源限制':diagnostic.includes('Scanned PDF requires OCR')?'此PDF未检测到可提取文字，需要OCR，当前暂不支持':diagnostic.includes('Archive expansion exceeds limit')?'文档解压后过大，已安全拒绝':diagnostic.includes('Unsafe document archive')?'文档含不安全路径，已安全拒绝':'转换失败，文档可能损坏或格式不受支持');}
  const output=path.join(outputDir,'result.'+(job.target==='png'?'zip':job.target));const upload=await fetch(job.output_url,{method:'PUT',headers:{'Content-Type':'application/octet-stream','Content-Length':String((await fs.stat(output)).size)},body:createReadStream(output),duplex:'half'});if(!upload.ok)throw new Error('Output upload failed');
  await api('workerFinish',{id:job.id,lease:job.lease_id,success:true});console.log('Conversion completed:',job.id,job.target);
 }catch(e){failures++;await api('workerFinish',{id:job.id,lease:job.lease_id,success:false,error:String(e.message).slice(0,500)});console.error('Conversion failed:',job.id);}
}
if(failures)process.exitCode=1;
