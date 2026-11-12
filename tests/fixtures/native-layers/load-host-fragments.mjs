import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const provenance = JSON.parse(readFileSync(new URL('./host-fragments.json', import.meta.url), 'utf8'));

// Native methods/classes below are exact fixed-commit excerpts, including their
// budget, name/role, injection ordering and trim semantics. Only the imports,
// tokenizer and surrounding PromptManager UI shell are supplied by this harness.
// The deterministic counter is not a model tokenizer and makes no API requests.
export function loadNativeHost({substitute = value => value ?? '', count} = {}) {
 const blocks = provenance.blocks;
 for (const [name, block] of Object.entries(blocks)) {
  if (createHash('sha256').update(block.text).digest('hex') !== block.sha256)
   throw new Error('Native fixture changed: ' + name);
 }
 const tokenCalls = [];
 const tokenHandler = {async countAsync(message) {
  tokenCalls.push({...message});
  return count ? count(message) : [...String(message.content ?? '')].length + [...String(message.name ?? '')].length + 3;
 }};
 const names = Object.keys(blocks).filter(name => !['preparePrompt','setChatCompletion','getPromptCollection'].includes(name));
 const source = names.map(name => blocks[name].text.replace(/^export /, '')).join('\n\n');
 const evaluate = new Function('tokenHandler','substituteParams', `
  const DEFAULT_ORDER = 100;
  const AGENT_SYSTEM_PROMPT_IDENTIFIER = 'agentSystemPrompt';
  const ATTACH_ROLES = new Set(['system','user','assistant']);
  const ATTACH_SIDES = new Set(['start','end']);
  const extension_prompt_roles = {SYSTEM:0, USER:1, ASSISTANT:2};
  const extension_prompt_types = {IN_CHAT:1};
  const inject_ids={CUSTOM_WI_OUTLET:key=>'customWIOutlet_'+key};
  // Only external registries/non-source helpers are inert in this fixture.
  // The host's actual env-macro regex loop and frozen source mapping execute.
  const MacrosParser={populateEnv(){},sanitizeMacroValue:value=>value==null?'':String(value)};
  const escapeRegex=text=>String(text).replace(/[.*+?^$\{\}()|[\]\\\\]/g,'\\\\$&');
  const uuidv4=()=> 'fixture-macro-nonce';
  const getInstructMacros=()=>[],getVariableMacros=()=>[];
  const inert=()=>({regex:/(?!)/g,replace:()=>''});
  const getDiceRollMacro=inert,getTimeDiffMacro=inert,getBannedWordsMacro=inert,getRandomReplaceMacro=inert,getPickReplaceMacro=inert;
  const getPromptAssemblyRuntime = runtime => runtime;
  const getExtensionPromptMaxDepth = () => 12;
  const substitutePromptParams = (text,options,runtime) => (runtime?.substitute ?? substituteParams)(text,options);
  ${source}
  class PromptManager {
   #dryRunPending = false;
   constructor({handler=tokenHandler,active=true,substitute=substituteParams,group=[]}={}) {
    this.tokenHandler=handler;
    this.substituteParams=substitute;
    this.serviceSettings={prompts:active?[{identifier:'tisya_user_identity'}]:[]};
    this.group=group;
   }
   getActiveGroupCharacters(){return this.group;}
   getPromptOrderForCharacter(){return this.serviceSettings.prompt_order ?? [];}
   getPromptById(identifier){return this.serviceSettings.prompts.find(prompt=>prompt.identifier===identifier);}
   shouldTrigger(prompt){return prompt?.fixtureTrigger !== false;}
   setMessages(messages){this.messages=messages;}
   populateTokenCounts(messages){this.tokenCount=messages.getTokens();}
   ${blocks.preparePrompt.text}
   ${blocks.setChatCompletion.text}
   ${blocks.getPromptCollection.text}
  }
  return {${names.join(',')},PromptManager};
 `);
 return {...evaluate(tokenHandler, substitute), tokenHandler, tokenCalls,
  runtime:{settings:{new_example_chat_prompt:'NEW EXAMPLE'},tokenHandler,substitute}};
}
