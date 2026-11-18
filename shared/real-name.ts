export const realNamePattern=/^\p{Script=Han}{3,4}$/u;

/** Primary-admin-only display text. All callers must already be authorized for admin views. */
export function realNameError(value:unknown){
 const text=String(value??'').trim();
 if(!text)return null;
 return realNamePattern.test(text)?null:'真名必须是3-4个中文字';
}
