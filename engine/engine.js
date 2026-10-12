/* Unflat engine: an assembly spec rendered as a phone-first, step-by-step 3D manual.
   Derived from the 3d-assembly-manual starter (MIT, Skylar Kitchen): same look, landings,
   ghosts, callout, detail bubble and plan inset, driven by data instead of hand-written scenes.
   Units: the spec is in cm; the scene is normalised so the product's largest side is 4 units. */
(function(){
'use strict';
var DATA = window.UNFLAT || {};
var SPEC = DATA.spec, OPTS = DATA.opts || {};
if (!SPEC || !window.THREE) { document.body.textContent = 'This manual could not be loaded.'; return; }
var T = THREE;
var $ = function(s){ return document.querySelector(s); };
var canvas = $('#c'), stage = $('.stage');
var hm = /^#step(\d+)(&still)?$/.exec(location.hash || '');
var STILL = !!(hm && hm[2]);
var reduce = STILL || matchMedia('(prefers-reduced-motion: reduce)').matches;
var INK = 0x141414, ACCENT = OPTS.accent || 0x1f4fd8, FILL = OPTS.fill || 0xa6c0f6, GREY = 0xececec, WHITE = 0xffffff;
var REST = {white: 0xececec, wood: 0xeae3d6, dark: 0xb9b9b9, metal: 0xd9dcdf, plastic: 0xe6e6e6, glass: 0xe3edf1};
var DEG = Math.PI / 180;
var HW = {dowel:1, screw:1, bolt:1, cam_lock:1, cam_bolt:1, nail:1, shelf_pin:1, plug:1, washer:1, nut:1, hinge:1, knob:1, handle:1, foot:1, bracket:1};
function isHW(k){ return !!HW[k]; }

/* ---------- data ---------- */
var P_ = SPEC.product, PS = P_.size;
var PARTS = {}; SPEC.parts.forEach(function(p){ PARTS[p.key] = p; });
var ASMS = {}; (SPEC.assemblies || []).forEach(function(a){ ASMS[a.key] = a; });
var N = SPEC.steps.length, LAST = N + 1;
var S_CM = Math.max(PS[0] || 0, PS[1] || 0, PS[2] || 0) || 100;
var U = 4 / S_CM, S = 4;
function u(cm){ return cm * U; }
var title = (P_.name || 'Manual');
var fmt = function(n){ return (Math.round(n * 10) / 10).toString(); };
document.title = title + (P_.type ? ' · ' + P_.type : '') + ' · Unflat';
$('#h1').textContent = title + (P_.type && P_.type.toLowerCase() !== title.toLowerCase() ? ' ' + P_.type.toLowerCase() : '');
$('#sub').textContent = (PS[0] ? fmt(PS[0]) + ' × ' + fmt(PS[1]) + ' × ' + fmt(PS[2]) + ' cm' : '') + (P_.ref ? ' · ' + P_.ref : '');
document.documentElement.style.setProperty('--accent', '#' + ('00000' + ACCENT.toString(16)).slice(-6));

/* the pages: 0 = parts, 1..N = the manual's steps, LAST = done */
var STEPS = [{title: 'What this builds', overview: true, pose: 'upright', view: 'auto', acts: [], tools: [], pages: []}]
  .concat(SPEC.steps.map(function(s){ return s; }))
  .concat([{title: 'Done', done: true, pose: 'upright', view: 'auto', acts: [], tools: [], pages: []}]);

/* ---------- renderer, lights, cel shading ---------- */
var renderer = new T.WebGLRenderer({canvas: canvas, antialias: true, alpha: false, preserveDrawingBuffer: true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0xffffff, 1);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
var scene = new T.Scene();
var world = new T.Group(); scene.add(world);
scene.add(new T.HemisphereLight(0xffffff, 0xffffff, 0.9));
var sun = new T.DirectionalLight(0xffffff, 0.16); sun.castShadow = true;
sun.shadow.mapSize.set(STILL ? 1024 : 2048, STILL ? 1024 : 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun); scene.add(sun.target);
var camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
var planCam = new T.OrthographicCamera(-1, 1, 1, -1, 1, 400); planCam.up.set(0, 0, -1); planCam.layers.enable(1);
var detailCam = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
var gm = new T.DataTexture(new Uint8Array([226, 226, 226, 241, 241, 241, 255, 255, 255]), 3, 1, T.RGBFormat); gm.minFilter = T.NearestFilter; gm.magFilter = T.NearestFilter; gm.needsUpdate = true;

/* ---------- helpers ---------- */
function v(a){ return new T.Vector3(a[0], a[1], a[2]); }
function mat(color, opacity){ var o = opacity == null ? 1 : opacity; return new T.MeshToonMaterial({color: color, gradientMap: gm, transparent: o < 1, opacity: o}); }
function edgesOf(geo, opacity, thresh){ return new T.LineSegments(new T.EdgesGeometry(geo, thresh || 24), new T.LineBasicMaterial({color: INK, transparent: true, opacity: opacity == null ? 0.72 : opacity})); }
function mesh(geo, color, o){ o = o || {}; var m = new T.Mesh(geo, mat(color, o.opacity)); m.castShadow = !o.noShadow; m.receiveShadow = true; if (o.edge !== false) m.add(edgesOf(geo, o.edge, o.thresh)); return m; }
function box(w, h, d, color, o){ return mesh(new T.BoxGeometry(Math.max(w, 1e-4), Math.max(h, 1e-4), Math.max(d, 1e-4)), color, o); }
function cylY(r, y0, y1, color, seg, o){ var h = Math.max(1e-4, y1 - y0); var m = mesh(new T.CylinderGeometry(r, r, h, seg || 14), color, extend({thresh: 40, edge: 0.6}, o)); m.position.y = (y0 + y1) / 2; return m; }
function coneY(r, y0, y1, color){ var m = mesh(new T.ConeGeometry(r, Math.max(1e-4, y1 - y0), 12), color, {edge: false}); m.position.y = (y0 + y1) / 2; m.rotation.x = Math.PI; return m; }
function sphere(r, color, o){ return mesh(new T.SphereGeometry(r, 14, 10), color, extend({edge: false}, o)); }
function inkBox(w, h, d){ var m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshBasicMaterial({color: 0x3a3a3a})); m.userData.keepColor = true; return m; }
function lines(pts, color, opacity){ return new T.LineSegments(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({color: color == null ? INK : color, transparent: true, opacity: opacity == null ? 0.5 : opacity})); }
function at(obj, x, y, z){ obj.position.set(x, y, z); return obj; }
function group(){ var g = new T.Group(); for (var i = 0; i < arguments.length; i++) g.add(arguments[i]); return g; }
function extend(a, b){ var o = {}; var k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
function centre(g){ /* bbox centre into g.position, children shifted back: arrows and ghosts land where the part really is */
  g.updateMatrixWorld(true); var bb = new T.Box3().setFromObject(g); if (bb.isEmpty()) return g; var c = bb.getCenter(new T.Vector3());
  var local = g.parent ? g.parent.worldToLocal(c.clone()) : c.clone(); var d = local.clone().sub(g.position);
  g.children.forEach(function(ch){ ch.position.sub(d); if (ch.userData.dest) ch.userData.dest.sub(d); }); g.position.add(d); return g; }
function arrow(from, to){
  var dir = new T.Vector3().subVectors(to, from); var len = dir.length(); if (len < 0.01) return new T.Group();
  var sc = Math.min(1, len / 2.2); var g = new T.Group(); var hl = 0.42 * sc, sl = Math.max(0.05, len - hl);
  var shaft = new T.Mesh(new T.CylinderGeometry(0.055 * sc, 0.055 * sc, sl, 10), mat(ACCENT)); shaft.position.y = sl / 2;
  var head = new T.Mesh(new T.ConeGeometry(0.2 * sc, hl, 14), mat(ACCENT)); head.position.y = len - hl / 2;
  g.add(shaft); g.add(head); g.position.copy(from); g.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.clone().normalize());
  g.userData.keepColor = true; return g;
}
function setOpacity(obj, o){ obj.traverse(function(n){ if (n.material){ if (n.material.userData.base == null) n.material.userData.base = n.material.opacity; var val = n.material.userData.base * o; n.material.opacity = val; n.material.transparent = val < 0.999 || n.material.userData.base < 1; } }); }
function paint(obj, hex){ obj.traverse(function(n){ if (n.isMesh && n.material.color && !n.material.map && !n.userData.keepColor && !(n.parent && n.parent.userData.keepColor && n.parent !== obj)) n.material.color.setHex(hex); }); }
function ghostOf(o){ /* a faint outline of the part where it will land */
  var g = o.clone(true); g.traverse(function(n){ if (n.isMesh){ n.material = new T.MeshBasicMaterial({color: INK, transparent: true, opacity: n.userData.decal ? 0 : 0.16, depthWrite: false}); n.castShadow = false; n.receiveShadow = false; } else if (n.isLineSegments){ n.material = n.material.clone(); n.material.transparent = true; n.material.opacity = 0.6; } });
  g.position.copy(o.userData.dest); g.quaternion.copy(o.userData.q0 || o.quaternion); g.visible = true; return g; }

/* ---------- part models (units) ---------- */
/* Hardware: local +y points INTO the material, the origin is the hole mouth. */
function hardware(kind, size, color){
  var d = u(size[0] || 0.8), L = u(size[1] || 2), r = d / 2;
  switch (kind){
    case 'dowel': { var g = group(cylY(r, -L / 2, L / 2, color, 12)); for (var k = 0; k < 3; k++){ var a = k / 3 * Math.PI * 2; var ln = lines([new T.Vector3(Math.cos(a) * r * 1.01, -L * 0.42, Math.sin(a) * r * 1.01), new T.Vector3(Math.cos(a) * r * 1.01, L * 0.42, Math.sin(a) * r * 1.01)], INK, 0.35); g.add(ln); } return g; }
    case 'screw': { var head = cylY(r * 1.9, -r * 0.9, 0, color, 16); var g2 = group(head, cylY(r, 0, L * 0.86, color, 10), coneY(r, L * 0.86, L, color)); var sl = inkBox(r * 2.4, r * 0.08, r * 0.3); sl.position.y = -r * 0.92; var sl2 = inkBox(r * 0.3, r * 0.08, r * 2.4); sl2.position.y = -r * 0.92; g2.add(sl); g2.add(sl2); return g2; }
    case 'bolt': return group(cylY(r * 1.7, -r * 1.2, 0, color, 6), cylY(r, 0, L, color, 10));
    case 'cam_bolt': { var g3 = group(cylY(r, 0, L * 0.55, color, 10), cylY(r * 1.7, -L * 0.07, 0, color, 6), cylY(r * 0.75, -L * 0.36, -L * 0.07, color, 10)); var ball = sphere(r * 1.25, color); ball.position.y = -L * 0.36 - r * 1.1; g3.add(ball); return g3; }
    case 'cam_lock': { var t = u(size[1] || 1.2); var g4 = group(cylY(r, -u(0.05), t - u(0.05), color, 20)); var s1 = inkBox(d * 0.62, Math.max(u(0.02), t * 0.04), d * 0.13); s1.position.y = -u(0.06); g4.add(s1); var s2 = inkBox(d * 0.1, Math.max(u(0.02), t * 0.04), d * 0.1); s2.position.set(d * 0.36, -u(0.06), 0); g4.add(s2); return g4; }
    case 'nail': return group(cylY(r, 0, L * 0.9, color, 8, {edge: false}), coneY(r, L * 0.9, L, color), cylY(r * 2.8, -r * 0.8, 0, color, 14));
    case 'shelf_pin': { var g5 = group(cylY(r, 0, L * 0.45, color, 10), cylY(r * 1.9, -L * 0.07, 0, color, 14)); var sup = box(d * 1.2, d * 0.55, L * 0.5, color, {edge: 0.6}); sup.position.set(0, -L * 0.07 - L * 0.25, -d * 0.2); sup.rotation.x = Math.PI / 2; g5.add(sup); return g5; }
    case 'plug': return group(cylY(r, 0, L, color, 10), cylY(r * 1.35, -u(0.08), 0, color, 14));
    case 'washer': { var th = u(size[1] || 0.15); var g6 = group(cylY(r, -th, 0, color, 20)); var hole = new T.Mesh(new T.CircleGeometry(r * 0.42, 16), new T.MeshBasicMaterial({color: 0x555555})); hole.userData.keepColor = true; hole.rotation.x = Math.PI / 2; hole.position.y = -th - u(0.01); g6.add(hole); return g6; }
    case 'nut': return group(cylY(r, -L, 0, color, 6));
    case 'hinge': { var g7 = group(cylY(r, 0, L, color, 18)); var arm = box(d * 1.6, d * 0.22, d * 0.45, color); arm.position.set(d * 0.85, -d * 0.11, 0); g7.add(arm); return g7; }
    case 'knob': { var g8 = group(cylY(r * 0.35, -L * 0.45, 0, color, 10)); var kb = sphere(r, color); kb.position.y = -L * 0.45 - r * 0.8; g8.add(kb); return g8; }
    case 'handle': { var len = u(size[1] || 12), dd = u(size[0] || 1.2); var off = Math.max(dd * 2.2, u(2.5)); var bar = mesh(new T.CylinderGeometry(dd / 2, dd / 2, len, 12), color, {thresh: 40, edge: 0.6}); bar.rotation.z = Math.PI / 2; bar.position.y = -off; return group(bar, at(cylY(dd * 0.4, -off, 0, color, 10), -len / 2 + dd, 0, 0), at(cylY(dd * 0.4, -off, 0, color, 10), len / 2 - dd, 0, 0)); }
    case 'foot': return group(cylY(r, -L, 0, color, 18));
    case 'bracket': return lBracket(size, color);
  }
  return group(cylY(r, -L / 2, L / 2, color, 10));
}
function lBracket(size, color){ /* origin at the outer corner; legA along +x, legB along +y, width along z */
  var a = u(size[0] || 6), b = u(size[1] || 6), w = u(size[2] || 1.6), t = Math.max(u(0.15), w * 0.08);
  var A = box(a, t, w, color); A.position.set(a / 2, t / 2, 0);
  var B = box(t, b, w, color); B.position.set(t / 2, b / 2, 0);
  return group(A, B);
}
function structural(p, size, color){
  switch (p.shape){
    case 'cylinder': { var d = u(size[0] || 3), L = u(size[1] || 10); return cylY(d / 2, -L / 2, L / 2, color, 24); }
    case 'sphere': return sphere(u(size[0] || 3) / 2, color, {edge: false});
    case 'l-bracket': return lBracket(size, color);
  }
  var m = box(u(size[0] || 10), u(size[1] || 10), u(size[2] || 10), color, {edge: p.kind === 'glass' ? 0.4 : undefined, opacity: p.kind === 'glass' ? 0.55 : undefined});
  return m;
}
function tool(p){ /* drawn lying on the floor along +x, at real size */
  var s = ((p.key || '') + ' ' + (p.name || '')).toLowerCase(), c = WHITE;
  if (/hammer|mallet/.test(s)){ var h = group(at(box(u(26), u(1.8), u(2.6), c), u(13), 0, 0)); var hd = box(u(3), u(3), u(10), c); hd.position.set(u(26.5), 0, 0); h.add(hd); return h; }
  if (/allen|hex key|hex-key|l-key/.test(s)){ return group(at(box(u(7), u(0.45), u(0.45), c), u(3.5), 0, 0), at(box(u(0.45), u(0.45), u(2.2), c), u(0.22), 0, u(1.1))); }
  if (/drill/.test(s)){ return group(at(box(u(18), u(6), u(5), c), u(9), u(3), 0), at(box(u(5), u(12), u(4.2), c), u(4), u(-3), 0), at(rotZ(cylY(u(0.9), 0, u(5), c, 12)), u(18), u(3), 0)); }
  if (/level/.test(s)){ return group(at(box(u(40), u(2.6), u(4), c), u(20), 0, 0)); }
  if (/pencil/.test(s)){ return group(at(rotZ(cylY(u(0.4), 0, u(17), c, 6)), 0, 0, 0)); }
  if (/tape|measure/.test(s)){ return group(at(box(u(6.5), u(6.5), u(3.4), c), 0, 0, 0)); }
  if (/wrench|spanner/.test(s)){ return group(at(box(u(15), u(0.5), u(1.8), c), u(7.5), 0, 0)); }
  /* screwdriver (default) */
  return group(at(rotZ(cylY(u(1.4), 0, u(10), c, 12)), 0, 0, 0), at(rotZ(cylY(u(0.32), 0, u(10), c, 8)), u(10), 0, 0));
}
function rotZ(m){ var g = group(m); g.rotation.z = -Math.PI / 2; return g; }
var MAT_REST = function(p){ return REST[p.material] || GREY; };
function buildPart(p, size){
  if (p.kind === 'tool') return tool(p);
  if (isHW(p.kind)) return hardware(p.kind, size, WHITE);
  return structural(p, size, WHITE);
}
var P = {}; SPEC.parts.forEach(function(p){ P[p.key] = function(){ return buildPart(p, p.size); }; });

/* ---------- orientation ---------- */
var AXV = {x: [1, 0, 0], '-x': [-1, 0, 0], y: [0, 1, 0], '-y': [0, -1, 0], z: [0, 0, 1], '-z': [0, 0, -1]};
function orientQ(axis, rotDeg, useAxis){
  var q = new T.Quaternion();
  if (useAxis) q.setFromUnitVectors(new T.Vector3(0, 1, 0), v(AXV[axis] || AXV.y));
  if (rotDeg && (rotDeg[0] || rotDeg[1] || rotDeg[2])) q.premultiply(new T.Quaternion().setFromEuler(new T.Euler(rotDeg[0] * DEG, rotDeg[1] * DEG, rotDeg[2] * DEG)));
  return q;
}
function usesAxis(p){ return (isHW(p.kind) && p.kind !== 'bracket') || (!isHW(p.kind) && p.kind !== 'tool' && p.shape === 'cylinder'); }

/* ---------- groups: the main body and each sub-assembly move as wholes ---------- */
var MAIN = new T.Group(); MAIN.name = 'main'; world.add(MAIN);
var GROUPS = {'': MAIN};
Object.keys(ASMS).forEach(function(k){ var g = new T.Group(); g.name = 'asm:' + k; world.add(g); GROUPS[k] = g; });
var groupKeys = Object.keys(GROUPS);

/* registry: reg(key, obj, parent, opts) */
var objs = {}; var order = [];
function reg(key, obj, parent, o){
  o = o || {}; parent.add(obj);
  if (o.each){ obj.children.forEach(function(ch){ ch.userData.dest = ch.position.clone(); ch.userData.q0 = ch.quaternion.clone(); }); centre(obj); }
  var ud = obj.userData; ud.dest = obj.position.clone(); ud.q0 = obj.quaternion.clone();
  ud.add = o.add == null ? 0 : o.add; ud.only = o.only; ud.lag = o.lag || 0; ud.each = !!o.each; ud.span = o.span || 0.9; ud.noArrow = !!o.noArrow; ud.part = o.part; ud.noGhost = !!o.noGhost;
  ud.asm = o.asm || ''; ud.kind = o.kind; ud.hw = !!o.hw; ud.axisV = o.axisV; ud.fromW = o.fromW; ud.len = o.len || 0; ud.rest = o.rest == null ? GREY : o.rest; ud.key = key;
  objs[key] = obj; order.push(key); return obj;
}

/* the placements, in step order */
var PL = SPEC.placements.map(function(pl, i){ return {pl: pl, i: i}; }).sort(function(a, b){ return a.pl.step - b.pl.step || a.i - b.i; });
var perStep = {};
var FROMV = {above: [0, 1, 0], below: [0, -1, 0], front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0]};
PL.forEach(function(it){
  var pl = it.pl, p = PARTS[pl.part]; if (!p) return;
  var size = pl.size && pl.size.length ? pl.size : p.size;
  var ax = usesAxis(p), q = orientQ(pl.axis, pl.rot, ax);
  var n = pl.at.length, obj;
  if (n === 1){ obj = buildPart(p, size); obj.position.set(u(pl.at[0][0]), u(pl.at[0][1]), u(pl.at[0][2])); obj.quaternion.copy(q); }
  else { obj = new T.Group(); pl.at.forEach(function(a){ var c = buildPart(p, size); c.position.set(u(a[0]), u(a[1]), u(a[2])); c.quaternion.copy(q); obj.add(c); }); }
  var k = perStep[pl.step] = (perStep[pl.step] || 0) + 1;
  var hw = isHW(p.kind);
  reg(pl.id, obj, GROUPS[pl.asm || ''] || MAIN, {
    add: pl.step, part: p.key, each: n > 1, span: Math.min(0.9, 0.2 + 0.04 * n), lag: Math.min(1.4, (k - 1) * (hw ? 0.12 : 0.22)),
    noArrow: hw, asm: pl.asm || '', kind: p.kind, hw: hw, axisV: v(AXV[pl.axis] || AXV.y), len: Math.max(size[1] || size[0] || 1, size[0] || 1),
    fromW: pl.from && pl.from !== 'auto' ? FROMV[pl.from] : null, rest: MAT_REST(p)
  });
});

/* holes: a dark ring on the host panel wherever a fastener goes in */
(function(){
  var hosts = [];
  order.forEach(function(key){ var o = objs[key], p = PARTS[o.userData.part]; if (!p || isHW(p.kind) || p.shape !== 'box') return;
    var list = o.userData.each ? o.children : [o];
    list.forEach(function(m){ m.updateMatrixWorld(true); if (Math.abs(m.quaternion.w) < 0.9999 && !(o.userData.each)) { if (m.quaternion.angleTo(new T.Quaternion()) > 1e-3) return; } var bb = new T.Box3().setFromObject(m); hosts.push({m: m, bb: bb}); }); });
  var probe = new T.Vector3();
  SPEC.placements.forEach(function(pl){ var p = PARTS[pl.part]; if (!p || !isHW(p.kind) || /washer|knob|handle|foot|bracket|nut/.test(p.kind)) return;
    var size = pl.size && pl.size.length ? pl.size : p.size; var r = u(size[0] || 0.8) / 2 * (p.kind === 'cam_lock' ? 1.04 : 1.15); var a = v(AXV[pl.axis] || AXV.y);
    pl.at.forEach(function(pt){ var mouth = new T.Vector3(u(pt[0]), u(pt[1]), u(pt[2])); probe.copy(mouth).addScaledVector(a, u(0.35));
      for (var i = 0; i < hosts.length; i++){ var h = hosts[i]; if (!h.bb.containsPoint(probe)) continue;
        var ring = new T.Mesh(new T.RingGeometry(r * 0.7, r, 20), new T.MeshBasicMaterial({color: 0x2c2c2c, transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false}));
        ring.userData.keepColor = true; ring.userData.decal = true;
        var wpos = mouth.clone().addScaledVector(a, -u(0.03)); h.m.worldToLocal(wpos); ring.position.copy(wpos);
        ring.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), a.clone().negate()); h.m.add(ring); break; } }); });
})();

