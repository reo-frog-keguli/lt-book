// 見開き5：積み木の城（生成モデル）。一度に置くと石のように砕けて転がり、砂になって消える。下から積み上げると立つ
import * as THREE from 'three'
import { lerp, clamp01 } from './util.js'
import { makeBlob } from './bot.js'

const CX = 0.86, CZ = -0.14, BASE = 0.1, HT = 1.1           // 城の中心、置く高さ、城の高さ
const TIERS = [0.4, 0.64, 0.86, 1.02]                        // 各段の上端（城の高さに対する割合）
const easeBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2) }

// 城を「石」に分ける準備：三角形ごとに、属する格子（＝石）の中心と乱数、三角形自身の重心と乱数を持たせる
// 長い辺を中点で割り続ける。壁の大きな1枚の面が、いくつもの石にまたがらないようにする
function subdivide(g, maxLen) {
  const P = g.attributes.position.array, U = g.attributes.uv ? g.attributes.uv.array : null, N = g.attributes.normal ? g.attributes.normal.array : null
  const tris = []
  for (let i = 0; i < P.length / 3; i += 3) {
    tris.push([0, 1, 2].map((k) => ({ p: [P[(i + k) * 3], P[(i + k) * 3 + 1], P[(i + k) * 3 + 2]], u: U ? [U[(i + k) * 2], U[(i + k) * 2 + 1]] : [0, 0], n: N ? [N[(i + k) * 3], N[(i + k) * 3 + 1], N[(i + k) * 3 + 2]] : [0, 1, 0] })))
  }
  const d2 = (a, b) => (a.p[0] - b.p[0]) ** 2 + (a.p[1] - b.p[1]) ** 2 + (a.p[2] - b.p[2]) ** 2
  const mid = (a, b) => ({ p: a.p.map((v, i) => (v + b.p[i]) / 2), u: a.u.map((v, i) => (v + b.u[i]) / 2), n: a.n.map((v, i) => (v + b.n[i]) / 2) })
  const out = [], m2 = maxLen * maxLen
  while (tris.length) {
    const t = tris.pop()
    const e = [d2(t[0], t[1]), d2(t[1], t[2]), d2(t[2], t[0])]
    const k = e[0] >= e[1] && e[0] >= e[2] ? 0 : e[1] >= e[2] ? 1 : 2
    if (e[k] <= m2 || out.length + tris.length > 120000) { out.push(t); continue }
    const a = t[k], b = t[(k + 1) % 3], c = t[(k + 2) % 3], m = mid(a, b)
    tris.push([a, m, c], [m, b, c])
  }
  const n = out.length * 3, p2 = new Float32Array(n * 3), u2 = new Float32Array(n * 2), n2 = new Float32Array(n * 3)
  out.forEach((t, i) => t.forEach((v, k) => { p2.set(v.p, (i * 3 + k) * 3); u2.set(v.u, (i * 3 + k) * 2); n2.set(v.n, (i * 3 + k) * 3) }))
  const o = new THREE.BufferGeometry()
  o.setAttribute('position', new THREE.BufferAttribute(p2, 3)); o.setAttribute('uv', new THREE.BufferAttribute(u2, 2)); o.setAttribute('normal', new THREE.BufferAttribute(n2, 3))
  o.computeBoundingBox()
  return o
}

