import {expect,test} from '@playwright/test';
import {installLayoutApi} from '../fixtures/layout-api';

test.use({serviceWorkers:'block',reducedMotion:'reduce'});

test('login and registration fields align at desktop, tablet, narrow and landscape widths',async({page})=>{
 await installLayoutApi(page);
 await page.goto('/');
 const current=page.locator('.auth-form>.page-surface>.route-content');
 for(const size of [{width:1440,height:900},{width:834,height:1194},{width:360,height:800},{width:844,height:390}]){
  await page.setViewportSize(size);
  await page.getByRole('heading',{name:'登录你的账号'}).waitFor();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const form=current.locator('form');
  expect((await form.boundingBox())!.width).toBeLessThanOrEqual(380.5);
  const label=(await current.locator('label[for=login-password]').boundingBox())!;
  const input=(await current.getByLabel('密码',{exact:true}).boundingBox())!;
  expect(input.y-label.y-label.height).toBeLessThanOrEqual(12);
  await page.getByRole('button',{name:'还没有账号？凭密令注册'}).click();
  await expect(page.getByRole('heading',{name:'创建学习账号'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  for(const name of ['昵称','密码','确认密码','注册密令'])await expect(current.getByLabel(name,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'已有账号？返回登录'}).click();
 }
});

test('password account gate fits a narrow viewport',async({page})=>{
 await page.setViewportSize({width:360,height:800});
 const fixture=await installLayoutApi(page);
 fixture.profile.must_change_password=true;
 await page.goto('/');
 await page.getByLabel('登录 ID',{exact:true}).fill('Layout 1234');
 await page.getByLabel('密码',{exact:true}).fill('Synthetic-Layout-Password1');
 await page.getByRole('button',{name:'登录',exact:true}).click();
 await expect(page.getByRole('heading',{name:'修改密码'})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.setViewportSize({width:844,height:390});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
