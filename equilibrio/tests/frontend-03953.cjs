'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),{compile}=require('../scripts/build-styles.cjs');
test('Frontend: bundle determinístico coincide com as fontes por área e organização global',()=>{
 assert.equal(fs.readFileSync(path.join(root,'ui.css'),'utf8'),compile());
 assert.deepEqual(fs.readdirSync(path.join(root,'ui-styles')).filter(f=>f.endsWith('.css')).sort(),['analysis.css','approved-visual.css','casa.css','common.css','experience.css','feedback-04110.css','feedback-0417.css','feedback-0418.css','feedback-0419.css','forms.css','movements.css','planning.css','receipt-assistance.css','reports.css','round-113.css','round-114.css','round-115.css','round-116.css','round-117.css','round-118.css','round-119.css','round-120.css','round-121.css','round-122.css','round-123.css','round-124.css','round-125.css','settings.css','summary.css','unified-workspace.css','visual-system.css','wealth.css','workbench.css']);
});
test('Frontend: render Casa por página, cache de navegação e invalidação por dados/espaço',()=>{
 for(const f of fs.readdirSync(root).filter(f=>/^casa.*ui\.js$/.test(f)&&f!=='casa-render-ui.js'))assert.doesNotMatch(fs.readFileSync(path.join(root,f),'utf8'),/PremiumUI\.render\s*=/,f);
 const calls=[];const context={data:{},key:'main',view:'casaHome',PremiumUI:{render:()=>calls.push('finance'),navigation:()=>calls.push('nav')}};context.window=context;
 for(const name of ['CasaUI','CasaHomeUI','CasaCatalogUI','CasaLifeUI','CasaDailyUI','CasaCompleteUI','CasaShoppingUI'])context[name]={render:()=>calls.push(name)};
 vm.runInNewContext(fs.readFileSync(path.join(root,'casa-render-ui.js'),'utf8'),context);
 context.PremiumUI.render();assert.deepEqual(calls,['finance','CasaHomeUI']);calls.length=0;
 context.PremiumUI.navigation('casaHome');context.PremiumUI.navigation('casaHome');assert.deepEqual(calls,['nav','nav']);calls.length=0;
 context.data={};context.PremiumUI.navigation('casaHome');assert.deepEqual(calls,['nav','CasaHomeUI']);calls.length=0;
 context.key='other';context.PremiumUI.navigation('casaHome');assert.deepEqual(calls,['nav','CasaHomeUI']);calls.length=0;
 context.view='casaStock';context.PremiumUI.navigation('casaStock');assert.deepEqual(calls,['nav','CasaLifeUI','CasaDailyUI','CasaCompleteUI']);calls.length=0;
 context.PremiumUI.render();assert.deepEqual(calls,['finance','CasaLifeUI','CasaDailyUI','CasaCompleteUI']);calls.length=0;
 context.view='dashboard';context.PremiumUI.render();assert.deepEqual(calls,['finance']);calls.length=0;
 context.view='casaShopping';context.PremiumUI.navigation('casaShopping');assert.deepEqual(calls,['nav','CasaShoppingUI']);
});
test('Frontend: compilação rejeita marcadores repetidos em fontes distintas',t=>{
 const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'equilibrio-styles-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'a.css'),'/* @order 1 */ .a{color:red}');fs.writeFileSync(path.join(dir,'b.css'),'/* @order 1 */ .b{color:blue}');assert.throws(()=>compile(dir),/repetida/);
});