// 城を6〜8個の「ブロック」に分ける。モデルが積み木ごとの部品（つながっていない面のかたまり）でできていれば、
// 部品を近いもの同士でまとめてブロックにする。ひとかたまりのモデルなら、上下・左右・前後の8つに切り分ける
function chunked(src) {
  let mesh = null
  src.traverse((o) => { if (o.isMesh && !mesh) mesh = o })
  mesh.updateWorldMatrix(true, false)
  let g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).toNonIndexed()
  g.computeBoundingBox()
  const bb = g.boundingBox, size = bb.getSize(new THREE.Vector3()), maxDim = Math.max(size.x, size.y, size.z)
  g = subdivide(g, maxDim * 0.07)          // 砂になるときの粒を細かくするため
  const pos = g.attributes.position, n = pos.count, nt = n / 3
  // --- つながった面のかたまり（部品）を見つける
  const Q = 4000 / maxDim, ids = new Map(), vid = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    const k = Math.round(pos.getX(i) * Q) + ',' + Math.round(pos.getY(i) * Q) + ',' + Math.round(pos.getZ(i) * Q)
    let id = ids.get(k); if (id === undefined) { id = ids.size; ids.set(k, id) }
    vid[i] = id
  }
  const par = new Int32Array(ids.size).map((_, i) => i)
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x] } return x }
  for (let t = 0; t < nt; t++) { const r = find(vid[t * 3]); par[find(vid[t * 3 + 1])] = r; par[find(vid[t * 3 + 2])] = r }
  const comps = new Map()
  const triC = new Float32Array(nt * 3)
  for (let t = 0; t < nt; t++) {
    const mx = (pos.getX(t * 3) + pos.getX(t * 3 + 1) + pos.getX(t * 3 + 2)) / 3, my = (pos.getY(t * 3) + pos.getY(t * 3 + 1) + pos.getY(t * 3 + 2)) / 3, mz = (pos.getZ(t * 3) + pos.getZ(t * 3 + 1) + pos.getZ(t * 3 + 2)) / 3
    triC.set([mx, my, mz], t * 3)
    const r = find(vid[t * 3])
    let c = comps.get(r); if (!c) { c = { tris: [], sx: 0, sy: 0, sz: 0 }; comps.set(r, c) }
    c.tris.push(t); c.sx += mx; c.sy += my; c.sz += mz
  }
  const parts = [...comps.values()].map((c) => ({ tris: c.tris, x: c.sx / c.tris.length, y: c.sy / c.tris.length, z: c.sz / c.tris.length }))
  const big = parts.filter((p) => p.tris.length > nt * 0.01)
  const block = new Int32Array(nt)
  let K
  if (big.length >= 6) {
    // 部品をまとめる：遠いもの同士を核に選び、近い核へ寄せる（高さの違いは少し重く見る）
    K = Math.min(8, big.length)
    const d2 = (p, q) => (p.x - q.x) ** 2 + ((p.y - q.y) * 1.4) ** 2 + (p.z - q.z) ** 2
    let cen = [big.reduce((a, p) => (p.y < a.y ? p : a))]
    while (cen.length < K) cen.push(big.reduce((a, p) => { const d = Math.min(...cen.map((c) => d2(p, c))); return d > a.d ? { p, d } : a }, { p: big[0], d: -1 }).p)
    cen = cen.map((c) => ({ x: c.x, y: c.y, z: c.z }))
    for (let it = 0; it < 10; it++) {
      const acc = cen.map(() => ({ x: 0, y: 0, z: 0, w: 0 }))
      for (const p of parts) { let bi = 0, bd = 1e9; cen.forEach((c, i) => { const d = d2(p, c); if (d < bd) { bd = d; bi = i } }); p.b = bi; const w = p.tris.length; acc[bi].x += p.x * w; acc[bi].y += p.y * w; acc[bi].z += p.z * w; acc[bi].w += w }
      cen = cen.map((c, i) => (acc[i].w ? { x: acc[i].x / acc[i].w, y: acc[i].y / acc[i].w, z: acc[i].z / acc[i].w } : c))
    }
    for (const p of parts) for (const t of p.tris) block[t] = p.b
  } else {
    K = 8
    const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, cy = bb.min.y + size.y * 0.45
    for (let t = 0; t < nt; t++) block[t] = (triC[t * 3] > cx ? 1 : 0) + (triC[t * 3 + 2] > cz ? 2 : 0) + (triC[t * 3 + 1] > cy ? 4 : 0)
  }
  // --- ブロックごとの外形（中心と大きさ）
  const box = Array.from({ length: K }, () => new THREE.Box3())
  const v = new THREE.Vector3()
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) box[block[t]].expandByPoint(v.fromBufferAttribute(pos, t * 3 + k))
  const cen = new Float32Array(n * 3), seed = new Float32Array(n), rad = new Float32Array(n), tri = new Float32Array(n * 3), ts = new Float32Array(n)
  const rnd = (x, y, z) => Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) % 1
  const bc = box.map((b) => (b.isEmpty() ? new THREE.Vector3() : b.getCenter(new THREE.Vector3())))
  const br = box.map((b) => { if (b.isEmpty()) return 1; const s = b.getSize(new THREE.Vector3()); return (s.x + s.y + s.z) / 6 })
  for (let t = 0; t < nt; t++) {
    const bi = block[t], s2 = rnd(triC[t * 3] * 31, triC[t * 3 + 1] * 17, triC[t * 3 + 2] * 23)
    for (let k = 0; k < 3; k++) {
      const i = t * 3 + k
      cen.set([bc[bi].x, bc[bi].y, bc[bi].z], i * 3); seed[i] = rnd(bi + 1, bi * 3 + 2, 5); rad[i] = br[bi]
      tri.set([triC[t * 3], triC[t * 3 + 1], triC[t * 3 + 2]], i * 3); ts[i] = s2
    }
  }
  g.setAttribute('aCen', new THREE.BufferAttribute(cen, 3))
  // 最初に「ボロっ」と落ちるブロック：いちばん上と、上の方のもう1つ
  const order = bc.map((c, i) => i).filter((i) => !box[i].isEmpty()).sort((a, b) => bc[b].y - bc[a].y)
  const earlySet = new Set([order[0], order[2] ?? order[1]])
  const early = new Float32Array(n)
  for (let t = 0; t < nt; t++) if (earlySet.has(block[t])) for (let k = 0; k < 3; k++) early[t * 3 + k] = 1
  g.setAttribute('aEarly', new THREE.BufferAttribute(early, 1))
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  g.setAttribute('aRad', new THREE.BufferAttribute(rad, 1))
  g.setAttribute('aTri', new THREE.BufferAttribute(tri, 3))
  g.setAttribute('aTs', new THREE.BufferAttribute(ts, 1))
  window.__castle = { parts: parts.length, bigParts: big.length, blocks: K, tris: nt }
  return { g, bb, size, map: mesh.material }
}

