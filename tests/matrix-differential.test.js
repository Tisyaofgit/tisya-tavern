import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {evaluate as formula,WorldClock} from '../engine/math.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {stableId as deterministicId} from '../engine/common.mjs';
import {roll as randint} from '../engine/random.mjs';
const randomState=()=>({});
const root=fileURLToPath(new URL('./reference/matrix-python/',import.meta.url));
function python(code,input){const result=spawnSync('python',['-c',`import sys,json\nsys.path.insert(0,${JSON.stringify(root)})\n${code}`],{input:JSON.stringify(input),encoding:'utf8'});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);}
test('JavaScript formula and custom-calendar results match frozen Python source',()=>{const cases=['1<3<2','1<2<=2','2 not in [1,3]','None is not None','5 if 1<2 else 7','3 if False else 7 if True else 9','not 3>1','ROUND(-2.25,1)','IF(FALSE,1/0,7)','SUM([1,2,3],4)','(1,2,3)[1]','-2^2','2^3^2','IFERROR(1/0,42)'];const expected=python('from rule_math import Formula\ncases=json.load(sys.stdin)\nprint(json.dumps([Formula().evaluate(x) for x in cases]))',cases);assert.deepEqual(cases.map(x=>formula(x)),expected);const clocks=[{mode:'MONTH_TABLE',year:2000,month:2,day:28},{mode:'MONTH_TABLE',year:2100,month:2,day:28},{mode:'SEASON_FIXED',year:7,season:4,day:30,hour:23,minute:59},{mode:'MONTH_FIXED',months_per_year:9,days_per_month:17,hour_minutes:100,day_hours:10}];const values=python('from rule_math import WorldClock\nout=[]\nfor config in json.load(sys.stdin):\n c=WorldClock(config);c.advance("2d1h");out.append([c.ordinal(),c.text()])\nprint(json.dumps(out))',clocks);assert.deepEqual(clocks.map(config=>{const c=new WorldClock(config);c.advance('2d1h');return [c.ordinal(),c.text()];}),values);});
test('seeded rolls and stable IDs match Python across restart and large dice',()=>{const sides=[6,20,2,1,2147483648,1234567890123,...Array(700).fill(20)],expected=python('import random,uuid\nr=random.Random(0)\nargs=json.load(sys.stdin)\nprint(json.dumps({"rolls":[r.randint(1,n) for n in args],"id":str(uuid.uuid5(uuid.NAMESPACE_URL,"缇斯亚/故事#人物"))}))',sides),state=randomState();assert.deepEqual(sides.map(n=>randint(state,n)),expected.rolls);assert.equal(deterministicId('缇斯亚/故事#人物'),expected.id);const e=new Runtime();const a=e.transaction('bad',{},()=>{e.roll(6);throw Error('rollback');});assert.equal(a.status,'FAILED');assert.equal(e.roll(6),4);const restored=new Runtime(e.data);assert.equal(restored.roll(6),4);});
