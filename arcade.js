/* ---------- helpers ---------- */
const $=(s,r=document)=>r.querySelector(s);
const rand=n=>Math.floor(Math.random()*n);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const cssv=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const pal=()=>({board:cssv('--board'),ink:cssv('--ink'),muted:cssv('--muted'),line:cssv('--line'),edge:cssv('--edge'),c1:cssv('--c1'),c2:cssv('--c2'),c3:cssv('--c3'),c4:cssv('--c4'),c5:cssv('--c5'),c6:cssv('--c6')});
const KEYDIR={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right',W:'up',S:'down',A:'left',D:'right'};
const DISPLAY='"Bungee", Impact, "Arial Black", sans-serif';
const REDUCED=matchMedia('(prefers-reduced-motion: reduce)').matches;

const store={
  get(k){try{const v=localStorage.getItem('pa:'+k);return v==null?null:JSON.parse(v)}catch(e){return null}},
  set(k,v){try{localStorage.setItem('pa:'+k,JSON.stringify(v))}catch(e){}}
};
function best(id,score,lower){
  const b=store.get('best:'+id);
  if(b==null||(lower?score<b:score>b)){store.set('best:'+id,score);return true}
  return false;
}
function el(tag,cls,parent,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;if(parent)parent.append(e);return e}
function restartAnim(e,cls){e.classList.remove(cls);void e.offsetWidth;e.classList.add(cls)}
function status(root,text){
  const p=el('p','status',root);p.setAttribute('aria-live','polite');p.textContent=text||'';
  return t=>{if(p.textContent===t)return;p.textContent=t;restartAnim(p,'bump')};
}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=rand(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
function rr(x,X,Y,w,h,r){x.beginPath();if(x.roundRect)x.roundRect(X,Y,w,h,r);else x.rect(X,Y,w,h)}

function makeScope(){
  const fns=[];
  return{
    on(t,e,f,o){t.addEventListener(e,f,o);fns.push(()=>t.removeEventListener(e,f,o))},
    every(ms,f){const id=setInterval(f,ms);fns.push(()=>clearInterval(id));return id},
    after(ms,f){const id=setTimeout(f,ms);fns.push(()=>clearTimeout(id));return id},
    loop(f){let id,last=performance.now();const s=t=>{const dt=Math.min(.05,(t-last)/1000);last=t;f(dt);id=requestAnimationFrame(s)};id=requestAnimationFrame(s);fns.push(()=>cancelAnimationFrame(id))},
    dispose(){fns.splice(0).forEach(f=>f())}
  };
}
function canvas(root,w,h){
  const c=el('canvas','cv',root);const r=Math.min((window.devicePixelRatio||1)*1.6,3.2);
  c.width=Math.round(w*r);c.height=Math.round(h*r);c.dataset.ar=w/h;c.dataset.max=w*1.9;
  const x=c.getContext('2d');x.scale(r,r);
  c.pos=e=>{const b=c.getBoundingClientRect();return{x:(e.clientX-b.left)*w/b.width,y:(e.clientY-b.top)*h/b.height}};
  return{c,x};
}
function held(S){
  const k={};
  S.on(window,'keydown',e=>{k[e.key]=true;if(e.key.startsWith('Arrow')||e.key===' ')e.preventDefault()});
  S.on(window,'keyup',e=>{k[e.key]=false});
  return k;
}
function onSwipe(S,target,cb){
  let sx=null,sy=null;
  S.on(target,'pointerdown',e=>{sx=e.clientX;sy=e.clientY});
  S.on(target,'pointerup',e=>{
    if(sx==null)return;const dx=e.clientX-sx,dy=e.clientY-sy;sx=null;
    if(Math.max(Math.abs(dx),Math.abs(dy))<24)return;
    cb(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));
  });
}
let actx;
function beep(f,ms,type){
  try{
    actx=actx||new(window.AudioContext||window.webkitAudioContext)();
    if(actx.state==='suspended')actx.resume();
    const o=actx.createOscillator(),g=actx.createGain(),t=actx.currentTime;
    o.type=type||'triangle';o.frequency.value=f;g.gain.setValueAtTime(.2,t);g.gain.exponentialRampToValueAtTime(.001,t+ms/1000);
    o.connect(g).connect(actx.destination);o.start(t);o.stop(t+ms/1000);
  }catch(e){}
}
/* particles inside a game canvas */
function sparks(){
  let P=[];
  return{
    add(x0,y0,c,n=12,sp=170){if(REDUCED)return;for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,v=sp*(.3+Math.random());P.push({x:x0,y:y0,vx:Math.cos(a)*v,vy:Math.sin(a)*v,t:.45+Math.random()*.4,c,r:1.5+Math.random()*3})}},
    draw(x,dt){P=P.filter(p=>(p.t-=dt)>0);for(const p of P){p.vy+=320*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;x.globalAlpha=Math.min(1,p.t*2.5);x.fillStyle=p.c;x.beginPath();x.arc(p.x,p.y,p.r,0,Math.PI*2);x.fill()}x.globalAlpha=1}
  };
}
/* screen-wide confetti + banners */
const FX=(()=>{
  const c=el('canvas',null,document.body);c.id='fx';const x=c.getContext('2d');let P=[],run=false;
  function size(){const r=Math.min(devicePixelRatio||1,2);c.width=innerWidth*r;c.height=innerHeight*r;x.setTransform(r,0,0,r,0,0)}
  size();addEventListener('resize',size);
  function tick(){
    x.clearRect(0,0,innerWidth,innerHeight);
    P=P.filter(p=>(p.t-=1/60)>0&&p.y<innerHeight+40);
    for(const p of P){p.vy+=p.g;p.vx*=.99;p.x+=p.vx;p.y+=p.vy;p.a+=p.va;x.save();x.globalAlpha=Math.min(1,p.t*2);x.translate(p.x,p.y);x.rotate(p.a);x.fillStyle=p.c;x.fillRect(-p.s/2,-p.s/3,p.s,p.s*.66);x.restore()}
    if(P.length)requestAnimationFrame(tick);else{run=false;x.clearRect(0,0,innerWidth,innerHeight)}
  }
  return{
    confetti(n=140){
      if(REDUCED)return;const C=['--c1','--c2','--c3','--c4','--c5','--c6'].map(cssv);
      for(let i=0;i<n;i++){const left=i%2===0;P.push({x:left?-10:innerWidth+10,y:innerHeight*.75,vx:(left?1:-1)*(6+Math.random()*10),vy:-(10+Math.random()*12),g:.32,a:Math.random()*6,va:(Math.random()-.5)*.4,s:6+Math.random()*8,c:C[rand(6)],t:2.4+Math.random()})}
      if(!run){run=true;requestAnimationFrame(tick)}
    },
    banner(text,sub){
      const b=el('div','banner',document.body,`<span></span>${sub?'<small></small>':''}`);
      b.querySelector('span').textContent=text;if(sub)b.querySelector('small').textContent=sub;
      setTimeout(()=>b.remove(),1900);
    }
  };
})();

/* ---------- games ---------- */
function tictactoe(root,S){
  const L=S.level;
  const st=status(root,L===3?'Hard mode never loses. Can you force a draw?':'Your turn. You are X.');
  const g=el('div','ttt',root);g.dataset.ar=1;g.dataset.max=520;
  const b=Array(9).fill('');let over=false,lock=false;
  const LINES=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const win=p=>LINES.find(l=>l.every(i=>b[i]===p));
  const free=()=>b.map((v,i)=>v?-1:i).filter(i=>i>=0);
  const cells=[...Array(9)].map((_,i)=>{const c=el('button','cell',g);c.style.animationDelay=i*35+'ms';c.setAttribute('aria-label','Square '+(i+1));S.on(c,'click',()=>play(i));return c});
  function put(i,p){b[i]=p;cells[i].innerHTML=`<span class="mk">${p}</span>`;cells[i].dataset.p=p;beep(p==='X'?520:330,90)}
  function mm(p){
    if(win('O'))return{s:1};if(win('X'))return{s:-1};const f=free();if(!f.length)return{s:0};
    let bm=null;for(const i of f){b[i]=p;const s=mm(p==='O'?'X':'O').s;b[i]='';if(!bm||(p==='O'?s>bm.s:s<bm.s))bm={s,i}}return bm;
  }
  function ai(){
    const f=free();const tryWin=p=>f.find(i=>{b[i]=p;const w=win(p);b[i]='';return w});let m;
    if(L===3)m=mm('O').i;
    else if(L===2){m=tryWin('O');if(m==null)m=tryWin('X');if(m==null)m=!b[4]?4:f[rand(f.length)]}
    else{if(Math.random()<.5)m=tryWin('O');if(m==null)m=f[rand(f.length)]}
    put(m,'O');
  }
  function end(msg,line,kind){
    over=true;st(msg);
    if(line)line.forEach((i,k)=>{cells[i].classList.add('hit');cells[i].style.animationDelay=k*120+'ms'});
    if(kind==='win'){S.fx.confetti();S.fx.banner('You win!')}
    if(kind==='lose')S.shake();
  }
  function check(){
    let l;if(l=win('X')){end('You win! Press ↻ to play again.',l,'win');return true}
    if(l=win('O')){end('Computer wins. Press ↻ to try again.',l,'lose');return true}
    if(b.every(v=>v)){end("It's a draw.");return true}return false;
  }
  function play(i){
    if(over||lock||b[i])return;put(i,'X');if(check())return;
    lock=true;st('Computer is thinking…');
    S.after(420,()=>{ai();lock=false;if(!check())st('Your turn.')});
  }
}

function rps(root,S){
  const L=S.level,TO=5;
  const st=status(root,`First to ${TO} wins the match.`+(L===2?' This computer learns your habits.':''));
  const face=el('div','rps-face',root,'<div><span class="big">✊</span><small>You</small><div class="pips you"></div></div><span class="vs">vs</span><div><span class="big">✊</span><small>Computer</small><div class="pips cpu"></div></div>');
  const [you,cpu]=face.querySelectorAll('.big');const [sideY,sideC]=face.querySelectorAll(':scope>div');
  const pipY=$('.pips.you',face),pipC=$('.pips.cpu',face);
  for(let i=0;i<TO;i++){el('i',null,pipY);el('i',null,pipC)}
  const row=el('div','row',root);const sc=el('p','score',root);
  let w=0,l=0,d=0,busy=false,over=false,hist=[];const trans={};
  const M=[['rock','✊'],['paper','✋'],['scissors','✌️']];const cap=s=>s[0].toUpperCase()+s.slice(1);
  const upd=()=>{sc.textContent=`Draws ${d}`;pipY.querySelectorAll('i').forEach((p,i)=>p.classList.toggle('on',i<w));pipC.querySelectorAll('i').forEach((p,i)=>p.classList.toggle('on',i<l))};upd();
  function cpuPick(){
    if(L===2&&hist.length&&Math.random()<.8){const t=trans[hist[hist.length-1]];if(t){const mx=Math.max(...t);if(mx>0)return(t.indexOf(mx)+1)%3}}
    return rand(3);
  }
  M.forEach(([n,e],i)=>{
    const b=el('button','btn',row,`${e} ${cap(n)}`);
    S.on(b,'click',()=>{
      if(busy||over)return;busy=true;const c=cpuPick();
      if(hist.length){const p=hist[hist.length-1];(trans[p]=trans[p]||[0,0,0])[i]++}hist.push(i);
      you.textContent='✊';cpu.textContent='✊';sideY.classList.remove('won');sideC.classList.remove('won');
      restartAnim(face,'shaking');st('Rock… paper… scissors…');
      S.after(760,()=>{
        face.classList.remove('shaking');you.textContent=e;cpu.textContent=M[c][1];restartAnim(you,'reveal');restartAnim(cpu,'reveal');
        const r=(i-c+3)%3;
        if(r===0){d++;st(`Draw. You both picked ${n}.`);beep(300,120)}
        else if(r===1){w++;sideY.classList.add('won');st(`You win the round. ${cap(n)} beats ${M[c][0]}.`);beep(660,140)}
        else{l++;sideC.classList.add('won');st(`Computer wins the round. ${cap(M[c][0])} beats ${n}.`);beep(200,160)}
        upd();busy=false;
        if(w>=TO){over=true;st(`You won the match ${w} to ${l}! Press ↻ for a rematch.`);S.fx.confetti();S.fx.banner('Match won!')}
        else if(l>=TO){over=true;st(`Computer took the match ${l} to ${w}. Press ↻ for a rematch.`);S.shake()}
      });
    });
  });
}

