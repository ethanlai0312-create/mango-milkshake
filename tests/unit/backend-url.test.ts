import {describe,it,expect} from 'vitest';
import {resolveBackendUrl} from '../../shared/backend-url';
describe('同源后端地址',()=>{
 it('局域网HTTPS跟随实际访问设备地址',()=>expect(resolveBackendUrl('/backend','https://192.168.50.17:8443')).toBe('https://192.168.50.17:8443/backend'));
 it('本机HTTP也使用同源前缀',()=>expect(resolveBackendUrl('/backend','http://127.0.0.1:5178')).toBe('http://127.0.0.1:5178/backend'));
 it('云端配置不改变',()=>expect(resolveBackendUrl('https://example.supabase.co/','https://study.example')).toBe('https://example.supabase.co'));
 it('拒绝非HTTP协议或嵌入凭据',()=>{expect(()=>resolveBackendUrl('file:///private','https://study.example')).toThrow();expect(()=>resolveBackendUrl('https://user:pass@study.example','https://study.example')).toThrow();});
});
