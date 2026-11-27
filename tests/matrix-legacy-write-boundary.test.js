import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTableService} from '../tables/service.js';
import {createFoundationService} from '../tables/foundation-service.js';
import {createConditionService} from '../tables/condition-service.js';

const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('the only table composition root refuses legacy-only construction without creating books or settings',()=>{
 let writes=0;
 const books={write:async()=>{writes++;},create:async()=>{writes++;}},store={read:()=>({key:'boundary',world:{}})};
 assert.throws(()=>createTableService({books,store,getContext:()=>({chatId:'boundary'}),request:async()=>{}}),/规范 Matrix 数据库与宿主服务是表单组合根的必需依赖/);
 assert.throws(()=>createFoundationService({books,database:null}),/必须接入 Matrix 数据库/);
 assert.throws(()=>createConditionService({books,database:null}),/必须接入 Matrix 数据库/);
 assert.equal(writes,0);
});

test('current form, condition and panel sources contain no retired ledger writes or duplicate page chain',()=>{
 for(const name of ['tables/service.js','tables/foundation-service.js','tables/condition-service.js']){
  const text=source(name);assert(!text.includes('books.write('),name);assert(!text.includes('prepareCommit('),name);
 }
 const panel=source('tables/panel.js');
 for(const retired of ["['settings'","['forms'","['states'","['preferences'","['progression'","['parallel'","['core'","['timeline'","service.inspect()","service.archive(","service.saveGenesis("])assert(!panel.includes(retired),retired);
});

test('P4 has one existing request route and returns to the same review capability without direct adoption',()=>{
 const text=source('tables/service.js'),start=text.indexOf('api.redrawMainProposal='),end=text.indexOf('api.assistant=',start),redraw=text.slice(start,end);
 assert(start>=0&&end>start);assert.equal((redraw.match(/request\(/g)??[]).length,1);assert(redraw.includes('request(prepared.task,JSON.stringify(prepared.input),{signal})'));
 assert.equal((redraw.match(/matrixHost\.reviewMainProposal\(/g)??[]).length,1);assert(redraw.includes("action:'revise'"));assert(!redraw.includes("action:'accept'"));assert(!redraw.includes('books.write('));
});
