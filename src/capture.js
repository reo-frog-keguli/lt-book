// HTML-in-Canvas（Chrome 157+）で本物のHTMLをビットマップにする
import * as THREE from 'three'

export const SW = 960, SH = 600, SCALE = 1.5
const stage = document.getElementById('stage')
stage.width = SW * SCALE
stage.height = SH * SCALE
const ctx = stage.getContext('2d')
export const supported = stage.content === 'drawable' && 'drawElementImage' in CanvasRenderingContext2D.prototype
const raf = () => new Promise((r) => requestAnimationFrame(r))

const probe = document.createElement('canvas')
probe.width = 480; probe.height = 300
const pctx = probe.getContext('2d', { willReadFrequently: true })
function hasInk(c) {
  pctx.clearRect(0, 0, 480, 300)
  pctx.drawImage(c, 0, 0, 480, 300)
  const d = pctx.getImageData(0, 0, 480, 300).data
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true
  return false
}

/** 舞台の中の1層を、複製したcanvasとして取り出す */
export async function grab(el) {
  let last
  for (let i = 0; i < 90; i++) {
    await raf()
    try {
      ctx.reset()
      ctx.drawElementImage(el, 0, 0)
      if (!hasInk(stage)) throw new Error('まだ描かれていません: ' + el.id)
      const out = document.createElement('canvas')
      out.width = stage.width; out.height = stage.height
      out.getContext('2d').drawImage(stage, 0, 0)
      return out
    } catch (e) { last = e }
  }
  throw last
}
/** 毎フレーム取り込む層（暗号化の文字）。舞台そのものをテクスチャの元にする */
export function drawLive(el) {
  try { ctx.reset(); ctx.drawElementImage(el, 0, 0); return true } catch { return false }
}
export const stageCanvas = stage

export function texOf(canvas, mips = true) {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.generateMipmaps = mips
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter
  t.anisotropy = 4
  return t
}
export function blankCanvas() {
  const c = document.createElement('canvas')
  c.width = 8; c.height = 8
  return c
}

/** 冒頭のパワポ風画面。見えているcanvasに自分自身を描かせ、そのまま画面テクスチャにする */
export function setupPpt() {
  const host = document.getElementById('pptHost')
  const el = document.getElementById('ppt')
  const c2 = host.getContext('2d')
  let ok = false
  const fit = () => {
    const d = Math.min(window.devicePixelRatio || 1, 2)
    host.width = Math.round(innerWidth * d); host.height = Math.round(innerHeight * d)
    el.style.width = innerWidth + 'px'; el.style.height = innerHeight + 'px'
  }
  const paint = () => {
    try { c2.reset(); c2.drawElementImage(el, 0, 0); ok = true } catch { /* 次のコマで再試行 */ }
  }
  fit()
  host.addEventListener('paint', paint)
  addEventListener('resize', () => { if (host.style.display !== 'none') { fit(); requestAnimationFrame(paint) } })
  // 画面テクスチャ用の控え。見えているcanvasを隠すと中身が変わることがあるので、隠す前の絵を写しておく
  const snap = document.createElement('canvas')
  const snapshot = () => { snap.width = host.width; snap.height = host.height; snap.getContext('2d').drawImage(host, 0, 0) }
  const ready = (async () => { for (let i = 0; i < 90 && !(ok && hasInk(host)); i++) { await raf(); paint() } snapshot(); return ok })()
  return { host, snap, snapshot, ready, paint, hide: () => { snapshot(); host.style.display = 'none' } }
}
