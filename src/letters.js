// 見開き7：手紙。革の上に便箋が2枚。万年筆が1行ずつ書き進める。便箋はつかんで動かせ、右上の角はめくれる
import * as THREE from 'three'
import { NOISE, clamp01, lerp, BOOK, LDIR } from './util.js'
import { makeBlob } from './bot.js'

const W = 0.72, Hh = 0.95                               // 便箋の大きさ
// 便箋の中心（本の座標）と向き。HTML側の便箋の位置は、ここから計算して合わせる
export const SHEETS = [{ x: 0.4, y: 0.14, z: 0.0, ry: 0.06 }, { x: 1.1, y: 0.18, z: 0.02, ry: -0.05 }]
/** 便箋の、舞台(960×600)上の矩形 */
export const sheetRect = (i) => {
  const s = SHEETS[i], k = 960 / (BOOK.PW * 2)
  return { left: (s.x + BOOK.PW) * k - (W * k) / 2, top: (s.z + BOOK.PH / 2) * k - (Hh * k) / 2, width: W * k, height: Hh * k }
}

export function makeLetters(tex, lineSets) {
  const group = new THREE.Group()
  group.visible = false
  const sheets = SHEETS.map((s0, i) => {
    const s = { ...s0 }                                  // 動かせるので、いまの位置はここに持つ
    const r = sheetRect(i)
    const lines = lineSets[i].map((l) => new THREE.Vector4(l.x0, l.x1, l.yc, l.hh))
    while (lines.length < 4) lines.push(new THREE.Vector4(0, 0, -9, 0))
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        tText: { value: tex }, uRect: { value: new THREE.Vector4(r.left / 960, 1 - (r.top + r.height) / 600, r.width / 960, r.height / 600) },
        uLines: { value: lines }, uP: { value: 0 }, uLight: { value: LDIR.clone() },
        uPen: { value: new THREE.Vector3(9, 9, 0) },      // ペン先の位置（便箋のuv）と影の濃さ
      },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tText; uniform vec4 uRect; uniform vec4 uLines[4]; uniform float uP; uniform vec3 uLight,uPen;
        varying vec2 vUv; varying vec3 vN;
        ${NOISE}
        void main(){
          vec2 uv=vUv;
          vec3 c=mix(vec3(.93,.89,.80),vec3(.98,.95,.88),fbm(uv*vec2(5.,6.5)));
          c*=.975+.04*vn(vec2(uv.x*500.,uv.y*30.));
          float rule=smoothstep(.492,.5,abs(fract(uv.y*9.+.35)-.5));
          c=mix(c,vec3(.62,.70,.80),rule*.35*step(.08,uv.y)*step(uv.y,.84));
          vec2 e=min(uv,1.-uv); c*=mix(.9,1.,smoothstep(0.,.05,min(e.x,e.y)));
          // 表だけに文字。行ごとに左から右へ現れる。行の外（刷られた見出し）は最初から見える
          if(gl_FrontFacing){
            float a=texture2D(tText,uRect.xy+uv*uRect.zw).a, m=1.;
            for(int i=0;i<4;i++){
              vec4 l=uLines[i];
              if(abs(uv.y-l.z)<l.w){ float x=l.x+(l.y-l.x)*clamp(uP-float(i),0.,1.); m=(1.-smoothstep(x-.012,x+.004,uv.x))*step(.0001,uP-float(i)); }
            }
            c=mix(c,vec3(.07,.09,.20),clamp(a*m*1.1,0.,1.));
            // ペンが紙に落とす影：ペン先から左手前へ伸びる、細長いぼけた影
            vec2 d=(uv-uPen.xy)*vec2(${(W / Hh).toFixed(3)},1.);
            vec2 dir=normalize(vec2(-.62,-.78)); float along=dot(d,dir), across=dot(d,vec2(-dir.y,dir.x));
            float sh=(1.-smoothstep(0.,.03+along*.09,abs(across)))*smoothstep(-.012,.01,along)*(1.-smoothstep(.12,.5,along));
            c*=1.-.42*sh*uPen.z;
          } else c*=.94;
          vec3 nn=normalize(vN)*(gl_FrontFacing?1.:-1.);
          float lam=clamp(dot(nn,uLight),0.,1.);
          gl_FragColor=vec4(pow(c,vec3(2.2))*mix(.55,1.05,lam),1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
    const geo = new THREE.PlaneGeometry(W, Hh, 16, 16)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    const base = Array.from({ length: pos.count }, (_, k) => ({ x: pos.getX(k), z: pos.getZ(k) }))
    /** 右上の角の反り。peel: 0=少し反っている 1=大きくめくれている */
    const curl = (peel) => {
      for (let k = 0; k < pos.count; k++) {
        const b = base[k], u = b.x / W + 0.5, v = 0.5 - b.z / Hh
        const c = Math.max(0, u + v - lerp(1.25, 0.55, peel))
        const lift = c * c * lerp(0.55, 1.5, peel)
        // めくれるほど、角は内側（左下）へ巻き込まれる
        pos.setXYZ(k, b.x - c * c * peel * 0.55, lift * (1 - 0.35 * peel * c) + Math.sin(u * 3.1) * 0.006, b.z + c * c * peel * 0.55)
      }
      pos.needsUpdate = true; geo.computeVertexNormals()
    }
    curl(0)
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.06, Hh * 1.05), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }))
    sh.rotation.x = -Math.PI / 2
    const g = new THREE.Group(); g.add(sh, mesh)
    g.position.set(s.x, s.y, s.z); g.rotation.y = s.ry
    group.add(g)
    mesh.userData.sheet = i
    return { g, mesh, mat, s, lines: lineSets[i], sh, curl, peel: 0, peelT: 0, lift: 0, liftT: 0, away: 0 }
  })

  // ---- 万年筆 ----
  const pen = new THREE.Group()
  const black = new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: 0.22, metalness: 0.5 })
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9b25a, roughness: 0.25, metalness: 1 })
  const nib = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.07, 12), gold); nib.rotation.x = Math.PI; nib.position.y = 0.035
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.013, 0.09, 14), black); grip.position.y = 0.115
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.012, 14), gold); ring.position.y = 0.166
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.3, 14), black); barrel.position.y = 0.322
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), gold); cap.position.y = 0.472
  for (const o of [nib, grip, ring, barrel, cap]) { o.castShadow = true; pen.add(o) }
  const penRig = new THREE.Group(); penRig.add(pen)
  pen.rotation.set(0.55, 0, -0.6)
  penRig.scale.setScalar(0.001)
  group.add(penRig)
  const restShadow = makeBlob(0.42); restShadow.scale.set(0.42, 0.14, 1); restShadow.material.opacity = 0; group.add(restShadow)   // 置いてあるときの影
  const REST = new THREE.Vector3(0.8, 0.42, 0.74)
  penRig.position.copy(REST)
  const tip = new THREE.Vector3()
  let active = -1, activeK = 0, penOn = 0

  const tipAt = (i, li, t) => {
    const sh = sheets[i], l = sh.lines[li]
    const lx = (lerp(l.x0, l.x1, t) - 0.5) * W, lz = (0.5 - l.yc) * Hh
    const c = Math.cos(sh.s.ry), s = Math.sin(sh.s.ry)
    return tip.set(sh.s.x + lx * c + lz * s, sh.s.y + 0.012, sh.s.z - lx * s + lz * c)
  }
  // ---- つかんで動かす／角をめくる ----
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3(), inv = new THREE.Matrix4()
  let drag = null

  return {
    group,
    /** 便箋が舞い降り、ペンが現れる（k: 0→1） */
    drop(k) {
      sheets.forEach((sh, i) => {
        const lk = clamp01((k - i * 0.22) / 0.7), e = 1 - Math.pow(1 - lk, 3)
        sh.g.visible = lk > 0
        sh.g.position.set(sh.s.x + (1 - e) * (i ? 0.5 : -0.4), sh.s.y + (1 - e) * 1.6, sh.s.z + (1 - e) * 0.3)
        sh.g.rotation.set((1 - e) * 0.9 * Math.sin(lk * 9), sh.s.ry + (1 - e) * (i ? -1.2 : 1.0), (1 - e) * 0.6 * Math.cos(lk * 7))
        sh.sh.material.opacity = 0.28 * e
      })
      penOn = clamp01(k * 2.5 - 1.5)
      penRig.scale.setScalar(Math.max(0.001, penOn))
    },
    /** 便箋 i に書く（k: 0→1。行の長さに応じて時間を配る） */
    write(i, k) {
      const sh = sheets[i], n = sh.lines.length
      const lens = sh.lines.map((l) => l.x1 - l.x0 + 0.25), tot = lens.reduce((a, b) => a + b, 0)
      let acc = 0, p = n
      for (let j = 0; j < n; j++) { const a = acc / tot, b = (acc + lens[j]) / tot; if (k < b) { p = j + clamp01((k - a) / (b - a) / 0.86); break } acc += lens[j] }
      sh.mat.uniforms.uP.value = p
      active = k < 1 ? i : -1; activeK = p
    },
    /** 次の見開きへ：便箋は引っぱられるように、左上と右上へ飛んでいく（k: 0→1） */
    fly(k) {
      sheets.forEach((sh, i) => { sh.away = clamp01((k - i * 0.12) / 0.88) })
      penOn = 1 - clamp01(k * 2)
      penRig.scale.setScalar(Math.max(0.001, penOn))
    },
    /** カーソル（正規化座標）で便箋をつかむ。つかめたら true */
    grab(ndc, camera) {
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObjects(sheets.map((s) => s.mesh), false)[0]
      if (!hit) return false
      const sh = sheets[hit.object.userData.sheet]
      group.updateWorldMatrix(true, false); inv.copy(group.matrixWorld).invert()
      const corner = hit.uv.x > 0.7 && hit.uv.y > 0.7
      plane.set(new THREE.Vector3(0, 1, 0), -hit.point.y)
      const p = hit.point.clone().applyMatrix4(inv)
      drag = { sh, corner, ox: sh.s.x - p.x, oz: sh.s.z - p.z, sx: p.x, sz: p.z }
      if (corner) sh.peelT = 0.25; else sh.liftT = 1
      return true
    },
    move(ndc, camera) {
      if (!drag) return
      ray.setFromCamera(ndc, camera)
      if (!ray.ray.intersectPlane(plane, hitP)) return
      const p = hitP.applyMatrix4(inv)
      if (drag.corner) drag.sh.peelT = clamp01(0.25 + Math.hypot(p.x - drag.sx, p.z - drag.sz) * 2.2)   // 角を引くほど、大きくめくれる
      else { drag.sh.s.x = THREE.MathUtils.clamp(p.x + drag.ox, -1.4, 1.5); drag.sh.s.z = THREE.MathUtils.clamp(p.z + drag.oz, -0.9, 0.9) }
    },
    release() { if (drag) { drag.sh.peelT = 0; drag.sh.liftT = 0; drag = null } },
    get dragging() { return !!drag },
    update(t, dt) {
      // 便箋：持ち上げ・めくれ・飛び去りを、なめらかに追従させる
      sheets.forEach((sh, i) => {
        sh.lift = lerp(sh.lift, sh.liftT, 1 - Math.exp(-dt * 12))
        const pk = lerp(sh.peel, sh.peelT, 1 - Math.exp(-dt * 10))
        if (Math.abs(pk - sh.peel) > 0.002) { sh.peel = pk; sh.curl(pk) }
        if (sh.away > 0 || sh.lift > 0.001 || drag?.sh === sh || sh.moved) {
          const a = sh.away, e = a * a
          const sx = i ? 1 : -1
          sh.g.position.set(sh.s.x + sx * e * 4.2, sh.s.y + sh.lift * 0.09 + a * 0.5 + e * 1.4, sh.s.z - e * 3.4)
          sh.g.rotation.set(-a * 0.7 + sh.lift * 0.05, sh.s.ry + sx * e * 1.6 + (drag?.sh === sh && !drag.corner ? Math.sin(t * 9) * 0.01 : 0), sx * a * 0.5)
          sh.moved = true
        }
        sh.sh.position.set(0.03 + sh.lift * 0.05, -0.035 - sh.lift * 0.09, 0.035 + sh.lift * 0.05)
        sh.sh.material.opacity = 0.28 * (1 - sh.away) * (1 - sh.lift * 0.35)
        sh.mat.uniforms.uPen.value.z = 0
      })
      let target = REST
      if (active >= 0) {
        const sh = sheets[active]
        const li = Math.min(sh.lines.length - 1, Math.floor(activeK)), f = activeK - li
        target = tipAt(active, li, Math.min(1, f))
        const up = f >= 1
        target.y += up ? 0.07 : 0
        target.x += Math.sin(t * 31) * 0.006; target.z += Math.cos(t * 23) * 0.012
        // 紙の上の影：ペン先の位置を便箋のuvで渡す（ペン先が浮くと薄くなる）
        const l = sh.lines[li]
        sh.mat.uniforms.uPen.value.set(lerp(l.x0, l.x1, Math.min(1, f)), l.yc, up ? 0.45 : 1)
      }
      penRig.position.lerp(target, 1 - Math.exp(-dt * (active >= 0 ? 22 : 3)))
      pen.rotation.z = -0.6 + Math.sin(t * 27) * (active >= 0 ? 0.03 : 0)
      // 置いてあるときは、革の上に細長い影
      restShadow.position.set(penRig.position.x - 0.1, 0.012, penRig.position.z + 0.14)
      restShadow.rotation.z = 0.9
      restShadow.material.opacity = active >= 0 ? 0 : 0.55 * penOn
    },
  }
}
