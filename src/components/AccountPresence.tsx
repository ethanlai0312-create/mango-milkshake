export function AccountPresence({username,online,unknown=false}:{username:string;online:boolean;unknown?:boolean}){
 const state=unknown?'unknown':online?'online':'offline',label=unknown?'状态未知':online?'在线':'离线';
 return <span className={'presence-state '+state} role="status" aria-label={username+'：'+label} data-presence={state}><i aria-hidden="true"/>{label}</span>;
}