/* ---------- poses and group states ---------- */
function qAxis(x, y, z, deg){ return new T.Quaternion().setFromAxisAngle(new T.Vector3(x, y, z), deg * DEG); }
var POSEQ = {'upright': new T.Quaternion(), 'on-back': qAxis(1, 0, 0, -90), 'on-front': qAxis(1, 0, 0, 90), 'on-left': qAxis(0, 0, 1, 90), 'on-right': qAxis(0, 0, 1, -90), 'upside-down': qAxis(0, 0, 1, 180)};
function poseOf(i){ return (i <= 0 || i >= LAST) ? 'upright' : (STEPS[i].pose || 'upright'); }
function boxOfKeys(keys){ var bb = new T.Box3(); keys.forEach(function(k){ var o = objs[k]; o.updateMatrixWorld(true); bb.expandByObject(o); }); return bb; }
world.updateMatrixWorld(true);
var FB = boxOfKeys(order.filter(function(k){ return true; }));            /* the finished product, product frame */
if (FB.isEmpty()) FB.set(new T.Vector3(-u(PS[0] / 2 || 20), 0, -u(PS[2] / 2 || 20)), new T.Vector3(u(PS[0] / 2 || 20), u(PS[1] || 40), u(PS[2] / 2 || 20)));
var ABB = {}; Object.keys(ASMS).forEach(function(k){ ABB[k] = boxOfKeys(order.filter(function(key){ return objs[key].userData.asm === k; })); });
function cornersOf(bb){ var a = bb.min, b = bb.max; return [new T.Vector3(a.x, a.y, a.z), new T.Vector3(b.x, a.y, a.z), new T.Vector3(a.x, b.y, a.z), new T.Vector3(a.x, a.y, b.z), new T.Vector3(b.x, b.y, a.z), new T.Vector3(b.x, a.y, b.z), new T.Vector3(a.x, b.y, b.z), new T.Vector3(b.x, b.y, b.z)]; }
function rotatedBox(bb, q, p){ var out = new T.Box3(); cornersOf(bb).forEach(function(c){ out.expandByPoint(c.applyQuaternion(q).add(p || new T.Vector3())); }); return out; }
function seat(q){ var rb = rotatedBox(FB, q); return new T.Vector3(-(rb.min.x + rb.max.x) / 2, -rb.min.y, -(rb.min.z + rb.max.z) / 2); }
var STATES = [];
for (var si = 0; si <= LAST; si++){
  var st = {};
  var mq = POSEQ[poseOf(si)] || POSEQ.upright; st[''] = {q: mq.clone(), p: seat(mq), staged: false};
  Object.keys(ASMS).forEach(function(k){ var a = ASMS[k];
    if (si > 0 && si < LAST && si < a.joins && !ABB[k].isEmpty()){
      var jq = POSEQ[poseOf(a.joins)] || POSEQ.upright; var jp = seat(jq);
      var p = jp.clone().add(new T.Vector3(u(a.offset[0] || 0), 0, u(a.offset[2] || 0)));
      var rb = rotatedBox(ABB[k], jq, p); p.y -= rb.min.y; st[k] = {q: jq.clone(), p: p, staged: true};
    } else st[k] = {q: st[''].q.clone(), p: st[''].p.clone(), staged: false};
  });
  STATES.push(st);
}
function setGroups(st){ groupKeys.forEach(function(k){ var g = GROUPS[k], s = st[k]; g.quaternion.copy(s.q); g.position.copy(s.p); }); }
function lowestY(k, g){ var bb = k === '' ? FB : ABB[k]; if (!bb || bb.isEmpty()) return 0; return rotatedBox(bb, g.quaternion, g.position).min.y; }

