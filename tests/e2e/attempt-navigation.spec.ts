import {expect,test} from '@playwright/test';
import {installLayoutApi,loginLayoutFixture} from '../fixtures/layout-api';
test.use({serviceWorkers:'block',reducedMotion:'reduce'});
async function openAttempt(page){
 await installLayoutApi(page);await loginLayoutFixture(page);
 await page.goto('/?attempt-nav=1#exams');
 await page.getByRole('button',{name:'开始答题',exact:true}).first().click();
 await expect(page.locator('.number-grid')).toBeVisible();
 await page.evaluate(()=>{const aside=[...document.querySelectorAll('.attempt-grid>aside')].find(n=>!n.closest('.route-outgoing')&&n.getBoundingClientRect().width>0)!;const grid=aside.querySelector('.number-grid')!;for(let i=0;i<140;i++){const b=document.createElement('button');b.textContent=String(100+i);grid.appendChild(b);}});
}
test('attempt question navigation is sticky and scrolls independently on desktop',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await openAttempt(page);
 const m=await page.evaluate(()=>{const a=document.querySelector('.attempt-grid>aside') as HTMLElement,c=getComputedStyle(a);return {position:c.position,top:c.top,overflowY:c.overflowY,clientHeight:a.clientHeight,scrollHeight:a.scrollHeight,viewport:innerHeight};});
 expect(m.position).toBe('sticky');expect(m.overflowY).toBe('auto');expect(m.scrollHeight).toBeGreaterThan(m.clientHeight);expect(m.clientHeight).toBeLessThanOrEqual(m.viewport);
});
test('attempt question navigation stacks and scrolls on phone',async({page})=>{
 await page.setViewportSize({width:390,height:844});await openAttempt(page);
 await page.waitForTimeout(500);
 const m=await page.evaluate(()=>{const a=[...document.querySelectorAll('.attempt-grid>aside')].find(n=>!n.closest('.route-outgoing')&&n.getBoundingClientRect().width>0) as HTMLElement;const grid=a.parentElement as HTMLElement;const c=getComputedStyle(a),g=getComputedStyle(grid),n=getComputedStyle(a.querySelector('.number-grid')!);return {direction:g.flexDirection,position:c.position,maxHeight:c.maxHeight,height:a.getBoundingClientRect().height,scrollHeight:a.scrollHeight,viewport:innerHeight,columns:n.gridTemplateColumns.split(' ').length};});
 expect(m.direction).toBe('column');expect(m.position).toBe('sticky');expect(m.height).toBeLessThanOrEqual(360);
});
