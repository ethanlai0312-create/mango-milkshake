import {describe,expect,it} from 'vitest';
import {externalImageUrl,privateMediaUrl} from '../../src/lib/media-url';

describe('browser media links',()=>{
 const local='http://127.0.0.1:9000/backend';
 const hosted='https://example.com';
 const path='/storage/v1/object/sign/mango-private/user/file/%E5%9C%96%E7%89%87.png';
 it('accepts local gateway and configured hosted downloads with encoded filenames',()=>{
  for(const base of [local,hosted]){
   const url=base+path+'?token=sample&download=%E5%9C%96%E7%89%87.png';
   expect(privateMediaUrl(url,base,'download')).toBe(url);
  }
 });
 it('checks the storage operation, origin, path, and single token independently',()=>{
  const upload=hosted+path.replace('/object/sign/','/object/upload/sign/')+'?token=sample';
  expect(privateMediaUrl(upload,hosted,'upload')).toBe(upload);
  expect(privateMediaUrl(upload,hosted,'download')).toBeUndefined();
  expect(privateMediaUrl('https://other.example'+path+'?token=sample',hosted,'download')).toBeUndefined();
  expect(privateMediaUrl(hosted+path.replace('mango-private','other-bucket')+'?token=sample',hosted,'download')).toBeUndefined();
  expect(privateMediaUrl(hosted+path+'?token=sample&token=sample',hosted,'download')).toBeUndefined();
  expect(privateMediaUrl(hosted+path+'?download=image.png',hosted,'download')).toBeUndefined();
 });
 it('exposes only ordinary HTTPS image URLs to external-load controls',()=>{
  expect(externalImageUrl('https://images.example/sample.png')?.hostname).toBe('images.example');
  expect(externalImageUrl('http://images.example/sample.png')).toBeUndefined();
  expect(externalImageUrl('https://user@images.example/sample.png')).toBeUndefined();
  expect(externalImageUrl('example.png')).toBeUndefined();
 });
});
