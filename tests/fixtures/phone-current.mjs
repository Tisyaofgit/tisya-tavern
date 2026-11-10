import {PHONE_WORLD_FORMAT,PHONE_CHARACTER_FORMAT} from '../../phone-life-config.mjs';

// Current normalized form projections for domain tests. No legacy text parser or
// production storage adapter is substituted here.
export const currentCalendar=()=>({mode:'MONTH_TABLE',month_lengths:[31,28,31,30,31,30,31,31,30,31,30,31],leap_rule:'GREGORIAN',year:2033,month:2,day:9,hour:23,minute:30,day_hours:24,hour_minutes:60});
export function phoneProfile({worldId='w',personId='person-a',world={},character={},calendar=currentCalendar()}={}){
 const w={format:PHONE_WORLD_FORMAT,id:worldId,name:'测试世界',apps:['weibo','wallet','shop','food','album','music','map','calendar'],appNames:{},theme:{},phoneEpoch:null,settlementOwner:'tables',currency:null,economy:{deliveryFees:{shop:null,food:null},loan:null,investments:[]},travel:{speeds:{}},places:[],catalog:[],...structuredClone(world)};
 w.economy={deliveryFees:{shop:null,food:null},loan:null,investments:[],...w.economy};
 const c={format:PHONE_CHARACTER_FORMAT,id:personId,name:'本人',position:null,activeAccountId:null,wallet:{accounts:[],defaultAccountId:null,fundingAccountId:null,loans:[],investments:[]},contacts:[],accounts:[],posts:[],photos:[],songs:[],playlists:[],calendar:[],...structuredClone(character)};
 c.wallet={accounts:[],defaultAccountId:null,fundingAccountId:null,loans:[],investments:[],...c.wallet};
 c.accounts=c.accounts.map(a=>({handle:a.id,personId:a.owned?personId:null,following:[],...a}));
 return {database:true,calendar:structuredClone(calendar),binding:{world:{database:true,worldId:w.id},character:{database:true,entityId:c.id,dossierId:c.id}},world:w,character:c};
}

export const fundedPhoneProfile=(options={})=>phoneProfile({
 world:{currency:{name:'银元',symbol:'¤',minorUnits:2},economy:{deliveryFees:{shop:0,food:0}},places:[{id:'home',name:'家',x:0,y:0,known:true}],catalog:[{id:'book',name:'纸书',price:100,stock:20,kind:'physical',placeId:'home',tags:[]}],...options.world},
 character:{position:'home',wallet:{accounts:[{id:'cash',name:'零钱',balance:100000}],defaultAccountId:'cash',fundingAccountId:'cash'},contacts:[{id:'person-b',name:'对方'}],accounts:[{id:'me',name:'本人',owned:true}],...options.character},
 ...Object.fromEntries(Object.entries(options).filter(([key])=>!['world','character'].includes(key))),
});

export function installPhoneClock(runtime,profile){
 const c=profile.calendar;if(!c)return;
 const world=profile.world.id,calendar='calendar:'+world;
 runtime.newRecord('M_CALENDAR_RULES',{world_ref:world,mode:'MONTH_TABLE',year_numbering:'astronomical',value_state:'known',epoch_year:c.year,hours_per_day:c.day_hours,minutes_per_hour:c.hour_minutes},calendar);
 for(const [i,days] of c.month_lengths.entries())runtime.newRecord('M_CALENDAR_MONTHS',{calendar_ref:calendar,month:i+1,days},calendar+':month:'+(i+1));
 if(c.leap_rule==='GREGORIAN')for(const x of [{cycle_years:4,remainder:0,except_cycle_years:100,month:2,extra_days:1},{cycle_years:400,remainder:0,month:2,extra_days:1}])runtime.newRecord('M_CALENDAR_EXCEPTIONS',{calendar_ref:calendar,...x},calendar+':leap:'+x.cycle_years);
 runtime.newRecord('X_WORLD_CLOCKS',{world_ref:world,year:c.year,month:c.month,day:c.day,hour:c.hour,minute:c.minute},'world-clock:'+world);
}