/* ---------- visibility per page ---------- */
function visibleAt(o, k, page){ var ud = o.userData; if (ud.only) return ud.only.indexOf(page) >= 0; return ud.add <= k; }
function baseOf(i){ return (i === 0 || i === LAST) ? LAST : i - 1; }
function arrivals(i){ return order.filter(function(key){ var ud = objs[key].userData; return ud.only ? (ud.only.indexOf(i) >= 0 && ud.only.indexOf(i - 1) < 0) : ud.add === i; }); }
function joining(i){ return Object.keys(ASMS).filter(function(k){ return ASMS[k].joins === i && i > 0 && i < LAST; }); }

/* ---------- tools beside the work ---------- */
var VIEWV = {auto: [1, 0.8, 1.25], 'front-right': [1, 0.8, 1.25], 'front-left': [-1, 0.8, 1.25], front: [0.12, 0.42, 1], back: [-0.12, 0.45, -1], 'back-right': [1, 0.8, -1.25], 'back-left': [-1, 0.8, -1.25], left: [-1, 0.45, 0.25], right: [1, 0.45, 0.25], top: [0.25, 1, 0.45], below: [0.45, -0.75, 0.8]};
function viewOf(i){ var s = STEPS[i]; var w = v(VIEWV[s.view] || VIEWV.auto);
  /* a wall stands behind the piece: never look at it from behind */
  if ((s.wall || (i === LAST && hasWall)) && w.z < 0.2) w.set(0.75, 1.05, 1);
  return w.normalize(); }
