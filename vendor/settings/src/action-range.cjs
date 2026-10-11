'use strict';
const KEY='缇斯亚叙事行动选项';
const DEFAULT_ACTION_RANGE=Object.freeze({下限:4,上限:6});
// null disables the extra E01 constraint, retaining the base output range.
function resolveActionRange(value=null){
 if(value===null)return {...DEFAULT_ACTION_RANGE};
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||!Object.hasOwn(value,'下限')||!Object.hasOwn(value,'上限')||!Number.isSafeInteger(value.下限)||value.下限<1||!Number.isSafeInteger(value.上限)||value.上限<value.下限)throw Object.assign(new Error('TISHA_NARRATIVE_ACTION_RANGE'),{code:'TISHA_NARRATIVE_ACTION_RANGE'});
 return {下限:value.下限,上限:value.上限};
}
module.exports={ACTION_RANGE_KEY:KEY,DEFAULT_ACTION_RANGE,resolveActionRange};
