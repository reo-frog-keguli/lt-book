// 見開き3：星図。ページの上に浮かぶ星と、金の線で結ばれていく星座
import * as THREE from 'three'
import { rand } from './util.js'

// 星座：nodes は [x, 高さ, z, 大きさ]。paths は nodes の番号の並び（1本ずつ線が伸びる）
const CONSTELLATIONS = [
  { // 道しるべ（AIが最初に読む共通の指示）：北の空の、ひしゃく形
    nodes: [[0.26, 0.10, -0.74, 0.7], [0.47, 0.17, -0.62, 0.8], [0.66, 0.23, -0.56, 0.8], [0.86, 0.30, -0.50, 1.5], [1.08, 0.25, -0.63, 0.9], [1.24, 0.32, -0.40, 1.0], [0.99, 0.36, -0.27, 0.9]],
    paths: [[0, 1, 2, 3, 4, 5, 6, 3]],
  },
  { // 分かれ道（できないことは割り切り、代替案を出す）
    nodes: [[0.28, 0.12, 0.50, 1.2], [0.60, 0.20, 0.40, 1.0], [0.92, 0.30, 0.20, 0.9], [1.24, 0.26, 0.12, 1.2], [0.94, 0.18, 0.56, 0.8], [1.28, 0.27, 0.62, 1.2]],
    paths: [[0, 1, 2, 3], [1, 4, 5]],
  },
  { // 大きい順に並ぶ星と、問いかけの鉤（重要な順に質問する）
    nodes: [[-1.32, 0.30, 0.46, 1.7], [-1.04, 0.24, 0.60, 1.3], [-0.77, 0.18, 0.52, 1.0], [-0.54, 0.14, 0.62, 0.8], [-0.36, 0.20, 0.50, 0.7], [-0.44, 0.27, 0.38, 0.7]],
    paths: [[0, 1, 2, 3, 4, 5]],
  },
]

