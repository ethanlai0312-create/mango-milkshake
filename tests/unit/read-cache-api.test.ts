import {afterEach,it,expect,vi} from 'vitest';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.resetModules();vi.doUnmock('@supabase/supabase-js');});
async function fixture(){
 vi.doMock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'account-a'},access_token:'synthetic-session'}},error:null})}})}));
 vi.stubGlobal('window',{location:{origin:'https://example.test'}});vi.stubEnv('VITE_SUPABASE_URL','/backend');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','public-test-key');
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const cache=await import('../../src/lib/read-cache');cache.setReadCacheAccount('account-a');
 const {api}=await import('../../src/lib/api');
 return {api,cache,fetcher};
}
it('cached display data does not replace real API requests',async()=>{
 const f=await fixture();f.fetcher.mockResolvedValueOnce(new Response('{"data":[1]}')).mockResolvedValueOnce(new Response('{"data":[2]}'));
 expect(await f.api('exams',{})).toEqual([1]);expect(f.cache.peekRead('exams')).toEqual([1]);
 expect(await f.api('exams',{})).toEqual([2]);expect(f.cache.peekRead('exams')).toEqual([2]);expect(f.fetcher).toHaveBeenCalledTimes(2);
});
it('a successful mutation invalidates cache and late reads cannot resurrect it',async()=>{
 const f=await fixture();let resolve!:(response:Response)=>void;
 f.fetcher.mockImplementation((_url,init)=>JSON.parse(init.body).action==='exams'?new Promise<Response>(r=>{resolve=r;}):Promise.resolve(new Response('{"data":{"saved":true}}')));
 const old=f.api('exams',{});await vi.waitFor(()=>expect(resolve).toBeDefined());
 await expect(f.api('createExam',{title:'缓存回归'})).resolves.toEqual({saved:true});
 resolve(new Response('{"data":["old"]}'));await expect(old).resolves.toEqual(['old']);expect(f.cache.peekRead('exams')).toBeUndefined();
});
it('authorization failures remove cached display data without replaying requests',async()=>{
 const f=await fixture();f.fetcher.mockResolvedValueOnce(new Response('{"data":[1]}')).mockResolvedValueOnce(new Response('denied',{status:403}));
 await f.api('exams');expect(f.cache.peekRead('exams')).toEqual([1]);
 await expect(f.api('exams')).rejects.toThrow('403');expect(f.cache.peekRead('exams')).toBeUndefined();expect(f.fetcher).toHaveBeenCalledTimes(2);
});
it('intent prefetch and an identical pending page read share one request',async()=>{
 const f=await fixture();let resolve!:(response:Response)=>void;
 f.fetcher.mockImplementation(()=>new Promise<Response>(r=>{resolve=r;}));
 const first=f.api('exams',{mode:'public',search:'',offset:0}),second=f.api('exams',{mode:'public',search:'',offset:0});
 await vi.waitFor(()=>expect(resolve).toBeDefined());expect(f.fetcher).toHaveBeenCalledTimes(1);
 resolve(new Response('{"data":[1]}'));expect(await first).toEqual([1]);expect(await second).toEqual([1]);
});
it.each([401,403])('preserves HTTP %i so a cached view can remove private display data',async(status)=>{
 const f=await fixture();f.fetcher.mockResolvedValueOnce(new Response('{"error":"Access denied"}',{status}));
 await expect(f.api('files')).rejects.toMatchObject({name:'ApiError',status});
});
it('tester file reads use the authenticated stream without exposing a storage path',async()=>{
 const f=await fixture();f.cache.setReadCacheAccount('account-a','tester');vi.useFakeTimers();
 const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:synthetic-preview');
 f.fetcher.mockResolvedValueOnce(new Response('synthetic bytes',{headers:{'content-type':'application/octet-stream','x-mango-file-mime':'image/png','x-mango-file-name':encodeURIComponent('示例.png')}}));
 const result=await f.api('fileUrl',{id:'60000000-0000-4000-8000-000000000001',download:true});
 expect(JSON.parse(f.fetcher.mock.calls[0][1].body)).toEqual({action:'testerFile',id:'60000000-0000-4000-8000-000000000001'});
 expect(result).toEqual({signedUrl:'blob:synthetic-preview',mime:'image/png',name:'示例.png'});expect(create).toHaveBeenCalledOnce();
 f.cache.setReadCacheAccount();vi.useRealTimers();create.mockRestore();
});
it('a file response that completes after account switching is discarded',async()=>{
 const f=await fixture();f.cache.setReadCacheAccount('account-a','tester');const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:late-private');const revoke=vi.spyOn(URL,'revokeObjectURL');let complete!:(r:Response)=>void;
 f.fetcher.mockImplementation(()=>new Promise<Response>(resolve=>{complete=resolve;}));
 const pending=f.api('fileUrl',{id:'60000000-0000-4000-8000-000000000001'});await vi.waitFor(()=>expect(complete).toBeDefined());f.cache.setReadCacheAccount('account-b','visitor');complete(new Response('old account bytes'));
 await expect(pending).rejects.toThrow('账号已切换');expect(revoke).toHaveBeenCalledWith('blob:late-private');create.mockRestore();revoke.mockRestore();
});
