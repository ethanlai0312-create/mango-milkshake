import {api,supabase} from './api';
import {promptText} from './dialogs';

const sensitiveActions = new Set(['purgeAccount','purgeExam','userState','resetPassword','saveConfig']);
export type AdminFactor={id:string;name:string};
export const readAdminFactors=()=>api<AdminFactor[]>('adminMfaFactors');

export async function verifyAdminFactor(factorId:string,code:string){
 if(!/^\d{6}$/.test(code))throw new Error('请输入验证器的六位数字');
 const {error}=await supabase.auth.mfa.challengeAndVerify({factorId,code});
 if(error)throw new Error('验证码无效或已使用，请检查时间后重试');
}

export async function confirmAdminAction(action:string){
 if(!sensitiveActions.has(action))return true;
 const factors=await readAdminFactors();
 if(!factors.length)throw new Error('请先在个人设置中设置管理员验证器');
 const code=await promptText('请用管理员验证器确认这一次操作，输入六位验证码。');
 if(code===null)return false;
 await verifyAdminFactor(factors[0].id,code.trim());
 return true;
}
