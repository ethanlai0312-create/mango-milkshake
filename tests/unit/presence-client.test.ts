import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const fixtures=vi.hoisted(()=>({readSession:vi.fn(),expired:vi.fn(()=>false),markExpired:vi.fn(),acceptDeadline:vi.fn()}));
vi.mock('../../src/lib/api',()=>({cookieAuth:false,readSession:fixtures.readSession,supabaseUrl:'https://local.example/_backend'}));
vi.mock('../../src/lib/session-idle',()=>({sessionId:()=> '5370c8ea-bdf0-4fbf-94cd-9838a5e99124',isIdleExpired:fixtures.expired,markIdleExpired:fixtures.markExpired,acceptIdleDeadline:fixtures.acceptDeadline,SESSION_EXPIRED:'SESSION_EXPIRED'}));
import {startAccountPresence,PRESENCE_REQUEST_TIMEOUT_MS,type PresenceConnection} from '../../src/lib/presence';

const user='5370c8ea-bdf0-4fbf-94cd-9838a5e99125';
const response=()=>Response.json({data:{ok:true},idle_expires_at:'2026-11-16T01:00:00.000Z',server_time:'2026-11-16T00:00:00.000Z'});
let browser:EventTarget,doc:EventTarget&{visibilityState:string},fetcher:ReturnType<typeof vi.fn>,stop:(()=>void)|undefined;
const flush=()=>vi.advanceTimersByTimeAsync(0);

beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-16T00:00:00.000Z'));
 vi.clearAllMocks();fixtures.expired.mockReturnValue(false);
 fixtures.readSession.mockResolvedValue({data:{session:{user:{id:user},access_token:'synthetic-token'}}});
 browser=new EventTarget();doc=Object.assign(new EventTarget(),{visibilityState:'visible'});
 vi.stubGlobal('window',browser);vi.stubGlobal('document',doc);vi.stubGlobal('navigator',{onLine:false});
 fetcher=vi.fn(async()=>response());vi.stubGlobal('fetch',fetcher);
});
afterEach(()=>{stop?.();stop=undefined;vi.useRealTimers();vi.unstubAllGlobals();});

describe('server-confirmed account presence',()=>{
 it('sends a heartbeat despite an offline OS hint and confirms only a successful API response',async()=>{
  const states:PresenceConnection[]=[];stop=startAccountPresence(user,state=>states.push(state));
  expect(states).toEqual(['checking']);
  await flush();expect(states.at(-1)).toBe('connected');
  expect(fixtures.readSession).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({action:'presence',sequence:1,online:true});
  expect(fixtures.acceptDeadline).toHaveBeenCalled();
 });
 it('uses network hints and focus as retry events without marking successful connectivity offline',async()=>{
  const states:PresenceConnection[]=[];stop=startAccountPresence(user,state=>states.push(state));await flush();
  browser.dispatchEvent(new Event('offline'));await flush();
  browser.dispatchEvent(new Event('focus'));await flush();
  expect(states).toEqual(['checking','connected','connected','connected']);
  expect(fetcher).toHaveBeenCalledTimes(3);
 });
 it('releases a stalled session request by the deadline and recovers on a later retry',async()=>{
  fixtures.readSession.mockImplementationOnce(()=>new Promise(()=>{}));
  const states:PresenceConnection[]=[];stop=startAccountPresence(user,state=>states.push(state));
  await vi.advanceTimersByTimeAsync(PRESENCE_REQUEST_TIMEOUT_MS);
  expect(states.at(-1)).toBe('unavailable');expect(fetcher).not.toHaveBeenCalled();
  browser.dispatchEvent(new Event('online'));await flush();
  expect(states.at(-1)).toBe('connected');expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('aborts a stalled HTTP/body transfer and retries without a permanently locked heartbeat',async()=>{
  let signal:AbortSignal|undefined;
  fetcher.mockImplementationOnce(async(_url,options)=>{signal=options.signal;return new Promise(()=>{});});
  const states:PresenceConnection[]=[];stop=startAccountPresence(user,state=>states.push(state));await flush();
  await vi.advanceTimersByTimeAsync(PRESENCE_REQUEST_TIMEOUT_MS);
  expect(signal?.aborted).toBe(true);expect(states.at(-1)).toBe('unavailable');
  browser.dispatchEvent(new Event('focus'));await flush();expect(states.at(-1)).toBe('connected');
 });
 it('preserves the idle deadline and marks a server-expired session instead of claiming connectivity',async()=>{
  fetcher.mockResolvedValueOnce(Response.json({code:'SESSION_EXPIRED',error:'Expired'},{status:401}));
  const states:PresenceConnection[]=[];stop=startAccountPresence(user,state=>states.push(state));await flush();
  expect(states.at(-1)).toBe('unavailable');expect(fixtures.markExpired).toHaveBeenCalledTimes(1);
  expect(fixtures.acceptDeadline).not.toHaveBeenCalled();
  for(const call of fetcher.mock.calls)expect(JSON.parse(call[1].body).action).toBe('presence');
 });
 it('does not overwrite the last confirmed state with an OS hint or a brief network failure',async()=>{
  const states:PresenceConnection[]=[];stop=startAccountPresence(user,state=>states.push(state));await flush();
  fetcher.mockRejectedValueOnce(new TypeError('network failure'));
  browser.dispatchEvent(new Event('offline'));await flush();expect(states.at(-1)).toBe('reconnecting');
  await vi.advanceTimersByTimeAsync(5000);expect(states.at(-1)).toBe('connected');
 });
 it('sends an ordered leave marker and restores the same tab after a back-forward cache return',async()=>{
  const states:PresenceConnection[]=[];stop=startAccountPresence(user,state=>states.push(state));await flush();
  browser.dispatchEvent(new Event('pagehide'));await flush();
  const left=fetcher.mock.calls[1][1];expect(left.keepalive).toBe(true);
  expect(JSON.parse(left.body)).toMatchObject({online:false,sequence:2});
  browser.dispatchEvent(new Event('pageshow'));await flush();
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({online:true,sequence:3,tab:JSON.parse(left.body).tab});
  expect(states.at(-1)).toBe('connected');
 });
 it('cleans listeners/timers and never publishes a late successful response after disposal',async()=>{
  let complete:(value:Response)=>void=()=>{};
  fetcher.mockImplementationOnce(()=>new Promise<Response>(resolve=>{complete=resolve;}));
  const states:PresenceConnection[]=[];stop=startAccountPresence(user,state=>states.push(state));await flush();
  stop();stop=undefined;const calls=fetcher.mock.calls.length;
  complete(response());await flush();
  browser.dispatchEvent(new Event('focus'));await vi.advanceTimersByTimeAsync(20000);
  expect(fetcher.mock.calls).toHaveLength(calls);expect(states).toEqual(['checking']);
 });
});
