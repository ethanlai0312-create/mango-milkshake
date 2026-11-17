import {describe,it,expect} from 'vitest';
// @ts-expect-error The gateway runs as a native Node module.
import {createUploadGrants} from '../../deploy/local-server/upload-grants.mjs';

const path='00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/input.txt';
const uploadPath='/storage/v1/object/upload/sign/mango-private/'+path;
const resource='/storage/v1/upload/resumable/sign/resource-1';
const encoded=(value:string)=>btoa(value);
const metadata='bucketName '+encoded('mango-private')+',objectName '+encoded(path);
const token='a.'+btoa(JSON.stringify({exp:1000})).replaceAll('=','')+'.signature';
const data={file:{path,size:20},token,signedUrl:'http://127.0.0.1:58000'+uploadPath+'?token='+token};
const query=new URLSearchParams({token});
const headers={'x-signature':token};
function fixture(){const grants=createUploadGrants(()=>1000);grants.remember(data);return grants;}

describe('upload grants bound to trusted reservations',()=>{
 it('allows direct upload only at the recorded object and exact size',()=>{
  const grants=fixture();
  expect(grants.begin('upload',uploadPath,query,{'content-length':'20'}).status).toBeUndefined();
  expect(grants.begin('upload',uploadPath,query,{'content-length':'21'}).status).toBe(413);
  expect(grants.begin('upload',uploadPath+'-other',query,{'content-length':'20'}).status).toBe(413);
 });
 it('requires a new API grant after a restart and preserves HEAD resume semantics',()=>{
  const grants=createUploadGrants(()=>1000);
  expect(grants.begin('upload',uploadPath,query,{'content-length':'20'})).toEqual({status:409,renew:true});
  expect(grants.begin('tus-head',resource,query,headers)).toEqual({status:423,renew:true});
  grants.remember(data);
  const head=grants.begin('tus-head',resource,query,headers);
  expect(head.finish({'upload-length':'20','upload-offset':'6','upload-metadata':metadata},200)).toBe(true);
  expect(grants.begin('tus-chunk',resource,query,{...headers,'upload-offset':'6','content-length':'14'}).status).toBeUndefined();
 });
 it('rejects understated totals, wrong metadata and chunks beyond the reservation',()=>{
  const grants=fixture();
  const base={...headers,'upload-metadata':metadata,'upload-length':'20'};
  expect(grants.begin('tus-create','',query,{...base,'upload-length':'21'}).status).toBe(413);
  expect(grants.begin('tus-create','',query,{...base,'upload-metadata':'bucketName '+encoded('mango-private')+',objectName '+encoded('other')}).status).toBe(413);
  const create=grants.begin('tus-create','',query,base);
  expect(create.limit).toBe(20);
  expect(create.finish({location:resource,'upload-offset':'6'},201)).toBe(true);
  create.release();
  expect(grants.begin('tus-chunk',resource,query,{...headers,'upload-offset':'6','content-length':'15'}).status).toBe(413);
  expect(grants.begin('tus-chunk',resource+'-other',query,{...headers,'upload-offset':'6','content-length':'14'}).status).toBe(409);
 });
 it('avoids parallel creation of multiple resources for one reservation',()=>{
  const grants=fixture(),base={...headers,'upload-metadata':metadata,'upload-length':'20'};
  const create=grants.begin('tus-create','',query,base);
  expect(grants.begin('tus-create','',query,base).status).toBe(503);
  create.finish({location:resource,'upload-offset':'0'},201);create.release();
  expect(grants.begin('tus-create','',query,base)).toEqual({status:409,resume:resource});
 });
 it('rejects resumed objects with different length or identity',()=>{
  const grants=fixture();
  expect(grants.begin('tus-head',resource,query,headers).finish({'upload-length':'21','upload-metadata':metadata},200)).toBe(false);
  expect(grants.begin('tus-head',resource,query,headers).finish({'upload-length':'20','upload-metadata':'objectName '+encoded('other')},200)).toBe(false);
  expect(grants.begin('tus-chunk',resource,query,{...headers,'upload-offset':'0','content-length':'20'})).toEqual({status:409,renew:true});
 });
 it('expires and bounds its capability cache',()=>{
  let now=1000;const grants=createUploadGrants(()=>now,1);grants.remember(data);
  const otherToken=token+'2';
  expect(()=>grants.remember({file:{...data.file,path:path+'-other'},token:otherToken,signedUrl:'http://127.0.0.1:58000'+uploadPath+'-other?token='+otherToken})).toThrow('capacity');
  expect(grants.begin('upload',uploadPath,query,{'content-length':'20'}).status).toBeUndefined();
  now=1000001;
  expect(grants.begin('upload',uploadPath,query,{'content-length':'20'})).toEqual({status:409,renew:true});
  expect(()=>grants.remember(data)).toThrow('Expired');
 });
});