var hasWall = SPEC.steps.some(function(s){ return s.wall; });

/* ---------- framing: one camera per page, computed from what is on the floor ---------- */
var CAMS = [], DETAILS = [], ALL = new T.Box3();
function worldBox(keys){ var bb = new T.Box3(); keys.forEach(function(k){ var o = objs[k]; if (o) bb.expandByObject(o); }); return bb; }
function frameBox(bb, view, minExt){
  var c = bb.getCenter(new T.Vector3()); var f = view.clone().negate();
  var right = new T.Vector3().crossVectors(f, new T.Vector3(0, 1, 0)); if (right.lengthSq() < 1e-6) right.set(1, 0, 0); right.normalize();
  var up = new T.Vector3().crossVectors(right, f).normalize(); var hx = 0, hy = 0;
  cornersOf(bb).forEach(function(p){ p.sub(c); hx = Math.max(hx, Math.abs(p.dot(right))); hy = Math.max(hy, Math.abs(p.dot(up))); });
  return {c: c, r: Math.max(hx, hy, minExt || 0) * 1.14 + 0.05 * S};
}
world.rotation.y = 0;
for (var pi = 0; pi <= LAST; pi++){
  setGroups(STATES[pi]); world.updateMatrixWorld(true);
  var k = baseOf(pi) === LAST ? LAST : pi;
  var vis = order.filter(function(key){ return visibleAt(objs[key], k, pi); });
  var all = worldBox(vis); ALL.union(all);
  var focus = [];
  if (pi > 0 && pi < LAST){
    focus = arrivals(pi).slice();
    joining(pi).forEach(function(ak){ order.forEach(function(key){ if (objs[key].userData.asm === ak && focus.indexOf(key) < 0 && visibleAt(objs[key], k, pi)) focus.push(key); }); });
    (STEPS[pi].acts || []).forEach(function(a){ if (a.target && objs[a.target] && focus.indexOf(a.target) < 0) focus.push(a.target); });
  }
  var fb = focus.length ? worldBox(focus) : all;
  if (fb.isEmpty()) fb = all.isEmpty() ? new T.Box3(new T.Vector3(-1, 0, -1), new T.Vector3(1, 1, 1)) : all;
  var view = viewOf(pi);
  var minR = pi > 0 && pi < LAST ? 0.24 * S : 0;   /* small parts still get their surroundings */
  CAMS.push(extend(frameBox(fb, view, minR), {v: view}));
  /* a detail bubble when the new parts are small next to the view */
  var det = null, small = arrivals(pi).filter(function(key){ return objs[key].userData.hw; });
  if (pi > 0 && pi < LAST && small.length){
    var o0 = objs[small[0]], first = o0.userData.each ? o0.children[0] : o0; var wp = first.getWorldPosition(new T.Vector3());
    var len = o0.userData.len || 1; var dr = Math.min(0.14 * S, Math.max(0.035 * S, u(len) * 3.2));
    if (dr * 3 < CAMS[pi].r) det = {p: wp, r: dr, v: view};
  }
  DETAILS.push(det);
}
setGroups(STATES[LAST]); world.updateMatrixWorld(true);

/* ---------- site: floor, grid, wall ---------- */
var site = new T.Group(); world.add(site);
var ac = ALL.getCenter(new T.Vector3()), as = ALL.getSize(new T.Vector3());
var span = Math.max(as.x, as.z) + 0.6 * S;
var floor = box(span * 1.15, 0.2, span * 1.15, WHITE, {edge: 0.35, noShadow: true}); floor.position.set(ac.x, -0.1, ac.z); site.add(floor);
(function(){ var g = S_CM <= 120 ? 10 : (S_CM <= 260 ? 20 : 50); var step = u(g); var half = span * 0.575; var pts = [];
  var x0 = Math.ceil((ac.x - half) / step) * step, z0 = Math.ceil((ac.z - half) / step) * step;
  for (var x = x0; x <= ac.x + half; x += step) pts.push(new T.Vector3(x, 0.004, ac.z - half), new T.Vector3(x, 0.004, ac.z + half));
  for (var z = z0; z <= ac.z + half; z += step) pts.push(new T.Vector3(ac.x - half, 0.004, z), new T.Vector3(ac.x + half, 0.004, z));
  site.add(lines(pts, INK, 0.07)); })();
var wallMesh = null;
if (SPEC.steps.some(function(s){ return s.wall; })){
  var fbU = rotatedBox(FB, POSEQ.upright, seat(POSEQ.upright));
  var ww = (fbU.max.x - fbU.min.x) + 1.2 * S * 0.6, wh = (fbU.max.y - fbU.min.y) * 1.18 + 0.2 * S;
  wallMesh = box(ww, wh, 0.06, WHITE, {edge: 0.45}); wallMesh.position.set((fbU.min.x + fbU.max.x) / 2, wh / 2, fbU.min.z - 0.03 - u(0.5)); wallMesh.userData.keepColor = true; site.add(wallMesh);
  var skirting = box(ww, u(7), u(1.2), WHITE, {edge: 0.45}); skirting.position.set(wallMesh.position.x, u(3.5), wallMesh.position.z + 0.03 + u(0.6)); skirting.userData.keepColor = true; site.add(skirting);
  wallMesh.userData.skirting = skirting; wallMesh.visible = skirting.visible = false;
}
var wallOn = false;
function setWall(on){ if (!wallMesh || on === wallOn) return; wallOn = on; var sk = wallMesh.userData.skirting; wallMesh.visible = sk.visible = true; var a = on ? 0 : 1, b = on ? 1 : 0;
  tween(500, function(e){ var o = a + (b - a) * e; setOpacity(wallMesh, o); setOpacity(sk, o); if (e >= 1 && !on){ wallMesh.visible = sk.visible = false; } }); }

/* tools: placed per page beside the focus, on the floor */
for (var ti = 1; ti < LAST; ti++){
  (STEPS[ti].tools || []).forEach(function(tk, j){ var p = PARTS[tk]; if (!p || p.kind !== 'tool') return; var t = tool(p);
    var cb = CAMS[ti]; var dir = new T.Vector3(CAMS[ti].v.x, 0, CAMS[ti].v.z).normalize(); var side = new T.Vector3(-dir.z, 0, dir.x);
    var pos = cb.c.clone().addScaledVector(dir, cb.r * 0.55).addScaledVector(side, cb.r * (0.45 + 0.18 * j)); pos.y = u(0.8);
    t.position.copy(pos); t.rotation.y = Math.atan2(dir.x, dir.z) + j * 0.3;   /* lies across the view, not toward it */
    reg('tool:' + tk + ':' + ti, t, world, {only: [ti], part: tk, noArrow: true, noGhost: true, rest: GREY, kind: 'tool', fromW: [0, 1, 0]}); });
}

