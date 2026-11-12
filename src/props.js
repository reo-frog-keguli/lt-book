// 机（ベージュのコンクリート）・PC・本（黒革に金の箔押し。コードで作る立体）
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { NOISE, BOOK } from './util.js'
import { BOOKDEF } from './spread1.js'
export { BOOK }

// ---------- 机：左官仕上げのコンクリート（ベージュ） ----------
export function makeDesk() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 })
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWp=(modelMatrix*vec4(transformed,1.)).xyz;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWp;\n${NOISE}
vec3 concrete(vec2 p){
  vec2 q=p*.2; vec2 w=q+1.5*vec2(fbm(q*1.1+2.),fbm(q*1.1+8.));
  float sweep=fbm(vec2(w.x*1.2+w.y*2.6,w.y*.5-w.x*.3)*1.5);       // こて跡の大きな流れ
  float mott=fbm(p*.8+11.);
  float grain=fbm(p*38.)*.6+h21(floor(p*420.))*.4;                 // 砂粒のざらつき
  float streak=fbm(vec2(w.x*5.+w.y*11.,w.y*1.4-w.x)*1.2);          // こての細い筋
  vec3 base=mix(vec3(.74,.67,.56),vec3(.89,.83,.73),sweep);
  base*=.92+.14*mott; base*=.93+.11*grain; base*=.95+.09*streak;
  return s2l(base); }`)
      .replace('#include <map_fragment>', 'diffuseColor.rgb=concrete(vWp.xz);')
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), mat)
  m.rotation.x = -Math.PI / 2
  m.receiveShadow = true
  return m
}

// ---------- PC（黒・架空メーカー） ----------
export function makeLaptop(screenTex, aspect) {
  const g = new THREE.Group()
  const W = 3.3, SWd = 3.12, SHt = SWd / aspect, D = SHt + 0.2
  const shell = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.36, metalness: 0.75 })
  const matte = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.7, metalness: 0.2 })
  const base = new THREE.Mesh(new RoundedBoxGeometry(W, 0.09, D, 4, 0.04), shell)
  base.position.y = 0.045
  base.castShadow = base.receiveShadow = true
  g.add(base)
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.5, D * 0.5), matte)
  deck.rotation.x = -Math.PI / 2; deck.position.set(0, 0.0915, -D * 0.16)
  g.add(deck)
  const cols = 14, rows = 5, kw = (W - 0.62) / cols, kd = (D * 0.46) / rows
  const keys = new THREE.InstancedMesh(new RoundedBoxGeometry(kw * 0.84, 0.025, kd * 0.82, 2, 0.008),
    new THREE.MeshStandardMaterial({ color: 0x1d1d20, roughness: 0.55, metalness: 0.3 }), cols * rows)
  const mtx = new THREE.Matrix4()
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    mtx.setPosition((c - (cols - 1) / 2) * kw, 0.1, -D * 0.16 + (r - (rows - 1) / 2) * kd)
    keys.setMatrixAt(r * cols + c, mtx)
  }
  keys.castShadow = true
  g.add(keys)
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(1.05, D * 0.24), new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.3, metalness: 0.5 }))
  pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.0915, D * 0.3)
  g.add(pad)
  const lid = new THREE.Group()
  lid.position.set(0, 0.095, -D / 2)
  const lidBody = new THREE.Mesh(new RoundedBoxGeometry(W, 0.06, D, 4, 0.03), shell)
  lidBody.position.set(0, 0.03, D / 2)
  lidBody.castShadow = true
  lid.add(lidBody)
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SWd, SHt), screenMat)
  screen.rotation.x = Math.PI / 2
  screen.position.set(0, -0.001, D / 2)
  lid.add(screen)
  const bezel = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.02, D - 0.02), new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.4 }))
  bezel.rotation.x = Math.PI / 2; bezel.position.set(0, -0.0005, D / 2)
  lid.add(bezel)
  const logo = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.16, 6), new THREE.MeshStandardMaterial({ color: 0x8a8a92, roughness: 0.25, metalness: 1 }))
  logo.rotation.x = -Math.PI / 2; logo.position.set(0, 0.0605, D / 2)
  lid.add(logo)
  g.add(lid)
  const setLid = (deg) => { lid.rotation.x = -THREE.MathUtils.degToRad(deg) }
  setLid(104)
  return { group: g, lid, screen, screenMat, setLid, SHt, SWd }
}

// ---------- 本 ----------
const GOLD = '#dcb65e'
function star4(k, x, y, r) {   // 4つ角のきらめき
  k.beginPath()
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, rr = i % 2 ? r * 0.22 : r; k[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr) }
  k.closePath(); k.fill()
}
function moon(k, x, y, r, rot = 0.6) {
  k.save(); k.translate(x, y); k.rotate(rot)
  k.beginPath(); k.arc(0, 0, r, 0.35 * Math.PI, 1.65 * Math.PI); k.arc(r * 0.42, 0, r * 0.8, 1.58 * Math.PI, 0.42 * Math.PI, true); k.closePath(); k.fill()
  k.restore()
}
function coverArt() {
  const W = 1024, Hh = 1320
  const c = document.createElement('canvas'); c.width = W; c.height = Hh
  const x = c.getContext('2d')
  const m = document.createElement('canvas'); m.width = W; m.height = Hh
  const g = m.getContext('2d')
  // 黒いスエード調の革
  x.fillStyle = '#0c0b0d'; x.fillRect(0, 0, W, Hh)
  for (let i = 0; i < 16000; i++) {
    x.fillStyle = `rgba(${Math.random() < 0.5 ? '46,44,50' : '0,0,0'},${Math.random() * 0.16})`
    x.beginPath(); x.ellipse(Math.random() * W, Math.random() * Hh, 0.6 + Math.random() * 2.4, 0.6 + Math.random() * 1.6, Math.random() * 3, 0, 7); x.fill()
  }
  g.fillStyle = '#000'; g.fillRect(0, 0, W, Hh)
  const R = (s) => { let a = s; return () => { a = (a * 9301 + 49297) % 233280; return a / 233280 } }
  const draw = (fn) => { for (const [k, col] of [[x, GOLD], [g, '#fff']]) { k.strokeStyle = col; k.fillStyle = col; k.lineCap = 'round'; k.lineJoin = 'round'; fn(k, R(7)) } }
  draw((k, rnd) => {
    // 点線の縁取り（四隅は内側へえぐる）
    const M = 62, cut = 120
    const pts = []
    const seg = (x0, y0, x1, y1) => { const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 13); for (let i = 0; i < n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]) }
    seg(M + cut, M, W - M - cut, M); seg(W - M, M + cut, W - M, Hh - M - cut); seg(W - M - cut, Hh - M, M + cut, Hh - M); seg(M, Hh - M - cut, M, M + cut)
    for (const [px, py] of pts) { k.beginPath(); k.arc(px, py, 2.1, 0, 7); k.fill() }
    k.lineWidth = 2.2
    for (const [cx, cy, sx, sy] of [[M, M, 1, 1], [W - M, M, -1, 1], [M, Hh - M, 1, -1], [W - M, Hh - M, -1, -1]]) {
      // 隅の飾り：弧と放射線、小さな目
      k.save(); k.translate(cx, cy); k.scale(sx, sy)
      k.beginPath(); k.arc(0, 0, cut, 0, Math.PI / 2); k.stroke()
      k.beginPath(); k.arc(0, 0, cut - 16, 0, Math.PI / 2); k.stroke()
      for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); k.beginPath(); k.moveTo(Math.cos(a) * 34, Math.sin(a) * 34); k.lineTo(Math.cos(a) * (cut - 24), Math.sin(a) * (cut - 24)); k.stroke() }
      k.beginPath(); k.arc(0, 0, 30, 0, Math.PI / 2); k.stroke()
      star4(k, cut + 26, 22, 9); star4(k, 22, cut + 26, 9)
      k.restore()
    }
    // 星座盤
    k.save(); k.translate(W / 2, 420)
    k.lineWidth = 3
    for (const r of [214, 204, 150, 74]) { k.beginPath(); k.arc(0, 0, r, 0, 7); k.stroke() }
    k.lineWidth = 2
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      k.beginPath(); k.moveTo(Math.cos(a) * 74, Math.sin(a) * 74); k.lineTo(Math.cos(a) * 204, Math.sin(a) * 204); k.stroke()
      // 区画ごとの小さな星座
      const am = a + Math.PI / 12, n = 3 + ((rnd() * 3) | 0)
      let px = null, py = null
      for (let j = 0; j < n; j++) {
        const rr = 96 + rnd() * 92, aa = am + (rnd() - 0.5) * 0.34, qx = Math.cos(aa) * rr, qy = Math.sin(aa) * rr
        if (px !== null) { k.beginPath(); k.moveTo(px, py); k.lineTo(qx, qy); k.stroke() }
        k.beginPath(); k.arc(qx, qy, 3.4, 0, 7); k.fill()
        px = qx; py = qy
      }
    }
    for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2; k.beginPath(); k.moveTo(Math.cos(a) * 150, Math.sin(a) * 150); k.lineTo(Math.cos(a) * (i % 5 ? 142 : 134), Math.sin(a) * (i % 5 ? 142 : 134)); k.stroke() }
    moon(k, -6, 0, 46, 0.5)
    star4(k, 24, -14, 11); star4(k, 34, 16, 7); star4(k, 14, 22, 5)
    k.restore()
    // 散らした星と月
    for (const [sx, sy, r] of [[168, 190, 15], [846, 250, 18], [140, 560, 12], [884, 600, 14], [230, 700, 9], [790, 740, 11], [512, 130, 13], [330, 110, 7], [700, 120, 8], [512, 700, 10]]) star4(k, sx, sy, r)
    moon(k, 210, 318, 20, 0.2); moon(k, 836, 438, 16, 2.6); moon(k, 512, 1210, 20, -1.2)
    for (let i = 0; i < 70; i++) { k.beginPath(); k.arc(110 + rnd() * 804, 110 + rnd() * 1100, 1.6 + rnd() * 1.6, 0, 7); k.fill() }
    // 一行のことば
    k.textAlign = 'center'
    k.font = 'italic 500 50px "Cormorant Garamond", serif'
    k.fillText('We write our own page,', W / 2, 960)
    k.fillText('one day at a time', W / 2, 1024)
  })
  // 古本らしい、見えるか見えないか程度の汚れ：薄い手あか、細い擦り傷、縁の白っぽい擦れ
  for (let i = 0; i < 26; i++) {
    const gx = Math.random() * W, gy = Math.random() * Hh, r = 60 + Math.random() * 160
    const gr = x.createRadialGradient(gx, gy, 0, gx, gy, r)
    gr.addColorStop(0, `rgba(150,140,128,${0.012 + Math.random() * 0.022})`); gr.addColorStop(1, 'rgba(150,140,128,0)')
    x.fillStyle = gr; x.fillRect(gx - r, gy - r, r * 2, r * 2)
  }
  for (let i = 0; i < 340; i++) {
    const e = Math.random() < 0.6
    let px = Math.random() * W, py = Math.random() * Hh
    if (e) { const side = (Math.random() * 4) | 0, d = Math.pow(Math.random(), 2.4) * 46; if (side === 0) py = d; else if (side === 1) py = Hh - d; else if (side === 2) px = d; else px = W - d }
    x.strokeStyle = `rgba(190,180,168,${0.02 + Math.random() * (e ? 0.09 : 0.035)})`; x.lineWidth = 0.5 + Math.random() * 1.1
    const an = Math.random() * 6.28, l = 6 + Math.random() * (e ? 22 : 70)
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(an) * l, py + Math.sin(an) * l); x.stroke()
  }
  // スエードの毛羽（凹凸）。箔押しは少しへこむ
  const bc = document.createElement('canvas'); bc.width = 512; bc.height = 660
  const bb = bc.getContext('2d'); bb.fillStyle = '#808080'; bb.fillRect(0, 0, 512, 660)
  for (let i = 0; i < 30000; i++) { const v = (Math.random() * 255) | 0; bb.fillStyle = `rgba(${v},${v},${v},.2)`; bb.fillRect(Math.random() * 512, Math.random() * 660, 1 + Math.random() * 2, 1 + Math.random() * 2) }
  bb.globalCompositeOperation = 'multiply'; bb.filter = 'invert(1)'; bb.globalAlpha = 0.5; bb.drawImage(m, 0, 0, 512, 660)
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8
  const mask = new THREE.CanvasTexture(m); mask.anisotropy = 8
  const bump = new THREE.CanvasTexture(bc)
  const grainC = document.createElement('canvas'); grainC.width = grainC.height = 256
  const gg = grainC.getContext('2d'); gg.fillStyle = '#808080'; gg.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 9000; i++) { const v = (Math.random() * 255) | 0; gg.fillStyle = `rgba(${v},${v},${v},.25)`; gg.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2) }
  const grain = new THREE.CanvasTexture(grainC); grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.repeat.set(5, 5)
  return { map, mask, bump, grain }
}

/** 表紙の板：外側の角だけ丸い。x: 0→w（のど→小口）、厚みは -t〜0 */
function coverBoard(w, d, t, r, sign) {
  const s = new THREE.Shape()
  s.moveTo(0, -d / 2); s.lineTo(w - r, -d / 2); s.quadraticCurveTo(w, -d / 2, w, -d / 2 + r)
  s.lineTo(w, d / 2 - r); s.quadraticCurveTo(w, d / 2, w - r, d / 2); s.lineTo(0, d / 2); s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 8 })
  g.rotateX(Math.PI / 2)            // 平面をxzへ、厚みを下向きへ
  if (sign < 0) g.rotateY(Math.PI)  // 左半分は鏡像
  return g
}

export function makeBook(mats) {
  const { PW, PH, H, COVER } = BOOK
  const RIM = 0.09                   // ページの外に見える表紙の縁
  const CW = PW + RIM, CD = PH + RIM * 2
  const root = new THREE.Group()
  const art = coverArt()
  const leather = new THREE.MeshPhysicalMaterial({ color: 0x0e0d10, roughness: 0.52, metalness: 0.02, bumpMap: art.grain, bumpScale: 0.6, clearcoat: 0.18, clearcoatRoughness: 0.3, envMapIntensity: 0.22 })
  const coverMat = new THREE.MeshPhysicalMaterial({
    map: art.map, roughness: 0.55, metalnessMap: art.mask, metalness: 1, emissive: 0xe0b45c, emissiveMap: art.mask, emissiveIntensity: 0.1,
    bumpMap: art.bump, bumpScale: 0.9, clearcoat: 0.22, clearcoatRoughness: 0.28, envMapIntensity: 0.3,
  })
  const gold = new THREE.MeshStandardMaterial({ color: 0xdcb65e, roughness: 0.16, metalness: 1, envMapIntensity: 1.8 })
  // 小口：白めの綺麗な紙。1枚ずつの紙の筋が見える
  const edge = new THREE.MeshStandardMaterial({ color: 0xf1ece0, roughness: 0.9, metalness: 0 })
  edge.onBeforeCompile = (s) => {
    s.uniforms.uBulge = mats.shared.uBulge
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLp;\n${BOOKDEF}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLp=position; transformed=bookDeform(transformed);')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLp;\n${NOISE}`)
      .replace('#include <map_fragment>', `
        float ln=h21(vec2(floor(vLp.y*460.),3.)), ln2=h21(vec2(floor(vLp.y*80.),7.));
        diffuseColor.rgb*=(.84+.16*ln)*(.93+.07*ln2);
        diffuseColor.rgb*=.93+.07*vn(vec2(vLp.x*4.+vLp.z*4.,vLp.y*30.));`)
  }
  const half = (sign) => {
    const g = new THREE.Group()
    const cover = new THREE.Mesh(coverBoard(CW, CD, COVER, 0.085, sign), leather)
    cover.position.y = -H + COVER
    cover.castShadow = cover.receiveShadow = true
    const bg = new THREE.BoxGeometry(PW, H - COVER, PH, 32, 4, 1)
    bg.translate(sign * PW / 2, -(H - COVER) / 2, 0)
    const block = new THREE.Mesh(bg, [edge, edge, edge, edge, edge, edge])
    block.castShadow = true
    const pg = new THREE.PlaneGeometry(PW, PH, 32, 1)
    const uv = pg.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setX(i, sign < 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5)
    pg.rotateX(-Math.PI / 2); pg.translate(sign * PW / 2, 0.004, 0)
    const page = new THREE.Mesh(pg, sign < 0 ? mats.pageL : mats.pageR)
    page.frustumCulled = false
    g.add(cover, block, page)
    return { g, page, block }
  }
  // 原点＝のど（背の線）で、ページ面の高さ
  const pivot = new THREE.Group(); pivot.position.y = H
  const L = half(-1), R = half(1)
  // 表紙の箔押し（左半分の裏＝閉じたとき上を向く面）
  const artPlane = new THREE.Mesh(new THREE.PlaneGeometry(CW - 0.02, CD - 0.02), coverMat)
  artPlane.rotation.set(Math.PI / 2, 0, Math.PI)
  artPlane.position.set(-CW / 2, -H - 0.0075, 0)
  L.g.add(artPlane)
  const spine = new THREE.Group()
  const sp = new THREE.Mesh(new RoundedBoxGeometry(2 * H + 0.05, 0.035, CD, 3, 0.016), leather)
  sp.castShadow = true
  spine.add(sp)
  const spineArm = new THREE.Group(); spineArm.add(spine)
  // 留め帯と星の留め金：2か所の蝶番で開く。A＝小口の下端、B＝帯の折れ目（小口の上端）
  const sw = 0.3, SIDE = 2 * H + 0.04
  const strap = new THREE.Group()                      // 蝶番A
  strap.position.set(CW + 0.024, -H, 0)        // 帯の内側の面が、表紙の縁に触れる位置
  const side = new THREE.Mesh(new RoundedBoxGeometry(0.022, SIDE, sw, 2, 0.01), leather); side.position.set(-0.011, SIDE / 2, 0)
  const strapB = new THREE.Group(); strapB.position.set(-0.011, SIDE, 0)   // 蝶番B
  const top = new THREE.Mesh(new RoundedBoxGeometry(0.86, 0.022, sw, 2, 0.01), leather); top.position.set(-0.43, 0.011, 0)
  const st = new THREE.Shape()
  for (let i = 0; i < 10; i++) { const a2 = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.085 : 0.19; st[i ? 'lineTo' : 'moveTo'](Math.cos(a2) * r, Math.sin(a2) * r) }
  st.closePath()
  const starG = new THREE.ExtrudeGeometry(st, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4 })
  starG.rotateX(-Math.PI / 2)
  const star = new THREE.Mesh(starG, gold); star.position.set(-0.86, 0.022, 0)
  const starBack = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 24), gold); starBack.position.set(-0.86, -0.006, 0)   // 裏の座金（開いたとき上を向く）
  const bar = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.05, sw + 0.04, 2, 0.02), gold); bar.position.set(-0.62, 0.03, 0)
  for (const o of [top, star, starBack, bar]) { o.castShadow = true; strapB.add(o) }
  side.castShadow = true
  strap.add(side, strapB)
  /** k: 0=留まっている 1=開いて卓上に寝ている。先に留め金がパカっと跳ね上がり、続いて帯が外へ倒れる */
  const setStrap = (k) => {
    const a1 = Math.min(1, k / 0.45), a3 = Math.min(1, Math.max(0, (k - 0.3) / 0.7))
    const pop = Math.sin(a1 * Math.PI * 0.5)
    strapB.rotation.z = -(pop * 0.75 + a3 * (Math.PI / 2 - 0.75))
    strap.rotation.z = -a3 * a3 * (3 - 2 * a3) * Math.PI / 2
  }
  setStrap(0)
  pivot.add(R.g, L.g, spineArm, strap)
  root.add(pivot)
  const setOpen = (k) => {
    const th = -Math.PI * (1 - k)
    L.g.rotation.z = th
    spineArm.rotation.z = th / 2
    spine.position.y = -THREE.MathUtils.lerp(0.018, H - 0.0175, k)
    mats.shared.uBulge.value = k
  }
  setOpen(0)
  return { root, pivot, setOpen, strap, setStrap, pageL: L.page, pageR: R.page, blockL: L.block, blockR: R.block, coverMat }
}
