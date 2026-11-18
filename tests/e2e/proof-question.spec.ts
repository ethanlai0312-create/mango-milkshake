import {expect,test} from '@playwright/test';
import {installLayoutApi,loginLayoutFixture} from '../fixtures/layout-api';

test.use({serviceWorkers:'block',reducedMotion:'reduce'});

test('proof question has symbol buttons that insert deletable text and attachment upload',async({page})=>{
 await installLayoutApi(page);
 await loginLayoutFixture(page);
 await page.goto('/?proof-question=1#mine');
 await expect(page.getByRole('button',{name:/繼續編輯|继续编辑/}).first()).toBeVisible();
 await page.getByRole('button',{name:/繼續編輯|继续编辑/}).first().click();
 await expect(page.locator('.nav-question').first()).toBeVisible();
 const proof=page.locator('.nav-question').filter({hasText:/证明题|證明題/}).first();
 await expect(proof).toBeVisible();
 await proof.click();
 const input=page.getByLabel('参考证明或评分要点（可选）');
 await expect(input).toBeVisible();
 await page.getByRole('button',{name:'插入因为'}).click();
 await expect(input).toHaveValue('∵');
 await page.getByRole('button',{name:'插入三角形'}).click();
 await expect(input).toHaveValue('∵△');
 await input.press('Backspace');
 await expect(input).toHaveValue('∵');
 await expect(page.locator('.question-main input[type="file"]')).toHaveCount(1);
});

test('every question kind offers an optional attachment upload',async({page})=>{
 await installLayoutApi(page);
 await loginLayoutFixture(page);
 await page.goto('/?proof-question=2#mine');
 await page.getByRole('button',{name:/繼續編輯|继续编辑/}).first().click();
 const navs=page.locator('.nav-question');
 await expect(navs.first()).toBeVisible();
 const count=await navs.count();
 expect(count).toBeGreaterThan(1);
 for(let i=0;i<count;i++){
  await navs.nth(i).click();
  await page.waitForTimeout(80);
  expect(await page.locator('.question-main input[type="file"]').count()).toBeGreaterThan(0);
 }
});