/* the white model: context geometry stays white */
site.traverse(function(n){ if (n.isMesh && n.material && n.material.color) n.material.color.setHex(WHITE); });

/* bounds: shadow camera and plan inset fit everything that appears */
(function(){ var c = ALL.getCenter(new T.Vector3()), s = ALL.getSize(new T.Vector3()); var R = Math.max(s.x, s.y, s.z) * 0.75 + 1;
  sun.position.set(c.x - 0.5 * R, c.y + R, c.z + 0.45 * R); sun.target.position.copy(c); var sc = sun.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 0.1; sc.far = R * 4; sc.updateProjectionMatrix();
  var pr = Math.max(s.x, s.z) / 2 * 1.12 + 0.1; planCam.left = -pr; planCam.right = pr; planCam.top = pr; planCam.bottom = -pr; planCam.far = ALL.max.y + 200;
  planCam.position.set(c.x, ALL.max.y + 50, c.z); planCam.lookAt(c.x, 0, c.z); planCam.updateProjectionMatrix(); })();

/* ---------- thumbnails ---------- */
var THUMB = {};
(function(){ var tc = document.createElement('canvas'); var tr = new T.WebGLRenderer({canvas: tc, antialias: true, alpha: true, preserveDrawingBuffer: true}); tr.setPixelRatio(2); tr.setSize(72, 72, false); tr.setClearColor(0xffffff, 0);
  var sc = new T.Scene(); sc.add(new T.HemisphereLight(0xffffff, 0xffffff, 0.9)); var dl = new T.DirectionalLight(0xffffff, 0.16); dl.position.set(-6, 10, 6); sc.add(dl);
  var cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.001, 100); var tv = new T.Vector3(1, 0.8, 1.25).normalize();
  Object.keys(P).forEach(function(k){ var o = P[k](); paint(o, FILL); sc.add(o); o.updateMatrixWorld(true); var bb = new T.Box3().setFromObject(o); var c = bb.getCenter(new T.Vector3()); var r = bb.getSize(new T.Vector3()).length() / 2 * 1.02 + 1e-3;
    cam.position.copy(c).addScaledVector(tv, Math.max(20, r * 6)); cam.lookAt(c); cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 0.001; cam.far = Math.max(40, r * 12); cam.updateProjectionMatrix(); tr.render(sc, cam); THUMB[k] = tc.toDataURL('image/png'); sc.remove(o); });
  tr.dispose(); if (tr.forceContextLoss) tr.forceContextLoss(); })();
function partItem(key, qty, cls){ var li = document.createElement('li'); var q = /^\d+$/.test(String(qty)) ? '×' + qty : String(qty); var p = PARTS[key] || {};
  if (cls === 'callout'){ li.innerHTML = '<div class="th"><img alt=""><span class="q"></span></div><span class="nm"></span>'; li.addEventListener('click', function(){ pulse(key); }); }
  else { li.innerHTML = '<img alt=""><span class="q"></span><span class="nm"></span><span class="cd"></span>'; li.querySelector('.cd').textContent = p.code || ''; }
  var img = li.querySelector('img'); if (THUMB[key]) img.src = THUMB[key]; else img.remove(); li.querySelector('.q').textContent = q; li.querySelector('.nm').textContent = p.name || key; li.title = (p.name || key) + (p.code ? ' (' + p.code + ')' : ''); return li; }

/* ---------- tweens ---------- */
var tweens = [];
function ease(t){ return 1 - Math.pow(1 - t, 3); }
function easeIO(t){ return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
/* a tween's clock starts on its first rendered frame, so a slow first frame can't eat the opening motion */
function tween(dur, fn, easing, delay){ var tw = {t0: null, d: reduce ? 0 : (delay || 0), dur: reduce ? 0 : dur, fn: fn, e: easing || ease}; tweens.push(tw); return tw; }
function stepTweens(now){ for (var i = tweens.length - 1; i >= 0; i--){ var tw = tweens[i]; if (!tw) continue; if (tw.t0 == null) tw.t0 = now + tw.d; if (now < tw.t0) continue; var k = tw.dur === 0 ? 1 : Math.min(1, (now - tw.t0) / tw.dur); tw.fn(tw.e(k), k); if (k >= 1){ var at2 = tweens.indexOf(tw); if (at2 >= 0) tweens.splice(at2, 1); } } }
var temps = [];
function addTemp(obj, parent){ parent.add(obj); temps.push(obj); }
function clearTemps(){ temps.forEach(function(a){ if (a.parent) a.parent.remove(a); }); temps = []; }
function accel(i, n, span){ return n <= 1 ? 0 : span * Math.sqrt(i / (n - 1)); }

function applyState(k, page){
  order.forEach(function(key){ var o = objs[key]; var ud = o.userData; o.visible = visibleAt(o, k, page); o.position.copy(ud.dest); o.quaternion.copy(ud.q0); o.scale.setScalar(1); setOpacity(o, 1);
    o.traverse(function(n){ if (n.isLineSegments && n.material.userData.inkBase) n.material.color.setHex(INK); });
    if (ud.each) o.children.forEach(function(ch){ if (ch.userData.dest) ch.position.copy(ch.userData.dest); if (ch.userData.q0) ch.quaternion.copy(ch.userData.q0); ch.scale.setScalar(1); });
    var hot = page === 0 || (ud.only ? ud.only.indexOf(page) >= 0 : ud.add === page) || (page > 0 && page < LAST && ud.asm && ASMS[ud.asm] && ASMS[ud.asm].joins === page);
    paint(o, hot ? FILL : ud.rest); });
}
function landing(o, from, dest, lag, dur){ o.visible = true; o.position.copy(from); setOpacity(o, 0); tween(180, function(e){ setOpacity(o, e); }, null, lag - 180); tween(dur || 700, function(e){ o.position.lerpVectors(from, dest, e); }, ease, lag); }
function pulse(partKey){ /* tap a part in the callout: it blinks twice and its outline flashes the accent */
  order.forEach(function(key){ var o = objs[key]; if (o.userData.part !== partKey || !o.visible) return;
    var inks = []; o.traverse(function(n){ if (n.isLineSegments && n.material.color && inks.indexOf(n.material) < 0){ n.material.userData.inkBase = true; inks.push(n.material); } });
    tween(900, function(e, k){ setOpacity(o, 1 - 0.75 * Math.abs(Math.sin(k * Math.PI * 2))); inks.forEach(function(m){ m.color.setHex(k < 1 ? ACCENT : INK); }); }, function(t){ return t; }); });
}
/* where a part comes from, in its group's frame */
function fromLocal(o, page){
  var ud = o.userData, g = o.parent || MAIN, st = STATES[page][ud.asm || ''] || STATES[page][''];
  if (ud.kind === 'tool') return new T.Vector3(0, 0.25 * S, 0);
  if (ud.hw){ var dist = Math.max(u(ud.len) * 3.5, 0.045 * S); return ud.axisV.clone().multiplyScalar(-dist); }
  var w;
  if (ud.fromW) w = v(ud.fromW);
  else {
    /* outward from the body and up, judged in the world at this page */
    var q = st.q, p = st.p; var cWorld = o.userData.dest.clone().applyQuaternion(q).add(p);
    var bodyC = rotatedBox(FB, STATES[page][''].q, STATES[page][''].p).getCenter(new T.Vector3());
    var out = cWorld.clone().sub(bodyC); out.y = 0; var L = out.length();
    w = L > 0.22 * S ? out.normalize().multiplyScalar(0.7).add(new T.Vector3(0, 0.75, 0)) : new T.Vector3(0, 1, 0);
  }
  w.normalize().multiplyScalar(0.3 * S);
  return w.applyQuaternion(st.q.clone().invert());
}
/* small extra motion once fasteners have landed */
function settle(o, landEnd){
  var kind = o.userData.kind, list = o.userData.each ? o.children : [o];
  if (kind === 'cam_lock') list.forEach(function(c, j){ var q0 = c.userData.q0 || c.quaternion.clone(); tween(520, function(e){ c.quaternion.copy(q0).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), e * Math.PI)); }, easeIO, landEnd + 120 + j * 50); });
  if (kind === 'screw' || kind === 'bolt' || kind === 'cam_bolt') list.forEach(function(c, j){ var q0 = c.userData.q0 || c.quaternion.clone(); tween(620, function(e){ c.quaternion.copy(q0).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -e * Math.PI * 4)); }, easeIO, landEnd - 520 + j * 40); });
}

