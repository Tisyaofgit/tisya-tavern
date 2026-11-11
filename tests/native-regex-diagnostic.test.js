import test from 'node:test';
import assert from 'node:assert/strict';
import {collectNativeRegexDiagnostic as collect} from '../native-regex-diagnostic.js';
const eligible = placement => ({disabled: false, markdownOnly: true, placement});
const options = rows => ({isUser: false, context: {chatId: 'PRIVATE-CHAT', extensionSettings: {disabledExtensions: []}}, theme: {nativeRegex: true},
 nativeDisplay: {state: () => ({enabled: true, scripts: rows}), report: () => ({rules: rows.length, revision: 3})},
 hostRules: {allowedOnly: {all: () => rows}, all: {all: rows}}});
test('separates existing pipeline, raw configuration, and allowed/all host evidence', async () => {
 const rows = [eligible([2]), {...eligible([2]), disabled: true}, {...eligible([2]), markdownOnly: false}, eligible([1]), {}];
 const input = options(rows); input.nativeDisplay.report = {rules: 1, revision: 8};
 input.hostRules.all.all = [...rows, eligible([2])]; input.hostRules.allowedOnly.global = [rows[0]];
 const r = await collect(input);
 assert.deepEqual(r.nativeDisplay.currentRules.metadataEligible, {true: 1, false: 3, unknown: 1});
 assert.equal(r.nativeDisplay.currentScriptCount.value, 5); assert.equal(r.nativeDisplay.preparedEntryCount.value, 1);
 assert.equal('compiledRuleCount' in r.nativeDisplay, false);
 assert.equal(r.hostRules.all.all.total, 6); assert.equal(r.hostRules.allowedOnly.all.total, 5);
 assert.equal(r.hostRules.allowedOnly.global.total, 1); assert.equal(r.hostRules.allowedOnly.preset.status, 'unknown');
 assert.equal(r.context.chatIdPresent.value, true); assert.equal(r.context.regexExtensionDisabled.value, false);
 assert.equal(r.boundaries.matchingVerified, false); assert.equal(r.boundaries.rawSettingsAreEffective, false);
 assert.equal(r.nativeDisplay.pipelineLastRefreshedAtUtc.state, 'unknown');
 assert.ok(Date.parse(r.nativeDisplay.stateReadAtUtc)); assert.ok(Date.parse(r.hostRules.all.all.readAtUtc));
});
test('current user and assistant placement are independent of prepared assistant entries', async () => {
 const input = options([eligible([1]), eligible([2]), eligible([1, 2])]);
 assert.deepEqual((await collect(input)).nativeDisplay.currentRules.metadataEligible, {true: 2, false: 1, unknown: 0});
 input.isUser = true;
 const r = await collect(input); assert.equal(r.message.placement.value, 1);
 assert.deepEqual(r.nativeDisplay.currentRules.metadataEligible, {true: 2, false: 1, unknown: 0});
 delete input.isUser;
 assert.deepEqual((await collect(input)).nativeDisplay.currentRules.metadataEligible, {true: 0, false: 0, unknown: 3});
});
test('missing, malformed and accessor fields never become false or zero', async () => {
 const r = await collect({});
 assert.equal(r.nativeDisplay.enabled.state, 'unknown'); assert.equal(r.nativeDisplay.currentScriptCount.value, null);
 assert.equal(r.context.regexExtensionDisabled.state, 'unknown'); assert.equal(r.hostRules.all.all.total, null);
 const input = options([{disabled: 'false', markdownOnly: true, placement: [2]}, {disabled: false, placement: [2]}]);
 assert.deepEqual((await collect(input)).nativeDisplay.currentRules.metadataEligible, {true: 0, false: 0, unknown: 2});
});
test('never invokes input getters, including then getters, and never serializes private fields', async () => {
 let getters = 0;
 const trap = {get() { getters++; throw Error('PRIVATE-SENTINEL'); }};
 const row = eligible([2]);
 for (const key of ['scriptName', 'findRegex', 'replaceString', 'then']) Object.defineProperty(row, key, trap);
 Object.defineProperty(row, 'disabled', trap);
 const state = {enabled: true, scripts: [row], private: 'PRIVATE-SENTINEL'}; Object.defineProperty(state, 'then', trap);
 const input = options([row]); input.nativeDisplay.state = () => state;
 input.context.extensionSettings.disabledExtensions = ['SECRET-EXT', 'regex']; input.context.chatId = 'PRIVATE-SENTINEL';
 input.theme.cardName = 'PRIVATE-SENTINEL';
 const r = await collect(input);
 assert.equal(getters, 0); assert.equal(r.context.regexExtensionDisabled.value, true);
 assert.equal(r.nativeDisplay.currentRules.disabled.unknown, 1);
 assert.equal(JSON.stringify(r).includes('PRIVATE-SENTINEL'), false); assert.equal(JSON.stringify(r).includes('SECRET-EXT'), false);
});
test('captures throwing and rejecting callbacks without error text', async () => {
 const input = options([]);
 input.nativeDisplay.state = () => { throw Error('SECRET'); };
 input.nativeDisplay.report = () => Promise.reject(Error('SECRET'));
 const r = await collect(input);
 assert.equal(r.nativeDisplay.enabled.reason, 'callback-error'); assert.equal(r.nativeDisplay.preparedEntryCount.reason, 'callback-error');
 assert.equal(JSON.stringify(r).includes('SECRET'), false);
});
test('bounds async callback waits and consumes late rejection', async () => {
 const input = options([]); input.timeoutMs = 2;
 input.nativeDisplay.state = () => new Promise((_, reject) => setTimeout(() => reject(Error('SECRET')), 15));
 input.hostRules.allowedOnly.all = () => new Promise(() => {});
 const r = await collect(input);
 assert.equal(r.nativeDisplay.enabled.reason, 'timeout'); assert.equal(r.hostRules.allowedOnly.all.reason, 'timeout');
 await new Promise(resolve => setTimeout(resolve, 25));
});
test('does not refresh, compile, match or mutate frozen source objects', async () => {
 const row = Object.freeze({...eligible(Object.freeze([2])), get findRegex() { throw Error('must not read'); }});
 const rows = Object.freeze([row]), input = options(rows);
 input.nativeDisplay.refresh = () => { throw Error('must not refresh'); };
 input.nativeDisplay.project = () => { throw Error('must not execute'); };
 const r = await collect(input); assert.equal(r.nativeDisplay.currentRules.metadataEligible.true, 1);
 assert.equal(Object.isFrozen(rows), true); assert.equal(Object.isFrozen(row), true);
});
test('unknown indices, scan limits, revoked proxies and option getters stay safe', async () => {
 let getterCalls = 0;
 const rows = new Array(1); Object.defineProperty(rows, '0', {get() { getterCalls++; return eligible([2]); }});
 const input = options(rows); assert.equal((await collect(input)).nativeDisplay.currentRules.metadataEligible.unknown, 1);
 input.hostRules.all.all = new Array(10001); assert.equal((await collect(input)).hostRules.all.all.reason, 'scan-limit');
 const {proxy, revoke} = Proxy.revocable([], {}); revoke(); input.hostRules.all.all = proxy;
 assert.equal((await collect(input)).hostRules.all.all.status, 'unknown');
 Object.defineProperty(input, 'context', {get() { getterCalls++; return {}; }});
 await collect(input); assert.equal(getterCalls, 0);
});
test('bounds cumulative rule/placement scanning and accepts guarded raw callbacks', async () => {
 const input = options([eligible([2])]);
 input.context = () => { throw Error('PRIVATE'); }; input.theme = () => new Promise(() => {}); input.timeoutMs = 2;
 const failed = await collect(input);
 assert.equal(failed.context.chatIdPresent.reason, 'callback-error'); assert.equal(failed.context.themeNativeRegex.reason, 'timeout');
 assert.equal(failed.nativeDisplay.enabled.value, true); assert.equal(JSON.stringify(failed).includes('PRIVATE'), false);
 input.nativeDisplay.state = {enabled: true, scripts: [eligible(new Array(33).fill(2))]};
 assert.equal((await collect(input)).nativeDisplay.currentRules.metadataEligible.unknown, 1);
 input.nativeDisplay.state = {enabled: true, scripts: new Array(10000).fill(eligible([1, 1, 1]))};
 const limited = await collect(input);
 assert.equal(limited.nativeDisplay.currentRules.reason, 'scan-limit');
 assert.ok(limited.nativeDisplay.currentRules.metadataEligible.unknown > 0);
 assert.equal(limited.hostRules.all.all.metadataEligible.unknown, 1);
});
