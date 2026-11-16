import {openDB} from 'idb';
const database=openDB('mango-study-v1',1,{upgrade(db){db.createObjectStore('drafts');}});
export const localSave=async(user:string,key:string,value:any)=>(await database).put('drafts',value,`${user}:${key}`);
export const localLoad=async(user:string,key:string)=>(await database).get('drafts',`${user}:${key}`);
export const localDelete=async(user:string,key:string)=>(await database).delete('drafts',`${user}:${key}`);
export async function clearAccount(user:string){const db=await database;for(const key of await db.getAllKeys('drafts'))if(String(key).startsWith(user+':'))await db.delete('drafts',key);}
export async function hasUnsynced(user:string){const db=await database;return (await db.getAllKeys('drafts')).some(key=>String(key).startsWith(user+':exam:')||String(key).startsWith(user+':attempt:'));}
