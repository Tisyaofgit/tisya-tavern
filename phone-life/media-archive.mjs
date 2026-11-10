// Original media belongs to immutable IDs. A complete backup includes every
// retained branch and frozen frame, including files no longer in the live view.
export function phoneArchiveMediaIds(archive,{bindingKey}={}){
 const ids=new Set();
 const add=id=>{if(id!==null&&id!==undefined){if(typeof id!=='string'||!id)throw Error('媒体编号无效，完整备份已停止。');ids.add(id);}};
 function domain(value){if(!value)return;if(bindingKey&&value.bindingKey!==bindingKey)throw Error('历史媒体属于其他世界或角色，未混入当前备份。');const media=value.state?.media;if(!media)throw Error('生活历史缺少媒体清单。');for(const photo of media.photos??[])if(photo.source==='file')add(photo.id);for(const song of media.songs??[])add(song.audioId);}
 function actions(rows){for(const action of rows??[]){if(action.type==='media.photo.add'&&action.photo?.source==='file')add(action.photo.id);if(action.type==='music.song.add')add(action.song?.audioId);if(action.type==='music.source.attach')add(action.mediaId);}}
 function events(rows){for(const event of rows??[]){domain(event.initial);actions(event.actions);}}
 function boundary(value){if(!value)return;domain(value.initial);domain(value.life);events(value.eventLog);}
 domain(archive.lifeInitial);domain(archive.life);events(archive.lifeEventLog);
 for(const request of Object.values(archive.requests??{}))boundary(request.lifeSnapshot);
 for(const frame of Object.values(archive.frames??{})){boundary(frame.lifeBefore);boundary(frame.lifeAfter);}
 return [...ids].sort();
}
