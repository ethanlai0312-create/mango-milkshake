import {it,expect} from 'vitest';
import {backendRoute} from '../../deploy/local-server/gateway-policy.mjs';
const file='11111111-1111-4111-8111-111111111111';
const owner='22222222-2222-4222-8222-222222222222';
const token='a.b.c';
it('accepts opaque new upload paths and the legacy owner path',()=>{
 const q=new URLSearchParams({token});
 expect(backendRoute('/storage/v1/object/upload/sign/mango-private/files/'+file+'/avatar.png',q,'PUT')).toBe('upload');
 expect(backendRoute('/storage/v1/object/upload/sign/mango-private/'+owner+'/'+file+'/avatar.png',q,'PUT')).toBe('upload');
});
it('accepts signed downloads for both storage layouts',()=>{
 const q=new URLSearchParams({token});
 expect(backendRoute('/storage/v1/object/sign/mango-private/files/'+file+'/avatar.png',q,'GET')).toBe('download');
 expect(backendRoute('/storage/v1/object/sign/mango-private/'+owner+'/'+file+'/avatar.png',q,'GET')).toBe('download');
});
