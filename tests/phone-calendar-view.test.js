import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldClock} from '../engine/math.mjs';
import {phoneTimeText,phoneDateParts,phoneCalendarPage} from '../phone-life/time-view.mjs';
import {renderUtility} from '../phone-life/utility-views.mjs';

const calendar={mode:'MONTH_FIXED',year:7,month:2,day:39,hour:29,minute:80,day_hours:30,hour_minutes:100,months_per_year:10,days_per_month:40};
function fixture(){return {config:{calendar,calendarOrigin:new WorldClock(calendar).ordinal()},clock:{year:7,month:2,day:39,minute:2980,totalMinutes:0},wallet:{accounts:[]},commerce:{products:[]},map:{places:[]},calendar:{events:[]},social:{accounts:[]}};}
test('phone calendar uses form units and period lengths beyond Gregorian limits',()=>{
 const state=fixture(),page=phoneCalendarPage(state);assert.equal(page.count,40);assert.equal(page.minutesPerDay,3000);assert.equal(page.standardTime,false);assert.deepEqual(page.weekdays,[]);assert.equal(phoneTimeText(state),'29:80');assert.deepEqual(phoneDateParts(state,30),{year:7,period:2,day:40,hour:0,minute:10,periodLabel:'月'});
 const h={esc:v=>String(v??''),money:String,icon:()=>'',art:()=>'',btn:(label)=>'<button>'+label+'</button>',tabs:()=>'',hosted:true};
 const html=renderUtility(state,{app:'calendar'},h);assert.match(html,/name="day" min="1" max="40"/);assert.match(html,/name="minute" min="0" max="2999"/);assert.match(html,/29:80/);assert.doesNotMatch(html,/type="time"/);
});
test('season calendar stays seasons across phone year boundary',()=>{
 const state=fixture();state.config.calendar={...calendar,mode:'SEASON_FIXED',season:3,seasons_per_year:3,days_per_season:40};delete state.config.calendar.month;state.config.calendarOrigin=new WorldClock(state.config.calendar).ordinal();
 assert.equal(phoneCalendarPage(state).periodLabel,'季');assert.deepEqual(phoneDateParts(state,3020),{year:8,period:1,day:1,hour:0,minute:0,periodLabel:'季'});
});
