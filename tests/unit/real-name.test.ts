import {it,expect} from 'vitest';
import {realNameError} from '../../shared/real-name';
it('accepts only three or four Han characters',()=>{
 expect(realNameError('张三丰')).toBeNull();
 expect(realNameError('欧阳小明')).toBeNull();
 expect(realNameError('张三')).not.toBeNull();
 expect(realNameError('张三丰四五')).not.toBeNull();
});
it('accepts empty as a clear request and rejects non-Chinese',()=>{
 expect(realNameError('')).toBeNull();
 expect(realNameError('  ')).toBeNull();
 expect(realNameError('张三a')).not.toBeNull();
 expect(realNameError('Zhang')).not.toBeNull();
});
