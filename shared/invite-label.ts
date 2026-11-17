/** Invitation notes require at least three Chinese characters or English letters. */
export function inviteLabelError(value:unknown):string|undefined{
 if(typeof value!=='string'||value.length>100||/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/.test(value))return '备注格式无效，最多100字且不能包含控制字符';
 if((value.normalize('NFKC').match(/[A-Za-z\u3400-\u4dbf\u4e00-\u9fff]/g)??[]).length<3)return '备注至少包含3个中文字或英文字母，空格、数字和标点不计数';
}
