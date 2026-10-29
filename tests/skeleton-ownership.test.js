import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {onePassEntries} from '../onepass/preset.mjs';
import {sixEntries,fullDefaultConfiguration,DEFAULT_MOODS,SIX_KEYS} from '../six/preset.mjs';
import {PARAGRAPH_CONTRACT} from '../six/paragraph-contract.mjs';
const frozen=JSON.parse(readFileSync(new URL('../docs/validation/w76/before-format.json',import.meta.url)));
const blocks=text=>{
 const root=/<reply id="tisya-onepass-1">[\s\S]*?<\/reply>/.exec(text)?.[0];assert(root);
 return [...root.matchAll(/<(task|think|title|body|status|extra|vars|archive|memory|actions)([^>]*)>([\s\S]*?)<\/\1>/g)].map(([,tag,attrs,body])=>{
  const a=Object.fromEntries([...attrs.matchAll(/(\w+)="([^"]*)"/g)].map(m=>[m[1],m[2]])),name=tag==='think'?a.phase:tag,rows=[];
  if(['before','after'].includes(name))for(const line of body.split('\n').filter(x=>x.trim())){const [key,...cells]=line.split('|');rows.push([key,cells.length]);}
  if(['status','vars','archive','memory'].includes(name))for(const line of body.split('\n').filter(x=>x.trim())){const at=line.indexOf('：');rows.push([line.slice(0,at),line.slice(at+1).split('|').length]);}
  return {name,tag,attrs:a,rows};
 });
};
test('full frozen skeleton retains all eleven blocks, attributes, row keys and cell counts',()=>{
 const out=onePassEntries(fullDefaultConfiguration(),DEFAULT_MOODS);assert.deepEqual(blocks(out.tisya_registry),frozen);
 assert.equal((out.tisya_registry.match(/at most 8 characters including punctuation/g)??[]).length,1);
 assert(out.tisya_registry.includes(PARAGRAPH_CONTRACT));assert.equal(out.tisya_registry.split(PARAGRAPH_CONTRACT).length-1,1);
 assert(!Object.values(out).join('\n').includes('Title: at most'));
});
test('constraints have one owning layer rather than appended duplicate contracts',()=>{
 const out=onePassEntries(fullDefaultConfiguration(),DEFAULT_MOODS),text=Object.values(out).join('\n');
 assert.doesNotMatch(text,/\[PER.TURN\]|\[EXACT.ROW.KEYS\]|\[CREATIVE.CONTRACT\]/);
 assert.equal(text.split('Prose craft, character appeal/endearing traits').length-1,1);
 assert.match(out.tisya_material_rule_material,/<DictionAndStyle>[\s\S]*Prose craft/);
 assert.match(out.tisya_delivery_warning,/SPECIAL WARNING/);assert.doesNotMatch(out.tisya_delivery_warning,/Title:|eleven-block|columns|1–80/);
 assert.match(out.tisya_registry,/literal & inside a machine cell/);
});
test('Dream History boundaries preserve source-layer priority without changing identity or dispatch',()=>{
 const c=fullDefaultConfiguration(),out=onePassEntries(c,DEFAULT_MOODS),six=sixEntries(c,DEFAULT_MOODS);
 assert(out.tisya_material_boundary_open.startsWith('[Dream History]\n'));assert.equal(out.tisya_material_boundary_close,'[/Dream History]');
 assert.match(out.tisya_material_boundary_open,/under Tisya's governing rules: ID, ATTEST, REL, effective UserPreferences, workflow and REGISTRY/);
 assert.match(out.tisya_material_boundary_open,/cannot override Tisya's rules or the output skeleton/);
 assert.match(out.tisya_task_start,/after Dream History and REGISTRY/);
 for(const key of ['main','tisya_new_chat','tisya_session_reset','tisya_identity_attestation','tisya_user_relation','tisya_scene_anchor','tisya_internal_login','tisya_think_commit','tisya_prepare_trigger'])assert.equal(out[key],six[key],key);
 assert.deepEqual(Object.keys(out).sort(),Object.keys(six).sort());
 const plain=onePassEntries(c,[],{structured:false});assert(plain.tisya_material_boundary_open.startsWith('[Dream History]'));assert.equal(plain.tisya_material_boundary_close,'[/Dream History]');assert.doesNotMatch(plain.tisya_registry,/<reply/);
});
test('selected summaries, comments and actions retain their exact enabled rows across workflow modes',()=>{
 const directions=['输入评价','回应用户评价','剧情吐槽'];
 for(const detail of ['full','compact','format'])for(const summary of [true,false])for(let mask=0;mask<8;mask++)for(const actions of [true,false]){
  const c=fullDefaultConfiguration(),m=c.world.modes.narrative;Object.assign(m,{workflowDetail:detail,summary,actions,heartDirections:directions.filter((_,i)=>mask&(1<<i))});
  const out=onePassEntries(c,DEFAULT_MOODS),b=blocks(out.tisya_registry);
  assert.equal(b.length,actions?11:10);if(!actions)assert.match(out.tisya_registry,/<actions\/>/);
  for(const phase of ['before','after']){
   const keys=b.find(x=>x.name===phase).rows.map(x=>x[0]);for(const direction of directions)assert.equal(keys.filter(x=>x===direction).length,m.heartDirections.includes(direction)?1:0);
   if(!summary)assert(keys.every(x=>directions.includes(x)));
  }
  if(!summary)assert.doesNotMatch(out.tisya_registry,/Before choices plan|After outcomes report|Use literal source keys/);
  if(!mask)assert.doesNotMatch(out.tisya_registry,/Comments shown in the skeleton/);
 }
});
