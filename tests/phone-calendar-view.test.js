import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldClock} from '../engine/math.mjs';
import {phoneTimeText,phoneDateParts,phoneCalendarPage} from '../phone-life/time-view.mjs';
import {renderUtility} from '../phone-life/utility-views.mjs';

const calendar={mode:'MONTH_FIXED',year:7,month:2,day:39,hour:29,minute:80,day_hours:30,hour_minutes:100,months_per_year:10,days_per_month:40};
function setCalendar(state,rules){const source=new WorldClock(rules),c=source.c;state.config.calendar=structuredClone(c);state.config.calendarOrigin=source.ordinal();state.clock={year:c.year,month:c.month??c.season,...(c.mode==='SEASON_FIXED'?{season:c.season}:{}),day:c.day,minute:c.hour*c.hour_minutes+c.minute,totalMinutes:0};return state;}
function fixture(){return setCalendar({config:{database:true,settlementOwner:'tables',apps:['calendar']},identity:{personId:'calendar-person'},wallet:{accounts:[]},commerce:{products:[]},map:{places:[]},calendar:{events:[]},social:{accounts:[]}},calendar);}
test('phone calendar uses form units and period lengths beyond Gregorian limits',()=>{
 const state=fixture(),page=phoneCalendarPage(state);assert.equal(page.count,40);assert.equal(page.minutesPerDay,3000);assert.equal(page.standardTime,false);assert.deepEqual(page.weekdays,[]);assert.equal(phoneTimeText(state),'29:80');assert.deepEqual(phoneDateParts(state,30),{configured:true,year:7,period:2,day:40,hour:0,minute:10,periodLabel:'月'});
 const h={esc:v=>String(v??''),money:String,icon:()=>'',art:()=>'',btn:(label)=>'<button>'+label+'</button>',tabs:()=>'',hosted:true};
 const html=renderUtility(state,{app:'calendar'},h);assert.match(html,/name="day" min="1" max="40"/);assert.match(html,/name="minute" min="0" max="2999"/);assert.match(html,/29:80/);assert.doesNotMatch(html,/type="time"/);
});
test('season calendar stays seasons across phone year boundary',()=>{
 const rules={...calendar,mode:'SEASON_FIXED',season:3,seasons_per_year:3,days_per_season:40};delete rules.month;const state=setCalendar(fixture(),rules);
 assert.equal(phoneCalendarPage(state).periodLabel,'季');assert.deepEqual(phoneDateParts(state,3020),{configured:true,year:8,period:1,day:1,hour:0,minute:0,periodLabel:'季'});
});
test('absent form calendar stays unconfigured even when an obsolete epoch is supplied',()=>{const state=fixture();delete state.config.calendar;state.config.epoch=Date.UTC(2033,0,1);assert.equal(phoneTimeText(state),'—');assert.equal(phoneDateParts(state).configured,false);assert.equal(phoneCalendarPage(state).count,0);assert.match(renderUtility(state,{app:'calendar'},{esc:String}),/世界时间尚未配置/);});
