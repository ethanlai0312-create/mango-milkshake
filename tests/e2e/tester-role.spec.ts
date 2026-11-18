import {test,expect} from '@playwright/test';
import {installLayoutApi,loginLayoutFixture} from '../fixtures/layout-api';
test.use({serviceWorkers:'block',reducedMotion:'reduce'});
test('tester has user workflows and separate management samples without private requests',async({page})=>{
 const f=await installLayoutApi(page,'tester');await loginLayoutFixture(page);
 await page.getByRole('button',{name:/展开导航|開啟導航|打开导航/}).click();
 await page.goto('/?tester-plus=mine#mine');await expect(page.getByRole('button',{name:'继续编辑',exact:true})).toBeVisible();await page.getByRole('button',{name:'继续编辑',exact:true}).click();await expect(page.getByRole('button',{name:'保存',exact:true})).toBeVisible();
 for(const target of ['review','users','invites','grading','trash','logs','config']){await page.goto('/?tester-plus='+target+'#'+target);const preview=page.locator('[data-tester-preview]');await expect(preview).toBeVisible();await expect(preview).toContainText('示例数据');for(const button of await preview.locator('button').all())await expect(button).toBeDisabled();}
 expect(f.requests.filter(x=>['users','userPresence','logs','invites','config','grade','review','setUserRole'].includes(x))).toEqual([]);
 await page.goto('/?tester-plus=exams#exams');await page.getByRole('button',{name:'开始答题',exact:true}).click();await expect(page.locator('.question-answer input[type=radio]').first()).toBeEnabled();
});
test('admin permission selector protects admin rows and offers user/tester/secondary admin',async({page})=>{
 const f=await installLayoutApi(page);await loginLayoutFixture(page);await page.goto('/?tester-audit=users#users');
 await expect(page.getByRole('heading',{name:'账号管理'})).toBeVisible();
 const admin=page.locator('tbody tr').filter({hasText:f.profile.username});await expect(admin.locator('select')).toHaveCount(0);
 const select=page.locator('.role-select select');await expect(select).toHaveCount(1);
 expect(await select.locator('option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value))).toEqual(['user','tester','secondary admin']);
 await select.selectOption('tester');await expect(page.getByRole('dialog')).toContainText('该账号需要重新登录');
 await page.getByRole('button',{name:'取消',exact:true}).click();expect(f.requests).not.toContain('setUserRole');await expect(select).toHaveValue('user');
});
for(const viewport of [{width:1440,height:900},{width:834,height:1194},{width:390,height:844},{width:844,height:390}]){
 test(`tester responsive personal routes ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);await installLayoutApi(page,'tester');await loginLayoutFixture(page);
  for(const route of ['exams','shared','settings']){await page.goto('/?tester-audit='+route+'#'+route);await expect(page.locator('main h1')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
 });
}
