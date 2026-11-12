// 紙面：古紙と各見開きの絵柄、インクの滲み、落書き、破る・切り刻む紙片、1枚ずつめくれるページ
import * as THREE from 'three'
import { NOISE, CAUSTIC, rand, BOOK, LDIR } from './util.js'

const { PW, PH, H } = BOOK

// 開いた本のページの丸み（のどへ沈み、小口へなだらかに下がる）。GLSLとJSで同じ式を使う
export const BOOKDEF = /* glsl */ `
uniform float uBulge;
vec3 bookDeform(vec3 p){
  float u=clamp(abs(p.x)/${PW.toFixed(3)},0.,1.); float yr=clamp((p.y+${H.toFixed(3)})/${H.toFixed(3)},0.,1.2);
  float b=.12*smoothstep(0.,.24,u)*(1.-.8*u)-.075*(1.-smoothstep(0.,.13,u));
  p.y+=uBulge*yr*b;
  p.x-=sign(p.x)*uBulge*yr*.05*u;
  return p; }
`
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
export function deformTop(x, bulge = 1) {
  const u = Math.min(1, Math.abs(x) / PW)
  const b = 0.12 * sm(0, 0.24, u) * (1 - 0.8 * u) - 0.075 * (1 - sm(0, 0.13, u))
  return { x: x - Math.sign(x) * bulge * 0.05 * u, y: bulge * b }
}

