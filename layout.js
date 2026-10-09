import { iconMarkup } from './icons.js';
// Native shells own viewport/safe-area/IME geometry. Tisya owns their contents.
export const VERSION = '0.2.0-alpha.5';
const anonymousDrawerKeys = new WeakMap();
let nextDrawerKey = 0;

export const DRAWERS = [
    ['ai-config-button', '创作设置', '创作'],
    ['sys-settings-button', '模型连接', '创作'],
    ['advanced-formatting-button', '输出格式', '创作'],
    ['WI-SP-button', '世界与资料', '资料'],
    ['persona-management-button', '用户身份', '资料'],
    ['rightNavHolder', '角色卡与群聊', '资料'],
    ['extensions-settings-button', '全部扩展与自动化', '工作流'],
    ['user-settings-button', '外观与系统', '系统'],
    ['backgrounds-button', '背景', '系统'],
];

export const SECTIONS = [
    ['agent', 'agent_system_container', 'Agent 工作流'],
    ['skill', 'skill_manager_container', 'Skill 指南'],
    ['mcp', 'mcp_manager_container', 'MCP 外部工具'],
    ['image', '.sd_settings', '生图设置'],
    ['voice', 'tts_settings', '语音设置'],
];

export function drawerEntries(document) {
    return [...document.querySelectorAll('#top-settings-holder > .drawer')].map((element, index) => {
        const known = DRAWERS.find(([id]) => id === element.id);
        if (!element.id && !anonymousDrawerKeys.has(element)) anonymousDrawerKeys.set(element, `extra-${++nextDrawerKey}`);
        return { element, key: element.id || anonymousDrawerKeys.get(element), label: known?.[1] || element.querySelector('.drawer-icon')?.title || `扩展入口 ${index + 1}`, group: known?.[2] || '其他扩展' };
    });
}

export function chatPreview(text) {
    const source = String(text ?? '');
    // Strip structural blocks only for list previews. Stored messages stay intact.
    return source.replace(/<(think|thinking|analysis|task|audit|style|script)\b[^>]*>[\s\S]*?(?:<\/\1>|$)/gi, ' ')
        .replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|lt|gt|amp|quot);/g, ' ')
        .replace(/(?:^|\n)\s*(?:任务|审计)[:：][^\n]*/g, ' ')
        .replace(/\s+/g, ' ').trim().slice(0, 120) || '打开会话';
}

export function chatTitle(file, character = '') {
    let title = String(file ?? '').replace(/\.jsonl$/i, '');
    if (character && title.startsWith(character)) title = title.slice(character.length).replace(/^\s*[-—·]\s*/, '');
    return title.replace(/(\d{4})-(\d{2})-(\d{2})@(\d{2})h(\d{2})m\d{2}s/g, '$1/$2/$3 $4:$5') || '新会话';
}

export function mountLayout(document) {
    const holder = document.querySelector('#top-settings-holder');
    const sheld = document.querySelector('#sheld');
    const left = document.querySelector('#leftSendForm');
    if (!holder || !sheld || !left) throw new Error('宿主主布局未就绪');
    const restores = [];
    const ownStyle = (element, name, value) => {
        if (!element) return;
        const old = element.style.getPropertyValue(name), priority = element.style.getPropertyPriority(name);
        element.style.setProperty(name, value, 'important');
        restores.push(() => {
            if (element.style.getPropertyValue(name) !== value || element.style.getPropertyPriority(name) !== 'important') return;
            if (old) element.style.setProperty(name, old, priority); else element.style.removeProperty(name);
        });
    };
    // A theme can use !important on these decorative surfaces. Restore on exit.
    ownStyle(document.querySelector('#top-bar'), 'display', 'none');
    ownStyle(document.body, '--topBarBlockSize', '0px');
    for (const [name, value] of Object.entries({background:'transparent', 'box-shadow':'none', 'backdrop-filter':'none', '-webkit-backdrop-filter':'none', border:'0', height:'0px', 'min-height':'0', 'max-height':'0px'})) ownStyle(holder, name, value);

    const top = document.createElement('button');
    top.id = 'tisya-menu-trigger'; top.type = 'button'; top.innerHTML = iconMarkup('menu'); top.className = 'tisya-icon-button'; top.title = '打开侧栏';
    top.dataset.tisyaAction = 'menu'; top.setAttribute('aria-label', '打开侧栏');
    (document.querySelector('#nonQRFormItems')??left).prepend(top);
    const controls = document.createElement('div'); controls.id = 'tisya-panel-controls'; controls.hidden = true;
    controls.innerHTML = '<button type="button" data-tisya-action="menu">菜单</button><span></span><button type="button" data-tisya-action="chat">返回聊天</button>';
    holder.append(controls);
    const root = document.createElement('div'); root.id = 'tisya-shell';
    root.setAttribute('data-tt-mobile-surface', 'none');
    root.innerHTML = '<main class="tisya-page" aria-label="会话与联系人"></main>';
    sheld.append(root);
    const overlay = document.createElement('dialog'); overlay.id = 'tisya-overlay';
    overlay.setAttribute('data-tt-mobile-surface', 'none');
    document.body.append(overlay);
    document.body.classList.add('tisya-active');
    const syncPanels = () => {
        const active = drawerEntries(document).find(entry => entry.element.querySelector(':scope > .drawer-content.openDrawer'));
        controls.hidden = !active;
        controls.querySelector('span').textContent = active?.label || '';
    };
    const observer = new document.defaultView.MutationObserver(records => {
        if (records.some(record => record.target === holder || record.target.classList?.contains('drawer-content'))) syncPanels();
    });
    observer.observe(holder, {childList:true, attributes:true, attributeFilter:['class'], subtree:true});
    syncPanels();
    return { root, top, controls, overlay, dispose() { observer.disconnect(); root.remove(); top.remove(); controls.remove(); overlay.remove(); restores.reverse().forEach(fn => fn()); } };
}

