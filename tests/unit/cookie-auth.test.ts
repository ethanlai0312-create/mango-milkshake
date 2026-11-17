import {it,expect,vi,afterEach} from 'vitest';
import {createCookieAuthClient} from '../../src/lib/cookie-auth';
afterEach(()=>vi.unstubAllGlobals());
it('browser adapter loads cookie metadata without storing tokens',async()=>{
 vi.stubGlobal('BroadcastChannel',undefined);vi.stubGlobal('localStorage',{'sb-old-auth-token':'private-old-token',removeItem:vi.fn()});
 const session={session_id:'60000000-0000-4000-8000-000000000001',user:{id:'60000000-0000-4000-8000-000000000002'}};
 const fetcher=vi.fn(async()=>Response.json({session}));vi.stubGlobal('fetch',fetcher);
 const client=createCookieAuthClient('/backend','public-key');expect(localStorage.removeItem).toHaveBeenCalledWith('sb-old-auth-token');expect((await client.auth.getSession()).data.session).toEqual(session);
 for(const call of fetcher.mock.calls as unknown as [string,RequestInit][])expect(call[1].headers).not.toHaveProperty('Authorization');
});
it('a late pre-login metadata response cannot overwrite the new login session',async()=>{
 vi.stubGlobal('BroadcastChannel',undefined);vi.stubGlobal('localStorage',{removeItem:vi.fn()});let finish!:(response:Response)=>void;
 const next={session_id:'60000000-0000-4000-8000-000000000003',user:{id:'60000000-0000-4000-8000-000000000004'}};
 const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=resolve;})).mockResolvedValueOnce(Response.json({session:next}));vi.stubGlobal('fetch',fetcher);
 const client=createCookieAuthClient('/backend','public-key'),old=client.auth.getSession();const discarded=expect(old).rejects.toThrow('登录状态已变化');
 expect((await client.auth.setSession({access_token:'ignored',refresh_token:'ignored'})).data.session).toEqual(next);
 finish(Response.json({session:null}));await discarded;
});
