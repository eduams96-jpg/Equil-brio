const assert=require('node:assert/strict');
const { chromium, browserLaunchOptions } = require('./_browser.cjs');

(async()=>{
  const browser=await chromium.launch(browserLaunchOptions());
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(process.env.EQUILIBRIO_TEST_URL||'http://127.0.0.1:4173');
    await page.evaluate(()=>{
      localStorage.setItem('equilibrio:welcome-at-start:v1','off');
      data=F.empty();
      data.accounts=[{id:'bank',name:'Banco',type:'Conta',balance:100}];
      data=F.normalize(data);
      render();
      navigate('casaPurchases');
      ReceiptReader.read=async()=>({text:'Mercado\nARROZ 2 x 1,50 3,00\nSACO 2,50\nTOTAL 5,50',attachment:null});
    });
    await page.locator('#casaReadReceipt').click();
    await page.locator('[name=casaReceiptFile]').setInputFiles({name:'talao.png',mimeType:'image/png',buffer:Buffer.from('imagem de teste')});
    await page.locator('#modalContent button[type=submit]').click();
    await page.locator('#casaReceiptLines .casa-receipt-line').first().waitFor();
    assert.equal(await page.locator('#casaReceiptLines .casa-receipt-line').count(),2);
    assert.equal(await page.locator('#casaReceiptLines .casa-receipt-line').first().locator('[data-receipt-stock]').isChecked(),true);
    assert.equal(await page.locator('#casaReceiptLines .casa-receipt-line').last().locator('[data-receipt-stock]').isChecked(),false);
    await page.locator('#casaReceiptLines .casa-receipt-line').first().locator('[data-receipt-unit]').selectOption('kg');
    await page.locator('#casaReceiptLines .casa-receipt-line').first().locator('[data-receipt-size]').fill('0.5');
    await page.locator('#casaReceiptTarget').selectOption('new');
    await page.locator('[name=casaReceiptAccount]').selectOption('Banco');
    await page.locator('[name=casaReceiptConfirmed]').check();
    await page.locator('#modalContent button[type=submit]').click();
    await page.waitForFunction(()=>data.casa?.purchases.length===1);
    const saved=await page.evaluate(()=>({
      purchase:data.casa.purchases[0],
      stores:data.casa.stores.length,
      products:data.casa.catalog.length,
      stock:data.casa.stock.map(l=>({qty:l.qty,unit:l.unit,purchaseId:l.purchaseId})),
      transactions:data.transactions.length,
      balance:data.accounts[0].balance,
    }));
    assert.equal(saved.purchase.total,5.5);
    assert.equal(saved.stores,1);
    assert.equal(saved.products,1);
    assert.equal(saved.stock.length,1);
    assert.equal(saved.stock[0].qty,1);
    assert.equal(saved.stock[0].unit,'kg');
    assert.equal(saved.stock[0].purchaseId,saved.purchase.id);
    assert.equal(saved.transactions,1);
    assert.equal(saved.balance,94.5);
    await page.setViewportSize({width:390,height:844});
    const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(mobileOverflow<=1,`Casa em ecrã pequeno tem ${mobileOverflow}px de scroll horizontal`);
    await page.evaluate(()=>{
      data=F.empty();
      data.accounts=[{id:'bank',name:'Banco',type:'Conta',balance:100}];
      F.add(data,{date:F.today(),description:'Mercado',type:'expense',amount:5.5,account:'Banco',category:'Alimentação'});
      data=F.normalize(data);
      render();navigate('casaPurchases');
      CasaUI.reviewReceiptInCasa(ReceiptFinance.parse('Mercado\nARROZ 2 x 1,50 3,00\nSACO 2,50\nTOTAL 5,50'));
    });
    const existing=await page.locator('#casaReceiptTarget option[data-existing]').first().getAttribute('value');
    assert.ok(existing?.startsWith('existing:'));
    await page.locator('#casaReceiptLines .casa-receipt-line').first().locator('[data-receipt-unit]').selectOption('kg');
    await page.locator('#casaReceiptLines .casa-receipt-line').first().locator('[data-receipt-size]').fill('0.5');
    await page.locator('#casaReceiptTarget').selectOption(existing);
    await page.locator('[name=casaReceiptConfirmed]').check();
    await page.locator('#modalContent button[type=submit]').click();
    await page.waitForFunction(()=>data.casa?.purchases.length===1);
    const linked=await page.evaluate(()=>({transactions:data.transactions.length,balance:data.accounts[0].balance,purchaseTransaction:data.casa.purchases[0].transactionId,transactionId:data.transactions[0].id}));
    assert.equal(linked.transactions,1);
    assert.equal(linked.balance,94.5);
    assert.equal(linked.purchaseTransaction,linked.transactionId);
    assert.deepEqual(errors,[]);
    console.log('Casa OCR: revisão humana, stock e preço; novo débito ou associação sem duplicar; móvel sem overflow');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
