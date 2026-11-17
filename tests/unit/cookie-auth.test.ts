import {it,expect,vi,afterEach} from 'vitest';
import {createCookieAuthClient} from '../../src/lib/cookie-auth';
afterEach(()=>vi.unstubAllGlobals());
it('browser adapter uses cookie metadata and sends a JSON MFA challenge without storing tokens',async()=>{
 vi.stubGlobal('BroadcastChannel',undefined);vi.stubGlobal('localStorage',{'sb-old-auth-token':'private-old-token',removeItem:vi.fn()});
 const session={session_id:'60000000-0000-4000-8000-000000000001',user:{id:'60000000-0000-4000-8000-000000000002'}};
 const fetcher=vi.fn(async(url:string)=>Response.json(url.endsWith('/challenge')?{id:'challenge-id'}:url.endsWith('/verify')?session:{session}));vi.stubGlobal('fetch',fetcher);
 const client=createCookieAuthClient('/backend','public-key');expect(localStorage.removeItem).toHaveBeenCalledWith('sb-old-auth-token');expect((await client.auth.getSession()).data.session).toEqual(session);
 await client.auth.mfa.challengeAndVerify({factorId:'factor-id',code:'123456'});
 const challenge=fetcher.mock.calls.find(([url])=>url.endsWith('/challenge'))! as unknown as [string,RequestInit];expect(challenge[1].body).toBe('{}');expect(challenge[1].headers).toMatchObject({'Content-Type':'application/json','X-Mango-Requested-With':'1'});
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
