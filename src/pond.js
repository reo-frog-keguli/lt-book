// 見開き2：見開き全体が水槽。波の計算、屈折する水面、鯉（1匹）、睡蓮、蓮、ロボット
import * as THREE from 'three'
import { NOISE, CAUSTIC, rand, lerp, BOOK, LDIR } from './util.js'

const INSET = 0.004                              // 紙の余白（水槽はその内側）
export const TW = BOOK.PW * 2 - INSET * 2, TH = BOOK.PH - INSET * 2
const FLOOR_Y = -0.2, WATER_Y = -0.02           // ページ面(0)からの高さ
const SIM_W = 400, SIM_H = 250

const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s) }
const vnoise = (x, y) => {
  const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j
  const u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g)
  return lerp(lerp(hash(i, j), hash(i + 1, j), u), lerp(hash(i, j + 1), hash(i + 1, j + 1), u), v)
}

// ---------- 波（高さ場）。波の進みを魚より遅くして、かき分けた波が斜め後ろへ尾を引くようにする ----------
function makeSim(renderer) {
  const opt = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }
  let a = new THREE.WebGLRenderTarget(SIM_W, SIM_H, opt), b = new THREE.WebGLRenderTarget(SIM_W, SIM_H, opt)
  const drops = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0.05))
  const trail = new THREE.Vector3(-9, -9, 0)
  const mat = new THREE.ShaderMaterial({
    uniforms: { tPrev: { value: null }, px: { value: new THREE.Vector2(1 / SIM_W, 1 / SIM_H) }, drops: { value: drops }, trail: { value: trail } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D tPrev; uniform vec2 px; uniform vec4 drops[8]; uniform vec3 trail; varying vec2 vUv;
      void main(){
        vec4 c=texture2D(tPrev,vUv);
        vec4 l=texture2D(tPrev,vUv-vec2(px.x,0.)), r=texture2D(tPrev,vUv+vec2(px.x,0.)), d=texture2D(tPrev,vUv-vec2(0.,px.y)), u=texture2D(tPrev,vUv+vec2(0.,px.y));
        float avg=(l.r+r.r+d.r+u.r)*.25;
        float vel=(c.g+(avg-c.r)*.62)*.9875;
        float h=(c.r+vel)*.9985;
        for(int i=0;i<8;i++){ vec2 q=(vUv-drops[i].xy)*vec2(${(TW / TH).toFixed(3)},1.); float f=max(0.,1.-length(q)/drops[i].w); h+=drops[i].z*(.5-.5*cos(f*3.14159)); }
        // 泳いだ軌道：細い泡の筋がしばらく残る
        float tr=max(mix(c.b,(l.b+r.b+d.b+u.b)*.25,.3)*.985-.0015,0.);
        vec2 q=(vUv-trail.xy)*vec2(${(TW / TH).toFixed(3)},1.); tr=max(tr,trail.z*(1.-smoothstep(.003,.014,length(q))));
        gl_FragColor=vec4(h,vel,tr,1.);
      }`,
  })
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat))
  const queue = []
  return {
    get tex() { return a.texture },
    /** x,z: 水槽のローカル座標 */
    drop(x, z, strength, radius = 0.05) { if (queue.length < 40) queue.push([x / TW + 0.5, 0.5 - z / TH, strength, radius]) },
    mark(x, z, s = 1) { trail.set(x / TW + 0.5, 0.5 - z / TH, s) },
    step() {
      for (let i = 0; i < 8; i++) { const q = queue.shift(); if (q) drops[i].set(...q); else drops[i].set(0, 0, 0, 0.05) }
      mat.uniforms.tPrev.value = a.texture
      renderer.setRenderTarget(b); renderer.render(scene, cam); renderer.setRenderTarget(null)
      ;[a, b] = [b, a]
    },
  }
}

// ---------- 水面 ----------
function makeWater(blank) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tH: { value: null }, hpx: { value: new THREE.Vector2(1 / SIM_W, 1 / SIM_H) }, tScene: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
      tA: { value: blank }, tB: { value: blank }, uMix: { value: 0 }, uTime: { value: 0 }, uFade: { value: 1 },
      uLight: { value: LDIR.clone() }, uCam: { value: new THREE.Vector3() },
    },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: /* glsl */ `
      uniform sampler2D tH,tScene,tA,tB; uniform vec2 hpx,uRes; uniform float uMix,uTime,uFade; uniform vec3 uLight,uCam;
      varying vec2 vUv; varying vec3 vW;
      ${NOISE}
      ${CAUSTIC}
      vec2 gW; float gM,gFa;
      // 2枚の文字を、波紋と流れで入れ替える（歪みと境目は1回だけ計算して使い回す）
      vec4 txt(vec2 uv,float lod){ uv+=gW; vec4 a=textureLod(tA,uv,lod), b=textureLod(tB,uv,lod); a.a*=gFa; return mix(a,b,gM); }
      void main(){
        vec4 hc=texture2D(tH,vUv);
        float h=hc.r, tr=hc.b;
        float hL=texture2D(tH,vUv-vec2(hpx.x,0.)).r, hR=texture2D(tH,vUv+vec2(hpx.x,0.)).r;
        float hD=texture2D(tH,vUv-vec2(0.,hpx.y)).r, hU=texture2D(tH,vUv+vec2(0.,hpx.y)).r;
        vec2 g=vec2(hR-hL,hU-hD)*8.5;
        vec2 amb=(vec2(vn(vUv*vec2(14.,9.)+uTime*.16),vn(vUv*vec2(14.,9.)+7.-uTime*.13))-.5)*.05;
        gW=vec2(0.); gM=0.; gFa=1.;
        if(uMix>0.001){
          vec2 c=(vUv-.5)*vec2(1.6,1.); float d=length(c);
          float wob=sin(3.14159*uMix);
          vec2 fl=vec2(vn(vUv*4.5+uTime*.5)+.5*vn(vUv*9.-uTime*.4),vn(vUv*4.5+9.-uTime*.5)+.5*vn(vUv*9.+4.+uTime*.4))/1.5-.5;
          gW=(fl*.12+normalize(c+1e-4)*sin(d*46.-uMix*30.)*.011)*wob;
          float nz=vn(vUv*6.+uTime*.3)*.65+vn(vUv*13.+2.)*.35;
          gM=smoothstep(0.,.22,uMix*1.95-d-nz*.5);
          gFa=1.-smoothstep(0.,.5,uMix*1.4-nz*.4);
        }
        vec2 n2=g+amb;
        vec3 n=normalize(vec3(-n2.x,1.,n2.y));
        vec2 suv=gl_FragCoord.xy/uRes;
        vec3 refr=texture2D(tScene,suv+n2*.015).rgb;
        vec3 col=mix(refr*vec3(.68,.95,.85),s2l(vec3(.04,.21,.18)),.26);          // 濁りと深さ
        // 波と光が底に作る網。波が立つところでは網が歪んで集まる
        float ca=net(vUv*vec2(8.,5.)+n2*2.6,uTime*.5);
        col+=refr*ca*1.5+vec3(.6,.95,.78)*ca*.07;
        col+=vec3(.8,1.,.9)*clamp((4.*h-hL-hR-hU-hD)*3.,0.,.6)*.5;                  // 波の頂が集める光
        // 泳いだ軌道の泡
        float foam=tr*(.5+.5*vn(vUv*vec2(300.,190.)+uTime*.8));
        col=mix(col,s2l(vec3(.82,.94,.88)),clamp(foam*.55,0.,.6));
        // 文字：水面に浮き、底に影を落とす
        vec2 tuv=vec2(.5)+(vUv-.5)*vec2(${(TW / (BOOK.PW * 2)).toFixed(4)},${(TH / BOOK.PH).toFixed(4)})+n2*.024;   // 文字は見開き全体の座標で描かれている
        float sh=txt(tuv+vec2(.006,.014)+n2*.03,3.2).a;
        col*=1.-.5*sh*uFade;
        vec4 t=txt(tuv,0.); float glow=txt(tuv,4.5).a;
        vec3 tc=mix(s2l(vec3(.97,.94,.86)),s2l(t.rgb),.6);
        col+=s2l(vec3(.6,.95,.8))*glow*.2*uFade;
        col=mix(col,tc,clamp(t.a*1.15,0.,1.)*uFade);
        // 反射とハイライト
        vec3 V=normalize(uCam-vW); vec3 H=normalize(uLight+V);
        float fres=pow(1.-max(dot(n,V),0.),3.);
        col=mix(col,s2l(vec3(.80,.86,.80)),fres*.5+.03);
        vec3 ns=normalize(vec3(-(g.x*.5+amb.x*.35),1.,g.y*.5+amb.y*.35));
        col+=pow(max(dot(ns,H),0.),900.)*.7;
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(TW, TH), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = WATER_Y
  return { mesh, mat }
}

// ---------- 底と壁：深緑の大理石 ----------
function makeTank() {
  const mat = (side) => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0, side })
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLp=position;')
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vLp;\n${NOISE}
vec3 gmarble(vec2 p){ p*=1.5; vec2 q=p+1.5*vec2(fbm(p+3.1),fbm(p+7.7)); float v=fbm(q*1.2);
  float vein=pow(1.-abs(sin((q.x+q.y*.7)*2.3+v*5.)),18.), vein2=pow(1.-abs(sin((q.x*.6-q.y)*3.4+v*8.)),30.);
  vec3 base=mix(vec3(.035,.13,.105),vec3(.09,.27,.215),v);
  base=mix(base,vec3(.62,.78,.68),vein*.55); base=mix(base,vec3(.80,.70,.42),vein2*.3);
  return s2l(base*1.25); }`)
        .replace('#include <map_fragment>', 'diffuseColor.rgb=gmarble(vLp.xy+vLp.zz*.7);')
    }
    m.customProgramCacheKey = () => 'gmarble' + side
    return m
  }
  const g = new THREE.Group()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(TW, TH), mat(THREE.FrontSide))
  floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; floor.receiveShadow = true
  const wm = mat(THREE.BackSide), none = new THREE.MeshBasicMaterial({ visible: false })
  const walls = new THREE.Mesh(new THREE.BoxGeometry(TW - 0.004, -FLOOR_Y + 0.01, TH - 0.004), [wm, wm, none, none, wm, wm])
  walls.position.y = FLOOR_Y / 2 + 0.005; walls.receiveShadow = true
  g.add(floor, walls)
  return g
}

const fitTo = (obj, size, axis = 'max') => {
  const box = new THREE.Box3().setFromObject(obj), s = box.getSize(new THREE.Vector3())
  const k = size / (axis === 'max' ? Math.max(s.x, s.y, s.z) : s[axis])
  obj.scale.multiplyScalar(k)
  return { box: new THREE.Box3().setFromObject(obj), k }
}
const shadows = (o) => o.traverse((m) => { if (m.isMesh) { m.castShadow = true } })

// ---------- 鯉（生成モデル1匹。体をしならせて泳ぐ） ----------
function makeKoi(src) {
  const model = src.clone(true)
  const u = { uPh: { value: 0 }, uTurn: { value: 0 }, uZ0: { value: 0 }, uZ1: { value: 1 }, uAmp: { value: 0.05 } }
  const gb = new THREE.Box3()
  model.traverse((m) => {
    if (!m.isMesh) return
    m.geometry.computeBoundingBox(); gb.union(m.geometry.boundingBox)
    m.material = m.material.clone()
    m.material.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u)
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uPh,uTurn,uZ0,uZ1,uAmp;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float fs=clamp((uZ1-position.z)/(uZ1-uZ0),0.,1.);        // 0=頭 1=尾
          transformed.x+=(sin(fs*5.0-uPh)*(.08+fs*fs)+uTurn*fs*fs*2.2)*uAmp;`)
    }
    m.material.customProgramCacheKey = () => 'koi'
    m.castShadow = true
  })
  u.uZ0.value = gb.min.z; u.uZ1.value = gb.max.z; u.uAmp.value = (gb.max.z - gb.min.z) * 0.1
  const inner = new THREE.Group(); inner.add(model)
  const LEN = 0.66
  const { k } = fitTo(inner, LEN, 'z')
  inner.scale.y *= 0.55                      // 浅い水槽に収まるよう、背の高さだけ抑える
  const c = new THREE.Box3().setFromObject(inner).getCenter(new THREE.Vector3())
  inner.position.sub(c)
  const rig = new THREE.Group(); rig.add(inner)
  const lim = { x: TW / 2 - 0.32, z: TH / 2 - 0.3 }
  const f = {
    rig, x: 0.6, z: 0.3, th: Math.PI, speed: 0.44, y: (FLOOR_Y + WATER_Y) / 2 - 0.012,
    update(dt, t, sim) {
      let want = (vnoise(t * 0.18 + 3.3, 1.7) - 0.5) * 2.2
      const edge = Math.max(Math.abs(this.x / lim.x), Math.abs(this.z / lim.z))
      if (edge > 0.7) {
        let d = Math.atan2(-this.z, -this.x) - this.th; d = Math.atan2(Math.sin(d), Math.cos(d))
        want += d * (edge - 0.7) * 10
      }
      const turn = THREE.MathUtils.clamp(want, -1.4, 1.4)
      this.th += turn * dt
      const sp = this.speed * (0.82 + 0.36 * vnoise(t * 0.25 + 9, 3))
      this.x = THREE.MathUtils.clamp(this.x + Math.cos(this.th) * sp * dt, -lim.x - 0.15, lim.x + 0.15)
      this.z = THREE.MathUtils.clamp(this.z + Math.sin(this.th) * sp * dt, -lim.z - 0.15, lim.z + 0.15)
      u.uPh.value += dt * (3.5 + sp * 16)
      u.uTurn.value = lerp(u.uTurn.value, -turn * 0.4, 1 - Math.exp(-dt * 4))
      rig.position.set(this.x, this.y, this.z)
      rig.rotation.y = Math.PI / 2 - this.th
      // かき分ける波：頭が水を押し上げ、尾の後ろが沈む。波より速く進むので、斜め後ろへV字の尾を引く
      const cx = Math.cos(this.th), cz = Math.sin(this.th), q = sp / 0.44
      sim.drop(this.x + cx * LEN * 0.4, this.z + cz * LEN * 0.4, 0.05 * q, 0.03)
      sim.drop(this.x - cx * LEN * 0.34, this.z - cz * LEN * 0.34, -0.034 * q, 0.036)
      sim.mark(this.x - cx * LEN * 0.42, this.z - cz * LEN * 0.42, 0.85)
    },
  }
  return f
}

