import {mountAppearance} from './settings-core.js';
import {visualAssets} from './visual-assets.js';
import {BODY_FIELDS,BODY_DEFAULTS} from './typography-core.js';
import {DISPLAY_FIELDS,DISPLAY_DEFAULTS} from './display-settings.js';
export const ACTION_DISPLAY_FIELDS=Object.freeze({显示可能走向:[true,false]});
export const ACTION_DISPLAY_DEFAULTS=Object.freeze({显示可能走向:true});
export const COMMON_FIELDS=Object.freeze({装饰程度:['简洁','标准','丰富'],动画效果:[true,false]});
export const APPEARANCE_OWNERS=Object.freeze({general:'通用外观',title:'场景题签',task:'本轮任务',heart:'缇斯亚心声',body:'正文',extra:'世界扩展',next:'行动栏',records:'本轮记录',extensions:'旅程与聊天外观'});
export const appearanceFields=owner=>{if(!APPEARANCE_OWNERS[owner])throw Error('显示区块不存在');return {...COMMON_FIELDS,...(owner==='body'?BODY_FIELDS:owner==='extensions'?DISPLAY_FIELDS:owner==='next'?ACTION_DISPLAY_FIELDS:{})};};
const base={装饰程度:'标准',动画效果:true},defaults={title:{装饰程度:'丰富'},body:{装饰程度:'简洁',...BODY_DEFAULTS},extensions:DISPLAY_DEFAULTS,next:ACTION_DISPLAY_DEFAULTS};
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
export function appearanceOverrides(settings,owner){const blocks=settings.显示区块;if(blocks!==undefined&&!plain(blocks))throw Error('显示区块配置损坏');const values=blocks?.[owner]??{};if(!plain(values)||Object.entries(values).some(([k,v])=>!appearanceFields(owner)[k]?.includes(v)))throw Error(APPEARANCE_OWNERS[owner]+'配置损坏');return {...values};}
export function appearanceValues(settings,owner){return {...base,...appearanceOverrides(settings,'general'),...defaults[owner],...appearanceOverrides(settings,owner)};}
export function withAppearanceOverrides(settings,owner,value){appearanceOverrides({显示区块:{[owner]:value}},owner);return {...settings,显示区块:{...settings.显示区块,[owner]:{...value}}};}
export function mountAppearanceSettings(document,container,{owner,getSettings,save,saveProfiles=async()=>{throw Error('外观方案保存接口未连接');},onStateChange=()=>{},externalActions=false}){
 let alive=true;
 const inspect=id=>({value:id==='general'?appearanceValues(getSettings(),id):appearanceOverrides(getSettings(),id),revision:JSON.stringify(appearanceOverrides(getSettings(),id)),effective:{values:appearanceValues(getSettings(),id)}});
 function bank(){const raw=getSettings().外观方案;if(raw===undefined)return {revision:null,rows:[]};if(!plain(raw)||raw.version!==1||typeof raw.revision!=='string'||!Array.isArray(raw.rows)||raw.rows.length>100||raw.rows.some(r=>!plain(r)||typeof r.id!=='string'||!APPEARANCE_OWNERS[r.owner]||typeof r.name!=='string'))throw Error('外观方案目录损坏');for(const row of raw.rows)appearanceOverrides({显示区块:{[row.owner]:row.value}},row.owner);return structuredClone(raw);}
 async function call(op,args={}){if(!alive)throw Error('外观页已关闭');const id=args.owner;if(op==='components')return Object.entries(APPEARANCE_OWNERS).filter(([id])=>id!=='general').map(([id,name])=>({id,name,defaults:defaults[id]??{},fields:Object.fromEntries(Object.entries(appearanceFields(id)).filter(([k])=>!Object.hasOwn(COMMON_FIELDS,k)))}));if(op==='display.inspect')return inspect(id);if(op==='display.save'){if(inspect(id).revision!==args.expected)throw Error('外观配置已在别处修改，请重新打开本页');await save(id,args.value);return inspect(id);}
 const list=bank();if(op==='profiles.list')return {revision:list.revision,rows:list.rows.map(({value,...row})=>row)};const row=list.rows.find(r=>r.id===args.id);if(op==='profiles.load'){if(!row||row.owner!==id)throw Error('方案不存在或区块不匹配');return row.value;}if(!op.startsWith('profiles.'))throw Error('外观操作尚未接通');if(args.expected!==list.revision)throw Error('外观方案目录已变化，请重新打开');const verb=op.slice(9),name=args.name;
 if(['save','rename'].includes(verb)&&(!name||name.length>32||name!==name.trim()||list.rows.some(r=>r.owner===id&&r.name===name&&r.id!==args.id)))throw Error('方案名称须为 1—32 字，同区块不能重名');if(verb!=='save'&&(!row||row.owner!==id))throw Error('方案不存在或区块不匹配');
 if(verb==='save'||verb==='update'){appearanceOverrides({显示区块:{[id]:args.value}},id);if(verb==='save'){if(list.rows.length>=100)throw Error('外观方案数量已达上限');list.rows.push({id:crypto.randomUUID().replaceAll('-',''),name,owner:id,value:structuredClone(args.value)});}else row.value=structuredClone(args.value);}
 else if(verb==='rename')row.name=name;else if(verb==='delete'){if(args.confirm!==row.name)throw Error('删除确认不符');list.rows=list.rows.filter(r=>r!==row);}else throw Error('外观方案操作无效');list.version=1;list.revision=crypto.randomUUID().replaceAll('-','');await saveProfiles(list);return {revision:list.revision,rows:list.rows.map(({value,...row})=>row)};
 }
 const view=mountAppearance({container,controller:{call},initialOwner:owner,fixedOwner:true,externalActions,waterURL:visualAssets['water.png'],onStateChange});
 return {...view,dispose(){alive=false;view.dispose();}};
}
