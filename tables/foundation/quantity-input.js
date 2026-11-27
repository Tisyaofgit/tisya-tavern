// Shared lexical parsing for Matrix quantity inputs. This service recognizes
// numeric notation only; unit registration and conversion policy stay in the
// canonical unit service. Ambiguous notation returns null instead of guessing.
const digits={零:0,'〇':0,'○':0,一:1,壹:1,二:2,贰:2,貳:2,两:2,兩:2,三:3,叁:3,叄:3,四:4,肆:4,五:5,伍:5,六:6,陆:6,陸:6,七:7,柒:7,八:8,捌:8,九:9,玖:9};
const smallUnits={十:10,拾:10,百:100,佰:100,千:1000,仟:1000};
const largeUnits={万:1e4,萬:1e4,亿:1e8,億:1e8,兆:1e12};
const numericChars='0-9０-９零〇○一二两兩三四五六七八九壹贰貳叁叄肆伍陆陸柒捌玖十拾百佰千仟万萬亿億兆点點.';

function chineseInteger(text){
 if(/^\d+$/.test(text)){const value=Number(text);return Number.isSafeInteger(value)?value:null;}
 if(!text||!/^[零〇○一二两兩三四五六七八九壹贰貳叁叄肆伍陆陸柒捌玖十拾百佰千仟万萬亿億兆]+$/.test(text))return null;
 let total=0,section=0,digit=null,lastSmall=Infinity,lastLarge=Infinity,afterLarge=false,afterSmall=false,zeroBeforeDigit=false,pendingZero=false,sawNonzero=false;
 for(const char of text){
  if(Object.hasOwn(digits,char)){
   const value=digits[char];
   if(value===0){
    // A zero may omit a place after a unit, but digit-by-digit notation such
    // as “一零二” is not an unambiguous quantity integer.
    if(!sawNonzero&&!section&&!total){pendingZero=true;continue;}
    if(digit!==null||!section&&!total)return null;
    digit=null;pendingZero=true;afterSmall=false;continue;
   }
   // Nonzero adjacent digits are decimal-fraction notation, not an integer.
   if(digit!==null||pendingZero&&!sawNonzero&&!section&&!total)return null;
   zeroBeforeDigit=pendingZero;digit=value;sawNonzero=true;pendingZero=false;afterSmall=false;
   afterLarge=false;continue;
  }
  if(Object.hasOwn(smallUnits,char)){
   const unit=smallUnits[char];if(unit>lastSmall||afterLarge||afterSmall)return null;
   section+=(digit??1)*unit;digit=null;lastSmall=unit;afterLarge=false;afterSmall=true;pendingZero=false;continue;
  }
  const unit=largeUnits[char],group=section+(digit??0);
  if(!unit||!group||unit>=lastLarge||pendingZero)return null;
  total+=group*unit;section=0;digit=null;lastSmall=Infinity;lastLarge=unit;afterLarge=true;afterSmall=false;zeroBeforeDigit=false;pendingZero=false;
  if(!Number.isFinite(total))return null;
 }
 // “三万五” and similar abbreviated notation do not identify an exact value.
 if(pendingZero&&sawNonzero||Number.isFinite(lastLarge)&&digit&&!zeroBeforeDigit)return null;
 const value=total+section+(digit??0);return Number.isSafeInteger(value)?value:null;
}

export function parseQuantityNumber(raw){
 if(typeof raw!=='string'&&typeof raw!=='number')return null;
 let text=String(raw).trim().replace(/[０-９]/g,char=>String(char.charCodeAt(0)-0xfee0)).replace(/\s+/g,'');
 if(text==='半')return 0.5;
 let sign=1;const prefix=/^([+\-]|正|负|負)/.exec(text);if(prefix){sign=['-','负','負'].includes(prefix[1])?-1:1;text=text.slice(prefix[0].length);}
 if(!text)return null;
 const parts=text.split(/[点點.]/);if(parts.length>2||parts.some(part=>!part))return null;
 const integer=chineseInteger(parts[0]);if(integer===null)return null;
 if(parts.length===1)return sign*integer;
 let fraction='';for(const char of parts[1]){if(/^\d$/.test(char))fraction+=char;else if(Object.hasOwn(digits,char))fraction+=String(digits[char]);else return null;}
 const value=sign*Number(integer+'.'+fraction);return Number.isFinite(value)?value:null;
}

export function parseQuantityShorthand(raw){
 if(typeof raw!=='string')return null;
 const text=raw.trim(),annotation=/^(.*?)\s*(?:（[^（）\r\n]+）|\([^()\r\n]+\))$/.exec(text);let core=(annotation?annotation[1]:text).trim(),narrativeOnly=!!annotation;
 const prefix=/^(约|大约|大概|近|将近|將近|不足|不到|未满|未滿|超过|超過|逾)\s*/.exec(core);if(prefix){narrativeOnly=true;core=core.slice(prefix[0].length);}
 const suffix=/(左右|上下|前后|前後|开外|開外|出头|出頭|以上|以下)$/.exec(core);if(suffix){narrativeOnly=true;core=core.slice(0,-suffix[0].length).trim();}
 const match=new RegExp('^((?:[+\\-正負负]?['+numericChars+']+)|半)\\s*([^\\s：:；;（）()]+)$').exec(core);if(!match)return null;
 const value=parseQuantityNumber(match[1]);let unit=match[2];const infix=/^(余|多|来|來)/.exec(unit);if(infix){narrativeOnly=true;unit=unit.slice(infix[0].length);}const approximate=/(余|多|来|來)$/.exec(unit);if(approximate){narrativeOnly=true;unit=unit.slice(0,-approximate[0].length);}
 if(value===null||!unit)return null;
 return {text,value,unit,narrativeOnly};
}