function guess(root,S){
  const R=[50,100,250,500,1000][S.level-1],MAX=Math.ceil(Math.log2(R))+2;
  const st=status(root,`I'm thinking of a number from 1 to ${R}. You have ${MAX} guesses.`);
  const meter=el('div','meter',root,`<div class="win"></div><span class="lo">1</span><span class="hi">${R}</span>`);
  const f=el('div','row',root,`<input type="number" min="1" max="${R}" inputmode="numeric" aria-label="Your guess" class="inp"><button class="btn">Guess</button>`);
  const inp=$('input',f),btn=$('button',f);const log=el('ol','log',root);const bar=$('.win',meter);
  const n=rand(R)+1;let lo=1,hi=R,tries=0,done=false;
  function upd(){bar.style.left=((lo-1)/R*100)+'%';bar.style.width=((hi-lo+1)/R*100)+'%';$('.lo',meter).textContent=lo;$('.hi',meter).textContent=hi}
  function go(){
    if(done)return;const v=parseInt(inp.value,10);
    if(!(v>=1&&v<=R)){st(`Enter a whole number from 1 to ${R}.`);return}
    tries++;const li=document.createElement('li');
    if(v===n){
      done=true;lo=hi=n;upd();bar.classList.add('found');li.textContent=`${v} is correct`;
      st(`Got it! ${n} in ${tries} ${tries===1?'guess':'guesses'}.`);beep(880,200);S.next();
    }else{
      if(v<n)lo=Math.max(lo,v+1);else hi=Math.min(hi,v-1);upd();
      const dist=Math.abs(v-n)/R,heat=dist<.03?'Very hot!':dist<.08?'Hot.':dist<.2?'Warm.':'Cold.';
      const h=v<n?'higher':'lower';li.textContent=`${v}: go ${h}`;beep(v<n?440:330,90);
      if(tries>=MAX){done=true;st(`Out of guesses. It was ${n}. Press ↻ to try again.`);S.shake()}
      else st(`${v}? Go ${h}. ${heat} ${MAX-tries} left.`);
    }
    log.prepend(li);inp.value='';inp.focus();
  }
  upd();S.on(btn,'click',go);S.on(inp,'keydown',e=>{if(e.key==='Enter')go()});
}

const MEMLV=[[3,4],[4,4],[4,5],[4,6],[5,6]];
const EMO=['🍎','🚀','🐙','🎈','🌵','🎲','⚡','🍩','🦊','🌈','🎸','🍉','🐢','⭐','🧁'];
function memory(root,S){
  const [r,cN]=MEMLV[S.level-1],P=r*cN/2;
  const st=status(root,`Find all ${P} pairs.`);
  const g=el('div','mem',root);g.style.gridTemplateColumns=`repeat(${cN},1fr)`;g.style.setProperty('--cols',cN);g.dataset.ar=cN/r;g.dataset.max=cN*120;
  const pick=shuffle(EMO.slice()).slice(0,P);const deck=shuffle([...pick,...pick]);
  let open=[],lock=false,moves=0,found=0;
  const cards=deck.map((e,i)=>{const b=el('button','card',g,`<span class="face back"></span><span class="face front">${e}</span>`);b.style.animationDelay=i*28+'ms';b.setAttribute('aria-label','Hidden card');S.on(b,'click',()=>flip(i));return b});
  const hide=i=>{cards[i].classList.remove('open','nope');cards[i].setAttribute('aria-label','Hidden card')};
  function flip(i){
    const c=cards[i];if(lock||c.classList.contains('open'))return;
    c.classList.add('open');c.setAttribute('aria-label',deck[i]);open.push(i);beep(500,60);
    if(open.length<2)return;moves++;const[a,b]=open;open=[];
    if(deck[a]===deck[b]){
      found++;S.after(250,()=>{restartAnim(cards[a],'done');restartAnim(cards[b],'done');beep(780,120)});
      if(found===P){best('memory'+S.level,moves,true);st(`All pairs found in ${moves} moves!`);S.after(400,S.next)}
      else st(`Pair found! Moves: ${moves}`);
    }else{lock=true;st(`Moves: ${moves}`);S.after(450,()=>{restartAnim(cards[a],'nope');restartAnim(cards[b],'nope')});S.after(900,()=>{hide(a);hide(b);lock=false})}
  }
}

function whack(root,S){
  const L=S.level,T=8+4*L,stay=Math.max(380,1000-60*L),gapT=Math.max(260,760-45*L),bombs=L>=3,DUR=30;
  const st=status(root,`Hit ${T} moles in ${DUR} seconds.`+(bombs?' Avoid the bombs!':''));
  const tb=el('div','timebar',root,'<i></i>');const tbi=$('i',tb);
  const g=el('div','holes',root);g.dataset.ar=1;g.dataset.max=540;
  const bar=el('div','row',root);const sb=el('button','btn',bar,'Start');
  let score=0,time=DUR,running=false;const tok=Array(9).fill(0),kind=Array(9).fill('');
  const show=()=>st(`Score ${score} of ${T}. ${time}s left.`);
  const holes=[...Array(9)].map((_,i)=>{
    const h=el('button','hole',g,'<span class="mole"></span>');h.setAttribute('aria-label','Hole '+(i+1));
    S.on(h,'pointerdown',e=>{e.preventDefault();hit(i)});S.on(h,'click',e=>{if(e.detail===0)hit(i)});return h;
  });
  function float(i,t,bad){const s=el('span','float'+(bad?' bad':''),holes[i],t);S.after(700,()=>s.remove())}
  function hit(i){
    const h=holes[i];if(!running||!h.classList.contains('up'))return;
    tok[i]++;h.classList.remove('up');restartAnim(h,'bonk');S.after(220,()=>h.classList.remove('bonk'));
    if(kind[i]==='💣'){score=Math.max(0,score-3);float(i,'-3',true);S.shake();beep(90,300,'sawtooth')}
    else{score++;float(i,'+1');beep(700+score*10,80)}
    show();
  }
  function spawn(){
    if(!running)return;const i=rand(9);
    if(!holes[i].classList.contains('up')){
      kind[i]=bombs&&Math.random()<.2?'💣':'🐹';holes[i].querySelector('.mole').textContent=kind[i];
      const t=++tok[i];holes[i].classList.add('up');S.after(stay,()=>{if(tok[i]===t)holes[i].classList.remove('up')});
    }
    S.after(gapT*(.6+Math.random()*.8),spawn);
  }
  S.on(sb,'click',()=>{
    if(running)return;score=0;time=DUR;running=true;sb.disabled=true;show();
    tbi.style.transition='none';tbi.style.width='100%';void tbi.offsetWidth;tbi.style.transition=`width ${DUR}s linear`;tbi.style.width='0%';
    spawn();
    const id=S.every(1000,()=>{
      time--;show();
      if(time<=0){
        clearInterval(id);running=false;holes.forEach(h=>h.classList.remove('up'));sb.disabled=false;sb.textContent='Try again';best('whack',score);
        if(score>=T){st(`You hit ${score}. Level cleared!`);S.next()}
        else{st(`You hit ${score}. You need ${T}. Tap Try again.`);S.shake()}
      }
    });
  });
}

function simon(root,S){
  const st=status(root,'Tap Start, watch the pattern, then repeat it.');
  const g=el('div','simon',root);g.dataset.ar=1;g.dataset.max=480;
  const bar=el('div','row',root);const sb=el('button','btn',bar,'Start');
  const F=[329.6,261.6,392,196];let seq=[],idx=0,busy=true,playing=false;
  const pads=[0,1,2,3].map(i=>{
    const p=el('button','pad p'+i,g);p.setAttribute('aria-label',['Red','Yellow','Teal','Blue'][i]+' pad');
    S.on(p,'pointerdown',e=>{e.preventDefault();press(i)});S.on(p,'click',e=>{if(e.detail===0)press(i)});return p;
  });
  function flash(i,ms=280){pads[i].classList.add('lit');const r=el('span','rip',pads[i]);S.after(520,()=>r.remove());beep(F[i],ms);S.after(ms,()=>pads[i].classList.remove('lit'))}
  function playSeq(){
    busy=true;S.show(seq.length);st('Watch…');const gap=Math.max(300,620-seq.length*22);
    seq.forEach((p,k)=>S.after(gap*k+500,()=>flash(p,Math.min(280,gap-40))));
    S.after(gap*seq.length+500,()=>{busy=false;idx=0;st('Your turn.')});
  }
  function press(i){
    if(busy||!playing)return;flash(i);
    if(seq[idx]!==i){
      playing=false;busy=true;beep(110,500,'sawtooth');S.shake();const s=seq.length-1;const nb=best('simon',s);
      st(`Wrong pad. You cleared ${s} ${s===1?'level':'levels'}.${nb?' New best!':''}`);sb.disabled=false;sb.textContent='Play again';return;
    }
    idx++;
    if(idx===seq.length){
      busy=true;st('Nice!');
      if(seq.length%5===0){S.fx.confetti(80);S.fx.banner(`Level ${seq.length+1}`,'Getting faster')}
      seq.push(rand(4));S.after(seq.length%5===1&&seq.length>1?1600:700,playSeq);
    }
  }
  S.show(1);
  S.on(sb,'click',()=>{seq=[rand(4)];playing=true;sb.disabled=true;playSeq()});
}

