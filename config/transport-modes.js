export const TRANSPORT_MODES=[['off','关闭'],['universal','开启']];
const enabled=new Set(['universal','tool-text','tool-text-tools','verify','verify-tools']);
export const normalizeTransportMode=value=>enabled.has(value)?'universal':value==='vertex-streaming'?'off':value;
export const LEGACY_TRANSPORT_MODES=['tool-text','tool-text-tools','verify','verify-tools','vertex-streaming'];
