import {createHash} from 'node:crypto';
// A declared story generation fixture, with the same candidate-bound metadata
// as the production MESSAGE_RECEIVED adapter. Legacy fixtures omit this helper.
export function storyMessage(text,name='甲'){
 const hash=createHash('sha256').update(JSON.stringify({candidate:0,name,text})).digest('hex');
 return {is_user:false,name,mes:text,extra:{tisyaSourceProvenance:{version:1,candidates:{[hash]:{kind:'story',mode:'test-story'}}}}};
}