// 面の種類: 0 古紙 / 1 水の絵 / 2 夜空 / 3 青写真 / 4 夕暮れの空 / 5 革
export function makePageMaterials(tHead, tA, tB, tScr) {
  const shared = {
    tHead: { value: tHead }, tA: { value: tA }, tB: { value: tB }, tScr: { value: tScr }, tPond: { value: null },
    pHead: { value: 0 }, pA: { value: 0 }, pB: { value: 0 },
    uBulge: { value: 0 }, uTime: { value: 0 }, uSun: { value: 0 },
    uCur: { value: new THREE.Vector2(9, 9) }, uLens: { value: 0 }, uLensInk: { value: 0 },
    uLight: { value: LDIR.clone() },
    uSh: { value: Array.from({ length: 8 }, () => new THREE.Vector4(9, 9, 0, 0)) },
    uShL: { value: new Float32Array(8) },   // 影の伸びる長さ（背の高さぶん）   // 紙面に落ちる影（中心u,v・半径・濃さ）
  }
  const vertexShader = /* glsl */ `
    uniform float uDef,uFloorY; varying vec2 vUv; varying vec3 vN;
    ${BOOKDEF}
    void main(){ vUv=uv; vec3 p=position; vec3 n=normal;
      if(uDef>.5){ vec3 a=bookDeform(p+vec3(.01,0.,0.)), b=bookDeform(p-vec3(.01,0.,0.)); n=normalize(cross(vec3(0.,0.,1.),normalize(a-b))); p=bookDeform(p); p.y=max(p.y,uFloorY); }
      vN=normalize(mat3(modelMatrix)*n); gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`
  const fragmentShader = /* glsl */ `
    uniform sampler2D tHead,tA,tB,tScr,tPond;
    uniform float pHead,pA,pB,uMode,uDef,uKind,uFrontKind,uBackKind,uFlipT,uTime,uInkOn,uHole,uSun,uLens,uLensInk,uDissolve,uMelt;
    uniform vec2 uCur; uniform vec3 uLight; uniform vec4 uSh[8]; uniform float uShL[8];
    varying vec2 vUv; varying vec3 vN;
    ${NOISE}
    ${CAUSTIC}
    vec2 gW; float gN;
    // p: 0=消えている 1=くっきり。途中は滲んで広がり、紙に沈む
    float ink(sampler2D t, vec2 uv, float p){
      if(p<=0.001) return 0.;
      if(p>=0.999) return texture2D(t,uv).a;
      float b=1.-p; vec2 w=gW*.02*b; w.y-=b*.006;
      float lod=b*5.2;
      float a=textureLod(t,uv+w,lod).a, a2=textureLod(t,uv+w*1.8,lod+1.5).a;
      float spread=smoothstep(.03,.5-.25*b,a*(1.+1.6*b)+a2*b*.9);
      float fade=smoothstep(0.,.5,p*1.25-(gN-.35)*b*.9);
      return mix(a,spread,clamp(b*3.,0.,1.))*fade*(1.-.35*b);
    }
    // 古紙：白めで綺麗な紙に、ごく薄い汚れと繊維
    vec3 paperCol(vec2 uv, float gx){
      float n=fbm(uv*vec2(6.,4.)), n2=fbm(uv*vec2(70.,44.)+4.);
      vec3 c=mix(vec3(.915,.885,.80),vec3(.965,.945,.885),n); c*=.975+.04*n2;
      c=mix(c,vec3(.80,.72,.56),smoothstep(.55,.9,fbm(uv*vec2(3.,2.)+9.))*.13);        // 大きな薄い染み
      c*=1.-.05*smoothstep(.58,.85,fbm(uv*vec2(26.,16.)+3.));                             // まだらな汚れ
      vec2 fp=uv*vec2(104.,65.); vec2 fi=floor(fp), ff=fract(fp)-.5; float fr=h21(fi);
      vec2 fo=(vec2(h21(fi+3.1),h21(fi+7.7))-.5)*.5;
      c=mix(c,vec3(.62,.50,.34),(1.-smoothstep(.04,.04+.22*h21(fi+1.3),length(ff-fo)))*step(.93,fr)*.3);   // 小さな斑点
      float ed=min(1.-gx,min(uv.y,1.-uv.y)*1.25);
      c*=mix(.84,1.,smoothstep(0.,.14,ed+(n-.5)*.05));
      c*=.985+.03*vn(vec2(uv.x*900.,uv.y*40.));
      return c; }
    vec3 skyCol(vec2 uv, float gx){
      float n=fbm(uv*vec2(4.8,3.)+2.), n2=fbm(uv*vec2(9.6,6.)+7.);
      vec3 c=mix(vec3(.040,.052,.14),vec3(.085,.11,.29),n);
      c+=vec3(.11,.035,.15)*smoothstep(.5,.85,n2)*.6+vec3(0.,.085,.105)*smoothstep(.55,.9,fbm(uv*vec2(6.,3.8)+13.))*.5;
      vec2 p=uv*vec2(96.,60.); vec2 i=floor(p), f=fract(p)-.5; float r=h21(i);
      vec2 o=(vec2(h21(i+3.1),h21(i+7.7))-.5)*.6;
      float tw=.6+.4*sin(uTime*(1.+r*3.)+r*40.);
      c+=vec3(1.,.93,.78)*(1.-smoothstep(0.,.07+.1*r,length(f-o)))*step(.9,r)*tw*.85;
      return c; }
    vec3 blueCol(vec2 uv, float gx){
      float n=fbm(uv*vec2(6.,4.)+1.);
      vec3 c=mix(vec3(.065,.185,.385),vec3(.095,.255,.49),n);
      vec2 g=uv*vec2(64.,40.);
      vec2 a1=abs(fract(g)-.5), a2=abs(fract(g/8.)-.5);
      float l1=smoothstep(.455,.5,max(a1.x,a1.y)), l2=smoothstep(.492,.5,max(a2.x,a2.y));
      c+=vec3(.55,.75,1.)*(l1*.055+l2*.16);
      c*=.96+.07*vn(uv*vec2(420.,260.));
      return c; }
    // 夕暮れの空：はっきりした雲が、層ごとに違う速さで横へ流れる
    float cloudLayer(vec2 uv, float sp, float sc, float seed){
      vec2 p=vec2((uv.x+uTime*sp)*1.6, uv.y)*sc+seed;
      float d=fbm(p*vec2(1.,2.1))*.72+fbm(p*vec2(3.1,5.3)+4.)*.28;
      return smoothstep(.5,.66,d); }
    vec3 duskCol(vec2 uv, float gx){
      float n=fbm(uv*vec2(4.,2.5));
      vec3 c=mix(vec3(.99,.84,.69),vec3(.66,.64,.87),smoothstep(.05,.95,uv.y+(n-.5)*.25));
      c=mix(c,vec3(.99,.70,.58),smoothstep(.5,.85,n)*.25*(1.-uv.y));
      float c1=cloudLayer(uv,.012,2.2,1.), c2=cloudLayer(uv+vec2(0.,.07),.022,3.4,7.), c3=cloudLayer(uv-vec2(0.,.05),-.008,1.5,13.);
      c=mix(c,vec3(.93,.86,.90),c3*.55);                 // 遠くの大きな雲
      c=mix(c,vec3(1.,.96,.93),c1*.85);
      c=mix(c,vec3(1.,.985,.97),c2*.8);                  // 手前の小さな雲（速い）
      c-=vec3(.10,.09,.05)*cloudLayer(uv+vec2(.006,.02),.012,2.2,1.)*(1.-c1)*.5;   // 雲の下の淡い影
      return c; }
    vec3 leatherCol(vec2 uv, float gx){
      float n=fbm(uv*vec2(10.,6.2)+4.), g=vn(uv*vec2(520.,325.)), g2=vn(uv*vec2(180.,112.)+9.);
      vec3 c=mix(vec3(.27,.105,.095),vec3(.40,.165,.14),n);
      c*=.86+.16*g+.08*g2;
      return c; }
    void main(){
      vec2 uv=vUv;
      float burnN=0., burnT=-1.;
      if(uMode>4.5&&uDissolve>0.){   // 紙片は燃えて無くなる：焼け落ちた所は消え、その手前が焦げ、境目が赤く光る
        burnN=fbm(vUv*vec2(26.,16.))*.72+fbm(vUv*vec2(90.,56.)+3.)*.28;
        burnT=uDissolve*1.25-.12;
        if(burnN<burnT) discard; }
      bool front=gl_FrontFacing;
      if((uMode<.5||(uMode>3.5&&uMode<4.5))&&uMelt>0.&&fbm(vUv*vec2(14.,9.))<uMelt*1.15) discard;   // 紙が水へ溶ける（ページも、めくる紙も）。穴の奥は本物の水槽
      bool flip=uMode>3.5&&uMode<4.5;
      if(!front&&flip) uv.x=1.-uv.x;       // めくれるページの裏は、次の左ページになる
      float gx=abs(uv.x-.5)*2.;
      int kind=int(uKind+.5);
      if(flip) kind=front?int(uFrontKind+.5):int(uBackKind+.5);
      bool inkOK=front&&(uMode<.5||uMode>4.5)&&uInkOn>.5;
      // 特殊な絵柄は紙の上に刷られている：外側に、輪郭のあいまいな紙の余白を残す
      float ed=min(1.-gx,min(uv.y,1.-uv.y)*1.25);
      float inside=1.;   // 紙の余白は無し（見開きいっぱいに絵柄を刷る）
      // レンズ（青写真）：カーソルの周りを拡大して、ぼやけた文字をくっきり見せる
      float lens=0., dl=9.; vec2 luv=uv;
      if(uLens>.001&&kind==3&&uMode<.5){
        dl=length((uv-uCur)*vec2(1.6,1.));
        lens=(1.-smoothstep(.142,.16,dl))*uLens;
        luv=mix(uv,uCur+(uv-uCur)*.72,lens);
      }
      bool moving=(pHead>0.001&&pHead<.999)||(pA>0.001&&pA<.999)||(pB>0.001&&pB<.999)||lens>.001;
      gW=vec2(0.); gN=.5;
      if(inkOK&&moving){ gW=vec2(fbm(luv*vec2(48.,30.)),fbm(luv*vec2(48.,30.)+5.3))-.5; gN=fbm(luv*vec2(90.,56.)); }
      vec3 paper=s2l(paperCol(uv,gx));
      vec3 col; vec3 pic6=vec3(0.);
      if(kind==0){
        col=paper;
        if(uSun>.001&&uMode<.5){
          // 右上の雲間から差す陽光（ごく軽く）
          vec2 q=vec2(1.-uv.x,1.-uv.y)*vec2(1.6,1.); float d=length(q), a=atan(q.y,q.x);
          float rays=.55+.45*sin(a*24.+fbm(vec2(a*5.,uTime*.04))*7.);
          float cloud=smoothstep(.42,.8,fbm(q*2.6+vec2(uTime*.012,0.)));
          col+=s2l(vec3(1.,.92,.72))*(exp(-d*1.3)*rays*.24+cloud*exp(-d*2.4)*.2)*uSun*smoothstep(.2,.5,uv.x);
        }
      } else if(kind==1){
        // 本物の水槽へ入れ替わるとき、内側が中央から抜けていく
        if(uHole>.001&&inside>.55&&uHole*1.75-length((uv-.5)*vec2(1.6,1.))-(fbm(uv*vec2(9.,6.))-.5)*.5>0.) discard;
        float ca=net(uv*vec2(8.,5.)+3.,uTime*.5);
        col=s2l(vec3(.10,.33,.27))*(1.+ca*1.4)+vec3(.55,.95,.75)*ca*.06;
      } else if(kind==2) col=s2l(skyCol(uv,gx));
      else if(kind==3) col=s2l(blueCol(luv,gx));
      else if(kind==4) col=s2l(duskCol(uv,gx));
      else if(kind==6){
        // 水槽の写し絵。めくり終えたあと、中央から抜けて本物の水槽に替わる（同じ絵なので、切り替わりが見えない）
        if(uHole>.001&&uHole*1.75-length((uv-.5)*vec2(1.6,1.))-(fbm(uv*vec2(9.,6.))-.5)*.5>0.) discard;
        pic6=texture2D(tPond,uv).rgb; col=pic6;
      }
      else col=s2l(leatherCol(uv,gx));
      if(kind!=0) col=mix(paper,col,inside);
      if(inkOK){
        float pAl=mix(pA,1.,lens*uLensInk);
        float aH=ink(tHead,luv,pHead), aA=ink(tA,luv,pAl), aB=ink(tB,luv,pB);
        if(kind==2||kind==3||kind==5){
          vec3 gold=s2l(kind==3?vec3(.95,.98,1.):vec3(.97,.86,.60)), cream=s2l(kind==3?vec3(.88,.94,1.):vec3(.93,.90,.84));
          col+=gold*(textureLod(tHead,luv,3.5).a*pHead+textureLod(tA,luv,3.5).a*pAl+textureLod(tB,luv,3.5).a*pB)*.16*inside;
          col=mix(col,gold,clamp(aH,0.,1.));
          col=mix(col,cream,clamp(aA,0.,1.));
          col=mix(col,cream,clamp(aB,0.,1.));
        } else {
          vec3 inkc=s2l(kind==4?vec3(.17,.13,.30):vec3(.13,.09,.07)), pale=s2l(kind==4?vec3(.42,.36,.56):vec3(.32,.23,.17));
          col=mix(col,inkc,clamp(aH*.94,0.,1.));
          col=mix(col,mix(pale,inkc,pA),clamp(aA,0.,1.));
          col=mix(col,mix(pale,inkc,pB),clamp(aB,0.,1.));
          if(kind==0){ vec4 sc=texture2D(tScr,uv);                 // 落書き（黒いクレヨンの塗りつぶし）
            float gr=.9+.1*vn(uv*vec2(260.,165.));
            col=mix(col,s2l(vec3(.05,.045,.045)),clamp(sc.a*1.5,0.,1.)*gr); }
        }
      }
      if(lens>.001){   // レンズの縁とハイライト
        col+=s2l(vec3(.75,.9,1.))*(1.-smoothstep(0.,.014,abs(dl-.151)))*.55*uLens;
        col+=vec3(1.)*(1.-smoothstep(.0,.03,length((uv-uCur)*vec2(1.6,1.)+vec2(.06,-.075))))*.18*uLens;
        col=mix(col,col*vec3(1.05,1.1,1.16),lens*.5);
      }
      vec3 nn=normalize(vN)*(front?1.:-1.);
      float lam=clamp(dot(nn,uLight),0.,1.);
      float shade=kind==0?mix(.62,1.14,lam):mix(.8,1.07,lam);
      // 写し絵は、寝ているときは本物と同じ明るさ（陰影なし）。めくれて立っている間だけ、紙としての陰影が付く
      float lit6=(uMode>3.5&&uMode<4.5)?sin(clamp(uFlipT,0.,1.)*3.14159):0.;
      if(uMode<.5){ shade*=mix(.42,1.,smoothstep(0.,.16,gx)); shade*=1.-.5*exp(-gx*gx*14000.); }   // のどの影と、綴じ目の線
      if(uMode<.5){   // 立体の影：紙の丸みに沿って落ちる。右上からの光なので、左下へ少し伸びる
        for(int i=0;i<8;i++){ vec4 s=uSh[i]; if(s.w<.004) continue;
          vec2 d=(uv-s.xy)*vec2(1.6,1.); vec2 ax=vec2(-.7071,-.7071);
          float t=clamp(dot(d,ax),0.,uShL[i]);
          float l=length(d-ax*t)/max(s.z,1e-4);
          float far=uShL[i]>0.?t/uShL[i]:0.;                       // 先へ行くほど淡く、ぼける
          shade*=1.-s.w*(1.-smoothstep(.72-.3*far,1.+.2*far,l))*(1.-.35*far); }
      }
      if(!front&&kind==0) shade*=.92;
      if(kind==6) shade=mix(1.,shade,lit6);
      vec3 outc=col*shade;
      if(burnT>-.5){
        float e=burnN-burnT;                                              // 焼け落ちる境目からの距離
        outc*=1.-.92*(1.-smoothstep(.03,.2,e));                           // 焦げ
        float fl=.75+.25*sin(uTime*23.+burnN*60.);
        outc+=(vec3(3.4,.8,.08)*(1.-smoothstep(0.,.085,e))+vec3(2.6,1.7,.5)*(1.-smoothstep(0.,.026,e)))*fl;   // 赤い縁と、白熱した芯
      }
      gl_FragColor=vec4(outc,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  // mode 0: 紙面（丸みあり）、4: めくれるページ、5: 破った紙片（今の見開きの絵柄と文字つき）
  const make = (mode, def) => new THREE.ShaderMaterial({
    side: THREE.DoubleSide, vertexShader, fragmentShader,
    uniforms: { ...shared, uMode: { value: mode }, uDef: { value: def }, uKind: { value: 0 }, uFrontKind: { value: 0 }, uBackKind: { value: 0 }, uFlipT: { value: 0 }, uInkOn: { value: 1 }, uHole: { value: 0 }, uFloorY: { value: -9 }, uDissolve: { value: 0 }, uMelt: { value: 0 } },
  })
  return { shared, pageL: make(0, 1), pageR: make(0, 1), flip: make(4, 0), piece: make(5, 0) }
}

const bz = (v) => PH / 2 - v * PH

// めくれるページ（1枚。のどを軸に、しなりながら右から左へ）
export function makeFlipPage(mat) {
  const NR = 32, NZ = 2
  const geo = new THREE.PlaneGeometry(1, 1, NR, NZ)
  const pos = geo.attributes.position, uv = geo.attributes.uv
  const prm = []
  for (let k = 0; k < pos.count; k++) {
    const r = uv.getX(k), v = uv.getY(k)
    prm.push({ r, z: bz(v) })
    uv.setX(k, 0.5 + r * 0.5)
  }
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.castShadow = true
  const xs = new Float32Array(NR + 1), ys = new Float32Array(NR + 1)
  /** t: 0=右に寝ている 1=左に寝ている */
  const update = (t, lift = 0.006, bulge = 1, floor = -9) => {
    const th = t * Math.PI, ds = PW / NR
    let x = 0, y = 0
    xs[0] = 0; ys[0] = 0
    for (let i = 1; i <= NR; i++) {
      const rr = i / NR
      const phi = Math.min(Math.PI, Math.max(0, th + 1.1 * Math.sin(th) * (rr - 0.6)))   // 小口が先に進む
      x += Math.cos(phi) * ds; y += Math.sin(phi) * ds
      xs[i] = x; ys[i] = y
    }
    const flat = Math.pow(Math.abs(Math.cos(th)), 2)   // 寝ているときだけ本の丸みに沿う
    for (let k = 0; k < pos.count; k++) {
      const i = Math.round(prm[k].r * NR)
      const d = deformTop(xs[i], bulge)
      const px = xs[i] + (d.x - xs[i]) * flat
      pos.setXYZ(k, px, Math.max(floor, deformTop(px, bulge).y + lift, ys[i] + d.y * flat + lift), prm[k].z)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
    mat.uniforms.uFlipT.value = t
  }
  update(0)
  return { mesh, update }
}

// ---- 紙面を紙片に分ける。tear: 手で破ったギザギザ（左上から順に）／slash: まっすぐ切り刻む（一斉に舞う） ----
const hsh = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s) }
const vnz = (x, y) => {
  const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g)
  return (hsh(i, j) * (1 - u) + hsh(i + 1, j) * u) * (1 - v) + (hsh(i, j + 1) * (1 - u) + hsh(i + 1, j + 1) * u) * v
}
const STRIPS = [-1.2, -0.8, -0.45, -0.3, -0.2, -0.13, -0.08, -0.04, 0, 0.04, 0.08, 0.13, 0.2, 0.3, 0.45, 0.8, 1.2]
// 多角形を、縦線 x=lx の片側だけ残して切る
function clipX(poly, lx, sgn) {
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], sp = (p[0] - lx) * sgn, sq = (q[0] - lx) * sgn
    if (sp >= 0) out.push(p)
    if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) { const t = sp / (sp - sq); out.push([lx, p[1] + (q[1] - p[1]) * t]) }
  }
  return out
}
export function makePieces(mat, { x0 = -PW, x1 = 0, nCuts = 9, mode = 'tear' } = {}) {
  const X0 = x0, X1 = x1, Y0 = -PH / 2, Y1 = PH / 2, tear = mode === 'tear'
  let polys = [[[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]]]
  const cuts = []
  for (let c = 0; c < nCuts; c++) {
    const px = rand(X0 + 0.2, X1 - 0.2), py = rand(Y0 + 0.2, Y1 - 0.2), a = rand(0, Math.PI)
    cuts.push({ px, py, nx: -Math.sin(a), ny: Math.cos(a), dx: Math.cos(a), dy: Math.sin(a) })
  }
  for (const c of cuts) {
    const next = []
    for (const poly of polys) {
      const side = poly.map(([x, y]) => (x - c.px) * c.nx + (y - c.py) * c.ny)
      const area = Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0)) / 2
      if (side.every((s) => s >= 0) || side.every((s) => s <= 0) || area < (tear ? 0.16 : 0.03) || (tear && Math.random() < 0.18)) { next.push(poly); continue }
      const A = [], B = []
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length], sp = side[i], sq = side[(i + 1) % poly.length]
        if (sp >= 0) A.push(p); if (sp <= 0) B.push(p)
        if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) { const t = sp / (sp - sq), m = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; A.push(m); B.push(m) }
      }
      if (A.length >= 3) next.push(A); if (B.length >= 3) next.push(B)
    }
    polys = next
  }
  const onBorder = (p, q) => {
    const e = 1e-4
    return (Math.abs(p[0] - X0) < e && Math.abs(q[0] - X0) < e) || (Math.abs(p[0] - X1) < e && Math.abs(q[0] - X1) < e) ||
      (Math.abs(p[1] - Y0) < e && Math.abs(q[1] - Y0) < e) || (Math.abs(p[1] - Y1) < e && Math.abs(q[1] - Y1) < e)
  }
  const ragged = (poly) => {
    if (!tear) return poly
    const out = []
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length]
      out.push(p)
      if (onBorder(p, q)) continue
      const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy)
      let nx = -dy / len, ny = dx / len
      if (nx < 0 || (nx === 0 && ny < 0)) { nx = -nx; ny = -ny }
      const n = Math.max(2, Math.ceil(len / 0.03))
      for (let k = 1; k < n; k++) {
        const t = k / n, x = p[0] + dx * t, y = p[1] + dy * t
        const w = Math.min(1, Math.min(t, 1 - t) * len / 0.05)
        const d = ((vnz(x * 9, y * 9) - 0.5) * 0.085 + (vnz(x * 31 + 5, y * 31) - 0.5) * 0.034 + (vnz(x * 110, y * 110 + 9) - 0.5) * 0.012) * w
        out.push([x + nx * d, y + ny * d])
      }
    }
    return out
  }
  const group = new THREE.Group()
  const pieces = []
  const diag = Math.hypot(X1 - X0, PH)
  for (const poly of polys) {
    const pts = ragged(poly)
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length
    // 紙片は本の丸み（のどのくぼみ）に沿った形のまま剥がれる。丸みを追えるよう、縦の帯に分けて面を張る
    const mesh = new THREE.Group()
    let strips = [pts]
    for (const lx of STRIPS) {
      if (lx <= X0 + 1e-3 || lx >= X1 - 1e-3) continue
      const nx = []
      for (const sp of strips) { const a = clipX(sp, lx, 1), b = clipX(sp, lx, -1); if (a.length >= 3) nx.push(a); if (b.length >= 3) nx.push(b) }
      strips = nx
    }
    for (const sp of strips) {
      const geo = new THREE.ShapeGeometry(new THREE.Shape(sp.map(([x, y]) => new THREE.Vector2(x - cx, y - cy))))
      const pos = geo.attributes.position, uv = geo.attributes.uv
      for (let k = 0; k < pos.count; k++) {
        const wx = pos.getX(k) + cx
        uv.setXY(k, (wx + PW) / (2 * PW), (pos.getY(k) + cy + PH / 2) / PH)
        const d = deformTop(wx, 1)
        pos.setXYZ(k, d.x - cx, pos.getY(k), d.y)
      }
      geo.computeVertexNormals()
      const m = new THREE.Mesh(geo, mat); m.castShadow = true
      mesh.add(m)
    }
    const holder = new THREE.Group()
    holder.rotation.x = -Math.PI / 2
    holder.position.set(cx, 0.008, -cy)
    holder.add(mesh); group.add(holder)
    let t0, vel
    if (tear) {
      const d = Math.hypot(cx - X0, cy - Y1) / diag
      const dir = new THREE.Vector3(cx + PW * 0.5 + rand(-0.6, 0.6), 0, -cy + rand(-0.6, 0.6)).normalize()
      t0 = 0.1 + d * 1.5 + rand(0, 0.14)
      vel = new THREE.Vector3(dir.x * rand(1.6, 3.4) - rand(0.6, 1.8), rand(1.5, 3.0), dir.z * rand(1.4, 3.0))
    } else {
      // 切り刻まれた紙吹雪：中央から外へ、上へ巻き上がる
      const d = Math.hypot(cx, cy) / diag
      const dir = new THREE.Vector3(cx + rand(-0.4, 0.4), 0, -cy + rand(-0.4, 0.4)).normalize()
      t0 = 1.05 + d * 0.35 + rand(0, 0.25)
      vel = new THREE.Vector3(dir.x * rand(1.2, 3.6), rand(2.2, 5.0), dir.z * rand(1.0, 3.0) - rand(0, 1.2))
    }
    pieces.push({ holder, mesh, t0, vel, home: holder.position.clone(), rot: new THREE.Vector3(rand(-8, 8), rand(-6, 6), rand(-9, 9)), peel: new THREE.Vector2(rand(-1, 1), rand(-1, 1)).normalize() })
  }
  const LIFE = tear ? 1.25 : 1.7
  const DUR = Math.max(...pieces.map((p) => p.t0)) + LIFE
  const update = (t) => {
    for (const p of pieces) {
      const lt = t - p.t0
      if (lt <= 0) {
        const sh = tear ? Math.max(0, 1 - Math.abs(lt) / 0.1) * 0.005 : 0
        p.holder.position.set(p.home.x + rand(-sh, sh), p.home.y, p.home.z + rand(-sh, sh))
        continue
      }
      const pk = Math.min(1, lt / 0.2), e = 1 - Math.pow(1 - pk, 3), fl = Math.max(0, lt - (tear ? 0.14 : 0))
      const g = tear ? 1.6 : 1.1
      p.holder.position.set(p.home.x + p.vel.x * fl, p.home.y + e * 0.1 + p.vel.y * fl - g * fl * fl, p.home.z + p.vel.z * fl)
      p.mesh.rotation.set(p.peel.y * e * 0.7 + p.rot.x * fl, p.peel.x * e * 0.7 + p.rot.y * fl, p.rot.z * fl * 0.5)
      p.holder.visible = lt < LIFE
    }
  }
  return { group, update, DUR, cuts, count: pieces.length }
}

// ---- 斬る：光の筋が走るたび、その軌跡で見開きが2つに分かれ、両側が少し掃ける。回を重ねて紙吹雪になり、その場で消える ----
export function makeSlash(mat, { nCuts = 12 } = {}) {
  const X0 = -PW, X1 = PW, Y0 = -PH / 2, Y1 = PH / 2, REACH = 2.3
  const cuts = []
  let t0 = 0.3
  for (let c = 0; c < nCuts; c++) {
    const a = (c * 2.39 + rand(-0.35, 0.35)) % Math.PI, k = c < 4 ? 0.55 : 1
    cuts.push({ px: rand(-1.05, 1.05) * k, py: rand(-0.62, 0.62) * k, nx: -Math.sin(a), ny: Math.cos(a), dx: Math.cos(a), dy: Math.sin(a), t0, dur: 0.2, sgn: c % 2 ? 1 : -1, amp: rand(0.011, 0.02) * (c < 5 ? 1.4 : 1) })
    t0 += Math.max(0.1, 0.44 - c * 0.036)
  }
  let polys = [[[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]]]
  for (const c of cuts) {
    const next = []
    for (const poly of polys) {
      const side = poly.map(([x, y]) => (x - c.px) * c.nx + (y - c.py) * c.ny)
      const area = Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0)) / 2
      if (side.every((s) => s >= 0) || side.every((s) => s <= 0) || area < 0.004) { next.push(poly); continue }
      const A = [], B = []
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length], sp = side[i], sq = side[(i + 1) % poly.length]
        if (sp >= 0) A.push(p); if (sp <= 0) B.push(p)
        if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) { const t = sp / (sp - sq), m = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; A.push(m); B.push(m) }
      }
      if (A.length >= 3) next.push(A); if (B.length >= 3) next.push(B)
    }
    polys = next
  }
  const group = new THREE.Group(), pieces = []
  for (const poly of polys) {
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length
    const mesh = new THREE.Group()
    let strips = [poly]
    for (const lx of STRIPS) {
      const nx = []
      for (const sp of strips) { const a = clipX(sp, lx, 1), b = clipX(sp, lx, -1); if (a.length >= 3) nx.push(a); if (b.length >= 3) nx.push(b) }
      strips = nx
    }
    for (const sp of strips) {
      const geo = new THREE.ShapeGeometry(new THREE.Shape(sp.map(([x, y]) => new THREE.Vector2(x - cx, y - cy))))
      const pos = geo.attributes.position, uv = geo.attributes.uv
      for (let k = 0; k < pos.count; k++) {
        const wx = pos.getX(k) + cx
        uv.setXY(k, (wx + PW) / (2 * PW), (pos.getY(k) + cy + PH / 2) / PH)
        const d = deformTop(wx, 1)
        pos.setXYZ(k, d.x - cx, pos.getY(k), d.y)
      }
      geo.computeVertexNormals()
      const m = new THREE.Mesh(geo, mat); m.renderOrder = 20       // 霧より後に描く（霧の下にあっても隠れない）
      mesh.add(m)
    }
    const holder = new THREE.Group()
    holder.rotation.x = -Math.PI / 2
    holder.position.set(cx, 0.008, -cy)
    holder.add(mesh); group.add(holder)
    // 各の筋に対して：どちら側にいるか、筋の先頭がここを通る時刻
    const rel = cuts.map((c) => {
      const along = (cx - c.px) * c.dx + (cy - c.py) * c.dy
      return { side: (cx - c.px) * c.nx + (cy - c.py) * c.ny >= 0 ? 1 : -1, tc: c.t0 + Math.min(1, Math.max(0, (along * c.sgn / REACH + 1) / 2)) * c.dur, slip: rand(-0.012, 0.012), tw: rand(-0.035, 0.035) }
    })
    pieces.push({ holder, mesh, rel, home: holder.position.clone(), dr: new THREE.Vector2(rand(-1, 1), rand(-1, 1)), spin: rand(-0.5, 0.5), tilt: new THREE.Vector2(rand(-1, 1), rand(-1, 1)), lift: rand(0.4, 1), ph: rand(0, 6.28) })
  }
  const tEnd = cuts[cuts.length - 1].t0 + cuts[cuts.length - 1].dur, DRIFT = 0.8, HOLD = 0.35, FADE = 1.5
  const DUR = tEnd + DRIFT + HOLD + FADE
  const update = (t) => {
    const d0 = Math.min(1, Math.max(0, (t - tEnd) / DRIFT)), d = 1 - Math.pow(1 - d0, 3)
    for (const p of pieces) {
      let ox = 0, oy = 0, rz = 0, n = 0
      for (let i = 0; i < cuts.length; i++) {
        const x = t - p.rel[i].tc
        if (x <= 0) continue
        const c = cuts[i], r = p.rel[i], e = 1 - Math.pow(1 - Math.min(1, x / 0.4), 3)
        ox += (c.nx * r.side * c.amp + c.dx * r.slip) * e; oy += (c.ny * r.side * c.amp + c.dy * r.slip) * e
        rz += r.tw * e; n++
      }
      ox += p.dr.x * 0.03 * d; oy += p.dr.y * 0.03 * d
      // 斬られるたびに少しずつ浮き、傾く。斬り終わると、ゆらゆらと宙に漂う
      const up = Math.min(n, 6) * 0.016 * p.lift + d * (0.1 + 0.2 * p.lift), sway = Math.sin(t * 2.2 + p.ph)
      p.holder.position.set(p.home.x + ox, p.home.y + up + sway * 0.012 * d, p.home.z - oy)
      const tl = Math.min(n, 6) * 0.03 + d * 0.32
      p.mesh.rotation.set(p.tilt.x * tl + sway * 0.05 * d, p.tilt.y * tl, rz + p.spin * d * 0.4)
    }
    mat.uniforms.uDissolve.value = Math.min(1, Math.max(0, (t - (tEnd + DRIFT + HOLD)) / FADE))
  }
  update(0)
  return { group, update, DUR, cuts, tEnd, REACH, count: pieces.length }
}

// ---- 落書き：子どもが黒いクレヨンで、縦・横・斜めにぐしゃぐしゃと書きなぐる（面では塗らない） ----
/** 舞台(960×600)の座標で、消したい範囲（rows: 各行の中心y、x0〜x1）を受け取る */
export function makeScribble(canvas, rows, x0, x1) {
  const S = canvas.width / 960
  const ctx = canvas.getContext('2d')
  const top = rows[0] - 20, bot = rows[rows.length - 1] + 20, cx = (x0 + x1) / 2, cy = (top + bot) / 2, W = x1 - x0, Hh = bot - top
  const R = (a, b) => a + Math.random() * (b - a)
  // 1回の「ぐしゃぐしゃ」：ある向きに行ったり来たりしながら、直交方向へ進む。幅も行き過ぎ方も毎回ばらばら
  const segs = []
  const gesture = (ang, ox, oy, span, travel, turns, w) => {
    const ca = Math.cos(ang), sa = Math.sin(ang)
    let prev = null
    for (let i = 0; i <= turns; i++) {
      const side = (i % 2 ? 1 : -1) * span * R(0.55, 1.15) / 2
      const adv = (i / turns - 0.5) * travel + R(-0.5, 0.5) * travel / turns
      const pt = [ox + ca * side - sa * adv + R(-13, 13), oy + sa * side + ca * adv + R(-13, 13)]
      if (prev) {
        // 途中に1点はさんで、線をわずかにたわませる
        const mid = [(prev[0] + pt[0]) / 2 + R(-24, 24), (prev[1] + pt[1]) / 2 + R(-24, 24)]
        segs.push({ a: prev, m: mid, b: pt, w: w * R(1.1, 1.9) })
      }
      prev = pt
    }
  }
  gesture(R(-0.12, 0.12), cx + R(-20, 20), cy + R(-10, 10), W * 1.05, Hh * 1.0, 9, 6.5)          // 横になぐる
  gesture(R(0.5, 0.75), cx - W * 0.16, cy + R(-10, 10), Hh * 1.9, W * 0.62, 8, 6)                  // 右上がりの斜め
  gesture(Math.PI / 2 + R(-0.15, 0.15), cx + W * 0.12, cy, Hh * 1.35, W * 0.7, 10, 5.5)           // 縦
  gesture(R(-0.8, -0.55), cx + W * 0.2, cy + R(-10, 10), Hh * 1.8, W * 0.55, 7, 6.5)               // 右下がりの斜め
  gesture(R(-0.2, 0.2), cx + R(-30, 30), cy + Hh * 0.18, W * 0.9, Hh * 0.55, 6, 7.5)               // 仕上げに、もう一度横
  let drawn = 0
  const draw = (k) => {
    const upto = Math.floor(k * segs.length)
    if (upto <= drawn) return false
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    for (let i = drawn; i < upto; i++) {
      const g = segs[i]
      ctx.strokeStyle = 'rgba(16,13,13,.96)'
      ctx.lineWidth = g.w * S
      ctx.beginPath(); ctx.moveTo(g.a[0] * S, g.a[1] * S); ctx.quadraticCurveTo(g.m[0] * S, g.m[1] * S, g.b[0] * S, g.b[1] * S); ctx.stroke()
      // かすれ（クレヨンが乗らなかった筋）
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 0.8 * S
      for (let j = 0; j < 2; j++) { const o = R(-g.w, g.w) * 0.4; ctx.beginPath(); ctx.moveTo((g.a[0] + o) * S, (g.a[1] + o) * S); ctx.quadraticCurveTo((g.m[0] + o) * S, (g.m[1] + o) * S, (g.b[0] + o) * S, (g.b[1] + o) * S); ctx.stroke() }
      ctx.globalCompositeOperation = 'source-over'
    }
    drawn = upto
    return true
  }
  const clear = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = 0 }
  return { draw, clear }
}
