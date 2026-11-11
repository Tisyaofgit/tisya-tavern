// Read-only, message-local evidence. Never read message text, iframe documents,
// URLs, arbitrary DOM attributes, or user variables; never mount a runtime.
const boolean = value => typeof value === 'boolean' ? value : null;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const versionNumber = value => typeof value === 'string' && value.length <= 80 && /^v?\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9._-]+)?$/.test(value) ? value : null;
const publicStates = new Set(['pending', 'waiting', 'ready', 'mounted', 'missing', 'hidden', 'partial', 'unavailable', 'unknown']);
const panel = value => value && typeof value === 'object' ? {
 expected: count(value.expected), mounted: count(value.mounted), status: publicStates.has(value.status) ? value.status : null,
} : null;
const displayValues = new Set(['none', 'contents', 'block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'flow-root', 'table', 'inline-table', 'table-row', 'table-cell', 'table-row-group', 'table-header-group', 'table-footer-group', 'table-column', 'table-column-group', 'table-caption', 'list-item']);
const visibilityValues = new Set(['visible', 'hidden', 'collapse']);
const markers = ['tisya-source-concealed', 'tisya-native-pruned', 'tisya-native-extra-collapsed', 'tisya-native-collapsed', 'tisya-native-panels'];

function role(element) {
 for (const [selector, name] of [
  ['iframe[id^="TH-message--"]', 'helper-frame'], ['.TH-render', 'helper-wrapper'], ['.mes_text', 'native-source'],
  ['.tisya-message-visual', 'projection'], ['.tisya-message-actions-tail', 'action-tail'],
  ['.mes_block', 'message-block'], ['.mes', 'message'], ['body', 'body'], ['html', 'html'],
 ]) if (element.matches(selector)) return name;
 return 'element';
}

/**
 * Options are already-known public facts, not source objects. Boolean flags may
 * be unknown. panelStatus accepts {expected,mounted,status?} or {body,extra}.
 * "iframe-present" means a connected TH iframe node, not successful loading.
 * Toolbar order is DOM/flex flow order, not a screenshot or a pixel-layout test.
 */
export function inspectNativeRender(document, node, {version, structured, projection, panelStatus, managed} = {}) {
 const message = node?.matches?.('.mes') ? node : node?.closest?.('.mes');
 const base = {schema: 'tisya.native-render-diagnostic/1', version: versionNumber(version), available: !!message};
 if (!message || !document?.defaultView?.getComputedStyle) return {...base, available: false};
 const select = selector => [...message.querySelectorAll(selector)].filter(element => element.closest('.mes') === message);
 const styles = new WeakMap();
 function style(element) {
  if (styles.has(element)) return styles.get(element);
  let value;
  try {
   const css = document.defaultView.getComputedStyle(element), order = Number(css.order);
   value = {available: true, display: displayValues.has(css.display) ? css.display : 'other',
    visibility: visibilityValues.has(css.visibility) ? css.visibility : 'unknown',
    order: Number.isSafeInteger(order) ? order : 0,
    direction: ['row', 'row-reverse', 'column', 'column-reverse'].includes(css.flexDirection) ? css.flexDirection : 'unknown'};
  } catch { value = {available: false, display: 'unknown', visibility: 'unknown', order: 0, direction: 'unknown'}; }
  styles.set(element, value); return value;
 }
 function visibility(element) {
  if (!element) return null;
  const ancestors = [], reasons = []; let current = element;
  for (let depth = 0; current && depth < 64; depth++, current = current.parentElement) {
   const css = style(current), hiddenAttribute = current.hasAttribute('hidden');
   ancestors.push({depth, role: role(current), display: css.display, visibility: css.visibility, hiddenAttribute,
    markers: markers.filter(name => current.classList.contains(name))});
   if (css.display === 'none') reasons.push({depth, reason: 'display:none'});
   if (hiddenAttribute) reasons.push({depth, reason: 'hidden-attribute'});
   if (depth === 0 && ['hidden', 'collapse'].includes(css.visibility)) reasons.push({depth, reason: 'visibility:' + css.visibility});
  }
  // A hidden attribute can be overridden by CSS; report it without treating the
  // attribute alone as proof that the current element is visually concealed.
  const own = style(element), hidden = ancestors.some(item => item.display === 'none') || ['hidden', 'collapse'].includes(own.visibility);
  return {connected: element.isConnected, display: own.display, visibility: own.visibility,
   hiddenAttribute: element.hasAttribute('hidden'), hiddenByStyles: hidden ? true : own.visibility === 'unknown' || ancestors.some(item => item.display === 'unknown') ? null : false,
   reasons, ancestors, ancestorsTruncated: !!current};
 }
 const source = select('.mes_text')[0] ?? null, frames = select('iframe[id^="TH-message--"]');
 const wrappers = select('.TH-render'), codeBlocks = select('pre'), toggles = select('.TH-collapse-code-block-button');
 const placeholders = select('.tt-runtime-placeholder'), ghosts = select('.tt-runtime-ghost');
 const projections = select('.tisya-message-visual'), tails = select('.tisya-message-actions-tail');
 const toolbars = select('.tisya-actions,.mes_buttons,.mes_edit_buttons'), block = select('.mes_block')[0] ?? message;
 function directChild(element) {
  while (element && element.parentElement !== block) element = element.parentElement;
  return element;
 }
 const content = [...new Set([source, ...projections, ...tails].filter(Boolean).map(directChild).filter(Boolean))];
 const tools = [...new Set(toolbars.map(directChild).filter(Boolean))];
 const mixed = content.some(element => tools.includes(element));
 const later = (contentNodes, toolNodes, ordered) => contentNodes.filter(element => toolNodes.some(toolbar => ordered.indexOf(toolbar) < ordered.indexOf(element))).length;
 const children = [...block.children], domLater = tools.length && !mixed ? later(content, tools, children) : null;
 const blockStyle = style(block), visibleContent = content.filter(element => visibility(element).hiddenByStyles !== true), visibleTools = tools.filter(element => visibility(element).hiddenByStyles !== true);
 let orderBasis = 'unavailable', flowLater = null;
 if (visibleTools.length && !mixed && blockStyle.available) {
  let ordered = children;
  if (['flex', 'inline-flex'].includes(blockStyle.display) && ['column', 'column-reverse'].includes(blockStyle.direction)) {
   ordered = children.map((element, index) => ({element, index, order: style(element).order})).sort((a, b) => a.order - b.order || a.index - b.index).map(item => item.element);
   if (blockStyle.direction === 'column-reverse') ordered.reverse();
   orderBasis = 'flex-' + blockStyle.direction;
  } else if (!['flex', 'inline-flex', 'grid', 'inline-grid'].includes(blockStyle.display)) orderBasis = 'dom-flow';
  if (orderBasis !== 'unavailable') flowLater = later(visibleContent, visibleTools, ordered);
 }
 const activeFrames = frames.filter(frame => frame.isConnected).length;
 const runtimeState = activeFrames ? 'iframe-present' : frames.length ? 'detached-iframe' : placeholders.length && ghosts.length ? 'placeholder-and-ghost' : placeholders.length ? 'placeholder' : ghosts.length ? 'ghost' : toggles.length || wrappers.length || codeBlocks.length ? 'code-only' : 'absent';
 const projected = message.classList.contains('tisya-projected') || projections.length > 0;
 const nativeBeauty = !!source?.classList.contains('tisya-native-beauty');
 return {...base,
  state: {connected: message.isConnected, structured: boolean(structured), managed: boolean(managed), projectionReported: boolean(projection),
   projectionPresent: projected, nativeBeauty, presentation: nativeBeauty ? 'native-beauty' : projected ? 'projected' : 'host-content',
   sourcePresent: !!source, sourceConcealed: !!source?.classList.contains('tisya-source-concealed')},
  counts: {helperWrappers: wrappers.length, pre: codeBlocks.length, codeToggles: toggles.length, helperFrames: frames.length, hostPlaceholders: placeholders.length, ghosts: ghosts.length},
  runtime: {state: runtimeState, activeIframeCount: activeFrames,
   note: activeFrames ? '检测到已连接 TH iframe；尚未据此核验页面加载或交互成功。' : '尚无活跃页面；代码开关仅切换源码显示，不能据此推断启用设置或渲染深度。'},
  source: visibility(source), frames: frames.map((frame, index) => ({index, ...visibility(frame)})),
  toolbar: {count: toolbars.length, domLast: domLater === null ? null : domLater === 0,
   last: flowLater === null ? null : flowLater === 0, orderBasis, laterContentCount: flowLater},
  publicPanels: panelStatus && typeof panelStatus === 'object' && ('body' in panelStatus || 'extra' in panelStatus) ? {body: panel(panelStatus.body), extra: panel(panelStatus.extra)} : panel(panelStatus),
 };
}
