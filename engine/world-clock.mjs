import {clone,fail} from './common.mjs';
// M_CALENDAR_* own units/rules. X_WORLD_CLOCKS owns only the selected position.
export function worldClockConfiguration(state,recordId){
 const row=state.tables?.X_WORLD_CLOCKS?.[recordId];if(!row)fail('MISSING_CALENDAR','请先选择世界时钟');const values=clone(row.values),world=values.world_ref,selected=state.tables?.T_STATIC_WORLDS?.[world]?.values?.calendar_id;
 const definitions=Object.entries(state.tables?.M_CALENDAR_RULES??{}).filter(([id,r])=>selected?id===selected:r.values.world_ref===world);
 if(!definitions.length){const {row_uuid,name,world_ref,...legacy}=values;return legacy;}
 if(definitions.length!==1)fail('CALENDAR_BINDING','此世界有多个历法定义，须明确当前历法');
 const [id,rowDef]=definitions[0],d=rowDef.values,mode={FIXED:'MONTH_FIXED',MONTH_TABLE:'MONTH_TABLE',SEASON_FIXED:'SEASON_FIXED'}[d.mode];if(!mode)fail('CALENDAR_MODE','表单历法模式尚未填写');
 for(const key of ['hours_per_day','minutes_per_hour'])if(!Number.isSafeInteger(d[key])||d[key]<=0)fail('CALENDAR_UNIT','表单历法单位尚未完整配置',{field:key});
 const c={mode,year:values.year,day:values.day,hour:values.hour,minute:values.minute,day_hours:d.hours_per_day,hour_minutes:d.minutes_per_hour};
 if(mode==='SEASON_FIXED'){c.season=values.season;c.seasons_per_year=d.seasons_per_year;c.days_per_season=d.days_per_season;if(![c.seasons_per_year,c.days_per_season].every(x=>Number.isSafeInteger(x)&&x>0))fail('CALENDAR_UNIT','季节历法缺少季数或每季天数');}
 else {c.month=values.month;if(mode==='MONTH_FIXED'){c.months_per_year=d.months_per_year;c.days_per_month=d.days_per_month;if(![c.months_per_year,c.days_per_month].every(x=>Number.isSafeInteger(x)&&x>0))fail('CALENDAR_UNIT','固定月历缺少每年月份数或每月天数');}else{
  const months=Object.values(state.tables.M_CALENDAR_MONTHS??{}).map(r=>r.values).filter(r=>r.calendar_ref===id).sort((a,b)=>a.month-b.month);if(!months.length||months.some((m,i)=>m.month!==i+1||!Number.isSafeInteger(m.days)||m.days<=0))fail('CALENDAR_MONTHS','月份长度表不完整');c.month_lengths=months.map(x=>x.days);
  const exceptions=Object.values(state.tables.M_CALENDAR_EXCEPTIONS??{}).map(r=>r.values).filter(r=>r.calendar_ref===id);
  if(!exceptions.length)c.leap_rule='NONE';else if(exceptions.length===2&&exceptions.some(x=>x.cycle_years===4&&(x.remainder??0)===0&&x.except_cycle_years===100&&x.month===2&&x.extra_days===1)&&exceptions.some(x=>x.cycle_years===400&&(x.remainder??0)===0&&!x.except_cycle_years&&x.month===2&&x.extra_days===1))c.leap_rule='GREGORIAN';else fail('CALENDAR_EXCEPTION_UNSUPPORTED','此历法例外规则尚不能无损结算；保留原定义，未当成公历');
 }}
 if(d.ticks_per_minute!=null){if(!Number.isSafeInteger(d.ticks_per_minute)||d.ticks_per_minute<=0)fail('TIME_PRECISION','历法刻度无效');if(d.ticks_per_minute>1)fail('TIME_PRECISION','当前结算精度为世界分钟，不能舍去更细刻度');c.tick_minutes=1;}
 return c;
}
