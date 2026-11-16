// Exact business messages emitted by the checked-in database migrations.
const businessMessages=new Set([
 "CONFLICT:其他设备已有新答案",
 "CONFLICT:审核期间试卷已修改，请重新检查",
 "CONFLICT:成绩已有更新，请重新载入",
 "CONFLICT:试卷已修改，请刷新后重试",
 "CONFLICT:试卷已修改，请重新载入",
 "CONFLICT:试卷有新版本，请保留本地内容后重新载入",
 "Invite registration required",
 "上传超出账号容量，请删除不需要的文件后重试",
 "不存在",
 "不能停用自己",
 "不能删除管理员账号",
 "不能删除自己",
 "会话已失效",
 "保留账号名",
 "共享文件不存在或已删除",
 "原试卷附件已删除，请检查后重新复制",
 "头像必须是本人已验证的图片",
 "密令不存在",
 "密令无效、过期或已用尽",
 "密码修改方式无效",
 "当前状态不能提交",
 "当前试卷状态不允许此操作",
 "必须先提交审核",
 "批改分数无效",
 "文件仍被试卷或历史版本引用，不能删除",
 "文件名称不能为空",
 "无效写入操作",
 "无效操作",
 "无权限",
 "无权限或账号不可用",
 "替换文件无效",
 "最多同时上传两个文件，请完成或取消已有上传",
 "本试卷不允许重复答题",
 "正在运行的转换暂不能删除",
 "没有上传权限",
 "注册预约不存在或已完成",
 "确认名称不匹配",
 "答卷不存在",
 "答卷不存在或尚未提交",
 "答卷文件需要保留，不能单独删除",
 "答题时间已到，请刷新载入已保存答案后再提交；未同步的本地答案仍保留",
 "试卷不在回收站",
 "试卷不存在",
 "试卷不存在或已永久清除",
 "试卷在回收站",
 "试卷已永久移出回收站",
 "试卷未发布",
 "请先删除相关转换记录",
 "请先更换当前头像",
 "请在设置中修改自己的密码",
 "请填写退回原因",
 "请通过平台安全密码接口修改密码",
 "账号不可用",
 "账号不存在",
 "账号不存在或已删除",
 "账号名确认不一致",
 "转换文件不存在或无权限",
 "转换文件尚未到期",
 "转换服务队列已满，请稍后重试",
 "转换配额已满：每个24小时窗口最多50个任务",
 "转换配额已满：每个账号最多8个待处理任务",
 "配置无效",
 "附件已删除或尚未验证，请重新上传",
 "需要管理员权限",
]);

export class PublicApiError extends Error {
 constructor(message:string,readonly status=400,readonly code?:string){super(message);this.name='PublicApiError';}
}

export function databaseError(error:{code?:string;message?:string}):PublicApiError{
 switch(error.code){
  case '23505':return new PublicApiError('记录已存在或请求重复，请刷新后重试',409);
  case '23503':return new PublicApiError('记录仍有关联数据，不能执行此操作',409);
  case 'PGRST116':return new PublicApiError('记录不存在或状态已变化，请刷新后重试',404);
  case '40001':case '40P01':case '55P03':return new PublicApiError('CONFLICT:数据正在更新，请稍后重试',409);
  case '42501':return new PublicApiError('无权限执行此操作',403);
  case 'P0001':{
   const message=error.message??'';
   if(businessMessages.has(message))return new PublicApiError(message,message.startsWith('CONFLICT:')?409:message.startsWith('转换配额')||message.startsWith('转换服务队列')?429:400);
  }
 }
 return new PublicApiError('服务暂时无法完成操作，请稍后重试',500);
}

export function publicError(error:unknown){
 if(error instanceof PublicApiError)return {status:error.status,error:error.message,code:error.status===401?error.code:undefined};
 const message=error instanceof Error?error.message:'';
 if(message==='该密码已出现在公开泄露数据中，请选择独立的新密码')return {status:400,error:message,code:undefined};
 if(message==='密码泄露检查暂不可用，请稍后重试')return {status:503,error:message,code:undefined};
 return {status:500,error:'服务暂时无法完成操作，请稍后重试',code:undefined};
}
