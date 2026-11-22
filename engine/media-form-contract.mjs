import {registerCatalogParameters,createParameterRegistry} from './parameter-registry.mjs';
import {MEDIA_TABLE} from '../media-contract.js';

const field=(key,label,type,description,extra={})=>({key,label,type,required:false,description,...extra});
export const MEDIA_FORM_FIELDS=Object.freeze([
 field('life_stage','生命线阶段','TEXT','与对象当前生命阶段逐字匹配；留空表示全阶段通用，不按图片名称猜测。'),
 field('scene_description','CG场景描述','LONG_TEXT','条件CG的获准场景说明；只作展示与精确调用核对，不参与条件判定。')
]);
export const PRESENTATION_MEDIA_FIELDS=Object.freeze([
 field('media_enabled','启用多媒体','BOOLEAN','本美化区块是否允许读取已绑定的获准媒体。'),
 field('media_kinds','多媒体类型','TEXT_LIST','仅可登记 avatar、portrait、expression、cg、sticker；实际显示仍受绑定、条件与权限约束。')
]);

export function extendMediaCatalog(catalog){
 const registrations=[
  ...MEDIA_FORM_FIELDS.map(field=>({table_id:MEDIA_TABLE,field})),
  ...PRESENTATION_MEDIA_FIELDS.map(field=>({table_id:'T_PREF_EXTENSION_PRESENTATION',field}))
 ],tables=new Set(catalog.tables.map(table=>table.id));
 const next=registerCatalogParameters(catalog,registrations.filter(registration=>tables.has(registration.table_id)));
 createParameterRegistry(next);return next;
}
