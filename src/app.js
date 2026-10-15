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
  const dpr=Math.min(window.devicePixelRatio||1,2),w=window.innerWidth,h=window.innerHeight,t=ms/1000,cx=w*.5,cy=h*.5,d=Math.min(w,h);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.globalCompositeOperation='source-over';
  ctx.fillStyle=state.trail?'rgba(3,3,7,.065)':'rgba(3,3,7,.19)';
  ctx.fillRect(0,0,w,h);
  const pal=[184,198,218,326,344,28,48,76,142,164,260,284,304,38];
  const color=(h,a=1,l=67)=>'hsla('+h+',92%,'+l+'%,'+a+')';
  // Hand-drawn pigment: multiple imperfect strokes, translucent colour blooms,
  // and pencil-like hatch marks make each abstract mark feel crafted, not clinical.
  function bloom(x,y,r,hue,alpha){
    const gr=ctx.createRadialGradient(x-r*.2,y-r*.28,1,x,y,r);
    gr.addColorStop(0,color((hue+24)%360,alpha,.78));
    gr.addColorStop(.48,color(hue,alpha*.64,62));
    gr.addColorStop(1,color((hue+42)%360,0,55));
    ctx.fillStyle=gr;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
  function ribbon(x,y,s,hue,seed,age,alpha){
    ctx.save();ctx.globalAlpha=alpha;ctx.lineCap='round';ctx.lineJoin='round';
    const reveal=Math.min(1,Math.max(.035,age/.72));
    for(let pass=0;pass<5;pass++){
      ctx.beginPath();
      const steps=Math.max(2,Math.floor(80*reveal));
      for(let k=0;k<=steps;k++){
        const u=k/80,xx=x+(u-.5)*s*2;
        const yy=y+Math.sin(u* Math.PI*(1.2+(seed%4)*.3)+seed+age*.5)*s*.22+
          Math.sin(u*9+seed)*s*.045+(pass-2)*s*.018;
        if(k===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);
      }
      ctx.strokeStyle=color((hue+pass*9)%360,.24+pass*.12,62+pass*2);
      ctx.lineWidth=s*(.012+pass*.004);ctx.stroke();
    }
    ctx.restore();
  }
  function rosette(x,y,s,hue,seed,age,alpha,spiky=false){
    ctx.save();ctx.translate(x,y);ctx.rotate(seed+age*.16);ctx.globalAlpha=alpha;
    // Painted petals with fine colored-pencil edges.
    const petals=5+Math.floor(seed*2)%7;
    for(let j=0;j<petals;j++){
      const a=j/petals*Math.PI*2,rr=s*(.22+.05*Math.sin(j*3+seed));
      ctx.save();ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.bezierCurveTo(s*.08,-rr*.35,s*.18,-rr*.85,s*(spiky?.12:.28),-rr);
      ctx.bezierCurveTo(s*(spiky?.02:.42),-rr*.7,s*.2,-rr*.2,0,0);
      const gr=ctx.createLinearGradient(0,0,s*.25,-rr);
      gr.addColorStop(0,color((hue+j*23)%360,.82,63));
      gr.addColorStop(.55,color((hue+j*23+28)%360,.72,69));
      gr.addColorStop(1,color((hue+j*23+55)%360,.3,76));
      ctx.fillStyle=gr;ctx.fill();
      ctx.strokeStyle=color((hue+j*23+14)%360,.9,70);ctx.lineWidth=Math.max(1,s*.008);ctx.stroke();
      // loose sketch strokes inside each petal
      for(let q=0;q<3;q++){ctx.beginPath();ctx.moveTo(s*.035,-rr*(.2+q*.13));ctx.quadraticCurveTo(s*.12,-rr*.45,s*(.13+q*.025),-rr*(.68+q*.06));ctx.strokeStyle=color((hue+j*23+q*13)%360,.5,75);ctx.lineWidth=Math.max(.7,s*.004);ctx.stroke();}
      ctx.restore();
    }
    bloom(0,0,s*.12,hue+28,.85);
    ctx.restore();
  }
  function scribble(x,y,s,hue,seed,age,alpha){
    ctx.save();ctx.translate(x,y);ctx.rotate(seed);ctx.globalAlpha=alpha;ctx.lineCap='round';
    for(let pass=0;pass<3;pass++){
      ctx.beginPath();
      for(let k=0;k<=100;k++){
        const u=k/100,a=u*Math.PI*(3.5+(seed%2)*2)+age*.5;
        const rr=s*(.08+u*.48)+Math.sin(u*43+seed+pass)*s*.025;
        const xx=Math.cos(a)*rr,yy=Math.sin(a)*rr*.68;
        if(k===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);
      }
      ctx.strokeStyle=color((hue+pass*17)%360,.75-pass*.16,67+pass*3);ctx.lineWidth=Math.max(.8,s*(.009+pass*.002));ctx.stroke();
    }
    ctx.restore();
  }
  for(const g of state.effects){
    const age=t-g.born,fade=Math.max(0,1-age/g.life);if(fade<=0)continue;
    if(g.dashing){g.x+=g.vx/60;g.y+=g.vy/60;g.vx*=.985;g.vy*=.985;g.trail.push({x:g.x,y:g.y});if(g.trail.length>22)g.trail.shift();}
    const gx=cx+g.x+Math.sin(age*.65+g.seed)*g.driftX*w,gy=cy+g.y+Math.cos(age*.55+g.seed)*g.driftY*h;
    const s=d*.15*g.scale*(.62+g.strength*.62),hue=pal[Math.abs(Math.floor(g.hue/360*pal.length))%pal.length]||g.hue;
    const hue2=(hue+65+g.detail*7)%360,seed=g.seed*.01;
    ctx.save();ctx.translate(gx,gy);ctx.rotate(g.rotation+age*(g.emotion==='EXCITEMENT'||g.emotion==='CELEBRATION'?.12:g.emotion==='TAUNTING'?.025:0));
    ctx.globalAlpha=fade;
    if(g.dashing&&g.trail.length>1){
      ctx.save();ctx.globalAlpha=fade*.5;ctx.lineCap='round';
      for(let q=0;q<4;q++){ctx.beginPath();g.trail.forEach((p,i)=>i?ctx.lineTo(p.x-gx,p.y-gy):ctx.moveTo(p.x-gx,p.y-gy));ctx.strokeStyle=color((hue+q*17)%360,.65);ctx.lineWidth=1+q*1.5;ctx.stroke();}
      ctx.restore();
    }
    if(g.emotion==='EXCITEMENT'||g.emotion==='CELEBRATION'){
      rosette(0,0,s,hue,seed,age,fade*.94,false);
      ribbon(-s*.12,s*.1,s*1.55,hue2,seed+1,age,fade*.75);
      for(let j=0;j<7;j++){const a=j*2.399+seed+age*.32,r=s*(.65+(j%3)*.16);bloom(Math.cos(a)*r,Math.sin(a)*r,s*(.07+(j%3)*.025),hue+j*23,fade*.85);}
      scribble(s*.65,-s*.4,s*.55,hue2,seed+2,age,fade*.65);
    }else if(g.emotion==='TAUNTING'){
      for(let j=0;j<4;j++){ctx.beginPath();ctx.ellipse(Math.sin(age*.6+j+seed)*s*.12,Math.cos(age*.5+j)*s*.08,s*(.38+j*.16),s*(.12+j*.025),Math.sin(seed+j)*.18,0,Math.PI*2);ctx.strokeStyle=color((hue+j*24)%360,.78,67+j*2);ctx.lineWidth=1.4+j*.55;ctx.stroke();}
      ribbon(0,s*.12,s*1.1,hue2,seed+3,age,fade*.7);
      for(let j=0;j<5;j++)bloom(Math.sin(j*2.4+age*.25)*s*.52,Math.cos(j*3+seed)*s*.2,s*.07,hue+j*29,fade*.6);
    }else if(g.emotion==='ANNOYANCE'){
      ctx.beginPath();for(let j=0;j<=g.detail*9;j++){const a=j/(g.detail*9)*Math.PI*2,r=s*(.66+(j%2)*.28)+Math.sin(j*2+age*9)*s*.035;if(j===0)ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);else ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.strokeStyle=color(hue,.9,67);ctx.lineWidth=2;ctx.stroke();
      for(let j=0;j<g.detail;j++){const a=j/g.detail*Math.PI*2,r=s*(.78+(j%3)*.08);ctx.beginPath();ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);ctx.lineTo(Math.cos(a)*(r+s*(.12+((j*7)%4)*.035)),Math.sin(a)*(r+s*(.12+((j*7)%4)*.035)));ctx.strokeStyle=color((hue+j*27)%360,.82,66);ctx.lineWidth=1.5;ctx.stroke();}
      scribble(0,0,s*.8,hue2,seed+5,age,fade*.7);
    }else if(g.emotion==='RIGHT_DISAGREEMENT'){
      for(let j=0;j<2;j++){ctx.beginPath();ctx.moveTo(-s*.34,j?s*.22:-s*.22);ctx.lineTo(0,j?-s*.16:s*.16);ctx.lineTo(s*.34,j?s*.22:-s*.22);ctx.strokeStyle=color((hue+j*45)%360,.92,67);ctx.lineWidth=3;ctx.stroke();}
      // Stable seed-based fragments: keep the composition still between frames.
      for(let j=0;j<7;j++){
        const px=Math.sin(seed*17+j*12.9898)*s*.5;
        const py=Math.cos(seed*23+j*7.233)*s*.325;
        bloom(px,py,s*(.028+(j%3)*.009),hue+j*31,fade*.8);
      }
      ribbon(0,s*.32,s*.8,hue2,seed+6,age,fade*.6);
    }else if(g.emotion==='RIGHT_APPROVAL'){
      for(let j=0;j<3;j++){ctx.beginPath();ctx.arc(0,Math.sin(age*1.8+j)*s*.07,s*(.3+j*.19),Math.PI*1.08,Math.PI*1.92);ctx.strokeStyle=color((hue+j*28)%360,.78,69);ctx.lineWidth=2;ctx.stroke();}
      rosette(0,0,s*.56,hue,seed+1,age,fade*.8,false);
    }else if(g.emotion==='A_PARTICLES'||g.emotion==='A_CLOUD'||g.emotion==='A_BIG_JUMP'){
      const level=g.jumpLevel||1,count=level===1?14:level===2?28:44;
      for(let j=0;j<count;j++){const a=-Math.PI/2+(j/(count-1)-.5)*Math.PI*1.55,spread=s*(.22+(j%7)*.075),rise=age*s*(.35+(j%5)*.035),x=Math.cos(a)*spread+Math.sin(age*2+j)*s*.035,y=Math.sin(a)*spread-rise,sz=level===1?s*(.012+(j%3)*.005):level===2?s*(.025+(j%3)*.012):s*(.035+(j%4)*.014);bloom(x,y,sz,hue+j*11,fade*.9);if(level===3){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.sin(j+seed)*sz*2,y-sz*2);ctx.strokeStyle=color(hue+j*14,.75);ctx.lineWidth=1.4;ctx.stroke();}}
      if(level>=2)for(let j=0;j<(level===2?3:7);j++)bloom(Math.sin(j*2.3+seed)*s*.38,Math.cos(j*1.7+seed)*s*.14-age*s*.16,s*(level===2?.09:.12),hue+j*27,fade*.38);
      if(level===3){ribbon(0,0,s*.9,hue2,seed+2,age,fade*.75);scribble(0,0,s*.75,hue,seed+4,age,fade*.55);}
    }else if(g.emotion==='B_DASH'||g.emotion==='X_DASH'){
      ribbon(0,0,s*1.5,hue,seed+1,age,fade*.8);ribbon(0,s*.09,s*1.2,hue2,seed+2,age,fade*.6);
      for(let j=0;j<11;j++){const a=j*2.399+seed,r=s*(.1+(j%4)*.15);bloom(Math.cos(a)*r,Math.sin(a)*r,s*.035,hue+j*21,fade*.85);}
      scribble(0,0,s*.85,hue2,seed+3,age,fade*.5);
    }else if(g.emotion==='WATER'||g.emotion==='X_WATER'){
      for(let j=0;j<g.detail;j++){const a=j*2.399+age*.35,r=s*(.2+(j%5)*.12);bloom(Math.cos(a)*r,Math.sin(a)*r,s*(.045+(j%3)*.018),hue+j*19,fade*.85);ctx.beginPath();ctx.ellipse(Math.cos(a)*r,Math.sin(a)*r,s*.018,s*.035,a,0,Math.PI*2);ctx.strokeStyle=color(hue2,.75);ctx.stroke();}
    }else{
      rosette(0,0,s*.7,hue,seed,age,fade*.8,false);ribbon(0,0,s,hue2,seed+3,age,fade*.65);scribble(0,0,s*.65,hue,seed+2,age,fade*.5);
    }
    // Irregular hand-drawn orbit marks and tiny doodle sparks.
    for(let j=0;j<Math.min(8,g.detail);j++){const a=j/Math.min(8,g.detail)*Math.PI*2+seed,r=s*(.88+(j%3)*.11);ctx.beginPath();ctx.arc(Math.cos(a)*r,Math.sin(a)*r,s*(.018+(j%2)*.01),0,Math.PI*2);ctx.strokeStyle=color((hue+j*34)%360,.7,72);ctx.lineWidth=1.1;ctx.stroke();}
    ctx.restore();
  }
  state.effects=state.effects.filter(g=>t-g.born<g.life);
  state.particles=state.particles.filter(p=>p.life>0);
  for(const p of state.particles){const r=p.r+(1-p.life)*p.v;ctx.globalAlpha=p.life;ctx.fillStyle=p.kind==='water'?color(190,p.life):color((p.a*57)%360,p.life);ctx.beginPath();ctx.arc(cx+Math.cos(p.a)*r,cy+Math.sin(p.a)*r,Math.max(1,p.size||2),0,Math.PI*2);ctx.fill();p.life-=.012;}
  state.ripples=state.ripples.filter(r=>t-r.born<r.life);
  for(const ripple of state.ripples){const age=t-ripple.born,fade=1-age/ripple.life;ctx.save();ctx.globalAlpha=Math.max(0,fade)*.7;ctx.strokeStyle=color(190,.8);ctx.lineWidth=1.4;for(let j=0;j<5;j++){ctx.beginPath();ctx.arc(cx,cy,((age/ripple.life)+j*.13)*d*.34,0,Math.PI*2);ctx.stroke();}ctx.restore();}
  if(state.dimension===3){ctx.save();ctx.globalAlpha=.12;ctx.strokeStyle=color(230,.45);for(let j=0;j<16;j++){ctx.beginPath();ctx.moveTo(0,cy+j*18);ctx.lineTo(w,cy+j*18);ctx.stroke();ctx.beginPath();ctx.moveTo(cx+j*40,0);ctx.lineTo(cx+j*40,h);ctx.stroke();}ctx.restore();}
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
