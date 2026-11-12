// 見開き6：外側を繋ぐ。中央のロボットから、巻物（Skill）・コネクタ（MCP）・パズルピース（Plugin）・ミニロボ（Subagent）へ光の管が伸びる
import * as THREE from 'three'
import { clamp01 } from './util.js'
import { makeBlob } from './bot.js'

const HUB = new THREE.Vector3(0.75, 0.1, -0.04), HUB_R = 0.17, ITEM_R = 0.2
// 整った四隅の配置。[x, 高さ, z, 大きさ, モデル名]。HTML側の札の位置もここから計算する
export const ITEMS = [
  { x: 0.3, y: 0.34, z: -0.56, size: 0.3, model: 'scroll' },    // Skill
  { x: 1.2, y: 0.34, z: -0.52, size: 0.3, model: 'plug2' },     // MCP
  { x: 1.2, y: 0.34, z: 0.3, size: 0.28, model: 'puzzle' },     // Plugin
  { x: 0.3, y: 0.3, z: 0.3, size: 0.2, model: 'bots' },         // Subagent
]
const easeBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2) }

// 足もとの神聖な輪：2つの光が向かい合う位置から、互いの尾を追って円を描く。尾の軌跡が残る
function halo(r) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uA: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main(){ vP=uv*2.-1.; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: /* glsl */ `
      uniform float uTime,uA; varying vec2 vP;
      void main(){
        float d=length(vP), a=atan(vP.y,vP.x);
        float band=1.-smoothstep(0.,.11,abs(d-.82));              // 円軌道の帯
        float core=1.-smoothstep(0.,.035,abs(d-.82));
        float inten=0., head=0.;
        for(int i=0;i<2;i++){
          float h=uTime*1.7+float(i)*3.14159;
          float back=mod(h-a,6.28318);                            // 頭から後ろへの角度
          inten+=exp(-back*.85);                                  // 尾は長く残って薄れる
          head+=exp(-back*back*90.)+exp(-(6.28318-back)*(6.28318-back)*90.);
        }
        vec3 col=mix(vec3(.45,.78,1.),vec3(1.),core*.7+head*.6);
        float al=(band*inten*.75+core*inten*.9+head*band*1.6+band*.06)*uA;
        float inner=(1.-smoothstep(0.,.8,d))*.05*uA;              // 内側のうっすらした光
        gl_FragColor=vec4(col*al+vec3(.5,.8,1.)*inner,1.);
      }`,
  })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.5, r * 2.5), mat)
  m.rotation.x = -Math.PI / 2
  return { m, mat }
}

const fit = (obj, size) => {
  const h = new THREE.Group(); h.add(obj)
  const b = new THREE.Box3().setFromObject(h), s = b.getSize(new THREE.Vector3())
  h.scale.setScalar(size / Math.max(s.x, s.y, s.z))
  const b2 = new THREE.Box3().setFromObject(h), c = b2.getCenter(new THREE.Vector3())
  h.position.set(-c.x, -b2.min.y, -c.z)
  const w = new THREE.Group(); w.add(h)
  return w
}

