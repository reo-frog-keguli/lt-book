// ロボット。体は曲げない（自動の骨格付けでは肩や胴が崩れるため）。ゼンマイ仕掛けのおもちゃらしく、
// 体まるごとの傾き・跳ね・回転で「歩く・転ぶ・喜ぶ・指さす」を表す
import * as THREE from 'three'

let blobTex = null
function blob() {
  if (!blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 4, 64, 64, 62)
    g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(0.55, 'rgba(0,0,0,.22)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    x.fillStyle = g; x.fillRect(0, 0, 128, 128)
    blobTex = new THREE.CanvasTexture(c)
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }))
  m.rotation.x = -Math.PI / 2; m.renderOrder = 2
  return m
}
export const BLOBS = []
/** 影の目印。板そのものは描かず、位置・大きさ・濃さを紙面のシェーダーへ渡して、紙の丸みに沿った影にする */
export const makeBlob = (size) => { const b = blob(); b.scale.setScalar(size); b.material.visible = false; BLOBS.push(b); return b }

export function makeBotFactory(g) {   // g: { still } の GLTF（生成したままの、崩れのない姿）
  const box = new THREE.Box3().setFromObject(g.still.scene), sz = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3())
  /** height: 立ったときの高さ。mirror: 左右反転（上げている手を逆側にする） */
  return (height = 0.4, { mirror = false, shadow = 0 } = {}) => {
    const model = g.still.scene.clone(true)
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false } })
    const k = height / sz.y
    model.scale.set(mirror ? -k : k, k, k)
    model.position.set(-ctr.x * (mirror ? -k : k), -box.min.y * k, -ctr.z * k)      // 足もとを原点に
    const body = new THREE.Group(); body.add(model)       // 動きはここに付ける（足もとが支点）
    const group = new THREE.Group(); group.add(body)
    let sh = null
    if (shadow) { sh = makeBlob(shadow); sh.position.y = 0.004; sh.userData.len = height * 0.85; group.add(sh) }
    let mode = 'point', t = 0, speed = 1, frozen = false, rate = 6
    // いまの姿（持ち上げ、前後・左右の傾き、向き、伸び縮み）
    const cur = { y: 0, z: 0, rx: 0, rz: 0, ry: 0, sy: 1 }, tgt = { y: 0, z: 0, rx: 0, rz: 0, ry: 0, sy: 1 }
    const H = height
    const target = () => {
      const s = Math.sin, a = Math.abs
      tgt.z = 0
      if (mode === 'walk') {          // よちよち歩き：左右に体を振り、一歩ごとに小さく弾む
        const p = t * 9
        tgt.y = a(s(p)) * 0.045 * H; tgt.rz = s(p) * 0.13; tgt.rx = 0.07; tgt.ry = s(p) * 0.1; tgt.sy = 1
      } else if (mode === 'cheer') {  // 喜ぶ：ぴょんぴょん跳ねて、着地で少しつぶれ、体を左右へひねる
        const p = t * 6.2, j = a(s(p))
        tgt.y = j * 0.2 * H; tgt.sy = 1 + (j - 0.35) * 0.1; tgt.rz = s(p * 0.5) * 0.12; tgt.ry = s(p * 0.5) * 0.4; tgt.rx = -0.06
      } else if (mode === 'fall') {   // 転ぶ：後ろへ倒れ、一度弾んで仰向けに止まる
        const d = Math.min(1, t / 0.5), e = d * d
        const b = t > 0.5 ? a(s((t - 0.5) * 11)) * Math.exp(-(t - 0.5) * 5) : 0
        tgt.rx = -(Math.PI / 2) * e + b * 0.22; tgt.y = (0.25 * e + b * 0.1) * H; tgt.z = 0.42 * H * e; tgt.rz = 0.12 * e; tgt.ry = 0; tgt.sy = 1
      } else {                        // 指さす／待つ：上げている手の方へ少し乗り出して、ゆっくり揺れる
        const p = t * 1.6, on = frozen ? 0 : 1
        tgt.y = (0.5 + 0.5 * s(p)) * 0.012 * H; tgt.rz = (mirror ? 1 : -1) * 0.07 * on + s(p) * 0.02; tgt.rx = 0.04 * on; tgt.ry = 0; tgt.sy = 1
      }
    }
    const play = (name, { fade = 0.25, speed: sp = 1, at = 0 } = {}) => {
      if (mode === name && !frozen) { speed = sp; return }
      mode = name; t = at; speed = sp; frozen = false; rate = 1.6 / Math.max(0.05, fade)
    }
    /** 動きを止めて、まっすぐ立たせる */
    const pose = () => { mode = 'point'; frozen = true; rate = 5 }
    const update = (dt) => {
      t += dt * speed
      target()
      const m = 1 - Math.exp(-dt * rate * 2.2)
      for (const key of ['y', 'z', 'rx', 'rz', 'ry', 'sy']) cur[key] += (tgt[key] - cur[key]) * (mode === 'fall' ? Math.max(m, 0.5) : m)
      body.position.set(0, cur.y, cur.z)      // 倒れたときは、体の真ん中が足もとの位置に来るよう手前へずらす
      body.rotation.set(cur.rx, cur.ry, cur.rz, 'YXZ')
      body.scale.set(1 + (1 - cur.sy) * 0.5, cur.sy, 1 + (1 - cur.sy) * 0.5)
    }
    pose(); update(0)
    return { group, model, play, pose, update, shadow: sh }
  }
}
