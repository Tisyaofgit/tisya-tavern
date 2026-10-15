// Static, local SVGs. Visible controls keep an accessible name and a tooltip.
const shapes = {
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    reroll:'<rect x="4" y="4" width="16" height="16" rx="4"/><g fill="currentColor" stroke="none"><circle cx="8" cy="8" r="1.2"/><circle cx="16" cy="8" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="8" cy="16" r="1.2"/><circle cx="16" cy="16" r="1.2"/></g>',
    continue:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
    more:'<g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></g>',
    previous:'<path d="m6 13 6-6 6 6M6 4h12M12 7v13"/>',
    next:'<path d="m6 11 6 6 6-6M6 20h12M12 4v13"/>',
    bottom:'<path d="m6 5 6 6 6-6m-12 7 6 6 6-6M5 22h14"/>',
    book:'<path d="M12 6v14M12 6C8 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-5-1-9 2Z"/>',
    edit:'<path d="m15 4 5 5M4 20l4-1 12-12a2 2 0 0 0-4-4L4 15l-1 6Z"/>',
    rollback:'<path d="M4 9a8 8 0 1 1 0 6M4 3v6h6M12 7v5l3 2"/>',
    trash:'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
    branch:'<circle cx="6" cy="4" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="6" cy="20" r="2"/><path d="M6 6v12M6 15c0-7 12-2 12-8"/>',
    copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v12h5"/>',
    tools:'<path d="m4 4 6 6m5 5 5 5M4 2 2 4l4 4 2-2ZM21 3a6 6 0 0 1-7 8L5 20a2 2 0 0 1-3-3l9-9a6 6 0 0 1 8-7l-4 4 4 4Z"/>',
    sliders:'<path d="M4 6h5m4 0h7M4 12h10m4 0h2M4 18h2m4 0h10"/><circle cx="11" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
    left:'<path d="m15 5-7 7 7 7"/>',
    right:'<path d="m9 5 7 7-7 7"/>',
};
export function iconMarkup(name) {
    if (!Object.hasOwn(shapes,name)) throw new Error('未知图标');
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${shapes[name]}</svg>`;
}
