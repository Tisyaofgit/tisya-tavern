/* Pure geometry for the approved Tisha shell. No DOM, host calls or state writes.
 * Local 0.1.1 layout correction: left-shifted pose and fixed application chrome.
 */
const TishaCore = (() => {
  'use strict';
  const MARGIN = 8;
  const ALPHA = Object.freeze({
    standing: [16, 8, 1013, 1417],
    head: [27, 5, 918, 1095],
    front: [92, 5, 821, 793],
    tailFolded: [393, 975, 969, 1507]
  });

  function fail(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    throw error;
  }
  function number(value, name, code, minimum = -Infinity) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
      fail(code, `${name} must be finite${minimum === 0 ? ' and nonnegative' : ''}`);
    }
    return value;
  }
  function positive(value, name, code) {
    number(value, name, code, 0);
    if (value === 0) fail(code, `${name} must be positive`);
    return value;
  }
  function object(value, name, code) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${name} must be an object`);
    return value;
  }
  function rect(value, name) {
    object(value, name, 'E_GEOMETRY_INVALID');
    number(value.x, `${name}.x`, 'E_GEOMETRY_INVALID');
    number(value.y, `${name}.y`, 'E_GEOMETRY_INVALID');
    positive(value.width, `${name}.width`, 'E_GEOMETRY_INVALID');
    positive(value.height, `${name}.height`, 'E_GEOMETRY_INVALID');
    if (!Number.isFinite(value.x + value.width) || !Number.isFinite(value.y + value.height)) {
      fail('E_GEOMETRY_INVALID', `${name} overflows`);
    }
  }

  /** Intersect host layout bounds and the visible viewport, then inset once. */
  function visibleRect(viewport, insets) {
    object(viewport, 'viewport', 'E_VIEWPORT_INVALID');
    const width = positive(viewport.innerWidth, 'innerWidth', 'E_VIEWPORT_INVALID');
    const height = positive(viewport.innerHeight, 'innerHeight', 'E_VIEWPORT_INVALID');
    const visual = object(viewport.visualViewport, 'visualViewport', 'E_VIEWPORT_UNAVAILABLE');
    positive(visual.width, 'visualViewport.width', 'E_VIEWPORT_INVALID');
    positive(visual.height, 'visualViewport.height', 'E_VIEWPORT_INVALID');
    number(visual.offsetLeft, 'visualViewport.offsetLeft', 'E_VIEWPORT_INVALID');
    number(visual.offsetTop, 'visualViewport.offsetTop', 'E_VIEWPORT_INVALID');
    positive(visual.scale, 'visualViewport.scale', 'E_VIEWPORT_INVALID');
    if (visual.scale !== 1) fail('E_VIEWPORT_SCALE', 'only scale 1 is supported');
    if (!Number.isFinite(visual.offsetLeft + visual.width) || !Number.isFinite(visual.offsetTop + visual.height)) {
      fail('E_VIEWPORT_INVALID', 'visualViewport overflows');
    }
    object(insets, 'insets', 'E_INSETS_INVALID');
    for (const key of ['topSafe', 'topBar', 'bottomInput', 'bottomSafe']) number(insets[key], key, 'E_INSETS_INVALID', 0);
    if (Object.values({topSafe: insets.topSafe, topBar: insets.topBar, bottomInput: insets.bottomInput, bottomSafe: insets.bottomSafe}).every(value => value === 0)) {
      fail('E_INSETS_UNREADY', 'host insets are all zero');
    }
    if (insets.topBar < insets.topSafe || insets.bottomInput < insets.bottomSafe) {
      fail('E_INSETS_ORDER', 'same-side aggregate insets must include safe insets');
    }
    const left = Math.max(0, visual.offsetLeft) + MARGIN;
    const top = Math.max(insets.topBar, visual.offsetTop) + MARGIN;
    const right = Math.min(width, visual.offsetLeft + visual.width) - MARGIN;
    const bottom = Math.min(height - insets.bottomInput, visual.offsetTop + visual.height) - MARGIN;
    if (right <= left || bottom <= top) fail('E_LAYOUT_TOO_SMALL', 'no positive visible rectangle remains');
    return {x: left, y: top, width: right - left, height: bottom - top};
  }

  /** Move an unchanged-size composition into bounds; never rescale or switch mode. */
  function clampPosition(bounds, size, point) {
    rect(bounds, 'bounds');
    object(size, 'size', 'E_GEOMETRY_INVALID');
    positive(size.width, 'size.width', 'E_GEOMETRY_INVALID');
    positive(size.height, 'size.height', 'E_GEOMETRY_INVALID');
    object(point, 'point', 'E_GEOMETRY_INVALID');
    number(point.x, 'point.x', 'E_GEOMETRY_INVALID');
    number(point.y, 'point.y', 'E_GEOMETRY_INVALID');
    if (size.width > bounds.width || size.height > bounds.height) {
      fail('E_LAYOUT_TOO_SMALL', `composition ${size.width}x${size.height} exceeds ${bounds.width}x${bounds.height}`);
    }
    return {
      x: Math.min(Math.max(point.x, bounds.x), bounds.x + bounds.width - size.width),
      y: Math.min(Math.max(point.y, bounds.y), bounds.y + bounds.height - size.height)
    };
  }

  function composition(mode, width) {
    if (!['standing', 'folded', 'expanded'].includes(mode)) fail('E_MODE_INVALID', 'unknown composition mode');
    positive(width, 'width', 'E_VIEWPORT_INVALID');
    if (mode !== 'standing' && width < 360) fail('E_UNSUPPORTED_WIDTH', 'phone layout requires a viewport at least 360 CSS px wide');
    const layers = [], controls = [], visible = [];
    let content = null;
    function layer(asset, x, y, w, h, bbox) {
      layers.push({asset, x, y, width: w, height: h});
      visible.push(bbox ? {x: x + bbox[0] * w / 1024, y: y + bbox[1] * h / 1536,
        width: (bbox[2] - bbox[0]) * w / 1024, height: (bbox[3] - bbox[1]) * h / 1536} : {x, y, width: w, height: h});
    }
    function control(action, cx, cy) {
      const w=['poke','open'].includes(action)?80:action==='drag-face'?108:44;
      const h=action==='poke'?60:action==='open'?64:action==='drag-face'?70:44;
      const item = {action, x: cx - w/2, y: cy - h/2, width: w, height: h};
      controls.push(item); visible.push({...item});
    }
    if (mode === 'standing') {
      layer('standing', 0, 0, 100, 150, ALPHA.standing);
      control('open', 50, 102);
      control('poke', 50, 36);
    } else {
      // 360 and 412 are approved layouts. Larger screens use the approved 412 cap.
      const fraction = Math.min((width - 360) / 52, 1);
      const expanded = mode === 'expanded';
      const fw = expanded ? 236 + 24 * fraction : 224;
      const cs = expanded ? .16 + .03 * fraction : .18;
      const hx = expanded ? 118 + 20 * fraction : 96;
      const fh = expanded ? fw * 1382 / 763 : fw * 969 / 1038;
      const fs = expanded ? fw / 763 : fw / 1038;
      const hy = (expanded ? 37 * fs : 8) - 599 * cs;
      if (expanded) {
        // tailExpanded is an alpha-cropped, pre-reflected 576x532 asset.
        layer('tailExpanded', -280 * cs, fh * .4 - 532 * cs / 2, 576 * cs, 532 * cs);
      } else {
        // Keep the original unreflected full canvas for the folded tail.
        layer('tailFolded', fw * .55 - 470 * cs, fh - 980 * cs - 10, 1024 * cs, 1536 * cs, ALPHA.tailFolded);
      }
      layer('head', hx, hy, 1024 * cs, 1536 * cs, ALPHA.head);
      layer(expanded ? 'bgExpanded' : 'bgFolded', 0, 0, fw, fh);
      layer(expanded ? 'frameExpanded' : 'frameFolded', 0, 0, fw, fh);
      const left = expanded ? 95 * fs : 0;
      const right = expanded ? 689 * fs : fw;
      content = {
        frame: {x: 0, y: 0, width: fw, height: fh},
        inner: {left, right},
        character: {x: hx, y: hy, scale: cs},
        title: {x: expanded ? left + 23 : 59, y: expanded ? 61 : 48, size: 14},
        apps: [], shortcuts: [], pagination: [], navigation: []
      };
      if (expanded) {
        control('collapse', right - 67, 55);
        control('close', right - 22, 55);
        content.card = {x: left, y: 83, width: right - left, height: 82};
        const centers = Array.from({length: 4}, (_, index) => left + (right - left) * (index + .5) / 4);
        [['图鉴', '记忆', '手记', '通信'], ['生图', '语音', '主题', '协议']].forEach((names, row) => {
          names.forEach((name, column) => content.apps.push({name, x: centers[column], y: 201 + row * 64, size: 34, label: true, labelOffset: 24, touchOffset: 6}));
        });
        ['图鉴', '记忆', '应用', '设置'].forEach((name, index) => content.shortcuts.push({name, x: centers[index], y: 342, size: 32, label: false}));
        content.pagination = [{x: fw / 2 - 8, y: 305, active: true}, {x: fw / 2 + 8, y: 305, active: false}];
        ['back', 'home', 'more'].forEach((action, index) => {
          const x = [left + 28, fw / 2, right - 28][index];
          control(action, x, 392);
          content.navigation.push({action, x, y: 392});
        });
      } else {
        control('expand', fw - 85, 44);
        control('close', fw - 40, 44);
        [['图鉴', .32, 92], ['记忆', .68, 92], ['手记', .32, 152], ['应用', .68, 152]].forEach(([name, fractionX, y]) => {
          content.apps.push({name, x: fw * fractionX, y, size: 34, label: true, labelOffset: 24, touchOffset: 7});
        });
      }
      control('drag-face', hx + 490 * cs, hy + 275 * cs);
      // Foreground stays after frame/content in renderer order. It is noninteractive.
      layer('front', hx, hy, 1024 * cs, 1536 * cs, ALPHA.front);
    }
    const x0 = Math.min(...visible.map(item => item.x));
    const y0 = Math.min(...visible.map(item => item.y));
    const x1 = Math.max(...visible.map(item => item.x + item.width));
    const y1 = Math.max(...visible.map(item => item.y + item.height));
    for (const item of [...layers, ...controls]) { item.x -= x0; item.y -= y0; }
    if (content) {
      for (const item of [content.frame, content.character, content.title, ...content.apps, ...content.shortcuts, ...content.pagination, ...content.navigation]) {
        item.x -= x0; item.y -= y0;
      }
      if (content.card) { content.card.x -= x0; content.card.y -= y0; }
      content.inner.left -= x0; content.inner.right -= x0;
    }
    if (mode === 'expanded') {
      // Move both artwork planes and their drag target as one pose. Keep the
      // approved layout envelope so centering cannot move the phone or tail.
      const shift = 120 * content.character.scale;
      for (const item of layers) if (item.asset === 'head' || item.asset === 'front') item.x -= shift;
      content.character.x -= shift;
      controls.find(item => item.action === 'drag-face').x -= shift;
      // Page-independent chrome stays anchored to the phone frame, not page height.
      const barX = content.inner.left + 7;
      const barWidth = content.inner.right - content.inner.left - 14;
      const navY = content.frame.y + Math.max(392, content.frame.height - 38);
      content.navigationBar = {x: barX, y: navY - 12, width: barWidth, height: 24};
      content.navigation.forEach((item, index) => {
        item.x = barX + barWidth * (index + .5) / 3;
        item.y = navY;
        const target = controls.find(control => control.action === item.action);
        target.x = item.x - target.width / 2;
        target.y = item.y - target.height / 2;
      });
      content.title.y = content.frame.y + 43;
      content.title.x = content.inner.left + 38;
      content.title.bounds = {x: content.title.x - 26, y: content.title.y - 12, width: 52, height: 24};
    }
    return {width: x1 - x0, height: y1 - y0, layers, controls, content};
  }

  return Object.freeze({visibleRect, clampPosition, composition});
})();
if (typeof module !== 'undefined' && module.exports) module.exports = TishaCore;