const HWORDS=[
  ['frog','cake','moon','ship','lamp','tree','bear','rain','kite','fish','gold','jazz','snow','wolf','star','duck','milk','boat'],
  ['apple','beach','cloud','dance','eagle','flame','grape','house','juice','lemon','music','ocean','piano','queen','robot','tiger','zebra','candy'],
  ['planet','guitar','castle','rocket','pencil','jungle','window','garden','bridge','dragon','pirate','marble','candle','tomato','violin','island','wizard','turtle','puzzle','galaxy'],
  ['balloon','captain','dolphin','giraffe','harvest','kingdom','lantern','mustard','pancake','rainbow','sunrise','teacher','unicorn','volcano','whisper','popcorn'],
  ['adventure','blueberry','chocolate','dinosaur','elephant','fireworks','hedgehog','mountain','notebook','pineapple','question','sandwich','treasure','umbrella','waterfall']
];
function hangman(root,S){
  const list=HWORDS[S.level-1];const word=list[rand(list.length)].toUpperCase();
  const st=status(root,`Guess the ${word.length}-letter word. You can miss 6 times.`);
  const top=el('div','hang',root,`<svg viewBox="0 0 120 140" class="gallows" aria-hidden="true">
    <path d="M10 132H70M30 132V10H80V24"/>
    <circle class="part" pathLength="1" cx="80" cy="36" r="12"/><path class="part" pathLength="1" d="M80 48V86"/>
    <path class="part" pathLength="1" d="M80 58L65 74"/><path class="part" pathLength="1" d="M80 58L95 74"/>
    <path class="part" pathLength="1" d="M80 86L67 108"/><path class="part" pathLength="1" d="M80 86L93 108"/></svg><p class="word"></p>`);
  const parts=top.querySelectorAll('.part'),wordEl=$('.word',top);
  wordEl.style.fontSize=`min(2.4rem, ${(62/word.length).toFixed(1)}vw)`;
  const spans=word.split('').map(()=>el('span','ch',wordEl,'_'));
  const kb=el('div','kb',root);const got=new Set();let miss=0,over=false;const keys={};
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(L=>{const b=el('button','key',kb,L);S.on(b,'click',()=>guessL(L));keys[L]=b});
  S.on(window,'keydown',e=>{const L=e.key.toUpperCase();if(/^[A-Z]$/.test(L)&&!e.metaKey&&!e.ctrlKey&&!e.altKey)guessL(L)});
  function reveal(L){word.split('').forEach((c,i)=>{if(c===L){spans[i].textContent=c;spans[i].style.animationDelay=i*60+'ms';restartAnim(spans[i],'flip')}})}
  function guessL(L){
    if(over||keys[L].disabled)return;keys[L].disabled=true;
    if(word.includes(L)){got.add(L);keys[L].classList.add('yes');reveal(L);beep(660,90)}
    else{miss++;keys[L].classList.add('no');parts.forEach((p,i)=>p.classList.toggle('on',i<miss));beep(180,150)}
    if(word.split('').every(c=>got.has(c))){over=true;st('You solved it!');S.next()}
    else if(miss>=6){over=true;wordEl.classList.add('lost');word.split('').forEach(c=>{if(!got.has(c)){got.add(c);reveal(c)}});st(`Out of guesses. The word was ${word}. Press ↻ for a new word.`);S.shake()}
    else st(`${6-miss} ${6-miss===1?'miss':'misses'} left.`);
  }
}

function dpad(root,S,cb){
  const p=el('div','dpad',root,'<button class="btn ghost" data-d="up" aria-label="Up">▲</button><button class="btn ghost" data-d="left" aria-label="Left">◀</button><button class="btn ghost" data-d="down" aria-label="Down">▼</button><button class="btn ghost" data-d="right" aria-label="Right">▶</button>');
  p.querySelectorAll('button').forEach(b=>S.on(b,'pointerdown',e=>{e.preventDefault();cb(b.dataset.d)}));
}

function snake(root,S){
  const st=status(root,'');const{c,x}=canvas(root,400,400);const K=pal();const fx=sparks();
  const N=20,C=20,DIRS={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}};
  let sn,dir,next,food,score,alive,started,acc,lvl,obs,t=0;
  const taken=(p)=>sn.some(s=>s.x===p.x&&s.y===p.y)||obs.some(o=>o.x===p.x&&o.y===p.y)||(food&&food.x===p.x&&food.y===p.y);
  function place(){let p;do{p={x:rand(N),y:rand(N)}}while(taken(p));return p}
  function addObs(n){for(let k=0;k<n;k++){let p,tries=0;do{p={x:rand(N),y:rand(N)};tries++}while((taken(p)||Math.abs(p.x-sn[0].x)+Math.abs(p.y-sn[0].y)<5)&&tries<200);obs.push(p)}}
  function reset(){sn=[{x:10,y:10},{x:9,y:10},{x:8,y:10}];obs=[];food=null;dir=DIRS.right;next=[];food=place();score=0;lvl=1;S.show(1);alive=true;started=false;acc=0;st('Press an arrow key, swipe, or tap a direction to start.')}
  reset();
  function turn(d){
    if(!alive)reset();const D=DIRS[d];const last=next.length?next[next.length-1]:dir;
    if(D.x===-last.x&&D.y===-last.y)return;
    if(!started){started=true;st('Score 0. Eat 5 to level up.')}
    if(next.length<3)next.push(D);
  }
  function step(){
    if(next.length)dir=next.shift();
    const h={x:sn[0].x+dir.x,y:sn[0].y+dir.y};
    if(h.x<0||h.y<0||h.x>=N||h.y>=N||sn.slice(0,-1).some(s=>s.x===h.x&&s.y===h.y)||obs.some(o=>o.x===h.x&&o.y===h.y)){
      alive=false;started=false;fx.add(sn[0].x*C+C/2,sn[0].y*C+C/2,K.c4,40,260);S.shake();beep(110,400,'sawtooth');
      const nb=best('snake',score);st(`Game over at level ${lvl} with ${score} points.${nb?' New best!':''} Press a direction to play again.`);return;
    }
    sn.unshift(h);
    if(h.x===food.x&&h.y===food.y){
      score++;fx.add(food.x*C+C/2,food.y*C+C/2,K.c1,16);beep(600+score*8,70);food=place();
      const nl=1+Math.floor(score/5);
      if(nl>lvl){lvl=nl;S.show(lvl);S.fx.banner(`Level ${lvl}`,lvl>=3?'Watch out for blocks':'Faster!');beep(990,200);if(lvl>=3)addObs(lvl>=6?4:3)}
      st(`Score ${score}. Level ${lvl}.`);
    }else sn.pop();
  }
  S.on(window,'keydown',e=>{const d=KEYDIR[e.key];if(d){e.preventDefault();turn(d)}});
  onSwipe(S,c,turn);dpad(root,S,turn);
  S.loop(dt=>{
    t+=dt;
    if(started&&alive){acc+=dt;const sp=Math.max(.055,.13-(lvl-1)*.012);while(acc>sp){acc-=sp;step();if(!alive)break}}
    x.fillStyle=K.board;x.fillRect(0,0,400,400);
    x.fillStyle=K.line;x.globalAlpha=.35;for(let i=0;i<N;i++)for(let j=0;j<N;j++)if((i+j)%2)x.fillRect(i*C,j*C,C,C);x.globalAlpha=1;
    x.fillStyle=K.muted;for(const o of obs){rr(x,o.x*C+1,o.y*C+1,C-2,C-2,4);x.fill()}
    const pr=(C/2-3)*(1+.15*Math.sin(t*7));x.fillStyle=K.c1;x.beginPath();x.arc(food.x*C+C/2,food.y*C+C/2,pr,0,Math.PI*2);x.fill();
    sn.forEach((s,i)=>{x.fillStyle=i?K.c3:K.c4;x.globalAlpha=i?Math.max(.45,1-i*.02):1;rr(x,s.x*C+1,s.y*C+1,C-2,C-2,6);x.fill()});x.globalAlpha=1;
    if(alive){const h=sn[0];x.fillStyle='#fff';x.beginPath();x.arc(h.x*C+C/2+dir.x*4-dir.y*4,h.y*C+C/2+dir.y*4-dir.x*4,3,0,7);x.arc(h.x*C+C/2+dir.x*4+dir.y*4,h.y*C+C/2+dir.y*4+dir.x*4,3,0,7);x.fill()}
    fx.draw(x,dt);
  });
}

function pong(root,S){
  const L=S.level,TO=5;
  const st=status(root,`Tap or press Space to serve. First to ${TO} wins.`);
  const{c,x}=canvas(root,480,320);const K=pal();const k=held(S);const fx=sparks();
  const W=480,H=320,PH=64,PW=10,R=7,AIS=170+50*L,SERVE=210+20*L;
  let p=H/2,a=H/2,b,sc=[0,0],live=false,over=false,trail=[];
  const reset=d=>{b={x:W/2,y:H/2,vx:0,vy:0,d};trail=[]};reset(1);
  function serve(){if(over)return;if(live)return;live=true;b.vx=b.d*SERVE;b.vy=(Math.random()*2-1)*140;st(`First to ${TO} wins.`)}
  S.on(c,'pointerdown',e=>{p=c.pos(e).y;serve()});S.on(c,'pointermove',e=>{p=c.pos(e).y});
  S.on(window,'keydown',e=>{if(e.key===' ')serve()});
  S.loop(dt=>{
    if(k.ArrowUp||k.w)p-=380*dt;if(k.ArrowDown||k.s)p+=380*dt;p=clamp(p,PH/2,H-PH/2);
    const tgt=live&&b.vx>0?b.y:H/2;a+=clamp(tgt-a,-AIS*dt,AIS*dt);a=clamp(a,PH/2,H-PH/2);
    if(live){
      b.x+=b.vx*dt;b.y+=b.vy*dt;trail.push({x:b.x,y:b.y});if(trail.length>10)trail.shift();
      if(b.y<R){b.y=R;b.vy=Math.abs(b.vy)}if(b.y>H-R){b.y=H-R;b.vy=-Math.abs(b.vy)}
      if(b.vx<0&&b.x-R<20+PW&&b.x>14&&Math.abs(b.y-p)<PH/2+R){b.x=20+PW+R;b.vx=Math.min(600,-b.vx*1.06);b.vy+=(b.y-p)*5;fx.add(b.x,b.y,K.c4,10);beep(440,60)}
      if(b.vx>0&&b.x+R>W-20-PW&&b.x<W-14&&Math.abs(b.y-a)<PH/2+R){b.x=W-20-PW-R;b.vx=-Math.min(600,b.vx*1.06);b.vy+=(b.y-a)*5;fx.add(b.x,b.y,K.c1,10);beep(380,60)}
      if(b.x<-R||b.x>W+R){
        const who=b.x>W?0:1;sc[who]++;fx.add(who?0:W,b.y,who?K.c1:K.c4,30,280);live=false;reset(who===0?1:-1);
        if(sc[who]>=TO){over=true;if(who===0){st(`You won ${TO} to ${sc[1]}!`);S.next()}else{st(`Computer won ${TO} to ${sc[0]}. Press ↻ to try again.`);S.shake()}}
        else{st(who===0?'Point to you! Tap or press Space to serve.':'Point to the computer. Tap or press Space to serve.');if(who===1)S.shake();beep(who?160:880,180)}
      }
    }
    x.fillStyle=K.board;x.fillRect(0,0,W,H);
    x.strokeStyle=K.line;x.lineWidth=4;x.setLineDash([10,12]);x.beginPath();x.moveTo(W/2,0);x.lineTo(W/2,H);x.stroke();x.setLineDash([]);
    x.fillStyle=K.muted;x.font=`36px ${DISPLAY}`;x.textAlign='center';x.fillText(sc[0],W/2-60,50);x.fillText(sc[1],W/2+60,50);
    x.fillStyle=K.c4;rr(x,20,p-PH/2,PW,PH,4);x.fill();
    x.fillStyle=K.c1;rr(x,W-20-PW,a-PH/2,PW,PH,4);x.fill();
    trail.forEach((q,i)=>{x.globalAlpha=i/trail.length*.35;x.fillStyle=K.c2;x.beginPath();x.arc(q.x,q.y,R*i/trail.length,0,7);x.fill()});x.globalAlpha=1;
    if(!over){x.fillStyle=K.ink;x.beginPath();x.arc(b.x,b.y,R,0,Math.PI*2);x.fill()}
    fx.draw(x,dt);
  });
}

