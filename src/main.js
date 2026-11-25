import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = (s) => document.querySelector(s);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = $('#universe');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (error) {
  $('#loader').innerHTML = '<p>这场旅程需要 WebGL 支持</p><span>请在浏览器设置中开启硬件加速后刷新。</span>';
  throw error;
}
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.13;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#07090d');
scene.fog = new THREE.FogExp2('#070a10', .006);
const camera = new THREE.PerspectiveCamera(43, innerWidth / innerHeight, .1, 300);
const home = new THREE.Vector3(0, 4.3, 23.5);
camera.position.copy(home);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, .25, 0);
controls.enableDamping = true;
controls.dampingFactor = .045;
controls.enablePan = false;
controls.minDistance = 7;
controls.maxDistance = 48;
controls.rotateSpeed = .36;
controls.zoomSpeed = .65;
controls.minPolarAngle = .14;
controls.maxPolarAngle = Math.PI - .14;
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .85, .65, .72);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// Deterministic star field: every visit opens onto the same patch of sky.
let seed = 39841;
function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
const vertexNoise = `
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float f=0.;float a=.5;for(int i=0;i<4;i++){f+=a*noise(p);p=p*2.03+3.1;a*=.5;}return f;}`;
const starGeo = new THREE.BufferGeometry();
const starCount = 6500;
const starPositions = new Float32Array(starCount * 3);
const starColors = new Float32Array(starCount * 3);
const starSizes = new Float32Array(starCount);
for (let i=0;i<starCount;i++) {
  const r=35+rand()*105, theta=rand()*Math.PI*2, z=rand()*2-1;
  starPositions.set([r*Math.sqrt(1-z*z)*Math.cos(theta), r*z, r*Math.sqrt(1-z*z)*Math.sin(theta)],i*3);
  const warm=rand();
  starColors.set(warm>.78?[.85,.66,.40]:[.46+warm*.3,.57+warm*.3,.69+warm*.2],i*3);
  starSizes[i] = rand()>.985 ? 3.5+rand()*2.5 : .65+rand()*1.4;
}
starGeo.setAttribute('position',new THREE.BufferAttribute(starPositions,3));
starGeo.setAttribute('color',new THREE.BufferAttribute(starColors,3));
starGeo.setAttribute('size',new THREE.BufferAttribute(starSizes,1));
const stars = new THREE.Points(starGeo,new THREE.ShaderMaterial({
  uniforms:{uTime:{value:0},uPixelRatio:{value:renderer.getPixelRatio()}},
  vertexShader:`attribute float size; varying vec3 vColor; uniform float uTime; uniform float uPixelRatio; void main(){vColor=color; vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=size*uPixelRatio*(.8+.2*sin(uTime*.4+position.x));}`,
  fragmentShader:`varying vec3 vColor;void main(){float d=length(gl_PointCoord-.5);float a=exp(-d*d*22.);gl_FragColor=vec4(vColor,a*.8);}`,
  transparent:true,vertexColors:true,depthWrite:false,blending:THREE.AdditiveBlending
}));
scene.add(stars);

