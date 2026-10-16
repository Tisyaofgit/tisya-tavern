// Static, local SVGs. Visible controls keep an accessible name and a tooltip.
const shapes = {
    link:'<path d="m10 13 4-4M8 15l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
    refresh:'<path d="M20 10a8 8 0 1 0-2 8M20 3v7h-7"/>',
    user:'<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
    sparkles:'<path d="m12 3 2 6 6 3-6 2-2 7-2-7-7-2 7-3ZM20 2v4m-2-2h4"/>',
    fullscreen:'<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
    settings:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
    search:'<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
    group:'<circle cx="12" cy="7" r="3"/><path d="M6 21v-4a6 6 0 0 1 12 0v4ZM3 20v-4a4 4 0 0 1 2-3M21 20v-4a4 4 0 0 0-2-3M5 4a3 3 0 0 0 0 6M19 4a3 3 0 0 1 0 6"/>',
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
