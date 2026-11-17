import {describe,it,expect} from 'vitest';
import {fileSizeError,inspectFile} from '../../shared/files';
describe('文件大小与内容校验',()=>{
 it.each([1,1000000,49999999,50000000,50000001,2000000000,Number.MAX_SAFE_INTEGER])('接受允许大小 %s',size=>expect(fileSizeError(size)).toBeNull());
 it.each([0,-1,Number.MAX_SAFE_INTEGER+1,NaN,Infinity,1.5])('拒绝非法大小 %s',size=>expect(fileSizeError(size)).not.toBeNull());
 it('真实PNG签名',()=>expect(inspectFile('photo.PNG',new Uint8Array([137,80,78,71,13,10,26,10])).mime).toBe('image/png'));
 it('伪装PNG不能通过仅扩展名校验',()=>expect(()=>inspectFile('bad.png',new TextEncoder().encode('<script>alert(1)</script>'))).toThrow('不匹配'));
 it('即使换扩展名仍拒绝可执行文件',()=>expect(()=>inspectFile('bad.doc',new Uint8Array([77,90,0,0]))).toThrow('可执行'));
 it('支持上传HEIC但不假称浏览器可预览',()=>{const a=new Uint8Array(20);a.set(new TextEncoder().encode('ftypheic'),4);expect(inspectFile('a.heic',a).preview).toBe(false);});
 it('HTML强制下载，不能在平台内执行脚本',()=>expect(inspectFile('a.html',new TextEncoder().encode('<html><p>Hello</p></html>')).forceDownload).toBe(true));
});
