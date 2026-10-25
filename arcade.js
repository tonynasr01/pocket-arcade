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
/* compact layout on phones: status and help text are hidden, important messages pop up briefly */
const COMPACT=matchMedia('(max-width:600px),(max-height:500px)');
let infoGoal='',mountT=0;
function status(root,text){
  const p=el('p','status',root);p.setAttribute('aria-live','polite');p.textContent=text||'';if(text&&!infoGoal)infoGoal=text;
  return t=>{
    if(p.textContent===t)return;p.textContent=t;restartAnim(p,'bump');
    if(performance.now()-mountT<500){if(t&&!infoGoal)infoGoal=t;return}
    if(COMPACT.matches&&t&&!/^(Score|Moves|Pair found|Go!|Keep going|Your turn|Your move|Computer is thinking|Rock|\d+ (miss|mistake))/.test(t))popMsg(t);
  };
}
function popMsg(t){
  document.querySelectorAll('.popmsg').forEach(m=>m.remove());
  const m=el('div','popmsg',document.body);m.textContent=t;
  const g=document.querySelector('#game'),r=g&&g.getBoundingClientRect();m.style.top=((r?r.top:70)+8)+'px';
  setTimeout(()=>m.remove(),2800);
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
    cleanup(f){fns.push(f)},
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
/* Phones held upright have much more height than width, so a fixed-shape game leaves the bottom of the
   screen empty. A game that can use a taller playfield asks tall(w,h,max,reserve) for its logical height:
   on a portrait phone it returns the height that fills the free space (reserve = px of other rows the
   game adds under/over its board), never less than h and never more than max; elsewhere it returns h. */
function tall(w,h,max,reserve=0){
  if(!COMPACT.matches)return h;
  const g=document.querySelector('#game');if(!g)return h;
  const aw=g.clientWidth-2,ah=g.clientHeight-24-reserve;
  if(aw<=0||ah<=aw)return h;
  return Math.round(clamp(w*ah/aw,h,max||h));
}
function held(S){
  const k={};
  S.on(window,'keydown',e=>{k[e.key]=true;if(e.key.startsWith('Arrow')||e.key===' ')e.preventDefault()});
  S.on(window,'keyup',e=>{k[e.key]=false});
  return k;
}
function onSwipe(S,target,cb,cont){
  let sx=null,sy=null,fired=false;target.style.touchAction='none';
  S.on(target,'pointerdown',e=>{if(e.target.closest('.dpad'))return;sx=e.clientX;sy=e.clientY;fired=false});
  S.on(target,'pointermove',e=>{
    if(sx==null||(fired&&!cont))return;const dx=e.clientX-sx,dy=e.clientY-sy;
    if(Math.max(Math.abs(dx),Math.abs(dy))<(cont?18:24))return;
    cb(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));fired=true;sx=e.clientX;sy=e.clientY;
  });
  ['pointerup','pointercancel'].forEach(t=>S.on(target,t,()=>{sx=null}));
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
    toast(text,sub){
      const t=el('div','toast',document.body,`<b></b>${sub?'<small></small>':''}`);
      t.querySelector('b').textContent=text;if(sub)t.querySelector('small').textContent=sub;
      const a=document.querySelector('#game .status'),r=a&&a.getBoundingClientRect();
      t.style.top=(r&&r.height?r.top+r.height/2:90)+'px';
      setTimeout(()=>t.remove(),1700);
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
  const L=S.level,TWO=L===4;let turn='X';
  const st=status(root,TWO?"X goes first. Take turns on this device.":L===3?'Hard mode never loses. Can you force a draw?':'Your turn. You are X.');
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
    if(kind==='win'){S.fx.confetti();if(!TWO)S.fx.banner('You win!')}
    if(kind==='lose')S.shake();
  }
  function check(){
    let l;if(l=win('X')){end(TWO?'X wins! Press ↻ for a rematch.':'You win! Press ↻ to play again.',l,'win');if(TWO){S.fx.banner('X wins!')}return true}
    if(l=win('O')){end(TWO?'O wins! Press ↻ for a rematch.':'Computer wins. Press ↻ to try again.',l,TWO?'win':'lose');if(TWO)S.fx.banner('O wins!');return true}
    if(b.every(v=>v)){end("It's a draw.");return true}return false;
  }
  function play(i){
    if(over||lock||b[i])return;
    if(TWO){put(i,turn);if(check())return;turn=turn==='X'?'O':'X';st(`${turn}'s turn.`);return}
    put(i,'X');if(check())return;
    lock=true;st('Computer is thinking…');
    S.after(420,()=>{ai();lock=false;if(!check())st('Your turn.')});
  }
}

const MEMLV=[[3,4],[4,4],[4,5],[4,6],[5,6]];
const EMO=['🍎','🚀','🐙','🎈','🌵','🎲','⚡','🍩','🦊','🌈','🎸','🍉','🐢','⭐','🧁'];
function memory(root,S){
  /* MEMLV is [rows, cols] for a wide screen; on a portrait phone the grid is turned (more rows than columns) so cards are bigger */
  let [r,cN]=MEMLV[S.level-1];const P=r*cN/2,turn=tall(cN,r,cN*4)>cN;if(turn)[r,cN]=[cN,r];
  const st=status(root,`Find all ${P} pairs.`);
  const g=el('div','mem',root);g.style.gridTemplateColumns=`repeat(${cN},1fr)`;g.style.setProperty('--cols',cN);g.dataset.ar=cN/r;g.dataset.max=cN*(turn?160:120);
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
  const st=status(root,'Tap Start. Whack every mole before it hides. Miss 3 and the game is over.');
  const lv=el('div','row wlives',root,'');
  const g=el('div','holes',root);g.dataset.ar=1;g.dataset.max=540;
  const bar=el('div','row',root);const sb=el('button','btn',bar,'Start');
  let score=0,lives=3,running=false,t0=0,lvl=1;const tok=Array(9).fill(0),kind=Array(9).fill('');
  const el2=()=>(performance.now()-t0)/1000;
  const paint=()=>{lv.innerHTML=`<b>Score ${score}</b><span class="hearts">${'❤️'.repeat(Math.max(0,lives))}${'🤍'.repeat(Math.max(0,3-lives))}</span>`};paint();
  const holes=[...Array(9)].map((_,i)=>{
    const h=el('button','hole',g,'<span class="mole"></span>');h.setAttribute('aria-label','Hole '+(i+1));
    S.on(h,'pointerdown',e=>{e.preventDefault();hit(i)});S.on(h,'click',e=>{if(e.detail===0)hit(i)});return h;
  });
  function float(i,t,bad){const s=el('span','float'+(bad?' bad':''),holes[i],t);S.after(700,()=>s.remove())}
  function lose(i,why){
    lives--;paint();S.shake();beep(150,250,'sawtooth');if(i!=null)float(i,why,true);
    if(lives<=0){
      running=false;holes.forEach(h=>h.classList.remove('up'));sb.disabled=false;sb.textContent='Play again';
      const nb=best('whack',score);st(`Game over! You whacked ${score} moles.${nb?' New best!':''}`);
    }
  }
  function hit(i){
    const h=holes[i];if(!running||!h.classList.contains('up'))return;
    tok[i]++;h.classList.remove('up');restartAnim(h,'bonk');S.after(220,()=>h.classList.remove('bonk'));
    if(kind[i]==='💣'){lose(i,'💥')}
    else if(kind[i]==='⭐'){score+=3;float(i,'+3');beep(1100,90)}
    else{score++;float(i,'+1');beep(700+Math.min(score,60)*8,70)}
    paint();
    const nl=1+Math.floor(score/15);if(running&&nl>lvl){lvl=nl;S.show(lvl);S.fx.toast(`Level ${lvl}`,'Faster moles');beep(990,160)}
  }
  function spawn(){
    if(!running)return;const s=el2(),i=rand(9);
    const stay=Math.max(360,1050-s*9-score*6),gap=Math.max(200,760-s*7-score*5),bombs=s>15;
    if(!holes[i].classList.contains('up')){
      const r=Math.random();kind[i]=bombs&&r<Math.min(.28,.1+s/300)?'💣':r>.95?'⭐':'🐹';holes[i].querySelector('.mole').textContent=kind[i];
      const tk=++tok[i];holes[i].classList.add('up');
      S.after(stay,()=>{if(tok[i]===tk&&running){holes[i].classList.remove('up');if(kind[i]==='🐹')lose(i,'Missed!')}});
    }
    S.after(gap*(.6+Math.random()*.8),spawn);
    if(s>25&&Math.random()<Math.min(.5,(s-25)/80))S.after(gap*.3,()=>{if(running)spawnOne()});
  }
  function spawnOne(){const i=rand(9);if(holes[i].classList.contains('up'))return;const s=el2(),stay=Math.max(360,1050-s*9-score*6);kind[i]='🐹';holes[i].querySelector('.mole').textContent='🐹';const tk=++tok[i];holes[i].classList.add('up');S.after(stay,()=>{if(tok[i]===tk&&running){holes[i].classList.remove('up');lose(i,'Missed!')}})}
  S.on(sb,'click',()=>{
    if(running)return;score=0;lives=3;lvl=1;S.show(1);running=true;t0=performance.now();sb.disabled=true;sb.textContent='Whack!';paint();
    st('Whack the moles! ⭐ is worth 3. Bombs come later: don\'t hit them.');spawn();
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
      if(seq.length%5===0){S.fx.confetti(80);S.fx.toast(`Level ${seq.length+1}`,'Getting faster')}
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
  let guessL=()=>{};
  S.on(window,'keydown',e=>{if(e.target.closest&&e.target.closest('input'))return;const L=e.key.toUpperCase();if(/^[A-Z]$/.test(L)&&!e.metaKey&&!e.ctrlKey&&!e.altKey)guessL(L)});
  function play(word,two){
    root.innerHTML='';guessL=()=>{};
    const st=status(root,two?`Player 2: guess the ${word.length}-letter word. You can miss 6 times.`:`Guess the ${word.length}-letter word. You can miss 6 times.`);
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
    const two2=el('div','row',root,`<button class="btn ghost hm2">👥 ${two?'New 2-player word':'2 players: pick a word'}</button>`);S.on($('button',two2),'click',setup);
    function reveal(L){word.split('').forEach((c,i)=>{if(c===L){spans[i].textContent=c;spans[i].style.animationDelay=i*60+'ms';restartAnim(spans[i],'flip')}})}
    guessL=L=>{
      if(over||keys[L].disabled)return;keys[L].disabled=true;
      if(word.includes(L)){got.add(L);keys[L].classList.add('yes');reveal(L);beep(660,90)}
      else{miss++;keys[L].classList.add('no');parts.forEach((p,i)=>p.classList.toggle('on',i<miss));beep(180,150)}
      if(word.split('').every(c=>got.has(c))){over=true;if(two){st('Player 2 solved it!');S.fx.confetti();S.fx.banner('Player 2 wins!')}else{st('You solved it!');S.next()}}
      else if(miss>=6){over=true;wordEl.classList.add('lost');word.split('').forEach(c=>{if(!got.has(c)){got.add(c);reveal(c)}});
        if(two){st(`Player 1 wins! The word was ${word}.`);S.fx.banner('Player 1 wins!')}else{st(`Out of guesses. The word was ${word}. Press ↻ for a new word.`);S.shake()}}
      else st(`${6-miss} ${6-miss===1?'miss':'misses'} left.`);
    };
    requestAnimationFrame(fit);
  }
  function setup(){
    root.innerHTML='';guessL=()=>{};
    const st=status(root,'Player 1: type a secret word while Player 2 looks away.');
    const f=el('form','hm-setup',root,`<input type="password" class="inp hm-in" maxlength="14" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Secret word" aria-label="Secret word"><label class="hm-show"><input type="checkbox"> Show</label><div class="row"><button class="btn" type="submit">Start ▶</button><button class="btn ghost" type="button">Cancel</button></div>`);
    const inp=$('.hm-in',f);inp.focus();
    S.on($('.hm-show input',f),'change',e=>{inp.type=e.target.checked?'text':'password'});
    S.on(inp,'input',()=>{inp.value=inp.value.toUpperCase().replace(/[^A-Z]/g,'')});
    S.on($('button[type=button]',f),'click',()=>play(randomWord(),false));
    S.on(f,'submit',e=>{e.preventDefault();const w=inp.value.trim();if(w.length<3){st('Use at least 3 letters (A to Z only).');restartAnim(inp,'nope');return}play(w,true)});
    requestAnimationFrame(fit);
  }
  const randomWord=()=>{const list=HWORDS[S.level-1];return list[rand(list.length)].toUpperCase()};
  play(randomWord(),false);
}

/* round thumb joystick for touch screens; axis 'xy' (4-way), or 'x' (left/right only) */
function stick(parent,S,{axis='xy',onDir,onMove}){
  const j=el('div','joy'+(axis==='x'?' joy-x':''),parent,`${axis==='x'?'':'<i class="ch u">▲</i><i class="ch d">▼</i>'}<i class="ch l">◀</i><i class="ch r">▶</i><span class="knob"></span>`);
  j.setAttribute('role','group');j.setAttribute('aria-label','Joystick');
  const knob=$('.knob',j);let id=null,last=null;
  function at(e){
    const b=j.getBoundingClientRect(),R=b.width/2;let dx=e.clientX-b.left-R,dy=axis==='x'?0:e.clientY-b.top-R;
    const d=Math.hypot(dx,dy),m=Math.min(d,R*.55);const ux=d?dx/d:0,uy=d?dy/d:0;
    knob.style.transform=`translate(${ux*m}px,${uy*m}px)`;
    let dir=null;if(d>R*.18)dir=axis==='x'?(dx>0?'right':'left'):Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
    if(dir!==last){last=dir;j.dataset.dir=dir||'';if(dir){if(navigator.vibrate)navigator.vibrate(8);onDir&&onDir(dir)}}
    onMove&&onMove(d>R*.18?clamp(dx/(R*.55),-1,1):0);
  }
  S.on(j,'pointerdown',e=>{e.preventDefault();id=e.pointerId;try{j.setPointerCapture(id)}catch(_){}j.classList.add('on');at(e)});
  S.on(j,'pointermove',e=>{if(e.pointerId===id)at(e)});
  const up=e=>{if(e.pointerId!==id)return;id=null;last=null;j.dataset.dir='';j.classList.remove('on');knob.style.transform='';onMove&&onMove(0)};
  S.on(j,'pointerup',up);S.on(j,'pointercancel',up);
  return j;
}
function arrows(parent,S,{axis='xy',onDir,onMove}){
  const ds=axis==='x'?[['left','◀'],['right','▶']]:[['up','▲'],['left','◀'],['down','▼'],['right','▶']];
  const p=el('div','arrows'+(axis==='x'?' arrows-x':''),parent,ds.map(([d,g])=>`<button class="btn ghost" data-d="${d}" aria-label="${d[0].toUpperCase()+d.slice(1)}">${g}</button>`).join(''));
  p.querySelectorAll('button').forEach(b=>{
    const d=b.dataset.d;
    S.on(b,'pointerdown',e=>{e.preventDefault();restartAnim(b,'hit');if(navigator.vibrate)navigator.vibrate(8);onDir&&onDir(d);onMove&&onMove(d==='left'?-1:1)});
    ['pointerup','pointerleave','pointercancel'].forEach(ev=>S.on(b,ev,()=>{onMove&&onMove(0)}));
  });
}
/* screen-wide touch zones: no visible controls, the whole game area is the controller.
   4-way games: put a thumb down anywhere and slide it, like a wheel that appears under the finger.
   left/right games: slide on the left half to move, touch the right half for the main button
   (.bfire in the control row), and slide down on the right half for .fjdown when the game has one. */
function zones(parent,S,opts){
  const stage=$('#stage'),xOnly=opts.axis==='x',P=new Map();
  const layer=el('div','tz-layer',stage);S.cleanup(()=>layer.remove());
  const ring=el('div','tz-ring',layer,'<i></i>');ring.hidden=true;const dot=$('i',ring);
  const hints=xOnly?[el('div','tz-hint tz-l',layer,'◀ slide ▶'),el('div','tz-hint tz-r',layer,'tap to fire')]:[el('div','tz-hint tz-c',layer,'slide anywhere to steer')];
  const placeHints=()=>{if(xOnly&&btn('.fjdown'))hints[1].textContent='tap ⤒ · swipe down ⤓';const r=(gameEl.querySelector('[data-ar]')||gameEl).getBoundingClientRect(),y=r.bottom-48;hints.forEach(h=>{h.style.top=y+'px'});if(xOnly){hints[0].style.left=(r.left+r.width*.25)+'px';hints[1].style.left=(r.left+r.width*.75)+'px'}else hints[0].style.left=(r.left+r.width/2)+'px'};
  S.after(60,placeHints);S.after(3200,()=>hints.forEach(h=>h.classList.add('gone')));
  const btn=sel=>parent.closest('#game')?.querySelector(sel);
  const send=(b,type,e)=>{if(b)b.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:e.pointerId,pointerType:e.pointerType,clientX:e.clientX,clientY:e.clientY}))};
  const showRing=(x,y)=>{ring.hidden=false;ring.style.left=x+'px';ring.style.top=y+'px';dot.style.transform=''};
  S.on(stage,'pointerdown',e=>{
    if(!e.isTrusted)return;const t=e.target;if(!gameEl.contains(t)||t.closest('button,a,input,.ctl-tg'))return;
    e.stopPropagation();e.preventDefault();const r=gameEl.getBoundingClientRect();
    if(xOnly&&e.clientX>r.left+r.width/2){const b=btn('.bfire');P.set(e.pointerId,{k:'act',b,y0:e.clientY});send(b,'pointerdown',e);return}
    P.set(e.pointerId,{k:'move',ox:e.clientX,oy:e.clientY,last:null});showRing(e.clientX,e.clientY);
  },true);
  S.on(stage,'pointermove',e=>{
    const p=P.get(e.pointerId);if(!p||!e.isTrusted)return;e.stopPropagation();
    if(p.k==='act'){const d=btn('.fjdown');if(d&&e.clientY-p.y0>28){send(p.b,'pointerup',e);p.k='drop';p.b=d;send(d,'pointerdown',e)}return}
    if(p.k!=='move')return;
    let dx=e.clientX-p.ox,dy=xOnly?0:e.clientY-p.oy;const MAX=xOnly?54:46,d=Math.hypot(dx,dy);
    if(d>MAX){p.ox+=dx*(1-MAX/d);p.oy+=dy*(1-MAX/d);dx=e.clientX-p.ox;dy=xOnly?0:e.clientY-p.oy;ring.style.left=p.ox+'px';ring.style.top=p.oy+'px'}
    dot.style.transform=`translate(${dx}px,${dy}px)`;
    if(xOnly){opts.onMove&&opts.onMove(Math.abs(dx)<7?0:clamp(dx/(MAX*.75),-1,1));return}
    if(Math.hypot(dx,dy)<14)return;
    const dir=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
    if(dir!==p.last){p.last=dir;if(navigator.vibrate)navigator.vibrate(8);opts.onDir&&opts.onDir(dir)}
  },true);
  const up=e=>{const p=P.get(e.pointerId);if(!p||!e.isTrusted)return;P.delete(e.pointerId);e.stopPropagation();if(e.pointerType!=='mouse'&&!fsOff&&!isFS())enterFS();
    if(p.k==='move'){ring.hidden=true;opts.onMove&&opts.onMove(0)}else send(p.b,'pointerup',e)};
  S.on(stage,'pointerup',up,true);S.on(stage,'pointercancel',up,true);
}
/* the on-screen ring is kept invisible (it covered the game); sliding still steers */
/* touch controls with a remembered choice: whole-screen touch zones (default on touch screens),
   the joystick wheel, or arrow buttons */
const TOUCHDEV=matchMedia('(pointer:coarse)').matches;
function controls(parent,S,opts){
  const w=el('div','ctl',parent),body=el('div','ctl-body',w);
  const tg=el('div','ctl-tg',w,'<button data-m="touch">👆 Touch</button><button data-m="wheel">🕹️ Wheel</button><button data-m="arrows">✛ Arrows</button>');tg.setAttribute('role','group');tg.setAttribute('aria-label','Touch controls');
  let zs=null;
  function draw(){
    const saved=store.get('ctl2'),m=saved||(TOUCHDEV?'touch':'wheel');body.innerHTML='';opts.onMove&&opts.onMove(0);
    if(zs){zs.dispose();zs=null}
    w.classList.toggle('touch',m==='touch');parent.classList.toggle('tz-on',m==='touch');
    if(m==='touch'){zs=makeScope();zones(parent,zs,opts)}else(m==='wheel'?stick:arrows)(body,S,opts);
    tg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.m===m));
  }
  S.cleanup(()=>{if(zs)zs.dispose()});
  tg.querySelectorAll('button').forEach(b=>S.on(b,'click',()=>{store.set('ctl2',b.dataset.m);draw();requestAnimationFrame(fit)}));
  draw();
}
function dpad(root,S,cb){const w=el('div','dpad',root);controls(w,S,{onDir:cb})}

function snake(root,S){
  /* portrait phones get extra rows (same 20px cells and speed) so the board fills the screen */
  const N=20,C=20,NY=Math.floor(tall(400,400,800,40)/C),H=NY*C;
  const st=status(root,'');const{c,x}=canvas(root,400,H);const K=pal();const fx=sparks();
  const DIRS={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}};
  let sn,dir,next,food,score,alive,started,acc,lvl,obs,t=0;
  const taken=(p)=>sn.some(s=>s.x===p.x&&s.y===p.y)||obs.some(o=>o.x===p.x&&o.y===p.y)||(food&&food.x===p.x&&food.y===p.y);
  function place(){let p;do{p={x:rand(N),y:rand(NY)}}while(taken(p));return p}
  function addObs(n){for(let k=0;k<n;k++){let p,tries=0;do{p={x:rand(N),y:rand(NY)};tries++}while((taken(p)||Math.abs(p.x-sn[0].x)+Math.abs(p.y-sn[0].y)<5)&&tries<200);obs.push(p)}}
  function reset(){const my=NY>>1;sn=[{x:10,y:my},{x:9,y:my},{x:8,y:my}];obs=[];food=null;dir=DIRS.right;next=[];food=place();score=0;lvl=1;S.show(1);alive=true;started=false;acc=0;st('Press an arrow key, swipe, or use the wheel or arrows to start.')}
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
    if(h.x<0||h.y<0||h.x>=N||h.y>=NY||sn.slice(0,-1).some(s=>s.x===h.x&&s.y===h.y)||obs.some(o=>o.x===h.x&&o.y===h.y)){
      alive=false;started=false;fx.add(sn[0].x*C+C/2,sn[0].y*C+C/2,K.c4,40,260);S.shake();beep(110,400,'sawtooth');
      const nb=best('snake',score);st(`Game over at level ${lvl} with ${score} points.${nb?' New best!':''} Press a direction to play again.`);return;
    }
    sn.unshift(h);
    if(h.x===food.x&&h.y===food.y){
      score++;fx.add(food.x*C+C/2,food.y*C+C/2,K.c1,16);beep(600+score*8,70);food=place();
      const nl=1+Math.floor(score/5);
      if(nl>lvl){lvl=nl;S.show(lvl);S.fx.toast(`Level ${lvl}`,lvl>=3?'Watch out for blocks':'Faster!');beep(990,200);if(lvl>=3)addObs(Math.round((lvl>=6?4:3)*NY/N))}
      st(`Score ${score}. Level ${lvl}.`);
    }else sn.pop();
  }
  S.on(window,'keydown',e=>{const d=KEYDIR[e.key];if(d){e.preventDefault();turn(d)}});
  onSwipe(S,root,turn,true);dpad(root,S,turn);
  S.loop(dt=>{
    t+=dt;
    if(started&&alive){acc+=dt;const sp=Math.max(.055,.13-(lvl-1)*.012);while(acc>sp){acc-=sp;step();if(!alive)break}}
    x.fillStyle=K.board;x.fillRect(0,0,400,H);
    x.fillStyle=K.line;x.globalAlpha=.35;for(let i=0;i<N;i++)for(let j=0;j<NY;j++)if((i+j)%2)x.fillRect(i*C,j*C,C,C);x.globalAlpha=1;
    x.fillStyle=K.muted;for(const o of obs){rr(x,o.x*C+1,o.y*C+1,C-2,C-2,4);x.fill()}
    const pr=(C/2-3)*(1+.15*Math.sin(t*7));x.fillStyle=K.c1;x.beginPath();x.arc(food.x*C+C/2,food.y*C+C/2,pr,0,Math.PI*2);x.fill();
    sn.forEach((s,i)=>{x.fillStyle=i?K.c3:K.c4;x.globalAlpha=i?Math.max(.45,1-i*.02):1;rr(x,s.x*C+1,s.y*C+1,C-2,C-2,6);x.fill()});x.globalAlpha=1;
    if(alive){const h=sn[0];x.fillStyle='#fff';x.beginPath();x.arc(h.x*C+C/2+dir.x*4-dir.y*4,h.y*C+C/2+dir.y*4-dir.x*4,3,0,7);x.arc(h.x*C+C/2+dir.x*4+dir.y*4,h.y*C+C/2+dir.y*4+dir.x*4,3,0,7);x.fill()}
    fx.draw(x,dt);
  });
}

function pong(root,S){
  const L=S.level,TO=5;
  /* On a portrait phone the court stands upright: you play at the bottom, the computer at the top.
     The game always runs along x (the length, your goal at 0) and y (across); only drawing and input
     are turned. A longer court gets a proportionally faster ball, so a rally takes the same time. */
  const VL=tall(320,400,760,4),V=VL>400;
  const W=V?VL:480,H=320,PH=64,PW=10,R=7,KL=W/480,AIS=170+50*L,SERVE=(210+20*L)*KL,VMAX=600*KL;
  const st=status(root,`Tap or press Space to serve. First to ${TO} wins.`);
  const{c,x}=canvas(root,V?H:W,V?W:H);const K=pal();const k=held(S);const fx=sparks();
  let p=H/2,a=H/2,b,sc=[0,0],live=false,over=false,trail=[];
  const reset=d=>{b={x:W/2,y:H/2,vx:0,vy:0,d};trail=[]};reset(1);
  function serve(){if(over)return;if(live)return;live=true;b.vx=b.d*SERVE;b.vy=(Math.random()*2-1)*140;st(`First to ${TO} wins.`)}
  const across=e=>{const q=c.pos(e);return V?q.x:q.y};
  S.on(c,'pointerdown',e=>{p=across(e);serve()});S.on(c,'pointermove',e=>{p=across(e)});
  S.on(window,'keydown',e=>{if(e.key===' ')serve()});
  S.loop(dt=>{
    if(V){if(k.ArrowLeft||k.a)p-=380*dt;if(k.ArrowRight||k.d)p+=380*dt}else{if(k.ArrowUp||k.w)p-=380*dt;if(k.ArrowDown||k.s)p+=380*dt}p=clamp(p,PH/2,H-PH/2);
    const tgt=live&&b.vx>0?b.y:H/2;a+=clamp(tgt-a,-AIS*dt,AIS*dt);a=clamp(a,PH/2,H-PH/2);
    if(live){
      b.x+=b.vx*dt;b.y+=b.vy*dt;trail.push({x:b.x,y:b.y});if(trail.length>10)trail.shift();
      if(b.y<R){b.y=R;b.vy=Math.abs(b.vy)}if(b.y>H-R){b.y=H-R;b.vy=-Math.abs(b.vy)}
      if(b.vx<0&&b.x-R<20+PW&&b.x>14&&Math.abs(b.y-p)<PH/2+R){b.x=20+PW+R;b.vx=Math.min(VMAX,-b.vx*1.06);b.vy+=(b.y-p)*5;fx.add(b.x,b.y,K.c4,10);beep(440,60)}
      if(b.vx>0&&b.x+R>W-20-PW&&b.x<W-14&&Math.abs(b.y-a)<PH/2+R){b.x=W-20-PW-R;b.vx=-Math.min(VMAX,b.vx*1.06);b.vy+=(b.y-a)*5;fx.add(b.x,b.y,K.c1,10);beep(380,60)}
      if(b.x<-R||b.x>W+R){
        const who=b.x>W?0:1;sc[who]++;fx.add(who?0:W,b.y,who?K.c1:K.c4,30,280);live=false;reset(who===0?1:-1);
        if(sc[who]>=TO){over=true;if(who===0){st(`You won ${TO} to ${sc[1]}!`);S.next()}else{st(`Computer won ${TO} to ${sc[0]}. Press ↻ to try again.`);S.shake()}}
        else{st(who===0?'Point to you! Tap or press Space to serve.':'Point to the computer. Tap or press Space to serve.');if(who===1)S.shake();beep(who?160:880,180)}
      }
    }
    x.save();if(V)x.transform(0,-1,1,0,0,W); // upright: court x runs bottom to top, court y left to right
    x.fillStyle=K.board;x.fillRect(0,0,W,H);
    x.strokeStyle=K.line;x.lineWidth=4;x.setLineDash([10,12]);x.beginPath();x.moveTo(W/2,0);x.lineTo(W/2,H);x.stroke();x.setLineDash([]);
    if(!V){x.fillStyle=K.muted;x.font=`36px ${DISPLAY}`;x.textAlign='center';x.fillText(sc[0],W/2-60,50);x.fillText(sc[1],W/2+60,50)}
    x.fillStyle=K.c4;rr(x,20,p-PH/2,PW,PH,4);x.fill();
    x.fillStyle=K.c1;rr(x,W-20-PW,a-PH/2,PW,PH,4);x.fill();
    trail.forEach((q,i)=>{x.globalAlpha=i/trail.length*.35;x.fillStyle=K.c2;x.beginPath();x.arc(q.x,q.y,R*i/trail.length,0,7);x.fill()});x.globalAlpha=1;
    if(!over){x.fillStyle=K.ink;x.beginPath();x.arc(b.x,b.y,R,0,Math.PI*2);x.fill()}
    fx.draw(x,dt);
    x.restore();
    if(V){x.fillStyle=K.muted;x.font=`36px ${DISPLAY}`;x.textAlign='left';x.fillText(sc[1],18,W/2-22);x.fillText(sc[0],18,W/2+50)}
  });
}

function flappy(root,S){
  /* portrait phones get a taller sky; gaps roam the whole height, but each gap is picked in a window
     around the previous one (never further than the classic sky allows), so the climbs and drops between
     pipes average out and peak the same as on the classic 480px sky */
  const W=360,H=tall(360,480,820),PWd=56,GR=24,H0=480;
  const st=status(root,'');const{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();
  let bird,pipes,state,score,spawn,deadT,lvl,lastGy,t=0;
  const cloudY=()=>30+Math.random()*(H-230);
  const clouds=[...Array(Math.round(5*H/H0))].map(()=>({x:Math.random()*W,y:cloudY(),s:.6+Math.random()*.8}));
  const gapFor=l=>Math.max(108,150-(l-1)*9),speedFor=l=>150+(l-1)*14;
  function reset(){bird={x:90,y:H/2,vy:0,r:13};pipes=[];lastGy=null;state='ready';score=0;spawn=0;deadT=0;lvl=1;S.show(1);st('Tap, click, or press Space to flap. Every 8 pipes is a new level.')}
  reset();
  function flap(){if(state==='dead'){if(deadT>.5)reset();return}if(state==='ready'){state='play';st('Keep going!')}bird.vy=-320;fx.add(bird.x-8,bird.y+4,K.c2,5,90);beep(520,50)}
  function die(){if(state==='dead')return;state='dead';deadT=0;fx.add(bird.x,bird.y,K.c2,30,240);S.shake();beep(120,350,'sawtooth');const nb=best('flappy',score);st(`Crashed at level ${lvl} with ${score} points.${nb?' New best!':''} Tap to try again.`)}
  S.on(c,'pointerdown',e=>{e.preventDefault();flap()});
  S.on(window,'keydown',e=>{if(e.key===' '||e.key==='ArrowUp'){e.preventDefault();if(!e.repeat)flap()}});
  S.loop(dt=>{
    t+=dt;const sp=speedFor(lvl);
    if(state!=='dead')clouds.forEach(cl=>{cl.x-=25*cl.s*dt;if(cl.x<-60){cl.x=W+60;cl.y=cloudY()}});
    if(state==='ready')bird.y=H/2+Math.sin(t*3)*8;
    else if(state==='play'){
      bird.vy+=1100*dt;bird.y+=bird.vy*dt;spawn-=dt;
      if(spawn<=0){const G=gapFor(lvl),R=H0-GR-100-G,hi=H-GR-50-G;let gy=50+Math.random()*R;
        if(H>H0){const c0=lastGy==null?bird.y-G/2:lastGy,w=Math.min(R*1.2,hi-50),lo=clamp(c0-w/2,50,hi-w);gy=clamp(lo+Math.random()*w,c0-R,c0+R)}
        lastGy=gy;spawn=1.5*150/sp+.15;pipes.push({x:W,gy,G,passed:false})}
      for(const p of pipes){
        p.x-=sp*dt;
        if(!p.passed&&p.x+PWd<bird.x){
          p.passed=true;score++;beep(760,60);
          const nl=1+Math.floor(score/8);if(nl>lvl){lvl=nl;S.show(lvl);S.fx.toast(`Level ${lvl}`,'Tighter gaps');beep(990,200)}
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
  /* taller phones only add sky: the moving block, speeds and camera height above the base stay the same,
     the camera just starts following later (VIS floors fit under the block instead of 11) */
  const W=360,H=tall(360,540,800);const st=status(root,'');const{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();
  const BH=26,BASE=H-70,VIS=11+Math.floor((H-540)/BH),COLS=[K.c1,K.c6,K.c2,K.c3,K.c4,K.c5];
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
    if(nl>lvl){lvl=nl;S.show(lvl);S.fx.confetti(70);S.fx.toast(`Level ${lvl}`,'Faster blocks');beep(990,220)}
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
      const tc=Math.max(0,(stack.length-VIS)*BH);cam+=(tc-cam)*Math.min(1,dt*6);
    }else{
      overT+=dt;const hgt=stack.length*BH+90;const tz=Math.min(1,(H-40)/hgt);
      zoom+=(tz-zoom)*Math.min(1,dt*3);cam+=(0-cam)*Math.min(1,dt*3);
    }
    x.fillStyle=K.board;x.fillRect(0,0,W,H);
    x.globalAlpha=Math.min(.28,score*.007);x.fillStyle=K.c4;x.fillRect(0,0,W,H);x.globalAlpha=1;
    x.fillStyle=K.line;for(let i=0;i<4;i++){const cx=((i*110+t*12*(i%2?1:-1))%(W+120)+W+120)%(W+120)-60,cy=60+i*70*H/540+cam*.3%200;x.beginPath();x.arc(cx,cy,16,0,7);x.arc(cx+18,cy-7,20,0,7);x.arc(cx+38,cy,14,0,7);x.fill()}
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
  /* taller phones: the crane stays near the top (the tower top is kept at y 330), so more of the tower shows below */
  const W=360,H=tall(360,540,800);const st=status(root,'');const{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();
  const BW=76,BH=44,BASE=H-46,CX=W/2,LR=150;
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
    if(nl>lvl){lvl=nl;S.show(lvl);S.fx.confetti(70);S.fx.toast(`Level ${lvl}`,'Faster swing');beep(990,220)}
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

const BLOB_HALF=[["########","#"],["#o......","#"],["#.##.##.","#"],["#.......","."],["#.##.#.#","#"],["#....#..","."],["####.###","."],["####....","."],["#####.##","-"],["     .#G","G"],["#####.##","#"],["####....","."],["####.###","#"],["#.......","."],["#.##.##.","#"],["#o.#....","."],["##.#.#.#","#"],["#.......","."],["########","#"]];
/* portrait phones: the maze grows by pairs of hand-made rows (a pillar row + a corridor row) slotted in
   after the open corridors at rows 3, 13 and 17, so cells stay square and the layout keeps its style.
   blobMaze(p) returns the rows and R(), which maps a classic row number to the grown maze. */
const BLOB_ADD={3:[["#.#.##.#","#"],["#.#.....","."],["#.##.#.#","#"],["#....#..","."]],13:[["#.##.#.#","#"],["#.......","."],["#.#.##.#","#"],["#.#..#..","."]],17:[["#.##.#.#","#"],["#.......","."]]};
function blobMaze(p){
  const n={3:Math.min(2,Math.ceil(p/2)),13:Math.min(2,Math.floor(p/2)),17:Math.max(0,p-4)},rows=[],at=[];
  BLOB_HALF.forEach((r,i)=>{at.push(rows.length);rows.push(r);if(n[i])rows.push(...BLOB_ADD[i].slice(0,n[i]*2))});
  return{rows:rows.map(([l,c])=>l+c+l.split('').reverse().join('')),R:r=>at[r]};
}
function blobmaze(root,S){
  const T=20,NX=17,OY=26,EX=clamp(Math.floor(((tall(340,406,606,40)-OY)/T-19)/2),0,5),{rows:M,R}=blobMaze(EX),NY=M.length,W=NX*T,H=NY*T+OY;
  const st=status(root,'');const{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();
  const cell=(cx,cy)=>cy<0||cy>=NY?null:M[cy][(cx%NX+NX)%NX];
  const D={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]},DL=[[0,-1],[-1,0],[0,1],[1,0]];
  const ECOL=[K.c1,K.c5,K.c6,K.c4],CORN=[[16,0],[0,0],[16,NY-1],[0,NY-1]],PEN=R(9),EXIT=R(7),START=R(15);
  let dots,pl,en,score,lives,lvl,state,stT,fr,chain,modeT,scatter,want,t=0,jit=[0,0];
  const key=(a,b)=>a+','+b;
  function fill(){dots=new Map();M.forEach((r,yy)=>r.split('').forEach((ch,xx)=>{if(ch==='.'||ch==='o')dots.set(key(xx,yy),ch)}));dots.delete(key(8,START))}
  function place(){
    pl={tx:8,ty:START,dx:0,dy:0,t:0,door:false};want=null;fr=0;chain=0;modeT=0;scatter=true;
    const n=Math.min(4,1+lvl);
    en=[[8,EXIT],[7,PEN],[9,PEN],[8,PEN]].slice(0,n).map(([a,b],i)=>({tx:a,ty:b,dx:0,dy:0,t:0,i,state:i?'pen':'roam',wait:i*3.5,door:false}));
  }
  function reset(){score=0;lives=3;lvl=1;S.show(1);fill();place();state='ready';stT=0;st('Arrow keys, swipe, or the wheel or arrows to move. Eat every dot!')}
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
    if(!dots.size){state='clear';stT=0;lvl++;S.show(lvl);S.fx.confetti(90);S.fx.toast(`Level ${lvl}`,'Faster spikers');beep(990,250)}
  }
  function target(e){
    if(e.state==='leave')return[8,EXIT];
    if(scatter)return CORN[e.i];
    const p=pl;
    if(e.i===0)return[p.tx,p.ty];
    if(e.i===1)return[p.tx+p.dx*4,p.ty+p.dy*4];
    if(e.i===2)return[p.tx+jit[0],p.ty+jit[1]];
    return Math.hypot(p.tx-e.tx,p.ty-e.ty)>7?[p.tx,p.ty]:CORN[3];
  }
  function chooseEn(e){
    if(e.state==='leave'&&e.tx===8&&e.ty===EXIT){e.state='roam';e.door=false}
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
  onSwipe(S,root,turn,true);dpad(root,S,turn);
  reset();
  S.loop(dt=>{
    t+=dt;
    if(state==='play'){
      if(fr>0)fr=Math.max(0,fr-dt);else{modeT+=dt;if(modeT>(scatter?6:20)){modeT=0;scatter=!scatter}}
      if(Math.random()<dt/3)jit=[rand(9)-4,rand(9)-4];
      advance(pl,Math.min(8.5,6.2+.3*(lvl-1)),dt,choosePl);
      for(const e of en){
        if(e.state==='pen'){e.wait-=dt;if(e.wait<=0){e.state='leave';e.door=true}continue}
        if(e.state==='dead'){e.wait-=dt;if(e.wait<=0){e.tx=8;e.ty=PEN;e.dx=e.dy=0;e.t=0;e.state='leave';e.door=true}continue}
        const sp=e.state==='leave'?4:fr>0?3.4:Math.min(8,5.2+.45*(lvl-1));advance(e,sp,dt,chooseEn);
        const a=pos(e),b=pos(pl);let dx=Math.abs(a.x-b.x);dx=Math.min(dx,NX-dx);
        if(dx+Math.abs(a.y-b.y)<.75&&e.state==='roam'){
          if(fr>0){const pts=200*2**chain++;score+=pts;e.state='dead';e.wait=3;fx.add(a.x*T+T/2,a.y*T+T/2+OY,ECOL[e.i],24,220);S.fx.toast(`+${pts}`);beep(880,150)}
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
    x.stroke();x.fillStyle=K.c2;x.fillRect(8*T+2,R(8)*T+OY+T/2-2,T-4,4);
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
  /* portrait phones get a taller field (bricks stay at the top, more room above the paddle); the ball
     speeds up by the square root of the extra height so it neither crawls nor races across the screen */
  const W=480,H=tall(480,360,1000,4),cols=8,gap=6,m=12,bw=(W-2*m-gap*(cols-1))/cols,BS=Math.min(2,H/360),bh=14*BS,BASE=(280+25*(L-1))*Math.sqrt(H/360);
  const{c,x}=canvas(root,W,H);const K=pal();const k=held(S);const fx=sparks();
  const RC=[K.c1,K.c6,K.c2,K.c3,K.c4,K.c5,K.c1];const HPC=[null,null,K.c5,K.c4];
  let pad,ball,bricks,lives,score,stuck,over,trail=[];
  pad={x:W/2,w:Math.max(64,90-L*4),h:10,y:H-26};ball={x:0,y:0,vx:0,vy:0,r:6};bricks=[];
  for(let r=0;r<7;r++)for(let q=0;q<cols;q++){const hp=brickHP(L,r,q);if(hp)bricks.push({x:m+q*(bw+gap),y:40*BS+r*(bh+gap*BS),c:RC[r],hp,hit:0})}
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
    if(Math.max(...b)>=target(lvl)){lvl++;S.show(lvl);S.fx.confetti(90);S.fx.toast(`Level ${lvl}`,`Next goal: ${target(lvl)}`);beep(990,220)}
    st(`Score ${score}. Next goal: ${target(lvl)}.`);
    if(!canMove()){over=true;S.shake();st(`No moves left. Level ${lvl}, score ${score}. Best ${store.get('best:2048')}.`)}
  }
  S.on(window,'keydown',e=>{const d=KEYDIR[e.key];if(d){e.preventDefault();move(d)}});
  onSwipe(S,g,move);
  const a1=add(),a2=add();render([a1,a2]);
}

const MINELV=[[8,8],[9,10],[10,15],[12,24],[14,34]];
function mines(root,S){
  const [N,M]=MINELV[S.level-1];
  const st=status(root,`Clear the board without hitting any of the ${M} mines.`);
  const bar=el('div','row mbar',root,`<span class="mleft">💣 ${M}</span><button class="btn ghost mmode" aria-pressed="false">⛏️ Dig</button><span class="mtime">⏱️ 0</span>`);
  const left=$('.mleft',bar),mode=$('.mmode',bar),clock=$('.mtime',bar);
  const g=el('div','mines',root);g.style.gridTemplateColumns=`repeat(${N},1fr)`;g.style.setProperty('--n',N);g.dataset.ar=1;g.dataset.max=N*52;
  const mine=Array(N*N).fill(false),adj=Array(N*N).fill(0),open=Array(N*N).fill(false),flag=Array(N*N).fill(false);
  let started=false,over=false,flagMode=false,safe=N*N-M,flags=0,t0=0,secs=0;
  const nb=i=>{const r=i/N|0,c=i%N,o=[];for(let y=r-1;y<=r+1;y++)for(let x=c-1;x<=c+1;x++)if((y!==r||x!==c)&&y>=0&&y<N&&x>=0&&x<N)o.push(y*N+x);return o};
  const cells=[...Array(N*N)].map((_,i)=>{
    const b=el('button','mc',g);b.style.animationDelay=Math.min(i*6,400)+'ms';b.setAttribute('aria-label',`Row ${(i/N|0)+1}, column ${i%N+1}, hidden`);
    let timer=null,long=false;
    S.on(b,'pointerdown',e=>{long=false;if(e.pointerType==='mouse')return;clearTimeout(timer);timer=setTimeout(()=>{long=true;toggle(i);if(navigator.vibrate)navigator.vibrate(25)},380)});
    ['pointerup','pointerleave','pointercancel'].forEach(t=>S.on(b,t,()=>clearTimeout(timer)));
    S.on(b,'click',()=>{if(long){long=false;return}flagMode&&!open[i]?toggle(i):reveal(i)});
    S.on(b,'contextmenu',e=>{e.preventDefault();if(!long)toggle(i)});
    return b;
  });
  S.on(g,'keydown',e=>{const i=cells.indexOf(e.target);if(i>=0&&(e.key==='f'||e.key==='F')){e.preventDefault();toggle(i)}});
  S.on(mode,'click',()=>{flagMode=!flagMode;mode.textContent=flagMode?'🚩 Flag':'⛏️ Dig';mode.setAttribute('aria-pressed',flagMode);mode.classList.toggle('on',flagMode);restartAnim(mode,'bump')});
  S.every(250,()=>{if(!started||over)return;const s=Math.floor((performance.now()-t0)/1000);if(s!==secs){secs=s;clock.textContent=`⏱️ ${s}`}});
  const counter=()=>{left.textContent=`💣 ${M-flags}`};
  function plant(first){
    const ban=new Set([first,...nb(first)]);const spots=shuffle([...Array(N*N).keys()].filter(i=>!ban.has(i))).slice(0,M);
    spots.forEach(i=>{mine[i]=true;nb(i).forEach(j=>adj[j]++)});
    started=true;t0=performance.now();
  }
  function toggle(i){
    if(over||open[i])return;flag[i]=!flag[i];flags+=flag[i]?1:-1;
    const c=cells[i];c.classList.toggle('f',flag[i]);c.textContent=flag[i]?'🚩':'';
    c.setAttribute('aria-label',`Row ${(i/N|0)+1}, column ${i%N+1}, ${flag[i]?'flagged':'hidden'}`);
    if(flag[i])restartAnim(c,'plant');counter();beep(flag[i]?720:420,50);
  }
  function show(i,d){
    open[i]=true;safe--;const c=cells[i];c.classList.add('o');c.style.animationDelay=Math.min(d*28,500)+'ms';
    c.textContent=adj[i]||'';c.dataset.n=adj[i];c.setAttribute('aria-label',`Row ${(i/N|0)+1}, column ${i%N+1}, ${adj[i]?adj[i]+' nearby':'empty'}`);
  }
  function flood(start){
    const q=[[start,0]];show(start,0);let n=1;
    while(q.length){const[i,d]=q.shift();if(adj[i])continue;for(const j of nb(i))if(!open[j]&&!flag[j]&&!mine[j]){show(j,d+1);q.push([j,d+1]);n++}}
    return n;
  }
  function reveal(i){
    if(over||flag[i])return;
    if(!started)plant(i);
    if(open[i]){
      if(!adj[i])return;const around=nb(i);
      if(around.filter(j=>flag[j]).length!==adj[i])return;
      const todo=around.filter(j=>!open[j]&&!flag[j]);if(!todo.length)return;
      const hit=todo.find(j=>mine[j]);if(hit!=null){lose(hit);return}
      todo.forEach(j=>{if(!open[j])flood(j)});beep(560,60);
    }else if(mine[i]){lose(i);return}
    else{const n=flood(i);beep(n>1?620:500,n>1?90:50)}
    if(safe===0)win();
  }
  function lose(i){
    over=true;cells[i].classList.add('boom');
    mine.forEach((m,j)=>{const c=cells[j];if(m&&!flag[j]){c.classList.add('o','mine');c.textContent='💣';c.style.animationDelay=(j===i?0:120+rand(500))+'ms'}else if(!m&&flag[j])c.classList.add('x')});
    S.shake();beep(160,400,'sawtooth');st('Boom! You hit a mine. Press ↻ to try again.');
  }
  function win(){
    over=true;const t=Math.max(1,Math.round((performance.now()-t0)/1000));clock.textContent=`⏱️ ${t}`;
    mine.forEach((m,j)=>{if(m&&!flag[j]){flag[j]=true;cells[j].classList.add('f');cells[j].textContent='🚩'}});flags=M;counter();
    const rec=best('mines'+S.level,t,true);
    st(`Board cleared in ${t} second${t===1?"":"s"}!`+(rec?' New best time.':` Best: ${store.get('best:mines'+S.level)}s.`));
    S.after(400,S.next);
  }
}

const SUDLV=[40,33,28,24];
const sudOk=(g,i,v)=>{const r=i/9|0,c=i%9,br=r-r%3,bc=c-c%3;for(let k=0;k<9;k++)if(g[r*9+k]===v||g[k*9+c]===v||g[(br+(k/3|0))*9+bc+k%3]===v)return false;return true};
function sudCount(p){
  let at=-1,cs=null;
  for(let i=0;i<81;i++)if(!p[i]){const o=[];for(let v=1;v<=9;v++)if(sudOk(p,i,v))o.push(v);if(!o.length)return 0;if(!cs||o.length<cs.length){at=i;cs=o;if(o.length===1)break}}
  if(at<0)return 1;let n=0;
  for(const v of cs){p[at]=v;n+=sudCount(p);if(n>1)break}
  p[at]=0;return n;
}
function sudGen(clues){
  const sol=Array(81).fill(0);
  (function fill(i){if(i===81)return true;for(const v of shuffle([1,2,3,4,5,6,7,8,9]))if(sudOk(sol,i,v)){sol[i]=v;if(fill(i+1))return true}sol[i]=0;return false})(0);
  const p=sol.slice();let left=81;
  for(const i of shuffle([...Array(81).keys()])){if(left<=clues)break;const v=p[i];p[i]=0;if(sudCount(p)!==1)p[i]=v;else left--}
  return{p,sol};
}
function sudoku(root,S){
  const {p,sol}=sudGen(SUDLV[S.level-1]);
  const st=status(root,'Fill every row, column and box with 1 to 9.');
  const bar=el('div','row mbar',root,`<span class="smis">❌ 0/3</span><button class="btn ghost snote" aria-pressed="false">✏️ Notes</button><span class="mtime">⏱️ 0</span>`);
  const mis=$('.smis',bar),noteBtn=$('.snote',bar),clock=$('.mtime',bar);
  const g=el('div','sud',root);g.dataset.ar=1;g.dataset.max=560;
  const val=p.slice(),given=p.map(v=>v>0),notes=Array(81).fill(0),cells=Array(81);
  let sel=-1,mistakes=0,over=false,noteMode=false,secs=0;const t0=performance.now();
  for(let b=0;b<9;b++){const box=el('div','sbox',g);for(let k=0;k<9;k++){
    const r=(b/3|0)*3+(k/3|0),c=(b%3)*3+k%3,i=r*9+c;
    const e=cells[i]=el('button','sc'+(given[i]?' given':''),box);e.style.animationDelay=Math.min(i*5,400)+'ms';
    S.on(e,'click',()=>{sel=i;paint();beep(480,30)});
  }}
  const pad=el('div','spad',root);
  const keys=[1,2,3,4,5,6,7,8,9,0].map(v=>{const b=el('button','btn ghost',pad,v||'⌫');b.setAttribute('aria-label',v?'Enter '+v:'Erase');S.on(b,'click',()=>input(v));return b});
  const peer=(i,j)=>i!==j&&((i/9|0)===(j/9|0)||i%9===j%9||(((i/27|0)===(j/27|0))&&((i%9/3|0)===(j%9/3|0))));
  const name=i=>`Row ${(i/9|0)+1}, column ${i%9+1}`;
  function draw(i){
    const e=cells[i],v=val[i];e.classList.toggle('err',!!v&&v!==sol[i]);
    if(v){e.textContent=v;e.setAttribute('aria-label',`${name(i)}, ${v}`)}
    else if(notes[i]){e.innerHTML='<span class="nt">'+[1,2,3,4,5,6,7,8,9].map(n=>`<i>${notes[i]>>n&1?n:''}</i>`).join('')+'</span>';e.setAttribute('aria-label',`${name(i)}, notes`)}
    else{e.textContent='';e.setAttribute('aria-label',`${name(i)}, empty`)}
  }
  function paint(){
    const sv=sel>=0?val[sel]:0;
    cells.forEach((e,i)=>{e.classList.toggle('sel',i===sel);e.classList.toggle('peer',sel>=0&&peer(i,sel));e.classList.toggle('same',!!sv&&i!==sel&&val[i]===sv)});
    keys.forEach((b,k)=>{if(k<9)b.classList.toggle('done',val.filter((v,i)=>v===k+1&&v===sol[i]).length===9)});
  }
  function input(v){
    if(over||sel<0||given[sel]||val[sel]===sol[sel])return;
    if(!v){val[sel]=0;notes[sel]=0;draw(sel);paint();beep(300,40);return}
    if(noteMode){if(val[sel])return;notes[sel]^=1<<v;draw(sel);beep(620,30);return}
    val[sel]=v;notes[sel]=0;draw(sel);restartAnim(cells[sel],'pop');
    if(v!==sol[sel]){
      mistakes++;mis.textContent=`❌ ${mistakes}/3`;restartAnim(mis,'bump');beep(180,200,'sawtooth');
      if(mistakes>=3){over=true;S.shake();st('Three mistakes. Game over. Press ↻ for a new puzzle.')}
      else st(`${v} doesn't fit there. ${3-mistakes} ${3-mistakes===1?'mistake':'mistakes'} left.`);
    }else{
      for(let j=0;j<81;j++)if(notes[j]>>v&1&&peer(j,sel)){notes[j]&=~(1<<v);draw(j)}
      beep(660,60);
      if(val.every((x,i)=>x===sol[i]))win();
    }
    paint();
  }
  function win(){
    over=true;sel=-1;const t=Math.max(1,Math.round((performance.now()-t0)/1000));clock.textContent=`⏱️ ${fmt(t)}`;
    cells.forEach((e,i)=>{e.style.animationDelay=((i/9|0)+i%9)*30+'ms';restartAnim(e,'wave')});
    const rec=best('sudoku'+S.level,t,true);
    st(`Solved in ${fmt(t)}!`+(rec?' New best time.':` Best: ${fmt(store.get('best:sudoku'+S.level))}.`));
    S.after(600,S.next);
  }
  const fmt=s=>`${s/60|0}:${String(s%60).padStart(2,'0')}`;
  S.on(noteBtn,'click',()=>{noteMode=!noteMode;noteBtn.classList.toggle('on',noteMode);noteBtn.setAttribute('aria-pressed',noteMode);restartAnim(noteBtn,'bump')});
  S.every(250,()=>{if(over)return;const s=Math.floor((performance.now()-t0)/1000);if(s!==secs){secs=s;clock.textContent=`⏱️ ${fmt(s)}`}});
  S.on(window,'keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    const d=KEYDIR[e.key];
    if(d&&e.key.startsWith('Arrow')){e.preventDefault();if(sel<0)sel=0;else{const r=sel/9|0,c=sel%9;sel=d==='up'?((r+8)%9)*9+c:d==='down'?((r+1)%9)*9+c:d==='left'?r*9+(c+8)%9:r*9+(c+1)%9}cells[sel].focus();paint()}
    else if(/^[1-9]$/.test(e.key))input(+e.key);
    else if(e.key==='Backspace'||e.key==='Delete'||e.key==='0')input(0);
    else if(e.key==='n'||e.key==='N')noteBtn.click();
  });
  clock.textContent='⏱️ 0:00';
  cells.forEach((_,i)=>draw(i));paint();
}

function bbtan(root,S){
  /* taller phones keep the same 7x9 grid (more rows would give more rounds before the bricks land, which makes the
     game easier): the cells get up to 20% taller (CH), any height left over becomes a gap above the floor with a
     dashed line where the bricks land (DL), and the balls fly faster by VS so a round takes as long as before */
  const st=status(root,'');const W=360,H=tall(360,560,760),{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();
  const COLS=7,CW=W/COLS,TOP=34,ROWS=9,FLOOR=H-30,VS=(FLOOR-TOP)/(530-34),CH=CW*Math.min(1.2,VS),DL=TOP+ROWS*CH,R=6;
  let bricks,items,balls,nBalls,round,launchX,state,toLaunch,launchT,firstLand,gained,flightT,ang=-Math.PI/2,aiming=false,t=0;
  function reset(){bricks=[];items=[];balls=[];nBalls=1;round=0;launchX=W/2;lvl=1;S.show(1);newRound();st('Drag to aim, let go to shoot. Keep the bricks off the floor.')}
  let lvl=1;
  function newRound(){
    round++;bricks.forEach(b=>b.r++);items.forEach(i=>i.r++);items=items.filter(i=>i.r<ROWS);
    if(bricks.some(b=>b.r>=ROWS)){over();return}
    const cols=shuffle([0,1,2,3,4,5,6]),n=Math.min(6,2+rand(2+Math.min(3,round/6|0)));
    for(let k=0;k<n;k++)bricks.push({c:cols[k],r:0,hp:round>8&&Math.random()<.25?round*2:round,hit:0});
    items.push({c:cols[n],r:0});
    const nl=1+Math.floor((round-1)/10);if(nl>lvl){lvl=nl;S.show(lvl);S.fx.toast(`Round ${round}`,'Tougher bricks');beep(990,200)}
    state='aim';
  }
  function over(){state='over';const nb=best('bbtan',round);S.shake();beep(150,400,'sawtooth');st(`The bricks reached the floor on round ${round}.${nb?' New best!':''} Tap to play again.`)}
  const rect=b=>({x:b.c*CW+2,y:TOP+b.r*CH+2,w:CW-4,h:CH-4});
  function hitBrick(B){for(const b of bricks){const q=rect(b),nx=clamp(B.x,q.x,q.x+q.w),ny=clamp(B.y,q.y,q.y+q.h);if((B.x-nx)**2+(B.y-ny)**2<R*R)return b}return null}
  function damage(b){
    b.hp--;b.hit=.12;beep(380+Math.min(400,b.hp*4),25);
    if(b.hp<=0){bricks.splice(bricks.indexOf(b),1);const q=rect(b);fx.add(q.x+q.w/2,q.y+q.h/2,col(b),14,180)}
  }
  function col(b){const f=b.hp/round;return f>1.4?K.c5:f>.9?K.c1:f>.6?K.c6:f>.3?K.c2:K.c3}
  function setAim(p){const dx=p.x-launchX,dy=p.y-(FLOOR-R);if(dy>-8)return;ang=clamp(Math.atan2(dy,dx),-Math.PI+.12,-.12)}
  function fire(){if(state!=='aim')return;state='fly';toLaunch=nBalls;launchT=0;firstLand=null;gained=0;flightT=0;beep(600,60)}
  S.on(c,'pointerdown',e=>{if(state==='over'){reset();return}if(state!=='aim')return;aiming=true;try{c.setPointerCapture(e.pointerId)}catch(_){}setAim(c.pos(e))});
  S.on(c,'pointermove',e=>{if(aiming)setAim(c.pos(e))});
  S.on(c,'pointerup',()=>{if(aiming){aiming=false;fire()}});
  S.on(window,'keydown',e=>{
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();if(state==='aim'){ang=clamp(ang+(e.key==='ArrowLeft'?-.04:.04),-Math.PI+.12,-.12);aiming=false}}
    if(e.key===' '||e.key==='Enter'){e.preventDefault();if(state==='over')reset();else fire()}
  });
  reset();
  S.loop(dt=>{
    t+=dt;
    if(state==='fly'){
      flightT+=dt;const spd=540*VS*(1+Math.min(2.5,flightT/4));
      launchT-=dt;while(toLaunch>0&&launchT<=0){balls.push({x:launchX,y:FLOOR-R,vx:Math.cos(ang),vy:Math.sin(ang)});toLaunch--;launchT+=.075}
      for(const B of balls){
        let d=spd*dt;
        while(d>0&&!B.done){
          const s=Math.min(4,d);d-=s;
          B.x+=B.vx*s;if(B.x<R){B.x=R;B.vx=Math.abs(B.vx)}if(B.x>W-R){B.x=W-R;B.vx=-Math.abs(B.vx)}
          let h=hitBrick(B);if(h){B.x-=B.vx*s;B.vx=-B.vx;damage(h)}
          B.y+=B.vy*s;if(B.y<TOP+R){B.y=TOP+R;B.vy=Math.abs(B.vy)}
          h=hitBrick(B);if(h){B.y-=B.vy*s;B.vy=-B.vy;damage(h)}
          if(Math.abs(B.vy)<.1){B.vy=B.vy<0?-.1:.1;const m=Math.hypot(B.vx,B.vy);B.vx/=m;B.vy/=m}
          for(const it of items){if(it.got)continue;const ix=it.c*CW+CW/2,iy=TOP+it.r*CH+CH/2;if((B.x-ix)**2+(B.y-iy)**2<(R+11)**2){it.got=true;gained++;fx.add(ix,iy,K.c3,10,140);beep(880,50)}}
          if(B.vy>0&&B.y>=FLOOR-R){B.y=FLOOR-R;B.done=true;if(firstLand==null)firstLand=clamp(B.x,R+4,W-R-4)}
        }
      }
      items=items.filter(i=>!i.got);balls=balls.filter(b=>!b.done);
      if(!toLaunch&&!balls.length){launchX=firstLand??launchX;nBalls+=gained;if(gained)S.fx.toast(`+${gained} ball${gained>1?'s':''}`);newRound()}
    }
    x.fillStyle=K.board;x.fillRect(0,0,W,H);
    x.fillStyle=K.line;x.fillRect(0,FLOOR,W,H-FLOOR);x.fillStyle=K.edge;x.fillRect(0,FLOOR,W,3);
    x.globalAlpha=.5;x.fillStyle=K.line;x.fillRect(0,TOP-2,W,2);
    if(FLOOR-DL>45){x.strokeStyle=K.line;x.lineWidth=2;x.setLineDash([8,8]);x.beginPath();x.moveTo(0,DL);x.lineTo(W,DL);x.stroke();x.setLineDash([])}x.globalAlpha=1;
    for(const b of bricks){
      b.hit=Math.max(0,b.hit-dt);const q=rect(b),g=b.hit*14;
      x.fillStyle=col(b);rr(x,q.x-g/2,q.y-g/2,q.w+g,q.h+g,8);x.fill();x.lineWidth=2.5;x.strokeStyle=K.edge;x.stroke();
      x.fillStyle='#1E1F5C';x.font=`${b.hp>999?13:b.hp>99?15:18}px ${DISPLAY}`;x.textAlign='center';x.textBaseline='middle';x.fillText(b.hp,q.x+q.w/2,q.y+q.h/2+1);
    }
    for(const it of items){const ix=it.c*CW+CW/2,iy=TOP+it.r*CH+CH/2,p=1+Math.sin(t*6)*.08;x.strokeStyle=K.c3;x.lineWidth=4;x.beginPath();x.arc(ix,iy,11*p,0,7);x.stroke();x.fillStyle=K.c3;x.font=`11px ${DISPLAY}`;x.fillText('+1',ix,iy+1)}
    if(state==='aim'){
      x.fillStyle=K.c4;for(let i=1;i<16;i++){const d=i*22;const px=launchX+Math.cos(ang)*d,py=FLOOR-R+Math.sin(ang)*d;if(py<TOP)break;x.globalAlpha=1-i/18;x.beginPath();x.arc(px,py,3,0,7);x.fill()}x.globalAlpha=1;
    }
    x.fillStyle=K.c4;for(const B of balls){x.beginPath();x.arc(B.x,B.y,R,0,7);x.fill()}
    if(state!=='fly'||toLaunch>0){x.beginPath();x.arc(launchX,FLOOR-R,R+1,0,7);x.fill()}
    if(state==='fly'&&firstLand!=null){x.globalAlpha=.6;x.beginPath();x.arc(firstLand,FLOOR-R,R,0,7);x.fill();x.globalAlpha=1}
    fx.draw(x,dt);
    x.textBaseline='alphabetic';x.fillStyle=K.ink;x.font=`16px ${DISPLAY}`;x.textAlign='left';x.fillText(`Round ${round}`,10,23);
    x.textAlign='right';x.fillText(`● ×${nBalls+(state==='fly'?gained:0)}`,W-10,23);
    if(state==='over'){x.fillStyle='rgba(0,0,0,.35)';x.fillRect(0,0,W,H);x.fillStyle='#fff';x.font=`30px ${DISPLAY}`;x.textAlign='center';x.fillText('Game over',W/2,H/2-6);x.font=`15px ${DISPLAY}`;x.fillText('Tap to play again',W/2,H/2+24)}
  });
}

const PAPERLV=[[20,2],[30,3],[38,3],[46,4],[55,5]];
const PAPERNAMES=['You','Bolt','Pip','Mango','Zed','Kiwi'];
function paper(root,S){
  const [GOAL,NB]=PAPERLV[S.level-1];
  const st=status(root,'Swipe, use the arrow keys, or the wheel or arrows to start. Leave your land and loop back to claim more.');
  /* portrait phones: a taller view and a map with extra rows (N columns × NY rows), so the view shows the
     same share of the map as the classic 36×36 map in a 360×520 view; goals are shares of the whole map */
  const N=36,T=22,W=360,H=tall(360,520,760,40),NY=Math.round(N*H/520),A=N*NY,{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();
  const COL=[null,K.c4,K.c1,K.c6,K.c5,K.c3];let camX=0,camY=0,camInit=false;
  const shade=(hex,amt)=>{const m=hex.match(/\w\w/g);if(!m)return hex;const f=v=>{v=parseInt(v,16);return Math.round(amt<0?v*(1+amt):v+(255-v)*amt)};return`rgb(${f(m[0])},${f(m[1])},${f(m[2])})`};
  const LIGHT=COL.map(cl=>cl&&shade(cl,.45)),SIDE=COL.map(cl=>cl&&shade(cl,-.25)),TRL=COL.map(cl=>cl&&shade(cl,.15));
  const D={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]},OPP={up:'down',down:'up',left:'right',right:'left'};
  const own=new Int8Array(A),trail=new Int8Array(A);
  const units=[];let started=false,over=false,acc=0,t=0;
  const at=(x0,y0)=>y0*N+x0,inB=(x0,y0)=>x0>=0&&y0>=0&&x0<N&&y0<NY;
  function spawn(u,r){
    for(let k=0;k<400;k++){
      const pick=n=>(u.bot?r+1:Math.floor(n*.35))+rand(u.bot?n-2*r-2:Math.ceil(n*.3)),cx=pick(N),cy=pick(NY);let ok=true;
      for(let y0=cy-r-1;y0<=cy+r+1&&ok;y0++)for(let x0=cx-r-1;x0<=cx+r+1;x0++)if(!inB(x0,y0)||own[at(x0,y0)]||trail[at(x0,y0)]||units.some(v=>v.alive&&v!==u&&v.x===x0&&v.y===y0)){ok=false;break}
      if(!ok&&k<380)continue;
      for(let y0=cy-r;y0<=cy+r;y0++)for(let x0=cx-r;x0<=cx+r;x0++)own[at(x0,y0)]=u.id;
      Object.assign(u,{x:cx,y:cy,ox:cx,oy:cy,alive:true,dir:['up','down','left','right'][rand(4)],plan:[],q:[],wait:0});return;
    }
  }
  const me={id:1,bot:false};units.push(me);spawn(me,2);me.dir='right';
  for(let i=0;i<NB;i++){const b={id:i+2,bot:true};units.push(b);spawn(b,1)}
  function share(id){let n=0;for(let i=0;i<A;i++)if(own[i]===id)n++;return n/(A)*100}
  function kill(u){
    if(!u.alive)return;u.alive=false;
    for(let i=0;i<A;i++){if(trail[i]===u.id)trail[i]=0;if(u.bot&&own[i]===u.id)own[i]=0}
    fx.add(u.x*T+T/2,u.y*T+T/2,COL[u.id],26,220);
    if(u.bot){u.wait=2.5;beep(880,120);S.fx.toast('Cut!','Rival knocked out')}
    else{over=true;S.shake();beep(140,400,'sawtooth');st(`You were knocked out with ${share(1).toFixed(0)}% of the map. Press ↻ or turn to try again.`)}
  }
  function capture(u){
    for(let i=0;i<A;i++)if(trail[i]===u.id){trail[i]=0;own[i]=u.id}
    const out=new Uint8Array(A),q=[];
    const edge=[];for(let i=0;i<N;i++)edge.push(at(i,0),at(i,NY-1));for(let i=0;i<NY;i++)edge.push(at(0,i),at(N-1,i));
    for(const p of edge)if(own[p]!==u.id&&!out[p]){out[p]=1;q.push(p)}
    while(q.length){const p=q.pop(),px=p%N,py=p/N|0;for(const[dx,dy]of Object.values(D)){const nx=px+dx,ny=py+dy;if(!inB(nx,ny))continue;const n=at(nx,ny);if(!out[n]&&own[n]!==u.id){out[n]=1;q.push(n)}}}
    for(let i=0;i<A;i++)if(!out[i]&&own[i]!==u.id){own[i]=u.id;if(trail[i]&&trail[i]!==u.id){const v=units.find(w=>w.id===trail[i]);if(v)kill(v)}}
    for(const v of units)if(v.alive&&v.bot&&v!==u&&!own.includes(v.id))kill(v);
    if(!u.bot)beep(660,90);
  }
  function step(u){
    const[dx,dy]=D[u.dir],nx=u.x+dx,ny=u.y+dy;
    if(!inB(nx,ny)){kill(u);return}
    const n=at(nx,ny);
    if(trail[n]===u.id){kill(u);return}
    if(trail[n]){const v=units.find(w=>w.id===trail[n]);if(v)kill(v)}
    u.x=nx;u.y=ny;
    if(own[n]!==u.id){trail[n]=u.id}
    else if(hasTrail(u))capture(u);
  }
  const hasTrail=u=>{for(let i=0;i<A;i++)if(trail[i]===u.id)return true;return false};
  function botThink(u){
    const home=own[at(u.x,u.y)]===u.id;
    if(u.plan.length&&own.includes(u.id)){const d=u.plan[0];const[dx,dy]=D[d];const nx=u.x+dx,ny=u.y+dy;if(inB(nx,ny)&&trail[at(nx,ny)]!==u.id&&d!==OPP[u.dir]){u.dir=u.plan.shift();return}u.plan=[]}
    if(home&&!hasTrail(u)){
      for(let k=0;k<12;k++){
        const d1=['up','down','left','right'][rand(4)],d2=rand(2)?(d1==='up'||d1==='down'?'left':'up'):(d1==='up'||d1==='down'?'right':'down');
        const a=2+rand(3+S.level),b=2+rand(3+S.level),[x1,y1]=D[d1],[x2,y2]=D[d2];
        const ex=u.x+x1*a+x2*b,ey=u.y+y1*a+y2*b;if(!inB(u.x+x1*a,u.y+y1*a)||!inB(ex,ey)||d1===OPP[u.dir])continue;
        u.plan=[...Array(a).fill(d1),...Array(b).fill(d2),...Array(a).fill(OPP[d1]),...Array(b).fill(OPP[d2])];u.dir=u.plan.shift();return;
      }
    }
    // head home: step that gets closest to own land without hitting own trail or walls
    let best=null,bd=1e9;
    const cells=[];for(let i=0;i<A;i++)if(own[i]===u.id)cells.push(i);
    if(!cells.length){kill(u);return}
    for(const d of Object.keys(D)){
      if(d===OPP[u.dir])continue;const[dx,dy]=D[d],nx=u.x+dx,ny=u.y+dy;if(!inB(nx,ny)||trail[at(nx,ny)]===u.id)continue;
      let m=1e9;for(const p of cells)m=Math.min(m,Math.abs(p%N-nx)+Math.abs((p/N|0)-ny));m+=Math.random()*.5;
      if(m<bd){bd=m;best=d}
    }
    if(best)u.dir=best;
  }
  function turn(d){
    if(over){S.restart();return}
    if(!started){started=true;st('Loop back to your land to claim the area inside.')}
    const last=me.q.length?me.q[me.q.length-1]:me.dir;if(d===last||d===OPP[last])return;if(me.q.length<3)me.q.push(d);
  }
  S.on(window,'keydown',e=>{const d=KEYDIR[e.key];if(d){e.preventDefault();turn(d)}});
  onSwipe(S,root,turn,true);dpad(root,S,turn);
  S.loop(dt=>{
    t+=dt;
    if(started&&!over){
      acc+=dt;
      while(acc>=.12&&!over){
        acc-=.12;
        if(me.q.length)me.dir=me.q.shift();
        for(const u of units){
          if(!u.alive){if(u.bot&&(u.wait-=.12)<=0)spawn(u,1);continue}
          u.ox=u.x;u.oy=u.y;if(u.bot)botThink(u);step(u);if(over)break;
        }
        const p=share(1);
        if(!over&&p>=GOAL){over=true;st(`You claimed ${p.toFixed(0)}% of the map!`);best('paper'+S.level,Math.round(p));S.after(300,S.next)}
      }
    }
    const fr=started&&!over?Math.min(1,acc/.12):1,rp=u=>[(u.ox+(u.x-u.ox)*fr)*T,(u.oy+(u.y-u.oy)*fr)*T];
    const [mx0,my0]=rp(me);if(!camInit){camX=mx0;camY=my0;camInit=true}
    camX+=(mx0+T/2-camX)*Math.min(1,dt*6);camY+=(my0+T/2-camY)*Math.min(1,dt*6);
    // outside the map: striped
    x.fillStyle=K.line;x.fillRect(0,0,W,H);x.strokeStyle=K.board;x.globalAlpha=.5;x.lineWidth=6;
    const so=((camX+camY)%24+24)%24;for(let d=-H;d<W+H;d+=24){x.beginPath();x.moveTo(d-so,0);x.lineTo(d-so+H,H);x.stroke()}x.globalAlpha=1;
    x.save();x.translate(Math.round(W/2-camX),Math.round(H/2-camY));
    x.fillStyle=K.board;x.fillRect(0,0,N*T,NY*T);x.lineWidth=4;x.strokeStyle=K.edge;x.strokeRect(-2,-2,N*T+4,NY*T+4);
    const i0=Math.max(0,Math.floor((camX-W/2)/T)-1),i1=Math.min(N-1,Math.ceil((camX+W/2)/T)+1),j0=Math.max(0,Math.floor((camY-H/2)/T)-1),j1=Math.min(NY-1,Math.ceil((camY+H/2)/T)+1);
    x.fillStyle=K.line;x.globalAlpha=.45;for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)if((i+j)&1)x.fillRect(i*T,j*T,T,T);x.globalAlpha=1;
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const o=own[j*N+i];if(!o)continue;
      if(j+1>=NY||own[(j+1)*N+i]!==o){x.fillStyle=SIDE[o];x.fillRect(i*T,j*T+T,T,6)}}
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const o=own[j*N+i];if(o){x.fillStyle=LIGHT[o];x.fillRect(i*T,j*T,T+.5,T+.5)}}
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const tr=trail[j*N+i];if(tr){x.fillStyle=TRL[tr];x.globalAlpha=.75;x.fillRect(i*T+3,j*T+3,T-6,T-6);x.globalAlpha=1}}
    for(const u of units){
      if(!u.alive)continue;const[ux,uy]=rp(u),S2=T+6,dir=u.bot?u.dir:me.dir,[dx,dy]=D[dir];
      x.fillStyle='rgba(0,0,0,.18)';rr(x,ux-3,uy+2,S2,S2,7);x.fill();
      x.fillStyle=SIDE[u.id];rr(x,ux-3,uy-3+5,S2,S2,7);x.fill();
      x.fillStyle=COL[u.id];rr(x,ux-3,uy-3,S2,S2,7);x.fill();x.lineWidth=2;x.strokeStyle=K.edge;x.stroke();
      const ccx=ux+T/2,ccy=uy+T/2;
      for(const sgn of[-1,1]){const ex=ccx+dx*4+(-dy)*sgn*5,ey=ccy+dy*4+dx*sgn*5;x.fillStyle='#fff';x.beginPath();x.arc(ex,ey,4,0,7);x.fill();x.fillStyle='#1E1F5C';x.beginPath();x.arc(ex+dx*1.6,ey+dy*1.6,2,0,7);x.fill()}
      if(u.bot){x.font=`10px ${DISPLAY}`;x.textAlign='center';x.fillStyle=K.ink;x.fillText(PAPERNAMES[u.id-1],ccx,uy-8)}
    }
    fx.draw(x,dt);x.restore();
    // HUD: progress, leaderboard, minimap
    const cnt=new Array(7).fill(0);for(let i=0;i<A;i++)cnt[own[i]]++;const pct=id=>cnt[id]/(A)*100,p=pct(1);
    x.fillStyle=K.board;rr(x,10,10,170,34,10);x.fill();x.lineWidth=2.5;x.strokeStyle=K.edge;x.stroke();
    x.fillStyle=K.line;rr(x,18,30,154,8,4);x.fill();x.fillStyle=K.c4;rr(x,18,30,Math.max(8,154*Math.min(1,p/GOAL)),8,4);x.fill();
    x.fillStyle=K.ink;x.font=`12px ${DISPLAY}`;x.textAlign='left';x.fillText(`${p.toFixed(1)}%  ·  goal ${GOAL}%`,18,25);
    const rows=units.map(u=>({u,v:pct(u.id)})).sort((a2,b2)=>b2.v-a2.v);
    const lh=16,lw=104,lx0=W-lw-10;x.fillStyle=K.board;x.globalAlpha=.92;rr(x,lx0,10,lw,10+rows.length*lh,10);x.fill();x.globalAlpha=1;x.lineWidth=2.5;x.strokeStyle=K.edge;x.stroke();
    rows.forEach((r,i)=>{const y=24+i*lh;x.globalAlpha=r.u.alive?1:.4;x.fillStyle=COL[r.u.id];x.beginPath();x.arc(lx0+12,y-4,5,0,7);x.fill();x.fillStyle=K.ink;x.font=`11px ${DISPLAY}`;x.textAlign='left';x.fillText(PAPERNAMES[r.u.id-1],lx0+22,y);x.textAlign='right';x.fillText(r.v.toFixed(0)+'%',lx0+lw-8,y);x.globalAlpha=1});
    const M=78,cs=M/N,MH=NY*cs,mx2=10,my2=H-MH-10;x.fillStyle=K.board;x.globalAlpha=.92;rr(x,mx2-3,my2-3,M+6,MH+6,8);x.fill();x.globalAlpha=1;x.lineWidth=2;x.strokeStyle=K.edge;x.stroke();
    for(let i=0;i<A;i++){const o=own[i]||trail[i];if(o){x.fillStyle=COL[o];x.fillRect(mx2+(i%N)*cs,my2+(i/N|0)*cs,cs+.3,cs+.3)}}
    x.strokeStyle=K.ink;x.lineWidth=1;x.strokeRect(mx2+(camX-W/2)/T*cs,my2+(camY-H/2)/T*cs,W/T*cs,H/T*cs);
    if(!started&&!over){x.fillStyle='rgba(0,0,0,.28)';x.fillRect(0,H/2+60,W,64);x.fillStyle='#fff';x.textAlign='center';x.font=`20px ${DISPLAY}`;x.fillText('Pick a direction to start',W/2,H/2+88);x.font=`12px ${DISPLAY}`;x.fillText('Loop back to your land to claim it',W/2,H/2+110)}
  });
}

function taxi(root,S){
  /* taller phones show more road ahead; every vertical speed and distance is scaled by SC so traffic still
     takes the same time to reach the taxi and a screen holds the same amount of traffic */
  const st=status(root,'');const W=360,H=tall(360,560,820),SC=H/560,{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();const k=held(S);
  const SW=34,RL=SW,RR=W-SW,LN=4,LW=(RR-RL)/LN,PY=H-120,CW=34,CH=60;
  const laneX=l=>RL+LW*(l+.5);
  let car,traffic,fare,dest,pax,money,timeLeft,state,scroll,spawnT,lvl,el=0,t=0,deadT=0,steerX=null,flash=0;
  function reset(){car={x:laneX(1),v:0,crash:0};traffic=[];fare=null;dest=null;pax=null;money=0;timeLeft=45;state='ready';scroll=0;spawnT=0;lvl=1;el=0;S.show(1);newPax();st('Drag or use ← → to steer. Drive past a waving passenger in the outside lane to pick them up.')}
  function newPax(){const side=rand(2);pax={side,y:(-200-rand(300))*SC,wave:0}}
  reset();
  const curbLane=side=>side?LN-1:0,inCurb=side=>Math.abs(car.x-laneX(curbLane(side)))<LW*.55;
  S.on(c,'pointerdown',e=>{if(state==='over'){if(deadT>.6)reset();return}if(state==='ready')start();steerX=c.pos(e).x;try{c.setPointerCapture(e.pointerId)}catch(_){}});
  S.on(c,'pointermove',e=>{if(steerX!=null)steerX=c.pos(e).x});
  ['pointerup','pointercancel'].forEach(ev=>S.on(c,ev,()=>{steerX=null}));
  S.on(window,'keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','d'].includes(e.key)){e.preventDefault();if(state==='ready')start();if(state==='over'&&deadT>.6)reset()}});
  function start(){state='drive';st('Pick up passengers and drop them at the 🏁 before their timer runs out.')}
  function crash(o){car.crash=.8;car.v*=.25;timeLeft=Math.max(0,timeLeft-(lvl>=3?3:2));o.hit=true;o.vx=(o.x<car.x?-1:1)*160;S.shake();beep(160,250,'sawtooth');fx.add((o.x+car.x)/2,PY,K.c2,18,200);flash=.4}
  function drawCar(cx,cy,col,isTaxi,rot=0){
    x.save();x.translate(cx,cy);x.rotate(rot);
    x.fillStyle='rgba(0,0,0,.25)';rr(x,-CW/2+3,-CH/2+5,CW,CH,9);x.fill();
    x.fillStyle=col;rr(x,-CW/2,-CH/2,CW,CH,9);x.fill();x.lineWidth=2.5;x.strokeStyle=K.edge;x.stroke();
    x.fillStyle='rgba(30,31,92,.75)';rr(x,-CW/2+5,-CH/2+10,CW-10,13,4);x.fill();rr(x,-CW/2+5,CH/2-18,CW-10,9,3);x.fill();
    if(isTaxi){x.fillStyle='#1E1F5C';for(let i=0;i<4;i++)x.fillRect(-CW/2+3+i*7,-2,i%2?7:7,4);x.fillStyle='#fff';rr(x,-8,-CH/2-5,16,7,3);x.fill();x.strokeStyle=K.edge;x.lineWidth=1.5;x.stroke()}
    x.fillStyle='#FFF4C2';x.fillRect(-CW/2+4,-CH/2+1,6,3);x.fillRect(CW/2-10,-CH/2+1,6,3);
    x.restore();
  }
  function person(px,py,side,happy){
    x.save();x.translate(px,py);const wv=Math.sin(t*10)*.5;
    x.strokeStyle=K.edge;x.lineWidth=3;x.beginPath();x.moveTo(0,-4);x.lineTo(side?-10:10,-16+wv*6);x.stroke();
    x.fillStyle=happy?K.c3:K.c5;rr(x,-7,-6,14,18,5);x.fill();x.lineWidth=2;x.stroke();
    x.fillStyle='#FFD9B0';x.beginPath();x.arc(0,-12,6,0,7);x.fill();x.stroke();x.restore();
  }
  S.loop(dt=>{
    t+=dt;flash=Math.max(0,flash-dt);
    if(state==='drive'){
      el+=dt;const nl2=1+Math.floor(el/30);if(nl2>lvl){lvl=nl2;S.show(lvl);S.fx.toast(`Level ${lvl}`,lvl>=4?'Rush hour! Cars change lanes':'Heavier traffic');beep(990,200)}
      const vmax=(330+lvl*15)*SC;car.crash=Math.max(0,car.crash-dt);
      const brake=k.ArrowDown||k.s;car.v+=((brake?120*SC:vmax)-car.v)*Math.min(1,dt*(brake?3:.9));
      let tx=steerX;if(k.ArrowLeft||k.a)tx=car.x-80;if(k.ArrowRight||k.d)tx=car.x+80;
      if(tx!=null)car.x+=clamp(tx-car.x,-1,1)*Math.min(Math.abs(tx-car.x),420*dt);
      car.x=clamp(car.x,RL+CW/2+2,RR-CW/2-2);
      const dy=car.v*dt;scroll+=dy;
      timeLeft-=dt;if(fare)fare.left-=dt;
      spawnT-=dt;if(spawnT<=0){const l=rand(LN),y=-CH;if(!traffic.some(o=>o.l===l&&o.y<CH*2*SC)){traffic.push({l,x:laneX(l),y,v:Math.max(60,110+rand(110)-lvl*8)*SC,c:[K.c1,K.c4,K.c5,K.c3,K.c6][rand(5)],sw:lvl>=4&&Math.random()<Math.min(.5,(lvl-3)*.12)?1.5+Math.random()*2:0})}spawnT=Math.max(.2,1.1-lvl*.11)*(.6+Math.random()*.8)}
      for(const o of traffic){o.y+=dy-o.v*dt;if(o.sw&&!o.hit&&o.y>0&&(o.sw-=dt)<=0){const nl3=clamp(o.l+(rand(2)?1:-1),0,LN-1);if(!traffic.some(q=>q!==o&&q.l===nl3&&Math.abs(q.y-o.y)<CH*1.6*SC)){o.l=nl3;o.blink=.6}o.sw=0}
        if(!o.hit){o.blink=Math.max(0,(o.blink||0)-dt);o.x+=(laneX(o.l)-o.x)*Math.min(1,dt*3)}
        if(o.hit){o.x+=o.vx*dt;o.rot=(o.rot||0)+dt*4*Math.sign(o.vx)}
        if(!o.hit&&Math.abs(o.x-car.x)<CW-4&&Math.abs(o.y-PY)<CH-6)crash(o)}
      traffic=traffic.filter(o=>o.y<H+CH&&o.y>-CH*3&&o.x>-60&&o.x<W+60);
      if(pax){pax.y+=dy;if(!fare&&pax.y>PY-20&&pax.y<PY+30&&inCurb(pax.side)){
          const d=900+rand(1300)+lvl*120;const ft=(d/230+5)*Math.max(.55,1-(lvl-1)*.08);fare={left:ft,max:ft};dest={side:rand(2),y:PY-d*SC};pax=null;beep(880,120);S.fx.toast('Passenger in!','Head for the 🏁');
        }else if(pax&&pax.y>H+40)newPax()}
      if(dest){dest.y+=dy;
        if(dest.y>PY-30&&dest.y<PY+40&&inCurb(dest.side)){const bonus=Math.max(3,9-lvl),pay=10+lvl*2+Math.round(fare.left*2);money+=pay;timeLeft+=bonus;fx.add(car.x,PY,K.c2,30,240);beep(1100,200);S.fx.toast(`+$${pay}`,`+${bonus} seconds`);dest=null;fare=null;S.after(400,newPax)}
        else if(dest.y>H+80){dest.y-=1600*SC}
      }
      if(fare&&fare.left<=0){fare=null;dest=null;S.fx.toast('Passenger gave up','Too slow!');beep(200,200);S.after(400,newPax)}
      if(timeLeft<=0){timeLeft=0;state='over';deadT=0;const nb=best('taxi',money);S.shake();beep(140,400,'sawtooth');st(`Time's up! You earned $${money}.${nb?' New best!':''} Tap to drive again.`)}
    }else if(state==='over')deadT+=dt;
    // road
    x.fillStyle=K.line;x.fillRect(0,0,W,H);
    x.fillStyle='#4B4F86';x.fillRect(RL,0,RR-RL,H);
    x.fillStyle='#fff';x.globalAlpha=.6;const off=scroll%60;for(let l=1;l<LN;l++)for(let y=-60+off;y<H;y+=60)x.fillRect(RL+l*LW-2,y,4,30);x.globalAlpha=1;
    x.fillStyle=K.edge;x.fillRect(RL-3,0,3,H);x.fillRect(RR,0,3,H);
    const toff=scroll%90;for(let y=-90+toff;y<H;y+=90){x.fillStyle=K.c3;x.beginPath();x.arc(SW/2,y,11,0,7);x.arc(W-SW/2,y+45,11,0,7);x.fill()}
    if(dest&&dest.y>-60){const dx=dest.side?RR+SW/2:SW/2;x.fillStyle=K.c3;x.globalAlpha=.35+.2*Math.sin(t*8);x.fillRect(dest.side?RR-LW:RL,dest.y-40,LW,80);x.globalAlpha=1;x.font='30px sans-serif';x.textAlign='center';x.fillText('🏁',dx,dest.y+10)}
    if(pax&&pax.y>-40){const curb=pax.side?RR-LW:RL;x.fillStyle=K.c2;x.globalAlpha=.25+.15*Math.sin(t*8);x.fillRect(curb,pax.y-34,LW,68);x.globalAlpha=1;person(pax.side?RR+SW/2:SW/2,pax.y,pax.side,false)}
    for(const o of traffic){drawCar(o.x,o.y,o.c,false,(o.rot||0)+Math.PI);if(o.blink&&Math.floor(t*10)%2){x.fillStyle=K.c6;for(const sy2 of[-1,1]){x.beginPath();x.arc(o.x+(laneX(o.l)>o.x?1:-1)*(CW/2-2),o.y+sy2*(CH/2-6),4,0,7);x.fill()}}}
    drawCar(car.x,PY,K.c2,true,car.crash>0?Math.sin(t*40)*.15:0);
    if(fare)person(car.x,PY+2,0,true);
    fx.draw(x,dt);
    if(flash){x.fillStyle=`rgba(255,93,115,${flash*.5})`;x.fillRect(0,0,W,H)}
    // HUD
    x.fillStyle=K.board;rr(x,8,8,W-16,dest?58:36,10);x.fill();x.lineWidth=2.5;x.strokeStyle=K.edge;x.stroke();
    x.fillStyle=timeLeft<10?K.c1:K.ink;x.font=`18px ${DISPLAY}`;x.textAlign='left';x.fillText(`⏱ ${Math.ceil(timeLeft)}`,18,32);
    x.fillStyle=K.ink;x.textAlign='right';x.fillText(`$${money}`,W-18,32);
    if(dest){const m=Math.max(0,Math.round((PY-dest.y)/10/SC));x.font=`13px ${DISPLAY}`;x.textAlign='center';x.fillStyle=fare.left<5?K.c1:K.muted;x.fillText(`🏁 ${m} m ${dest.side?'→ right':'← left'} side · ${Math.ceil(fare.left)}s`,W/2,56)}
    else{x.font=`13px ${DISPLAY}`;x.textAlign='center';x.fillStyle=K.muted;x.fillText('Find a passenger',W/2,32)}
    if(state==='over'){x.fillStyle='rgba(0,0,0,.35)';x.fillRect(0,0,W,H);x.fillStyle='#fff';x.font=`30px ${DISPLAY}`;x.textAlign='center';x.fillText("Time's up",W/2,H/2-6);x.font=`16px ${DISPLAY}`;x.fillText(`$${money}`,W/2,H/2+24)}
  });
}

/* Bubble Pop levels: [size, x (0..1), direction] per ball, optional walls (x 0..1) */
const BUBLV=[
  {b:[[2,.5,1]]},{b:[[3,.3,1]]},{b:[[2,.25,1],[2,.75,-1]]},{b:[[4,.5,1]]},
  {b:[[3,.25,1],[3,.75,-1]],w:[.5]},{b:[[5,.5,1]]},{b:[[2,.12,1],[2,.37,1],[2,.63,-1],[2,.88,-1]]},
  {b:[[4,.25,1],[4,.75,-1]],w:[.5]},{b:[[3,.16,1],[3,.5,1],[3,.84,-1]],w:[.33,.67]},
  {b:[[5,.3,1],[3,.78,-1]]},{b:[[4,.18,1],[4,.5,-1],[4,.82,1]]},{b:[[5,.25,1],[5,.75,-1]],w:[.5]}
];
const BUBCOL=['#FF4D5E','#4D7CFF','#22B8A8','#FFB020','#A35CFF','#FF7A3D','#3DBA5A','#E84DB8'];
const BUBPW={double:{ico:'⚡',name:'Double harpoon',dur:12},sticky:{ico:'📌',name:'Sticky harpoon',dur:12},freeze:{ico:'⏱️',name:'Time freeze',dur:4},shield:{ico:'🛡️',name:'Shield',dur:0},dyn:{ico:'💥',name:'Dynamite',dur:0},life:{ico:'❤️',name:'Extra life',dur:0},fruit:{ico:'🍒',name:'+500',dur:0}};
function bubbles(root,S){
  /* Portrait phones get a taller room. Everything vertical is stretched by KV, the room's height over the
     desktop room's: bounce heights, gravity, harpoon and drop speeds. A bubble's bounce and a harpoon's flight
     take exactly as long as on a computer and the across-the-room layout (levels, walls, speeds) is unchanged,
     so the game plays the same, just in a taller room. The reserve is the control row under the room. */
  const fine=matchMedia('(hover:hover) and (pointer:fine)').matches,cm=store.get('ctl2')||(TOUCHDEV?'touch':'wheel');
  const st=status(root,'');const W=480,H=tall(480,360,1000,fine?54:{touch:46,wheel:138,arrows:118}[cm]||46),{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();const k=held(S);
  const FL=H-26,KV=FL/334,G=420*KV,RAD=[0,8,13,20,29,40],BH=[0,80,125,170,215,255].map(v=>v*KV),SPD=[0,85,80,75,70,65];
  let players,balls,drops,walls,pw,lvl=1,state,timeLeft,timeMax,dropsLeft,t=0,moveDir=0,clearT=0,ballCol;
  let useMouse=store.get('bubmouse')===true,two=store.get('bub2p')===true;
  const mkP=(i)=>({i,x:two?W*(i?0.7:0.3):W/2,w:26,h:34,lives:3,score:0,shots:[],face:1,walk:0,inv:0,out:false,shield:false});
  function levelDef(n){
    if(n<=BUBLV.length)return BUBLV[n-1];
    const m=n-BUBLV.length,cnt=Math.min(4,2+Math.floor(m/3)),b=[];
    const w=cnt>=3&&rand(2)?[.5]:[],cuts=[0,...w,1];
    for(let i=0;i<cnt;i++){const r=i%(cuts.length-1),lo=cuts[r],hi=cuts[r+1],n=Math.ceil((cnt-r)/(cuts.length-1)),k=Math.floor(i/(cuts.length-1));b.push([Math.min(5,4+(rand(3)===0?1:0)),lo+(hi-lo)*(k+.5)/n,i%2?-1:1])}
    return{b,w,sp:1+Math.min(.5,m*.04)};
  }
  const pops=s=>2**s-1;
  function startLevel(){
    const d=levelDef(lvl);ballCol=BUBCOL[(lvl-1)%BUBCOL.length];
    balls=d.b.map(([s,fx0,dir])=>({s,x:W*fx0,y:FL-(244-(s<3?40:0))*KV,vx:dir*SPD[s]*(d.sp||1),vy:0}));
    walls=(d.w||[]).map(f=>({x:W*f,open:0}));drops=[];
    pw={double:0,sticky:0,freeze:0};dropsLeft=lvl<4?1:2;
    timeMax=timeLeft=Math.round(18+d.b.reduce((n,[s])=>n+pops(s),0)*1.7);
    const cuts=[0,...walls.map(w=>w.x).sort((p,q)=>p-q),W],secs=[];
    for(let i=0;i+1<cuts.length;i++){const lo=cuts[i],hi=cuts[i+1],bs=balls.filter(q=>q.x>lo&&q.x<hi);if(bs.length)secs.push({lo,hi,bs})}
    const spot=(sec,avoid)=>{let best2=sec.lo+(sec.hi-sec.lo)/2,bd=-1;for(let j=0;j<=24;j++){const xx=sec.lo+22+(sec.hi-sec.lo-44)*j/24;let d=Math.min(...sec.bs.map(q=>Math.abs(q.x-xx)));if(avoid!=null)d=Math.min(d,Math.abs(avoid-xx)*.8);if(d>bd){bd=d;best2=xx}}return best2};
    players.forEach((p,i)=>{p.shots=[];p.inv=0;p.shield=false;p.walk=0});
    players[0].x=spot(secs[0]);if(two)players[1].x=spot(secs[secs.length-1],secs.length===1?players[0].x:null);
    state='ready';S.show(lvl);
  }
  function newGame(){players=[mkP(0)];if(two)players.push(mkP(1));lvl=1;startLevel();st(two?'Player 1: A D to move, W to shoot. Player 2: ← → to move, ↑ to shoot.':'Move with ← →, the wheel, or the arrows. Shoot with Space or 🔱.')}
  newGame();
  const alive=()=>players.filter(p=>!p.out);
  function fire(p){
    if(!p||p.out||state==='over'||state==='clear')return;if(state==='ready')state='play';
    const max=pw.double>0?2:1;if(p.shots.length>=max)return;
    p.shots.push({x:p.x,y:FL-p.h,stick:0});beep(760,40);
  }
  S.on(window,'keydown',e=>{
    if(e.repeat)return;const key=e.key;
    if(two){if(key==='w'||key==='W'){e.preventDefault();fire(players[0])}else if(key==='ArrowUp'||key==='Enter'){e.preventDefault();fire(players[1])}else if(key===' '){e.preventDefault();fire(players[0])}}
    else if(key===' '||key==='ArrowUp'||key==='w'||key==='W'){e.preventDefault();fire(players[0])}
    if(state==='over'&&(key===' '||key==='Enter'))newGame();
  });
  const pad=el('div','row bpad',root);
  controls(pad,S,{axis:'x',onMove:v=>{moveDir=v;if(v&&state==='ready')state='play'}});
  const fb=el('button','btn bfire',pad,'🔱');fb.setAttribute('aria-label','Shoot');S.on(fb,'pointerdown',e=>{e.preventDefault();restartAnim(fb,'hit');if(state==='over'){newGame();return}fire(players[0])});
  let mx=null;
  const opts=el('div','row bmouse',root,'<button class="btn ghost bm" aria-pressed="false"></button><button class="btn ghost b2" aria-pressed="false"></button>');
  const mbtn=$('.bm',opts),pbtn=$('.b2',opts);
  const paint=()=>{mbtn.textContent=`🖱️ Mouse: ${useMouse?'On':'Off'}`;mbtn.classList.toggle('on',useMouse);mbtn.setAttribute('aria-pressed',useMouse);pbtn.textContent=`👥 2 Players: ${two?'On':'Off'}`;pbtn.classList.toggle('on',two);pbtn.setAttribute('aria-pressed',two)};paint();
  S.on(mbtn,'click',()=>{useMouse=!useMouse;store.set('bubmouse',useMouse);mx=null;paint();mbtn.blur()});
  S.on(pbtn,'click',()=>{two=!two;store.set('bub2p',two);paint();pbtn.blur();newGame()});
  S.on(c,'pointermove',e=>{if(e.pointerType==='mouse'&&useMouse)mx=c.pos(e).x});
  S.on(c,'pointerdown',e=>{if(state==='over'){newGame();return}if(e.pointerType!=='mouse'||useMouse)mx=c.pos(e).x;fire(players[0])});
  S.on(c,'pointerleave',e=>{if(e.pointerType!=='mouse')mx=null});
  function region(xp){let lo=0,hi=W;for(const w of walls){if(w.open)continue;if(w.x<=xp)lo=Math.max(lo,w.x);else hi=Math.min(hi,w.x)}return[lo,hi]}
  function award(p,pts){if(p)p.score+=pts}
  function pop(b,p){
    balls.splice(balls.indexOf(b),1);award(p,50*(6-b.s));fx.add(b.x,b.y,ballCol,16+b.s*2,200);beep(820-b.s*70,70);
    if(b.s>1)for(const d of[-1,1])balls.push({s:b.s-1,x:b.x+d*4,y:b.y,vx:d*SPD[b.s-1]*(levelDef(lvl).sp||1),vy:-Math.sqrt(2*G*BH[b.s-1])*.7});
    if(balls.length&&dropsLeft>0&&Math.random()<.13){
      dropsLeft--;const r=Math.random(),type=r<.07?'life':r<.27?'double':r<.45?'sticky':r<.6?'freeze':r<.74?'shield':r<.84?'dyn':'fruit';
      drops.push({type,x:b.x,y:b.y,vy:-100*KV,life:7});
    }
    if(!balls.length){
      state='clear';clearT=0;const bonus=Math.ceil(timeLeft)*10;alive().forEach(q=>award(q,Math.round(bonus/alive().length)));
      FX.confetti(70);beep(990,200);st(`Level ${lvl} clear! Time bonus +${bonus}.`);
    }
  }
  function collect(d,p){
    const P=BUBPW[d.type];beep(1040,90);setTimeout(()=>beep(1320,90),90);fx.add(d.x,d.y,K.c2,18,180);S.fx.toast(`${P.ico} ${P.name}`);
    if(d.type==='life')p.lives=Math.min(6,p.lives+1);else if(d.type==='shield')p.shield=true;else if(d.type==='fruit')award(p,500);
    else if(d.type==='dyn'){const big=balls.filter(b=>b.s>1);for(const b of big){let q=[b];balls.splice(balls.indexOf(b),1);while(q.some(z=>z.s>1)){const z=q.find(z=>z.s>1);q.splice(q.indexOf(z),1);for(const dd of[-1,1])q.push({s:z.s-1,x:z.x+dd*(z.s*6),y:z.y,vx:dd*SPD[z.s-1],vy:-200*KV})}const[lo,hi]=region(b.x);q.forEach(z=>{z.x=clamp(z.x,lo+RAD[z.s]+5,hi-RAD[z.s]-5)});balls.push(...q);fx.add(b.x,b.y,ballCol,30,260)}beep(140,300,'square')}
    else pw[d.type]=P.dur;
  }
  function hurt(p){
    if(p.shield){p.shield=false;p.inv=1.5;beep(400,200);fx.add(p.x,FL-p.h/2,K.c3,24,220);S.fx.toast('🛡️ Shield saved you');return}
    p.lives--;S.shake();beep(150,300,'sawtooth');fx.add(p.x,FL-p.h/2,K.c4,24,220);
    if(p.lives<=0)p.out=true;
    if(!alive().length){state='over';const top=Math.max(...players.map(q=>q.score));const nb=best('bubbles',top);
      st(two?`Game over on level ${lvl}. ${players[0].score>players[1].score?'Player 1':players[1].score>players[0].score?'Player 2':'Nobody'} wins with ${top}! Press ↻ or Space to play again.`:`Out of lives on level ${lvl}. Score ${top}.${nb?' New best!':''} Press ↻ to play again.`);return}
    const keepScore=players.map(q=>[q.score,q.lives,q.out]);startLevel();players.forEach((q,i)=>{[q.score,q.lives,q.out]=keepScore[i]});
    st(`Ouch! ${two?`P${p.i+1} has `:''}${p.lives} ${p.lives===1?'life':'lives'} left. Shoot to retry level ${lvl}.`);
  }
  function hero(p){
    const px=p.x,py=FL,E=K.edge,sw=p.walk?Math.sin(p.walk):0,bob=p.walk?Math.abs(Math.cos(p.walk))*1.5:0,f=p.face,shirt=p.i?K.c3:K.c4,cap=p.i?K.c6:K.c1;
    if(p.out){x.globalAlpha=.25}
    x.lineWidth=2;x.strokeStyle=E;x.lineJoin='round';
    x.fillStyle='rgba(0,0,0,.16)';x.beginPath();x.ellipse(px,py-1,13,3.5,0,0,7);x.fill();
    for(const[s2,o]of[[-1,sw],[1,-sw]]){const lx=px+s2*5+o*3;x.fillStyle='#3B3F7A';rr(x,lx-3,py-12,6,10,2);x.fill();x.fillStyle='#1E1F5C';rr(x,lx-4+f*1.5,py-4,9,4,2);x.fill()}
    const top=py-36-bob;
    x.fillStyle='#8A8FB8';rr(x,px+f*9-2.5,top+8,5,16,2);x.fill();x.stroke();x.fillStyle=K.c2;rr(x,px+f*9-3.5,top+5,7,5,2);x.fill();x.stroke();
    x.fillStyle=shirt;rr(x,px-9,top+16,18,15,6);x.fill();x.stroke();
    x.fillStyle=K.c2;x.fillRect(px-8,top+26,16,3);
    x.fillStyle='#fff';x.beginPath();x.moveTo(px-3,top+16);x.lineTo(px,top+20);x.lineTo(px+3,top+16);x.fill();
    x.fillStyle='#FFD9B0';x.beginPath();x.arc(px+f*9,top+20,3,0,7);x.fill();x.stroke();
    x.strokeStyle=shirt;x.lineWidth=4;x.lineCap='round';x.beginPath();x.moveTo(px-f*8,top+19);x.lineTo(px-f*10,top+26+sw*2);x.stroke();x.lineCap='butt';
    x.strokeStyle=E;x.lineWidth=2;x.fillStyle='#FFD9B0';x.beginPath();x.arc(px-f*10,top+27+sw*2,2.6,0,7);x.fill();x.stroke();
    x.fillStyle='#FFD9B0';x.beginPath();x.arc(px,top+8,10,0,7);x.fill();x.stroke();
    x.fillStyle=p.i?'#2E2A26':'#6B3E2E';x.beginPath();x.arc(px,top+6,10,Math.PI*1.05,Math.PI*1.95);x.quadraticCurveTo(px+f*4,top-1,px-f*9,top+5);x.fill();
    x.fillStyle=cap;x.beginPath();x.ellipse(px,top-1,10.5,4,0,Math.PI,0);x.fill();x.stroke();x.fillRect(px+(f>0?2:-12),top-2,10,3);
    x.fillStyle='#fff';x.beginPath();x.ellipse(px-3.5+f*1.5,top+8,2.6,3,0,0,7);x.ellipse(px+3.5+f*1.5,top+8,2.6,3,0,0,7);x.fill();
    x.fillStyle='#1E1F5C';x.beginPath();x.arc(px-3.5+f*2.3,top+8.5,1.5,0,7);x.arc(px+3.5+f*2.3,top+8.5,1.5,0,7);x.fill();
    x.fillStyle='rgba(255,110,130,.45)';x.beginPath();x.arc(px-6,top+12,2,0,7);x.arc(px+6,top+12,2,0,7);x.fill();
    x.strokeStyle=E;x.lineWidth=1.5;x.beginPath();x.arc(px+f,top+12,2.6,.2,Math.PI-.2);x.stroke();
    if(p.shield){x.strokeStyle=K.c3;x.globalAlpha=(p.out?.25:1)*(.6+.25*Math.sin(t*6));x.lineWidth=3;x.beginPath();x.ellipse(px,py-p.h/2,p.w*.95,p.h*.75,0,0,7);x.stroke()}
    x.globalAlpha=1;
    if(two){x.font=`10px ${DISPLAY}`;x.textAlign='center';x.fillStyle=shirt;x.fillText(`P${p.i+1}`,px,top-8)}
  }
  function harpoon(sh,p){
    const sx=sh.x,sy=sh.y,by=FL-p.h-6,stuck=sh.stick>0,g=x.createLinearGradient(0,by,0,sy);
    g.addColorStop(0,'rgba(91,108,255,.15)');g.addColorStop(1,stuck?'rgba(255,197,61,.7)':'rgba(91,108,255,.55)');
    x.lineCap='round';x.strokeStyle=g;x.lineWidth=9;x.beginPath();x.moveTo(sx,by);x.lineTo(sx,sy+10);x.stroke();
    x.strokeStyle='#fff';x.lineWidth=3;x.beginPath();x.moveTo(sx,by);x.lineTo(sx,sy+10);x.stroke();
    x.strokeStyle=stuck?K.c6:K.c4;x.lineWidth=1.5;x.setLineDash([3,6]);x.lineDashOffset=-t*60;x.beginPath();x.moveTo(sx,by);x.lineTo(sx,sy+10);x.stroke();x.setLineDash([]);
    x.save();x.translate(sx,sy);x.shadowColor=cssv('--c2');x.shadowBlur=12;
    x.fillStyle=K.c2;x.beginPath();x.moveTo(0,-12);x.lineTo(7,4);x.lineTo(2,2);x.lineTo(2,12);x.lineTo(-2,12);x.lineTo(-2,2);x.lineTo(-7,4);x.closePath();x.fill();
    x.shadowBlur=0;x.lineWidth=1.8;x.strokeStyle=K.edge;x.lineJoin='round';x.stroke();x.restore();x.lineCap='butt';
  }
  function drawBall(b){
    const r=RAD[b.s],g=x.createRadialGradient(b.x-r*.35,b.y-r*.4,r*.1,b.x,b.y,r);
    g.addColorStop(0,'#fff');g.addColorStop(.18,ballCol);g.addColorStop(1,shade(ballCol,-.35));
    x.fillStyle='rgba(0,0,0,.12)';x.beginPath();x.ellipse(b.x,FL+2,r*.8*(1-(FL-b.y)/(500*KV)),3,0,0,7);x.fill();
    x.fillStyle=g;x.beginPath();x.arc(b.x,b.y,r,0,7);x.fill();x.lineWidth=2;x.strokeStyle=pw.freeze>0?'#7CC8FF':'rgba(30,31,92,.85)';x.stroke();
    x.fillStyle='rgba(255,255,255,.7)';x.beginPath();x.ellipse(b.x-r*.38,b.y-r*.45,r*.28,r*.16,-.6,0,7);x.fill();
  }
  function shade(hex,amt){const n=parseInt(hex.slice(1),16);let r=n>>16,g=n>>8&255,b2=n&255;const f=v=>Math.round(amt<0?v*(1+amt):v+(255-v)*amt);return`rgb(${f(r)},${f(g)},${f(b2)})`}
  S.loop(dt=>{
    t+=dt;
    if(state==='play'){
      timeLeft-=dt;
      pw.double=Math.max(0,pw.double-dt);pw.sticky=Math.max(0,pw.sticky-dt);pw.freeze=Math.max(0,pw.freeze-dt);
      const shut=walls.filter(w=>!w.open).sort((p,q)=>p.x-q.x);
      shut.forEach((w,i)=>{const lo=i?shut[i-1].x:0,hi=i<shut.length-1?shut[i+1].x:W;
        if(!balls.some(b=>b.x>lo&&b.x<w.x)||!balls.some(b=>b.x>w.x&&b.x<hi)){w.open=.001;beep(600,120);S.fx.toast('Wall opened')}});
      for(const w of walls)if(w.open)w.open=Math.min(1,w.open+dt*2);
      players.forEach((p,i)=>{
        p.inv=Math.max(0,p.inv-dt);if(p.out)return;
        let dir=0;
        if(two){if(i===0){if(k.a||k.A)dir=-1;if(k.d||k.D)dir=1;if(moveDir)dir=moveDir}else{if(k.ArrowLeft)dir=-1;if(k.ArrowRight)dir=1}}
        else{dir=moveDir;if(k.ArrowLeft||k.a||k.A)dir=-1;if(k.ArrowRight||k.d||k.D)dir=1}
        const ox=p.x;
        if(dir){p.x+=dir*230*dt;if(i===0)mx=null}else if(i===0&&mx!=null){if(Math.abs(mx-p.x)>4)p.x+=Math.sign(mx-p.x)*Math.min(Math.abs(mx-p.x),230*dt);else mx=null}
        const[lo,hi]=region(ox);p.x=clamp(p.x,lo+p.w/2,hi-p.w/2);
        if(Math.abs(p.x-ox)>.1){p.face=Math.sign(p.x-ox);p.walk+=dt*14}else p.walk=0;
        for(const sh of p.shots){if(sh.stick>0){sh.stick-=dt}else{sh.y-=560*KV*dt;if(sh.y<=12){if(pw.sticky>0){sh.y=12;sh.stick=4}else sh.dead=true}}if(sh.stick<0)sh.dead=true}
        p.shots=p.shots.filter(sh=>!sh.dead);
      });
      for(const d of drops){d.vy+=500*KV*dt;d.y=Math.min(FL-12,d.y+d.vy*dt);d.life-=dt;const p=alive().find(p=>Math.abs(d.x-p.x)<p.w/2+12&&d.y>FL-p.h-12);if(p){d.got=true;collect(d,p)}}
      drops=drops.filter(d=>!d.got&&d.life>0);
      const bt=pw.freeze>0?0:dt;
      outer:for(const b of balls.slice()){
        if(!balls.includes(b))continue;
        b.vy+=G*bt;b.x+=b.vx*bt;b.y+=b.vy*bt;const r=RAD[b.s];
        if(b.x<r){b.x=r;b.vx=Math.abs(b.vx)}if(b.x>W-r){b.x=W-r;b.vx=-Math.abs(b.vx)}
        for(const w of walls){if(w.open)continue;if(b.x<w.x&&b.x+r>w.x-4){b.x=w.x-4-r;b.vx=-Math.abs(b.vx)}else if(b.x>w.x&&b.x-r<w.x+4){b.x=w.x+4+r;b.vx=Math.abs(b.vx)}}
        if(b.y>FL-r){b.y=FL-r;b.vy=-Math.sqrt(2*G*BH[b.s])}
        if(b.y<r){b.y=r;b.vy=Math.abs(b.vy)}
        for(const p of players)for(const sh of p.shots)if(!sh.dead&&Math.abs(b.x-sh.x)<r+2&&b.y+r>sh.y-12&&b.y-r<FL-p.h){sh.dead=sh.stick<=0;pop(b,p);if(state!=='play')break outer;continue outer}
        for(const p of alive()){
          const cx=clamp(b.x,p.x-p.w/2,p.x+p.w/2),cy=clamp(b.y,FL-p.h,FL);
          if(!p.inv&&(b.x-cx)**2+(b.y-cy)**2<r*r*.8){hurt(p);break outer}
        }
      }
      players.forEach(p=>p.shots=p.shots.filter(sh=>!sh.dead));
      if(state==='play'&&timeLeft<=0){timeLeft=0;S.fx.toast("⏰ Time's up!");const victims=alive();victims.forEach(p=>{p.shield=false});if(victims.length)hurt(victims[0])}
    }else if(state==='clear'){clearT+=dt;if(clearT>1.8){lvl++;const kp=players.map(q=>[q.score,q.lives,q.out]);startLevel();players.forEach((q,i)=>{[q.score,q.lives,q.out]=kp[i]});if(lvl%5===1)players.forEach(q=>{if(!q.out){q.lives=Math.min(6,q.lives+1)}});S.fx.toast(`Level ${lvl}`,lvl%5===1?'Bonus life! ❤️':`${balls.length} bubble${balls.length>1?'s':''}`);st(`Level ${lvl}. Shoot to start.`)}}
    // background: soft brick wall
    x.fillStyle=K.board;x.fillRect(0,0,W,H);
    x.strokeStyle=K.line;x.globalAlpha=.55;x.lineWidth=1;
    for(let row=0,y=0;y<FL;row++,y+=22){x.beginPath();x.moveTo(0,y);x.lineTo(W,y);x.stroke();for(let xx=(row%2)*24;xx<W;xx+=48){x.beginPath();x.moveTo(xx,y);x.lineTo(xx,y+22);x.stroke()}}
    x.globalAlpha=1;
    if(pw.freeze>0){x.fillStyle='rgba(120,200,255,.16)';x.fillRect(0,0,W,FL)}
    x.fillStyle=K.line;x.fillRect(0,FL,W,H-FL);x.fillStyle=K.edge;x.fillRect(0,FL,W,3);
    for(const w of walls){const hgt=FL*(1-w.open);if(hgt<=1)continue;x.fillStyle=K.muted;rr(x,w.x-4,FL-hgt,8,hgt,3);x.fill();x.strokeStyle=K.edge;x.lineWidth=2;x.stroke()}
    players.forEach(p=>p.shots.forEach(sh=>harpoon(sh,p)));
    for(const b of balls)drawBall(b);
    x.textAlign='center';x.textBaseline='middle';
    for(const d of drops){if(d.life<2&&Math.floor(t*8)%2)continue;const bob=d.y>=FL-12?Math.sin(t*5)*2:0;x.fillStyle='#fff';x.beginPath();x.arc(d.x,d.y+bob,12,0,7);x.fill();x.lineWidth=2.5;x.strokeStyle=K.c2;x.stroke();x.font='14px sans-serif';x.fillStyle='#000';x.fillText(BUBPW[d.type].ico,d.x,d.y+bob+1)}
    x.textBaseline='alphabetic';
    players.forEach(p=>{if(!(p.inv&&Math.floor(t*12)%2))hero(p)});
    fx.draw(x,dt);
    // time bar
    const tf=Math.max(0,timeLeft/timeMax);x.fillStyle=K.edge;x.globalAlpha=.15;rr(x,10,FL+9,W-20,9,4);x.fill();x.globalAlpha=1;
    x.fillStyle=tf<.2?K.c1:tf<.45?K.c6:K.c3;rr(x,10,FL+9,Math.max(9,(W-20)*tf),9,4);x.fill();
    // HUD
    x.font=`15px ${DISPLAY}`;x.textAlign='left';x.fillStyle=K.ink;
    const p1=players[0];x.fillText(`${two?'P1 ':''}${p1.score}`,12,24);x.fillStyle=K.c1;x.font='13px sans-serif';x.fillText('♥'.repeat(Math.max(0,p1.lives)),12,42);
    if(two){const p2=players[1];x.font=`15px ${DISPLAY}`;x.textAlign='right';x.fillStyle=K.ink;x.fillText(`P2 ${p2.score}`,W-12,24);x.fillStyle=K.c1;x.font='13px sans-serif';x.fillText('♥'.repeat(Math.max(0,p2.lives)),W-12,42)}
    else{x.font=`15px ${DISPLAY}`;x.textAlign='right';x.fillStyle=K.muted;x.fillText(`Level ${lvl}`,W-12,24)}
    const act=[pw.double>0&&`⚡${Math.ceil(pw.double)}`,pw.sticky>0&&`📌${Math.ceil(pw.sticky)}`,pw.freeze>0&&`⏱️${Math.ceil(pw.freeze)}`].filter(Boolean);
    if(act.length){x.font=`13px ${DISPLAY}`;x.textAlign='center';x.fillStyle=K.ink;x.fillText(act.join('   '),W/2,24)}
    if(state==='ready'){x.fillStyle=K.ink;x.font=`22px ${DISPLAY}`;x.textAlign='center';x.fillText(`Level ${lvl}`,W/2,H/2-10);x.fillStyle=K.muted;x.font=`14px ${DISPLAY}`;x.fillText('Shoot to start',W/2,H/2+14)}
    if(state==='over'){x.fillStyle='rgba(0,0,0,.35)';x.fillRect(0,0,W,H);x.fillStyle='#fff';x.font=`30px ${DISPLAY}`;x.textAlign='center';x.fillText('Game over',W/2,H/2-6);x.font=`14px ${DISPLAY}`;x.fillText('Shoot or press ↻ to play again',W/2,H/2+22)}
  });
}

function helix(root,S){
  const st=status(root,'Drag sideways or use ← → to spin the tower. Drop through the gaps and avoid red.');
  const W=360,H=tall(360,560,820),{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();const k=held(S);
  const CX=W/2,RX=128,RY=40,IR=24,GAPY=96,SEG=12,SA=Math.PI*2/SEG,BR=9,BRAD=(IR+RX)/2+6;
  const plats=[];let made=0,score=0,lvl=1;S.show(1);
  function addRing(){
    const i=made++,segs=Array(SEG).fill('safe'),hard=Math.min(1,i/120);
    const g=rand(SEG),gw=i>60&&Math.random()<hard?1:2;for(let j=0;j<gw;j++)segs[(g+j)%SEG]='gap';
    const nd=i===0?0:Math.min(6,rand(1+Math.floor(i/10))+(i>20?1:0));
    for(let j=0;j<nd;j++){const p=(g+gw+1+rand(SEG-gw-2))%SEG;if(segs[p]==='safe')segs[p]='red'}
    if(i>30&&Math.random()<hard*.6){const g2=(g+6)%SEG;if(segs[g2]==='safe')segs[g2]='gap'}
    plats.push({y:i*GAPY,segs,off:i===0?0:Math.random()*Math.PI*2,col:i%10});
  }
  for(let i=0;i<14;i++)addRing();
  let rot=0,ball={y:-70,vy:0},cam=-200,state='play',streak=0,passed=0,dragX=null,t=0,squish=0,ceil=-1e9;
  const segAt=(p,a)=>{let r=((a-p.off-rot)%(Math.PI*2)+Math.PI*4)%(Math.PI*2);return Math.floor(r/SA)};
  const FRONT=Math.PI/2;
  while(plats[0].segs[segAt(plats[0],FRONT)]!=='safe')plats[0].off+=SA;
  S.on(c,'pointerdown',e=>{if(state==='over'){S.restart();return}dragX=c.pos(e).x;try{c.setPointerCapture(e.pointerId)}catch(_){}});
  S.on(c,'pointermove',e=>{if(dragX==null)return;const nx=c.pos(e).x;rot+=(nx-dragX)*.012;dragX=nx});
  ['pointerup','pointercancel'].forEach(ev=>S.on(c,ev,()=>{dragX=null}));
  function ringUp(){const nl=1+Math.floor(passed/10);if(nl>lvl){lvl=nl;S.show(lvl);S.fx.toast(`Level ${lvl}`,'More red, fewer gaps');beep(990,160)}}
  function die(){state='over';S.shake();beep(140,400,'sawtooth');fx.add(CX,ball.y-cam,K.c1,30,240);const nb=best('helix',score);st(`Splat! ${passed} rings, ${score} points.${nb?' New best!':''} Tap or press ↻ to play again.`)}
  function seg(p,i,yy,front){
    const a0=p.off+rot+i*SA+.02,a1=a0+SA-.04,ty=p.segs[i];if(ty==='gap')return;
    const m=(a0+a1)/2;if((Math.sin(m)>0)!==front)return;
    const pts=[];for(let j=0;j<=6;j++){const a=a0+(a1-a0)*j/6;pts.push([CX+RX*Math.cos(a),yy+RY*Math.sin(a)])}
    for(let j=6;j>=0;j--){const a=a0+(a1-a0)*j/6;pts.push([CX+IR*Math.cos(a),yy+IR*RY/RX*Math.sin(a)])}
    const colr=ty==='red'?K.c1:[K.c4,K.c4,K.c5,K.c5,K.c3,K.c3,K.c6,K.c6,K.c4,K.c5][p.col];
    if(front){x.fillStyle=K.edge;x.beginPath();for(let j=0;j<=6;j++){const[a,b]=pts[j];j?x.lineTo(a,b+12):x.moveTo(a,b+12)}for(let j=6;j>=0;j--){const[a,b]=pts[j];x.lineTo(a,b)}x.fill()}
    x.fillStyle=colr;x.beginPath();pts.forEach(([a,b],j)=>j?x.lineTo(a,b):x.moveTo(a,b));x.closePath();x.fill();
    x.fillStyle='rgba(255,255,255,.18)';if(ty!=='red'&&i%2)x.fill();
  }
  S.loop(dt=>{
    t+=dt;squish=Math.max(0,squish-dt);
    if(k.ArrowLeft||k.a)rot-=3*dt;if(k.ArrowRight||k.d)rot+=3*dt;
    if(state==='play'){
      const prevY=ball.y;ball.vy+=1500*dt;ball.y+=ball.vy*dt;
      if(ball.y-BR<ceil){ball.y=ceil+BR;ball.vy=Math.max(0,ball.vy)}
      while(plats[plats.length-1].y<ball.y+H*1.5)addRing();
      while(plats.length>30&&plats[0].y<ceil-GAPY*3)plats.shift();
      for(const p of plats){
        if(p.broken||p.y<=ceil||!(prevY<=p.y-BR&&ball.y>p.y-BR))continue;
        const sg=p.segs[segAt(p,FRONT)];
        if(sg==='gap'){passed++;streak++;score+=streak;ceil=p.y+2;beep(500+Math.min(streak,8)*80,40);ringUp();continue}
        if(streak>=3){p.broken=true;passed++;score+=5+streak;streak=0;ceil=p.y+2;ringUp();fx.add(CX,p.y-cam,K.c4,30,260);beep(900,120);S.fx.toast('Smash!');continue}
        if(sg==='red'){ball.y=p.y-BR;die();break}
        ball.y=p.y-BR;ball.vy=-470;streak=0;squish=.12;beep(330,40);fx.add(CX,p.y-cam,K.c2,5,80);break;
      }
    }
    cam=Math.max(cam,cam+((ball.y-H*.4)-cam)*Math.min(1,dt*6));
    x.fillStyle=K.board;x.fillRect(0,0,W,H);
    const vis=plats.filter(p=>!p.broken&&p.y-cam>-60&&p.y-cam<H+60).sort((a,b)=>b.y-a.y);
    x.fillStyle=K.line;x.fillRect(CX-IR+1,0,IR*2-2,H);
    for(let i=0;i<vis.length;i++){
      const p=vis[i],yy=p.y-cam;
      for(let s=0;s<SEG;s++)seg(p,s,yy,false);
      x.fillStyle=K.line;x.fillRect(CX-IR+1,yy-GAPY,IR*2-2,GAPY);x.fillStyle=K.edge;x.globalAlpha=.12;x.fillRect(CX-IR+1,yy-GAPY,6,GAPY);x.globalAlpha=1;
      for(let s=0;s<SEG;s++)seg(p,s,yy,true);
      if(ball.y<=p.y&&(i===vis.length-1||ball.y>vis[i+1].y))drawBall();
    }
    if(!vis.some(p=>ball.y<=p.y))drawBall();
    function drawBall(){
      if(state==='over'){x.fillStyle=K.c2;x.beginPath();x.ellipse(CX,ball.y-cam+RY*BRAD/RX+BR*.6,BR*1.8,BR*.5,0,0,7);x.fill();return}
      const bx=CX,by=ball.y-cam+RY*BRAD/RX,sq=squish*3;
      x.fillStyle=K.c2;x.beginPath();x.ellipse(bx,by+BR*sq*.3,BR*(1+sq*.5),BR*(1-sq*.4),0,0,7);x.fill();x.lineWidth=2.5;x.strokeStyle=K.edge;x.stroke();
    }
    fx.draw(x,dt);
    x.textAlign='center';x.lineJoin='round';x.strokeStyle=K.board;x.font=`40px ${DISPLAY}`;x.lineWidth=7;x.strokeText(score,W/2,52);x.fillStyle=K.ink;x.fillText(score,W/2,52);
    x.font=`13px ${DISPLAY}`;x.lineWidth=4;const bt=`Best ${Math.max(score,store.get('best:helix')||0)}`;x.strokeText(bt,W/2,72);x.fillStyle=K.muted;x.fillText(bt,W/2,72);
    if(streak>=2&&state==='play'){x.font=`16px ${DISPLAY}`;x.lineWidth=4;x.strokeText(`Combo ×${streak}`,W/2,94);x.fillStyle=K.c6;x.fillText(`Combo ×${streak}`,W/2,94)}
    if(state==='over'){x.fillStyle='rgba(0,0,0,.35)';x.fillRect(0,0,W,H);x.fillStyle='#fff';x.font=`30px ${DISPLAY}`;x.fillText('Splat!',W/2,H/2-6);x.font=`14px ${DISPLAY}`;x.fillText('Tap to play again',W/2,H/2+22)}
  });
}

function solitaire(root,S){
  const DRAW=S.level===2?3:1,SU=['♠','♥','♦','♣'],RK=['','A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const st=status(root,'Tap a card to move it. Build the four piles from Ace to King.');
  const bar=el('div','row mbar',root,`<span class="smoves">Moves 0</span><button class="btn ghost sundo">↶ Undo</button><span class="mtime">⏱️ 0:00</span>`);
  const mv=$('.smoves',bar),undoB=$('.sundo',bar),clock=$('.mtime',bar);
  const g=el('div','sol',root);g.dataset.ar=100/140;g.dataset.max=620;
  const CWd=12.8,CHt=17.9,GP=(100-7*CWd)/8,colX=i=>GP+i*(CWd+GP),TY=1.5,BY=TY+CHt+3,BOT=138.5;
  const cards=[];for(let s=0;s<4;s++)for(let r=1;r<=13;r++)cards.push({s,r,up:false});
  shuffle(cards);
  let stock=[],waste=[],found=[[],[],[],[]],tab=[[],[],[],[],[],[],[]],moves=0,hist=[],over=false,started=false,t0=0,secs=0,auto=false;
  let p=0;for(let i=0;i<7;i++)for(let j=0;j<=i;j++){const cd=cards[p++];cd.up=j===i;tab[i].push(cd)}
  stock=cards.slice(p);
  const slot=(cls,left,top,html)=>{const e=el('div','slot '+cls,g,html||'');e.style.left=left+'cqw';e.style.top=top+'cqw';return e};
  const stockSlot=slot('stk',colX(0),TY,'↻');S.on(stockSlot,'click',()=>draw());
  for(let f=0;f<4;f++)slot('fnd',colX(3+f),TY,SU[f]);
  for(let i=0;i<7;i++)slot('tab',colX(i),BY);
  cards.forEach((cd,i)=>{
    const red=cd.s===1||cd.s===2;cd.el=el('button','card2'+(red?' red':''),g,`<span class="ci">${RK[cd.r]}<i>${SU[cd.s]}</i></span><span class="cb">${SU[cd.s]}</span>`);
    cd.el.style.animationDelay=Math.min(i*12,500)+'ms';S.on(cd.el,'click',()=>tap(cd));
  });
  const isRed=cd=>cd.s===1||cd.s===2;
  function where(cd){
    if(stock.includes(cd))return{pile:stock,kind:'stock'};if(waste.includes(cd))return{pile:waste,kind:'waste'};
    for(let f=0;f<4;f++)if(found[f].includes(cd))return{pile:found[f],kind:'found'};
    for(let i=0;i<7;i++)if(tab[i].includes(cd))return{pile:tab[i],kind:'tab',i};
  }
  function snap(){hist.push({stock:stock.slice(),waste:waste.slice(),found:found.map(a=>a.slice()),tab:tab.map(a=>a.slice()),up:cards.map(c=>c.up),moves});if(hist.length>200)hist.shift()}
  function undo(){if(over||auto||!hist.length)return;const h=hist.pop();stock=h.stock;waste=h.waste;found=h.found;tab=h.tab;cards.forEach((c,i)=>c.up=h.up[i]);moves=h.moves;layout();beep(300,40)}
  S.on(undoB,'click',undo);
  function begin(){if(!started){started=true;t0=performance.now()}}
  function draw(){
    if(over||auto)return;begin();snap();
    if(!stock.length){if(!waste.length){hist.pop();return}stock=waste.reverse();waste=[];stock.forEach(c=>c.up=false);beep(260,60)}
    else{for(let k=0;k<DRAW&&stock.length;k++){const c=stock.pop();c.up=true;waste.push(c)}beep(520,30)}
    moves++;layout();
  }
  const canFound=(cd,f)=>{const P=found[f];return P.length?P[P.length-1].s===cd.s&&P[P.length-1].r===cd.r-1:cd.r===1};
  const canTab=(cd,i)=>{const P=tab[i];if(!P.length)return cd.r===13;const top=P[P.length-1];return top.up&&isRed(top)!==isRed(cd)&&top.r===cd.r+1};
  function tap(cd){
    if(over||auto)return;const w=where(cd);
    if(w.kind==='stock'){draw();return}
    if(!cd.up){return}
    if(w.kind==='waste'&&cd!==waste[waste.length-1])return;
    if(w.kind==='found'&&cd!==w.pile[w.pile.length-1])return;
    const seq=w.pile.slice(w.pile.indexOf(cd));
    if(seq.length===1&&w.kind!=='found')for(let f=0;f<4;f++)if(canFound(cd,f)){move(seq,w,found[f]);return}
    const order=[...Array(7).keys()].filter(i=>!(w.kind==='tab'&&w.i===i)).sort((a,b)=>(!tab[a].length)-(!tab[b].length));
    for(const i of order)if(canTab(cd,i)){if(cd.r===13&&!tab[i].length&&w.kind==='tab'&&w.pile.indexOf(cd)===0)continue;move(seq,w,tab[i]);return}
    restartAnim(cd.el,'nope');beep(180,60);
  }
  function move(seq,w,dest){
    begin();snap();w.pile.splice(w.pile.length-seq.length,seq.length);dest.push(...seq);moves++;
    if(w.kind==='tab'&&w.pile.length&&!w.pile[w.pile.length-1].up)w.pile[w.pile.length-1].up=true;
    beep(found.includes(dest)?760:560,40);layout();check();
  }
  function check(){
    if(found.every(f=>f.length===13)){
      over=true;const tt=Math.max(1,Math.round((performance.now()-t0)/1000));clock.textContent=`⏱️ ${fmt(tt)}`;
      const nb=best('solitaire'+S.level,tt,true);st(`You won in ${moves} moves and ${fmt(tt)}!${nb?' New best time.':''}`);
      cards.forEach((c,i)=>{c.el.style.animationDelay=i*15+'ms';restartAnim(c.el,'wave')});S.after(700,S.next);return;
    }
    if(!auto&&!stock.length&&!waste.length&&tab.every(P=>P.every(c=>c.up))){auto=true;st('All cards are face up. Finishing for you…');finish()}
  }
  function finish(){
    for(let f=0;f<4;f++)for(let i=0;i<7;i++){const P=tab[i];if(P.length&&canFound(P[P.length-1],f)){found[f].push(P.pop());moves++;beep(700+found[f].length*20,30);layout();S.after(90,finish);return}}
    auto=false;check();
  }
  const fmt=s=>`${s/60|0}:${String(s%60).padStart(2,'0')}`;
  function layout(){
    let z=1;const put=(c,l,tp)=>{c.el.style.left=l+'cqw';c.el.style.top=tp+'cqw';c.el.style.zIndex=z++;c.el.classList.toggle('down',!c.up);c.el.setAttribute('aria-label',c.up?`${RK[c.r]} of ${['spades','hearts','diamonds','clubs'][c.s]}`:'Face-down card')};
    stock.forEach((c,i)=>put(c,colX(0),TY-Math.min(i,6)*.08));
    const ws=waste.length;waste.forEach((c,i)=>{const fan=DRAW===3?Math.max(0,i-(ws-3)):0;put(c,colX(1)+fan*2.6,TY)});
    found.forEach((P,f)=>P.forEach(c=>put(c,colX(3+f),TY)));
    tab.forEach((P,i)=>{
      const dn=P.filter(c=>!c.up).length,upN=P.length-dn;let dO=2.6,uO=5.4;const need=dn*dO+Math.max(0,upN-1)*uO,av=BOT-CHt-BY;
      if(need>av){const k2=av/need;dO*=k2;uO*=k2}
      let y=BY;P.forEach(c=>{put(c,colX(i),y);y+=c.up?uO:dO});
    });
    stockSlot.textContent=stock.length?'':waste.length?'↻':'';
    mv.textContent=`Moves ${moves}`;undoB.disabled=!hist.length;
  }
  S.every(250,()=>{if(!started||over)return;const s=Math.floor((performance.now()-t0)/1000);if(s!==secs){secs=s;clock.textContent=`⏱️ ${fmt(s)}`}});
  layout();
}

/* chess engine: board is 64 squares, index r*8+c with r=0 at Black's back rank */
const CH={
  V:{p:100,n:320,b:330,r:500,q:900,k:0},
  PST:{
    p:[0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
    n:[-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
    b:[-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
    r:[0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
    q:[-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
    k:[-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20]
  },
  start(){const b=Array(64).fill('');const back='rnbqkbnr';for(let c=0;c<8;c++){b[c]=back[c];b[8+c]='p';b[48+c]='P';b[56+c]=back[c].toUpperCase()}return{b,w:true,cs:{K:1,Q:1,k:1,q:1},ep:-1,half:0}},
  white:p=>p&&p===p.toUpperCase(),
  attacked(b,sq,byW){
    const r=sq>>3,c=sq&7,own=p=>p&&(byW?p===p.toUpperCase():p===p.toLowerCase()),is=(p,t)=>own(p)&&p.toLowerCase()===t;
    const pr=byW?r+1:r-1;if(pr>=0&&pr<8)for(const dc of[-1,1]){const cc=c+dc;if(cc>=0&&cc<8&&is(b[pr*8+cc],'p'))return true}
    for(const[dr,dc]of[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]){const rr2=r+dr,cc=c+dc;if(rr2>=0&&rr2<8&&cc>=0&&cc<8&&is(b[rr2*8+cc],'n'))return true}
    for(const[dr,dc]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      let rr2=r+dr,cc=c+dc,d=1;
      while(rr2>=0&&rr2<8&&cc>=0&&cc<8){const p=b[rr2*8+cc];if(p){if(own(p)){const t=p.toLowerCase();if(t==='q'||(t==='k'&&d===1)||(t==='r'&&(!dr||!dc))||(t==='b'&&dr&&dc))return true}break}rr2+=dr;cc+=dc;d++}
    }
    return false;
  },
  kingSq:(b,w)=>b.indexOf(w?'K':'k'),
  inCheck(s,w){return CH.attacked(s.b,CH.kingSq(s.b,w),!w)},
  pseudo(s){
    const b=s.b,w=s.w,M=[],mine=p=>p&&CH.white(p)===w,theirs=p=>p&&CH.white(p)!==w;
    for(let f=0;f<64;f++){
      const p=b[f];if(!mine(p))continue;const t=p.toLowerCase(),r=f>>3,c=f&7;
      if(t==='p'){
        const d=w?-1:1,r1=r+d,last=w?0:7;
        if(r1>=0&&r1<8){
          if(!b[r1*8+c]){M.push({f,t:r1*8+c,pr:r1===last});const sr=w?6:1;if(r===sr&&!b[(r+2*d)*8+c])M.push({f,t:(r+2*d)*8+c,dbl:true})}
          for(const dc of[-1,1]){const cc=c+dc;if(cc<0||cc>7)continue;const to=r1*8+cc;if(theirs(b[to]))M.push({f,t:to,pr:r1===last});else if(to===s.ep)M.push({f,t:to,ep:true})}
        }
      }else if(t==='n'||t==='k'){
        const D=t==='n'?[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
        for(const[dr,dc]of D){const rr2=r+dr,cc=c+dc;if(rr2<0||rr2>7||cc<0||cc>7)continue;const to=rr2*8+cc;if(!mine(b[to]))M.push({f,t:to})}
        if(t==='k'){
          const home=w?60:4,K=w?'K':'k',Q=w?'Q':'q';
          if(f===home&&!CH.attacked(b,f,!w)){
            if(s.cs[K]&&!b[f+1]&&!b[f+2]&&b[f+3]===(w?'R':'r')&&!CH.attacked(b,f+1,!w)&&!CH.attacked(b,f+2,!w))M.push({f,t:f+2,castle:1});
            if(s.cs[Q]&&!b[f-1]&&!b[f-2]&&!b[f-3]&&b[f-4]===(w?'R':'r')&&!CH.attacked(b,f-1,!w)&&!CH.attacked(b,f-2,!w))M.push({f,t:f-2,castle:-1});
          }
        }
      }else{
        const D=t==='r'?[[1,0],[-1,0],[0,1],[0,-1]]:t==='b'?[[1,1],[1,-1],[-1,1],[-1,-1]]:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
        for(const[dr,dc]of D){let rr2=r+dr,cc=c+dc;while(rr2>=0&&rr2<8&&cc>=0&&cc<8){const to=rr2*8+cc;if(mine(b[to]))break;M.push({f,t:to});if(b[to])break;rr2+=dr;cc+=dc}}
      }
    }
    return M;
  },
  make(s,m){
    const b=s.b.slice(),p=b[m.f],w=s.w,cs={...s.cs};let cap=b[m.t];
    b[m.t]=m.pr?(w?'Q':'q'):p;b[m.f]='';
    if(m.ep){const cs2=m.t+(w?8:-8);cap=b[cs2];b[cs2]=''}
    if(m.castle===1){b[m.f+1]=b[m.f+3];b[m.f+3]=''}else if(m.castle===-1){b[m.f-1]=b[m.f-4];b[m.f-4]=''}
    if(p==='K'){cs.K=cs.Q=0}if(p==='k'){cs.k=cs.q=0}
    for(const[sq,k]of[[63,'K'],[56,'Q'],[7,'k'],[0,'q']])if(m.f===sq||m.t===sq)cs[k]=0;
    return{b,w:!w,cs,ep:m.dbl?(m.f+m.t)/2:-1,half:(p.toLowerCase()==='p'||cap)?0:s.half+1,cap};
  },
  legal(s){return CH.pseudo(s).filter(m=>{const n=CH.make(s,m);return!CH.attacked(n.b,CH.kingSq(n.b,s.w),!s.w)})},
  evalW(b){let v=0;for(let i=0;i<64;i++){const p=b[i];if(!p)continue;const t=p.toLowerCase();if(p===t)v-=CH.V[t]+CH.PST[t][(7-(i>>3))*8+(i&7)];else v+=CH.V[t]+CH.PST[t][i]}return v},
  order(s,M){const b=s.b;return M.map(m=>({m,k:(b[m.t]?10*CH.V[b[m.t].toLowerCase()]-CH.V[b[m.f].toLowerCase()]:0)+(m.pr?800:0)})).sort((a,b2)=>b2.k-a.k).map(o=>o.m)},
  qs(s,a,bt,d){
    const stand=(s.w?1:-1)*CH.evalW(s.b);if(stand>=bt)return bt;if(stand>a)a=stand;if(d<=0)return a;
    for(const m of CH.order(s,CH.pseudo(s).filter(m=>s.b[m.t]||m.pr))){const n=CH.make(s,m);if(CH.attacked(n.b,CH.kingSq(n.b,s.w),!s.w))continue;const v=-CH.qs(n,-bt,-a,d-1);if(v>=bt)return bt;if(v>a)a=v}
    return a;
  },
  nega(s,d,a,bt,ply){
    if(s.half>=100)return 0;
    if(d<=0)return CH.qs(s,a,bt,4);
    const M=CH.order(s,CH.legal(s));
    if(!M.length)return CH.inCheck(s,s.w)?-20000+ply:0;
    for(const m of M){const v=-CH.nega(CH.make(s,m),d-1,-bt,-a,ply+1);if(v>=bt)return bt;if(v>a)a=v}
    return a;
  },
  best(s,depth,noise){
    const M=CH.order(s,CH.legal(s));let bm=null,bv=-1e9;
    for(const m of M){const v=-CH.nega(CH.make(s,m),depth-1,-1e9,1e9,1)+(noise?Math.random()*noise:0);if(v>bv){bv=v;bm=m}}
    return bm;
  }
};
function chess(root,S){
  const L=S.level,TWO=L===4,DEPTH=[1,2,3,1][L-1],NOISE=[160,30,0,0][L-1];
  const st=status(root,TWO?'Two players: White moves first. Pass the device after each move.':'You play White. Tap a piece, then tap where it should go.');
  const g=el('div','chess',root);g.dataset.ar=1;g.dataset.max=560;
  const GL={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟︎'},NAME={k:'king',q:'queen',r:'rook',b:'bishop',n:'knight',p:'pawn'};
  let s=CH.start(),sel=-1,targets=[],last=null,busy=false,over=false;
  const sqs=[...Array(64)].map((_,i)=>{const e=el('button','sq'+(((i>>3)+(i&7))%2?' dk':''),g);e.style.animationDelay=Math.min(i*6,380)+'ms';S.on(e,'click',()=>tap(i));return e});
  const nameSq=i=>'abcdefgh'[i&7]+(8-(i>>3));
  function draw(){
    const chk=CH.inCheck(s,s.w)?CH.kingSq(s.b,s.w):-1;
    sqs.forEach((e,i)=>{
      const p=s.b[i];e.innerHTML=p?`<span class="pc ${CH.white(p)?'w':'b'}">${GL[p.toLowerCase()]}</span>`:'';
      e.classList.toggle('sel',i===sel);e.classList.toggle('tgt',targets.some(m=>m.t===i));e.classList.toggle('cap',targets.some(m=>m.t===i)&&!!p);
      e.classList.toggle('last',!!last&&(last.f===i||last.t===i));e.classList.toggle('chk',i===chk);
      e.setAttribute('aria-label',nameSq(i)+(p?` ${CH.white(p)?'white':'black'} ${NAME[p.toLowerCase()]}`:''));
    });
  }
  function tap(i){
    if(over||busy||(!TWO&&!s.w))return;
    const m=targets.find(m=>m.t===i);
    if(m){play(m);return}
    const p=s.b[i];
    if(p&&CH.white(p)===s.w){sel=i;targets=CH.legal(s).filter(m=>m.f===i);beep(480,30);if(!targets.length){restartAnim(sqs[i],'nope')}}
    else{sel=-1;targets=[]}
    draw();
  }
  function play(m){
    const cap=s.b[m.t]||m.ep;s=CH.make(s,m);last=m;sel=-1;targets=[];draw();beep(cap?300:520,cap?120:60);
    if(end())return;
    if(TWO){const side=s.w?'White':'Black';st(CH.inCheck(s,s.w)?`${side} is in check!`:`${side} to move.`);return}
    if(!s.w){busy=true;st(CH.inCheck(s,false)?'Check! Computer is thinking…':'Computer is thinking…');S.after(260,()=>{const bm=CH.best(s,DEPTH,NOISE);busy=false;play(bm)})}
    else st(CH.inCheck(s,true)?'Check! Protect your king.':'Your move.');
  }
  function end(){
    const M=CH.legal(s),onlyK=s.b.every(p=>!p||p.toLowerCase()==='k');
    if(M.length&&s.half<100&&!onlyK)return false;
    over=true;
    if(!M.length&&CH.inCheck(s,s.w)){
      if(TWO){const wn=s.w?'Black':'White';st(`Checkmate! ${wn} wins. Press ↻ for a rematch.`);S.fx.confetti();S.fx.banner(`${wn} wins!`);beep(990,300)}
      else if(!s.w){st('Checkmate! You win.');beep(990,300);S.after(600,S.next)}
      else{st('Checkmate. The computer wins. Press ↻ to play again.');S.shake();beep(150,400,'sawtooth')}
    }else st(`Draw${!M.length?' by stalemate':onlyK?': only kings are left':' by the 50-move rule'}. Press ↻ to play again.`);
    return true;
  }
  draw();
}

/* Cannon Blast: endless. Drag the cannon, it auto-fires; rocks split, get tougher over time; rare power-ups */
const BLASTUP={guns:{ico:'➕',name:'Extra barrel',max:3,base:1},rate:{ico:'⏩',name:'Faster fire',max:6,base:0},dmg:{ico:'💪',name:'Stronger shots',max:8,base:0}};
const BLASTPW={rapid:{ico:'⚡',name:'Rapid fire',dur:8},triple:{ico:'🔱',name:'Triple shot',dur:8},power:{ico:'💥',name:'Double power',dur:8},freeze:{ico:'❄️',name:'Freeze',dur:4},shield:{ico:'🛡️',name:'Shield',dur:0}};
function blast(root,S){
  const st=status(root,'Touch or drag and the cannon follows your finger. It fires on its own. Break the rocks and don\'t let one touch you. It gets harder the longer you last.');
  /* taller phones only add sky: rocks bounce to the same heights and enter at the same height above the
     ground (TOP is where the old 560-high field began), so dodging and timing stay the same */
  const W=360,H=tall(360,560,800),{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();const k=held(S);
  const FL=H-46,TOP=H-560,RAD=[0,13,19,27,37],BH=[0,170,215,260,300],CY=FL-6;
  let cx,balls,bullets,drops,spawnT,fireT,state,score,el,pw,shield,lastDrop,up,upT,upN,dragX=null,tx=null,hitT=0,t=0;
  function reset(){cx=W/2;balls=[];bullets=[];drops=[];spawnT=.6;fireT=0;score=0;el=0;pw={rapid:0,triple:0,power:0,freeze:0};shield=false;lastDrop=-20;tx=null;up={guns:1,rate:0,dmg:0};upT=12;upN=0;state='ready'}
  reset();
  const rate=()=>(7.5+Math.min(7,el/25))*(1+.15*up.rate)*(pw.rapid>0?2:1),dmg=()=>Math.max(1,Math.round((1+Math.floor(el/40))*(1+.25*up.dmg)))*(pw.power>0?2:1);
  const upLeft=()=>Object.keys(BLASTUP).filter(q=>up[q]<BLASTUP[q].max),GUNX=[[0],[-6,6],[-9,0,9]];
  /* rocks toughen with time and with the cannon's permanent upgrades, so upgrades help but never make rocks melt */
  const upPow=()=>up.guns*(1+.15*up.rate)*(1+.25*up.dmg);
  const hpFor=s=>Math.max(2,Math.round((3+el*.5)*upPow()**.8*[0,.35,.65,1,1.55][s]*(.7+Math.random()*.6)));
  function start(){if(state==='ready'){state='play';beep(660,80);st('Keep moving! Rocks get tougher every few seconds.')}}
  function spawn(){
    const big=el>70&&Math.random()<Math.min(.45,(el-70)/200)?4:el>20&&Math.random()<.55?3:2;
    const side=rand(2),hp=hpFor(big);balls.push({s:big,hp,max:hp,x:side?W+RAD[big]:-RAD[big],y:TOP+60+rand(70),vx:(side?-1:1)*(55+Math.random()*25+Math.min(30,el/6)),vy:0,enter:true,hit:0});
  }
  function lose(){
    state='dead';hitT=0;bullets=[];S.shake();beep(130,400,'sawtooth');fx.add(cx,CY-20,K.c1,36,260);
    const nb=best('blast',score);st(`Crushed after ${Math.floor(el)} seconds with ${score} point${score===1?'':'s'}.${nb?' New best!':''} Tap to play again.`);
  }
  S.on(root,'pointerdown',e=>{if(e.target.closest('button,a,input'))return;dragX=c.pos(e).x;try{e.target.setPointerCapture(e.pointerId)}catch(_){}if(state==='ready')start();else if(state==='dead'&&hitT>.7)reset();if(state==='play')tx=clamp(dragX,22,W-22)});
  S.on(root,'pointermove',e=>{if(dragX==null)return;dragX=c.pos(e).x;if(state==='play')tx=clamp(dragX,22,W-22)});
  ['pointerup','pointercancel'].forEach(ev=>S.on(root,ev,()=>{dragX=null}));
  S.on(window,'keydown',e=>{if(e.key===' '||e.key==='Enter'||e.key.startsWith('Arrow')){if(e.key===' '||e.key==='Enter')e.preventDefault();if(state==='ready')start();else if(state==='dead'&&hitT>.7&&(e.key===' '||e.key==='Enter'))reset()}});
  function split(b){
    score+=10*b.s;fx.add(b.x,b.y,col(b),16+b.s*3,220);beep(240+b.s*30,90,'square');
    if(b.s>1){const hp=Math.max(1,Math.ceil(b.max/2));for(const d of[-1,1])balls.push({s:b.s-1,hp,max:hp,x:b.x+d*6,y:b.y,vx:d*70,vy:-260,enter:false,hit:0})}
    if(upT<=0&&!drops.some(d=>d.up)){const ks=upLeft();if(ks.length){upT=1e9;drops.push({up:ks[rand(ks.length)],x:b.x,y:b.y,vy:-160,life:8});return}}
    if(!drops.length&&el-lastDrop>14&&Math.random()<.09){
      lastDrop=el;const ks=Object.keys(BLASTPW),type=shield&&Math.random()<.5?ks[rand(4)]:ks[rand(ks.length)];
      drops.push({type,x:b.x,y:b.y,vy:-140,life:6.5});
    }
  }
  function collect(d){
    if(d.up){const U=BLASTUP[d.up];up[d.up]++;upN++;upT=20+2*upN;beep(880,90);setTimeout(()=>beep(1175,90),90);setTimeout(()=>beep(1568,140),180);fx.add(d.x,d.y,'#FFC53D',26,220);S.fx.toast(`${U.ico} ${U.name} ${up[d.up]-U.base}/${U.max-U.base}`);return}
    const P=BLASTPW[d.type];beep(1040,90);setTimeout(()=>beep(1320,90),90);fx.add(d.x,d.y,K.c2,18,180);S.fx.toast(`${P.ico} ${P.name}`);
    if(d.type==='shield')shield=true;else pw[d.type]=P.dur;
  }
  function col(b){const f=b.max;return f>=80?K.c5:f>=40?K.c1:f>=18?K.c6:f>=8?K.c2:K.c3}
  S.loop(dt=>{
    t+=dt;hitT+=dt;
    if(k.ArrowLeft||k.a||k.ArrowRight||k.d)tx=null;if(k.ArrowLeft||k.a)cx=clamp(cx-300*dt,22,W-22);if(k.ArrowRight||k.d)cx=clamp(cx+300*dt,22,W-22);
    if(tx!=null&&state==='play'){const d=tx-cx,m=Math.min(Math.abs(d),Math.max(Math.abs(d)*35,300)*dt,3200*dt);cx+=Math.sign(d)*m;if(Math.abs(tx-cx)<.5){cx=tx;if(dragX==null)tx=null}}
    if(state==='play'){
      el+=dt;upT-=dt;for(const p in pw)pw[p]=Math.max(0,pw[p]-dt);
      const cap=Math.min(9,2+Math.floor(el/40)),bigCount=balls.filter(b=>b.s>=2).length;
      spawnT-=dt;if(spawnT<=0&&bigCount<cap){spawn();spawnT=Math.max(1.7,4.5-el/60)*(.8+Math.random()*.4)}
      fireT-=dt;while(fireT<=0){
        const tri=pw.triple>0;for(const gx of GUNX[up.guns-1])bullets.push({x:cx+gx,y:CY-44,vx:0});if(tri){bullets.push({x:cx,y:CY-44,vx:-150});bullets.push({x:cx,y:CY-44,vx:150})}
        fireT+=1/rate();
      }
      for(const u of bullets){u.y-=720*dt;u.x+=u.vx*dt}
      const bt=pw.freeze>0?0:dt;
      for(const b of balls){
        b.hit=Math.max(0,b.hit-dt);const r=RAD[b.s];b.vy+=420*bt;b.x+=b.vx*bt;b.y+=b.vy*bt;
        if(b.enter){if(b.x>r&&b.x<W-r)b.enter=false}else{if(b.x<r){b.x=r;b.vx=Math.abs(b.vx)}if(b.x>W-r){b.x=W-r;b.vx=-Math.abs(b.vx)}}
        if(b.y>FL-r){b.y=FL-r;b.vy=-Math.sqrt(2*420*BH[b.s])}
        if(b.y<r){b.y=r;b.vy=Math.abs(b.vy)}
        for(const u of bullets){if(u.dead)continue;if((u.x-b.x)**2+(u.y-b.y)**2<(r+4)**2){u.dead=true;const d=Math.min(dmg(),b.hp);b.hp-=d;score+=d;b.hit=.06;if(b.hp<=0){b.dead=true;split(b);break}}}
        const nx=clamp(b.x,cx-20,cx+20),ny=clamp(b.y,CY-44,CY+4);
        if(!b.dead&&(b.x-nx)**2+(b.y-ny)**2<r*r*.85){
          if(shield){shield=false;b.dead=true;split(b);beep(400,200);fx.add(cx,CY-20,K.c3,26,220);S.fx.toast('🛡️ Shield saved you')}
          else{lose();break}
        }
      }
      bullets=bullets.filter(u=>!u.dead&&u.y>-10&&u.x>-10&&u.x<W+10);balls=balls.filter(b=>!b.dead);
      for(const d of drops){d.vy+=500*dt;d.y=Math.min(FL-13,d.y+d.vy*dt);d.life-=dt;if(Math.abs(d.x-cx)<34&&d.y>CY-60){d.got=true;collect(d)}}
      for(const d of drops)if(d.up&&!d.got&&d.life<=0)upT=8;
      drops=drops.filter(d=>!d.got&&d.life>0);
    }else if(state==='dead'){for(const b of balls){b.vy+=420*dt;b.y=Math.min(FL-RAD[b.s],b.y+b.vy*dt*.4)}}
    // scene
    const sky=x.createLinearGradient(0,0,0,FL);sky.addColorStop(0,K.board);sky.addColorStop(1,K.line);x.fillStyle=sky;x.fillRect(0,0,W,H);
    if(TOP>60){x.fillStyle=K.line;x.globalAlpha=.7;const nC=Math.min(4,1+Math.floor(TOP/70));for(let i=0;i<nC;i++){const cx2=((i*130+t*8*(i%2?1:-1))%(W+120)+W+120)%(W+120)-60,cy2=100+i*(TOP+80)/nC;x.beginPath();x.arc(cx2,cy2,16,0,7);x.arc(cx2+18,cy2-7,20,0,7);x.arc(cx2+38,cy2,14,0,7);x.fill()}x.globalAlpha=1}
    if(pw.freeze>0){x.fillStyle='rgba(120,200,255,.16)';x.fillRect(0,0,W,FL)}
    x.fillStyle=K.muted;x.globalAlpha=.18;for(let i=0;i<6;i++){const mx=(i*83+20)%W;x.beginPath();x.moveTo(mx-70,FL);x.lineTo(mx,FL-90-(i%3)*30);x.lineTo(mx+70,FL);x.fill()}x.globalAlpha=1;
    x.fillStyle=K.c3;x.fillRect(0,FL,W,H-FL);x.fillStyle=K.edge;x.fillRect(0,FL,W,3);
    x.fillStyle=pw.power>0?K.c1:K.c2;for(const u of bullets){rr(x,u.x-2.5,u.y-8,5,14,2.5);x.fill()}
    for(const b of balls){
      const r=RAD[b.s]*(1+b.hit*1.5),g=x.createRadialGradient(b.x-r*.35,b.y-r*.4,r*.15,b.x,b.y,r),cc=col(b);
      g.addColorStop(0,'rgba(255,255,255,.85)');g.addColorStop(.25,cc);g.addColorStop(1,cc);
      x.fillStyle=g;x.beginPath();x.arc(b.x,b.y,r,0,7);x.fill();x.lineWidth=2.5;x.strokeStyle=pw.freeze>0?'#7CC8FF':K.edge;x.stroke();
      x.fillStyle='rgba(30,31,92,.18)';x.beginPath();x.arc(b.x+r*.3,b.y+r*.25,r*.18,0,7);x.arc(b.x-r*.25,b.y+r*.4,r*.12,0,7);x.fill();
      x.textAlign='center';x.textBaseline='middle';x.font=`${Math.max(11,r*.75)}px ${DISPLAY}`;x.lineWidth=4;x.strokeStyle='rgba(30,31,92,.75)';x.strokeText(b.hp,b.x,b.y+1);x.fillStyle='#fff';x.fillText(b.hp,b.x,b.y+1);x.textBaseline='alphabetic';
    }
    x.textAlign='center';x.textBaseline='middle';
    for(const d of drops){if(d.life<2&&Math.floor(t*8)%2)continue;const bob=d.y>=FL-13?Math.sin(t*5)*2:0;
      if(d.up){x.save();x.shadowColor='#FFC53D';x.shadowBlur=14+6*Math.sin(t*8);x.fillStyle='#FFC53D';x.beginPath();x.arc(d.x,d.y+bob,16,0,7);x.fill();x.restore();x.lineWidth=2.5;x.strokeStyle=K.edge;x.beginPath();x.arc(d.x,d.y+bob,16,0,7);x.stroke();x.font='16px sans-serif';x.fillStyle='#000';x.fillText(BLASTUP[d.up].ico,d.x,d.y+bob+1);x.font=`10px ${DISPLAY}`;x.fillStyle=K.ink;x.fillText('UPGRADE',d.x,d.y+bob-24);continue}
      x.fillStyle='#fff';x.beginPath();x.arc(d.x,d.y+bob,13,0,7);x.fill();x.lineWidth=2.5;x.strokeStyle=K.c2;x.stroke();x.font='15px sans-serif';x.fillStyle='#000';x.fillText(BLASTPW[d.type].ico,d.x,d.y+bob+1)}
    x.textBaseline='alphabetic';
    if(state!=='dead'||Math.floor(t*10)%2){
      x.save();x.translate(cx,CY);x.lineWidth=2.5;x.strokeStyle=K.edge;
      if(shield){x.strokeStyle=K.c3;x.globalAlpha=.6+.25*Math.sin(t*6);x.lineWidth=3;x.beginPath();x.ellipse(0,-22,32,34,0,0,7);x.stroke();x.globalAlpha=1;x.strokeStyle=K.edge;x.lineWidth=2.5}
      for(const gx of GUNX[up.guns-1]){const bw=up.guns>1?10:14;x.fillStyle='#5A5F96';rr(x,gx-bw/2,-46,bw,30,4);x.fill();x.stroke();x.fillStyle=pw.triple>0?K.c5:up.dmg>4?K.c1:K.c2;rr(x,gx-bw/2-2,-50,bw+4,8,3);x.fill();x.stroke()}
      x.fillStyle=K.c4;rr(x,-22,-24,44,20,9);x.fill();x.stroke();
      for(const wx of[-14,14]){x.fillStyle='#2B2E5E';x.beginPath();x.arc(wx,-3,9,0,7);x.fill();x.stroke();x.fillStyle=K.muted;x.beginPath();x.arc(wx,-3,3,0,7);x.fill()}
      x.restore();
    }
    fx.draw(x,dt);
    // HUD
    x.textAlign='center';x.lineJoin='round';x.strokeStyle=K.board;x.lineWidth=7;x.font=`38px ${DISPLAY}`;x.strokeText(score,W/2,50);x.fillStyle=K.ink;x.fillText(score,W/2,50);
    const bt2=`Best ${Math.max(score,store.get('best:blast')||0)}`;x.font=`12px ${DISPLAY}`;x.lineWidth=4;x.strokeText(bt2,W/2,68);x.fillStyle=K.muted;x.fillText(bt2,W/2,68);
    const act=[pw.rapid>0&&`⚡${Math.ceil(pw.rapid)}`,pw.triple>0&&`🔱${Math.ceil(pw.triple)}`,pw.power>0&&`💥${Math.ceil(pw.power)}`,pw.freeze>0&&`❄️${Math.ceil(pw.freeze)}`,shield&&'🛡️'].filter(Boolean);
    if(act.length){x.font=`13px ${DISPLAY}`;x.fillStyle=K.ink;x.fillText(act.join('   '),W/2,90)}
    x.textAlign='left';x.font=`12px ${DISPLAY}`;x.fillStyle=K.muted;x.fillText(`⏱ ${Math.floor(el)}s`,12,22);
    x.font=`13px ${DISPLAY}`;x.fillStyle=K.ink;x.textAlign='center';x.fillText(Object.keys(BLASTUP).map(q=>{const U=BLASTUP[q];return `${U.ico} ${up[q]-U.base}/${U.max-U.base}`}).join('    '),W/2,H-15);
    if(state==='ready'){x.fillStyle='rgba(0,0,0,.3)';x.fillRect(0,H/2-50,W,96);x.fillStyle='#fff';x.textAlign='center';x.font=`26px ${DISPLAY}`;x.fillText('Tap to start',W/2,H/2-12);x.font=`14px ${DISPLAY}`;x.fillText('It follows your finger · fires by itself',W/2,H/2+18)}
    if(state==='dead'){x.fillStyle='rgba(0,0,0,.4)';x.fillRect(0,0,W,H);x.fillStyle='#fff';x.textAlign='center';x.font=`30px ${DISPLAY}`;x.fillText('Crushed!',W/2,H/2-14);x.font=`18px ${DISPLAY}`;x.fillText(`${score} point${score===1?'':'s'}`,W/2,H/2+14);x.font=`13px ${DISPLAY}`;x.fillText('Tap to play again',W/2,H/2+40)}
  });
}

/* Pinball: segment/circle physics with substeps; flippers, bumpers, slings, lanes, drop targets,
   spinner, saucer with multiball and jackpots, inlanes and super bumpers, orbit shots, light shows */
function pinball(root,S){
  const st=status(root,'Hold Space, ↓ or touch to pull the plunger, let go to launch. Flippers: ← → or Z and M, or tap the left and right side.');
  const W=360,H=640,{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();
  const R=8,G=1050,SUB=10,OY=40;
  const V=(a,b)=>({x:a,y:b+OY});
  const segs=[],add=(a,b,kind='wall',e=.45)=>segs.push({a,b,kind,e,hit:0});
  const arc=[];for(let i=0;i<=24;i++){const t=Math.PI+Math.PI*i/24;arc.push(V(180+166*Math.cos(t),125+110*Math.sin(t)))}
  for(let i=0;i<arc.length-1;i++)add(arc[i],arc[i+1]);
  add(V(14,125),V(14,410));add(V(14,410),V(108,512));
  add(V(346,125),V(346,600));add(V(320,210),V(320,600));
  add(V(320,600),V(346,600));add(V(320,410),V(226,512));
  const SL=[[V(42,350),V(42,398),V(86,436)],[V(292,350),V(292,398),V(248,436)]];
  for(const[A,B,C]of SL){add(A,B);add(B,C);add(A,C,'sling',.2)}
  for(const px of[113,148,186,221])add(V(px,58),V(px,88),'post',.4);
  const lights=[];for(let i=0;i<=34;i++){const t=Math.PI+.08+(Math.PI-.16)*i/34;lights.push({x:180+150*Math.cos(t),y:125+OY+96*Math.sin(t)})}
  const bumpers=[{x:110,y:190+OY,r:20,hit:0},{x:224,y:190+OY,r:20,hit:0},{x:167,y:258+OY,r:20,hit:0}];
  const lanes=[{x:130,y:72+OY,on:false},{x:167,y:72+OY,on:false},{x:204,y:72+OY,on:false}];
  const inl=[{x:28,y:372+OY,on:false},{x:306,y:372+OY,on:false}];
  const targets=[0,1,2].map(i=>({a:V(312,262+i*26),b:V(312,282+i*26),up:true,hit:0}));
  const posts=[{x:108,y:512+OY,r:9},{x:226,y:512+OY,r:9}];
  const saucer={x:56,y:262+OY,r:11,hits:0,glow:0};
  const spinner={x0:14,x1:46,y:205+OY,ang:0,spin:0};
  const FL=[{p:V(108,512),rest:.55,upA:-.45,ph:.55,w:0,len:50,key:false},{p:V(226,512),rest:Math.PI-.55,upA:Math.PI+.45,ph:Math.PI-.55,w:0,len:50,key:false}];
  let bs,lives,score,mult,state,charge,saveT,saveUsed,flash=0,extraGiven,t=0,superT=0,multiT=0,jackpot=0,bumpCount=0,pops=[],dmd=[],shakeT=0,show=0;
  const newBallObj=(x0,y0,vx=0,vy=0)=>({x:x0,y:y0,vx,vy,trail:[],still:0,cap:0});
  function reset(){saveUsed=false;lives=3;score=0;mult=1;extraGiven=false;superT=0;multiT=0;jackpot=0;bumpCount=0;saucer.hits=0;lanes.forEach(l=>l.on=false);inl.forEach(l=>l.on=false);targets.forEach(q=>q.up=true);toPlunger();say('PRESS AND HOLD','TO LAUNCH')}
  function toPlunger(){bs=[newBallObj(333,592+OY-R)];charge=0;state='launch';saveT=0}
  reset();
  function say(a,b='',d=1.8){dmd.push({a,b,d})}
  function pop(x0,y0,txt,col='#FFC53D'){pops.push({x:x0,y:y0,txt,col,t:0})}
  const pts=(n,x0,y0,col)=>{const v=n*mult;score+=v;if(x0!=null)pop(x0,y0,'+'+v.toLocaleString(),col);if(!extraGiven&&score>=50000){extraGiven=true;lives++;say('EXTRA BALL!','',2);beep(1200,200)}};
  const press=(i,on)=>{FL[i].key=on;if(on&&state!=='over')beep(i?260:240,25,'square')};
  const keyL=['ArrowLeft','z','Z','a','A','Shift'],keyR=['ArrowRight','m','M','/','d','D'];
  let charging=false;
  S.on(window,'keydown',e=>{
    if(keyL.includes(e.key)){e.preventDefault();if(!e.repeat)press(0,true)}
    if(keyR.includes(e.key)){e.preventDefault();if(!e.repeat)press(1,true)}
    if(e.key===' '||e.key==='ArrowDown'||e.key==='Enter'){e.preventDefault();if(state==='over'){reset();return}if(state==='launch')charging=true}
  });
  S.on(window,'keyup',e=>{
    if(keyL.includes(e.key))press(0,false);if(keyR.includes(e.key))press(1,false);
    if((e.key===' '||e.key==='ArrowDown'||e.key==='Enter')&&charging){charging=false;launch()}
  });
  const touches=new Map();
  S.on(c,'pointerdown',e=>{e.preventDefault();try{c.setPointerCapture(e.pointerId)}catch(_){}if(state==='over'){reset();return}
    if(state==='launch'){charging=true;touches.set(e.pointerId,'launch');return}
    const side=c.pos(e).x<W/2?0:1;touches.set(e.pointerId,side);press(side,true)});
  const lift=e=>{const s=touches.get(e.pointerId);touches.delete(e.pointerId);if(s==='launch'){if(charging){charging=false;launch()}}else if(s!=null&&![...touches.values()].includes(s))press(s,false)};
  S.on(c,'pointerup',lift);S.on(c,'pointercancel',lift);
  function launch(){if(state!=='launch')return;bs[0].vy=-(1080+600*Math.min(1,charge));state='play';saveT=saveUsed?0:4;beep(300+charge*400,120);charge=0}
  function autoLaunch(){bs.push(newBallObj(333,592+OY-R,0,-1500))}
  function startMulti(){multiT=25;saveT=Math.max(saveT,8);jackpot=25000;say('MULTIBALL!','JACKPOT LIT AT SAUCER',2.4);S.shake();shakeT=.4;flash=.3;for(let i=0;i<2;i++)setTimeout(()=>{if(state==='play')autoLaunch()},400+i*700);beep(660,120);setTimeout(()=>beep(880,120),130);setTimeout(()=>beep(1320,260),260)}
  function hitSeg(ball,sg){
    const ax=sg.a.x,ay=sg.a.y,bx=sg.b.x,by=sg.b.y,dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy;
    const u=clamp(((ball.x-ax)*dx+(ball.y-ay)*dy)/l2,0,1),cx2=ax+dx*u,cy2=ay+dy*u;let nx=ball.x-cx2,ny=ball.y-cy2;const d=Math.hypot(nx,ny);
    if(d>=R||d===0)return false;nx/=d;ny/=d;ball.x=cx2+nx*R;ball.y=cy2+ny*R;
    const vn=ball.vx*nx+ball.vy*ny;if(vn<0){ball.vx-=(1+sg.e)*vn*nx;ball.vy-=(1+sg.e)*vn*ny}
    if(sg.kind==='sling'&&vn<-60){ball.vx+=nx*420;ball.vy+=ny*420;sg.hit=.18;pts(10,ball.x,ball.y,'#FF5D73');beep(520,40,'square');fx.add(ball.x,ball.y,'#FF5D73',8,160)}
    return true;
  }
  function hitCircle(ball,o,e,kick){
    let nx=ball.x-o.x,ny=ball.y-o.y;const d=Math.hypot(nx,ny),rr2=o.r+R;if(d>=rr2||d===0)return false;nx/=d;ny/=d;ball.x=o.x+nx*rr2;ball.y=o.y+ny*rr2;
    const vn=ball.vx*nx+ball.vy*ny;if(vn<0){ball.vx-=(1+e)*vn*nx;ball.vy-=(1+e)*vn*ny}if(kick){ball.vx+=nx*kick;ball.vy+=ny*kick}return true;
  }
  function hitFlipper(ball,f){
    const tx=f.p.x+Math.cos(f.ph)*f.len,ty=f.p.y+Math.sin(f.ph)*f.len,dx=tx-f.p.x,dy=ty-f.p.y,l2=dx*dx+dy*dy;
    const u=clamp(((ball.x-f.p.x)*dx+(ball.y-f.p.y)*dy)/l2,0,1),rad=9-4*u,cx2=f.p.x+dx*u,cy2=f.p.y+dy*u;let nx=ball.x-cx2,ny=ball.y-cy2;const d=Math.hypot(nx,ny);
    if(d>=R+rad||d===0)return;nx/=d;ny/=d;ball.x=cx2+nx*(R+rad);ball.y=cy2+ny*(R+rad);
    const rx=cx2-f.p.x,ry=cy2-f.p.y,vfx=-f.w*ry,vfy=f.w*rx,vrn=(ball.vx-vfx)*nx+(ball.vy-vfy)*ny;
    if(vrn<0){ball.vx-=(1.25)*vrn*nx;ball.vy-=(1.25)*vrn*ny}
  }
  function drain(ball){
    bs.splice(bs.indexOf(ball),1);
    if(saveT>0){if(!multiT)saveUsed=true;say('BALL SAVED','',1.4);if(bs.length)autoLaunch();else{toPlunger();state='launch'}return}
    if(bs.length){if(bs.length===1&&multiT){multiT=0;jackpot=0;say('MULTIBALL OVER','',1.4)}return}
    lives--;saveUsed=false;multiT=0;jackpot=0;superT=0;beep(160,300,'sawtooth');S.shake();
    if(lives<=0){state='over';const nb=best('pinball',score);say('GAME OVER',score.toLocaleString(),99);st(`Game over! Final score ${score.toLocaleString()}.${nb?' New best!':''} Tap or press Space to play again.`)}
    else{toPlunger();say(`BALL ${4-lives}`,'GET READY');st(`${lives} ball${lives>1?'s':''} left. Hold and release to launch.`)}
  }
  function stepBall(ball,dt){
    if(ball.cap>0){ball.cap-=dt;ball.x=saucer.x;ball.y=saucer.y;ball.vx=ball.vy=0;if(ball.cap<=0){ball.vx=280+Math.random()*60;ball.vy=-420;ball.x=saucer.x+14;ball.y=saucer.y-6;beep(500,120,'square');fx.add(saucer.x,saucer.y,'#FFC53D',18,220)}return}
    if(ball.x>320&&ball.y>560+OY&&ball.vy>=0&&state==='play'){if(bs.length===1){const keep=saveT;toPlunger();saveT=keep}else{ball.vy=-1500}return}
    if(Math.hypot(ball.vx,ball.vy)<25&&!FL[0].key&&!FL[1].key){ball.still+=dt;if(ball.still>1.5){ball.still=0;ball.vx+=(ball.x<167?1:-1)*(140+Math.random()*80);ball.vy-=260;say('NUDGE','',.8);beep(200,80)}}else ball.still=0;
    ball.vy+=G*dt;const sp=Math.hypot(ball.vx,ball.vy);if(sp>1700){ball.vx*=1700/sp;ball.vy*=1700/sp}
    const py=ball.y,pxx=ball.x;ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
    for(const sg of segs)hitSeg(ball,sg);
    for(const q of targets)if(q.up&&hitSeg(ball,{a:q.a,b:q.b,e:.35,kind:'wall'})){q.up=false;q.hit=.3;pts(300,q.a.x-14,q.a.y+10,'#FFC53D');beep(700,60);if(targets.every(z=>!z.up)){pts(5000,250,320+OY,'#FFC53D');say('TARGETS DOWN','+5,000');flash=.15;beep(1000,200);setTimeout(()=>targets.forEach(z=>z.up=true),900)}}
    for(const b of bumpers)if(hitCircle(ball,b,.9,300)){b.hit=.2;const v=superT>0?500:100;pts(v,b.x,b.y-24,superT>0?'#FF5D73':'#2EC4B6');beep(380+rand(3)*80,50,'square');flash=Math.max(flash,.05);fx.add(b.x,b.y,superT>0?'#FF5D73':'#2EC4B6',10,200);bumpCount++}
    for(const p of posts)hitCircle(ball,p,.3,0);
    for(const f of FL)hitFlipper(ball,f);
    for(const l of lanes)if(Math.hypot(ball.x-l.x,ball.y-l.y)<14&&ball.vy>0&&!l.cool){l.cool=true;if(!l.on){l.on=true;pts(500,l.x,l.y+20);beep(900,50)}if(lanes.every(z=>z.on)){mult=Math.min(5,mult+1);lanes.forEach(z=>z.on=false);say(`MULTIPLIER ×${mult}`,'',1.8);flash=.12;beep(1100,200)}}
    for(const l of lanes)if(Math.hypot(ball.x-l.x,ball.y-l.y)>22)l.cool=false;
    for(const l of inl)if(Math.hypot(ball.x-l.x,ball.y-l.y)<12&&ball.vy>0&&!l.cool){l.cool=true;if(!l.on){l.on=true;pts(1000,l.x,l.y-14,'#B06CFF');beep(1000,60)}if(inl.every(z=>z.on)){inl.forEach(z=>z.on=false);superT=20;say('SUPER BUMPERS!','20 SECONDS',2);flash=.15;beep(1200,220)}}
    for(const l of inl)if(Math.hypot(ball.x-l.x,ball.y-l.y)>20)l.cool=false;
    if(pxx<spinner.x1&&pxx>spinner.x0&&((py>spinner.y&&ball.y<=spinner.y)||(py<spinner.y&&ball.y>=spinner.y))){const s=Math.min(14,Math.round(Math.abs(ball.vy)/110));spinner.spin+=s;pts(100*Math.max(1,s),spinner.x1+12,spinner.y,'#5FD8CC')}
    if(ball.y<90+OY&&Math.abs(ball.x-167)<20&&ball.vx<-500&&!ball.orb){ball.orb=true;pts(2000,167,110+OY,'#FFAA6B');say('ORBIT!','+2,000',1.2);beep(1100,90)}
    if(ball.x>220||ball.y>140+OY)ball.orb=false;
    if(!ball.cap&&Math.hypot(ball.x-saucer.x,ball.y-saucer.y)<saucer.r&&Math.hypot(ball.vx,ball.vy)<900&&!bs.some(o=>o!==ball&&o.cap>0)){
      ball.cap=1.3;saucer.glow=1.3;beep(220,200,'triangle');
      if(multiT>0){pts(jackpot,saucer.x+40,saucer.y-20,'#FFC53D');say('JACKPOT!',jackpot.toLocaleString(),2);flash=.35;shakeT=.4;S.shake();jackpot+=10000;FX.confetti(60)}
      else{saucer.hits++;pts(2500,saucer.x+40,saucer.y-20,'#FFC53D');if(saucer.hits>=3){saucer.hits=0;startMulti()}else say('SAUCER',`${3-saucer.hits} MORE FOR MULTIBALL`,1.6)}
    }
    if(ball.y>H+20)drain(ball);
  }
  function collideBalls(){
    for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++){const a2=bs[i],b2=bs[j];if(a2.cap||b2.cap)continue;let nx=b2.x-a2.x,ny=b2.y-a2.y;const d=Math.hypot(nx,ny);if(d>=2*R||d===0)continue;nx/=d;ny/=d;const o=(2*R-d)/2;a2.x-=nx*o;a2.y-=ny*o;b2.x+=nx*o;b2.y+=ny*o;
      const rv=(b2.vx-a2.vx)*nx+(b2.vy-a2.vy)*ny;if(rv<0){a2.vx+=rv*nx;a2.vy+=rv*ny;b2.vx-=rv*nx;b2.vy-=rv*ny}}
  }
  function step(dt){
    for(const f of FL){const tgt=f.key?f.upA:f.rest,sp=f.key?20:11,dir=Math.sign(tgt-f.ph);const nv=f.ph+dir*sp*dt;
      if((dir>0&&nv>=tgt)||(dir<0&&nv<=tgt)||dir===0){f.w=0;f.ph=tgt}else{f.w=dir*sp;f.ph=nv}}
    if(state==='launch'){if(charging)charge=Math.min(1,charge+dt*1.1);bs[0].x=333;bs[0].y=592+OY-R+charge*14;return}
    for(const ball of bs.slice()){stepBall(ball,dt);if(state!=='play')return}
    collideBalls();
  }
  // drawing helpers
  function glowLine(a2,b2,col,w,blur){x.strokeStyle=col;x.lineWidth=w;x.shadowColor=col;x.shadowBlur=blur;x.beginPath();x.moveTo(a2.x,a2.y);x.lineTo(b2.x,b2.y);x.stroke();x.shadowBlur=0}
  function dmdText(txt,cx0,cy0,size,col){x.font=`${size}px ${DISPLAY}`;x.textAlign='center';x.textBaseline='middle';x.shadowColor=col;x.shadowBlur=10;x.fillStyle=col;x.fillText(txt,cx0,cy0);x.shadowBlur=0;x.textBaseline='alphabetic'}
  S.loop(dt=>{
    t+=dt;flash=Math.max(0,flash-dt);shakeT=Math.max(0,shakeT-dt);show+=dt;
    if(state!=='over'){const h=dt/SUB;for(let i=0;i<SUB;i++)step(h);if(state==='play')saveT=Math.max(0,saveT-dt);superT=Math.max(0,superT-dt);if(multiT>0&&bs.length>1)multiT=Math.max(1,multiT-dt*0)}
    for(const b of bumpers)b.hit=Math.max(0,b.hit-dt);for(const sg of segs)if(sg.hit)sg.hit=Math.max(0,sg.hit-dt);
    spinner.ang+=spinner.spin*dt*18;spinner.spin=Math.max(0,spinner.spin-dt*6);saucer.glow=Math.max(0,saucer.glow-dt);
    for(const b2 of bs){b2.trail.push([b2.x,b2.y]);if(b2.trail.length>9)b2.trail.shift()}
    x.save();if(shakeT>0)x.translate((Math.random()-.5)*8*shakeT/.4,(Math.random()-.5)*8*shakeT/.4);
    // playfield
    const g=x.createLinearGradient(0,0,0,H);const pulse=multiT>0?.5+.5*Math.sin(t*6):0;
    g.addColorStop(0,multiT>0?`rgb(${40+pulse*30},20,${80+pulse*30})`:'#1B1E5E');g.addColorStop(1,'#2C1F63');x.fillStyle=g;x.fillRect(-10,-10,W+20,H+20);
    x.strokeStyle='rgba(255,255,255,.05)';x.lineWidth=1;for(let i=-H;i<W;i+=26){x.beginPath();x.moveTo(i,OY);x.lineTo(i+H,H+OY);x.stroke()}
    // star insert and arrow inserts
    x.save();x.translate(167,370+OY);x.rotate(t*.3);x.fillStyle=superT>0?'rgba(255,93,115,.22)':'rgba(255,197,61,.12)';x.beginPath();for(let i=0;i<10;i++){const a2=i*Math.PI/5-Math.PI/2,rr3=i%2?18:44;x.lineTo(Math.cos(a2)*rr3,Math.sin(a2)*rr3)}x.fill();x.restore();
    const arrows=[[80,318,'#FF5D73',inl[0].on],[254,318,'#2EC4B6',inl[1].on],[56,226,'#FFC53D',saucer.hits>0||multiT>0],[290,240,'#FFC53D',targets.some(q=>!q.up)]];
    for(const[ax,ay,c2,on]of arrows){x.fillStyle=c2;x.globalAlpha=on?.95:.18+.18*Math.sin(t*4+ax);x.shadowColor=c2;x.shadowBlur=on?14:0;x.beginPath();x.moveTo(ax,ay+OY-14);x.lineTo(ax+10,ay+OY+4);x.lineTo(ax-10,ay+OY+4);x.fill();x.shadowBlur=0;x.globalAlpha=1}
    // chaser lights along the arc
    const spd=multiT>0?18:state==='launch'?6:9;
    lights.forEach((l,i)=>{const ph=(i-t*spd)%6;const on=((ph%6)+6)%6<1.4;const col=['#FF5D73','#FFC53D','#2EC4B6','#9FA9FF','#B06CFF','#FF8A3D'][Math.floor(i/6+t*(multiT?3:0))%6];x.fillStyle=on?col:'rgba(255,255,255,.12)';x.shadowColor=col;x.shadowBlur=on?10:0;x.beginPath();x.arc(l.x,l.y,on?3.2:2.2,0,7);x.fill()});x.shadowBlur=0;
    // walls with neon glow
    x.lineCap='round';x.lineJoin='round';
    for(const sg of segs){if(sg.kind==='sling')continue;glowLine(sg.a,sg.b,sg.kind==='post'?'#C9CEFF':'#8F9BFF',sg.kind==='post'?5:5,sg.kind==='post'?4:8)}
    for(const[A,B,C]of SL){const sg=segs.find(s2=>s2.kind==='sling'&&s2.a===A);const hot=sg&&sg.hit>0;x.fillStyle=hot?'rgba(255,255,255,.5)':'rgba(255,93,115,.25)';x.beginPath();x.moveTo(A.x,A.y);x.lineTo(B.x,B.y);x.lineTo(C.x,C.y);x.fill();glowLine(A,C,hot?'#FFFFFF':'#FF5D73',7,hot?20:10)}
    // lanes, inlanes, targets
    for(const l of lanes){x.fillStyle=l.on?'#FFC53D':'rgba(255,255,255,.18)';x.shadowColor='#FFC53D';x.shadowBlur=l.on?16:0;x.beginPath();x.arc(l.x,l.y,7,0,7);x.fill();x.shadowBlur=0}
    for(const l of inl){x.fillStyle=l.on?'#B06CFF':'rgba(176,108,255,.25)';x.shadowColor='#B06CFF';x.shadowBlur=l.on?16:0;x.beginPath();x.arc(l.x,l.y,6,0,7);x.fill();x.shadowBlur=0}
    x.fillStyle='rgba(255,255,255,.55)';x.font=`9px ${DISPLAY}`;x.textAlign='center';x.fillText(`LANES → ×${Math.min(5,mult+1)}`,167,108+OY);
    for(const q of targets){q.hit=Math.max(0,q.hit-dt);glowLine(q.a,q.b,q.up?'#FFC53D':'rgba(255,197,61,.2)',q.up?7:3,q.up?10:0)}
    // spinner
    const sw=Math.abs(Math.cos(spinner.ang));x.fillStyle='#5FD8CC';x.shadowColor='#5FD8CC';x.shadowBlur=spinner.spin>0?14:4;x.fillRect(spinner.x0+2,spinner.y-3*sw,spinner.x1-spinner.x0-4,Math.max(1.5,6*sw));x.shadowBlur=0;
    x.fillStyle='#C9CEFF';x.beginPath();x.arc(spinner.x0+1,spinner.y,2.5,0,7);x.arc(spinner.x1-1,spinner.y,2.5,0,7);x.fill();
    // saucer
    x.fillStyle='#0B0C2A';x.beginPath();x.arc(saucer.x,saucer.y,saucer.r+2,0,7);x.fill();
    for(let i=0;i<10;i++){const a2=i/10*Math.PI*2+t*(saucer.glow?8:1.5),on=saucer.glow>0||multiT>0?i%2===Math.floor(t*8)%2:i<saucer.hits*3+1;x.fillStyle=on?'#FFC53D':'rgba(255,197,61,.25)';x.beginPath();x.arc(saucer.x+Math.cos(a2)*(saucer.r+7),saucer.y+Math.sin(a2)*(saucer.r+7),2.4,0,7);x.fill()}
    if(multiT>0){dmdText('JACKPOT',saucer.x+2,saucer.y+28,8,'#FFC53D')}
    // bumpers
    for(const b of bumpers){const s2=1+b.hit*1.3,ring=superT>0?'#FF5D73':'#2EC4B6';x.shadowColor=ring;x.shadowBlur=b.hit?28:10+6*Math.sin(t*5+b.x);x.fillStyle=b.hit?'#FFFFFF':ring;x.beginPath();x.arc(b.x,b.y,b.r*s2,0,7);x.fill();x.shadowBlur=0;
      x.fillStyle='#1B1E5E';x.beginPath();x.arc(b.x,b.y,b.r*.62,0,7);x.fill();x.fillStyle=superT>0?'#FFC53D':'#FF5D73';x.beginPath();x.arc(b.x,b.y,b.r*.38,0,7);x.fill();
      x.fillStyle='rgba(255,255,255,.7)';x.beginPath();x.arc(b.x-b.r*.15,b.y-b.r*.15,b.r*.12,0,7);x.fill()}
    for(const p of posts){x.fillStyle='#C9CEFF';x.beginPath();x.arc(p.x,p.y,p.r,0,7);x.fill()}
    // flippers
    for(const f of FL){const tx=f.p.x+Math.cos(f.ph)*f.len,ty=f.p.y+Math.sin(f.ph)*f.len,nx=-(ty-f.p.y)/f.len,ny=(tx-f.p.x)/f.len;
      x.shadowColor='#FFC53D';x.shadowBlur=f.key?18:6;x.fillStyle=f.key?'#FFE27A':'#FFC53D';x.beginPath();x.arc(f.p.x,f.p.y,9,0,7);x.arc(tx,ty,5,0,7);x.fill();x.beginPath();x.moveTo(f.p.x+nx*9,f.p.y+ny*9);x.lineTo(tx+nx*5,ty+ny*5);x.lineTo(tx-nx*5,ty-ny*5);x.lineTo(f.p.x-nx*9,f.p.y-ny*9);x.fill();x.shadowBlur=0;
      x.fillStyle='#FF8A3D';x.beginPath();x.arc(f.p.x,f.p.y,4,0,7);x.fill()}
    // plunger
    const pyy=592+OY+charge*14;x.fillStyle='#8A8FB8';x.fillRect(326,pyy,14,H-pyy);x.fillStyle=charging?'#FF5D73':'#C9CEFF';x.shadowColor='#FF5D73';x.shadowBlur=charging?12*charge+4:0;x.fillRect(323,pyy,20,6);x.shadowBlur=0;
    if(state==='launch'){x.fillStyle='rgba(255,255,255,.75)';x.font=`9px ${DISPLAY}`;x.textAlign='center';x.fillText('PULL',333,H-8);for(let i=0;i<5;i++){x.fillStyle=`rgba(255,197,61,${(Math.sin(t*6-i)+1)/2*.8})`;x.beginPath();x.moveTo(333,560+OY-i*22);x.lineTo(339,568+OY-i*22);x.lineTo(327,568+OY-i*22);x.fill()}}
    // balls with trails
    for(const b2 of bs){b2.trail.forEach(([tx2,ty2],i)=>{x.fillStyle=`rgba(159,169,255,${i/b2.trail.length*.35})`;x.beginPath();x.arc(tx2,ty2,R*i/b2.trail.length,0,7);x.fill()});
      if(state==='over')continue;const bg=x.createRadialGradient(b2.x-3,b2.y-3,1,b2.x,b2.y,R);bg.addColorStop(0,'#FFFFFF');bg.addColorStop(.5,'#C9CEFF');bg.addColorStop(1,'#6E7391');x.fillStyle=bg;x.shadowColor='#fff';x.shadowBlur=8;x.beginPath();x.arc(b2.x,b2.y,R,0,7);x.fill();x.shadowBlur=0}
    if(saveT>0&&state==='play'){x.globalAlpha=.5+.5*Math.sin(t*10);dmdText('BALL SAVE',167,584+OY,11,'#2EC4B6');x.globalAlpha=1}
    if(superT>0){dmdText(`SUPER BUMPERS ${Math.ceil(superT)}`,167,300+OY,9,'#FF5D73')}
    // score pop-ups
    for(const p of pops){p.t+=dt;x.globalAlpha=Math.max(0,1-p.t/0.9);dmdText(p.txt,p.x,p.y-p.t*40,11,p.col)}x.globalAlpha=1;pops=pops.filter(p=>p.t<.9);
    fx.draw(x,dt);
    x.restore();
    // flash overlay
    if(flash>0){x.fillStyle=`rgba(255,255,255,${Math.min(.5,flash*2)})`;x.fillRect(0,0,W,H)}
    // dot-matrix display
    x.fillStyle='#0B0A1E';x.fillRect(0,0,W,OY);
    let msg=dmd[0];if(msg){msg.d-=dt;if(msg.d<=0)dmd.shift()}
    if(msg){const blink=Math.floor(t*6)%2;dmdText(msg.a,W/2,msg.b?13:21,msg.b?14:19,blink&&/!/.test(msg.a)?'#FFFFFF':'#FF9A3D');if(msg.b)dmdText(msg.b,W/2,30,10,'#FFC53D')}
    else{dmdText(score.toLocaleString(),W/2,21,20,'#FF9A3D');x.font=`10px ${DISPLAY}`;x.textAlign='left';x.fillStyle='#FFC53D';x.fillText(`BALL ${'●'.repeat(Math.max(0,lives))}`,8,25);x.textAlign='right';x.fillText(`×${mult}${multiT>0?' ⚡':''}`,W-8,25)}
    x.fillStyle='rgba(0,0,0,.35)';for(let yy=0;yy<OY;yy+=3)x.fillRect(0,yy,W,1);for(let xx=0;xx<W;xx+=3)x.fillRect(xx,0,1,OY);
    if(state==='over'){x.fillStyle='rgba(0,0,0,.55)';x.fillRect(0,OY,W,H);x.fillStyle='#fff';x.textAlign='center';x.font=`32px ${DISPLAY}`;x.fillText('Game over',W/2,H/2-16);x.font=`18px ${DISPLAY}`;x.fillText(score.toLocaleString(),W/2,H/2+14);x.font=`13px ${DISPLAY}`;x.fillText('Tap to play again',W/2,H/2+42)}
  });
}

/* Fuse Jumper: a bomb-collecting platform jumper. High jumps, gliding, lit-fuse order bonus, enemies, power ball */
const FJLAY=[
  {p:[[60,330,90],[250,330,90],[150,220,100]],sky:'pyramids'},
  {p:[[30,360,80],[290,360,80],[120,270,160],[40,170,80],[280,170,80]],sky:'city'},
  {p:[[140,380,120],[20,280,90],[290,280,90],[150,180,100]],sky:'castle'},
  {p:[[60,390,80],[260,390,80],[160,300,80],[60,210,80],[260,210,80],[160,120,80]],sky:'temple'}
];
function fuse(root,S){
  const st=status(root,'Collect every bomb. Grab the glowing lit bomb for double points. Catch ❤ for an extra life and avoid the enemies!');
  /* portrait phones: a taller scene with the hand-made layouts stretched vertically by SY (at most 1.4).
     A held jump rises ~212px; the largest climb in any layout (122px) becomes at most 171px, so every
     platform stays reachable, and bombs are never placed higher than a jump from the top platform reaches. */
  const W=400,H=tall(400,480,800,52),SY=Math.min(1.4,(H-62)/418),{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();const k=held(S);
  const GY=Math.round(34+418*SY),PW=16,PH=24;let bTop=40;
  let lvl=1,score=0,lives=3,mult=1,lay,plats,bombs,litI,litCount,en,me,power=0,pball,bball,spawnT,state,t=0,deadT=0,clearT=0,collected,lball=null,sched=[],levelT=0,gapT=0,lifeAt=8,moveDir=0,jumpHeld=false,downHeld=false,dropT=0,eaten=0;
  const stars=[...Array(Math.round(40*SY))].map(()=>({x:rand(W),y:rand(260*SY),s:Math.random()}));
  const bombTotal=()=>Math.min(40,24+Math.floor((lvl-1)/2)*2);
  function makeBombs(){
    const N=bombTotal();
    const out=[],tries=[];
    const free=(bx,by)=>by<GY-14&&by>bTop&&bx>18&&bx<W-18&&!plats.some(p=>bx>p.x-14&&bx<p.x+p.w+14&&by>p.y-18&&by<p.y+22)&&!out.some(b=>Math.hypot(b.x-bx,b.y-by)<30);
    const shapes=[(cx,cy,i)=>[cx+i*30-45,cy],(cx,cy,i)=>[cx,cy+i*30-45],(cx,cy,i)=>[cx+Math.cos(i*1.57)*34,cy+Math.sin(i*1.57)*34]];
    let guard=0;
    while(out.length<N&&guard<6000){guard++;const sh=shapes[rand(3)],cx=60+rand(W-120),cy=bTop+30+rand(GY-100-bTop);const grp=[0,1,2,3].map(i=>sh(cx,cy,i));if(grp.every(([bx,by])=>free(bx,by)))for(const[bx,by]of grp)if(out.length<N)out.push({x:bx,y:by,got:false})}
    for(let g2=0;out.length<N&&g2<20000;g2++){const bx=30+rand(W-60),by=bTop+20+rand(GY-70-bTop);if(free(bx,by))out.push({x:bx,y:by,got:false})}
    return out;
  }
  function startLevel(){
    lay=FJLAY[(lvl-1)%FJLAY.length];const mir=Math.floor((lvl-1)/FJLAY.length)%2===1;plats=lay.p.map(([px,py,w])=>({x:mir?W-px-w:px,y:Math.round(34+(py-34)*SY),w}));bTop=Math.max(40,Math.min(...plats.map(p=>p.y))-225);
    lball=null;levelT=0;gapT=0;sched=[{k:'P',at:5+rand(8)},{k:'B',at:6+rand(13)}];if(Math.random()<.5)sched.push({k:'P',at:15+rand(7)});if(Math.random()<.5)sched.push({k:'L',at:8+rand(12)});sched.sort((p,q)=>p.at-q.at);bombs=makeBombs();litI=rand(bombs.length);litCount=0;collected=0;en=[];pball=null;bball=null;power=0;spawnT=1.5;
    me={x:W/2,y:GY-PH,vx:0,vy:0,ground:true,face:1,jT:0,inv:2,walk:0};state='ready';S.show(lvl);
  }
  function respawn(){me={x:W/2,y:GY-PH,vx:0,vy:0,ground:true,face:1,jT:0,inv:2.5,walk:0};en.forEach(e=>{e.y=-30;e.x=rand(W);e.kind='walker';e.age=0;e.vx=(rand(2)?1:-1)*45})}
  startLevel();st('Collect every bomb. Grab the glowing lit bomb for double points. Catch ❤ for an extra life and avoid the enemies!');
  function jumpDown(){
    if(state==='over'){lvl=1;score=0;lives=3;mult=1;startLevel();return}
    if(state==='ready')state='play';
    jumpHeld=true;if(me.ground){me.vy=-470;me.ground=false;me.jT=.32;beep(520,60)}
    else if(me.vy<0){me.vy=0;me.jT=0;beep(380,40)}
  }
  function jumpUp(){jumpHeld=false;me.jT=0}
  function downOn(){if(state==='ready'){state='play'}downHeld=true;if(me.ground&&me.y+PH<GY-2){dropT=.22;me.ground=false;me.vy=120}}
  function downOff(){downHeld=false}
  S.on(window,'keydown',e=>{if(e.repeat)return;if(e.key===' '||e.key==='ArrowUp'||e.key==='w'||e.key==='W'){e.preventDefault();jumpDown()}if(e.key==='ArrowDown'||e.key==='s'||e.key==='S'){e.preventDefault();downOn()}});
  S.on(window,'keyup',e=>{if(e.key===' '||e.key==='ArrowUp'||e.key==='w'||e.key==='W')jumpUp();if(e.key==='ArrowDown'||e.key==='s'||e.key==='S')downOff()});
  const pad=el('div','row bpad',root);
  controls(pad,S,{axis:'x',onMove:v=>{moveDir=v;if(v&&state==='ready')state='play'}});
  const bw=el('div','fjbtns',pad);
  const db=el('button','btn ghost fjdown',bw,'⤓');db.setAttribute('aria-label','Drop down');
  S.on(db,'pointerdown',e=>{e.preventDefault();restartAnim(db,'hit');downOn()});['pointerup','pointercancel','pointerleave'].forEach(ev=>S.on(db,ev,downOff));
  const jb=el('button','btn bfire',bw,'⤒');jb.setAttribute('aria-label','Jump');
  S.on(jb,'pointerdown',e=>{e.preventDefault();restartAnim(jb,'hit');jumpDown()});['pointerup','pointercancel','pointerleave'].forEach(ev=>S.on(jb,ev,jumpUp));
  function lightNext(fromI){
    const left=bombs.map((b,i)=>[b,i]).filter(([b])=>!b.got);if(!left.length){litI=-1;return}
    const f=bombs[fromI];left.sort((a,b2)=>Math.hypot(a[0].x-f.x,a[0].y-f.y)-Math.hypot(b2[0].x-f.x,b2[0].y-f.y));litI=left[0][1];
  }
  function grab(i){
    const b=bombs[i];b.got=true;collected++;
    if(i===litI){litCount++;const v=200*mult;score+=v;fx.add(b.x,b.y,'#FFC53D',16,200);beep(1000,70);lightNext(i)}
    else{score+=100*mult;fx.add(b.x,b.y,K.c4,8,140);beep(760,50)}
    trySpecial();
    checkClear();
  }
  function checkClear(){
    if(collected===bombs.length&&state==='play'){state='clear';clearT=0;const nb2=bombs.length,bonus=litCount>=nb2-4?50000:litCount>=Math.round(nb2*.62)?20000:litCount*500;score+=bonus;FX.confetti(80);beep(990,250);
      const lb=`${litCount} lit bomb${litCount===1?'':'s'}`;S.fx.toast(`Level ${lvl} clear!`,`${lb} · +${bonus.toLocaleString()}`);st(`Level clear! ${lb} for a ${bonus.toLocaleString()} bonus.`)}
  }
  function trySpecial(){
    // one bonus ball at a time, never in the first 12s of a level, at least 8s apart
    if(pball||bball||lball||levelT<12||gapT>0||!sched.length||collected<sched[0].at)return;
    const it=sched.shift(),mk=()=>({x:rand(W-80)+40,y:60,vx:80*(rand(2)?1:-1),vy:60,life:10});
    if(it.k==='P')pball=mk();else if(it.k==='B'){if(mult<5)bball=mk()}else if(lives<3)lball=mk();
  }
  function hurt(){
    if(me.inv>0)return;lives--;S.shake();beep(150,350,'sawtooth');fx.add(me.x,me.y+PH/2,K.c1,28,240);
    if(lives<=0){state='over';deadT=0;const nb=best('fuse',score);st(`Game over on level ${lvl}. Score ${score.toLocaleString()}.${nb?' New best!':''} Jump to play again.`)}
    else{respawn();st(`Ouch! ${lives} ${lives===1?'life':'lives'} left.`)}
  }
  // flying enemies: box is x±10, y+2..y+18; platforms are 10px tall slabs, the floor is solid
  const flyHit=(fx2,fy2)=>fy2+18>GY||plats.some(p=>fx2+10>p.x&&fx2-10<p.x+p.w&&fy2+18>p.y&&fy2+2<p.y+10);
  function flyMove(e,dt){
    if(flyHit(e.x,e.y)){e.y-=60*dt;return}
    const nx=clamp(e.x+e.vx*dt,10,W-10);
    if(flyHit(nx,e.y))e.vx*=-.3;else e.x=nx;
    const ny=clamp(e.y+e.vy*dt,36,GY-18);
    if(flyHit(e.x,ny)){
      const p=plats.find(q=>e.x+10>q.x&&e.x-10<q.x+q.w&&ny+18>q.y&&ny+2<q.y+10);
      e.vy*=-.2;if(p){const toL=e.x-(p.x-14),toR=(p.x+p.w+14)-e.x;e.vx+=(toL<toR?-1:1)*160*dt*4}
    }else e.y=ny;
  }
  const onPlat=(px,py,pw)=>{if(py>=GY-1)return GY;for(const p of plats)if(px+pw/2>p.x&&px-pw/2<p.x+p.w&&Math.abs(py-p.y)<2)return p.y;return null};
  function moveBody(o,w,h,dt){
    const py0=o.y;o.x+=o.vx*dt;o.y+=o.vy*dt;o.ground=false;
    if(o.x<w/2){o.x=w/2;o.vx=Math.abs(o.vx)*(o.bounce?1:0)}if(o.x>W-w/2){o.x=W-w/2;o.vx=-Math.abs(o.vx)*(o.bounce?1:0)}
    if(o.y<34){o.y=34;if(o.vy<0)o.vy=0}
    if(o.y+h>=GY&&o.vy>=0){o.y=GY-h;o.vy=0;o.ground=true}
    if(!o.thru)for(const p of plats){if(o.x+w/2<=p.x||o.x-w/2>=p.x+p.w)continue;
      if(o.vy>=0&&py0+h<=p.y+1&&o.y+h>=p.y){o.y=p.y-h;o.vy=0;o.ground=true}
      else if(o.vy<0&&py0>=p.y+10-1&&o.y<=p.y+10){o.y=p.y+10;o.vy=0;o.jT=0}}
  }
  S.loop(dt=>{
    t+=dt;
    if(state==='play'){
      me.inv=Math.max(0,me.inv-dt);power=Math.max(0,power-dt);
      let dir=moveDir;if(k.ArrowLeft||k.a||k.A)dir=-1;if(k.ArrowRight||k.d||k.D)dir=1;
      me.vx=dir*170;if(dir){me.face=dir;if(me.ground)me.walk+=dt*14}else me.walk=0;
      const g=me.jT>0&&jumpHeld?260:1000;me.jT=Math.max(0,me.jT-dt);me.vy+=g*dt;
      if(downHeld&&!me.ground){me.jT=0;me.vy=me.vy<0?me.vy+1300*dt:Math.min(700,Math.max(me.vy,140)+600*dt)}
      else if(jumpHeld&&me.vy>0&&!me.ground)me.vy=Math.min(me.vy,70);
      dropT=Math.max(0,dropT-dt);me.thru=dropT>0;
      moveBody(me,PW,PH,dt);
      bombs.forEach((b,i)=>{if(!b.got&&Math.abs(b.x-me.x)<16&&Math.abs(b.y-(me.y+PH/2))<20)grab(i)});
      // enemies
      spawnT-=dt;const cap=Math.min(7,1+Math.ceil(lvl*.8)+Math.floor(collected/8));
      if(spawnT<=0&&en.length<cap){en.push({x:30+rand(W-60),y:40,vx:(rand(2)?1:-1)*(45+lvl*4),vy:0,kind:'walker',age:0,ground:false,safe:3});spawnT=Math.max(2.2,5-lvl*.3)}
      for(const e of en){
        e.age+=dt;e.safe=Math.max(0,(e.safe||0)-dt);
        if(e.kind==='walker'){e.vy=e.safe>0&&!e.ground?Math.min(e.vy+900*dt,55):e.vy+900*dt;if(e.safe>0&&!e.ground)e.vx*=.98;e.bounce=true;moveBody(e,18,20,dt);if(e.ground&&!onPlat(e.x+Math.sign(e.vx)*12,e.y+20,4))e.vx*=-1;if(e.age>6+rand(4)){e.kind='bird';e.vy=-60}}
        else{const sp=60+lvl*8+Math.min(40,e.age*2),ax=me.x-e.x,ay=me.y-e.y,d=Math.hypot(ax,ay)||1;e.vx+=(ax/d*sp-e.vx)*dt*1.2;e.vy+=(ay/d*sp-e.vy)*dt*1.2+Math.sin(t*3+e.age)*8*dt;flyMove(e,dt)}
        if(!e.safe&&Math.abs(e.x-me.x)<16&&Math.abs(e.y+10-(me.y+PH/2))<20){
          if(power>0){e.dead=true;eaten++;const v=[100,200,500,1000,2000][Math.min(4,eaten-1)]*mult;score+=v;fx.add(e.x,e.y,K.c2,18,200);beep(1200,80);S.fx.toast(`+${v}`)}
          else hurt();
        }
      }
      en=en.filter(e=>!e.dead);
      levelT+=dt;const had=!!(pball||bball||lball);
      if(pball&&(pball.life-=dt)<=0)pball=null;if(bball&&(bball.life-=dt)<=0)bball=null;if(lball&&(lball.life-=dt)<=0)lball=null;
      if(had&&!(pball||bball||lball))gapT=8;gapT=Math.max(0,gapT-dt);
      trySpecial();
      for(const ob of[pball,bball,lball]){if(!ob)continue;ob.x+=ob.vx*dt;ob.y+=ob.vy*dt;if(ob.x<12||ob.x>W-12)ob.vx*=-1;if(ob.y<40||ob.y>GY-12)ob.vy*=-1}
      if(pball&&Math.hypot(pball.x-me.x,pball.y-(me.y+PH/2))<22){pball=null;gapT=8;power=6;eaten=0;S.fx.toast('POWER!','Enemies turn to coins');beep(880,120);setTimeout(()=>beep(1320,160),120)}
      if(lball&&Math.hypot(lball.x-me.x,lball.y-(me.y+PH/2))<22){lball=null;gapT=8;lives=Math.min(3,lives+1);fx.add(me.x,me.y,'#FF5D73',24,200);S.fx.toast('❤️ Extra life!');beep(990,120);setTimeout(()=>beep(1320,200),120)}
      if(bball&&Math.hypot(bball.x-me.x,bball.y-(me.y+PH/2))<22){bball=null;gapT=8;mult=Math.min(5,mult+1);S.fx.toast(`Bonus ×${mult}`);beep(1100,160)}
    }else if(state==='clear'){clearT+=dt;if(clearT>2.2){lvl++;startLevel();S.fx.toast(`Level ${lvl}`,`${bombTotal()} bombs · more enemies`);st(`Level ${lvl}. Jump to start.`)}}
    else if(state==='over')deadT+=dt;
    drawScene(dt);
  });
  function drawScene(dt){
    const sky=x.createLinearGradient(0,0,0,H),kind=lay.sky;
    const cols={pyramids:['#0F1446','#3B2A6B'],city:['#0B1033','#28356E'],castle:['#140C33','#3D2160'],temple:['#081A3A','#1F4A6B']}[kind];
    sky.addColorStop(0,cols[0]);sky.addColorStop(1,cols[1]);x.fillStyle=sky;x.fillRect(0,0,W,H);
    for(const s of stars){x.fillStyle=`rgba(255,255,255,${.3+.5*Math.abs(Math.sin(t*1.5+s.s*9))})`;x.fillRect(s.x,s.y,1.6,1.6)}
    x.fillStyle='#FFF4C2';x.shadowColor='#FFF4C2';x.shadowBlur=24;x.beginPath();x.arc(330,80,22,0,7);x.fill();x.shadowBlur=0;
    x.fillStyle='rgba(0,0,0,.28)';x.save();x.translate(0,GY);x.scale(1,SY);x.translate(0,-GY);
    if(kind==='pyramids'){for(const[px,pw,ph]of[[60,220,150],[230,170,110],[330,120,80]]){x.beginPath();x.moveTo(px-pw/2,GY);x.lineTo(px,GY-ph);x.lineTo(px+pw/2,GY);x.fill()}}
    else if(kind==='city'){for(let i=0;i<12;i++){const bw=24+(i*13)%22,bh=60+(i*47)%130;x.fillRect(i*34,GY-bh,bw,bh)}x.fillStyle='rgba(255,221,120,.25)';for(let i=0;i<12;i++)for(let j=0;j<8;j++)if((i*7+j*3)%4)x.fillRect(i*34+5,GY-20-j*16,4,6)}
    else if(kind==='castle'){x.fillRect(80,GY-140,240,140);for(let i=0;i<8;i++)x.fillRect(80+i*30,GY-156,16,16);x.fillRect(60,GY-190,50,190);x.fillRect(290,GY-190,50,190)}
    else{for(let i=0;i<6;i++){x.fillRect(40+i*60,GY-160,14,160)}x.fillRect(30,GY-176,340,18);x.beginPath();x.moveTo(30,GY-176);x.lineTo(200,GY-230);x.lineTo(370,GY-176);x.fill()}
    x.restore();
    // ground and platforms
    x.fillStyle='#5B3A29';x.fillRect(0,GY,W,H-GY);x.fillStyle='#8B5E3C';x.fillRect(0,GY,W,5);
    if(H-GY>50){x.fillStyle='rgba(0,0,0,.18)';for(let i=0;i<14;i++){x.beginPath();x.ellipse((i*97+31)%W,GY+18+(i*53)%(H-GY-26),5+i%3*3,3+i%2*2,0,0,7);x.fill()}}
    for(const p of plats){x.fillStyle='#E85D4A';rr(x,p.x,p.y,p.w,10,3);x.fill();x.strokeStyle='#7A2418';x.lineWidth=1.5;for(let bx=p.x+12;bx<p.x+p.w;bx+=12){x.beginPath();x.moveTo(bx,p.y+1);x.lineTo(bx,p.y+9);x.stroke()}x.fillStyle='rgba(255,255,255,.35)';x.fillRect(p.x+2,p.y+1,p.w-4,2)}
    // bombs
    bombs.forEach((b,i)=>{if(b.got)return;const lit=i===litI;
      const pul=lit?1+Math.sin(t*10)*.1:1;
      if(lit){x.fillStyle=`rgba(255,120,60,${.25+.2*Math.sin(t*12)})`;x.beginPath();x.arc(b.x,b.y+2,16*pul,0,7);x.fill();
}
      x.fillStyle='#1E1F3A';x.beginPath();x.arc(b.x,b.y+2,9*pul,0,7);x.fill();x.fillStyle=lit?'#8E2A3A':'#2B2E5E';x.beginPath();x.arc(b.x,b.y+2,8*pul,0,7);x.fill();
      x.fillStyle='rgba(255,255,255,.55)';x.beginPath();x.arc(b.x-3,b.y-1,2.4,0,7);x.fill();
      const fl=1,tipX=b.x+3+2*fl,tipY=b.y-5-9*fl;
      x.strokeStyle='#C9A66B';x.lineWidth=2;x.beginPath();x.moveTo(b.x+3,b.y-5);x.quadraticCurveTo(b.x+3+5*fl,b.y-5-6*fl,tipX,tipY);x.stroke();
      if(lit){for(let s2=0;s2<6;s2++){const a2=t*20+s2*1.05,rr2=3+Math.random()*4;x.fillStyle=['#FFF','#FFC53D','#FF8A3D','#FF5D73','#FFF','#FFC53D'][s2];x.beginPath();x.arc(tipX+Math.cos(a2)*rr2,tipY+Math.sin(a2)*rr2,1.7,0,7);x.fill()}
        x.shadowColor='#FFC53D';x.shadowBlur=16;x.fillStyle='#FFE27A';x.beginPath();x.arc(tipX,tipY,2.8,0,7);x.fill();x.shadowBlur=0;
}
    });
    for(const[ob,txt,col]of[[pball,'P','#2EC4B6'],[bball,'B','#FF8A3D'],[lball,'❤','#FF3D6E']]){if(!ob||(ob.life!=null&&ob.life<3&&Math.floor(t*8)%2))continue;x.fillStyle=col;x.shadowColor=col;x.shadowBlur=14;x.beginPath();x.arc(ob.x,ob.y,11,0,7);x.fill();x.shadowBlur=0;x.fillStyle='#fff';x.font=`13px ${DISPLAY}`;x.textAlign='center';x.textBaseline='middle';x.fillText(txt,ob.x,ob.y+1);x.textBaseline='alphabetic'}
    // enemies
    for(const e of en){
      if(e.safe>0){x.globalAlpha=.35+.35*(Math.floor(t*8)%2);if(!e.ground&&e.kind==='walker'){x.strokeStyle='rgba(255,255,255,.6)';x.lineWidth=1;x.beginPath();x.moveTo(e.x-8,e.y);x.lineTo(e.x,e.y-16);x.lineTo(e.x+8,e.y);x.stroke();x.fillStyle='rgba(255,255,255,.75)';x.beginPath();x.arc(e.x,e.y-18,10,Math.PI,0);x.fill()}}
      if(power>0){x.fillStyle=Math.floor(t*8)%2&&power<1.5?'#fff':'#FFC53D';x.beginPath();x.ellipse(e.x,e.y+10,9*Math.abs(Math.cos(t*6)),9,0,0,7);x.fill();continue}
      if(e.kind==='walker'){x.fillStyle='#EDE6D3';rr(x,e.x-9,e.y,18,20,6);x.fill();x.strokeStyle='#B9AE95';x.lineWidth=1.5;for(let i=0;i<4;i++){x.beginPath();x.moveTo(e.x-9,e.y+4+i*4);x.lineTo(e.x+9,e.y+6+i*4);x.stroke()}x.fillStyle='#FF3D5A';x.beginPath();x.arc(e.x-3,e.y+6,1.8,0,7);x.arc(e.x+3,e.y+6,1.8,0,7);x.fill()}
      else{const fl=Math.sin(t*16+e.age)*6;x.fillStyle='#B06CFF';x.beginPath();x.ellipse(e.x,e.y+10,9,7,0,0,7);x.fill();x.beginPath();x.moveTo(e.x-4,e.y+8);x.lineTo(e.x-16,e.y+2+fl);x.lineTo(e.x-6,e.y+13);x.moveTo(e.x+4,e.y+8);x.lineTo(e.x+16,e.y+2+fl);x.lineTo(e.x+6,e.y+13);x.fill();x.fillStyle='#FFC53D';x.beginPath();x.moveTo(e.x+(e.vx>0?8:-8),e.y+10);x.lineTo(e.x+(e.vx>0?14:-14),e.y+12);x.lineTo(e.x+(e.vx>0?8:-8),e.y+13);x.fill();x.fillStyle='#fff';x.beginPath();x.arc(e.x+(e.vx>0?3:-3),e.y+8,2,0,7);x.fill()}
    }
    x.globalAlpha=1;
    // hero
    if(state!=='over'&&!(me.inv>0&&Math.floor(t*12)%2)){
      const px=me.x,py=me.y,f=me.face,air=!me.ground,sw=me.walk?Math.sin(me.walk):0,cape=air?(me.vy<0?-4:6):sw*2;
      x.fillStyle='#E8283C';x.beginPath();x.moveTo(px-f*2,py+7);x.lineTo(px-f*14,py+16+cape);x.lineTo(px-f*10,py+22+cape);x.lineTo(px+f*2,py+16);x.fill();
      x.fillStyle='#2E5BFF';rr(x,px-7,py+7,14,11,4);x.fill();
      x.fillStyle='#1E2E9E';const l1=air?-3:sw*3;rr(x,px-6+l1,py+17,5,7,2);x.fill();rr(x,px+1-l1,py+17,5,7,2);x.fill();
      x.fillStyle='#FFD34D';x.fillRect(px-7,py+15,14,2.5);
      x.fillStyle='#FFD9B0';x.beginPath();x.arc(px,py+3,6.5,0,7);x.fill();
      x.fillStyle='#2E5BFF';x.beginPath();x.arc(px,py+1,7,Math.PI,0);x.fill();x.fillRect(px-7,py+1,14,2.5);
      x.fillStyle='#1E1F3A';x.fillRect(px-5+f*1.5,py+2,10,3);x.fillStyle='#fff';x.fillRect(px-3+f*2,py+2.6,2,1.8);x.fillRect(px+1+f*2,py+2.6,2,1.8);
      x.fillStyle='#FFD9B0';x.beginPath();x.arc(px+f*9,py+(air?4:11),2.6,0,7);x.fill();
    }
    fx.draw(x,dt);
    // HUD
    x.fillStyle='rgba(10,10,40,.7)';x.fillRect(0,0,W,30);x.font=`14px ${DISPLAY}`;x.textBaseline='middle';
    x.textAlign='left';x.fillStyle='#FFC53D';x.fillText(score.toLocaleString(),10,16);
    x.textAlign='center';x.fillStyle='#fff';x.fillText(`LV ${lvl}  ·  ×${mult}  ·  🔥${litCount}`,W/2,16);
    x.textAlign='right';x.fillStyle='#FF5D73';x.fillText('♥'.repeat(Math.max(0,lives)),W-10,16);x.textBaseline='alphabetic';
    if(power>0){x.fillStyle='#2EC4B6';x.fillRect(0,30,W*power/6,3)}
    if(state==='ready'){x.fillStyle='rgba(0,0,0,.35)';x.fillRect(0,H/2-44,W,82);x.fillStyle='#fff';x.textAlign='center';x.font=`24px ${DISPLAY}`;x.fillText(`Level ${lvl}`,W/2,H/2-8);x.font=`13px ${DISPLAY}`;x.fillText('Jump to start · grab the lit bombs in order',W/2,H/2+18)}
    if(state==='over'){x.fillStyle='rgba(0,0,0,.5)';x.fillRect(0,0,W,H);x.fillStyle='#fff';x.textAlign='center';x.font=`30px ${DISPLAY}`;x.fillText('Game over',W/2,H/2-10);x.font=`16px ${DISPLAY}`;x.fillText(score.toLocaleString(),W/2,H/2+18);x.font=`12px ${DISPLAY}`;x.fillText('Jump to play again',W/2,H/2+42)}
  }
}

/* ---------- registry ---------- */
const PAGES={"tictactoe": "tic-tac-toe.html", "memory": "memory-match.html", "whack": "whack-a-mole.html", "simon": "simon-says.html", "hangman": "hangman.html", "snake": "snake.html", "pong": "pong.html", "flappy": "flappy-bird.html", "tower": "tower-block.html", "crane": "sky-crane.html", "blobmaze": "blob-maze.html", "breakout": "breakout.html", "2048": "2048.html", "mines": "minesweeper.html", "sudoku": "sudoku.html", "bbtan": "brick-balls.html", "paper": "land-grab.html", "taxi": "rush-taxi.html", "solitaire": "solitaire.html", "helix": "helix-drop.html", "bubbles": "bubble-pop.html", "chess": "chess.html", "blast": "cannon-blast.html", "pinball": "pinball.html", "fuse": "fuse-jumper.html", "backgammon": "backgammon.html", "blockfill": "block-fill.html", "checkers": "checkers.html", "connect": "color-connect.html", "dots": "dots-and-boxes.html", "four": "four-in-a-row.html", "hanoi": "tower-of-hanoi.html", "pool": "billiards.html", "slide": "sliding-puzzle.html", "water": "water-sort.html", "woodblocks": "wood-blocks.html", "wordfind": "word-finder.html", "wordguess": "word-guess.html", "clash": "color-clash.html", "clashflip": "color-clash-flip.html", "rugs": "rug-market.html", "quad": "four-alike.html", "cubes": "cube-push.html", "pyramid": "ball-pyramid.html", "squadro": "shuttle-race.html", "quantik": "shape-grid.html", "qawale": "stone-sow.html", "walls": "wall-race.html", "pento": "pento-box.html", "wahoo": "wahoo.html", "jackaroo": "jackaroo.html"};
const BASE_TITLE=document.title;
/* Backgammon engine. A position is [white, red]; each side is an array of 26 counts in that side's own
   numbering: 1..24 points (the side moves from 24 toward 1 and its home is 1..6), 25 = bar, 0 = borne off.
   Point i for one side is point 25-i for the other. */
const BG_SHOTS=[0,11,12,14,15,15,17,6,6,5,3,2,3,0,0,1,1,0,1,0,1,0,0,0,1];
const BG_PV=[0,1,2,2.5,4,5,5,4,2,1,1,1,1,1,1,1,1,1,1,2,2.5,2.5,2,1.5,1.5];
const BG_E=(()=>{
  const start=()=>{const a=Array(26).fill(0);a[24]=2;a[13]=5;a[8]=3;a[6]=5;return[a,a.slice()]};
  const cl=s=>[s[0].slice(),s[1].slice()];
  const key=s=>s[0].join(',')+'|'+s[1].join(',');
  const uniq=a=>[...new Set(a)];
  const rm=(ds,d)=>{const r=ds.slice();r.splice(r.indexOf(d),1);return r};
  const pip=me=>{let p=0;for(let i=1;i<26;i++)p+=i*me[i];return p};
  /* destination of moving a checker from f with die d, or -1 if illegal (0 = bear off) */
  function can(s,side,f,d){
    const me=s[side],op=s[1-side];if(!me[f])return-1;if(me[25]&&f!==25)return-1;
    const t=f-d;if(t>=1)return op[25-t]>=2?-1:t;
    for(let i=7;i<26;i++)if(me[i])return-1;
    if(t===0)return 0;for(let i=f+1;i<=6;i++)if(me[i])return-1;return 0;
  }
  function app(s,side,f,t){
    const me=s[side],op=s[1-side];me[f]--;let hit=false;
    if(t>=1){if(op[25-t]===1){op[25-t]=0;op[25]++;hit=true}me[t]++}else me[0]++;
    return hit;
  }
  /* most dice that can be played from here */
  function maxPlay(s,side,ds){
    if(!ds.length)return 0;let best=0;
    for(const d of uniq(ds)){const rest=rm(ds,d);
      for(let f=25;f>=1;f--){const t=can(s,side,f,d);if(t<0)continue;
        const n=cl(s);app(n,side,f,t);const r=1+maxPlay(n,side,rest);
        if(r>best){best=r;if(best===ds.length)return best}}}
    return best;
  }
  /* legal single moves when R more dice still have to be played (enforces "use both" and "use the larger") */
  function singles(s,side,ds,R){
    if(R<=0)return[];let out=[];
    for(const d of uniq(ds).sort((a,b)=>a-b)){const rest=rm(ds,d);
      for(let f=25;f>=1;f--){const t=can(s,side,f,d);if(t<0)continue;
        const n=cl(s);app(n,side,f,t);if(1+maxPlay(n,side,rest)===R)out.push({f,t,d})}}
    if(R===1&&ds.length===2&&ds[0]!==ds[1]){const hi=Math.max(...ds);if(out.some(m=>m.d===hi))out=out.filter(m=>m.d===hi)}
    return out;
  }
  /* every legal full turn, deduplicated by the resulting position */
  function turns(s,side,ds){
    const M=maxPlay(s,side,ds);if(!M)return{M,list:[{seq:[],s:cl(s)}]};
    let first=uniq(ds);
    if(M===1&&ds.length===2&&ds[0]!==ds[1]){const hi=Math.max(...ds);for(let f=25;f>=1;f--)if(can(s,side,f,hi)>=0){first=[hi];break}}
    const res=new Map(),seen=new Set();
    (function rec(st,rem,seq){
      if(seq.length===M){const k=key(st);if(!res.has(k))res.set(k,{seq,s:st});return}
      const vk=key(st)+'#'+rem.slice().sort().join('');if(seen.has(vk))return;seen.add(vk);
      for(const d of seq.length?uniq(rem):first){const rest=rm(rem,d);
        for(let f=25;f>=1;f--){const t=can(st,side,f,d);if(t<0)continue;
          const n=cl(st);app(n,side,f,t);rec(n,rest,seq.concat([{f,t,d}]))}}
    })(cl(s),ds.slice(),[]);
    return{M,list:[...res.values()]};
  }
  function evalPos(s,side){
    const me=s[side],op=s[1-side];
    if(me[0]===15)return 1e5;if(op[0]===15)return-1e5;
    const mp=pip(me),opp=pip(op);let myMax=0,opMax=0;
    for(let i=25;i>=1;i--)if(me[i]){myMax=i;break}
    for(let i=25;i>=1;i--)if(op[i]){opMax=i;break}
    if(myMax+opMax<=25){let gap=0;for(let i=1;i<=6;i++)if(me[i]>3)gap+=me[i]-3;return(opp-mp)*4+me[0]*1.2-gap*.3}
    let sc=opp-mp,run=0,bestRun=0,hm=0;
    const opAt=q=>q===0?op[25]:op[25-q];
    for(let p=1;p<=24;p++){
      const c=me[p];
      if(c>=2){sc+=BG_PV[p];run++;if(run>bestRun)bestRun=run;if(p<=6)hm++}else run=0;
      if(c>3)sc-=(c-3)*.6;
      if(c===1&&p>25-opMax){
        let shots=0;for(let q=0;q<p;q++)if(opAt(q)>0&&p-q<=24)shots+=BG_SHOTS[p-q];
        sc-=Math.min(36,shots)/36*((25-p)*.9+6);
      }
    }
    if(bestRun>=3)sc+=(bestRun-2)*(bestRun-2)*2.5;
    sc-=me[25]*4;sc+=op[25]*(3+hm*1.2);
    return sc;
  }
  /* 0 = no win, 1 = single, 2 = gammon, 3 = backgammon (for the side that has borne off 15) */
  function winKind(s,side){
    if(s[side][0]!==15)return 0;const op=s[1-side];if(op[0])return 1;
    let back=op[25];for(let i=19;i<=24;i++)back+=op[i];return back?3:2;
  }
  function choose(s,side,ds,easy){
    const{list}=turns(s,side,ds);
    if(easy&&Math.random()<.3)return list[Math.floor(Math.random()*list.length)].seq;
    let best=null,bs=-Infinity;
    for(const o of list){const v=evalPos(o.s,side)+(easy?Math.random()*18:0);if(v>bs){bs=v;best=o}}
    return best.seq;
  }
  return{start,cl,key,can,app,maxPlay,singles,turns,pip,evalPos,winKind,choose};
})();

function backgammon(root,S){
  const L=S.level,TWO=L===3,EASY=L===1,E=BG_E;
  const NAME=TWO?['White','Red']:['You','Computer'];
  const st=status(root,TWO?'Two players: White moves first if their opening die is higher. Bear off all 15 checkers to win.':'You are White. Race your checkers home to the bottom right and bear them all off.');
  const W=440,H=372,{c,x}=canvas(root,W,H);c.classList.add('bg-cv');c.dataset.max=760;
  const bar=el('div','row bg-row',root);
  const undoB=el('button','btn ghost bg-undo',bar,'↶ Undo'),rollB=el('button','btn bg-roll',bar,'🎲 Roll');
  /* geometry */
  const M=10,TW=40,BW=28,BX1=W-M-TW-6,HW=(BX1-M-BW)/2,PW=HW/6,R=13.5,TOP=M,BOT=H-M,TH=145,CY=H/2;
  const LX=M,RX=M+HW+BW,BARX=M+HW,TX=W-M-TW;
  let s=E.start(),turn=0,phase='open',rolled=[],used=[],dice=[],need=0,hist=[],sel=-1,dests=new Map(),moves=[];
  let openD=null,tumble=0,anims=[],dirty=true,over=false,busy=false;
  const ai=()=>!TWO&&turn===1;
  /* side-relative index -> board location in white numbering */
  const locOf=(side,i)=>i===25?'bar':i===0?'off':side===0?i:25-i;
  function ptX(n){return n<=6?RX+(6-n+.5)*PW:n<=12?LX+(12-n+.5)*PW:n<=18?LX+(n-13+.5)*PW:RX+(n-19+.5)*PW}
  function slot(side,loc,k){
    if(loc==='bar'){const kk=Math.min(k,3);return{x:BARX+BW/2,y:side===0?CY-R-6-kk*2*R:CY+R+6+kk*2*R}}
    if(loc==='off')return{x:TX+TW/2,y:side===0?BOT-6-k*8:TOP+6+k*8,slab:true};
    const kk=Math.min(k,4),top=loc>12;return{x:ptX(loc),y:top?TOP+R+1+kk*2*R:BOT-R-1-kk*2*R};
  }
  function count(side,loc){const a=s[side];return loc==='bar'?a[25]:loc==='off'?a[0]:a[side===0?loc:25-loc]}
  /* ---------- drawing ---------- */
  function tri(n,fill){const X=ptX(n),top=n>12,b=top?TOP:BOT,tip=top?TOP+TH:BOT-TH;x.beginPath();x.moveTo(X-PW/2+.5,b);x.lineTo(X+PW/2-.5,b);x.lineTo(X,tip);x.closePath();x.fillStyle=fill;x.fill()}
  function checker(X,Y,side,P,ring){
    x.beginPath();x.arc(X,Y,R-.5,0,7);x.fillStyle=side===0?'#FFFDF5':P.c1;x.fill();x.lineWidth=2;x.strokeStyle=P.edge;x.stroke();
    x.beginPath();x.arc(X,Y,R-5,0,7);x.lineWidth=1.5;x.strokeStyle=side===0?'rgba(30,31,92,.18)':'rgba(255,255,255,.35)';x.stroke();
    if(ring){x.beginPath();x.arc(X,Y,R+1.5,0,7);x.lineWidth=3;x.strokeStyle=ring;x.stroke()}
  }
  function slab(X,Y,side,P){rr(x,X-TW/2+5,Y-3.5,TW-10,7,2);x.fillStyle=side===0?'#FFFDF5':P.c1;x.fill();x.lineWidth=1.5;x.strokeStyle=P.edge;x.stroke()}
  const PIPS={1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[1,-1],[-1,1],[1,1]],5:[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],6:[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]};
  function die(X,Y,sz,v,side,P,faded){
    x.globalAlpha=faded?.32:1;rr(x,X-sz/2,Y-sz/2,sz,sz,sz*.22);x.fillStyle=side===0?'#FFFDF5':P.c1;x.fill();x.lineWidth=2.5;x.strokeStyle=P.edge;x.stroke();
    x.fillStyle=side===0?'#1E1F5C':'#FFFFFF';for(const[a,b]of PIPS[v]){x.beginPath();x.arc(X+a*sz*.26,Y+b*sz*.26,sz*.09,0,7);x.fill()}x.globalAlpha=1;
  }
  function diceSpots(n,side){
    const cx=side===0?RX+HW/2:LX+HW/2,sz=n>2?27:34,gap=sz+8;
    return[...Array(n)].map((_,i)=>({x:cx+(i-(n-1)/2)*gap,y:CY,sz}));
  }
  function draw(){
    const P=pal();x.clearRect(0,0,W,H);
    rr(x,0,0,W,H,10);x.fillStyle=P.edge;x.fill();
    for(const X0 of[LX,RX]){rr(x,X0,TOP,HW,BOT-TOP,8);x.fillStyle=P.board;x.fill()}
    for(let n=1;n<=24;n++)tri(n,n%2?P.c4:P.c2);
    /* trays */
    for(const y0 of[TOP,BOT-128]){rr(x,TX,y0,TW,128,7);x.fillStyle=P.line;x.fill()}
    const legalAll=legalNow();
    /* destination highlights */
    const inFlight=(side,loc)=>anims.filter(a=>a.side===side&&a.loc===loc).length;
    if(sel>=0)for(const t of dests.keys()){
      const loc=locOf(turn,t);
      if(loc==='off'){x.save();rr(x,TX,turn===0?BOT-128:TOP,TW,128,7);x.lineWidth=4;x.strokeStyle=P.c3;x.stroke();x.restore();continue}
      x.globalAlpha=.85;tri(loc,P.c3);x.globalAlpha=1;
    }
    /* checkers */
    for(let side=0;side<2;side++){
      for(let n=1;n<=24;n++){
        const cnt=count(side,n)-inFlight(side,n);if(cnt<=0)continue;
        for(let k=0;k<Math.min(cnt,5);k++){
          const p=slot(side,n,k),idx=side===0?n:25-n,isTop=k===Math.min(cnt,5)-1;
          let ring=null;if(isTop&&side===turn){if(sel===idx)ring=P.c3;else if(sel<0&&legalAll.some(m=>m.f===idx))ring='rgba(46,196,182,.55)'}
          checker(p.x,p.y,side,P,ring);
        }
        if(cnt>5){const p=slot(side,n,4);x.font='13px '+DISPLAY;x.textAlign='center';x.textBaseline='middle';x.fillStyle=side===0?'#1E1F5C':'#FFFFFF';x.fillText(cnt,p.x,p.y+1)}
      }
      const bc=count(side,'bar')-inFlight(side,'bar');
      for(let k=0;k<Math.min(bc,4);k++){const p=slot(side,'bar',k);checker(p.x,p.y,side,P,k===Math.min(bc,4)-1&&side===turn&&sel===25?P.c3:null)}
      if(bc>4){const p=slot(side,'bar',3);x.font='13px '+DISPLAY;x.textAlign='center';x.textBaseline='middle';x.fillStyle=side===0?'#1E1F5C':'#FFFFFF';x.fillText(bc,p.x,p.y+1)}
      const oc=count(side,'off')-inFlight(side,'off');for(let k=0;k<oc;k++){const p=slot(side,'off',k);slab(p.x,p.y,side,P)}
    }
    /* ghost markers on destinations */
    if(sel>=0)for(const t of dests.keys()){const loc=locOf(turn,t);if(loc==='off')continue;
      const p=slot(turn,loc,Math.min(count(turn,loc),4));x.beginPath();x.arc(p.x,p.y,R-2,0,7);x.setLineDash([4,3]);x.lineWidth=2.5;x.strokeStyle=P.edge;x.stroke();x.setLineDash([]);
      x.beginPath();x.arc(p.x,p.y,4,0,7);x.fillStyle=P.edge;x.fill()}
    /* moving checkers */
    for(const a of anims){const k=clamp(a.t/a.dur,0,1),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2,X=a.x0+(a.x1-a.x0)*e,Y=a.y0+(a.y1-a.y0)*e-Math.sin(k*Math.PI)*18;
      if(a.loc==='off'&&k>.85)slab(a.x1,a.y1,a.side,P);else checker(X,Y,a.side,P,null)}
    /* pip counts */
    x.textAlign='center';x.textBaseline='middle';
    for(let side=0;side<2;side++){
      const y=side===0?CY+16:CY-16,on=!over&&side===turn&&phase!=='open';
      if(on){rr(x,TX+1,y-11,TW-2,22,6);x.fillStyle=side===0?'#FFFDF5':P.c1;x.fill()}
      x.font='12px '+DISPLAY;x.fillStyle=on?(side===0?'#1E1F5C':'#FFFFFF'):'#FFFFFF';x.fillText(E.pip(s[side]),TX+TW/2,y+1);
    }
    x.font='800 8px sans-serif';x.fillStyle='rgba(255,255,255,.7)';x.fillText('PIPS',TX+TW/2,CY);
    /* dice */
    if(phase==='open'&&openD){die(RX+HW/2,CY,34,tumble?1+rand(6):openD[0],0,P);die(LX+HW/2,CY,34,tumble?1+rand(6):openD[1],1,P)}
    else if(rolled.length){diceSpots(rolled.length,turn).forEach((p,i)=>die(p.x,p.y,p.sz,tumble?1+rand(6):rolled[i],turn,P,!tumble&&used[i]))}
    else if(!over&&(phase==='roll'||phase==='open')){x.font='12px '+DISPLAY;x.fillStyle=P.muted;const cx=turn===0||phase==='open'?RX+HW/2:LX+HW/2;x.fillText(phase==='open'?'TAP ROLL':'ROLL',cx,CY+1)}
  }
  S.loop(dt=>{
    if(tumble>0){tumble=Math.max(0,tumble-dt);dirty=true}
    if(anims.length){for(const a of anims)a.t+=dt;anims=anims.filter(a=>a.t<a.dur);dirty=true}
    if(dirty){dirty=false;draw()}
  });
  S.on(window,'resize',()=>dirty=true);
  S.every(400,()=>dirty=true);
  let lcK='',lcV=[];
  function legalNow(){if(phase!=='move'||ai()||busy)return[];const k=E.key(s)+dice.join('')+need;if(k!==lcK){lcK=k;lcV=E.singles(s,turn,dice,need)}return lcV}
  /* ---------- turn logic ---------- */
  function buttons(){
    const myTurn=!over&&!ai()&&!busy;
    undoB.disabled=!(myTurn&&hist.length&&(phase==='move'||phase==='confirm'));
    rollB.textContent=phase==='confirm'||phase==='move'?'✓ Done':'🎲 Roll';
    rollB.disabled=!(myTurn&&(phase==='roll'||phase==='open'||phase==='confirm'));
    rollB.classList.toggle('bg-go',!rollB.disabled);dirty=true;
  }
  const dstr=()=>rolled[0]===rolled[1]&&rolled.length>2?`double ${rolled[0]}s`:rolled.join('-');
  function moveMsg(){
    if(phase==='confirm'){st(TWO?`Your move, ${NAME[turn]}: tap Done or Undo.`:'Your move is complete. Tap Done or Undo.');return}
    const barMsg=s[turn][25]?' Enter from the bar.':'';
    st(TWO?`Your move, ${NAME[turn]}: ${dstr()}.${barMsg}`:`Your move: ${dstr()}.${barMsg}`);
  }
  function animate(side,fromLoc,fromK,toLoc,toK,delay){
    const a=slot(side,fromLoc,fromK),b=slot(side,toLoc,toK);
    anims.push({side,loc:toLoc,x0:a.x,y0:a.y,x1:b.x,y1:b.y,t:-(delay||0),dur:REDUCED?.01:.28});
  }
  function play1(m){
    const fl=locOf(turn,m.f),tl=locOf(turn,m.t),fk=count(turn,fl)-1,tk=count(turn,tl),opLoc=tl,ok=m.t>=1?count(1-turn,opLoc):0;
    const bk=count(1-turn,'bar');
    const hit=E.app(s,turn,m.f,m.t);
    animate(turn,fl,fk,tl,tk);
    if(hit){animate(1-turn,opLoc,ok-1,'bar',bk,.12);beep(240,140,'square');S.after(150,()=>beep(180,120,'square'))}
    else beep(m.t===0?760:440+rand(60),60);
    const i=used.findIndex((u,j)=>!u&&rolled[j]===m.d);used[i]=true;
    dice=dice.slice();dice.splice(dice.indexOf(m.d),1);need--;
    dirty=true;return hit;
  }
  function selectAt(i){
    sel=i;dests=new Map();
    /* BFS over chains of the same checker so combined moves (both dice) are offered too */
    let frontier=[{s,ds:dice,R:need,at:i,chain:[]}];
    while(frontier.length){
      const nx=[];
      for(const n of frontier){
        for(const m of E.singles(n.s,turn,n.ds,n.R).filter(m=>m.f===n.at)){
          const ns=E.cl(n.s),hit=E.app(ns,turn,m.f,m.t),chain=n.chain.concat([m]);
          const prev=dests.get(m.t);
          if(!prev)dests.set(m.t,{chain,hits:chain.length>1&&hit?1:0});
          if(m.t>0&&!hit)nx.push({s:ns,ds:n.ds.slice(0,n.ds.indexOf(m.d)).concat(n.ds.slice(n.ds.indexOf(m.d)+1)),R:n.R-1,at:m.t,chain});
        }
      }
      frontier=nx;
    }
    dirty=true;
  }
  function deselect(){sel=-1;dests=new Map();dirty=true}
  function afterMove(){
    const wk=E.winKind(s,turn);if(wk){finish(turn,wk);return}
    if(need===0){phase='confirm';deselect()}
    else if(s[turn][25])selectAt(25);
    else{const ls=E.singles(s,turn,dice,need),f=new Set(ls.map(m=>m.f));if(f.size===1)selectAt([...f][0]);else deselect()}
    moveMsg();buttons();
  }
  function humanPlay(chain){
    hist.push({s:E.cl(s),dice:dice.slice(),used:used.slice(),need});
    busy=true;deselect();buttons();let k=0;
    const step=()=>{play1(chain[k++]);if(k<chain.length)S.after(REDUCED?20:300,step);else S.after(REDUCED?20:290,()=>{busy=false;afterMove()})};
    step();
  }
  function undo(){
    if(undoB.disabled)return;const h=hist.pop();s=h.s;dice=h.dice;used=h.used;need=h.need;anims=[];phase='move';
    beep(300,50);afterMove();
  }
  function roll(){
    if(over||busy||ai())return;
    if(phase==='open')return openRoll();
    if(phase==='confirm')return endTurn();
    if(phase==='roll')doRoll();
  }
  function openRoll(){
    busy=true;const a=1+rand(6),b=1+rand(6);
    openD=[a,b];tumble=REDUCED?0:.5;buttons();beep(520,40);
    S.after(REDUCED?50:550,()=>{
      beep(620,60);
      if(a===b){busy=false;st(`Both rolled ${a}. Roll again!`);buttons();return}
      turn=a>b?0:1;
      st(TWO?`${NAME[turn]} rolled higher and goes first.`:turn===0?`You rolled higher (${a} vs ${b}). You go first!`:`The computer rolled higher (${b} vs ${a}) and goes first.`);
      S.after(1200,()=>{openD=null;startTurn(turn===0?[a,b]:[b,a])});
    });
  }
  function doRoll(){
    busy=true;const a=1+rand(6),b=1+rand(6);tumble=REDUCED?0:.45;rolled=a===b?[a,a,a,a]:[a,b];used=rolled.map(()=>false);buttons();beep(520,40);
    S.after(REDUCED?50:480,()=>{beep(620,60);startTurn(rolled.slice())});
  }
  function startTurn(ds){
    rolled=ds.length===2&&ds[0]===ds[1]?[ds[0],ds[0],ds[0],ds[0]]:ds.slice();used=rolled.map(()=>false);
    dice=rolled.slice();need=E.maxPlay(s,turn,dice);hist=[];busy=false;phase='move';sel=-1;dests=new Map();
    if(!need){
      phase='pass';busy=true;buttons();
      st(ai()?'The computer has no legal move.':TWO?`${NAME[turn]} has no legal move. Passing.`:'No legal move. Passing.');
      S.after(1500,()=>{busy=false;endTurn()});return;
    }
    if(ai()){phase='ai';buttons();aiPlay();return}
    afterMove();
  }
  function aiPlay(){
    st('Computer is thinking…');busy=true;buttons();
    S.after(450,()=>{
      const seq=E.choose(s,1,dice,EASY);let k=0;
      const step=()=>{
        if(k>=seq.length){const wk=E.winKind(s,1);if(wk){finish(1,wk);return}S.after(450,()=>{busy=false;endTurn()});return}
        play1(seq[k++]);S.after(REDUCED?60:520,step);
      };
      step();
    });
  }
  function endTurn(){
    if(over)return;
    turn=1-turn;rolled=[];used=[];dice=[];hist=[];deselect();
    if(ai()){busy=true;phase='ai';buttons();st('Computer is thinking…');S.after(500,()=>{tumble=REDUCED?0:.45;rolled=[1+rand(6),1+rand(6)];if(rolled[0]===rolled[1])rolled=[rolled[0],rolled[0],rolled[0],rolled[0]];used=rolled.map(()=>false);beep(520,40);dirty=true;S.after(REDUCED?50:480,()=>startTurn(rolled.slice()))});return}
    phase='roll';buttons();st(TWO?`Your turn, ${NAME[turn]}. Tap Roll.`:'Your turn. Tap Roll.');
  }
  function finish(side,wk){
    over=true;phase='over';busy=false;deselect();buttons();
    const kind=wk===3?' with a backgammon!':wk===2?' with a gammon!':'!';
    if(TWO){st(`${NAME[side]} wins${kind} Press ↻ for a rematch.`);S.fx.confetti();S.fx.banner(`${NAME[side]} wins!`,wk>1?(wk===3?'Backgammon!':'Gammon!'):'');beep(880,160)}
    else if(side===0){st(`You win${kind} Press ↻ to play again.`);S.after(300,S.next)}
    else{st(`The computer wins${kind} Press ↻ to try again.`);S.shake();beep(200,300,'sawtooth')}
  }
  /* ---------- input ---------- */
  function hitTest(px,py){
    if(px>=TX-3)return{type:'off',top:py<CY};
    if(px>=BARX&&px<BARX+BW)return{type:'bar'};
    const inL=px>=LX&&px<LX+HW,inR=px>=RX&&px<RX+HW;if(!inL&&!inR)return null;
    const col=Math.floor((px-(inL?LX:RX))/PW),top=py<CY;
    if(Math.abs(py-CY)<CY-TOP-TH-2&&!dests.size)return{type:'mid'};
    let n;if(top)n=inL?13+col:19+col;else n=inL?12-col:6-col;return{type:'pt',n};
  }
  S.on(c,'pointerdown',e=>{
    if(over)return;const p=c.pos(e),h=hitTest(p.x,p.y);if(!h)return;
    if(h.type==='mid'&&phase!=='move'){roll();return}
    if(phase!=='move'||busy||ai())return;
    let idx=null;
    if(h.type==='pt')idx=turn===0?h.n:25-h.n;else if(h.type==='bar')idx=25;else if(h.type==='off')idx=0;
    if(idx==null){deselect();return}
    if(sel>=0&&dests.has(idx)){humanPlay(dests.get(idx).chain);return}
    if(idx===0)return;
    if(s[turn][25]){selectAt(25);return}
    if(s[turn][idx]&&E.singles(s,turn,dice,need).some(m=>m.f===idx)){selectAt(idx);beep(480,30)}
    else if(s[turn][idx]){deselect();st(TWO?`Your move, ${NAME[turn]}: that checker can't move.`:"Your move: that checker can't move.")}
    else deselect();
  });
  S.on(rollB,'click',roll);S.on(undoB,'click',undo);
  S.on(window,'keydown',e=>{
    if(e.key===' '||e.key==='Enter'){e.preventDefault();roll()}
    else if(e.key==='u'||e.key==='U'||e.key==='Backspace'||(e.key==='z'&&(e.ctrlKey||e.metaKey))){e.preventDefault();undo()}
  });
  c.bgState=()=>({s,turn,phase,dice,need,over});
  buttons();
}

const BFIL_LV=[[5,2,3],[6,3,4],[7,4,6],[8,5,8]];
/* random Hamiltonian path over the open cells (backbite moves), walls are carved from the path's tail */
function BFIL_gen(L){
  const [n,w0,w1]=BFIL_LV[L-1],N=n*n,open=new Uint8Array(N).fill(1),p=[],R=m=>Math.floor(Math.random()*m);
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)p.push(r*n+(r%2?n-1-c:c));
  const pos=new Int16Array(N);p.forEach((v,i)=>pos[v]=i);
  const nb=v=>{const r=v/n|0,c=v%n,o=[];if(r&&open[v-n])o.push(v-n);if(r<n-1&&open[v+n])o.push(v+n);if(c&&open[v-1])o.push(v-1);if(c<n-1&&open[v+1])o.push(v+1);return o};
  const rev=(a,b)=>{for(;a<b;a++,b--){const t=p[a];p[a]=p[b];p[b]=t;pos[p[a]]=a;pos[p[b]]=b}};
  const mix=m=>{for(let k=0;k<m;k++){const M=p.length;
    if(Math.random()<.5){const o=nb(p[0]),i=pos[o[R(o.length)]];if(i>1)rev(0,i-1)}
    else{const o=nb(p[M-1]),i=pos[o[R(o.length)]];if(i<M-2)rev(i+1,M-1)}}};
  mix(N*20);
  const walls=w0+R(w1-w0+1);
  for(let k=0;k<walls;k++){mix(N*4);const t=p.pop();open[t]=0;pos[t]=-1}
  mix(N*10);if(Math.random()<.5)p.reverse();
  return{n,open,start:p[0],sol:p.slice()};
}
function blockfill(root,S){
  const L=S.level,W=480;
  const st=status(root,'Start on the glowing tile and draw one path through every open tile.');
  const bar=el('div','row mbar bfl-bar',root,'<span>Tiles <b class="bfl-t">0/0</b></span><span class="bfl-solved"></span>');
  const {c,x}=canvas(root,W,W);c.classList.add('bfl-cv');c.dataset.max=620;
  const foot=el('div','row bfl-foot',root);
  const clrB=el('button','btn ghost',foot,'↺ Clear');const nextB=el('button','btn ghost bfl-next',foot,'New puzzle');
  const tEl=$('.bfl-t',bar),sEl=$('.bfl-solved',bar);
  let K=pal();S.every(1000,()=>{K=pal()});
  const fx=sparks(),skey='blockfill:solved:'+L;
  let pz,n,N,cs,path,inP,born,tot,drag=null,won,T=0,hx,hy,dir=[1,0],wonT=0;
  const showSolved=()=>{sEl.textContent=`Solved ${store.get(skey)||0}`};
  const center=v=>[(v%n+.5)*cs,((v/n|0)+.5)*cs];
  function setup(){
    pz=BFIL_gen(L);n=pz.n;N=n*n;cs=W/n;c._pz=pz;
    tot=pz.sol.length;path=[pz.start];inP=new Int16Array(N).fill(-1);inP[pz.start]=0;born=[T];
    [hx,hy]=center(pz.start);won=false;drag=null;
    nextB.textContent='New puzzle';nextB.classList.add('ghost');showSolved();upd();
  }
  function upd(){tEl.textContent=path.length+'/'+tot}
  const adj=(a,b)=>Math.abs(a-b)===n||(Math.abs(a-b)===1&&(a/n|0)===(b/n|0));
  function cut(j){while(path.length>j+1){inP[path.pop()]=-1;born.pop()}}
  function step(t){
    if(t<0||t>=N||won)return false;
    const h=path[path.length-1];if(t===h)return false;
    const j=inP[t];
    if(j>=0){cut(j);beep(260,35);upd();return true}
    if(!pz.open[t]||!adj(t,h))return false;
    dir=[t%n-h%n,(t/n|0)-(h/n|0)];
    inP[t]=path.length;path.push(t);born.push(T);
    beep(330+path.length*600/tot,45);upd();
    if(path.length===tot)win();
    return true;
  }
  function moveTo(t){
    let guard=0;
    while(guard++<40&&!won){
      const h=path[path.length-1];if(h===t)break;
      const dr=(t/n|0)-(h/n|0),dc=t%n-h%n;
      const a=Math.abs(dr)>=Math.abs(dc)?[h+Math.sign(dr)*n,dc?h+Math.sign(dc):null]:[h+Math.sign(dc),dr?h+Math.sign(dr)*n:null];
      let moved=false;
      for(const q of a){if(q==null)continue;
        if(inP[q]>=0&&inP[q]!==path.length-2)continue; /* only retract one step at a time while dragging */
        if(step(q)){moved=true;break}}
      if(!moved)break;
    }
  }
  function cellAt(e,cl){
    const q=c.pos(e);let cc=Math.floor(q.x/cs),r=Math.floor(q.y/cs);
    if(!cl&&(cc<0||r<0||cc>=n||r>=n))return -1;
    return clamp(r,0,n-1)*n+clamp(cc,0,n-1);
  }
  S.on(c,'pointerdown',e=>{
    if(won||drag)return;const q=cellAt(e);if(q<0)return;e.preventDefault();
    const h=path[path.length-1];
    if(inP[q]>=0){if(q!==h){cut(inP[q]);beep(260,35);upd()}}
    else if(pz.open[q]&&adj(q,h))step(q);
    else{if(pz.open[q])beep(150,60,'square');return}
    try{c.setPointerCapture(e.pointerId)}catch(_){}
    drag={id:e.pointerId};
  });
  S.on(c,'pointermove',e=>{if(drag&&e.pointerId===drag.id)moveTo(cellAt(e,true))});
  const end=e=>{if(drag&&e.pointerId===drag.id)drag=null};
  S.on(c,'pointerup',end);S.on(c,'pointercancel',end);
  S.on(window,'keydown',e=>{
    const d=KEYDIR[e.key];if(!d||won)return;e.preventDefault();
    const h=path[path.length-1],r=h/n|0,cc=h%n;
    const t=d==='up'?(r?h-n:-1):d==='down'?(r<n-1?h+n:-1):d==='left'?(cc?h-1:-1):(cc<n-1?h+1:-1);
    if(t<0)return;if(inP[t]>=0&&inP[t]!==path.length-2)return;if(!step(t))beep(150,60,'square');
  });
  S.on(clrB,'click',()=>{if(won)return;cut(0);upd();beep(220,80)});
  function win(){
    won=true;wonT=T;drag=null;
    const t=(store.get(skey)||0)+1;store.set(skey,t);let all=0;for(let i=1;i<=4;i++)all+=store.get('blockfill:solved:'+i)||0;best('blockfill',all);
    showSolved();st('All tiles filled!');
    const [a,b]=center(path[path.length-1]);fx.add(a,b,'#FFD23F',24,220);
    nextB.textContent='Next puzzle ▶';nextB.classList.remove('ghost');restartAnim(nextB,'bfl-pop');
    S.next();
  }
  S.on(nextB,'click',()=>{setup();st('New puzzle. Fill every open tile in one stroke.')});
  const hue=i=>200+150*i/Math.max(1,tot-1);
  function draw(dt){
    dt=Math.max(0,dt);T+=dt;x.clearRect(0,0,W,W);
    const g=cs*.07,r=cs*.2;
    for(let v=0;v<N;v++){
      const [a,b]=center(v);
      if(!pz.open[v]){
        x.fillStyle=K.edge;x.globalAlpha=.8;rr(x,a-cs/2+g,b-cs/2+g,cs-2*g,cs-2*g,r);x.fill();
        x.save();x.clip();x.globalAlpha=.18;x.strokeStyle=K.board;x.lineWidth=cs*.07;x.beginPath();
        for(let k=-3;k<=3;k++){const o=k*cs*.22;x.moveTo(a-cs*.5+o,b+cs*.5);x.lineTo(a+cs*.5+o,b-cs*.5)}
        x.stroke();x.restore();x.globalAlpha=1;continue;
      }
      x.fillStyle=K.edge;x.globalAlpha=.18;rr(x,a-cs/2+g,b-cs/2+g+3,cs-2*g,cs-2*g,r);x.fill();
      x.globalAlpha=1;x.fillStyle=K.line;rr(x,a-cs/2+g,b-cs/2+g,cs-2*g,cs-2*g,r);x.fill();
    }
    /* bridges between consecutive tiles */
    for(let i=1;i<path.length;i++){
      const [a1,b1]=center(path[i-1]),[a2,b2]=center(path[i]);const w=cs*.46;
      x.fillStyle=`hsl(${hue(i-.5)},85%,58%)`;
      x.fillRect(Math.min(a1,a2)-(a1===a2?w/2:0),Math.min(b1,b2)-(b1===b2?w/2:0),a1===a2?w:Math.abs(a2-a1),b1===b2?w:Math.abs(b2-b1));
    }
    for(let i=0;i<path.length;i++){
      const [a,b]=center(path[i]);const age=T-born[i];
      let s=1;if(age<.3){const u=age/.3-1;s=.5+.5*(1+2.70158*u*u*u+1.70158*u*u)}
      if(won){const wv=T-wonT-i*.025;if(wv>0&&wv<.4)s=1+.12*Math.sin(wv/.4*Math.PI)}
      const h=cs*(.5-.07)*s;
      x.fillStyle=`hsl(${hue(i)},85%,58%)`;rr(x,a-h,b-h,2*h,2*h,r*s);x.fill();
      x.fillStyle='rgba(255,255,255,.22)';rr(x,a-h+3,b-h+3,2*h-6,h*.55,r*.7);x.fill();
    }
    /* start marker */
    if(path.length===1&&!won){
      const [a,b]=center(pz.start),p=(T*1.4)%1;
      x.strokeStyle=`hsl(${hue(0)},90%,60%)`;x.globalAlpha=1-p;x.lineWidth=4;rr(x,a-cs*(.45+p*.15),b-cs*(.45+p*.15),cs*(.9+p*.3),cs*(.9+p*.3),r*1.4);x.stroke();x.globalAlpha=1;
    }
    /* head: glides to the newest tile */
    const [tx,ty]=center(path[path.length-1]);const kk=1-Math.exp(-dt*22);hx+=(tx-hx)*kk;hy+=(ty-hy)*kk;
    const hr=cs*.3*(won?1+.08*Math.sin(T*8):1);
    x.beginPath();x.arc(hx,hy,hr,0,7);x.fillStyle='#fff';x.fill();x.lineWidth=Math.max(2.5,cs*.05);x.strokeStyle=K.edge;x.stroke();
    const ex=dir[0],ey=dir[1],px=-ey,py=ex;
    for(const sgn of[-1,1]){
      const ox=hx+ex*hr*.28+px*hr*.36*sgn,oy=hy+ey*hr*.28+py*hr*.36*sgn;
      x.beginPath();x.arc(ox,oy,hr*.17,0,7);x.fillStyle='#1E1F5C';x.fill();
    }
    fx.draw(x,dt);
  }
  setup();S.loop(draw);
}

/* Checkers (American / English draughts). Board: 64 squares, sq=r*8+c, play on dark squares ((r+c)&1).
   1 = bottom man (Red, moves up), 2 = bottom king, -1 = top man (Black / computer), -2 = top king. */
const CKR={
  start(){const b=Array(64).fill(0);for(let r=0;r<8;r++)for(let c=0;c<8;c++)if((r+c)&1){if(r<3)b[r*8+c]=-1;else if(r>4)b[r*8+c]=1}return b},
  DK:[[-1,-1],[-1,1],[1,-1],[1,1]],DU:[[-1,-1],[-1,1]],DD:[[1,-1],[1,1]],
  dirs(p){return p===2||p===-2?CKR.DK:p>0?CKR.DU:CKR.DD},
  endRow(p){return p>0?0:7},
  /* all legal moves for side (1 or -1). A move: {path:[from,land1,...], caps:[sq,...], promo}. Captures are mandatory and must be completed. */
  moves(b,side){
    const caps=[],steps=[];
    for(let s=0;s<64;s++){
      const p=b[s];if(!p||(p>0?1:-1)!==side)continue;
      CKR.jumps(b,s,p,[s],[],caps);
      if(caps.length)continue;
      const r=s>>3,c=s&7;
      for(const[dr,dc]of CKR.dirs(p)){
        const r1=r+dr,c1=c+dc;if(r1<0||r1>7||c1<0||c1>7)continue;const t=r1*8+c1;
        if(!b[t])steps.push({path:[s,t],caps:[],promo:(p===1||p===-1)&&r1===CKR.endRow(p)});
      }
    }
    return caps.length?caps:steps;
  },
  jumps(b,s,p,path,cp,out){
    const r=s>>3,c=s&7;let any=false;
    for(const[dr,dc]of CKR.dirs(p)){
      const r2=r+2*dr,c2=c+2*dc;if(r2<0||r2>7||c2<0||c2>7)continue;
      const mid=(r+dr)*8+c+dc,land=r2*8+c2,q=b[mid];
      if(!q||q===9||(q>0)===(p>0)||b[land]!==0)continue;
      any=true;const promo=(p===1||p===-1)&&r2===CKR.endRow(p);
      b[s]=0;b[land]=p;b[mid]=9;
      if(promo)out.push({path:[...path,land],caps:[...cp,mid],promo:true});
      else CKR.jumps(b,land,p,[...path,land],[...cp,mid],out);
      b[land]=0;b[mid]=q;b[s]=p;
    }
    if(!any&&path.length>1)out.push({path:path,caps:cp,promo:false});
  },
  apply(b,m){
    const n=b.slice(),f=m.path[0],t=m.path[m.path.length-1],p=n[f];n[f]=0;for(const c of m.caps)n[c]=0;n[t]=m.promo?p*2:p;return n;
  },
  /* static evaluation from side's point of view */
  evalB(b,side){
    let s=0,mat1=0,mat2=0,n=0;
    for(let i=0;i<64;i++){
      const p=b[i];if(!p)continue;n++;const r=i>>3,c=i&7,sg=p>0?1:-1;let v;
      if(p===1||p===-1){
        const adv=p>0?7-r:r;v=100+adv*3+(adv>=5?4:0);
        if(adv===0)v+=8;                         /* guarding the back row */
        if(c===0||c===7)v-=2;
      }else{v=170;if(r>1&&r<6&&c>1&&c<6)v+=6;else if(r===0||r===7||c===0||c===7)v-=4}
      if(r>=2&&r<=5&&c>=2&&c<=5)v+=3;
      s+=sg*v;if(sg>0)mat1+=p===2?170:100;else mat2+=p===-2?170:100;
    }
    const diff=mat1-mat2;if(diff)s+=Math.sign(diff)*Math.min(60,Math.abs(diff)*(24-n)/24); /* trade down when ahead */
    return side*s;
  },
  WIN:100000,
  order(ms,pv){
    ms.sort((a,b)=>(b.caps.length-a.caps.length)||((b.promo?1:0)-(a.promo?1:0)));
    if(pv){const i=ms.findIndex(m=>CKR.same(m,pv));if(i>0)ms.unshift(ms.splice(i,1)[0])}
    return ms;
  },
  same(a,b){return a.path.length===b.path.length&&a.path.every((v,i)=>v===b.path[i])},
  search(b,side,depth,alpha,beta,ply,ctx){
    if((++ctx.nodes&1023)===0&&performance.now()>ctx.deadline)ctx.stop=true;
    if(ctx.stop)return 0;
    const ms=CKR.moves(b,side);
    if(!ms.length)return -CKR.WIN+ply;
    if(depth<=0&&(!ms[0].caps.length||ply>ctx.maxPly))return CKR.evalB(b,side);
    CKR.order(ms,null);
    let bestV=-Infinity;
    for(const m of ms){
      const v=-CKR.search(CKR.apply(b,m),-side,ms.length===1&&ply<ctx.maxPly?depth:depth-1,-beta,-alpha,ply+1,ctx);
      if(ctx.stop)return 0;
      if(v>bestV)bestV=v;if(v>alpha)alpha=v;if(alpha>=beta)break;
    }
    return bestV;
  },
  /* level 1..3: returns a legal move */
  best(b,side,level,timeMs){
    const ms=CKR.moves(b,side);if(ms.length<=1)return ms[0];
    if(level===1&&Math.random()<.35)return ms[Math.floor(Math.random()*ms.length)];
    const maxD=[2,4,12][level-1]||4,ctx={nodes:0,stop:false,deadline:performance.now()+(timeMs||[150,250,320][level-1]),maxPly:0};
    let bestM=ms[Math.floor(Math.random()*ms.length)],pv=null;
    for(let d=1;d<=maxD;d++){
      ctx.maxPly=d+10;CKR.order(ms,pv);
      let a=-Infinity,cur=null,scored=[];
      for(const m of ms){
        const v=-CKR.search(CKR.apply(b,m),-side,d-1,-Infinity,-a,1,ctx);
        if(ctx.stop)break;
        scored.push([v,m]);if(v>a){a=v;cur=m}
      }
      if(ctx.stop)break;
      /* break ties randomly among equally good moves */
      const top=scored.filter(x=>x[0]===a);cur=top[Math.floor(Math.random()*top.length)][1];
      bestM=cur;pv=cur;
      if(Math.abs(a)>CKR.WIN-1000)break;
    }
    return bestM;
  }
};

function checkers(root,S){
  const L=S.level,TWO=L===4;
  const NM={1:TWO?'Red':'You','-1':TWO?'Black':'Computer'};
  const st=status(root,TWO?'Red moves first. Take turns on this device. Captures are a must.':'You are Red. Tap a piece, then a glowing square. If you can jump, you must.');
  const bar=el('div','ck-bar',root);
  const side=[1,-1].map(s=>{const e=el('div','ck-who '+(s>0?'red':'blk'),bar,`<i></i><b></b><small></small>`);e.querySelector('b').textContent=NM[s];return e});
  const g=el('div','ck-board',root);g.dataset.ar=1;g.dataset.max=560;
  const sqs=[...Array(64)].map((_,i)=>{const e=el('button','ck-sq'+(((i>>3)+(i&7))&1?' dk':''),g);e.style.animationDelay=Math.min(((i>>3)+(i&7))*25,380)+'ms';e.setAttribute('aria-label','Square '+'abcdefgh'[i&7]+(8-(i>>3)));S.on(e,'click',()=>tap(i));return e});
  const layer=el('div','ck-layer',g);
  let b=CKR.start(),turn=1,legal=[],sel=-1,step=0,cand=[],busy=false,over=false,quiet=0,last=null,cur=-1;
  const pcs={};
  function place(e,i){e.style.left=(i&7)*12.5+'%';e.style.top=(i>>3)*12.5+'%'}
  function mkPiece(i){const p=b[i];const e=el('div','ck-p '+(p>0?'red':'blk')+(Math.abs(p)===2?' king':''),layer,'<span>♛</span>');e.style.animationDelay=(i>>3)*40+200+'ms';place(e,i);pcs[i]=e}
  for(let i=0;i<64;i++)if(b[i])mkPiece(i);
  function counts(){let a=0,c=0;for(const p of b){if(p>0)a++;else if(p<0)c++}return{1:a,'-1':c}}
  function draw(){
    const mustCap=legal.length&&legal[0].caps.length,human=!over&&!busy&&(TWO||turn===1);
    const tg=new Set();if(sel>=0)for(const m of cand)tg.add(m.path[step+1]);
    const movable=new Set(human&&step===0?legal.map(m=>m.path[0]):[]);
    sqs.forEach((e,i)=>{
      e.classList.toggle('sel',i===sel);e.classList.toggle('tgt',human&&tg.has(i));
      e.classList.toggle('must',human&&sel<0&&!!mustCap&&movable.has(i));
      e.classList.toggle('last',!!last&&last.includes(i));e.classList.toggle('cur',i===cur);
    });
    const n=counts();
    side.forEach((e,k)=>{const s=k?-1:1;e.classList.toggle('on',!over&&turn===s);e.querySelector('small').textContent=n[s]});
  }
  function hopAnim(f,t,cap){
    const e=pcs[f];delete pcs[f];pcs[t]=e;place(e,t);e.classList.remove('lift');restartAnim(e,'hop');
    if(cap!=null&&pcs[cap]){const c=pcs[cap];delete pcs[cap];c.classList.add('gone');S.after(320,()=>c.remove());beep(260+step*60,110,'square')}
    else beep(520,50);
  }
  function setLegal(){legal=CKR.moves(b,turn)}
  function tap(i){
    cur=-1;
    if(over||busy||(!TWO&&turn!==1))return;
    if(sel>=0&&cand.some(m=>m.path[step+1]===i)){hop(i);return}
    if(step>0){restartAnim(sqs[i],'nope');return}   /* must finish the jump */
    const p=b[i];
    if(p&&(p>0?1:-1)===turn){
      const mine=legal.filter(m=>m.path[0]===i);
      if(mine.length){if(sel>=0&&pcs[sel])pcs[sel].classList.remove('lift');sel=i;cand=mine;pcs[i].classList.add('lift');beep(480,30)}
      else{restartAnim(pcs[i],'nope');beep(150,90,'sawtooth');if(legal.length&&legal[0].caps.length)st('You must jump! Pick a glowing piece.')
        if(sel>=0&&pcs[sel])pcs[sel].classList.remove('lift');sel=-1;cand=[]}
    }else{if(sel>=0&&pcs[sel])pcs[sel].classList.remove('lift');sel=-1;cand=[]}
    draw();
  }
  function hop(i){
    cand=cand.filter(m=>m.path[step+1]===i);const m=cand[0];
    hopAnim(m.path[step],i,m.caps.length?m.caps[step]:null);step++;sel=i;
    if(step===m.path.length-1){commit(m);return}
    /* more jumps: auto-continue when there is only one way on */
    const nx=new Set(cand.map(c=>c.path[step+1]));draw();
    if(nx.size===1){busy=true;S.after(300,()=>{busy=false;hop([...nx][0])})}
    else st('Keep jumping! Tap the next square.');
  }
  function commit(m){
    const was=b[m.path[0]];b=CKR.apply(b,m);last=[m.path[0],m.path[m.path.length-1]];
    const t=m.path[m.path.length-1];
    if(m.promo){const e=pcs[t];e.classList.add('king');S.after(10,()=>restartAnim(e,'crown'));beep(880,160);S.after(140,()=>beep(1180,160))}
    quiet=m.caps.length||m.promo||(was===1||was===-1)?0:quiet+1;
    sel=-1;step=0;cand=[];turn=-turn;setLegal();
    if(end()){draw();return}
    draw();
    if(!TWO&&turn===-1)aiTurn();
    else{
      const must=legal[0].caps.length;
      st(TWO?`${NM[turn]} to move.${must?' Jump is a must!':''}`:must?'Your move. You must jump!':'Your move.');
    }
  }
  function end(){
    if(!legal.length){
      over=true;const w=-turn,why=counts()[turn]?'is blocked':'has no pieces left';
      if(TWO){st(`${NM[turn]} ${why}. ${NM[w]} wins! Press ↻ for a rematch.`);S.fx.confetti();S.fx.banner(`${NM[w]} wins!`);beep(990,300)}
      else if(w===1){st('You win! The computer '+(why==='is blocked'?'cannot move.':'has no pieces left.'));beep(990,300);S.after(500,S.next)}
      else{st('The computer wins. Press ↻ to play again.');S.shake();beep(150,400,'sawtooth')}
      return true;
    }
    if(quiet>=80){over=true;st('Draw: 40 moves each with no jump or new king. Press ↻ to play again.');beep(440,200);return true}
    return false;
  }
  function aiTurn(){
    busy=true;st('Computer is thinking…');draw();
    S.after(360,()=>{
      const m=CKR.best(b,-1,L);
      const hops=m.path.length-1;
      for(let k=0;k<hops;k++)S.after(k*330,()=>{step=k;hopAnim(m.path[k],m.path[k+1],m.caps.length?m.caps[k]:null)});
      S.after(hops*330-100,()=>{busy=false;step=0;commit(m)});
    });
  }
  /* keyboard: arrows move a cursor, Enter/Space taps */
  S.on(window,'keydown',e=>{
    const k=e.key;const d={ArrowUp:-8,ArrowDown:8,ArrowLeft:-1,ArrowRight:1}[k];
    if(d!=null){e.preventDefault();if(cur<0)cur=sel>=0?sel:legal.length?legal[0].path[0]:36;else{const r=(cur>>3)+(Math.abs(d)===8?Math.sign(d):0),c=(cur&7)+(Math.abs(d)===1?d:0);if(r>=0&&r<8&&c>=0&&c<8)cur=r*8+c}draw()}
    else if((k==='Enter'||k===' ')&&cur>=0){e.preventDefault();const c=cur;tap(c);cur=c;draw()}
  });
  setLegal();draw();
}

const CCON_COL=['#FF3B4E','#FFD23F','#1EC8B0','#3D6BFF','#FF8A1F','#A855F7','#2DBE4F','#FF5FC8','#3FC7F5','#A3E635','#B7794A'];
/* random Hamiltonian path on an n×n grid: serpentine start + many backbite moves */
function CCON_ham(n,it){
  const N=n*n,p=[];for(let r=0;r<n;r++)for(let c=0;c<n;c++)p.push(r*n+(r%2?n-1-c:c));
  const pos=new Int16Array(N);p.forEach((v,i)=>pos[v]=i);
  const nb=v=>{const r=v/n|0,c=v%n,o=[];if(r)o.push(v-n);if(r<n-1)o.push(v+n);if(c)o.push(v-1);if(c<n-1)o.push(v+1);return o};
  const rev=(a,b)=>{for(;a<b;a++,b--){const t=p[a];p[a]=p[b];p[b]=t;pos[p[a]]=a;pos[p[b]]=b}};
  for(let k=0;k<it;k++){
    if(Math.random()<.5){const o=nb(p[0]),i=pos[o[Math.floor(Math.random()*o.length)]];if(i>1)rev(0,i-1)}
    else{const o=nb(p[N-1]),i=pos[o[Math.floor(Math.random()*o.length)]];if(i<N-2)rev(i+1,N-1)}
  }
  return p;
}
/* puzzle: cut the path into k segments (length >= 3); segment ends become the dots */
function CCON_gen(n){
  const N=n*n,adj=(a,b)=>Math.abs(a-b)===n||(Math.abs(a-b)===1&&(a/n|0)===(b/n|0));
  for(let tries=0;;tries++){
    const p=CCON_ham(n,N*25),k=Math.min(n+Math.floor(Math.random()*3),CCON_COL.length);
    for(let t=0;t<40;t++){
      const w=[...Array(k)].map(()=>.25+Math.random()**2),sw=w.reduce((a,b)=>a+b),extra=N-3*k;
      const len=w.map(v=>3+Math.floor(extra*v/sw));let left=N-len.reduce((a,b)=>a+b);
      while(left-->0)len[Math.floor(Math.random()*k)]++;
      const sol=[];let i=0;for(const L of len){sol.push(p.slice(i,i+L));i+=L}
      const ok=sol.every(s=>{
        const a=s[0],b=s[s.length-1];if(adj(a,b))return false;
        const row=s.every(v=>(v/n|0)===(a/n|0)),col=s.every(v=>v%n===a%n);
        return !(row||col)||s.length>=n-1&&Math.random()<.3;
      });
      if(ok)return{n,sol:shuffle(sol),dots:null};
    }
  }
}
function colorconnect(root,S){
  const SZ=[5,6,7,8,9],n=SZ[S.level-1],N=n*n,W=480,cs=W/n;
  const st=status(root,'Drag from a dot to its twin. Connect every pair and fill the whole board.');
  const bar=el('div','row mbar ccn-bar',root,'<span>Flows <b class="ccn-f">0/0</b></span><span>Filled <b class="ccn-p">0%</b></span><span>Moves <b class="ccn-m">0</b></span>');
  const {c,x}=canvas(root,W,W);c.classList.add('ccn-cv');c.dataset.max=620;
  const foot=el('div','row ccn-foot',root);
  const nextB=el('button','btn ghost ccn-next',foot,'New puzzle');const solvedEl=el('span','ccn-solved',foot);
  const fF=$('.ccn-f',bar),fP=$('.ccn-p',bar),fM=$('.ccn-m',bar);
  let K=pal();S.every(1000,()=>{K=pal()});
  const fx=sparks();
  let pz,k,dotAt,paths,owner,drag=null,moves,lastCol,won,T=0,done,pulse,hover=null;
  const skey='connect:solved:'+n;
  const showSolved=()=>{solvedEl.textContent=`Solved ${store.get(skey)||0} at ${n}×${n}`};
  function setup(){
    pz=CCON_gen(n);k=pz.sol.length;dotAt=new Int8Array(N).fill(-1);
    pz.sol.forEach((s,i)=>{dotAt[s[0]]=i;dotAt[s[s.length-1]]=i});
    paths=[...Array(k)].map(()=>[]);owner=new Int8Array(N).fill(-1);
    moves=0;lastCol=-1;won=false;done=Array(k).fill(false);pulse=Array(k).fill(-9);drag=null;
    nextB.textContent='New puzzle';nextB.classList.add('ghost');showSolved();refresh();
    c._pz=pz;c._paths=()=>paths;
  }
  const complete=i=>{const p=paths[i];return p.length>1&&dotAt[p[p.length-1]]===i};
  function refresh(){
    owner.fill(-1);paths.forEach((p,i)=>p.forEach(v=>owner[v]=i));
    let f=0,cov=0;for(let i=0;i<k;i++){const d=complete(i);if(d){f++;if(!done[i])pulse[i]=T}done[i]=d}
    for(let v=0;v<N;v++)if(owner[v]>=0)cov++;
    fF.textContent=f+'/'+k;fP.textContent=Math.floor(cov*100/N)+'%';fM.textContent=moves;
    return{f,cov};
  }
  const center=v=>[(v%n+.5)*cs,((v/n|0)+.5)*cs];
  function cellAt(e,clampIt){
    const q=c.pos(e);let cc=Math.floor(q.x/cs),r=Math.floor(q.y/cs);
    if(!clampIt&&(cc<0||r<0||cc>=n||r>=n))return -1;
    return clamp(r,0,n-1)*n+clamp(cc,0,n-1);
  }
  function rebuildOthers(){
    const mine=new Set(paths[drag.c]);
    for(let o=0;o<k;o++){if(o===drag.c)continue;const s=drag.snap[o];const j=s.findIndex(v=>mine.has(v));paths[o]=j<0?s.slice():s.slice(0,j)}
  }
  function step(t){
    const i=drag.c,p=paths[i],j=p.indexOf(t);
    if(j>=0){if(j===p.length-1)return false;p.length=j+1;return true}
    if(complete(i))return false;
    const h=p[p.length-1];if(!(Math.abs(t-h)===n||(Math.abs(t-h)===1&&(t/n|0)===(h/n|0))))return false;
    const d=dotAt[t];if(d>=0&&d!==i)return false;
    const cut=owner[t]>=0&&owner[t]!==i;p.push(t);
    if(d===i){beep(660,90);S.after(80,()=>beep(990,120))}else if(cut)beep(180,70,'square');else beep(300+p.length*22,40);
    return true;
  }
  function moveTo(t){
    let guard=0;
    while(guard++<40){
      const p=paths[drag.c],h=p[p.length-1];if(h===t)break;
      const dr=(t/n|0)-(h/n|0),dc=t%n-h%n;
      const a=Math.abs(dr)>=Math.abs(dc)?[h+Math.sign(dr)*n,dc?h+Math.sign(dc):null]:[h+Math.sign(dc),dr?h+Math.sign(dr)*n:null];
      let moved=false;for(const q of a){if(q!=null&&step(q)){moved=true;break}}
      if(!moved)break;rebuildOthers();
    }
    refresh();
  }
  S.on(c,'pointerdown',e=>{
    if(won||drag)return;const q=cellAt(e);if(q<0)return;e.preventDefault();
    const start=JSON.stringify(paths);let i=dotAt[q];
    if(i<0){i=owner[q];if(i<0)return;const p=paths[i];p.length=p.indexOf(q)+1}
    else paths[i]=[q];
    try{c.setPointerCapture(e.pointerId)}catch(_){}
    drag={c:i,id:e.pointerId,start,snap:paths.map(p=>p.slice())};
    hover=c.pos(e);beep(420,40);refresh();
  });
  S.on(c,'pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;hover=c.pos(e);moveTo(cellAt(e,true))});
  const end=e=>{
    if(!drag||e.pointerId!==drag.id)return;
    if(paths[drag.c].length<2)paths[drag.c]=[];
    if(JSON.stringify(paths)!==drag.start&&drag.c!==lastCol){moves++;lastCol=drag.c}
    drag=null;hover=null;const r=refresh();
    if(r.f===k&&r.cov===N)win();
    else if(r.f===k)st('All pairs joined. Fill the empty squares!');
  };
  S.on(c,'pointerup',end);S.on(c,'pointercancel',end);
  function win(){
    won=true;const tot=(store.get(skey)||0)+1;store.set(skey,tot);
    let all=0;for(const s of SZ)all+=store.get('connect:solved:'+s)||0;best('connect',all);
    showSolved();st(`Solved in ${moves} moves!`);
    pz.sol.forEach((s,i)=>{const [a,b]=center(s[0]);fx.add(a,b,CCON_COL[i],8)});
    nextB.textContent='Next puzzle ▶';nextB.classList.remove('ghost');restartAnim(nextB,'ccn-pop');
    S.next();
  }
  S.on(nextB,'click',()=>{setup();st('New puzzle. Connect every pair and fill the board.')});
  function draw(dt){
    dt=Math.max(0,dt);T+=dt;x.clearRect(0,0,W,W);
    const g=cs*.06;
    for(let v=0;v<N;v++){
      const [cx,cy]=center(v);const o=owner[v];
      x.fillStyle=K.line;x.globalAlpha=.55;rr(x,cx-cs/2+g,cy-cs/2+g,cs-2*g,cs-2*g,cs*.18);x.fill();
      if(o>=0){x.fillStyle=CCON_COL[o];x.globalAlpha=won?.32+.12*Math.sin(T*5-(v%n+(v/n|0))*.6):.24;x.fill()}
    }
    x.globalAlpha=1;x.lineCap='round';x.lineJoin='round';
    paths.forEach((p,i)=>{
      if(p.length<2)return;x.beginPath();p.forEach((v,j)=>{const [a,b]=center(v);j?x.lineTo(a,b):x.moveTo(a,b)});
      x.strokeStyle=K.edge;x.lineWidth=cs*.36+4;x.globalAlpha=.25;x.stroke();x.globalAlpha=1;
      x.strokeStyle=CCON_COL[i];x.lineWidth=cs*.36;x.stroke();
    });
    for(let v=0;v<N;v++){
      const i=dotAt[v];if(i<0)continue;const [a,b]=center(v);
      const age=T-pulse[i],s=age<.45?1+.25*Math.sin(age/.45*Math.PI):1;
      if(age<.6){x.strokeStyle=CCON_COL[i];x.globalAlpha=1-age/.6;x.lineWidth=3;x.beginPath();x.arc(a,b,cs*(.34+age*.5),0,7);x.stroke();x.globalAlpha=1}
      x.beginPath();x.arc(a,b,cs*.33*s,0,7);x.fillStyle=CCON_COL[i];x.fill();x.lineWidth=Math.max(2,cs*.05);x.strokeStyle=K.edge;x.stroke();
      x.beginPath();x.arc(a-cs*.1*s,b-cs*.1*s,cs*.08*s,0,7);x.fillStyle='rgba(255,255,255,.55)';x.fill();
      if(done[i]){x.beginPath();x.arc(a,b,cs*.13,0,7);x.fillStyle='rgba(255,255,255,.85)';x.fill()}
    }
    if(drag&&hover){x.beginPath();x.arc(hover.x,hover.y,cs*.55,0,7);x.fillStyle=CCON_COL[drag.c];x.globalAlpha=.22;x.fill();x.globalAlpha=1}
    fx.draw(x,dt);
  }
  setup();S.loop(draw);
}

/* Dots and Boxes: edges are numbered horizontals first (r*N+c, r=0..N), then verticals (HN+r*(N+1)+c) */
const DOTS={
  make(N){
    const HN=(N+1)*N,E=HN+N*(N+1),be=[],eb=[...Array(E)].map(()=>[]);
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){const b=r*N+c,es=[r*N+c,(r+1)*N+c,HN+r*(N+1)+c,HN+r*(N+1)+c+1];be.push(es);es.forEach(e=>eb[e].push(b))}
    return{N,E,HN,be,eb,L:new Uint8Array(E),own:new Uint8Array(N*N),sides:new Uint8Array(N*N),sc:[0,0],turn:0};
  },
  clone(s){return{...s,L:s.L.slice(),own:s.own.slice(),sides:s.sides.slice(),sc:s.sc.slice()}},
  /* draw edge e for the player to move; returns boxes completed (0 passes the turn) */
  play(s,e){
    if(s.L[e])throw new Error('edge taken');
    s.L[e]=s.turn+1;let got=0;
    for(const b of s.eb[e]){if(++s.sides[b]===4){s.own[b]=s.turn+1;s.sc[s.turn]++;got++}}
    if(!got)s.turn^=1;return got;
  },
  free(s){const f=[];for(let e=0;e<s.E;e++)if(!s.L[e])f.push(e);return f},
  gain(s,e){let n=0;for(const b of s.eb[e])if(s.sides[b]===3)n++;return n},
  safe(s,e){return s.eb[e].every(b=>s.sides[b]<2)},
  done(s){return s.sc[0]+s.sc[1]===s.N*s.N},
  /* take every box that can be taken; returns how many */
  greedy(s){
    let n=0,again=true;
    while(again){again=false;for(let e=0;e<s.E;e++)if(!s.L[e]&&DOTS.gain(s,e)){n+=DOTS.play(s,e);again=true}}
    return n;
  },
  give(s,e){const c=DOTS.clone(s);DOTS.play(c,e);return DOTS.greedy(c)},
  other(s,b,e){const x=s.eb[e];return x.length<2?-1:x[0]===b?x[1]:x[0]},
  openEdge(s,b,not){return s.be[b].find(e=>!s.L[e]&&e!==not)},
  /* split the unclaimed boxes into chains and loops (anything with a junction counts as a chain) */
  comps(s){
    const N2=s.N*s.N,seen=new Uint8Array(N2),out=[];
    for(let b0=0;b0<N2;b0++){
      if(s.own[b0]||seen[b0])continue;
      const st=[b0],bs=[];seen[b0]=1;let loop=true;
      while(st.length){
        const b=st.pop();bs.push(b);if(s.sides[b]!==2)loop=false;
        for(const e of s.be[b]){if(s.L[e])continue;const o=DOTS.other(s,b,e);if(o<0){loop=false;continue}if(!seen[o]){seen[o]=1;st.push(o)}}
      }
      out.push({t:loop&&bs.length>=4?'l':'c',n:bs.length,bs});
    }
    return out;
  },
  /* net boxes (mover minus opponent) when the mover must open one of these components */
  val(S,memo=new Map()){
    if(!S.length)return 0;const key=S.map(c=>c.t+c.n).sort().join();if(memo.has(key))return memo.get(key);
    let bestV=-1e9;const tried=new Set();
    S.forEach((c,i)=>{
      const k=c.t+c.n;if(tried.has(k))return;tried.add(k);
      const rest=S.filter((_,j)=>j!==i),v=DOTS.val(rest,memo);
      let opt=c.n+v;if(c.t==='l')opt=Math.max(opt,c.n-8-v);else if(c.n>=3)opt=Math.max(opt,c.n-4-v);
      bestV=Math.max(bestV,-opt);
    });
    memo.set(key,bestV);return bestV;
  },
  /* a decline (double-cross) chance: the only takeable boxes are the last 2 of a chain or the last 4 of a loop */
  dcross(s){
    const cap=[];for(let b=0;b<s.N*s.N;b++)if(!s.own[b]&&s.sides[b]===3)cap.push(b);
    if(cap.length===1){
      const A=cap[0],eAB=DOTS.openEdge(s,A),B=DOTS.other(s,A,eAB);if(B<0||s.sides[B]!==2)return null;
      const eF=DOTS.openEdge(s,B,eAB),C=DOTS.other(s,B,eF);if(C>=0&&s.sides[C]>=2)return null;
      return{e:eF,kind:'c'};
    }
    if(cap.length===2){
      const[A,D]=cap,eA=DOTS.openEdge(s,A),eD=DOTS.openEdge(s,D),B=DOTS.other(s,A,eA),C=DOTS.other(s,D,eD);
      if(B<0||C<0||B===C||B===D||s.sides[B]!==2||s.sides[C]!==2)return null;
      const eBC=DOTS.openEdge(s,B,eA);if(!s.eb[eBC].includes(C))return null;
      return{e:eBC,kind:'l'};
    }
    return null;
  },
  pickAny:a=>a[Math.floor(Math.random()*a.length)],
  minGive(s,F){let bv=1e9,bs=[];for(const e of F){const g=DOTS.give(s,e);if(g<bv){bv=g;bs=[e]}else if(g===bv)bs.push(e)}return{v:bv,bs}},
  easy(s){
    const F=DOTS.free(s),caps=F.filter(e=>DOTS.gain(s,e));if(caps.length)return DOTS.pickAny(caps);
    const safe=F.filter(e=>DOTS.safe(s,e));return DOTS.pickAny(safe.length&&Math.random()<.7?safe:F);
  },
  medium(s){
    const F=DOTS.free(s),caps=F.filter(e=>DOTS.gain(s,e));if(caps.length)return DOTS.pickAny(caps);
    const safe=F.filter(e=>DOTS.safe(s,e));if(safe.length)return DOTS.pickAny(safe);
    return DOTS.pickAny(DOTS.minGive(s,F).bs);
  },
  hard(s){
    const F=DOTS.free(s),caps=F.filter(e=>DOTS.gain(s,e));
    if(caps.length){
      const c=DOTS.clone(s),k=DOTS.greedy(c);
      const end=!DOTS.done(c)&&!DOTS.free(c).some(e=>DOTS.safe(c,e));
      if(end){
        const dc=DOTS.dcross(s);
        if(dc){const v=DOTS.val(DOTS.comps(c)),take=k+v,dec=(dc.kind==='l'?k-8:k-4)-v;if(dec>take)return dc.e}
      }
      /* take boxes that do not lead on first, keep a decline chance alive when possible */
      let bs=-1e9,be=caps[0];
      for(const e of caps){
        const t=DOTS.clone(s);DOTS.play(t,e);let sc=DOTS.gain(s,e)*3;
        if(end&&DOTS.dcross(t))sc+=5;
        sc+=Math.random()*.1;if(sc>bs){bs=sc;be=e}
      }
      return be;
    }
    const safe=F.filter(e=>DOTS.safe(s,e));
    if(safe.length)return DOTS.hardSafe(s,safe);
    /* every move gives something away: open the component that costs least, using the chain/loop value */
    const S=DOTS.comps(s),memo=new Map();let bestV=-1e9,pick=null;
    S.forEach((cp,i)=>{
      const rest=S.filter((_,j)=>j!==i),v=DOTS.val(rest,memo);
      let opt=cp.n+v;if(cp.t==='l')opt=Math.max(opt,cp.n-8-v);else if(cp.n>=3)opt=Math.max(opt,cp.n-4-v);
      const sc=-opt-cp.n*.01;if(sc>bestV){bestV=sc;pick=cp}
    });
    const inC=new Set(pick.bs),cand=F.filter(e=>s.eb[e].some(b=>inC.has(b)));
    const mg=DOTS.minGive(s,cand.length?cand:F);
    /* a 2-chain is opened in the middle so it cannot be declined */
    const mid=mg.bs.find(e=>s.eb[e].length===2&&s.eb[e].every(b=>inC.has(b)));
    return pick.n===2&&mid!=null?mid:DOTS.pickAny(mg.bs);
  },
  /* safe moves: when few are left, look ahead so the opponent is the one forced to open the first chain */
  hardSafe(s,safe){
    if(safe.length>12)return DOTS.pickAny(safe);
    const t0=Date.now(),memo=new Map();let budget=true;
    const win=st=>{ // true if the player to move can make the opponent run out of safe moves first
      if(!budget||Date.now()-t0>150){budget=false;return false}
      const key=st.L.join('');if(memo.has(key))return memo.get(key);
      const sf=DOTS.free(st).filter(e=>DOTS.safe(st,e));let r=false;
      for(const e of sf){const c=DOTS.clone(st);DOTS.play(c,e);if(!win(c)){r=true;break}}
      memo.set(key,r);return r;
    };
    const good=[];
    for(const e of safe){const c=DOTS.clone(s);DOTS.play(c,e);if(!win(c))good.push(e);if(!budget)break}
    if(!budget||!good.length)return DOTS.pickAny(safe);
    return DOTS.pickAny(good);
  }
};
function dotsboxes(root,S){
  const L=S.level,TWO=L===4,N=L===3?6:5,M=40,U=100,W=N*U+M*2;
  const names=TWO?['Blue','Red']:['You','CPU'],ini=TWO?['B','R']:['Y','C'];
  const st=status(root,TWO?'Take turns drawing lines. Close a box to claim it and go again.':'Draw a line between two dots. Close a box to claim it and go again.');
  const say=t=>{if(!COMPACT.matches||/^(Your turn|Computer is thinking)/.test(t))st(t)};
  const bar=el('div','row dbBar',root,names.map((n,i)=>`<div class="dbP p${i}"><span>${n}</span><b>0</b></div>`).join(''));
  const pills=[...bar.children];
  const wrap=el('div','dbWrap',root);wrap.dataset.ar=1;wrap.dataset.max=560;
  const ns='http://www.w3.org/2000/svg',mk=(t,a,p)=>{const e=document.createElementNS(ns,t);for(const k in a)e.setAttribute(k,a[k]);if(p)p.append(e);return e};
  const svg=mk('svg',{viewBox:`0 0 ${W} ${W}`,class:'dbSvg',role:'img','aria-label':'Dots and boxes board'},wrap);
  const gB=mk('g',{},svg),gE=mk('g',{},svg),gD=mk('g',{},svg);
  const s=DOTS.make(N);let busy=false,over=false,hov=-1,last=-1;
  const boxes=[...Array(N*N)].map((_,b)=>{const r=b/N|0,c=b%N,x=M+c*U,y=M+r*U;
    const g=mk('g',{class:'dbBox'},gB);mk('rect',{x:x+7,y:y+7,width:U-14,height:U-14,rx:12},g);
    const t=mk('text',{x:x+U/2,y:y+U/2+2,'text-anchor':'middle','dominant-baseline':'central'},g);return{g,t}});
  const ends=e=>{if(e<s.HN){const r=e/N|0,c=e%N;return[M+c*U,M+r*U,M+(c+1)*U,M+r*U]}const k=e-s.HN,r=k/(N+1)|0,c=k%(N+1);return[M+c*U,M+r*U,M+c*U,M+(r+1)*U]};
  const lines=[...Array(s.E)].map((_,e)=>{const[x1,y1,x2,y2]=ends(e);return mk('line',{x1,y1,x2,y2,class:'dbE',pathLength:100},gE)});
  for(let r=0;r<=N;r++)for(let c=0;c<=N;c++)mk('circle',{cx:M+c*U,cy:M+r*U,r:9,class:'dbD'},gD);
  function paint(){
    pills.forEach((p,i)=>{p.classList.toggle('on',!over&&s.turn===i);const v=p.querySelector('b');if(+v.textContent!==s.sc[i]){v.textContent=s.sc[i];restartAnim(p,'bump')}});
  }
  function draw(e){
    const who=s.turn,got=DOTS.play(s,e);
    if(last>=0)lines[last].classList.remove('last');last=e;
    const ln=lines[e];ln.setAttribute('class',`dbE on p${who} last`);hovSet(-1);
    beep(got?660:420+who*60,got?120:50);
    if(got){
      for(const b of s.eb[e])if(s.own[b]===who+1&&!boxes[b].g.classList.contains('own')){
        boxes[b].g.setAttribute('class',`dbBox own p${who}`);boxes[b].t.textContent=ini[who];
      }
      if(got===2)S.after(90,()=>beep(880,120));
    }
    paint();
    if(DOTS.done(s)){finish();return}
  }
  function finish(){
    over=true;paint();const[a,b]=s.sc;
    if(TWO){
      if(a===b){st(`It's a tie, ${a} to ${b}! Press ↻ for a rematch.`);S.fx.banner("It's a tie!")}
      else{const w=a>b?0:1;st(`${names[w]} wins ${Math.max(a,b)} to ${Math.min(a,b)}! Press ↻ for a rematch.`);S.fx.confetti();S.fx.banner(`${names[w]} wins!`,`${Math.max(a,b)} – ${Math.min(a,b)}`);beep(990,300)}
    }else if(a>b){st(`You win ${a} to ${b}!`);S.fx.confetti();S.after(500,S.next)}
    else if(a<b){st(`The computer wins ${b} to ${a}. Press ↻ to try again.`);S.shake();beep(150,400,'sawtooth')}
    else st(`It's a tie, ${a} to ${b}. Press ↻ to play again.`);
  }
  const AI=[DOTS.easy,DOTS.medium,DOTS.hard][L-1];
  function aiTurn(first){
    busy=true;st('Computer is thinking…');
    S.after(first?520:360,()=>{
      if(over)return;const e=AI(s);draw(e);
      if(over)return;if(s.turn===1)aiTurn(false);else{busy=false;st('Your turn. Draw a line.')}
    });
  }
  function edgeAt(ev){
    const r0=svg.getBoundingClientRect(),x=(ev.clientX-r0.left)*W/r0.width,y=(ev.clientY-r0.top)*W/r0.height;
    const gx=(x-M)/U,gy=(y-M)/U;if(gx<-.6||gy<-.6||gx>N+.6||gy>N+.6)return -1;
    const c=clamp(Math.floor(gx),0,N-1),r=clamp(Math.floor(gy),0,N-1),fx=gx-c,fy=gy-r;
    const es=s.be[r*N+c],d=[Math.abs(fy),Math.abs(1-fy),Math.abs(fx),Math.abs(1-fx)];
    let bi=-1;for(let i=0;i<4;i++)if(!s.L[es[i]]&&(bi<0||d[i]<d[bi]))bi=i;
    return bi<0?-1:es[bi];
  }
  function hovSet(e){
    if(hov===e)return;if(hov>=0&&!s.L[hov])lines[hov].setAttribute('class','dbE');hov=e;
    if(e>=0&&!s.L[e])lines[e].setAttribute('class',`dbE hov p${s.turn}`);
  }
  S.on(svg,'pointermove',ev=>{if(ev.pointerType==='mouse'&&!busy&&!over)hovSet(edgeAt(ev))});
  S.on(svg,'pointerleave',()=>hovSet(-1));
  S.on(svg,'click',ev=>{
    if(busy||over)return;const e=edgeAt(ev);if(e<0||s.L[e])return;
    const who=s.turn;draw(e);if(over)return;
    if(TWO){say(`${names[s.turn]}'s turn.${s.turn===who?' Go again!':''}`);return}
    if(s.turn===1)aiTurn(true);else st('Your turn. Go again!');
  });
  paint();
}

/* Four in a Row: 7 columns x 6 rows. Cell index c*6+r (r=0 is the bottom). 1 = first player (red), -1 = second (yellow). */
const FOURR=(()=>{
  const C=7,R=6,LINES=[],OF=[...Array(42)].map(()=>[]);
  for(let c=0;c<C;c++)for(let r=0;r<R;r++)for(const[dc,dr]of[[1,0],[0,1],[1,1],[1,-1]]){
    const ec=c+3*dc,er=r+3*dr;if(ec<0||ec>=C||er<0||er>=R)continue;
    const l=[0,1,2,3].map(k=>(c+k*dc)*R+r+k*dr);LINES.push(l);for(const i of l)OF[i].push(l);
  }
  const ORDER=[3,2,4,1,5,0,6],WIN=1e6;
  const F={C,R,LINES,ORDER,WIN,
    make(){return{b:new Int8Array(42),h:new Int8Array(7),n:0}},
    can(s,c){return c>=0&&c<C&&s.h[c]<R},
    drop(s,c,p){const i=c*R+s.h[c];s.b[i]=p;s.h[c]++;s.n++;return i},
    undo(s,c){s.h[c]--;s.b[c*R+s.h[c]]=0;s.n--},
    winLine(s,i){const p=s.b[i];if(!p)return null;for(const l of OF[i])if(s.b[l[0]]===p&&s.b[l[1]]===p&&s.b[l[2]]===p&&s.b[l[3]]===p)return l;return null},
    full(s){return s.n>=42},
    /* column where side wins at once, or -1 */
    winning(s,p){for(const c of ORDER)if(F.can(s,c)){const i=F.drop(s,c,p),w=F.winLine(s,i);F.undo(s,c);if(w)return c}return -1},
    evalS(s,p){
      let v=0;const b=s.b;
      for(let r=0;r<R;r++){const q=b[3*R+r];if(q)v+=q*3}
      for(const l of LINES){
        let a=0,o=0;for(const i of l){const q=b[i];if(q===1)a++;else if(q===-1)o++}
        if(a&&o)continue;
        if(a===3)v+=6;else if(a===2)v+=2;else if(o===3)v-=6;else if(o===2)v-=2;
      }
      return v*p;
    },
    nega(s,p,depth,alpha,beta,ply,ctx){
      if((++ctx.nodes&2047)===0&&performance.now()>ctx.deadline)ctx.stop=true;
      if(ctx.stop)return 0;
      if(depth===0)return F.evalS(s,p);
      let best=-Infinity,any=false;
      /* immediate win first */
      for(const c of ORDER)if(F.can(s,c)){const i=F.drop(s,c,p),w=F.winLine(s,i);F.undo(s,c);if(w)return WIN-ply}
      for(const c of ORDER){
        if(!F.can(s,c))continue;any=true;
        F.drop(s,c,p);
        const v=F.full(s)?0:-F.nega(s,-p,depth-1,-beta,-alpha,ply+1,ctx);
        F.undo(s,c);
        if(ctx.stop)return 0;
        if(v>best)best=v;if(v>alpha)alpha=v;if(alpha>=beta)break;
      }
      return any?best:0;
    },
    /* pick a column for side p. level 1..3 */
    best(s,p,level,timeMs){
      const free=ORDER.filter(c=>F.can(s,c));if(free.length===1)return free[0];
      const win=F.winning(s,p),block=F.winning(s,-p);
      if(level===1){
        if(win>=0&&Math.random()<.7)return win;
        if(block>=0&&Math.random()<.4)return block;
        const w=free.map(c=>4-Math.abs(3-c));let t=Math.random()*w.reduce((a,b)=>a+b,0);
        for(let k=0;k<free.length;k++){t-=w[k];if(t<=0)return free[k]}return free[0];
      }
      if(win>=0)return win;
      if(block>=0)return block;
      const maxD=level===2?4:12,ctx={nodes:0,stop:false,deadline:performance.now()+(timeMs||(level===2?200:320))};
      let bestC=free[0],order=free.slice();
      for(let d=1;d<=maxD&&d<=42-s.n;d++){
        let a=-Infinity,sc=[];
        for(const c of order){
          F.drop(s,c,p);const v=F.full(s)?0:-F.nega(s,-p,d-1,-Infinity,-a+1,1,ctx);F.undo(s,c);
          if(ctx.stop)break;sc.push([v,c]);if(v>a)a=v;
        }
        if(ctx.stop)break;
        const top=sc.filter(x=>x[0]===a).map(x=>x[1]);
        bestC=level===2?top[Math.floor(Math.random()*top.length)]:top[0];
        order=[bestC,...order.filter(c=>c!==bestC)];
        if(Math.abs(a)>WIN-100)break;
      }
      return bestC;
    }
  };
  return F;
})();

function fourrow(root,S){
  const L=S.level,TWO=L===4,F=FOURR;
  const NM={1:TWO?'Red':'You','-1':TWO?'Yellow':'Computer'};
  const st=status(root,TWO?'Red goes first. Take turns dropping discs. Get four in a row to win.':'You are Red. Drop discs to get four in a row: across, up, or diagonal.');
  const bar=el('div','fr-bar',root);
  const side=[1,-1].map(p=>{const e=el('div','fr-who '+(p>0?'red':'yel'),bar,'<i></i><b></b>');e.querySelector('b').textContent=NM[p];return e});
  const w=el('div','fr-wrap',root);w.dataset.ar=7/7.45;w.dataset.max=560;
  const top=el('div','fr-top',w),ghost=el('div','fr-ghost',top);
  const g=el('div','fr-board',w);
  const cells=[];
  for(let r=5;r>=0;r--)for(let c=0;c<7;c++){const e=el('div','fr-cell',g);e.style.animationDelay=(c+(5-r))*30+'ms';cells[c*6+r]=e}
  const hits=[...Array(7)].map((_,c)=>{const e=el('button','fr-col',w);e.style.left=c*100/7+'%';e.setAttribute('aria-label','Column '+(c+1));
    S.on(e,'click',()=>{col=c;play(c)});S.on(e,'pointerenter',()=>{col=c;paint()});return e});
  const s=F.make();let turn=1,col=3,busy=false,over=false;
  function paint(){
    ghost.className='fr-ghost '+(turn>0?'red':'yel')+((over||busy||(!TWO&&turn!==1))?' off':'');
    ghost.style.left=col*100/7+'%';
    hits.forEach((e,c)=>e.classList.toggle('hov',c===col&&!over));
    side.forEach((e,k)=>e.classList.toggle('on',!over&&turn===(k?-1:1)));
  }
  function put(c,p){
    const r=s.h[c],i=F.drop(s,c,p);
    const d=el('div','fr-disc '+(p>0?'red':'yel'),cells[i]);d.style.setProperty('--n',6-r);
    S.after(Math.min(380,140+(6-r)*45),()=>beep(p>0?330:440,70));
    return i;
  }
  function play(c){
    if(over||busy||(!TWO&&turn!==1))return;
    if(!F.can(s,c)){restartAnim(hits[c],'nope');beep(140,90,'sawtooth');return}
    const i=put(c,turn);
    if(finish(i))return;
    turn=-turn;
    if(!TWO){busy=true;st('Computer is thinking…');paint();
      S.after(480,()=>{const m=F.best(s,-1,L);const j=put(m,-1);busy=false;if(finish(j))return;turn=1;st('Your turn.');paint()})}
    else{st(`${NM[turn]}'s turn.`);paint()}
  }
  function finish(i){
    const l=F.winLine(s,i);
    if(l){
      over=true;const p=s.b[i];
      S.after(820,()=>{g.classList.add('done');l.forEach((j,k)=>{const d=cells[j].firstChild;d.classList.add('win');d.style.animationDelay=k*90+'ms'})});
      if(TWO){st(`${NM[p]} wins! Press ↻ for a rematch.`);S.after(900,()=>{S.fx.confetti();S.fx.banner(`${NM[p]} wins!`);beep(990,300)})}
      else if(p===1){st('Four in a row! You win!');S.after(1000,S.next)}
      else{st('The computer got four in a row. Press ↻ to try again.');S.after(850,()=>{S.shake();beep(150,400,'sawtooth')})}
      paint();return true;
    }
    if(F.full(s)){over=true;st("Board full. It's a draw! Press ↻ to play again.");paint();return true}
    return false;
  }
  S.on(window,'keydown',e=>{
    const k=e.key;
    if(k==='ArrowLeft'||k==='ArrowRight'){e.preventDefault();col=clamp(col+(k==='ArrowLeft'?-1:1),0,6);beep(600,20);paint()}
    else if(k==='Enter'||k===' '||k==='ArrowDown'){e.preventDefault();play(col)}
    else if(/^[1-7]$/.test(k)){col=+k-1;play(col)}
  });
  paint();
}

/* Tower of Hanoi: move the whole tower to the right peg, never a bigger disc on a smaller one */
const HANOI_COL=['#FF5D73','#FF8A3D','#FFC53D','#7BD957','#2EC4B6','#5CC8FF','#5B6CFF','#B06CFF'];
/* optimal moves from any legal position: pos[k] = peg of disc k (1 = smallest) */
function hanoiPlan(pos,n,target){
  const p=pos.slice(),out=[];
  (function go(k,t){if(!k)return;if(p[k]===t){go(k-1,t);return}const o=3-p[k]-t;go(k-1,o);out.push([p[k],t]);p[k]=t;go(k-1,t)})(n,target);
  return out;
}
function hanoi(root,S){
  const n=S.level+2,MIN=2**n-1,BK='hanoi'+n;
  const st=status(root,`Move all ${n} discs to the right peg. Never put a bigger disc on a smaller one.`);
  const bar=el('div','row mbar hn-bar',root,`<span class="hn-mv">Moves 0 <small>/ ${MIN}</small></span><span class="hn-t">⏱️ 0:00</span><span class="hn-best"></span>`);
  const mvEl=$('.hn-mv',bar),tEl=$('.hn-t',bar),bEl=$('.hn-best',bar);
  const dh=Math.min(10.5,60/n),H=10+dh*(n+2.9)+2,baseTop=H-10,pegTop=baseTop-dh*(n+1.3),liftY=pegTop-dh*1.6,PX=[100/6,50,500/6];
  const g=el('div','hn',root);g.dataset.ar=100/H;g.style.aspectRatio=100/H;g.dataset.max=640;g.style.setProperty('--dh',dh+'cqw');
  el('div','hn-goal',g).style.cssText=`left:${PX[2]-15}cqw;top:${pegTop-dh*.6}cqw;height:${baseTop-pegTop+dh*.6}cqw`;
  const pegs=PX.map((x,i)=>{const p=el('div','hn-peg',g);p.style.cssText=`left:${x}cqw;top:${pegTop}cqw;height:${baseTop-pegTop+1}cqw`;return p});
  const base=el('div','hn-base',g);base.style.top=baseTop+'cqw';
  PX.forEach((x,i)=>{const l=el('span','hn-lab'+(i===2?' goal':''),base,i===2?'3 🏁':String(i+1));l.style.left=x+'cqw'});
  const ctl=el('div','row hn-ctl',root);const demoB=el('button','btn ghost',ctl,'▶ Show me');
  const W=k=>10+(n>1?(31-10)*(k-1)/(n-1):0);
  const stacks=[[],[],[]],pos=[0],discs=[0];
  for(let k=n;k>=1;k--){stacks[0].push(k);pos[k]=0}
  for(let k=1;k<=n;k++){const d=el('div','hn-disc',g,`<span>${k}</span>`);d.style.width=W(k)+'cqw';d.style.background=HANOI_COL[(k-1)%8];d.style.animationDelay=(n-k)*60+'ms';discs[k]=d}
  let held=0,from=-1,moves=0,t0=0,over=false,demo=false,helped=false,demoT=0,drag=null,secs=-1;
  const restY=(peg,idx)=>baseTop-(idx+1)*dh;
  function place(k,x,y,ms){const d=discs[k];d.style.transitionDuration=(ms==null?180:ms)+'ms';d.style.translate=`${x-W(k)/2}cqw ${y}cqw`}
  function settle(peg,ms){stacks[peg].forEach((k,i)=>place(k,PX[peg],restY(peg,i),ms))}
  const fmt=s=>`${s/60|0}:${String(s%60).padStart(2,'0')}`;
  function showBest(){const b=store.get('best:'+BK);bEl.textContent=b?`🏆 ${b}`:'';bEl.hidden=!b}
  function hint(){pegs.forEach((p,i)=>p.classList.toggle('ok',!!held&&i!==from&&legal(i)))}
  const legal=t=>!stacks[t].length||stacks[t][stacks[t].length-1]>held;
  function lift(peg){
    if(!stacks[peg].length){restartAnim(pegs[peg],'nope');beep(200,70,'square');return false}
    from=peg;held=stacks[peg][stacks[peg].length-1];place(held,PX[peg],liftY,160);discs[held].classList.add('held');beep(440+held*30,50);hint();return true;
  }
  function drop(t,dragged){
    const k=held;
    if(t===from){stacks[from].pop();stacks[from].push(k);settle(from,dragged?120:160);discs[k].classList.remove('held');held=0;from=-1;hint();beep(360,40);return}
    if(!legal(t)){
      restartAnim(discs[k],'nope');beep(150,180,'sawtooth');
      st(`Disc ${k} is bigger than disc ${stacks[t][stacks[t].length-1]}. It can't go there.`);
      if(dragged){place(k,PX[from],liftY,150)}return;
    }
    stacks[from].pop();stacks[t].push(k);pos[k]=t;
    const idx=stacks[t].length-1;
    if(dragged)place(k,PX[t],restY(t,idx),130);
    else{place(k,PX[t],liftY,130);S.after(130,()=>place(k,PX[t],restY(t,idx),140))}
    discs[k].classList.remove('held');held=0;from=-1;hint();
    if(!t0)t0=performance.now();moves++;mvEl.innerHTML=`Moves ${moves} <small>/ ${MIN}</small>`;restartAnim(mvEl,'bump');
    S.after(dragged?120:260,()=>beep(300+k*40,70));
    check();
  }
  function check(){
    if(stacks[2].length!==n){if(!demo)st(`Moves ${moves}. Minimum is ${MIN}.`);return}
    over=true;const s=Math.max(1,Math.round((performance.now()-t0)/1000));tEl.textContent='⏱️ '+fmt(s);
    S.after(300,()=>{discs.forEach((d,k)=>{if(k){d.style.animationDelay=(n-k)*50+'ms';restartAnim(d,'win')}})});
    if(demo){st(`That is how it's done: ${MIN} moves. Press ↻ to try it yourself.`);demoB.disabled=true;S.fx.toast('Solved!',`${MIN} moves`);return}
    const rec=!helped&&best(BK,moves,true);showBest();demoB.disabled=true;
    st(moves===MIN&&!helped?`Perfect! ${moves} moves, the minimum, in ${fmt(s)}.`:`Solved in ${moves} moves and ${fmt(s)}. The minimum is ${MIN}.`+(rec?' New best!':helped?' (With help, so no best score.)':''));
    S.after(500,S.next);
  }
  function tapPeg(p){
    if(over||demo)return;
    if(!held)lift(p);else drop(p,false);
  }
  const pegAt=e=>{const r=g.getBoundingClientRect();return clamp(Math.floor((e.clientX-r.left)/r.width*3),0,2)};
  const ptAt=e=>{const r=g.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*100,y:(e.clientY-r.top)/r.width*100}};
  S.on(g,'pointerdown',e=>{
    if(over||demo||(e.pointerType==='mouse'&&e.button!==0))return;
    const p=pegAt(e);let picked=false;
    if(!held){if(!lift(p))return;picked=true}
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,picked,moved:false};
    try{g.setPointerCapture(e.pointerId)}catch(_){}
  });
  S.on(g,'pointermove',e=>{
    if(!drag||e.pointerId!==drag.id||!held)return;
    if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<10)return;
    drag.moved=true;const q=ptAt(e);place(held,clamp(q.x,0,100),clamp(q.y-dh/2,0,H-dh),0);
  });
  const end=e=>{
    if(!drag||e.pointerId!==drag.id)return;const d=drag;drag=null;if(!held)return;
    if(d.moved)drop(pegAt(e),true);
    else if(!d.picked)drop(pegAt(e),false);
  };
  S.on(g,'pointerup',end);
  S.on(g,'pointercancel',e=>{if(drag&&e.pointerId===drag.id){drag=null;if(held)place(held,PX[from],liftY,150)}});
  S.on(window,'keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(/^[1-3]$/.test(e.key)){e.preventDefault();tapPeg(+e.key-1)}
    else if(e.key==='Escape'&&held)drop(from,false);
  });
  S.on(demoB,'click',()=>{
    if(over)return;
    if(demo){demo=false;demoB.textContent='▶ Show me';st('Your turn again.');return}
    if(held)drop(from,false);
    demo=true;helped=true;demoB.textContent='⏸ Stop';st('Watch the shortest solution from here…');
    const step=Math.max(170,720-n*70);
    const run=()=>{
      if(!demo||over)return;const plan=hanoiPlan(pos,n,2);if(!plan.length)return;
      const [a,b]=plan[0];lift(a);S.after(step*.35,()=>{if(demo)drop(b,false);else drop(from,false)});
      demoT=S.after(step,run);
    };
    run();
  });
  S.every(250,()=>{if(over||!t0)return;const s=Math.floor((performance.now()-t0)/1000);if(s!==secs){secs=s;tEl.textContent='⏱️ '+fmt(s)}});
  showBest();settle(0,0);
}

const POOL_C=['#f7f4ea','#f3c300','#1f4fd6','#d7262b','#6a2ea6','#f0791a','#10834a','#8d1d1d','#151515'];
/* pure table physics, rules and AI (no DOM), shared by the game and the tests */
const POOL=(()=>{
  const R=7.5,PW=272,PH=544,VMAX=1500,A=110,KD=.6,EB=.95,EC=.74,HSTEP=1/480,CM=2.6*R,SM=2*R;
  const SEGS=[[CM,0,PW-CM,0],[CM,PH,PW-CM,PH],[0,CM,0,PH/2-SM],[0,PH/2+SM,0,PH-CM],[PW,CM,PW,PH/2-SM],[PW,PH/2+SM,PW,PH-CM]];
  const POCK=[[-.5*R,-.5*R],[PW+.5*R,-.5*R],[-1.1*R,PH/2],[PW+1.1*R,PH/2],[-.5*R,PH+.5*R],[PW+.5*R,PH+.5*R]];
  const AIMP=[[.3*R,.3*R],[PW-.3*R,.3*R],[-.6*R,PH/2],[PW+.6*R,PH/2],[.3*R,PH-.3*R],[PW-.3*R,PH-.3*R]];
  const DIAG=[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]];
  const HEAD={x:PW/2,y:PH*.75},FOOT={x:PW/2,y:PH*.25};
  const typ=n=>n<8?'S':'T';
  function rack(rng=Math.random){
    const sh=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
    const pos=[];for(let i=0;i<5;i++)for(let j=0;j<=i;j++)pos.push([FOOT.x+(j-i/2)*2.01*R,FOOT.y-i*1.75*R]);
    const s=sh([1,2,3,4,5,6,7]),t=sh([9,10,11,12,13,14,15]),slot=Array(15);
    slot[4]=8;if(rng()<.5){slot[10]=s.pop();slot[14]=t.pop()}else{slot[10]=t.pop();slot[14]=s.pop()}
    const rest=sh([...s,...t]);for(let i=0;i<15;i++)if(slot[i]==null)slot[i]=rest.pop();
    const B=[];B[0]={n:0,x:HEAD.x,y:HEAD.y,vx:0,vy:0,on:true,ph:0,ang:0};
    slot.forEach((n,i)=>{B[n]={n,x:pos[i][0],y:pos[i][1],vx:0,vy:0,on:true,ph:0,ang:-Math.PI/2}});
    return B;
  }
  function step(B,h,ev){
    for(const b of B){if(!b.on)continue;const s=Math.hypot(b.vx,b.vy);if(s>0){const ns=s-(A+KD*s)*h;if(ns<2.5){b.vx=b.vy=0}else{const k=ns/s;b.vx*=k;b.vy*=k;b.x+=b.vx*h;b.y+=b.vy*h;b.ph+=ns*h/R;b.ang=Math.atan2(b.vy,b.vx)}}}
    for(let i=0;i<B.length;i++){const a=B[i];if(!a.on)continue;
      for(let j=i+1;j<B.length;j++){const b=B[j];if(!b.on)continue;const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy;if(d2>=4*R*R||d2===0)continue;
        const d=Math.sqrt(d2),nx=dx/d,ny=dy/d,o=(2*R-d)/2;a.x-=nx*o;a.y-=ny*o;b.x+=nx*o;b.y+=ny*o;
        const rel=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(rel>0){const im=(1+EB)/2*rel;a.vx-=im*nx;a.vy-=im*ny;b.vx+=im*nx;b.vy+=im*ny;if(ev&&ev.hit)ev.hit(a,b,rel)}}}
    for(const b of B){if(!b.on)continue;
      for(const s of SEGS){const x1=s[0],y1=s[1],ex=s[2]-x1,ey=s[3]-y1;let t=((b.x-x1)*ex+(b.y-y1)*ey)/(ex*ex+ey*ey);t=t<0?0:t>1?1:t;
        const qx=x1+ex*t,qy=y1+ey*t,dx=b.x-qx,dy=b.y-qy,d2=dx*dx+dy*dy;if(d2>=R*R||d2===0)continue;
        const d=Math.sqrt(d2),nx=dx/d,ny=dy/d;b.x=qx+nx*R;b.y=qy+ny*R;const vn=b.vx*nx+b.vy*ny;
        if(vn<0){const tx=-ny,ty=nx,vt=b.vx*tx+b.vy*ty;b.vx=-vn*EC*nx+vt*.96*tx;b.vy=-vn*EC*ny+vt*.96*ty;if(ev&&ev.rail)ev.rail(b,-vn)}}
      if(b.x<0||b.x>PW||b.y<0||b.y>PH){b.on=false;b.vx=b.vy=0;let k=0,bd=1e9;POCK.forEach((p,i)=>{const d=Math.hypot(p[0]-b.x,p[1]-b.y);if(d<bd){bd=d;k=i}});b.pk=k;if(ev&&ev.pot)ev.pot(b,k)}}
  }
  const moving=B=>B.some(b=>b.on&&(b.vx||b.vy));
  const energy=B=>B.reduce((e,b)=>e+(b.on?b.vx*b.vx+b.vy*b.vy:0),0)/2;
  const clone=B=>B.map(b=>({...b}));
  const shotRec=isBreak=>({first:null,pots:[],scratch:false,isBreak,rails:0,contact:false});
  function recorder(sh,extra){
    return{
      hit(a,b,rel){if(sh.first==null&&(a.n===0||b.n===0))sh.first=a.n===0?b.n:a.n;sh.contact=true;extra&&extra.hit&&extra.hit(a,b,rel)},
      rail(b,v){if(sh.first!=null)sh.rails++;extra&&extra.rail&&extra.rail(b,v)},
      pot(b,k){sh.pots.push(b.n);if(b.n===0)sh.scratch=true;extra&&extra.pot&&extra.pot(b,k)}
    };
  }
  function strike(B,a,v){B[0].vx=Math.cos(a)*v;B[0].vy=Math.sin(a)*v}
  /* run a shot to rest on a copy of the balls; returns the shot record and final balls */
  function runShot(B0,a,v,isBreak,maxT=25){
    const B=clone(B0),sh=shotRec(isBreak),ev=recorder(sh);strike(B,a,v);let t=0;
    while(moving(B)&&t<maxT){step(B,HSTEP,ev);t+=HSTEP}
    return{sh,B,t};
  }
  function cast(B,c,dx,dy){
    let best=1e9,hit=null;
    for(const b of B){if(!b.on||b===c)continue;const fx=b.x-c.x,fy=b.y-c.y,p=fx*dx+fy*dy;if(p<=0)continue;const q=fx*fx+fy*fy-p*p,r2=4*R*R;if(q>=r2)continue;const t=p-Math.sqrt(r2-q);if(t<best){best=t;hit=b}}
    let tw=1e9;if(dx>1e-9)tw=Math.min(tw,(PW-R-c.x)/dx);if(dx<-1e-9)tw=Math.min(tw,(R-c.x)/dx);if(dy>1e-9)tw=Math.min(tw,(PH-R-c.y)/dy);if(dy<-1e-9)tw=Math.min(tw,(R-c.y)/dy);
    return tw<best?{t:Math.max(0,tw),hit:null}:{t:Math.max(0,best),hit};
  }
  function clear(B,ax,ay,bx,by,skip,rad=2*R){
    const ex=bx-ax,ey=by-ay,L2=ex*ex+ey*ey||1;
    for(const b of B){if(!b.on||skip.includes(b))continue;let t=((b.x-ax)*ex+(b.y-ay)*ey)/L2;t=t<0?0:t>1?1:t;if(Math.hypot(ax+ex*t-b.x,ay+ey*t-b.y)<rad*.98)return false}
    return true;
  }
  function needV(d,ve){let v2=ve*ve;const n=24,ds=d/n;for(let i=0;i<n;i++)v2+=2*(A+KD*Math.sqrt(v2))*ds;return Math.sqrt(v2)}
  const okSpot=(B,x,y,skip)=>x>=R&&x<=PW-R&&y>=R&&y<=PH-R&&B.every(b=>!b.on||b===skip||Math.hypot(b.x-x,b.y-y)>=2*R+.5);
  function freeSpot(B,x,y,skip){for(let i=0;i<200;i++){const d=Math.ceil(i/2)*R*.8*(i%2?1:-1),yy=y+d;if(okSpot(B,x,yy,skip))return{x,y:yy};if(okSpot(B,x+d,y,skip))return{x:x+d,y}}return{x,y}}
  const targetsFor=(B,g,cleared)=>B.filter(b=>b.on&&b.n&&(cleared?b.n===8:g?b.n!==8&&typ(b.n)===g:b.n!==8));
  const isCleared=(B,g)=>!!g&&!B.some(b=>b.on&&b.n&&b.n!==8&&typ(b.n)===g);
  /* straight ghost-ball shots for every target ball and pocket, scored by cut angle and distance */
  function shots(B,g,cleared){
    const cue=B[0],out=[];
    for(const t of targetsFor(B,g,cleared))for(let k=0;k<6;k++){
      const px=AIMP[k][0],py=AIMP[k][1];let ux=px-t.x,uy=py-t.y;const d2=Math.hypot(ux,uy);if(d2<1)continue;ux/=d2;uy/=d2;
      const dg=DIAG[k],dl=Math.hypot(dg[0],dg[1]),ap=(ux*dg[0]+uy*dg[1])/dl;if(ap<(k===2||k===3?.7:.5))continue;
      const gx=t.x-ux*2*R,gy=t.y-uy*2*R;if(gx<R-.5||gx>PW-R+.5||gy<R-.5||gy>PH-R+.5)continue;
      const vx=gx-cue.x,vy=gy-cue.y,d1=Math.hypot(vx,vy);if(d1<1)continue;const cs=(vx*ux+vy*uy)/d1;if(cs<.2)continue;
      if(!clear(B,cue.x,cue.y,gx,gy,[cue,t]))continue;if(!clear(B,t.x,t.y,px,py,[t,cue]))continue;
      const vc=needV(d2,90)/(cs*(1+EB)/2),v0=needV(d1,vc)*1.1;
      const score=cs*cs/(1+d1/500+d2/280)*(v0>VMAX?.3:1)*(k===2||k===3?.85:1)*(.7+.3*ap);
      out.push({a:Math.atan2(vy,vx),v:Math.min(VMAX,Math.max(160,v0)),score,t:t.n,k});
    }
    return out.sort((p,q)=>q.score-p.score);
  }
  function legalResult(sh,g,cleared,B0){
    if(sh.scratch||sh.first==null)return false;
    if(cleared)return sh.first===8;
    if(sh.first===8||(g&&typ(sh.first)!==g))return false;
    if(sh.pots.includes(8))return false;
    return true;
  }
  function gauss(rng){return(rng()+rng()+rng()-1.5)*1.41}
  /* computer shot: level 1 easy, 2 hard */
  function plan(B,g,level,isBreak,rng=Math.random){
    const cue=B[0],hard=level>=2,cleared=isCleared(B,g);let p=null;
    if(isBreak){const a=Math.atan2(FOOT.y-cue.y,FOOT.x+(rng()-.5)*3-cue.x);return{a:a+gauss(rng)*(hard?.004:.012),v:VMAX*(hard?.98:.85),kind:'break'}}
    const list=shots(B,g,cleared);
    if(!hard)list.forEach(s=>s.score*=.45+rng()*1.1);
    list.sort((p,q)=>q.score-p.score);
    if(hard){
      for(const s of list.slice(0,7)){const r=runShot(B,s.a,s.v,false);if(legalResult(r.sh,g,cleared)&&r.sh.pots.includes(s.t)){p=s;break}}
      if(!p&&list.length&&list[0].score>.25)p=list[0];
    }else if(list.length)p=list[Math.min(list.length-1,rng()<.25?1:0)];
    if(p){const sd=hard?.0019:.011;return{a:p.a+gauss(rng)*sd,v:Math.min(VMAX,p.v*(1+(rng()-.5)*(hard?.06:.3))),kind:'pot',t:p.t}}
    return safety(B,g,cleared,hard,rng);
  }
  function safety(B,g,cleared,hard,rng){
    const cue=B[0],T=targetsFor(B,g,cleared).sort((p,q)=>Math.hypot(p.x-cue.x,p.y-cue.y)-Math.hypot(q.x-cue.x,q.y-cue.y));
    const cands=[];
    for(const t of T){
      if(clear(B,cue.x,cue.y,t.x,t.y,[cue,t]))for(const off of [0,-.6,.6,-1.2,1.2]){const a=Math.atan2(t.y-cue.y,t.x-cue.x),d=Math.hypot(t.y-cue.y,t.x-cue.x);cands.push({a:a+Math.asin(Math.min(.9,off*R/d)),v:Math.min(1100,needV(d,260)),kind:'safe'})}
      /* one-cushion kicks: mirror the target in each rail */
      for(const [mx,my] of [[2*R-t.x,t.y],[2*(PW-R)-t.x,t.y],[t.x,2*R-t.y],[t.x,2*(PH-R)-t.y]]){const d=Math.hypot(mx-cue.x,my-cue.y);cands.push({a:Math.atan2(my-cue.y,mx-cue.x),v:Math.min(VMAX,needV(d,300)),kind:'kick'})}
    }
    const n=hard?cands.length:Math.min(cands.length,6);
    for(let i=0;i<n;i++){const c=cands[i],r=runShot(B,c.a,c.v,false);if(legalResult(r.sh,g,cleared)&&(r.sh.rails>0||r.sh.pots.length))return{...c,a:c.a+gauss(rng)*(hard?.002:.01)}}
    for(let i=0;i<n;i++){const c=cands[i],r=runShot(B,c.a,c.v,false);if(legalResult(r.sh,g,cleared))return c}
    if(cands.length)return cands[0];
    return{a:rng()*Math.PI*2,v:600,kind:'blind'};
  }
  /* where to put the cue ball with ball in hand */
  function place(B,g,level,isBreak,rng=Math.random){
    const cleared=isCleared(B,g),cue=B[0];let best=null,bs=-1;const N=level>=2?70:14;
    for(let i=0;i<N;i++){
      const x=R+rng()*(PW-2*R),y=isBreak?HEAD.y+rng()*(PH-R-HEAD.y):R+rng()*(PH-2*R);
      if(!okSpot(B,x,y,cue))continue;const ox=cue.x,oy=cue.y;cue.x=x;cue.y=y;const s=shots(B,g,cleared)[0];cue.x=ox;cue.y=oy;
      const sc=s?s.score:0;if(sc>bs||!best){bs=sc;best={x,y}}
    }
    return best||freeSpot(B,HEAD.x,HEAD.y,cue);
  }
  function rules(G,me,onBefore,sh){
    const op=1-me,g=G.slice(),objs=sh.pots.filter(n=>n>0&&n!==8),p8=sh.pots.includes(8);
    const cleared=!!g[me]&&!onBefore.some(n=>n>0&&n!==8&&typ(n)===g[me]);
    let foul=null;
    if(sh.first==null)foul='No ball hit';
    else if(!sh.isBreak){if(g[me]){if(cleared?sh.first!==8:(sh.first===8||typ(sh.first)!==g[me]))foul=cleared?'Hit the 8 first':'Wrong ball first'}else if(sh.first===8)foul='Hit the 8 first'}
    if(sh.scratch)foul='Scratch';
    const r={foul,g,cont:false,win:null,why:'',respot8:false,assigned:false};
    if(p8){
      if(sh.isBreak)r.respot8=true;
      else{r.win=cleared&&!foul?me:op;r.why=r.win===me?'8 ball down':foul?'8 ball with a foul':'8 ball too early';return r}
    }
    if(!g[me]&&!foul&&objs.length){g[me]=typ(objs[0]);g[op]=g[me]==='S'?'T':'S';r.assigned=true}
    r.cont=!foul&&objs.some(n=>!g[me]||typ(n)===g[me]);
    return r;
  }
  return{R,PW,PH,VMAX,HSTEP,SEGS,POCK,HEAD,FOOT,CM,SM,typ,rack,step,moving,energy,clone,shotRec,recorder,strike,runShot,cast,clear,needV,okSpot,freeSpot,targetsFor,isCleared,shots,plan,place,rules};
})();

function pool(root,S){
  const P=POOL,{R,PW,PH}=P,MODE=S.level,TWO=MODE===3;
  const st=status(root,'Drag on the table to aim, then pull the power bar down and let go to shoot. Pot your group, then the 8.');
  const W=360,H=650,OX=27,OY=80,RW=20,BX=325,BW=29;
  const {c,x}=canvas(root,W,H);c.classList.add('pool-cv');const K=pal();const fx=sparks();
  const NAMES=TWO?['Player 1','Player 2']:['You','Computer'];
  const T={auto:false,speed:1};
  let B,G=[null,null],turn=0,phase='aim',inHand=true,isBreak=true,aim=-Math.PI/2,power=0,drag=null,sh=null,onBefore=[],sink=[],ai=null,winner=null,overWhy='',t=0,lastClick=0,kbPow=.6,kbUsed=false,msg='',msgT=0;
  const isAI=p=>T.auto||(!TWO&&p===1);
  const gname=g=>g==='S'?'Solids':g==='T'?'Stripes':'Open';
  function flash(s){msg=s;msgT=1.8}
  function reset(){B=P.rack();G=[null,null];turn=0;phase='aim';inHand=true;isBreak=true;aim=-Math.PI/2;power=0;winner=null;sink=[];startTurn()}
  function startTurn(){
    phase='aim';power=0;
    const who=NAMES[turn];
    if(isAI(turn)){phase='ai';st(TWO?`${who} is aiming…`:'Computer is thinking…');S.after(500/T.speed,aiThink);return}
    const tail=inHand?(isBreak?' Drag the cue ball to place it, then break.':' Ball in hand: drag the cue ball anywhere.'):'';
    st(isBreak?`${TWO?who+' breaks.':'Your break.'}${tail}`:`${TWO?who+"'s turn":'Your turn'} (${gname(G[turn])}).${tail}`);
  }
  function aiThink(){
    if(phase!=='ai')return;const lvl=TWO?2:MODE;
    if(inHand){const p=P.place(B,G[turn],lvl,isBreak);B[0].x=p.x;B[0].y=p.y;inHand=false}
    const p=P.plan(B,G[turn],lvl,isBreak);
    let a1=p.a;while(a1-aim>Math.PI)a1-=2*Math.PI;while(a1-aim<-Math.PI)a1+=2*Math.PI;
    ai={a0:aim,a1,v:p.v,t:0};
  }
  function shoot(v){
    if(!(v>0))return;inHand=false;phase='roll';onBefore=B.filter(b=>b.on&&b.n).map(b=>b.n);sh=P.shotRec(isBreak);
    ev=P.recorder(sh,{hit:(a,b,rel)=>{if(rel>40&&t-lastClick>.03){lastClick=t;beep(900+Math.min(600,rel/2),25,'sine')}},rail:(b,v)=>{if(v>80)beep(160,30,'sine')},
      pot:(b,k)=>{const p=P.POCK[k];sink.push({n:b.n,x:b.x,y:b.y,px:p[0],py:p[1],t:0});beep(b.n===8?220:b.n?520:180,140);fx.add(OX+p[0],OY+p[1],b.n?POOL_C[b.n>8?b.n-8:b.n]:'#fff',14,150)}});
    P.strike(B,aim,v);power=0;beep(300+v/8,60,'square');
  }
  let ev=null;
  function endShot(){
    const r=P.rules(G,turn,onBefore,sh);G=r.g;
    const me=turn;
    if(sh.scratch){B[0].on=true;const p=P.freeSpot(B,P.HEAD.x,P.HEAD.y,B[0]);B[0].x=p.x;B[0].y=p.y;B[0].vx=B[0].vy=0}
    if(r.respot8){const p=P.freeSpot(B,P.FOOT.x,P.FOOT.y,B[8]);Object.assign(B[8],{on:true,x:p.x,y:p.y,vx:0,vy:0});flash('8 ball respotted')}
    isBreak=false;
    if(r.win!=null){gameOver(r.win,r.why);return}
    if(r.assigned){const g=G[me];flash(TWO||!isAI(me)?`${TWO?NAMES[me]+': ':'You are '}${gname(g)}`:`Computer is ${gname(g)}`);beep(780,120)}
    if(r.cont){if(!r.assigned)flash(isAI(me)&&!TWO?'Computer goes again':'Shoot again!');inHand=false}
    else{
      turn=1-turn;inHand=!!r.foul;
      if(r.foul){S.fx.toast('Foul: '+r.foul,`${NAMES[turn]} ${TWO||isAI(turn)?'gets':'get'} ball in hand`);beep(140,200,'sawtooth')}
    }
    startTurn();
  }
  function gameOver(w,why){
    phase='over';winner=w;overWhy=why;msgT=0;
    if(TWO){st(`${NAMES[w]} wins! ${why}. Tap the table for a rematch.`);S.fx.confetti();S.fx.banner(`${NAMES[w]} wins!`,why)}
    else if(w===0){st(`You win! ${why}. Tap the table to play again.`);S.next()}
    else{st(`Computer wins: ${why}. Tap the table to try again.`);S.shake();S.fx.banner('Computer wins',why);beep(150,400,'sawtooth')}
  }
  /* ---- input ---- */
  const tp=p=>({x:p.x-OX,y:p.y-OY});
  function setAim(p){const q=tp(p),dx=q.x-B[0].x,dy=q.y-B[0].y;if(dx*dx+dy*dy>64)aim=Math.atan2(dy,dx)}
  function human(){return phase==='aim'&&!isAI(turn)}
  function moveCue(p){
    const q=tp(p),minY=isBreak?P.HEAD.y:R;
    const nx=clamp(q.x,R,PW-R),ny=clamp(q.y,minY,PH-R);
    if(P.okSpot(B,nx,ny,B[0])){B[0].x=nx;B[0].y=ny}
  }
  S.on(c,'pointerdown',e=>{
    const p=c.pos(e);
    if(phase==='over'){if(t-overAt>.8)S.restart();return}
    if(!human())return;try{c.setPointerCapture(e.pointerId)}catch(_){}
    kbUsed=false;if(p.x>=BX-8){drag={k:'pow',y0:p.y};power=0;return}
    const q=tp(p);
    if(inHand&&Math.hypot(q.x-B[0].x,q.y-B[0].y)<R*3.2){drag={k:'cue'};return}
    drag={k:'aim'};setAim(p);
  });
  S.on(c,'pointermove',e=>{
    if(!drag||!human())return;const p=c.pos(e);
    if(drag.k==='pow')power=clamp((p.y-drag.y0)/(PH*.8),0,1);
    else if(drag.k==='cue')moveCue(p);
    else setAim(p);
  });
  const up=()=>{if(!drag)return;const k=drag.k;drag=null;if(k==='pow'&&human()){if(power>.03)shoot(P.VMAX*Math.pow(power,1.2));else power=0}};
  S.on(c,'pointerup',up);S.on(c,'pointercancel',()=>{drag=null;power=0});
  S.on(window,'keydown',e=>{
    if(phase==='over'&&(e.key===' '||e.key==='Enter')){e.preventDefault();S.restart();return}
    if(!human())return;const f=e.shiftKey?.05:.006;if(/^(Arrow|[adws ]$|Enter)/.test(e.key))kbUsed=true;
    if(e.key==='ArrowLeft'||e.key==='a'){e.preventDefault();aim-=f}
    else if(e.key==='ArrowRight'||e.key==='d'){e.preventDefault();aim+=f}
    else if(e.key==='ArrowUp'||e.key==='w'){e.preventDefault();kbPow=clamp(kbPow+.05,.05,1)}
    else if(e.key==='ArrowDown'||e.key==='s'){e.preventDefault();kbPow=clamp(kbPow-.05,.05,1)}
    else if(e.key===' '||e.key==='Enter'){e.preventDefault();shoot(P.VMAX*Math.pow(kbPow,1.2))}
  });
  let overAt=0;
  /* test handle */
  c._pool={T,kick:()=>{if(phase==="aim")startTurn()},get:()=>({B,G,turn,phase,inHand,isBreak,winner,overWhy}),P};
  reset();
  /* ---- drawing ---- */
  function ballGfx(cx,cy,n,r,b,alpha=1){
    x.save();x.globalAlpha=alpha;x.translate(cx,cy);
    if(alpha===1){x.fillStyle='rgba(0,0,0,.32)';x.beginPath();x.ellipse(r*.22,r*.32,r,r*.92,0,0,7);x.fill()}
    x.save();x.beginPath();x.arc(0,0,r,0,7);x.clip();
    const col=POOL_C[n>8?n-8:n],ang=b?b.ang:-Math.PI/2,ph=b?(Math.cos(b.ph)<0?b.ph+Math.PI:b.ph):0;
    x.fillStyle=n>8?POOL_C[0]:col;x.fillRect(-r,-r,2*r,2*r);
    if(n>8){x.save();x.rotate(ang+Math.PI/2+Math.sin(ph)*.25);x.fillStyle=col;x.fillRect(-r,-r*.56,2*r,r*1.12);x.restore()}
    if(n>0){const o=Math.sin(ph)*r*.6,cp=Math.cos(ph);if(cp>-.1){const sx=Math.cos(ang)*o,sy=Math.sin(ang)*o,sc=Math.max(.15,cp);
      x.save();x.translate(sx,sy);x.rotate(ang);x.fillStyle='#fbfaf4';x.beginPath();x.ellipse(0,0,r*.56*sc,r*.56,0,0,7);x.fill();
      if(cp>.45){x.rotate(-ang);x.fillStyle='#151515';x.font=`800 ${n>9?r*.78:r*.92}px system-ui,sans-serif`;x.textAlign='center';x.textBaseline='middle';x.fillText(n,0,r*.06)}x.restore()}}
    else{x.fillStyle='rgba(215,38,43,.55)';const o=Math.sin(ph)*r*.6;if(Math.cos(ph)>0){x.beginPath();x.arc(Math.cos(ang)*o,Math.sin(ang)*o,r*.13,0,7);x.fill()}}
    const sh=x.createRadialGradient(0,0,r*.5,0,0,r);sh.addColorStop(0,'rgba(0,0,0,0)');sh.addColorStop(1,'rgba(0,0,0,.38)');x.fillStyle=sh;x.fillRect(-r,-r,2*r,2*r);
    const hl=x.createRadialGradient(-r*.38,-r*.42,0,-r*.38,-r*.42,r*.7);hl.addColorStop(0,'rgba(255,255,255,.95)');hl.addColorStop(.25,'rgba(255,255,255,.35)');hl.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=hl;x.fillRect(-r,-r,2*r,2*r);
    x.restore();x.restore();
  }
  let TBL=null;
  function tableLayer(){
    const r=Math.min((window.devicePixelRatio||1)*1.6,3.2),cv=document.createElement('canvas');cv.width=Math.round(W*r);cv.height=Math.round(H*r);const g=cv.getContext('2d');g.scale(r,r);
    const L=OX-RW,Tp=OY-RW,Wd=PW+2*RW,Ht=PH+2*RW;
    g.fillStyle='rgba(0,0,0,.25)';rr(g,L+3,Tp+5,Wd,Ht,18);g.fill();
    const wood=g.createLinearGradient(L,0,L+Wd,0);wood.addColorStop(0,'#5b3217');wood.addColorStop(.5,'#8a5326');wood.addColorStop(1,'#5b3217');
    g.fillStyle=wood;rr(g,L,Tp,Wd,Ht,16);g.fill();g.lineWidth=3;g.strokeStyle=K.edge;g.stroke();
    g.strokeStyle='rgba(255,220,170,.25)';g.lineWidth=1.5;rr(g,L+4,Tp+4,Wd-8,Ht-8,13);g.stroke();
    /* grain */
    g.save();rr(g,L,Tp,Wd,Ht,16);g.clip();g.strokeStyle='rgba(40,18,5,.18)';g.lineWidth=1;for(let i=0;i<26;i++){const yy=Tp+i*Ht/26+((i*37)%11);g.beginPath();g.moveTo(L,yy);g.bezierCurveTo(L+Wd*.3,yy+6,L+Wd*.7,yy-6,L+Wd,yy+2);g.stroke()}g.restore();
    /* felt */
    const CD=7;
    const felt=g.createRadialGradient(OX+PW/2,OY+PH/2,40,OX+PW/2,OY+PH/2,PH*.62);felt.addColorStop(0,'#21a06a');felt.addColorStop(1,'#11704a');
    g.fillStyle=felt;g.fillRect(OX-CD,OY-CD,PW+2*CD,PH+2*CD);
    /* felt texture */
    g.globalAlpha=.06;for(let i=0;i<900;i++){g.fillStyle=i%2?'#fff':'#000';g.fillRect(OX+((i*97)%PW),OY+((i*211)%PH),1,1)}g.globalAlpha=1;
    /* pockets */
    for(const [px,py] of P.POCK){const side=Math.abs(py-PH/2)<1,pr=side?1.75*R:1.95*R;
      g.fillStyle='#3a2410';g.beginPath();g.arc(OX+px,OY+py,pr+4,0,7);g.fill();
      const pg=g.createRadialGradient(OX+px,OY+py,1,OX+px,OY+py,pr);pg.addColorStop(0,'#000');pg.addColorStop(1,'#1a1a1a');g.fillStyle=pg;g.beginPath();g.arc(OX+px,OY+py,pr,0,7);g.fill()}
    /* cushions with angled jaws */
    const cush=(pts)=>{g.beginPath();pts.forEach(([a,b],i)=>i?g.lineTo(OX+a,OY+b):g.moveTo(OX+a,OY+b));g.closePath();g.fillStyle='#0f6a43';g.fill();g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=1;g.stroke()};
    const cm=P.CM,sm=P.SM,j=CD*.9;
    cush([[cm,0],[PW-cm,0],[PW-cm+j*.7,-CD],[cm-j*.7,-CD]]);
    cush([[cm,PH],[PW-cm,PH],[PW-cm+j*.7,PH+CD],[cm-j*.7,PH+CD]]);
    cush([[0,cm],[0,PH/2-sm],[-CD,PH/2-sm+j*.4],[-CD,cm-j*.7]]);
    cush([[0,PH/2+sm],[0,PH-cm],[-CD,PH-cm+j*.7],[-CD,PH/2+sm-j*.4]]);
    cush([[PW,cm],[PW,PH/2-sm],[PW+CD,PH/2-sm+j*.4],[PW+CD,cm-j*.7]]);
    cush([[PW,PH/2+sm],[PW,PH-cm],[PW+CD,PH-cm+j*.7],[PW+CD,PH/2+sm-j*.4]]);
    g.strokeStyle='rgba(255,255,255,.12)';g.lineWidth=1;g.strokeRect(OX+.5,OY+.5,PW-1,PH-1);
    /* diamonds */
    g.fillStyle='#f3ead2';const dm=(a,b)=>{g.save();g.translate(a,b);g.rotate(Math.PI/4);g.fillRect(-2,-2,4,4);g.restore()};
    for(const k of [1,2,3,5,6,7]){const yy=OY+PH*k/8;dm(OX-CD-(RW-CD)/2,yy);dm(OX+PW+CD+(RW-CD)/2,yy)}
    for(const k of [1,2,3]){const xx=OX+PW*k/4;dm(xx,OY-CD-(RW-CD)/2);dm(xx,OY+PH+CD+(RW-CD)/2)}
    /* head string and spots */
    g.strokeStyle='rgba(255,255,255,.16)';g.setLineDash([4,5]);g.beginPath();g.moveTo(OX,OY+P.HEAD.y);g.lineTo(OX+PW,OY+P.HEAD.y);g.stroke();g.setLineDash([]);
    g.fillStyle='rgba(255,255,255,.35)';for(const s of [P.HEAD,P.FOOT]){g.beginPath();g.arc(OX+s.x,OY+s.y,1.6,0,7);g.fill()}
    return cv;
  }
  function hud(){
    for(let p=0;p<2;p++){
      const px=6+p*176,pw=172,act=turn===p&&phase!=='over',win=phase==='over'&&winner===p;
      x.fillStyle=act||win?K.c2:K.board;rr(x,px,4,pw,52,12);x.fill();x.lineWidth=2.5;x.strokeStyle=K.edge;x.stroke();
      const ink=act||win?'#1E1F5C':K.ink;
      x.fillStyle=ink;x.font=`13px ${DISPLAY}`;x.textAlign='left';x.textBaseline='middle';x.fillText((act?'▶ ':'')+NAMES[p],px+9,19);
      x.font='800 11px system-ui,sans-serif';x.textAlign='right';x.globalAlpha=.8;x.fillText(gname(G[p]),px+pw-9,19);x.globalAlpha=1;
      const g=G[p];
      if(!g){x.fillStyle=ink;x.globalAlpha=.55;x.font='700 11px system-ui,sans-serif';x.textAlign='left';x.fillText(isBreak?'Break to start':'Pot any ball to choose',px+9,41);x.globalAlpha=1}
      else{const ns=g==='S'?[1,2,3,4,5,6,7]:[9,10,11,12,13,14,15];const done=P.isCleared(B,g);
        ns.forEach((n,i)=>{const on=B[n].on;ballGfx(px+16+i*19.5,41,n,7.2,{ang:-Math.PI/2,ph:0},on?1:.18)});
        if(done)ballGfx(px+pw-14,41,8,7.2,{ang:-Math.PI/2,ph:0},1)}
    }
  }
  function powerBar(pw){
    const y0=OY,h=PH;x.fillStyle=K.line;rr(x,BX,y0,BW,h,12);x.fill();x.lineWidth=2.5;x.strokeStyle=K.edge;x.stroke();
    if(pw>0){const gr=x.createLinearGradient(0,y0,0,y0+h);gr.addColorStop(0,K.c3);gr.addColorStop(.5,K.c2);gr.addColorStop(1,K.c1);x.save();rr(x,BX+3,y0+3,BW-6,h-6,9);x.clip();x.fillStyle=gr;x.fillRect(BX,y0,BW,h*pw);x.restore()}
    /* cue butt handle */
    const hy=y0+12+pw*(h-60);x.fillStyle='#2b1a0c';rr(x,BX+6,hy,BW-12,40,6);x.fill();x.fillStyle='#d9b27a';x.fillRect(BX+6,hy+28,BW-12,4);x.strokeStyle=K.edge;x.lineWidth=1.5;rr(x,BX+6,hy,BW-12,40,6);x.stroke();
    x.save();x.translate(BX+BW/2,y0+h-34);x.rotate(-Math.PI/2);x.fillStyle=K.muted;x.font=`11px ${DISPLAY}`;x.textAlign='center';x.textBaseline='middle';x.fillText(pw>0?Math.round(pw*100)+'%':'◂ PULL',0,0);x.restore();
  }
  function cueStick(cx,cy,a,pull){
    const dx=Math.cos(a),dy=Math.sin(a),g0=R+4+pull*46,L=250;
    const sx=cx-dx*g0,sy=cy-dy*g0,ex=cx-dx*(g0+L),ey=cy-dy*(g0+L);
    x.save();x.lineCap='round';
    x.strokeStyle='rgba(0,0,0,.25)';x.lineWidth=6;x.beginPath();x.moveTo(sx+4,sy+6);x.lineTo(ex+4,ey+6);x.stroke();
    const gr=x.createLinearGradient(sx,sy,ex,ey);gr.addColorStop(0,'#f4f0e6');gr.addColorStop(.03,'#f4f0e6');gr.addColorStop(.035,'#e8c48c');gr.addColorStop(.6,'#c48a4a');gr.addColorStop(.62,'#222');gr.addColorStop(.7,'#7a1f1f');gr.addColorStop(1,'#2a160a');
    x.strokeStyle=gr;x.lineWidth=4.5;x.beginPath();x.moveTo(sx,sy);x.lineTo(ex,ey);x.stroke();
    x.strokeStyle='#3d6fd8';x.lineWidth=4.5;x.beginPath();x.moveTo(sx,sy);x.lineTo(sx-dx*2,sy-dy*2);x.stroke();
    x.restore();
  }
  function aimGuide(a){
    const cue=B[0],dx=Math.cos(a),dy=Math.sin(a),r=P.cast(B,cue,dx,dy),gx=cue.x+dx*r.t,gy=cue.y+dy*r.t;
    x.save();x.translate(OX,OY);x.strokeStyle='rgba(255,255,255,.75)';x.lineWidth=1.5;x.setLineDash([5,4]);x.beginPath();x.moveTo(cue.x+dx*R,cue.y+dy*R);x.lineTo(gx,gy);x.stroke();x.setLineDash([]);
    x.beginPath();x.arc(gx,gy,R,0,7);x.strokeStyle='rgba(255,255,255,.85)';x.stroke();
    if(r.hit){
      const nx=r.hit.x-gx,ny=r.hit.y-gy,nl=Math.hypot(nx,ny)||1,ux=nx/nl,uy=ny/nl;
      const g=G[turn],cl=P.isCleared(B,g),n=r.hit.n,ok=g?(cl?n===8:n!==8&&P.typ(n)===g):n!==8||isBreak;
      if(ok){x.strokeStyle='rgba(255,255,255,.95)';x.lineWidth=2;x.beginPath();x.moveTo(r.hit.x+ux*R,r.hit.y+uy*R);x.lineTo(r.hit.x+ux*(R+55),r.hit.y+uy*(R+55));x.stroke()}
      else{
        // aiming at a ball you may not hit first: red ring on the target and a "not allowed" sign
        x.strokeStyle='#E5263B';x.lineWidth=2.5;x.beginPath();x.arc(r.hit.x,r.hit.y,R+3,0,7);x.stroke();
        const ir=R+5,iy=gy;x.fillStyle='rgba(255,255,255,.92)';x.beginPath();x.arc(gx,iy,ir,0,7);x.fill();
        x.lineWidth=3;x.beginPath();x.arc(gx,iy,ir-1.5,0,7);x.stroke();
        const d=(ir-1.5)*Math.SQRT1_2;x.beginPath();x.moveTo(gx-d,iy-d);x.lineTo(gx+d,iy+d);x.stroke();
      }
      const cs=dx*ux+dy*uy;let tx=dx-cs*ux,ty=dy-cs*uy;const tl=Math.hypot(tx,ty);
      if(ok&&tl>.05){tx/=tl;ty/=tl;x.strokeStyle='rgba(255,255,255,.4)';x.lineWidth=1.5;x.setLineDash([2,3]);x.beginPath();x.moveTo(gx,gy);x.lineTo(gx+tx*30*tl,gy+ty*30*tl);x.stroke();x.setLineDash([])}
    }
    x.restore();
  }
  let simAcc=0;
  S.loop(dt=>{
    t+=dt;
    /* AI aiming animation */
    if(phase==='ai'&&ai){
      ai.t+=dt*T.speed;const k=Math.min(1,ai.t/.8),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;aim=ai.a0+(ai.a1-ai.a0)*e;
      const pp=Math.pow(ai.v/P.VMAX,1/1.2);if(ai.t>.9)power=Math.min(pp,(ai.t-.9)/.45*pp);
      if(ai.t>1.5){aim=ai.a1;const v=ai.v;ai=null;phase='aim';shoot(v)}
    }
    if(phase==='roll'){
      simAcc+=dt*T.speed;let n=0;
      while(simAcc>=P.HSTEP&&n<20000){P.step(B,P.HSTEP,ev);simAcc-=P.HSTEP;n++}
      if(!P.moving(B)){simAcc=0;endShot()}
    }
    if(phase==='over'&&!overAt)overAt=t;
    /* draw */
    x.fillStyle=K.board;x.fillRect(0,0,W,H);
    if(!TBL)TBL=tableLayer();x.drawImage(TBL,0,0,W,H);
    sink=sink.filter(s=>(s.t+=dt*3)<1);
    for(const s of sink){const k=s.t;ballGfx(OX+s.x+(s.px-s.x)*k,OY+s.y+(s.py-s.y)*k,s.n,R*(1-k*.45),null,1-k)}
    for(const b of B)if(b.on)ballGfx(OX+b.x,OY+b.y,b.n,R,b);
    const still=phase==='aim'||phase==='ai';
    if(still&&inHand&&!isAI(turn)){const pr=R+5+Math.sin(t*5)*2;x.strokeStyle=K.c2;x.lineWidth=2;x.setLineDash([4,3]);x.beginPath();x.arc(OX+B[0].x,OY+B[0].y,pr,0,7);x.stroke();x.setLineDash([])}
    if(still&&(!isAI(turn)||ai)){aimGuide(aim);cueStick(OX+B[0].x,OY+B[0].y,aim,phase==='aim'&&!isAI(turn)&&!drag?0:power)}
    fx.draw(x,dt);
    hud();
    powerBar(drag&&drag.k==='pow'?power:phase==='ai'?power:kbUsed&&human()?kbPow:0);
    if(msgT>0){msgT-=dt;x.save();x.globalAlpha=Math.min(1,msgT*3);x.font=`15px ${DISPLAY}`;x.textAlign='center';x.textBaseline='middle';const w=x.measureText(msg).width+24;x.fillStyle='rgba(0,0,0,.55)';rr(x,OX+PW/2-w/2,OY+PH/2-16,w,32,16);x.fill();x.fillStyle='#fff';x.fillText(msg,OX+PW/2,OY+PH/2+1);x.restore()}
    if(phase==='over'){
      x.fillStyle='rgba(0,0,0,.45)';x.fillRect(OX,OY,PW,PH);x.fillStyle='#fff';x.textAlign='center';x.textBaseline='middle';
      x.font=`26px ${DISPLAY}`;x.fillText(TWO?`${NAMES[winner]} wins!`:winner===0?'You win!':'Computer wins',OX+PW/2,OY+PH/2-24);
      x.font='800 15px system-ui,sans-serif';x.fillText(overWhy,OX+PW/2,OY+PH/2+6);x.fillText('Tap to play again',OX+PW/2,OY+PH/2+30);
    }
  });
}

/* Sliding Puzzle: slide numbered tiles into order */
const SLIDE_COL=['#FF5D73','#FF8A3D','#FFC53D','#2EC4B6','#5B6CFF','#B06CFF'];
/* random legal gap moves from the solved board, so the result is always solvable. b[cell]=tile (0 = gap) */
function slideShuffle(N,rnd){
  rnd=rnd||Math.random;
  for(;;){
    const b=[...Array(N*N)].map((_,i)=>(i+1)%(N*N));let gap=N*N-1,prev=-1;const path=[gap],steps=[0,200,400,700,1000][N-2]||N*N*30;
    for(let s=0;s<steps;s++){
      const r=gap/N|0,c=gap%N,nb=[];
      if(r>0)nb.push(gap-N);if(r<N-1)nb.push(gap+N);if(c>0)nb.push(gap-1);if(c<N-1)nb.push(gap+1);
      const opts=nb.filter(x=>x!==prev),t=opts[Math.floor(rnd()*opts.length)];
      b[gap]=b[t];b[t]=0;prev=gap;gap=t;path.push(gap);
    }
    const ok=b.filter((v,i)=>v&&v===i+1).length;
    if(ok<=Math.max(1,Math.floor(N*N/5)))return{b,path};
  }
}
function slidepuzzle(root,S){
  const N=S.level+2,NN=N*N,BK='slide'+N;
  const st=status(root,'Slide the tiles into order, 1 at the top left, with the gap at the bottom right.');
  const bar=el('div','row mbar sp-bar',root,`<span class="sp-mv">Moves 0</span><span class="sp-t">⏱️ 0:00</span><span class="sp-best"></span>`);
  const mvEl=$('.sp-mv',bar),tEl=$('.sp-t',bar),bEl=$('.sp-best',bar);
  const g=el('div','sp',root);g.dataset.ar=1;g.style.aspectRatio=1;g.dataset.max=600;g.style.setProperty('--n',N);
  const inner=el('div','sp-in',g);
  const ctl=el('div','row sp-ctl',root);const shufB=el('button','btn ghost',ctl,'🔀 Shuffle');
  const sh=slideShuffle(N);const b=sh.b;g._seq=sh.path;
  const tiles=[];let moves=0,t0=0,over=false,secs=-1;
  for(let v=1;v<NN;v++){
    const t=el('button','sp-tile',inner,`<span class="sp-face"><b>${v}</b></span>`);
    t.style.setProperty('--c',SLIDE_COL[Math.floor((v-1)/N)%6]);t.style.animationDelay=Math.min(v*18,500)+'ms';
    S.on(t,'click',()=>tap(b.indexOf(v)));tiles[v]=t;
  }
  const fmt=s=>`${s/60|0}:${String(s%60).padStart(2,'0')}`;
  function showBest(){const m=store.get('best:'+BK),t=store.get('best:'+BK+'t');bEl.textContent=m?`🏆 ${fmt(t)} · ${m}`:'';bEl.hidden=!m}
  function draw(){
    b.forEach((v,i)=>{if(!v)return;const t=tiles[v];t.style.transform=`translate(${i%N*100}%,${(i/N|0)*100}%)`;t.classList.toggle('ok',v===i+1);
      t.setAttribute('aria-label',`Tile ${v}, row ${(i/N|0)+1}, column ${i%N+1}`)});
  }
  function tap(i){
    if(over)return;const gap=b.indexOf(0),r=i/N|0,c=i%N,gr=gap/N|0,gc=gap%N;
    if(i===gap)return;
    if(r!==gr&&c!==gc){restartAnim(tiles[b[i]],'nope');beep(170,90,'square');return}
    const step=r===gr?(c<gc?-1:1):(r<gr?-N:N);let k=gap,n=0;
    while(k!==i){b[k]=b[k+step];k+=step;n++}b[i]=0;
    if(!t0)t0=performance.now();moves+=n;mvEl.textContent='Moves '+moves;restartAnim(mvEl,'bump');
    beep(420+rand(60),40);draw();
    if(b.every((v,j)=>v===(j+1)%NN))win();
  }
  function win(){
    over=true;const s=Math.max(1,Math.round((performance.now()-t0)/1000));tEl.textContent='⏱️ '+fmt(s);
    const rt=best(BK+'t',s,true),rm=best(BK,moves,true);showBest();
    st(`Solved in ${moves} moves and ${fmt(s)}!`+(rt||rm?` New best ${rt&&rm?'time and moves':rt?'time':'moves'}.`:''));
    g.classList.add('done');
    for(let v=1;v<NN;v++){tiles[v].style.animationDelay=((v-1)%N+((v-1)/N|0))*45+'ms';restartAnim(tiles[v],'win')}
    S.after(500,S.next);
  }
  /* direction = the way the tile moves into the gap */
  function dir(d){
    const gap=b.indexOf(0),gr=gap/N|0,gc=gap%N;
    const src=d==='left'?(gc<N-1?gap+1:-1):d==='right'?(gc>0?gap-1:-1):d==='up'?(gr<N-1?gap+N:-1):(gr>0?gap-N:-1);
    if(src>=0)tap(src);else beep(170,60,'square');
  }
  S.on(window,'keydown',e=>{const d=KEYDIR[e.key];if(d&&e.key.startsWith('Arrow')){e.preventDefault();dir(d)}});
  onSwipe(S,g,dir);
  S.on(shufB,'click',()=>S.restart());
  S.every(250,()=>{if(over||!t0)return;const s=Math.floor((performance.now()-t0)/1000);if(s!==secs){secs=s;tEl.textContent='⏱️ '+fmt(s)}});
  showBest();draw();
}

/* Water Sort: pour colors between tubes until each tube holds one color */
const WATER_LV=[4,6,8,10],WATER_CAP=4,WATER_EMPTY=2;
const WATER_COL=['#FF5D73','#FFC53D','#2EC4B6','#5B6CFF','#B06CFF','#FF8A3D','#7BD957','#FF8AD8','#5CC8FF','#A0703F'];
const WATER_NAME=['red','yellow','teal','blue','purple','orange','green','pink','sky blue','brown'];
function waterRng(s){return()=>{s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
/* depth-first search with state hashing; returns a list of [from,to] pours or null if not found within the node cap */
function waterSolve(start,cap,limit){
  limit=limit||60000;let nodes=0;
  const key=t=>t.map(x=>x.join('')).sort().join('|');
  const seen=new Set([key(start)]),path=[];
  const solved=t=>t.every(x=>!x.length||(x.length===cap&&x.every(c=>c===x[0])));
  function moves(t){
    const out=[];
    for(let i=0;i<t.length;i++){
      const a=t[i];if(!a.length)continue;const top=a[a.length-1];let run=1;while(run<a.length&&a[a.length-1-run]===top)run++;
      const uni=run===a.length;if(uni&&a.length===cap)continue;let emptyDone=false;
      for(let j=0;j<t.length;j++){
        if(j===i)continue;const b=t[j];if(b.length===cap)continue;
        if(!b.length){if(uni||emptyDone)continue;emptyDone=true;out.push([i,j,run,0]);continue}
        if(b[b.length-1]!==top)continue;const amt=Math.min(run,cap-b.length);
        const bu=b.every(c=>c===top);out.push([i,j,amt,(amt===run?2:0)+(bu?3:0)+(bu&&b.length+amt===cap?4:0)+1]);
      }
    }
    return out.sort((p,q)=>q[3]-p[3]);
  }
  function dfs(t){
    if(solved(t))return true;if(++nodes>limit)return false;
    for(const [i,j,amt] of moves(t)){
      const n=t.map(x=>x.slice());for(let k=0;k<amt;k++)n[j].push(n[i].pop());
      const k=key(n);if(seen.has(k))continue;seen.add(k);path.push([i,j]);
      if(dfs(n))return true;path.pop();if(nodes>limit)return false;
    }
    return false;
  }
  return dfs(start)?path:null;
}
/* random shuffle of full tubes plus empties, kept only when the solver finds a solution */
function waterGen(n,rnd,cap,empty){
  cap=cap||WATER_CAP;empty=empty==null?WATER_EMPTY:empty;
  for(let tries=0;;tries++){
    const a=[];for(let c=0;c<n;c++)for(let k=0;k<cap;k++)a.push(c);
    for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
    const t=[];for(let c=0;c<n;c++)t.push(a.slice(c*cap,c*cap+cap));for(let e=0;e<empty;e++)t.push([]);
    if(t.some(x=>x.length&&x.every(c=>c===x[0])))continue;
    let pairs=0;for(const x of t)for(let k=1;k<x.length;k++)if(x[k]===x[k-1])pairs++;
    if(pairs>n*.6&&tries<40)continue;
    const sol=waterSolve(t,cap);if(sol)return{tubes:t,sol,tries};
  }
}
function watersort(root,S){
  const L=S.level,NC=WATER_LV[L-1],CAP=WATER_CAP,key='water:num:'+L,num=store.get(key)||1;
  const st=status(root,'Pour the colors between tubes until every tube holds just one color.');
  const bar=el('div','row mbar ws-bar',root,`<span class="ws-num">Puzzle #${num}</span><span class="ws-mv">Moves 0</span>`);
  const mvEl=$('.ws-mv',bar);
  const g=el('div','ws',root);g.dataset.max=620;
  const stream=el('i','ws-stream',g);
  const ctl=el('div','row ws-ctl',root);
  const undoB=el('button','btn ghost',ctl,'↶ Undo'),addB=el('button','btn ghost',ctl,'+ Tube'),nextB=el('button','btn',ctl,'Next puzzle ▶');nextB.hidden=true;
  const gen=waterGen(NC,waterRng(L*100003+num*7919));
  let tubes=gen.tubes.map(x=>x.slice()),queue=[],hist=[],sel=-1,lock=false,over=false,moves=0,added=false,geo,els=[];
  g._start=gen.tubes.map(x=>x.slice());
  const top=a=>a[a.length-1];
  const runOf=a=>{if(!a.length)return 0;let r=1;while(r<a.length&&a[a.length-1-r]===top(a))r++;return r};
  const full=a=>a.length===CAP&&a.every(c=>c===a[0]);
  const canPour=(i,j)=>i!==j&&tubes[i].length&&!full(tubes[i])&&tubes[j].length<CAP&&(!tubes[j].length||top(tubes[j])===top(tubes[i]));
  function layout(){
    const N=tubes.length,wide=innerWidth>innerHeight*1.1,rows=N<=(wide?8:5)?1:2,cols=Math.ceil(N/rows),pitch=100/cols;
    const tw=Math.min(pitch*.6,14),lh=tw*.86,th=lh*CAP+tw*.75,padT=tw*1.55,gapY=tw*1.25,H=padT+rows*th+(rows-1)*gapY+tw*.35;
    geo={tw,lh,th,pitch,pos:[]};
    for(let i=0;i<N;i++){const r=rows===1?0:(i<cols?0:1),inRow=rows===1?N:(r?N-cols:cols),k=r?i-cols:i;
      geo.pos.push({x:(100-inRow*pitch)/2+(k+.5)*pitch-tw/2,y:padT+r*(th+gapY)})}
    g.dataset.ar=100/H;g.style.aspectRatio=100/H;g.style.setProperty('--u',tw/10+'cqw');
    while(els.length<N)els.push(mkTube(els.length));
    els.forEach((e,i)=>{e.style.left=geo.pos[i].x+'cqw';e.style.top=geo.pos[i].y+'cqw';e.style.width=tw+'cqw';e.style.height=th+'cqw'});
    if(typeof fit==='function')requestAnimationFrame(fit);
  }
  function mkTube(i){
    const e=el('button','ws-tube',g,'<span class="ws-cork"></span><span class="ws-glass"></span>');
    e.style.animationDelay=i*45+'ms';S.on(e,'click',ev=>{ev.stopPropagation();tap(i)});return e;/* keyboard activation; pointer taps are hit-tested on the board */
  }
  function draw(i,fresh=0,drain=0){
    const e=els[i],a=tubes[i],gl=e.lastChild;gl.innerHTML='';
    a.forEach((c,k)=>{const d=el('i','ws-liq',gl);d.dataset.c=c;d.style.background=WATER_COL[c];d.style.bottom=k*geo.lh+'cqw';d.style.height=geo.lh+(k===a.length-1?0:.3)+'cqw';
      if(k>=a.length-fresh)d.classList.add('ws-in')});
    for(let k=0;k<drain.n;k++){const d=el('i','ws-liq ws-out',gl);d.style.background=WATER_COL[drain.c];d.style.bottom=(a.length+k)*geo.lh+'cqw';d.style.height=geo.lh+'cqw'}
    e.classList.toggle('done',full(a));
    e.setAttribute('aria-label',`Tube ${i+1}: `+(a.length?a.map(c=>WATER_NAME[c]).reverse().join(', ')+' (top first)':'empty'));
  }
  const drawAll=()=>tubes.forEach((_,i)=>draw(i));
  function select(i){if(sel>=0)els[sel].classList.remove('up');sel=i;if(i>=0)els[i].classList.add('up')}
  function tap(i){
    if(lock){if(!over&&queue.length<4)queue.push(i);return}
    if(over||i>=tubes.length)return;
    if(sel<0){if(!tubes[i].length||full(tubes[i])){restartAnim(els[i],'nope');beep(200,80,'square');return}select(i);beep(520,40);return}
    if(sel===i){select(-1);beep(400,30);return}
    if(!canPour(sel,i)){
      if(tubes[i].length&&!full(tubes[i])){select(i);beep(520,40);return}
      restartAnim(els[i],'nope');beep(180,120,'sawtooth');return;
    }
    pour(sel,i);
  }
  function pour(i,j){
    const a=tubes[i],b=tubes[j],c=top(a),amt=Math.min(runOf(a),CAP-b.length);
    hist.push(tubes.map(x=>x.slice()));for(let k=0;k<amt;k++)b.push(a.pop());
    moves++;mvEl.textContent='Moves '+moves;restartAnim(mvEl,'bump');undoB.disabled=false;
    const e=els[i],p=geo.pos[i],q=geo.pos[j],tw=geo.tw,dir=q.x>p.x+.1?1:q.x<p.x-.1?-1:(q.x>50?-1:1);
    const dx=q.x+tw/2-dir*tw*.55-(p.x+tw/2),dy=q.y-tw*1.05-p.y;
    e.classList.remove('up');sel=-1;lock=true;e.classList.add('pour');
    e.style.transform=`translate(${dx}cqw,${dy}cqw) rotate(${dir*76}deg)`;
    S.after(REDUCED?0:210,()=>{
      draw(i,0,{n:amt,c});draw(j,amt);
      Object.assign(stream.style,{left:q.x+tw/2-tw*.09+'cqw',top:q.y-tw*.85+'cqw',width:tw*.18+'cqw',height:tw*.85+geo.th-tw*.45-(b.length-amt)*geo.lh+'cqw',background:WATER_COL[c]});
      restartAnim(stream,'on');
      for(let k=0;k<amt;k++)S.after(k*70,()=>beep(330+(b.length-amt+k)*90,70,'sine'));
    });
    S.after(REDUCED?0:500,()=>{
      stream.classList.remove('on');draw(i);e.style.transform='';lock=false;const qd=queue.splice(0);
      S.after(REDUCED?0:200,()=>{e.classList.remove('pour')});
      if(full(b)){sparkle(j);beep(880,90);S.after(90,()=>beep(1175,140))}
      check();qd.forEach(tap);
    });
  }
  function sparkle(j){
    if(REDUCED)return;const e=els[j];
    for(let k=0;k<7;k++){const s=el('i','ws-spark',e,'✦');s.style.setProperty('--a',(k/7*360+rand(30))+'deg');s.style.color=['var(--c2)','#fff','var(--c3)'][k%3];S.after(900,()=>s.remove())}
  }
  function anyMove(){for(let i=0;i<tubes.length;i++)for(let j=0;j<tubes.length;j++)if(canPour(i,j)&&!(runOf(tubes[i])===tubes[i].length&&!tubes[j].length))return true;return false}
  function check(){
    if(tubes.every(a=>!a.length||full(a))){
      over=true;undoB.disabled=addB.disabled=true;store.set(key,num+1);
      st(`Puzzle #${num} solved in ${moves} moves!`);nextB.hidden=false;
      els.forEach((e,k)=>{e.style.animationDelay=k*60+'ms';restartAnim(e,'win')});
      S.after(500,S.next);return;
    }
    if(!anyMove()){st(added?'No moves left. Tap Undo.':'No moves left. Tap Undo or + Tube.');restartAnim(undoB,'nope')}
    else st(`Moves ${moves}`);
  }
  S.on(undoB,'click',()=>{
    if(lock||over||!hist.length)return;const h=hist.pop();while(h.length<tubes.length)h.push([]);
    tubes=h;select(-1);drawAll();moves=hist.length;mvEl.textContent='Moves '+moves;beep(300,60);undoB.disabled=!hist.length;st('Moves '+moves);
  });
  S.on(addB,'click',()=>{
    if(lock||over||added)return;added=true;addB.disabled=true;tubes.push([]);layout();draw(tubes.length-1);beep(660,80);
    st('One extra tube added.');
  });
  S.on(nextB,'click',()=>S.restart());
  /* tap anywhere in a tube's column slot (bigger than the glass, and unaffected by a tube that is mid-pour) */
  S.on(g,'click',e=>{
    if(e.target.closest('.ws-tube'))return;
    const r=g.getBoundingClientRect(),w=g.clientWidth,x=(e.clientX-r.left-g.clientLeft)/w*100,y=(e.clientY-r.top-g.clientTop)/w*100;
    const i=geo.pos.findIndex(p=>x>=p.x+geo.tw/2-geo.pitch/2&&x<p.x+geo.tw/2+geo.pitch/2&&y>=p.y-geo.tw*1.3&&y<p.y+geo.th+geo.tw*.5);
    if(i>=0)tap(i);else if(!lock)select(-1);
  });
  S.on(window,'resize',()=>{if(!lock)layout()});
  S.on(window,'keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(/^[0-9]$/.test(e.key)){const i=(+e.key+9)%10;if(i<tubes.length)tap(i)}
    else if(e.key==='z'||e.key==='Z'||e.key==='Backspace'||e.key==='u'||e.key==='U'){e.preventDefault();undoB.click()}
    else if(e.key==='Escape')select(-1);
    else if(e.key==='Enter'&&over)nextB.click();
  });
  undoB.disabled=true;layout();drawAll();
}

/* Wood Blocks: 9x9 board, drag three pieces at a time, fill rows, columns or 3x3 boxes to clear them */
const WB_BASES=[ // [cells, weight]
  [[[0,0]],2],
  [[[0,0],[0,1]],3],
  [[[0,0],[0,1],[0,2]],3],
  [[[0,0],[0,1],[0,2],[0,3]],2],
  [[[0,0],[0,1],[0,2],[0,3],[0,4]],1.4],
  [[[0,0],[0,1],[1,0],[1,1]],3],
  [[[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]],1],
  [[[0,0],[1,0],[1,1]],3],
  [[[0,0],[1,0],[2,0],[2,1]],2.5],
  [[[0,0],[0,1],[0,2],[1,1]],2],
  [[[0,0],[0,1],[1,1],[1,2]],1.6],
  [[[0,0],[1,0],[2,0],[2,1],[2,2]],1.5]
];
const WB={
  norm(cells){
    const r0=Math.min(...cells.map(p=>p[0])),c0=Math.min(...cells.map(p=>p[1]));
    return cells.map(([r,c])=>[r-r0,c-c0]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  },
  orients(cells){
    const out=[],seen=new Set();let cur=cells;
    for(let m=0;m<2;m++){
      for(let k=0;k<4;k++){const n=WB.norm(cur),key=JSON.stringify(n);if(!seen.has(key)){seen.add(key);out.push(n)}cur=cur.map(([r,c])=>[c,-r])}
      cur=cells.map(([r,c])=>[r,-c]);
    }
    return out;
  },
  fits(b,sh,r,c){for(const[dr,dc]of sh){const R=r+dr,C=c+dc;if(R<0||C<0||R>8||C>8||b[R*9+C])return false}return true},
  anyFit(b,sh){for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(WB.fits(b,sh,r,c))return true;return false},
  full(b){
    const rows=[],cols=[],boxes=[],cells=new Set();
    for(let i=0;i<9;i++){
      let R=true,C=true,X=true;
      for(let j=0;j<9;j++){
        if(!b[i*9+j])R=false;if(!b[j*9+i])C=false;
        if(!b[((i/3|0)*3+(j/3|0))*9+(i%3)*3+j%3])X=false;
      }
      if(R){rows.push(i);for(let j=0;j<9;j++)cells.add(i*9+j)}
      if(C){cols.push(i);for(let j=0;j<9;j++)cells.add(j*9+i)}
      if(X){boxes.push(i);for(let j=0;j<9;j++)cells.add(((i/3|0)*3+(j/3|0))*9+(i%3)*3+j%3)}
    }
    return{rows,cols,boxes,cells};
  },
  /* place a shape (assumes it fits); returns the board before clearing, after clearing and what cleared */
  place(b,sh,r,c,v){
    const pre=b.slice(),at=[];for(const[dr,dc]of sh){const i=(r+dr)*9+c+dc;pre[i]=v;at.push(i)}
    const f=WB.full(pre),nb=pre.slice();for(const i of f.cells)nb[i]=0;
    return{pre,b:nb,at,cells:f.cells,lines:f.rows.length+f.cols.length+f.boxes.length};
  },
  /* points: one per cell placed, plus a clear bonus that grows with the square of clears at once and with the streak */
  points(n,lines,streak){return lines?n+Math.round(18*lines*lines*(1+.5*Math.max(0,streak-1))):n},
  over(b,pieces){return pieces.every(p=>!p||!WB.anyFit(b,p.cells))},
  pick(){
    const T=WB_BASES.reduce((s,x)=>s+x[1],0);let t=Math.random()*T,i=0;
    while(t>=WB_BASES[i][1]&&i<WB_BASES.length-1){t-=WB_BASES[i][1];i++}
    const o=WB.orients(WB_BASES[i][0]);return{cells:o[rand(o.length)],tone:1+rand(5)};
  },
  deal(b){
    let set;for(let k=0;k<40;k++){set=[WB.pick(),WB.pick(),WB.pick()];if(set.some(p=>WB.anyFit(b,p.cells)))break}
    return set;
  }
};
function woodblocks(root,S){
  const st=status(root,'Drag pieces onto the board. Fill a row, column or 3×3 box to clear it.');
  const bar=el('div','row mbar wbBar',root,'<span class="wbS">Score <b>0</b></span><span class="wbBest">Best <b>0</b></span>');
  const sEl=$('.wbS b',bar),bEl=$('.wbBest b',bar);
  const g=el('div','wb',root);g.dataset.ar=100/137;g.dataset.max=520;
  const frame=el('div','wbFrame',g),grid=el('div','wbGrid',frame);
  const cells=[...Array(81)].map((_,i)=>el('div','wbC',grid));
  const base=i=>'wbC'+(((i/27|0)+((i%9)/3|0))%2?' alt':'');
  const tray=el('div','wbTray',g),slots=[0,1,2].map(()=>el('div','wbSlot',tray));
  let b=Array(81).fill(0),pieces=[],score=0,streak=0,over=false,ghost=null,drag=null,kb=null,cid=0;
  const clearing=new Map(),dropped=new Set();
  const best0=store.get('best:woodblocks')||0;bEl.textContent=best0;
  function render(){
    cells.forEach((c,i)=>{
      const cl=clearing.get(i),t=b[i]||(cl&&cl.t);let k=base(i);
      if(t)k+=' wbW t'+t;if(cl&&!b[i])k+=' clr';if(dropped.has(i))k+=' drop';
      if(ghost){if(ghost.at.includes(i))k+=ghost.ok?' gh':' bad';else if(ghost.ok&&ghost.hl.has(i)&&b[i])k+=' hl'}
      if(c.className!==k)c.className=k;
      if(cl&&!b[i])c.style.animationDelay=cl.d+'ms';else if(c.style.animationDelay)c.style.animationDelay='';
    });
    dropped.clear();
  }
  function mini(p,cls,parent){
    const w=Math.max(...p.cells.map(x=>x[1]))+1,h=Math.max(...p.cells.map(x=>x[0]))+1;
    const e=el('div',cls,parent);e.style.gridTemplateColumns=`repeat(${w},1em)`;e.style.gridTemplateRows=`repeat(${h},1em)`;
    for(const[r,c]of p.cells){const q=el('i','wbW t'+p.tone,e);q.style.gridRow=r+1;q.style.gridColumn=c+1}
    return{e,w,h};
  }
  function renderTray(fresh){
    slots.forEach((s,k)=>{
      s.innerHTML='';s.classList.remove('lift','sel','no');const p=pieces[k];if(!p)return;
      const m=mini(p,'wbP'+(fresh?' in':''),s);if(fresh)m.e.style.animationDelay=k*70+'ms';
      s.setAttribute('aria-label','Piece '+(k+1));
      if(!WB.anyFit(b,p.cells))s.classList.add('no');
      if(drag&&drag.k===k)s.classList.add('lift');if(kb&&kb.k===k)s.classList.add('sel');
    });
  }
  function paintScore(){sEl.textContent=score;bEl.textContent=Math.max(best0,score);restartAnim(sEl.parentNode,'bump')}
  function deal(){pieces=WB.deal(b);renderTray(true);beep(620,50)}
  function ghostAt(p,r,c){
    if(r<0||c<0||!p.cells.every(([dr,dc])=>r+dr<9&&c+dc<9))return null;
    const ok=WB.fits(b,p.cells,r,c),at=p.cells.map(([dr,dc])=>(r+dr)*9+c+dc);
    return{ok,at,r,c,hl:ok?WB.place(b,p.cells,r,c,p.tone).cells:new Set()};
  }
  function pop(text,r,c,cls){
    const e=el('div','wbPop'+(cls?' '+cls:''),g);e.textContent=text;
    e.style.left=clamp((c+.5)/9*100,12,88)+'%';e.style.top=(r+.5)/9*(100/137)*100+'%';S.after(1000,()=>e.remove());
  }
  function place(k,r,c){
    const p=pieces[k],res=WB.place(b,p.cells,r,c,p.tone);
    for(const i of res.at){clearing.delete(i);dropped.add(i)}
    b=res.b;pieces[k]=null;
    if(res.lines){
      streak++;const id=++cid,cr=r+1,cc=c+1;
      for(const i of res.cells){const d=Math.round(Math.hypot((i/9|0)-cr,i%9-cc)*28);clearing.set(i,{t:res.pre[i],id,d})}
      S.after(900,()=>{for(const[i,v]of clearing)if(v.id===id)clearing.delete(i);render()});
      [523,659,784,1046].slice(0,1+Math.min(3,res.lines)).forEach((f,j)=>S.after(j*70,()=>beep(f,120)));
    }else{streak=0;beep(330,60,'square')}
    let gain=WB.points(res.at.length,res.lines,streak);
    const cy=r+Math.max(...p.cells.map(x=>x[0]))/2,cx=c+Math.max(...p.cells.map(x=>x[1]))/2;
    if(res.lines){
      pop('+'+gain,cy,cx);
      if(res.lines>1||streak>1)S.after(160,()=>pop(res.lines>1?`Combo ×${res.lines}!`:`Streak ×${streak}!`,cy+1.1,cx,'big'));
      if(b.every(v=>!v)){gain+=300;S.after(300,()=>{S.fx.banner('Board clear!','+300');S.fx.confetti(80)})}
      if(res.lines>=3)restartAnim(frame,'wow');
    }
    score+=gain;best('woodblocks',score);paintScore();
    if(res.lines&&!COMPACT.matches)st(res.lines>1?`${res.lines} clears at once! +${gain}`:streak>1?`Streak ×${streak}! +${gain}`:`Nice clear! +${gain}`);
    if(pieces.every(x=>!x))deal();else renderTray();
    render();check();
  }
  function check(){
    if(!WB.over(b,pieces))return;
    over=true;kb=null;renderTray();
    S.after(450,()=>{
      const nb=score>best0&&score>0;
      if(!COMPACT.matches)st(`No room left! Final score ${score}.`);beep(196,380,'sawtooth');S.shake();
      if(nb)S.fx.confetti();
      const o=el('div','wbOver',g,`<b>${nb?'New best!':'No room left'}</b><span>${score} points</span><button class="btn">Play again</button>`);
      S.on($('button',o),'click',()=>S.restart());
    });
  }
  /* dragging */
  function geo(){const a=cells[0].getBoundingClientRect(),c2=cells[1].getBoundingClientRect();return{x:a.left,y:a.top,cs:a.width,pitch:c2.left-a.left}}
  S.on(tray,'pointerdown',e=>{
    if(over||drag)return;const s=e.target.closest('.wbSlot');if(!s)return;const k=slots.indexOf(s);if(!pieces[k])return;
    e.preventDefault();try{tray.setPointerCapture(e.pointerId)}catch(_){}
    kb=null;const G=geo(),p=pieces[k];
    const f=document.createElement('div');f.className='wbFloat';document.body.append(f);
    f.style.setProperty('--cs',G.cs+'px');f.style.gap=(G.pitch-G.cs)+'px';f.style.fontSize=G.cs+'px';
    const m=mini(p,'wbFl',f);f.firstChild.style.gap='inherit';
    const w=m.w*G.pitch,h=m.h*G.pitch,touch=e.pointerType!=='mouse';
    drag={k,id:e.pointerId,f,G,w,h,lift:touch?h/2+G.pitch*1.5+14:0,r:null,c:null};
    renderTray();moveDrag(e);beep(480,30);
  });
  function moveDrag(e){
    const d=drag,x=e.clientX-d.w/2,y=e.clientY-d.h/2-d.lift;
    d.f.style.transform=`translate(${x}px,${y}px)`;
    const r=Math.round((y-d.G.y)/d.G.pitch),c=Math.round((x-d.G.x)/d.G.pitch);
    if(r!==d.r||c!==d.c){d.r=r;d.c=c;ghost=ghostAt(pieces[d.k],r,c);render()}
  }
  function endDrag(ok){
    const d=drag;drag=null;const gh=ghost;ghost=null;
    if(ok&&gh&&gh.ok){d.f.remove();place(d.k,gh.r,gh.c);return}
    const s=slots[d.k].getBoundingClientRect();
    d.f.classList.add('back');d.f.style.transform=`translate(${s.left+s.width/2-d.w/2}px,${s.top+s.height/2-d.h/2}px) scale(.5)`;
    d.f.style.opacity='0';S.after(220,()=>d.f.remove());render();renderTray();
  }
  S.on(tray,'pointermove',e=>{if(drag&&e.pointerId===drag.id)moveDrag(e)});
  S.on(tray,'pointerup',e=>{if(drag&&e.pointerId===drag.id)endDrag(true)});
  S.on(tray,'pointercancel',e=>{if(drag&&e.pointerId===drag.id)endDrag(false)});
  S.on(tray,'lostpointercapture',e=>{if(drag&&e.pointerId===drag.id)endDrag(true)});
  /* keyboard: 1-3 pick a piece, arrows move it, Enter places, Esc cancels */
  function kbShow(){ghost=kb?ghostAt(pieces[kb.k],kb.r,kb.c):null;render();renderTray()}
  S.on(window,'keydown',e=>{
    if(over||drag)return;const n='123'.indexOf(e.key);
    if(n>=0&&pieces[n]){kb={k:n,r:kb?kb.r:3,c:kb?kb.c:3};const p=pieces[n];kb.r=Math.min(kb.r,9-Math.max(...p.cells.map(x=>x[0]))-1);kb.c=Math.min(kb.c,9-Math.max(...p.cells.map(x=>x[1]))-1);kbShow();return}
    if(!kb){if(KEYDIR[e.key]||e.key==='Enter'){const k=pieces.findIndex(p=>p);if(k>=0){e.preventDefault();kb={k,r:3,c:3};kbShow()}}return}
    const p=pieces[kb.k],H=Math.max(...p.cells.map(x=>x[0])),W=Math.max(...p.cells.map(x=>x[1]));
    const D={up:[-1,0],down:[1,0],left:[0,-1],right:[0,1]}[KEYDIR[e.key]];
    if(D){e.preventDefault();kb.r=clamp(kb.r+D[0],0,8-H);kb.c=clamp(kb.c+D[1],0,8-W);kbShow()}
    else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(WB.fits(b,p.cells,kb.r,kb.c)){const{k,r,c}=kb;kb=null;ghost=null;place(k,r,c)}else{restartAnim(grid,'nope');beep(150,90)}}
    else if(e.key==='Escape'){kb=null;kbShow()}
  });
  S.on(window,'pointerdown',()=>{if(kb){kb=null;kbShow()}},{capture:true});
  deal();render();
  if(!pieces.length)check();
}

const WF_THEMES={
  Animals:'lion tiger zebra giraffe monkey elephant rabbit panda koala horse donkey camel wolf bear otter beaver moose kangaroo squirrel badger hippo rhino leopard cheetah llama',
  Fruits:'apple banana cherry grape lemon mango melon orange peach pear plum kiwi papaya apricot lime coconut berry fig guava raspberry pineapple date olive',
  Space:'planet comet star moon orbit galaxy rocket nebula meteor saturn jupiter mars venus earth gravity alien asteroid crater eclipse cosmos satellite pluto mercury',
  Sports:'soccer tennis hockey golf rugby boxing karate cricket skiing surfing rowing cycling archery bowling diving judo polo sailing netball baseball skating fencing',
  Ocean:'whale shark dolphin coral wave tide reef squid octopus crab lobster shell seaweed starfish turtle seal anchor island current kelp clam oyster jellyfish',
  Weather:'rain snow wind cloud storm thunder sunny frost hail fog breeze mist rainbow drizzle sleet tornado humid chilly blizzard lightning monsoon climate dew',
  Music:'piano guitar drum violin flute trumpet harp cello banjo tuba melody rhythm chord song tempo choir band opera rock jazz note concert singer chorus',
  Colors:'red blue green yellow purple orange pink brown black white silver gold violet indigo maroon teal navy beige coral cyan lilac amber crimson scarlet',
  Food:'pizza pasta bread cheese salad soup burger taco noodle rice pancake waffle cookie cake sandwich muffin bagel omelet curry yogurt honey butter popcorn pretzel',
  Jobs:'doctor nurse teacher chef pilot farmer baker artist dentist lawyer plumber writer actor singer judge builder painter driver sailor dancer barber tailor vet',
  Countries:'france spain italy brazil canada mexico japan china india egypt kenya peru chile norway sweden greece turkey ireland poland cuba nepal ghana iceland',
  Body:'head hand foot knee elbow ankle wrist finger thumb shoulder chest heart lung brain nose mouth tooth tongue ear eye chin neck spine muscle skin',
  Kitchen:'spoon fork knife plate bowl cup oven stove kettle pan pot whisk ladle grater fridge sink toaster blender teapot apron napkin mixer spatula',
  Vehicles:'car bus truck train plane boat bicycle tractor scooter taxi van ferry rocket subway tram jeep wagon yacht canoe kayak glider sled helicopter',
  Insects:'ant bee wasp beetle moth fly gnat flea cricket termite ladybug firefly hornet mantis cicada aphid weevil earwig locust midge dragonfly butterfly',
  Birds:'robin eagle hawk owl crow raven parrot pigeon sparrow swan goose duck heron stork penguin falcon finch wren puffin toucan ostrich flamingo pelican',
  Flowers:'rose tulip daisy lily orchid poppy iris violet lotus peony daffodil lilac pansy aster dahlia jasmine marigold sunflower bluebell crocus magnolia',
  School:'pencil eraser ruler book desk chalk paper teacher lesson class recess lunch exam homework science reading math library notebook crayon glue backpack',
  Camping:'tent fire lantern compass map hike trail cabin canoe forest river campfire torch flashlight log axe kettle stars backpack boots blanket picnic',
  Dinosaurs:'raptor fossil egg claw tail swamp jungle bones extinct jurassic triassic herd roar teeth herbivore volcano meteor sauropod iguanodon carnivore dig crest'
};
const WF_LV=[{z:8,n:6,d:[[0,1],[1,0]]},{z:10,n:9,d:[[0,1],[1,0],[1,1],[-1,1]]},{z:12,n:12,d:[[0,1],[1,0],[1,1],[-1,1],[0,-1],[-1,0],[-1,-1],[1,-1]]}];
const WF_FILL='EEEEEEAAAAAIIIIOOOOOTTTTTNNNNSSSSRRRRHHHLLLDDDCCCUUUMMPPGGFFWYBBVKXJQZ';
/* build a puzzle: returns {grid:[[ch]], placed:[{w,r,c,dr,dc}]} with exactly n words, or null */
function WF_gen(words,z,n,dirs,rnd=Math.random){
  const R=k=>Math.floor(rnd()*k);
  for(let attempt=0;attempt<60;attempt++){
    const pool=words.map(w=>w.toUpperCase()).filter(w=>w.length>=3&&w.length<=z);
    for(let i=pool.length-1;i>0;i--){const j=R(i+1);[pool[i],pool[j]]=[pool[j],pool[i]]}
    const pick=pool.slice(0,n).sort((a,b)=>b.length-a.length);if(pick.length<n)return null;
    const grid=[...Array(z)].map(()=>Array(z).fill('')),placed=[];
    for(const w of pick){
      let done=false;
      for(let t=0;t<300&&!done;t++){
        const [dr,dc]=dirs[R(dirs.length)],r=R(z),c=R(z),er=r+dr*(w.length-1),ec=c+dc*(w.length-1);
        if(er<0||er>=z||ec<0||ec>=z)continue;
        let okk=true,overlap=0;
        for(let k=0;k<w.length;k++){const ch=grid[r+dr*k][c+dc*k];if(ch&&ch!==w[k]){okk=false;break}if(ch)overlap++}
        if(!okk||overlap===w.length)continue;
        for(let k=0;k<w.length;k++)grid[r+dr*k][c+dc*k]=w[k];
        placed.push({w,r,c,dr,dc});done=true;
      }
      if(!done)break;
    }
    if(placed.length<n)continue;
    for(const row of grid)for(let c=0;c<z;c++)if(!row[c])row[c]=WF_FILL[R(WF_FILL.length)];
    return{grid,placed};
  }
  return null;
}
function wordfind(root,S){
  const lv=WF_LV[S.level-1],Z=lv.z;
  const names=Object.keys(WF_THEMES),last=store.get('wf:theme');
  let theme;do theme=names[rand(names.length)];while(theme===last);store.set('wf:theme',theme);
  const P=WF_gen(WF_THEMES[theme].split(' '),Z,lv.n,lv.d);
  const st=status(root,`Theme: ${theme}. Find all ${lv.n} hidden words by dragging from the first letter to the last.`);
  const bar=el('div','row mbar wf-bar',root,`<span class="wf-theme"></span><span class="wf-time">⏱ 0:00</span><span class="wf-cnt"></span>`);
  $('.wf-theme',bar).textContent=theme;
  const timeEl=$('.wf-time',bar),cntEl=$('.wf-cnt',bar);
  const g=el('div','wf-grid',root);g.dataset.ar=1;g.dataset.max=Z*56;g.style.setProperty('--z',Z);
  const NS='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox',`0 0 ${Z} ${Z}`);svg.setAttribute('class','wf-svg');svg.setAttribute('aria-hidden','true');g.append(svg);
  const cells=[];
  P.grid.forEach((row,r)=>row.forEach((ch,c)=>{const d=el('div','wf-c',g,ch);d.style.animationDelay=(r+c)*14+'ms';cells.push(d)}));
  const list=el('div','wf-list',root);
  const items=P.placed.slice().sort((a,b)=>a.w.localeCompare(b.w)).map(p=>{const s=el('span','wf-w',list,p.w);return{p,s,found:false}});
  const COL=['--c1','--c2','--c3','--c4','--c5','--c6'];
  let found=0,t0=performance.now(),secs=0,over=false;
  const paint=()=>{cntEl.innerHTML=`<b>${found}</b>/${lv.n}`};paint();
  S.every(1000,()=>{if(over)return;secs=Math.floor((performance.now()-t0)/1000);timeEl.textContent=`⏱ ${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`});
  function capsule(r1,c1,r2,c2,cls,color){
    const l=document.createElementNS(NS,'line');l.setAttribute('x1',c1+.5);l.setAttribute('y1',r1+.5);l.setAttribute('x2',c2+.5);l.setAttribute('y2',r2+.5);
    l.setAttribute('class',cls);if(color)l.style.stroke=`var(${color})`;svg.append(l);return l;
  }
  const cellAt=e=>{const b=g.getBoundingClientRect();return{x:(e.clientX-b.left)/b.width*Z,y:(e.clientY-b.top)/b.height*Z}};
  let sel=null,anchor=null,tmp=null;
  function endFrom(s,e){
    const p=cellAt(e),dx=p.x-(s.c+.5),dy=p.y-(s.r+.5),len=Math.hypot(dx,dy);
    if(len<.5)return{r:s.r,c:s.c,dr:0,dc:0,n:0};
    const a=Math.round(Math.atan2(dy,dx)/(Math.PI/4)),dc=Math.round(Math.cos(a*Math.PI/4)),dr=Math.round(Math.sin(a*Math.PI/4));
    let n=Math.round((dx*dc+dy*dr)/(dr&&dc?2:1));
    n=Math.max(0,n);
    while(n>0&&(s.r+dr*n<0||s.r+dr*n>=Z||s.c+dc*n<0||s.c+dc*n>=Z))n--;
    return{r:s.r+dr*n,c:s.c+dc*n,dr,dc,n};
  }
  function drawTmp(s,e){if(tmp)tmp.remove();tmp=capsule(s.r,s.c,e.r,e.c,'wf-sel')}
  function clearTmp(){if(tmp){tmp.remove();tmp=null}}
  function startCell(e){const p=cellAt(e);return{r:clamp(Math.floor(p.y),0,Z-1),c:clamp(Math.floor(p.x),0,Z-1)}}
  S.on(g,'pointerdown',e=>{
    if(over||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();
    const s=startCell(e);
    if(anchor&&(anchor.r!==s.r||anchor.c!==s.c)){
      const dr=s.r-anchor.r,dc=s.c-anchor.c;
      if(dr===0||dc===0||Math.abs(dr)===Math.abs(dc)){const n=Math.max(Math.abs(dr),Math.abs(dc));const a=anchor;anchor=null;clearTmp();check(a,{r:s.r,c:s.c,dr:Math.sign(dr),dc:Math.sign(dc),n});return}
    }
    anchor=null;sel={s,id:e.pointerId};try{g.setPointerCapture(e.pointerId)}catch(_){}drawTmp(s,s);beep(500,30);
  });
  S.on(g,'pointermove',e=>{if(!sel||e.pointerId!==sel.id)return;const en=endFrom(sel.s,e);if(!sel.e||en.r!==sel.e.r||en.c!==sel.e.c){sel.e=en;drawTmp(sel.s,en);if(en.n)beep(520+en.n*40,20)}});
  const up=e=>{
    if(!sel||e.pointerId!==sel.id)return;const s=sel.s,en=sel.e||{r:s.r,c:s.c,n:0};sel=null;
    if(!en.n){anchor=s;return} // a tap marks the first letter; tap the last letter next
    clearTmp();check(s,en);
  };
  S.on(g,'pointerup',up);S.on(g,'pointercancel',e=>{if(sel&&e.pointerId===sel.id){sel=null;clearTmp()}});
  function check(s,en){
    let str='';for(let k=0;k<=en.n;k++)str+=P.grid[s.r+en.dr*k][s.c+en.dc*k];
    const rev=str.split('').reverse().join('');
    const it=items.find(i=>!i.found&&(i.p.w===str||i.p.w===rev));
    if(!it){if(en.n>=2){beep(170,120,'sawtooth');const l=capsule(s.r,s.c,en.r,en.c,'wf-sel wf-bad');S.after(380,()=>l.remove())}return}
    it.found=true;found++;const color=COL[(found-1)%6];
    capsule(s.r,s.c,en.r,en.c,"wf-hit",color);
    it.s.classList.add('on');it.s.style.setProperty('--wc',`var(${color})`);restartAnim(it.s,'pop');
    for(let k=0;k<=en.n;k++){const d=cells[(s.r+en.dr*k)*Z+s.c+en.dc*k];d.style.animationDelay=k*40+'ms';restartAnim(d,'wf-hop')}
    [660,880,990].forEach((f,i)=>S.after(i*70,()=>beep(f+found*10,90)));paint();
    if(found===lv.n){
      over=true;secs=Math.floor((performance.now()-t0)/1000);
      const tt=`${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`;timeEl.textContent='⏱ '+tt;
      const nb=best('wordfind'+S.level,secs,true);
      st(`All found in ${tt}!${nb?' New best time!':''}`);S.after(350,S.next);newB.classList.add('wf-glow');
    }else st(`Found ${it.p.w}! ${lv.n-found} to go.`);
  }
  const row=el('div','row',root);const newB=el('button','btn wf-new',row,'🔄 New puzzle');S.on(newB,'click',()=>S.restart());
}

const WG_ANS={4:'time good only know make over back want well much very even here need work year made take life down last best such love home long look same come part find help high game give next each show feel sure team ever keep free away left city name play real done care week case full live read told four hard mean once tell seen stop call head took came side went less line open area face five kind hope able book talk fact half hand mind body food true lost room else girl nice idea past move wait late stay deal soon turn form fire easy near plan west list meet type baby song word gave self cost held main road town fine hear rest term date land miss club film knew lead hold star test view hour wish gold gone king bank east park role sent bill cool rate save blue fall fast felt size step page paid send vote born code door hair lose pick race seem sign walk safe goal huge base deep mark pass ball card dark mine note wall rock cold beat text join kept sort drop fair feet link sale tour sell sold wide lady plus unit rule none ship band cash wear luck rich skin fish glad grow trip spot shop cell foot hall nine heat fell ride slow tree wind cent lake fund hill pull push rose seat draw gain ring rise soul camp cast firm gift shut wood copy dear host rare boss wake busy farm file roll edge iron core port flat fuel kick mail pair zone bear boat duty path rain warm crew moon suit grew jump user flow hero joke loan soft feed pool hole milk pack snow weak cook cute fake task fill pure bird bowl meat mode neck zero tiny wave seek solo wing salt bell blow bond mile flag kiss load plot rent chat diet item lane navy tank tend yard golf laid tool mate rice roof calm hide quit sing bike cake loud peak grab pink tall lock nose wise lift coal hunt inch tone vast earn grey meal rush bone gate thin gear wash fort gray math bath mood rank sand tape wage desk rear wire belt soil deck dust rail root hire pace spin hook seed ward coat gene jean tube epic exit poll wolf bull ease fame tail twin boom knee teen trap chip dare jazz mask cape edit seal stem beef clay drag loop mall rely sole tale wore bass dual gulf logo pump slip dawn tune bold clip exam menu oral worn lion pipe poem vary dirt lazy shoe chef palm pole shed folk leaf dish duck hood nail poet sink skip snap swim cave flip wrap yoga boot bulk coin corn taxi bare clue grid soap aunt flew icon tier crop soup beam horn lean peer pile plug bend disc keen visa blew deer dive heal drum grip mild noon silk urge pine pose pour sang cafe mice slot fold myth pale toll hint nest reed scan span doll hull rope buzz lamp oven slim tent tide bolt echo soda fork junk arch axis goat lamb tire warn sail wipe chin dash barn neat bean bump cart cord lawn oval pond ruby clan melt stir trek hike lily sigh trio acre dial halt monk norm lend mint bake glow rode sack toss wool dome fond frog moss trim haul sour saga fade lime maid surf bait bark',5:'about other after first think could where right still never world great while every state three since under thing house place again found might money night until group start today point music power water small white later order party thank black whole maybe story least early local video young given level often south known large along class close cause happy human woman leave north watch light short taken third among check heart child major phone quite final front ready bring heard march study clear month board field force issue price space total above share sense break event sorry guess learn alone movie press worth sound value round stand stuff drive green match model trust range trade chief lower style stage title enjoy cover legal seven staff super union began built daily paper voice whose earth below offer sleep table truth build piece visit wrote river shall speak write album eight funny peace spent store track ahead allow brown radio cross focus extra quick agree clean photo scene spend coach heavy train claim hotel judge brain floor image meant reach civil dance stock dream grand sweet touch drink shown basic carry fully plant avoid catch coast truly queen glass prior royal serve begin twice brand count fresh mouth owner scale score smart throw click faith metal agent apply basis enter prime waste weird adult grade stone apart aware fifth proud birth labor lucky prove tough alive apple dress horse magic stick frank guide raise treat youth exist guard solid sport taste hello plane shape upper cheap joint steel crowd limit ocean proof chair honor email sugar drama entry grant grown route squad teach laugh lunch storm actor chain equal quiet split urban phase smile truck novel shirt cream giant mayor minor theme usual draft spoke cycle aside empty prize rural admit favor frame guest teeth bunch fruit index shift stood tight crown grace chose depth noise panel plate cable print sight broad drawn motor solar brief chest debut paint pilot steam exact quote trend bread inner reply tower wheel pride rough smell topic sharp trick audio chart mount occur bound cloud loose moral thick threw angel bonus flash refer trail uncle chase ideal clock label pitch pizza plain comic ghost newly skill solve boost knife saint buddy delay elite forth layer marry nurse rugby sheet bench medal shell silly angle forum grass hence rapid sixth valid vital creek honey ratio spell sword begun daddy drove glory juice logic strip dozen fancy input knock ought flood rally swing alert arena brave fleet robin shake shore pound punch fewer mouse piano craft sauce slide tiger alien beast candy relax alarm globe spare opera quest lover scope alpha brick mercy outer venue habit naval noble robot wider asset baker brush essay maker snake usage climb fluid twist unity fence dealt forty laser loyal patch radar villa adopt blade cargo humor nerve sandy sheep trace chill grain liver metro rival slept spray suite verse bless couch genre lease shine react rocky shade vocal yield bacon salad stake swift awake blank curve hurry organ pearl alike arrow cabin eagle eaten haven valve charm delta ridge tribe canon stamp voter belly booth cliff lemon shark dairy diary drill meter olive safer skull basin bride chick fairy lodge merit micro tooth beard drain flame ninth penny reign sunny cheer elder fiber pulse realm shout alter brass graph stack audit buyer cloth eager elect lobby orbit ranch trunk badge ferry gauge rider shelf width sheer stark thumb wheat wrist acute civic clerk drone flour minus pause puppy slice vinyl probe spark steep straw weigh adapt dense kitty whale amber ankle armor berry clash grasp handy poker scout steak sweep cheek curry polar skirt spike toast waist blend brake feast frost purse tense chess float grind grove hobby newer spice towel arise bloom clown dodge guild prone sixty sonic spine crane donor pasta tenth batch paste plaza stare champ scrap shaft slope snack stern stiff unite vault wagon midst onion abbey bunny choir holly shiny spoon teddy alley marsh messy ninja roast salon coral dough hardy maple relay risen stunt ivory niche porch elbow goose grill ruler swamp tasty merry reset drift hatch scent slate surge token yacht manor pupil altar combo ounce spicy belle raven strap bliss daisy disco forge notch omega queue trout bravo crawl digit jelly lunar peach cedar heath pinch syrup dwarf liner merge vivid boxer brook hedge rainy salty skate tempo torch turbo blink chili excel glove greet renew retro stoke aisle brace motto onset pixel razor steer bingo cubic macro slack stove tract vista adore crisp crust flora gamma grape juicy prank chalk flock moist scoop scrub titan trait troop clone jewel scarf sushi timer dusty focal noisy snail tutor verge yeast erase oxide repay basil chord crest decor fetch fuzzy nicer optic panda baton camel chunk cocoa comet dummy flare lever pedal query swell align attic await comfy flick funky groom lyric wedge alloy linen moose motel resin rusty weary chant curly mound muddy abide avail madam nanny poppy tease bluff flyer miner swipe tango cloak dwell jolly windy blush mango oasis rhyme savvy witty woven amend blond finch sedan algae dryer ethic flair hazel viola yummy adobe salsa denim erect fauna flute stool tread unfit aloud boast birch canoe cider equip humid milky mixer pivot cling icing mimic mural diner gravy rinse squat thorn wiser crate gloss rodeo snowy plank siren stalk clamp inlet quake racer stout parry patio prism squid swarm aspen dizzy pouch tummy broom medic nylon ozone agile carve diver genie ledge tenor zebra broth heist misty satin tonic jumbo otter relic waltz biker apron azure cadet geese ebony itchy latch',6:'people should really before around better little during school family please second number public system person change enough making though season course health within social single become coming office almost taking anyone matter pretty friend saying either future rather reason report myself living behind market former street chance father across action moment mother energy summer strong period record common likely center county couple happen inside online player return higher member middle result answer design policy church longer became giving ground source follow amount league review itself entire choice simple simply career figure modern forget listen access recent seeing growth charge create effect except moving weight double expect island normal credit nearly region travel beyond minute nature unless income safety asking search author global leader letter nobody sister annual degree active master wonder effort impact latest secret senior spring anyway bought choose direct easily finish caught doctor notice highly winter advice nation theory agency camera status coffee flight accept actual appear eating mobile screen speech bottom demand engine famous square fourth mostly remain acting budget estate larger target animal memory silver spread supply artist method option window winner handle spirit decide dinner bridge garden length easier fellow volume beauty buying corner driver paying unique bigger lovely closer honest reduce plenty prince proper toward useful valley flying museum remove border ensure forest profit launch native survey update writer yellow ending planet taught adding appeal device factor golden hoping lawyer sector studio twenty debate escape faster secure talent forgot slowly vision editor orange signal stream voting bright chosen desire medium ticket mainly switch affect dollar motion saving branch heaven random afford assume bottle cheese detail harder parent prefer scheme unlike weekly button expert latter object turkey attend carbon circle deputy manner nearby origin relief retail surely client driven empire manage widely hardly height hidden marine reform sample breath decade rising singer campus comedy wealth facing fairly racing shower visual barely junior repeat riding sought finger guitar ignore pocket rescue soccer stable defend extent format gotten lesson loving mirror belief server castle formal hungry palace rating select silent spoken temple deeply legend muscle shadow thread avenue custom output reveal worker assist behalf flower hockey prayer rarely struck walker aspect bureau cousin dragon lately lowest remote repair butter decent desert obtain poetry recall smooth string sudden thrown abroad liquid makeup narrow arrive belong bishop thirty hunter legacy merely remind resort settle tongue asleep engage gaming regard salary script cotton expand luxury tennis twelve extend reader column commit foster genius priest proven reward wooden frozen hiding invest jacket manual purple tissue versus define domain praise rocket steady symbol treaty triple affair agenda deeper enable equity invite partly phrase shield summit throat wisdom polish ruling timing worthy filter galaxy intent knight mature submit copper margin vessel autumn fiscal mutual pursue garage oxygen powder sooner spider divine export gather oldest relate tunnel casual hiring laptop recipe rubber serial strict cruise delete outfit permit safely slight backup clever clinic holder bronze caring depend eighth resist solely beside census dealer poster cancel carpet cherry patent runner barrel boxing cinema gentle notion trophy bubble hammer marvel parade retain cattle farmer finest harbor inform strain tackle urgent wallet aboard accent dining immune patrol pepper breach closet iconic lesser rookie banner colony divide eleven entity jungle linear resume dental freeze humble hybrid mixing openly parish potato potter throne facial import mighty purely rental advise fixing indoor intend roster statue tender vacuum fabric gently layout pastor subtle adjust assess basket bucket burger cookie freely matrix monkey nicely assure ballot streak detect diesel filing median rabbit retire rhythm stance static subway tablet thesis blonde collar comply donate finale flavor joking lineup newest sketch sunset arctic chapel differ insist kidney ladder modest tribal anchor bounce cannon diving fisher fridge fusion helmet keeper namely ritual insert nephew salmon seller timber upside banana behave borrow escort firmly kindly noting outlet pledge portal clause dancer fossil infant liking offset roller upload vector absent atomic circus expose intact intake needle porter sequel slower admire grande merger resign canyon cooler employ marble pillow pirate puzzle sprint superb tricky viable ballet binary critic herald hollow locker pencil plasma spouse waking cement locate motive postal refund robust virtue bundle costly darker ginger mentor occupy pierce sleeve tenure wizard baking fierce garlic impose lounge polite runway sensor aerial anthem exotic glance refuge sphere turtle verbal chorus chrome esteem peanut unlock aiming alumni awhile broker emerge module voyage weaker candle clutch header lining metric naming opener ranger verify yearly hiking marker sodium breeze coupon fringe legion lively pickup prompt radius scroll thrust cowboy spiral splash timely tomato heroic marina owning skiing typing violet convey inland inning overly wholly decree endure enzyme louder maiden nickel pardon remedy replay absorb accord archer barber coding kindle melody ribbon suburb temper evolve ironic picnic puppet sticky vacant warmth gamble loudly modify remake shrimp vendor'};
const WG_OK={4:'abba abby abed abel abit ably acct aced acer aces ache acid aclu acme acne acta acts adam adds addy aden aeon aero afar afro agar aged ages agra agua ahab ahem ahoy aide aids aims aint aire airs airy ajar ajax akin alan alas alba alec ales alex alfa alia alle allo alls ally alma alms aloe alps also alto alum amal amar amen amex amid amin amir amis amit amma ammo amok amor amos amps anal anas anda andi andy anew anil anna anne anni anno anon ansi ante anti ants anus apes apex apis appt aqua arab arco arcs aren ares argh argo aria arid arms army arne arse arte arts arty arya asap asha ashy asia asks assn asst asta atom atop atta attn atty auld aura auth auto avid avis awed awol awry axed axel axes axle axon baal baba babe babs babu bach bade bags baht bail bain baja baka baku bala bald bale bali balk balm bana banc bane bang bani bans bara barb bard barf bari barr bars bart bash bask bast bate bats batt bays bead beak beal beau beck bede beds been beep beer bees beet begs bein bela bene beni benn bent berg berk bern bert bess beta beth bets bevy bias bibi bide bids bien biff bigg bile bind bing bins bios bite bits blah bldg bled bleu blip blob bloc blot blur blvd boar boas boba bobo bobs boca bock bode boer bogs boho boil bois boko bola bolo bomb bona bong bono bony boob boon boos bora bore borg boro bose bosh both bots bout bowe bows boxy boyd boys bozo brad brag bram bran bras brat bray bred bree bren bret brew brie brig brim brin brit bros brow brut buck buds buff bugs bulb bums bund bung bunk buns bunt buoy burg burn burp burr burt bury bush buss bust bute buts butt buys byes byte cabs cade cady cage cain cair calc calf cams cana cane cans cant capa capo caps cara carl caro carp carr cars cary casa cask cass cate cath cats cava cede cera cern cert chad chai cham chan chao chap char chee chem chen cher chet chew chez chia chic chil chit chop chou chow choy chub chug chum chun ciao cine cite clad clam clap claw clem clio clit clog clos clot cmdr coax cobb coca cock coco coda coed cogs coil coke cola cole coli coll colt coma comb comm comp coms cond cone conf cong conn cons cont coon coop coos copa cope cops cora cork corp corr cory cosy cote cots coup cove cowl cows cozy cpus crab crag cram crap cray cree crib crim cris crit croc crow crud crux ctrl cuba cube cubs cuck cues cuff cull cult cunt cups curb curd cure curl curt cusp cuss cuts cyan cyst czar dabs dada dade dads daft dais dale dali dame damn damp dams dana dane dang dani dank darn dart data dave davy days daze dead deaf dean debs debt deco deed deem deft defy deja deli dell demi demo dens dent deny dept desc desi deus deux deva devi devs dewy dian dias dibs dice dick didn dido died diem dies diff digs dike dill dime dine ding dink dino dint dion dips dire dirk disk diss dist diva dock docs dodd dodo doer does doge dogs dojo dole dona dong dons dont doom doon dope dora dorm dorn dory dose dost doth dots doug dour dove dowd doze drab dram drew drip drug dubs duct dude duds duel dues duet duff duke dull duly duma dumb dump dune dung dunk duos dupe dura dusk dyed dyer dyes dyke earl ears eats eben econ eddy eden edgy edna eels eggs egos elan elec elia elks ella elle elms elon elsa emil emir emit emma emmy ends engl enid enos envy eons eras ergo eric erie erik erin eros esau esse etch etna eton etta euro eval evan evil exec exes exon expo eyed eyes eyre ezra fads fags fail fait falk fang fans fare faro fart fate fats faux fawn faze fear feat feds fees fend fern fess fest feta fete feud fiat fico fide fido fife figs fiji fink finn fins firs fisk fist fits fitz fizz flak flap flaw flax flea fled flee flex flog flop flor flue flux foal foam foes foil font fool fora ford fore foss foul fowl foxy frat frau fray fred fret frey from fuck fuji fume funk furs fury fuse fuss fuzz gabe gabi gaby gael gaff gaga gage gags gaia gail gait gala gale gall gals galt gang gant gaol gaon gaps garb gard gare gary gash gasp gaul gays gaze geek gees geez gels gems gens gent gere germ gets ghee gigi gigs gila gill gilt gimp ginn giro gist glam glee glen glib glue glut glyn gnaw goad gods goer goes goff gogo gong goof goon goop gore gory gosh goss goth goto gout gove govt gown grad graf gram gras greg grim grin gris grit grog gros grub guam guan gull gulp gump gums gung guns gurl guru gush gust guts guys gwen gyms gyro hack haha hail hain haji hajj hala hale halo hams hang hank hans hare hark harm harp hart harv hash hast hate hath hats have hawk haye hays haze hazy heap heck heed heel heft hehe heil hein heir hell helm hemp hens hera herb herd herr hers hewn hick hilt hind hing hips hiro hiss hist hits hive hoax hobo hock hoes hogg hogs hoke hola holi holm holt holy homo hone hong honk hoof hoon hoop hoot hopi hops hora hors hose hoss hots hove howe howl hows hoya hubs huck hued hues huey huff hugh hugo hugs hula hulk hulu huma hume hump hung hunk huns hurl hurt hush husk huts hwan hyde hymn hype hypo iago ibid ibis icbm iced ices icky ides idle idly idol ieee iffy ills ilya imam iman inca incl indy inez info inga init inks inky inns inst intl into ions iota iowa iran iraq iris irks irma isis isle isnt itch itll ivan izzy jabs jack jade jags jail jain jake jama jams jane jars java jaws jays jeep jeez jeff jell jeon jerk jess jest jesu jets jews jigs jill jing jinn jinx jive joan jobs jock joel joes joey john jolt jong joni joon jose josh joss jour jove joys juan juba jude judo judy jugs juju juke july june juno jura jure jury just jute kain kaka kala kale kali kama kami kana kane kang kant kari karl kart kate kath katy kcal keel kegs keir kell kelp kemp kent kerb kern keto keys khan kids kiel kiev kiki kill kiln kilo kilt kink kino kirk kite kits kiwi klan knit knob knot knox koch kohl koko kona kong kook kors kota kris kuan kung kurt kwan kyle labs lace lack lacs lacy lads lags lain lair lakh lama lame lana lang laos laps lard lark lars lash lass laud lava laws lays leah leak leap lear leds leed leek leer lees legs leif lena leno lens lent leon lest leto lets levi levy lewd liar libs lice lick lido lids lied lien lies lieu like lila lima limb limo limp lina lind ling linn lino lint lipa lips lira lire lisa lise lisp lite liza loaf loam lobe lobo loca loch loci loco lode loft logs loin lois loki lola lolo loma lone loom loon loos loot lope lora lord lore lori loss lots lowe lows lube luce lucy luge lugs luis luke lula lull lulu lump luna lung lupe lure lurk lush lust lute luxe lynn lynx lyon lyra lyre mace mach mack macs madi mads maga mage magi mags maha mahi maia maim mair maja maki mako mala male mali malo malt mama mana mane mang mani mann mano mans many maps mara marc mare marg mari marl mars mart maru marx mary masa mash mass mast mats matt maud maul maxi maya mayo mays maze mbps mead mech meek meer mein mela meld memo mems mend meng mens ment meow merc mere merv mesa mesh mess meta meth mets mews mica mick midi mike miki mila mill milo milt mime mimi mina ming mini mink mino mins mira mire miri miro misc miso mist mite mitt mmmm moan moat mobs mock modi mods mohr mojo mold mole moll moly momo moms mona mong mono mons mont moor moot mora more morn moro mort mose most mota mote moth mott moya muck mudd muff mugs muir mule mull mums musa muse mush musk must mute mutt myra nach nada naga naik nair nama nana napa nape naps narc nary nasa nash nasi nast nate natl nato nave navi nazi neal neet neil nell nemo nene neon nerd ness nets neve news newt nick nigh nike nile nils nina ning nips nist noah noam node nods noel noir nome nona nook nope nora nori nosy nots noun nous nova novo nude nuke null numb nuns nuts oaks oars oath oats oban obey oboe odds odin odor offs ogle ogre ohio ohms oils oily okay okey okra olaf olds oleg olga oman omar omen omer omit omni ones onto onus onyx oooo oops ooze opal opec opts opus orbs orca orcs ores orgy orig oslo otis otto ouch ours oust outs ovid owed owen owes owls owns oxen paco pacs pact pads pail pain pala pali pall pals pane pang pans pant papa pape para parc pare pari parr pars paso pate pats paul pave pawn paws pays pear peas peat peck peed peek peel peep pees pegs pele pell pelt peng pens pent pere perf peri perk perm perp pers pert peru perv peso pest pete petr pets pews phat phew phil phys pico pics pied pier pies piet pigs pika pike pill pima pimp pina ping pino pins pint pips pisa piss pita pits pity pius plat plea pled plex plop plow ploy plum poco pods pogo poke polk polo poly pomp pong pons pont pony poof pooh poon poop poor pope pops pore pork porn posh post pots pout pows pram prat pray prem prep pres prev prey prim prix prob proc prod prof prog prom prop pros prov psst publ pubs puck puff pugh pugs puja puke pulp puma punk puns punt puny pups puri purr puss puts putt pyke pyre pyro quad qual quan quay ques quid quin quip quiz quot rack racy rada rafe raff raft rage rags raid raja rake ralf rama rami ramp rams rana rand rang rani rant rape raps rasa rash rata rath rats raul rave ravi raya rays reap redd redo reds reef reek reel rees refs reid rein reis reit remi reno reps resp revs rhea ribs rick rife riff rift riga rigs rims rind rink riot ripe rips risk rita rite ritz riva roam roan roar robe robs rods rolf rome romp roms rong rood rook rory rosa ross rosy rota rote rots rout roux rove rows roxy rsvp rube rubs ruck rudd rude rudy ruff rugs ruin rukh rump rune rung runs ruse rusk russ rust ruth saad saba sacs sade sadr sage said sake saki sala sane sank sans sant saps sara sari sark sash sass sata sate saul sawn saws saya says scab scam scar scat scot scum seam sean sear seas secs sect seep seer sees semi sena sept sera serb seri seth sets sewn sexy shad shag shah sham shan shat shaw shay shea shem shen sher shes shia shih shim shin shit shiv shoo shot shou shri shun siam sich sick sidi sift sikh sill silo silt sims sina sind sine sins sion sips sire sirs sisi sita site sith sits situ siva skew skid skim skis skit skye slab slag slam slap slav slaw slay sled slew slid slit slob slog slop slug slum slur slut smog smug smut snag snip snob snot snub snug soak soar sobs sock sofa soho sola soma some sone sons sook soot sora sore sous sown sows soya spam spar spas spat spec sped spew spit spud spun spur stab stag stan stat stew stow stub stud stun styx subs suck suds sued sues suez sufi sulu sumo sump sums sung sunk suns supp supt sura suzy swab swag swam swan swap swat sway swig swot syed sync tabs tack taco tact taft tags tait taka tama tame tana tang tans taos taps tara tarn taro tarp tart tash tass tate tats taut taxa tbsp teak teal tear teas tech tees tele temp teng tens tera teri tern tess tete thad thai than thar that thaw thea thee them then theo they this thon thor thos thou thro thru thud thug thus tick tics tidy tied tien ties tiff tiki tile till tilt timo tina tine ting tink tino tins tint tips tits toad tobe toby tock toda todd toed toes tofu toga togo toil toke toma tomb tome toms tong tonk tons tony toon toot tops tora tore tori torn toro tort tory tosh tote toto tots tout toys trad tram tran trav tray tres trey trig tron trot troy tsar tuan tuba tubs tuck tuff tuft tugs tuna tung turd turf turk tusk tutu twas twat twig twit twos tyne typo tyre ufos ugly ulta undo univ unix unto upon ural urdu urea uric urns ursa used uses ussr utah vail vain vale vamp vane vans vase vats veal veda veep veer vega veil vein vela vent vera verb vern vers vert vest veto vets vial vibe vice vick vide viii vila vile vine vino vips vise vita viva vive vivo vogt void vole vols volt vows wack waco wade wadi wags wail waka wale wali walt wand wane wang wank ware warp wars wart wary wasn wasp watt wavy wawa waxy ways wean webs weed weep weir weld welt wept were weve wham what when whet whew whey whig whim whip whit whiz whoa whom whoo wich wick wife wigs wild wile will wilt wily wine wink wins wisp with wits woes woke wold womb wong wont woof worm wort wove wray wren writ wynn xiii xmas xvii xxii yale yams yang yank yarn yawn yaya yeah yell yelp yeti ymca yogi yoke yolk yore york youd your yous yoyo yuan yuck yuki yule yuma zach zack zain zany zeal zeke zest zeta zeus zinc zing zion zips zona zoom zoos zulu',5:'aaron aback abate abbas abbie abbot abhor abies abled abner abode abort abram abuse abuts abuzz abyss accel accra accts ached aches acids acker acorn acres acrid acted actin acton adage adams added adder addie addis adela adept adieu adios adlai admin adolf adorn aedes aegis aeons aerie aesop affix afire afoot afore afoul agape agata agate agave agers agger aggie aggro aging aglow agnes agony agora agron ahmed ahmet ahold ahsan aided aides aimed aimee aioli aired akali akron alain alamo alban albee albin albus alden alder aleck aleph algal alias alibi alice aline aliya alkyl allah allan allay allen aller allez allie allis allot aloft aloha alois aloof altho altos alums alvin alway amani amara amass amaze ambit amble ameen ameer amici amide amiga amigo amine amino amish amiss amity amman amour ample amply amrit amuse andes andor andre anent anger angie anglo angry angst angus anima anime anion anise anita anjou anker annas annex annie annoy annul annum anode anova ansar ansel antar antes antic antis anton antsy anvil anzac aoife aorta apace aphid aphis apnea appel april aptly arabs arbor archy ardor areal areas arent argan argon argos argue argus arian arias ariel aries arius arjun arles armed aroma arose arras array arses arson artic artie artsy aryan asana asaph ascii ascot ashen asher ashes asian asked askew aspca assam assay asses assis assoc aster astor async atlas atlee atman atmos atoll atoms atone atria attar aubin auger aught augur aunts aunty aural auras aurum autos autre auxin avant avast avert avery avian awacs award awash aways awful awoke axial axing axiom axles axons aztec babby babel babes bache backs badly bafta bagel baggy bahar baile bails baits baked bakes balan baldy baler bales balls bally balms balmy baloo balor balsa banal banca banco banda bande bando bands bandy banff banga bangs banjo banks bantu barat barba barbs bardo bards bared bares barge barks barmy barns baron barra barre barry barth basal based bases basso basta baste basti bated bates bathe baths batik batts batty bawdy bayou bazar beach beads beady beaks beams beano beans bears beata beats beaut beaux bebop becks becky beech beefs beefy beeps beers beery beets begat beget begum beige being beira belay belch belie bella belli bello bells belts benda bends bendy benes benet benin benjy benny benzo beret berne berth beryl beset bests betas betel betis betsy betta betty bevel bezel bibby bible bicep biddy bidet biffy bight bigly bigot bijou biked bikes bilbo biles bilge billa bills billy bimbo bindi binds binge biome biota birds birdy birks bison bitch biter bites bitsy bitty blain blair blake blame blanc bland blare blase blast blaze bleak bleed bleep blest blick blimp blind blips blitz bloat blobs block blocs bloke blood bloop blots blown blows blued bluer blues bluey blume blunt blurb blurs blurt boars boats bobby bocce boden bodes bodhi boers bogan bogey boggy bogie bogle bogue bogus boils boing boise boles bolts bolus bombs bonds boned boner bones boney bongo bongs bonne bonny boobs booby booed books booms boone boons boots booty booze boozy boras borax bored borel borer bores boric boris borne boron bosch bosom boson bossa bossy botch bough boult bourg bourn bouts bowed bowel bower bowie bowls boxed boxes boyce boyer brack brags braid brant brash brats brava brawl brawn bream breck breed brees brent brest brett brews brian briar bribe brier brill brims brine brink briny brisk brite brits britt brock broil broke bromo bronx brood brows bruce bruin brule bruno brunt brute bryan bryce bryon bubba bucko bucks bucky budge bueno buffs buffy buggy bugle buick bulbs bulge bulky bulla bulls bully bumps bumpy bunce bundt bundy bunga bunks bunty buoys burbs burge burgh burka burke burly burma burns burnt burps burro burrs burry bursa burst busby buses bushy bussy busts busty butch butte butts butyl buxom buzzy bylaw byron bytes byway cabal cabot cacao cache cacti caddo caddy cadre cafes caged cages cagey caird cairn cairo cajon cajun caked cakes caleb calif calla calls calms calyx cameo campo camps campy camus canal caned canes canis canna canny canst canto caped capel caper capes capon cappy capra capri carat carbo cards cared carer cares carex carey carib carle carli carlo carne carol carpe carte carts carty caryl casas casco cased cases casey casks caste casts casus cater cates cathy catty caulk causa caved caves cease cecil ceded celeb celia cello cells celts cento cents ceres cesar chace chaco chafe chaff chaka chama chang chaos chaps chara chard chars chasm chats chaya cheat cheep chefs cheng chert chevy chews chewy chiao chiba chica chico chide chien chile chime chimp china chine ching chink chino chins chips chirp chive chloe chock choco choke chola cholo chomp chook chops chore chowk chris chron chubb chuck chugs chump chums chung churn chute cigar cilia cinch cindy circa circe cisco cissy cited cites clack clade claes clair clams clang clank clans claps clara clare clark claro clary clasp claus clave claws clays cleat cleft cleve clift cline clink clint clips clive clogs clots clout clove clubs cluck clued clues clump clung clunk clyde coals coats cobbs cobol cobra cocks cocky cocos codec coded coder codes codex codon coffs cohen coils coins coked coker cokes colas colds coles coley colic colin colon color colts coman comas combe combs comer comes comma comme compo comps comte conch condo cones coney conga congo conic conor const conte contr conus cooch cooks cools coons coops coots coped copes coppa copra copse coram corby cords cordy cored cores corey corgi corks corky corns corny corps corse corso corvo cosmo costa costs cotes cotta cough coupe coups cours court coven coves covet covey covid cowan cowed cower crabs crack crags craig crain cramp crank craps crash crass crave craze crazy creak creat credo creed creel creep creme crepe crept cress crete crewe crews cribs crick cried crier cries crime crimp crips criss croak croat crock croft crone cronk crony crook croon crops crore croup crows crude cruel crumb crump crunk cruse crush crypt cuban cubby cubed cubes cuddy cuffs culls culpa cults cumin cunts cupid cuppa curbs curds cured cures curia curie curio curls curse curvy cushy cusps cuter cutie cutty cyber cyclo cynic cyril cyrus cysts czech dacha daffy dagon dalai dales dally daman dames damme damon dancy dandy danes danke danny dansk dante darby darcy dared daren dares darin darts darya daryl dated dates datum david davis dawns dayal dayan dazed deals deans dears death debby debit debts debug decal decay decks decoy decry deeds deems deeps deers defer degas deign deism deity delft delhi delia della dells delph delve demon demos denis dents depot derby derek derry desks deter deuce devas devel devil devon dewan dewar dewey dhoni dials diana diane diced dicey dicks dicky diddy didnt didst diego diets digne dikes dildo dilly dimer dimes dimly dinah dinar dined dines dingo dings dingy dinka dinky dinos diode dione dippy dirge dirks dirty discs disks ditch ditto ditty divan divas dived dives divvy diwan dixie dixit djinn dobby dobie docks dodgy doers doesn doggo doggy dogma doing dolce doled dolls dolly dolor dolph domed domes domus donal dongs donna donne donny donut dooms doors doozy doped dopey doria doric doris dorms dosed doses doted dotty doubt douce douma douse dover doves dovey dowdy dowel dower downs downy dowry doyen doyle dozed dozer draco drago drags drake drang drank drape drawl draws dread dregs dried drier dries drips droit droll drool droop drops dross drown drugs druid drums drunk drury druze dryly duals duane ducal duchy ducks ducky ducts duddy dudes duels duets duffy dukes dulce dumas dumps dumpy dunce dunes dunks dunne dunno dunst duomo duped duper dupes duras durst dusky dusts dutch duvet dwelt dying dykes dylan eared earle earls earns eased easel eases eater eaves ebbed echos ecole eddie edema edgar edged edges edict edith edits edwin eerie effie egged egret egypt eject eland elegy elfin elias elihu eliot eliza ellen elmer elope elric elses elude elves elvis embed ember emcee emden emery emily emits emmet emory emote enact ended ender endow enema enemy engin engle ennui enoch enrol ensue entre envoy epics epoch epoxy epsom equus erica erick erika ernie ernst erode erred error erupt erwin essex essie ester ethan ethel ether ethos ethyl etude euler euros evade evans evens evert evict evils evoke ewing exalt exams execs exert exile exits expel expos extol exude exxon eyrie fable faced faces facet facie facto facts faded fader fades fagin fails faint faire fairs faked faker fakes fakir falco falls false falun famed fangs fanny fanon farce fared fares farms farsi farts fasts fatal fated fates fatty fatwa fault faust fawns faxed faxes fayed fazed fears feats fecal feces feeds feels feely feign feint feist felix fella fells felon femme femur feral feria fermi ferns ferri festa fetal feted fetid fetus feuds fever fibre fibro ficus fidel fides fiefs fiend fieri fiery fifty fight filed filer files filet fille fills filly films filth finds fined finer fines finis finns fired fires firma firms firth fishy fists fitch fiver fives fixed fixer fixes fizzy fjord flack flags flail flake flaky flank flaps flask flats flaws fleas fleck flees flesh fleur flier flies fling flint flips flirt floes flops floss flout flown flows floyd fluff fluke flume flung flunk fluor flush flyby foals foams foamy foggy foils folds folic folio folks folly fonds fonts foods fools foots footy foray fords forex forgo forks forma forme forms forst forte forts fossa fosse fouls fount fours fowls foxes foyer frack frail franc franz fraud freak freed freer frees freon frere frets freud freya friar fried fries frill frisk frist frith fritz frizz frock frogs frond frosh froth frown froze fryer fucks fudge fuels fugue fultz fumed fumes funds fungi furor furry fused fuses fussy gabby gable gabon gaels gaffe gaily gains gaius galas galen gales galli galls gally gamba gamed gamer games gamut ganda ganga gangs ganja garbo garde garth gases gasps gassy gated gates gator gaudy gauls gault gaunt gauss gauze gauzy gavel gayer gazed gazes gears gecko geeks geist gekko gemma genes genet genii genny genoa gents genus geoff germs getup ghana ghats ghazi ghent ghoul gibby giddy gifts giles gills gilly gilts gimme ginny gipsy girls girly girth giver gives givin gizmo glace glade gland glans glare glaze gleam glean glebe glenn glens glial glick glide glint gloat gloom glows gluck glued glues gluon glynn glyph gnats gnome goals goats godly goers going golds goldy golem golgi golly gomer goner gongs gonna gonzo goods goody gooey goofs goofy goons goran gored gorge gorse gotch gotha goths gotta gouda gouge gourd gowan gowdy gowns grabs grads graff graft grail grama grams grata grate grave grays graze grebe greco greed greek gregg greta grete greys grice grids grief griff grift grime grimm grimy grins gripe grips grist grits groan groff groin groot grope gross grote grout growl grows grubs gruel gruff grump grunt guano guava guido guile guilt guise gulch gules gulls gully gulps gumbo gumby gummy gundy gunny guppy gurus gusto gusts gusty gutsy gutta guyer gypsy gyros gyrus hacks hacky hades hadji hadnt hafiz hagar hagia hague haida haiku hails hairs hairy haiti hajji hakim halal halas hales hallo halls halos halts halve haman hamel hammy hamza hands hangs hanif hanks hanky hanna hanoi hansa hants haram hards harem hares harms harps harpy harry harsh harts hasan hasnt hasta haste hasty hated hater hates hauls haunt hausa haute havel haver haves havoc hawks haydn hayes hayne hazen heads heady heald heals heaps hears heats heave hecht heels hefty heidi heinz heirs helen helge helio helix hells helms helps henna henny henry herat herbs herds heres herne heron heros hertz herve hetty hexes hicks hides highs hight hiked hiker hikes hilda hills hilly hinch hindi hinds hindu hinge hints hippo hippy hiram hired hires hirst hissy hitch hives hoard hoary hobos hocus hodge hogan hoist hokey holds holed holes holla homed homer homes homey homme homos honan honda hondo honed hones honks honky hooch hoods hoody hoofs hooks hooky hoops hoots hoped hopes hoppy horde horns horny horry horst hosea hosed hoses hosts hotch hotly hough hound hours hovel hover howdy howes howls hoyle hsien hubba hubby huffs huffy hulks hulls humic humph humps humus hunch hunks hunky hunts hurls huron hurst hurts husks husky hussy hutch hydra hydro hyena hymen hymns hyoid hyped hyper icons idaho ideas ident idiom idiot idler idols idyll igloo ignis iliac iliad ilium illus imago imams imbue impel imply inane incan incas incur india indic indra indus inept inert infer infos infra inger ingle ingot inigo inked inlay inset intel inter intra intro ionic irani iraqi irate irena irene irfan irish irked irons irony irvin irwin isaac islam islay isles islet issei italy items izumi jacko jacks jacky jacob jaded jager jails jaime jaina jakes jakob james jamie jammy janes janet janos janus japan jared jason jaunt jawed jazzy jeans jebel jeeps jeers jello jenna jenny jerez jerks jerky jerry jesse jesus jetty jewry jiffy jiggy jihad jimbo jimmy jinks jinny jocks johan johns joins joist joked joker jokes jokey jolts jonah jonas jones jorge josey joshi josie josip joule jours joust joyce judah judas jukes julep jules julia julie julio jumps jumpy junks junky junta juris juror jussi justo kaaba kafir kafka kalam kamel kanga kanji kappa kapur karat karel karen karma karoo karst karts kashi katha kathy katie kayak kazoo keats kebab keels keeps keita keith kelly kemal kenai kendo kenny kenya kerns kerri kerry ketch kevan kevin keyed khadi khair khaki khans khmer kicks kiddo kiddy kiley kills kilns kilos kilts kinds kings kinks kinky kiosk kiowa kirby kisan kissy kites kiwis klaus kling knack knave knead kneed kneel knees knell knelt knick knits knobs knoll knorr knots knows koala kodak kohls kondo kongo kooks kooky koran korea kraft kraut krebs krill kriss krona krone kudos kurta kutch kylie kyoto kyrie kyung laban labia laced laces lacey lacks laden ladle lager laine laird lairs laity laker lakes lakhs lally lamas lambs lamer lamia lamps lanai lance lande lands lanes laney lanky lanny lapel lapis lapse larch largo larks larry larva lasso lasts latex lathe latin laude lauds laura laure lavas laver lawns layed layne layup lazar leach leads leafs leafy leaks leaky leans leant leaps leapt leary leash leben leche leech leeds leeks leery lefts lefty leger legge leggy legit leigh leila leith leman lemma lemur lends lenin lenny lense leone leper leste letty leung levee leven levin levis lewis lexis liana liane liang liars libby libel liber libra libre libri libya licht licks lidar lidia liege liens lieut lifer lifts liger ligne liked liken likes lilac lilly liman limbo limbs limes limos limps linda lindo lindy linea lined lines lingo links linky linus lions lipid lippy lisle lists liszt liter lites lithe litre lived liven lives livid livre llama llano lloyd loach loads loamy loans loath lobed lobes lobos lochs locks locos locum locus loess lofts lofty logan logie login logos lohan loins lolly loner longs looks looky looms loons loony loops loopy lopes loran lords lordy loren loris lorry loser loses lossy lotta lotte lotto lotus lough louie louis louse lousy lovat loved loves lovey lowes lowly lowry lucan lucia lucid luger luigi lukas lulls lumen lumps lumpy lunge lungs lupin lupus lurch lured lures lurid lurks lusts lusty lydia lying lymph lynch lynne lysis lysol mabel macan macao macaw machi macho macon madge madly madre mafia mafic mages magma magna magog magus mahal mahdi maida maids mails maine mains maint maire maize makes malam malay males malik malls malta malts malus mamas mamba mambo mamie mamma mammy manas mandi manes manet manga mange mania manic manis manly manna manny manos manse manta manus maori marci marco mardi marek mares marga marge maria marie mario maris marko marks marla marly marts marty marys masai masha masks mason massa masse massy masts mated mater mates matey maths matin matsu matta matte matti matty matzo mauve maven mavis maxim maxis mayan mayer mazda mazel mazes mazur mccoy mckay meads meals mealy means meany meath meats meaty mecca medea media medio meech meeks meese meets meiji melba melds melee meles melia melon melts memos mende mendy mensa menus meows merch merci merle mesas messe meted metis metra metre meuse mezzo miami micah micky midas midge mikes mikey milan milch miler miles milks milla mille mills milly milos mimes minas mince minds mined mines mingo minis minny minos minot mints minty mired mirth mirza miser mises missa missy mists mitch miter mites mitra mitre mitts mitty mixed mixes mixup moans moats mobil mocha mocks modal modem modes modoc modus mogul moira moise molar molds moldy moles molle molly molto momma mommy monad monde mondo mongo monks monte monty mooch moods moody moons moore moors moped moran moray morel mores morin morne moron morph morro morse moses mosey mossy mosul motes moths motif motte mould moult mourn moved mover moves mowed mower moxie mucky mucus mudra muffs mufti muggy mulch mules mulla mulls multi mumbo mummy mumps munch mungo murat murky murph murry mused muses mushy musky musty mutch muted mutes mutts mylar myron myrrh myths nacho nadir nagel nahum nails naira naive naked named names nance nancy nanda nandi naomi naoto nappa nappy narco nasal nasty natal natch natty navel nawab nazim nazir nazis nears neath necks necro needs needy negro negus nehru neigh nelly nepal nerds nerdy nervy nests neves newts nexus niall nicht nicks nicky nicol niece niels nifty nigel nihil nikko nikon nines niobe nippy nitro nitty nixed nixon nizam nobby nobel nobis nobly nodal noddy nodes noire nomad nomen nonce nooks noose norah norma norms norse norsk nosed noses nosey noted notes notre nouns novus nubia nudes nudge nudie nukes nutty nymph nyssa oases oaths obese obeys ochre octet oddly odell odeon odors odour offal ogres oiled oiler olden older oldie oleic oliva ollie olson omaha omani ombre omens omits oomph oozed oozes opals opens ophir opine opium opted orang orcas oriel orion oromo orson ortho osage osaka oscar oskar ostia ouija outdo outed ovals ovary ovate ovens overs overt ovoid owing owned oxbow ozark pablo paced pacer paces pacha packs pacts paddy padre paean pagan paged pager pages pails paine pains pairs paisa paise palau paled paler pales pally palma palms palsy pampa panes pangs panic panna panos pansy panto pants panty paola paolo papal papas pappy papua param paras pardo pared pares paris parka parks parle parma parra parse parsi parte parti parts paseo pasha passe pasts pasty patel pater paths patsy patty paula paved paves pavia pawns payed payee payer peaks peaky pears peart pease peasy peaty peavy pecan pecks pecos pedro peeks peele peels peeps peers peeve peggy pekin pelts penal pence penis penna penta peons peony peppy pepsi perch percy peres peril perks perky perla perle perry perse pesky pesos pests petal peter petit petre petri petro petty phage pharm phill phlox phono phony picea picks picky picot piers piety piezo piggy pikes pilaf pilar piled piles pills pimps pinal pines piney pings pinks pinky pinot pinto pints pinup pinus piotr pious piped piper pipes pique pisco piste pithy pitta pixie plaid plait plans plato plats platt playa plays plead pleas pleat plebs plied plies pliny plonk plots plows ploys pluck plugs plumb plume plump plums plush pluto poach pocus podge poems poets poise poked pokes pokey poles polio polis polit polka polls polly polos polyp ponca ponce ponds pongo pooch pools poops popes poppa pored pores porgy porky porno porta porte porto ports posed poser poses posey posit posse posts potty potus pours pouty prado prana pratt prawn prays preen preps preys priam prick pricy pried prima primo prion prise prius privy prods profs promo proms prong props prose prost proto prowl proxy prude prune psalm psych pubes pubic pubis pucks pudge pudgy puffs puffy puget puked pukes pulis pulls pulpy pumas pumps punic punks punky punta punto punts pupae pupal purdy puree purer purge purim purrs pushy pussy putts putty pygmy pylon pyrex qatar quack quads quail quant quark quart quash quasi quays queer quell quill quilt quint quips quire quirk quito quits quota rabat rabbi rabid rabin raced races racks radek radii radix radon rafts raged rager rages raghu rahul raids rails rains rajab rajah rajiv raked rakes ralph raman rambo ramon ramps rance randy ranks rants raped raper rapes rarer raspy ratan rated rater rates ratty raved ravel raver raves rayed rayon razed razer reads reals reams reaps rears rebar rebbe rebel rebus rebut recap recce recon recto recur reddy redid redox redux reeds reedy reefs reeks reels reese reeve refit regal regia reich reina reins remit remix remus renal rents repel repro rerun rests retry reuse revel revie revue rhein rhine rhino rhoda riche ricin ricks ricky rides riffs rifle rifts rigid rigor riled riles riley rimes rinds rings rinks riots ripen riser rises rishi risks risky rites ritzy riven rives rivet roach roads roams roars robed robes roche rocks rogan roger rogue rohan roker roles rolfe rollo rolls roman romeo ronde rondo ronin roofs rooks rooms roomy roose roost roots roped roper ropes roque roses roshi rosin rotor rouen rouge rouse rover rowan rowdy rowed rower roxie rubes rubin ruble ruddy rufus ruins ruled rules rumba rumen rummy rumor runes rungs runic runny rupee russe ryder saban saber sabin sable sabra sabre sacks sacra sacre sadhu sadie sadly safes sagan sagas sager sages saggy sahib sails saith sakai sakes salar salat salem sales salix salle sally salma salts salud salva salve salvo samaj samba sambo samir sammy samoa sands saner sangh santa santo sappy sarah saran saree sarge sarin saris sasse sassy satan sated satyr saucy saudi sault sauna saute saved saver saves savin savor savoy sawed saxon sayer sayid scabs scala scald scalp scaly scamp scams scans scant scape scare scarp scars scary scion scoff scold scone scoot scorn scots scott scour scowl scram scree screw scrim scrip scrum scuba scuff scull seals sealy seams sears seats sebum sects seder sedge seeds seedy seeks seely seems seeps seers segue seine seize selah sella sells selva semen semis sence sends senna senor sensu senza seoul sepia septa serfs serge serif serio serra serum servo setae seton setup sever sewed sewer sexed sexes shack shady shahi shaka shaky shale shalt shame shams shane shang shank shard shari shaul shave shawl shawn sheaf shear sheds sheen sheik sheng sheva shied shill shins ships shire shirk shits shiva shoal shock shoes shoji shona shone shook shoop shoot shops shorn shots shove shows showy shred shree shrew shrub shrug shuck shuns shunt shure shush shute shuts shyam shyly sibyl sided sider sides siege siena sieur sieve sighs sigil sigma signs sikes sikhs silas silks silky sills silos silva simba simon sinew singe singh sings sinks sinus sioux sippy sired sires sisal sissy sitar sited sites sitka sivan sixes sized sizes skeet skein skews skids skied skier skies skiff skimp skins skint skips skits skunk slabs slade slags slain slams slang slant slaps slash slats slave slavs slays sleds sleek sleet slick slime slims slimy sling slink slips slits sloan slobs sloop sloth slots slows slugs slump slums slung slurp slurs slush sluts slyly smack smash smear smelt smirk smite smith smock smoke smoky smoot smote smuts smyth snafu snags snape snaps snare snark snarl snead sneak sneer snell snide sniff snipe snips snobs snook snoop snore snort snout snows snubs snuck snuff soaks soaps soapy soars sober socks sodas sodom sofas sofia softy soggy soils soled soler soles solon solos solus sonar songs sonja sonny sooth sooty soppy sorel sores sorts souls soups soupy sours sowed sower spade spain spake spall spank spans spars spasm spate spats spawn spear speck specs spect speed speer spelt sperm spews spica spied spiel spies spiky spill spilt spina spink spins spiny spire spiro spite spits spitz splat spock spoil spoof spook spool spore spots spout spree sprig spuds spunk spurn spurs spurt squaw squib stabs stacy stade stags staid stain stair stale stall stang stank staph starr stars stash stats stave stays stead steal steed steen stein stele stems stent steps steve stews stile stilt stine sting stink stint stipe stirs stoic stole stoma stomp stony stoop stops stork stott stour stray strep strix strom strop strum strut stubs stuck studs stump stung stunk stuns stupa sturt suave sucks sucre sudan suede suing suits sulky sulla sully sumac summa sunil sunni suomi suppl supra surah surat surer surfs surly surya susan susie sutra sutta suzan swabs swain swale swami swamy swank swans swaps swart swash swath swati sways swear sweat swede swept swill swims swine swire swirl swish swiss swizz swoon swoop swore sworn swung sybil sykes synch syncs synod syria tabby taber tabla taboo tabor tacit tacks tacky tacos taels taffy taiga tails taint tajik takao taker takes takin tales talks tally talon taluk talus tamas tambo tamed tamer tamil tammy tampa tandy tanga tangy tania tanka tanks tanna tansy tanto tanya tapas taped taper tapes tapia tapir tarde tardy tarot tarps tarry tarte tarts tasks tatar tater tatty taunt taupe tauri tawny taxed taxes taxis taxon teams tears teary teats techy teens teeny telex tells telly telos tempe temps tempt tench tends tenet tengu tenon tents tepid terms terns terra terre terri terry terse tesla testa tests testy teton tetra texan texas texts thais thana thane thats thaws theft thein their there these theta theyd thief thigh thine thins thong thorp those throb thugs thule thump thyme tiara tiber tibet tibia ticks tidal tides tiers tigre tikka tilak tilda tilde tiled tiles tills tilly tilts timed times timid timon timor tinea tines tinge tings tinny tints tippy tipsy tired tires tithe titty titus tizzy toads toddy toils tokyo tolls tomas tombs tomes tommy tonal toned toner tones tonga tongs tonka tonne tonto tools toons toots topaz topsy torah torii toros torso torts torus tosca totem totes tours touts tovar towed towie towns toxic toxin toyed tozer tracy tramp trams trans traps trash trawl trays trees treks trent tress triad trial trice tried trier tries trike trill trims trina trine trios tripe trips trite trois troll trope trots trove truce trudy truer trump truss tryst tsars tubal tubby tuber tubes tucks tudor tufts tulip tulle tulsa tulsi tumor tuned tuner tunes tunic tunis tuple turds turki turks turns turvy tusks tutti twain twang twats tweak tweed tween tweet twigs twill twine twink twins twirl twits tying tyler typed types typos tyres udder uhuru ulama ulcer ulnar ultra umber umbra uncut undid undue unify units unlit unmet unsee untie unwed unzip upend upped upset urged urges uriah uriel urine ursus users usher using usurp usury utero uther utter uzbek vadim vague vagus valet valor vamos vamps vance vanda vanes vapid vapor vardy varia varna varus vases vedic veena veers vegan vegas veils veins velar venal venom vents venus verbs verde verdi versa verso verve vespa vesta vests vetch veuve vexed vials vibes vicar vices vichy vicki vicky vidya views vigil vigor vijay ville vince vinci viner vines vinny vinod viper viral virgo virus visas visor vitae vitro vivek vives vivre vixen vocab vodka vogue voids voila voles volga volta volte volts vomit voted votes vouch vowed vowel vroom vulva vying wacky waded wades wafer waged wager wages wagga wahoo wails waits waive waken waker wakes wales walks walla walls wally walsh wands waned wanes wanna wants wards wares warms warns warps warts washy wasnt wasps watts waugh waved waver waves waxed waxes wayne wazir weald wears weave webby weber weeds weedy weeks weeps weepy weirs welch welds wells welly welsh welts wench wendi wendy weren wests whack wharf whats whelp which whiff whigs whims whine whiny whips whirl whisk whist whizz whoop whore whorl wicca wicks widen widow wield wierd wifes wigan wight wilco wilds wiles willi wills willy wilts wince winch winds wines wings winks wiped wiper wipes wired wires wishy wisps wispy witch wives woken wombs women wonky woods woody wooed woolf wooly woops woozy words wordy works worms worry worse worst would wound wowed wrack wraps wrath wreak wreck wrens wrest wring writs wrong wrung wryly wurst wynne xenia xenon xerox xviii xxiii xylem yahoo yanks yards yarns yawns yazoo yearn years yells yemen yerba yikes yodel yogic yogis yoked yolks youre yours youse youve yucca yucky yukon zaire zakat zaman zeiss zeros zesty zetas zilch zilla zippy zonal zoned zones zooms zorro zulus',6:'abbott abject ablaze abound abrupt absurd abused abuser abuses acacia accrue accuse aching acidic actors acumen adapts addict adhere admits adonis adopts adored adores adrian adrift adults advent advert aegean affirm afghan afield afloat afraid africa agatha ageing agents agreed agrees aiding ailing airbag airbus airing airman airmen airway aisles alamos alarms alaska albany albeit albert albino albion albums aleppo alerts alexis alfred alicia aliens alight aligns alison alkali allege allele alleys allied allies allows alloys allure almond alonso alonzo alpine altars alters always amanda amazed amazes amazon ambush amelia amends amidst amigos amtrak amulet amused analog andean anders andhra andrea andrew anemia angela angelo angels angers angled angles angola ankara ankles annals annoys antics antony anyhow aortic apache apathy apical apiece apollo apples approx arabia arabic arable arcade arcane arched arches archie ardent arenas argued argues argyle argyll ariana arisen arises arlene armada armies arming armory armour armpit arnold arouse arrays arrest arrows arroyo artery artful arthur ascend ascent ashore ashraf ashram asians aspire assays assent assert assets assign asthma astral astray astrid astute aswell asylum athena athens atrial atrium attach attack attain attest attila attire aubrey auburn audits audrey august auntie aurora aussie austin autism avalon avatar avenge averse avoids awaits awaken awards axioms azalea aztecs babies backed backer badass badger badges bagels bagged bailed bailey bakers bakery balboa balkan ballad baller ballon baltic bamboo banded bandit banged banger banish banked banker banned banter barbed barbra barges baring barker barley barlow barney barons barred barren barrio barrow barter barton basalt bashed basics basing basins basque bathed batman batted batter battle baxter bazaar beacon beaded beagle beamed beanie beards bearer beasts beaten beater beaver becker beetle beggar begged begins behest behold beings beirut bender bengal benign bennet benson benton berger bering berlin bernie bertha bertie bessie bestow bethel betray beware bhutan bianca biased biases bibles biceps bidder biggie bigots bikers biking bikini billed billie binder bionic biopic biopsy birdie births bistro bitchy biting bitten bitter blacks blades blaine blamed blames blanca blanco blanks blasts blazed blazer bleach bleeds blends blight blinds blocks blokes bloods bloody blooms blouse blower bluffs bluish blurry boards boasts bodied bodies bodily boeing bogart bogged bogota boiled boiler bolder boldly bolted bombay bombed bomber bonded bonnet bonnie boogie booing booked booker boomer boosts booted booths boring borneo bosses boston botany bother bouncy bounds bounty bourne bovine bowden bowels bowers bowing bowled bowler bowles bowman bowser boxers braced braces brahma brahms braids brains brakes brandi brands brandy brasil braver braves brazen brazil breads breaks breast breech breeds breezy brenda breton brewed brewer bribed bribes bricks bridal brides briefs briggs brings brodie broken bronco brooch brooke brooks browns browse bruins bruise brunch brutal brutus bubbly buckle buddha buenos buffer buffet bugged bugger builds bullet bumble bummed bummer bumped bumper bunker burden burial buried burley burned burner burrow bursts burton bushes busier busted buster bustle butler buyers buyout buzzed buzzer bylaws bypass cabins cables caches cactus cadets caesar cahill cairns calais calico caliph called caller callum calmed calmer calmly calves calvin camden camels cameos camino camped camper campos canaan canada canals canary cancer candid canine canned cannot canoes canons canopy canton cantor canvas capita capone capped carers caress carlin carlos carmel carmen carnal carney carole carols carrie carrot carson cartel carter carton carved carver cashed casing casino casket caspar casper cassie caster castes castor castro catchy caters caucus causal caused causes caveat cavern caviar cavity cayman ceased ceases cedric celebs celery celiac cellar celtic censor centre centro cereal cervix cesare cetera ceylon chains chairs chakra chalet champs chants charms charts chased chaser chases chatty cheats checks cheeks cheeky cheers cheery cheesy cheney cheque chests cheung chewed chicks chiefs chilli chills chilly chimes chimps chisel choirs choked chokes chopin choppy choral chords chores christ chubby chunks chunky cicero cigars cinder cipher cirque cities citing citrus civics claims claire clamps clarke classy claude clawed cleans clears cleats cleave clergy cleric clerks cliche clicks cliffs climax climbs clinch clings clingy clique clocks cloned clones closed closes cloths clouds cloudy clough clover cloves clowns clumps clumsy coarse coasts coated cobalt cocked cocoon coerce coffin cognac cohort coiled coined colder collab collie collin colors colour combat combed combos cometh comets comics commas commie compel concur condom condor condos confer conner connie conrad consul contra convex convoy cooked cooker cooled cooley cooper copied copies coping copped coptic corals cordon cornea corona corpse corpus corral correa corset cortex cortez cosmic cosmos cougar coughs counts courts covent covers covert coward coyote cracks cradle crafts crafty cramps cranes cranky crappy crater crates craved craven craves crawls crayon crazed creams creamy crease creeks creeps creepy creole crimea crimes cringe crises crisis crisps crispy crooks crores crosby crosse crotch crouch crowds crowns crumbs crunch crusty crutch crying crypto cubans cuckoo cuddle cuddly culled cullen culver curate curfew curing curled curran currie cursed curses cursor curtis curved curves cutest cutler cutoff cutout cutter cyborg cycled cycles cyclic cyprus cystic czechs dagger dahlia dainty dakota dallas dalton damage dammit damned damnit damper damsel danced dances danger dangle daniel danish danube daphne dapper daring darius darken darkly darren darryl darwin dashed dashes dating davies dawned dawson dayton dazzle deacon deadly dearly dearth deaths debbie debris debtor debuts decals deceit decked decker decode deduce deduct deemed deepen defeat defect defied defies deftly defuse delays deluge deluxe demise demons dengue denial denied denies dennis denote denser denver depart depict deploy deport depots depths derail derive desist detach detain detest detour devils devise devoid devote devour devout dewitt dexter dharma diablo dialed dialog diaper dickey dickie dieter digest digger digits dilute diners diodes dipped disarm dishes dismal dismay disney dispel distal divers divert divest doable dobson docile docked docker docket dodged dodger doesnt dogged doggie domino donald donkey donnie donors donuts doodle dooley doomed doping dorado dorian dorsal dosage dosing dotted doubly doubts douche downed downer dozens drafts drains dramas draped draper drapes drawer dreams dreamt dreamy dreary dredge drifts drills drinks drives drones droves drunks drying dubbed dublin ducked dudley dugout duluth dumber dumped duncan dundee dunlop duplex durant durban duress durham dusted dustin duties dwarfs dwayne dwells dwight dyeing dynamo eagles earned earner earths earthy easing easter eaters echoed echoes eczema edging edible edison edited edmond edmund edward eerily eiffel eighty eileen elaine elated elbows elders eldest elects elicit elijah elisha elites elixir elliot eluded embark embers emblem embody embryo emilia emmett enamel encode encore enigma enjoys enlist enmity enrich enroll ensign ensued ensues entail enters entice envoys equals equate equine erased eraser ernest eroded erotic errand errant errors erupts escrow eskimo essays esters esther etched ethics ethnic euclid eugene eulogy eunice eureka europa europe evaded evelyn evenly events evoked evokes exceed excels excess excise excite excuse exempt exhale exiled exiles exists exited exodus expend expire expiry extant extras eyeing eyelid fabian fabled fables facade facets fading faggot failed fairer faiths faking falcon fallen famine fandom farley farmed farrow fascia fasten fathom fatima fatter faucet faults faulty favors favour feared feasts fedora feeble feeder feisty feline fellas felled felons felony female fenced fences fender fennel fergus ferrer ferret ferris fervor fetish feudal fewest fiance fiasco fibers fibres fickle fiddle fields fiesta fifths figaro fights fijian filled filler fillet filmed filthy finals finder finely finite firing firmer firsts fished fishes fitted fitter flakes flames flange flanks flared flares flashy flatly flaunt flawed fleece fleets fleshy fleury flicks fliers flimsy flinch flirty floats flocks floods floors floppy floral flores flowed fluent fluffy fluids flurry flyers fodder foiled folded folder folsom fondly fooled footed footer forage forbid forced forces forged forked formed forums fought fouled fowler framed frames france franco francs franks fraser frauds frazer freaks freaky freddy french frenzy fresco fresno friars friday fright frigid frills frisco fronts frosty frugal fruits fruity frying fucked fucker fueled fulfil fulham fuller fumble fuming funded fungal fungus funnel fusing futile gables gadget gaelic gagged gained galley gallon gallop gallup galore gambia gambit gander gandhi ganges gaping gareth garner garnet garret garter garvey gasket gasped gassed gatsby gauges gawker gazing geared geezer geiger gemini gender genera geneva genome genres gentry george gerald gerard german ghetto ghosts giants gibson gideon gifted giggle gilded gilles gladly gladys glands glazed glider glitch globes gloomy gloria glossy glover gloves gluten glycol goalie goblet goblin godwin goethe goings goldie golfer gopher gordon gorman gospel gossip gotham gothic govern graced graces graded grader grades graeme graham grains grammy grange granny grants grapes graphs grassy grated gratis gravel graves grazed grease greasy greats greece greedy greeks greens greets gregor grieve grille grills grimes grinch grinds gritty groans grocer groove groovy grotto groups grouse grover groves grower grudge grumpy grunts guards guelph guests guiana guided guides guilds guilty guinea gunman gunmen gunnar gunned gunner gurney gutted gutter guyana gypsum habeas habits hacked hacker hadith hailed haired hakeem halted halved halves hamlet hamper handed handel hander hangar hanged hanger harass harden harlem harman harmed harmon harold harper harris harrow harvey hassle hasten haters hating hatred hattie hauled haunts havana havens havent having hawaii hazard hazing headed healed healer heaped hearst hearth hearts hearty heated heater hebrew hectic hector hedges heeled helena helium heller helped helper herbal hereby herein heresy herman hermes hermit hernia heroes heroin herpes hester heyday hiatus hiccup hickey hijack hikers hilary hinder hindus hinged hinges hinted hippie hitler hitter hobbit holden holmes homage homely homers homing honors honour hooded hoodie hooked hooker hookup hooper hooray hoover hooves hopped hopper horace hordes horned horner hornet horrid horror horses hosted hostel hotels hotter hottie hounds hourly housed houses howard hubble hubert hubris huddle hudson hugely hugged hughes humane humans humbly hummus humour hunger hunted hurdle hurled hurley hurrah hurray hushed hustle icarus ideals idiocy idiots ignite images imbued imogen impair impala impart impede impure inbred incase incest inches incite indeed indian indict indies indigo induce infamy infect inflow influx ingram inhale inject injure injury inline inmate innate inputs insane insect insult insure intern invade invent invoke inward iodine iraqis ironed irving isabel isaiah israel issued issuer issues ithaca jackal jacked jackie jacoby jaeger jagged jagger jaguar jailed jammed janice jargon jarvis jasper jeanne jekyll jennie jeremy jerked jerome jersey jessie jester jesuit jethro jewels jewish jigsaw jingle joanna joanne jockey johann johnny joined joints jokers jordan joseph joshua josiah joyful joyous judged judges judith juggle juices julian julien juliet julius jumped jumper junkie juries jurors justin kaiser kamala kansas karate keenly kelvin kennel kenyan kernel kettle kicked kicker kiddie kiddos kidnap kieran killed killer kimono kinase kinder kirsty kissed kisses kitten knives knocks konrad korean kosher kraken kuwait labels labour lacked lackey lactic ladies lagged lagoon laguna lahore lakers lambda lament lancer lancet landau landed lander lapsed lapses larvae larval lasers lashed lashes lasted lastly latent latham latino latvia lauded lauder laughs laurel laurie lavish lawful lawson lawton layers laying layman leaked leaned learns learnt leased leases leaves ledger leeway legged lemons lender lenses leonid lesion leslie lessen lester lethal levant levels levers levied levies liable libido libyan licked lifted ligand lights lilies lilith limits linden liners linger linked lionel lipids liquor lisbon listed lister litany liters litres litter livery lizard lizzie loaded loader loaned loathe loaves locale locals locked locket locust lodged lodges logged london lonely longed looked lookup looney looped loosen looser looted losers losing losses lotion louisa louise louvre lovers lowell lowers lucian lucius ludlow ludwig lumbar lumber lumped lunacy luring luster lustre luther lyndon lyrics macron macros madame madden madman madras madrid maduro maggie magnet magnum magnus magpie mailed mailer maison majors makers malaga malawi malaya malice mallet malloy mammal manger maniac manila manned mantel mantis mantle mantra manuel manure maoist mapped marcel marcia marcos margot marian marion marked markup markus marlin maroon marred marrow marsha martha martin martyn martyr marvin mascot mashed masjid masked masons masses mather mating matron maxima mayday mayhem mayors meadow meager meagre medals meddle medial medici medics medina medley medusa mellon mellow melons melted melton memoir menace mental mercer merged merges merino merits merlin merton messed messes messrs metals meteor meters methyl metres mexico michel mickey micron midday midget midway miguel mikael milder mildew mildly milieu milled miller millet millie milner milton mimics minced minded miners mingle mining minion minnie minors minted mirage miriam misery mishap misled missed misses mister misuse mixers mocked models mohawk molded molten monaco monday mongol monica monies monroe months moored morale morals morbid morgan morgue mormon morons morris morrow mortal mortar mortem morton mosaic moscow mosque motels motifs motley motors mounds mounts mousse mouths movers movies mowing mozart muffin mugged mulder mullen muller mullet mumble munich murals murder muriel murmur murphy murray muscat musket muslim muster mutant mutiny mutton muzzle myriad myrtle mysore mystic mythic nailed napier napkin naples nassau nathan naught nausea navajo nazism nearer neatly nebula necked nectar needed negate nellie nelson nepali nerves nested nestle nestor nether netted neural neuron neuter nevada newark newton nguyen nibble nicest niches nieces nigger nights nimble ninety nipple nippon nitric nobles nodded noises nomads noodle nordic norman norway notary notify novels novice nozzle nuance nuclei nudity nugget nursed nurses nutmeg obeyed oblige oblong obsess obtuse occult occurs oceans octane octave ocular oculus odessa offend offers oilers oldies oliver olives olivia onions onward oozing opaque opened operas opiate oppose optics opting oracle orally orator orbits orchid ordeal orders oregon organs orgasm orient ornate orphan orwell oscars osiris osprey oswald oswego others ottawa otters ounces ousted outage outcry outing outlaw outrun outset owners oxford oxides oyster pacers pacing packed packer packet padded paddle padres pagans paging pagoda pained paints paired palais palate pallet palmer paltry pamela panama pandas panels panned pantry panzer papacy papaya papers parcel parity parked parker parlor parody parole parrot parted parton pascal passed passer passes pasted pastel pastry patchy patron patten paulie paused pauses paving payday payers payoff payout peachy peaked pearce pearls pearly pebble pedals peeing peeled pegged peking pellet pelvic pelvis penang penned peoria perils perish persia petals peters petite petrie petrol peyton phased phases philip phobia phoebe phoned phones photon photos pianos piazza picard picked picker picket pickle pieces pierre pigeon pilate piling pillar pilots pinkie pinned piping piracy pisces pissed pisses pistol piston pitted pixels pizzas placed placer places placid plague plains planar planes planks plants plaque plated plates played pleads pliers plight plough plowed plumes plunge plural podium poetic pointe points pointy poised poison poking poland police polity polled pollen pomona pompey ponder ponies poodle pooled pooped poorer poorly poplar popped popper porous ported portia posing possum posted potent potion potted pounce pounds poured powers prague pranks prawns praxis prayed preach prefix preset presto priced prices pricey pricks prides primal primed primer primes prints priory prison prized prizes probed probes pronto proofs propel proton proved proves prying psalms pseudo psyche psycho puddle pueblo puerto puffed puking pulled pulley pulpit pulses pumped pundit punish punter pupils purest purged purify purity purses pushed pusher pushes putter python quaint quaker qualms quarry quartz quebec queens quench quests queues quince quincy quinoa quirks quirky quorum quotas quoted quotes rabbis rabble rabies racers rachel racial racism racist racked racket radars radial radios rafael raffle ragged raging raided raider rained raised raiser raises raisin raking ramble rammed ramona ramsey rancho randle ranged ranges ranked ransom rapids raping rapist rapper raptor rarest rarity rascal ratify ration ratios rattle ravens ravine raving razors reacts reagan realms realty reaper reared rebate rebels reboot reborn rebuke recast recess recite reckon recoil recoup rectal rector rectum redeem redone reebok reeves refers refill refine reflex reflux refuse refute regain regent reggae reggie regime regina regret reigns reiner reject rejoin relays relics relied relies relish relive reload remade remand remark rename render renown rented reopen repaid repeal repent repost reread reruns resale resell resent reside resins rested retake retard retina retort reuben reused revamp reverb revere revert revise revive revoke revolt rewind rework rhinos rhodes rhonda rhymes ribbed richer riches richly ridden riddle riders ridges ridley rifles rigged rights ringed ringer ripped ripper ripple risked ritter rivals rivers roamed roared robbed robber robert robins robots rocked rocker rodent rodger rodman rodney rogers rogues roland rolled romain romano romans romero romney ronald rooted rosary roscoe rotary rotate rotors rotten rounds routed router routes rovers roving rowing rowley royale royals rubbed rubble rubles ruckus rudder rudely rudolf rugged ruined rulers rumble rumors rumour runoff rupees rupert rushed rushes ruskin russel russia rusted rustic sabine sabres sacked sacred sadder saddle safari safest sahara saigon sailed sailor sainte saints salaam salads salami saline saliva salons saloon salted salute samoan samson samuel sancho sandal sander sandra sanger sanity sanjay santos sarkar satire saturn saucer sauces saudis savage savers savior savory sawyer saxons saxony scalar scaled scales scarce scared scares scenes scenic scents schema schism scoops scopes scored scorer scores scotch scotia scotty scouts scrape scraps scream screws scribe scrubs seabed sealed seaman seamen seamus seared seated seater seduce seeded seeker seemed seized seizes seldom selena selina selves senate sender seneca senile sensed senses sentry sepsis septic septum serbia serena serene sergei sergio series sermon served serves sesame setter setups sevens severe sewage sewers sewing sexier sexism sexist sexton sexual shabby shaded shades shafts shaggy shahid shaken shaker shakes shalom shaman shamed shanks shaped shapes shards shared shares sharia sharif sharks sharon shasta shaved shaven shazam shears sheath sheets sheikh sheila shells shelly sherry shifts shiloh shines shirts shitty shiver shoals shocks shoddy shogun shoots shores shorts shorty shouts shoved shovel showed shrank shreds shrewd shrill shrine shrink shroud shrubs shrugs shrunk sicily sickle sickly siding sidney sienna sierra sighed sights signed silica silvia simeon simmer sinful sinned sinner siphon sirens sirius sitcom sitter sizing skater skates skewed skiers skills skinny skirts skulls slacks slalom slated slater slaves slavic slayer sleazy sledge sleeps sleepy sleigh sliced slices slider slides sliver slogan slopes sloppy slough slovak slowed sludge slurry slutty smacks smalls smarts smears smells smelly smiled smiles smiley smiths smoked smoker smokes smokey snacks snails snakes snappy snatch sneaks sneaky sneeze sniper snitch snooze snowed soaked soared socket sodomy soften softer softly soiled solace solder soleil solemn solids solved solves somali somber somers sonata sonnet soothe sophia sordid sorely sorrow sorted sounds soviet sowing spaced spaces spades spared spares sparks sparky sparse sparta spasms speaks spears speeds speedy spells spence spends sphinx spiced spicer spices spiked spikes spills spinal spines spleen splice splits spoils spoilt sponge spooky spoons spores sports sporty spotty sprain sprang sprawl sprays sprite sprout spruce sprung spying squads squash squats squeak squire squirt stacey stacks staffs staged stages stains stairs staked stakes stalin stalks stalls stamps stands stanza staple starch stared stares starry starts starve stasis stated states stayed steaks steals steamy steele steers stefan stella stench stereo steven sticks stifle stigma stiles stills stings stingy stinks stinky stints stitch stocks stoked stokes stolen stoned stoner stones stools stored stores storey storms stormy stoves strait strand straps strata straws streep stress strewn stride strife strike stripe strips strive strode stroke stroll stroud strung struts stuart stucco stuffs stuffy stumps stunts stupid sturdy styled styles stylus subbed subdue subset subtly sucked sucker suffer suffix sugars sugary suisse suited suites suitor sulfur sultan sultry summed summon sumner sunday sunken supper supple surfer surged surges surrey sussex sutter suture suzuki swamps swarms swayed swears sweats sweaty sweden swedes sweeps sweets swells swerve swings swiped swivel swords sydney sylvia synced syntax syrian tabled tables tacked tacoma tactic tagged tahiti tailed tailor taipei taiwan takers talbot talked talker taller talmud tamara taming tamper tampon tanaka tandem tangle tanker tanned tanner taping tapped tariff tarmac tartan tartar tarzan tasked tasted tastes tattoo taunts taurus tavern taxing taylor teague teamed teapot teased teaser teller tellin telugu tenant tended tendon tenets tensor tenths teresa termed terror tested tester tether texans thames thanks thefts theirs themed themes thence theres thermo theses theyre thighs things thingy thinks thinly thirds thirst thomas thorax thorns thorny thorpe thrash threat threes thrice thrift thrill thrive throws thumbs thwart ticked ticker tickle tiered tigers tights tiling tiller tilted timers tinder tinged tingle tinker tinted tipped tirade tiring titans titled titles tobias todays toffee toggle toilet tokens toledo tonnes topeka topics topped topper topple tories torque tossed tosses totals touchy toured touted towels towers towing toxins toying toyota traced tracer traces tracey tracks tracts traded trader trades tragic trails trains traits trance trashy trauma travis treads treats treble tremor trench trends trendy trevor triage trials tribes tricia tricks trifle tripod trisha triton trivia trixie trojan trolls troops tropes trough troupe trucks truest truman trumps trunks trusts trusty truths trying tryout tubing tucked tucker tucson tulips tumble tumors tumour tundra tuning turban turing turned turner turret tuscan tutors tuxedo tweaks tweets twists twitch tycoon tyrant tyrone uganda uglier ulcers ulster umpire unable unborn uncles undead undies undone unduly uneasy unesco uneven unfair unfold unholy unicef unions unisex unison united unites unjust unkind unload unpack unpaid unplug unreal unrest unruly unsafe unseen unsold unsung unsure untill untold untrue unused unveil unwell unwind unwise upbeat upheld uphill uphold upkeep upland uplift upping uproar upsets uptake uptown upward uranus urbana urging ursula usable uterus utmost utopia vacate vagina valium valour valued values valves vanish vanity vapour varied varies vassal vastly vaughn vaults vegans veiled velcro velvet veneer venice venous vented venues vermin vernon verona versed verses vertex vested vetoed vetted victim victor videos vienna viewed viewer vigour viking villas violin virgil virgin vishnu visits vistas vivian vocals voiced voices volley voodoo vortex voters vowels vulcan vulgar wading waffle waging wagner wagons waited waiter waived waiver walked walkie walled waller walnut walrus walter wander waning wanker wanted wanton warden warmed warmer warmly warned warner warped warren warsaw washed washer washes wasted wastes waters watery watson waving waxing weaken weakly weapon wearer weasel weaver weaves webber wedded wedged wedges weighs weiner weirdo welded welder weller werent werner wesley wetter whales wheels whence whilst whisky whiter whites whitey whoops whores wicked wicker wicket widest widget widows wiener wiggle wilbur wilder wildly willed willie willow wilson wilton winded winery winged winger winnie winona wiping wiring wisely wisest wished wishes wither witted wobble wobbly wolves wooded woolly worded worked worlds worsen wounds wraith wreath wrecks wrench wright wrists writes wrongs yachts yahweh yanked yankee yelled yemeni yields yogurt yonder yorker yoruba youths yvonne zambia zenith zephyr zipper zodiac zombie zoning zurich'};
/* score a guess: 2 = right spot, 1 = in word elsewhere, 0 = not in word (repeated letters counted correctly) */
const WG_score=(g,a)=>{
  const r=Array(g.length).fill(0),left={};
  for(let i=0;i<g.length;i++){if(g[i]===a[i])r[i]=2;else left[a[i]]=(left[a[i]]||0)+1}
  for(let i=0;i<g.length;i++)if(r[i]!==2&&left[g[i]]>0){r[i]=1;left[g[i]]--}
  return r;
};
const WG_sets={};
function wordguess(root,S){
  const N=S.level+3,TRIES=6;
  if(!WG_sets[N]){const a=WG_ANS[N].split(' ');WG_sets[N]={ans:a,ok:new Set(a.concat(WG_OK[N].split(' ')))}}
  const {ans,ok}=WG_sets[N];
  const st=status(root,`Guess the ${N}-letter word in ${TRIES} tries. Green: right spot. Yellow: in the word. Grey: not in it.`);
  const statKey='wg:'+N,stats=Object.assign({played:0,won:0,streak:0,top:0},store.get(statKey)||{});
  const recentKey='wg:recent:'+N,recent=store.get(recentKey)||[];
  let word;do word=ans[rand(ans.length)];while(recent.includes(word)&&recent.length<ans.length-1);
  store.set(recentKey,[word,...recent].slice(0,Math.min(80,ans.length>>1)));
  const g=el('div','wg-board',root);g.style.setProperty('--n',N);g.dataset.ar=(N/TRIES).toFixed(3);g.dataset.max=N*64;
  const rows=[...Array(TRIES)].map((_,r)=>{const row=el('div','wg-row',g);return{el:row,t:[...Array(N)].map((_,i)=>{const t=el('div','wg-t',row);t.style.animationDelay=(r*N+i)*18+'ms';return t})}});
  const bar=el('div','row wg-bar',root,'<span class="wg-stats"></span><button class="btn wg-next">Next word ▶</button>');
  const statsEl=$('.wg-stats',bar),nextB=$('.wg-next',bar);
  const paintStats=()=>{statsEl.innerHTML=`<span title="Current streak">🔥 <b>${stats.streak}</b> streak</span><span title="Games won">🏆 <b>${stats.won}</b> won</span>`};paintStats();
  S.on(nextB,'click',()=>S.restart());
  const kb=el('div','wg-kb',root),keys={},kstate={};
  ['qwertyuiop','asdfghjkl','>zxcvbnm<'].forEach(line=>{
    const r=el('div','wg-kr',kb);
    for(const ch of line){
      const b=el('button','wg-k'+(ch==='>'||ch==='<'?' wg-wide':''),r,ch==='>'?'Enter':ch==='<'?'⌫':ch);
      b.setAttribute('aria-label',ch==='>'?'Enter':ch==='<'?'Delete':ch.toUpperCase());
      S.on(b,'click',()=>press(ch==='>'?'Enter':ch==='<'?'Backspace':ch));if(ch>='a'&&ch<='z')keys[ch]=b;
    }
  });
  let row=0,cur='',over=false,busy=false;
  S.on(window,'keydown',e=>{
    if(e.metaKey||e.ctrlKey||e.altKey||(e.target.closest&&e.target.closest('input,textarea')))return;
    const inf=document.querySelector('.info');if(inf&&!inf.hidden)return;
    if(e.key==='Enter'||e.key==='Backspace'){e.preventDefault();press(e.key)}
    else if(/^[a-zA-Z]$/.test(e.key))press(e.key.toLowerCase());
  });
  function paintRow(){rows[row].t.forEach((t,i)=>{const c=cur[i]||'';if(t.textContent!==c){t.textContent=c;t.classList.toggle('full',!!c);if(c)restartAnim(t,'pop')}})}
  function press(k){
    if(k==='Enter'&&over){S.restart();return}
    if(over||busy)return;
    if(k==='Backspace'){if(cur){cur=cur.slice(0,-1);paintRow();beep(300,40)}return}
    if(k==='Enter'){submit();return}
    if(cur.length<N){cur+=k;paintRow();beep(420+cur.length*30,40)}
  }
  function nope(msg){restartAnim(rows[row].el,'wg-shake');st('');st(msg);beep(160,160,'sawtooth')}
  function submit(){
    if(cur.length<N){nope('Not enough letters');return}
    if(!ok.has(cur)){nope('Not in word list');return}
    const guess=cur,sc=WG_score(guess,word),R=rows[row];busy=true;cur='';
    R.t.forEach((t,i)=>{
      S.after(i*260,()=>{t.classList.remove('pop');restartAnim(t,'flip');beep([220,330,520][sc[i]]+i*20,90)});
      S.after(i*260+170,()=>{t.dataset.s=sc[i]});
    });
    S.after(N*260+200,()=>{
      guess.split('').forEach((ch,i)=>{if((kstate[ch]??-1)<sc[i]){kstate[ch]=sc[i];keys[ch].dataset.s=sc[i]}});
      busy=false;row++;
      if(sc.every(v=>v===2))finish(true,R);
      else if(row>=TRIES)finish(false);
      else if(row===TRIES-1)st('Last try!');
    });
  }
  function finish(win,R){
    over=true;stats.played++;
    const W=word.toUpperCase();
    if(win){
      stats.won++;stats.streak++;stats.top=Math.max(stats.top,stats.streak);
      R.t.forEach((t,i)=>{t.style.animationDelay=i*90+'ms';restartAnim(t,'wg-hop')});
      st(`${['Genius!','Brilliant!','Great!','Nice!','Good job!','Phew!'][row-1]} The word was ${W}.`);
      S.after(N*90+300,S.next);
    }else{
      stats.streak=0;S.shake();beep(150,300,'sawtooth');
      st(`Out of tries. The word was ${W}.`);S.fx.banner(W,'The word was…');
    }
    store.set(statKey,stats);paintStats();nextB.classList.add('on');S.after(30,()=>nextB.focus({preventScroll:true}));
  }
}

/* ---------- Color Clash (shared engine for Color Clash + Color Clash Flip) ---------- */
const CLASH_COL={l:['r','y','g','b'],d:['p','t','o','v']};
const CLASH_HEX={r:'#E5343C',y:'#F5BF19',g:'#2BA84A',b:'#1E6FDE',p:'#FF4FA8',t:'#12B8AD',o:'#FF8A1F',v:'#8D52FF'};
const CLASH_CNAME={r:'Red',y:'Yellow',g:'Green',b:'Blue',p:'Pink',t:'Teal',o:'Orange',v:'Purple'};
const CLASH_DRAWN={D1:1,D2:2,D5:5,W2:2,W4:4};
const CLASH_VORD=['0','1','2','3','4','5','6','7','8','9','D1','D2','D5','S','SE','R','F','W','W2','W4','WC'];
const CLASH_other=s=>s==='l'?'d':'l';
function CLASH_deck(flip,R){
  const sh=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
  const side=(cols,zero,acts,wilds)=>{const f=[];for(const c of cols){if(zero)f.push({c,v:'0'});for(let k=0;k<2;k++){for(let n=1;n<=9;n++)f.push({c,v:''+n});for(const a of acts)f.push({c,v:a})}}for(const w of wilds)for(let k=0;k<4;k++)f.push({c:'w',v:w});return f};
  if(!flip)return sh(side(CLASH_COL.l,true,['S','R','D2'],['W','W4'])).map((l,id)=>({id,l}));
  const L=sh(side(CLASH_COL.l,false,['D1','R','S','F'],['W','W2'])),D=sh(side(CLASH_COL.d,false,['D5','R','SE','F'],['W','WC']));
  return L.map((l,id)=>({id,l,d:D[id]}));
}
function CLASH_game(flip,n,R){
  R=R||Math.random;
  const G={flip,n,R,side:'l',dir:1,turn:0,draw:CLASH_deck(flip,R),disc:[],hands:[],color:null,winner:-1};
  for(let p=0;p<n;p++)G.hands.push([]);
  for(let k=0;k<7;k++)for(let p=0;p<n;p++)G.hands[p].push(G.draw.pop());
  let i=G.draw.length-1;while(!/^\d$/.test(G.draw[i].l.v))i--;   // first number card from the top
  G.disc.push(G.draw.splice(i,1)[0]);G.color=G.disc[0].l.c;
  return G;
}
const CLASH_top=G=>G.disc[G.disc.length-1];
const CLASH_next=(G,p,k=1)=>((p+G.dir*k)%G.n+G.n)%G.n;
function CLASH_ok(G,c){const f=c[G.side],t=CLASH_top(G)[G.side];return f.c==='w'||f.c===G.color||(t.c!=='w'&&f.v===t.v)}
function CLASH_needColor(G,c){const f=c[G.side];if(f.c==='w')return true;return G.flip&&f.v==='F'&&c[CLASH_other(G.side)].c==='w'}
function CLASH_take(G,p){
  if(!G.draw.length){
    if(G.disc.length<2)return null;
    const top=G.disc.pop(),a=G.disc;G.disc=[top];
    for(let i=a.length-1;i>0;i--){const j=Math.floor(G.R()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
    G.draw=a;G.reshuffled=(G.reshuffled||0)+1;
  }
  const c=G.draw.pop();G.hands[p].push(c);return c;
}
function CLASH_pass(G,p){if(G.turn!==p)throw Error('not your turn');G.turn=CLASH_next(G,p)}
/* play card c from player p's hand; color is needed for wilds (and for a Flip whose other side is a wild) */
function CLASH_play(G,p,c,color){
  const h=G.hands[p],i=h.indexOf(c);
  if(G.winner>=0||G.turn!==p||i<0||!CLASH_ok(G,c))throw Error('illegal play');
  h.splice(i,1);G.disc.push(c);
  const f=c[G.side],ev={p,c,face:f,side:G.side,draws:[],skipped:[]};
  let nf=f;
  if(G.flip&&f.v==='F'){G.side=CLASH_other(G.side);ev.flipped=true;nf=c[G.side]}
  if(nf.c==='w'){if(!CLASH_COL[G.side].includes(color))throw Error('bad color');G.color=color}else G.color=nf.c;
  ev.color=G.color;
  if(!h.length){G.winner=p;ev.win=true;return ev}
  const nx=CLASH_next(G,p);let step=1;
  if(!ev.flipped){
    const v=f.v;
    if(v==='S'){step=2;ev.skipped.push(nx)}
    else if(v==='SE'){step=0;ev.again=true;for(let q=0;q<G.n;q++)if(q!==p)ev.skipped.push(q)}
    else if(v==='R'){if(G.n===2){step=2;ev.skipped.push(nx)}else{G.dir*=-1;ev.reverse=true}}
    else if(CLASH_DRAWN[v]){const cards=[];for(let k=0;k<CLASH_DRAWN[v];k++){const x=CLASH_take(G,nx);if(x)cards.push(x)}ev.draws.push({p:nx,cards});ev.skipped.push(nx);step=2}
    else if(v==='WC'){const cards=[];let x;while((x=CLASH_take(G,nx))){cards.push(x);if(x[G.side].c===G.color)break}ev.draws.push({p:nx,cards,until:G.color});ev.skipped.push(nx);step=2}
  }
  G.turn=step?CLASH_next(G,p,step):p;
  return ev;
}
/* computer strategy */
function CLASH_aiColor(G,p,side,skip){
  const cnt={},cols=CLASH_COL[side];
  for(const c of G.hands[p])if(c!==skip){const f=c[side];if(f.c!=='w')cnt[f.c]=(cnt[f.c]||0)+1+(/^\d$/.test(f.v)?0:.4)}
  let b=cols[Math.floor(G.R()*4)],bv=0;for(const k of cols)if((cnt[k]||0)>bv){bv=cnt[k];b=k}
  return b;
}
function CLASH_aiColorFor(G,p,c){
  const f=c[G.side];if(f.c==='w')return CLASH_aiColor(G,p,G.side,c);
  if(CLASH_needColor(G,c))return CLASH_aiColor(G,p,CLASH_other(G.side),c);
  return null;
}
function CLASH_handQ(G,p,side,skip){let q=0;for(const c of G.hands[p])if(c!==skip){const f=c[side];q+=f.c==='w'?3:/^\d$/.test(f.v)?0:1.2}return q}
function CLASH_ai(G,p){
  const h=G.hands[p],ok=h.filter(c=>CLASH_ok(G,c));if(!ok.length)return null;
  const nx=CLASH_next(G,p),nc=G.hands[nx].length,cnt={};
  for(const c of h){const f=c[G.side];cnt[f.c]=(cnt[f.c]||0)+1}
  let best=null,bs=-1e9;
  for(const c of ok){
    const f=c[G.side],v=f.v;let s=G.R()*.6;
    if(f.c==='w'){s-=h.length>2?5:0;if(v!=='W')s+=nc<=2?9:nc<=4?2:.5}   // keep wilds for later
    else{
      s+=cnt[f.c]*.9;if(/^\d$/.test(v))s+=+v*.08;
      if(CLASH_DRAWN[v])s+=nc<=2?7:nc<=4?2.5:1;
      if(v==='S'||(v==='R'&&G.n===2))s+=nc<=2?5:.8;
      if(v==='R'&&G.n>2){const pv=CLASH_next(G,p,-1);s+=(G.hands[pv].length>nc?1.5:-.5)+(nc<=2?3:0)}
      if(v==='SE')s+=ok.length>1?3:1;
      if(v==='F')s+=(CLASH_handQ(G,p,CLASH_other(G.side),c)-CLASH_handQ(G,p,G.side,c))*.5+(nc<=2?2:0);
    }
    if(s>bs){bs=s;best=c}
  }
  return{c:best,color:CLASH_aiColorFor(G,p,best)};
}
function CLASH_aiDrawn(G,p,c){
  if(!c||!CLASH_ok(G,c))return null;
  if(c[G.side].c==='w'&&G.hands[p].length>3&&G.R()<.6)return null;
  return{c,color:CLASH_aiColorFor(G,p,c)};
}
/* card faces */
function CLASH_name(f){
  if(f.c==='w')return{W:'Wild',W4:'Wild +4',W2:'Wild +2',WC:'Wild Draw Color'}[f.v];
  return CLASH_CNAME[f.c]+' '+({S:'Skip',SE:'Skip Everyone',R:'Reverse',F:'Flip',D1:'+1',D2:'+2',D5:'+5'}[f.v]||f.v);
}
function CLASH_html(f,side){
  if(!f)return'<div class="clx-card clx-back"><div class="clx-in"><span class="clx-ov"></span><b class="clx-logo">CLASH</b></div></div>';
  const v=f.v,w=f.c==='w',sk='<i class="clx-skip"></i>',dot='<i class="clx-dot"></i>';
  let big,ix,sub='';
  if(/^\d$/.test(v)){big=ix=(v==='6'||v==='9')?`<u>${v}</u>`:v}
  else if(v==='S'){big=ix=sk}
  else if(v==='SE'){big=ix=sk;sub='ALL'}
  else if(v==='R'){big=ix='<i class="clx-sym">⇄</i>'}
  else if(v==='F'){big=ix='<i class="clx-sym">↻</i>';sub='FLIP'}
  else if(v==='W'){big='';ix=dot}
  else if(v==='WC'){big='+';ix='+'+dot;sub='COLOR'}
  else{big=ix='+'+v.slice(1)}
  const cls=`clx-card clx-${side==='d'?'dk':'lt'}${w?' clx-w':''} clx-v${v.toLowerCase()}`;
  return`<div class="${cls}" style="--cc:${w?'#151515':CLASH_HEX[f.c]}"><div class="clx-in"><span class="clx-ov"></span><b class="clx-big">${big}</b>${sub?`<small class="clx-sub">${sub}</small>`:''}<i class="clx-ix clx-tl">${ix}</i><i class="clx-ix clx-br">${ix}</i></div></div>`;
}

function clash(root,S){CLASH_mount(root,S,false)}
function CLASH_mount(root,S,FLIP){
  const N=S.level+1;
  const st=status(root,FLIP?'Match color, number or symbol. A Flip card turns every card over to its other side!':'Match the color, number or symbol. Empty your hand first to win!');
  const B=el('div','clx'+(FLIP?' clx-flip':''),root);B.dataset.max=1100;
  const wait=ms=>new Promise(r=>S.after(ms,r));
  const MS=REDUCED?.25:1;
  const P=[{name:'You',av:'😎',c:'--c2'},{name:'Ana',av:'🦊',c:'--c6'},{name:'Bo',av:'🐼',c:'--c3'},{name:'Cy',av:'🐸',c:'--c5'}].slice(0,N);
  let G=CLASH_game(FLIP,N),VS='l',hidden=new Set(),hideTop=0,over=false,busy=true,pend=null,pre=false,drawn=null,sel=-1,waitHuman=null,ringC=G.color,pickRes=null;
  // ---- DOM
  const OPP=[null];
  for(let p=1;p<N;p++){
    const box=el('div','clx-opp',B,`<div class="clx-oh"><span class="clx-av" style="background:var(${P[p].c})">${P[p].av}</span><span class="clx-on"><b>${P[p].name}</b><span class="clx-n">7</span></span></div><div class="clx-fan"></div><div class="clx-bub"></div>`);
    OPP.push({box,n:$('.clx-n',box),fan:$('.clx-fan',box),bub:$('.clx-bub',box)});
  }
  const tbl=el('div','clx-tbl',B);
  const dirEl=el('div','clx-dir',tbl,'<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M6 50A44 44 0 0 1 50 6M94 50A44 44 0 0 1 50 94"/><polygon points="45,-1 45,13 58,6"/><polygon points="55,87 55,101 42,94"/></svg>');
  const drawP=el('button','clx-pile clx-drawp',tbl);drawP.setAttribute('aria-label','Draw a card');
  const discP=el('div','clx-pile clx-discp',tbl);
  const cntEl=el('span','clx-cnt',tbl);
  const msgEl=el('div','clx-msg',B);
  const you=el('div','clx-you',B,`<span class="clx-av" style="background:var(--c2)">😎</span><b>You</b><span class="clx-n"></span><div class="clx-bub"></div>`);
  const act=el('div','clx-act',B);
  const lastB=el('button','btn clx-last',act,'Last card!'),playB=el('button','btn clx-play',act,'Play it'),keepB=el('button','btn ghost clx-keep',act,'Keep');
  const hand=el('div','clx-hand',B);
  const pick=el('div','clx-pick',B);pick.hidden=true;
  const endEl=el('div','clx-end',B);endEl.hidden=true;
  const HC=new Map();
  // ---- sizing
  let W=0,H=0,cw=60,pw=70,mw=20,wide=false;
  function setAR(){
    const cs=getComputedStyle(root),gap=parseFloat(cs.rowGap)||0;let used=gap*2+parseFloat(cs.paddingTop)+parseFloat(cs.paddingBottom)+8;
    for(const ch of root.children){if(ch===B||getComputedStyle(ch).display==='none')continue;used+=ch.offsetHeight+gap}
    const ar=clamp((root.clientWidth-8)/Math.max(240,root.clientHeight-used),.46,1.8);
    B.dataset.ar=ar;B.style.aspectRatio=ar;B.dataset.max=Math.round(Math.min(1100,(root.clientHeight-used)*ar));
  }
  function measure(){
    W=B.clientWidth;H=B.clientHeight;wide=W/H>1.05;
    cw=Math.min(W*.22,H*.16,130);pw=Math.min(W*.25,H*.18,140);mw=Math.min(W*.055,H*.042,28);
    B.style.setProperty('--cw',cw+'px');B.style.setProperty('--pw',pw+'px');B.style.setProperty('--mw',mw+'px');
  }
  const rel=e=>{const b=B.getBoundingClientRect(),r=e.getBoundingClientRect();return{x:r.left-b.left-B.clientLeft,y:r.top-b.top-B.clientTop,w:r.width,h:r.height}};
  const vis=p=>G.hands[p].filter(c=>!hidden.has(c.id));
  const backOf=c=>FLIP?CLASH_html(c[CLASH_other(VS)],CLASH_other(VS)):CLASH_html(null);
  const faceOf=c=>CLASH_html(c[VS],VS);
  const rot=c=>((c.id*47)%25)-12;
  const order=c=>{const f=c[VS];return(f.c==='w'?9:CLASH_COL[VS].indexOf(f.c))*100+CLASH_VORD.indexOf(f.v)};
  const canNow=c=>!over&&!busy&&G.turn===0&&(drawn?c===drawn:CLASH_ok(G,c));
  let handTop=0;
  function render(){
    measure();
    // opponents
    const seats=(wide?[[],[[.5,0]],[[.27,0],[.73,0]],[[.11,.3],[.5,0],[.89,.3]]]:[[],[[.5,0]],[[.26,0],[.74,0]],[[.17,0],[.5,0],[.83,0]]])[N-1];
    const ow=wide?Math.min(Math.max(W*.2,150),210):Math.min(W/(N-1)-8,200);let oppBottom=60;
    for(let p=1;p<N;p++){
      const o=OPP[p],[sx,sy]=seats[p-1],h=vis(p);
      o.box.style.width=ow+'px';o.box.style.left=clamp(sx*W-ow/2,6,W-ow-6)+'px';o.box.style.top=(sy*H+8)+'px';
      o.box.classList.toggle('clx-turn',!over&&G.turn===p);o.box.classList.toggle('clx-won',G.winner===p);
      o.n.textContent=h.length;
      const k=Math.min(h.length,10),fw=ow-16,step=k>1?Math.min(mw*.55,(fw-mw)/(k-1)):0,x0=(fw-(mw+step*(k-1)))/2;
      o.fan.innerHTML=h.slice(0,k).map((c,i)=>`<div class="clx-mini" style="left:${x0+i*step}px;transform:rotate(${(i-(k-1)/2)*4}deg)">${backOf(c)}</div>`).join('');
      if(sy===0)oppBottom=Math.max(oppBottom,sy*H+8+o.box.offsetHeight);
    }
    // hand layout
    const ch=cw*1.5,list=vis(0).sort((a,b)=>order(a)-order(b)),k=list.length,avail=W-30;
    const perRow=Math.max(1,Math.floor((avail-cw)/(cw*.42))+1),rows=Math.max(1,Math.ceil(k/perRow)),per=Math.ceil(k/rows),rowOff=ch*.42;
    handTop=H-10-ch-(rows-1)*rowOff;
    const keep=new Set();
    B.classList.toggle('clx-myturn',!over&&!busy&&G.turn===0);
    list.forEach((c,idx)=>{
      const r=Math.floor(idx/per),i=idx%per,m=Math.min(per,k-r*per);
      const step=m>1?Math.min(cw*.8,(avail-cw)/(m-1)):0,x0=(W-(cw+step*(m-1)))/2,rl=i-(m-1)/2;
      const x=x0+i*step,y=H-10-ch-(rows-1-r)*rowOff+(rl*rl-(m-1)*(m-1)/4)*Math.min(1.5,14/m),a=rl*Math.min(2.4,18/m);
      let e=HC.get(c.id);
      if(!e){e=el('div','clx-hc clx-pop',hand);e.dataset.id=c.id;HC.set(c.id,e);S.after(400,()=>e.classList.remove('clx-pop'))}
      if(e.dataset.side!==VS){e.dataset.side=VS;e.innerHTML=faceOf(c)}
      e.style.cssText=`--x:${x}px;--y:${y}px;--r:${a}deg;z-index:${r*100+i+1}`;
      const ok=canNow(c);e.classList.toggle('clx-ok',ok);e.classList.toggle('clx-no',!ok);e.classList.toggle('clx-sel',idx===sel);
      keep.add(c.id);
    });
    for(const[id,e]of HC)if(!keep.has(id)){e.remove();HC.delete(id)}
    // act row + you label
    const actTop=handTop-cw*.34-46;
    act.style.top=actTop+'px';you.style.top=(actTop+3)+'px';
    you.classList.toggle('clx-turn',!over&&G.turn===0);$('.clx-n',you).textContent=vis(0).length;
    const showLast=(pend&&pend.p===0&&!pend.called)||(!over&&G.turn===0&&!busy&&vis(0).length===2&&!pre&&G.hands[0].some(c=>CLASH_ok(G,c)));
    lastB.hidden=!showLast;playB.hidden=keepB.hidden=!(drawn&&!busy);
    // table
    const ph=pw*1.5,gap=pw*.5,tw=pw*2+gap,dsz=ph*1.32,top1=oppBottom+10,bot=actTop-4,need=dsz+30;
    const ty=top1+Math.max(0,(bot-top1-need)/2)+(dsz-ph)/2;
    tbl.style.cssText=`left:${(W-tw)/2}px;top:${ty}px;width:${tw}px;height:${ph}px`;
    discP.style.left=(pw+gap)+'px';
    dirEl.style.cssText=`width:${dsz}px;height:${dsz}px;left:${(tw-dsz)/2}px;top:${(ph-dsz)/2}px`;
    dirEl.classList.toggle('clx-ccw',G.dir<0);
    msgEl.style.top=(ty+ph+(dsz-ph)/2+4)+'px';
    const tp=G.draw[G.draw.length-1];
    drawP.innerHTML=tp?`<div class="clx-stack">${FLIP?CLASH_html(tp[CLASH_other(VS)],CLASH_other(VS)):CLASH_html(null)}</div>`:'<div class="clx-empty"></div>';
    drawP.classList.toggle('clx-hint',!over&&!busy&&G.turn===0&&!drawn&&!G.hands[0].some(c=>CLASH_ok(G,c)));
    cntEl.textContent=G.draw.length;cntEl.style.left=(pw/2)+'px';
    const ds=G.disc.slice(0,G.disc.length-hideTop).slice(-3);
    if(!hideTop&&VS===G.side)ringC=G.color;
    discP.style.setProperty('--ring',ds.length?CLASH_HEX[ringC]:'transparent');
    discP.innerHTML=ds.map(c=>`<div class="clx-dc" style="transform:rotate(${rot(c)}deg)">${faceOf(c)}</div>`).join('');
    discP.classList.toggle('clx-none',!ds.length);
  }
  function setMsg(t){msgEl.textContent=t;restartAnim(msgEl,'clx-bump')}
  function bubble(p,t){const b=p===0?$('.clx-bub',you):OPP[p].bub;b.textContent=t;restartAnim(b,'clx-show')}
  function fly(html,from,to,ms,r=0){
    ms*=MS;const f=el('div','clx-fly',B,html);f.style.cssText=`left:${from.x}px;top:${from.y}px;font-size:${from.w}px`;
    const s=to.w/from.w;
    f.animate([{transform:'translate(0,0) rotate(0deg)'},{transform:`translate(${to.x-from.x}px,${to.y-from.y}px) rotate(${r}deg) scale(${s})`}],{duration:Math.max(1,ms),easing:'cubic-bezier(.3,.75,.35,1)',fill:'forwards'});
    return wait(ms).then(()=>f.remove());
  }
  function dest(p){
    if(p===0)return{x:W/2-cw/2,y:H-10-cw*1.5,w:cw,h:cw*1.5};
    const r=rel(OPP[p].fan);return{x:r.x+r.w/2-mw/2,y:r.y,w:mw,h:mw*1.5};
  }
  const pileR=()=>{const r=rel(drawP);return{x:r.x,y:r.y,w:pw,h:pw*1.5}};
  async function animDraw(p,cards){
    if(!cards.length)return;
    for(const c of cards)hidden.add(c.id);render();
    let last;
    for(const c of cards){
      beep(300+rand(60),50,'sine');
      last=fly(p===0?faceOf(c):backOf(c),pileR(),dest(p),280).then(()=>{hidden.delete(c.id);render()});
      await wait(120*MS);
    }
    await last;
  }
  async function drawCards(p,n){
    const got=[],rs=G.reshuffled||0;
    for(let i=0;i<n;i++){const c=CLASH_take(G,p);if(!c)break;got.push(c)}
    if((G.reshuffled||0)>rs)setMsg('Shuffling the pile into a new deck');
    await animDraw(p,got);return got;
  }
  async function resolvePending(){
    if(!pend)return;const q=pend;pend=null;render();
    if(q.called||over)return;
    const t=q.p===0?'You forgot to call Last card! Draw 2.':`${P[q.p].name} forgot to call Last card! +2`;
    setMsg(q.p===0?'Forgot Last card! +2':`${P[q.p].name} forgot! +2`);st(t);beep(180,250,'square');bubble(q.p,'Caught! +2');
    if(q.p===0)S.shake();
    await drawCards(q.p,2);
  }
  async function flipAnim(){
    beep(330,120,'sine');S.after(110,()=>beep(660,160,'sine'));
    const bu=el('div','clx-burst',B,'FLIP!');bu.classList.add(G.side==='d'?'clx-bd':'clx-bl');S.after(1100,()=>bu.remove());
    B.classList.add('clx-flip1');await wait(260*MS);
    VS=G.side;B.classList.toggle('clx-dark',VS==='d');render();
    B.classList.remove('clx-flip1');B.classList.add('clx-flip2');await wait(300*MS);B.classList.remove('clx-flip2');
    st(VS==='d'?'Flip! The dark side is up.':'Flip! Back to the light side.');
  }
  async function doPlay(p,c,col){
    const fe=p===0?HC.get(c.id):null,from=fe?rel(fe.firstChild||fe):dest(p),old=VS,f=c[old];
    const ev=CLASH_play(G,p,c,col);
    hideTop=1;render();
    beep(p===0?560:470,80);
    const dr=rel(discP);
    await fly(CLASH_html(f,old),from,{x:dr.x,y:dr.y,w:pw,h:pw*1.5},320,rot(c));
    hideTop=0;render();restartAnim(discP,'clx-land');
    const wc=f.c==='w'?` → ${CLASH_CNAME[ev.color]}`:'';
    setMsg(`${p===0?'You':P[p].name} played ${CLASH_name(f)}${wc}`);
    if(ev.flipped){await flipAnim();if(c[VS].c==='w')setMsg(`Wild side up → ${CLASH_CNAME[ev.color]}`)}
    if(ev.win)return ev;
    if(G.hands[p].length===1){
      if(p===0)pend={p:0,called:pre};
      else{const called=G.R()>.12;pend={p,called};if(called){bubble(p,'Last card!');beep(880,90)}}
      render();
    }
    if(ev.reverse){restartAnim(dirEl,'clx-land');bubble(p,'Reverse!')}
    for(const q of ev.skipped)if(!ev.draws.length)bubble(q,'Skipped!');
    if(ev.draws.length)await wait(500*MS);
    for(const d of ev.draws){
      bubble(d.p,'+'+d.cards.length);
      setMsg(`${d.p===0?'You draw':P[d.p].name+' draws'} ${d.cards.length}${d.until?' (until '+CLASH_CNAME[d.until]+')':''} and miss${d.p===0?'':'es'} a turn`);
      await animDraw(d.p,d.cards);
    }
    if(ev.again)setMsg(`${p===0?'You go':P[p].name+' goes'} again!`);
    render();
    await wait(200*MS);
    return ev;
  }
  // ---- human
  function humanTurn(){
    return new Promise(res=>{
      waitHuman=res;busy=false;sel=-1;render();
      const can=G.hands[0].some(c=>CLASH_ok(G,c));
      st(can?'Your turn. Tap a glowing card.':'Your turn. No match, so tap the deck to draw.');
      setMsg(can?'Your turn':'No match. Tap the deck to draw');
    });
  }
  function finishHuman(){pre=false;busy=true;drawn=null;sel=-1;const r=waitHuman;waitHuman=null;render();if(r)r()}
  function nope(c){beep(150,120,'square');const e=c&&HC.get(c.id);if(e)restartAnim(e,'clx-nope')}
  function pickColor(side,title){
    return new Promise(res=>{
      pick.innerHTML=`<div class="clx-pk"><b>${title}</b><div class="clx-pkg">${CLASH_COL[side].map((k,i)=>`<button class="clx-pkb${side==='d'?' clx-pkd':''}" data-k="${k}" style="--cc:${CLASH_HEX[k]}"><span>${i+1}</span>${CLASH_CNAME[k]}</button>`).join('')}</div><button class="btn ghost clx-pkx">Cancel</button></div>`;
      pick.hidden=false;pickRes=v=>{pick.hidden=true;pickRes=null;res(v)};
    });
  }
  async function humanPlay(c){
    if(busy||over||G.turn!==0||!c)return;
    if((drawn&&c!==drawn)||!CLASH_ok(G,c)){nope(c);return}
    busy=true;render();
    let col=null;
    if(CLASH_needColor(G,c)){
      const wild=c[G.side].c==='w';
      col=await pickColor(wild?G.side:CLASH_other(G.side),wild?'Pick a color':'The flip lands on a Wild. Pick a color');
      if(!col){busy=false;render();return}
    }
    drawn=null;
    await resolvePending();
    await doPlay(0,c,col);
    finishHuman();
  }
  async function humanDraw(){
    if(busy||over||G.turn!==0||drawn)return;
    busy=true;render();
    await resolvePending();
    const [c]=await drawCards(0,1);
    if(c&&CLASH_ok(G,c)){drawn=c;busy=false;sel=-1;setMsg('Play the new card or keep it?');render();return}
    setMsg(c?'No match. Turn passes':'The deck is empty. Turn passes');
    await wait(450*MS);CLASH_pass(G,0);finishHuman();
  }
  function keepDrawn(){if(!drawn||busy||G.turn!==0)return;busy=true;CLASH_pass(G,0);setMsg('You keep the card');finishHuman()}
  function callLast(){
    if(lastB.hidden)return;
    if(pend&&pend.p===0)pend.called=true;else pre=true;
    bubble(0,'Last card!');beep(880,90);S.after(90,()=>beep(1180,120));render();
  }
  // ---- computers
  async function aiTurn(p){
    setMsg(`${P[p].name} is thinking…`);
    await wait((620+rand(380))*MS+(pend&&pend.p===0&&!pend.called?1400:0));
    await resolvePending();
    let ch=CLASH_ai(G,p);
    if(!ch){
      const [c]=await drawCards(p,1);setMsg(`${P[p].name} draws a card`);
      ch=CLASH_aiDrawn(G,p,c);
      if(!ch){await wait(300*MS);CLASH_pass(G,p);return}
      await wait(350*MS);
    }
    await doPlay(p,ch.c,ch.color);
  }
  async function deal(){
    for(const h of G.hands)for(const c of h)hidden.add(c.id);hideTop=1;render();
    await wait(300);
    let last;
    for(let r=0;r<7;r++)for(let p=0;p<N;p++){
      const c=G.hands[p][r];
      last=fly(p===0?faceOf(c):backOf(c),pileR(),dest(p),260).then(()=>{hidden.delete(c.id);render()});
      if(p===0)beep(400+r*40,40,'sine');
      await wait(55*MS);
    }
    await last;await wait(200);
    const dr=rel(discP);
    await fly(CLASH_html(G.disc[0].l,'l'),pileR(),{x:dr.x,y:dr.y,w:pw,h:pw*1.5},320,rot(G.disc[0]));
    hideTop=0;render();restartAnim(discP,'clx-land');beep(620,90);
  }
  function finish(w){
    over=true;busy=true;pend=null;render();
    endEl.innerHTML=`<div class="clx-pk"><span class="clx-eav">${P[w].av}</span><b>${w===0?'You win!':P[w].name+' wins!'}</b><p>${w===0?'Your hand is empty. Nice playing!':'You had '+vis(0).length+' card'+(vis(0).length===1?'':'s')+' left.'}</p><button class="btn clx-again">Play again</button></div>`;
    S.after(2000,()=>{endEl.hidden=false});
    if(w===0){st('You win! Press ↻ to play again.');setMsg('You win!');S.next()}
    else{st(`${P[w].name} wins this round. Press ↻ to play again.`);setMsg(`${P[w].name} wins!`);S.shake();S.fx.banner(`${P[w].name} wins!`,'Better luck next time');beep(200,300,'sawtooth')}
  }
  async function run(){
    await deal();
    while(!over){
      if(G.turn===0)await humanTurn();else await aiTurn(G.turn);
      if(G.winner>=0){finish(G.winner);return}
    }
  }
  // ---- input
  S.on(hand,'click',e=>{const h=e.target.closest('.clx-hc');if(!h)return;const c=G.hands[0].find(x=>x.id===+h.dataset.id);if(c)humanPlay(c)});
  S.on(drawP,'click',humanDraw);
  S.on(lastB,'click',callLast);
  S.on(playB,'click',()=>humanPlay(drawn));
  S.on(keepB,'click',keepDrawn);
  S.on(pick,'click',e=>{if(!pickRes)return;const b=e.target.closest('.clx-pkb');if(b)pickRes(b.dataset.k);else if(e.target.closest('.clx-pkx')||e.target===pick)pickRes(null)});
  S.on(endEl,'click',e=>{if(e.target.closest('.clx-again'))S.restart()});
  S.on(window,'keydown',e=>{
    if(!B.isConnected)return;const k=e.key;
    if(pickRes){if(k>='1'&&k<='4'){const b=pick.querySelectorAll('.clx-pkb')[k-1];if(b)pickRes(b.dataset.k)}else if(k==='Escape')pickRes(null);return}
    if(k==='l'||k==='L'){callLast();return}
    if(over||busy||G.turn!==0)return;
    const list=vis(0).sort((a,b)=>order(a)-order(b));
    if(k==='ArrowLeft'||k==='ArrowRight'){e.preventDefault();sel=sel<0?(k==='ArrowLeft'?list.length-1:0):clamp(sel+(k==='ArrowLeft'?-1:1),0,list.length-1);render()}
    else if(k==='Enter'||k===' '){e.preventDefault();if(drawn)humanPlay(drawn);else if(sel>=0)humanPlay(list[sel])}
    else if(k==='d'||k==='D')humanDraw();
    else if((k==='k'||k==='K')&&drawn)keepDrawn();
  });
  S.on(window,'resize',()=>S.after(60,()=>{setAR();if(typeof fit==='function')fit();render()}));
  setAR();
  S.after(40,()=>{if(typeof fit==='function')fit();render();run()});
  render();
}

function clashflip(root,S){CLASH_mount(root,S,true)}

/* Rug Market engine. Cells are r*7+c on a 7x7 square. Directions 0 up, 1 right, 2 down, 3 left.
   Leaving the board the merchant follows the border loops: pairs of neighbouring rows/columns are joined by
   U-turns, and the top-right and bottom-left corners have a corner loop that turns him 90 degrees on the spot. */
const RUGS_DIE=[1,2,2,3,3,4];
const RUGS_DR=[-1,0,1,0],RUGS_DC=[0,1,0,-1];
const RUGS_E=(()=>{
  const N=7,id=(r,c)=>r*N+c;
  /* one square forward; loop: 0 inside, 1 U-turn into the neighbouring line, 2 corner loop */
  function step(r,c,d){
    const nr=r+RUGS_DR[d],nc=c+RUGS_DC[d];
    if(nr>=0&&nr<N&&nc>=0&&nc<N)return{r:nr,c:nc,d,loop:0};
    if(d===0)return c===6?{r,c,d:3,loop:2}:{r,c:c^1,d:2,loop:1};
    if(d===1)return r===0?{r,c,d:2,loop:2}:{r:r%2?r+1:r-1,c,d:3,loop:1};
    if(d===2)return c===0?{r,c,d:1,loop:2}:{r,c:c%2?c+1:c-1,d:0,loop:1};
    return r===6?{r,c,d:0,loop:2}:{r:r^1,c,d:1,loop:1};
  }
  function walk(m,k){const out=[];let cur={r:m.r,c:m.c,d:m.d};for(let i=0;i<k;i++){const n=step(cur.r,cur.c,cur.d);out.push({from:cur,to:n});cur=n}return{end:{r:cur.r,c:cur.c,d:cur.d},steps:out}}
  function nb(i){const r=i/N|0,c=i%N,o=[];if(r>0)o.push(i-N);if(r<N-1)o.push(i+N);if(c>0)o.push(i-1);if(c<N-1)o.push(i+1);return o}
  const ownerAt=(s,i)=>s.top[i]<0?-1:s.rugs[s.top[i]].p;
  function area(s,i){
    const o=ownerAt(s,i);if(o<0)return[];const seen=new Set([i]),q=[i];
    while(q.length){const a=q.pop();for(const b of nb(a))if(!seen.has(b)&&ownerAt(s,b)===o){seen.add(b);q.push(b)}}
    return[...seen];
  }
  /* toll player p pays when the merchant stops on cell i */
  function toll(s,p,i){const o=ownerAt(s,i);if(o<0||o===p||s.out[o])return{o:-1,n:0,cells:[]};const cells=area(s,i);return{o,n:Math.min(cells.length,s.coins[p]),cells}}
  function legal(s){
    const M=id(s.m.r,s.m.c),seen=new Set(),out=[];
    for(const a of nb(M))for(const b of nb(a)){
      if(b===M)continue;const k=Math.min(a,b)*64+Math.max(a,b);if(seen.has(k))continue;seen.add(k);
      if(s.top[a]>=0&&s.top[a]===s.top[b])continue;out.push([Math.min(a,b),Math.max(a,b)]);
    }
    return out;
  }
  function isLegal(s,a,b){return legal(s).some(([x,y])=>(x===a&&y===b)||(x===b&&y===a))}
  function start(np){
    const n=np===2||np===4?12:15;
    return{np,top:Array(N*N).fill(-1),rugs:[],m:{r:3,c:3,d:0},coins:Array(np).fill(30),left:Array(np).fill(n),out:Array(np).fill(false)};
  }
  function place(s,p,a,b){const k=s.rugs.length;s.rugs.push({p,a,b});s.top[a]=s.top[b]=k;s.left[p]--;return k}
  function visible(s){const v=Array(s.np).fill(0);for(let i=0;i<N*N;i++){const o=ownerAt(s,i);if(o>=0)v[o]++}return v}
  function scores(s){const v=visible(s);return s.coins.map((c,p)=>s.out[p]?-1:c+v[p])}
  /* per player: visible squares and sum of squared region sizes (big connected regions earn big tolls) */
  function stats(top,rugs,np){
    const vis=Array(np).fill(0),sq=Array(np).fill(0),seen=new Uint8Array(N*N),own=i=>top[i]<0?-1:rugs[top[i]].p;
    for(let i=0;i<N*N;i++){const o=own(i);if(o<0||seen[i])continue;let n=0;const q=[i];seen[i]=1;
      while(q.length){const a=q.pop();n++;for(const b of nb(a))if(!seen[b]&&own(b)===o){seen[b]=1;q.push(b)}}
      vis[o]+=n;sq[o]+=n*n}
    return{vis,sq};
  }
  function value(s,top,p){
    const{vis,sq}=stats(top,s.rugs.concat([{p}]),s.np);let v=0,opp=0;
    for(let q=0;q<s.np;q++)if(q!==p&&!s.out[q])opp++;
    for(let q=0;q<s.np;q++){if(s.out[q]&&q!==p)continue;const t=vis[q]+.12*sq[q];v+=q===p?t:-t*(opp>1?.75:1)}
    return v;
  }
  /* best rug for p from here: score = board value after placing */
  function bestPlace(s,p){
    const L=legal(s),k=s.rugs.length;let best=null,bv=-1e9;
    for(const [a,b] of L){const top=s.top.slice();top[a]=top[b]=k;const v=value(s,top,p)+Math.random()*.01;if(v>bv){bv=v;best=[a,b]}}
    return{pl:best,v:bv};
  }
  /* choose a turn (-1 left, 0 straight, 1 right) by expected toll over the die, plus how good the rug spots there are */
  function bestDir(s,p){
    const base=value(s,s.top,p);let best=0,bv=1e9;
    for(const off of [0,-1,1]){
      const d=(s.m.d+off+4)%4;let e=0;
      for(const k of RUGS_DIE){
        const end=walk({r:s.m.r,c:s.m.c,d},k).end,t=toll(s,p,id(end.r,end.c));
        const ns={...s,m:end};const gain=t.n>=s.coins[p]?-30:bestPlace(ns,p).v-base;
        e+=(t.n*1.3-.35*gain)/6;
      }
      e+=Math.random()*.05;if(e<bv){bv=e;best=off}
    }
    return best;
  }
  return{N,id,step,walk,nb,ownerAt,area,toll,legal,isLegal,start,place,visible,scores,bestPlace,bestDir};
})();

function rugmarket(root,S){
  const L=S.level,TWO=L===4,NP=TWO?2:L+1,E=RUGS_E,N=7;
  const NAMES=TWO?['Red','Blue']:['You','Blue','Teal','Orange'].slice(0,NP);
  const isAI=p=>!TWO&&p>0;
  const st=status(root,TWO?'Two players. Turn the merchant, roll, pay for landing on rival rugs, then lay a rug next to him. Most coins plus visible rug squares wins.':'Turn the merchant, roll and move. Landing on a rival rug costs a coin per square of that patch. Then lay a rug next to him. Coins plus visible squares wins.');
  const W=360,PH=58,MG=24,CS=(W-2*MG)/N,BOT=78,H0=PH+2*MG+N*CS+BOT,H=tall(W,H0,H0+56,64);
  const{c,x}=canvas(root,W,H);c.classList.add('rg-cv');c.dataset.max=640;
  const BX=MG,BY=PH+MG+Math.round((H-H0)*.45),DY=H-BOT/2-2;
  const row=el('div','row rg-row',root);
  const bL=el('button','btn ghost rg-dir',row,'⟲'),bU=el('button','btn ghost rg-dir',row,'↑'),bR=el('button','btn ghost rg-dir',row,'⟳');
  const bRoll=el('button','btn rg-roll',row,'🎲 Roll'),bTurn=el('button','btn ghost rg-turn',row,'⟳ Turn'),bPlace=el('button','btn rg-place',row,'✓ Place');
  bL.title='Turn left';bU.title='Straight on';bR.title='Turn right';bL.setAttribute('aria-label','Turn left');bU.setAttribute('aria-label','Straight on');bR.setAttribute('aria-label','Turn right');
  const BODY=(cssv('--body')||'sans-serif');
  let K=pal(),COL=[];const setCol=()=>{K=pal();COL=TWO?[K.c1,K.c4]:[K.c1,K.c4,K.c3,K.c6]};setCol();
  let s=E.start(NP),cur=0,phase='wait',off=0,baseD=0,legalL=[],sel=-1,prev=null,kbI=-1,over=false,res=null;
  let die={v:1,spin:0,rot:0,show:false},flash={cells:[],t:0},floats=[],pop=null,hint='',frame=0;
  let mx=0,my=0,mang=0,mTarget=0;
  const cx=i=>BX+(i%N+.5)*CS,cy=i=>BY+((i/N|0)+.5)*CS,M=()=>E.id(s.m.r,s.m.c);
  mx=cx(M());my=cy(M());mang=mTarget=-Math.PI/2;
  const tw=[];const tween=(ms,f)=>new Promise(r=>tw.push({t:0,ms,f,r}));
  const wait=ms=>new Promise(r=>S.after(ms,r));
  const dirAng=d=>[-Math.PI/2,0,Math.PI/2,Math.PI][d];
  function cost(p){/* expected toll for each landing 1..4 with the chosen facing */
    const d=(baseD+off+4)%4,out=[];for(let k=1;k<=4;k++){const e=E.walk({r:s.m.r,c:s.m.c,d},k).end,i=E.id(e.r,e.c);out.push({k,i,t:E.toll(s,p,i)})}return out;
  }
  /* ---------- drawing ---------- */
  function rugShape(a,b,col,alpha,sc){
    const r1=Math.min(a,b),r2=Math.max(a,b),hor=r2-r1===1,X=BX+(r1%N)*CS,Y=BY+(r1/N|0)*CS,w=hor?2*CS:CS,h=hor?CS:2*CS,ins=2.5;
    x.save();x.globalAlpha=alpha;
    if(sc&&sc!==1){const ox=X+w/2,oy=Y+h/2;x.translate(ox,oy);x.scale(sc,sc);x.translate(-ox,-oy)}
    x.shadowColor='rgba(0,0,0,.28)';x.shadowBlur=4;x.shadowOffsetY=1.5;
    rr(x,X+ins,Y+ins,w-2*ins,h-2*ins,5);x.fillStyle=col;x.fill();x.shadowColor='transparent';
    x.lineWidth=2;x.strokeStyle=K.edge;x.stroke();
    /* border band */
    rr(x,X+ins+4,Y+ins+4,w-2*ins-8,h-2*ins-8,3);x.lineWidth=2;x.strokeStyle='rgba(255,255,255,.6)';x.stroke();
    rr(x,X+ins+7.5,Y+ins+7.5,w-2*ins-15,h-2*ins-15,2);x.lineWidth=1.2;x.strokeStyle='rgba(0,0,0,.25)';x.stroke();
    /* diamonds */
    for(const k of [0,1]){const qx=X+(hor?(k+.5)*CS:CS/2),qy=Y+(hor?CS/2:(k+.5)*CS),z=CS*.2;
      x.beginPath();x.moveTo(qx,qy-z);x.lineTo(qx+z,qy);x.lineTo(qx,qy+z);x.lineTo(qx-z,qy);x.closePath();x.fillStyle='rgba(255,255,255,.55)';x.fill();
      x.beginPath();x.moveTo(qx,qy-z*.45);x.lineTo(qx+z*.45,qy);x.lineTo(qx,qy+z*.45);x.lineTo(qx-z*.45,qy);x.closePath();x.fillStyle='rgba(0,0,0,.28)';x.fill()}
    if(hor){x.beginPath();x.moveTo(X+CS,Y+ins+9);x.lineTo(X+CS,Y+h-ins-9);x.setLineDash([2,3]);x.lineWidth=1.2;x.strokeStyle='rgba(255,255,255,.45)';x.stroke();x.setLineDash([])}
    else{x.beginPath();x.moveTo(X+ins+9,Y+CS);x.lineTo(X+w-ins-9,Y+CS);x.setLineDash([2,3]);x.lineWidth=1.2;x.strokeStyle='rgba(255,255,255,.45)';x.stroke();x.setLineDash([])}
    /* fringe on the short ends */
    x.lineWidth=1.3;x.strokeStyle='rgba(255,255,255,.75)';x.beginPath();
    for(let k=0;k<5;k++){const t=.25+k*.125;if(hor){const yy=Y+h*t;x.moveTo(X+ins,yy);x.lineTo(X+ins+2.5,yy);x.moveTo(X+w-ins,yy);x.lineTo(X+w-ins-2.5,yy)}else{const xx=X+w*t;x.moveTo(xx,Y+ins);x.lineTo(xx,Y+ins+2.5);x.moveTo(xx,Y+h-ins);x.lineTo(xx,Y+h-ins-2.5)}}
    x.stroke();x.restore();
  }
  function loops(){
    x.lineWidth=4;x.strokeStyle=K.muted;x.globalAlpha=.45;const h=CS/2,R=BX+N*CS,B=BY+N*CS;
    const arcs=[];
    for(const c0 of [0,2,4])arcs.push([BX+(c0+1)*CS,BY,Math.PI,0]);           // top: columns 0-1,2-3,4-5
    for(const c0 of [1,3,5])arcs.push([BX+(c0+1)*CS,B,0,Math.PI]);            // bottom: 1-2,3-4,5-6
    for(const r0 of [1,3,5])arcs.push([R,BY+(r0+1)*CS,-Math.PI/2,Math.PI/2]); // right: rows 1-2,3-4,5-6
    for(const r0 of [0,2,4])arcs.push([BX,BY+(r0+1)*CS,Math.PI/2,Math.PI*1.5]);// left: 0-1,2-3,4-5
    for(const [ax,ay,a0,a1] of arcs){x.beginPath();x.arc(ax,ay,h*.8,a0,a1);x.stroke()}
    x.beginPath();x.arc(R,BY,h*.8,Math.PI,Math.PI/2,false);x.stroke();
    x.beginPath();x.arc(BX,B,h*.8,0,Math.PI*1.5,false);x.stroke();x.globalAlpha=1;
  }
  function merchant(){
    const r=CS*.32;x.save();x.translate(mx,my);x.rotate(mang);
    x.shadowColor='rgba(0,0,0,.35)';x.shadowBlur=6;x.shadowOffsetY=2;
    x.beginPath();x.moveTo(r*1.55,0);x.lineTo(r*.35,-r*.95);x.arc(0,0,r,-1.24,1.24,true);x.closePath();
    x.fillStyle='#3A2A22';x.fill();x.shadowColor='transparent';x.lineWidth=2.5;x.strokeStyle='#FFC53D';x.stroke();
    x.beginPath();x.arc(0,0,r*.5,0,7);x.fillStyle='#E63946';x.fill();x.lineWidth=1.5;x.strokeStyle='#FFF4D6';x.stroke();
    x.beginPath();x.moveTo(r*.9,0);x.lineTo(r*.6,-r*.22);x.lineTo(r*.6,r*.22);x.closePath();x.fillStyle='#FFF4D6';x.fill();
    x.restore();
  }
  function coin(X,Y,r){x.beginPath();x.arc(X,Y,r,0,7);x.fillStyle='#FFC53D';x.fill();x.lineWidth=1.5;x.strokeStyle='#B07A00';x.stroke();x.beginPath();x.arc(X,Y,r*.5,0,7);x.strokeStyle='rgba(176,122,0,.6)';x.lineWidth=1;x.stroke()}
  function panel(){
    const g=6,w=(W-g*(NP+1))/NP;const sc=res&&res.sc;
    for(let p=0;p<NP;p++){
      const X=g+p*(w+g),Y=6,on=!over&&p===cur,hh=PH-12;x.save();if(s.out[p])x.globalAlpha=.4;
      rr(x,X,Y+(on?0:2),w,hh,10);x.fillStyle=K.board;x.fill();
      if(on){x.save();x.globalAlpha=.28;x.fillStyle=COL[p];x.fill();x.restore()}
      x.lineWidth=on?3:2;x.strokeStyle=on?K.edge:K.line;x.stroke();
      rr(x,X+6,Y+(on?0:2)+7,14,10,2);x.fillStyle=COL[p];x.fill();x.lineWidth=1.5;x.strokeStyle=K.edge;x.stroke();
      x.fillStyle=K.ink;x.font=`900 ${NP>3?11:12.5}px ${BODY}`;x.textAlign='left';x.textBaseline='middle';
      let nm=NAMES[p];if(res&&res.win.includes(p))nm='👑 '+nm;x.fillText(nm,X+24,Y+(on?0:2)+12.5,w-28);
      const y2=Y+(on?0:2)+32;coin(X+12,y2,6);x.font=`${NP>3?13:15}px ${DISPLAY}`;x.fillStyle=K.ink;x.fillText(String(s.coins[p]),X+21,y2+1);
      const tx=X+w*.58;
      if(sc){x.font=`900 ${NP>3?11:12}px ${BODY}`;x.fillStyle=K.muted;x.fillText(s.out[p]?'out':'=',tx,y2+1);if(!s.out[p]){x.font=`${NP>3?13:15}px ${DISPLAY}`;x.fillStyle=K.ink;x.fillText(String(sc[p]),tx+10,y2+1)}}
      else if(s.out[p]){x.font=`900 12px ${BODY}`;x.fillStyle=K.c1;x.fillText('OUT',tx,y2+1)}
      else{rr(x,tx,y2-4,10,8,1.5);x.fillStyle=COL[p];x.fill();x.lineWidth=1;x.strokeStyle=K.edge;x.stroke();x.font=`${NP>3?13:15}px ${DISPLAY}`;x.fillStyle=K.ink;x.fillText(String(s.left[p]),tx+13,y2+1)}
      x.restore();
    }
  }
  const PIPS={1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[1,-1],[-1,1],[1,1]]};
  function drawDie(){
    const X=MG+26,Y=DY,z=40;x.save();x.translate(X,Y);x.rotate(die.rot);
    rr(x,-z/2,-z/2,z,z,9);x.fillStyle=die.show?'#FFFDF5':K.board;x.fill();x.lineWidth=3;x.strokeStyle=K.edge;x.stroke();
    if(die.show)for(const [a,b] of PIPS[die.v]){x.beginPath();x.arc(a*z*.24,b*z*.24,4.2,0,7);x.fillStyle='#1E1F5C';x.fill()}
    else{x.fillStyle=K.muted;x.font=`16px ${DISPLAY}`;x.textAlign='center';x.textBaseline='middle';x.fillText('?',0,1)}
    x.restore();
    x.fillStyle=K.ink;x.font=`800 14px ${BODY}`;x.textAlign='left';x.textBaseline='middle';
    const lines=String(hint).split('\n');lines.forEach((t,k)=>{x.fillStyle=k?K.muted:K.ink;x.font=`${k?700:800} ${k?12.5:14}px ${BODY}`;x.fillText(t,MG+58,Y+(k-(lines.length-1)/2)*18,W-MG-64)});
  }
  function draw(){
    if(++frame%60===0)setCol();
    x.clearRect(0,0,W,H);panel();
    /* board */
    rr(x,BX-3,BY-3,N*CS+6,N*CS+6,8);x.fillStyle=K.edge;x.fill();
    for(let i=0;i<N*N;i++){x.fillStyle=((i%N)+(i/N|0))%2?'#EAD3A8':'#F3E2BF';x.fillRect(BX+(i%N)*CS,BY+(i/N|0)*CS,CS,CS)}
    x.strokeStyle='rgba(120,80,40,.25)';x.lineWidth=1;x.beginPath();for(let k=1;k<N;k++){x.moveTo(BX+k*CS,BY);x.lineTo(BX+k*CS,BY+N*CS);x.moveTo(BX,BY+k*CS);x.lineTo(BX+N*CS,BY+k*CS)}x.stroke();
    loops();
    s.rugs.forEach((r,k)=>{if(s.top[r.a]!==k&&s.top[r.b]!==k)return;rugShape(r.a,r.b,COL[r.p],1,pop&&pop.k===k?pop.sc:1)});
    /* payment flash */
    if(flash.t>0){x.save();x.globalAlpha=Math.min(1,flash.t)*(.55+.35*Math.sin(frame*.3));x.lineWidth=3;x.strokeStyle='#FFC53D';x.fillStyle='rgba(255,197,61,.35)';for(const i of flash.cells){rr(x,BX+(i%N)*CS+2,BY+(i/N|0)*CS+2,CS-4,CS-4,5);x.fill();x.stroke()}x.restore()}
    /* direction preview */
    if(phase==='dir'&&!isAI(cur)){
      for(const o of cost(cur)){const X=cx(o.i),Y=cy(o.i);if(o.i===M())continue;
        x.beginPath();x.arc(X,Y,CS*.27,0,7);x.fillStyle=o.t.n?'rgba(230,57,70,.85)':'rgba(30,31,92,.55)';x.fill();x.lineWidth=2;x.strokeStyle='#FFF';x.stroke();
        x.fillStyle='#FFF';x.font=`${o.t.n?11:13}px ${DISPLAY}`;x.textAlign='center';x.textBaseline='middle';x.fillText(o.t.n?'−'+o.t.n:String(o.k),X,Y+1)}
    }
    /* placement hints */
    if(phase==='place'&&!isAI(cur)){
      const cand=new Set();legalL.forEach(([a,b])=>{cand.add(a);cand.add(b)});
      const part=new Set();if(sel>=0)legalL.forEach(([a,b])=>{if(a===sel)part.add(b);if(b===sel)part.add(a)});
      for(const i of cand){const X=BX+(i%N)*CS,Y=BY+(i/N|0)*CS;x.save();x.setLineDash([4,3]);x.lineWidth=2;x.strokeStyle=part.has(i)?K.edge:'rgba(30,31,92,.45)';rr(x,X+4,Y+4,CS-8,CS-8,6);x.stroke();x.restore();
        if(part.has(i)){x.beginPath();x.arc(X+CS/2,Y+CS/2,4,0,7);x.fillStyle=K.edge;x.fill()}}
    }
    if(prev){const pulse=.75+.12*Math.sin(frame*.15);rugShape(prev[0],prev[1],COL[cur],pulse,1.04);
      const a=prev[0],hor=prev[1]-a===1;x.save();x.setLineDash([6,4]);x.lineDashOffset=-frame*.4;x.lineWidth=3;x.strokeStyle=K.edge;rr(x,BX+(a%N)*CS,BY+(a/N|0)*CS,hor?2*CS:CS,hor?CS:2*CS,7);x.stroke();x.restore()}
    merchant();
    /* floating numbers */
    floats=floats.filter(f=>(f.t-=1/60)>0);for(const f of floats){x.globalAlpha=Math.min(1,f.t*2);x.font=`22px ${DISPLAY}`;x.textAlign='center';x.textBaseline='middle';x.lineWidth=5;x.lineJoin='round';x.strokeStyle=K.edge;const yy=f.y-(1.4-f.t)*26;x.strokeText(f.s,f.x,yy);x.fillStyle=f.c;x.fillText(f.s,f.x,yy)}x.globalAlpha=1;
    drawDie();
  }
  S.loop(dt=>{
    for(let i=tw.length-1;i>=0;i--){const a=tw[i];a.t+=dt*1000;const k=Math.min(1,a.t/a.ms);a.f(k);if(k>=1){tw.splice(i,1);a.r()}}
    if(flash.t>0)flash.t-=dt*.6;
    let da=mTarget-mang;while(da>Math.PI)da-=2*Math.PI;while(da<-Math.PI)da+=2*Math.PI;mang+=da*Math.min(1,dt*14);
    draw();
  });
  /* ---------- movement path ---------- */
  function pathOf(stp){
    const a=E.id(stp.from.r,stp.from.c),b=E.id(stp.to.r,stp.to.c),A={x:cx(a),y:cy(a)},B={x:cx(b),y:cy(b)},h=CS/2;
    if(!stp.to.loop)return[A,B];
    const o1={x:RUGS_DC[stp.from.d],y:RUGS_DR[stp.from.d]},pts=[A];
    if(stp.to.loop===1){
      const Mx=(A.x+B.x)/2+o1.x*h,My=(A.y+B.y)/2+o1.y*h,a0=Math.atan2(A.y+o1.y*h-My,A.x+o1.x*h-Mx);
      const sg=(Math.cos(a0+Math.PI/2)*o1.x+Math.sin(a0+Math.PI/2)*o1.y)>0?1:-1;
      for(let k=0;k<=16;k++){const t=a0+sg*Math.PI*k/16;pts.push({x:Mx+Math.cos(t)*h,y:My+Math.sin(t)*h})}
    }else{
      const o2={x:-RUGS_DC[stp.to.d],y:-RUGS_DR[stp.to.d]},Kx=A.x+(o1.x+o2.x)*h,Ky=A.y+(o1.y+o2.y)*h,a0=Math.atan2(A.y+o1.y*h-Ky,A.x+o1.x*h-Kx);
      const a1=Math.atan2(A.y+o2.y*h-Ky,A.x+o2.x*h-Kx);let sw=a1-a0;while(sw<=0)sw+=2*Math.PI;if(Math.abs(sw-1.5*Math.PI)>.1)sw-=2*Math.PI;
      for(let k=0;k<=24;k++){const t=a0+sw*k/24;pts.push({x:Kx+Math.cos(t)*h,y:Ky+Math.sin(t)*h})}
    }
    pts.push(B);return pts;
  }
  async function animStep(stp){
    const pts=pathOf(stp),seg=[];let tot=0;for(let i=1;i<pts.length;i++){const l=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);seg.push(l);tot+=l}
    beep(stp.to.loop?520:440,50);
    await tween(stp.to.loop?(REDUCED?120:420):(REDUCED?80:230),k=>{
      const e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;let d=e*tot,i=0;while(i<seg.length-1&&d>seg[i]){d-=seg[i];i++}
      const t=seg[i]?d/seg[i]:1,P=pts[i],Q=pts[i+1];mx=P.x+(Q.x-P.x)*t;my=P.y+(Q.y-P.y)*t;if(seg[i]>.5)mTarget=Math.atan2(Q.y-P.y,Q.x-P.x);
    });
    mTarget=dirAng(stp.to.d);
  }
  /* ---------- turn flow ---------- */
  function ui(){
    const human=!over&&!isAI(cur)&&(phase==='dir'||phase==='place'),dirP=human&&phase==='dir',plP=human&&phase==='place';
    [bL,bU,bR,bRoll].forEach(b=>{b.style.display=plP?'none':'';b.disabled=!dirP});
    [bTurn,bPlace].forEach(b=>b.style.display=plP?'':'none');
    bPlace.disabled=!prev;bTurn.disabled=!prev||cands(sel).length<2;
    [[bL,-1],[bU,0],[bR,1]].forEach(([b,o])=>b.classList.toggle('rg-on',dirP&&off===o));
    bRoll.classList.toggle('rg-go',dirP);
  }
  const cands=i=>i<0?[]:legalL.filter(([a,b])=>a===i||b===i);
  const active=()=>[...Array(NP).keys()].filter(p=>!s.out[p]);
  function setOff(o){if(phase!=='dir'||isAI(cur)&&!aiBusy)return;off=o;mTarget=dirAng((baseD+off+4)%4);beep(600+o*80,40);if(!isAI(cur))dirHint();ui()}
  function dirHint(){
    const cs=cost(cur),e=cs.reduce((a,o)=>a+o.t.n*(o.k===2||o.k===3?2:1),0)/6;
    hint=(TWO?NAMES[cur]+': p':'P')+'ick a direction, then Roll\n'+(e>0?`Expected toll ${e.toFixed(1)} coin${e>=.95&&e<1.05?'':'s'}`:'No toll risk this way');
  }
  let aiBusy=false;
  function startTurn(){
    if(over)return;
    const act=active();
    if((!TWO&&s.out[0])||act.length<=1||act.every(p=>s.left[p]===0)){finish();return}
    let guard=0;while((s.out[cur]||s.left[cur]===0)&&guard++<NP)cur=(cur+1)%NP;
    baseD=s.m.d;off=0;phase='dir';prev=null;sel=-1;die.show=false;
    if(isAI(cur)){hint=`${NAMES[cur]} is thinking…`;ui();aiTurn();return}
    dirHint();st(TWO?`Your turn, ${NAMES[cur]}: turn the merchant if you like, then roll.`:'Your turn: turn the merchant if you like, then roll.');ui();
  }
  async function aiTurn(){
    aiBusy=true;await wait(500);const o=E.bestDir(s,cur);
    if(o!==0){setOff(o);await wait(450)}
    aiBusy=false;await roll();
  }
  async function roll(){
    if(phase!=='dir')return;phase='anim';ui();s.m.d=(baseD+off+4)%4;
    const v=RUGS_DIE[rand(6)];die.show=true;hint=`${NAMES[cur]} ${isAI(cur)||TWO?'rolls':'roll'}…`;
    let lastF=-1;await tween(REDUCED?100:650,k=>{die.rot=(1-k)*(1-k)*9;const f=Math.floor(k*9);if(f!==lastF&&k<1){lastF=f;die.v=RUGS_DIE[rand(6)];beep(300+rand(200),25,'square')}});
    die.v=v;die.rot=0;beep(760,90);hint=`${NAMES[cur]} ${isAI(cur)||TWO?'rolls':'rolled'} ${v}`;
    await wait(250);
    const{end,steps}=E.walk(s.m,v);for(const stp of steps)await animStep(stp);
    s.m=end;mx=cx(M());my=cy(M());mTarget=dirAng(end.d);
    await wait(200);
    const t=E.toll(s,cur,M());
    if(t.n>0||t.o>=0){
      s.coins[cur]-=t.n;s.coins[t.o]+=t.n;flash={cells:t.cells,t:1.6};
      const pw=(W-6*(NP+1))/NP,px=p=>6+p*(pw+6)+pw/2;floats.push({x:px(cur),y:PH+16,s:'−'+t.n,c:K.c1,t:1.4},{x:px(t.o),y:PH+16,s:'+'+t.n,c:'#FFC53D',t:1.4});
      beep(880,80);S.after(110,()=>beep(990,80));
      const who=cur===0&&!TWO?'You pay':`${NAMES[cur]} pays`;st(`${who} ${NAMES[t.o]} ${t.n} coin${t.n===1?'':'s'}.`);hint=`${who} ${NAMES[t.o]} ${t.n}`;
      await wait(900);
      if(s.coins[cur]<=0){s.out[cur]=true;S.shake();beep(150,350,'sawtooth');st(`${cur===0&&!TWO?'You are':NAMES[cur]+' is'} out of coins!`);await wait(900);cur=(cur+1)%NP;startTurn();return}
    }
    legalL=E.legal(s);phase='place';sel=-1;prev=null;kbI=-1;
    if(!legalL.length){cur=(cur+1)%NP;startTurn();return}
    if(isAI(cur)){
      hint=`${NAMES[cur]} lays a rug…`;ui();const{pl}=E.bestPlace(s,cur);prev=pl;await wait(650);commit();return;
    }
    hint=(TWO?NAMES[cur]+': t':'T')+'ap a square next to the merchant\nthen ✓ Place';st(TWO?`Your turn, ${NAMES[cur]}: lay a rug next to the merchant.`:'Your turn: lay a rug next to the merchant.');ui();
  }
  function commit(){
    if(phase!=='place'||!prev)return;const[a,b]=prev;if(!E.isLegal(s,a,b))return;
    const k=E.place(s,cur,a,b);prev=null;sel=-1;phase='wait';beep(330,70);S.after(70,()=>beep(495,90));
    pop={k,sc:1.25};tween(REDUCED?60:260,t=>{pop.sc=1.25-.25*(1-Math.pow(1-t,3))}).then(()=>{pop=null});
    ui();cur=(cur+1)%NP;S.after(350,startTurn);
  }
  function tapCell(i){
    if(phase!=='place'||isAI(cur)||over)return;
    if(sel>=0&&i!==sel&&E.isLegal(s,sel,i)){prev=[Math.min(sel,i),Math.max(sel,i)];beep(560,40);ui();return}
    const cs=cands(i);if(!cs.length){sel=-1;prev=null;beep(180,80,'square');ui();return}
    if(prev&&prev.includes(i)&&sel===i){turnPrev();return}
    sel=i;const keep=prev&&cs.find(p=>p[0]===prev[0]&&p[1]===prev[1]);prev=keep||cs[0];beep(520,40);ui();
  }
  function turnPrev(){const cs=cands(sel);if(cs.length<2)return;const k=cs.findIndex(p=>prev&&p[0]===prev[0]&&p[1]===prev[1]);prev=cs[(k+1)%cs.length];beep(600,40);ui()}
  function finish(){
    over=true;phase='over';prev=null;const sc=E.scores(s);let bestS=Math.max(...sc);
    let win=[...Array(NP).keys()].filter(p=>sc[p]===bestS);
    if(win.length>1){const bc=Math.max(...win.map(p=>s.coins[p]));win=win.filter(p=>s.coins[p]===bc)}
    res={sc,win};ui();const vis=E.visible(s);
    if(!TWO&&s.out[0]){hint='You ran out of coins\nPress ↻ to play again';st('You ran out of coins. Press ↻ to play again.');S.shake();beep(150,400,'sawtooth');return}
    const wn=win.map(p=>NAMES[p]).join(' & ');
    if(TWO){hint=`${wn} win${win.length>1?'':'s'}!\nCoins + visible rug squares`;st(`${wn} win${win.length>1?'':'s'} with ${bestS} points. Press ↻ for a rematch.`);S.fx.confetti();S.fx.banner(win.length>1?"It's a tie!":`${wn} wins!`);beep(990,300);return}
    const me=sc[0],nb=best('rugs'+L,me);
    if(win.includes(0)){hint=`You win with ${me}!\n${s.coins[0]} coins + ${vis[0]} squares${nb?' · new best':''}`;st(`You win with ${me} points (${s.coins[0]} coins + ${vis[0]} squares).${nb?' New best!':''}`);beep(990,300);S.after(500,S.next)}
    else{hint=`${wn} wins with ${bestS}\nYou scored ${me}. Press ↻ to try again`;st(`${wn} wins with ${bestS}. You scored ${me}. Press ↻ to play again.`);S.shake();beep(150,400,'sawtooth')}
  }
  /* ---------- input ---------- */
  S.on(bL,'click',()=>setOff(-1));S.on(bU,'click',()=>setOff(0));S.on(bR,'click',()=>setOff(1));
  S.on(bRoll,'click',()=>{if(!isAI(cur))roll()});S.on(bPlace,'click',commit);S.on(bTurn,'click',turnPrev);
  S.on(c,'click',e=>{
    const p=c.pos(e);const col=Math.floor((p.x-BX)/CS),r=Math.floor((p.y-BY)/CS);
    if(col>=0&&col<N&&r>=0&&r<N){tapCell(r*N+col);return}
    if(phase==='dir'&&!isAI(cur)&&p.y>BY+N*CS+MG)roll();
  });
  S.on(window,'keydown',e=>{
    if(over||isAI(cur))return;const k=e.key;
    if(phase==='dir'){
      if(k==='ArrowLeft'||k==='a'||k==='A'){setOff(-1);e.preventDefault()}else if(k==='ArrowRight'||k==='d'||k==='D'){setOff(1);e.preventDefault()}
      else if(k==='ArrowUp'||k==='w'||k==='W'){setOff(0);e.preventDefault()}else if(k===' '||k==='Enter'){roll();e.preventDefault()}
    }else if(phase==='place'){
      if(k.startsWith('Arrow')){e.preventDefault();kbI=(kbI+(k==='ArrowLeft'||k==='ArrowUp'?-1:1)+legalL.length)%legalL.length;prev=legalL[kbI];sel=prev[0];beep(520,30);ui()}
      else if(k===' '||k==='Enter'){e.preventDefault();if(prev)commit();else{kbI=0;prev=legalL[0];sel=prev[0];ui()}}
      else if(k==='r'||k==='R')turnPrev();
    }
  });
  if(window.__rugsTest)window.__rugsTest({get s(){return s},get cur(){return cur},get phase(){return phase},get prev(){return prev},get legal(){return legalL},get res(){return res},E,tapCell,commit,roll,setOff,cx,cy,BX,BY,CS,setState(f){f(s);mx=cx(M());my=cy(M());mTarget=dirAng(s.m.d);startTurn()}});
  startTurn();
}

/* Four Alike: 4x4 board, 16 pieces. Piece bits: 1 tall, 2 dark, 4 square, 8 hollow (0 = short, light, round, solid).
   Board b[16] holds a piece number or -1. The player to move places the piece in hand, then gives one to the opponent. */
const QUAD=(()=>{
  const LINES=[],LOF=[...Array(16)].map(()=>[]);
  for(let i=0;i<4;i++){LINES.push([0,1,2,3].map(k=>i*4+k));LINES.push([0,1,2,3].map(k=>k*4+i))}
  LINES.push([0,5,10,15],[3,6,9,12]);
  for(const l of LINES)for(const i of l)LOF[i].push(l);
  const WIN=1000;
  /* shared traits of a full line: {and: bits all set, nor: bits all clear}, or null */
  function share(b,l){const a=b[l[0]],x=b[l[1]],y=b[l[2]],z=b[l[3]];if(a<0||x<0||y<0||z<0)return null;const and=a&x&y&z,nor=~(a|x|y|z)&15;return and|nor?{and,nor}:null}
  function lineFull(b,l){const a=b[l[0]],x=b[l[1]],y=b[l[2]],z=b[l[3]];if(a<0||x<0||y<0||z<0)return false;return((a&x&y&z)|(~(a|x|y|z)&15))!==0}
  function winAt(b,c){for(const l of LOF[c])if(lineFull(b,l))return l;return null}
  /* cell where piece p wins at once, or -1 */
  function winCell(b,p){
    for(let c=0;c<16;c++){if(b[c]>=0)continue;b[c]=p;const w=winAt(b,c);b[c]=-1;if(w)return c}
    return -1;
  }
  function nm(b,p,av,depth,alpha,beta,ply,ctx){
    if((++ctx.nodes&255)===0&&performance.now()>ctx.deadline)ctx.stop=true;
    if(ctx.stop)return 0;
    if(winCell(b,p)>=0)return WIN-ply;
    if(!av.length||depth===0)return 0;
    let best=-Infinity;
    for(let c=0;c<16;c++){
      if(b[c]>=0)continue;b[c]=p;let any=false;
      for(let k=0;k<av.length;k++){
        const q=av[k];if(winCell(b,q)>=0)continue;any=true;
        const rest=av.slice(0,k).concat(av.slice(k+1));
        const v=-nm(b,q,rest,depth-1,-beta,-alpha,ply+1,ctx);
        if(ctx.stop){b[c]=-1;return 0}
        if(v>best)best=v;if(v>alpha)alpha=v;if(alpha>=beta){b[c]=-1;return best}
      }
      if(!any){const v=-(WIN-ply-1);if(v>best)best=v;if(v>alpha)alpha=v}
      b[c]=-1;if(alpha>=beta)break;
    }
    return best;
  }
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  /* AI: place piece p (av = pieces left to give afterwards), returns {cell, give} (give -1 when none left) */
  function ai(b,p,av,level,ms){
    b=b.slice();
    const empties=[...Array(16).keys()].filter(c=>b[c]<0);
    const giveFor=(c,safeOnly)=>{b[c]=p;const safe=av.filter(q=>winCell(b,q)<0);b[c]=-1;return safeOnly?safe:(safe.length?safe:av)};
    const w=winCell(b,p);
    if(level===1){
      if(w>=0&&Math.random()<.6)return{cell:w,give:pick(av.length?av:[-1])};
      const c=pick(empties);if(!av.length)return{cell:c,give:-1};
      return{cell:c,give:Math.random()<.5?pick(giveFor(c)):pick(av)};
    }
    if(w>=0)return{cell:w,give:av.length?av[0]:-1};
    if(!av.length)return{cell:empties[0],give:-1};
    /* pairs that do not hand over a win */
    let pairs=[];for(const c of empties)for(const q of giveFor(c,true))pairs.push([c,q]);
    if(!pairs.length)return{cell:pick(empties),give:pick(av)};
    if(level===2)return((m)=>({cell:m[0],give:m[1]}))(pick(pairs));
    /* Hard: iterative deepening over (cell, give) pairs */
    const ctx={nodes:0,stop:false,deadline:performance.now()+(ms||230)};
    shuffle4(pairs);let bestP=pairs[0];
    for(let d=1;d<=av.length;d++){
      let a=-Infinity,sc=[];
      for(const pr of pairs){
        const[c,q]=pr;b[c]=p;const rest=av.filter(x=>x!==q);
        const v=-nm(b,q,rest,d-1,-Infinity,-a+1,1,ctx);b[c]=-1;
        if(ctx.stop)break;sc.push([v,pr]);if(v>a)a=v;
      }
      if(ctx.stop)break;
      const top=sc.filter(x=>x[0]===a).map(x=>x[1]);bestP=pick(top);
      pairs=[bestP,...pairs.filter(x=>x!==bestP)];
      if(a>=WIN-50||a<=-(WIN-50)){
        /* when every pair loses, keep the one that loses latest */
        if(a<=-(WIN-50))bestP=sc.reduce((m,x)=>x[0]>m[0]?x:m)[1];
        break;
      }
    }
    return{cell:bestP[0],give:bestP[1]};
  }
  function shuffle4(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
  const TRAIT=[['short','tall'],['light','dark'],['round','square'],['solid','hollow']];
  const traits=p=>TRAIT.map((t,i)=>t[(p>>i)&1]);
  /* piece drawing, viewBox 0 0 100 100 */
  function svg(p){
    const T=p&1,D=p&2,Q=p&4,Hh=p&8,bot=Q?86:84,top=bot-(T?58:30),k=D?'dk':'lt';
    let s=`<svg viewBox="14 10 72 88" class="qa-pc ${k}" aria-hidden="true">`;
    if(Q){
      s+=`<polygon class="sd" points="70,${top} 82,${top-10} 82,${bot-10} 70,${bot}"/>`+
        `<rect class="fr" x="18" y="${top}" width="52" height="${bot-top}"/>`+
        `<rect class="hl" x="24" y="${top+4}" width="7" height="${bot-top-8}" rx="3"/>`+
        `<polygon class="tp" points="18,${top} 30,${top-10} 82,${top-10} 70,${top}"/>`+
        (Hh?`<ellipse class="ho" cx="50" cy="${top-5}" rx="15" ry="4.4"/>`:'');
    }else{
      s+=`<path class="fr" d="M20,${top} L20,${bot} A30,10 0 0 0 80,${bot} L80,${top} Z"/>`+
        `<rect class="hl" x="27" y="${top+5}" width="7" height="${bot-top-2}" rx="3"/>`+
        `<ellipse class="tp" cx="50" cy="${top}" rx="30" ry="10"/>`+
        (Hh?`<ellipse class="ho" cx="50" cy="${top}" rx="16" ry="5.4"/>`:'');
    }
    return s+'</svg>';
  }
  return{LINES,LOF,WIN,share,winAt,winCell,ai,traits,svg,nm};
})();

function quadgame(root,S){
  const L=S.level,TWO=L===4,Q=QUAD;
  const NM=TWO?['Player 1','Player 2']:['You','Computer'];
  const st=status(root,TWO?'Player 1 picks a piece for Player 2. Place the piece you are given, then pick one for your rival. Four in a line that share a trait wins.':'Pick a piece for the computer, then place the piece it gives you. Four in a line that share a trait (tall, dark, square or hollow, or the opposite) wins.');
  const bar=el('div','qa-bar',root);
  const chips=NM.map((n,k)=>{const e=el('div','qa-who p'+k,bar,'<i></i><b></b>');e.querySelector('b').textContent=n;return e});
  const gm=document.querySelector('#game');let WIDE=false,PC=8;
  const w=el('div','qa-wrap',root);
  /* wide screens put the pieces beside the board; re-checked when the phone is rotated */
  const shape=()=>{WIDE=!!gm&&gm.clientWidth>gm.clientHeight*1.25;PC=WIDE?4:8;w.classList.toggle('wide',WIDE);w.dataset.ar=WIDE?1.72:1/1.58;w.dataset.max=WIDE?820:500};
  shape();S.on(window,'resize',()=>{const was=WIDE;shape();if(was!==WIDE&&typeof fit==='function')fit()});
  const bd=el('div','qa-board',w);
  const cells=[...Array(16)].map((_,i)=>{const e=el('button','qa-cell',bd);e.style.animationDelay=i*25+'ms';e.setAttribute('aria-label','Square '+(i+1));S.on(e,'click',()=>tapCell(i));return e});
  const side=el('div','qa-side',w);
  const hand=el('div','qa-hand',side);
  const slot=el('div','qa-slot',hand),txt=el('div','qa-txt',hand,'<b></b><small></small>');
  const giveB=el('button','btn qa-give',hand,'Give');S.on(giveB,'click',()=>{if(sel>=0&&canAct()&&phase==='pick')give(sel)});
  const pool=el('div','qa-pool',side);
  /* pool order: light pieces on the top row, dark on the bottom */
  const qk=p=>(p&2?8:0)+(p&4?4:0)+(p&8?2:0)+(p&1),ORDER=[...Array(16).keys()].sort((a,c)=>qk(a)-qk(c));
  const pbtn={};
  ORDER.forEach((p,k)=>{const e=el('button','qa-pp',pool,Q.svg(p));e.style.animationDelay=(k*25+200)+'ms';e.setAttribute('aria-label',Q.traits(p).join(' '));S.on(e,'click',()=>tapPool(p));pbtn[p]=e});
  const b=Array(16).fill(-1),used=Array(16).fill(false);
  let cur=-1,sel=-1,turn=0,phase='pick',over=false,busy=false,kb=false,kArea='pool',kc=0;
  const canAct=()=>!over&&!busy&&(TWO||turn===0);
  const avail=()=>ORDER.filter(p=>!used[p]&&p!==cur);
  const traitTxt=p=>Q.traits(p).map(t=>t[0].toUpperCase()+t.slice(1)).join(' · ');
  function say(){
    if(over)return;
    if(TWO)st(`Your turn, ${NM[turn]}: ${phase==='place'?'place the piece':'pick a piece for '+NM[turn^1]}.`);
    else if(turn===0)st(phase==='place'?'Your turn: place the piece.':'Your turn: pick a piece for the computer.');
    else st('Computer is thinking…');
  }
  function paint(){
    const act=canAct();
    chips.forEach((e,k)=>e.classList.toggle('on',!over&&turn===k));
    cells.forEach((e,i)=>{e.classList.toggle('can',act&&phase==='place'&&b[i]<0);e.classList.toggle('kb',kb&&act&&kArea==='board'&&kc===i)});
    for(const p of ORDER){const e=pbtn[p];e.classList.toggle('gone',used[p]||p===cur);e.classList.toggle('can',act&&phase==='pick'&&!used[p]);e.classList.toggle('sel',p===sel);e.classList.toggle('kb',kb&&act&&kArea==='pool'&&ORDER[kc]===p)}
    const show=phase==='place'?cur:sel;
    if(slot.dataset.p!=String(show)){slot.dataset.p=show;slot.innerHTML=show>=0?Q.svg(show):'';if(show>=0)restartAnim(slot,'pop')}
    hand.classList.toggle('placing',phase==='place'&&!over);
    const B=txt.querySelector('b'),sm=txt.querySelector('small');
    if(over){B.textContent=over.title;sm.textContent=over.sub}
    else if(phase==='place'){B.textContent=act?'Place this piece':TWO?`${NM[turn]} places`:'Computer places it';sm.textContent=traitTxt(cur)}
    else if(act){B.textContent=`Pick a piece for ${TWO?NM[turn^1]:'the computer'}`;sm.textContent=sel>=0?traitTxt(sel):'Tap a piece below'}
    else{B.textContent='Computer is picking…';sm.textContent=sel>=0?traitTxt(sel):''}
    giveB.hidden=!(act&&phase==='pick'&&sel>=0);
  }
  function tapPool(p){
    if(!canAct()||phase!=='pick'||used[p])return;
    kArea='pool';kc=ORDER.indexOf(p);
    if(sel===p){give(p);return}
    sel=p;beep(620,40);paint();
  }
  function tapCell(i){
    if(!canAct()||phase!=='place')return;
    if(b[i]>=0){restartAnim(cells[i],'nope');beep(140,80,'sawtooth');return}
    kArea='board';kc=i;place(i);
  }
  function place(i){
    b[i]=cur;used[cur]=true;const p=cur;cur=-1;
    cells[i].innerHTML=Q.svg(p);cells[i].classList.add('full');beep(p&1?300:380,90);
    const l=Q.winAt(b,i);
    if(l){finish(turn,l);return true}
    if(used.every(x=>x)){over={title:'Draw',sub:'No line of four alike'};st("Board full with no match. It's a draw! Press ↻ to play again.");paint();return true}
    phase='pick';sel=-1;kArea='pool';kc=Math.max(0,ORDER.findIndex(q=>!used[q]));
    say();paint();return false;
  }
  function give(p){
    cur=p;sel=-1;turn^=1;phase='place';beep(520,60);beep(780,60);
    kArea='board';kc=Math.max(0,b.indexOf(-1));
    say();paint();
    if(!TWO&&turn===1)aiTurn();
  }
  function aiTurn(){
    busy=true;paint();
    S.after(520,()=>{
      const m=Q.ai(b,cur,avail(),L);
      if(place(m.cell))return;
      sel=m.give;paint();
      S.after(650,()=>{busy=false;give(m.give)});
    });
  }
  function finish(who,l){
    const sh=Q.share(b,l),names=[];
    for(let i=0;i<4;i++){if(sh.and>>i&1)names.push(Q.traits(15)[i]);if(sh.nor>>i&1)names.push(Q.traits(0)[i])}
    const what=names.join(', ');
    over={title:`${TWO?NM[who]+' wins':who===0?'You win':'Computer wins'}!`,sub:`Four ${what} pieces in a line`};
    S.after(250,()=>{bd.classList.add('done');l.forEach((j,k)=>{cells[j].classList.add('win');cells[j].style.animationDelay=k*90+'ms'})});
    if(TWO){st(`Four ${what} pieces! ${NM[who]} wins! Press ↻ for a rematch.`);S.after(600,()=>{S.fx.confetti();S.fx.banner(`${NM[who]} wins!`);beep(990,300)})}
    else if(who===0){st(`Four ${what} pieces in a line! You win!`);S.after(800,S.next)}
    else{st(`The computer lined up four ${what} pieces. Press ↻ to try again.`);S.after(600,()=>{S.shake();beep(150,400,'sawtooth')})}
    paint();
  }
  S.on(window,'keydown',e=>{
    const k=e.key,D={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[k];
    if(D){
      e.preventDefault();kb=true;
      if(phase==='place'){kArea='board';kc=clamp(kc%4+D[0],0,3)+4*clamp((kc>>2)+D[1],0,3)}
      else{kArea='pool';kc=clamp(kc%PC+D[0],0,PC-1)+PC*clamp(Math.floor(kc/PC)+D[1],0,16/PC-1)}
      beep(600,15);paint();
    }else if(k==='Enter'||k===' '){
      e.preventDefault();kb=true;if(!canAct())return;
      if(phase==='place')tapCell(kc);
      else if(kArea==='pool')tapPool(ORDER[kc]);
    }
  });
  say();paint();
}

/* Cube Push: 5x5 cubes, cell r*5+c, value 0 blank, 1 = X, -1 = O.
   A move takes border cube f (blank or own) and pushes it back in at end e of its row or column (e != f). */
const CUBEP=(()=>{
  const LINES=[];
  for(let i=0;i<5;i++){LINES.push([0,1,2,3,4].map(k=>i*5+k));LINES.push([0,1,2,3,4].map(k=>k*5+i))}
  LINES.push([0,6,12,18,24],[4,8,12,16,20]);
  const BORDER=[];for(let i=0;i<25;i++){const r=i/5|0,c=i%5;if(r===0||r===4||c===0||c===4)BORDER.push(i)}
  /* MV[f] = list of moves {f,e,path,dir}: path runs from f to e; dir = push direction (where the line moves) */
  const MV={};
  for(const f of BORDER){
    const r=f/5|0,c=f%5,out=[];
    for(const[e,dir]of[[r*5,'right'],[r*5+4,'left'],[c,'down'],[20+c,'up']]){
      if(e===f||out.some(m=>m.e===e))continue;
      const er=e/5|0,ec=e%5,path=[];
      if(er===r){const s=ec>c?1:-1;for(let k=c;k!==ec+s;k+=s)path.push(r*5+k)}
      else{const s=er>r?1:-1;for(let k=r;k!==er+s;k+=s)path.push(k*5+c)}
      out.push({f,e,path,dir});
    }
    MV[f]=out;
  }
  const ALL=BORDER.flatMap(f=>MV[f]);
  const moves=(b,p)=>ALL.filter(m=>b[m.f]===0||b[m.f]===p);
  function apply(b,m,p){const P=m.path,old=b[P[0]];for(let k=0;k<P.length-1;k++)b[P[k]]=b[P[k+1]];b[P[P.length-1]]=p;return old}
  function undo(b,m,old){const P=m.path;for(let k=P.length-1;k>0;k--)b[P[k]]=b[P[k-1]];b[P[0]]=old}
  function five(b,p){for(const l of LINES)if(b[l[0]]===p&&b[l[1]]===p&&b[l[2]]===p&&b[l[3]]===p&&b[l[4]]===p)return l;return null}
  /* winner after side p moved: opponent's line beats the mover's */
  function result(b,p){if(five(b,-p))return -p;if(five(b,p))return p;return 0}
  const WT=[0,1,4,12,40,0],WIN=1e5;
  function evalB(b,p){
    let v=0;
    for(const l of LINES){let a=0,o=0;for(const i of l){const q=b[i];if(q===p)a++;else if(q===-p)o++}v+=WT[a]-WT[o]}
    return v;
  }
  function nega(b,p,depth,alpha,beta,ply,ctx){
    if((++ctx.nodes&255)===0&&performance.now()>ctx.deadline)ctx.stop=true;
    if(ctx.stop)return 0;
    const ms=moves(b,p);let best=-Infinity;
    for(const m of ms){
      const old=apply(b,m,p),r=result(b,p);let v;
      if(r===p)v=WIN-ply;else if(r===-p)v=-(WIN-ply);
      else v=depth<=1?evalB(b,p):-nega(b,-p,depth-1,-beta,-alpha,ply+1,ctx);
      undo(b,m,old);
      if(ctx.stop)return 0;
      if(v>best)best=v;if(v>alpha)alpha=v;if(alpha>=beta)break;
    }
    return best;
  }
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  function best(b0,p,level,ms){
    const b=b0.slice(),all=moves(b,p);
    const out=m=>{const old=apply(b,m,p),r=result(b,p);undo(b,m,old);return r};
    const wins=all.filter(m=>out(m)===p),safe=all.filter(m=>out(m)!==-p);
    if(level===1){
      if(wins.length&&Math.random()<.6)return pick(wins);
      return pick(safe.length&&Math.random()<.75?safe:all);
    }
    if(wins.length)return pick(wins);
    const ctx={nodes:0,stop:false,deadline:performance.now()+(ms||(level===2?120:240))};
    let order=all.slice();for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]]}
    let bestM=safe.length?pick(safe):order[0];
    const maxD=level===2?2:5;
    for(let d=1;d<=maxD;d++){
      let a=-Infinity,sc=[];
      for(const m of order){
        const old=apply(b,m,p),r=result(b,p);let v;
        if(r===p)v=WIN;else if(r===-p)v=-WIN;
        else v=d===1?evalB(b,p):-nega(b,-p,d-1,-Infinity,-a+1,1,ctx);
        undo(b,m,old);if(ctx.stop)break;
        if(level===2)v+=Math.random()*3;
        sc.push([v,m]);if(v>a)a=v;
      }
      if(ctx.stop)break;
      sc.sort((x,y)=>y[0]-x[0]);bestM=sc[0][1];
      order=sc.map(x=>x[1]).concat(order.filter(m=>!sc.some(x=>x[1]===m)));
      if(a>=WIN-50)break;
    }
    return bestM;
  }
  return{LINES,BORDER,MV,ALL,moves,apply,undo,five,result,best,evalB};
})();

function cubepush(root,S){
  const L=S.level,TWO=L===4,C=CUBEP;
  const NM={1:TWO?'X':'You','-1':TWO?'O':'Computer'};
  const st=status(root,TWO?'X goes first. Tap a border cube (blank or yours), then an arrow to push it back in. Five in a row wins.':'You are X. Tap a border cube that is blank or yours, then tap an arrow to push it back into the line. Get five X in a row.');
  const bar=el('div','cp-bar',root);
  const chips=[1,-1].map(p=>{const e=el('div','cp-who '+(p>0?'x':'o'),bar,`<i>${p>0?'X':'O'}</i><b></b>`);e.querySelector('b').textContent=NM[p];return e});
  const w=el('div','cp-wrap',root);w.dataset.ar=1/1.03;w.dataset.max=540;
  el('div','cp-plate',w);
  const SYM={1:'<svg viewBox="0 0 40 40" class="sx"><path d="M10 10L30 30M30 10L10 30"/></svg>','-1':'<svg viewBox="0 0 40 40" class="so"><circle cx="20" cy="20" r="11"/></svg>',0:''};
  const b=new Array(25).fill(0),node=[];
  const pos=(e,r,c)=>{e.style.setProperty('--r',r);e.style.setProperty('--c',c)};
  for(let i=0;i<25;i++){const e=el('div','cp-cube',w,'<span></span>');pos(e,i/5|0,i%5);e.style.animationDelay=i*18+'ms';node[i]=e;S.on(e,'click',()=>tap(node.indexOf(e)))}
  const arrows=[];
  let turn=1,sel=-1,over=false,busy=false,kb=false,kc=0,plies=0;const seen={};
  const human=()=>!over&&!busy&&(TWO||turn===1);
  const can=i=>!!C.MV[i]&&(b[i]===0||b[i]===turn);
  /* margin spot just outside end e for push direction dir */
  const outside=(e,dir)=>{const r=e/5|0,c=e%5;return dir==='right'?[r,-1]:dir==='left'?[r,5]:dir==='down'?[-1,c]:[5,c]};
  const ARW={right:'▶',left:'◀',down:'▼',up:'▲'};
  function say(){
    if(over)return;
    if(TWO)st(`Your turn, ${NM[turn]}: ${sel<0?'pick a border cube':'tap an arrow to push it in'}.`);
    else if(turn===1)st(sel<0?'Your turn: pick a border cube.':'Your turn: tap an arrow to push it in.');
    else st('Computer is thinking…');
  }
  function paint(){
    const act=human();
    chips.forEach((e,k)=>e.classList.toggle('on',!over&&turn===(k?-1:1)));
    const tg=sel>=0?C.MV[sel].map(m=>m.e):[];
    node.forEach((e,i)=>{e.classList.toggle('can',act&&sel<0&&can(i));e.classList.toggle('sel',i===sel);e.classList.toggle('tgt',act&&tg.includes(i)&&i!==sel);e.classList.toggle('kb',kb&&act&&i===kc)});
    arrows.splice(0).forEach(a=>a.remove());
    if(sel>=0&&act)for(const m of C.MV[sel]){
      const [r,c]=outside(m.e,m.dir),a=el('button','cp-arr '+m.dir,w,`<span>${ARW[m.dir]}</span>`);pos(a,r,c);a.setAttribute('aria-label','Push '+m.dir);
      S.on(a,'click',()=>doMove(m));arrows.push(a);
    }
  }
  function tap(i){
    if(!human())return;
    if(sel>=0){
      if(i===sel){sel=-1;beep(300,40);say();paint();return}
      const m=C.MV[sel].find(m=>m.e===i);if(m){doMove(m);return}
    }
    if(!C.MV[i]){restartAnim(node[i],'nope');beep(140,80,'sawtooth');return}
    if(!can(i)){restartAnim(node[i],'nope');beep(140,80,'sawtooth');st(`You can't take ${b[i]===1?'an X':'an O'} cube.`);return}
    sel=i;kc=i;beep(620,40);say();paint();
  }
  function doMove(m){
    const p=turn,mv=node[m.f];sel=-1;busy=true;paint();
    C.apply(b,m,p);plies++;
    /* lift the cube out to the margin, turn it to the mover's symbol, then push the line */
    const P=m.path;for(let k=0;k<P.length-1;k++)node[P[k]]=node[P[k+1]];node[P[P.length-1]]=mv;
    mv.classList.add('fly');const[or,oc]=outside(m.e,m.dir);pos(mv,or,oc);mv.querySelector('span').innerHTML=SYM[p];mv.dataset.p=p;beep(440,50);
    S.after(230,()=>{
      for(const i of P)pos(node[i],i/5|0,i%5);beep(p>0?520:360,80);
      S.after(260,()=>{mv.classList.remove('fly');busy=false;after(p)});
    });
  }
  function after(p){
    const r=C.result(b,p);
    if(r){finish(r,p);return}
    const key=b.join('')+turn;seen[key]=(seen[key]||0)+1;
    if(seen[key]>=3||plies>=300){over=true;st('The same position came up three times. Draw! Press ↻ to play again.');paint();return}
    turn=-turn;say();paint();
    if(!TWO&&turn===-1){
      busy=true;paint();
      S.after(380,()=>{const m=C.best(b,-1,L);sel=m.f;node[m.f].classList.add('sel');S.after(420,()=>{node[m.f].classList.remove('sel');sel=-1;busy=false;turn=-1;doMove(m)})});
    }
  }
  function finish(win,mover){
    over=true;const l=C.five(b,win);
    S.after(150,()=>{w.classList.add('done');l.forEach((i,k)=>{node[i].classList.add('win');node[i].style.animationDelay=k*80+'ms'})});
    const gift=win!==mover;
    if(TWO){st(`${gift?NM[mover]+' made five '+NM[win]+'! ':''}${NM[win]} wins! Press ↻ for a rematch.`);S.after(500,()=>{S.fx.confetti();S.fx.banner(`${NM[win]} wins!`);beep(990,300)})}
    else if(win===1){st(gift?'The computer pushed five X in a row. You win!':'Five in a row! You win!');S.after(700,S.next)}
    else{st(gift?'Oops, you made five O in a row. The computer wins. Press ↻ to try again.':'The computer got five in a row. Press ↻ to try again.');S.after(500,()=>{S.shake();beep(150,400,'sawtooth')})}
    paint();
  }
  S.on(window,'keydown',e=>{
    const k=e.key,dir=KEYDIR[k];
    if(dir&&k.startsWith('Arrow')){
      e.preventDefault();kb=true;if(!human())return;
      if(sel>=0){const m=C.MV[sel].find(m=>m.dir===dir);if(m)doMove(m);else beep(140,60,'sawtooth');return}
      const D={left:[0,-1],right:[0,1],up:[-1,0],down:[1,0]}[dir];
      kc=clamp((kc/5|0)+D[0],0,4)*5+clamp(kc%5+D[1],0,4);beep(600,15);paint();
    }else if(k==='Enter'||k===' '){e.preventDefault();kb=true;tap(kc)}
    else if(k==='Escape'&&sel>=0){sel=-1;say();paint()}
  });
  say();paint();
}

/* Ball Pyramid: 30 spots in 4 levels (4x4, 3x3, 2x2, 1). Board value 0 empty, 1 = player 0, 2 = player 1. */
const PYRM=(()=>{
  const N=30,LV=[],RR=[],CC=[],BEL=[],ABV=[],IDX={};
  let k=0;for(let l=0;l<4;l++){const n=4-l;for(let r=0;r<n;r++)for(let c=0;c<n;c++){LV[k]=l;RR[k]=r;CC[k]=c;IDX[l+','+r+','+c]=k;k++}}
  const at=(l,r,c)=>IDX[l+','+r+','+c];
  for(let i=0;i<N;i++){const l=LV[i],r=RR[i],c=CC[i];BEL[i]=l?[at(l-1,r,c),at(l-1,r,c+1),at(l-1,r+1,c),at(l-1,r+1,c+1)]:[];ABV[i]=[]}
  for(let i=0;i<N;i++)for(const j of BEL[i])ABV[j].push(i);
  const TOP=29,WIN=1e5;
  const P={N,LV,RR,CC,BEL,ABV,TOP,WIN,
    make(){return{b:new Int8Array(N),res:[15,15]}},
    clone(s){return{b:s.b.slice(),res:s.res.slice()}},
    avail(b,i){if(b[i])return false;for(const j of BEL[i])if(!b[j])return false;return true},
    free(b,i){if(!b[i])return false;for(const j of ABV[i])if(b[j])return false;return true},
    /* spots ball f (own, free) may be raised to */
    raises(b,f){const o=[];if(!P.free(b,f)||LV[f]>2)return o;for(let t=16;t<N;t++)if(LV[t]>LV[f]&&P.avail(b,t)&&!BEL[t].includes(f))o.push(t);return o},
    /* does the ball at t complete a 2x2 of color col? */
    square(b,t,col){for(const a of ABV[t]){let ok=true;for(const j of BEL[a])if(b[j]!==col){ok=false;break}if(ok)return true}return false},
    ownFree(b,col){const o=[];for(let i=0;i<TOP;i++)if(b[i]===col&&P.free(b,i))o.push(i);return o},
    bases(s,p){
      const b=s.b,out=[],av=[];for(let i=0;i<N;i++)if(P.avail(b,i))av.push(i);
      if(s.res[p]>0)for(const t of av)out.push([-1,t]);
      for(let f=0;f<25;f++)if(b[f]===p+1&&P.free(b,f))for(const t of av)if(LV[t]>LV[f]&&!BEL[t].includes(f))out.push([f,t]);
      return out;
    },
    removals(b,col){
      const F1=P.ownFree(b,col),pairs=[];
      for(const a of F1){b[a]=0;for(const c of P.ownFree(b,col))if(c!==a&&(c>a||!F1.includes(c)))pairs.push([a,c]);b[a]=col}
      return pairs.length?pairs:F1.map(a=>[a]);
    },
    moves(s,p){
      const out=[],b=s.b,col=p+1;
      for(const[f,t]of P.bases(s,p)){
        if(f>=0)b[f]=0;b[t]=col;
        if(LV[t]<3&&P.square(b,t,col))for(const rm of P.removals(b,col))out.push({f,t,rm});
        else out.push({f,t,rm:[]});
        b[t]=0;if(f>=0)b[f]=col;
      }
      return out;
    },
    apply(s,p,m){const b=s.b;if(m.f<0)s.res[p]--;else b[m.f]=0;b[m.t]=p+1;for(const r of m.rm){b[r]=0;s.res[p]++}},
    undo(s,p,m){const b=s.b;for(let k=m.rm.length-1;k>=0;k--){b[m.rm[k]]=p+1;s.res[p]--}b[m.t]=0;if(m.f<0)s.res[p]++;else b[m.f]=p+1},
    legal(s,p,m){return P.moves(s,p).some(x=>x.f===m.f&&x.t===m.t&&x.rm.length===m.rm.length&&x.rm.every((r,k)=>r===m.rm[k]))},
    evalS(s,p){
      const b=s.b,me=p+1;let v=(s.res[p]-s.res[1-p])*20;
      for(let a=16;a<N;a++){
        let m=0,o=0,e=-1;for(const j of BEL[a]){const q=b[j];if(!q)e=j;else if(q===me)m++;else o++}
        if(m===3&&!o)v+=P.avail(b,e)?7:2;else if(o===3&&!m)v-=P.avail(b,e)?6:2;
        else if(m===2&&!o)v+=.5;else if(o===2&&!m)v-=.5;
      }
      for(let i=16;i<TOP;i++)if(b[i])v+=b[i]===me?1:-1;
      return v;
    },
    nega(s,p,depth,alpha,beta,ply,ctx){
      if((++ctx.nodes&63)===0&&performance.now()>ctx.deadline)ctx.stop=true;
      if(ctx.stop)return 0;
      if(s.b[TOP])return -(WIN-ply);
      if(s.res[p]<=0)return -(WIN-ply);
      if(depth<=0)return P.evalS(s,p);
      const ms=P.moves(s,p);
      ms.sort((a,b)=>(b.rm.length-a.rm.length)||(b.f>=0)-(a.f>=0));
      let best=-Infinity;
      for(const m of ms){
        P.apply(s,p,m);const v=-P.nega(s,1-p,depth-1,-beta,-alpha,ply+1,ctx);P.undo(s,p,m);
        if(ctx.stop)return 0;
        if(v>best)best=v;if(v>alpha)alpha=v;if(alpha>=beta)break;
      }
      return best;
    },
    best(s,p,level,timeMs){
      const s2=P.clone(s);let ms=P.moves(s2,p);
      if(ms.length===1)return ms[0];
      /* winning move at once */
      const w=ms.find(m=>m.t===TOP);if(w)return w;
      if(level===1&&Math.random()<.35)return ms[rand(ms.length)];
      const maxD=level===1?1:level===2?2:8;
      const ctx={nodes:0,stop:false,deadline:performance.now()+(timeMs||(level===3?250:180))};
      ms.sort((a,b)=>(b.rm.length-a.rm.length)||(b.f>=0)-(a.f>=0));
      let bestM=ms[0];
      for(let d=1;d<=maxD;d++){
        let a=-Infinity,sc=[];
        for(const m of ms){
          P.apply(s2,p,m);const v=-P.nega(s2,1-p,d-1,-Infinity,-a+1e-6,1,ctx);P.undo(s2,p,m);
          if(ctx.stop)break;sc.push([v,m]);if(v>a)a=v;
        }
        if(ctx.stop&&d>1)break;
        if(!sc.length)break;
        const top=sc.filter(x=>x[0]>=a-1e-9).map(x=>x[1]);
        bestM=level<3?top[rand(top.length)]:top[0];
        ms=[bestM,...ms.filter(m=>m!==bestM)];
        if(ctx.stop||Math.abs(a)>WIN-100)break;
      }
      return bestM;
    }
  };
  return P;
})();
const PYR_COL=[['#FFC9D1','#FF5D73','#B3243B'],['#C9CFFF','#5B6CFF','#2A35A6']];

function pyramid(root,S){
  const L=S.level,TWO=L===4,P=PYRM;
  const NM=TWO?['Red','Blue']:['You','Computer'];
  const st=status(root,TWO?'Red starts. Take turns placing balls. A 2×2 of your color lets you take 1 or 2 back. Whoever places the top ball wins.':'You are Red. Place balls, raise them, and make 2×2 squares of your color to take balls back. Place the top ball to win.');
  const bar=el('div','pyr-bar',root);
  const pills=[0,1].map(p=>{const e=el('div','pyr-who p'+p,bar,'<i></i><span><b></b><em>15</em></span>');e.querySelector('b').textContent=NM[p];return e});
  const mid=el('div','pyr-mid',bar);bar.insertBefore(mid,pills[1]);
  const done=el('button','btn pyr-done',mid,'Done');done.style.visibility='hidden';
  const W=360,H=360,{c,x}=canvas(root,W,H);c.dataset.max=600;c.classList.add('pyr-cv');
  const M=22,CS=(W-2*M)/4,R=CS*.485,LIFT=5;
  const X=i=>M+CS*(P.CC[i]+.5+P.LV[i]*.5),Y=i=>M+CS*(P.RR[i]+.5+P.LV[i]*.5)-P.LV[i]*LIFT;
  const s=P.make();let turn=0,mode='play',sel=-1,taken=0,last=-1,hover=-1,over=false,T=0;
  const anims=[];/* {i,fx,fy,t,dur} flying in; {ghost:true,x,y,p,t,dur} flying out */
  const flying=new Set();
  const human=()=>TWO||turn===0;
  function paint(){
    pills.forEach((e,p)=>{e.querySelector('em').textContent=s.res[p];e.classList.toggle('on',!over&&turn===p)});
    done.style.visibility=mode==='remove'?'visible':'hidden';
    done.textContent=taken?'Done':'Keep all';
  }
  function ball(px,py,p,l,a){
    x.globalAlpha=a==null?1:a;
    x.fillStyle='rgba(40,20,0,.28)';x.beginPath();x.ellipse(px+2.5,py+4.5,R*.98,R*.9,0,0,7);x.fill();
    const C=PYR_COL[p],g=x.createRadialGradient(px-R*.35,py-R*.42,R*.08,px,py,R*1.05);
    g.addColorStop(0,C[0]);g.addColorStop(.45,C[1]);g.addColorStop(1,C[2]);
    x.fillStyle=g;x.beginPath();x.arc(px,py,R,0,7);x.fill();
    const dk=[.14,.07,.02,0][l];if(dk){x.fillStyle=`rgba(0,0,0,${dk})`;x.fill()}
    x.lineWidth=2;x.strokeStyle='#1E1F5C';x.stroke();
    x.fillStyle='rgba(255,255,255,.55)';x.beginPath();x.ellipse(px-R*.36,py-R*.44,R*.2,R*.12,-.6,0,7);x.fill();
    x.globalAlpha=1;
  }
  function ring(px,py,col,w,dash){x.save();x.lineWidth=w;x.strokeStyle=col;if(dash)x.setLineDash(dash);x.beginPath();x.arc(px,py,R*.86,0,7);x.stroke();x.restore()}
  const targets=()=>sel>=0?P.raises(s.b,sel):[];
  function hints(){/* spots worth marking */
    if(over||mode!=='play'||!human())return{av:[],tg:[]};
    const av=[];for(let i=0;i<P.N;i++)if(P.avail(s.b,i))av.push(i);
    return{av:s.res[turn]>0?av:[],tg:targets()};
  }
  function canRaise(i){return s.b[i]===turn+1&&P.raises(s.b,i).length>0}
  function draw(dt){
    T+=dt;const pl=pal();x.clearRect(0,0,W,H);
    /* wooden plate */
    const wg=x.createLinearGradient(0,0,W,H);wg.addColorStop(0,'#F2C98A');wg.addColorStop(1,'#D9A262');x.fillStyle=wg;x.fillRect(0,0,W,H);
    rr(x,M-6,M-6,W-2*M+12,H-2*M+12,18);x.fillStyle='rgba(120,66,20,.16)';x.fill();
    for(let i=0;i<16;i++){x.fillStyle='rgba(110,60,15,.32)';x.beginPath();x.arc(X(i),Y(i),R*.62,0,7);x.fill();x.fillStyle='rgba(255,240,210,.25)';x.beginPath();x.arc(X(i)+1.5,Y(i)+2,R*.5,0,7);x.fill()}
    const h=hints(),pulse=.5+.5*Math.sin(T*6);
    const rem=mode==='remove'&&human()?P.ownFree(s.b,turn+1):[];
    for(let l=0;l<4;l++){
      for(let i=0;i<P.N;i++){
        if(P.LV[i]!==l)continue;
        if(s.b[i]&&!flying.has(i)){
          ball(X(i),Y(i),s.b[i]-1,l);
          if(i===last)x.fillStyle='rgba(255,255,255,.9)',x.beginPath(),x.arc(X(i),Y(i),3.2,0,7),x.fill();
          if(i===sel)ring(X(i),Y(i),'#FFC53D',5);
          else if(rem.includes(i))ring(X(i),Y(i),`rgba(255,255,255,${.5+.5*pulse})`,4,[6,5]);
          else if(i===hover&&mode==='play'&&human()&&canRaise(i))ring(X(i),Y(i),'rgba(255,255,255,.8)',3);
        }else if(!s.b[i]){
          const tg=h.tg.includes(i),av=h.av.includes(i);
          if(tg){x.fillStyle=`rgba(255,197,61,${.45+.3*pulse})`;x.beginPath();x.arc(X(i),Y(i),R*.8,0,7);x.fill();ring(X(i),Y(i),'#1E1F5C',2.5,[5,4])}
          else if(av){
            x.fillStyle=l?'rgba(255,255,255,.42)':'rgba(255,255,255,.2)';x.beginPath();x.arc(X(i),Y(i),R*(l?.8:.55),0,7);x.fill();
            ring(X(i),Y(i),i===hover?'#1E1F5C':'rgba(30,31,92,.55)',i===hover?3:2,[5,5]);
            if(i===hover)ball(X(i),Y(i),turn,l,.45);
          }
        }
      }
    }
    for(let k=anims.length-1;k>=0;k--){
      const a=anims[k];a.t+=dt;const u=Math.min(1,a.t/a.dur),e=1-Math.pow(1-u,3);
      if(a.ghost){ball(a.x+(a.tx-a.x)*e,a.y+(a.ty-a.y)*e-Math.sin(u*Math.PI)*40,a.p,3,1-u*.8)}
      else{const tx=X(a.i),ty=Y(a.i);ball(a.fx+(tx-a.fx)*e,a.fy+(ty-a.fy)*e-Math.sin(u*Math.PI)*46,s.b[a.i]?s.b[a.i]-1:a.p,P.LV[a.i])}
      if(u>=1){anims.splice(k,1);if(!a.ghost)flying.delete(a.i)}
    }
  }
  /* reserve pill position in canvas coords, for fly-in/out */
  function pillPt(p){const r=pills[p].getBoundingClientRect(),b=c.getBoundingClientRect();return{x:(r.left+r.width/2-b.left)*W/b.width,y:(r.top+r.height/2-b.top)*H/b.height}}
  function fly(i,from){const q=from>=0?{x:X(from),y:Y(from)}:pillPt(turn);flying.add(i);anims.push({i,fx:q.x,fy:q.y,t:0,dur:.36,p:turn})}
  function ghost(i,p){const q=pillPt(p);anims.push({ghost:true,x:X(i),y:Y(i),tx:q.x,ty:q.y,p,t:0,dur:.4})}
  function hit(pt){
    for(let i=P.N-1;i>=0;i--){
      const d=Math.hypot(pt.x-X(i),pt.y-Y(i));if(d>R*.95)continue;
      if(s.b[i]||P.avail(s.b,i))return i;
    }
    return -1;
  }
  function place(f,t){
    const p=turn;P.apply(s,p,{f,t,rm:[]});fly(t,f);last=t;sel=-1;
    beep(f<0?420+P.LV[t]*90:560,90);S.after(330,()=>beep(260+P.LV[t]*60,60,'square'));
    if(t===P.TOP)return finish(p);
    if(P.square(s.b,t,p+1)){
      if(human()){mode='remove';taken=0;st(TWO?`${NM[p]} made a square! Tap 1 or 2 of your balls to take back.`:'Square! Tap 1 or 2 of your balls to take back.');S.after(250,()=>S.fx.toast('Square!','take back 1 or 2'));paint();return}
    }
    endTurn();
  }
  function takeBack(i){
    const p=turn;s.b[i]=0;s.res[p]++;ghost(i,p);taken++;beep(700+taken*120,90);if(last===i)last=-1;
    paint();
    if(taken>=2||!P.ownFree(s.b,p+1).length)S.after(250,endTurn);
  }
  function endTurn(){
    if(over)return;
    mode='play';sel=-1;const p=turn;turn=1-turn;
    if(s.res[turn]<=0){paint();return finish(p,true)}
    paint();
    if(!TWO&&turn===1){mode='ai';st('Computer is thinking…');S.after(420,aiMove)}
    else st(TWO?`${NM[turn]}'s turn.`:'Your turn.');
  }
  function aiMove(){
    if(over)return;
    const m=P.best(s,1,L);const rm=m.rm;
    place2(m.f,m.t);
    if(m.t===P.TOP)return;
    if(rm.length){
      S.after(520,()=>{S.fx.toast('Computer made a square!',`takes back ${rm.length}`);rm.forEach((r,k)=>S.after(k*380,()=>{s.b[r]=0;s.res[1]++;ghost(r,1);if(last===r)last=-1;beep(500,80);paint()}))});
      S.after(560+rm.length*380+150,endTurn);
    }else S.after(380,endTurn);
  }
  function place2(f,t){const p=turn;P.apply(s,p,{f,t,rm:[]});fly(t,f);last=t;beep(380,90);S.after(330,()=>beep(260+P.LV[t]*60,60,'square'));if(t===P.TOP)finish(p)}
  function finish(p,noBalls){
    over=true;mode='over';sel=-1;paint();
    const why=noBalls?`${NM[1-p]} ran out of balls.`:'Top ball placed.';
    if(TWO){st(`${NM[p]} wins! ${why} Press ↻ for a rematch.`);S.after(500,()=>{S.fx.confetti();S.fx.banner(`${NM[p]} wins!`,why);beep(990,300)})}
    else if(p===0){st(`You win! ${noBalls?'The computer ran out of balls.':'You placed the top ball.'}`);S.after(600,S.next)}
    else{st(noBalls?'You ran out of balls. Press ↻ to try again.':'The computer placed the top ball. Press ↻ to try again.');S.after(500,()=>{S.shake();beep(150,400,'sawtooth')})}
  }
  S.on(c,'click',e=>{
    if(over||!human())return;
    const i=hit(c.pos(e));
    if(mode==='remove'){
      if(i>=0&&s.b[i]===turn+1&&P.free(s.b,i))takeBack(i);
      else if(i>=0&&s.b[i]===turn+1){beep(140,90,'sawtooth');st('That ball holds others up. Pick a free one.')}
      return;
    }
    if(mode!=='play')return;
    if(i<0){sel=-1;return}
    if(!s.b[i]){
      if(sel>=0&&targets().includes(i))return place(sel,i);
      if(s.res[turn]>0)return place(-1,i);
      return;
    }
    if(s.b[i]===turn+1){
      if(sel===i){sel=-1;beep(300,40);return}
      if(canRaise(i)){sel=i;beep(620,50);st('Tap a gold spot to move this ball up.');return}
      beep(140,90,'sawtooth');st(P.free(s.b,i)?'No higher spot for that ball yet.':'That ball holds others up.');return;
    }
    sel=-1;
  });
  S.on(c,'pointermove',e=>{hover=hit(c.pos(e))});
  S.on(c,'pointerleave',()=>{hover=-1});
  S.on(done,'click',()=>{if(mode==='remove'){beep(500,60);endTurn()}});
  S.on(window,'keydown',e=>{
    if(e.key==='Escape'){sel=-1}
    else if(e.key==='Enter'&&mode==='remove'){e.preventDefault();endTurn()}
  });
  S.loop(draw);paint();
}

/* Shuttle Race: 7x7 board, 5 lanes per player crossing in the middle 5x5.
   Player 0 starts on the bottom edge (lane i = column i+1) and travels up, then back down.
   Player 1 starts on the left edge (lane j = row j+1) and travels right, then back left.
   Progress d: 0..6 outward (position = d), 6..12 return (position = 12-d), 12 = home. */
const SQDR=(()=>{
  const SP=[[[1,3,2,3,1],[3,1,2,1,3]],[[3,1,2,1,3],[1,3,2,3,1]]];/* SP[player][leg][lane] */
  const WIN=1e5,posOf=d=>d<=6?d:12-d;
  /* lane of the opponent piece sitting on the crossing that piece (p,i) would occupy at position q, or -1 */
  function occ(d,p,i,q){
    if(q<1||q>5)return -1;
    let o,op;if(p===0){o=5-q;op=i+1}else{o=q-1;op=5-i}
    const od=d[(1-p)*5+o];return od<12&&posOf(od)===op?o:-1;
  }
  const Q={SP,WIN,posOf,occ,
    make(){return new Int8Array(10)},
    home(d,p){let n=0;for(let i=0;i<5;i++)if(d[p*5+i]>=12)n++;return n},
    can(d,p,i){return d[p*5+i]<12},
    speed(d,p,i){const v=d[p*5+i];return v>=12?0:SP[p][v<6?0:1][i]},
    /* move piece (p,i) in place. returns {from,to,jumped:[[lane,oldD,newD]...]} */
    move(d,p,i){
      let v=d[p*5+i];const from=v,leg=v<6?0:1,end=leg?12:6;let sp=SP[p][leg][i];const jumped=[];
      while(sp>0&&v<end){
        let nv=v+1,o=occ(d,p,i,posOf(nv));
        if(o>=0){
          while(o>=0){const k=(1-p)*5+o,od=d[k],nd=od<6?0:6;jumped.push([o,od,nd]);d[k]=nd;nv++;o=occ(d,p,i,posOf(nv))}
          v=nv;break;
        }
        v=nv;sp--;
      }
      d[p*5+i]=v;return{from,to:v,jumped};
    },
    turnsLeft(v,p,i){if(v>=12)return 0;const so=SP[p][0][i],sb=SP[p][1][i];return v<6?Math.ceil((6-v)/so)+Math.ceil(6/sb):Math.ceil((12-v)/sb)},
    score(d,p){const t=[];for(let i=0;i<5;i++)t.push(Q.turnsLeft(d[p*5+i],p,i));t.sort((a,b)=>a-b);return t[0]+t[1]+t[2]+t[3]},
    evalS(d,p){
      let v=(Q.score(d,1-p)-Q.score(d,p))*10;
      for(let i=0;i<5;i++){v+=d[p*5+i]*.3-d[(1-p)*5+i]*.3}
      return v+3;/* tempo */
    },
    nega(d,p,depth,alpha,beta,ply,ctx){
      if((++ctx.nodes&255)===0&&performance.now()>ctx.deadline)ctx.stop=true;
      if(ctx.stop)return 0;
      if(Q.home(d,1-p)>=4)return -(WIN-ply);
      if(depth<=0)return Q.evalS(d,p);
      let best=-Infinity;
      for(let i=0;i<5;i++){
        if(d[p*5+i]>=12)continue;
        const c=d.slice();Q.move(c,p,i);
        const v=-Q.nega(c,1-p,depth-1,-beta,-alpha,ply+1,ctx);
        if(ctx.stop)return 0;
        if(v>best)best=v;if(v>alpha)alpha=v;if(alpha>=beta)break;
      }
      return best;
    },
    best(d,p,level,timeMs){
      let ms=[0,1,2,3,4].filter(i=>d[p*5+i]<12);
      if(ms.length===1)return ms[0];
      if(level===1&&Math.random()<.4)return ms[rand(ms.length)];
      const maxD=level===1?1:level===2?3:30;
      const ctx={nodes:0,stop:false,deadline:performance.now()+(timeMs||(level===3?250:150))};
      let bestI=ms[0];
      for(let dep=1;dep<=maxD;dep++){
        let a=-Infinity;const sc=[];
        for(const i of ms){const c=d.slice();Q.move(c,p,i);const v=-Q.nega(c,1-p,dep-1,-Infinity,-a+1e-6,1,ctx);if(ctx.stop)break;sc.push([v,i]);if(v>a)a=v}
        if(ctx.stop&&dep>1)break;
        if(!sc.length)break;
        const top=sc.filter(x=>x[0]>=a-1e-9).map(x=>x[1]);
        bestI=level<3?top[rand(top.length)]:top[0];
        ms=[bestI,...ms.filter(i=>i!==bestI)];
        if(ctx.stop||Math.abs(a)>WIN-200)break;
      }
      return bestI;
    }
  };
  return Q;
})();
const SQD_COL=[['#FF8A99','#FF5D73','#C93A52'],['#FFE08A','#FFC53D','#D99A12']];

function squadro(root,S){
  const L=S.level,TWO=L===4,Q=SQDR;
  const NM=TWO?['Red','Yellow']:['You','Computer'];
  const st=status(root,TWO?'Red starts. Tap a piece to move it. Each piece crosses and comes back. First to bring 4 home wins.':'You are Red, moving up. Tap a piece to move it across and back. Bring 4 of 5 home first to win.');
  const bar=el('div','sqd-bar',root);
  const pills=[0,1].map(p=>{const e=el('div','sqd-who p'+p,bar,'<i></i><span><b></b><em>0/4</em></span>');e.querySelector('b').textContent=NM[p];return e});
  const W=360,H=360,{c,x}=canvas(root,W,H);c.dataset.max=600;c.classList.add('sqd-cv');
  const M=24,CS=(W-2*M)/7;
  const cx=col=>M+CS*(col+.5),cy=row=>M+CS*(row+.5);
  const d=Q.make(),vd=Array.from(d);let turn=0,busy=false,over=false,T=0,hover=-1,kb=-1,last=-1;
  const tw=[];/* {k,from,to,t,dur,delay,lift} */
  const human=()=>TWO||turn===0;
  function xy(p,i,v){const q=v<=6?v:12-v;return p===0?[cx(i+1),cy(6-q)]:[cx(q),cy(i+1)]}
  function paint(){pills.forEach((e,p)=>{e.querySelector('em').textContent=Q.home(d,p)+'/4';e.classList.toggle('on',!over&&turn===p)})}
  function pips(px,py,n,col,vert){
    for(let k=0;k<n;k++){const o=(k-(n-1)/2)*8;x.beginPath();x.arc(vert?px:px+o,vert?py+o:py,3,0,7);x.fillStyle=col;x.fill();x.lineWidth=1.5;x.strokeStyle='#1E1F5C';x.stroke()}
  }
  function piece(p,i,v,lift,a){
    const[px,py0]=xy(p,i,v),py=py0-lift*6,back=v>=6,C=SQD_COL[p],s=1+lift*.15;
    const vert=p===0;/* travels vertically */
    const lw=CS*.78*s,sw=CS*.46*s,w=vert?lw:sw,h=vert?sw:lw;
    x.globalAlpha=a;
    x.fillStyle='rgba(0,0,0,.22)';rr(x,px-w/2+2,py0-h/2+4+lift*3,w,h,7);x.fill();
    /* nose pointing the way it travels */
    const dir=vert?(back?[0,1]:[0,-1]):(back?[-1,0]:[1,0]);
    x.beginPath();const nx=px+dir[0]*(vert?0:w/2),ny=py+dir[1]*(vert?h/2:0),bw=CS*.17;
    x.moveTo(nx+dir[0]*CS*.13,ny+dir[1]*CS*.13);x.lineTo(nx+dir[1]*bw,ny+dir[0]*bw);x.lineTo(nx-dir[1]*bw,ny-dir[0]*bw);x.closePath();
    x.fillStyle=C[2];x.fill();x.lineWidth=2;x.strokeStyle='#1E1F5C';x.stroke();
    const g=x.createLinearGradient(px-w/2,py-h/2,px+w/2,py+h/2);g.addColorStop(0,C[0]);g.addColorStop(.5,C[1]);g.addColorStop(1,C[2]);
    rr(x,px-w/2,py-h/2,w,h,7);x.fillStyle=g;x.fill();x.lineWidth=2.2;x.strokeStyle='#1E1F5C';x.stroke();
    const n=v>=12?0:Q.SP[p][back?1:0][i];
    if(n)pips(px,py,n,'#fff',!vert);
    else{x.strokeStyle='#1E1F5C';x.lineWidth=2.5;x.beginPath();x.moveTo(px-5,py);x.lineTo(px-1,py+4);x.lineTo(px+6,py-4);x.stroke()}
    x.globalAlpha=1;
  }
  function draw(dt){
    T+=dt;const pl=pal();x.clearRect(0,0,W,H);
    x.fillStyle=pl.board;x.fillRect(0,0,W,H);
    /* edge slots */
    for(let k=1;k<=5;k++){
      for(const[col,row,p]of[[k,6,0],[k,0,0],[0,k,1],[6,k,1]]){rr(x,cx(col)-CS*.44,cy(row)-CS*.44,CS*.88,CS*.88,9);x.fillStyle=SQD_COL[p][1]+'30';x.fill()}
    }
    /* center field */
    rr(x,cx(1)-CS*.5,cy(1)-CS*.5,CS*5,CS*5,10);x.fillStyle=pl.line+'88';x.fill();
    x.lineWidth=3;x.lineCap='round';
    for(let k=1;k<=5;k++){
      x.strokeStyle=SQD_COL[0][1]+'99';x.beginPath();x.moveTo(cx(k),cy(0));x.lineTo(cx(k),cy(6));x.stroke();
      x.strokeStyle=SQD_COL[1][2]+'99';x.beginPath();x.moveTo(cx(0),cy(k));x.lineTo(cx(6),cy(k));x.stroke();
    }
    for(let r=1;r<=5;r++)for(let k=1;k<=5;k++){x.fillStyle=pl.edge;x.beginPath();x.arc(cx(k),cy(r),2.6,0,7);x.fill()}
    /* speed pips in the margins: outward at the start edge, return at the far edge */
    for(let i=0;i<5;i++){
      pips(cx(i+1),H-M/2-1,Q.SP[0][0][i],SQD_COL[0][1],false);pips(cx(i+1),M/2+1,Q.SP[0][1][i],SQD_COL[0][1],false);
      pips(M/2+1,cy(i+1),Q.SP[1][0][i],SQD_COL[1][1],true);pips(W-M/2-1,cy(i+1),Q.SP[1][1][i],SQD_COL[1][1],true);
    }
    /* tweens */
    const lift=new Array(10).fill(0);
    for(let k=tw.length-1;k>=0;k--){
      const a=tw[k];a.t+=dt;if(a.t<a.delay)continue;const u=Math.min(1,(a.t-a.delay)/a.dur),e=a.ease?1-Math.pow(1-u,2):u;
      vd[a.k]=a.from+(a.to-a.from)*e;if(a.lift)lift[a.k]=Math.sin(u*Math.PI)*a.lift;
      if(u>=1){vd[a.k]=a.to;tw.splice(k,1)}
    }
    const pulse=.5+.5*Math.sin(T*5);
    const showMov=!over&&!busy&&human()&&!tw.length;
    /* preview ghost */
    const pv=kb>=0?kb:hover;
    if(showMov&&pv>=0&&d[turn*5+pv]<12){const c2=d.slice();const r=Q.move(c2,turn,pv);piece(turn,pv,r.to,0,.3)}
    const order=[...Array(10).keys()].sort((a,b)=>lift[a]-lift[b]);
    for(const k of order){
      const p=k<5?0:1,i=k%5;
      if(showMov&&p===turn&&d[k]<12){const[px,py]=xy(p,i,vd[k]);x.beginPath();x.arc(px,py,CS*.5,0,7);x.fillStyle=SQD_COL[p][1]+(pulse>.5?'55':'33');x.fill();
        if(i===pv){x.lineWidth=3;x.strokeStyle=pl.ink;x.stroke()}}
      piece(p,i,vd[k],lift[k],d[k]>=12&&!tw.length?.55:1);
      if(k===last&&!tw.length){const[px,py]=xy(p,i,vd[k]);x.fillStyle=pl.ink;x.beginPath();x.arc(px+CS*.36,py-CS*.36,3,0,7);x.fill()}
    }
  }
  function pick(pt){
    let bi=-1,bd=CS*.75;
    for(let i=0;i<5;i++){if(d[turn*5+i]>=12)continue;const[px,py]=xy(turn,i,d[turn*5+i]);const dd=Math.hypot(pt.x-px,pt.y-py);if(dd<bd){bd=dd;bi=i}}
    if(bi<0){/* tap anywhere along the lane */
      for(let i=0;i<5;i++){if(d[turn*5+i]>=12)continue;const off=turn===0?Math.abs(pt.x-cx(i+1)):Math.abs(pt.y-cy(i+1));if(off<CS*.45)return i}
    }
    return bi;
  }
  function go(i){
    if(over||busy||!Q.can(d,turn,i))return;
    const p=turn,k0=p*5+i,r=Q.move(d,p,i);busy=true;last=k0;
    const steps=Math.abs(r.to-r.from),dur=.1+.09*steps;
    tw.push({k:k0,from:r.from,to:r.to,t:0,dur,delay:0,lift:r.jumped.length?1.6:.5,ease:true});
    beep(p?440:360,60);
    if(r.to===6)S.after(dur*1000,()=>beep(620,70));
    if(r.to===12)S.after(dur*1000,()=>{beep(880,90);S.after(90,()=>beep(1170,120))});
    r.jumped.forEach(([o,od,nd],n)=>{const k=(1-p)*5+o;tw.push({k,from:od,to:nd,t:0,dur:.38,delay:dur*.6+n*.06,lift:1.2,ease:true});S.after((dur*.6+n*.06)*1000,()=>beep(200,120,'square'))});
    if(r.jumped.length&&!TWO&&p===0)S.after(dur*1000,()=>S.fx.toast(r.jumped.length>1?`Jumped ${r.jumped.length}!`:'Jumped!','sent back'));
    paint();
    const wait=(dur+(r.jumped.length?.5:0))*1000+60;
    S.after(wait,()=>{
      busy=false;
      if(Q.home(d,p)>=4)return finish(p);
      turn=1-p;paint();
      if(!TWO&&turn===1){busy=true;st('Computer is thinking…');S.after(300,()=>{const m=Q.best(d,1,L);busy=false;go(m)})}
      else st(TWO?`${NM[turn]}'s turn.`:'Your turn.');
    });
  }
  function finish(p){
    over=true;paint();
    if(TWO){st(`${NM[p]} wins! Press ↻ for a rematch.`);S.fx.confetti();S.fx.banner(`${NM[p]} wins!`,'4 pieces home');beep(990,300)}
    else if(p===0){st('You brought 4 pieces home. You win!');S.after(300,S.next)}
    else{st('The computer brought 4 pieces home. Press ↻ to try again.');S.shake();beep(150,400,'sawtooth')}
  }
  S.on(c,'click',e=>{if(over||busy||!human())return;const i=pick(c.pos(e));kb=-1;if(i>=0)go(i)});
  S.on(c,'pointermove',e=>{if(e.pointerType==='mouse')hover=pick(c.pos(e))});
  S.on(c,'pointerleave',()=>{hover=-1});
  S.on(window,'keydown',e=>{
    if(over||busy||!human())return;const k=e.key;
    const mov=[0,1,2,3,4].filter(i=>d[turn*5+i]<12);if(!mov.length)return;
    if(/^[1-5]$/.test(k)){const i=+k-1;if(mov.includes(i)){kb=-1;go(i)}return}
    const fw=turn===0?['ArrowRight','ArrowDown']:['ArrowDown','ArrowRight'],bk=turn===0?['ArrowLeft','ArrowUp']:['ArrowUp','ArrowLeft'];
    if(fw.includes(k)||bk.includes(k)){e.preventDefault();const n=mov.indexOf(kb);kb=mov[n<0?0:(n+(fw.includes(k)?1:mov.length-1))%mov.length];beep(600,20)}
    else if((k==='Enter'||k===' ')&&kb>=0){e.preventDefault();const i=kb;kb=-1;go(i)}
  });
  S.loop(draw);paint();
}

/* Shape Grid (4x4, four 2x2 zones). Cell value -1 empty, else owner*4+shape. Owner 0 = Red (first), 1 = Blue. */
const QTK_=(()=>{
  const REG=[],OF=[...Array(16)].map(()=>[]);
  for(let r=0;r<4;r++)REG.push([0,1,2,3].map(c=>r*4+c));
  for(let c=0;c<4;c++)REG.push([0,1,2,3].map(r=>r*4+c));
  for(let z=0;z<4;z++){const r0=(z>>1)*2,c0=(z&1)*2;REG.push([r0*4+c0,r0*4+c0+1,(r0+1)*4+c0,(r0+1)*4+c0+1])}
  REG.forEach((g,k)=>g.forEach(i=>OF[i].push(k)));
  const WIN=1000;
  const Q={REG,OF,WIN,
    make(){return{b:new Int8Array(16).fill(-1),cnt:[[2,2,2,2],[2,2,2,2]],n:0}},
    /* why shape s cannot go on i for player p: null if legal, else region index that blocks */
    block(s,p,sh,i){
      if(s.b[i]>=0)return -2;
      const bad=(1-p)*4+sh;
      for(const k of OF[i])for(const j of REG[k])if(s.b[j]===bad)return k;
      return null;
    },
    legal(s,p,sh,i){return s.cnt[p][sh]>0&&Q.block(s,p,sh,i)===null},
    moves(s,p){const m=[];for(let sh=0;sh<4;sh++){if(!s.cnt[p][sh])continue;for(let i=0;i<16;i++)if(Q.block(s,p,sh,i)===null)m.push(i*4+sh)}return m},
    put(s,p,m){s.b[m>>2]=p*4+(m&3);s.cnt[p][m&3]--;s.n++},
    take(s,p,m){s.b[m>>2]=-1;s.cnt[p][m&3]++;s.n--},
    /* region completed through cell i (all 4 shapes), or null */
    winReg(s,i){for(const k of OF[i]){let mask=0;for(const j of REG[k]){const v=s.b[j];if(v<0){mask=-1;break}mask|=1<<(v&3)}if(mask===15)return k}return null},
    winning(s,p){for(const m of Q.moves(s,p)){Q.put(s,p,m);const w=Q.winReg(s,m>>2);Q.take(s,p,m);if(w!==null)return m}return -1},
    evalS(s,p){
      /* mobility difference */
      let a=0,o=0;
      for(let sh=0;sh<4;sh++)for(let i=0;i<16;i++){if(s.b[i]>=0)continue;if(s.cnt[p][sh]&&Q.block(s,p,sh,i)===null)a++;if(s.cnt[1-p][sh]&&Q.block(s,1-p,sh,i)===null)o++}
      return a-o;
    },
    nega(s,p,d,al,be,ply,ctx){
      if((++ctx.nodes&1023)===0&&performance.now()>ctx.dl)ctx.stop=true;
      if(ctx.stop)return 0;
      const ms=Q.moves(s,p);
      if(!ms.length)return -WIN+ply;
      for(const m of ms){Q.put(s,p,m);const w=Q.winReg(s,m>>2);Q.take(s,p,m);if(w!==null)return WIN-ply}
      if(d<=0)return Q.evalS(s,p);
      let best=-Infinity;
      for(const m of ms){
        Q.put(s,p,m);const v=-Q.nega(s,1-p,d-1,-be,-al,ply+1,ctx);Q.take(s,p,m);
        if(ctx.stop)return 0;
        if(v>best)best=v;if(v>al)al=v;if(al>=be)break;
      }
      return best;
    },
    /* level 1..3; returns move (i*4+shape) */
    best(s,p,level,ms){
      const all=Q.moves(s,p);if(!all.length)return -1;
      const win=Q.winning(s,p);
      if(level===1){
        if(win>=0&&Math.random()<.6)return win;
        if(Math.random()<.35){const safe=all.filter(m=>{Q.put(s,p,m);const r=Q.winning(s,1-p)<0;Q.take(s,p,m);return r});if(safe.length)return safe[Math.floor(Math.random()*safe.length)]}
        return all[Math.floor(Math.random()*all.length)];
      }
      if(win>=0)return win;
      const ctx={nodes:0,stop:false,dl:performance.now()+(ms||(level===2?120:280))};
      let order=shuffle(all.slice()),bestM=order[0];
      const maxD=level===2?2:16;
      for(let d=1;d<=maxD&&d<=16-s.n;d++){
        let al=-Infinity,sc=[];
        for(const m of order){
          Q.put(s,p,m);const v=-Q.nega(s,1-p,d-1,-Infinity,-al+1,1,ctx);Q.take(s,p,m);
          if(ctx.stop)break;sc.push([v,m]);if(v>al)al=v;
        }
        if(ctx.stop){const wn=sc.find(x=>x[0]>WIN-50);if(wn)bestM=wn[1];break}
        const top=sc.filter(x=>x[0]===al).map(x=>x[1]);
        bestM=top[Math.floor(Math.random()*top.length)];
        sc.sort((x,y)=>y[0]-x[0]);order=sc.map(x=>x[1]);
        if(Math.abs(al)>WIN-50)break;
      }
      return bestM;
    }
  };
  return Q;
})();
const QTK_SVG=['<circle cx="50" cy="50" r="35"/>','<rect x="16" y="16" width="68" height="68" rx="9"/>','<path d="M50 11 L89 85 L11 85Z"/>','<path d="M50 7 L91 50 L50 93 L9 50Z"/>'];
const QTK_NAMES=['circle','square','triangle','diamond'];
function qtkPiece(p,sh,cls){return `<svg class="qk-pc ${p?'blu':'red'} ${cls||''}" viewBox="0 0 100 100" aria-hidden="true">${QTK_SVG[sh]}</svg>`}

function quantik(root,S){
  const L=S.level,TWO=L===4,Q=QTK_;
  const NM=TWO?['Red','Blue']:['You','Computer'];
  const st=status(root,TWO?'Red starts. Place a shape; you can\'t put it in a row, column or zone where the other player has that shape. Finish a line or zone with all 4 shapes to win.':'Place your shapes. You can\'t put a shape where the computer has the same one in that row, column or zone. Be first to complete a line or zone with 4 different shapes!');
  const w=el('div','qk-wrap',root);w.dataset.ar=100/156;w.dataset.max=470;
  const trays=[1,0].map(p=>{
    const t=el('div','qk-tray '+(p?'blu':'red')+(p===1?' top':' bot'),w);
    const nm=el('div','qk-nm',t,`<i></i><b></b>`);nm.querySelector('b').textContent=NM[p];
    const slots=[0,1,2,3].map(sh=>{const b=el('button','qk-slot',t);b.setAttribute('aria-label',(NM[p])+' '+QTK_NAMES[sh]);
      S.on(b,'click',()=>pick(p,sh));return b});
    return{t,nm,slots};
  });
  trays.reverse(); /* trays[0]=red(bottom) trays[1]=blue(top) */
  const g=el('div','qk-board',w);w.insertBefore(g,trays[0].t);
  const cells=[...Array(16)].map((_,i)=>{const r=i>>2,c=i&3,z=(r>>1)*2+(c>>1);
    const e=el('button','qk-cell z'+(z===0||z===3?'a':'b'),g);e.style.animationDelay=(r+c)*35+'ms';e.setAttribute('aria-label','Row '+(r+1)+' column '+(c+1));
    if(c===1)e.classList.add('gr');if(r===1)e.classList.add('gb');
    S.on(e,'click',()=>tap(i));S.on(e,'pointerenter',()=>{cur=i;paint()});return e});
  const s=Q.make();let turn=0,sel=[0,0],cur=5,over=false,busy=false,last=-1;
  const human=p=>TWO||p===0,HOV=!matchMedia('(hover:none)').matches;
  function fixSel(p){if(!s.cnt[p][sel[p]]){const k=[0,1,2,3].find(sh=>s.cnt[p][sh]);sel[p]=k==null?0:k}}
  function paint(){
    fixSel(turn);
    for(let p=0;p<2;p++){const T=trays[p];T.t.classList.toggle('on',!over&&turn===p);
      T.slots.forEach((b,sh)=>{const n=s.cnt[p][sh];
        b.innerHTML=qtkPiece(p,sh,n?'':'gone')+(n?`<em>${n}</em>`:'');
        b.classList.toggle('sel',!over&&turn===p&&human(p)&&sel[p]===sh&&n>0);b.disabled=!n||!human(p)||over;})}
    const myTurn=!over&&!busy&&human(turn);
    cells.forEach((e,i)=>{const ok=myTurn&&Q.legal(s,turn,sel[turn],i);e.classList.toggle('ok',ok);e.classList.toggle('cur',myTurn&&i===cur&&HOV);
      e.classList.toggle('no',myTurn&&s.b[i]<0&&!ok);
      let gh=e.querySelector('.qk-ghost');if(ok&&i===cur&&HOV){if(!gh)e.insertAdjacentHTML('beforeend',qtkPiece(turn,sel[turn],'qk-ghost'));else if(!gh.classList.contains(turn?'blu':'red')||gh.innerHTML!==QTK_SVG[sel[turn]]){gh.remove();e.insertAdjacentHTML('beforeend',qtkPiece(turn,sel[turn],'qk-ghost'))}}else if(gh)gh.remove()});
  }
  function pick(p,sh){if(over||busy||p!==turn||!human(p)||!s.cnt[p][sh])return;sel[p]=sh;beep(520+sh*80,40);paint()}
  function tap(i){
    if(over||busy||!human(turn))return;cur=i;
    const sh=sel[turn],why=Q.block(s,turn,sh,i);
    if(why!==null){
      if(why>=0){const reg=Q.REG[why];reg.forEach(j=>{if(s.b[j]===(1-turn)*4+sh)restartAnim(cells[j],'warn')});
        st(`Blocked: ${TWO?NM[1-turn]+' has':'the computer has'} a ${QTK_NAMES[sh]} in that ${why<4?'row':why<8?'column':'zone'}.`)}
      restartAnim(cells[i],'nope');beep(140,90,'sawtooth');paint();return}
    play(i*4+sh);
  }
  function play(m){
    const p=turn,i=m>>2;Q.put(s,p,m);last=i;
    cells.forEach(e=>e.classList.remove('last'));
    const gh=cells[i].querySelector('.qk-ghost');if(gh)gh.remove();
    cells[i].insertAdjacentHTML('beforeend',qtkPiece(p,m&3,'placed'));cells[i].classList.add('full','last');
    beep(p?392:523,90);
    const k=Q.winReg(s,i);
    if(k!==null){
      over=true;g.classList.add('done');Q.REG[k].forEach((j,n)=>{cells[j].classList.add('hit');cells[j].style.animationDelay=n*110+'ms'});
      const where=k<4?'row':k<8?'column':'zone';
      if(TWO){st(`${NM[p]} completes a ${where}! ${NM[p]} wins. Press ↻ for a rematch.`);S.after(500,()=>{S.fx.confetti();S.fx.banner(`${NM[p]} wins!`);beep(990,300)})}
      else if(p===0){st(`You completed a ${where} with all 4 shapes. You win!`);S.after(700,S.next)}
      else{st(`The computer completed a ${where}. Press ↻ to try again.`);S.after(500,()=>{S.shake();beep(150,400,'sawtooth')})}
      paint();return;
    }
    turn=1-p;
    if(!Q.moves(s,turn).length){
      over=true;const wnr=1-turn;
      if(TWO){st(`${NM[turn]} has no legal move, so ${NM[wnr]} wins! Press ↻ for a rematch.`);S.after(400,()=>{S.fx.confetti();S.fx.banner(`${NM[wnr]} wins!`,`${NM[turn]} is stuck`)})}
      else if(wnr===0){st('The computer has no legal move. You win!');S.after(600,S.next)}
      else{st('You have no legal move left. The computer wins. Press ↻ to try again.');S.after(400,()=>{S.shake();beep(150,400,'sawtooth')})}
      paint();return;
    }
    if(TWO){st(`${NM[turn]}'s turn.`);paint();return}
    if(turn===1){busy=true;st('Computer is thinking…');paint();
      S.after(420,()=>{const mv=Q.best(s,1,L);busy=false;play(mv)})}
    else{st('Your turn.');paint()}
  }
  S.on(window,'keydown',e=>{
    if(over||busy||!human(turn))return;const k=e.key;
    const d={ArrowUp:-4,ArrowDown:4,ArrowLeft:-1,ArrowRight:1}[k];
    if(d){e.preventDefault();if((d===-1&&cur%4===0)||(d===1&&cur%4===3))return;const n=cur+d;if(n>=0&&n<16){cur=n;beep(600,15);paint()}}
    else if(/^[1-4]$/.test(k))pick(turn,+k-1);
    else if(k==='Enter'||k===' '){e.preventDefault();tap(cur)}
  });
  paint();
}

/* Stone Sow: 4x4 board of stacks (bottom -> top). Stone 0 = neutral, 1 = Red (first player), 2 = Blue.
   A move: add your stone on top of any stack, lift the whole stack and sow it one stone per square along an
   orthogonal path starting next to the lifted square, bottom stone first, never stepping straight back to the
   square just left. Only top stones count for lines. If a move makes lines for both colours, the mover wins. */
const QWL_=(()=>{
  const NB=[...Array(16)].map((_,i)=>{const r=i>>2,c=i&3,a=[];if(r>0)a.push(i-4);if(r<3)a.push(i+4);if(c>0)a.push(i-1);if(c<3)a.push(i+1);return a});
  const LINES=[];
  for(let r=0;r<4;r++)LINES.push([0,1,2,3].map(c=>r*4+c));
  for(let c=0;c<4;c++)LINES.push([0,1,2,3].map(r=>r*4+c));
  LINES.push([0,5,10,15],[3,6,9,12]);
  const WIN=1e6;
  const Q={NB,LINES,WIN,
    make(){const st=[...Array(16)].map(()=>[]);for(const i of[0,3,12,15])st[i]=[0,0];return{st,left:[0,8,8]}},
    clone(s){return{st:s.st.map(a=>a.slice()),left:s.left.slice()}},
    tops(s){return s.st.map(a=>a.length?a[a.length-1]:-1)},
    /* which colours have a line: bit 1 = Red, bit 2 = Blue */
    lines(t){let m=0;for(const l of LINES){const v=t[l[0]];if(v>0&&t[l[1]]===v&&t[l[2]]===v&&t[l[3]]===v)m|=v}return m},
    lineOf(t,p){return LINES.find(l=>l.every(i=>t[i]===p))},
    /* result after p moved: p, 3-p or 0 */
    winner(t,p){const m=Q.lines(t);return m&p?p:m&(3-p)?3-p:0},
    apply(s,p,from,path){const h=s.st[from].concat([p]);s.st[from]=[];s.left[p]--;path.forEach((q,k)=>s.st[q].push(h[k]))},
    validPath(s,from,path){
      if(!s.st[from].length||path.length!==s.st[from].length+1)return false;
      let prev=-1,cur=from;for(const q of path){if(!NB[cur].includes(q)||q===prev)return false;prev=cur;cur=q}return true;
    },
    /* call cb(from,path,tops) for each sowing (sampled when the stack is tall). cb returns true to stop. */
    each(s,p,cb,cap){
      const T0=Q.tops(s);
      for(let from=0;from<16;from++){
        if(!s.st[from].length)continue;
        const h=s.st[from].concat([p]),n=h.length,t=T0.slice();t[from]=-1;const path=[];
        if(n<=8){
          let stop=false;
          const rec=(pos,prev,k)=>{
            if(k===n){if(cb(from,path,t))stop=true;return}
            for(const q of NB[pos]){if(q===prev)continue;const old=t[q];t[q]=h[k];path.push(q);rec(q,pos,k+1);path.pop();t[q]=old;if(stop)return}
          };
          rec(from,-1,0);if(stop)return true;
        }else{
          const seen=new Set();
          for(let tries=0;tries<(cap||900);tries++){
            const tt=t.slice();let pos=from,prev=-1;path.length=0;
            for(let k=0;k<n;k++){const o=NB[pos].filter(q=>q!==prev),q=o[Math.floor(Math.random()*o.length)];tt[q]=h[k];path.push(q);prev=pos;pos=q}
            const key=path.join(',');if(seen.has(key))continue;seen.add(key);
            if(cb(from,path,tt))return true;
          }
        }
      }
      return false;
    },
    /* can p win right now? returns {from,path} or null */
    findWin(s,p){let r=null;Q.each(s,p,(f,path,t)=>{if(Q.winner(t,p)===p){r={from:f,path:path.slice()};return true}return false});return r},
    evalT(t,p){
      let v=0;const o=3-p;
      for(const l of LINES){let a=0,b=0;for(const i of l){const x=t[i];if(x===p)a++;else if(x===o)b++}
        if(!b)v+=[0,1,5,24,0][a];if(!a)v-=[0,1,6,30,0][b];}
      return v;
    },
    /* level 1..3 for side p; returns {from,path} */
    best(s,p,level,ms){
      const t0=performance.now(),dl=t0+(ms||(level===1?60:level===2?150:300));
      const cand=[];let win=null;
      Q.each(s,p,(f,path,t)=>{
        const w=Q.winner(t,p);
        if(w===p){win={from:f,path:path.slice()};return true}
        cand.push({from:f,path:path.slice(),v:w?-WIN:Q.evalT(t,p)+Math.random()*(level===1?40:level===2?3:.5)});
        return cand.length>60000;
      });
      if(win&&(level>1||Math.random()<.5))return win;
      if(!cand.length)return win;
      if(level===1){const ok=cand.filter(c=>c.v>-WIN);const pool=Math.random()<.5?ok.sort((a,b)=>b.v-a.v).slice(0,8):ok;const pick=pool.length?pool:cand;return pick[Math.floor(Math.random()*pick.length)]}
      cand.sort((a,b)=>b.v-a.v);
      /* dedupe by resulting position */
      const seen=new Set(),list=[];
      for(const c of cand){const n=Q.clone(s);Q.apply(n,p,c.from,c.path);const k=n.st.map(a=>a.join('')).join('|');if(seen.has(k))continue;seen.add(k);c.n=n;list.push(c);if(list.length>=(level===2?12:80))break}
      const o=3-p;let bestC=null,bestV=-Infinity;
      for(let k=0;k<list.length;k++){
        const c=list[k];if(k>0&&performance.now()>dl)break;
        if(c.v<=-WIN){if(bestC==null){bestC=c;bestV=-WIN*2}continue}
        let v;
        if(!c.n.left[o]){v=c.v}
        else if(level===2){v=Q.findWin(c.n,o)?-WIN:c.v}
        else{
          /* opponent's best reply by static eval */
          let worst=-Infinity,cnt=0,cut=false;
          Q.each(c.n,o,(f,path,t)=>{if((++cnt&255)===0&&performance.now()>dl+(k?0:250)){cut=true;return true}
            const w=Q.winner(t,o);const e=w===o?WIN:w===p?-WIN:Q.evalT(t,o);if(e>worst)worst=e;return worst>=WIN},400);
          if(cut&&k>0&&worst<WIN)break;
          v=-worst;
          if(!c.n.left[p]&&v>-WIN)v=Math.min(v,0)+c.v*.001;
        }
        if(v>bestV){bestV=v;bestC=c}
      }
      return{from:bestC.from,path:bestC.path};
    }
  };
  return Q;
})();

function qawale(root,S){
  const L=S.level,TWO=L===4,Q=QWL_;
  const NM=['',TWO?'Red':'You',TWO?'Blue':'Computer'],CL=['neu','red','blu'];
  const st=status(root,TWO?'Red starts. Put a stone on a stack, then sow the stack square by square. Line up 4 of your colour on top to win.':'Put your stone on any stack, then sow the whole stack square by square. Get 4 of your colour on top in a row, column or diagonal!');
  const w=el('div','qw-wrap',root);w.dataset.ar=100/138;w.dataset.max=480;
  const bar=el('div','qw-bar',w);
  const who=[0,1,2].map(p=>{if(!p)return null;const e=el('div','qw-who '+CL[p],bar,'<b></b><span class="qw-pile"></span>');e.querySelector('b').textContent=NM[p];return e});
  const g=el('div','qw-board',w);
  const cells=[...Array(16)].map((_,i)=>{const e=el('button','qw-cell in',g);e.style.animationDelay=((i>>2)+(i&3))*35+'ms';e.setAttribute('aria-label','Square '+(i+1));
    S.on(e,'click',()=>tap(i));return e});
  const foot=el('div','qw-foot',w);
  const hand=el('div','qw-hand',foot);
  const undoB=el('button','btn ghost qw-undo',foot,'↶ Undo');S.on(undoB,'click',()=>undo());
  const s=Q.make();let turn=1,over=false,busy=false,sow=null,cur=5,lastPath=[];
  const human=p=>TWO||p===1;
  /* sow = {from, hand:[stones], path:[squares]} : preview state is s with the drops applied */
  function view(){
    if(!sow)return s.st;
    const v=s.st.map(a=>a.slice());v[sow.from]=[];sow.path.forEach((q,k)=>v[q].push(sow.hand[k]));return v;
  }
  function nextSq(){if(!sow)return[];const n=sow.path.length;const pos=n?sow.path[n-1]:sow.from,prev=n>1?sow.path[n-2]:n===1?sow.from:-1;return Q.NB[pos].filter(q=>q!==prev)}
  function stackHTML(a){
    const n=a.length;if(!n)return '';
    const step=n<=1?0:Math.min(11,52/(n-1));let h='';
    a.forEach((v,k)=>{h+=`<i class="qw-st ${CL[v]}" style="bottom:${14+k*step}%;z-index:${k+1}"></i>`});
    if(n>1)h+=`<em>${n}</em>`;
    return h;
  }
  function paint(){
    const v=view(),nx=nextSq(),myTurn=!over&&!busy&&human(turn);
    cells.forEach((e,i)=>{
      const key=v[i].join('');if(e.dataset.k!==key){e.dataset.k=key;e.innerHTML=stackHTML(v[i])}
      e.classList.toggle('pick',myTurn&&!sow&&v[i].length>0);
      e.classList.toggle('next',myTurn&&!!sow&&nx.includes(i));
      e.classList.toggle('from',!!sow&&i===sow.from);
      e.classList.toggle('trail',!!sow&&sow.path.includes(i)||(!sow&&lastPath.includes(i)));
      e.classList.toggle('cur',myTurn&&i===cur&&KB);
    });
    for(const p of[1,2]){who[p].classList.toggle('on',!over&&turn===p);
      who[p].querySelector('.qw-pile').innerHTML=`<i class="qw-st ${CL[p]}"></i><em>×${s.left[p]-(sow&&turn===p?1:0)}</em>`}
    if(sow){const rest=sow.hand.slice(sow.path.length);hand.innerHTML=`<span>In hand</span>`+rest.map((x,k)=>`<i class="qw-st ${CL[x]}${k===0?' nx':''}"></i>`).join('')}
    else hand.innerHTML=over?'<span>Game over. Press ↻ to play again</span>':`<span>${myTurn?'Tap a stack to add your stone':TWO?'':'Computer is thinking…'}</span>`;
    undoB.disabled=!sow||!myTurn;
  }
  let KB=false;
  function tap(i){
    if(over||busy||!human(turn))return;cur=i;
    if(!sow){
      if(!s.st[i].length){restartAnim(cells[i],'nope');beep(140,80,'sawtooth');st('Pick a square that has stones on it.');return}
      sow={from:i,hand:s.st[i].concat([turn]),path:[]};lastPath=[];beep(600,60);
      st(`Sow ${sow.hand.length} stones: tap the glowing squares.`);paint();return;
    }
    if(i===sow.from&&!sow.path.length){sow=null;beep(300,50);st('Choose a stack.');paint();return}
    if(!nextSq().includes(i)){restartAnim(cells[i],'nope');beep(140,80,'sawtooth');if(sow.path.length&&i===(sow.path.length>1?sow.path[sow.path.length-2]:sow.from))st("You can't step straight back to the square you just left.");return}
    sow.path.push(i);beep(440+sow.path.length*40,50);restartAnim(cells[i],'drop');
    if(sow.path.length===sow.hand.length){const m=sow;sow=null;commit(m.from,m.path,true)}
    else paint();
  }
  function undo(){if(!sow||busy)return;if(sow.path.length)sow.path.pop();else{sow=null;st('Choose a stack.')}beep(300,40);paint()}
  function commit(from,path,shown){
    const p=turn;Q.apply(s,p,from,path);lastPath=path.slice();
    paint();
    const t=Q.tops(s),wn=Q.winner(t,p);
    if(wn){
      over=true;const l=Q.lineOf(t,wn);
      S.after(250,()=>{g.classList.add('done');l.forEach((j,k)=>{cells[j].classList.add('hit');cells[j].style.animationDelay=k*110+'ms'})});
      const self=wn===p?'':(TWO?` (${NM[p]} handed it over)`:'');
      if(TWO){st(`${NM[wn]} lines up four${self}! Press ↻ for a rematch.`);S.after(500,()=>{S.fx.confetti();S.fx.banner(`${NM[wn]} wins!`);beep(990,300)})}
      else if(wn===1){st('Four of your stones in a line. You win!');S.after(700,S.next)}
      else{st('The computer lined up four. Press ↻ to try again.');S.after(500,()=>{S.shake();beep(150,400,'sawtooth')})}
      paint();return;
    }
    if(!s.left[1]&&!s.left[2]){over=true;st("All stones played and no line. It's a draw! Press ↻ to play again.");S.fx.banner('Draw');paint();return}
    turn=3-p;
    if(TWO){st(`${NM[turn]}'s turn. Tap a stack.`);paint();return}
    if(turn===2){busy=true;st('Computer is thinking…');paint();
      S.after(380,()=>{const m=Q.best(s,2,L);aiSow(m)})}
    else{st('Your turn.');paint()}
  }
  function aiSow(m){
    sow={from:m.from,hand:s.st[m.from].concat([2]),path:[]};paint();beep(600,60);
    const stepT=Math.max(170,Math.min(320,1700/m.path.length));
    m.path.forEach((q,k)=>S.after(380+k*stepT,()=>{sow.path.push(q);beep(440+(k+1)*40,50);restartAnim(cells[q],'drop');paint()}));
    S.after(380+m.path.length*stepT+250,()=>{sow=null;busy=false;commit(m.from,m.path)});
  }
  S.on(window,'keydown',e=>{
    if(over||busy||!human(turn))return;const k=e.key;
    const d={ArrowUp:-4,ArrowDown:4,ArrowLeft:-1,ArrowRight:1}[k];
    if(d){e.preventDefault();KB=true;
      if(sow){const pos=sow.path.length?sow.path[sow.path.length-1]:sow.from;const q=pos+d;if((d===-1&&pos%4===0)||(d===1&&pos%4===3)||q<0||q>15)return;tap(q);return}
      if((d===-1&&cur%4===0)||(d===1&&cur%4===3))return;const n=cur+d;if(n>=0&&n<16){cur=n;beep(600,15);paint()}}
    else if((k==='Enter'||k===' ')&&!sow){e.preventDefault();KB=true;tap(cur)}
    else if(k==='Backspace'||k==='Escape'||k==='z'){e.preventDefault();undo()}
  });
  S.after(900,()=>cells.forEach(e=>e.classList.remove('in')));
  paint();
}

/* Wall Race: 9x9 board, squares s=r*9+c. Player 0 starts at the bottom (row 8) and races to row 0,
   player 1 starts at the top and races to row 8. Walls sit on an 8x8 grid of groove crossings (i,j) =
   the point between rows i,i+1 and columns j,j+1. h[i*8+j]: horizontal wall under row i covering columns j,j+1.
   v[i*8+j]: vertical wall right of column j covering rows i,i+1. */
const WRL={
  start(){return{p:[76,4],h:new Uint8Array(64),v:new Uint8Array(64),w:[10,10]}},
  clone(s){return{p:s.p.slice(),h:s.h.slice(),v:s.v.slice(),w:s.w.slice()}},
  D:[-9,1,9,-1],                                   /* up right down left */
  open(s,q,d){
    const r=(q/9)|0,c=q%9,h=s.h,v=s.v;
    if(d===0){if(!r)return false;const b=(r-1)*8;return!(c<8&&h[b+c])&&!(c>0&&h[b+c-1])}
    if(d===2){if(r===8)return false;const b=r*8;return!(c<8&&h[b+c])&&!(c>0&&h[b+c-1])}
    if(d===3){if(!c)return false;return!(r<8&&v[r*8+c-1])&&!(r>0&&v[(r-1)*8+c-1])}
    if(c===8)return false;return!(r<8&&v[r*8+c])&&!(r>0&&v[(r-1)*8+c]);
  },
  goal(k){return k?8:0},
  /* BFS distances to player k's goal row (pawns ignored); 99 = cannot get there */
  Q:new Int16Array(81),
  dist(s,k){
    const d=new Int8Array(81).fill(99),Q=WRL.Q;let a=0,b=0;const g=WRL.goal(k)*9;
    for(let c=0;c<9;c++){d[g+c]=0;Q[b++]=g+c}
    while(a<b){const q=Q[a++],n=d[q]+1;for(let k2=0;k2<4;k2++){if(!WRL.open(s,q,k2))continue;const t=q+WRL.D[k2];if(d[t]>n){d[t]=n;Q[b++]=t}}}
    return d;
  },
  /* can player k reach the goal at all (fast DFS) */
  reach(s,k){
    const seen=new Uint8Array(81),Q=WRL.Q;let b=0;const gr=WRL.goal(k);Q[b++]=s.p[k];seen[s.p[k]]=1;
    while(b){const q=Q[--b];if(((q/9)|0)===gr)return true;for(let d=0;d<4;d++){if(!WRL.open(s,q,d))continue;const t=q+WRL.D[d];if(!seen[t]){seen[t]=1;Q[b++]=t}}}
    return false;
  },
  /* pawn destinations for player k, including straight jumps and side steps */
  moves(s,k){
    const me=s.p[k],op=s.p[1-k],out=[];
    for(let d=0;d<4;d++){
      if(!WRL.open(s,me,d))continue;const n=me+WRL.D[d];
      if(n!==op){out.push(n);continue}
      if(WRL.open(s,op,d))out.push(op+WRL.D[d]);
      else for(const d2 of[(d+1)&3,(d+3)&3])if(WRL.open(s,op,d2)){const t=op+WRL.D[d2];if(t!==me)out.push(t)}
    }
    return out;
  },
  /* wall o (0 horizontal, 1 vertical) at crossing i,j: no overlap and no crossing */
  fits(s,o,i,j){
    if(i<0||j<0||i>7||j>7)return false;const x=i*8+j;
    if(s.h[x]||s.v[x])return false;
    if(o===0)return!(j>0&&s.h[x-1])&&!(j<7&&s.h[x+1]);
    return!(i>0&&s.v[x-8])&&!(i<7&&s.v[x+8]);
  },
  /* full legality: fits and both players can still reach their goal */
  legal(s,o,i,j){
    if(!WRL.fits(s,o,i,j))return false;
    const a=o?s.v:s.h,x=i*8+j;a[x]=1;const ok=WRL.reach(s,0)&&WRL.reach(s,1);a[x]=0;return ok;
  },
  /* actions: {m:sq} pawn move or {o,i,j} wall */
  apply(s,k,a){if(a.m!=null)s.p[k]=a.m;else{(a.o?s.v:s.h)[a.i*8+a.j]=1;s.w[k]--}},
  undo(s,k,a,from){if(a.m!=null)s.p[k]=from;else{(a.o?s.v:s.h)[a.i*8+a.j]=0;s.w[k]++}},
  won(s,k){return((s.p[k]/9)|0)===WRL.goal(k)},
  /* the shortest path of player k as a list of squares (from its pawn to the goal) */
  path(s,k,d){
    d=d||WRL.dist(s,k);let q=s.p[k];const out=[q];
    while(d[q]>0&&d[q]<99){let nx=-1;for(let k2=0;k2<4;k2++){if(!WRL.open(s,q,k2))continue;const t=q+WRL.D[k2];if(d[t]===d[q]-1){nx=t;break}}if(nx<0)break;q=nx;out.push(q)}
    return out;
  },
  /* walls that block the first steps of player k's shortest path or sit around its pawn (legal only) */
  wallCands(s,k,steps){
    const P=WRL.path(s,k),seen=new Set(),out=[];
    const add=(o,i,j)=>{if(i<0||j<0||i>7||j>7)return;const key=o*64+i*8+j;if(seen.has(key))return;seen.add(key);if(WRL.legal(s,o,i,j))out.push({o,i,j})};
    for(let n=0;n<Math.min(steps,P.length-1);n++){
      const a=P[n],b=P[n+1],r=(a/9)|0,c=a%9;
      if(b-a===9||a-b===9){const i=b>a?r:r-1;add(0,i,c);add(0,i,c-1)}
      else{const j=b>a?c:c-1;add(1,r,j);add(1,r-1,j)}
    }
    const r=(s.p[k]/9)|0,c=s.p[k]%9;
    for(const i of[r-1,r])for(const j of[c-1,c]){add(0,i,j);add(1,i,j)}
    return out;
  },
  /* walls worth trying for player k: those that lengthen the opponent's shortest path, best first */
  wallsFor(s,k,all){
    const op=1-k,base=WRL.dist(s,op)[s.p[op]],mine=WRL.dist(s,k)[s.p[k]],P=WRL.path(s,op),seen=new Set(),out=[];
    const add=(o,i,j)=>{
      if(i<0||j<0||i>7||j>7)return;const key=o*64+i*8+j;if(seen.has(key))return;seen.add(key);
      if(!WRL.fits(s,o,i,j))return;const a=o?s.v:s.h,x=i*8+j;a[x]=1;
      const d1=WRL.dist(s,op)[s.p[op]],d0=WRL.dist(s,k)[s.p[k]];a[x]=0;
      if(d1>=99||d0>=99)return;const g=(d1-base)-(d0-mine);
      if(g>0||all)out.push({o,i,j,g});
    };
    for(let n=0;n<P.length-1;n++){
      const a=P[n],b=P[n+1],r=(a/9)|0,c=a%9;
      if(b-a===9||a-b===9){const i=b>a?r:r-1;add(0,i,c);add(0,i,c-1)}
      else{const j=b>a?c:c-1;add(1,r,j);add(1,r-1,j)}
    }
    out.sort((x,y)=>y.g-x.g);return out;
  },
  cands(s,k){
    const d=WRL.dist(s,k),a=WRL.moves(s,k).sort((x,y)=>d[x]-d[y]).map(m=>({m}));
    if(s.w[k]>0)for(const w of WRL.wallsFor(s,k).slice(0,14))a.push(w);
    return a;
  },
  /* position value for player k when player t is to move */
  score(s,k,t){
    const dm=WRL.dist(s,k)[s.p[k]],dop=WRL.dist(s,1-k)[s.p[1-k]],wm=s.w[k],wo=s.w[1-k];
    if(!wm&&!wo){const win=t===k?dm<=dop:dm<dop;return(win?100:-100)+(dop-dm)}
    let v=dop-dm+(t===k?.6:-.6);
    v+=.6*(wm-wo);
    if(!wo&&wm)v+=1.5;else if(!wm&&wo)v-=1.5;
    return v;
  },
  neg(s,k,depth,al,be,ctx){
    if((++ctx.n&31)===0&&performance.now()>ctx.end)ctx.stop=true;
    if(ctx.stop)return 0;
    if(depth===0)return WRL.score(s,k,k);
    const A=WRL.cands(s,k);let best=-1e9;
    for(const a of A){
      const from=s.p[k];WRL.apply(s,k,a);
      const v=WRL.won(s,k)?1000+depth:-WRL.neg(s,1-k,depth-1,-be,-al,ctx);
      WRL.undo(s,k,a,from);
      if(ctx.stop)return 0;
      if(v>best)best=v;if(v>al)al=v;if(al>=be)break;
    }
    return best;
  },
  /* iterative deepening alpha-beta at the root within the time budget */
  search(s,k,ms,maxD,noise){
    const ctx={n:0,stop:false,end:performance.now()+ms};let A=WRL.cands(s,k);
    if(s.w[k]>0){const seen=new Set(A.filter(a=>a.m==null).map(a=>a.o*64+a.i*8+a.j));for(const w of WRL.wallsFor(s,k,true))if(!seen.has(w.o*64+w.i*8+w.j))A.push(w)}
    A=A.filter(a=>a.m!=null||WRL.legal(s,a.o,a.i,a.j));
    let bestA=A[0];
    /* tie-breaks when the search sees no difference: step closer to the goal, never shuffle back to a square just left */
    const dm=WRL.dist(s,k),here=dm[s.p[k]],trail=s.trail&&s.trail[k]||[],bonus=new Map();
    for(const a of A)bonus.set(a,a.m==null?-.05:.2*(here-dm[a.m])-(trail.includes(a.m)?.3:0));
    for(let d=1;d<=maxD;d++){
      let al=-1e9,cur=null;const sc=[];
      for(const a of A){
        const b=bonus.get(a)+Math.random()*(noise||.01),from=s.p[k];WRL.apply(s,k,a);
        let v=WRL.won(s,k)?5000:-WRL.neg(s,1-k,d-1,-1e9,-(al-b)+.001,ctx);
        WRL.undo(s,k,a,from);if(ctx.stop)break;
        v+=b;sc.push([v,a]);
        if(v>al){al=v;cur=a}
      }
      if(ctx.stop&&d>1)break;
      if(cur)bestA=cur;sc.sort((x,y)=>y[0]-x[0]);A=sc.map(x=>x[1]).concat(A.slice(sc.length));
      if(al>900||ctx.stop)break;
      if(al<-900&&d>2){bestA=null;break}   /* sees a forced loss: don't stall to delay it, play on with a short search */
    }
    return bestA;
  },
  /* level 1..3 → an action for player k */
  pick(s,k,level){
    const dm=WRL.dist(s,k),ms=WRL.moves(s,k);
    const step=()=>{let b=ms[0],bd=99;for(const m of shuffle(ms.slice()))if(dm[m]<bd){bd=dm[m];b=m}return{m:b}};
    for(const m of ms)if(((m/9)|0)===WRL.goal(k))return{m};
    if(level===1){
      if(Math.random()<.18)return{m:ms[rand(ms.length)]};
      if(s.w[k]&&Math.random()<.2){const c=WRL.wallCands(s,1-k,3);if(c.length)return c[rand(c.length)]}
      return step();
    }
    if(!s.w[k])return step();   /* no walls left: nothing to plan, just race along the shortest path */
    const a=level===3?WRL.search(s,k,280,8)||WRL.search(s,k,120,2):WRL.search(s,k,120,2,.35);
    if(a&&a.m!=null){s.trail=s.trail||[[],[]];const t=s.trail[k];t.push(s.p[k]);if(t.length>3)t.shift()}
    return a||step();
  }
};

function walls(root,S){
  const L=S.level,TWO=L===4;
  const NM=TWO?['Blue','Pink']:['You','Computer'];
  const st=status(root,TWO?'Blue starts. Race to the far side, or tap a gap to drop a wall.':'Race your pawn to the top row. Tap a glowing square to move, or tap a gap to place a wall.');
  const bar=el('div','wr-bar',root);
  const chips=[0,1].map(k=>{const e=el('div','wr-who wr'+k,bar,'<i></i><span><b></b><small></small></span>');e.querySelector('b').textContent=NM[k];return e});
  const g=el('div','wr-board',root);g.dataset.ar=1;g.dataset.max=560;
  const P=2,G=2.3,C=(100-2*P-8*G)/9,U=C+G;          /* layout in % of board width */
  const sqs=[...Array(81)].map((_,i)=>{
    const r=(i/9)|0,c=i%9,e=el('div','wr-sq'+(r===0?' g0':r===8?' g1':''),g);
    e.style.cssText=`left:${P+c*U}%;top:${P+r*U}%;width:${C}%;height:${C}%;animation-delay:${Math.min((r+c)*22,360)}ms`;return e});
  const wl=el('div','wr-walls',g);
  const pawns=[0,1].map(k=>el('div','wr-pawn wr'+k,g,'<i></i>'));
  const prev=el('div','wr-wall prev',g);prev.hidden=true;
  const act=el('div','wr-act',root);
  const hint=el('div','wr-hint',act);
  const bTurn=el('button','btn ghost',act,'⟲ Turn'),bOk=el('button','btn',act,'✓ Place'),bNo=el('button','btn ghost',act,'✕');
  bTurn.setAttribute('aria-label','Turn wall');bNo.setAttribute('aria-label','Cancel wall');
  let s=WRL.start(),turn=0,busy=false,over=false,pv=null,targets=[];
  const human=()=>!over&&!busy&&(TWO||turn===0);
  function wallEl(o,i,j,e){
    e=e||el('div','wr-wall o'+o+' wr'+turn,wl);
    if(o===0)e.style.cssText=`left:${P+j*U}%;top:${P+(i+1)*U-G}%;width:${2*C+G}%;height:${G}%`;
    else e.style.cssText=`left:${P+(j+1)*U-G}%;top:${P+i*U}%;width:${G}%;height:${2*C+G}%`;
    return e;
  }
  function placePawn(k){const q=s.p[k];pawns[k].style.left=P+(q%9)*U+'%';pawns[k].style.top=P+((q/9)|0)*U+'%'}
  function draw(){
    placePawn(0);placePawn(1);
    targets=human()?WRL.moves(s,turn):[];
    sqs.forEach((e,i)=>e.classList.toggle('tgt',targets.includes(i)));
    pawns.forEach((p,k)=>p.classList.toggle('on',!over&&turn===k));
    chips.forEach((e,k)=>{
      e.classList.toggle('on',!over&&turn===k);
      e.querySelector('small').innerHTML='<em>'+'▮'.repeat(s.w[k])+'</em> '+s.w[k]+' wall'+(s.w[k]===1?'':'s');
    });
    g.classList.toggle('wr1turn',turn===1);
    const show=!!pv&&human();prev.hidden=!show;
    act.classList.toggle('pv',show);
    if(show){wallEl(pv.o,pv.i,pv.j,prev);prev.className='wr-wall prev o'+pv.o+' wr'+turn+(pv.ok?'':' bad');bOk.disabled=!pv.ok}
    hint.textContent=over?'Press ↻ to play again':!human()?'Computer is thinking…':s.w[turn]?(TWO?NM[turn]+': move, or tap a gap for a wall':'Tap a square to move, or a gap for a wall'):'No walls left: move your pawn';
  }
  function setPv(o,i,j,auto){
    i=clamp(i,0,7);j=clamp(j,0,7);
    let ok=WRL.legal(s,o,i,j);
    if(!ok&&auto&&WRL.legal(s,1-o,i,j)){o=1-o;ok=true}
    pv={o,i,j,ok};beep(ok?600:200,40);draw();
    if(!ok&&!COMPACT.matches)st(WRL.fits(s,o,i,j)?'That wall would close the last way through.':'Walls can\'t overlap or cross.');
  }
  function placeWall(){
    if(!pv||!pv.ok||!human())return;
    const a={o:pv.o,i:pv.i,j:pv.j};pv=null;commit(a);
  }
  function commit(a){
    const k=turn;
    if(a.m!=null){s.p[k]=a.m;restartAnim(pawns[k],'hop');beep(k?440:560,70)}
    else{WRL.apply(s,k,a);const e=wallEl(a.o,a.i,a.j);e.classList.add('drop');beep(240,90,'square');S.after(70,()=>beep(330,80,'square'))}
    if(WRL.won(s,k)){
      over=true;draw();restartAnim(pawns[k],'win');
      if(TWO){st(NM[k]+' wins! Press ↻ for a rematch.');S.fx.confetti();S.fx.banner(NM[k]+' wins!')}
      else if(k===0){st('You win! Press ↻ to play again.');S.next()}
      else{st('The computer got there first. Press ↻ to try again.');S.shake();beep(160,300,'sawtooth')}
      return;
    }
    turn=1-k;draw();
    if(!TWO&&turn===1){
      busy=true;draw();st('Computer is thinking…');
      S.after(380,()=>{const t=performance.now();const m=WRL.pick(s,1,L);busy=false;commit(m);if(!over)st('Your move.')});
    }else if(TWO)st(NM[turn]+"'s turn.");
  }
  function tap(e){
    if(!human())return;
    const b=g.getBoundingClientRect(),x=(e.clientX-b.left)/b.width*100,y=(e.clientY-b.top)/b.height*100;
    const u=(x-P+G/2)/U,v=(y-P+G/2)/U;                    /* integer = groove line, +.5 = square centre */
    const c=Math.floor(u),r=Math.floor(v),fu=u-c,fv=v-r;
    /* a tap well inside a glowing square moves there */
    if(c>=0&&c<9&&r>=0&&r<9&&targets.includes(r*9+c)&&fu>.12&&fu<.88&&fv>.12&&fv<.88){pv=null;commit({m:r*9+c});return}
    if(!s.w[turn]){st('No walls left. Move your pawn.');restartAnim(pawns[turn],'nope');beep(150,90,'sawtooth');return}
    const gx=clamp(Math.round(u),1,8),gy=clamp(Math.round(v),1,8),dx=Math.abs(u-gx),dy=Math.abs(v-gy);
    if(pv&&pv.i===gy-1&&pv.j===gx-1){setPv(1-pv.o,pv.i,pv.j);return}   /* same crossing again: turn it */
    setPv(dy<dx?0:1,gy-1,gx-1,true);
  }
  S.on(g,'click',tap);
  S.on(bTurn,'click',()=>{if(pv)setPv(1-pv.o,pv.i,pv.j)});
  S.on(bOk,'click',placeWall);
  S.on(bNo,'click',()=>{pv=null;draw()});
  S.on(window,'keydown',e=>{
    if(!human())return;const k=e.key;
    const dir={ArrowUp:0,ArrowRight:1,ArrowDown:2,ArrowLeft:3}[k];
    if(dir!=null){
      e.preventDefault();
      if(pv){const[di,dj]=[[-1,0],[0,1],[1,0],[0,-1]][dir];setPv(pv.o,pv.i+di,pv.j+dj);return}
      const me=s.p[turn],n=me+WRL.D[dir],j=n+WRL.D[dir];
      const t=targets.find(q=>q===n)??targets.find(q=>q===j&&n===s.p[1-turn]);
      if(t!=null)commit({m:t});else{restartAnim(pawns[turn],'nope');beep(150,60,'sawtooth')}
    }else if(k==='w'||k==='W'){if(!s.w[turn])return;if(pv)pv=null,draw();else{const q=s.p[1-turn];setPv(0,((q/9)|0)-turn,q%9,true)}}
    else if(pv&&(k==='r'||k==='R'||k===' ')){e.preventDefault();setPv(1-pv.o,pv.i,pv.j)}
    else if(pv&&k==='Enter'){e.preventDefault();placeWall()}
    else if(k==='Escape'&&pv){pv=null;draw()}
  });
  /* the engine's fit() leaves a few px of overflow with several rows around the board: trim the board to fit */
  const trim=()=>{if(!g.isConnected)return;const o=root.scrollHeight-root.clientHeight;if(o>0&&g.offsetWidth>200)g.style.width=Math.max(180,g.offsetWidth-Math.ceil(o*(+g.dataset.ar)))+'px'};
  S.on(window,'resize',()=>S.after(30,trim));S.after(60,trim);if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>S.after(60,trim));
  draw();
}

/* Pento Box: fill a 5×N box with N given pentominoes (every set below has been checked to have a solution) */
const PENTO_SH={F:['.##','##.','.#.'],I:['#####'],L:['####','#...'],N:['##..','.###'],P:['##','##','#.'],T:['###','.#.','.#.'],
  U:['#.#','###'],V:['#..','#..','###'],W:['#..','##.','.##'],X:['.#.','###','.#.'],Y:['####','.#..'],Z:['##.','.#.','.##']};
const PENTO_COL={F:'#FF5D73',I:'#5B6CFF',L:'#FFC53D',N:'#2EC4B6',P:'#B06CFF',T:'#FF8A3D',U:'#7ED957',V:'#FF7EC8',W:'#3FB8F5',X:'#F25C3D',Y:'#C9A2FF',Z:'#3DD6A0'};
const PENTO_N=[3,4,5,6,7,8,10,12];
const PENTO_SETS={"3":"FPU LNV LPV LTY NPU PUV PUY","4":"LPWY LPTV FLUY LPVY FIPU FLUV ILNV ILPV ILTY INPU IPUV IPUY LNPU LNVZ LPVZ LUVY PTVW FLPU FLTY FPUY LPTY LPUY LPYZ NPUY NTVY PUVZ","5":"ILPWY FILUY ILPVY ILNPU ILNVZ ILUVY IPTVW NPVWY FILPU FIPUY FNPUV ILPUY ILPYZ INTVY IPUVZ LNPUZ LPWYZ FLPUW FLPUX FLPVY FLUYZ FPTUY LNPWY LNUWY LPTUX LPTWY LPUVW LUVYZ NPUVY PVWYZ","6":"INPVWY ILNPUZ ILPVYZ ILUVYZ ILPTUX FLNPTU ILPTWY FNPUVY IPTVWZ FLPUWY LNPTWZ FIPTUV FLNPVZ FLPVWY ILNUVX INPTVZ IPUVYZ LTVWYZ FILPTV FINPVY FITUWY FLNUVW FLUVYZ ILNPTZ ILNUVY INPTUZ LNPTUV LNPUXY LPTWYZ PTUVWY","7":"ILNPUVY INPVWYZ FINPUVZ FILNPTV FLNPVYZ ILNPTWZ FLPUVYZ ILNPVWY FILNVWZ ILPUWXY FILPUYZ LNPUVWZ FLPTUXY ILPTUVW LPUVWXY FLNPUVW LNPUVWY FILNUYZ FLNPTYZ FLTVWYZ ILPTVWX INTUWYZ FILNPVW FINTVWY FLNPUVX FLPTVWX FNPUVWY INTVWYZ LNPUVXY NPUVXYZ","8":"ILNPUVYZ FINPTUVY FILNPTVW ILPUVWYZ ILNPTUWY FILPTUWY ILNPTVWZ FINPTUWY ILPTVWYZ INPTUWYZ FILUVXYZ FLPUVWYZ NPTUVWYZ ILNPTWYZ FILTVWYZ ILPTUWXY FLNPTVWX LNPTVWXY FILPUVWX FLNPUVXY FILNPUXZ FLNUVWYZ LNPUVXYZ FILPVWXY FLPUVWXY LNPTUVXZ FILTUXYZ FLUVWXYZ ILPTVXYZ LPTVWXYZ","10":"FILNPTUVWX FILNPTUVWZ FILNPTUVYZ FILNPTUXYZ FILNPTVWYZ FILNPUVWXY FILNPUVXYZ FILPTUVWXY FINPTUVWYZ FLNPTUVWXY FLNPTUVXYZ ILNPTUVWYZ FILPTUWXYZ FILPTUVXYZ FLNPUVWXYZ FILNPTUVXZ ILNPTVWXYZ FLPTUVWXYZ FLNPTUWXYZ ILNPTUVWXZ FILNPUVWXZ FILNPTVWXZ FILPTUVWXZ FINPTUVWXY FILNTVWXYZ INPTUVWXYZ FILNTUWXYZ FINTUVWXYZ FILTUVWXYZ FNPTUVWXYZ","12":"FILNPTUVWXYZ"};
const PENTO={
  cells(k){const o=[];PENTO_SH[k].forEach((r,i)=>[...r].forEach((ch,j)=>{if(ch==='#')o.push([i,j])}));return o},
  norm(cs){const r0=Math.min(...cs.map(p=>p[0])),c0=Math.min(...cs.map(p=>p[1]));return cs.map(([r,c])=>[r-r0,c-c0]).sort((a,b)=>a[0]-b[0]||a[1]-b[1])},
  rot(cs){return PENTO.norm(cs.map(([r,c])=>[c,-r]))},          /* clockwise */
  flip(cs){return PENTO.norm(cs.map(([r,c])=>[r,-c]))},
  dims(cs){return[Math.max(...cs.map(p=>p[0]))+1,Math.max(...cs.map(p=>p[1]))+1]},
  /* table layout (in cell units) that gives the biggest cells for the space aw×ah */
  layout(N,aw,ah){
    let best=null;
    for(const[bw,bh]of[[N,5],[5,N]])for(const sc of[.42,.5,.6,.7])for(let k=1;k<=N;k++){
      const s=5*sc+.35,rows=Math.ceil(N/k),gap=.6;
      for(const side of[0,1]){
        const W=side?bw+gap+k*s:Math.max(bw,k*s),H=side?Math.max(bh,rows*s):bh+gap+rows*s;
        const px=Math.min(aw/W,ah/H),v=Math.min(px,70)*Math.sqrt(sc);
        if(!best||v>best.v)best={v,px,W,H,bw,bh,sc,s,k,side,gap};
      }
    }
    const b=best;b.bx=b.side?0:(b.W-b.bw)/2;b.by=b.side?(b.H-b.bh)/2:0;
    b.tx=b.side?b.bw+b.gap:(b.W-b.k*b.s)/2;b.ty=b.side?(b.H-Math.ceil(N/b.k)*b.s)/2:b.bh+b.gap;
    return b;
  }
};

function pento(root,S){
  const L=S.level,N=PENTO_N[L-1],list=PENTO_SETS[N].split(' ');
  const key='pento:i'+N;let idx=(store.get(key)||0)%list.length;
  const st=status(root,'Drag every piece into the box until it is full. Tap a piece to turn it, Flip to mirror it.');
  const bar=el('div','row mbar pn-bar',root,`<span>Puzzle <b>${idx+1}</b>/${list.length}</span><span class="pn-t">⏱ <b>0:00</b></span><span class="pn-b">Best <b>–</b></span>`);
  const tEl=$('.pn-t b',bar),bEl=$('.pn-b b',bar);
  const g=el('div','pn-table',root);
  const btns=el('div','row pn-btns',root);
  const bRot=el('button','btn ghost',btns,'⟳ Turn'),bFlip=el('button','btn ghost',btns,'⇋ Flip'),bNext=el('button','btn',btns,'Next ▸');
  bNext.setAttribute('aria-label','Next puzzle');
  /* lay out for the space left once the other rows are in */
  const gap=parseFloat(getComputedStyle(root).rowGap)||0;let used=20;
  for(const ch of root.children)if(ch!==g&&getComputedStyle(ch).display!=='none')used+=ch.offsetHeight+gap;
  const lay=PENTO.layout(N,Math.max(200,root.clientWidth-(COMPACT.matches?2:8)),Math.max(200,root.clientHeight-used));
  const{W,H,bw,bh,bx,by,sc,s}=lay;
  g.dataset.ar=W/H;g.dataset.max=Math.round(W*64);g.style.setProperty('--u',100/W+'cqw');g.style.aspectRatio=W/H;
  const fmt=t=>Math.floor(t/60)+':'+String(t%60).padStart(2,'0');
  const bk='best:pento'+N,b0=store.get(bk);if(b0!=null)bEl.textContent=fmt(b0);
  const tray=el('div','pn-tray',g),tr=Math.ceil(N/lay.k);tray.style.cssText=`left:calc(var(--u)*${lay.tx-.15});top:calc(var(--u)*${lay.ty-.15});width:calc(var(--u)*${lay.k*s+.3});height:calc(var(--u)*${tr*s+.3})`;
  const box=el('div','pn-box',g);box.style.cssText=`left:calc(var(--u)*${bx});top:calc(var(--u)*${by});width:calc(var(--u)*${bw});height:calc(var(--u)*${bh});grid-template-columns:repeat(${bw},1fr)`;
  const bc=[...Array(bw*bh)].map((_,i)=>{const e=el('div','pn-c',box);e.style.animationDelay=Math.min(((i/bw|0)+i%bw)*25,400)+'ms';return e});
  const occ=Array(bw*bh).fill(-1);
  const letters=shuffle(list[idx].split(''));
  const P=letters.map((k,id)=>{
    let cs=PENTO.norm(PENTO.cells(k));for(let n=rand(4);n--;)cs=PENTO.rot(cs);if(rand(2))cs=PENTO.flip(cs);
    const e=el('div','pn-p',g);e.style.setProperty('--pc',PENTO_COL[k]);e.setAttribute('aria-label','Piece '+k);
    return{id,k,cs,at:null,e,home:id};
  });
  let sel=null,drag=null,t0=0,secs=0,over=false;
  const slotXY=h=>{const r=Math.floor(h/lay.k),c=h%lay.k;return[lay.tx+c*s,lay.ty+r*s]};
  function render(p,x,y,scale){
    const[h,w]=PENTO.dims(p.cs);
    if(x==null){
      if(p.at){x=bx+p.at[1];y=by+p.at[0];scale=1}
      else{const[sx,sy]=slotXY(p.home);scale=sc;x=sx+(s-w*sc)/2;y=sy+(s-h*sc)/2}
    }
    p.x=x;p.y=y;p.sc=scale;
    const e=p.e;e.style.left=`calc(var(--u)*${x})`;e.style.top=`calc(var(--u)*${y})`;
    e.style.width=`calc(var(--u)*${w*scale})`;e.style.height=`calc(var(--u)*${h*scale})`;
    const kids=e.children;
    p.cs.forEach(([r,c],i)=>{const q=kids[i]||el('i',null,e);q.style.cssText=`left:${c/w*100}%;top:${r/h*100}%;width:${100/w}%;height:${100/h}%`});
    e.classList.toggle('on',p.at!=null);e.classList.toggle('sel',sel===p);
  }
  function fits(cs,r,c,id){for(const[dr,dc]of cs){const R=r+dr,C=c+dc;if(R<0||C<0||R>=bh||C>=bw)return false;const o=occ[R*bw+C];if(o>=0&&o!==id)return false}return true}
  function lift(p){if(!p.at)return;for(const[dr,dc]of p.cs)occ[(p.at[0]+dr)*bw+p.at[1]+dc]=-1;p.at=null}
  function put(p,r,c){p.at=[r,c];for(const[dr,dc]of p.cs)occ[(r+dr)*bw+c+dc]=p.id}
  function paintBox(gh){
    bc.forEach((e,i)=>{e.classList.toggle('gh',!!gh&&gh.ok&&gh.at.has(i));e.classList.toggle('bad',!!gh&&!gh.ok&&gh.at.has(i))});
  }
  function startClock(){if(!t0&&!over){t0=performance.now();restartAnim(tEl.parentNode,'bump')}}
  S.every(250,()=>{if(t0&&!over){const n=Math.floor((performance.now()-t0)/1000);if(n!==secs){secs=n;tEl.textContent=fmt(secs)}}});
  function check(){
    if(occ.every(v=>v>=0)){
      over=true;secs=Math.max(1,Math.round((performance.now()-t0)/1000));tEl.textContent=fmt(secs);
      const nb=best('pento'+N,secs,true);if(nb)bEl.textContent=fmt(secs);
      store.set(key,(idx+1)%list.length);best('pento',(store.get('best:pento')||0)+1);
      P.forEach(q=>{q.e.classList.remove('spin','snap');q.e.style.animationDelay=q.id*60+'ms'});g.classList.add('won');sel=null;P.forEach(q=>render(q));
      st(`Box filled in ${fmt(secs)}!${nb?' New best!':''} Tap Next for another.`);
      bNext.classList.add('go');S.next();
    }
  }
  /* turn or flip a piece; on the board it stays put if it still fits, otherwise it goes back to the tray */
  function morph(p,f){
    if(over)return;startClock();
    const[h,w]=PENTO.dims(p.cs),ncs=f(p.cs),[h2,w2]=PENTO.dims(ncs);
    if(p.at){
      const[r,c]=p.at;lift(p);p.cs=ncs;
      const r0=Math.round(r+(h-h2)/2),c0=Math.round(c+(w-w2)/2);
      const spot=[[0,0],[0,-1],[-1,0],[0,1],[1,0],[-1,-1],[1,1],[-1,1],[1,-1]].map(([a,b])=>[r0+a,c0+b]).find(([R,C])=>fits(ncs,R,C,p.id));
      if(spot)put(p,spot[0],spot[1]);
    }else p.cs=ncs;
    sel=p;P.forEach(q=>render(q));p.e.style.animationDelay='';restartAnim(p.e,'spin');beep(p.at?560:480,40);check();
  }
  const pt=e=>{const b=g.getBoundingClientRect();return[(e.clientX-b.left)/b.width*W,(e.clientY-b.top)/b.height*H]};
  for(const p of P){
    render(p);p.e.style.animationDelay=p.id*50+'ms';
    S.on(p.e,'pointerdown',e=>{
      if(over||drag)return;e.preventDefault();p.e.setPointerCapture(e.pointerId);
      const[x,y]=pt(e),[h,w]=PENTO.dims(p.cs);   /* grab point in the piece's own cells (layout, not the animated box) */
      drag={p,id:e.pointerId,x0:e.clientX,y0:e.clientY,moved:false,gx:clamp((x-p.x)/p.sc,0,w),gy:clamp((y-p.y)/p.sc,0,h),lift:e.pointerType==='mouse'?0:.9,spot:null};
    });
    S.on(p.e,'pointermove',e=>{
      if(!drag||drag.p!==p||e.pointerId!==drag.id)return;
      if(!drag.moved){if(Math.hypot(e.clientX-drag.x0,e.clientY-drag.y0)<7)return;drag.moved=true;lift(p);sel=p;P.forEach(q=>render(q));p.e.classList.add('drag');startClock();beep(420,30)}
      const[x,y]=pt(e),X=x-drag.gx,Y=y-drag.gy-drag.lift;render(p,X,Y,1);
      const r=Math.round(Y-by),c=Math.round(X-bx),[h,w]=PENTO.dims(p.cs);
      const near=r>-1.6&&c>-1.6&&r+h<bh+1.6&&c+w<bw+1.6;
      if(near){const ok=fits(p.cs,r,c,p.id),at=new Set(p.cs.map(([dr,dc])=>(r+dr)*bw+c+dc).filter((i,n)=>{const R=r+p.cs[n][0],C=c+p.cs[n][1];return R>=0&&C>=0&&R<bh&&C<bw}));drag.spot=ok?[r,c]:null;paintBox({ok,at})}
      else{drag.spot=null;paintBox(null)}
    });
    const up=e=>{
      if(!drag||drag.p!==p||e.pointerId!==drag.id)return;const d=drag;drag=null;p.e.classList.remove('drag');paintBox(null);
      if(!d.moved){if(e.type==='pointerup')morph(p,PENTO.rot);return}
      if(d.spot){put(p,d.spot[0],d.spot[1]);beep(660,60);S.after(60,()=>beep(880,50));p.e.style.animationDelay='';restartAnim(p.e,'snap')}
      else beep(260,60,'square');
      P.forEach(q=>render(q));check();
    };
    S.on(p.e,'pointerup',up);S.on(p.e,'pointercancel',up);
    S.on(p.e,'contextmenu',e=>{e.preventDefault();morph(p,PENTO.flip)});
  }
  const need=()=>{if(!sel){st('Tap a piece first, then Turn or Flip it.');S.fx.toast('Pick a piece first');return false}return true};
  S.on(bRot,'click',()=>{if(need())morph(sel,PENTO.rot)});
  S.on(bFlip,'click',()=>{if(need())morph(sel,PENTO.flip)});
  S.on(bNext,'click',()=>{if(!over)store.set(key,(idx+1)%list.length);S.restart()});
  /* the engine's fit() leaves a few px of overflow with several rows around the board: trim the board to fit */
  const trim=()=>{if(!g.isConnected)return;const o=root.scrollHeight-root.clientHeight;if(o>0&&g.offsetWidth>200)g.style.width=Math.max(180,g.offsetWidth-Math.ceil(o*(+g.dataset.ar)))+'px'};
  S.on(window,'resize',()=>S.after(30,trim));S.after(60,trim);if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>S.after(60,trim));
  S.on(window,'keydown',e=>{
    const k=e.key.toLowerCase();
    if(k==='r'&&sel)morph(sel,PENTO.rot);else if(k==='f'&&sel)morph(sel,PENTO.flip);
    else if(k==='n'){bNext.click()}
    else if(k==='tab'){e.preventDefault();sel=sel?P[(sel.id+(e.shiftKey?P.length-1:1))%P.length]:P[0];P.forEach(q=>render(q))}
  });
}


/* Wahoo engine. The board is a plus sign on a 13x13 grid: a 48-hole track runs clockwise around it, each
   arm has a 4-hole home row in its middle column and the center hole is a shortcut. A marble's position is
   relative to its owner: -1 = start area, 0..47 = track steps from its start hole (47 is its own arm tip,
   the home entrance), 48..51 = home holes 1..4 (51 deepest), 99 = center hole. */
const WAHOO_T={k:1};
const WAHOO_E=(()=>{
  const OUT=-1,CEN=99,H0=48,LAST=51,TIPP=47,TR=[];
  const add=(r,c)=>TR.push([r,c]);
  for(let c=0;c<5;c++)add(5,c);add(5,5);for(let r=4;r>=0;r--)add(r,5);add(0,6);
  for(let r=0;r<5;r++)add(r,7);add(5,7);for(let c=8;c<13;c++)add(5,c);add(6,12);
  for(let c=12;c>7;c--)add(7,c);add(7,7);for(let r=8;r<13;r++)add(r,7);add(12,6);
  for(let r=12;r>7;r--)add(r,5);add(7,5);for(let c=4;c>=0;c--)add(7,c);add(6,0);
  /* seats: 0 bottom, 1 left, 2 top, 3 right (clockwise turn order) */
  const TIP=[35,47,11,23],START=TIP.map(t=>(t+1)%48),CORN=[5,17,29,41];
  const HOME=[[[11,6],[10,6],[9,6],[8,6]],[[6,1],[6,2],[6,3],[6,4]],[[1,6],[2,6],[3,6],[4,6]],[[6,11],[6,10],[6,9],[6,8]]];
  const isHome=p=>p>=H0&&p<=LAST;
  const g=(k,p)=>(START[k]+p)%48;
  const cell=(k,p)=>p===CEN?[6,6]:isHome(p)?HOME[k][p-H0]:p>=0?TR[g(k,p)]:null;
  const start=()=>[0,1,2,3].map(()=>[OUT,OUT,OUT,OUT]);
  const cl=s=>s.map(a=>a.slice());
  const mine=(s,k,p)=>s[k].indexOf(p)>=0;
  /* the opponent marble [player, marble] on the shared hole that player k's position p maps to */
  function who(s,k,p){
    if(p===OUT||isHome(p))return null;const key=p===CEN?'c':g(k,p);
    for(let j=0;j<4;j++){if(j===k)continue;for(let m=0;m<4;m++){const q=s[j][m];if(q===OUT||isHome(q))continue;if((q===CEN?'c':g(j,q))===key)return[j,m]}}
    return null;
  }
  /* legal moves for player k with die d: {m, from, to, path:[positions hopped through], cap} */
  function moves(s,k,d){
    const out=[],me=s[k];let entered=false;
    const push=(m,from,to,path)=>out.push({m,from,to,path,cap:who(s,k,to)});
    for(let m=0;m<4;m++){
      const q=me[m];
      if(q===OUT){if((d===1||d===6)&&!entered&&!mine(s,k,0)){entered=true;push(m,q,0,[0])}continue}
      if(q===CEN){if(d===1)for(const c of CORN){const p=(c-START[k]+48)%48;if(!mine(s,k,p))push(m,q,p,[p])}continue}
      const path=[];let ok=true;
      for(let i=1;i<=d;i++){const p=q+i;if(p>LAST||mine(s,k,p)){ok=false;break}path.push(p)}
      if(ok)push(m,q,q+d,path);
      /* center shortcut: a move that reaches a corner hole with exactly one step left may step into the center */
      if(isHome(q))continue;const pc=q+d-1;
      if(pc<=TIPP&&CORN.includes(g(k,pc))&&!mine(s,k,CEN)){
        let clear=true;const cp=[];for(let i=1;i<d;i++){if(mine(s,k,q+i))clear=false;cp.push(q+i)}
        if(clear){cp.push(CEN);push(m,q,CEN,cp)}
      }
    }
    return out;
  }
  function apply(s,k,mv){const n=cl(s);if(mv.cap)n[mv.cap[0]][mv.cap[1]]=OUT;n[k][mv.m]=mv.to;return n}
  const won=(s,k)=>s[k].every(isHome);
  /* ---------- computer player ---------- */
  const val=p=>p===OUT?-6:p===CEN?40:isHome(p)?62+(p-H0)*2:8+p;
  /* rough chance that marble m of player k is sent home before k moves again */
  function risk(s,k,m){
    const p=s[k][m];if(p===OUT||isHome(p))return 0;let miss=1;
    for(let j=0;j<4;j++){if(j===k)continue;let n=0;
      for(let d=1;d<=6;d++)if(moves(s,j,d).some(o=>o.cap&&o.cap[0]===k&&o.cap[1]===m))n++;
      miss*=1-n/6}
    return 1-miss;
  }
  function evalPos(s,k){
    if(won(s,k))return 1e6;let v=0;
    for(let m=0;m<4;m++){const p=s[k][m];v+=val(p)-(val(p)+6)*.8*risk(s,k,m)}
    for(let j=0;j<4;j++)if(j!==k)for(const p of s[j])v-=.5*val(p);
    if(mine(s,k,0)&&mine(s,k,OUT))v-=3;
    for(let d=1;d<=6;d++)if(moves(s,k,d).some(o=>o.cap))v+=1.2;
    return v;
  }
  function choose(s,k,d,easy){
    const list=moves(s,k,d);if(!list.length)return null;
    if(easy&&Math.random()<.45)return list[Math.floor(Math.random()*list.length)];
    let best=list[0],bs=-Infinity;
    for(const mv of list){const v=evalPos(apply(s,k,mv),k)+(easy?Math.random()*25:0);if(v>bs){bs=v;best=mv}}
    return best;
  }
  return{OUT,CEN,H0,LAST,TR,TIP,START,CORN,HOME,isHome,g,cell,start,cl,who,moves,apply,won,risk,evalPos,choose};
})();

function wahoo(root,S){
  const E=WAHOO_E,L=S.level,T=()=>WAHOO_T.k,EASY=L===1;
  const HUM=L<=2?[1,0,0,0]:L===3?[1,0,1,0]:[1,1,1,1];
  const COL=['#FF4D6D','#3B82F6','#FFC53D','#22C55E'],CN=['Red','Blue','Yellow','Green'];
  const NM=k=>L<=2&&k===0?'You':CN[k];
  const st=status(root,L<=2?'You are Red. Roll a 1 or 6 to bring a marble out, race clockwise and fill your 4 home holes first.':L===3?'Red and Yellow take turns on this device; Blue and Green are computers. Roll a 1 or 6 to get out.':'Four players pass and play. Roll a 1 or 6 to bring a marble out and fill your home first.');
  const W=416,CS=W/13,{c,x}=canvas(root,W,W);c.classList.add('wh-cv');c.dataset.max=720;
  const bar=el('div','row wh-row',root);
  const pill=el('div','wh-pill',bar,'<i></i><span></span>'),dot=pill.querySelector('i'),ptxt=pill.querySelector('span');
  const rollB=el('button','btn wh-roll',bar,'🎲 Roll');
  let s=E.start(),turn=0,phase='idle',die=0,rolling=0,mv=[],sel=-1,kb=-1,anim=null,fly=null,over=false,clock=0;
  const Q=[[8,0],[0,0],[0,8],[8,8]];
  const qc=k=>({x:(Q[k][1]+2.5)*CS,y:(Q[k][0]+2.5)*CS,ox:Q[k][1]?1:-1,oy:Q[k][0]?1:-1});
  const slot=(k,i)=>{const q=qc(k);return{x:q.x+q.ox*7+(i%2?1:-1)*CS*.8,y:q.y+q.oy*7+(i<2?-1:1)*CS*.8}};
  const dieAt=k=>{const q=qc(k);return{x:q.x-q.ox*CS*1.6,y:q.y-q.oy*CS*1.6}};
  const px=rc=>({x:(rc[1]+.5)*CS,y:(rc[0]+.5)*CS});
  const at=(k,m,p=s[k][m])=>p===E.OUT?slot(k,m):px(E.cell(k,p));
  const human=()=>!!HUM[turn];
  function say(t,imp){ptxt.textContent=t;dot.style.background=COL[turn];if(imp||!COMPACT.matches)st(t)}
  /* ---------- drawing ---------- */
  function hole(X,Y,r,fill,stroke,lw){x.beginPath();x.arc(X,Y,r,0,7);x.fillStyle=fill;x.fill();if(stroke){x.lineWidth=lw||2;x.strokeStyle=stroke;x.stroke()}}
  function marble(X,Y,k,P,sc=1){
    const r=11.5*sc;x.beginPath();x.arc(X,Y,r,0,7);x.fillStyle=COL[k];x.fill();x.lineWidth=2.2;x.strokeStyle=P.edge;x.stroke();
    x.beginPath();x.ellipse(X-r*.32,Y-r*.36,r*.36,r*.24,-.6,0,7);x.fillStyle='rgba(255,255,255,.6)';x.fill();
  }
  const PIPS={1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[1,-1],[-1,1],[1,1]],5:[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],6:[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]};
  function drawDie(P){
    if(!die)return;const p=dieAt(turn),sz=34;x.save();x.translate(p.x,p.y);
    if(rolling>0)x.rotate(Math.sin(clock*40)*.5);
    rr(x,-sz/2,-sz/2,sz,sz,8);x.fillStyle='#FFFDF5';x.fill();x.lineWidth=3;x.strokeStyle=P.edge;x.stroke();
    x.fillStyle='#1E1F5C';for(const[a,b]of PIPS[die]){x.beginPath();x.arc(a*sz*.26,b*sz*.26,sz*.09,0,7);x.fill()}
    x.restore();
  }
  function draw(){
    const P=pal();x.clearRect(0,0,W,W);
    /* start nests */
    for(let k=0;k<4;k++){
      const X0=Q[k][1]*CS,Y0=Q[k][0]*CS,act=k===turn&&!over;
      x.globalAlpha=act?.3:.16;rr(x,X0+6,Y0+6,CS*5-12,CS*5-12,16);x.fillStyle=COL[k];x.fill();x.globalAlpha=1;
      x.lineWidth=act?3.5:2;x.strokeStyle=act?P.edge:COL[k];x.stroke();
      for(let i=0;i<4;i++){const p=slot(k,i);hole(p.x,p.y,10,'rgba(0,0,0,.16)')}
      const q=qc(k);x.font=`800 13px ${DISPLAY}`;x.textAlign='center';x.textBaseline='middle';x.fillStyle=P.ink;
      x.fillText(NM(k).toUpperCase()+(HUM[k]?'':' · CPU'),q.x+q.ox*7,q.y+q.oy*CS*1.95);
    }
    /* the cross */
    x.fillStyle=P.line;rr(x,CS*5+2,2,CS*3-4,W-4,14);x.fill();rr(x,2,CS*5+2,W-4,CS*3-4,14);x.fill();
    x.setLineDash([3,4]);x.lineWidth=2;x.strokeStyle=P.muted;x.beginPath();
    for(const i of E.CORN){const p=px(E.TR[i]);x.moveTo(p.x,p.y);x.lineTo(W/2,W/2)}x.stroke();x.setLineDash([]);
    E.TR.forEach((rc,i)=>{const p=px(rc);hole(p.x,p.y,10,'rgba(0,0,0,.2)');if(E.CORN.includes(i))hole(p.x,p.y,13.5,'rgba(0,0,0,0)',P.muted,2)});
    for(let k=0;k<4;k++){
      const sp=px(E.TR[E.START[k]]);hole(sp.x,sp.y,12.5,'rgba(0,0,0,0)',COL[k],3.5);
      for(const rc of E.HOME[k]){const p=px(rc);x.globalAlpha=.45;hole(p.x,p.y,10.5,COL[k]);x.globalAlpha=1;hole(p.x,p.y,10.5,'rgba(0,0,0,0)',COL[k],2)}
      const tp=px(E.TR[E.TIP[k]]),hp=px(E.HOME[k][0]);x.fillStyle=COL[k];x.beginPath();
      const ax=(hp.x-tp.x)/CS,ay=(hp.y-tp.y)/CS,mx=(tp.x+hp.x)/2,my=(tp.y+hp.y)/2;
      x.moveTo(mx+ax*5,my+ay*5);x.lineTo(mx-ax*3+ay*5,my-ay*3+ax*5);x.lineTo(mx-ax*3-ay*5,my-ay*3-ax*5);x.fill();
    }
    hole(W/2,W/2,14,'rgba(0,0,0,.22)',P.ink,2.5);
    x.font=`14px ${DISPLAY}`;x.fillStyle=P.muted;x.textAlign='center';x.textBaseline='middle';if(!s.some(a=>a.includes(E.CEN)))x.fillText('★',W/2,W/2+1);
    /* highlights */
    const pulse=1.5+Math.sin(clock*6)*1.5,pick=phase==='pick'&&human();
    if(pick){
      const ms=new Set(mv.map(o=>o.m));
      for(const m of ms){if(sel>=0&&m!==sel)continue;const p=at(turn,m);hole(p.x,p.y,15+pulse,'rgba(0,0,0,0)',m===sel?P.c3:P.ink,3)}
      const show=sel>=0?mv.filter(o=>o.m===sel):kb>=0?[mv[kb]]:[];
      for(const o of show){const p=at(turn,o.m,o.to);x.globalAlpha=.55;hole(p.x,p.y,11,COL[turn]);x.globalAlpha=1;x.setLineDash([4,3]);hole(p.x,p.y,14,'rgba(0,0,0,0)',P.ink,2.5);x.setLineDash([])}
      if(kb>=0){const p=at(turn,mv[kb].m);hole(p.x,p.y,19,'rgba(0,0,0,0)',P.c3,3)}
    }
    /* marbles */
    for(let k=0;k<4;k++)for(let m=0;m<4;m++){
      if(anim&&anim.k===k&&anim.m===m)continue;if(fly&&fly.k===k&&fly.m===m)continue;
      const p=at(k,m);marble(p.x,p.y,k,P);
    }
    if(fly){const t=Math.min(1,fly.t/fly.dur),e=t*t*(3-2*t);marble(fly.a.x+(fly.b.x-fly.a.x)*e,fly.a.y+(fly.b.y-fly.a.y)*e-Math.sin(t*Math.PI)*40,fly.k,P,1+Math.sin(t*Math.PI)*.4)}
    if(anim){const a=anim,i=Math.min(a.i,a.pts.length-2),t=Math.min(1,a.t/a.hop),A=a.pts[i],B=a.pts[i+1];
      marble(A.x+(B.x-A.x)*t,A.y+(B.y-A.y)*t-Math.sin(t*Math.PI)*12,a.k,P,1+Math.sin(t*Math.PI)*.2)}
    drawDie(P);
  }
  /* ---------- turn flow ---------- */
  function setRoll(on){rollB.disabled=!on;rollB.classList.toggle('wh-go',on)}
  function startTurn(again){
    if(over)return;phase='roll';sel=-1;kb=-1;mv=[];
    if(human()){setRoll(true);say(again?`${NM(turn)} rolled a 6: roll again!`:NM(turn)==='You'?'Your turn: roll the die':`${NM(turn)}'s turn: roll the die`)}
    else{setRoll(false);say(again?`${NM(turn)} rolled a 6 and goes again`:`${NM(turn)}'s turn`);S.after(300*T(),roll)}
  }
  function roll(){
    if(phase!=='roll'||over)return;phase='rolling';setRoll(false);rolling=(human()?.5:.38)*T();die=1+rand(6);beep(300,40,'square');
  }
  function rolled(){
    const d=die,me=NM(turn);mv=E.moves(s,turn,d);beep(520,70);
    if(!mv.length){phase='wait';say(`${me} rolled ${d}: no move`+(d===6?', roll again':''),human());S.after(1000*T(),()=>endTurn(d));return}
    if(!human()){phase='wait';say(`${me} rolled ${d}`);S.after(260*T(),()=>go(E.choose(s,turn,d,EASY)));return}
    if(mv.length===1){phase='wait';say(`${me==='You'?'You':me} rolled ${d}`);S.after(300*T(),()=>go(mv[0]));return}
    phase='pick';say(me==='You'?`You rolled ${d}: tap a glowing marble`:`${me} rolled ${d}: tap a glowing marble`);
  }
  function go(o){
    phase='anim';sel=-1;kb=-1;
    const pts=[at(turn,o.m,o.from)].concat(o.path.map(p=>at(turn,o.m,p)));
    anim={k:turn,m:o.m,pts,i:0,t:0,hop:(o.from===E.OUT||o.from===E.CEN||o.to===E.CEN&&o.path.length===1?220:115)*T(),o};
  }
  function landed(o){
    const k=turn,cap=o.cap;
    if(cap){fly={k:cap[0],m:cap[1],a:at(cap[0],cap[1]),b:slot(cap[0],cap[1]),t:0,dur:520*T()}}
    s=E.apply(s,k,o);anim=null;
    if(cap){beep(180,160,'sawtooth');S.after(90,()=>beep(140,200,'sawtooth'));
      const hit=NM(cap[0]),imp=HUM[cap[0]]||HUM[k];
      say(cap[0]===0&&L<=2?`${NM(k)} sent you back to start!`:k===0&&L<=2?`You sent ${hit} back to start!`:`${NM(k)} sent ${hit} back to start!`,imp);S.shake()}
    else if(E.isHome(o.to)&&!E.isHome(o.from)){beep(880,90);S.after(90,()=>beep(1175,120))}
    else if(o.to===E.CEN){beep(660,80);S.after(80,()=>beep(990,110))}
    if(E.won(s,k)){finish(k);return}
    S.after((cap?650:250)*T(),()=>endTurn(die));
  }
  function endTurn(d){if(over)return;if(d!==6)turn=(turn+1)%4;startTurn(d===6)}
  function finish(k){
    over=true;phase='over';setRoll(false);
    if(L<=2&&k===0){say('You win! All four marbles are home.',true);S.next()}
    else if(HUM[k]){say(`${NM(k)} wins!`,true);S.fx.confetti();S.fx.banner(`${NM(k)} wins!`,'press ↻ to play again');beep(880,150)}
    else{say(`${NM(k)} wins this one. Press ↻ to try again.`,true);S.fx.banner(`${NM(k)} wins`,'press ↻ to try again');beep(220,300)}
  }
  /* ---------- input ---------- */
  function tap(p){
    if(over||!human())return;
    if(phase==='roll'){roll();return}
    if(phase!=='pick')return;
    const near=(q,r)=>Math.hypot(q.x-p.x,q.y-p.y)<r;
    if(sel>=0){const o=mv.find(o=>o.m===sel&&near(at(turn,o.m,o.to),CS*.6));if(o){go(o);return}}
    let pickM=-1;
    for(const o of mv){if(near(at(turn,o.m),CS*.62)){pickM=o.m;break}}
    if(pickM<0&&mv.some(o=>o.from===E.OUT)){const q=qc(turn);if(Math.abs(p.x-q.x)<CS*2.5&&Math.abs(p.y-q.y)<CS*2.5)pickM=mv.find(o=>o.from===E.OUT).m}
    if(pickM<0){const o=mv.find(o=>near(at(turn,o.m,o.to),CS*.55));if(o&&mv.filter(v=>v.to===o.to).length===1){go(o);return}}
    if(pickM<0){sel=-1;beep(200,50);return}
    const opts=mv.filter(o=>o.m===pickM);
    if(opts.length===1){go(opts[0]);return}
    sel=pickM;kb=-1;beep(600,40);say(opts[0].from===E.CEN?'Pick a corner to leave the center':'Tap where to go: along the track or into the center');
  }
  S.on(c,'click',e=>tap(c.pos(e)));
  S.on(rollB,'click',()=>{if(human()&&phase==='roll')roll()});
  S.on(window,'keydown',e=>{
    if(over||!human()||e.ctrlKey||e.metaKey||e.altKey)return;
    if(phase==='roll'&&(e.key===' '||e.key==='Enter'||e.key==='r'||e.key==='R')){e.preventDefault();roll();return}
    if(phase!=='pick')return;
    if(e.key==='ArrowRight'||e.key==='ArrowDown'||e.key==='Tab'){e.preventDefault();sel=-1;kb=(kb+1)%mv.length}
    else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();sel=-1;kb=(kb-1+mv.length)%mv.length}
    else if((e.key==='Enter'||e.key===' ')&&kb>=0){e.preventDefault();go(mv[kb])}
    else if(/^[1-4]$/.test(e.key)){const o=mv.filter(o=>o.m===+e.key-1);if(o.length===1)go(o[0]);else if(o.length){sel=+e.key-1;kb=-1}}
  });
  S.loop(dt=>{
    clock+=dt;
    if(rolling>0){rolling-=dt;if(Math.floor(clock*16)!==Math.floor((clock-dt)*16))die=1+rand(6);if(rolling<=0){rolling=0;die=1+rand(6);rolled()}}
    if(anim){anim.t+=dt*1000;while(anim&&anim.t>=anim.hop){anim.t-=anim.hop;anim.i++;beep(420+anim.i*40,35);if(anim.i>=anim.pts.length-1){const o=anim.o;anim.i=anim.pts.length-1;landed(o)}}}
    if(fly){fly.t+=dt*1000;if(fly.t>=fly.dur)fly=null}
    draw();
  });
  root._wh={get s(){return s},get phase(){return phase},get turn(){return turn},get mv(){return mv},get over(){return over},human,at:(k,m,p)=>at(k,m,p),c,W};
  say(L<=2?'Your turn: roll the die':"Red's turn: roll the die");startTurn();
}

/* Jackaroo engine. 4 players (0 = you at the bottom, then clockwise: 1 left, 2 top = partner, 3 right);
   players 0+2 and 1+3 are teams. The track has 76 squares (19 per side). Marble id = owner*4 + i.
   s.m[id] is the marble's progress: -1 = in base, 0..75 = on the track counted from its owner's start
   square (0 = sitting on its own start, which protects it), 76..79 = its four home squares. */
const JK_START=[47,66,9,28],JK_DEAL=[5,4,4];
const JK_RN=['','A','2','3','4','5','6','7','8','9','10','J','Q','K'],JK_SU=['♠','♥','♦','♣'];
const JK_E=(()=>{
  const own=id=>id>>2,team=o=>o&1;
  const absq=(id,p)=>(JK_START[id>>2]+p)%76;
  function freshDeck(rng){const d=[];for(let s=0;s<4;s++)for(let r=1;r<=13;r++)d.push({r,s});for(let i=d.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[d[i],d[j]]=[d[j],d[i]]}return d}
  function newGame(rng=Math.random){const s={m:Array(16).fill(-1),hands:[[],[],[],[]],deck:[],dealer:3,round:0,turn:0,last:null,winner:-1,pile:0};deal(s,rng);return s}
  function deal(s,rng){
    const n=JK_DEAL[s.round%3];if(s.round%3===0||s.deck.length<4*n)s.deck=freshDeck(rng);
    for(let k=0;k<n;k++)for(let q=1;q<=4;q++)s.hands[(s.dealer+q)%4].push(s.deck.pop());
    for(const h of s.hands)h.sort((a,b)=>a.r-b.r||a.s-b.s);
    s.turn=(s.dealer+1)%4;
  }
  function occ(s){const O=Array(76).fill(-1);for(let id=0;id<16;id++){const p=s.m[id];if(p>=0&&p<=75)O[absq(id,p)]=id}return O}
  const allHome=(s,o)=>{for(let i=0;i<4;i++)if(s.m[o*4+i]<76)return false;return true};
  const ids=o=>[o*4,o*4+1,o*4+2,o*4+3];
  /* marbles a player moves: their own, or their partner's once all of their own are home */
  const controlled=(s,pl)=>allHome(s,pl)?ids((pl+2)%4):ids(pl);
  /* move marble id n steps (negative = backward). kill: the King sends every other player's marble it
     passes back to base. Returns {p,path,caps} or null if illegal. */
  function walk(s,id,n,kill){
    const o=own(id),p=s.m[id];if(p<0||n===0)return null;const O=occ(s),path=[],caps=[];let q=p;
    if(n<0){
      if(p>75)return null;
      for(let k=1;k<=-n;k++){
        q=(q+75)%76;const x=O[absq(id,q)];
        if(x>=0&&x!==id){if(s.m[x]===0)return null;if(k===-n){if(own(x)===o)return null;caps.push(x)}}
        path.push(q);
      }
      return{p:q,path,caps};
    }
    for(let k=1;k<=n;k++){
      q++;if(q>79)return null;
      if(q<=75){
        const x=O[absq(id,q)];
        if(x>=0&&x!==id){
          if(s.m[x]===0)return null;/* a marble on its own start square blocks everyone */
          if(k===n){if(own(x)===o)return null;caps.push(x)}else if(kill&&own(x)!==o)caps.push(x);
        }
      }else for(let j=o*4;j<o*4+4;j++)if(j!==id&&s.m[j]===q)return null;/* no jumping or landing on own marbles at home */
      path.push(q);
    }
    return{p:q,path,caps};
  }
  function outCheck(s,id){
    if(s.m[id]!==-1)return null;const x=occ(s)[JK_START[own(id)]];
    if(x>=0&&own(x)===own(id))return null;return{p:0,path:[0],caps:x>=0?[x]:[]};
  }
  const doWalk=(s,id,w)=>{s.m[id]=w.p;for(const x of w.caps)s.m[x]=-1};
  const onTrack=(s,id)=>s.m[id]>=1&&s.m[id]<=75;/* on the track and not protected */
  function cardMoves(s,pl,ci){
    const r=s.hands[pl][ci].r,C=controlled(s,pl),res=[];
    const mv=(list,n,kill)=>{for(const id of list)if(walk(s,id,n,kill))res.push({c:ci,k:'mv',m:id,n})};
    const out=()=>{for(const id of C)if(outCheck(s,id))res.push({c:ci,k:'out',m:id})};
    if(r===1){out();mv(C,1);mv(C,11)}
    else if(r===13){out();mv(C,13,true)}
    else if(r===11){for(const a of C)if(onTrack(s,a))for(let b=0;b<16;b++)if(team(own(b))!==team(pl)&&onTrack(s,b))res.push({c:ci,k:'sw',m:a,t:b})}
    else if(r===10){mv(C,10);if(s.hands[(pl+1)%4].length)res.push({c:ci,k:'burn'})}
    else if(r===7){
      for(const a of C)for(let x=7;x>=1;x--){const w=walk(s,a,x);if(!w)continue;
        if(x===7){res.push({c:ci,k:'sp',m:a,a:7,m2:-1});continue}
        const s2={m:s.m.slice()};doWalk(s2,a,w);
        for(const b of controlled(s2,pl))if(b!==a&&walk(s2,b,7-x))res.push({c:ci,k:'sp',m:a,a:x,m2:b});
      }
    }
    else if(r===5){const all=[];for(let id=0;id<16;id++)if(s.m[id]>=0)all.push(id);mv(all,5)}
    else if(r===4)mv(C,-4);
    else mv(C,r);
    return res;
  }
  function legal(s,pl){
    if(s.winner>=0)return[];let L=[];const h=s.hands[pl];
    for(let ci=0;ci<h.length;ci++)L=L.concat(cardMoves(s,pl,ci));
    if(!L.length)for(let ci=0;ci<h.length;ci++)L.push({c:ci,k:'dis'});
    return L;
  }
  const mkey=v=>[v.c,v.k,v.m,v.n,v.t,v.a,v.m2].join(',');
  /* the marble part of a move. Returns animation groups: [[{id,ps:[p...],jump}]] */
  function effect(s,pl,v){
    const G=[],caps=w=>w.caps.length&&G.push(w.caps.map(x=>({id:x,ps:[s.m[x],-1],jump:true})));
    const go=(id,n,kill)=>{const w=walk(s,id,n,kill),p0=s.m[id];G.push([{id,ps:[p0,...w.path]}]);caps(w);doWalk(s,id,w)};
    if(v.k==='mv')go(v.m,v.n,s.hands[pl][v.c]?.r===13||v.kill);
    else if(v.k==='out'){const w=outCheck(s,v.m);G.push([{id:v.m,ps:[-1,0],jump:true}]);caps(w);doWalk(s,v.m,w)}
    else if(v.k==='sw'){const a=v.m,b=v.t,A=absq(a,s.m[a]),B=absq(b,s.m[b]);
      const pa=(B-JK_START[own(a)]+76)%76,pb=(A-JK_START[own(b)]+76)%76;G.push([{id:a,ps:[s.m[a],pa],jump:true},{id:b,ps:[s.m[b],pb],jump:true}]);s.m[a]=pa;s.m[b]=pb}
    else if(v.k==='sp'){go(v.m,v.a);if(v.a<7)go(v.m2,7-v.a)}
    return G;
  }
  function checkWin(s){for(let t=0;t<2;t++)if(allHome(s,t)&&allHome(s,t+2))s.winner=t}
  function advance(s,rng){
    if(s.winner>=0)return;
    for(let k=1;k<=4;k++){const q=(s.turn+k)%4;if(s.hands[q].length){s.turn=q;return}}
    s.round++;s.dealer=(s.dealer+1)%4;deal(s,rng);
  }
  /* play a legal move for the player whose turn it is. Returns {groups,card,burned,round} */
  function apply(s,v,rng=Math.random){
    const pl=s.turn;if(!legal(s,pl).some(x=>mkey(x)===mkey(v)))throw new Error('illegal move '+mkey(v));
    const card=s.hands[pl][v.c],round=s.round;let burned=null;
    const groups=v.k==='dis'||v.k==='burn'?[]:effect(s,pl,v);
    s.hands[pl].splice(v.c,1);s.pile++;
    if(v.k==='burn'){const h=s.hands[(pl+1)%4];burned=h.splice(Math.floor(rng()*h.length),1)[0];s.pile++}
    s.last={card,pl,k:v.k,burned};
    checkWin(s);advance(s,rng);
    return{groups,card,burned,newRound:s.round!==round};
  }
  /* ---------- computer players ---------- */
  function threat(m,id,T){
    /* rough chance that the other team can hit marble id on their next turns */
    const p=m[id];if(p<1||p>75)return 0;const A=absq(id,p);let r=0;const seen=new Set();
    for(let x=0;x<16;x++){if(team(own(x))===T||m[x]<0||m[x]>75)continue;
      const d=(A-absq(x,m[x])+76)%76;if(d>=1&&d<=13&&d!==11&&!seen.has(d)){seen.add(d);r+=d===7?.05:.1}
      if(d===72)r+=.06;/* 4 squares behind them: a backward 4 hits */
    }
    for(let o=0;o<4;o++)if(team(o)!==T&&A===JK_START[o]&&ids(o).some(j=>m[j]<0))r+=.25;/* sitting on their start */
    return Math.min(.7,r);
  }
  function evalM(m,pl,lvl){
    const T=team(pl),s={m};let sc=0;
    if(allHome(s,T)&&allHome(s,T+2))return 1e6;
    if(allHome(s,1-T)&&allHome(s,3-T))return-1e6;
    for(let id=0;id<16;id++){
      const o=own(id),p=m[id],mine=team(o)===T;
      let v=p<0?0:p>75?118+(p-76)*3:24+p+(p>=64?4:0);
      if(lvl>=3&&p>=1&&p<=75){const r=threat(m,id,team(o));v-=r*(24+p)*(mine?.7:.35)}
      sc+=mine?v:-v;
    }
    if(lvl>=3)for(const t of[T,T+2]){const st=ids(t).find(j=>m[j]===0);if(st!=null&&ids(t).some(j=>m[j]<0))sc-=3}
    return sc;
  }
  function cardCost(s,pl,r){
    const base=controlled(s,pl).filter(j=>s.m[j]<0).length;
    return r===1||r===13?(base?7:2.5):r===11?3:r===7?3:r===5?2:r===4?2.5:r===10?1.5:0;
  }
  function choose(s,pl,lvl,rng=Math.random){
    const L=legal(s,pl),h=s.hands[pl];
    if(L[0].k==='dis'){let bi=0,bc=1e9;for(let i=0;i<h.length;i++){const c=(lvl>=2?cardCost(s,pl,h[i].r):0)+rng()*(lvl>=2?.5:5);if(c<bc){bc=c;bi=i}}return L[bi]}
    if(lvl===1&&rng()<.4)return L[Math.floor(rng()*L.length)];
    const base=evalM(s.m,pl,lvl),seen=new Set();let best=L[0],bs=-Infinity;
    for(const v of L){
      const r=h[v.c].r,k=r+','+[v.k,v.m,v.n,v.t,v.a,v.m2].join(',');if(seen.has(k))continue;seen.add(k);
      let val;
      if(v.k==='burn')val=lvl>=3?8+(s.hands[(pl+1)%4].length<=2?3:0):5;
      else{const t={m:s.m.slice(),hands:s.hands};effect(t,pl,v);val=evalM(t.m,pl,lvl)-base}
      if(lvl>=3)val-=cardCost(s,pl,r);
      val+=rng()*(lvl===1?30:lvl===2?4:.4);
      if(val>bs){bs=val;best=v}
    }
    return best;
  }
  return{newGame,legal,apply,walk,outCheck,controlled,allHome,occ,absq,choose,evalM,mkey,cardMoves,deal,effect};
})();

function jackaroo(root,S){
  const L=S.level,E=JK_E,MP=L>=4,HUM=L===4?[0,1]:L===5?[0,1,2,3]:[0];
  const NM=L===4?['Blue','Red','Green CPU','Orange CPU']:L===5?['Blue','Red','Green','Orange']:['You','Fahad','Noura','Saad'];
  const TEAM=t=>MP?(L===4?['Blue','Red'][t]+"'s team":NM[t]+' & '+NM[t+2]):t===0?'You and Noura':'Fahad and Saad';
  const st=status(root,L===4?'Blue (bottom) vs Red (left), each with a computer partner. Pass the device when asked.':L===5?'Blue & Green vs Red & Orange. Pass the device when asked; only the player whose turn it is looks.':'You and your partner Noura (top) race all 8 marbles home. Pick a card, then tap a glowing marble.');
  const W=400,{c,x}=canvas(root,W,W);c.classList.add('jk-cv');c.dataset.max=700;
  const hand=el('div','jk-hand',root),opt=el('div','jk-opt',root),leg=el('div','jk-leg',root);
  leg.innerHTML=[['A','out · 1 · 11'],['K','out · 13, burns all it passes'],['Q','12'],['J','swap with a rival'],['10','10 or burn next card'],['7','split 7'],['5','move any marble 5'],['4','back 4']].map(([a,b])=>`<span><b>${a}</b> ${b}</span>`).join('')+'<span><b>2–9</b> move that many</span>';
  const M=6,CS=(W-2*M)/20,RAD=CS*.42;
  const COL=()=>{const P=pal();return[P.c4,P.c1,P.c3,P.c6]};
  /* geometry: 20x20 grid, ring of 76 squares, everything for player k is player 0's layout turned k*90° */
  const rot=(r,c,k)=>{for(let i=0;i<k;i++)[r,c]=[c,19-r];return[r,c]};
  const RING=[];for(let c2=0;c2<20;c2++)RING.push([0,c2]);for(let r=1;r<20;r++)RING.push([r,19]);for(let c2=18;c2>=0;c2--)RING.push([19,c2]);for(let r=18;r>=1;r--)RING.push([r,0]);
  const XY=(r,c2)=>({x:M+(c2+.5)*CS,y:M+(r+.5)*CS});
  const BASE0=[[16,7],[16,8],[17,7],[17,8]],HOME0=[[18,11],[17,11],[16,11],[15,11]],LBL0=[13.75,9.5];
  function posOf(id,p){const o=id>>2;
    if(p<0){const[r,c2]=rot(...BASE0[id&3],o);return XY(r,c2)}
    if(p>75){const[r,c2]=rot(...HOME0[p-76],o);return XY(r,c2)}
    return XY(...RING[(JK_START[o]+p)%76]);
  }
  let SP=1,V=MP?-1:0,passing=-1,lastHum=-1,s=E.newGame(),sel=-1,mode=0,pick1=-1,busy=false,anims=[],deals=[],dirty=true,over=false,focus=0,legalCache=null;
  const me=()=>V>=0&&s.turn===V&&passing<0&&!busy&&!over;
  const legalMine=()=>legalCache||(legalCache=E.legal(s,s.turn));
  const cardsOf=ci=>legalMine().filter(v=>v.c===ci);
  /* ---------- selection ---------- */
  function cands(){
    if(sel<0||!me())return[];const ms=cardsOf(sel),r=s.hands[V][sel].r;
    if(ms[0]&&ms[0].k==='dis')return[];
    if(r===1)return ms.filter(v=>v.k==='out'||v.n===mode);
    if(r===7)return pick1<0?ms.filter(v=>v.a===mode):ms.filter(v=>v.m===pick1&&v.a===mode);
    if(r===11)return pick1<0?ms:ms.filter(v=>v.m===pick1);
    return ms.filter(v=>v.k!=='burn');
  }
  const candIds=()=>{const cs=cands(),r=sel>=0?s.hands[V][sel].r:0;return[...new Set(cs.map(v=>pick1>=0?(r===7?v.m2:v.t):v.m))]};
  function pickCard(ci){
    if(!me())return;const L=legalMine();
    if(L[0].k==='dis'){play(L.find(v=>v.c===ci));return}
    if(sel===ci){sel=-1;pick1=-1;render();return}
    const ms=cardsOf(ci);if(!ms.length){beep(180,90,'square');S.fx.toast('No move for that card');return}
    sel=ci;pick1=-1;focus=0;const r=s.hands[V][ci].r;
    if(r===1)mode=ms.some(v=>v.n===1)?1:11;
    else if(r===7)mode=[7,6,5,4,3,2,1].find(a=>ms.some(v=>v.a===a));
    beep(520,50);render();
  }
  function tapMarble(id){
    if(!me()||sel<0)return;const cs=cands(),r=s.hands[V][sel].r;
    if(pick1>=0&&id===pick1){pick1=-1;render();return}
    if(pick1>=0){const v=cs.find(v=>(r===7?v.m2:v.t)===id);if(v)play(v);return}
    const mine=cs.filter(v=>v.m===id);if(!mine.length)return;
    if(r===11||(r===7&&mode<7)){pick1=id;beep(600,50);render();return}
    play(mine[0]);
  }
  /* ---------- rendering of the DOM rows ---------- */
  function cardHTML(cd,extra){const red=cd.s===1||cd.s===2;return`<span class="jk-r">${JK_RN[cd.r]}</span><span class="jk-s${red?' jk-red':''}">${JK_SU[cd.s]}</span>${extra||''}`}
  const MEAN={1:'out/1/11',13:'out/13',12:'12',11:'swap',10:'10/burn',7:'split',5:'any 5',4:'back 4'};
  let handSig='';
  function render(){
    legalCache=null;dirty=true;const L=me()?legalMine():[],dis=L[0]&&L[0].k==='dis';
    const HV=V>=0?s.hands[V]:[];const sig=s.round+'|'+V+'|'+HV.map(c2=>c2.r+'.'+c2.s).join(',');
    if(sig!==handSig){const fresh=!handSig||handSig.split('|')[0]!==String(s.round)||handSig.split('|')[1]!==String(V);handSig=sig;hand.innerHTML='';
      if(V<0)el('div','jk-empty',hand,'🂠 Cards hidden');
      else HV.forEach((cd,i)=>{const b=el('button','jk-card'+(fresh?' jk-deal':''),hand,cardHTML(cd,`<span class="jk-t">${MEAN[cd.r]||'move '+cd.r}</span>`));b.style.setProperty('--i',i);S.on(b,'click',()=>pickCard(i))});
      if(V>=0&&!HV.length)el('div','jk-empty',hand,'No cards left this round');
    }
    [...hand.children].forEach((b,i)=>{if(!b.classList.contains('jk-card'))return;b.classList.toggle('jk-sel',i===sel);b.classList.toggle('jk-on',me()&&!dis&&L.some(v=>v.c===i));b.classList.toggle('jk-off',me()&&!dis&&!L.some(v=>v.c===i));b.classList.toggle('jk-burn',me()&&dis);b.disabled=!me()});
    opt.innerHTML='';
    const dot=q=>`<i style="background:${COL()[q]}"></i>`;
    if(over){el('span','jk-hint',opt,MP?`${dot(s.winner)}${TEAM(s.winner)} win${L===4?'s':''}! Press ↻ for a new game.`:s.winner===0?'You and Noura win! Press ↻ for a new game.':'Fahad and Saad win this time. Press ↻ to try again.');return}
    if(!me()){el('span','jk-hint',opt,busy&&s.turn===V?'…':passing>=0?`${dot(passing)}Pass to ${NM[passing]}`:`<i style="background:${COL()[s.turn]}"></i>${NM[s.turn]} is playing…`);return}
    const who=MP?dot(V)+NM[V]+': ':'';
    if(dis){el('span','jk-hint',opt,who+'No legal move: tap a card to burn it');return}
    if(sel<0){el('span','jk-hint',opt,MP?who+'pick a card':'Your turn: pick a card');return}
    const r=s.hands[V][sel].r,ms=cardsOf(sel);
    if(r===1&&ms.some(v=>v.n===1)&&ms.some(v=>v.n===11))[1,11].forEach(n=>{const b=el('button','btn jk-b'+(mode===n?' jk-act':''),opt,'Move '+n);S.on(b,'click',()=>{mode=n;render()})});
    if(r===7&&pick1<0){const as=[7,6,5,4,3,2,1].filter(a=>ms.some(v=>v.a===a));if(as.length>1)as.forEach(a=>{const b=el('button','btn jk-b jk-sm'+(mode===a?' jk-act':''),opt,a===7?'7':a+'+'+(7-a));S.on(b,'click',()=>{mode=a;render()})})}
    const bu=ms.find(v=>v.k==='burn');
    if(bu){const b=el('button','btn jk-b jk-fire',opt,'🔥 Burn '+NM[(s.turn+1)%4]+"'s card");S.on(b,'click',()=>play(bu))}
    const hasM=cands().length;
    const hint=pick1>=0?(r===7?`Now tap a marble to move ${7-mode}`:'Now tap a rival marble to swap with'):
      !hasM?'':r===11?'Tap your marble to swap':r===7&&mode<7?`Tap a marble to move ${mode}`:r===1||r===13?(ms.some(v=>v.k==='out')?'Tap a marble (base = bring out)':'Tap a glowing marble'):'Tap a glowing marble';
    if(hint)el('span','jk-hint',opt,hint);
    if(pick1>=0){const b=el('button','btn ghost jk-b jk-sm',opt,'✕');S.on(b,'click',()=>{pick1=-1;render()})}
  }
  /* ---------- playing a move ---------- */
  function play(v){
    if(!v)return;busy=true;const pl=s.turn,before=s.m.slice();
    const res=E.apply(s,v);sel=-1;pick1=-1;
    let t0=0;
    for(const g of res.groups){let mx=0;
      for(const a of g){const pts=a.ps.map(p=>posOf(a.id,p)),dur=(a.jump?.42:Math.max(.16,(pts.length-1)*.11))*SP;
        anims.push({id:a.id,pts,t:-t0,dur,jump:a.jump});mx=Math.max(mx,dur);}
      t0+=mx+.05*SP;
    }
    const lastP=res.card;
    sounds(res,before,pl);
    if(res.burned)S.after(300,()=>{beep(220,160,'sawtooth');const vi=(pl+1)%4;if(!MP&&vi===0)S.fx.toast(NM[pl]+' burned your '+JK_RN[res.burned.r]+'!');else if(MP&&HUM.includes(vi))S.fx.toast(NM[pl]+' burned '+NM[vi]+"'s "+JK_RN[res.burned.r]+'!');else st(`${NM[pl]} burned a card from ${NM[(pl+1)%4]}`)});
    if(v.k==='dis')st(`${NM[pl]} had no move and burned a ${JK_RN[lastP.r]}`);
    if(MP&&HUM.includes(pl)){lastHum=pl;V=-1}
    render();
    S.after(t0*1000+120*SP,()=>{busy=false;
      if(s.winner>=0){finish();return}
      if(res.newRound)dealAnim();else next();
    });
  }
  function sounds(res,before,pl){
    let t=0;for(const g of res.groups){for(const a of g){if(!a.jump)for(let i=1;i<a.ps.length;i++)S.after((t+(i-1)*.11)*1000,()=>beep(440+i*30,40));else S.after(t*1000,()=>beep(a.ps[1]<0?200:660,90,a.ps[1]<0?'square':'triangle'))}t+=Math.max(...g.map(a=>a.jump?.42:(a.ps.length-1)*.11))+.05}
    const capd=[];res.groups.forEach(g=>g.forEach(a=>{if(a.jump&&a.ps[1]===-1&&a.ps[0]>=0)capd.push(a.id)}));
    if(capd.length){const mineHit=capd.filter(id=>((id>>2)&1)===0).length,theirs=capd.length-mineHit;
      if(MP)st(`${NM[pl]} sent ${capd.length>1?capd.length+' marbles':'a marble'} back to base`);
      else if(mineHit&&pl!==0)st(`${NM[pl]} sent ${mineHit>1?mineHit+' of your team\'s marbles':'a marble of your team'} home`);
      else if(theirs&&(pl===0||pl===2))st(`${NM[pl]} sent ${theirs>1?theirs+' rival marbles':'a rival marble'} back to base!`);
      S.after(t*1000-200,()=>{if(!MP&&pl===0&&theirs)S.shake()})}
  }
  function finish(){
    over=true;render();
    if(MP){st(TEAM(s.winner)+' got all 8 marbles home!');S.fx.confetti();S.fx.banner(TEAM(s.winner)+(L===4?' wins!':' win!'),'Press ↻ to play again');beep(660,120);S.after(150,()=>beep(990,200));return}
    if(s.winner===0){st('You and Noura got all 8 marbles home!');S.next()}
    else{st('Fahad and Saad got all their marbles home first. Press ↻ to play again.');S.fx.banner('Rivals win','Press ↻ to play again');beep(200,300,'sawtooth')}
  }
  function dealAnim(){
    busy=true;const n=Math.max(...s.hands.map(h=>h.length));
    for(let k=0;k<4*Math.max(n,1);k++){const q=(s.dealer+1+k)%4;deals.push({q,t:-k*.06,dur:.32})}
    beep(700,40);handSig='';render();
    S.after((4*n*.06+.4)*1000*SP,()=>{busy=false;next()});
  }
  function next(){
    render();if(over)return;
    if(HUM.includes(s.turn)){
      if(!MP){st(legalMine()[0].k==='dis'?'Your turn, but no card can move: burn one':'Your turn: pick a card');return}
      if(lastHum===s.turn){V=s.turn;render();return}
      showPass(s.turn);return;
    }
    busy=true;render();
    S.after((L===1?650:560)*SP,()=>{busy=false;const v=E.choose(s,s.turn,MP||s.turn===2?3:L);play(v)});
  }
  /* pass-and-play: a cover hides everything until the next player is holding the device */
  const cover=el('div','jk-pass',document.querySelector('#stage')||root);cover.hidden=true;S.cleanup(()=>cover.remove());
  function showPass(q){
    passing=q;V=-1;sel=-1;pick1=-1;render();
    cover.style.setProperty('--pc',COL()[q]);
    cover.innerHTML=`<div class="jk-pbox"><i></i><b>Pass to ${NM[q]}</b><span>${TEAM(q&1)} · ${s.hands[q].length} cards</span><button class="btn">Tap when ready</button></div>`;
    cover.hidden=false;beep(520,80);
  }
  function reveal(){if(passing<0)return;const q=passing;passing=-1;cover.hidden=true;V=q;lastHum=q;beep(780,60);render()}
  S.on(cover,'click',reveal);
  /* ---------- drawing ---------- */
  function marble(X,Y,col,P,ring,sc=1){
    const r=RAD*sc;
    x.beginPath();x.arc(X,Y+1.5,r,0,7);x.fillStyle='rgba(0,0,0,.25)';x.fill();
    x.beginPath();x.arc(X,Y,r,0,7);x.fillStyle=col;x.fill();x.lineWidth=2;x.strokeStyle=P.edge;x.stroke();
    x.beginPath();x.arc(X-r*.32,Y-r*.35,r*.3,0,7);x.fillStyle='rgba(255,255,255,.6)';x.fill();
    if(ring){x.beginPath();x.arc(X,Y,r+3.2,0,7);x.lineWidth=2.6;x.strokeStyle=ring;x.stroke()}
  }
  function drawCard(cx,cy,w,h,cd,P,border){
    rr(x,cx-w/2,cy-h/2,w,h,7);x.fillStyle='#FFFDF5';x.fill();x.lineWidth=3;x.strokeStyle=border||P.edge;x.stroke();
    if(!cd){rr(x,cx-w/2+5,cy-h/2+5,w-10,h-10,4);x.fillStyle=P.c5;x.fill();return}
    const red=cd.s===1||cd.s===2;x.fillStyle=red?'#E0284A':'#1E1F5C';x.textAlign='center';x.textBaseline='middle';
    x.font=`${h*.36}px ${DISPLAY}`;x.fillText(JK_RN[cd.r],cx,cy-h*.12);x.font=`${h*.3}px sans-serif`;x.fillText(JK_SU[cd.s],cx,cy+h*.24);
  }
  function lblPos(o){const[r,c2]=rot(LBL0[0],LBL0[1],o);return XY(r,c2)}
  function draw(t){
    const P=pal(),C=COL();x.clearRect(0,0,W,W);
    rr(x,0,0,W,W,16);x.fillStyle=P.board;x.fill();
    /* side tints */
    for(let o=0;o<4;o++){const[r,c2]=rot(...BASE0[0],o),[r2,c3]=rot(...BASE0[3],o),a=XY(r,c2),b=XY(r2,c3);
      const x0=Math.min(a.x,b.x)-CS*.62,y0=Math.min(a.y,b.y)-CS*.62,w=Math.abs(a.x-b.x)+CS*1.24,h=Math.abs(a.y-b.y)+CS*1.24;
      rr(x,x0,y0,w,h,9);x.globalAlpha=.22;x.fillStyle=C[o];x.fill();x.globalAlpha=1;x.lineWidth=2;x.strokeStyle=C[o];x.stroke();
      for(let i=0;i<4;i++){const q=posOf(o*4+i,-1);x.beginPath();x.arc(q.x,q.y,RAD*.62,0,7);x.fillStyle=P.line;x.fill()}
      /* home lane */
      for(let i=0;i<4;i++){const q=posOf(o*4,76+i);x.beginPath();x.arc(q.x,q.y,RAD*.92,0,7);x.globalAlpha=.3;x.fillStyle=C[o];x.fill();x.globalAlpha=1;x.lineWidth=2;x.strokeStyle=C[o];x.stroke()}
    }
    /* track */
    for(let i=0;i<76;i++){const q=XY(...RING[i]),so=JK_START.indexOf(i);
      x.beginPath();x.arc(q.x,q.y,so>=0?RAD*.95:RAD*.55,0,7);
      if(so>=0){x.fillStyle=C[so];x.globalAlpha=.4;x.fill();x.globalAlpha=1;x.lineWidth=2.5;x.strokeStyle=C[so];x.stroke()}else{x.fillStyle=P.line;x.fill()}
      if(JK_START.includes((i+1)%76)){const so2=JK_START.indexOf((i+1)%76),h=posOf(so2*4,76);x.beginPath();x.moveTo(q.x,q.y);x.lineTo(h.x,h.y);x.lineWidth=2;x.setLineDash([2,3]);x.strokeStyle=C[so2];x.stroke();x.setLineDash([])}
    }
    /* center pile */
    const mid=W/2,cw=CS*3,ch=CS*4.1;
    if(s.last){drawCard(mid+3,mid+3,cw,ch,null,P);drawCard(mid,mid,cw,ch,s.last.card,P,C[s.last.pl]);
      x.font='800 10px sans-serif';x.fillStyle=P.muted;x.textAlign='center';x.fillText(s.last.k==='dis'?NM[s.last.pl]+' burned':NM[s.last.pl]+' played',mid,mid-ch/2-9);
      if(s.last.k==='dis'||s.last.k==='burn'){x.font=`${CS*1.1}px sans-serif`;x.fillText('🔥',mid+cw/2-2,mid-ch/2+4)}
    }else{rr(x,mid-cw/2,mid-ch/2,cw,ch,7);x.setLineDash([4,4]);x.lineWidth=2;x.strokeStyle=P.line;x.stroke();x.setLineDash([])}
    x.font='800 10px sans-serif';x.fillStyle=P.muted;x.textAlign='center';x.fillText(`Round ${s.round+1} · ${JK_DEAL[s.round%3]} cards`,mid,mid+ch/2+12);
    /* labels */
    for(let o=0;o<4;o++){const q=lblPos(o),w=CS*4.7,h=CS*1.5,on=!over&&s.turn===o;
      rr(x,q.x-w/2,q.y-h/2,w,h,h/2);x.fillStyle=on?C[o]:P.board;x.fill();x.lineWidth=on?3:2;x.strokeStyle=on?P.edge:C[o];x.stroke();
      if(on){x.save();x.globalAlpha=.35+.25*Math.sin(t*6);rr(x,q.x-w/2-3,q.y-h/2-3,w+6,h+6,h/2+3);x.lineWidth=2;x.strokeStyle=C[o];x.stroke();x.restore()}
      x.textAlign='left';x.textBaseline='middle';x.font='800 11px sans-serif';x.fillStyle=on?'#1E1F5C':P.ink;x.fillText(NM[o],q.x-w/2+8,q.y+.5);
      const n=s.hands[o].length;rr(x,q.x+w/2-21,q.y-h/2+4,14,h-8,3);x.fillStyle=P.c5;x.fill();x.lineWidth=1.5;x.strokeStyle=P.edge;x.stroke();
      x.textAlign='center';x.font='11px '+DISPLAY;x.fillStyle='#fff';x.fillText(n,q.x+w/2-14,q.y+1);
      if(o===2&&!MP){x.font='8px sans-serif';x.fillText('🤝',q.x+w/2-31,q.y+1)}
    }
    /* marbles */
    const animating=new Set(anims.filter(a=>a.t<a.dur).map(a=>a.id));
    const ci=me()?candIds():[],fid=ci.length?ci[((focus%ci.length)+ci.length)%ci.length]:-1;
    const pulse=.5+.5*Math.sin(t*7);
    for(let id=0;id<16;id++){if(animating.has(id))continue;const q=posOf(id,s.m[id]);
      let ring=null;if(id===pick1)ring=P.ink;else if(ci.includes(id))ring=`rgba(255,197,61,${.55+.45*pulse})`;
      marble(q.x,q.y,C[id>>2],P,ring);
      if(id===fid&&kbUsed){x.beginPath();x.arc(q.x,q.y,RAD+6.5,0,7);x.lineWidth=2;x.setLineDash([3,3]);x.strokeStyle=P.ink;x.stroke();x.setLineDash([])}
    }
    for(const a of anims){if(a.t>=a.dur)continue;const u=clamp(a.t/a.dur,0,1),n=a.pts.length-1;let X,Y,lift;
      if(a.jump){const e=u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2;X=a.pts[0].x+(a.pts[n].x-a.pts[0].x)*e;Y=a.pts[0].y+(a.pts[n].y-a.pts[0].y)*e;lift=Math.sin(u*Math.PI)*22}
      else{const f=u*n,k=Math.min(n-1,Math.floor(f)),g=f-k;X=a.pts[k].x+(a.pts[k+1].x-a.pts[k].x)*g;Y=a.pts[k].y+(a.pts[k+1].y-a.pts[k].y)*g;lift=Math.sin(g*Math.PI)*7}
      marble(X,Y-lift,C[a.id>>2],P,null,1+lift/90);
    }
    /* deal: card backs fly from the middle to each player */
    for(const d of deals){if(d.t<0||d.t>=d.dur)continue;const u=d.t/d.dur,q=lblPos(d.q),e=1-Math.pow(1-u,3);
      x.save();x.translate(mid+(q.x-mid)*e,mid+(q.y-mid)*e);x.rotate(u*3);drawCard(0,0,CS*1.3,CS*1.8,null,P);x.restore()}
  }
  let T=0,kbUsed=false;
  S.loop(dt=>{
    T+=dt;let act=false;
    for(const a of anims){a.t+=dt;if(a.t<a.dur)act=true}anims=anims.filter(a=>a.t<a.dur+.05);
    for(const d of deals){d.t+=dt;if(d.t<d.dur)act=true}deals=deals.filter(d=>d.t<d.dur);
    draw(T);
  });
  /* ---------- input ---------- */
  S.on(c,'click',e=>{
    if(!me()||sel<0)return;const p=c.pos(e),ids=candIds().concat(pick1>=0?[pick1]:[]);let best=-1,bd=CS*1.05;
    for(const id of ids){const q=posOf(id,s.m[id]),d=Math.hypot(q.x-p.x,q.y-p.y);if(d<bd){bd=d;best=id}}
    if(best>=0)tapMarble(best);
  });
  S.on(window,'keydown',e=>{
    if(passing>=0&&(e.key==='Enter'||e.key===' ')){e.preventDefault();reveal();return}
    if(!me())return;const k=e.key;
    if(/^[1-5]$/.test(k)&&+k<=s.hands[V].length){pickCard(+k-1);return}
    if(k==='Escape'){if(pick1>=0)pick1=-1;else sel=-1;render();return}
    const ci=candIds();if(!ci.length)return;
    if(k==='ArrowRight'||k==='ArrowDown'||k==='Tab'){focus++;kbUsed=true;e.preventDefault()}
    else if(k==='ArrowLeft'||k==='ArrowUp'){focus--;kbUsed=true;e.preventDefault()}
    else if(k==='Enter'||k===' '){e.preventDefault();tapMarble(ci[((focus%ci.length)+ci.length)%ci.length])}
  });
  S.on(window,'resize',()=>dirty=true);
  /* test hook */
  root.jk={set speed(v){SP=v},get passing(){return passing},get view(){return V},reveal,get s(){return s},play,pickCard,tapMarble,cands:()=>candIds(),posOf,get busy(){return busy},get over(){return over}};
  dealAnim();
}

const GAMES=[
  {id:'tictactoe',name:'Tic-Tac-Toe',icon:'⭕',blurb:'Three in a row against the computer or a friend.',help:'Tap a square to place your mark. Use the arrows at the top to pick Easy, Medium, Hard, or 2 Players.',mount:tictactoe,levels:4,open:true,names:['Easy','Medium','Hard','2 Players']},
  {id:'memory',name:'Memory Match',icon:'🃏',blurb:'Flip cards and find every pair.',help:'Tap two cards. Matching pairs stay face up. Pick how many pairs at the top.',mount:memory,levels:5,open:true,names:['6 pairs','8 pairs','10 pairs','12 pairs','15 pairs']},
  {id:'whack',name:'Whack-a-Mole',icon:'🔨',blurb:'Whack moles as they speed up. Miss 3 and you\'re out.',help:'Tap moles before they hide. Missing a mole or hitting a bomb costs a life. ⭐ is worth 3 points.',mount:whack,run:true,unit:'moles'},
  {id:'simon',name:'Simon Says',icon:'🔴',blurb:'Repeat a pattern that grows every level.',help:'Watch the pads light up, then tap them in the same order. Sound on helps.',mount:simon,run:true,unit:'levels'},
  {id:'hangman',name:'Hangman',icon:'🔤',blurb:'Guess the word one letter at a time, solo or with a friend.',help:'Tap letters or type on your keyboard. Pick a word length at the top, or tap 2 players to type a secret word for a friend.',mount:hangman,levels:5,open:true,names:['4 letters','5 letters','6 letters','7 letters','8+ letters']},
  {id:'snake',name:'Snake',icon:'🐍',blurb:'Eat, grow, and dodge blocks as it speeds up.',help:'Arrow keys or WASD on a computer. On a phone, put your thumb anywhere on the game and slide it to steer (or switch to the wheel or arrows under the game).',mount:snake,run:true,unit:'points'},
  {id:'pong',name:'Pong',icon:'🏓',blurb:'First to 5 against the computer. Pick how sharp it plays.',help:'Move your finger or mouse over the court, or use the arrow keys. On a phone held upright the court stands up and your paddle is at the bottom. Pick a mode at the top.',mount:pong,levels:5,open:true,names:['Easy','Normal','Hard','Expert','Insane']},
  {id:'flappy',name:'Flappy Bird',icon:'🐦',blurb:'Flap through gaps that keep getting tighter.',help:'Tap, click, or press Space to flap.',mount:flappy,run:true,unit:'points'},
  {id:'tower',name:'Tower Block',icon:'🧱',blurb:'Drop sliding blocks to build the tallest tower.',help:'Tap, click, or press Space to drop. Line blocks up perfectly to keep them wide.',mount:tower,run:true,unit:'floors'},
  {id:'crane',name:'Sky Crane',icon:'🏗️',blurb:'Drop swinging blocks to stack a wobbly skyscraper.',help:'Tap, click, or press Space to release the block. Perfect drops steady the tower.',mount:crane,run:true,unit:'floors',isNew:true},
  {id:'blobmaze',name:'Blob Maze',icon:'🟢',blurb:'Eat every dot and dodge the spikers.',help:'Arrow keys or WASD on a computer. On a phone, put your thumb anywhere on the game and slide it to steer (or switch to the wheel or arrows). Gems let you eat the spikers.',mount:blobmaze,run:true,unit:'points',isNew:true},
  {id:'breakout',name:'Breakout',icon:'🟦',blurb:'Break every brick. Tough bricks take more hits.',help:'Move your finger or mouse to steer, or use the left and right keys. Pick a brick layout at the top.',mount:breakout,levels:5,open:true,names:['Easy','Normal','Hard','Expert','Master'],unit:'points'},
  {id:'2048',name:'2048',icon:'🧮',blurb:'Merge tiles to hit bigger and bigger goals.',help:'Swipe on the board or use the arrow keys.',mount:g2048,run:true,unit:'points'},
  {id:'mines',name:'Minesweeper',icon:'💣',blurb:'Clear the field without setting off a mine.',help:'Pick a board size at the top. Tap to dig. Long-press, right-click, or switch to 🚩 to flag. Tap a number to clear around it.',mount:mines,levels:5,open:true,names:['Tiny','Easy','Medium','Hard','Expert'],isNew:true},
  {id:'sudoku',name:'Sudoku',icon:'🔢',blurb:'Fill the grid so every row, column and box has 1 to 9.',help:'Pick a difficulty at the top. Tap a square, then a number. Turn on ✏️ Notes to pencil in options. Keyboard: arrows, 1–9, Backspace, N.',mount:sudoku,levels:4,open:true,names:['Easy','Medium','Hard','Expert'],isNew:true},
  {id:'bbtan',name:'Brick Balls',icon:'🔵',blurb:'Aim, shoot, and smash numbered bricks before they land.',help:'Drag to aim and let go to shoot, or use ← → and Space. Grab +1 rings for extra balls.',mount:bbtan,run:true,unit:'rounds',isNew:true},
  {id:'paper',name:'Land Grab',icon:'🗺️',blurb:'Loop out of your land to claim the map. Don\'t get cut!',help:'Arrow keys or WASD, or on a phone slide your thumb anywhere on the game to steer (or use the wheel or arrows). Leave your land and loop back to claim the area inside. Cross a rival\'s trail to knock them out.',mount:paper,levels:5,open:true,names:['Easy','Normal','Hard','Expert','Master'],isNew:true},
  {id:'taxi',name:'Rush Taxi',icon:'🚕',blurb:'Pick up passengers and race the clock.',help:'Drag or use ← → to steer and ↓ to brake. Drive past a waving passenger in the outside lane, then reach the 🏁 on the same side.',mount:taxi,run:true,unit:'dollars',isNew:true},
  {id:'solitaire',name:'Solitaire',icon:'♠️',blurb:'Classic Klondike. Build each suit from Ace to King.',help:'Tap a card to move it to the best spot. Tap the deck to draw. Pick Draw 1 or Draw 3 at the top.',mount:solitaire,levels:2,open:true,names:['Draw 1','Draw 3'],isNew:true},
  {id:'helix',name:'Helix Drop',icon:'🌀',blurb:'Spin the tower and drop forever. How deep can you go?',help:'Drag sideways or use ← → to spin the tower. Avoid red. Chain drops for a combo, and fall through 3 rings in a row to smash the next one.',mount:helix,run:true,unit:'points',isNew:true},
  {id:'bubbles',name:'Bubble Pop',icon:'🎈',blurb:'Shoot bouncing bubbles and split them until they pop.',help:'Move with ← →, and shoot with Space. On a phone, slide on the left half of the game to move and tap the right half to shoot (or switch to the wheel or arrows). Pop every bubble before the time bar runs out. On a computer you can turn on mouse control or 2 players under the game.',mount:bubbles,run:true,unit:'points',isNew:true},
  {id:'blast',name:'Cannon Blast',icon:'🎯',blurb:'Blast numbered rocks that split as you shoot. How long can you last?',help:'Touch or drag anywhere and the cannon follows your finger, or use ← →. The cannon fires on its own. Rocks split in two when they hit zero, and get tougher the longer you last. About every 20 seconds a broken rock drops a gold UPGRADE that keeps your cannon stronger for the whole run: ➕ extra barrel, ⏩ faster fire or 💪 stronger shots. Also grab rare power-ups: ⚡ rapid fire, 🔱 triple shot, 💥 double power, ❄️ freeze, 🛡️ shield.',mount:blast,run:true,unit:'points',names:['Endless'],isNew:true},
  {id:'pinball',name:'Pinball',icon:'🕹️',blurb:'Flip, bump, spin and sink the saucer for multiball and jackpots.',help:'Hold Space or ↓ (or touch) to pull the plunger and let go to launch. Flippers: ← → or Z and M on a keyboard, or tap the left and right side of the table. Sink the saucer 3 times for multiball, light both side lanes for super bumpers, and light the top lanes to raise your multiplier.',mount:pinball,run:true,unit:'points',names:['Classic'],isNew:true},
  {id:'fuse',name:'Fuse Jumper',icon:'💥',blurb:'Leap, glide and grab every bomb. Lit fuses score double.',help:'Move with ← → and jump with ↑ or Space. On a phone, slide on the left half of the game to move, touch the right half to jump and swipe down there to drop (or switch to the wheel or arrows). Hold jump to leap higher, tap it again mid-jump to stop rising, and hold it while falling to glide. Press ↓ or the ⤓ button to fall fast or drop through a platform. Grab the glowing lit bomb for double points, avoid the enemies, take the P ball to turn them into coins, B to raise your multiplier, and ❤ for an extra life (up to 3).',mount:fuse,run:true,unit:'points',isNew:true},
  {id:'chess',name:'Chess',icon:'♟️',blurb:'Play the computer or a friend on one device.',help:'Tap a piece, then a highlighted square. Pick Easy, Medium, Hard, or 2 Players at the top. Pawns promote to queens automatically.',mount:chess,levels:4,open:true,names:['Easy','Medium','Hard','2 Players'],isNew:true},
  {id:'backgammon',name:'Backgammon',icon:'🎲',blurb:'Roll, race and hit. Bear off all 15 checkers first.',help:'Tap Roll, then tap a checker and a highlighted spot to move it. Use both dice, Undo to take a move back, and Done to end your turn. Pick Easy, Hard or 2 Players at the top.',mount:backgammon,levels:3,open:true,names:['Easy','Hard','2 Players'],isNew:true},
  {id:'blockfill',name:'Block Fill',icon:'🟧',blurb:'Fill every tile in one stroke without going back.',help:'Start on the glowing tile and drag (or tap the next tile, or use the arrow keys) to draw one path through every open tile. Drag back over your path to undo it. Pick a difficulty at the top.',mount:blockfill,levels:4,open:true,names:['Easy','Medium','Hard','Expert'],unit:'puzzles',isNew:true},
  {id:'checkers',name:'Checkers',icon:'⚫',blurb:'Jump, crown kings and clear the board vs computer or a friend.',help:'Tap a piece, then a glowing square. If a jump is possible you must take it, and multi-jumps continue until done. Pick Easy, Medium, Hard, or 2 Players at the top.',mount:checkers,levels:4,open:true,names:['Easy','Medium','Hard','2 Players'],isNew:true},
  {id:'connect',name:'Color Connect',icon:'🔗',blurb:'Join matching dots with pipes and fill every square.',help:'Drag from a dot to its matching dot to lay a pipe. Pipes can\'t cross, and drawing over a pipe cuts it. Join every pair and fill the whole board to win. Pick a board size at the top.',mount:colorconnect,levels:5,open:true,names:['5×5','6×6','7×7','8×8','9×9'],unit:'puzzles',isNew:true},
  {id:'dots',name:'Dots and Boxes',icon:'🔲',blurb:'Draw lines, close boxes and outsmart the computer or a friend.',help:'Tap or click between two dots to draw a line. Close a box to claim it and go again. Pick Easy, Medium, Hard, or 2 Players at the top.',mount:dotsboxes,levels:4,open:true,names:['Easy','Medium','Hard','2 Players'],isNew:true},
  {id:'four',name:'Four in a Row',icon:'🟡',blurb:'Drop discs and line up four before the computer or a friend.',help:'Tap a column (or use ← → and Enter) to drop a disc. Get four in a row across, up or diagonally. Pick Easy, Medium, Hard, or 2 Players at the top.',mount:fourrow,levels:4,open:true,names:['Easy','Medium','Hard','2 Players'],isNew:true},
  {id:'hanoi',name:'Tower of Hanoi',icon:'🗼',blurb:'Move the tower peg by peg. Never put a big disc on a small one.',help:'Tap a peg to pick up its top disc, then tap another peg to drop it, or drag the disc. Keys 1, 2 and 3 pick pegs. Move every disc to peg 3 in as few moves as you can.',mount:hanoi,levels:6,open:true,names:['3 discs','4 discs','5 discs','6 discs','7 discs','8 discs'],isNew:true},
  {id:'pool',name:'Billiards',icon:'🎱',blurb:'Pot your group, then sink the 8. Play the computer or a friend.',help:'Drag on the table to aim, then pull the power bar on the right down and let go to shoot. With ball in hand, drag the cue ball to place it. Keyboard: arrows aim and set power, Space shoots.',mount:pool,levels:3,open:true,names:['Easy','Hard','2 Players'],isNew:true},
  {id:'slide',name:'Sliding Puzzle',icon:'🧩',blurb:'Slide the numbered tiles back into order.',help:'Tap a tile in the same row or column as the gap to slide it, or swipe on the board. Arrow keys move a tile into the gap. Pick 3×3 up to 6×6 at the top.',mount:slidepuzzle,levels:4,open:true,names:['3×3','4×4','5×5','6×6'],isNew:true},
  {id:'water',name:'Water Sort',icon:'🧪',blurb:'Pour colored water between tubes until each holds one color.',help:'Tap a tube to lift it, then tap another tube to pour. You can only pour onto the same color or into an empty tube. Undo as often as you like, and add one extra tube per puzzle. Keyboard: 1–9 and 0 pick tubes, Z undoes.',mount:watersort,levels:4,open:true,names:['Easy','Medium','Hard','Expert'],isNew:true},
  {id:'woodblocks',name:'Wood Blocks',icon:'🪵',blurb:'Drag wooden pieces onto the board and clear rows, columns and boxes.',help:'Drag a piece from the tray onto the board. On a computer you can also press 1, 2 or 3 to pick a piece, move it with the arrow keys and press Enter to place it.',mount:woodblocks,run:true,names:['Endless'],unit:'points',isNew:true},
  {id:'wordfind',name:'Word Finder',icon:'🔎',blurb:'Find every hidden word in a themed letter grid.',help:'Drag from the first letter of a word to the last, in a straight line. You can also tap the first letter, then the last. Easy uses across and down, Medium adds diagonals, Hard hides words in all 8 directions.',mount:wordfind,levels:3,open:true,names:['Easy','Medium','Hard'],isNew:true},
  {id:'wordguess',name:'Word Guess',icon:'🟩',blurb:'Crack the hidden word in six tries with color clues.',help:'Type or tap letters, then press Enter. Green means right spot, yellow means the letter is in the word somewhere else, grey means it isn\'t in the word. Pick 4, 5 or 6 letters at the top.',mount:wordguess,levels:3,open:true,names:['4 letters','5 letters','6 letters'],isNew:true},
  {id:'clash',name:'Color Clash',icon:'🎴',blurb:'Match colors and numbers and empty your hand before the bots.',help:'Tap a glowing card to play it or tap the deck to draw. Wild cards ask for a color, and Wild +4 can be played any time. Tap Last card! when you play down to one card. Keys: arrows + Enter, D to draw, L for Last card. Pick 1 to 3 opponents at the top.',mount:clash,levels:3,open:true,names:['vs 1','vs 2','vs 3'],isNew:true},
  {id:'clashflip',name:'Color Clash Flip',icon:'🔄',blurb:'Two-sided cards: flip the whole game to the wild dark side.',help:'Tap a glowing card to play it or tap the deck to draw. A Flip card turns every card over. Wild cards ask for a color and can be played any time. Tap Last card! when you play down to one card. Keys: arrows + Enter, D to draw, L for Last card. Pick 1 to 3 opponents at the top.',mount:clashflip,levels:3,open:true,names:['vs 1','vs 2','vs 3'],isNew:true},
  {id:'rugs',name:'Rug Market',icon:'🧶',blurb:'Steer the merchant, lay rugs and charge rivals a toll.',help:'Tap ⟲, ↑ or ⟳ to turn the merchant, then Roll. Landing on a rival\'s rug patch costs a coin per square. Then tap a square next to him to lay your rug (tap again or ⟳ Turn to rotate) and press ✓ Place.',mount:rugmarket,levels:4,open:true,names:['vs 1','vs 2','vs 3','2 Players'],isNew:true},
  {id:'quad',name:'Four Alike',icon:'🗿',blurb:'Place the piece you\'re given. Line up four that share a trait.',help:'Tap a piece below, then Give, to hand it to your opponent. Tap an empty square to place the piece you were given. Four in a line sharing any trait wins.',mount:quadgame,levels:4,open:true,names:['Easy','Medium','Hard','2 Players'],isNew:true},
  {id:'cubes',name:'Cube Push',icon:'🧊',blurb:'Push cubes into the grid and line up five of your symbol.',help:'Tap a border cube that is blank or yours, then tap an arrow to push it back in from another end of its line. Five in a row wins, but making five for your opponent loses.',mount:cubepush,levels:4,open:true,names:['Easy','Medium','Hard','2 Players'],isNew:true},
  {id:'pyramid',name:'Ball Pyramid',icon:'🔺',blurb:'Stack balls into a pyramid and save yours to place the top one.',help:'Tap a glowing spot to place a ball, or tap one of your free balls and then a gold spot to move it up. Make a 2×2 square of your color to take 1 or 2 balls back. Pick Easy, Medium, Hard, or 2 Players at the top.',mount:pyramid,levels:4,open:true,names:['Easy','Medium','Hard','2 Players'],isNew:true},
  {id:'squadro',name:'Shuttle Race',icon:'🏁',blurb:'Race 5 shuttles across the board and back, jumping your rival.',help:'Tap a piece to move it. Dots on the board edge show its speed going out and coming back. Jump over enemy pieces to send them back. Bring 4 of 5 home first. Keys 1–5 move a piece.',mount:squadro,levels:4,open:true,names:['Easy','Medium','Hard','2 Players'],isNew:true},
  {id:'quantik',name:'Shape Grid',icon:'🔷',blurb:'Place shapes and be first to fill a line with all four kinds.',help:'Pick a shape from your tray, then tap a glowing square (or use 1–4, arrows and Enter). You can\'t place a shape where the other side already has that shape in the row, column or 2×2 zone. Complete a row, column or zone with 4 different shapes to win.',mount:quantik,levels:4,open:true,names:['Easy','Medium','Hard','2 Players'],isNew:true},
  {id:'qawale',name:'Stone Sow',icon:'🪨',blurb:'Stack, sow and line up four stones of your colour on top.',help:'Tap a stack to add your stone, then tap glowing squares one by one to sow the whole stack, bottom stone first (arrow keys work too, Undo or Backspace steps back). Get 4 of your colour on top in a row, column or diagonal.',mount:qawale,levels:4,open:true,names:['Easy','Medium','Hard','2 Players'],isNew:true},
  {id:'walls',name:'Wall Race',icon:'🧱',blurb:'Race to the far side and block your rival with walls.',help:'Tap a glowing square to move your pawn, or tap a gap between squares to preview a wall, then tap ✓ Place (tap the same gap again or ⟲ Turn to rotate it). Pick Easy, Medium, Hard, or 2 Players at the top.',mount:walls,levels:4,open:true,names:['Easy','Medium','Hard','2 Players'],isNew:true},
  {id:'pento',name:'Pento Box',icon:'🧩',blurb:'Fit the five-square pieces into the box until it\'s full.',help:'Drag the pieces into the box until every square is covered. Tap a piece to turn it, and use ⇋ Flip (or right-click) to mirror it. Pick 3 to 12 pieces at the top, and press Next for a new puzzle.',mount:pento,levels:8,open:true,names:['3 pieces','4 pieces','5 pieces','6 pieces','7 pieces','8 pieces','10 pieces','12 pieces'],unit:'solved',isNew:true},
  {id:'wahoo',name:'Wahoo',icon:'🎯',blurb:'Race four marbles around the cross and fill your home first.',help:'Tap Roll, then tap a glowing marble to move it. A 1 or 6 brings a marble out and a 6 rolls again. Land on a rival to send it back; the center hole is a shortcut you leave with a 1.',mount:wahoo,levels:4,open:true,names:['Easy','Hard','2 Players','4 Players'],isNew:true},
  {id:'jackaroo',name:'Jackaroo',icon:'🃏',blurb:'Team card-and-marble race. Play cards, swap, burn and get home.',help:'Tap a card, then a glowing marble. A: out or 1/11, K: out or 13 burning marbles it passes, J swaps, 7 splits, 5 moves any marble, 4 goes back, 10 moves or burns the next card. Pick Easy, Medium, Hard, or 2/4 Players to pass one device around.',mount:jackaroo,levels:5,open:true,names:['Easy','Medium','Hard','2 Players','4 Players'],isNew:true}
];
GAMES.sort((a,b)=>a.name.localeCompare(b.name));
const TC=['#FF8A99','#FFD166','#5FD8CC','#9FA9FF','#D2A8FF','#FFAA6B'];
const TAGS={tictactoe:'board strategy classic x o two',memory:'cards pairs brain puzzle concentration',whack:'reflex action tap quick',simon:'memory pattern colors music sound',hangman:'word letters spelling puzzle',snake:'classic arcade action retro',pong:'classic arcade sports tennis paddle retro',flappy:'arcade action tap bird reflex',tower:'stack arcade tap timing building',crane:'stack arcade tap timing building',blobmaze:'maze arcade pacman pac-man action',breakout:'arcade classic bricks paddle ball arkanoid',2048:'numbers puzzle tiles brain merge',mines:'puzzle classic logic brain mines bomb',sudoku:'puzzle numbers logic brain classic',blast:'ball blast cannon shooter rocks arcade upgrade',pinball:'pinball flipper arcade table classic retro',fuse:'bomb jack bombjack platform jump retro arcade bombs',bbtan:'bbtan balls bricks aim shoot arcade',paper:'paper.io paper io territory land snake io',taxi:'crazy taxi car driving racing cab',solitaire:'klondike cards patience card game',helix:'helix jump helo jump ball tower',bubbles:'bubble trouble pang balloons shooter arcade',chess:'board strategy classic two',backgammon:'backgammon tavla tawla nardy table game dice board strategy classic race checkers two player',blockfill:'one line one stroke fill puzzle hamiltonian path snake tiles draw one line logic brain',checkers:'checkers draughts english draughts american checkers board strategy classic two players jump king',connect:'flow free flow connect dots pipes numberlink arukone line puzzle logic brain colors',dots:'dots and boxes dot game boxes squares pigs in a pen paper pencil strategy board two players chains',four:'connect four connect 4 four in a row 4 in a row drop discs board strategy classic two players',hanoi:'tower of hanoi towers of hanoi brahma lucas tower disc puzzle pegs rings logic brain classic recursion',pool:'8 ball pool billiards snooker cue eight ball pool table solids stripes break rack pocket 2 player',slide:'sliding puzzle 15 puzzle fifteen puzzle 8 puzzle slide tiles numbers gem puzzle boss puzzle n-puzzle brain classic',water:'water sort puzzle color sort ball sort liquid tubes bottles pour colour sorting brain logic',woodblocks:'wood block puzzle woodoku block blast block puzzle 9x9 sudoku blocks tetris pieces wooden boxes',wordfind:'word search wordsearch find a word puzzle letters hidden words vocabulary themes',wordguess:'wordle word game guess five letters daily puzzle lingo mastermind vocabulary',clash:'uno uno flip crazy eights card game color matching shedding game wild draw four skip reverse draw two last card computer opponents',clashflip:'uno flip uno card game flip card game light side dark side color matching shedding game draw five skip everyone wild draw color last card',rugs:'marrakech, marrakech online, gigamic, carpet board game, rug game, assam, rug market, carpet game, bazaar, souk, board game vs computer, 2 player board game',quad:'quarto, quarto online, quarto board game, gigamic, four traits game, strategy game',cubes:'quixo, quixo online, gigamic, push tic tac toe, five in a row cube game',pyramid:'pylos, pylos online, gigamic, pyramid ball game, stacking strategy game',squadro:'squadro, squadro online, gigamic, race board game, strategy game',quantik:'quantik, quantik online, gigamic, shapes strategy game, 4x4 board game',qawale:'qawale, qawale online, gigamic, stone stacking strategy game, mancala alignment game',walls:'quoridor, quoridor online, wall maze board game, gigamic, corridor game, blocking strategy game',pento:'katamino, pentomino puzzle, pentominoes, gigamic, polyomino puzzle, block puzzle',wahoo:'wahoo, wahoo board game, aggravation, marble game, dice marble race, sorry style board game, ludo',jackaroo:'jackaroo, jakaroo, jackaroo game, جاكارو, tock, dog card game, marble card game, saudi board game, kings, team card game, multiplayer, pass and play, 2 players, 4 players'};
const CATS={'poker':'Cards','wahoo':'Board','jackaroo':'Board','snake':'Arcade','pong':'Arcade','flappy':'Arcade','tower':'Arcade','crane':'Arcade','blobmaze':'Arcade','breakout':'Arcade','bbtan':'Arcade','paper':'Arcade','taxi':'Arcade','helix':'Arcade','bubbles':'Arcade','blast':'Arcade','pinball':'Arcade','fuse':'Arcade','whack':'Arcade','pool':'Arcade','2048':'Puzzle','mines':'Puzzle','sudoku':'Puzzle','slide':'Puzzle','hanoi':'Puzzle','water':'Puzzle','blockfill':'Puzzle','connect':'Puzzle','woodblocks':'Puzzle','pento':'Puzzle','simon':'Puzzle','tictactoe':'Board','chess':'Board','checkers':'Board','backgammon':'Board','four':'Board','dots':'Board','walls':'Board','quad':'Board','cubes':'Board','pyramid':'Board','squadro':'Board','quantik':'Board','qawale':'Board','rugs':'Board','solitaire':'Cards','memory':'Cards','clash':'Cards','clashflip':'Cards','hangman':'Word','wordfind':'Word','wordguess':'Word'};
const CAT_LIST=[['all','All','✨'],['Arcade','Arcade','🕹️'],['Puzzle','Puzzle','🧩'],['Board','Board','♟️'],['Cards','Cards','🃏'],['Word','Word','🔤'],['2p','2 Players','👥']];
const favs=()=>store.get('favs')||[];
const isFav=id=>favs().includes(id);

/* ---------- level state ---------- */
const unl=g=>g.run?1:g.open?g.levels:clamp(store.get('unl:'+g.id)||1,1,g.levels);
const curLevel=g=>g.run?1:clamp(store.get('cur:'+g.id)||(g.open?1:unl(g)),1,unl(g));
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
  if(g.open){FX.banner('You win!',`${lvlName(g,lv)} · press ↻ to play again`);return}
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
  const ar=+f.dataset.ar,mx=+(f.dataset.max||900);
  const rows=()=>[...gameEl.children].filter(ch=>{if(ch===f)return false;const cs=getComputedStyle(ch);return cs.display!=='none'&&cs.position!=='absolute'});
  const unside=()=>{if(!gameEl.classList.contains('side'))return;gameEl.classList.remove('side');gameEl.style.gridTemplateRows='';for(const ch of gameEl.children)ch.style.gridRow=''};
  const cs=getComputedStyle(gameEl),pad=parseFloat(cs.paddingTop)+parseFloat(cs.paddingBottom);
  const W=gameEl.clientWidth-(COMPACT.matches?2:8),H=gameEl.clientHeight-pad,lo=Math.min(120,W);
  /* stacked: the rows above/below the board take their height, plus the gaps between all flex items
     (rows, board and the two spacer pseudo-elements). Rows can change height with the board's width,
     so repeat until the size settles: then it no longer depends on the size the board had before. */
  unside();let w;
  for(let k=0;k<4;k++){
    const R=rows(),gap=parseFloat(getComputedStyle(gameEl).rowGap)||0;let used=gap*(R.length+2)+4;
    for(const ch of R)used+=ch.offsetHeight;
    w=Math.round(Math.max(lo,Math.min(W,(H-used)*ar,mx)));
    if(f.style.width===w+'px')break;f.style.width=w+'px';
  }
  /* phone on its side: put the other rows in a column beside the board when that gives a bigger board */
  const R=rows();
  if(COMPACT.matches&&R.length&&W>H*1.25){
    gameEl.classList.add('side');gameEl.style.gridTemplateRows=`1fr repeat(${R.length},auto) 1fr`;R.forEach((ch,i)=>ch.style.gridRow=String(i+2));f.style.width=Math.min(w,W/2)+'px';
    const g2=parseFloat(getComputedStyle(gameEl).rowGap)||0,cg=parseFloat(getComputedStyle(gameEl).columnGap)||0;
    let sw=0,sh=g2*(R.length+1);for(const ch of R){sw=Math.max(sw,ch.offsetWidth);sh+=ch.offsetHeight}
    const ws=Math.round(Math.max(lo,Math.min(W-sw-cg,(H-4)*ar,mx)));
    if(sh<=H&&ws>w*1.08){f.style.width=ws+'px';return}
    unside();f.style.width=w+'px';
  }
}
/* phones report the new screen size late after a rotation: fit now and again once the browser has settled,
   re-sending resize so games with their own layout code catch up too */
let refitT=[];
function refit(e){
  if(e&&!e.isTrusted)return;fit();
  refitT.forEach(clearTimeout);refitT=[120,350,800].map(t=>setTimeout(()=>{fit();dispatchEvent(new Event('resize'))},t));
}
addEventListener('resize',refit);addEventListener('orientationchange',refit);
if(window.visualViewport)visualViewport.addEventListener('resize',refit);
document.addEventListener('fullscreenchange',()=>requestAnimationFrame(fit));
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit);

/* ---------- full screen ---------- */
const canFS=!!(document.fullscreenEnabled||document.webkitFullscreenEnabled);
const isFS=()=>!!(document.fullscreenElement||document.webkitFullscreenElement);
function enterFS(){if(!canFS||isFS())return;try{const d=document.documentElement;const p=(d.requestFullscreen||d.webkitRequestFullscreen).call(d);if(p&&p.catch)p.catch(()=>{})}catch(e){}}
function exitFS(){if(!isFS())return;try{const p=(document.exitFullscreen||document.webkitExitFullscreen).call(document);if(p&&p.catch)p.catch(()=>{})}catch(e){}}
$('#fs').hidden=!canFS;
let fsOff=false;
$('#fs').addEventListener('click',()=>{fsOff=isFS();fsOff?exitFS():enterFS()});
/* phones: go full screen on the first touch in a game if we are not already */
stage.addEventListener('pointerup',e=>{if(e.pointerType!=='mouse'&&!fsOff&&!isFS())enterFS()});

/* ---------- no zoom, selection or long-press menus while playing ---------- */
(function(){
  const playing=()=>document.body.classList.contains('playing');
  const inInput=e=>e.target&&e.target.closest&&e.target.closest('input,textarea');
  ['gesturestart','gesturechange','gestureend'].forEach(t=>document.addEventListener(t,e=>e.preventDefault(),{passive:false}));
  document.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault()},{passive:false});
  document.addEventListener('dblclick',e=>{if(playing())e.preventDefault()});
  // iOS shows its text magnifier on a double tap or long press even with user-select off.
  // While playing, every touch in the game screen is cancelled (except form fields and links),
  // which stops the magnifier and double-tap zoom in every game. Cancelling the touch also stops
  // the browser's own click, so a quick tap is turned back into a click here. Pointer events
  // (drags, wheels, long presses) are not affected.
  const native=t=>t.closest('input,textarea,select,label,a[href]');
  const surface=t=>t&&t.closest&&t.closest('#stage')&&!native(t);
  let tap=null;
  document.addEventListener('touchstart',e=>{if(playing()&&e.cancelable&&surface(e.target))e.preventDefault()},{passive:false,capture:true});
  document.addEventListener('touchend',e=>{if(playing()&&e.cancelable&&surface(e.target))e.preventDefault()},{passive:false,capture:true});
  document.addEventListener('pointerdown',e=>{tap=e.pointerType==='touch'&&e.isPrimary&&playing()&&surface(e.target)?{t:e.target,x:e.clientX,y:e.clientY,at:e.timeStamp}:null},true);
  document.addEventListener('pointercancel',()=>{tap=null},true);
  document.addEventListener('pointerup',e=>{
    const d=tap;tap=null;if(!d||e.pointerType!=='touch'||!e.isPrimary)return;
    if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>12||e.timeStamp-d.at>1200||!d.t.isConnected)return;
    const b=d.t.closest('button,[disabled]');if(b&&b.disabled)return;
    setTimeout(()=>d.t.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window,clientX:e.clientX,clientY:e.clientY,screenX:e.screenX,screenY:e.screenY,button:0,detail:1})),0);
  },true);
  document.addEventListener('selectstart',e=>{if(playing()&&!inInput(e))e.preventDefault()});
  document.addEventListener('selectionchange',()=>{if(!playing())return;const a2=document.activeElement;if(a2&&a2.closest&&a2.closest('input,textarea'))return;const s2=getSelection();if(s2&&s2.rangeCount&&!s2.isCollapsed)s2.removeAllRanges()});
  document.addEventListener('pointerdown',e=>{if(playing()&&!inInput(e)){const s2=getSelection();if(s2&&!s2.isCollapsed)s2.removeAllRanges()}},true);
  document.addEventListener('contextmenu',e=>{if(playing()&&!inInput(e))e.preventDefault()});
})();

/* ---------- shelf & router ---------- */
(function logo(){
  const h=$('#logo');if(!h)return;const txt=h.textContent;h.setAttribute('aria-label',txt);let n=0;
  h.innerHTML=txt.split(' ').map(w=>`<span class="w" aria-hidden="true">${w.split('').map(ch=>{const i=n++;return`<span class="l" style="--i:${i};color:var(--c${i%6+1})">${ch}</span>`}).join('')}</span>`).join(' ');
})();
function favBtn(g){return`<button class="fav" data-fav="${g.id}" aria-pressed="${isFav(g.id)}" aria-label="${isFav(g.id)?'Remove '+g.name+' from':'Add '+g.name+' to'} favorites">♥</button>`}
function renderShelf(){
  const q=(qIn&&qIn.value||'').trim().toLowerCase(),F=favs();let k=0;
  shelf.innerHTML='';shelf.classList.toggle('quiet',!!q||shelf.dataset.drawn==='1');shelf.dataset.drawn='1';
  const head=t=>el('h2','shelf-h',shelf,t);
  const tile=g=>{
    const i=GAMES.indexOf(g),a=el('a','tile',shelf);a.href=PAGES[g.id];a.dataset.id=g.id;a.style.setProperty('--tc',TC[i%TC.length]);a.style.setProperty('--k',k++);
    const b=store.get('best:'+g.id);const chips=[];
    if(!g.run&&!g.open)chips.push(`Level ${unl(g)} of ${g.levels}`);
    if(g.open)chips.push(`${g.levels} modes`);
    if(g.isNew)chips.unshift('New!');
    if(b!=null&&g.unit)chips.push(`Best ${b} ${g.unit}`);
    a.innerHTML=`<span class="ico" aria-hidden="true">${g.icon}</span><b>${g.name}</b><span class="d">${g.blurb}</span><span class="meta">${chips.map(c=>`<span class="chip">${c}</span>`).join('')}</span>${favBtn(g)}${HOWS[g.id]?`<button class="howb" aria-label="How to play ${g.name}" aria-expanded="false">?</button><span class="how">${HOWS[g.id]}<span class="how-x">Tap to close</span></span>`:''}`;
  };
  let cat=store.get('cat');if(!CAT_LIST.some(c=>c[0]===cat))cat='all';const inCat=g=>cat==='all'||(cat==='2p'?(g.names||[]).some(n=>/players|pass &amp; play|pass & play/i.test(n)):CATS[g.id]===cat);
  document.querySelectorAll('.cats [data-cat]').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.cat===cat);const r=b.parentNode;if(b.dataset.cat===cat&&(b.offsetLeft<r.scrollLeft||b.offsetLeft+b.offsetWidth>r.scrollLeft+r.clientWidth))r.scrollLeft=b.offsetLeft-16});
  if(cat!=='all'){
    const m=GAMES.filter(g=>inCat(g)&&(!q||(g.name+' '+g.blurb+' '+g.help+' '+(TAGS[g.id]||'')).toLowerCase().includes(q))).sort((a,b)=>F.includes(b.id)-F.includes(a.id));
    m.forEach(tile);if(!m.length)el('p','none',shelf).textContent=q?`No ${CAT_LIST.find(c=>c[0]===cat)[1].toLowerCase()} games match "${qIn.value.trim()}".`:'No games here yet.';
  }else if(q){
    const m=GAMES.filter(g=>(g.name+' '+g.blurb+' '+g.help+' '+(TAGS[g.id]||'')).toLowerCase().includes(q)).sort((a,b)=>F.includes(b.id)-F.includes(a.id));
    m.forEach(tile);if(!m.length)el('p','none',shelf).textContent=`No games match "${qIn.value.trim()}".`;
  }else if(F.length){
    head('♥ Your favorites');GAMES.filter(g=>F.includes(g.id)).forEach(tile);
    head('All games');GAMES.filter(g=>!F.includes(g.id)).forEach(tile);
  }else GAMES.forEach(tile);
}
function toggleFav(id){
  const F=favs(),on=!F.includes(id);store.set('favs',on?[...F,id]:F.filter(x=>x!==id));beep(on?880:440,70);
  if(shelf&&!document.body.classList.contains('playing'))renderShelf();
  document.querySelectorAll(`.fav[data-fav="${id}"]`).forEach(b=>{b.setAttribute('aria-pressed',on);restartAnim(b,'bump')});
  if(curGame&&curGame.id===id)paintFav();
}
const qIn=$('#q');
const HOWS={};document.querySelectorAll('#shelf .tile[data-id] .how').forEach(h=>HOWS[h.closest('.tile').dataset.id]=h.innerHTML);
if(qIn){
  const cb=el('div','cats',null,CAT_LIST.map(([k,n,ic])=>`<button class="cat" data-cat="${k}" aria-pressed="false"><span aria-hidden="true">${ic}</span>${n}</button>`).join(''));cb.setAttribute('role','toolbar');cb.setAttribute('aria-label','Game categories');
  qIn.closest('.search').after(cb);
  cb.addEventListener('click',e=>{const b=e.target.closest('[data-cat]');if(!b)return;store.set('cat',b.dataset.cat);beep(660,40);renderShelf()});
  qIn.addEventListener('input',renderShelf);addEventListener('keydown',e=>{if(e.key==='/'&&document.activeElement!==qIn&&!document.body.classList.contains('playing')){e.preventDefault();qIn.focus()}})}
document.querySelectorAll('.tile[data-id]').forEach(t=>{const g=GAMES.find(x=>x.id===t.dataset.id);if(g&&!t.closest('#shelf'))t.insertAdjacentHTML('beforeend',favBtn(g))});
function closeHow(x){document.querySelectorAll('.tile.open').forEach(t=>{if(t!==x){t.classList.remove('open');const b=$('.howb',t);if(b)b.setAttribute('aria-expanded','false')}})}
document.addEventListener('click',e=>{
  const hb=e.target.closest('.howb'),ho=e.target.closest('.tile.open .how');
  if(hb||ho){e.preventDefault();e.stopPropagation();const t=(hb||ho).closest('.tile'),on=!!hb&&!t.classList.contains('open');closeHow(t);t.classList.toggle('open',on);$('.howb',t).setAttribute('aria-expanded',on);if(on)beep(700,40);return}
  if(!e.target.closest('.tile'))closeHow();
},true);
addEventListener('keydown',e=>{if(e.key==='Escape')closeHow()});
document.addEventListener('click',e=>{const f=e.target.closest('.fav');if(!f)return;e.preventDefault();e.stopPropagation();toggleFav(f.dataset.fav)},true);
const stFav=el('button','btn ghost ibtn fav-stage',null,'♥');$('#back').after(stFav);
const infoBtn=el('button','btn ghost ibtn info-btn',null,'<span aria-hidden="true">i</span>');infoBtn.setAttribute('aria-label','How to play');stFav.after(infoBtn);
const info=el('div','info',document.body,'<div class="info-card" role="dialog" aria-modal="true" aria-labelledby="infoT"><button class="btn ghost ibtn info-x" aria-label="Close">✕</button><div class="info-h"><span class="info-ico" aria-hidden="true"></span><h2 id="infoT"></h2></div><h3>How to play</h3><p class="info-goal"></p><h3>Controls</h3><p class="info-help"></p><button class="btn info-go">Got it, let\'s play</button></div>');info.hidden=true;
function openInfo(){
  if(!curGame)return;$('.info-ico',info).textContent=curGame.icon;$('#infoT',info).textContent=curGame.name;
  $('.info-goal',info).textContent=infoGoal||curGame.blurb;$('.info-help',info).textContent=curGame.help;
  info.hidden=false;restartAnim($('.info-card',info),'in');$('.info-go',info).focus();
}
function closeInfo(){if(info.hidden)return;info.hidden=true;infoBtn.focus()}
infoBtn.addEventListener('click',openInfo);
info.addEventListener('click',e=>{if(e.target===info||e.target.closest('.info-x,.info-go'))closeInfo()});
addEventListener('keydown',e=>{if(e.key==='Escape'&&!info.hidden){e.stopPropagation();closeInfo()}},true);
function paintFav(){const on=isFav(curGame.id);stFav.setAttribute('aria-pressed',on);stFav.setAttribute('aria-label',on?'Remove from favorites':'Add to favorites')}
stFav.addEventListener('click',()=>{if(curGame)toggleFav(curGame.id)});
if(shelf)shelf.addEventListener('click',e=>{const t=e.target.closest('.tile');if(t&&t.dataset.id){e.preventDefault();location.hash=t.dataset.id;enterFS()}});
document.querySelectorAll('[data-play]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();location.hash=b.dataset.play;enterFS()}));
$('#back').addEventListener('click',exitFS);

function route(){
  if(scope){scope.dispose();scope=null}
  gameEl.innerHTML='';gameEl.classList.remove('shake');gameEl.style.touchAction='';document.querySelectorAll('.toast').forEach(t=>t.remove());
  const g=GAMES.find(x=>x.id===location.hash.slice(1));
  if(!g){
    document.body.classList.remove('playing');stage.hidden=true;document.title=BASE_TITLE;if(shelf)renderShelf();return;
  }
  curGame=g;curLv=curLevel(g);
  document.body.classList.add('playing');stage.hidden=false;restartAnim(stage,'in');
  $('#gtitle').textContent=g.name;$('#ghelp').textContent=g.help;document.title=g.name+' · Pocket Arcade';
  lvName.textContent='';chip(g,curLv);paintFav();
  scope=makeScope();
  Object.assign(scope,{level:curLv,fx:FX,shake,restart:()=>setTimeout(route),next:()=>levelUp(g,curLv),show:n=>chip(g,n)});
  infoGoal='';mountT=performance.now();info.hidden=true;document.querySelectorAll('.popmsg').forEach(m=>m.remove());
  g.mount(gameEl,scope);
  if(COMPACT.matches&&!store.get('info:'+g.id)){store.set('info:'+g.id,1);setTimeout(()=>{if(curGame===g&&location.hash.slice(1)===g.id)openInfo()},350)}
  requestAnimationFrame(fit);
}
lvPrev.addEventListener('click',()=>{if(!curGame)return;store.set('cur:'+curGame.id,curLv-1);route()});
lvNext.addEventListener('click',()=>{if(!curGame)return;store.set('cur:'+curGame.id,curLv+1);route()});
$('#restart').addEventListener('click',route);
addEventListener('hashchange',route);

/* ---------- ads ---------- */
(function(){
  // An ad box still holding a placeholder publisher ID (all zeros) or slot ID (one digit repeated,
  // like 1111111111) is hidden and never requested. Paste real slot IDs from AdSense to switch it on.
  const fake=v=>!v||/^(?:ca-pub-)?(\d)\1+$/.test(v);
  for(const i of document.querySelectorAll('ins.adsbygoogle')){
    if(fake(i.dataset.adClient)||fake(i.dataset.adSlot)){i.closest('.ad').classList.add('off');continue}
    try{(window.adsbygoogle=window.adsbygoogle||[]).push({})}catch(e){}
  }
})();
route();
