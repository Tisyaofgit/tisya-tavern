import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {initializeState} from '../engine/materials.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {assetBalanceTarget} from '../engine/asset-accounts.mjs';
function fixture(){
 const e=new Runtime(initializeState(catalog));e.registerTable('TestBags',[{key:'carry',type:'BAG'},{key:'money',type:'NUMBER'}]);e.newRecord('TestBags',{carry:{},money:999},'buyer');
 e.newRecord('T_DYN_CURRENCY_BALANCES',{owner_ref:'buyer',currency_ref:'coin',balance:20},'bank');e.newRecord('T_DYN_CURRENCY_BALANCES',{owner_ref:'seller',currency_ref:'coin',balance:0},'merchant');
 e.newRecord('X_ITEM_SPECS',{name:'面包',buy_price:4,sell_price:2,currency:'coin'},'bread');e.newRecord('X_SHOP_OFFERS',{item_ref:'bread',currency_ref:'coin',merchant_ref:'seller',buy_price:4,sell_price:2,stock:10},'offer');return e;
}
test('BUY and SELL use actual catalog asset balances, never stale actor money',()=>{
 const e=fixture(),buy=e.transaction('buy',{},()=>e.operators.BUY({action:'BUY',actor:'buyer',item:'bread',offer:'offer',quantity:2}));assert.notEqual(buy.status,'FAILED',JSON.stringify(buy));assert.equal(e.get('T_DYN_CURRENCY_BALANCES#bank.balance'),12);assert.equal(e.get('T_DYN_CURRENCY_BALANCES#merchant.balance'),8);assert.equal(e.get('TestBags#buyer.money'),999);
 const sell=e.transaction('sell',{},()=>e.operators.SELL({action:'SELL',actor:'buyer',item:'bread',offer:'offer',quantity:1}));assert.notEqual(sell.status,'FAILED',JSON.stringify(sell));assert.equal(e.get('T_DYN_CURRENCY_BALANCES#bank.balance'),14);assert.equal(e.get('T_DYN_CURRENCY_BALANCES#merchant.balance'),6);
});
test('PAY_TERM uses the same bank account and updates the paid installment atomically',()=>{
 const e=fixture();e.newRecord('X_FINANCIAL_TERMS',{debtor_ref:'buyer',creditor_ref:'seller',currency_ref:'coin',amount:6,paid:0,status:'due'},'term');const result=e.transaction('pay',{},()=>e.operators.PAY_TERM({term:'term'}));assert.notEqual(result.status,'FAILED',JSON.stringify(result));assert.equal(e.get('T_DYN_CURRENCY_BALANCES#bank.balance'),14);assert.equal(e.get('T_DYN_CURRENCY_BALANCES#merchant.balance'),6);assert.equal(e.get('X_FINANCIAL_TERMS#term.status'),'paid');
});
test('ambiguous, unknown or legacy explicit balance paths fail before settlement',()=>{
 const e=fixture();assert.throws(()=>assetBalanceTarget(e,{owner:'buyer',currency:'coin',explicit:'TestBags#buyer.money'}),/资产子表/);e.newRecord('T_DYN_CURRENCY_BALANCES',{owner_ref:'buyer',currency_ref:'coin',balance:7},'cash');const before=structuredClone(e.data);const result=e.transaction('ambiguous',{},()=>e.operators.BUY({action:'BUY',actor:'buyer',item:'bread',offer:'offer'}));assert.equal(result.status,'FAILED');assert.equal(e.get('T_DYN_CURRENCY_BALANCES#bank.balance'),20);assert.deepEqual(e.rows('TestBags'),before.tables.TestBags);assert.deepEqual(assetBalanceTarget(e,{owner:'buyer',currency:'coin',accountId:'cash'}),['T_DYN_CURRENCY_BALANCES','cash','balance',[]]);
});
