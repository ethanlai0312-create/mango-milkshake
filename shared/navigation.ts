import {canVisitManagement} from './roles';
const pages=new Set(['mistakes','home','exams','create','mine','history','rank','shared','convert','settings','review','users','invites','grading','trash','logs','config']);
const adminPages=new Set(['review','users','invites','grading','trash','logs','config']);
/** Route names only. This is UI validation; backend authorization remains authoritative. */
export function pageFromHash(hash:string,role:string):string|null{
 const page=hash.replace(/^#/,'');return pages.has(page)&&(!adminPages.has(page)||canVisitManagement(role,page))?page:null;
}
