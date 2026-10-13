const $ = id => document.getElementById(id);

// Use the browser's 2D canvas directly. This avoids WebGL initialization failures
// on browsers/devices where Three.js cannot create a rendering context.
const canvas = document.getElementById('stage') || document.createElement('canvas');
canvas.id = 'stage';
if (!canvas.isConnected) (document.querySelector('main') || document.body).appendChild(canvas);
const ctx = canvas.getContext('2d');
const state = {
  recording:false, start:0, emotion:'IDLE', until:0, intensity:0, look:0,
  samples:[], lastAngle:null, turns:0, lastT:0, crossings:[], leftSweep:[], rightSweep:[],
  prev:{ry:0,lx:0,ly:0,rx:0,u:0}, buttons:[], padIndex:null, particles:[], trail:false, dimension:2, texture:0.5,
  lastTrigger:{}, lastHaptic:0, leftAngle:null, rightAngle:null, lastLeftDelta:0, lastRightDelta:0, lastEmotionTrigger:0, effects:[], keys:new Set(), keyAxes:[0,0,0,0]
};
const looks = ['GRADIENT','EMBROIDERY'];
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
function vibrate(kind='tick', amount=0.5){
  const pads=getPads(), pad=pads.find(p=>p.index===state.padIndex)||pads[0];
  const actuator=pad&&(pad.vibrationActuator||(pad.hapticActuators&&pad.hapticActuators[0]));
  if(!actuator)return;
  const now=performance.now(); if(now-state.lastHaptic<100)return; state.lastHaptic=now;
  const patterns={
    tick:{duration:35,strongMagnitude:.12,weakMagnitude:.2},
    water:{duration:45,strongMagnitude:.08,weakMagnitude:.18},
    bump:{duration:90,strongMagnitude:.45,weakMagnitude:.28},
    no:{duration:70,strongMagnitude:.58,weakMagnitude:.2},
    buzz:{duration:180,strongMagnitude:.7,weakMagnitude:.55},
    swell:{duration:240,strongMagnitude:.2+amount*.25,weakMagnitude:.2+amount*.3},
    dance:{duration:120,strongMagnitude:.2+amount*.35,weakMagnitude:.3+amount*.35}
  };
  const p=patterns[kind]||patterns.tick;
  try{
    if(actuator.playEffect) actuator.playEffect('dual-rumble',{duration:p.duration,strongMagnitude:p.strongMagnitude,weakMagnitude:p.weakMagnitude});
    else if(actuator.pulse) actuator.pulse(Math.round(p.strongMagnitude*100),p.duration);
  }catch(_){}
}
function emotion(e,t,opts={}){
  if(state.emotion===e && t-state.lastEmotionTrigger<0.28)return;
  state.emotion=e;state.until=t+(opts.duration||2.2);state.lastEmotionTrigger=t;
  state.intensity=Math.max(state.intensity,opts.intensity||.38);
  // Each trigger adds a fading layer; new gestures do not erase previous ones.
  state.effects.push({emotion:e,born:t,life:opts.duration||2.8,strength:Math.max(state.intensity,opts.intensity||.38)});
  if(state.effects.length>12)state.effects.shift();
  const n=opts.particles||8;
  for(let i=0;i<n;i++)state.particles.push({a:Math.random()*Math.PI*2,r:24+Math.random()*75,v:25+Math.random()*110,life:1,kind:opts.kind||'spark'});
  if(opts.haptic)vibrate(opts.haptic,state.intensity);
  if(state.recording)state.samples.push({t:(performance.now()-state.start)/1000,event:'GESTURE',emotion:e,intensity:state.intensity});
}
function getPads(){try{return navigator.getGamepads?Array.from(navigator.getGamepads()).filter(Boolean):[]}catch{return[]}}
function events(pad,t){
  const b=pad.buttons.map(x=>!!x.pressed);
  b.forEach((v,i)=>{if(v&&!state.buttons[i]){
    if(i===0){emotion('PARTICLES',t,{kind:'spark',particles:18,haptic:'tick'});}
    if(i===1){emotion('DASH',t,{kind:'dash',particles:12,haptic:'bump',duration:1.1});}
    if(i===2){emotion('WATER',t,{kind:'water',particles:20,haptic:'water'});}
    if(i===3){emotion('RIPPLES',t,{kind:'ripple',particles:12,haptic:'swell'});}
    // D-pad: UP bitmap, RIGHT halftone, DOWN motion-trail toggle, LEFT embroidery.
    if(i===12){state.look=0;vibrate('tick');}
    if(i===15){state.look=1;vibrate('tick');}
    if(i===13){state.trail=!state.trail;vibrate('tick');}
    if(i===14){state.look=1;vibrate('tick');}
    // View/back toggles textural detail; Menu/start toggles dimensional treatment.
    if(i===8){state.texture=state.texture>.5?0.15:0.9;vibrate('tick');}
    if(i===9){state.dimension=state.dimension===2?3:2;vibrate('tick');}
    // RT is a pointing gesture: show a directional ray from the centre.
    if(i===7){state.pointingUntil=t+1.2;state.pointX=pad.axes[2]||0;state.pointY=pad.axes[3]||0;vibrate('tick');}
    if(state.recording)state.samples.push({t:(performance.now()-state.start)/1000,event:names[i]||('BUTTON_'+i),emotion:state.emotion,intensity:state.intensity});
  }});state.buttons=b;
}
function poll(){
  const pads=getPads(),realPad=pads.find(p=>p.index===state.padIndex)||pads[0],now=performance.now(),t=now/1000;
  const virtual=()=>({index:-1,id:'KEYBOARD',axes:state.keyAxes,buttons:Array.from({length:16},(_,i)=>({pressed:state.keys.has(({0:' ',1:'b',2:'x',3:'y',12:'1',13:'2',14:'3',15:'4',8:'v',9:'m',7:'t'}[i]||'\0'))}))});
  const pad=realPad||virtual();
  state.padIndex=realPad?realPad.index:-1;
  $('status').textContent=realPad?'GAMEPAD / '+realPad.id.slice(0,30):'KEYBOARD / ACTIVE';
  const lx=dead(pad.axes[0]||0),ly=dead(pad.axes[1]||0),rx=dead(pad.axes[2]||0),ry=dead(pad.axes[3]||0);
  const leftMag=Math.hypot(lx,ly),rightMag=Math.hypot(rx,ry);
  const la=Math.atan2(-ly,lx),ra=Math.atan2(-ry,rx);
  let ld=0,rd=0;
  if(leftMag>.22&&state.leftAngle!==null){ld=la-state.leftAngle;if(ld>Math.PI)ld-=Math.PI*2;if(ld<-Math.PI)ld+=Math.PI*2;state.turns+=ld;}
  if(rightMag>.22&&state.rightAngle!==null){rd=ra-state.rightAngle;if(rd>Math.PI)rd-=Math.PI*2;if(rd<-Math.PI)rd+=Math.PI*2;}
  if(leftMag>.22)state.leftAngle=la;else state.leftAngle=null;
  if(rightMag>.22)state.rightAngle=ra;else state.rightAngle=null;
  const dt=state.lastT?Math.max(.001,t-state.lastT):.016;
  const horizontalMove=Math.abs(lx-state.prev.lx);
  const reversal=Math.abs(lx)>.25&&Math.abs(state.prev.lx)>.25&&Math.sign(lx)!==Math.sign(state.prev.lx);
  state.leftSweep=state.leftSweep.filter(x=>t-x.t<1.15);
  if(reversal)state.leftSweep.push({t,x:lx});
  const sweeps=state.leftSweep.length;
  const cooldown=t-state.lastEmotionTrigger>.65;
  // Priority: combined dance, then discrete right-stick gestures, then left-stick patterns.
  if(leftMag>.35&&rightMag>.35&&ld>.045&&rd<-.045&&cooldown){
    emotion('DANCING',t,{haptic:'dance',particles:5,duration:1.2});
  }else if(Math.abs(rx)>.42&&Math.abs(state.prev.rx)<.3&&cooldown){
    emotion('DISAGREEMENT',t,{haptic:'no',particles:2,duration:1.3});
  }else if(Math.abs(ry)>.42&&Math.abs(state.prev.ry)<.3&&cooldown){
    emotion('APPROVAL',t,{haptic:'bump',particles:3,duration:1.3});
  }else if(sweeps>=5&&horizontalMove/dt>2.4&&cooldown){
    emotion('ANNOYANCE',t,{haptic:'buzz',particles:3,duration:1.4});
  }else if(sweeps>=2&&sweeps<5&&horizontalMove/dt<2.4&&cooldown){
    emotion('TAUNTING',t,{haptic:'swell',particles:2,duration:1.6});
  }else if(ld<-.08&&cooldown){
    emotion('EXCITEMENT',t,{haptic:'swell',particles:6,duration:1.5});
  }
  // Right stick up is a continuous intensity modifier only after an effect is active.
  if(ry<-.12&&state.emotion!=='IDLE')state.intensity=Math.min(1,Math.max(state.intensity,(-ry)));
  else if(state.emotion==='IDLE')state.intensity*=.985;
  events(pad,t);
  state.prev={ry,lx,ly,rx,u:state.turns};state.lastT=t;
  state.effects=state.effects.filter(f=>t-f.born<f.life);
  if(t>state.until&&state.emotion!=='IDLE')state.emotion='IDLE';
  if(state.recording)state.samples.push({t:(now-state.start)/1000,lx,ly,rx,ry,emotion:state.emotion,intensity:state.intensity,look:looks[state.look],texture:state.texture,dimension:state.dimension});
  $('leftData').textContent=lx.toFixed(2)+' / '+ly.toFixed(2);$('rightData').textContent=rx.toFixed(2)+' / '+ry.toFixed(2);
}
function draw(ms){
  if(!ctx)return;
  // Visual reset: intentionally render no emotion graphics. Keep the canvas
  // and all input/gesture state alive so a new visual system can be built cleanly.
  const w=window.innerWidth,h=window.innerHeight;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.globalAlpha=1;
  ctx.globalCompositeOperation='source-over';
  ctx.shadowBlur=0;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#030305';
  ctx.fillRect(0,0,canvas.width,canvas.height);
}
function format(s){const m=Math.floor(s/60),q=Math.floor(s%60),ms=Math.floor((s%1)*1000);return String(m).padStart(2,'0')+':'+String(q).padStart(2,'0')+'.'+String(ms).padStart(3,'0');}
$('record').onclick=()=>{state.recording=!state.recording;if(state.recording){state.samples=[];state.start=performance.now();$('record').classList.add('active');$('record').textContent='■ STOP';}else{$('record').classList.remove('active');$('record').textContent='● RECORD';}};
$('export').onclick=()=>download('newlanguage-session.json',JSON.stringify({version:2,frameRate:60,createdAt:new Date().toISOString(),samples:state.samples},null,2),'application/json');
$('exportCsv').onclick=()=>{const h='t,lx,ly,rx,ry,emotion,intensity,event';const rows=state.samples.map(s=>[s.t,s.lx??'',s.ly??'',s.rx??'',s.ry??'',s.emotion??'',s.intensity??'',s.event??''].join(','));download('newlanguage-session.csv',[h,...rows].join(String.fromCharCode(10)),'text/csv');};
$('look').onclick=()=>{state.look=(state.look+1)%2;$('look').textContent='LOOK: '+looks[state.look];};
window.addEventListener('resize',resize);
window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();state.keys.add(k);const m=()=>{state.keyAxes[0]=(state.keys.has('d')?1:0)-(state.keys.has('a')?1:0);state.keyAxes[1]=(state.keys.has('s')?1:0)-(state.keys.has('w')?1:0);state.keyAxes[2]=(state.keys.has('arrowright')?1:0)-(state.keys.has('arrowleft')?1:0);state.keyAxes[3]=(state.keys.has('arrowdown')?1:0)-(state.keys.has('arrowup')?1:0);};m();if(k==='escape')state.keys.clear();});
window.addEventListener('keyup',e=>{state.keys.delete(e.key.toLowerCase());state.keyAxes[0]=(state.keys.has('d')?1:0)-(state.keys.has('a')?1:0);state.keyAxes[1]=(state.keys.has('s')?1:0)-(state.keys.has('w')?1:0);state.keyAxes[2]=(state.keys.has('arrowright')?1:0)-(state.keys.has('arrowleft')?1:0);state.keyAxes[3]=(state.keys.has('arrowdown')?1:0)-(state.keys.has('arrowup')?1:0);});
window.addEventListener('gamepadconnected',e=>{state.padIndex=e.gamepad.index;$('status').textContent='GAMEPAD / '+e.gamepad.id.slice(0,34);});
window.addEventListener('gamepaddisconnected',e=>{if(state.padIndex===e.gamepad.index)state.padIndex=null;});
window.addEventListener('pointerdown',()=>getPads(),{passive:true});window.addEventListener('keydown',()=>getPads(),{passive:true});
function frame(t){requestAnimationFrame(frame);poll();draw(t);$('emotion').textContent=state.emotion;$('intensity').style.width=(state.intensity*100)+'%';$('intensityText').textContent='INTENSITY '+state.intensity.toFixed(2);$('timer').textContent=state.recording?format((performance.now()-state.start)/1000):'00:00.000';}
$('status').textContent=ctx?'APP / READY':'APP ERROR / 2D CANVAS UNAVAILABLE';
requestAnimationFrame(frame);
