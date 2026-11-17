import {it,expect} from 'vitest';
import {inviteLabelError} from '../../shared/invite-label';
import {validateApiInput} from '../../shared/api-input';
it.each(['测试备注','abc','a中b','ＡＢＣ','abc 123'])('accepts three or more Chinese/English letters: %s',label=>{expect(inviteLabelError(label)).toBeUndefined();expect(validateApiInput({action:'createInvite',loginId:'Fresh123',label})).toHaveProperty('action','createInvite');});
it.each([undefined,'','   ','ab','中文','12!','a12b','😀😀😀','abc\u200b','abc\n'])('rejects missing/short/control notes: %s',label=>{expect(inviteLabelError(label)).toBeDefined();expect(validateApiInput({action:'createInvite',loginId:'Fresh123',label})).toHaveProperty('status',400);});
