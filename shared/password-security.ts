// Only a five-character SHA-1 prefix leaves the trusted server. This digest is
// for the HIBP range protocol; Supabase Auth remains responsible for password hashing.
export async function rejectCompromisedPassword(password:string,request:typeof fetch=fetch){
 const bytes=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(password));
 const digest=Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
 let response:Response;try{response=await request('https://api.pwnedpasswords.com/range/'+digest.slice(0,5),{headers:{'Add-Padding':'true'},signal:AbortSignal.timeout(5000)});}catch{throw new Error('密码泄露检查暂不可用，请稍后重试');}
 if(!response.ok)throw new Error('密码泄露检查暂不可用，请稍后重试');
 const suffix=digest.slice(5);if((await response.text()).split(/\r?\n/).some(line=>{const [hash,count]=line.split(':');return hash===suffix&&Number(count)>0;}))throw new Error('该密码已出现在公开泄露数据中，请选择独立的新密码');
}

export function passwordError(value: unknown): string | null {
 if(typeof value !== 'string' || value.length<10 || !/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return '密码至少10位，包含字母和数字';
 if(new TextEncoder().encode(value).length>72) return '密码的UTF-8长度不能超过72字节';
 return null;
}

/** The self-hosted installation does not send password digests to external services. */
export function localNewPasswordError(password:string,username:string){
 const normalized=password.toLowerCase();
 if(password.length<12)return '新密码至少12位，包含字母和数字';
 if(normalized===username.toLowerCase()||/^(?:[a-z]{1,4}|password|qwerty|admin|mango)\d+$/i.test(password))
  return '新密码过于常见，请改用独立密码';
 return null;
}

// Allow a class behind one NAT. Login also has an IP/device/account-pair budget
// and bounded global failed-account backoff, rather than an account-wide lockout.
export function authIpLimit(action: string): number {
 return action==='login'?120:action==='register'?40:4;
}