// ---------- 睡蓮の葉と蓮の花（生成モデル） ----------
function makePads(padSrc, lotusSrc) {
  const g = new THREE.Group(), list = []
  for (const [x, z, d, lotus] of [[1.08, 0.5, 0.6, 0.4], [0.7, -0.62, 0.42, 0], [1.26, -0.3, 0.28, 0], [-0.3, 0.66, 0.34, 0], [-0.7, -0.6, 0.46, 0.32]]) {
    const holder = new THREE.Group()
    const pad = padSrc.clone(true); shadows(pad)
    const inner = new THREE.Group(); inner.add(pad)
    const { box } = fitTo(inner, d, 'x')
    const c = box.getCenter(new THREE.Vector3())
    inner.position.set(-c.x, -box.min.y - (box.max.y - box.min.y) * 0.45, -c.z)   // 厚みの半分近くを水に沈める
    holder.add(inner)
    if (lotus) {
      const fl = lotusSrc.clone(true); shadows(fl)
      const fi = new THREE.Group(); fi.add(fl)
      const fb = fitTo(fi, lotus, 'x').box
      const fc = fb.getCenter(new THREE.Vector3())
      fi.position.set(-fc.x + d * 0.12, -fb.min.y - (fb.max.y - fb.min.y) * 0.42, -fc.z - d * 0.1)   // 茎は水の下へ
      holder.add(fi)
    }
    holder.position.set(x, WATER_Y, z)
    holder.rotation.y = rand(0, 6.28)
    g.add(holder)
    list.push({ holder, x, z, ph: rand(0, 6.28), r0: holder.rotation.y })
  }
  return {
    group: g,
    update(t) {
      for (const p of list) {
        p.holder.position.x = p.x + Math.sin(t * 0.21 + p.ph) * 0.02; p.holder.position.z = p.z + Math.cos(t * 0.17 + p.ph) * 0.016
        p.holder.position.y = WATER_Y + Math.sin(t * 0.8 + p.ph) * 0.004
        p.holder.rotation.y = p.r0 + Math.sin(t * 0.13 + p.ph) * 0.14
        p.holder.rotation.z = Math.sin(t * 0.9 + p.ph) * 0.02; p.holder.rotation.x = Math.cos(t * 0.7 + p.ph) * 0.016
      }
    },
  }
}

