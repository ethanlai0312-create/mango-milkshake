import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
let folder, source;
beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), 'mango-sw-test-'));
    await writeFile(join(folder, 'index.html'), 'fixture');
    execFileSync(process.execPath, ['scripts/build-sw.mjs', folder], { windowsHide: true });
    source = await readFile(join(folder, 'sw.js'), 'utf8');
});
afterAll(async () => {
    if (folder && dirname(resolve(folder)) === resolve(tmpdir()) && basename(folder).startsWith('mango-sw-test-'))
        await rm(folder, { recursive: true, force: true });
});
function worker(fails = false) {
    const listeners = new Map();
    let fetches = 0, cached = 0;
    runInNewContext(source, {
        URL, Request, Response,
        self: { registration: { scope: 'https://fixture.invalid/' }, location: { origin: 'https://fixture.invalid' }, navigator: { onLine: false }, addEventListener: (kind, handler) => listeners.set(kind, handler) },
        caches: { open: async () => ({ match: async () => { cached++; return new Response('cached', { headers: { 'content-security-policy': "default-src 'none'" } }); } }) },
        fetch: async () => { fetches++; if (fails)
            throw new TypeError('Synthetic transport failure'); return new Response('network'); },
    });
    return { navigate: async () => {
            let response;
            listeners.get('fetch')({ request: { method: 'GET', mode: 'navigate', url: 'https://fixture.invalid/' }, respondWith: (next) => response = next });
            return response;
        }, stats: () => ({ fetches, cached }) };
}
it('tries actual navigation despite a false OS offline hint', async () => {
    const fixture = worker();
    expect(await (await fixture.navigate()).text()).toBe('network');
    expect(fixture.stats()).toEqual({ fetches: 1, cached: 0 });
});
it('falls back after actual transport failure and preserves cached browser policy', async () => {
    const fixture = worker(true), response = await fixture.navigate();
    expect(await response.text()).toBe('cached');
    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'");
    expect(fixture.stats()).toEqual({ fetches: 1, cached: 1 });
});
