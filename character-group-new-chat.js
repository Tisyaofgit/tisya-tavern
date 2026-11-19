// Selection can itself create the first chat for a character. Count native
// files around that transition so a single user action never creates two.
export async function createNamedChat({list,select,create,rename,open,current,name}){
 const title=String(name??'').trim();
 if(!title||title.length>120||/[\\/:*?"<>|\u0000-\u001f]/u.test(title))throw Error('会话标题须为 1–120 字，且不能包含文件名禁用字符');
 const before=new Set(await list());
 if(before.has(title))throw Error('已存在同名会话，请换一个标题');
 await select();
 const afterSelect=new Set(await list()),selected=[...afterSelect].filter(id=>!before.has(id));
 if(selected.length>1)throw Error('切换角色时出现多条新会话，已停止继续创建，请刷新会话列表核对');
 let created=selected[0];
 if(!created){
  await create();
  const afterCreate=new Set(await list()),newFiles=[...afterCreate].filter(id=>!afterSelect.has(id));
  if(newFiles.length!==1)throw Error('宿主新建结果无法唯一确认，请刷新会话列表核对，勿重复点击');
  created=newFiles[0];
 }
 if(current()!==created)throw Error('新会话已经生成，但当前会话未指向它，请刷新核对：'+created);
 if(created!==title){
  let renamed;
  try{renamed=await rename(created,title);}catch(e){throw Error('新会话已创建为「'+created+'」，改名未完成：'+e.message+'。请在历史会话中核对');}
  const file=typeof renamed==='string'?renamed.replace(/\.jsonl$/i,''):'';
  if(!file||!(await list()).includes(file))throw Error('新会话已创建，但改名结果未获确认；请在历史会话中核对，勿重复创建');
  created=file;
 }
 if(current()!==created){await open(created);if(current()!==created)throw Error('新会话已改名，但宿主未切换到它，请从历史会话打开：'+created);}
 return created;
}
