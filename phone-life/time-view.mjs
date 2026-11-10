import {WorldClock} from '../engine/math.mjs';

// Read the same units and calendar as the form database. No display clock is saved.
export function phoneTimeText(state, minute=state?.clock?.minute){
 if(!state?.config?.calendar||!Number.isSafeInteger(minute))return '—';
 const unit=state.config.calendar.hour_minutes;
 return String(Math.floor(minute/unit)).padStart(2,'0')+':'+String(minute%unit).padStart(2,'0');
}
export function phoneDateParts(state, at=state.clock.totalMinutes){
 const rules=state.config?.calendar;
 if(rules&&Number.isSafeInteger(at)){const clock=new WorldClock(rules);clock.setOrdinal(state.config.calendarOrigin+at);const c=clock.c;return {configured:true,year:c.year,period:c.month??c.season,day:c.day,hour:c.hour,minute:c.minute,periodLabel:c.mode==='SEASON_FIXED'?'季':'月'};}
 return {year:null,period:null,day:null,hour:null,minute:null,periodLabel:'',configured:false};
}
export function phoneCalendarPage(state){
 const c=state.clock,rules=state.config?.calendar,parts=phoneDateParts(state);
 if(rules){const clock=new WorldClock(rules);return {...parts,count:clock.lengths(parts.year)[parts.period-1],offset:0,weekdays:[],minutesPerDay:rules.day_hours*rules.hour_minutes,standardTime:rules.day_hours===24&&rules.hour_minutes===60};}
 return {...parts,count:0,offset:0,weekdays:[],minutesPerDay:null,standardTime:false,configured:false};
}