export function installComposer(document, { onError = message => document.defaultView.toastr?.error(message) } = {}) {
    const composer = document.querySelector('#nonQRFormItems'), left = document.querySelector('#leftSendForm'), right = document.querySelector('#rightSendForm');
    if (!composer || !left || !right) return () => {};
    const attachment = document.createElement('button');
    attachment.id = 'tisya-attach'; attachment.type = 'button';
    attachment.title = '添加文件或图片'; attachment.setAttribute('aria-label', '添加文件或图片');
    attachment.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8a7 7 0 0 1 10 10l-8 8"/></svg><span>附件</span>';
    attachment.addEventListener('click', () => {
        const native = document.getElementById('attachFile'), input = document.getElementById('file_form_input');
        if (!native || !input || input.disabled || native.matches('[disabled],[aria-disabled="true"]')) {
            onError('宿主附件功能尚未就绪，请在扩展设置中启用附件功能后重试。');
            return;
        }
        // Keep the user gesture synchronous. The native action installs its change
        // handler and merges existing selections before opening the system picker.
        native.click();
    });
    const separator = document.createElement('div');
    separator.id = 'tisya-composer-separator'; separator.setAttribute('aria-hidden', 'true');
    const originals = new Map();
    const labels = {options_button:'聊天',extensionsMenuButton:'扩展',ttas_agent_send_toggle:'Agent',mes_continue:'接写',mes_impersonate:'代写',stscript_continue:'恢复',stscript_pause:'暂停',stscript_stop:'终止'};
    const scan = () => {
        for (const element of [...left.children, ...right.children]) {
            if (element === attachment || element.hasAttribute('data-tisya-shortcut') || ['send_but', 'mes_stop', 'tisya-menu-trigger'].includes(element.id)) continue;
            if (!originals.has(element)) originals.set(element, {label:element.getAttribute('data-tisya-tool-label'),role:element.getAttribute('role'),tabindex:element.getAttribute('tabindex')});
            element.classList.add('tisya-composer-tool');
            const simple = !element.querySelector('button,input,select,textarea,a') && (!!labels[element.id] || element.matches('button,.interactable,.fa-solid,.fa-fw') || element.textContent.trim().length < 3);
            element.classList.toggle('tisya-tool-compact', simple);
            element.classList.toggle('tisya-tool-caption', simple && (!!labels[element.id] || !/[\p{L}\p{N}]/u.test(element.textContent)));
            const text = labels[element.id] || element.getAttribute('aria-label') || element.title || element.getAttribute('data-tooltip')?.split('\n')[0] || element.textContent.trim() || '扩展操作';
            element.setAttribute('data-tisya-tool-label', text);
            // Simple icon buttons get keyboard access; complex extension widgets stay intact.
            if (element.tagName === 'DIV' && (labels[element.id] || element.matches('.interactable,.fa-solid,.fa-fw')) && !element.querySelector('button,input,select,textarea,a') && !element.getAttribute('role')) {
                element.setAttribute('role', 'button'); element.setAttribute('tabindex', '0');
            }
        }
    };
    const keyboard = event => {
        if (!['Enter',' '].includes(event.key) || event.target.getAttribute('role') !== 'button' || !originals.has(event.target)) return;
        event.preventDefault(); event.target.click();
    };
    composer.addEventListener('keydown', keyboard);
    left.prepend(attachment); composer.append(separator); scan();
    const observer = new document.defaultView.MutationObserver(scan);
    observer.observe(left, {childList:true}); observer.observe(right, {childList:true});
    return () => {
        observer.disconnect(); attachment.remove(); separator.remove(); composer.removeEventListener('keydown', keyboard);
        for (const [element, old] of originals) {
            element.classList.remove('tisya-composer-tool', 'tisya-tool-compact', 'tisya-tool-caption');
            for (const [name, value] of [['data-tisya-tool-label',old.label],['role',old.role],['tabindex',old.tabindex]]) {
                if (value === null) element.removeAttribute(name); else element.setAttribute(name,value);
            }
        }
    };
}
