import {describe,it,expect} from 'vitest';
import {conversionFormats,targetsFor} from '../../shared/conversion';
describe('真实转换能力',()=>{
 it('大小写文件名与新增格式',()=>{expect(targetsFor('report.PDF')).toEqual(['docx','png','txt']);expect(targetsFor('photo.WEBP')).toEqual(['pdf']);});
 it('未验证格式不能假装支持',()=>{for(const extension of ['wps','et','dps','pages','numbers','key'])expect(targetsFor('private.'+extension)).toEqual([]);});
 it('所有输入的目标不重复且不能原格式转换',()=>{for(const [source,targets] of Object.entries(conversionFormats)){expect(new Set(targets).size).toBe(targets.length);expect(targets).not.toContain(source);}});
});
