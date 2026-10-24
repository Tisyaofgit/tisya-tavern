const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function validateWorldbookPreferences(value){
 if(!plain(value)||Object.keys(value).some(key=>!['bookOrder','tags','auto','pin','layoutOrder'].includes(key)))throw Error('世界书界面配置字段无效');
 if(value.bookOrder!==undefined&&(!Array.isArray(value.bookOrder)||value.bookOrder.some(name=>typeof name!=='string'||!name)||new Set(value.bookOrder).size!==value.bookOrder.length))throw Error('世界书队列配置无效');
 if(value.tags!==undefined&&(!plain(value.tags)||Object.keys(value.tags).some(key=>!['prefix','suffix'].includes(key))||!['prefix','suffix'].every(key=>Array.isArray(value.tags[key])&&value.tags[key].every(tag=>typeof tag==='string'))))throw Error('世界书标签配置无效');
 for(const key of ['auto','pin','layoutOrder'])if(value[key]!==undefined&&typeof value[key]!=='boolean')throw Error('世界书界面开关无效：'+key);
 return value;
}
