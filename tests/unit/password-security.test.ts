import {describe,it,expect,vi} from 'vitest';
import {rejectCompromisedPassword} from '../../shared/password-security';
describe('compromised password screening',()=>{
 it('sends only a padded prefix request and rejects a matching exposed suffix',async()=>{const request=vi.fn().mockResolvedValue(new Response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:12\r\n00000000000000000000000000000000000:0'));await expect(rejectCompromisedPassword('password',request)).rejects.toThrow('公开泄露');expect(request.mock.calls[0][0]).toBe('https://api.pwnedpasswords.com/range/5BAA6');expect(request.mock.calls[0][1].headers).toEqual({'Add-Padding':'true'});});
 it('ignores padding entries with zero prevalence',async()=>{await expect(rejectCompromisedPassword('password',vi.fn().mockResolvedValue(new Response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:0')))).resolves.toBeUndefined();});
 it('fails closed if the screening provider is unavailable',async()=>{await expect(rejectCompromisedPassword('unique test',vi.fn().mockRejectedValue(new Error('offline')))).rejects.toThrow('暂不可用');});
});