/* ---------- camera ---------- */
var VIEW = new T.Vector3(1, 0.8, 1.25).normalize();
var camT = {c: new T.Vector3(), r: 10};
var scaleBar = $('#scaleBar'), scaleTxt = $('#scaleTxt');
function frame(c, r){ camT.c.copy(c); camT.r = r; camera.position.copy(c).addScaledVector(VIEW, 120); camera.up.set(0, 1, 0); camera.lookAt(c); var w = stage.clientWidth || 1, h = stage.clientHeight || 1, a = w / h;
  if (a >= 1){ camera.top = r; camera.bottom = -r; camera.left = -r * a; camera.right = r * a; } else { camera.left = -r; camera.right = r; camera.top = r / a; camera.bottom = -r / a; } camera.updateProjectionMatrix();
  var pxPerU = a >= 1 ? h / (2 * r) : w / (2 * r); var pxPerCm = pxPerU * U; var opts = [[100, '1 m'], [50, '50 cm'], [20, '20 cm'], [10, '10 cm'], [5, '5 cm'], [2, '2 cm'], [1, '1 cm']]; var pick = opts[opts.length - 1];
  for (var i = 0; i < opts.length; i++){ if (opts[i][0] * pxPerCm <= 110){ pick = opts[i]; break; } } scaleBar.style.width = (pick[0] * pxPerCm).toFixed(1) + 'px'; scaleTxt.textContent = pick[1];
  floor.visible = VIEW.y > -0.05; }
function moveCam(cam){ var c0 = camT.c.clone(), r0 = camT.r, v0 = VIEW.clone(), v1 = cam.v.clone();
  if (c0.distanceTo(cam.c) < 0.01 && Math.abs(r0 - cam.r) < 0.01 && v0.distanceTo(v1) < 0.001) return;
  tween(900, function(e){ VIEW.copy(v0).lerp(v1, e).normalize(); frame(c0.clone().lerp(cam.c, e), r0 + (cam.r - r0) * e); }, easeIO); }

var planFrame = new T.LineLoop(new T.BufferGeometry().setFromPoints([new T.Vector3(-1, 0, -1), new T.Vector3(1, 0, -1), new T.Vector3(1, 0, 1), new T.Vector3(-1, 0, 1)]), new T.LineBasicMaterial({color: ACCENT})); planFrame.layers.set(1); scene.add(planFrame);
var planEl = $('.plan');

var bubble = $('#bubble'), bubbleIn = bubble.firstElementChild, leader = $('#leader'), ring = $('#ring');
var detail = null, bubbleK = 0;
function setDetail(spec, delay){ detail = null; bubble.classList.remove('on'); bubbleK = 0; if (!spec) return;
  tween(1, function(){ detail = spec; bubble.classList.add('on'); }, null, delay);
  tween(420, function(e){ bubbleK = e; bubbleIn.style.transform = 'scale(' + e.toFixed(3) + ')'; }, ease, delay); }

var dimLayer = $('#dims'); var dimObjs = []; var labels = [];
function clearDims(){ dimObjs.forEach(function(o){ world.remove(o); }); dimObjs = []; labels = []; dimLayer.innerHTML = ''; }
function showLater(el, delay){ if (reduce) el.classList.add('on'); else setTimeout(function(){ el.classList.add('on'); }, delay); }
function addDim(d, delay){ var A = v(d.a), B = v(d.b), O = v(d.off); var A2 = A.clone().add(O), B2 = B.clone().add(O); var tk = 0.03 * S; var ext = O.clone().normalize().multiplyScalar(tk * 1.5); var dir = B2.clone().sub(A2).normalize(); var tick = new T.Vector3().crossVectors(dir, O.clone().normalize()); if (tick.length() < 0.01) tick.set(0, 1, 0); tick.normalize().multiplyScalar(tk);
  var pts = [A.clone().add(O.clone().normalize().multiplyScalar(tk)), A2.clone().add(ext), B.clone().add(O.clone().normalize().multiplyScalar(tk)), B2.clone().add(ext), A2, B2, A2.clone().sub(tick), A2.clone().add(tick), B2.clone().sub(tick), B2.clone().add(tick)];
  var l = lines(pts, INK, 0.8); l.material.opacity = 0; world.add(l); dimObjs.push(l); tween(300, function(e){ l.material.opacity = 0.8 * e; }, null, delay);
  var el = document.createElement('div'); el.className = 'dim'; el.textContent = d.label; dimLayer.appendChild(el); labels.push({el: el, p: A2.clone().lerp(B2, 0.5), dy: -14, local: true}); showLater(el, delay); }
function addMark(n, obj, delay){ var el = document.createElement('div'); el.className = 'mark'; el.textContent = n;
  var ln = document.createElement('i'); el.appendChild(ln); dimLayer.appendChild(el); labels.push({el: el, obj: obj, ln: ln, n: n}); showLater(el, delay); }
var tmpV = new T.Vector3();
function projectWorld(p, w, h){ tmpV.copy(p).project(camera); return [(tmpV.x + 1) / 2 * w, (1 - tmpV.y) / 2 * h]; }
function project(p, w, h){ tmpV.copy(p).applyMatrix4(world.matrixWorld).project(camera); return [(tmpV.x + 1) / 2 * w, (1 - tmpV.y) / 2 * h]; }
var calloutEl = $('#callout'), partsEl = $('#parts');
function partsCue(){ calloutEl.classList.toggle('more', partsEl.scrollWidth - partsEl.clientWidth - partsEl.scrollLeft > 2); }
partsEl.addEventListener('scroll', partsCue, {passive: true});
var wp = new T.Vector3();
function placeLabels(w, h){ var top = calloutEl.hidden ? 4 : calloutEl.offsetTop + calloutEl.offsetHeight + 6; labels.forEach(function(L){ var s;
    if (L.obj){ L.obj.getWorldPosition(wp); s = projectWorld(wp, w, h); L.sx = s[0]; L.sy = s[1]; }
    else s = project(L.p, w, h);
    L.s = s; });
  /* marks: pushed out from the middle of the view, then spread so two never sit on each other */
  var marks = labels.filter(function(L){ return L.obj; });
  marks.forEach(function(L){ var dx = L.s[0] - w / 2, dy = L.s[1] - h / 2, dl = Math.hypot(dx, dy) || 1; L.dx = dx / dl * 34; L.dy = dy / dl * 34; L.px = -dy / dl; L.py = dx / dl; });
  for (var round = 0; round < 6; round++){ var moved = false;
    for (var j = 1; j < marks.length; j++) for (var k = 0; k < j; k++){ var A = marks[j], M = marks[k];
      var ox = (A.s[0] + A.dx) - (M.s[0] + M.dx), oy = (A.s[1] + A.dy) - (M.s[1] + M.dy), d = Math.hypot(ox, oy);
      if (d < 27){ var ux = d > 0.5 ? ox / d : A.px, uy = d > 0.5 ? oy / d : A.py; A.dx += ux * (28 - d); A.dy += uy * (28 - d); moved = true; } }
    if (!moved) break; }
  labels.forEach(function(L){ var s = L.s;
    var x = s[0] + (L.dx || 0), y = s[1] + (L.dy || 0); var ew = L.el.offsetWidth, eh = L.el.offsetHeight; x = Math.max(4 + ew / 2, Math.min(w - 4 - ew / 2, x)); y = Math.max(top + eh / 2, Math.min(h - 4 - eh / 2, y)); L.el.style.transform = 'translate(' + (x - ew / 2).toFixed(1) + 'px,' + (y - eh / 2).toFixed(1) + 'px)';
    if (L.ln){ var ddx = s[0] - x, ddy = s[1] - y, len = Math.hypot(ddx, ddy); L.ln.style.display = len > 16 ? 'block' : 'none'; L.ln.style.width = Math.max(0, len - 14).toFixed(1) + 'px'; L.ln.style.transform = 'rotate(' + Math.atan2(ddy, ddx).toFixed(4) + 'rad) translateX(11px)'; } }); }

/* ---------- the sheet ---------- */
function stepPartsList(i){ var counts = {}, keys = [];
  function addc(k, n){ if (!(k in counts)){ counts[k] = 0; keys.push(k); } counts[k] += n; }
  arrivals(i).forEach(function(key){ var o = objs[key]; if (o.userData.kind === 'tool') return; addc(o.userData.part, o.userData.each ? o.children.length : 1); });
  joining(i).forEach(function(ak){ order.forEach(function(key){ var o = objs[key]; if (o.userData.asm === ak && o.userData.add < i && !PARTS[o.userData.part].kind.match(/^(dowel|cam_bolt|screw|nail|plug|shelf_pin)$/)) addc(o.userData.part, o.userData.each ? o.children.length : 1); }); });
  (STEPS[i].tools || []).forEach(function(t){ if (PARTS[t]) addc(t, 1); });
  return keys.map(function(k){ return [k, String(counts[k])]; }); }
