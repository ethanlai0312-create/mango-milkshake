export const extensions=['png','jpg','jpeg','webp','gif','bmp','avif','heic','heif','tif','tiff','mp4','mov','webm','avi','mkv','mp3','wav','m4a','aac','flac','ogg','pdf','doc','docx','odt','rtf','txt','md','html','htm','xls','xlsx','ods','csv','ppt','pptx','odp','epub','zip','rar','7z','gz','json','wps','et','dps','pages','numbers','key'];
const mimes:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',bmp:'image/bmp',avif:'image/avif',heic:'image/heic',heif:'image/heif',tif:'image/tiff',tiff:'image/tiff',mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm',avi:'video/x-msvideo',mkv:'video/x-matroska',mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',aac:'audio/aac',flac:'audio/flac',ogg:'audio/ogg',pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',txt:'text/plain',md:'text/markdown',html:'text/html',htm:'text/html',csv:'text/csv',json:'application/json',zip:'application/zip',rar:'application/vnd.rar','7z':'application/x-7z-compressed',gz:'application/gzip'};
export function fileSizeError(size:number){return !Number.isSafeInteger(size)||size<1?'文件大小无效或文件为空':null;}
export function inspectFile(name:string,bytes:Uint8Array){
 const ext=name.split('.').pop()?.toLowerCase()??'';if(!extensions.includes(ext))throw new Error('不支持此文件类型');
 const starts=(...signature:number[])=>signature.every((v,i)=>bytes[i]===v),ascii=new TextDecoder('latin1').decode(bytes),at=(s:string,n=0)=>ascii.slice(n,n+s.length)===s;
 if(starts(0x4d,0x5a)||starts(0x7f,0x45,0x4c,0x46))throw new Error('禁止上传可执行文件');
 let valid=false;
 if(ext==='png')valid=starts(137,80,78,71,13,10,26,10);
 else if(['jpg','jpeg'].includes(ext))valid=starts(255,216,255);
 else if(ext==='gif')valid=at('GIF87a')||at('GIF89a');
 else if(ext==='webp')valid=at('RIFF')&&at('WEBP',8);
 else if(ext==='bmp')valid=at('BM');
 else if(['avif','heic','heif','mp4','mov','m4a'].includes(ext))valid=at('ftyp',4)||ext==='mov'&&['moov','mdat','wide','free'].some(s=>at(s,4));
 else if(['tif','tiff'].includes(ext))valid=starts(73,73,42,0)||starts(77,77,0,42);
 else if(['webm','mkv'].includes(ext))valid=starts(26,69,223,163);
 else if(ext==='avi')valid=at('RIFF')&&at('AVI ',8);
 else if(ext==='wav')valid=at('RIFF')&&at('WAVE',8);
 else if(['mp3','aac'].includes(ext))valid=at('ID3')||bytes[0]===255&&(bytes[1]&0xe0)===0xe0;
 else if(ext==='flac')valid=at('fLaC');else if(ext==='ogg')valid=at('OggS');
 else if(ext==='pdf')valid=ascii.slice(0,1024).includes('%PDF-');
 else if(['doc','xls','ppt','wps','et','dps'].includes(ext))valid=starts(208,207,17,224,161,177,26,225)||at('PK');
 else if(['docx','xlsx','pptx','odt','ods','odp','epub','zip','pages','numbers','key'].includes(ext))valid=starts(80,75,3,4)||starts(80,75,5,6)||starts(80,75,7,8);
 else if(ext==='rar')valid=at('Rar!');else if(ext==='7z')valid=starts(55,122,188,175,39,28);else if(ext==='gz')valid=starts(31,139);
 else if(ext==='rtf')valid=/^\s*\{\\rtf/.test(ascii);
 else {valid=!bytes.some(v=>v===0)&&!ascii.startsWith('PK');if(!['html','htm'].includes(ext)&&/<(?:script|html|svg)\b/i.test(ascii))valid=false;}
 if(!valid)throw new Error('文件内容与声明格式不匹配，或文件已损坏');
 return {mime:mimes[ext]??'application/octet-stream',preview:!['heic','heif','tif','tiff','avi','mkv','mov','doc','xls','ppt','wps','et','dps','pages','numbers','key'].includes(ext),forceDownload:['html','htm'].includes(ext)};
}
