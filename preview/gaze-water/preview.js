import {mountActionChoice} from '../../actions.js';
import {replyControlsCSS} from '../../reply-details.js';
import {mountConfiguration} from '../../config/panel.js';
import {createStore} from '../../config/core.js';
const style=document.createElement('style');style.textContent=replyControlsCSS;document.head.append(style);
const face=new FontFace('TisyaReading',await new Blob(await Promise.all([1,2,3,4].map(async i=>await (await fetch('../../font/reading.part'+i+'.bin')).arrayBuffer()))).arrayBuffer());await face.load();document.fonts.add(face);
window.choices=[];window.ui=mountActionChoice(document,document.querySelector('#actions'),{rows:[{type:'交流',text:'把那封没有署名的信推回去，请他亲口说明来意。',possibility:'听见他尚未说出口的打算'},{type:'调查',text:'顺着玻璃上的水痕，辨认窗外一闪而过的人影。',possibility:'寻找街角留下的线索'},{type:'操作',text:'替他扶稳松开的袖扣，问一句：刚才的话还算数吗？',possibility:'让试探有了具体的回应'},{type:'移动',text:'和他走进雨后的长廊。先沿灯光找一处能把信读完的地方，再决定是否赴约。',possibility:'在共同事务中展开新的交谈'}],onChoose:(text,mode)=>{window.choices.push({text,mode});return {message:'预览已选中；没有发送消息。'};}});
const cards=document.querySelector('#cards'),ctx={chatId:'preview',characterId:0,characters:[{avatar:'preview.png'}],chatMetadata:{variables:{}},extensionSettings:{}};const store=createStore({getContext:()=>ctx,persist:async()=>true});const configuration=mountConfiguration(document,cards,{store,host:{archives:async()=>[]},getSettings:()=>({联系人分组:{}}),initialTab:'world'});await configuration.ready;window.previewStore=store;window.configuration=configuration;window.ready=true;