// ブロックひとつの動き：落ちて床で弾み、外へごろんごろんと転がって、面を下にして止まる。gC＝中心、gR＝回転
const CRUMBLE = /* glsl */ `
  attribute vec3 aCen, aTri; attribute float aSeed, aTs, aRad, aEarly;
  uniform float uT, uT2, uDust, uFloor, uH; uniform vec2 uCtr;
  vec3 gC; mat3 gR;
  mat3 rotAx(vec3 a, float g){ float c=cos(g), s=sin(g), o=1.-c;
    return mat3(o*a.x*a.x+c, o*a.x*a.y+a.z*s, o*a.z*a.x-a.y*s,  o*a.x*a.y-a.z*s, o*a.y*a.y+c, o*a.y*a.z+a.x*s,  o*a.z*a.x+a.y*s, o*a.y*a.z-a.x*s, o*a.z*a.z+c); }
  void crumble(){
    gC=aCen; gR=mat3(1.);
    float tt=aEarly>.5?uT:uT2;                                   // 先に落ちるブロックと、残りのブロックで時計が別
    if(tt<=0.) return;
    float h0=aCen.y-uFloor;
    float t=max(0., tt-aSeed*.22*(1.-aEarly));
    vec2 dir=normalize(aCen.xz-uCtr+vec2(cos(aSeed*40.),sin(aSeed*40.))*uH*.2);
    float g=uH*6.5;
    float th=sqrt(2.*max(h0-aRad,0.)/g);                        // 床に届く時刻
    float v=uH*(.2+aSeed*.3+h0/uH*.5);                          // 高いブロックほど遠くへ
    float sEnd=v/1.5, pr=1.-exp(-1.5*t), s=sEnd*pr;             // 転がりながら減速して止まる
    float ang=max(1.,floor(sEnd/aRad*.55+.5))*1.5708*pr;        // 90度きざみで止まる＝面を下にして落ち着く
    float y;
    if(t<th) y=aCen.y-.5*g*t*t;
    else { float tb=t-th; y=uFloor+aRad*(1.+.3*abs(sin(ang*2.)))+abs(sin(tb*(6.+aSeed*3.)))*h0*.16*exp(-tb*3.2); }   // 角で持ち上がりながら転がる
    gC=vec3(aCen.x+dir.x*s, y, aCen.z+dir.y*s);
    gR=rotAx(normalize(vec3(dir.y,0.,-dir.x)), ang);
  }
  // 砂になって宙へ：三角形ごとに少しずつ遅れて、縮みながら舞い上がる
  float dustOf(){ return clamp(uDust*1.7-aTs*.7, 0., 1.); }
  vec3 dustMove(vec3 tc, float d){
    return tc+vec3(sin(aTs*61.+d*4.)*.16, (.3+aTs*.6)*d, cos(aTs*47.+d*3.)*.16)*d*uH; }
`

