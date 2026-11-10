import {WorldClock} from '../engine/math.mjs';

// Read the same units and calendar as the form database. No display clock is saved.
export function phoneTimeText(state, minute=state?.clock?.minute){
 if(!Number.isSafeInteger(minute))return '—';
 const unit=state.config?.calendar?.hour_minutes??60;
 return String(Math.floor(minute/unit)).padStart(2,'0')+':'+String(minute%unit).padStart(2,'0');
}
export function phoneDateParts(state, at=state.clock.totalMinutes){
 const rules=state.config?.calendar;
 if(rules){const clock=new WorldClock(rules);clock.setOrdinal(state.config.calendarOrigin+at);const c=clock.c;return {year:c.year,period:c.month??c.season,day:c.day,hour:c.hour,minute:c.minute,periodLabel:c.mode==='SEASON_FIXED'?'季':'月'};}
 const c=state.clock,d=new Date(Date.UTC(c.year,c.month-1,c.day,0,c.minute-(c.totalMinutes??0)+at));
 return {year:d.getUTCFullYear(),period:d.getUTCMonth()+1,day:d.getUTCDate(),hour:d.getUTCHours(),minute:d.getUTCMinutes(),periodLabel:'月'};
}
export function phoneCalendarPage(state){
 const c=state.clock,rules=state.config?.calendar,parts=phoneDateParts(state);
 if(rules){const clock=new WorldClock(rules);return {...parts,count:clock.lengths(parts.year)[parts.period-1],offset:0,weekdays:[],minutesPerDay:rules.day_hours*rules.hour_minutes,standardTime:rules.day_hours===24&&rules.hour_minutes===60};}
 return {...parts,count:new Date(Date.UTC(c.year,c.month,0)).getUTCDate(),offset:(new Date(Date.UTC(c.year,c.month-1,1)).getUTCDay()+6)%7,weekdays:['一','二','三','四','五','六','日'],minutesPerDay:1440,standardTime:true};
}
