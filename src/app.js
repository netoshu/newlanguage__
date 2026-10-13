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
  lastTrigger:{}, lastHaptic:0, leftAngle:null, rightAngle:null, lastLeftDelta:0, lastRightDelta:0, lastEmotionTrigger:0, effects:[], ripples:[], keys:new Set(), keyAxes:[0,0,0,0], lastA:0, aCount:0
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
function addGraphic(kind,t,opts={}){
  const life=opts.duration||4.8;
  const graphic={id:Math.random(),emotion:kind,born:t,life,strength:opts.intensity??Math.max(.25,state.intensity),seed:Math.random()*10000,scale:.72+Math.random()*.68,rotation:Math.random()*Math.PI*2,driftX:(Math.random()-.5)*.16,driftY:(Math.random()-.5)*.16,detail:5+Math.floor(Math.random()*8),hue:Math.floor(Math.random()*360),x:0,y:0,vx:0,vy:0,trail:[],kind:opts.kind||'emotion'};
  state.effects.push(graphic);
  if(state.effects.length>18)state.effects.shift();
  if(opts.particles)for(let i=0;i<opts.particles;i++)state.particles.push({a:Math.random()*Math.PI*2,r:10+Math.random()*35,v:18+Math.random()*70,life:1,kind:opts.kind||'spark',size:1+Math.random()*3});
  if(opts.haptic)vibrate(opts.haptic,state.intensity);
  if(state.recording)state.samples.push({t:(performance.now()-state.start)/1000,event:'GRAPHIC',emotion:kind,intensity:state.intensity});
  return graphic;
}
function emotion(e,t,opts={}){
  if(state.emotion===e && t-state.lastEmotionTrigger<.28)return;
  state.emotion=e;state.until=t+(opts.duration||2.2);state.lastEmotionTrigger=t;
  state.intensity=Math.max(state.intensity,opts.intensity||.38);
  addGraphic(e,t,{...opts,intensity:state.intensity});
}
function getPads(){try{return navigator.getGamepads?Array.from(navigator.getGamepads()).filter(Boolean):[]}catch{return[]}}
function events(pad,t){
  const b=pad.buttons.map(x=>!!x.pressed);
  b.forEach((v,i)=>{if(v&&!state.buttons[i]){
    if(i===0){
      const now=performance.now();
      state.aCount=now-state.lastA<650?state.aCount+1:1;state.lastA=now;
      if(state.aCount===1){
        const g=addGraphic('A_PARTICLES',t,{kind:'jump',particles:14,duration:3.8,haptic:'tick'});
        g.jumpLevel=1;
      }else if(state.aCount===2){
        const g=addGraphic('A_CLOUD',t,{kind:'cloud',particles:24,duration:4.5,haptic:'tick'});
        g.jumpLevel=2;
      }else{
        const g=addGraphic('A_BIG_JUMP',t,{kind:'cloud',particles:42,duration:5,haptic:'bump'});
        g.jumpLevel=3;g.vx=(Math.random()-.5)*90;g.vy=-65-Math.random()*70;state.aCount=0;
      }
    }
    if(i===1){const g=addGraphic('B_DASH',t,{kind:'dash',particles:18,haptic:'bump',duration:2.7});g.vx=(Math.random()-.5)*210;g.vy=(Math.random()-.5)*150;}
    if(i===2){
      const g=[...state.effects].reverse().find(x=>!x.dashing);
      if(g){g.dashing=true;const a=Math.random()*Math.PI*2;g.vx=Math.cos(a)*(180+Math.random()*160);g.vy=Math.sin(a)*(180+Math.random()*160);g.trail=[];g.dashBorn=t;}
      else addGraphic('X_DASH',t,{kind:'dash',particles:10,duration:2.8});
      vibrate('water',state.intensity);
    }
    if(i===3){state.ripples.push({born:t,life:2.8,seed:Math.random()*10,strength:.8});vibrate('swell',state.intensity);}
    if(i===12){state.look=0;vibrate('tick');}
    if(i===15){state.look=1;vibrate('tick');}
    if(i===13){state.trail=!state.trail;vibrate('tick');}
    if(i===14){state.look=1;vibrate('tick');}
    if(i===8){state.texture=state.texture>.5?0.15:0.9;vibrate('tick');}
    if(i===9){state.dimension=state.dimension===2?3:2;vibrate('tick');}
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
  // Left-stick gestures create their own graphics. Right stick is a modifier
  // while an emotion/action is active, otherwise it creates separate graphics.
  const active=state.emotion!=='IDLE'&&t<state.until;
  if(leftMag>.35&&rightMag>.35&&ld>.045&&rd<-.045&&cooldown){
    emotion('CELEBRATION',t,{haptic:'dance',particles:8,duration:2.4});
  }else if(!active&&Math.abs(rx)>.42&&Math.abs(state.prev.rx)<.3&&cooldown){
    emotion('RIGHT_DISAGREEMENT',t,{haptic:'no',particles:4,duration:2.1});
  }else if(!active&&Math.abs(ry)>.42&&Math.abs(state.prev.ry)<.3&&cooldown){
    emotion('RIGHT_APPROVAL',t,{haptic:'bump',particles:4,duration:2.1});
  }else if(sweeps>=5&&horizontalMove/dt>2.4&&cooldown){
    emotion('ANNOYANCE',t,{haptic:'buzz',particles:5,duration:2.4});
  }else if(sweeps>=2&&sweeps<5&&horizontalMove/dt<2.4&&cooldown){
    emotion('TAUNTING',t,{haptic:'swell',particles:3,duration:2.8});
  }else if(ld<-.08&&cooldown){
    emotion('EXCITEMENT',t,{haptic:'swell',particles:7,duration:2.8});
  }
  if(active&&rightMag>.12){
    const modifier=Math.max(Math.abs(rx),Math.abs(ry));
    if(ry<-.12)state.intensity=Math.min(1,state.intensity+modifier*dt*.8);
    else state.intensity=Math.max(.12,state.intensity-modifier*dt*.18);
    const current=state.effects[state.effects.length-1];if(current)current.strength=state.intensity;
  }else if(state.emotion==='IDLE')state.intensity*=.99;
  events(pad,t);
  state.prev={ry,lx,ly,rx,u:state.turns};state.lastT=t;
  state.effects=state.effects.filter(f=>t-f.born<f.life);
  if(t>state.until&&state.emotion!=='IDLE')state.emotion='IDLE';
  if(state.recording)state.samples.push({t:(now-state.start)/1000,lx,ly,rx,ry,emotion:state.emotion,intensity:state.intensity,look:looks[state.look],texture:state.texture,dimension:state.dimension});
  $('leftData').textContent=lx.toFixed(2)+' / '+ly.toFixed(2);$('rightData').textContent=rx.toFixed(2)+' / '+ry.toFixed(2);
}
function draw(ms){
  if(!ctx)return;
  const dpr=Math.min(window.devicePixelRatio||1,2),w=window.innerWidth,h=window.innerHeight,t=ms/1000,cx=w*.5,cy=h*.5;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalCompositeOperation='source-over';
  if(!state.trail){ctx.fillStyle='rgba(3,3,5,.22)';ctx.fillRect(0,0,w,h);}else{ctx.fillStyle='rgba(3,3,5,.075)';ctx.fillRect(0,0,w,h);}
  const hueColor=(hue,alpha=1)=>'hsla('+hue+',95%,68%,'+alpha+')';
  // Randomised abstract graphic primitives. Each action has its own visual grammar;
  // randomness changes the individual instance, never the category's character.
  for(const g of state.effects){
    const age=t-g.born,fade=Math.max(0,1-age/g.life);if(fade<=0)continue;
    if(g.dashing){g.x+=g.vx/60;g.y+=g.vy/60;g.vx*=.985;g.vy*=.985;g.trail.push({x:g.x,y:g.y});if(g.trail.length>18)g.trail.shift();}
    const gx=cx+g.x+Math.sin(age*1.2+g.seed)*g.driftX*w,gy=cy+g.y+Math.cos(age*.9+g.seed)*g.driftY*h;
    const scale=Math.min(w,h)*.18*g.scale*(.6+g.strength*.6),pulse=1+Math.sin(age*3+g.seed)*.045;
    const hue=g.hue,second=(hue+70+g.detail*5)%360;
    ctx.save();ctx.translate(gx,gy);ctx.rotate(g.rotation+age*(g.emotion==='EXCITEMENT'||g.emotion==='CELEBRATION'?.16:g.emotion==='TAUNTING'?.035:0));ctx.globalAlpha=fade;ctx.lineWidth=1+g.strength*1.8;ctx.strokeStyle=hueColor(hue,.9);ctx.fillStyle=hueColor(hue,.18);ctx.shadowBlur=fade*14;ctx.shadowColor=hueColor(hue,.7);
    if(g.dashing&&g.trail.length>1){ctx.beginPath();g.trail.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x-gx,p.y-gy);else ctx.lineTo(p.x-gx,p.y-gy);});ctx.stroke();}
    if(g.emotion==='EXCITEMENT'||g.emotion==='CELEBRATION'){
      for(let j=0;j<4;j++){ctx.beginPath();ctx.ellipse(0,0,scale*(.45+j*.16)*pulse,scale*(.3+j*.12),age*.25+j*.4,0,Math.PI*2);ctx.strokeStyle=hueColor((hue+j*19)%360,.8);ctx.stroke();}
      for(let j=0;j<g.detail*2;j++){const a=j/g.detail/2*Math.PI*2+age*(.6+j%3*.15),r=scale*(.6+(j%5)*.1);ctx.fillStyle=hueColor((hue+j*23)%360,fade);ctx.fillRect(Math.cos(a)*r,Math.sin(a)*r,2+(j%3),2+(j%3));}
    }else if(g.emotion==='TAUNTING'){
      for(let j=0;j<5;j++){ctx.beginPath();ctx.ellipse(Math.sin(age*1.1+j)*scale*.1,0,scale*(.38+j*.13),scale*(.12+j*.035),Math.sin(age+j)*.15,0,Math.PI*2);ctx.stroke();}
    }else if(g.emotion==='ANNOYANCE'){
      ctx.beginPath();for(let j=0;j<=g.detail*8;j++){const a=j/(g.detail*8)*Math.PI*2,r=scale*(.72+(j%2)*.22)+Math.sin(j*2+age*18)*scale*.025;if(j===0)ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);else ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.stroke();
      for(let j=0;j<g.detail;j++){const a=j/g.detail*Math.PI*2;ctx.beginPath();ctx.moveTo(Math.cos(a)*scale*.8,Math.sin(a)*scale*.8);ctx.lineTo(Math.cos(a)*scale*(1.12+Math.random()*.15),Math.sin(a)*scale*(1.12+Math.random()*.15));ctx.stroke();}
    }else if(g.emotion==='RIGHT_DISAGREEMENT'){
      for(let j=0;j<2;j++){ctx.beginPath();ctx.moveTo(-scale*.3,j?scale*.2:-scale*.2);ctx.lineTo(0,j?-scale*.15:scale*.15);ctx.lineTo(scale*.3,j?scale*.2:-scale*.2);ctx.stroke();}
      for(let j=0;j<g.detail;j++){ctx.beginPath();ctx.arc((Math.random()-.5)*scale,(Math.random()-.5)*scale,2+Math.random()*4,0,Math.PI*2);ctx.stroke();}
    }else if(g.emotion==='RIGHT_APPROVAL'){
      for(let j=0;j<3;j++){ctx.beginPath();ctx.arc(0,Math.sin(age*2+j)*scale*.08,scale*(.35+j*.2),Math.PI*1.1,Math.PI*1.9);ctx.stroke();}
    }else if(g.emotion==='A_PARTICLES'||g.emotion==='A_CLOUD'||g.emotion==='A_BIG_JUMP'){
      const level=g.jumpLevel||1,count=level===1?12:level===2?25:42;
      for(let j=0;j<count;j++){const a=(-Math.PI/2)+(j/(count-1)-.5)*Math.PI*1.55,spread=scale*(.22+(j%7)*.07),rise=age*scale*.22;const x=Math.cos(a)*spread+(Math.random()-.5)*scale*.025,y=Math.sin(a)*spread-rise;
        ctx.fillStyle=hueColor((hue+j*13)%360,fade*(.55+Math.random()*.4));
        if(level===1){ctx.beginPath();ctx.arc(x,y,1.5+j%3,0,Math.PI*2);ctx.fill();}
        else if(level===2){ctx.beginPath();ctx.arc(x,y,scale*.035+(j%3)*2,0,Math.PI*2);ctx.fill();}
        else{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(Math.random()-.5)*scale*.14,y-scale*.05);ctx.lineTo(x+scale*.03,y+scale*.03);ctx.closePath();ctx.fill();}
      }
      if(level===3){ctx.globalAlpha=fade*.5;ctx.beginPath();ctx.moveTo(-scale*.5,scale*.3);ctx.lineTo(scale*.8,-scale*.4);ctx.stroke();}
    }else if(g.emotion==='B_DASH'||g.emotion==='X_DASH'){
      for(let j=0;j<18;j++){const y=(j-9)*scale*.035;ctx.globalAlpha=fade*(.25+(j%4)*.14);ctx.beginPath();ctx.moveTo(-scale*.7,y);ctx.lineTo(scale*(.25+(j%5)*.12),y+Math.sin(age*4+j)*scale*.025);ctx.stroke();}
      ctx.globalAlpha=fade;ctx.beginPath();ctx.arc(0,0,scale*.12,0,Math.PI*2);ctx.stroke();
    }else{
      // Water and other named actions: soft droplet clusters, not a character/subject.
      for(let j=0;j<g.detail*2;j++){const a=j*2.399+age*.5,r=scale*(.2+(j%5)*.12);ctx.beginPath();ctx.ellipse(Math.cos(a)*r,Math.sin(a)*r,2,4,a,0,Math.PI*2);ctx.fill();}
    }
    ctx.restore();
  }
  state.effects=state.effects.filter(g=>t-g.born<g.life);
  state.particles=state.particles.filter(p=>p.life>0);
  for(const p of state.particles){const r=p.r+(1-p.life)*p.v;ctx.globalAlpha=p.life;ctx.fillStyle=p.kind==='water'?'#8ceaff':p.kind==='ripple'?'#b6a0ff':hueColor((p.a*57)%360,p.life);ctx.beginPath();ctx.arc(cx+Math.cos(p.a)*r,cy+Math.sin(p.a)*r,Math.max(1,p.size||2),0,Math.PI*2);ctx.fill();p.life-=.012;}
  state.ripples=state.ripples.filter(r=>t-r.born<r.life);
  for(const ripple of state.ripples){const age=t-ripple.born,fade=1-age/ripple.life;ctx.save();ctx.globalAlpha=Math.max(0,fade)*.7;ctx.strokeStyle='#9deeff';ctx.lineWidth=1.4;for(let j=0;j<5;j++){ctx.beginPath();ctx.arc(cx,cy,((age/ripple.life)+j*.13)*Math.min(w,h)*.34,0,Math.PI*2);ctx.stroke();}ctx.restore();}
  if(state.dimension===3){ctx.save();ctx.globalAlpha=.16;ctx.strokeStyle='#a7b8ff';for(let j=0;j<16;j++){ctx.beginPath();ctx.moveTo(0,cy+j*18);ctx.lineTo(w,cy+j*18);ctx.stroke();ctx.beginPath();ctx.moveTo(cx+j*40,0);ctx.lineTo(cx+j*40,h);ctx.stroke();}ctx.restore();}
  ctx.globalAlpha=1;ctx.shadowBlur=0;
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
