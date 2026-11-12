// 時間で進む小さなトゥイーン管理と、共通のGLSL
const list = []
export const ease = {
  lin: (t) => t,
  io2: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  io3: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  io5: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  o3: (t) => 1 - Math.pow(1 - t, 3),
  o5: (t) => 1 - Math.pow(1 - t, 5),
  i2: (t) => t * t,
  i3: (t) => t * t * t,
}
export function tw(dur, fn, { delay = 0, e = ease.io3 } = {}) {
  return new Promise((res) => list.push({ t: -delay, dur, fn, e, res }))
}
export const wait = (d) => tw(d, () => {}, { e: ease.lin })
export function updateTweens(dt) {
  for (const a of [...list]) {
    a.t += dt
    if (a.t < 0) continue
    const k = Math.min(1, a.t / a.dur)
    a.fn(a.e(k), k)
    if (k >= 1) { list.splice(list.indexOf(a), 1); a.res() }
  }
}
/** 進行中の演出を最後まで飛ばす（検証用・連打用） */
export async function flushTweens() {
  let idle = 0
  for (let i = 0; i < 600 && idle < 4; i++) {
    if (list.length) { updateTweens(1e4); idle = 0 } else idle++
    await new Promise((r) => setTimeout(r, 0))
  }
}
export const lerp = (a, b, t) => a + (b - a) * t
export const clamp01 = (x) => Math.min(1, Math.max(0, x))
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a))

export const NOISE = /* glsl */ `
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+1.),f.x),f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+vec2(17.1,9.2); a*=.5; } return s; }
vec3 s2l(vec3 c){ return pow(c,vec3(2.2)); }
float rs(float a,float b,float x){ return 1.-smoothstep(b,a,x); }   // a>b の逆向きsmoothstep
`

export const BOOK = { PW: 1.6, PH: 2.0, H: 0.25, COVER: 0.03 }

// 水面の光の網（コースティクス）。細胞の境目が明るい線になる
export const CAUSTIC = /* glsl */ `
vec2 h22(vec2 p){ return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453); }
float cellEdge(vec2 p,float t){ vec2 i=floor(p),f=fract(p); float d1=9.,d2=9.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g=vec2(float(x),float(y)); vec2 o=h22(i+g); o=.5+.38*sin(t+6.2831*o);
    float d=length(g+o-f); if(d<d1){ d2=d1; d1=d; } else if(d<d2) d2=d; }
  return d2-d1; }
float net(vec2 p,float t){
  p+=.55*vec2(vn(p*.6+t*.2),vn(p*.6+5.-t*.2))+.18*vec2(vn(p*2.3-t*.3),vn(p*2.3+3.+t*.3));
  float a=cellEdge(p,t), b=abs(vn(p*1.9+vec2(t*.25,3.3))*2.-1.)*.5;
  float la=1.-smoothstep(0.,.075,a), lb=1.-smoothstep(0.,.05,b);
  la*=la; lb*=lb;
  float brk=.25+.75*smoothstep(.3,.7,vn(p*.45+vec2(t*.07,-t*.05)));   // ところどころ途切れる
  return (la*.7+lb*.3+la*lb*.8)*brk; }
`

// 光の向き（右奥の上から。影は左手前へ伸びる）
import { Vector3 } from 'three'
export const LDIR = new Vector3(0.45, 0.8, -0.4).normalize()
