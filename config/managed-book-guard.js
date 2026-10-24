export function assertOrdinaryWorldbook(data,action){
 if(Object.values(data?.entries??{}).some(entry=>entry?.extensions?.tisyaBook))throw Error(`这是缇斯亚托管的存档／原点／基点书，不能在普通世界书页${action}文件。请到“资料绑定”调整显示名称；稳定存档编号必须保留。`);
}
