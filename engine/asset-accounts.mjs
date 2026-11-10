import {fail} from './common.mjs';

// All current-catalog money operations resolve to the same asset subtable.
// Legacy standalone runtimes without that table may still use their own schema.
export function assetBalanceTarget(engine,{owner,currency,explicit,accountId}={}){
 const tid='T_DYN_CURRENCY_BALANCES';if(!engine.data.schema[tid])return null;
 if(typeof owner!=='string'||!owner)fail('BALANCE_OWNER','付款账户必须有明确主体');
 let rows=Object.entries(engine.rows(tid)).filter(([,r])=>r.values.owner_ref===owner&&(currency==null||r.values.currency_ref===currency));
 if(accountId)rows=rows.filter(([id])=>id===accountId);
 if(explicit){const [t,r,k,path]=engine.resolve(explicit,true);if(t!==tid||k!=='balance'||path.length)fail('BALANCE_OWNER','现有钱包路径不再直接结算，请选择资产子表的余额账户');rows=rows.filter(([id])=>id===r);}
 if(rows.length!==1)fail('BALANCE_SELECTION',rows.length?'此主体有多个余额账户，请明确选择账户':'未找到此主体与币种的余额账户',{owner,currency:currency??null,accounts:rows.map(([id])=>id)});
 const [rid,row]=rows[0];if(!row.values.currency_ref)fail('BALANCE_CURRENCY','余额账户尚未关联币种');
 if(typeof row.values.balance!=='number'||!Number.isFinite(row.values.balance)||row.states?.balance!=='known')fail('BALANCE_UNKNOWN','余额未知，不能从零开始结算');
 return [tid,rid,'balance',[]];
}