const singularity = new THREE.Group();
singularity.position.set(4.1,.35,0);
scene.add(singularity);
const uniforms={uTime:{value:0},uWarm:{value:new THREE.Color('#ffb858')},uEnergy:{value:1},uPhase:{value:0}};
// A turbulent, differentially rotating accretion flow in real 3D space.
const diskGeometry = new THREE.RingGeometry(2.04,6.9,256,72);
diskGeometry.rotateX(-Math.PI/2);
const disk = new THREE.Mesh(diskGeometry,new THREE.ShaderMaterial({
  uniforms,side:THREE.DoubleSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`varying vec3 vPos; varying vec2 vUv; void main(){vPos=position;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`${vertexNoise}
  varying vec3 vPos; varying vec2 vUv; uniform float uTime; uniform vec3 uWarm; uniform float uEnergy; uniform float uPhase;
  void main(){float r=length(vPos.xz);float a=atan(vPos.z,vPos.x);float t=uTime*.21;
  vec3 p=vec3(cos(a+t/pow(r*.3,1.5))*r*2.,sin(a+t/pow(r*.3,1.5))*r*2.,r*3.);
  float n=fbm(p+vec3(0.,0.,uTime*.07));
  float filaments=pow(.5+.5*sin(r*65.+n*12.+a*2.-t*3.),3.);
  float inner=exp(-(r-2.08)*1.05);float fade=smoothstep(6.9,3.8,r)*smoothstep(2.04,2.19,r);
  float bright=(.23+filaments*.65+n*.65)*inner;
  float hot=exp(-(r-2.1)*3.);
  vec3 color=mix(uWarm,vec3(1.,.9,.70),hot*.75);
  float clumps=.45+.55*fbm(vec3(vPos.x*1.2+cos(t),vPos.z*1.2+sin(t),t*.2));
  float doppler=.65+.35*sin(a+.5);
  gl_FragColor=vec4(color*(bright*4.3+.05)*doppler*uEnergy,fade*clumps*(.48+inner*.55));
  }`
}));
disk.rotation.z = -.15;
disk.rotation.x = .08;
singularity.add(disk);

// A fully opaque event horizon occludes both stars and the far side of the disk.
const core = new THREE.Mesh(new THREE.SphereGeometry(2.02,96,64), new THREE.MeshBasicMaterial({color:'#010203'}));
singularity.add(core);
// Relativistic photon ring: billboarded to the observer, with a narrow luminous edge.
const halo = new THREE.Mesh(new THREE.PlaneGeometry(12,12),new THREE.ShaderMaterial({
  uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`${vertexNoise}
  varying vec2 vUv;uniform float uTime;uniform vec3 uWarm;uniform float uEnergy;
  void main(){vec2 p=(vUv-.5)*12.;float r=length(p);float a=atan(p.y,p.x);float edge=2.065;
  float ring=exp(-abs(r-edge)*75.);float glow=exp(-abs(r-edge)*9.)*.5+exp(-abs(r-edge)*2.9)*.10;
  float outer=step(edge,r);float upper=.7+.3*sin(a);
  float f=.8+.2*noise(vec3(a*8.,r*8.,uTime*.2));
  vec3 c=mix(uWarm,vec3(1.,.91,.74),ring*.5);
  gl_FragColor=vec4(c*(ring*3.+glow)*upper*f*uEnergy,outer*.95);
  }`
}));
singularity.add(halo);
// The lensed far-side arc rises above the physical disk.
const arc = new THREE.Mesh(new THREE.PlaneGeometry(10,10),new THREE.ShaderMaterial({
  uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`${vertexNoise}
  varying vec2 vUv;uniform float uTime;uniform vec3 uWarm;uniform float uEnergy;
  void main(){vec2 p=(vUv-.5)*10.;float r=length(p/vec2(1.04,1.));float a=atan(p.y,p.x);float mask=smoothstep(-.25,.5,p.y);float n=fbm(vec3(a*12.,r*10.-uTime*.2,uTime*.06));float band=exp(-pow((r-2.23)/.19,2.));float streak=.4+.6*pow(.5+.5*sin(r*125.+n*6.),2.);vec3 c=mix(uWarm,vec3(1.,.85,.62),.35);gl_FragColor=vec4(c*band*streak*1.5*uEnergy,mask*.62);}`
}));
singularity.add(arc);

// Sparse orbital embers and the almost invisible traces of vanished worlds.
const emberCount=11000, emberGeo=new THREE.BufferGeometry();
const emberPos=new Float32Array(emberCount*3), emberData=new Float32Array(emberCount*3);
for(let i=0;i<emberCount;i++){
  const r=2.5+Math.pow(rand(),1.7)*9, a=rand()*Math.PI*2;
  emberPos.set([Math.cos(a)*r,(rand()-.5)*(.12+r*.055),Math.sin(a)*r],i*3);
  emberData.set([rand(),rand(),rand()],i*3);
}
emberGeo.setAttribute('position',new THREE.BufferAttribute(emberPos,3));
emberGeo.setAttribute('aData',new THREE.BufferAttribute(emberData,3));
const embers=new THREE.Points(emberGeo,new THREE.ShaderMaterial({
  uniforms:{...uniforms,uPixelRatio:{value:renderer.getPixelRatio()}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`attribute vec3 aData;varying float vAlpha;varying float vHeat;uniform float uTime;uniform float uPixelRatio;uniform float uPhase;
  void main(){float r=length(position.xz);float a=atan(position.z,position.x)+uTime*.20/pow(r*.3,1.5);vec3 p=vec3(cos(a)*r,position.y,sin(a)*r);p.y+=sin(a*3.+uTime*.15)*.04*r*uPhase;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((.5+aData.x*1.7)*uPixelRatio*22./-mv.z,.5,5.);vAlpha=(.15+aData.y*.6)*smoothstep(12.,3.,r);vHeat=aData.z;}`,
  fragmentShader:`varying float vAlpha;varying float vHeat;uniform vec3 uWarm;uniform float uEnergy;void main(){float d=length(gl_PointCoord-.5);float a=exp(-d*d*20.)*vAlpha;gl_FragColor=vec4(mix(uWarm,vec3(.78,.86,1.),vHeat*.35)*1.8*uEnergy,a);}`
}));
embers.rotation.copy(disk.rotation);
singularity.add(embers);
const orbitLines=new THREE.Group();
for(let i=0;i<4;i++){
  const pts=[];const r=7.5+i*.95;
  for(let j=0;j<=280;j++){const a=j/280*Math.PI*2;pts.push(new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r));}
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:i%2?'#5a5b55':'#8d7855',transparent:true,opacity:.055-i*.008,depthWrite:false}));
  line.rotation.z=-.15+i*.025;line.rotation.x=.08+i*.015;orbitLines.add(line);
}
singularity.add(orbitLines);

// Wide, quiet clouds bring depth without using image assets.
const nebula = new THREE.Mesh(new THREE.PlaneGeometry(160,85),new THREE.ShaderMaterial({
  uniforms:{uTime:uniforms.uTime},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`${vertexNoise} varying vec2 vUv;uniform float uTime;void main(){vec2 p=vUv;float n=fbm(vec3(p*6.,.3));float m=fbm(vec3(p*12.+n*3.,2.));float band=exp(-pow((p.y-.46+sin(p.x*5.)*.09)/.16,2.));float a=pow(n*m,1.8)*band;vec3 c=mix(vec3(.10,.18,.25),vec3(.30,.23,.14),smoothstep(.3,.8,p.x));gl_FragColor=vec4(c,a*.8);}`
}));
nebula.position.set(0,3,-55);scene.add(nebula);

let paused = reducedMotion, elapsed=0, mode=0, journey=false, journeyStart=0, journeyFrom=new THREE.Vector3();
const mouse=new THREE.Vector2();
canvas.addEventListener('pointermove',e=>{mouse.set(e.clientX/innerWidth-.5,e.clientY/innerHeight-.5);});
let toastTimer;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2400);}
const modes=[
  {color:'#ffb858',energy:1,position:new THREE.Vector3(0,4.3,23.5),name:'在一切结束的地方，看见开始。',title:'CHAPTER 01',subtitle:'THE LAST LIGHT',poem:'当最后一颗恒星熄灭，<br>宇宙仍记得，光曾来过。'},
  {color:'#ff7641',energy:1.3,position:new THREE.Vector3(-1,9,21),name:'那些未曾熄灭的，是时间的余温。',title:'CHAPTER 02',subtitle:'THE REMAINING EMBERS',poem:'亿万年的燃烧之后，<br>我们不过是，星辰的余烬。'},
  {color:'#9cc9ff',energy:.9,position:new THREE.Vector3(2,1.2,26),name:'永恒不是很久，而是不再有以后。',title:'CHAPTER 03',subtitle:'BEYOND ETERNITY',poem:'不再有过去与未来，<br>只有此刻，和无声的永恒。'}
];
let cameraTransition=null;
const desiredColor=new THREE.Color(modes[0].color);
function stopJourney(){journey=false;document.body.classList.remove('immersive');$('#journey-label').textContent='坠入永恒';controls.enabled=true;}
function setMode(index){
  mode=index;stopJourney();desiredColor.set(modes[mode].color);
  cameraTransition={from:camera.position.clone(),to:modes[mode].position.clone(),targetFrom:controls.target.clone(),start:performance.now(),duration:2200};
  document.querySelectorAll('.chapter').forEach((b,i)=>b.classList.toggle('active',i===index));
  $('#scene-number').textContent=`0${index+1} — 03`;$('#scene-name').textContent=modes[index].name;
  $('.eyebrow').innerHTML=`${modes[index].title} <span>/</span> ${modes[index].subtitle}`;
  $('.poem').innerHTML=modes[index].poem;
}
document.querySelectorAll('.chapter').forEach(b=>b.addEventListener('click',()=>setMode(Number(b.dataset.mode))));
function reset(){setMode(0);toast('已返回最初的坐标');}
$('#reset').addEventListener('click',reset);
$('#journey').addEventListener('click',()=>{
  journey=true;journeyStart=performance.now();journeyFrom.copy(camera.position);cameraTransition=null;controls.enabled=false;
  document.body.classList.add('immersive');toast('穿越已开始 · 拖动或按 Esc 返回');
});
controls.addEventListener('start',()=>{cameraTransition=null;if(journey)stopJourney();});
canvas.addEventListener('pointerdown',()=>{if(journey)stopJourney();});
canvas.addEventListener('wheel',()=>{if(journey)stopJourney();},{passive:true});
function togglePause(){paused=!paused;toast(paused?'时间已静止 · 空格继续':'时间重新流动');}
window.addEventListener('keydown',e=>{
  if($('#about-dialog').open || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)return;
  if(e.code==='Space'){e.preventDefault();togglePause();}
  if(e.key==='Escape'&&journey){stopJourney();reset();}
  if(['1','2','3'].includes(e.key))setMode(Number(e.key)-1);
  if(e.key.toLowerCase()==='r')reset();
});
$('#about').addEventListener('click',()=>$('#about-dialog').showModal());
$('#close-about').addEventListener('click',()=>$('#about-dialog').close());
$('#about-dialog').addEventListener('click',e=>{if(e.target===$('#about-dialog')){const b=e.target.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)e.target.close();}});
$('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('当前浏览器不支持全屏');}});

let audioCtx, masterGain, soundOn=false;
function initAudio(){
  audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  masterGain=audioCtx.createGain();masterGain.gain.value=0;masterGain.connect(audioCtx.destination);
  const lowpass=audioCtx.createBiquadFilter();lowpass.type='lowpass';lowpass.frequency.value=380;lowpass.connect(masterGain);
  [36.71,55,73.42,110.12,146.83].forEach((f,i)=>{
    const osc=audioCtx.createOscillator();osc.type='sine';osc.frequency.value=f;
    const gain=audioCtx.createGain();gain.gain.value=i<2?.13:.035;
    osc.connect(gain);gain.connect(lowpass);osc.start();
    const lfo=audioCtx.createOscillator();lfo.frequency.value=.06+i*.017;const mod=audioCtx.createGain();mod.gain.value=.013;lfo.connect(mod);mod.connect(gain.gain);lfo.start();
  });
  const buffer=audioCtx.createBuffer(1,audioCtx.sampleRate*4,audioCtx.sampleRate);const data=buffer.getChannelData(0);let prev=0;
  for(let i=0;i<data.length;i++){prev=(prev+Math.random()*.04-.02)/1.02;data[i]=prev;}
  const source=audioCtx.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(lowpass);source.start();
}
$('#sound').addEventListener('click',async()=>{
  try{if(!audioCtx)initAudio();await audioCtx.resume();soundOn=!soundOn;masterGain.gain.setTargetAtTime(soundOn?.55:0,audioCtx.currentTime,.5);$('#sound').setAttribute('aria-pressed',String(soundOn));$('#sound-label').textContent=soundOn?'声音开启':'声音关闭';}
  catch{toast('环境音暂不可用');}
});

window.addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);
});
document.addEventListener('visibilitychange',()=>{if(audioCtx){if(document.hidden)audioCtx.suspend();else if(soundOn)audioCtx.resume();}});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();toast('图形上下文中断，请刷新页面重新启程');});
const clock=new THREE.Clock();
let frameCount=0, fpsStart=performance.now(), qualityAdjusted=false;
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.05), now=performance.now();
  if(document.hidden)return;
  if(!paused)elapsed+=dt;
  uniforms.uTime.value=elapsed;
  stars.material.uniforms.uTime.value=elapsed;
  uniforms.uWarm.value.lerp(desiredColor,.025);
  uniforms.uEnergy.value=THREE.MathUtils.lerp(uniforms.uEnergy.value,modes[mode].energy,.025);
  uniforms.uPhase.value=THREE.MathUtils.lerp(uniforms.uPhase.value,mode===1?1:0,.02);
  if(!paused){stars.rotation.y=elapsed*.0015;orbitLines.rotation.y=elapsed*.008;}
  if(cameraTransition){
    const t=Math.min((now-cameraTransition.start)/cameraTransition.duration,1),e=t*t*(3-2*t);
    camera.position.lerpVectors(cameraTransition.from,cameraTransition.to,e);controls.target.lerpVectors(cameraTransition.targetFrom,new THREE.Vector3(0,.25,0),e);
    if(t===1)cameraTransition=null;
  }
  if(journey){
    const t=(now-journeyStart)/1000;
    const approach=Math.min(t/9,1);const ease=approach*approach*(3-2*approach);
    const dest=new THREE.Vector3(5.2,1.2,6.4);
    camera.position.lerpVectors(journeyFrom,dest,ease);
    if(t>9){camera.position.x+=Math.sin((t-9)*.1)*1.3;camera.position.y+=Math.sin((t-9)*.15)*.8;}
    controls.target.lerp(singularity.position,.018);
    camera.lookAt(controls.target);
    $('#dilation').innerHTML=`${(1+ease*998).toFixed(0)}<small> ×</small>`;
  } else {controls.update();$('#dilation').innerHTML='∞<small> ×</small>';}
  halo.quaternion.copy(camera.quaternion);arc.quaternion.copy(camera.quaternion);
  // Small parallax is applied only to the distant cloud, not the user's camera.
  nebula.position.x=mouse.x*.65;
  composer.render();
  frameCount++;
  if(!qualityAdjusted&&now-fpsStart>4500){
    const fps=frameCount/((now-fpsStart)/1000);
    if(fps<34){renderer.setPixelRatio(1);composer.setPixelRatio(1);stars.material.uniforms.uPixelRatio.value=1;embers.material.uniforms.uPixelRatio.value=1;}
    qualityAdjusted=true;
  }
}
animate();
setTimeout(()=>$('#loader').classList.add('done'),650);
// A deliberately small read-only diagnostics surface for checking the live artwork.
window.__TIME_END__={get state(){return{chapter:mode+1,paused,journey,soundOn,stars:starCount,embers:emberCount,webgl:renderer.capabilities.isWebGL2,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,camera:camera.position.toArray()};}};
