const limits={
 api:[32,240,10],auth:[12,180,10],upload:[6,120,60],
 'tus-create':[6,120,60],'tus-chunk':[8,600,60],'tus-head':[12,240,30],
 download:[16,300,30],static:[48,3000,60],report:[4,120,20],health:[8,300,30],
};

export function createIngressBudget(now=Date.now){
 const active=new Map(),windows=new Map();
 return (route,client)=>{
  const [parallel,total,seconds]=limits[route];
  const time=now(),duration=seconds*1000;
  const window=Math.floor(time/duration);
  let budget=windows.get(route);
  if(!budget||budget.window!==window){
   budget={window,total:0,clients:new Map()};
   windows.set(route,budget);
  }
  if((active.get(route)??0)>=parallel)return {status:503,retry:2};
  const perClient=Math.ceil(total/3);
  const hits=budget.clients.get(client)??0;
  if(budget.total>=total||hits>=perClient)return {status:429,retry:Math.max(1,Math.ceil(((window+1)*duration-time)/1000))};
  budget.total++;
  budget.clients.set(client,hits+1);
  active.set(route,(active.get(route)??0)+1);
  let released=false;
  return {release(){
   if(released)return;
   released=true;
   active.set(route,active.get(route)-1);
  }};
 };
}