var INVENTORY = (function(){ var g = {panels: [], hardware: [], tools: []};
  SPEC.parts.forEach(function(p){ var row = [p.key, String(p.qty || 1)]; if (p.kind === 'tool') g.tools.push(row); else if (isHW(p.kind)) g.hardware.push(row); else g.panels.push(row); });
  return [['Panels and boards', g.panels], ['Hardware', g.hardware], ['Tools', g.tools]].filter(function(x){ return x[1].length; }); })();
var totalMin = P_.minutes || SPEC.steps.reduce(function(a, s){ return a + (s.minutes || 0); }, 0);
var PAGES = OPTS.pages || {};
function pageButton(n){ var b = document.createElement('button'); b.className = 'pg'; b.type = 'button'; b.textContent = 'manual p. ' + n;
  if (PAGES[n]) b.addEventListener('click', function(){ openOverlay('Manual page ' + n, function(box){ var img = document.createElement('img'); img.alt = 'Page ' + n + ' of the original manual'; img.src = PAGES[n]; box.appendChild(img); }); });
  else { b.disabled = true; b.style.textDecoration = 'none'; b.style.color = 'inherit'; b.style.cursor = 'default'; }
  return b; }

var current = -1, rotUser = 0;
var where = $('#where'), body = $('#body');
function enter(i, replay){
  var s = STEPS[i], cam = CAMS[i]; clearTemps(); clearDims(); tweens = []; setDetail(null);
  var r0 = rotUser; if (Math.abs(r0) > 0.001) tween(700, function(e){ rotUser = r0 * (1 - e); });
  var base = baseOf(i);
  applyState(base, i);
  /* groups: from the previous page's arrangement to this one's (a pose change tips the body; a joining sub-assembly slides in) */
  var fromPage = (i === 0 || i === LAST) ? (current >= 0 && !replay ? current : LAST) : i - 1;
  var A = STATES[fromPage], B = STATES[i]; setGroups(A);
  var poseChange = A[''].q.angleTo(B[''].q) > 1e-3, joinNow = joining(i);
  groupKeys.forEach(function(k){ var g = GROUPS[k], a = A[k], b = B[k]; var moving = a.q.angleTo(b.q) > 1e-3 || a.p.distanceTo(b.p) > 1e-4; if (!moving) return;
    var lift = joinNow.indexOf(k) >= 0 ? 0.22 * S : 0; var dur = k === '' ? 1100 : 1000; var delay = k === '' ? 0 : (poseChange ? 700 : 150);
    tween(dur, function(e){ g.quaternion.copy(a.q).slerp(b.q, e); g.position.lerpVectors(a.p, b.p, e); if (lift) g.position.y += Math.sin(Math.PI * e) * lift; var low = lowestY(k, g); if (low < 0) g.position.y -= low; }, easeIO, delay); });
  setWall(!!s.wall || (i === LAST && !!wallMesh && SPEC.steps.some(function(x){ return x.wall; })));
  moveCam(cam);
  var lastLand = 350 + (poseChange ? 900 : 0) + (joinNow.length ? 1000 : 0);
  if (i > 0 && i < LAST){
    var t0 = lastLand;
    order.forEach(function(key){ var o = objs[key], ud = o.userData;
      var arrives = ud.only ? (ud.only.indexOf(i) >= 0 && ud.only.indexOf(i - 1) < 0) : ud.add === i;
      if (!arrives) return;
      var lag = t0 + ud.lag * 1000; var fromL = fromLocal(o, i); var from = ud.dest.clone().add(fromL); var parent = o.parent;
      if (!ud.noGhost && (!ud.each || o.children.length <= 8)){ var gh = ghostOf(o); addTemp(gh, parent); (function(g2, l2, d2){ tween(d2, function(e){ setOpacity(g2, 1 - e); if (e >= 1) g2.visible = false; }, null, l2); })(gh, lag, ud.each ? ud.span * 1000 + 400 : 700); }
      if (!ud.noArrow){ var ar = arrow(from.clone().addScaledVector(fromL, -0.1), ud.dest.clone().addScaledVector(fromL.clone().normalize(), 0.3 * Math.min(1, fromL.length()))); ar.visible = !reduce; addTemp(ar, parent); (function(ar2, l2){ tween(300, function(e){ setOpacity(ar2, 1 - e); if (e >= 1) ar2.visible = false; }, null, l2 + 650); })(ar, lag); }
      var end;
      if (ud.each){ o.visible = true; o.position.copy(ud.dest); var n = o.children.length; o.children.forEach(function(ch, j){ landing(ch, ch.userData.dest.clone().add(fromL), ch.userData.dest, lag + accel(j, n, ud.span) * 1000, 520); }); end = lag + ud.span * 1000 + 520; }
      else { landing(o, from, ud.dest, lag); end = lag + 700; }
      settle(o, end); lastLand = Math.max(lastLand, end + (ud.kind === 'cam_lock' ? 700 : 0));
    });
  }
  if (i === 0){ var fb0 = rotatedBox(FB, POSEQ.upright, seat(POSEQ.upright)); var mn = fb0.min, mx = fb0.max, off = 0.09 * S;
    addDim({a: [mn.x, 0, mx.z], b: [mx.x, 0, mx.z], off: [0, 0, off], label: fmt(PS[0]) + ' cm'}, 600);
    addDim({a: [mx.x, 0, mx.z], b: [mx.x, mx.y, mx.z], off: [off, 0, 0], label: fmt(PS[1]) + ' cm'}, 750);
    addDim({a: [mx.x, 0, mx.z], b: [mx.x, 0, mn.z], off: [off, 0, 0], label: fmt(PS[2]) + ' cm'}, 900); }
  (s.acts || []).forEach(function(a, j){ if (a.target && objs[a.target] && objs[a.target].visible !== false) addMark(j + 1, objs[a.target], lastLand + 350 + j * 120); });
  setDetail(DETAILS[i], lastLand + 600);
  var fill = function(){
    $('#num').innerHTML = i === 0 ? '<small>Parts</small>' : (i === LAST ? '<small>Done</small>' : String(i));
    $('#title').textContent = s.overview ? 'What this builds' : (s.done ? 'Built' : s.title);
    var text = s.overview ? ((P_.type || 'It') + ', ' + fmt(PS[0]) + ' × ' + fmt(PS[1]) + ' × ' + fmt(PS[2]) + ' cm. ' + N + ' steps' + (totalMin ? ', about ' + Math.round(totalMin) + ' min' : '') + (P_.people > 1 ? ', ' + P_.people + ' people' : '') + '. Every part is listed below.')
      : (s.done ? 'Every step is done. Check that each fitting is tight, then load the heaviest things lowest.' : (s.text || ''));
    $('#text').textContent = text;
    var meta = $('#meta'); meta.innerHTML = '';
    function chip(t, cls){ var sp = document.createElement('span'); sp.textContent = t; if (cls) sp.className = cls; meta.appendChild(sp); }
    if (!s.overview && !s.done){ if (s.minutes) chip('≈' + Math.round(s.minutes) + ' min'); if (s.people > 1) chip(s.people + ' people'); if (s.caution) chip('⚠ take care', 'warn'); (s.pages || []).slice(0, 2).forEach(function(n){ meta.appendChild(pageButton(n)); }); }
    else if (s.overview && P_.ref) chip('Manual ' + P_.ref);
    $('#tip').textContent = s.tip || '';
    var acts = $('#acts'); acts.innerHTML = ''; (s.acts || []).forEach(function(a, j){ var li = document.createElement('li'); li.innerHTML = '<b></b><span></span>'; li.children[0].textContent = String(j + 1); li.children[1].textContent = a.text; acts.appendChild(li); });
    var extra = $('#extra'); extra.innerHTML = '';
    if (s.overview){ INVENTORY.forEach(function(gp){ var h = document.createElement('p'); h.className = 'grp'; h.textContent = gp[0]; extra.appendChild(h); var ul = document.createElement('ul'); ul.className = 'inv'; gp[1].forEach(function(p){ ul.appendChild(partItem(p[0], p[1], 'inv')); }); extra.appendChild(ul); }); }
    $('#sheet').scrollTop = 0; body.style.opacity = 1;
  };
  if (reduce || current < 0 || replay){ fill(); } else { body.style.opacity = 0; setTimeout(fill, 150); }
  var co = $('#callout'), pl = $('#parts'); pl.innerHTML = '';
  var list = i > 0 && i < LAST ? stepPartsList(i) : [];
  if (list.length){ list.forEach(function(p){ pl.appendChild(partItem(p[0], p[1], 'callout')); }); co.hidden = false; } else { co.hidden = true; } partsCue();
  $('#replay').hidden = !(i > 0 && i < LAST);
  $('#prev').disabled = i === 0; $('#next').textContent = i === LAST ? 'Back to the parts' : (i === 0 ? 'Start' : (i === LAST - 1 ? 'Finish' : 'Next step'));
  $('#bar').style.width = (i / LAST * 100) + '%';
  Array.prototype.forEach.call($('#ticks').children, function(b, j){ b.classList.toggle('done', j < i); });
  where.textContent = i === 0 ? 'Parts' : (i === LAST ? 'Done' : 'Step ' + i + ' of ' + N);
  if (!replay && !STILL){ try { localStorage.setItem(storageKey, String(i)); } catch (e) {} }
  current = i;
}
var storageKey = 'unflat.' + (OPTS.id || P_.name || 'manual') + '.step';
(function(){ var t = $('#ticks'); for (var j = 0; j < LAST; j++) t.appendChild(document.createElement('b')); })();
function go(d){ var n = current + d; if (n < 0) n = 0; if (n > LAST) n = 0; enter(n); }
$('#prev').addEventListener('click', function(){ go(-1); });
$('#next').addEventListener('click', function(){ go(1); });
$('#replay').addEventListener('click', function(){ enter(current, true); });
document.addEventListener('keydown', function(e){ if ($('#overlay').classList.contains('on')){ if (e.key === 'Escape') closeOverlay(); return; } if (e.key === 'ArrowRight' || e.key === ' '){ e.preventDefault(); go(1); } if (e.key === 'ArrowLeft'){ e.preventDefault(); go(-1); } if (e.key === 'r') enter(current, true); });
(function(){ var t0 = null; var el = $('#sheet'); el.addEventListener('pointerdown', function(e){ t0 = {x: e.clientX, y: e.clientY, id: e.pointerId}; }, {passive: true});
  el.addEventListener('pointerup', function(e){ if (!t0 || e.pointerId !== t0.id) return; var dx = e.clientX - t0.x, dy = e.clientY - t0.y; t0 = null; if (Math.abs(dx) > 60 && Math.abs(dy) < 40) go(dx < 0 ? 1 : -1); }, {passive: true});
  el.addEventListener('pointercancel', function(){ t0 = null; }); })();