function flappy(root,S){
  const st=status(root,'');const{c,x}=canvas(root,360,480);const K=pal();const fx=sparks();
  const W=360,H=480,PWd=56,GR=24;
  let bird,pipes,state,score,spawn,deadT,lvl,t=0;
  const clouds=[...Array(5)].map(()=>({x:Math.random()*W,y:30+Math.random()*250,s:.6+Math.random()*.8}));
  const gapFor=l=>Math.max(108,150-(l-1)*9),speedFor=l=>150+(l-1)*14;
  function reset(){bird={x:90,y:H/2,vy:0,r:13};pipes=[];state='ready';score=0;spawn=0;deadT=0;lvl=1;S.show(1);st('Tap, click, or press Space to flap. Every 8 pipes is a new level.')}
  reset();
  function flap(){if(state==='dead'){if(deadT>.5)reset();return}if(state==='ready'){state='play';st('Keep going!')}bird.vy=-320;fx.add(bird.x-8,bird.y+4,K.c2,5,90);beep(520,50)}
  function die(){if(state==='dead')return;state='dead';deadT=0;fx.add(bird.x,bird.y,K.c2,30,240);S.shake();beep(120,350,'sawtooth');const nb=best('flappy',score);st(`Crashed at level ${lvl} with ${score} points.${nb?' New best!':''} Tap to try again.`)}
  S.on(c,'pointerdown',e=>{e.preventDefault();flap()});
  S.on(window,'keydown',e=>{if(e.key===' '||e.key==='ArrowUp'){e.preventDefault();if(!e.repeat)flap()}});
  S.loop(dt=>{
    t+=dt;const sp=speedFor(lvl);
    if(state!=='dead')clouds.forEach(cl=>{cl.x-=25*cl.s*dt;if(cl.x<-60){cl.x=W+60;cl.y=30+Math.random()*250}});
    if(state==='ready')bird.y=H/2+Math.sin(t*3)*8;
    else if(state==='play'){
      bird.vy+=1100*dt;bird.y+=bird.vy*dt;spawn-=dt;
      if(spawn<=0){const G=gapFor(lvl);spawn=1.5*150/sp+.15;pipes.push({x:W,gy:50+Math.random()*(H-GR-100-G),G,passed:false})}
      for(const p of pipes){
        p.x-=sp*dt;
        if(!p.passed&&p.x+PWd<bird.x){
          p.passed=true;score++;beep(760,60);
          const nl=1+Math.floor(score/8);if(nl>lvl){lvl=nl;S.show(lvl);S.fx.banner(`Level ${lvl}`,'Tighter gaps');beep(990,200)}
        }
        if(bird.x+bird.r-3>p.x&&bird.x-bird.r+3<p.x+PWd&&(bird.y-bird.r+3<p.gy||bird.y+bird.r-3>p.gy+p.G))die();
      }
      pipes=pipes.filter(p=>p.x>-PWd);
      if(bird.y<bird.r){bird.y=bird.r;bird.vy=0}
      if(bird.y+bird.r>H-GR)die();
    }else{deadT+=dt;if(bird.y+bird.r<H-GR){bird.vy+=1100*dt;bird.y=Math.min(H-GR-bird.r,bird.y+bird.vy*dt)}}
    x.fillStyle=K.board;x.fillRect(0,0,W,H);
    x.fillStyle=K.line;clouds.forEach(cl=>{x.beginPath();x.arc(cl.x,cl.y,18*cl.s,0,7);x.arc(cl.x+20*cl.s,cl.y-8*cl.s,22*cl.s,0,7);x.arc(cl.x+42*cl.s,cl.y,16*cl.s,0,7);x.fill()});
    x.lineWidth=3;x.strokeStyle=K.edge;
    for(const p of pipes){x.fillStyle=K.c3;rr(x,p.x,-10,PWd,p.gy+10,8);x.fill();x.stroke();rr(x,p.x,p.gy+p.G,PWd,H-GR-p.gy-p.G+10,8);x.fill();x.stroke()}
    x.fillStyle=K.c6;x.fillRect(0,H-GR,W,GR);x.fillStyle=K.edge;x.fillRect(0,H-GR,W,3);
    x.fillStyle=K.edge;x.globalAlpha=.25;const off=(state==='dead'?0:t*sp)%24;for(let i=-1;i<W/24+1;i++)x.fillRect(i*24-off,H-GR+10,12,4);x.globalAlpha=1;
    x.save();x.translate(bird.x,bird.y);x.rotate(clamp(bird.vy/600,-.5,1));
    x.fillStyle=K.c2;x.beginPath();x.arc(0,0,bird.r,0,Math.PI*2);x.fill();x.stroke();
    x.fillStyle=K.c6;x.beginPath();x.ellipse(-4,3+Math.sin(t*20)*3,7,4,0,0,7);x.fill();
    x.fillStyle='#fff';x.beginPath();x.arc(5,-4,4.5,0,Math.PI*2);x.fill();
    x.fillStyle='#1E1F5C';x.beginPath();x.arc(6,-4,2,0,Math.PI*2);x.fill();
    x.fillStyle=K.c1;x.beginPath();x.moveTo(11,0);x.lineTo(19,3);x.lineTo(11,6);x.fill();x.restore();
    fx.draw(x,dt);
    x.fillStyle=K.ink;x.font=`44px ${DISPLAY}`;x.textAlign='center';x.fillText(score,W/2,70);
  });
}

