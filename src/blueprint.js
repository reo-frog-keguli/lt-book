// 見開き4：霧と設計図。霧が晴れると、Webページの設計図が部品ごとに立ち上がる。部品はクリックで押せる
import * as THREE from 'three'
import { NOISE, clamp01 } from './util.js'

const T = 0.0085                                    // 線の太さ
const lineMat = () => new THREE.MeshBasicMaterial({ color: 0xeaf5ff, toneMapped: false })
const easeBack = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2) }

// 線は細い角棒で作る（角がきっちり合い、はみ出さない）
function bar(mat, x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0)
  const m = new THREE.Mesh(new THREE.BoxGeometry(len + T, T, T), mat)
  m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2)
  m.rotation.y = -Math.atan2(z1 - z0, x1 - x0)
  return m
}
const rect = (mat, x0, x1, z0, z1) => [bar(mat, x0, z0, x1, z0), bar(mat, x1, z0, x1, z1), bar(mat, x1, z1, x0, z1), bar(mat, x0, z1, x0, z0)]
function ring(mat, cx, cz, r) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, T * 0.5, 6, 20), mat)
  m.rotation.x = Math.PI / 2; m.position.set(cx, 0, cz)
  return m
}
function labelSprite(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128
  const x = c.getContext('2d')
  x.font = '600 58px "Cormorant Garamond", serif'
  const w = x.measureText(text).width + 70
  x.fillStyle = 'rgba(234,245,255,.96)'; x.beginPath(); x.roundRect(256 - w / 2, 18, w, 92, 46); x.fill()
  x.fillStyle = '#12325e'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 66)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, toneMapped: false }))
  s.scale.set(0.52, 0.13, 1); s.renderOrder = 9; s.visible = false
  return s
}

