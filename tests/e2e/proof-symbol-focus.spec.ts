import {expect,test} from '@playwright/test';
import {installLayoutApi,loginLayoutFixture} from '../fixtures/layout-api';
test.use({serviceWorkers:'block',reducedMotion:'reduce',hasTouch:true,isMobile:true,viewport:{width:390,height:844}});

test('tapping a proof symbol keeps the textarea focused for the phone keyboard',async({page})=>{
 await installLayoutApi(page);
 await loginLayoutFixture(page);
 await page.goto('/?proof-touch=1#mine');
 await page.getByRole('button',{name:/繼續編輯|继续编辑/}).first().click();
 await expect(page.locator('.nav-question').first()).toBeVisible();
 await page.locator('.nav-question').filter({hasText:/证明题|證明題/}).first().click();
 const input=page.locator('.proof-text:visible').last();
 await expect(input).toBeVisible();
 await input.focus();
 await expect(input).toBeFocused();
 await page.tap('button[aria-label="插入因为"]');
 await expect(input).toHaveValue('∵');
 await expect(input).toBeFocused();
 await page.tap('button[aria-label="插入三角形"]');
 await expect(input).toHaveValue('∵△');
 await expect(input).toBeFocused();
});
