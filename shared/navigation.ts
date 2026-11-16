const pages=new Set(['home','exams','create','mine','history','rank','shared','convert','settings','review','users','invites','grading','trash','logs','config']);
const adminPages=new Set(['review','users','invites','grading','trash','logs','config']);
/** Route names only. This is UI validation; backend authorization remains authoritative. */
export function pageFromHash(hash:string,role:string):string|null{
 const page=hash.replace(/^#/,'');return (role!=='tester'||['home','exams','shared','settings'].includes(page))&&pages.has(page)&&(!adminPages.has(page)||role==='admin')?page:null;
}
