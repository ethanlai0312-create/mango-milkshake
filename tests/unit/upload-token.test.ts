import {describe,it,expect} from 'vitest';
import {uploadTokenNeedsRenewal} from '../../shared/upload-token';
const token=(exp:number)=>'header.'+btoa(JSON.stringify({exp}))+'.signature';
describe('短期上传签名自动续期',()=>{
 it('有效签名不提前反复续签',()=>expect(uploadTokenNeedsRenewal(token(100),60000)).toBe(false));
 it('接近过期和已过期均续签',()=>{expect(uploadTokenNeedsRenewal(token(100),71000)).toBe(true);expect(uploadTokenNeedsRenewal(token(100),101000)).toBe(true);});
 it('损坏或缺失exp的签名重新申请',()=>{expect(uploadTokenNeedsRenewal('broken',1)).toBe(true);expect(uploadTokenNeedsRenewal('header.'+btoa('{}')+'.signature',1)).toBe(true);});
});
