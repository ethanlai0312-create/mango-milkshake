export const PRESENCE_HEARTBEAT_MS=5000;
export const PRESENCE_REFRESH_MS=1000;
export const PRESENCE_TIMEOUT_SECONDS=15;
export const validPresenceId=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function validPresenceUpdate(tab:unknown,sequence:unknown,online:unknown){return validPresenceId(tab)&&typeof sequence==='number'&&Number.isSafeInteger(sequence)&&sequence>=0&&typeof online==='boolean';}