function tower(root,S){
  const st=status(root,'');const{c,x}=canvas(root,360,540);const K=pal();const fx=sparks();
  const W=360,H=540,BH=26,BASE=H-70,COLS=[K.c1,K.c6,K.c2,K.c3,K.c4,K.c5];
  let stack,cur,falls,rings,texts,cam,zoom,state,overT,score,lvl,combo,t=0;
  const sy=f=>BASE-(f+1)*BH+cam;
  function reset(){
    stack=[{x:80,w:200,f:0,c:K.muted,land:0}];falls=[];rings=[];texts=[];cam=0;zoom=1;state='ready';overT=0;score=0;lvl=1;combo=0;S.show(1);spawn();
    st('Tap, click, or press Space to drop. Every 10 floors is a new level.');
  }
  function spawn(){const top=stack[stack.length-1];const fromLeft=stack.length%2===0;cur={x:fromLeft?-top.w*.6:W-top.w*.4,w:top.w,f:top.f+1,c:COLS[stack.length%6],dir:fromLeft?1:-1}}
  const speed=()=>Math.min(430,150+(lvl-1)*32+(score%10)*3);
  function end(){state='over';overT=0;S.shake();beep(110,450,'sawtooth');const nb=best('tower',score);st(`The tower fell at ${score} ${score===1?'floor':'floors'}.${nb?' New best!':''} Tap to build again.`)}
  function drop(){
    if(state==='over'){if(overT>.7)reset();return}
    if(state==='ready')state='play';
    const top=stack[stack.length-1];const left=Math.max(cur.x,top.x),right=Math.min(cur.x+cur.w,top.x+top.w),ov=right-left;
    if(ov<=0){falls.push({x:cur.x,w:cur.w,wy:sy(cur.f)-cam,c:cur.c,vy:0,rot:0,vr:cur.dir*2.5});end();return}
    if(Math.abs(cur.x-top.x)<5){
      combo++;cur.x=top.x;cur.w=top.w;
      if(combo>=3&&cur.w<200){cur.w=Math.min(200,cur.w+10);cur.x-=5}
      rings.push({x:cur.x,w:cur.w,f:cur.f,t:.5});
      texts.push({txt:combo>1?`Perfect ×${combo}`:'Perfect!',x:cur.x+cur.w/2,f:cur.f,t:.9});
      fx.add(cur.x,sy(cur.f)+BH/2,K.c2,10);fx.add(cur.x+cur.w,sy(cur.f)+BH/2,K.c2,10);
      beep(520+combo*80,120);
    }else{
      combo=0;
      const piece=cur.x<top.x?{x:cur.x,w:top.x-cur.x}:{x:right,w:cur.x+cur.w-right};
      falls.push({...piece,wy:sy(cur.f)-cam,c:cur.c,vy:0,rot:0,vr:(cur.x<top.x?-1:1)*(1.5+Math.random()*2)});
      cur.x=left;cur.w=ov;beep(380,70);
    }
    stack.push({x:cur.x,w:cur.w,f:cur.f,c:cur.c,land:.2});score++;
    const nl=1+Math.floor(score/10);
    if(nl>lvl){lvl=nl;S.show(lvl);S.fx.confetti(70);S.fx.banner(`Level ${lvl}`,'Faster blocks');beep(990,220)}
    st(`${score} ${score===1?'floor':'floors'}. Level ${lvl}.`);
    spawn();
  }
  S.on(c,'pointerdown',e=>{e.preventDefault();drop()});
  S.on(window,'keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!e.repeat)drop()}});
  reset();
  S.loop(dt=>{
    t+=dt;
    if(state!=='over'){
      cur.x+=cur.dir*speed()*dt;
      if(cur.dir>0&&cur.x>W-cur.w+30){cur.x=W-cur.w+30;cur.dir=-1}
      if(cur.dir<0&&cur.x<-30){cur.x=-30;cur.dir=1}
      const tc=Math.max(0,(stack.length-11)*BH);cam+=(tc-cam)*Math.min(1,dt*6);
    }else{
      overT+=dt;const hgt=stack.length*BH+90;const tz=Math.min(1,(H-40)/hgt);
      zoom+=(tz-zoom)*Math.min(1,dt*3);cam+=(0-cam)*Math.min(1,dt*3);
    }
    x.fillStyle=K.board;x.fillRect(0,0,W,H);
    x.globalAlpha=Math.min(.28,score*.007);x.fillStyle=K.c4;x.fillRect(0,0,W,H);x.globalAlpha=1;
    x.fillStyle=K.line;for(let i=0;i<4;i++){const cx=((i*110+t*12*(i%2?1:-1))%(W+120)+W+120)%(W+120)-60,cy=60+i*70+cam*.3%200;x.beginPath();x.arc(cx,cy,16,0,7);x.arc(cx+18,cy-7,20,0,7);x.arc(cx+38,cy,14,0,7);x.fill()}
    x.save();x.translate(W/2,H-10);x.scale(zoom,zoom);x.translate(-W/2,-(H-10));
    x.fillStyle=K.edge;x.fillRect(-W,BASE,W*3,H);
    x.lineWidth=3;x.strokeStyle=K.edge;
    for(const b of stack){
      b.land=Math.max(0,b.land-dt);const s=b.land*20;
      x.fillStyle=b.c;rr(x,b.x-s/2,sy(b.f)+s/4,b.w+s,BH-s/4,5);x.fill();x.stroke();
      x.fillStyle='rgba(255,255,255,.25)';x.fillRect(b.x+4,sy(b.f)+4,Math.max(0,b.w-8),4);
    }
    rings=rings.filter(r=>(r.t-=dt)>0);for(const r of rings){const g=(.5-r.t)*40;x.globalAlpha=r.t*2;x.strokeStyle=K.c2;x.lineWidth=4;rr(x,r.x-g,sy(r.f)-g/2,r.w+g*2,BH+g,8);x.stroke()}x.globalAlpha=1;x.lineWidth=3;x.strokeStyle=K.edge;
    if(state!=='over'){x.fillStyle=cur.c;rr(x,cur.x,sy(cur.f),cur.w,BH,5);x.fill();x.stroke()}
    falls=falls.filter(p=>p.wy+cam<H+200);
    for(const p of falls){p.vy+=1000*dt;p.wy+=p.vy*dt;p.rot+=p.vr*dt;x.save();x.translate(p.x+p.w/2,p.wy+cam+BH/2);x.rotate(p.rot);x.fillStyle=p.c;rr(x,-p.w/2,-BH/2,p.w,BH,5);x.fill();x.stroke();x.restore()}
    texts=texts.filter(q=>(q.t-=dt)>0);x.textAlign='center';x.font=`18px ${DISPLAY}`;
    for(const q of texts){x.globalAlpha=Math.min(1,q.t*2);x.fillStyle=K.c2;x.strokeStyle=K.edge;x.lineWidth=4;const yy=sy(q.f)-14-(.9-q.t)*40;x.strokeText(q.txt,q.x,yy);x.fillText(q.txt,q.x,yy)}
    x.globalAlpha=1;x.restore();
    fx.draw(x,dt);
    x.fillStyle=K.ink;x.font=`46px ${DISPLAY}`;x.textAlign='center';x.fillText(score,W/2,64);
  });
}

function crane(root,S){
  const st=status(root,'');const{c,x}=canvas(root,360,540);const K=pal();const fx=sparks();
  const W=360,H=540,BW=76,BH=44,BASE=H-46,CX=W/2,LR=150;
  const COLS=[K.c1,K.c6,K.c2,K.c3,K.c4,K.c5];
  let floors,blk,state,lives,score,lvl,combo,swayAmp,cam,t,ph,falls,texts,overT,waitT;
  const topY=()=>BASE-floors.length*BH;
  const swayAt=i=>Math.sin(t*1.7)*swayAmp*Math.pow(i/12,1.5);
  const amp=()=>Math.min(.95,.55+.05*(lvl-1)),omg=()=>Math.min(4.4,2.2+.25*(lvl-1));
  function newBlock(){blk={mode:'hang',c:COLS[floors.length%6],rot:0};ph=Math.random()<.5?0:Math.PI}
  function reset(){floors=[{x:CX,w:BW+44,c:K.muted,land:0}];lives=3;score=0;lvl=1;combo=0;swayAmp=0;cam=0;t=0;falls=[];texts=[];overT=0;waitT=0;state='play';S.show(1);newBlock();st('Tap, click, or press Space to drop the block onto the tower.')}
  function pivot(){return{x:CX,y:topY()-LR-95}}
  function drop(){
    if(state==='over'){if(overT>.7)reset();return}
    if(blk.mode!=='hang')return;
    const p=pivot(),a=amp()*Math.sin(ph),w=amp()*omg()*Math.cos(ph);
    blk.x=p.x+LR*Math.sin(a);blk.y=p.y+LR*Math.cos(a)+BH/2+8;
    blk.vx=LR*w*Math.cos(a);blk.vy=-LR*w*Math.sin(a)*.3;blk.rot=-a;blk.mode='fall';beep(300,50);
  }
  function land(){
    const n=floors.length-1,top=floors[n],tx=top.x+swayAt(n);let off=blk.x-tx;
    if(Math.abs(off)>top.w/2*.95){
      falls.push({x:blk.x,y:blk.y,vx:blk.vx+(off>0?60:-60),vy:-80,rot:blk.rot,vr:off>0?3:-3,c:blk.c});
      lives--;S.shake();beep(110,400,'sawtooth');blk.mode='wait';waitT=.6;combo=0;
      if(lives<=0){state='over';overT=0;const nb=best('crane',score);st(`Out of blocks! Your tower reached ${score} ${score===1?'floor':'floors'}.${nb?' New best!':''} Tap to build again.`)}
      else st(`Missed! ${lives} ${lives===1?'block':'blocks'} left.`);
      return;
    }
    const y0=topY();
    if(Math.abs(off)<7){off=0;combo++;swayAmp*=.55;texts.push({txt:combo>1?`Perfect ×${combo}`:'Perfect!',x:tx,y:y0-BH-12,t:.9});beep(600+combo*80,130);fx.add(tx-BW/2,y0,K.c2,10);fx.add(tx+BW/2,y0,K.c2,10)}
    else{combo=0;swayAmp=Math.min(46,swayAmp+Math.abs(off)*.32);beep(420,70)}
    fx.add(tx+off,y0,K.muted,8,90);
    floors.push({x:tx+off-swayAt(n+1),w:BW,c:blk.c,land:.25});score++;
    const nl=1+Math.floor(score/10);
    if(nl>lvl){lvl=nl;S.show(lvl);S.fx.confetti(70);S.fx.banner(`Level ${lvl}`,'Faster swing');beep(990,220)}
    st(`${score} ${score===1?'floor':'floors'}. Level ${lvl}.${swayAmp>25?' The tower is wobbling!':''}`);
    blk.mode='wait';waitT=.35;
  }
  function drawFloor(cx,y,w,col,i){
    x.fillStyle=col;rr(x,cx-w/2,y,w,BH,4);x.fill();x.stroke();
    const n=w>BW?4:2,ww=11,g=(w-n*ww)/(n+1);
    for(let k=0;k<n;k++){x.fillStyle=(i+k)%3?'#FFF6C8':'rgba(30,31,92,.35)';rr(x,cx-w/2+g+k*(ww+g),y+10,ww,14,2);x.fill()}
    if(i===0){x.fillStyle=K.edge;rr(x,cx-9,y+BH-20,18,20,3);x.fill()}
  }
  S.on(c,'pointerdown',e=>{e.preventDefault();drop()});
  S.on(window,'keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!e.repeat)drop()}});
  reset();
  S.loop(dt=>{
    t+=dt;
    if(state==='play'){
      ph+=omg()*dt;
      if(blk.mode==='fall'){
        blk.vy+=1500*dt;blk.x+=blk.vx*dt;blk.y+=blk.vy*dt;blk.rot*=Math.pow(.02,dt);
        if(blk.y+BH/2>=topY())land();
      }else if(blk.mode==='wait'){waitT-=dt;if(waitT<=0&&state==='play')newBlock()}
      cam+=(Math.max(0,330-topY())-cam)*Math.min(1,dt*4);
    }else overT+=dt;
    if(state==='over'){cam+=(Math.max(0,330-topY())-cam)*Math.min(1,dt*4)}
    const sky=Math.min(.5,score*.012);
    x.fillStyle=K.board;x.fillRect(0,0,W,H);x.globalAlpha=sky;x.fillStyle=K.c4;x.fillRect(0,0,W,H);x.globalAlpha=1;
    if(score>15){x.fillStyle='#fff';for(let i=0;i<14;i++){x.globalAlpha=Math.min(1,(score-15)/15)*(.4+.4*Math.sin(t*2+i));x.beginPath();x.arc((i*97)%W,(i*53+cam*.2)%H,1.6,0,7);x.fill()}x.globalAlpha=1}
    x.fillStyle=K.line;for(let i=0;i<4;i++){const cx=((i*120+t*10*(i%2?1:-1))%(W+120)+W+120)%(W+120)-60,cy=((70+i*120+cam*.4)%(H+80))-40;x.beginPath();x.arc(cx,cy,16,0,7);x.arc(cx+18,cy-7,20,0,7);x.arc(cx+38,cy,14,0,7);x.fill()}
    x.save();x.translate(0,cam);
    x.fillStyle=K.c3;x.fillRect(-10,BASE,W+20,H);x.fillStyle=K.edge;x.fillRect(-10,BASE,W+20,3);
    x.lineWidth=3;x.strokeStyle=K.edge;
    floors.forEach((f,i)=>{f.land=Math.max(0,f.land-dt);const s=f.land*24;const fx0=f.x+swayAt(i);
      x.save();x.translate(fx0,BASE-(i+1)*BH+BH);x.scale(1+s/80,1-s/80);drawFloor(0,-BH,f.w,f.c,i);x.restore()});
    const p=pivot();
    x.fillStyle=K.edge;x.fillRect(-10,p.y-14,W+20,10);x.fillStyle=K.c2;for(let i=0;i<W;i+=24){x.beginPath();x.moveTo(i,p.y-14);x.lineTo(i+12,p.y-4);x.lineTo(i+24,p.y-14);x.stroke()}
    rr(x,p.x-14,p.y-8,28,14,3);x.fillStyle=K.c2;x.fill();x.stroke();
    if(state==='play'&&blk.mode==='hang'){
      const a=amp()*Math.sin(ph),hx=p.x+LR*Math.sin(a),hy=p.y+LR*Math.cos(a);
      x.strokeStyle=K.ink;x.lineWidth=2;x.beginPath();x.moveTo(p.x,p.y);x.lineTo(hx,hy);x.stroke();
      x.save();x.translate(hx,hy);x.rotate(-a);x.lineWidth=3;x.strokeStyle=K.edge;
      x.beginPath();x.moveTo(-14,8);x.lineTo(0,0);x.lineTo(14,8);x.stroke();drawFloor(0,8,BW,blk.c,floors.length);x.restore();
      x.globalAlpha=.15;x.fillStyle=K.ink;x.fillRect(hx-BW/2,topY()-4,BW,4);x.globalAlpha=1;
    }else if(blk.mode==='fall'){x.save();x.translate(blk.x,blk.y);x.rotate(blk.rot);drawFloor(0,-BH/2,BW,blk.c,floors.length);x.restore()}
    falls=falls.filter(q=>q.y<topY()+H);
    for(const q of falls){q.vy+=1500*dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.rot+=q.vr*dt;x.save();x.translate(q.x,q.y);x.rotate(q.rot);drawFloor(0,-BH/2,BW,q.c,1);x.restore()}
    texts=texts.filter(q=>(q.t-=dt)>0);x.textAlign='center';x.font=`18px ${DISPLAY}`;
    for(const q of texts){x.globalAlpha=Math.min(1,q.t*2);x.fillStyle=K.c2;x.strokeStyle=K.edge;x.lineWidth=4;const yy=q.y-(.9-q.t)*40;x.strokeText(q.txt,q.x,yy);x.fillText(q.txt,q.x,yy)}
    x.globalAlpha=1;
    fx.draw(x,dt);x.restore();
    x.fillStyle=K.ink;x.font=`40px ${DISPLAY}`;x.textAlign='center';x.fillText(score,W/2,52);
    x.font=`18px ${DISPLAY}`;x.textAlign='right';x.fillStyle=K.c1;x.fillText('■'.repeat(Math.max(0,lives)),W-12,30);
  });
}

const BLOB_MAZE=[["########","#"],["#o......","#"],["#.##.##.","#"],["#.......","."],["#.##.#.#","#"],["#....#..","."],["####.###","."],["####....","."],["#####.##","-"],["     .#G","G"],["#####.##","#"],["####....","."],["####.###","#"],["#.......","."],["#.##.##.","#"],["#o.#....","."],["##.#.#.#","#"],["#.......","."],["########","#"]].map(([l,c])=>l+c+l.split('').reverse().join(''));
function blobmaze(root,S){
  const st=status(root,'');const T=20,NX=17,NY=19,OY=26,W=NX*T,H=NY*T+OY;const{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();
  const M=BLOB_MAZE,cell=(cx,cy)=>cy<0||cy>=NY?null:M[cy][(cx%NX+NX)%NX];
  const D={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]},DL=[[0,-1],[-1,0],[0,1],[1,0]];
  const ECOL=[K.c1,K.c5,K.c6,K.c4],CORN=[[16,0],[0,0],[16,18],[0,18]];
  let dots,pl,en,score,lives,lvl,state,stT,fr,chain,modeT,scatter,want,t=0,jit=[0,0];
  const key=(a,b)=>a+','+b;
  function fill(){dots=new Map();M.forEach((r,yy)=>r.split('').forEach((ch,xx)=>{if(ch==='.'||ch==='o')dots.set(key(xx,yy),ch)}));dots.delete(key(8,15))}
  function place(){
    pl={tx:8,ty:15,dx:0,dy:0,t:0,door:false};want=null;fr=0;chain=0;modeT=0;scatter=true;
    const n=Math.min(4,1+lvl);
    en=[[8,7],[7,9],[9,9],[8,9]].slice(0,n).map(([a,b],i)=>({tx:a,ty:b,dx:0,dy:0,t:0,i,state:i?'pen':'roam',wait:i*3.5,door:false}));
  }
  function reset(){score=0;lives=3;lvl=1;S.show(1);fill();place();state='ready';stT=0;st('Arrow keys, swipe, or the buttons to move. Eat every dot!')}
  const canGo=(e,dx,dy)=>{const ch=cell(e.tx+dx,e.ty+dy);if(ch==null||ch==='#')return false;if(ch==='-')return e.door;if(ch==='G')return e!==pl;return true};
  const pos=e=>({x:e.tx+e.dx*e.t,y:e.ty+e.dy*e.t});
  function advance(e,sp,dt,choose){
    e.t+=sp*dt;let g=0;
    while(e.t>=1&&g++<4){e.t-=1;e.tx=(e.tx+e.dx+NX)%NX;e.ty+=e.dy;choose(e)}
    if(!e.dx&&!e.dy){e.t=0;choose(e)}
  }
  function choosePl(e){
    if(want&&canGo(e,...D[want])){[e.dx,e.dy]=D[want]}
    else if((e.dx||e.dy)&&!canGo(e,e.dx,e.dy)){e.dx=e.dy=0}
    const k=key(e.tx,e.ty);if(dots.has(k)&&!(e.t>0)){eat(k)}
  }
  function eat(k){
    const ch=dots.get(k);dots.delete(k);
    if(ch==='o'){score+=50;fr=Math.max(2.5,7.5-lvl*.8);chain=0;beep(300,220);en.forEach(q=>{if(q.state==='roam'&&(q.dx||q.dy)){q.tx=(q.tx+q.dx+NX)%NX;q.ty+=q.dy;q.dx=-q.dx;q.dy=-q.dy;q.t=1-q.t}})}
    else{score+=10;beep(dots.size%2?620:700,30)}
    if(!dots.size){state='clear';stT=0;lvl++;S.show(lvl);S.fx.confetti(90);S.fx.banner(`Level ${lvl}`,'Faster spikers');beep(990,250)}
  }
  function target(e){
    if(e.state==='leave')return[8,7];
    if(scatter)return CORN[e.i];
    const p=pl;
    if(e.i===0)return[p.tx,p.ty];
    if(e.i===1)return[p.tx+p.dx*4,p.ty+p.dy*4];
    if(e.i===2)return[p.tx+jit[0],p.ty+jit[1]];
    return Math.hypot(p.tx-e.tx,p.ty-e.ty)>7?[p.tx,p.ty]:CORN[3];
  }
  function chooseEn(e){
    if(e.state==='leave'&&e.tx===8&&e.ty===7){e.state='roam';e.door=false}
    let opts=DL.filter(([a,b])=>canGo(e,a,b)&&!(a===-e.dx&&b===-e.dy&&(e.dx||e.dy)));
    if(!opts.length)opts=DL.filter(([a,b])=>canGo(e,a,b));if(!opts.length){e.dx=e.dy=0;return}
    let pick;
    if(fr>0&&e.state==='roam')pick=opts[rand(opts.length)];
    else{const[gx,gy]=target(e);pick=opts.reduce((b,o)=>{const d=Math.hypot(e.tx+o[0]-gx,e.ty+o[1]-gy);return d<b.d?{o,d}:b},{o:opts[0],d:1e9}).o}
    [e.dx,e.dy]=pick;
  }
  function turn(d){
    if(state==='over'){if(stT>.7)reset();return}
    if(state==='ready'){state='play';st(`Level ${lvl}. Gems make the spikers scared, so eat them!`)}
    want=d;const[a,b]=D[d];
    if((pl.dx||pl.dy)&&a===-pl.dx&&b===-pl.dy){pl.tx=(pl.tx+pl.dx+NX)%NX;pl.ty+=pl.dy;pl.dx=a;pl.dy=b;pl.t=1-pl.t}
  }
  S.on(window,'keydown',e=>{const d=KEYDIR[e.key];if(d){e.preventDefault();turn(d)}});
  onSwipe(S,c,turn);dpad(root,S,turn);
  reset();
  S.loop(dt=>{
    t+=dt;
    if(state==='play'){
      if(fr>0)fr=Math.max(0,fr-dt);else{modeT+=dt;if(modeT>(scatter?6:20)){modeT=0;scatter=!scatter}}
      if(Math.random()<dt/3)jit=[rand(9)-4,rand(9)-4];
      advance(pl,Math.min(8.5,6.2+.3*(lvl-1)),dt,choosePl);
      for(const e of en){
        if(e.state==='pen'){e.wait-=dt;if(e.wait<=0){e.state='leave';e.door=true}continue}
        if(e.state==='dead'){e.wait-=dt;if(e.wait<=0){e.tx=8;e.ty=9;e.dx=e.dy=0;e.t=0;e.state='leave';e.door=true}continue}
        const sp=e.state==='leave'?4:fr>0?3.4:Math.min(8,5.2+.45*(lvl-1));advance(e,sp,dt,chooseEn);
        const a=pos(e),b=pos(pl);let dx=Math.abs(a.x-b.x);dx=Math.min(dx,NX-dx);
        if(dx+Math.abs(a.y-b.y)<.75&&e.state==='roam'){
          if(fr>0){const pts=200*2**chain++;score+=pts;e.state='dead';e.wait=3;fx.add(a.x*T+T/2,a.y*T+T/2+OY,ECOL[e.i],24,220);S.fx.banner(`+${pts}`);beep(880,150)}
          else{state='dying';stT=0;S.shake();beep(110,600,'sawtooth');fx.add(b.x*T+T/2,b.y*T+T/2+OY,K.c3,36,240);break}
        }
      }
      if(state==='play')st(`Score ${score}. Level ${lvl}.${fr>0?' Spikers are scared!':''}`);
    }else if(state==='dying'){stT+=dt;if(stT>1.3){lives--;if(lives<=0){state='over';stT=0;const nb=best('blobmaze',score);st(`Game over at level ${lvl} with ${score} points.${nb?' New best!':''} Press a direction to play again.`)}else{place();state='ready';st(`${lives} ${lives===1?'life':'lives'} left. Press a direction to go.`)}}}
    else if(state==='clear'){stT+=dt;if(stT>1.6){fill();place();state='ready';st(`Level ${lvl}. Press a direction to start.`)}}
    else if(state==='over')stT+=dt;
    /* draw */
    x.fillStyle=K.board;x.fillRect(0,0,W,H);
    const isW=(a,b)=>b>=0&&b<NY&&a>=0&&a<NX&&M[b][a]==='#';
    x.fillStyle=K.c4;x.globalAlpha=.22;
    for(let yy=0;yy<NY;yy++)for(let xx=0;xx<NX;xx++)if(isW(xx,yy))x.fillRect(xx*T,yy*T+OY,T,T);
    x.globalAlpha=1;x.strokeStyle=K.c4;x.lineWidth=3;x.lineCap='round';x.beginPath();
    for(let yy=0;yy<NY;yy++)for(let xx=0;xx<NX;xx++)if(isW(xx,yy)){const X=xx*T,Y=yy*T+OY;
      if(!isW(xx,yy-1)){x.moveTo(X,Y+1.5);x.lineTo(X+T,Y+1.5)}if(!isW(xx,yy+1)){x.moveTo(X,Y+T-1.5);x.lineTo(X+T,Y+T-1.5)}
      if(!isW(xx-1,yy)&&xx>0){x.moveTo(X+1.5,Y);x.lineTo(X+1.5,Y+T)}if(!isW(xx+1,yy)&&xx<NX-1){x.moveTo(X+T-1.5,Y);x.lineTo(X+T-1.5,Y+T)}}
    x.stroke();x.fillStyle=K.c2;x.fillRect(8*T+2,8*T+OY+T/2-2,T-4,4);
    for(const[k,ch]of dots){const[xx,yy]=k.split(',').map(Number);const cx=xx*T+T/2,cy=yy*T+T/2+OY;
      if(ch==='.'){x.fillStyle=K.muted;x.beginPath();x.arc(cx,cy,2.4,0,7);x.fill()}
      else{const s=6+Math.sin(t*6)*1.5;x.save();x.translate(cx,cy);x.rotate(t*2);x.fillStyle=K.c2;x.beginPath();x.moveTo(0,-s);x.lineTo(s*.7,0);x.lineTo(0,s);x.lineTo(-s*.7,0);x.closePath();x.fill();x.restore()}}
    for(const e of en){
      if(e.state==='dead')continue;const p=pos(e),cx=p.x*T+T/2,cy=p.y*T+T/2+OY+(e.state==='pen'?Math.sin(t*5+e.i)*2:0);
      const scared=fr>0&&e.state==='roam',blink=scared&&fr<2&&Math.floor(t*6)%2;
      x.save();x.translate(cx,cy);x.rotate(t*(scared?6:2)*(e.i%2?1:-1));
      x.fillStyle=blink?'#fff':scared?K.muted:ECOL[e.i];x.beginPath();
      for(let k=0;k<16;k++){const r=k%2?5.5:9.5,a=k/16*Math.PI*2;x.lineTo(Math.cos(a)*r,Math.sin(a)*r)}x.closePath();x.fill();x.restore();
      const b=pos(pl),ang=Math.atan2(b.y-p.y,b.x-p.x);
      x.fillStyle='#fff';x.beginPath();x.arc(cx-3,cy-1,3,0,7);x.arc(cx+3,cy-1,3,0,7);x.fill();
      x.fillStyle='#1E1F5C';x.beginPath();x.arc(cx-3+Math.cos(ang)*1.3,cy-1+Math.sin(ang)*1.3,1.5,0,7);x.arc(cx+3+Math.cos(ang)*1.3,cy-1+Math.sin(ang)*1.3,1.5,0,7);x.fill();
    }
    if(state!=='over'){
      const p=pos(pl),cx=p.x*T+T/2,cy=p.y*T+T/2+OY,mv=pl.dx||pl.dy;
      let sc=state==='dying'?Math.max(0,1-stT/1.1):1;const sq=mv?Math.sin(t*18)*.12:Math.sin(t*4)*.05;
      x.save();x.translate(cx,cy);x.rotate(state==='dying'?stT*8:0);x.scale(sc*(1+sq),sc*(1-sq));
      x.strokeStyle=K.ink;x.lineWidth=1.5;x.beginPath();x.moveTo(0,-7);x.quadraticCurveTo(3,-11,2,-13+Math.sin(t*8));x.stroke();
      x.fillStyle=K.c2;x.beginPath();x.arc(2,-13+Math.sin(t*8),2.2,0,7);x.fill();
      x.fillStyle=fr>0?K.c2:K.c3;x.beginPath();x.ellipse(0,1,8.5,7.5,0,0,7);x.fill();
      const ex=pl.dx*1.8,ey=pl.dy*1.8;x.fillStyle='#fff';x.beginPath();x.arc(-3+ex,-1+ey,2.6,0,7);x.arc(3+ex,-1+ey,2.6,0,7);x.fill();
      x.fillStyle='#1E1F5C';x.beginPath();x.arc(-3+ex*1.4,-1+ey*1.4,1.3,0,7);x.arc(3+ex*1.4,-1+ey*1.4,1.3,0,7);x.fill();
      x.restore();
    }
    fx.draw(x,dt);
    x.fillStyle=K.ink;x.font=`15px ${DISPLAY}`;x.textAlign='left';x.fillText(score,6,19);
    x.textAlign='center';x.fillText('LV '+lvl,W/2,19);x.textAlign='right';x.fillStyle=K.c3;x.fillText('●'.repeat(Math.max(0,lives)),W-6,19);
  });
}

function brickHP(L,r,q){
  switch(L){
    case 1:return r<4?1:0;
    case 2:return r<5?(r===0?2:1):0;
    case 3:return r<6&&(r+q)%2===0?(r<2?2:1):0;
    case 4:return r<6&&q%3!==2?(r<3?2:1):0;
    default:{const d=Math.abs(q-3.5)+Math.abs(r-3);return d<=4.5?(d<1.6?3:d<3?2:1):0}
  }
}
function breakout(root,S){
  const L=S.level;
  const st=status(root,'Move to steer. Tap or press Space to launch.');
  const{c,x}=canvas(root,480,360);const K=pal();const k=held(S);const fx=sparks();
  const W=480,H=360,cols=8,gap=6,m=12,bw=(W-2*m-gap*(cols-1))/cols,bh=14,BASE=280+25*(L-1);
  const RC=[K.c1,K.c6,K.c2,K.c3,K.c4,K.c5,K.c1];const HPC=[null,null,K.c5,K.c4];
  let pad,ball,bricks,lives,score,stuck,over,trail=[];
  pad={x:W/2,w:Math.max(64,90-L*4),h:10,y:H-26};ball={x:0,y:0,vx:0,vy:0,r:6};bricks=[];
  for(let r=0;r<7;r++)for(let q=0;q<cols;q++){const hp=brickHP(L,r,q);if(hp)bricks.push({x:m+q*(bw+gap),y:40+r*(bh+gap),c:RC[r],hp,hit:0})}
  lives=3;score=0;stuck=true;over=false;
  function launch(){if(over||!stuck)return;stuck=false;const a=(Math.random()-.5)*.8;ball.vx=BASE*Math.sin(a);ball.vy=-BASE*Math.cos(a)}
  S.on(c,'pointerdown',e=>{pad.x=c.pos(e).x;launch()});S.on(c,'pointermove',e=>{pad.x=c.pos(e).x});
  S.on(window,'keydown',e=>{if(e.key===' ')launch()});
  function step(dt){
    if(over||stuck)return;const B=ball;B.x+=B.vx*dt;B.y+=B.vy*dt;
    if(B.x<B.r){B.x=B.r;B.vx=Math.abs(B.vx)}if(B.x>W-B.r){B.x=W-B.r;B.vx=-Math.abs(B.vx)}if(B.y<B.r){B.y=B.r;B.vy=Math.abs(B.vy)}
    if(B.vy>0&&B.y+B.r>=pad.y&&B.y-B.r<=pad.y+pad.h&&Math.abs(B.x-pad.x)<=pad.w/2+B.r){
      B.y=pad.y-B.r;const sp=Math.hypot(B.vx,B.vy);const ang=clamp((B.x-pad.x)/(pad.w/2),-1,1)*1.05;
      B.vx=sp*Math.sin(ang);B.vy=-sp*Math.cos(ang);pad.squish=.15;beep(300,40);
    }
    for(const br of bricks){
      if(br.hp<=0)continue;const nx=clamp(B.x,br.x,br.x+bw),ny=clamp(B.y,br.y,br.y+bh);
      if((B.x-nx)**2+(B.y-ny)**2<=B.r*B.r){
        br.hp--;br.hit=.15;
        const ox=Math.min(B.x+B.r-br.x,br.x+bw-(B.x-B.r)),oy=Math.min(B.y+B.r-br.y,br.y+bh-(B.y-B.r));
        if(ox<oy)B.vx=-B.vx;else B.vy=-B.vy;
        if(br.hp<=0){score+=10;fx.add(br.x+bw/2,br.y+bh/2,br.c,14);beep(500+rand(300),50)}else beep(240,50);
        if(Math.hypot(B.vx,B.vy)<BASE*1.6){B.vx*=1.012;B.vy*=1.012}
        st(`Score ${score}. Lives ${lives}.`);break;
      }
    }
    if(bricks.every(b=>b.hp<=0)){over=true;best('breakout',score);st(`Level cleared with ${score} points!`);S.next();return}
    if(B.y>H+B.r){
      lives--;stuck=true;S.shake();beep(120,300,'sawtooth');
      if(lives<=0){over=true;stuck=false;best('breakout',score);st(`Game over. Score ${score}. Press ↻ to try again.`)}
      else st(`${lives} ${lives===1?'life':'lives'} left. Tap or press Space to launch.`);
    }
  }
  S.loop(dt=>{
    if(k.ArrowLeft||k.a)pad.x-=460*dt;if(k.ArrowRight||k.d)pad.x+=460*dt;pad.x=clamp(pad.x,pad.w/2,W-pad.w/2);
    if(stuck){ball.x=pad.x;ball.y=pad.y-ball.r-1;trail=[]}else if(!over){for(let s=0;s<3;s++)step(dt/3);trail.push({x:ball.x,y:ball.y});if(trail.length>8)trail.shift()}
    x.fillStyle=K.board;x.fillRect(0,0,W,H);
    for(const br of bricks)if(br.hp>0){
      br.hit=Math.max(0,br.hit-dt);const sq=br.hit*12;
      x.fillStyle=br.hp>1?HPC[br.hp]:br.c;rr(x,br.x-sq/2,br.y-sq/4,bw+sq,bh+sq/2,4);x.fill();
      if(br.hp>1){x.fillStyle='#fff';for(let i=0;i<br.hp;i++){x.beginPath();x.arc(br.x+bw/2+(i-(br.hp-1)/2)*8,br.y+bh/2,2.2,0,7);x.fill()}}
    }
    pad.squish=Math.max(0,(pad.squish||0)-dt);const s=pad.squish*40;
    x.fillStyle=K.c4;rr(x,pad.x-pad.w/2-s/2,pad.y+s/8,pad.w+s,pad.h-s/4,5);x.fill();
    trail.forEach((q,i)=>{x.globalAlpha=i/trail.length*.3;x.fillStyle=K.c4;x.beginPath();x.arc(q.x,q.y,ball.r*i/trail.length,0,7);x.fill()});x.globalAlpha=1;
    if(!over||bricks.every(b=>b.hp<=0)){x.fillStyle=K.ink;x.beginPath();x.arc(ball.x,ball.y,ball.r,0,Math.PI*2);x.fill()}
    fx.draw(x,dt);
    x.fillStyle=K.muted;x.font=`16px ${DISPLAY}`;x.textAlign='left';x.fillText(score,12,26);
    x.textAlign='right';x.fillText('♥'.repeat(Math.max(0,lives)),W-12,26);
  });
}

function g2048(root,S){
  const st=status(root,'Swipe or use arrow keys. Reach 128 to clear level 1.');
  const g=el('div','b2048',root);g.dataset.ar=1;g.dataset.max=540;const cells=[...Array(16)].map(()=>el('div','t',g));
  const b=Array(16).fill(0);let score=0,over=false,lvl=1;const target=l=>2**(6+l);S.show(1);
  function add(){const e=b.map((v,i)=>v?-1:i).filter(i=>i>=0);if(!e.length)return -1;const i=e[rand(e.length)];b[i]=Math.random()<.9?2:4;return i}
  function render(nw=[],merged=new Set()){
    cells.forEach(c=>c.classList.remove('new','merge'));void g.offsetWidth;
    cells.forEach((c,i)=>{const v=b[i];c.textContent=v||'';c.dataset.v=v?Math.min(Math.log2(v),12):0;if(merged.has(i))c.classList.add('merge');if(nw.includes(i))c.classList.add('new')});
  }
  const idx=(d,i,j)=>d==='left'?i*4+j:d==='right'?i*4+3-j:d==='up'?j*4+i:(3-j)*4+i;
  function slide(row){const a=[],m=[];for(const v of row){if(!v)continue;if(a.length&&a[a.length-1]===v&&!m[a.length-1]){a[a.length-1]*=2;score+=a[a.length-1];m[a.length-1]=true}else{a.push(v);m.push(false)}}while(a.length<4){a.push(0);m.push(false)}return{a,m}}
  function canMove(){if(b.includes(0))return true;for(let i=0;i<16;i++){if(i%4<3&&b[i]===b[i+1])return true;if(i<12&&b[i]===b[i+4])return true}return false}
  function move(d){
    if(over)return;let moved=false;const merged=new Set();
    for(let i=0;i<4;i++){
      const ks=[0,1,2,3].map(j=>idx(d,i,j));const res=slide(ks.map(k=>b[k]));
      ks.forEach((k,j)=>{if(b[k]!==res.a[j])moved=true;b[k]=res.a[j];if(res.m[j])merged.add(k)});
    }
    if(!moved)return;const n=add();render([n],merged);best('2048',score);beep(merged.size?560:400,50);
    if(Math.max(...b)>=target(lvl)){lvl++;S.show(lvl);S.fx.confetti(90);S.fx.banner(`Level ${lvl}`,`Next goal: ${target(lvl)}`);beep(990,220)}
    st(`Score ${score}. Next goal: ${target(lvl)}.`);
    if(!canMove()){over=true;S.shake();st(`No moves left. Level ${lvl}, score ${score}. Best ${store.get('best:2048')}.`)}
  }
  S.on(window,'keydown',e=>{const d=KEYDIR[e.key];if(d){e.preventDefault();move(d)}});
  onSwipe(S,g,move);
  const a1=add(),a2=add();render([a1,a2]);
}

/* ---------- registry ---------- */
const PAGES={"tictactoe": "tic-tac-toe.html", "rps": "rock-paper-scissors.html", "guess": "number-guessing-game.html", "memory": "memory-match.html", "whack": "whack-a-mole.html", "simon": "simon-says.html", "hangman": "hangman.html", "snake": "snake.html", "pong": "pong.html", "flappy": "flappy-bird.html", "tower": "tower-block.html", "crane": "sky-crane.html", "blobmaze": "blob-maze.html", "breakout": "breakout.html", "2048": "2048.html"};
const BASE_TITLE=document.title;
const GAMES=[
  {id:'tictactoe',name:'Tic-Tac-Toe',icon:'⭕',blurb:'Three in a row against the computer.',help:'Tap a square to place your X. Switch difficulty with the arrows at the top.',mount:tictactoe,levels:3,open:true,names:['Easy','Medium','Hard']},
  {id:'rps',name:'Rock Paper Scissors',icon:'✊',blurb:'First to five wins the match.',help:'Pick a move. Mind reader mode learns your patterns.',mount:rps,levels:2,open:true,names:['Random','Mind reader']},
  {id:'guess',name:'Number Guess',icon:'🎯',blurb:'Find the secret number with limited guesses.',help:'Type a guess and press Enter. The bar shows where the number can still be.',mount:guess,levels:5},
  {id:'memory',name:'Memory Match',icon:'🃏',blurb:'Flip cards and find every pair.',help:'Tap two cards. Matching pairs stay face up. More cards each level.',mount:memory,levels:5},
  {id:'whack',name:'Whack-a-Mole',icon:'🔨',blurb:'Hit enough moles before time runs out.',help:'Tap moles while they are up. From level 3, bombs cost you 3 points.',mount:whack,levels:10,unit:'moles'},
  {id:'simon',name:'Simon Says',icon:'🔴',blurb:'Repeat a pattern that grows every level.',help:'Watch the pads light up, then tap them in the same order. Sound on helps.',mount:simon,run:true,unit:'levels'},
  {id:'hangman',name:'Hangman',icon:'🔤',blurb:'Guess the word one letter at a time.',help:'Tap letters or type on your keyboard. Words get longer each level.',mount:hangman,levels:5},
  {id:'snake',name:'Snake',icon:'🐍',blurb:'Eat, grow, and dodge blocks as it speeds up.',help:'Arrow keys or WASD on a computer. Swipe or use the buttons on a phone.',mount:snake,run:true,unit:'points'},
  {id:'pong',name:'Pong',icon:'🏓',blurb:'Beat a computer that gets sharper each level.',help:'Move your finger or mouse over the court, or use the up and down keys.',mount:pong,levels:5},
  {id:'flappy',name:'Flappy Bird',icon:'🐦',blurb:'Flap through gaps that keep getting tighter.',help:'Tap, click, or press Space to flap.',mount:flappy,run:true,unit:'points'},
  {id:'tower',name:'Tower Block',icon:'🧱',blurb:'Drop sliding blocks to build the tallest tower.',help:'Tap, click, or press Space to drop. Line blocks up perfectly to keep them wide.',mount:tower,run:true,unit:'floors'},
  {id:'crane',name:'Sky Crane',icon:'🏗️',blurb:'Drop swinging blocks to stack a wobbly skyscraper.',help:'Tap, click, or press Space to release the block. Perfect drops steady the tower.',mount:crane,run:true,unit:'floors',isNew:true},
  {id:'blobmaze',name:'Blob Maze',icon:'🟢',blurb:'Eat every dot and dodge the spikers.',help:'Arrow keys or WASD on a computer. Swipe or use the buttons on a phone. Gems let you eat the spikers.',mount:blobmaze,run:true,unit:'points',isNew:true},
  {id:'breakout',name:'Breakout',icon:'🟦',blurb:'Break every brick. Tough bricks take more hits.',help:'Move your finger or mouse to steer, or use the left and right keys.',mount:breakout,levels:5,unit:'points'},
  {id:'2048',name:'2048',icon:'🧮',blurb:'Merge tiles to hit bigger and bigger goals.',help:'Swipe on the board or use the arrow keys.',mount:g2048,run:true,unit:'points'}
];
const TC=['#FF8A99','#FFD166','#5FD8CC','#9FA9FF','#D2A8FF','#FFAA6B'];

/* ---------- level state ---------- */
const unl=g=>g.run?1:g.open?g.levels:clamp(store.get('unl:'+g.id)||1,1,g.levels);
const curLevel=g=>g.run?1:clamp(store.get('cur:'+g.id)||unl(g),1,unl(g));
const lvlName=(g,n)=>g.names?g.names[n-1]:'Level '+n;

const shelf=$('#shelf'),stage=$('#stage'),gameEl=$('#game'),lvName=$('#lvName'),lvPrev=$('#lvPrev'),lvNext=$('#lvNext');
let scope=null,curGame=null,curLv=1;

function chip(g,n){
  const t=lvlName(g,n);if(lvName.textContent!==t){lvName.textContent=t;restartAnim(lvName,'bump')}
  const pick=!g.run&&g.levels>1;lvPrev.hidden=lvNext.hidden=!pick;
  lvPrev.disabled=n<=1;lvNext.disabled=n>=unl(g);
}
function levelUp(g,lv){
  FX.confetti();beep(660,120);setTimeout(()=>beep(880,120),120);setTimeout(()=>beep(1320,200),240);
  if(lv<g.levels){
    if(!g.open)store.set('unl:'+g.id,Math.max(unl(g),lv+1));
    store.set('cur:'+g.id,lv+1);
    FX.banner('Level cleared!',`Up next: ${lvlName(g,lv+1)}`);
    scope.after(2000,route);
  }else FX.banner('You beat them all!','Every level cleared');
}
function shake(){restartAnim(gameEl,'shake')}

/* ---------- fit game to the screen ---------- */
function fit(){
  const f=gameEl.querySelector('[data-ar]');if(!f)return;
  const gap=parseFloat(getComputedStyle(gameEl).rowGap)||0;let used=0,n=0;
  for(const ch of gameEl.children){if(ch===f||getComputedStyle(ch).display==='none')continue;used+=ch.offsetHeight;n++}
  used+=gap*n+20;
  const ah=gameEl.clientHeight-used,aw=gameEl.clientWidth-8;
  f.style.width=Math.max(180,Math.min(aw,ah*(+f.dataset.ar),+(f.dataset.max||900)))+'px';
}
addEventListener('resize',fit);
document.addEventListener('fullscreenchange',()=>requestAnimationFrame(fit));
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit);

/* ---------- full screen ---------- */
const canFS=!!(document.fullscreenEnabled||document.webkitFullscreenEnabled);
const isFS=()=>!!(document.fullscreenElement||document.webkitFullscreenElement);
function enterFS(){if(!canFS||isFS())return;try{const d=document.documentElement;const p=(d.requestFullscreen||d.webkitRequestFullscreen).call(d);if(p&&p.catch)p.catch(()=>{})}catch(e){}}
function exitFS(){if(!isFS())return;try{const p=(document.exitFullscreen||document.webkitExitFullscreen).call(document);if(p&&p.catch)p.catch(()=>{})}catch(e){}}
$('#fs').hidden=!canFS;
$('#fs').addEventListener('click',()=>isFS()?exitFS():enterFS());

/* ---------- shelf & router ---------- */
(function logo(){
  const h=$('#logo');if(!h)return;const txt=h.textContent;h.setAttribute('aria-label',txt);let n=0;
  h.innerHTML=txt.split(' ').map(w=>`<span class="w" aria-hidden="true">${w.split('').map(ch=>{const i=n++;return`<span class="l" style="--i:${i};color:var(--c${i%6+1})">${ch}</span>`}).join('')}</span>`).join(' ');
})();
function renderShelf(){
  shelf.innerHTML='';
  GAMES.forEach((g,i)=>{
    const a=el('a','tile',shelf);a.href=PAGES[g.id];a.dataset.id=g.id;a.style.setProperty('--tc',TC[i%TC.length]);a.style.setProperty('--k',i);
    const b=store.get('best:'+g.id);const chips=[];
    if(!g.run&&!g.open)chips.push(`Level ${unl(g)} of ${g.levels}`);
    if(g.open)chips.push(`${g.levels} modes`);
    if(g.isNew)chips.unshift('New!');
    if(b!=null&&g.unit)chips.push(`Best ${b} ${g.unit}`);
    a.innerHTML=`<span class="ico" aria-hidden="true">${g.icon}</span><b>${g.name}</b><span class="d">${g.blurb}</span><span class="meta">${chips.map(c=>`<span class="chip">${c}</span>`).join('')}</span>`;
  });
}
if(shelf)shelf.addEventListener('click',e=>{const t=e.target.closest('.tile');if(t&&t.dataset.id){e.preventDefault();location.hash=t.dataset.id;enterFS()}});
document.querySelectorAll('[data-play]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();location.hash=b.dataset.play;enterFS()}));
$('#back').addEventListener('click',exitFS);

function route(){
  if(scope){scope.dispose();scope=null}
  gameEl.innerHTML='';gameEl.classList.remove('shake');
  const g=GAMES.find(x=>x.id===location.hash.slice(1));
  if(!g){
    document.body.classList.remove('playing');stage.hidden=true;document.title=BASE_TITLE;if(shelf)renderShelf();return;
  }
  curGame=g;curLv=curLevel(g);
  document.body.classList.add('playing');stage.hidden=false;restartAnim(stage,'in');
  $('#gtitle').textContent=g.name;$('#ghelp').textContent=g.help;document.title=g.name+' · Pocket Arcade';
  lvName.textContent='';chip(g,curLv);
  scope=makeScope();
  Object.assign(scope,{level:curLv,fx:FX,shake,next:()=>levelUp(g,curLv),show:n=>chip(g,n)});
  g.mount(gameEl,scope);
  requestAnimationFrame(fit);
}
lvPrev.addEventListener('click',()=>{if(!curGame)return;store.set('cur:'+curGame.id,curLv-1);route()});
lvNext.addEventListener('click',()=>{if(!curGame)return;store.set('cur:'+curGame.id,curLv+1);route()});
$('#restart').addEventListener('click',route);
addEventListener('hashchange',route);

/* ---------- ads ---------- */
(function(){
  const ins=[...document.querySelectorAll('ins.adsbygoogle')];
  if(ins.some(i=>/0000000000000000/.test(i.dataset.adClient))){ins.forEach(i=>i.closest('.ad').classList.add('off'));return}
  ins.forEach(()=>{try{(window.adsbygoogle=window.adsbygoogle||[]).push({})}catch(e){}});
})();
route();
