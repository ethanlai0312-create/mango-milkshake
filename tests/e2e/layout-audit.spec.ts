import {expect,test,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {installLayoutApi,loginLayoutFixture} from '../fixtures/layout-api';

test.use({serviceWorkers:'block',reducedMotion:'reduce'});
const output='../../outputs/layout-csv-20261115';
const sizes=[{width:1440,height:900},{width:1024,height:768},{width:834,height:1194},{width:390,height:844},{width:360,height:800},{width:844,height:390}];
const routes=['home','exams','mine','create','history','grading','rank','settings','shared','convert','review','users','invites','trash','logs','config'];
const titles:Record<string,string>={home:'你好',exams:'试卷中心',mine:'我的试卷',create:'创建一份新试卷',history:'我的成绩',grading:'全站答卷与批改',rank:'试卷排行榜',settings:'个人设置',shared:'共享档案',convert:'文档转换',review:'试卷审核',users:'账号管理',invites:'注册密令',trash:'试卷回收站',logs:'操作日志',config:'系统配置'};

async function assertLayout(page:Page,label:string){
 await page.locator('[data-page-pending=true]').waitFor({state:'detached',timeout:10000}).catch(()=>{});
 await page.waitForTimeout(100);
 const problems=await page.evaluate(()=>{
  const issues:string[]=[];
  if(document.documentElement.scrollWidth>innerWidth+1)issues.push(`document overflow ${document.documentElement.scrollWidth-innerWidth}px`);
  document.querySelectorAll<HTMLElement>('.actions').forEach((group,index)=>{
   if(!group.checkVisibility())return;
   const controls=Array.from(group.children).filter((child):child is HTMLElement=>child instanceof HTMLElement&&child.matches('button,label.button')&&child.checkVisibility());
   const rows:DOMRect[][]=[];
   controls.forEach(control=>{const r=control.getBoundingClientRect();
    const row=rows.find(items=>Math.abs(items[0].y-r.y)<Math.min(items[0].height,r.height)*.8);
    if(row)row.push(r);else rows.push([r]);
    if(r.left<-1||r.right>innerWidth+1)issues.push(`actions ${index} outside viewport (${control.textContent?.trim()})`);
   });
   rows.forEach(rects=>{if(rects.length<2)return;
    const heights=rects.map(r=>r.height),tops=rects.map(r=>r.top);
    if(Math.max(...heights)-Math.min(...heights)>2)issues.push(`actions ${index} mixed heights ${heights.join(',')}`);
    if(Math.max(...tops)-Math.min(...tops)>2)issues.push(`actions ${index} mixed top ${tops.join(',')}`);
   });
  });
  return issues;
 });
 expect(problems,label).toEqual([]);
}

for(const size of sizes)test(`all routes layout ${size.width}x${size.height}`,async({page})=>{
 test.setTimeout(180000);
 await mkdir(output,{recursive:true});
 await page.setViewportSize(size);
 await installLayoutApi(page);
 await loginLayoutFixture(page);
 for(const route of routes){
  await page.goto('/?layout-audit='+route+'#'+route);
  await expect(page.getByRole('heading',{name:new RegExp(titles[route])}).first()).toBeVisible();
  if(route==='rank'){
   await page.getByLabel('选择排行榜试卷').selectOption({index:1});
   await expect(page.locator('.rank-row')).toHaveCount(2);
  }
  await assertLayout(page,`${route} ${size.width}x${size.height}`);
  if(['home','settings','convert','users'].includes(route))await page.screenshot({path:`${output}/${test.info().project.name}-${route}-${size.width}x${size.height}.png`,fullPage:true});
 }
});

for(const width of [390,834,1440])test(`editor and answer types ${width}px`,async({page})=>{
 test.setTimeout(180000);
 await mkdir(output,{recursive:true});
 await page.setViewportSize({width,height:900});
 const fixture=await installLayoutApi(page);
 await loginLayoutFixture(page);
 await page.goto('/?layout-audit=editor#mine');
 await page.getByRole('button',{name:'继续编辑',exact:true}).click();
 await expect(page.locator('.editor-page')).toBeVisible();
 await page.locator('.exam-meta>summary').click();
 const metadata=page.locator('.exam-meta>.actions');
 await metadata.screenshot({path:`${output}/${test.info().project.name}-metadata-${width}.png`});
 await expect(metadata.locator(':scope > button,:scope > label.button')).toHaveCount(4);
 const bounds=await metadata.locator(':scope > button,:scope > label.button').evaluateAll(nodes=>nodes.map(node=>{
  const r=node.getBoundingClientRect();return {y:r.y,height:r.height,margin:getComputedStyle(node).marginBottom};
 }));
 expect(bounds.map(b=>b.margin)).toEqual(['0px','0px','0px','0px']);
 for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){
  if(Math.abs(bounds[i].y-bounds[j].y)<Math.min(bounds[i].height,bounds[j].height)*.8){
   expect(Math.abs(bounds[i].y-bounds[j].y)).toBeLessThanOrEqual(1);
   expect(Math.abs(bounds[i].height-bounds[j].height)).toBeLessThanOrEqual(1);
  }
 }
 await assertLayout(page,`editor controls ${width}px`);
 await page.screenshot({path:`${output}/${test.info().project.name}-editor-${width}.png`,fullPage:true});
 for(let i=0;i<fixture.questions.length;i++){
  const nav=page.locator('.question-nav .nav-question').nth(i);
  await nav.click();
  await assertLayout(page,`editor ${fixture.questions[i].kind} ${width}px`);
 }
 await page.locator('.question-nav .nav-question').filter({hasText:'几何画图'}).click();
 await page.getByRole('button',{name:'编辑初始图形',exact:true}).click();
 await expect(page.getByRole('img',{name:'几何绘图区'})).toBeVisible();
 await assertLayout(page,`initial drawing ${width}px`);
 await page.getByRole('button',{name:'收起初始图形',exact:true}).click();
 await page.getByRole('button',{name:'录制参考答案',exact:true}).click();
 await expect(page.getByRole('img',{name:'几何绘图区'})).toBeVisible();
 await assertLayout(page,`reference drawing ${width}px`);
 await page.getByRole('button',{name:'收起参考答案',exact:true}).click();
 await page.locator('.editor-page>.page-heading').getByRole('button',{name:'我的试卷',exact:false}).click();
 await page.goto('/?layout-audit=attempt#exams');
 await page.getByRole('button',{name:'开始答题',exact:true}).click();
 await expect(page.locator('.number-grid')).toBeVisible();
 for(let i=0;i<fixture.questions.length;i++){
  await page.locator('.number-grid button').nth(i).click();
  await assertLayout(page,`answer ${fixture.questions[i].kind} ${width}px`);
 }
 await page.screenshot({path:`${output}/${test.info().project.name}-attempt-${width}.png`,fullPage:true});
});

