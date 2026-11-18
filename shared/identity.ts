/** Login identifiers and public nicknames are separate from immutable account UUIDs. */
export function loginIdError(value:unknown):string|null{
 if(typeof value!=='string')return 'ID需为4–64位英文字母、数字或中间空格';
 const id=value.trim();
 return id.length>=4&&id.length<=64&&/^[A-Za-z0-9](?:[A-Za-z0-9 ]*[A-Za-z0-9])$/.test(id)?null:'ID需为4–64位英文字母、数字或中间空格';
}
export const loginId=(value:string)=>value.trim();
export const loginIdKey=(value:string)=>loginId(value).toLowerCase();
const graphemeSegmenter=typeof Intl!=='undefined'&&'Segmenter' in Intl?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
function graphemeLength(value:string){return graphemeSegmenter?[...graphemeSegmenter.segment(value)].length:[...value].length;}
function unsafeFormatCharacter(character:string){
 if(!/\p{Cf}/u.test(character))return false;
 if(character==='\u200D')return false;
 const code=character.codePointAt(0)!;
 return code<0xE0020||code>0xE007F;
}
export function nicknameError(value:unknown):string|null{
 if(typeof value!=='string')return '昵称需为1–32个字符，不能包含控制字符';
 const name=value.trim();
 const length=graphemeLength(name);
 return length>=1&&length<=32&&!/[\p{Cc}\p{Zl}\p{Zp}]/u.test(name)&&![...name].some(unsafeFormatCharacter)?null:'昵称需为1–32个字符，不能包含控制字符';
}
export const nickname=(value:string)=>value.trim();
