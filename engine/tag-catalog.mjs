export const TAG_TABLE_FIELDS={
  T_PREF_SCOPES:[
    {key:'tag_id',type:'SHORT_TEXT',label:'标签扩展'},{key:'owner_type',type:'SHORT_TEXT',label:'标签扩展'},
    {key:'scope_type',type:'SHORT_TEXT',label:'标签扩展'},{key:'subject_ref',type:'SHORT_TEXT',label:'标签扩展'},
    {key:'projection_tier',type:'SHORT_TEXT',label:'标签扩展'},{key:'tag_config_json',type:'LONG_TEXT',label:'标签扩展'}
  ],
  T_CHAR_DOSSIER:[
    {key:'persona_coordinates_json',type:'LONG_TEXT',label:'标签扩展'},{key:'coordinate_growth_json',type:'LONG_TEXT',label:'标签扩展'},
    {key:'character_tag_ids',type:'LONG_TEXT',label:'标签扩展'}
  ],
  T_DYN_RELATION_AXES:[
    {key:'relation_coordinates_json',type:'LONG_TEXT',label:'关系坐标'},{key:'relation_growth_json',type:'LONG_TEXT',label:'关系事件成长'},
    {key:'relation_tag_ids',type:'LONG_TEXT',label:'关系自身标签'}
  ],
  T_STATIC_WORLDS:[
    {key:'world_tag_ids',type:'LONG_TEXT',label:'世界常驻标签'},
    {key:'tag_pack_json',type:'LONG_TEXT',label:'标签扩展'},{key:'tag_pack_status',type:'SHORT_TEXT',label:'标签扩展'},
    {key:'tag_pack_user_edits',type:'LONG_TEXT',label:'标签扩展'}
  ]
};
export function extendTagCatalog(catalog){const needed=Object.entries(TAG_TABLE_FIELDS).some(([id,fields])=>{const table=catalog.tables.find(t=>t.id===id);return table&&fields.some(f=>!table.fields.some(x=>x.key===f.key));});if(!needed)return catalog;const out=structuredClone(catalog);for(const [tableId,fields]of Object.entries(TAG_TABLE_FIELDS)){const table=out.tables.find(t=>t.id===tableId);if(!table)continue;const ids=new Set(table.fields.map(f=>f.key));for(const f of fields)if(!ids.has(f.key))table.fields.push({...f});}return out;}