test('avatar crop, guide and dialog remain inside short touch viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await installLayoutApi(page);
 await loginLayoutFixture(page);
 await page.goto('/?layout-audit=avatar#settings');
 await page.getByLabel('选择裁剪头像').setInputFiles({name:'synthetic.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="orange"/></svg>')});
 await expect(page.getByRole('img',{name:'圆形头像裁剪预览'})).toBeVisible();
 await assertLayout(page,'avatar crop');
 await page.getByRole('button',{name:'取消裁剪'}).click();
 await page.getByRole('button',{name:'工具教程',exact:true}).click();
 const guide=page.getByRole('dialog',{name:'工具教程',exact:true});
 await expect(guide).toBeVisible();
 await page.setViewportSize({width:844,height:390});
 const r=(await guide.boundingBox())!;
 expect(r.x).toBeGreaterThanOrEqual(0);expect(r.y).toBeGreaterThanOrEqual(0);
 expect(r.x+r.width).toBeLessThanOrEqual(844);expect(r.y+r.height).toBeLessThanOrEqual(390);
 await page.getByRole('button',{name:'关闭工具教程'}).click();
 await page.goto('/?layout-audit=dialog#mine');
 await page.getByRole('button',{name:'删除',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'继续此操作？',exact:true});
 await expect(dialog).toBeVisible();
 const rect=(await dialog.boundingBox())!;
 expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.y).toBeGreaterThanOrEqual(0);
 expect(rect.x+rect.width).toBeLessThanOrEqual(844);expect(rect.y+rect.height).toBeLessThanOrEqual(390);
 await page.getByRole('button',{name:'取消',exact:true}).click();
});

test('all routes support 200% root text size',async({page})=>{
 test.setTimeout(180000);
 await page.setViewportSize({width:1024,height:768});
 await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{document.documentElement.style.fontSize='200%';}));
 await installLayoutApi(page);
 await loginLayoutFixture(page);
 for(const route of routes){
  await page.goto('/?layout-audit=text-'+route+'#'+route);
  await expect(page.getByRole('heading',{name:new RegExp(titles[route])}).first()).toBeVisible();
  if(route==='rank'){
   await page.getByLabel('选择排行榜试卷').selectOption({index:1});
   await expect(page.locator('.rank-row')).toHaveCount(2);
  }
  await assertLayout(page,`${route} 200% text`);
  if(route==='settings')await page.screenshot({path:`${output}/${test.info().project.name}-settings-text-200.png`,fullPage:true});
 }
});

test('visitor routes and touch orientation retain layout',async({browser})=>{
 test.setTimeout(180000);
 const context=await browser.newContext({baseURL:test.info().project.use.baseURL as string,
  viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage();
 try{
  await installLayoutApi(page,'visitor');
  await loginLayoutFixture(page);
  for(const size of [{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(size);
   for(const route of ['home','exams','mine','history','rank','settings','shared','convert']){
    await page.goto('/?layout-audit=touch-'+route+'-'+size.width+'#'+route);
    await expect(page.getByRole('heading',{name:new RegExp(titles[route])}).first()).toBeVisible();
    await assertLayout(page,`visitor touch ${route} ${size.width}`);
   }
  }
 }finally{await context.close();}
});
