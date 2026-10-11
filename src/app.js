const $ = id => document.getElementById(id);

// Use the browser's 2D canvas directly. This avoids WebGL initialization failures
// on browsers/devices where Three.js cannot create a rendering context.
const canvas = document.getElementById('stage') || document.createElement('canvas');
canvas.id = 'stage';
if (!canvas.isConnected) (document.querySelector('main') || document.body).appendChild(canvas);
const ctx = canvas.getContext('2d');
const state = {
  recording:false, start:0, emotion:'IDLE', until:0, intensity:0, look:0,
  samples:[], lastAngle:null, turns:0, lastT:0, crossings:[],
  prev:{ry:0,lx:0,ly:0,u:0}, buttons:[], padIndex:null, particles:[]
};
const looks = ['BITMAP','HALFTONE','TEXTILE','EMBROIDERY'];
const names = ['A','B','X','Y','LB','RB','LT','RT','BACK','START','LS','RS','UP','DOWN','LEFT','RIGHT'];
const dead = v => Math.abs(v)<.08 ? 0 : v;
const ang = (x,y) => Math.atan2(-y,x);
function resize(){
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.max(1,Math.floor(window.innerWidth*dpr));
  canvas.height=Math.max(1,Math.floor(window.innerHeight*dpr));
  canvas.style.width=window.innerWidth+'px'; canvas.style.height=window.innerHeight+'px';
  if(ctx) ctx.setTransform(dpr,0,0,dpr,0,0);
}
resize();
function download(name,text,type){
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type}));
  a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),500);
}
function emotion(e,t){state.emotion=e;state.until=t+3;state.intensity=Math.max(state.intensity,.45);for(let i=0;i<8;i++)state.particles.push({a:Math.random()*Math.PI*2,r:30+Math.random()*100,v:20+Math.random()*100,life:1});}
function getPads(){try{return navigator.getGamepads?Array.from(navigator.getGamepads()).filter(Boolean):[]}catch{return[]}}
function events(pad,t){
  const b=pad.buttons.map(x=>!!x.pressed);
  b.forEach((v,i)=>{if(v&&!state.buttons[i]){
    if(i===0)emotion('PARTICLES',t); if(i===1)emotion('DASH',t);
    if(i===2)emotion('WATER',t); if(i===3)emotion('RIPPLES',t);
    if(i>=12&&i<=15)state.look=(state.look+1)%4;
    if(state.recording)state.samples.push({t:(performance.now()-state.start)/1000,event:names[i]||('BUTTON_'+i),emotion:state.emotion,intensity:state.intensity});
  }});state.buttons=b;
}
function poll(){
  const pads=getPads(),pad=pads.find(p=>p.index===state.padIndex)||pads[0],now=performance.now(),t=now/1000;
  if(!pad){state.padIndex=null;state.buttons=[];$('status').textContent=navigator.getGamepads?'GAMEPAD / PRESS ANY BUTTON':'GAMEPAD / UNSUPPORTED';$('leftData').textContent='0.00 / 0.00';$('rightData').textContent='0.00 / 0.00';return;}
  state.padIndex=pad.index;$('status').textContent='GAMEPAD / '+pad.id.slice(0,34);
  const lx=dead(pad.axes[0]||0),ly=dead(pad.axes[1]||0),rx=dead(pad.axes[2]||0),ry=dead(pad.axes[3]||0),a=ang(lx,ly);
  if(Math.hypot(lx,ly)>.18&&state.lastAngle!==null){let d=a-state.lastAngle;if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;state.turns+=d;}
  if(Math.hypot(lx,ly)>.18)state.lastAngle=a;
  state.crossings=state.crossings.filter(c=>t-c.t<1.5);
  if(Math.abs(lx)>.2&&state.crossings.length&&Math.sign(lx)!==Math.sign(state.crossings[state.crossings.length-1].x))state.crossings.push({t,x:lx});
  else if(Math.abs(lx)>.08)state.crossings.push({t,x:lx});
  const marked=state.crossings.length;
  if(state.lastT){
    const av=Math.abs((state.turns-state.prev.u)/(t-state.lastT));
    if(Math.abs(lx)>.35&&marked>4)emotion('ANNOYANCE',t);
    else if(Math.abs(lx)>.2&&marked>1)emotion('TAUNTING',t);
    else if(av>2.2&&Math.hypot(lx,ly)>.35)emotion('EXCITEMENT',t);
    if(Math.abs(rx)>.35&&Math.abs(ry)<.25)emotion('DISAGREEMENT',t);
    if(Math.abs(ry)>.35&&Math.abs(ry-state.prev.ry)>.2&&Math.abs(rx)<.25)emotion('APPROVAL',t);
    if(Math.abs(state.prev.lx*ly-state.prev.ly*lx)>.55&&Math.abs(rx*ry)>.12)emotion('DANCING',t);
  }
  events(pad,t);state.prev={ry,lx,ly,u:state.turns};state.lastT=t;
  if(t>state.until&&['ANNOYANCE','TAUNTING','EXCITEMENT','DISAGREEMENT','APPROVAL','DANCING'].includes(state.emotion))state.emotion='IDLE';
  state.intensity=state.emotion==='IDLE'?state.intensity*.94:Math.min(1,Math.max(state.intensity*.94,Math.max(0,-ry)));
  if(state.recording)state.samples.push({t:(now-state.start)/1000,lx,ly,rx,ry,emotion:state.emotion,intensity:state.intensity});
  $('leftData').textContent=lx.toFixed(2)+' / '+ly.toFixed(2);$('rightData').textContent=rx.toFixed(2)+' / '+ry.toFixed(2);
}
function draw(ms){
  if(!ctx)return;
  const w=window.innerWidth,h=window.innerHeight,d=Math.min(w,h),cx=w*.5,cy=h*.48,t=ms/1000;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#030305';ctx.fillRect(0,0,w,h);
  const energy=state.intensity, phase=t*1.1, radius=d*(.18+.06*energy);
  const grad=ctx.createRadialGradient(cx,cy,2,cx,cy,d*.48);
  grad.addColorStop(0,'rgba(80,35,130,'+(.13+energy*.13)+')');grad.addColorStop(.55,'rgba(18,45,65,.10)');grad.addColorStop(1,'rgba(3,3,5,0)');
  ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
  const palette=state.emotion==='IDLE'?['#68e4ff','#9c6bff']:['#ff79d1','#8a6bff','#69e7ff'];
  ctx.save();ctx.translate(cx,cy);ctx.globalCompositeOperation='lighter';
  for(let ring=0;ring<7;ring++){
    const rr=radius+ring*d*.025+Math.sin(phase+ring*.8)*d*.008;
    ctx.beginPath();
    const steps=240;
    for(let i=0;i<=steps;i++){
      const a=i/steps*Math.PI*2;
      const wave=Math.sin(a*(state.look===3?22:7)+phase+Math.sin(rr*.03-phase)*2)*d*(.005+energy*.012);
      const r=rr+wave;
      const x=Math.cos(a)*r,y=Math.sin(a)*r;
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.closePath();ctx.strokeStyle=palette[ring%palette.length];ctx.globalAlpha=.28/(ring*.25+1);ctx.lineWidth=ring===0?1.8:1;ctx.shadowBlur=18+energy*20;ctx.shadowColor=palette[ring%palette.length];ctx.stroke();
  }
  ctx.shadowBlur=0;
  const count=state.look===0?110:state.look===1?170:state.look===2?85:125;
  for(let i=0;i<count;i++){
    const a=i*2.39996+phase*(i%2?1:-.7), r=(.12+(i%37)/37*.36)*d;
    const jitter=Math.sin(i*13.7+phase*1.8)*d*(.002+energy*.01);
    const x=Math.cos(a)*(r+jitter),y=Math.sin(a)*(r+jitter);
    const size=state.look===1?1.8:state.look===3?2.2:1.1;
    ctx.globalAlpha=.15+.45*(.5+.5*Math.sin(phase*1.7+i));
    ctx.fillStyle=palette[i%palette.length];
    if(state.look===2){ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x-4,y-3);ctx.lineTo(x+4,y+3);ctx.stroke();}
    else ctx.fillRect(x-size/2,y-size/2,size,size);
  }
  state.particles=state.particles.filter(p=>p.life>0);
  for(const p of state.particles){const r=p.r+(1-p.life)*p.v;ctx.globalAlpha=p.life;ctx.fillStyle='#a9eaff';ctx.beginPath();ctx.arc(Math.cos(p.a)*r,Math.sin(p.a)*r,2+p.life*2,0,Math.PI*2);ctx.fill();p.life-=.012;}
  ctx.restore();ctx.globalAlpha=1;
}
function format(s){const m=Math.floor(s/60),q=Math.floor(s%60),ms=Math.floor((s%1)*1000);return String(m).padStart(2,'0')+':'+String(q).padStart(2,'0')+'.'+String(ms).padStart(3,'0');}
$('record').onclick=()=>{state.recording=!state.recording;if(state.recording){state.samples=[];state.start=performance.now();$('record').classList.add('active');$('record').textContent='■ STOP';}else{$('record').classList.remove('active');$('record').textContent='● RECORD';}};
$('export').onclick=()=>download('newlanguage-session.json',JSON.stringify({version:2,frameRate:60,createdAt:new Date().toISOString(),samples:state.samples},null,2),'application/json');
$('exportCsv').onclick=()=>{const h='t,lx,ly,rx,ry,emotion,intensity,event';const rows=state.samples.map(s=>[s.t,s.lx??'',s.ly??'',s.rx??'',s.ry??'',s.emotion??'',s.intensity??'',s.event??''].join(','));download('newlanguage-session.csv',[h,...rows].join('\n'),'text/csv');};
$('look').onclick=()=>{state.look=(state.look+1)%4;$('look').textContent='LOOK: '+looks[state.look];};
window.addEventListener('resize',resize);
window.addEventListener('gamepadconnected',e=>{state.padIndex=e.gamepad.index;$('status').textContent='GAMEPAD / '+e.gamepad.id.slice(0,34);});
window.addEventListener('gamepaddisconnected',e=>{if(state.padIndex===e.gamepad.index)state.padIndex=null;});
window.addEventListener('pointerdown',()=>getPads(),{passive:true});window.addEventListener('keydown',()=>getPads(),{passive:true});
function frame(t){requestAnimationFrame(frame);poll();draw(t);$('emotion').textContent=state.emotion;$('intensity').style.width=(state.intensity*100)+'%';$('intensityText').textContent='INTENSITY '+state.intensity.toFixed(2);$('timer').textContent=state.recording?format((performance.now()-state.start)/1000):'00:00.000';}
$('status').textContent=ctx?'APP / READY':'APP ERROR / 2D CANVAS UNAVAILABLE';
requestAnimationFrame(frame);
