import { createHook } from 'node:async_hooks';
import fs from 'node:fs';

const resources = new Map();
const tracked = new Set(['Timeout', 'Immediate', 'MESSAGEPORT', 'TCPWRAP', 'TCPSERVERWRAP', 'PIPEWRAP', 'PROCESSWRAP']);
const hook = createHook({
  init(id, type, trigger, resource) {
    if (!tracked.has(type)) return;
    const stack = new Error().stack;
    if (stack.includes('identity-active-handles.mjs:20')) return;
    resources.set(id, {type, trigger, created: Date.now(), stack, resource});
  },
  destroy(id) { resources.delete(id); }
});
hook.enable();
setTimeout(() => {
  const entries = [...resources].map(([id, value]) => ({id, type:value.type, age_ms:Date.now()-value.created,
    hasRef: typeof value.resource.hasRef === 'function' ? value.resource.hasRef() : null,
    repeat:value.resource._repeat, stack:value.stack}));
  fs.writeSync(2, '\nACTIVE_HANDLES_DIAGNOSTIC '+JSON.stringify({pid:process.pid,testContext:process.env.NODE_TEST_CONTEXT,entries,handles:process._getActiveHandles().map(h=>h.constructor.name)})+'\n');
}, 12000).unref();