export function makeSky() {
  const group = new THREE.Group()
  group.visible = false
  const GOLD = new THREE.Color(0xf2cf84)

  // ---- 浮かぶ星（高さがばらばらなので、見る角度を変えると奥行きが分かる） ----
  const N = 280
  const pos = new Float32Array(N * 3), aS = new Float32Array(N), aPh = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const r = Math.random()
    pos.set([rand(-1.56, 1.56), 0.03 + 0.62 * r * r, rand(-0.96, 0.96)], i * 3)
    aS[i] = 0.012 + Math.pow(Math.random(), 3) * 0.05
    aPh[i] = Math.random()
  }
  const sg = new THREE.BufferGeometry()
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  sg.setAttribute('aS', new THREE.BufferAttribute(aS, 1))
  sg.setAttribute('aPh', new THREE.BufferAttribute(aPh, 1))
  const pointMat = (extra = '') => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uFade: { value: 0 }, uH: { value: 600 }, uGain: { value: 1.25 }, uCol: { value: new THREE.Color(0xfff2d4) } },
    vertexShader: /* glsl */ `
      attribute float aS, aPh; uniform float uTime, uFade, uH; varying float vA;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.);
        float tw=.55+.45*sin(uTime*(.8+aPh*2.2)+aPh*40.);
        vA=tw*uFade${extra};
        gl_PointSize=aS*uH/(-mv.z)*2.4; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCol; uniform float uGain; varying float vA;
      void main(){ vec2 c=gl_PointCoord-.5; float d=length(c);
        float core=1.-smoothstep(0.,.1,d), halo=pow(max(0.,1.-d*2.),2.2);
        float ray=max(0.,1.-abs(c.x)*26.)*max(0.,1.-abs(c.y)*2.4)+max(0.,1.-abs(c.y)*26.)*max(0.,1.-abs(c.x)*2.4);   // 十字のきらめき
        ray=pow(ray,1.3);
        gl_FragColor=vec4((uCol*(halo*.7+ray*.8)+vec3(1.)*core*1.5)*vA*uGain,1.); }`,
  })
  const starMat = pointMat()
  const stars = new THREE.Points(sg, starMat)
  stars.frustumCulled = false
  group.add(stars)

  // ---- 星座 ----
  const nodeMat = new THREE.MeshBasicMaterial({ color: 0xfff6dc, toneMapped: false })
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xfff0c4, toneMapped: false })           // 芯は白に近い金
  // 線のまわりの光：芯より太い管を、外側ほど薄く2重に重ねる
  const glowMat = (op) => new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  const lineGlow = [glowMat(0.42), glowMat(0.16)]
  const mats = [starMat]
  const cons = CONSTELLATIONS.map((c) => {
    const P = c.nodes.map((n) => new THREE.Vector3(n[0], n[1], n[2]))
    // 節の星（球＋光の暈）
    const nodes = c.nodes.map((n, i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.016 * n[3], 14, 10), nodeMat)
      m.position.copy(P[i]); m.scale.setScalar(0.001)
      group.add(m)
      return { m, at: 2 }   // at: 線がここへ届く進み具合（あとで決める）
    })
    const hg = new THREE.BufferGeometry()
    hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P.flatMap((p) => [p.x, p.y, p.z])), 3))
    hg.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(c.nodes.map((n) => 0.2 * n[3])), 1))
    hg.setAttribute('aPh', new THREE.BufferAttribute(new Float32Array(c.nodes.map(() => Math.random())), 1))
    const hm = pointMat(); hm.uniforms.uCol.value = new THREE.Color(0xffd98a); hm.uniforms.uGain.value = 1.7
    const halo = new THREE.Points(hg, hm); halo.frustumCulled = false
    group.add(halo); mats.push(hm)
    // 線：細い管。進み具合に合わせて先頭から描く範囲を広げる
    const total = c.paths.reduce((s, p) => s + p.slice(1).reduce((a, j, k) => a + P[j].distanceTo(P[p[k]]), 0), 0)
    let acc = 0
    const tubes = c.paths.map((p) => {
      const cp = new THREE.CurvePath()
      let len = 0
      for (let k = 1; k < p.length; k++) { cp.add(new THREE.LineCurve3(P[p[k - 1]], P[p[k]])); len += P[p[k]].distanceTo(P[p[k - 1]]) }
      const SEG = Math.max(20, Math.round(len * 90)), RAD = 5
      const g = new THREE.TubeGeometry(cp, SEG, 0.0048, RAD, false)
      g.setDrawRange(0, 0)
      const mesh = new THREE.Mesh(g, lineMat)
      group.add(mesh)
      const gs = [0.013, 0.03].map((r, gi) => { const gg = new THREE.TubeGeometry(cp, SEG, r, RAD, false); gg.setDrawRange(0, 0); const gm = new THREE.Mesh(gg, lineGlow[gi]); gm.renderOrder = 3; group.add(gm); return gg })
      // 各節に線が届く時点
      let l = 0
      nodes[p[0]].at = Math.min(nodes[p[0]].at, acc / total)
      for (let k = 1; k < p.length; k++) { l += P[p[k]].distanceTo(P[p[k - 1]]); nodes[p[k]].at = Math.min(nodes[p[k]].at, (acc + l) / total) }
      const t = { g, gs, SEG, RAD, from: acc / total, to: (acc + len) / total }
      acc += len
      return t
    })
    return { nodes, tubes, halo: hm, k: 0 }
  })

  // ---- 流れ星：本の外から現れ、ページの端へ向かって奥へ遠ざかりながら消える ----
  const streakGeo = (() => {
    const g = new THREE.PlaneGeometry(1, 1, 1, 1); g.translate(-0.5, 0, 0)   // 頭が原点、尾は -x へ
    return g
  })()
  const streakMat = (col) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uA: { value: 0 }, uCol: { value: new THREE.Color(col) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform float uA; uniform vec3 uCol; varying vec2 vUv; void main(){ float w=1.-abs(vUv.y-.5)*2.; float t=pow(vUv.x,2.2); float core=pow(w,6.)*t, glow=pow(w,1.6)*t*.45; gl_FragColor=vec4((uCol*glow+vec3(1.)*core)*uA,1.); }',
  })
  const meteors = Array.from({ length: 3 }, () => {
    const mat = streakMat(0xffe9b8)
    const m = new THREE.Mesh(streakGeo, mat); m.visible = false; m.frustumCulled = false
    group.add(m)
    return { m, mat, t0: -9, from: new THREE.Vector3(), to: new THREE.Vector3(), dur: 1 }
  })
  let nextMeteor = 1.5, meteorOn = false
  const spawn = (me, t) => {
    // 本の外（左右どちらか）の高い所から、反対寄りのページの端へ。終点は低く小さく＝遠ざかって見える
    const s = Math.random() < 0.5 ? -1 : 1
    me.from.set(s * rand(2.0, 2.6), rand(0.9, 1.3), rand(-1.3, 0.2))
    me.to.set(-s * rand(0.6, 1.5), 0.05, rand(-0.95, -0.5))
    me.t0 = t; me.dur = rand(0.9, 1.4)
  }
  // ---- 切り刻む光：青い筋が、裂け目に沿って走る ----
  const lasers = Array.from({ length: 16 }, (_, i) => {
    const mat = streakMat(i % 2 ? 0x8a7dff : 0x6fd8ff)
    const m = new THREE.Mesh(streakGeo, mat); m.visible = false; m.frustumCulled = false
    group.add(m)
    return { m, mat }
  })
  const place = (m, head, dir, len, wid) => {   // 頭の位置・進む向き・尾の長さ・太さ
    m.position.copy(head)
    m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir)
    m.rotateX(-Math.PI / 2 * 0)                  // 面は進む向きに沿って、上向きのまま
    m.scale.set(len, wid, 1)
  }
  const tmpD = new THREE.Vector3(), tmpH = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q0 = new THREE.Quaternion(), mx = new THREE.Matrix4(), side = new THREE.Vector3()
  const orient = (m, head, dir, len, wid) => {
    // 帯の長手＝進む向き、幅＝それに直交する水平方向。上から見て線に見えるよう、面を上へ向ける
    side.crossVectors(up, dir).normalize(); const nrm = tmpD.crossVectors(dir, side).normalize()
    mx.makeBasis(dir, side, nrm); m.quaternion.setFromRotationMatrix(mx)
    m.position.copy(head); m.scale.set(len, wid, 1)
  }

  return {
    group,
    setMeteors(on) { meteorOn = on },
    /** 切り刻み：cuts は紙片側の裂け目（px,py,dx,dy：ページ座標）。k: 0→1 の間に、筋が順番に走る */
    slash(cuts, k) {
      lasers.forEach((l, i) => {
        const c = cuts[i % cuts.length]
        const t = (k - i / lasers.length * 0.8) / 0.2
        l.m.visible = t > 0 && t < 1.25
        if (!l.m.visible) return
        const s = (Math.min(1, t) * 2 - 1) * 2.2 * (i % 2 ? 1 : -1)
        const dir = new THREE.Vector3(c.dx, 0, -c.dy).multiplyScalar(i % 2 ? 1 : -1).normalize()
        tmpH.set(c.px + c.dx * s, 0.03, -(c.py + c.dy * s))
        orient(l.m, tmpH, dir, 1.5, 0.05)
        l.mat.uniforms.uA.value = t < 1 ? 1.6 : Math.max(0, 1 - (t - 1) * 4) * 1.6
      })
    },
    /** 斬る筋：cuts（makeSlash が返す、位置・向き・開始時刻つき）を、時刻 t に合わせて1本ずつ走らせる */
    slashAt(cuts, t, reach = 2.3) {
      lasers.forEach((l, i) => {
        const c = cuts[i]
        const p = c ? (t - c.t0) / c.dur : -1
        l.m.visible = p > 0 && p < 1.6
        if (!l.m.visible) return
        const s = (Math.min(1, p) * 2 - 1) * reach * c.sgn
        const dir = new THREE.Vector3(c.dx, 0, -c.dy).multiplyScalar(c.sgn).normalize()
        tmpH.set(c.px + c.dx * s, 0.06, -(c.py + c.dy * s))
        orient(l.m, tmpH, dir, 1.6, 0.05)
        l.m.renderOrder = 30
        l.mat.uniforms.uA.value = p < 1 ? 2.0 : Math.max(0, 1 - (p - 1) / 0.6) * 2.0
      })
    },
    setFade(k) { starMat.uniforms.uFade.value = k },
    /** i番目の星座を、進み具合 k (0→1) まで描く */
    draw(i, k) {
      const c = cons[i]; c.k = k
      for (const t of c.tubes) {
        const lk = Math.min(1, Math.max(0, (k - t.from) / (t.to - t.from)))
        const cnt = Math.floor(lk * t.SEG) * t.RAD * 6
        t.g.setDrawRange(0, cnt); for (const gg of t.gs) gg.setDrawRange(0, cnt)
      }
      for (const n of c.nodes) {
        const a = Math.min(1, Math.max(0, (k - n.at + 0.02) / 0.1))
        n.m.scale.setScalar(Math.max(0.001, a * (1 + 0.6 * Math.sin(a * Math.PI))))   // 届いた瞬間に少し弾む
      }
      c.halo.uniforms.uFade.value = Math.min(1, k * 1.6)
    },
    update(t, h) {
      for (const m of mats) { m.uniforms.uTime.value = t; m.uniforms.uH.value = h }
      if (meteorOn && t > nextMeteor) { const me = meteors.find((x) => t - x.t0 > x.dur); if (me) spawn(me, t); nextMeteor = t + rand(1.4, 3.4) }
      for (const me of meteors) {
        const k = (t - me.t0) / me.dur
        me.m.visible = k >= 0 && k <= 1
        if (!me.m.visible) continue
        const e = 1 - Math.pow(1 - k, 2)
        tmpH.lerpVectors(me.from, me.to, e)
        const dir = new THREE.Vector3().subVectors(me.to, me.from).normalize()
        const far = 1 - k                                  // 遠ざかるほど短く細く、暗く
        orient(me.m, tmpH, dir, 0.25 + 0.9 * far, 0.012 + 0.05 * far)
        me.mat.uniforms.uA.value = Math.sin(Math.min(1, k * 5) * Math.PI / 2) * (0.25 + 0.95 * far)
      }
    },
  }
}
