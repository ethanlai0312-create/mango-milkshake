import {it,expect} from 'vitest';
import {passwordError} from '../../shared/password-security';
it('accepts exactly72 ASCII bytes',()=>expect(passwordError('A1'+'x'.repeat(70))).toBeNull());
it('rejects73 bytes before changing credentials',()=>expect(passwordError('A1'+'x'.repeat(71))).toContain('72'));
it('counts UTF8 bytes',()=>{expect(passwordError('A1'+'中'.repeat(23))).toBeNull();expect(passwordError('A1'+'中'.repeat(24))).toContain('72');});
