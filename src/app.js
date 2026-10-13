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
    if(i===14){state.look=3;vibrate('tick');}
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
  const w=window.innerWidth,h=window.innerHeight,d=Math.min(w,h),cx=w*.5,cy=h*.48,t=ms/1000;
  if(!state.trail){ctx.clearRect(0,0,w,h);ctx.fillStyle='#030305';ctx.fillRect(0,0,w,h);}else{ctx.fillStyle='rgba(3,3,5,.13)';ctx.fillRect(0,0,w,h);}
  const e=state.emotion, energy=state.intensity, phase=t*1.1, radius=d*(.16+.08*energy);
  const palettes={
    IDLE:['#68e4ff','#9c6bff'],
    EXCITEMENT:['#ffb4ef','#ff70cf','#7b8cff'],
    TAUNTING:['#f2a0ff','#7e74ff','#5adbe8'],
    ANNOYANCE:['#ff3f68','#6d2cff','#39f0dc'],
    DISAGREEMENT:['#ff6b78','#ffb15c'],
    APPROVAL:['#71f6d2','#78b8ff'],
    DANCING:['#ff70cf','#75f5ff','#e5ff80'],
    PARTICLES:['#f7f4ff','#8ceaff'],
    WATER:['#61dfff','#d8fbff'],
    RIPPLES:['#b6a0ff','#76e9ff'],
    DASH:['#ffffff','#ff6edc']
  };
  const palette=palettes[e]||palettes.IDLE;
  const grad=ctx.createRadialGradient(cx,cy,2,cx,cy,d*(.22+.22*energy));
  grad.addColorStop(0,palette[0]+'22');grad.addColorStop(.55,palette[1]+'10');grad.addColorStop(1,'rgba(3,3,5,0)');
  ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
  ctx.save();ctx.translate(cx,cy);ctx.globalCompositeOperation='lighter';
  if(e==='DISAGREEMENT'){
    // Two opposing strokes, with a small pause between them.
    for(let side=-1;side<=1;side+=2){ctx.beginPath();ctx.moveTo(side*d*.035,-d*.10);ctx.lineTo(-side*d*.035,-d*.03);ctx.lineTo(side*d*.035,d*.04);ctx.strokeStyle=palette[0];ctx.lineWidth=3;ctx.globalAlpha=.75;ctx.stroke();}
  }else if(e==='APPROVAL'){
    // Two clear nod arcs.
    for(let i=0;i<2;i++){const rr=d*(.13+i*.065)+Math.sin(t*5+i*Math.PI)*d*.012;ctx.beginPath();ctx.arc(0,0,rr,Math.PI*1.12,Math.PI*1.88);ctx.strokeStyle=palette[i%palette.length];ctx.lineWidth=2.5;ctx.globalAlpha=.8;ctx.stroke();}
  }else if(e==='DASH'){
    // A sharp forward burst of speed lines.
    for(let i=0;i<34;i++){const y=(i-17)*d*.012;ctx.beginPath();ctx.moveTo(-d*.04,y);ctx.lineTo(d*(.08+(i%7)*.018),y*(.4+(i%4)*.1));ctx.strokeStyle=palette[i%palette.length];ctx.globalAlpha=.15+(i%5)*.12;ctx.lineWidth=1+(i%3);ctx.stroke();}
  }else if(e==='WATER'){
    // Droplets fall outward from the core.
    for(let i=0;i<22;i++){const a=i*2.39996+t*(.2+(i%3)*.1),r=d*(.07+((t*.18+i*.137)%1)*.24);ctx.beginPath();ctx.ellipse(Math.cos(a)*r,Math.sin(a)*r,2.3,4.8,a,0,Math.PI*2);ctx.fillStyle=palette[i%palette.length];ctx.globalAlpha=.75;ctx.fill();}
  }else if(e==='RIPPLES'){
    // Expanding, fading wave circles.
    for(let i=0;i<6;i++){const rr=(.04+((t*.22+i/6)%1)*.28)*d;ctx.beginPath();ctx.arc(0,0,rr,0,Math.PI*2);ctx.strokeStyle=palette[i%palette.length];ctx.lineWidth=1.5;ctx.globalAlpha=1-((t*.22+i/6)%1);ctx.stroke();}
  }else{
    const rings=e==='ANNOYANCE'?10:e==='TAUNTING'?4:e==='EXCITEMENT'?9:e==='DANCING'?8:6;
    for(let ring=0;ring<rings;ring++){
      const jitter=e==='ANNOYANCE'?(Math.random()-.5)*d*.018:0;
      const pulse=e==='EXCITEMENT'?Math.sin(t*4+ring*.5)*d*.014:e==='TAUNTING'?Math.sin(t*1.1+ring)*d*.004:Math.sin(phase+ring*.8)*d*.008;
      const rr=radius+ring*d*(e==='TAUNTING'?.035:.024)+pulse+jitter;
      ctx.beginPath();
      const steps=220;
      for(let i=0;i<=steps;i++){
        const a=i/steps*Math.PI*2;
        const wave=Math.sin(a*(state.look===1?22:7)+phase+Math.sin(rr*.03-phase)*2)*d*(.004+energy*.014);
        const r=rr+wave;
        const x=Math.cos(a)*r,y=Math.sin(a)*r;
        if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.closePath();ctx.strokeStyle=palette[ring%palette.length];ctx.globalAlpha=e==='ANNOYANCE'?.7:.34/(ring*.18+1);ctx.lineWidth=e==='ANNOYANCE'?1.6:1;ctx.shadowBlur=e==='EXCITEMENT'?28:12;ctx.shadowColor=palette[ring%palette.length];ctx.stroke();
    }
    ctx.shadowBlur=0;
    const count=state.look===0?125:95;
    for(let i=0;i<count;i++){
      const a=i*2.39996+phase*(e==='DANCING'?2.4:e==='TAUNTING'?.45:1)*(i%2?1:-.7);
      const r=(.12+(i%37)/37*.36)*d;
      const jitter=Math.sin(i*13.7+phase*1.8)*d*(.002+energy*.01);
      const x=Math.cos(a)*(r+jitter),y=Math.sin(a)*(r+jitter);
      const size=(state.look===1?2.2:1.1)*(0.5+state.texture);
      ctx.globalAlpha=.15+.45*(.5+.5*Math.sin(phase*1.7+i));
      ctx.fillStyle=palette[i%palette.length];
      if(state.look===1||(e==='ANNOYANCE'||e==='TAUNTING')&&state.texture>.5){ctx.beginPath();ctx.moveTo(x,y-size*2);ctx.lineTo(x+size*1.5,y+size);ctx.lineTo(x-size*1.5,y+size);ctx.closePath();ctx.fill();}
      else if(state.look===2){ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x-4,y-3);ctx.lineTo(x+4,y+3);ctx.stroke();}
      else ctx.fillRect(x-size/2,y-size/2,size,size);
    }
  }
  // Render recent gestures as translucent overlapping layers with a slow fade.
  for(const layer of state.effects){
    const age=t-layer.born, fade=Math.max(0,1-age/layer.life), rr=d*(.08+age*.12), col=(palettes[layer.emotion]||palettes.IDLE)[0];
    ctx.save();ctx.globalAlpha=fade*.32;ctx.strokeStyle=col;ctx.lineWidth=1.2+fade;
    if(layer.emotion==='WATER'){for(let j=0;j<5;j++){ctx.beginPath();ctx.ellipse(cx+Math.sin(j*2+age*1.5)*rr*.4,cy+Math.cos(j+age)*rr*.25,rr*.09,rr*.16,age+j,0,Math.PI*2);ctx.stroke();}}
    else if(layer.emotion==='RIPPLES'||layer.emotion==='APPROVAL'){for(let j=0;j<3;j++){ctx.beginPath();ctx.arc(cx,cy,rr*(.35+j*.28),0,Math.PI*2);ctx.stroke();}}
    else if(layer.emotion==='DASH'){for(let j=0;j<8;j++){ctx.beginPath();ctx.moveTo(cx-rr*.3,cy+(j-4)*rr*.08);ctx.lineTo(cx+rr*(.5+j*.04),cy+(j-4)*rr*.1);ctx.stroke();}}
    else {ctx.beginPath();ctx.ellipse(cx,cy,rr,rr*(layer.emotion==='TAUNTING'?.72:1),age*.25,0,Math.PI*2);ctx.stroke();}
    ctx.restore();
  }
  if(state.pointingUntil&&t<state.pointingUntil){ctx.globalAlpha=.8;ctx.strokeStyle='#b4f5ff';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo((state.pointX||0)*d*.45,-(state.pointY||0)*d*.45);ctx.stroke();}
  state.particles=state.particles.filter(p=>p.life>0);
  for(const p of state.particles){
    const r=p.r+(1-p.life)*p.v;ctx.globalAlpha=p.life;
    ctx.fillStyle=p.kind==='water'?'#8ceaff':p.kind==='ripple'?'#b6a0ff':p.kind==='dash'?'#ffffff':'#a9eaff';
    if(p.kind==='water'){ctx.beginPath();ctx.ellipse(Math.cos(p.a)*r,Math.sin(p.a)*r,2,5,p.a,0,Math.PI*2);ctx.fill();}
    else if(p.kind==='ripple'){ctx.beginPath();ctx.arc(Math.cos(p.a)*r,Math.sin(p.a)*r,3+(1-p.life)*8,0,Math.PI*2);ctx.stroke();}
    else {ctx.beginPath();ctx.arc(Math.cos(p.a)*r,Math.sin(p.a)*r,2+p.life*2,0,Math.PI*2);ctx.fill();}
    p.life-=.012;
  }
  ctx.restore();ctx.globalAlpha=1;
  if(state.dimension===3){ctx.save();ctx.globalAlpha=.18;ctx.strokeStyle='#a8b8ff';for(let i=0;i<9;i++){ctx.beginPath();ctx.ellipse(cx,cy,d*(.12+i*.025),d*(.045+i*.012),t*.12+i*.08,0,Math.PI*2);ctx.stroke();}ctx.restore();}
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
