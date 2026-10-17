// Fixed transport frame shared by every registered auxiliary mode. Only the
// task intake, workflow and delivery contract are supplied by the capability.
export const TASK_HEAD=Object.freeze(['tisya_new_chat','tisya_session_reset','main','tisya_identity_attestation','tisya_user_relation','tisya_task_start','tisya_material_boundary_open']);
export const TASK_TAIL=Object.freeze(['tisya_material_boundary_close','tisya_registry','tisya_internal_login','tisya_inner_chain','tisya_think_commit','tisya_delivery_warning','tisya_prepare_trigger']);
export const promptRole=id=>['tisya_identity_attestation','tisya_think_commit'].includes(id)?'assistant':id==='tisya_user_relation'?'user':'system';
export function framePrompts(entries,middle){return [...TASK_HEAD.map(id=>({identifier:id,role:promptRole(id),content:entries[id]})),...middle,...TASK_TAIL.map(id=>({identifier:id,role:promptRole(id),content:entries[id]}))];}