export function makeIsles(models, makeBot) {
  const group = new THREE.Group()
  group.visible = false
  // ---- 中央のロボット ----
  const hub = new THREE.Group(); hub.position.copy(HUB)
  const bot = makeBot(0.38, { shadow: 0.3 })
  bot.group.rotation.set(0, -0.55, 0)
  const tilt = new THREE.Group(); tilt.rotation.x = -0.5; tilt.add(bot.group)    // 少しのけぞって、上からでも顔が見える
  hub.add(tilt)
  const hubHalo = halo(HUB_R); hubHalo.m.position.y = 0.01; hub.add(hubHalo.m)
  hub.scale.setScalar(0.001)
  group.add(hub)

  // ---- 4つの道具と、光の管 ----
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  const lineGeo = new THREE.BoxGeometry(1, 0.0045, 0.0045); lineGeo.translate(0.5, 0, 0)     // 根元が原点。長さ方向に伸ばす
  const minis = []
  const items = ITEMS.map((it, i) => {
    const g = new THREE.Group(); g.position.set(it.x, it.y, it.z)
    let obj
    if (it.model === 'bots') {
      obj = new THREE.Group()
      for (const [x, z, ry] of [[-0.075, 0.02, 0.5], [0.08, -0.02, -0.4]]) {
        const mb = makeBot(it.size); mb.group.position.set(x, 0, z); mb.group.rotation.y = ry
        obj.add(mb.group); minis.push(mb)
      }
      obj.rotation.x = -0.45
    } else {
      const src = models[it.model].clone(true)
      src.traverse((m) => { if (m.isMesh) m.castShadow = true })
      obj = fit(src, it.size)
      if (it.model === 'scroll') obj.rotation.set(-0.5, 0.3, 0)
      if (it.model === 'plug2') obj.rotation.set(-1.05, 0.5, 0)
      if (it.model === 'puzzle') obj.rotation.set(-0.45, 0.35, 0)
    }
    g.add(obj)
    const h = halo(ITEM_R); h.m.position.y = -0.1; g.add(h.m)
    const sh = makeBlob(it.size * 1.25); sh.position.y = -it.y + 0.01; sh.userData.dark = 0.6; sh.userData.len = 0.1; g.add(sh)
    g.scale.setScalar(0.001)
    group.add(g)
    // 線は、中央の輪のふちから道具の輪のふちまで（輪の中には入らない）
    const hc = new THREE.Vector3(HUB.x, HUB.y + 0.01, HUB.z), ic = new THREE.Vector3(it.x, it.y - 0.1, it.z)
    const dir = new THREE.Vector3(ic.x - hc.x, 0, ic.z - hc.z).normalize()
    const from = hc.clone().addScaledVector(dir, HUB_R * 1.12), to = ic.clone().addScaledVector(dir, -ITEM_R * 1.12)
    const line = new THREE.Mesh(lineGeo, lineMat)
    line.position.copy(from)
    line.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), to.clone().sub(from).normalize())
    const len = from.distanceTo(to)
    line.scale.set(0.0001, 1, 1); line.visible = false
    group.add(line)
    return { g, obj, it, h, line, len, k: 0, ph: i * 1.7 }
  })

  return {
    group, bot,
    rise(k) { hub.scale.setScalar(Math.max(0.001, easeBack(clamp01(k)))); hubHalo.mat.uniforms.uA.value = clamp01(k) },
    /** i番目の道具が現れ、管がつながる（k: 0→1。前半で道具、後半で管） */
    item(i, k) {
      const it = items[i]; it.k = k
      it.g.scale.setScalar(Math.max(0.001, easeBack(clamp01(k / 0.45))))
      it.h.mat.uniforms.uA.value = clamp01(k / 0.45)
      const lk = clamp01((k - 0.3) / 0.7)
      it.line.visible = lk > 0; it.line.scale.x = Math.max(0.0001, it.len * lk)
      if (k >= 1 && it.it.model === 'bots') for (const m of minis) m.play('cheer', { fade: 0.4 })
    },
    fold(k) {
      const s = Math.max(0.001, 1 - k)
      hub.scale.setScalar(Math.min(hub.scale.x, s))
      for (const it of items) {
        it.g.scale.setScalar(Math.min(it.g.scale.x, s))
        const lk = Math.min(1, clamp01((it.k - 0.3) / 0.7)) * (1 - k)
        it.line.visible = lk > 0.001; it.line.scale.x = Math.max(0.0001, it.len * lk)
        if (k >= 1) it.k = 0
      }
    },
    update(t, dt) {
      hub.position.y = HUB.y + Math.sin(t * 0.8) * 0.01
      hubHalo.mat.uniforms.uTime.value = t
      bot.update(dt); for (const m of minis) m.update(dt)
      for (const it of items) {
        it.g.position.y = it.it.y + Math.sin(t * 0.9 + it.ph) * 0.02
        it.obj.rotation.y += dt * 0.25 * (it.it.model === 'bots' ? 0 : 1)
        it.h.mat.uniforms.uTime.value = t + it.ph
      }
    },
  }
}
