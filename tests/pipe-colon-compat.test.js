import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePipeBlock} from '../onepass/pipes.mjs';
test('ASCII and fullwidth category colons parse identically across every pipe block',()=>{
 const samples={status:'共用：清晨|1|P1|读者|[]\n认知：+K1|1|[]|目击|K3|看见灯亮',memory:'共用：清晨|[]|1|P1|读者|[]\n事件：+E1|清晨|1|点亮灯\n事实发现：+F1|1|灯已亮',vars:'共用：1|P1\n变量：2|state.值|false|true',archive:'归档：basis|+E1\n待定：[]|缺对象编号|建立档案'};
 for(const [block,text] of Object.entries(samples))assert.deepEqual(parsePipeBlock(text.replaceAll('：',':'),block),parsePipeBlock(text,block));
});
test('category colon compatibility preserves literal field colons, escaping and validation',()=>{
 const parsed=parsePipeBlock('事件:+E1|~|[]|时间12:30，备注：亮灯\\|确认','memory');
 assert.equal(parsed.rows[0].values.经过,'时间12:30，备注：亮灯\\|确认');
 assert.throws(()=>parsePipeBlock('事件|+E1','memory'),/缺少类别冒号/);
 assert.throws(()=>parsePipeBlock('未知:+E1','memory'),/未登记类别/);
 assert.throws(()=>parsePipeBlock('变量:1|state.值|0|1|额外','vars'),/列数过多/);
});
