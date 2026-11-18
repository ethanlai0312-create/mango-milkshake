import {test,expect} from '@playwright/test';
import {installLayoutApi,loginLayoutFixture,resizeLayoutViewport} from '../fixtures/layout-api';
test.use({ignoreHTTPSErrors:true,serviceWorkers:'block',reducedMotion:'reduce'});
for(const role of ['admin','secondary_admin','tester','visitor'] as const)test(role+' keeps cards separated and table dividers complete',async({page})=>{
 await installLayoutApi(page,role);await loginLayoutFixture(page);for(const width of [1440,390]){await resizeLayoutViewport(page,{width,height:900});for(const route of ['settings','shared','convert','mine','history',...(role==='admin'?['users','invites','review','grading','logs','trash','config']:role==='secondary_admin'?['review','grading']:[])]){await page.goto('/?spacing='+role+route+width+'#'+route);await expect(page.locator('main > .page-surface > .route-content h1')).toBeVisible();const touching=await page.locator('main > .page-surface > .route-content').evaluate(root=>Array.from(root.querySelectorAll('.card')).filter(n=>!n.closest('.route-outgoing')).flatMap(n=>{const next=n.nextElementSibling;if(!next?.classList.contains('card'))return [];const a=n.getBoundingClientRect(),b=next.getBoundingClientRect();if(!a.width||!b.width)return [];const gap=Math.max(b.left-a.right,a.left-b.right,b.top-a.bottom,a.top-b.bottom);return gap<4?[{gap,tag:n.tagName,class:n.className}]:[];}));expect(touching,role+' '+route+' '+width).toEqual([]);if(role==='admin'&&route==='users'&&width===1440){const cell=page.locator('.user-records tbody tr').first().locator('td').last();await expect(cell).toHaveCSS('display','table-cell');expect(await cell.evaluate(n=>parseFloat(getComputedStyle(n).borderBottomWidth))).toBeGreaterThan(0);}}}
});

test('home quick cards align for every role and width',async({page})=>{
 for(const role of ['admin','secondary_admin','tester','visitor'] as const)for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  await installLayoutApi(page,role);await loginLayoutFixture(page);
  await page.goto('/?quick='+role+width+'#home');
  await expect(page.getByRole('heading',{name:/你好/})).toBeVisible();
  const cards=await page.locator('.quick-card').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),c=getComputedStyle(n);return {top:Math.round(r.top),height:Math.round(r.height),marginTop:c.marginTop}}));
  expect(cards.length).toBe(3);
  expect(cards.map(c=>c.marginTop)).toEqual(['0px','0px','0px']);
  if(width>800){expect(new Set(cards.map(c=>c.top)).size).toBe(1);expect(new Set(cards.map(c=>c.height)).size).toBe(1);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
});

test('impersonation banner content aligns with the page and never overflows',async({page})=>{
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  await installLayoutApi(page,'secondary_admin');await loginLayoutFixture(page);
  await page.evaluate(()=>sessionStorage.setItem('mango-impersonating','1'));
  await page.goto('/?banner='+width+'#home');
  await expect(page.getByRole('heading',{name:/你好/})).toBeVisible();
  const info=await page.evaluate(()=>{
   const banner=[...document.querySelectorAll('[role="status"]')].find(n=>n.textContent.includes('被授权'))!;
   const span=banner.querySelector('span')!.getBoundingClientRect(),button=banner.querySelector('button')!.getBoundingClientRect(),h1=document.querySelector('main h1')!.getBoundingClientRect();
   return {textX:span.x,buttonRight:button.right,h1X:h1.x,innerWidth,scrollWidth:document.documentElement.scrollWidth};
  });
  expect(Math.abs(info.textX-info.h1X)).toBeLessThanOrEqual(1);
  expect(info.buttonRight).toBeLessThanOrEqual(info.innerWidth+1);
  expect(info.scrollWidth).toBeLessThanOrEqual(info.innerWidth+1);
 }
});
