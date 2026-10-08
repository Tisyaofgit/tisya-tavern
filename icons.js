// Static, local SVGs. Visible controls keep an accessible name and a tooltip.
const shapes = {
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    reroll:'<rect x="4" y="4" width="16" height="16" rx="4"/><g fill="currentColor" stroke="none"><circle cx="8" cy="8" r="1.2"/><circle cx="16" cy="8" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="8" cy="16" r="1.2"/><circle cx="16" cy="16" r="1.2"/></g>',
    continue:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
    more:'<g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></g>',
    previous:'<path d="m6 13 6-6 6 6M6 4h12M12 7v13"/>',
    next:'<path d="m6 11 6 6 6-6M6 20h12M12 4v13"/>',
    book:'<path d="M12 6v14M12 6C8 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-5-1-9 2Z"/>',
};
export function iconMarkup(name) {
    if (!Object.hasOwn(shapes,name)) throw new Error('未知图标');
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${shapes[name]}</svg>`;
}
