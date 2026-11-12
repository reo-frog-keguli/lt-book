import '@fontsource/shippori-mincho/500.css'
import '@fontsource/shippori-mincho/800.css'
import '@fontsource/cormorant-garamond/500-italic.css'
import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/zen-kurenaido/400.css'
import './style.css'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { tw, wait, ease, updateTweens, flushTweens, lerp, clamp01, BOOK, LDIR } from './util.js'
import { supported, grab, drawLive, stageCanvas, texOf, blankCanvas, setupPpt, SW, SH, SCALE } from './capture.js'
import { makeDesk, makeLaptop, makeBook } from './props.js'
import { makePageMaterials, makeFlipPage, makePieces, makeSlash, makeScribble } from './spread1.js'
import { makeBotFactory, BLOBS } from './bot.js'
import { makePond } from './pond.js'
import { makeSky } from './sky.js'
import { makeBlueprint } from './blueprint.js'
import { makePopup } from './popup.js'
import { makeIsles } from './isles.js'
import { makeLetters, sheetRect } from './letters.js'

const $ = (id) => document.getElementById(id)
const fail = (msg) => { const e = $('err'); e.style.display = 'block'; e.textContent = msg }
const q = new URLSearchParams(location.search)

async function boot() {
  if (!supported) { fail('このページは Chrome 157 以降（HTML-in-Canvas 対応）専用です。'); return }
  const SCR = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789#$%&<>/=+*ΔΣΩλ'
  const stageText = document.getElementById('stage').textContent
  await Promise.all([
    document.fonts.load('500 30px "Shippori Mincho"', stageText + SCR),
    document.fonts.load('800 30px "Shippori Mincho"', stageText + '生成する自律的な実行' + SCR),
    document.fonts.load('400 30px "Zen Kurenaido"', stageText),
    document.fonts.load('italic 500 30px "Cormorant Garamond"', stageText + 'We write our own page, one day at a time'),
    document.fonts.load('500 30px "Cormorant Garamond"', stageText + 'header hero image h1 p card submit →'),
  ]).catch(() => {})

  // ---- 描画の土台 ----
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  const DPR = Math.min(window.devicePixelRatio || 1, +(q.get('dpr') || 1.25))
  renderer.setPixelRatio(DPR)
  renderer.shadowMap.enabled = true
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  $('gl').appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  const BG = 0xe4d9c6
  scene.background = new THREE.Color(BG)
  scene.fog = new THREE.Fog(BG, 16, 46)
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.6
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 120)
  // 光は右奥の上から。影は左手前へ伸びる
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6)
  sun.position.copy(LDIR).multiplyScalar(14).add(new THREE.Vector3(-1, 0, 0))
  sun.target.position.set(-1, 0, 0)
  sun.castShadow = true
  sun.shadow.mapSize.set(1536, 1536)
  Object.assign(sun.shadow.camera, { left: -7, right: 6, top: 5, bottom: -5, near: 1, far: 30 })
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.012
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xfff6ea, 0xb9a487, 0.75))
  const desk = makeDesk()
  scene.add(desk)

  // ---- 生成モデルの読み込み ----
  const loader = new GLTFLoader()
  const names = ['koi', 'lotus', 'pad', 'robot', 'blocks', 'plug2', 'scroll', 'puzzle']
  const gl = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await loader.loadAsync(`${import.meta.env.BASE_URL}models/${n}.glb`)])))
  const models = Object.fromEntries(names.map((n) => [n, gl[n].scene]))
  const makeBot = makeBotFactory({ still: gl.robot })

  // ---- HTMLの取り込み ----
  // 便箋の文字：HTML側の箱を、立体の便箋と同じ位置・大きさに合わせてから測る
  const lineSets = [0, 1].map((i) => {
    const r = sheetRect(i), el = $('letter' + i)
    Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' })
    return [...el.querySelectorAll('.hw')].map((ln) => {
      const b = ln.getBoundingClientRect(), o = el.getBoundingClientRect()
      return { x0: (b.left - o.left) / o.width - 0.01, x1: (b.right - o.left) / o.width + 0.01, yc: 1 - ((b.top + b.bottom) / 2 - o.top) / o.height, hh: b.height / 2 / o.height + 0.012 }
    })
  })
  const ppt = setupPpt()
  const ids = ['L_head', 'L_a', 'L_b', 'L_p3', 'L_p4', 'L_s3h', 'L_s3a', 'L_s3b', 'L_s4h', 'L_s4a', 'L_s4b', 'L_s4c', 'L_s5h', 'L_s5a', 'L_s5b', 'L_s5c', 'L_s6h', 'L_s6a', 'L_s6b', 'L_s6c', 'L_s7h', 'L_s7a', 'L_s8h', 'L_s8a']
  const cv = {}
  for (const id of ids) cv[id] = await grab($(id))
  const T = (id) => texOf(cv[id])
  await ppt.ready
  const pptTex = texOf(ppt.snap, false)             // 隠す前の絵の控えを画面に貼る（引いても見た目が変わらない）
  const blankTex = texOf(blankCanvas(), false)
  // 暗号化の文字は毎コマ取り込むので、軽い（等倍の）canvasへ写してから使う
  const liveCanvas = document.createElement('canvas'); liveCanvas.width = SW; liveCanvas.height = SH
  const liveCtx = liveCanvas.getContext('2d')
  const liveTex = texOf(liveCanvas, true)
  const tP3 = T('L_p3'), tP4 = T('L_p4')
  const tS3 = [T('L_s3h'), T('L_s3a'), T('L_s3b')]
  const tS4 = [T('L_s4h'), T('L_s4a'), T('L_s4b'), T('L_s4c')]
  const tS5 = [T('L_s5h'), T('L_s5a'), T('L_s5b'), T('L_s5c')]
  const cS6ab = document.createElement('canvas'); cS6ab.width = cv.L_s6a.width; cS6ab.height = cv.L_s6a.height
  cS6ab.getContext('2d').drawImage(cv.L_s6a, 0, 0); cS6ab.getContext('2d').drawImage(cv.L_s6b, 0, 0)
  const tS6 = [T('L_s6h'), T('L_s6a'), T('L_s6b'), T('L_s6c'), texOf(cS6ab)]
  const tS7h = T('L_s7h'), tS8 = [T('L_s8h'), T('L_s8a')]
  const scrCanvas = document.createElement('canvas'); scrCanvas.width = SW * SCALE; scrCanvas.height = SH * SCALE
  const scrTex = texOf(scrCanvas, false)
  const lis = [...document.querySelectorAll('#bul li span')].map((e) => e.getBoundingClientRect())
  const scribble = makeScribble(scrCanvas, lis.map((r) => (r.top + r.bottom) / 2), Math.min(...lis.map((r) => r.left)) - 20, Math.max(...lis.map((r) => r.right)))

  // ---- 立体 ----
  const aspect = THREE.MathUtils.clamp(innerWidth / innerHeight, 1.45, 2.2)
  const laptop = makeLaptop(pptTex, aspect)
  const LAP_Z = 1.5
  laptop.group.position.set(0, 0, LAP_Z)
  scene.add(laptop.group)
  const mats = makePageMaterials(T('L_head'), T('L_a'), T('L_b'), scrTex)
  const u = mats.shared, uL = mats.pageL.uniforms, uR = mats.pageR.uniforms
  const book = makeBook(mats)
  const BZ = -1.7
  const closedPose = { x: -0.55, ry: 0.2 }
  book.root.position.set(closedPose.x, 0, BZ)
  book.root.rotation.y = closedPose.ry
  scene.add(book.root)
  const pond = makePond(renderer, blankTex, models, makeBot)
  const sky = makeSky(), bp = makeBlueprint()
  const popup = makePopup(models.blocks, makeBot)
  const isles = makeIsles(models, makeBot)
  const letters = makeLetters(T('L_s7a'), lineSets)
  for (const o of [pond, sky, bp, popup, isles, letters]) book.pivot.add(o.group)
  // 見開き8の隅に座る小さなロボット
  const endBot = makeBot(0.36, { shadow: 0.3 })
  endBot.group.position.set(1.12, 0.06, 0.52); endBot.group.rotation.set(-0.95, -0.3, 0)
  endBot.group.scale.setScalar(0.001); endBot.group.visible = false
  book.pivot.add(endBot.group)
  // めくれるページ（1枚を使い回す）
  const sheet = makeFlipPage(mats.flip)
  sheet.mesh.visible = false; sheet.mesh.renderOrder = 6
  // ---- 水槽の写し絵：本物の水槽を真上から写して、ページに刷る ----
  const snapRT = new THREE.WebGLRenderTarget(4, 4, { samples: 4, type: THREE.HalfFloatType })
  u.tPond.value = snapRT.texture
  const snapCam = new THREE.PerspectiveCamera(30, ((BOOK.PW - 0.05) * 2) / BOOK.PH, 0.05, 60)     // 本番の真上視点と同じ高さから、見開きぴったりに写す（底のつやや壁の見え方が本物と揃う）
  let pondShift = 0
  /** いまの水槽を、見開きぴったりの絵として写す。warm: 水面を落ち着かせるための空回し回数 */
  const snapPond = (warm = 0) => {
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2())
    if (snapRT.width !== sz.x || snapRT.height !== sz.y) snapRT.setSize(sz.x, sz.y)
    const keep = { vis: pond.group.visible, hL: uL.uHole.value, hR: uR.uHole.value, kL: uL.uKind.value, kR: uR.uKind.value, sheet: sheet.mesh.visible, hol: !!book.blockL.userData.hollowOn }
    pond.group.visible = true; sheet.mesh.visible = false
    uL.uKind.value = 6; uR.uKind.value = 6; uL.uHole.value = 1; uR.uHole.value = 1
    hollow(true)
    const c = book.pivot.getWorldPosition(new THREE.Vector3())
    const hgt = topPose().pos.y - BOOK.H
    snapCam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(BOOK.PH / 2 / hgt)); snapCam.updateProjectionMatrix()
    snapCam.position.set(c.x, c.y + hgt, c.z); snapCam.up.set(0, 0, -1); snapCam.lookAt(c.x, c.y, c.z); snapCam.updateMatrixWorld()
    const pt = time - pondShift
    for (let i = warm; i > 0; i--) pond.update(1 / 60, pt - i / 60, snapCam)
    pond.update(0, pt, snapCam)
    u.tPond.value = blankTex            // 写している最中は、写し先の絵を紙面から外す（自分自身を読みながら描かない）
    pond.renderUnder(scene, snapCam, [desk, laptop.group])
    renderer.setRenderTarget(snapRT); renderer.clear(); renderer.render(scene, snapCam); renderer.setRenderTarget(null)
    u.tPond.value = snapRT.texture
    pond.group.visible = keep.vis; sheet.mesh.visible = keep.sheet
    uL.uKind.value = keep.kL; uR.uKind.value = keep.kR; uL.uHole.value = keep.hL; uR.uHole.value = keep.hR
    if (!keep.hol) hollow(false)
    return pt
  }
  const coverPond = (page, on) => { page.renderOrder = on ? 5 : 0; page.material.depthFunc = on ? THREE.AlwaysDepth : THREE.LessEqualDepth }
  book.pivot.add(sheet.mesh)
  /** 右のページを1枚めくる。表と裏の面の種類を渡す。onLand は着地した同じコマの中で呼ぶ（前の左ページが一瞬見えるのを防ぐ） */
  const flipOne = (dur, frontKind = 0, backKind = 0, onLand, floor = -9, onStep) => {
    mats.flip.uniforms.uFrontKind.value = frontKind; mats.flip.uniforms.uBackKind.value = backKind
    let landed = false
    return tw(dur, (k) => {
      if (k >= 1) { if (!landed) { landed = true; onLand?.() } sheet.mesh.visible = false; return }
      sheet.mesh.visible = true; sheet.update(k, 0.006, u.uBulge.value, floor); onStep?.(k)
    }, { e: ease.io3 })
  }
  /** 次の見開きへ：右ページを次の絵柄に替えてめくり、着地の瞬間に左ページと文字を入れ替える */
  const turnTo = (fromKind, toKind, texs, dur = 1.7) => {
    uR.uKind.value = toKind; uR.uInkOn.value = 0
    return flipOne(dur, fromKind, toKind, () => {
      u.tHead.value = texs[0] ?? blankTex; u.tA.value = texs[1] ?? blankTex; u.tB.value = texs[2] ?? blankTex
      u.pHead.value = 0; u.pA.value = 0; u.pB.value = 0
      uL.uKind.value = toKind; uR.uInkOn.value = 1
    })
  }

  // ---- カメラと操作 ----
  // Space（→・Enter）で次へ。クリックは場面の中の操作に使う。Shiftを押している間はカメラが止まり、カーソルの効果だけが動く
  const cam = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), roll: 0, orbit: 0 }
  let orbitS = 0, zoom = 1, zoomS = 1, shift = false
  const mouse = new THREE.Vector2(), camMouse = new THREE.Vector2(), mouseS = new THREE.Vector2(), curS = new THREE.Vector2(), ndc = new THREE.Vector2()
  const setMouse = (e) => { mouse.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1); shift = e.shiftKey; if (!shift && !letters.dragging) camMouse.copy(mouse) }
  addEventListener('pointermove', (e) => { setMouse(e); if (letters.dragging) letters.move(ndc.set(mouse.x, -mouse.y), camera) })
  addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    setMouse(e); ndc.set(mouse.x, -mouse.y)
    if (bp.group.visible && bp.hover(ndc, camera)) bp.press(time)
    else if (letters.group.visible && !busy) letters.grab(ndc, camera)
  })
  addEventListener('pointerup', () => letters.release())
  addEventListener('wheel', (e) => { e.preventDefault(); zoom = THREE.MathUtils.clamp(zoom * Math.exp(e.deltaY * 0.0012), 0.32, 1.9) }, { passive: false })
  const TAN = Math.tan(THREE.MathUtils.degToRad(35 / 2))
  const screenPose = () => {
    scene.updateMatrixWorld(true)
    const c = laptop.screen.getWorldPosition(new THREE.Vector3())
    const n = new THREE.Vector3(0, 0, 1).transformDirection(laptop.screen.matrixWorld)
    const up = new THREE.Vector3(0, 1, 0).transformDirection(laptop.screen.matrixWorld)
    const a = innerWidth / innerHeight
    const d = Math.min(laptop.SHt / 2 / TAN, laptop.SWd / 2 / TAN / a)
    return { pos: c.clone().addScaledVector(n, d), tgt: c, up }
  }
  const topPose = () => {
    const a = innerWidth / innerHeight
    const d = Math.max((BOOK.PH / 2 + 0.09) * 1.13, ((BOOK.PW + 0.09) * 1.07) / a) / TAN
    return { pos: new THREE.Vector3(0, BOOK.H + d, BZ + d * 0.02), tgt: new THREE.Vector3(0, BOOK.H, BZ), up: new THREE.Vector3(0, 0, -1) }
  }
  const heroPose = () => ({ pos: new THREE.Vector3(-1.75, 3.05, 3.1), tgt: new THREE.Vector3(-1.35, 0.12, -1.25), up: new THREE.Vector3(0, 1, 0) })
  const setCam = (p) => { cam.pos.copy(p.pos); cam.tgt.copy(p.tgt); cam.up.copy(p.up) }
  const moveCam = (to, dur, e = ease.io3, extra) => {
    const p0 = cam.pos.clone(), t0 = cam.tgt.clone(), u0 = cam.up.clone()
    return tw(dur, (k, raw) => {
      cam.pos.lerpVectors(p0, to.pos, k); cam.tgt.lerpVectors(t0, to.tgt, k); cam.up.lerpVectors(u0, to.up, k).normalize()
      extra?.(k, raw)
    }, { e })
  }
  let currentTop = false
  const resize = () => {
    const w = innerWidth, h = innerHeight
    renderer.setSize(w, h)
    camera.aspect = w / h; camera.updateProjectionMatrix()
    const s = renderer.getDrawingBufferSize(new THREE.Vector2())
    pond.setSize(s.x, s.y)
    if (step === 0) setCam(screenPose())
    else if (currentTop && !busy) setCam(topPose())
  }

  // ---- 文字の暗号化／復号（本物のHTMLを書き換え、毎コマ取り込む） ----
  const liveEl = $('liveText'), liveLayer = $('L_live')
  let liveFrames = 0
  const glyph = () => SCR[(Math.random() * SCR.length) | 0]
  const esc = (c) => (c === '<' ? '&lt;' : c === '&' ? '&amp;' : c)
  function renderScramble(text, k, dir) {
    const chars = [...text], n = chars.length, c = (n - 1) / 2, span = 0.55, each = 0.45
    let html = ''
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(i - c) / Math.max(c, 0.5)
      const st = dir > 0 ? dist * span : (1 - dist) * span
      const lk = (k - st) / each
      if (dir > 0) { if (lk <= 0) continue; html += lk >= 0.999 ? esc(chars[i]) : `<span class="sc">${esc(glyph())}</span>` }
      else { if (lk >= 0.999) continue; html += lk <= 0 ? esc(chars[i]) : `<span class="sc">${esc(glyph())}</span>` }
    }
    liveEl.innerHTML = html
  }
  let scrTick = 0
  const scramble = (text, dir, dur) => tw(dur, (k) => {
    liveFrames = 20
    const tick = Math.floor(performance.now() / 48)
    if (tick !== scrTick || k >= 1) { scrTick = tick; renderScramble(text, k, dir) }
  }, { e: ease.lin })

  // ---- 進行 ----
  let step = 0, busy = false, time = 0
  const hud = $('hud'), hero = $('hero')
  const TOTAL = 28
  const wu = pond.water.mat.uniforms
  const none = new THREE.MeshBasicMaterial({ visible: false })
  const hollow = (on, which = [book.blockL, book.blockR]) => {       // 水槽のあいだ、本の厚みの上面と内側の面を消す（片側だけも可）
    for (const b of which) {
      b.userData.hollowOn = on
      if (on) { b.userData.full ??= b.material; b.material = b.userData.full.map((m, i) => (i === 2 || i === (b === book.blockL ? 0 : 1) ? none : m)) }
      else if (b.userData.full) b.material = b.userData.full
    }
  }
  const fadeInk = (k) => { u.pHead.value = Math.min(u.pHead.value, 1 - k); u.pA.value = Math.min(u.pA.value, 1 - k); u.pB.value = Math.min(u.pB.value, 1 - k) }
  const inkIn = (name, dur = 1.6, delay = 0) => tw(dur, (k) => { u[name].value = k }, { delay, e: ease.o3 })

  const steps = [
    // 1: パワポ画面 → カメラが揺れながら引く → PCが閉じて脇へ → 本（Hero）
    async () => {
      ppt.hide(); pptTex.needsUpdate = true
      const k1 = { pos: new THREE.Vector3(1.9, 3.9, 9.4), tgt: new THREE.Vector3(0, 0.75, 0.2), up: new THREE.Vector3(0, 1, 0) }
      await moveCam(k1, 3.4, ease.io3, (k, raw) => {
        cam.roll = Math.sin(raw * Math.PI * 2.6) * 0.075 * (1 - raw) * Math.min(1, raw * 6)
        cam.pos.x += Math.sin(raw * Math.PI) * -1.5
        cam.pos.y += Math.sin(raw * Math.PI) * 0.5
      })
      await wait(0.25)
      const closing = tw(1.25, (k) => { laptop.setLid(lerp(104, 0, k)); laptop.screenMat.color.setScalar(1 - clamp01((k - 0.35) / 0.4)) }, { e: ease.io3 })
      tw(1.25, (k) => { cam.roll = Math.sin(k * Math.PI) * -0.02 }, { e: ease.lin })
      await closing
      tw(1.9, (k) => { laptop.group.position.x = lerp(0, -5.8, k); laptop.group.rotation.y = lerp(0, 0.32, k); laptop.group.position.z = lerp(LAP_Z, LAP_Z + 0.5, k) }, { e: ease.io3 })
      tw(0.9, () => hero.classList.add('on'), { delay: 1.5 })
      await moveCam(heroPose(), 2.6, ease.io3)
      cam.orbit = 0.45
    },
    // 2: 留め金がパカっと開いて卓上に寝る → 本が開く → 遊び紙を1枚めくる → 題字が現れ、右上から陽が差す
    async () => {
      hero.classList.remove('on')
      cam.orbit = 0
      tw(1.4, (k) => { laptop.group.position.x = lerp(-5.8, -10, k) }, { e: ease.i2 })
      tw(1.0, (k) => book.setStrap(k), { e: ease.io2 })
      tw(2.3, (k) => { book.root.position.x = lerp(closedPose.x, 0, k); book.root.rotation.y = lerp(closedPose.ry, 0, k) }, { delay: 0.7, e: ease.io3 })
      tw(2.3, (k) => book.setOpen(k), { delay: 0.95, e: ease.io3 })
      tw(1.2, (k) => { book.coverMat.emissiveIntensity = 0.1 + Math.sin(k * Math.PI) * 0.8 }, { e: ease.lin })
      const camMove = moveCam(topPose(), 3.8, ease.io3, (k, raw) => { const a = Math.sin(raw * Math.PI); cam.pos.y += a * 2.4; cam.pos.z += a * 2.2; cam.pos.x += a * 0.9; cam.roll = a * 0.06 })
      await wait(3.3)
      await flipOne(1.25)
      inkIn('pHead', 1.5); inkIn('pA', 1.7, 0.5)
      tw(2.4, (k) => { u.uSun.value = k }, { delay: 0.4, e: ease.io2 })
      await camMove
      currentTop = true; cam.orbit = 1
      await wait(1.6)
    },
    // 3: 本文が沈んで滲み、箇条書きが滲み出る
    async () => {
      tw(1.5, (k) => { u.pA.value = 1 - k }, { e: ease.i2 })
      await inkIn('pB', 1.9, 0.95)
    },
    // 4: 箇条書きを黒いクレヨンで塗りつぶす → 左ページを手で破り捨てる → 右ページを1枚めくる → めくり終えてから水槽が現れる
    async () => {
      await tw(2.2, (k) => { if (scribble.draw(k)) scrTex.needsUpdate = true; cam.roll = Math.sin(k * 90) * 0.003 }, { e: ease.lin })
      cam.roll = 0
      await wait(0.5)
      tw(0.6, (k) => { u.uSun.value = 1 - k }, { e: ease.lin })
      // 破る：紙片は今の紙面（題字・箇条書き・落書き）をそのまま持つ。下には、まっさらな次の紙
      const torn = makePieces(mats.piece, { mode: 'tear' })
      mats.piece.uniforms.uKind.value = 0
      book.pivot.add(torn.group)
      uL.uInkOn.value = 0
      tw(0.6, (k) => { cam.roll = Math.sin(k * Math.PI * 7) * 0.01 * (1 - k) }, { e: ease.lin })
      await tw(torn.DUR, (k) => torn.update(k * torn.DUR), { e: ease.lin })
      book.pivot.remove(torn.group)
      u.pHead.value = 0; u.pA.value = 0; u.pB.value = 0
      scribble.clear(); scrTex.needsUpdate = true
      uL.uInkOn.value = 1
      await wait(0.2)
      // 次の見開き（水槽）の絵を、先にページへ刷っておく。水槽そのものは、まだ動かさない
      pond.robot.rig.scale.setScalar(0.001)
      pond.pads.scale.y = 0.001; pond.pads.position.y = -0.06
      pondShift = 0
      const snapT = snapPond(12)
      // 他の見開きと同じ、ふつうの1枚めくり。めくる紙の裏と、その下の右ページが、水槽の見開き
      await turnTo(0, 6, [], 1.8)
      // 水槽ページが一番上に来た。ここから本物の水槽が動き出す（写した瞬間の続きから）
      pondShift = time - snapT
      pond.group.visible = true; hollow(true)
      uL.uFloorY.value = 0.004; uR.uFloorY.value = 0.004; coverPond(book.pageL, true); coverPond(book.pageR, true)
      await tw(0.55, (k) => { uL.uHole.value = k; uR.uHole.value = k }, { e: ease.io2 })
      uL.uFloorY.value = -9; uR.uFloorY.value = -9; coverPond(book.pageL, false); coverPond(book.pageR, false)
      pond.sim.drop(0, 0, 0.1, 0.14)
      tw(1.1, (k) => { pond.pads.scale.y = Math.max(0.001, k); pond.pads.position.y = lerp(-0.06, 0, Math.min(1, k * 4)) }, { delay: 0.1, e: ease.o5 })
      await tw(0.9, (k) => pond.robot.rig.scale.setScalar(Math.max(0.001, k)), { delay: 0.3, e: ease.o5 })
    },
    // 5: 「生成する」→ 暗号化して消え →「自律的な実行」。ロボットが画面中央を向いて、文字を指さす
    async () => {
      wu.tA.value = liveTex; wu.tB.value = blankTex; wu.uMix.value = 0
      pond.sim.drop(0, 0, 0.06, 0.1)
      pond.robot.point()
      await scramble('生成する', 1, 1.25)
    },
    // 「生成する」が暗号化して消え →「自律的な実行」
    async () => {
      await scramble('生成する', -1, 1.0)
      pond.sim.drop(0, 0, -0.05, 0.12)
      await wait(0.25)
      await scramble('自律的な実行', 1, 1.45)
      await wait(0.2)
    },
    // 6: 波紋と流れで「専門知識→プロンプト」へ
    async () => { await fluidTo(tP3) },
    // 7: 同じ演出で工程の流れへ
    async () => { await fluidTo(tP4) },
    // 8: 水槽を閉じて1枚めくる → 見開き3「星図」。金の題字、浮かぶ星、流れ星
    async () => {
      tw(0.5, (k) => { wu.uFade.value = 1 - k }, { e: ease.io2 })
      await tw(0.6, (k) => { pond.pads.scale.y = Math.max(0.001, 1 - k); pond.pads.position.y = -0.06 * k; pond.robot.rig.scale.setScalar(Math.max(0.001, 1 - k)) }, { e: ease.io2 })
      // 水槽を止めて、いまの姿をページの絵に戻す（同じ絵なので切り替わりは見えない）。そのあと、ふつうに1枚めくる
      snapPond()
      uL.uKind.value = 6; uR.uKind.value = 6; uL.uHole.value = 0; uR.uHole.value = 0
      pond.group.visible = false; hollow(false); pond.robot.rest()
      wu.tA.value = blankTex; wu.uFade.value = 1
      await turnTo(6, 2, tS3, 1.8)
      sky.group.visible = true; sky.setMeteors(true)
      tw(1.8, (k) => sky.setFade(k), { e: ease.o3 })
      await inkIn('pHead', 1.7, 0.35)
    },
    // 9: 最初の星座「道しるべ」＝AIが最初に読む共通の指示
    async () => {
      inkIn('pA', 1.3, 1.1)
      await tw(2.0, (k) => sky.draw(0, k), { e: ease.io2 })
      await wait(0.5)
    },
    // 10: 2つのルールが星座になる
    async () => {
      inkIn('pB', 1.6, 1.4)
      await tw(1.7, (k) => sky.draw(1, k), { e: ease.io2 })
      await tw(1.7, (k) => sky.draw(2, k), { e: ease.io2 })
    },
    // 11: 青い光の筋が降りそそいで夜空のページを切り刻む → 紙吹雪が舞い上がり、下から霧の青写真が現れる
    async () => {
      sky.setMeteors(false)
      // 光の筋が1本走るたび、その軌跡で見開きが文字ごと斬れて、両側が少し掃ける。斬れ目の奥には、もう霧のページがある
      const cut = makeSlash(mats.piece)
      mats.piece.uniforms.uKind.value = 2; mats.piece.uniforms.uDissolve.value = 0; mats.piece.transparent = true
      book.pivot.add(cut.group)
      uL.uKind.value = 3; uR.uKind.value = 3; uL.uInkOn.value = 0; uR.uInkOn.value = 0
      bp.group.visible = true; bp.setClear(0); bp.draw(0); bp.setFog(1)
      tw(cut.tEnd, (k) => { sky.setFade(1 - k); for (let i = 0; i < 3; i++) sky.draw(i, 1 - k) }, { e: ease.i2 })
      await tw(cut.DUR, (k) => {
        const t = k * cut.DUR
        cut.update(t); sky.slashAt(cut.cuts, t, cut.REACH)
        let roll = 0                                             // 斬られるたびに、画面が小さく揺れる
        for (const c of cut.cuts) { const x = t - c.t0 - 0.06; if (x > 0) roll += Math.sin(x * 60) * 0.011 * Math.exp(-x * 10) * c.sgn }
        cam.roll = roll
      }, { e: ease.lin })
      cam.roll = 0; mats.piece.transparent = false; mats.piece.uniforms.uDissolve.value = 0
      book.pivot.remove(cut.group)
      sky.group.visible = false
      u.tHead.value = tS4[0]; u.tA.value = tS4[1]; u.tB.value = tS4[2]
      u.pHead.value = 0; u.pA.value = 0; u.pB.value = 0
      uL.uInkOn.value = 1; uR.uInkOn.value = 1
      u.uLens.value = 1; u.uLensInk.value = 1
      inkIn('pHead', 1.6, 0.2)
      await tw(1.4, (k) => { u.pA.value = k * 0.46 }, { delay: 0.7, e: ease.o3 })   // 0.46で止める＝滲んでぼやけたまま
    },
    // 12: 霧が晴れ、ぼやけた依頼文が沈む → 設計図が部品ごとに立ち上がり、具体的な指示が現れる（部品はクリックで押せる）
    async () => {
      tw(2.4, (k) => bp.setClear(k), { e: ease.io2 })
      tw(1.0, (k) => { u.pA.value = 0.46 * (1 - k); u.uLensInk.value = 1 - k }, { delay: 0.4, e: ease.i2 })
      inkIn('pB', 1.6, 2.6)
      await tw(3.0, (k) => bp.draw(k), { delay: 1.1, e: ease.lin })
    },
    // 13: まとめの一文
    async () => { u.tA.value = tS4[3]; u.pA.value = 0; await inkIn('pA') },
    // 14: 設計図が消え、1枚めくる → 見開き5「積み木」。ロボットが現れる
    async () => {
      await tw(0.9, (k) => { bp.draw(1 - k); fadeInk(k); u.uLens.value = 1 - k }, { e: ease.io2 })
      bp.group.visible = false
      await turnTo(3, 0, tS5)
      popup.group.visible = true
      tw(0.9, (k) => popup.rise(k), { delay: 0.3, e: ease.o5 })
      await inkIn('pHead', 1.6, 0.2)
    },
    // 「これ作って」— 完成した城を一度に置く → ぐらついて、一部だけがボロっと崩れる。ロボットも転ぶ
    async () => {
      inkIn('pA', 1.0)
      tw(0.4, (k) => { cam.roll = Math.sin(k * Math.PI * 5) * 0.014 * (1 - k) }, { delay: 0.62, e: ease.lin })
      await tw(3.0, (k) => popup.demoA(k, 3.0), { e: ease.lin })
    },
    // 残りのブロックがすべて崩れて転がり、砂になって消える
    async () => {
      tw(0.5, (k) => { cam.roll = Math.sin(k * Math.PI * 6) * 0.012 * (1 - k) }, { e: ease.lin })
      await tw(4.2, (k) => popup.demoB(k, 4.2), { e: ease.lin })
    },
    // 16: 下から1段ずつ積み上げる。ロボットはまわりを歩き、最後に輪が回りはじめると立ち止まって喜ぶ
    async () => {
      tw(0.9, (k) => { u.pA.value = 1 - k }, { e: ease.i2 })
      inkIn('pB', 1.6, 0.9)
      popup.beginBuild()
      for (let i = 0; i < 4; i++) tw(0.8, (k) => popup.tier(i, k), { delay: 0.7 + i * 1.0, e: ease.lin })
      await tw(0.9, (k) => popup.loop(k), { delay: 0.7 + 4 * 1.0, e: ease.lin })
      await wait(1.0)
    },
    // 17: まとめの一文
    async () => { u.tA.value = tS5[3]; u.pA.value = 0; await inkIn('pA') },
    // 18: 城を畳んで1枚めくる → 見開き6「外側を繋ぐ」。雲の流れる空に、ロボットと光の輪
    async () => {
      await tw(0.9, (k) => { popup.fold(k); fadeInk(k) }, { e: ease.io2 })
      popup.group.visible = false
      await turnTo(0, 4, tS6)
      isles.group.visible = true
      tw(1.1, (k) => isles.rise(k), { delay: 0.3, e: ease.lin })
      await inkIn('pHead', 1.6, 0.2)
    },
    // 19: 巻物（Skill）とコネクタ（MCP）が現れ、光の管でつながる
    async () => {
      inkIn('pA', 1.6, 0.8)
      await tw(1.5, (k) => isles.item(0, k), { e: ease.io2 })
      await tw(1.5, (k) => isles.item(1, k), { e: ease.io2 })
    },
    // 20: パズルピース（Plugin）とミニロボ（Subagent）
    async () => {
      inkIn('pB', 1.6, 0.8)
      await tw(1.5, (k) => isles.item(2, k), { e: ease.io2 })
      await tw(1.5, (k) => isles.item(3, k), { e: ease.io2 })
    },
    // 21: まとめの一文（札4枚は1枚の絵にまとめ、空いた枠でまとめを出す）
    async () => { u.tB.value = tS6[4]; u.tA.value = tS6[3]; u.pA.value = 0; await inkIn('pA') },
    // 22: 道具を畳んで1枚めくる → 見開き7「手紙」。便箋が2枚舞い降り、万年筆が現れる（便箋はつかめる）
    async () => {
      await tw(0.9, (k) => { isles.fold(k); fadeInk(k) }, { e: ease.io2 })
      isles.group.visible = false
      await turnTo(4, 5, [tS7h])
      letters.group.visible = true
      letters.drop(0)
      tw(1.9, (k) => letters.drop(k), { delay: 0.3, e: ease.lin })
      await inkIn('pHead', 1.6, 0.2)
      await wait(0.9)
    },
    // 23: 1通目を書く
    async () => { await tw(5.2, (k) => letters.write(0, k), { e: ease.lin }) },
    // 24: 2通目を書く
    async () => { await tw(5.0, (k) => letters.write(1, k), { e: ease.lin }) },
    // 25: 便箋が引っぱられるように飛び去り、1枚めくる → 見開き8「余白」。一文だけが滲み出る
    async () => {
      letters.release()
      await tw(1.1, (k) => { letters.fly(k); fadeInk(k) }, { e: ease.i2 })
      letters.group.visible = false
      await turnTo(5, 0, tS8)
      inkIn('pHead', 1.6, 0.2)
      await wait(1.4)
      endBot.group.visible = true
      tw(0.9, (k) => endBot.group.scale.setScalar(Math.max(0.001, k)), { delay: 1.6, e: ease.o5 })
      tw(0.01, () => endBot.play('cheer', { fade: 0.5 }), { delay: 2.6 })
      await inkIn('pA', 2.6)
    },
    // 26: 文字が沈み、本が閉じる。本に合わせて留め帯が起き上がって綴じ、表紙の金が光って、締めの画面へ
    async () => {
      cam.orbit = 0; currentTop = false
      tw(1.0, (k) => { fadeInk(k); endBot.group.scale.setScalar(Math.max(0.001, 1 - k)) }, { e: ease.i2 })
      await wait(1.0)
      endBot.group.visible = false
      tw(2.4, (k) => book.setOpen(1 - k), { e: ease.io3 })
      tw(2.4, (k) => { book.root.position.x = lerp(0, closedPose.x, k); book.root.rotation.y = lerp(0, closedPose.ry, k) }, { delay: 0.3, e: ease.io3 })
      tw(1.5, (k) => book.setStrap(1 - k), { delay: 1.5, e: ease.io2 })      // 表紙が降りてくるのに合わせて綴じる
      tw(1.6, (k) => { book.coverMat.emissiveIntensity = 0.1 + Math.sin(k * Math.PI) * 1.1 }, { delay: 3.0, e: ease.lin })
      hero.querySelector('.h-eyebrow').textContent = 'Thank you'
      hero.querySelector('h1').innerHTML = '<span>ありがとう</span><span>ございました</span>'
      hero.querySelector('.h-sub').textContent = '無駄を生まないAI活用法'
      hero.classList.add('end')
      tw(0.9, () => hero.classList.add('on'), { delay: 3.0 })
      await moveCam(heroPose(), 3.6, ease.io3, (k, raw) => { const a = Math.sin(raw * Math.PI); cam.pos.y += a * 1.6; cam.pos.z += a * 1.4; cam.roll = -a * 0.04 })
      cam.orbit = 0.45
      await wait(1.2)
    },
  ]
  const rand2 = () => (Math.random() - 0.5) * 1.6
  async function fluidTo(tex) {
    wu.tB.value = tex; wu.uMix.value = 0
    pond.sim.drop(0, 0, 0.11, 0.14)
    tw(0.01, () => pond.sim.drop(rand2(), rand2() * 0.5, -0.06, 0.1), { delay: 0.35 })
    tw(0.01, () => pond.sim.drop(rand2(), rand2() * 0.5, 0.05, 0.1), { delay: 0.7 })
    await tw(2.3, (k) => { wu.uMix.value = k }, { e: ease.io3 })
    wu.tA.value = tex; wu.tB.value = blankTex; wu.uMix.value = 0
  }

  async function advance() {
    if (busy) { await flushTweens(); return }   // 演出中にもう一度押すと最後まで飛ばす
    if (step >= steps.length) return
    busy = true
    const fn = steps[step]
    step++
    hud.textContent = `${String(step).padStart(2, '0')} / ${String(TOTAL).padStart(2, '0')}`
    try { await fn() } finally { busy = false }
  }
  addEventListener('keydown', (e) => {
    if (e.key === 'Shift') shift = true
    if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'Enter' || e.code === 'PageDown') { e.preventDefault(); if (!e.repeat) advance() }
    if (e.code === 'KeyR') location.reload()
    if (e.code === 'Digit0') zoom = 1
  })
  addEventListener('keyup', (e) => { if (e.key === 'Shift') { shift = false; camMouse.copy(mouse) } })
  addEventListener('resize', resize)

  // ---- 毎フレーム ----
  setCam(screenPose())
  resize()
  const clock = new THREE.Clock()
  let timeScale = 1          // 検証用：スローで見る
  const fps = { n: 0, t: 0, worst: 0, last: null }, hitches = []
  renderer.shadowMap.autoUpdate = false
  const ray = new THREE.Raycaster(), shP = new THREE.Vector3(), shS = new THREE.Vector3()
  const upT = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), off = new THREE.Vector3(), tg = new THREE.Vector3()
  function frame() {
    requestAnimationFrame(frame)
    const raw = clock.getDelta(), dt = Math.min(raw, 0.05) * timeScale
    time += dt
    u.uTime.value = time
    if (raw > 0.1) hitches.push([step, +time.toFixed(1), +(raw * 1000).toFixed(0)])
    fps.n++; fps.t += raw; fps.worst = Math.max(fps.worst, raw)
    if (fps.t >= 1) { fps.last = { fps: +(fps.n / fps.t).toFixed(1), worstMs: +(fps.worst * 1000).toFixed(0) }; fps.n = 0; fps.t = 0; fps.worst = 0 }
    updateTweens(dt)
    // カメラ：台本の位置を基準に、カーソルで見る角度を変え、ホイールで寄り引きする（Shift中と、便箋をつかんでいる間は止まる）
    mouseS.lerp(camMouse, 1 - Math.exp(-dt * 3.5))
    curS.lerp(mouse, 1 - Math.exp(-dt * 14))
    orbitS = lerp(orbitS, cam.orbit, 1 - Math.exp(-dt * 3))
    zoomS = lerp(zoomS, cam.orbit > 0 ? zoom : 1, 1 - Math.exp(-dt * 5))
    fwd.subVectors(cam.tgt, cam.pos).normalize()
    right.crossVectors(fwd, cam.up).normalize()
    upT.crossVectors(right, fwd)
    off.subVectors(cam.pos, cam.tgt)
    off.applyAxisAngle(upT, mouseS.x * 0.9 * orbitS).applyAxisAngle(right, mouseS.y * 1.06 * orbitS)   // 左右±52度、上下±61度（紙面から約30度の高さまで下げられる）
    off.multiplyScalar(zoomS)
    const pan = Math.max(0, 1 - zoomS) * orbitS
    tg.copy(cam.tgt).addScaledVector(right, mouseS.x * 1.5 * pan).addScaledVector(upT, -mouseS.y * 0.95 * pan)
    camera.position.copy(tg).add(off)
    camera.position.y = Math.max(camera.position.y, 0.35)
    camera.up.copy(upT).applyAxisAngle(fwd, cam.roll)
    camera.lookAt(tg)
    camera.updateMatrixWorld()
    if (step === 1 || (step === 2 && busy)) book.coverMat.emissiveIntensity = Math.max(book.coverMat.emissiveIntensity, 0.12 + 0.1 * Math.sin(time * 1.6))
    if (sky.group.visible) sky.update(time, renderer.domElement.height)
    if (popup.group.visible) popup.update(time, dt, renderer.domElement.height)
    if (isles.group.visible) isles.update(time, dt)
    if (letters.group.visible) letters.update(time, dt)
    if (endBot.group.visible) endBot.update(dt)
    if (bp.group.visible) {
      // カーソルが指している位置：霧はその高さで晴れ、紙面ではレンズになる
      ray.setFromCamera(ndc.set(curS.x, -curS.y), camera)
      const o = ray.ray.origin, d = ray.ray.direction
      const t1 = (BOOK.H + 0.3 - o.y) / d.y, t0 = (BOOK.H - o.y) / d.y
      bp.setCursor(o.x + d.x * t1 - book.root.position.x, o.z + d.z * t1 - BZ)
      u.uCur.value.set((o.x + d.x * t0 - book.root.position.x + BOOK.PW) / (BOOK.PW * 2), 1 - (o.z + d.z * t0 - BZ + BOOK.PH / 2) / BOOK.PH)
      renderer.domElement.style.cursor = bp.hover(ndc, camera) ? 'pointer' : ''
      bp.update(time)
    }
    {
      // 立体の影を紙面へ：目印の位置を本の座標に直し、高さのぶん左下へずらす（右上からの光）
      let n = 0
      for (const b of BLOBS) {
        if (n >= 8) break
        let vis = true
        for (let o = b.parent; o; o = o.parent) if (!o.visible) { vis = false; break }
        if (!vis || b.material.opacity < 0.01) continue
        b.getWorldPosition(shP); b.getWorldScale(shS)
        if (shS.x < 0.02) continue
        book.pivot.worldToLocal(shP)
        const hgt = Math.max(0, shP.y), r = shS.x * 0.5 * (1 + hgt * 0.5)
        u.uShL.value[n] = (b.userData.len ?? 0) * (shS.x / b.scale.x) / BOOK.PH
        u.uSh.value[n++].set((shP.x - hgt * 0.45 + BOOK.PW) / (BOOK.PW * 2), 1 - (shP.z + hgt * 0.4 + BOOK.PH / 2) / BOOK.PH, r / BOOK.PH, b.material.opacity * (b.userData.dark ?? 0.8) / (1 + hgt * 1.2))
      }
      for (; n < 8; n++) u.uSh.value[n].w = 0
    }
    renderer.shadowMap.needsUpdate = true
    if (pond.group.visible) {
      if (liveFrames > 0) {
        liveFrames--
        if (drawLive(liveLayer)) { liveCtx.clearRect(0, 0, SW, SH); liveCtx.drawImage(stageCanvas, 0, 0, SW, SH); liveTex.needsUpdate = true }
      }
      pond.update(dt, time - pondShift, camera)
      pond.renderUnder(scene, camera, [desk, laptop.group])
      renderer.shadowMap.needsUpdate = false
    }
    renderer.render(scene, camera)
  }
  // 先読み：後の場面の材質と絵を起動時にGPUへ送っておく（場面が初めて出る瞬間の引っかかりを防ぐ）
  {
    const later = [pond.group, sky.group, bp.group, popup.group, isles.group, letters.group, endBot.group]
    const was = later.map((g) => g.visible)
    later.forEach((g) => { g.visible = true })
    const warm = makePieces(mats.piece, { mode: 'tear' })     // 破片の材質も先に用意する
    scene.add(warm.group)
    try {
      pond.update(1 / 60, 0, camera); pond.renderUnder(scene, camera, [desk, laptop.group])   // 水面の計算と下絵の用意
      renderer.compile(scene, camera)
      const seen = new Set()
      scene.traverse((o) => {
        for (const m of [].concat(o.material || [])) {
          for (const v of [...Object.values(m), ...Object.values(m.uniforms || {}).map((x) => x && x.value)]) {
            if (v && v.isTexture && !v.isRenderTargetTexture && v.image && !seen.has(v)) { seen.add(v); renderer.initTexture(v) }
          }
        }
      })
    } catch (e) { console.warn('先読みに失敗', e) }
    scene.remove(warm.group)
    later.forEach((g, i) => { g.visible = was[i] })
  }
  frame()

  // 検証用：?step=N でその場面まで飛ぶ。?mx=&my=&zoom= でカメラを固定
  window.__lt = {
    advance, flush: flushTweens, fps: () => fps.last, pic(on) { if (on) { snapPond(); uL.uKind.value = 6; uR.uKind.value = 6; uL.uHole.value = 0; uR.uHole.value = 0; coverPond(book.pageL, true); coverPond(book.pageR, true) } else { uL.uHole.value = 1; uR.uHole.value = 1; coverPond(book.pageL, false); coverPond(book.pageR, false) } }, slow(v) { timeScale = v }, hitches: () => hitches, state: () => ({ step, busy }),
    async jump(n) { while (step < n) { const p = advance(); await flushTweens(); await p } },
    look(x, y, z = 1) { mouse.set(x, y); camMouse.set(x, y); zoom = z },
    cursor(x, y) { mouse.set(x, y) },
    press() { ndc.set(mouse.x, -mouse.y); return bp.hover(ndc, camera) ? bp.press(time) : null },
    uniforms: u, mats, book, pond, sky, bp, popup, isles, letters,
  }
  if (q.get('step')) await window.__lt.jump(+q.get('step'))
  if (q.get('mx')) window.__lt.look(+q.get('mx'), +(q.get('my') || 0), +(q.get('zoom') || 1))
  document.documentElement.dataset.ready = '1'
}
boot().catch((e) => { console.error(e); fail('起動に失敗しました: ' + (e?.message || e)) })
