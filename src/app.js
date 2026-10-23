/* Dispatch Match UI: canvas map, drag and drop, three methods side by side. */
(function () {
  'use strict';
  var C = window.DispatchCore;
  var SIZE = C.SIZE, MAX = 24;
  var PALETTE = ['#0f766e', '#2563eb', '#9333ea', '#c2410c', '#0891b2', '#be185d', '#4d7c0f', '#b45309', '#4f46e5', '#0e7490'];
  var VEH = '#0f766e', REQ = '#e8590c', BAD = '#db2777', INK = '#1c2127';
  var METHODS = [
    { id: 'optimal', name: 'Hungarian (optimal)', fn: C.assignHungarian },
    { id: 'closest', name: 'Closest pair first', fn: C.assignGreedy },
    { id: 'order', name: 'Request order', fn: C.assignSequential }
  ];

  var state = { vehicles: [], requests: [], method: 'optimal', limitOn: false, limit: 40, tool: 'request', ghost: true, labels: true };
  var undoStack = [], seed = 1, hoverPair = null, drag = null, hoverPoint = null, results = {};
  var born = {}; // pair key -> time the line first appeared (for the draw-in animation)

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('map'), ctx = canvas.getContext('2d');

  /* ---------- helpers ---------- */
  function vLabel(i) { var s = ''; i = i + 1; while (i > 0) { var r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }
  function rLabel(j) { return String(j + 1); }
  function fmt(x) { return x.toFixed(1); }
  function clamp(v) { return Math.max(0, Math.min(SIZE, v)); }
  function snapshot() { return JSON.stringify({ v: state.vehicles, r: state.requests }); }
  function commit() { undoStack.push(snapshot()); if (undoStack.length > 60) undoStack.shift(); $('undo').disabled = undoStack.length < 2; }
  function restore(s) { var o = JSON.parse(s); state.vehicles = o.v; state.requests = o.r; }

  function compute() {
    var lim = state.limitOn ? state.limit : null;
    METHODS.forEach(function (m) { results[m.id] = m.fn(state.vehicles, state.requests, lim); });
  }

  /* ---------- drawing ---------- */
  function layoutFor(w) { var pad = Math.max(14, w * 0.045); return { pad: pad, scale: (w - 2 * pad) / SIZE }; }
  function px(L, p) { return { x: L.pad + p.x * L.scale, y: L.pad + p.y * L.scale }; }

  function drawScene(c, w, opts) {
    var mini = !!opts.mini, L = layoutFor(w), res = opts.result, ghost = opts.ghost;
    c.clearRect(0, 0, w, w);
    // grid
    c.lineWidth = 1; c.strokeStyle = mini ? '#efede5' : '#ece9e0';
    var step = mini ? 25 : 10;
    for (var g = 0; g <= SIZE; g += step) {
      var gp = L.pad + g * L.scale;
      c.beginPath(); c.moveTo(gp, L.pad); c.lineTo(gp, w - L.pad); c.moveTo(L.pad, gp); c.lineTo(w - L.pad, gp); c.stroke();
    }
    var V = state.vehicles, R = state.requests, now = performance.now();
    // ghost of the optimal pairing
    if (ghost && !mini) {
      c.save(); c.setLineDash([4, 6]); c.lineWidth = 2; c.strokeStyle = 'rgba(28,33,39,.4)';
      ghost.pairs.forEach(function (p) {
        var a = px(L, V[p[0]]), b = px(L, R[p[1]]);
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      });
      c.restore();
    }
    // limit ring for hovered or dragged vehicle
    if (!mini && state.limitOn) {
      var vi = drag && drag.kind === 'vehicle' ? drag.index : (hoverPoint && hoverPoint.kind === 'vehicle' ? hoverPoint.index : -1);
      if (vi >= 0 && V[vi]) {
        var vp = px(L, V[vi]);
        c.beginPath(); c.arc(vp.x, vp.y, state.limit * L.scale, 0, Math.PI * 2);
        c.fillStyle = 'rgba(15,118,110,.07)'; c.fill();
        c.setLineDash([6, 5]); c.strokeStyle = 'rgba(15,118,110,.6)'; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]);
      }
    }
    // assignment lines
    var animating = false, pills = [];
    res.pairs.forEach(function (p, k) {
      var key = opts.key + ':' + p[0] + '-' + p[1];
      if (!mini && !(key in born)) born[key] = now;
      var t = mini ? 1 : Math.min(1, (now - born[key]) / 320);
      if (t < 1) animating = true;
      t = 1 - Math.pow(1 - t, 3);
      var a = px(L, V[p[0]]), b = px(L, R[p[1]]);
      var hot = hoverPair && hoverPair[0] === p[0] && hoverPair[1] === p[1];
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      c.strokeStyle = PALETTE[p[0] % PALETTE.length]; c.lineWidth = mini ? 2 : (hot ? 5 : 3); c.lineCap = 'round'; c.stroke();
      if (!mini && state.labels && t === 1 && Math.hypot(b.x - a.x, b.y - a.y) > 78) pills.push(function () {
        var txt = fmt(res.distances[k]), spot = null, ts = [0.5, 0.42, 0.58, 0.34, 0.66];
        var all = V.map(function (q) { return px(L, q); }).concat(R.map(function (q) { return px(L, q); }));
        for (var q = 0; q < ts.length && !spot; q++) {
          var cx = a.x + (b.x - a.x) * ts[q], cy = a.y + (b.y - a.y) * ts[q];
          if (all.every(function (o) { return Math.hypot(o.x - cx, o.y - cy) > rad + 22; })) spot = { x: cx, y: cy };
        }
        if (!spot) return;
        var mx = spot.x, my = spot.y;
        c.font = '600 11.5px system-ui,sans-serif'; var tw = c.measureText(txt).width + 10;
        c.fillStyle = 'rgba(255,255,255,.92)'; roundRect(c, mx - tw / 2, my - 9, tw, 18, 9); c.fill();
        c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, mx, my + .5);
      });
    });
    // hovered pair that is not assigned: faint line
    if (!mini && hoverPair && !res.pairs.some(function (p) { return p[0] === hoverPair[0] && p[1] === hoverPair[1]; }) && V[hoverPair[0]] && R[hoverPair[1]]) {
      var ha = px(L, V[hoverPair[0]]), hb = px(L, R[hoverPair[1]]);
      c.save(); c.setLineDash([3, 5]); c.strokeStyle = 'rgba(28,33,39,.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(ha.x, ha.y); c.lineTo(hb.x, hb.y); c.stroke(); c.restore();
    }
    var rad = mini ? 4.5 : Math.max(11, w * 0.024);
    var unservedR = new Set(res.unmatchedRequests), idleV = new Set(res.unmatchedVehicles);
    // requests
    R.forEach(function (r, j) {
      var p = px(L, r);
      if (unservedR.has(j)) {
        c.beginPath(); c.arc(p.x, p.y, rad + (mini ? 2 : 5), 0, Math.PI * 2);
        c.setLineDash([4, 3]); c.strokeStyle = BAD; c.lineWidth = mini ? 1.5 : 2.2; c.stroke(); c.setLineDash([]);
      }
      c.beginPath(); c.arc(p.x, p.y, rad, 0, Math.PI * 2); c.fillStyle = REQ; c.fill();
      if (!mini) { c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke(); label(c, rLabel(j), p, rad, '#fff'); }
    });
    // vehicles (rounded squares)
    V.forEach(function (v, i) {
      var p = px(L, v), s = rad * 1.75, idle = idleV.has(i);
      roundRect(c, p.x - s / 2, p.y - s / 2, s, s, mini ? 2 : 6);
      if (idle) { c.fillStyle = '#fff'; c.fill(); c.lineWidth = mini ? 1.5 : 2.5; c.strokeStyle = VEH; c.stroke(); }
      else { c.fillStyle = VEH; c.fill(); if (!mini) { c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke(); } }
      if (!mini) label(c, vLabel(i), p, rad, idle ? VEH : '#fff');
    });
    pills.forEach(function (f) { f(); });
    return animating;
  }
  function label(c, t, p, rad, color) {
    c.fillStyle = color; c.font = '700 ' + Math.round(rad * 0.95) + 'px system-ui,sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, p.x, p.y + 0.5);
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  var cssW = 0, raf = 0;
  function fit() {
    var w = Math.round(canvas.getBoundingClientRect().width), d = window.devicePixelRatio || 1;
    if (!w) return;
    cssW = w; canvas.width = Math.round(w * d); canvas.height = Math.round(w * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  function render() {
    if (!cssW) fit();
    var res = results[state.method], opt = results.optimal;
    var anim = drawScene(ctx, cssW, { result: res, key: state.method, ghost: state.ghost && state.method !== 'optimal' ? opt : null });
    if (anim && !raf) raf = requestAnimationFrame(function () { raf = 0; render(); });
  }

  /* ---------- side panel ---------- */
  var methodEls = {};
  function buildMethods() {
    var box = $('methods');
    METHODS.forEach(function (m) {
      var b = document.createElement('button');
      b.className = 'method'; b.setAttribute('role', 'radio'); b.dataset.id = m.id;
      b.innerHTML = '<canvas width="152" height="152"></canvas><div><div class="m-name"><span></span><span class="badge"></span></div><div class="m-total"></div><div class="m-meta"></div></div>';
      b.addEventListener('click', function () { state.method = m.id; updatePanel(); render(); writeHash(); });
      box.appendChild(b); methodEls[m.id] = b;
    });
  }
  function updatePanel() {
    var opt = results.optimal, nV = state.vehicles.length, nR = state.requests.length;
    METHODS.forEach(function (m) {
      var r = results[m.id], el = methodEls[m.id];
      el.classList.toggle('is-on', m.id === state.method); el.setAttribute('aria-checked', m.id === state.method);
      el.querySelector('.m-name span').textContent = m.name;
      var badge = el.querySelector('.badge');
      var comparable = r.pairs.length === opt.pairs.length;
      if (!nV || !nR) { badge.style.display = 'none'; }
      else {
        badge.style.display = '';
        if (r.pairs.length < opt.pairs.length) { badge.className = 'badge worse'; badge.textContent = (opt.pairs.length - r.pairs.length) + ' fewer served'; }
        else if (m.id === 'optimal') { badge.className = 'badge best'; badge.textContent = 'Best possible'; }
        else if (comparable && r.total - opt.total < 0.05) { badge.className = 'badge tie'; badge.textContent = 'Ties optimal'; }
        else { badge.className = 'badge worse'; badge.textContent = '+' + ((r.total / opt.total - 1) * 100).toFixed(1) + '% longer'; }
      }
      el.querySelector('.m-total').textContent = fmt(r.total);
      el.querySelector('.m-meta').textContent = r.pairs.length + ' of ' + nR + ' requests served, longest ' + fmt(r.longest);
      var mc = el.querySelector('canvas'), mx = mc.getContext('2d');
      mx.setTransform(2, 0, 0, 2, 0, 0);
      drawScene(mx, 76, { result: r, key: 'mini', mini: true });
    });
    var res = results[state.method], diff = 0;
    if (state.method !== 'optimal') {
      var set = new Set(opt.pairs.map(function (p) { return p.join('-'); }));
      diff = res.pairs.filter(function (p) { return !set.has(p.join('-')); }).length;
    }
    var msg;
    if (!nV && !nR) msg = 'Add vehicles and requests to start.';
    else if (!nV || !nR) msg = 'You need at least one vehicle and one request.';
    else {
      msg = METHODS.filter(function (m) { return m.id === state.method; })[0].name + ': ' + res.pairs.length + ' pairs, total distance ' + fmt(res.total) + '.';
      if (res.unmatchedRequests.length) msg += ' ' + res.unmatchedRequests.length + ' request' + (res.unmatchedRequests.length > 1 ? 's' : '') + ' unserved.';
      if (diff) msg += ' ' + diff + ' pair' + (diff > 1 ? 's differ' : ' differs') + ' from the optimal pairing.';
    }
    $('status').textContent = msg;
    $('empty').hidden = !!(nV || nR);
    canvas.setAttribute('aria-label', 'Map with ' + nV + ' vehicles and ' + nR + ' requests. ' + msg);
    buildTable();
  }

  function buildTable() {
    var V = state.vehicles, R = state.requests, box = $('table');
    if (!V.length || !R.length) { box.innerHTML = '<p class="muted small">Add at least one vehicle and one request.</p>'; return; }
    var cost = C.distanceMatrix(V, R), res = results[state.method], pick = new Set(res.pairs.map(function (p) { return p.join('-'); }));
    var max = 0; cost.forEach(function (r) { r.forEach(function (d) { if (d > max) max = d; }); });
    var cap = 14, nv = Math.min(V.length, cap), nr = Math.min(R.length, cap);
    var h = '<table><thead><tr><th></th>';
    for (var j = 0; j < nr; j++) h += '<th>' + rLabel(j) + '</th>';
    h += '</tr></thead><tbody>';
    for (var i = 0; i < nv; i++) {
      h += '<tr><th>' + vLabel(i) + '</th>';
      for (var k = 0; k < nr; k++) {
        var d = cost[i][k], t = d / max, bg = 'rgba(15,118,110,' + (0.04 + 0.22 * (1 - t)).toFixed(2) + ')';
        var cls = (pick.has(i + '-' + k) ? 'pick ' : '') + (state.limitOn && d > state.limit ? 'forbid' : '');
        h += '<td class="' + cls + '" data-i="' + i + '" data-j="' + k + '" style="background:' + bg + '">' + fmt(d) + '</td>';
      }
      h += '</tr>';
    }
    h += '</tbody></table>';
    if (V.length > cap || R.length > cap) h += '<p class="muted small">Showing the first ' + cap + ' rows and columns.</p>';
    box.innerHTML = h;
  }
  $('table').addEventListener('mouseover', function (e) {
    var td = e.target.closest('td'); if (!td) return;
    hoverPair = [+td.dataset.i, +td.dataset.j]; td.classList.add('hover'); render();
  });
  $('table').addEventListener('mouseout', function (e) {
    var td = e.target.closest('td'); if (td) td.classList.remove('hover'); hoverPair = null; render();
  });

  function refresh() { compute(); updatePanel(); render(); writeHash(); }

  /* ---------- pointer interaction ---------- */
  function toPlane(e) {
    var r = canvas.getBoundingClientRect(), L = layoutFor(r.width);
    return { x: clamp((e.clientX - r.left - L.pad) / L.scale), y: clamp((e.clientY - r.top - L.pad) / L.scale) };
  }
  function hit(pt) {
    var L = layoutFor(cssW), reach = Math.max(14, cssW * 0.03) / L.scale, best = null, bd = reach;
    state.vehicles.forEach(function (v, i) { var d = C.dist(v, pt); if (d <= bd) { bd = d; best = { kind: 'vehicle', index: i }; } });
    state.requests.forEach(function (r, j) { var d = C.dist(r, pt); if (d < bd) { bd = d; best = { kind: 'request', index: j }; } });
    return best;
  }
  function list(kind) { return kind === 'vehicle' ? state.vehicles : state.requests; }

  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    var pt = toPlane(e), h = hit(pt);
    drag = { start: pt, hit: h, kind: h && h.kind, index: h && h.index, moved: false, id: e.pointerId };
    if (h && state.tool !== 'remove') { canvas.classList.add('dragging'); }
  });
  canvas.addEventListener('pointermove', function (e) {
    var pt = toPlane(e);
    if (drag && drag.hit && state.tool !== 'remove') {
      if (!drag.moved && C.dist(pt, drag.start) < 1.2) return;
      drag.moved = true; list(drag.kind)[drag.index].x = Math.round(pt.x * 10) / 10; list(drag.kind)[drag.index].y = Math.round(pt.y * 10) / 10;
      born = {}; compute(); updatePanelLight(); render(); return;
    }
    var h = hit(pt), changed = JSON.stringify(h) !== JSON.stringify(hoverPoint);
    hoverPoint = h; canvas.classList.toggle('over-point', !!h && state.tool !== 'remove');
    if (changed && state.limitOn) render();
  });
  function updatePanelLight() { updatePanel(); }
  canvas.addEventListener('pointerup', function (e) {
    if (!drag) return;
    var pt = toPlane(e), d = drag; drag = null; canvas.classList.remove('dragging');
    if (d.moved) { commit(); writeHash(); render(); return; }
    if (state.tool === 'remove') {
      if (d.hit) { list(d.kind).splice(d.index, 1); born = {}; hoverPoint = null; commit(); refresh(); }
      return;
    }
    if (d.hit) return; // plain click on a point: nothing
    var arr = state.tool === 'vehicle' ? state.vehicles : state.requests;
    if (arr.length >= MAX) { $('status').textContent = 'Up to ' + MAX + ' of each is enough for this demo. Remove one first.'; return; }
    arr.push({ x: Math.round(pt.x * 10) / 10, y: Math.round(pt.y * 10) / 10 });
    commit(); refresh();
  });
  canvas.addEventListener('pointercancel', function () { drag = null; canvas.classList.remove('dragging'); });
  canvas.addEventListener('pointerleave', function () { hoverPoint = null; if (state.limitOn) render(); });
  canvas.addEventListener('dblclick', function (e) { e.preventDefault(); });

  /* ---------- controls ---------- */
  document.querySelectorAll('.tool').forEach(function (b) {
    b.addEventListener('click', function () {
      state.tool = b.dataset.tool;
      document.querySelectorAll('.tool').forEach(function (o) { o.classList.toggle('is-on', o === b); o.setAttribute('aria-checked', o === b); });
      canvas.classList.toggle('remove', state.tool === 'remove');
    });
  });
  $('ghost').addEventListener('change', function (e) { state.ghost = e.target.checked; render(); });
  $('labels').addEventListener('change', function (e) { state.labels = e.target.checked; render(); });
  $('limit').addEventListener('input', function (e) {
    state.limit = +e.target.value; $('limitOut').textContent = state.limit;
    if (!state.limitOn) { state.limitOn = true; $('limitOn').checked = true; }
    born = {}; refresh();
  });
  $('limitOn').addEventListener('change', function (e) { state.limitOn = e.target.checked; born = {}; refresh(); });
  $('undo').addEventListener('click', undo);
  function undo() { if (undoStack.length < 2) return; undoStack.pop(); restore(undoStack[undoStack.length - 1]); $('undo').disabled = undoStack.length < 2; born = {}; refresh(); }
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  });
  $('share').addEventListener('click', function () {
    writeHash();
    var done = function () { var b = $('share'); b.textContent = 'Link copied'; b.classList.add('ok'); setTimeout(function () { b.textContent = 'Copy link'; b.classList.remove('ok'); }, 1600); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(location.href).then(done, function () { prompt('Copy this link', location.href); });
    else prompt('Copy this link', location.href);
  });

  /* ---------- scenes ---------- */
  function pts(a) { return a.map(function (p) { return { x: p[0], y: p[1] }; }); }
  var SCENES = {
    random: function () { seed++; var s = C.makeScenario(6, 6, seed); return { v: s.vehicles, r: s.requests }; },
    trap: function () {
      return { v: pts([[36, 56], [60, 46], [82, 22], [20, 20]]), r: pts([[47, 50], [8, 60], [87, 29], [13, 13]]), method: 'closest' };
    },
    rush: function () {
      var rnd = C.rng(46), r = [], i;
      for (i = 0; i < 8; i++) r.push({ x: Math.round((62 + rnd() * 26) * 10) / 10, y: Math.round((14 + rnd() * 28) * 10) / 10 });
      var v = pts([[12, 18], [20, 80], [45, 55], [78, 82], [90, 62], [40, 12], [55, 35], [10, 50]]);
      return { v: v, r: r };
    },
    short: function () { var s = C.makeScenario(4, 9, 21); return { v: s.vehicles, r: s.requests }; },
    limit: function () { var s = C.makeScenario(6, 6, 5); return { v: s.vehicles, r: s.requests, limit: 42 }; },
    clear: function () { return { v: [], r: [] }; }
  };
  $('scenes').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    var s = SCENES[b.dataset.scene](); load(s);
  });
  function load(s) {
    state.vehicles = s.v; state.requests = s.r; state.method = s.method || 'optimal';
    state.limitOn = s.limit != null; if (s.limit != null) { state.limit = s.limit; $('limit').value = s.limit; $('limitOut').textContent = s.limit; }
    $('limitOn').checked = state.limitOn; born = {}; hoverPoint = null; commit(); refresh();
  }

  /* ---------- share link (state in the URL hash) ---------- */
  function enc(a) { return a.map(function (p) { return +p.x.toFixed(1) + ',' + +p.y.toFixed(1); }).join(';'); }
  function dec(s) { return s ? s.split(';').map(function (t) { var q = t.split(','); return { x: clamp(+q[0] || 0), y: clamp(+q[1] || 0) }; }).slice(0, MAX) : []; }
  function writeHash() {
    var h = 'v=' + enc(state.vehicles) + '&r=' + enc(state.requests) + '&m=' + state.method + (state.limitOn ? '&l=' + state.limit : '');
    try { window.history.replaceState(null, '', '#' + h); } catch (e) { /* file:// in some browsers */ }
  }
  function readHash() {
    var h = location.hash.slice(1); if (!h) return false;
    var o = {}; h.split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i)] = kv.slice(i + 1); });
    if (!('v' in o) && !('r' in o)) return false;
    state.vehicles = dec(o.v); state.requests = dec(o.r);
    if (METHODS.some(function (m) { return m.id === o.m; })) state.method = o.m;
    if (o.l && +o.l > 0) { state.limitOn = true; state.limit = Math.min(120, Math.max(8, +o.l)); $('limit').value = state.limit; $('limitOut').textContent = state.limit; $('limitOn').checked = true; }
    return true;
  }

  /* ---------- start ---------- */
  buildMethods();
  if (!readHash()) { var s0 = SCENES.trap(); state.vehicles = s0.v; state.requests = s0.r; state.method = 'optimal'; }
  commit(); compute(); updatePanel();
  window.addEventListener('resize', function () { fit(); render(); });
  if (window.ResizeObserver) new ResizeObserver(function () { fit(); render(); }).observe(canvas);
  fit(); render(); writeHash();
  window.__dispatch = { state: state, results: results };
})();