// ---------- ロボット（骨格つき）。水面の上に浮かび、文字が出たら画面中央へ向いて指をさす ----------
function makeRobot(makeBot) {
  const bot = makeBot(0.62, { mirror: true })     // 左右反転：指さす腕を、文字のある右側へ
  const g = new THREE.Group(); g.add(bot.group)
  bot.group.position.y = -0.31
  const rig = new THREE.Group(); rig.add(g)
  const HOME = new THREE.Vector3(-1.12, 0.36, 0.04)
  rig.position.copy(HOME)
  let pointing = 0, turn = 0
  return {
    rig, HOME, bot,
    point() { pointing = 1; bot.play('point', { loop: false, fade: 0.4 }) },
    rest() { pointing = 0; bot.pose('point', 0) },
    update(t, dt) {
      const p = ((t % 6) / 6) * Math.PI * 2
      rig.position.y = HOME.y + Math.sin(p * 2) * 0.03
      turn = lerp(turn, pointing, 1 - Math.exp(-dt * 3))
      // 正面を真上のカメラへ向ける。指さすときは、画面中央の方へ体を向ける
      g.rotation.set(-Math.PI / 2 + 0.55 + Math.sin(p) * 0.05, lerp(0.15 + Math.sin(p) * 0.15, 0.5, turn), Math.sin(p * 2 + 1) * 0.05 * (1 - turn), 'YXZ')
      bot.update(dt)
    },
  }
}

