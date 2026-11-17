import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {pageFromHash} from '../../shared/navigation';
const css=readFileSync(new URL('../../src/styles/tokens.css',import.meta.url),'utf8');
const block=(pattern)=>Object.fromEntries([...css.match(pattern)[1].matchAll(/--([\w-]+):\s*(#[\da-f]{3,6})\s*;/gi)].map(m=>[m[1],m[2]]));
const light=block(/:root\s*{([\s\S]*?)}/),dark={...light,...block(/:root\[data-theme="dark"\]\s*{([\s\S]*?)}/)};
function luminance(hex){const full=hex.length===4?'#'+[...hex.slice(1)].map(c=>c+c).join(''):hex;const c=full.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];}
function contrast(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
describe('semantic contrast',()=>{for(const [name,palette]of Object.entries({light,dark})){
 for(const [foreground,background]of [['ink','surface'],['ink-secondary','surface'],['ink-secondary','page'],['blue','surface'],['on-blue','blue'],['red','red-tint'],['green','green-tint'],['amber','amber-tint'],['gold','page']])it(`${name}: ${foreground} on ${background} meets AA text`,()=>expect(contrast(palette[foreground],palette[background])).toBeGreaterThanOrEqual(4.5));
 it(`${name}: interactive input boundaries meet non-text contrast`,()=>expect(contrast(palette['line-strong'],palette.surface)).toBeGreaterThanOrEqual(3));
}});
describe('browser navigation',()=>{
 it('accepts public routes and rejects unknown hashes',()=>{expect(pageFromHash('#mine','visitor')).toBe('mine');expect(pageFromHash('#main-content','visitor')).toBeNull();expect(pageFromHash('#unknown','visitor')).toBeNull();});
 it('does not expose administrator pages as visitor routes',()=>{for(const page of ['users','review','invites','grading','trash','config','logs']){expect(pageFromHash('#'+page,'visitor')).toBeNull();expect(pageFromHash('#'+page,'admin')).toBe(page);}});
});
