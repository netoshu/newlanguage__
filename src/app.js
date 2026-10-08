import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js";

const canvas=document.querySelector("#stage");
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(innerWidth,innerHeight); renderer.setClearColor(0x030305,1);
const scene=new THREE.Scene(), camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
const uniforms={uTime:{value:0},uEnergy:{value:0},uEmotion:{value:0},uLook:{value:0}};
const material=new THREE.ShaderMaterial({uniforms,vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.);}`,fragmentShader:`
precision highp float; varying vec2 vUv; uniform float uTime,uEnergy,uEmotion,uLook;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){vec2 p=vUv-.5; float r=length(p); float a=atan(p.y,p.x);
 float wave=sin(a*7.0+uTime*1.5+sin(r*16.0-uTime)*2.0);
 float field=exp(-5.5*abs(r-(.20+.12*uEnergy+wave*.015)));
 float glow=exp(-9.0*r)*(.25+.75*uEnergy);
 float lines=smoothstep(.92,.1,abs(sin((p.x+p.y)*70.0+uTime*2.0)));
 float bitmap=step(.48,fract((vUv.x*72.0+floor(vUv.y*42.0))*.5+field));
 float halftone=step(.52,fract(r*90.0+0.5*sin(a*12.0)));
 float look=uLook<.5?mix(1.0,bitmap,.65):uLook<1.5?mix(1.0,halftone,.75):mix(1.0,lines,.8);
 vec3 base=mix(vec3(.08,.12,.18),vec3(.65,.2,.95),uEmotion);
 base=mix(base,vec3(.15,.8,1.0),sin(uTime*.7)*.5+.5);
 float alpha=clamp(field*look+glow*.65,0.,1.);
 gl_FragColor=vec4(base*(.45+alpha*1.2),1.0);
}`});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));

const state={connected:false,recording:false,start:0,emotion:"IDLE",emotionUntil:0,intensity:0,look:0,samples:[],lastAngle:null,unwrapped:0,lastT:0,crossings:[]};
const names=["BITMAP","HALFTONE","TEXTILE","EMBROIDERY"];
function dead(v,e=.08){return Math.abs(v)<e?0:v}
function angle(x,y){return Math.atan2(-y,x)}
function poll(){
 const pads=navigator.getGamepads?navigator.getGamepads():[];
 const pad=[...pads].find(Boolean);
 const now=performance.now(), t=now/1000;
 if(!pad){state.connected=false;document.querySelector("#status").textContent="GAMEPAD / WAITING";return null}
 state.connected=true;document.querySelector("#status").textContent="GAMEPAD / "+pad.id.slice(0,34);
 const lx=dead(pad.axes[0]||0),ly=dead(pad.axes[1]||0),rx=dead(pad.axes[2]||0),ry=dead(pad.axes[3]||0);
 const a=angle(lx,ly);
 if(Math.hypot(lx,ly)>.18&&state.lastAngle!==null){let d=a-state.lastAngle;if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;state.unwrapped+=d}
 state.lastAngle=Math.hypot(lx,ly)>.18?a:state.lastAngle;
 state.crossings.push({t,x:lx}); state.crossings=state.crossings.filter(c=>t-c.t<1.5);
 const z=state.crossings.slice(-2); if(z.length===2&&Math.sign(z[0].x)!==Math.sign(z[1].x)&&Math.abs(z[0].x-z[1].x)>.25)state.crossings.push({t,x:0,marker:1});
 const marked=state.crossings.filter(c=>c.marker&&t-c.t<1.5).length;
 let emotion=state.emotion;
 if(state.lastT){const av=Math.abs((state.unwrapped-(state.prevUnwrapped||state.unwrapped))/(t-state.lastT));
   if(Math.abs(lx)>0.35&&marked>4) emotion="ANNOYANCE";
   else if(Math.abs(lx)>0.2&&marked>=1) emotion="TAUNTING";
   else if(av>2.2&&lx*ly!==0) emotion="EXCITEMENT";
   if(Math.abs(rx)>0.35&&Math.abs(ry)<0.25) emotion="DISAGREEMENT";
   if(Math.abs(rx)<0.25&&Math.abs(ry)>0.35&&Math.abs(ry-(state.prevRy||0))>.2) emotion="APPROVAL";
   if(Math.abs((state.prevLA||0)*ly-(state.prevLY||0)*lx)>0.55&&Math.abs(rx*ry)>0.12) emotion="DANCING";
 }
 state.prevUnwrapped=state.unwrapped;state.prevRy=ry;state.prevLA=lx;state.prevLY=ly;state.lastT=t;
 if(emotion!==state.emotion){state.emotion=emotion;state.emotionUntil=t+3}
 if(t>state.emotionUntil)state.emotion="IDLE";
 if(state.emotion!=="IDLE")state.intensity=Math.min(1,Math.max(state.intensity*.94,Math.max(0,-ry)));
 else state.intensity*=.94;
 const sample={t:state.recording?(now-state.start)/1000:0,lx,ly,rx,ry,emotion:state.emotion,intensity:state.intensity};
 if(state.recording)state.samples.push(sample);
 document.querySelector("#leftData").textContent=lx.toFixed(2)+" / "+ly.toFixed(2);
 document.querySelector("#rightData").textContent=rx.toFixed(2)+" / "+ry.toFixed(2);
 return sample;
}
function haptics(pad,emotion,intensity){
 if(!pad?.vibrationActuator)return;
 const patterns={EXCITEMENT:[{duration:90,weakMagnitude:.25,strongMagnitude:.45},{duration:90,weakMagnitude:.45,strongMagnitude:.7}],TAUNTING:[{duration:160,weakMagnitude:.35,strongMagnitude:.15},{duration:160,weakMagnitude:.15,strongMagnitude:.35}],ANNOYANCE:[{duration:45,weakMagnitude:.8,strongMagnitude:.9}],DISAGREEMENT:[{duration:80,weakMagnitude:.15,strongMagnitude:.8},{duration:70},{duration:80,weakMagnitude:.15,strongMagnitude:.8}],APPROVAL:[{duration:80,weakMagnitude:.25,strongMagnitude:.3},{duration:60},{duration:80,weakMagnitude:.25,strongMagnitude:.3}]};
 const p=patterns[emotion]; if(p&&Math.random()<.12)pad.vibrationActuator.playEffect("dual-rumble",{duration:Math.max(...p.map(x=>x.duration)),strongMagnitude:intensity,weakMagnitude:intensity*.65});
}
function render(t){requestAnimationFrame(render);poll();uniforms.uTime.value=t*.001;uniforms.uEnergy.value=state.intensity;uniforms.uEmotion.value=state.emotion==="IDLE"?0:(state.emotion.length%7)/7;uniforms.uLook.value=state.look;renderer.render(scene,camera);document.querySelector("#emotion").textContent=state.emotion;document.querySelector("#intensity").style.width=(state.intensity*100)+"%";document.querySelector("#intensityText").textContent="INTENSITY "+state.intensity.toFixed(2);document.querySelector("#timer").textContent=state.recording?format((performance.now()-state.start)/1000):"00:00.000"}
function format(s){const m=Math.floor(s/60),sec=Math.floor(s%60),ms=Math.floor((s%1)*1000);return String(m).padStart(2,"0")+":"+String(sec).padStart(2,"0")+"."+String(ms).padStart(3,"0")}
document.querySelector("#record").onclick=()=>{state.recording=!state.recording;if(state.recording){state.samples=[];state.start=performance.now();document.querySelector("#record").classList.add("active");document.querySelector("#record").textContent="■ STOP"}else{document.querySelector("#record").classList.remove("active");document.querySelector("#record").textContent="● RECORD"}};
document.querySelector("#export").onclick=async()=>{const data=JSON.stringify({version:1,frameRate:60,samples:state.samples},null,2);await window.nativeAPI.saveJSON({data})};
document.querySelector("#look").onclick=()=>{state.look=(state.look+1)%4;document.querySelector("#look").textContent="LOOK: "+names[state.look]};
addEventListener("resize",()=>{renderer.setSize(innerWidth,innerHeight);});
render(0);