var drag = null;
canvas.addEventListener('pointerdown', function(e){ drag = {x: e.clientX, rot: rotUser}; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', function(e){ if (!drag) return; rotUser = Math.max(-0.9, Math.min(0.9, drag.rot + (e.clientX - drag.x) * 0.006)); });
canvas.addEventListener('pointerup', function(){ drag = null; }); canvas.addEventListener('pointercancel', function(){ drag = null; });

/* ---------- overlay, notes, app actions ---------- */
var overlay = $('#overlay');
function openOverlay(h, build){ $('#overlayH').textContent = h; var b = $('#overlayB'); b.innerHTML = ''; build(b); overlay.classList.add('on'); $('#overlayX').focus(); }
function closeOverlay(){ overlay.classList.remove('on'); }
$('#overlayX').addEventListener('click', closeOverlay);
overlay.addEventListener('click', function(e){ if (e.target === overlay) closeOverlay(); });
function toast(t){ var el = $('#toast'); el.textContent = t; el.classList.add('on'); setTimeout(function(){ el.classList.remove('on'); }, 1600); }
var notes = (OPTS.warnings || []).filter(function(w){ return w.level === 'check'; }).map(function(w){ return {t: w.text, check: true}; }).concat((SPEC.assumptions || []).map(function(a){ return {t: a}; }));
if (notes.length){ var nb = $('#notesBtn'); nb.hidden = false; nb.addEventListener('click', function(){ openOverlay('What to check against the paper manual', function(box){ var ul = document.createElement('ul'); notes.forEach(function(n){ var li = document.createElement('li'); li.textContent = n.t; if (n.check) li.className = 'check'; ul.appendChild(li); }); box.appendChild(ul); var p = document.createElement('p'); p.className = 'src'; p.textContent = 'Read from the uploaded manual by Claude. Sizes marked as estimates are approximate; the paper manual wins.'; box.appendChild(p); }); }); }
if (OPTS.downloadUrl){ var dl = $('#dlBtn'); dl.hidden = false; dl.href = OPTS.downloadUrl; dl.setAttribute('download', ''); }
if (OPTS.shareUrl){ var sb = $('#shareBtn'); sb.hidden = false; sb.addEventListener('click', function(){ var url = OPTS.shareUrl; if (navigator.share && matchMedia('(pointer: coarse)').matches){ navigator.share({title: document.title, url: url}).catch(function(){}); return; } (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function(){ toast('Link copied'); }, function(){ prompt('Copy this link', url); }); }); }
if (OPTS.homeUrl){ var hb = $('#homeBtn'); hb.hidden = false; hb.href = OPTS.homeUrl; }

function wake(){ if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').catch(function(){}); }
document.addEventListener('pointerdown', wake, {once: true}); document.addEventListener('visibilitychange', function(){ if (!document.hidden) wake(); });

function resize(){ var w = stage.clientWidth, h = stage.clientHeight; var ps = (h < 480 ? 84 : 104) + 'px'; planEl.style.width = ps; planEl.style.height = ps; renderer.setSize(w, h, false); frame(camT.c, camT.r); partsCue(); }
new ResizeObserver(resize).observe(stage);
var dTarget = new T.Vector3();
function loop(now){
  stepTweens(now);
  world.rotation.y = rotUser + (reduce ? 0 : 0.028 * Math.sin(now / 9000 * Math.PI * 2));
  world.updateMatrixWorld();
  planFrame.position.set(camT.c.x, planCam.position.y - 10, camT.c.z); planFrame.scale.set(camT.r * 0.8, 1, camT.r * 0.8);
  var w = stage.clientWidth, h = stage.clientHeight;
  renderer.shadowMap.needsUpdate = true;
  renderer.setViewport(0, 0, w, h); renderer.setScissorTest(false); renderer.setClearColor(0xffffff, 1); renderer.render(scene, camera);
  var PLAN_PX = planEl.clientWidth || 84; var px = w - PLAN_PX - 12, py = h - 52 - PLAN_PX;
  renderer.setScissorTest(true); renderer.setViewport(px, py, PLAN_PX, PLAN_PX); renderer.setScissor(px, py, PLAN_PX, PLAN_PX); renderer.setClearColor(0xf7f6f2, 1); renderer.clear(); renderer.render(scene, planCam);
  if (detail && bubbleK > 0.02){
    var D = bubble.clientWidth, dsz = Math.max(2, D * bubbleK); var cx = w - 12 - D / 2, cyy = 12 + D / 2; var bx = cx - dsz / 2, by = cyy - dsz / 2;
    dTarget.copy(detail.p).applyMatrix4(world.matrixWorld); detailCam.position.copy(dTarget).addScaledVector(detail.v || VIEW, 60); detailCam.lookAt(dTarget); var r = detail.r; detailCam.left = -r; detailCam.right = r; detailCam.top = r; detailCam.bottom = -r; detailCam.updateProjectionMatrix();
    renderer.setViewport(bx, by, dsz, dsz); renderer.setScissor(bx, by, dsz, dsz); renderer.setClearColor(0xffffff, 1); renderer.clear(); renderer.render(scene, detailCam);
    var s2 = project(detail.p, w, h); var ax = s2[0], ay = s2[1]; var bcx = cx, bcy = h - cyy; var ang = Math.atan2(ay - bcy, ax - bcx); var L = Math.hypot(ax - bcx, ay - bcy); var start = dsz / 2 + 1;
    leader.style.transform = 'translate(' + (bcx + Math.cos(ang) * start).toFixed(1) + 'px,' + (bcy + Math.sin(ang) * start).toFixed(1) + 'px) rotate(' + ang.toFixed(4) + 'rad)'; leader.style.width = Math.max(0, L - start - 9).toFixed(1) + 'px'; leader.style.opacity = bubbleK;
    ring.style.transform = 'translate(' + (ax - 9).toFixed(1) + 'px,' + (ay - 9).toFixed(1) + 'px)'; ring.style.opacity = bubbleK;
  }
  renderer.setScissorTest(false);
  placeLabels(w, h);
  requestAnimationFrame(loop);
}

var start = 0; try { start = Math.min(LAST, Math.max(0, parseInt(localStorage.getItem(storageKey) || '0', 10) || 0)); } catch (e) {}
if (hm) start = Math.min(LAST, Math.max(0, parseInt(hm[1], 10)));
VIEW.copy(CAMS[start].v); resize(); frame(CAMS[start].c, CAMS[start].r); setGroups(STATES[start]); enter(start);
requestAnimationFrame(loop);
window.UNFLAT_ENGINE = {go: function(i){ enter(Math.max(0, Math.min(LAST, i))); }, pages: LAST + 1,
  debug: function(){ return {cams: CAMS.map(function(c){ return {c: c.c.toArray().map(function(x){ return +x.toFixed(3); }), r: +c.r.toFixed(3)}; }), cam: {c: camT.c.toArray(), r: camT.r}}; }};
})();
