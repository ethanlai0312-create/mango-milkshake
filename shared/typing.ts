export const TYPING_MAX_CHARS=1000;
export const TYPING_TIME_OPTIONS=[5,10] as const;
export type TypingMode='test'|'inspect';
export type RootType='cangjie'|'quick';

export type TypingScore={attempted:number;minutes:number;correct:number;wrong:number;accuracy:number;cpm:number};

/** Same normalization as the school program: half-width spaces/symbols become full-width. */
export function normalizeTypedText(text:string):string{
 return Array.from(String(text??'').replace(/\r?\n/g,'')).map(ch=>{
  if(ch===' '||ch==='\t')return '\u3000';
  const code=ch.charCodeAt(0);
  if(code>=0x21&&code<=0x7e)return String.fromCharCode(code+0xfee0);
  return ch;
 }).join('');
}

export function typingMinutes(timeLimitSeconds:number):number{return Math.max(1,timeLimitSeconds)/60;}

export function calculateTypingScore(targetText:string,typedRaw:string,timeLimitSeconds:number):TypingScore{
 const userRaw=normalizeTypedText(typedRaw);
 const target=String(targetText??'');
 const attempted=Math.min(userRaw.length,target.length);
 let correct=0,wrong=0;
 for(let i=0;i<attempted;i++){if(userRaw[i]===target[i])correct++;else wrong++;}
 if(userRaw.length>target.length)wrong+=userRaw.length-target.length;
 const answered=correct+wrong;
 const minutes=typingMinutes(timeLimitSeconds);
 return {attempted:attempted,minutes,correct,wrong,accuracy:answered>0?correct/answered*100:0,cpm:minutes>0?correct/minutes:0};
}

/** Same generator as the school program, but operating on the server-provided idiom set. */
export function generateTypingTarget(words:readonly string[]):string{
 const list=[...words];
 for(let i=list.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}
 let result='';
 for(const word of list){result+=word;if(result.length>=TYPING_MAX_CHARS)break;}
 while(result.length<TYPING_MAX_CHARS)result+='※';
 return result.slice(0,TYPING_MAX_CHARS);
}

export function quickCode(code:string):string{
 if(!code)return '';
 return code.length<=2?code:code[0]+code[code.length-1];
}