export function makePopup(castleSrc, makeBot) {
  const group = new THREE.Group()
  group.visible = false
  const { g, bb, size, map } = chunked(castleSrc)
  const k = HT / size.y
  const u = {
    uT: { value: 0 }, uT2: { value: 0 }, uDust: { value: 0 }, uFloor: { value: bb.min.y }, uH: { value: size.y },
    uCtr: { value: new THREE.Vector2((bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2) }, uCut: { value: bb.max.y + 1 },
  }
  const mat = map.clone()
  mat.side = THREE.DoubleSide
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${CRUMBLE}\nvarying float vY;`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\ncrumble(); objectNormal=gR*objectNormal;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vY=position.y;
        transformed=gC+gR*(transformed-aCen);
        if(uDust>0.){ float d=dustOf(); vec3 tc=gC+gR*(aTri-aCen); transformed=dustMove(tc,d)+(transformed-tc)*(1.-d); }`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCut; varying float vY;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif(vY>uCut) discard;')   // 積み上げ：この高さより上は、まだ無い
  }
  mat.customProgramCacheKey = () => 'castle5'
  const castle = new THREE.Mesh(g, mat)
  castle.castShadow = true; castle.frustumCulled = false
  // 砂粒：三角形の重心に1粒ずつ。石が縮むのと入れ替わりに現れ、舞い上がって消える
  const grains = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { ...u, uPx: { value: 600 } },
    vertexShader: /* glsl */ `${CRUMBLE}
      uniform float uPx; varying float vA; varying float vS;
      void main(){ crumble(); float d=dustOf();
        vec3 p=dustMove(gC+gR*(aTri-aCen), d);
        vA=smoothstep(0.,.25,d)*(1.-smoothstep(.55,1.,d))*step(.001,uDust); vS=aTs;
        vec4 mv=modelViewMatrix*vec4(p,1.);
        gl_PointSize=uPx*(.006+.008*aTs)/(-mv.z); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: /* glsl */ `varying float vA; varying float vS;
      void main(){ if(vA<.01) discard; float d=length(gl_PointCoord-.5); if(d>.5) discard;
        gl_FragColor=vec4(mix(vec3(.62,.48,.30),vec3(.82,.70,.50),vS), vA*.9);
        #include <tonemapping_fragment>
        #include <colorspace_fragment> }`,
  }))
  grains.frustumCulled = false
  const inner = new THREE.Group(); inner.add(castle, grains)
  inner.scale.setScalar(k)
  inner.position.set(-(bb.min.x + bb.max.x) / 2 * k, -bb.min.y * k, -(bb.min.z + bb.max.z) / 2 * k)
  const stage = new THREE.Group(); stage.position.set(CX, BASE, CZ); stage.add(inner)
  const stageShadow = makeBlob(Math.max(size.x, size.z) * k * 1.05); stageShadow.position.y = -0.015; stageShadow.userData.dark = 1.0; stageShadow.userData.len = HT * 0.55; stage.add(stageShadow)
  stage.visible = false
  group.add(stage)
  const yOf = (f) => bb.min.y + size.y * f                    // 城の高さの割合 → モデルの高さ

  // 品質ループ：城の頂上のまわりを回る金の輪と矢じり
  const loop = new THREE.Group(); loop.position.set(CX, BASE + HT * 0.9, CZ); group.add(loop)
  const gold = new THREE.MeshStandardMaterial({ color: 0xdcb65e, roughness: 0.25, metalness: 1 })
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.017, 10, 56, Math.PI * 1.72), gold); ring.rotation.x = -Math.PI / 2
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 12), gold); tip.position.set(0.26, 0, 0); tip.rotation.x = Math.PI / 2
  loop.add(ring, tip); loop.scale.setScalar(0.001)
  for (const o of [ring, tip]) o.castShadow = true

  // 一緒に作るロボット（骨格つき）。足もとに影
  const bot = makeBot(0.5, { shadow: 0.34 })
  const HOME = new THREE.Vector3(CX - 0.6, BASE - 0.04, CZ + 0.2)
  bot.group.position.copy(HOME); bot.group.rotation.y = 0.5
  bot.group.scale.setScalar(0.001)
  group.add(bot.group)
  let mode = 'idle', walkA = 2.3, cutNow = bb.max.y + 1, tA = 0

  return {
    group, bot,
    /** ロボットが現れる */
    rise(k2) { bot.group.scale.setScalar(Math.max(0.001, clamp01(k2))) },
    /** 完成形の一発置き（前半）。k: 0→1（落下→着地→ぐらつき→一部のブロックだけがボロっと落ちる）。着地でロボットが転ぶ */
    demoA(kk, dur = 3) {
      stage.visible = kk > 0
      u.uCut.value = bb.max.y + 1; u.uT2.value = 0; u.uDust.value = 0
      const fall = clamp01(kk / 0.22), wob = clamp01((kk - 0.22) / 0.25)
      stage.position.set(CX, BASE + (1 - fall * fall) * 2.6, CZ)
      const sq = fall >= 1 ? Math.max(0, 0.12 - wob) : 0
      stage.scale.set(1 + sq, 1 - sq, 1 + sq)
      const w = Math.sin(clamp01((kk - 0.22) / 0.4) * Math.PI)
      stage.rotation.set(Math.cos(wob * 17) * 0.05 * w, 0, Math.sin(wob * 21) * 0.1 * w)
      tA = Math.max(0, kk - 0.42) * dur
      u.uT.value = tA
      stageShadow.material.opacity = fall
      if (fall >= 1 && mode !== 'fallen') { mode = 'fallen'; bot.play('fall', { fade: 0.1 }) }
    },
    /** 後半。k: 0→1（残りのブロックがすべて崩れて転がる→砂になって宙へ消える） */
    demoB(kk, dur = 4.2) {
      stage.visible = kk < 1
      stage.rotation.set(0, 0, 0)
      u.uT.value = tA + kk * dur; u.uT2.value = kk * dur
      const dust = clamp01((kk - 0.6) / 0.4)
      u.uDust.value = dust
      stageShadow.material.opacity = (1 - clamp01(kk / 0.25) * 0.55) * (1 - dust)
    },
    /** 立て直す準備：城を消し、ロボットを起こして歩かせる */
    beginBuild() {
      u.uT.value = 0; u.uT2.value = 0; u.uDust.value = 0; cutNow = bb.min.y - 0.01; u.uCut.value = cutNow
      stage.visible = true; stage.position.set(CX, BASE, CZ); stage.scale.setScalar(1); stage.rotation.set(0, 0, 0)
      stageShadow.material.opacity = 0
      mode = 'walk'; bot.play('walk', { fade: 0.5 })
    },
    /** i段目を積む（k: 0→1）。少し跳ねて収まる */
    tier(i, kk) {
      const from = i ? TIERS[i - 1] : 0, e = easeBack(clamp01(kk))
      cutNow = yOf(lerp(from, TIERS[i], Math.min(1, e)))
      u.uCut.value = cutNow
      stage.scale.set(1, 1 + Math.sin(clamp01(kk) * Math.PI) * 0.05, 1)
      stageShadow.material.opacity = Math.max(stageShadow.material.opacity, clamp01(kk) * (0.55 + 0.15 * i))
    },
    /** 品質ループの輪が回りはじめ、ロボットが立ち止まって喜ぶ */
    loop(kk) {
      loop.scale.setScalar(Math.max(0.001, easeBack(clamp01(kk))))
      if (kk > 0.05 && mode !== 'cheer') { mode = 'cheer'; bot.play('cheer', { fade: 0.4 }) }
    },
    /** 片づけ：城は砂になって宙へ消え、輪とロボットは小さくなって消える */
    fold(kk) {
      const s = Math.max(0.001, 1 - kk)
      u.uDust.value = Math.max(u.uDust.value, kk)
      stageShadow.material.opacity = Math.min(stageShadow.material.opacity, 1 - kk)
      loop.scale.setScalar(Math.min(loop.scale.x, s)); bot.group.scale.setScalar(Math.min(bot.group.scale.x, s))
    },
    update(t, dt, pxH = 600) {
      grains.material.uniforms.uPx.value = pxH
      loop.rotation.y = -t * 1.5
      if (mode === 'walk') {
        // 積んでいる城のまわりを、ぐるぐる歩く
        walkA += dt * 0.7
        const r = 0.62
        bot.group.position.set(CX + Math.cos(walkA) * r, BASE - 0.04, CZ + Math.sin(walkA) * r * 0.86)
        bot.group.rotation.y = -walkA      // 進む向き（円の接線）を向く
      } else if (mode === 'cheer') {
        bot.group.rotation.y = lerp(bot.group.rotation.y, Math.atan2(0.3, 1), 1 - Math.exp(-dt * 4))   // 手前を向いて喜ぶ
        bot.group.position.lerp(HOME, 1 - Math.exp(-dt * 2.5))                                          // 城の手前へ戻る
      }
      bot.update(dt)
    },
  }
}