// ---------- まとめ ----------
export function makePond(renderer, blankTex, models, makeBot) {
  const group = new THREE.Group()   // 原点＝のど、ページ面の高さ
  group.visible = false
  const sim = makeSim(renderer)
  const water = makeWater(blankTex)
  const tank = makeTank()
  const pads = makePads(models.pad, models.lotus)
  const robot = makeRobot(makeBot)
  const koi = makeKoi(models.koi)
  group.add(tank, koi.rig, water.mesh, pads.group, robot.rig)
  const rt = new THREE.WebGLRenderTarget(4, 4, { samples: 4 })
  water.mat.uniforms.tScene.value = rt.texture
  let last = 0
  return {
    group, sim, water, robot, rt, pads: pads.group, koi,
    setSize(w, h) { rt.setSize(Math.max(4, Math.round(w * 0.5)), Math.max(4, Math.round(h * 0.5))); water.mat.uniforms.uRes.value.set(w, h) },
    update(dt, t, camera) {
      koi.update(dt, t, sim)
      pads.update(t); robot.update(t, dt)
      if (t - last > 2.4) { last = t; sim.drop(robot.HOME.x, robot.HOME.z, 0.022, 0.06) }
      sim.step()
      water.mat.uniforms.tH.value = sim.tex
      water.mat.uniforms.uTime.value = t
      water.mat.uniforms.uCam.value.copy(camera.position)
    },
    /** 水面を除いた景色を先に描き、水面はそれを屈折させて描く */
    renderUnder(scene, camera, hide = []) {
      for (const o of hide) o.visible = false
      water.mesh.visible = false
      renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null)
      water.mesh.visible = true
      for (const o of hide) o.visible = true
    },
  }
}
