import {describe,it,expect} from 'vitest';
import {transportDecision,hstsValue,stripInternalResponseHeaders,publicActionProblem} from '../../deploy/local-server/ingress-policy.mjs';
import {publicStaticFile,staticBrowserHeaders} from '../../deploy/local-server/gateway-policy.mjs';

const tunnel={tunneled:true,remoteAddress:'127.0.0.1',origin:'https://study.example.com',rawUrl:'/backend/functions/v1/api',method:'POST'};
describe('trusted HTTPS ingress',()=>{
 it('does not accept a public Host as proof of HTTPS',()=>expect(transportDecision(tunnel)).toEqual({status:403}));
 it.each(['https,http','https, https','HTTPS','ftp','https\n'])('rejects ambiguous forwarding protocol %s',value=>expect(transportDecision({...tunnel,headers:{'x-forwarded-proto':value}})).toEqual({status:403}));
 it('accepts HTTPS forwarded by the explicit loopback tunnel',()=>expect(transportDecision({...tunnel,headers:{'x-forwarded-proto':'https','cf-visitor':'{"scheme":"https"}'}})).toEqual({secure:true}));
 it('rejects contradictory or malformed tunnel metadata',()=>{
  for(const value of ['{"scheme":"http"}','{"scheme":"ftp"}','not-json'])expect(transportDecision({...tunnel,headers:{'x-forwarded-proto':'https','cf-visitor':value}})).toEqual({status:403});
 });
 it('never trusts a remote client forging proxy headers',()=>expect(transportDecision({...tunnel,remoteAddress:'203.0.113.9',headers:{'x-forwarded-proto':'https'}})).toEqual({status:403}));
 it('redirects public HTTP reads to validated canonical HTTPS',()=>{
  expect(transportDecision({...tunnel,method:'GET',rawUrl:'/path?next=https://other.invalid',headers:{'x-forwarded-proto':'http'}})).toEqual({status:301,location:'https://study.example.com/path?next=https://other.invalid'});
 });
 it.each(['POST','PUT','PATCH','DELETE'])('rejects HTTP %s before request body or auth is processed',method=>expect(transportDecision({...tunnel,method,headers:{'x-forwarded-proto':'http'}})).toEqual({status:403}));
 it('preserves explicit direct-loopback HTTP tests but not forged remote metadata',()=>{
  expect(transportDecision({origin:'http://127.0.0.1:5178',remoteAddress:'127.0.0.1',method:'POST'})).toEqual({secure:false,local:true});
  expect(transportDecision({origin:'http://192.168.1.4:5178',remoteAddress:'192.168.1.5',method:'POST',headers:{'x-forwarded-proto':'https'}})).toEqual({status:403});
 });
 it('redirects configured LAN reads to the actual TLS port',()=>expect(transportDecision({origin:'http://192.168.1.4:5178',remoteAddress:'192.168.1.5',httpsPort:8443,method:'HEAD'})).toEqual({status:301,location:'https://192.168.1.4:8443/'}));
 it('never redirects to an unvalidated host/path or accepts a missing LAN TLS listener',()=>{
  for(const origin of ['https://name:password@study.example.com','https://study.example.com/other','javascript:alert(1)'])expect(transportDecision({...tunnel,origin})).toEqual({status:400});
  for(const rawUrl of ['//evil.invalid','/\\evil','/x\r\nHeader: value'])expect(transportDecision({...tunnel,rawUrl})).toEqual({status:400});
  expect(transportDecision({origin:'http://192.168.1.4:5178',remoteAddress:'192.168.1.5'})).toEqual({status:503});
 });
 it('uses native TLS even when a client spoofs a forwarding header',()=>expect(transportDecision({...tunnel,encrypted:true,headers:{'x-forwarded-proto':'http'}})).toEqual({secure:true}));
 it('sets one-year HSTS without silently opting into preload',()=>{expect(hstsValue()).toBe('max-age=31536000; includeSubDomains');expect(hstsValue({preload:true})).toMatch(/; preload$/);});
});
describe('public endpoint and response minimization',()=>{
 it('blocks bootstrap and worker calls without a proper credential shape',()=>{
  expect(publicActionProblem('bootstrap')).toMatchObject({status:404});
  for(const action of ['workerClaim','workerFinish','workerHealth'])for(const auth of ['', 'Bearer invalid','Bearer mw_short'])expect(publicActionProblem(action,auth)).toMatchObject({status:401});
  expect(publicActionProblem('workerClaim','Bearer mw_'+'a'.repeat(32))).toBeUndefined();expect(publicActionProblem('login')).toBeUndefined();
 });
 it('removes diagnostic response headers while preserving functional headers',()=>{
  const headers={'x-envoy-upstream-service-time':'93','X-Powered-By':'runtime',server:'envoy','server-timing':'internal','x-kong-proxy-latency':'12','content-type':'application/json','retry-after':'20','set-cookie':['opaque; HttpOnly'],'x-mango-upload-renew':'1'};
  expect(stripInternalResponseHeaders(headers)).toEqual({'content-type':'application/json','retry-after':'20','set-cookie':['opaque; HttpOnly'],'x-mango-upload-renew':'1'});
 });
 it('serves only the exact well-known security file',()=>{expect(publicStaticFile('/.well-known/security.txt')).toBe('/.well-known/security.txt');for(const path of ['/.well-known/private.txt','/.well-known/security.txt/extra','/security.txt.bak'])expect(publicStaticFile(path)).toBeUndefined();});
 it('forbids edge HTML transformation without caching personalized API responses',()=>{expect(staticBrowserHeaders('/index.html')['Cache-Control']).toBe('public, no-cache, no-transform');expect(staticBrowserHeaders('/assets/example.js')['Cache-Control']).toBeUndefined();expect(staticBrowserHeaders('/.well-known/security.txt')['Content-Type']).toBe('text/plain; charset=utf-8');});
});