export function makeBlueprint() {
  const group = new THREE.Group()
  group.visible = false
  const parts = []
  const wire = new THREE.Group(); wire.position.x = 0; group.add(wire)   // 紙の余白に掛からないよう、少し左へ
  /** 部品：線の束＋当たり判定の板＋名前の札 */
  const part = (name, y, box, build) => {
    const g = new THREE.Group(); g.position.y = y
    const mat = lineMat()
    for (const m of build(mat)) g.add(m)
    const [x0, x1, z0, z1] = box
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }))
    plate.rotation.x = -Math.PI / 2; plate.position.set((x0 + x1) / 2, -0.004, (z0 + z1) / 2)
    g.add(plate)
    const label = labelSprite(name); label.position.set((x0 + x1) / 2, 0.16, (z0 + z1) / 2); g.add(label)
    g.visible = false
    wire.add(g)
    const p = { name, g, y, mat, plate, label, push: 0, pop: -9, hover: 0, shown: 0 }
    plate.userData.part = p
    parts.push(p)
    return p
  }
  // ウィンドウの枠は土台（押せない）
  const frame = new THREE.Group(); frame.position.y = 0.15; frame.visible = false
  const fm = lineMat()
  for (const m of [...rect(fm, 0.22, 1.42, -0.66, 0.30), bar(fm, 0.22, -0.56, 1.42, -0.56), ring(fm, 0.29, -0.61, 0.017), ring(fm, 0.35, -0.61, 0.017), ring(fm, 0.41, -0.61, 0.017)]) frame.add(m)
  const framePlate = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.96), new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }))
  framePlate.rotation.x = -Math.PI / 2; framePlate.position.set(0.82, -0.004, -0.18); frame.add(framePlate)
  wire.add(frame)
  // 押せる部品（描く順）
  part('header', 0.2, [0.28, 1.36, -0.52, -0.41], (m) => [...rect(m, 0.30, 0.40, -0.50, -0.43), bar(m, 0.96, -0.465, 1.06, -0.465), bar(m, 1.10, -0.465, 1.20, -0.465), bar(m, 1.24, -0.465, 1.34, -0.465)])
  part('hero image', 0.27, [0.30, 0.86, -0.36, -0.06], (m) => [...rect(m, 0.30, 0.86, -0.36, -0.06), bar(m, 0.30, -0.36, 0.86, -0.06), bar(m, 0.86, -0.36, 0.30, -0.06)])
  part('h1', 0.31, [0.92, 1.36, -0.36, -0.21], (m) => [bar(m, 0.94, -0.32, 1.34, -0.32), bar(m, 0.94, -0.25, 1.22, -0.25)])
  part('p', 0.2, [0.92, 1.36, -0.19, 0.01], (m) => [bar(m, 0.94, -0.15, 1.33, -0.15), bar(m, 0.94, -0.09, 1.33, -0.09), bar(m, 0.94, -0.03, 1.2, -0.03)])
  part('card', 0.2, [0.30, 0.46, 0.03, 0.22], (m) => rect(m, 0.30, 0.46, 0.03, 0.22))
  part('card', 0.2, [0.50, 0.66, 0.03, 0.22], (m) => rect(m, 0.50, 0.66, 0.03, 0.22))
  part('card', 0.2, [0.70, 0.86, 0.03, 0.22], (m) => rect(m, 0.70, 0.86, 0.03, 0.22))
  part('submit', 0.38, [0.94, 1.2, 0.06, 0.16], (m) => [...rect(m, 0.94, 1.2, 0.06, 0.16), bar(m, 1.0, 0.11, 1.14, 0.11)])
  // 押したときに広がる輪
  const pulse = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }))
  pulse.rotation.x = -Math.PI / 2; wire.add(pulse)
  let pulseT = -9

  // ---- 霧（高さ違いで2枚。カーソルの周りと、晴れていく中心から消える） ----
  const fogMat = (off, y) => {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uClear: { value: 0 }, uCur: { value: new THREE.Vector2(9, 9) }, uOff: { value: off } },
      vertexShader: 'varying vec2 vP; void main(){ vP=vec2(position.x,-position.y); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: /* glsl */ `
        uniform float uTime,uAmt,uClear,uOff; uniform vec2 uCur; varying vec2 vP;
        ${NOISE}
        void main(){
          float n=fbm(vP*1.5+vec2(uTime*.05,uTime*.03)+uOff)*.65+fbm(vP*3.3-uTime*.06+uOff*2.)*.35;
          float a=smoothstep(.2,.72,n)*uAmt;
          a*=smoothstep(uClear*2.9-.6,uClear*2.9+.15,length(vP-vec2(.75,-.12))+(n-.5)*.5);
          a*=smoothstep(.25,.46,length(vP-uCur));                    // レンズの中は晴れる
          vec2 e=vec2(1.62,1.02)-abs(vP); a*=smoothstep(0.,.3,min(e.x,e.y));
          gl_FragColor=vec4(vec3(.87,.91,.96),a*.9);
        }`,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.1), m)
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = y; mesh.renderOrder = 5
    group.add(mesh)
    return m
  }
  const fogs = [fogMat(0, 0.3), fogMat(7.3, 0.55)]
  const ray = new THREE.Raycaster()
  let hovered = null, drawn = 0

  return {
    group,
    setFog(k) { for (const f of fogs) f.uniforms.uAmt.value = k },
    setClear(k) { for (const f of fogs) f.uniforms.uClear.value = k },
    setCursor(x, z) { for (const f of fogs) f.uniforms.uCur.value.set(x, z) },
    /** 設計図を、進み具合 k (0→1) まで描く：枠→部品が順に、弾みながら浮き上がる */
    draw(k) {
      drawn = k
      const fk = clamp01(k / 0.2)
      frame.visible = fk > 0
      frame.scale.set(Math.max(0.001, fk), 1, Math.max(0.001, fk)); frame.position.set(0.82 * (1 - fk), 0.15, -0.18 * (1 - fk))
      framePlate.material.opacity = 0.05 * fk
      parts.forEach((p, i) => {
        const lk = clamp01((k - 0.2 - i * 0.085) / 0.2)
        p.shown = lk; p.g.visible = lk > 0
      })
    },
    /** カーソル（正規化座標）がどの部品の上にあるか */
    hover(ndc, camera) {
      hovered = null
      if (drawn < 1) return null
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObjects(parts.map((p) => p.plate), false)[0]
      hovered = hit ? hit.object.userData.part : null
      return hovered
    },
    /** いま指している部品を押す。押せたら部品名を返す */
    press(t) {
      if (!hovered) return null
      hovered.pop = t; pulseT = t
      pulse.position.set(hovered.plate.position.x, hovered.y + 0.01, hovered.plate.position.z)
      return hovered.name
    },
    update(t) {
      for (const f of fogs) f.uniforms.uTime.value = t
      for (const p of parts) {
        const since = t - p.pop
        // 押し込まれて、ばねで戻る。名前の札がぽんと飛び出して、しばらく残る
        const dip = since >= 0 && since < 0.7 ? Math.exp(-since * 7) * Math.cos(since * 22) : 0
        const e = easeBack(p.shown)
        p.g.position.y = p.y * e - dip * 0.07
        p.hover += ((p === hovered ? 1 : 0) - p.hover) * 0.2
        p.plate.material.opacity = (0.1 + 0.22 * p.hover + (since >= 0 && since < 0.5 ? 0.5 * (1 - since / 0.5) : 0)) * p.shown
        p.mat.color.setRGB(0.92 + 0.08 * p.hover, 0.96 + 0.04 * p.hover, 1)
        const lv = since >= 0 && since < 2.6
        p.label.visible = lv
        if (lv) {
          const a = Math.min(1, since / 0.22), out = clamp01((since - 2.1) / 0.5)
          p.label.position.y = 0.1 + 0.1 * easeBack(a)
          p.label.scale.set(0.52 * easeBack(a) * (1 - out * 0.3), 0.13 * easeBack(a) * (1 - out * 0.3), 1)
          p.label.material.opacity = 1 - out
        }
      }
      const ps = t - pulseT
      pulse.visible = ps >= 0 && ps < 0.6
      if (pulse.visible) { pulse.scale.setScalar(0.08 + ps * 0.7); pulse.material.opacity = 0.7 * (1 - ps / 0.6) }
    },
  }
}
