// Name/dimension defaults only. Conversion ratios remain authored world rules.
const groups=[
 ['time','岁',['岁','周岁']],['time','年',['年','年份'],'year'],['time','月',['月','个月'],'month'],['time','季度',['季度','季'],'season'],['time','周',['周','星期'],'week'],['time','天',['天','日'],'day'],['time','小时',['小时','时','钟头','h'],'hour'],['time','分钟',['分钟','分','min'],'minute'],['time','秒',['秒','秒钟','s']],['time','毫秒',['毫秒','ms']],
 ['length','米',['米','公尺','m']],['length','千米',['千米','公里','km']],['length','厘米',['厘米','公分','cm']],['length','毫米',['毫米','mm']],['length','微米',['微米','μm','µm']],
 ['mass','千克',['千克','公斤','kg']],['mass','克',['克','g']],['mass','毫克',['毫克','mg']],['mass','吨',['吨','t']],
 ['area','平方米',['平方米','平米','m²','m2']],['area','平方厘米',['平方厘米','cm²','cm2']],['area','平方千米',['平方千米','平方公里','km²','km2']],['area','公顷',['公顷','ha']],
 ['volume','升',['升','L','l']],['volume','毫升',['毫升','mL','ml']],['volume','立方米',['立方米','m³','m3']],['volume','立方厘米',['立方厘米','cm³','cm3']],
 ['count','个',['个']],['count','件',['件']],['count','次',['次']],['count','人',['人']],['count','只',['只']],['count','张',['张']],['count','本',['本']],['count','枚',['枚']],['count','份',['份']],['count','组',['组']],['count','套',['套']],['count','回合',['回合']],
 ['ratio','百分比',['百分比','%','％']],['ratio','倍',['倍']],['score','点',['点']],['score','积分',['积分']],['temperature','摄氏度',['摄氏度','℃','°C']],['temperature','华氏度',['华氏度','℉','°F']],['temperature','开尔文',['开尔文','K']]
];
const aliases=new Map(groups.flatMap(([dimension,label,names,component])=>names.map(name=>[name,{dimension,label,component}])));
export const commonUnit=name=>aliases.get(String(name).trim());
export const unitFormInstructions='单位：岁、小时、分钟、米、厘米、公斤、升、件等常见单位及常用缩写由程序自动登记，数值可写“18岁”或“数值：18；单位：岁”。优先沿用已登记定义。未登记的自定义单位在本轮 <cells> 的【单位定义／序号】填写单位显示名、量纲及来源说明，再由其他字段引用该名称；可先引用后定义。所属世界省略时沿用当前世界，尚无世界则使用GLOBAL。自定义量纲填写custom并说明自定义量纲名；换算率只按明确规则另填单位换算，未说明的历法、换算和币种含义不补造。';
