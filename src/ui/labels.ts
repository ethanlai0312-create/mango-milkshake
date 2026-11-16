export const examStates:Record<string,string>={draft:'草稿',pending:'待审核',returned:'已退回',published:'已发布',unpublished:'已撤销',deleted:'已删除'};
export const examState=(state:string)=>examStates[state]??state;
