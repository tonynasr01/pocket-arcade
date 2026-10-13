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
/* touch controls with a remembered choice between the joystick wheel and arrow buttons */
function controls(parent,S,opts){
  const w=el('div','ctl',parent),body=el('div','ctl-body',w);
  const tg=el('div','ctl-tg',w,'<button data-m="wheel">🕹️ Wheel</button><button data-m="arrows">✛ Arrows</button>');tg.setAttribute('role','group');tg.setAttribute('aria-label','Touch controls');
  function draw(){
    const m=store.get('ctl')==='arrows'?'arrows':'wheel';body.innerHTML='';opts.onMove&&opts.onMove(0);
    (m==='wheel'?stick:arrows)(body,S,opts);
    tg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.m===m));
  }
  tg.querySelectorAll('button').forEach(b=>S.on(b,'click',()=>{store.set('ctl',b.dataset.m);draw();requestAnimationFrame(fit)}));
  draw();
}
function dpad(root,S,cb){const w=el('div','dpad',root);controls(w,S,{onDir:cb})}

function snake(root,S){
  const st=status(root,'');const{c,x}=canvas(root,400,400);const K=pal();const fx=sparks();
  const N=20,C=20,DIRS={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}};
  let sn,dir,next,food,score,alive,started,acc,lvl,obs,t=0;
  const taken=(p)=>sn.some(s=>s.x===p.x&&s.y===p.y)||obs.some(o=>o.x===p.x&&o.y===p.y)||(food&&food.x===p.x&&food.y===p.y);
  function place(){let p;do{p={x:rand(N),y:rand(N)}}while(taken(p));return p}
  function addObs(n){for(let k=0;k<n;k++){let p,tries=0;do{p={x:rand(N),y:rand(N)};tries++}while((taken(p)||Math.abs(p.x-sn[0].x)+Math.abs(p.y-sn[0].y)<5)&&tries<200);obs.push(p)}}
  function reset(){sn=[{x:10,y:10},{x:9,y:10},{x:8,y:10}];obs=[];food=null;dir=DIRS.right;next=[];food=place();score=0;lvl=1;S.show(1);alive=true;started=false;acc=0;st('Press an arrow key, swipe, or use the wheel or arrows to start.')}
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
      if(nl>lvl){lvl=nl;S.show(lvl);S.fx.toast(`Level ${lvl}`,lvl>=3?'Watch out for blocks':'Faster!');beep(990,200);if(lvl>=3)addObs(lvl>=6?4:3)}
      st(`Score ${score}. Level ${lvl}.`);
    }else sn.pop();
  }
  S.on(window,'keydown',e=>{const d=KEYDIR[e.key];if(d){e.preventDefault();turn(d)}});
  onSwipe(S,root,turn,true);dpad(root,S,turn);
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
        if(e.state==='dead'){e.wait-=dt;if(e.wait<=0){e.tx=8;e.ty=9;e.dx=e.dy=0;e.t=0;e.state='leave';e.door=true}continue}
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
  const st=status(root,'');const W=360,H=560,{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();
  const COLS=7,CW=W/COLS,TOP=34,ROWS=9,FLOOR=H-30,R=6;
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
  const rect=b=>({x:b.c*CW+2,y:TOP+b.r*CW+2,w:CW-4,h:CW-4});
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
      flightT+=dt;const spd=540*(1+Math.min(2.5,flightT/4));
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
          for(const it of items){if(it.got)continue;const ix=it.c*CW+CW/2,iy=TOP+it.r*CW+CW/2;if((B.x-ix)**2+(B.y-iy)**2<(R+11)**2){it.got=true;gained++;fx.add(ix,iy,K.c3,10,140);beep(880,50)}}
          if(B.vy>0&&B.y>=FLOOR-R){B.y=FLOOR-R;B.done=true;if(firstLand==null)firstLand=clamp(B.x,R+4,W-R-4)}
        }
      }
      items=items.filter(i=>!i.got);balls=balls.filter(b=>!b.done);
      if(!toLaunch&&!balls.length){launchX=firstLand??launchX;nBalls+=gained;if(gained)S.fx.toast(`+${gained} ball${gained>1?'s':''}`);newRound()}
    }
    x.fillStyle=K.board;x.fillRect(0,0,W,H);
    x.fillStyle=K.line;x.fillRect(0,FLOOR,W,H-FLOOR);x.fillStyle=K.edge;x.fillRect(0,FLOOR,W,3);
    x.globalAlpha=.5;x.fillStyle=K.line;x.fillRect(0,TOP-2,W,2);x.globalAlpha=1;
    for(const b of bricks){
      b.hit=Math.max(0,b.hit-dt);const q=rect(b),g=b.hit*14;
      x.fillStyle=col(b);rr(x,q.x-g/2,q.y-g/2,q.w+g,q.h+g,8);x.fill();x.lineWidth=2.5;x.strokeStyle=K.edge;x.stroke();
      x.fillStyle='#1E1F5C';x.font=`${b.hp>999?13:b.hp>99?15:18}px ${DISPLAY}`;x.textAlign='center';x.textBaseline='middle';x.fillText(b.hp,q.x+q.w/2,q.y+q.h/2+1);
    }
    for(const it of items){const ix=it.c*CW+CW/2,iy=TOP+it.r*CW+CW/2,p=1+Math.sin(t*6)*.08;x.strokeStyle=K.c3;x.lineWidth=4;x.beginPath();x.arc(ix,iy,11*p,0,7);x.stroke();x.fillStyle=K.c3;x.font=`11px ${DISPLAY}`;x.fillText('+1',ix,iy+1)}
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
  const N=36,T=22,W=360,H=520,{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();
  const COL=[null,K.c4,K.c1,K.c6,K.c5,K.c3];let camX=0,camY=0,camInit=false;
  const shade=(hex,amt)=>{const m=hex.match(/\w\w/g);if(!m)return hex;const f=v=>{v=parseInt(v,16);return Math.round(amt<0?v*(1+amt):v+(255-v)*amt)};return`rgb(${f(m[0])},${f(m[1])},${f(m[2])})`};
  const LIGHT=COL.map(cl=>cl&&shade(cl,.45)),SIDE=COL.map(cl=>cl&&shade(cl,-.25)),TRL=COL.map(cl=>cl&&shade(cl,.15));
  const D={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]},OPP={up:'down',down:'up',left:'right',right:'left'};
  const own=new Int8Array(N*N),trail=new Int8Array(N*N);
  const units=[];let started=false,over=false,acc=0,t=0;
  const at=(x0,y0)=>y0*N+x0,inB=(x0,y0)=>x0>=0&&y0>=0&&x0<N&&y0<N;
  function spawn(u,r){
    for(let k=0;k<400;k++){
      const lo=u.bot?r+1:Math.floor(N*.35),span=u.bot?N-2*r-2:Math.ceil(N*.3),cx=lo+rand(span),cy=lo+rand(span);let ok=true;
      for(let y0=cy-r-1;y0<=cy+r+1&&ok;y0++)for(let x0=cx-r-1;x0<=cx+r+1;x0++)if(!inB(x0,y0)||own[at(x0,y0)]||trail[at(x0,y0)]||units.some(v=>v.alive&&v!==u&&v.x===x0&&v.y===y0)){ok=false;break}
      if(!ok&&k<380)continue;
      for(let y0=cy-r;y0<=cy+r;y0++)for(let x0=cx-r;x0<=cx+r;x0++)own[at(x0,y0)]=u.id;
      Object.assign(u,{x:cx,y:cy,ox:cx,oy:cy,alive:true,dir:['up','down','left','right'][rand(4)],plan:[],q:[],wait:0});return;
    }
  }
  const me={id:1,bot:false};units.push(me);spawn(me,2);me.dir='right';
  for(let i=0;i<NB;i++){const b={id:i+2,bot:true};units.push(b);spawn(b,1)}
  function share(id){let n=0;for(let i=0;i<N*N;i++)if(own[i]===id)n++;return n/(N*N)*100}
  function kill(u){
    if(!u.alive)return;u.alive=false;
    for(let i=0;i<N*N;i++){if(trail[i]===u.id)trail[i]=0;if(u.bot&&own[i]===u.id)own[i]=0}
    fx.add(u.x*T+T/2,u.y*T+T/2,COL[u.id],26,220);
    if(u.bot){u.wait=2.5;beep(880,120);S.fx.toast('Cut!','Rival knocked out')}
    else{over=true;S.shake();beep(140,400,'sawtooth');st(`You were knocked out with ${share(1).toFixed(0)}% of the map. Press ↻ or turn to try again.`)}
  }
  function capture(u){
    for(let i=0;i<N*N;i++)if(trail[i]===u.id){trail[i]=0;own[i]=u.id}
    const out=new Uint8Array(N*N),q=[];
    for(let i=0;i<N;i++)for(const p of [at(i,0),at(i,N-1),at(0,i),at(N-1,i)])if(own[p]!==u.id&&!out[p]){out[p]=1;q.push(p)}
    while(q.length){const p=q.pop(),px=p%N,py=p/N|0;for(const[dx,dy]of Object.values(D)){const nx=px+dx,ny=py+dy;if(!inB(nx,ny))continue;const n=at(nx,ny);if(!out[n]&&own[n]!==u.id){out[n]=1;q.push(n)}}}
    for(let i=0;i<N*N;i++)if(!out[i]&&own[i]!==u.id){own[i]=u.id;if(trail[i]&&trail[i]!==u.id){const v=units.find(w=>w.id===trail[i]);if(v)kill(v)}}
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
  const hasTrail=u=>{for(let i=0;i<N*N;i++)if(trail[i]===u.id)return true;return false};
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
    const cells=[];for(let i=0;i<N*N;i++)if(own[i]===u.id)cells.push(i);
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
    x.fillStyle=K.board;x.fillRect(0,0,N*T,N*T);x.lineWidth=4;x.strokeStyle=K.edge;x.strokeRect(-2,-2,N*T+4,N*T+4);
    const i0=Math.max(0,Math.floor((camX-W/2)/T)-1),i1=Math.min(N-1,Math.ceil((camX+W/2)/T)+1),j0=Math.max(0,Math.floor((camY-H/2)/T)-1),j1=Math.min(N-1,Math.ceil((camY+H/2)/T)+1);
    x.fillStyle=K.line;x.globalAlpha=.45;for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)if((i+j)&1)x.fillRect(i*T,j*T,T,T);x.globalAlpha=1;
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const o=own[j*N+i];if(!o)continue;
      if(j+1>=N||own[(j+1)*N+i]!==o){x.fillStyle=SIDE[o];x.fillRect(i*T,j*T+T,T,6)}}
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
    const cnt=new Array(7).fill(0);for(let i=0;i<N*N;i++)cnt[own[i]]++;const pct=id=>cnt[id]/(N*N)*100,p=pct(1);
    x.fillStyle=K.board;rr(x,10,10,170,34,10);x.fill();x.lineWidth=2.5;x.strokeStyle=K.edge;x.stroke();
    x.fillStyle=K.line;rr(x,18,30,154,8,4);x.fill();x.fillStyle=K.c4;rr(x,18,30,Math.max(8,154*Math.min(1,p/GOAL)),8,4);x.fill();
    x.fillStyle=K.ink;x.font=`12px ${DISPLAY}`;x.textAlign='left';x.fillText(`${p.toFixed(1)}%  ·  goal ${GOAL}%`,18,25);
    const rows=units.map(u=>({u,v:pct(u.id)})).sort((a2,b2)=>b2.v-a2.v);
    const lh=16,lw=104,lx0=W-lw-10;x.fillStyle=K.board;x.globalAlpha=.92;rr(x,lx0,10,lw,10+rows.length*lh,10);x.fill();x.globalAlpha=1;x.lineWidth=2.5;x.strokeStyle=K.edge;x.stroke();
    rows.forEach((r,i)=>{const y=24+i*lh;x.globalAlpha=r.u.alive?1:.4;x.fillStyle=COL[r.u.id];x.beginPath();x.arc(lx0+12,y-4,5,0,7);x.fill();x.fillStyle=K.ink;x.font=`11px ${DISPLAY}`;x.textAlign='left';x.fillText(PAPERNAMES[r.u.id-1],lx0+22,y);x.textAlign='right';x.fillText(r.v.toFixed(0)+'%',lx0+lw-8,y);x.globalAlpha=1});
    const M=78,mx2=10,my2=H-M-10,cs=M/N;x.fillStyle=K.board;x.globalAlpha=.92;rr(x,mx2-3,my2-3,M+6,M+6,8);x.fill();x.globalAlpha=1;x.lineWidth=2;x.strokeStyle=K.edge;x.stroke();
    for(let i=0;i<N*N;i++){const o=own[i]||trail[i];if(o){x.fillStyle=COL[o];x.fillRect(mx2+(i%N)*cs,my2+(i/N|0)*cs,cs+.3,cs+.3)}}
    x.strokeStyle=K.ink;x.lineWidth=1;x.strokeRect(mx2+(camX-W/2)/T*cs,my2+(camY-H/2)/T*cs,W/T*cs,H/T*cs);
    if(!started&&!over){x.fillStyle='rgba(0,0,0,.28)';x.fillRect(0,H/2+60,W,64);x.fillStyle='#fff';x.textAlign='center';x.font=`20px ${DISPLAY}`;x.fillText('Pick a direction to start',W/2,H/2+88);x.font=`12px ${DISPLAY}`;x.fillText('Loop back to your land to claim it',W/2,H/2+110)}
  });
}

function runner(root,S){
  const st=status(root,'');const W=360,H=560,{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();
  const HY=150,ZF=46,PZ=2.2,LW=118;
  const proj=z=>1/(1+Math.max(-.9,z)*.2),sy=z=>HY+(H-30-HY)*proj(z),lx=(l,z)=>W/2+(l-1)*LW*proj(z),U=z=>72*proj(z);
  const dark=(()=>{const m=K.board.match(/\w\w/g);return m&&m.length>=3?(parseInt(m[0],16)+parseInt(m[1],16)+parseInt(m[2],16))/3<110:false})();
  const SKY=dark?['#0E1040','#2B2F7A']:['#7FB8FF','#DDEBFF'],GRASS=dark?'#24523A':'#8FD27A',GRASS2=dark?'#1C4430':'#7CC468',BED=dark?'#3D3F6B':'#B9B3C9',SLEEP=dark?'#5A4033':'#8B5E3C';
  const city=[...Array(14)].map((_,i)=>({x:i*34+rand(10),w:26+rand(18),h:30+rand(70),c:rand(3)}));
  const clouds=[...Array(4)].map(()=>({x:rand(W),y:20+rand(70),s:.6+Math.random()*.7}));
  let objs,lane,px,h,vh,roll,speed,dist,coins,state,spawnZ,lvl,t=0,deadT=0,run=0;
  function reset(){objs=[];lane=1;px=1;h=0;vh=0;roll=0;speed=13;dist=0;coins=0;state='ready';spawnZ=18;lvl=1;S.show(1);st('Swipe or use the arrow keys: left and right to switch tracks, up to jump, down to roll.')}
  reset();
  const TC=[K.c1,K.c4,K.c5,K.c3,K.c6];
  function spawnRow(z){
    const types=[];const trains=rand(3)===0?2:rand(2);
    const ls=shuffle([0,1,2]);
    for(let i=0;i<3;i++)types[ls[i]]=i<trains?'train':(Math.random()<.45?(Math.random()<.5?'low':'high'):null);
    for(let l=0;l<3;l++){
      const ty=types[l];if(!ty)continue;
      objs.push({lane:l,z:z+(ty==='train'?rand(3):0),len:ty==='train'?7+rand(8):.5,type:ty,c:TC[rand(TC.length)]});
    }
    const free=[0,1,2].filter(l=>types[l]!=='train');const cl=free[rand(free.length)];
    if(Math.random()<.7)for(let k=0;k<5;k++)objs.push({lane:cl,z:z+3+k*1.3,len:.3,type:'coin',lift:types[cl]==='low'&&k<2?1.4:0});
  }
  function act(d){
    if(state==='dead'){if(deadT>.6)reset();return}
    if(state==='ready'){state='run';st('Go! Collect coins and dodge the trains.')}
    if(d==='left')lane=Math.max(0,lane-1);else if(d==='right')lane=Math.min(2,lane+1);
    else if(d==='up'){if(h<=0.01){vh=7.2;roll=0;beep(620,60)}}
    else if(d==='down'){roll=.65;if(h>0)vh=-12;beep(320,60)}
  }
  S.on(window,'keydown',e=>{const d=KEYDIR[e.key];if(d){e.preventDefault();act(d)}else if(e.key===' '){e.preventDefault();act('up')}});
  onSwipe(S,root,act);
  S.on(c,'pointerdown',()=>{if(state!=='run')act('none')});
  const score=()=>Math.floor(dist)+coins*10;
  function die(){state='dead';deadT=0;S.shake();beep(130,400,'sawtooth');fx.add(lx(px,PZ),sy(PZ)-U(PZ)*.6,K.c2,30,240);const sc=score(),nb=best('runner',sc);st(`Crashed after ${Math.floor(dist)} m with ${coins} coins. Score ${sc}.${nb?' New best!':''} Tap or swipe to run again.`)}
  const P=(l,z,hgt)=>[lx(l,z),sy(z)-hgt*U(z)];
  function quad(a,b,c2,d,fill){x.fillStyle=fill;x.beginPath();x.moveTo(...a);x.lineTo(...b);x.lineTo(...c2);x.lineTo(...d);x.closePath();x.fill()}
  function shade(hex,amt){const m=hex.match(/\w\w/g);if(!m)return hex;const f=v=>{v=parseInt(v,16);return Math.round(amt<0?v*(1+amt):v+(255-v)*amt)};return`rgb(${f(m[0])},${f(m[1])},${f(m[2])})`}
  function block(o,hw,y0,y1,col,side=true){
    const z0=Math.max(o.z,-.8),z1=Math.max(z0+.01,o.z+o.len),L=o.lane;
    const fl=P(L-hw,z0,y1),fr=P(L+hw,z0,y1),flb=P(L-hw,z0,y0),frb=P(L+hw,z0,y0),bl=P(L-hw,z1,y1),br=P(L+hw,z1,y1),blb=P(L-hw,z1,y0),brb=P(L+hw,z1,y0);
    if(side&&L<1)quad(frb,fr,br,brb,shade(col,-.3));
    if(side&&L>1)quad(flb,fl,bl,blb,shade(col,-.3));
    quad(fl,fr,br,bl,shade(col,.35));
    x.fillStyle=col;x.beginPath();x.moveTo(...flb);x.lineTo(...fl);x.lineTo(...fr);x.lineTo(...frb);x.closePath();x.fill();
    x.lineWidth=1.5;x.strokeStyle=K.edge;x.stroke();
    return{l:fl[0],r:fr[0],t:fl[1],b:flb[1],s:proj(z0)};
  }
  function drawObj(o){
    if(o.z+o.len<-.8)return;
    if(o.type==='train'){
      const f=block(o,.43,0,2.05,o.c),w=f.r-f.l,hh=f.b-f.t;
      x.fillStyle='rgba(20,22,60,.85)';rr(x,f.l+w*.12,f.t+hh*.1,w*.76,hh*.32,5*f.s);x.fill();
      x.fillStyle='rgba(255,255,255,.35)';x.beginPath();x.moveTo(f.l+w*.16,f.t+hh*.38);x.lineTo(f.l+w*.3,f.t+hh*.12);x.lineTo(f.l+w*.4,f.t+hh*.12);x.lineTo(f.l+w*.26,f.t+hh*.38);x.fill();
      x.fillStyle='#fff';x.globalAlpha=.85;x.fillRect(f.l,f.t+hh*.55,w,hh*.07);x.globalAlpha=1;
      x.fillStyle='#FFE58A';x.shadowColor='#FFE58A';x.shadowBlur=10*f.s;for(const q of[.2,.8]){x.beginPath();x.arc(f.l+w*q,f.t+hh*.78,6*f.s,0,7);x.fill()}x.shadowBlur=0;
      x.fillStyle='#1E1F5C';rr(x,f.l+w*.38,f.t+hh*.72,w*.24,hh*.12,2);x.fill();
    }else if(o.type==='low'){
      const z0=Math.max(o.z,-.8),s=proj(z0),L=o.lane;
      for(const q of[-.4,.4]){const[px2,py2]=P(L+q,z0,0);x.fillStyle=K.muted;x.fillRect(px2-3*s,py2-.85*U(z0),6*s,.85*U(z0))}
      const[a1,a2]=P(L-.46,z0,.8),[b1]=P(L+.46,z0,.8),hh=.42*U(z0);
      x.save();x.beginPath();rr(x,a1,a2,b1-a1,hh,4*s);x.clip();x.fillStyle='#fff';x.fillRect(a1,a2,b1-a1,hh);
      x.fillStyle=K.c1;for(let i=-2;i<10;i++){x.beginPath();x.moveTo(a1+i*14*s,a2+hh);x.lineTo(a1+i*14*s+hh,a2);x.lineTo(a1+i*14*s+hh+7*s,a2);x.lineTo(a1+i*14*s+7*s,a2+hh);x.fill()}x.restore();
      x.lineWidth=1.5;x.strokeStyle=K.edge;rr(x,a1,a2,b1-a1,hh,4*s);x.stroke();
    }else if(o.type==='high'){
      const z0=Math.max(o.z,-.8),s=proj(z0),L=o.lane;
      for(const q of[-.44,.44]){const[px2,py2]=P(L+q,z0,0);x.fillStyle=K.muted;x.fillRect(px2-3.5*s,py2-2.25*U(z0),7*s,2.25*U(z0));x.strokeStyle=K.edge;x.lineWidth=1;x.strokeRect(px2-3.5*s,py2-2.25*U(z0),7*s,2.25*U(z0))}
      const[a1,a2]=P(L-.5,z0,2.25),[b1]=P(L+.5,z0,2.25),hh=.55*U(z0);
      x.fillStyle=K.c2;rr(x,a1,a2,b1-a1,hh,5*s);x.fill();x.lineWidth=2;x.strokeStyle=K.edge;x.stroke();
      x.fillStyle='#1E1F5C';x.font=`${Math.max(7,17*s)}px ${DISPLAY}`;x.textAlign='center';x.textBaseline='middle';x.fillText('⬇ ROLL',(a1+b1)/2,a2+hh/2+1);x.textBaseline='alphabetic';
    }else if(o.type==='coin'&&!o.got){
      const z0=Math.max(o.z,-.8),s=proj(z0),[cx,cy0]=P(o.lane,z0,.6+o.lift),r=12*s,sq=Math.max(.15,Math.abs(Math.cos(t*4+o.z)));
      x.shadowColor='#FFD34D';x.shadowBlur=12*s;const g=x.createLinearGradient(cx-r,cy0-r,cx+r,cy0+r);g.addColorStop(0,'#FFF2A8');g.addColorStop(.5,'#FFC53D');g.addColorStop(1,'#E39A12');
      x.fillStyle=g;x.beginPath();x.ellipse(cx,cy0,r*sq,r,0,0,7);x.fill();x.shadowBlur=0;x.lineWidth=1.5;x.strokeStyle='#A86B00';x.stroke();
      if(sq>.4){x.strokeStyle='rgba(255,255,255,.7)';x.lineWidth=1.2;x.beginPath();x.ellipse(cx,cy0,r*sq*.6,r*.6,0,0,7);x.stroke()}
    }
  }
  function runnerSprite(){
    const s=proj(PZ),cx=lx(px,PZ),gy=sy(PZ),u=U(PZ),lift=h*u,rolling=roll>0&&h<.05,ph=run;
    x.fillStyle='rgba(0,0,0,.22)';x.beginPath();x.ellipse(cx,gy-2,26*s/(1+h*.4),7*s,0,0,7);x.fill();
    x.save();x.translate(cx,gy-lift);x.scale(s*1.25,s*1.25);x.lineWidth=2.2;x.strokeStyle=K.edge;x.lineJoin='round';
    if(rolling){
      x.rotate(t*14);x.fillStyle=K.c4;x.beginPath();x.arc(0,-20,19,0,7);x.fill();x.stroke();x.fillStyle=K.c6;x.beginPath();x.arc(0,-20,10,0,Math.PI);x.fill();x.stroke();
      x.restore();x.strokeStyle=K.muted;x.lineWidth=2;for(let i=0;i<3;i++){x.beginPath();x.moveTo(cx-30*s,gy-(10+i*12)*s);x.lineTo(cx-48*s,gy-(10+i*12)*s);x.stroke()}return;
    }
    const air=h>.05,sw=air?0:Math.sin(ph),leg=(o)=>{x.fillStyle='#3B3F7A';x.save();x.translate(o*8,-30);x.rotate(air?(o<0?-.5:.6):sw*o*.7);rr(x,-5,0,10,24,4);x.fill();x.stroke();x.fillStyle='#fff';rr(x,-7,20,14,8,3);x.fill();x.stroke();x.restore()};
    leg(-1);leg(1);
    x.fillStyle=K.c4;rr(x,-17,-64,34,38,12);x.fill();x.stroke();
    x.fillStyle=K.c6;rr(x,-12,-60,24,24,7);x.fill();x.stroke();x.fillStyle=shade(cssv('--c6'),-.25);x.fillRect(-12,-48,24,4);
    for(const o of[-1,1]){x.save();x.translate(o*17,-58);x.rotate(air?o*-2.2:-sw*o*.8);x.fillStyle=K.c4;rr(x,-5,0,10,22,5);x.fill();x.stroke();x.fillStyle='#FFD9B0';x.beginPath();x.arc(0,24,5,0,7);x.fill();x.stroke();x.restore()}
    x.fillStyle='#6B3E2E';x.beginPath();x.arc(0,-74,14,0,7);x.fill();x.stroke();
    x.fillStyle=K.c1;x.beginPath();x.arc(0,-78,14.5,Math.PI,0);x.fill();x.stroke();x.fillRect(-10,-80,20,4);
    x.fillStyle='#FFD9B0';x.beginPath();x.arc(-14,-72,3.5,0,7);x.arc(14,-72,3.5,0,7);x.fill();
    x.restore();
  }
  S.loop(dt=>{
    t+=dt;
    if(state==='run'){
      speed=Math.min(30,speed+dt*.22);const dz=speed*dt;dist+=dz;run+=dt*speed*.9;
      for(const o of objs)o.z-=dz;objs=objs.filter(o=>o.z+o.len>-2);
      spawnZ-=dz;if(spawnZ<=0){spawnRow(ZF);spawnZ=Math.max(9,15-speed*.12)+rand(5)}
      px+=(lane-px)*Math.min(1,dt*14);
      vh-=24*dt;h=Math.max(0,h+vh*dt);if(h===0)vh=0;roll=Math.max(0,roll-dt);
      const pl=Math.round(px);
      for(const o of objs){
        if(o.got||o.lane!==pl||o.z>PZ+.35||o.z+o.len<PZ-.35)continue;
        if(o.type==='coin'){if(Math.abs(h-o.lift)<1.2){o.got=true;coins++;beep(980,40);fx.add(lx(pl,PZ),sy(PZ)-U(PZ),K.c2,6,100)}}
        else if(o.type==='train'||(o.type==='low'&&h<.8)||(o.type==='high'&&roll<=0)){
          if(o.type==='train'&&Math.abs(px-lane)>.25&&o.lane!==lane)continue;
          die();break;
        }
      }
      const nl=1+Math.floor(dist/400);if(nl>lvl){lvl=nl;S.show(lvl);S.fx.toast(`Level ${lvl}`,'Faster!');beep(990,200)}
    }else if(state==='dead')deadT+=dt;
    const mv=state==='run'?dt:0;
    // sky, sun, clouds, skyline
    const sg=x.createLinearGradient(0,0,0,HY);sg.addColorStop(0,SKY[0]);sg.addColorStop(1,SKY[1]);x.fillStyle=sg;x.fillRect(0,0,W,HY+2);
    x.fillStyle=dark?'#F4F1C9':'#FFE27A';x.shadowColor=x.fillStyle;x.shadowBlur=30;x.beginPath();x.arc(W*.78,48,dark?16:22,0,7);x.fill();x.shadowBlur=0;
    x.fillStyle=dark?'rgba(255,255,255,.12)':'rgba(255,255,255,.85)';for(const cl of clouds){cl.x-=mv*8*cl.s;if(cl.x<-70)cl.x=W+40;x.beginPath();x.arc(cl.x,cl.y,14*cl.s,0,7);x.arc(cl.x+16*cl.s,cl.y-7*cl.s,18*cl.s,0,7);x.arc(cl.x+34*cl.s,cl.y,13*cl.s,0,7);x.fill()}
    for(const b of city){b.x-=mv*4;if(b.x+b.w<0){b.x+=W+80;b.h=30+rand(70)}const y0=HY-b.h;x.fillStyle=dark?['#23265E','#1C1F52','#2A2D6B'][b.c]:['#A9B4E6','#9AA6DE','#B7C0EC'][b.c];x.fillRect(b.x,y0,b.w,b.h);
      x.fillStyle=dark?'rgba(255,221,120,.55)':'rgba(255,255,255,.55)';for(let wy=y0+6;wy<HY-6;wy+=10)for(let wx=b.x+4;wx<b.x+b.w-5;wx+=8)if((wx*7+wy*3+b.c)%5)x.fillRect(wx,wy,3,4)}
    // ground and track bed
    x.fillStyle=GRASS;x.fillRect(0,HY,W,H-HY);
    const zN=-.9;quad(P(-.62,ZF,0),P(2.62,ZF,0),P(2.62,zN,0),P(-.62,zN,0),BED);
    const off=dist%2.4;
    for(let z=ZF-off;z>zN;z-=2.4){x.fillStyle=GRASS2;x.globalAlpha=.6;quad(P(-3,z,0),P(-.62,z,0),P(-.62,z-1.2,0),P(-3,z-1.2,0),GRASS2);quad(P(2.62,z,0),P(5,z,0),P(5,z-1.2,0),P(2.62,z-1.2,0),GRASS2);x.globalAlpha=1}
    const so=dist%1.6;
    for(let z=ZF-so;z>zN;z-=1.6)for(let l=0;l<3;l++)quad(P(l-.42,z,0),P(l+.42,z,0),P(l+.42,z-.45,0),P(l-.42,z-.45,0),SLEEP);
    for(let l=0;l<3;l++)for(const q of[-.27,.27]){quad(P(l+q-.025,ZF,0),P(l+q+.025,ZF,0),P(l+q+.025,zN,0),P(l+q-.025,zN,0),dark?'#9EA3C8':'#6E7391');x.strokeStyle='rgba(255,255,255,.55)';x.lineWidth=1;x.beginPath();x.moveTo(...P(l+q,ZF,0));x.lineTo(...P(l+q,zN,0));x.stroke()}
    // fences
    for(let z=ZF-(dist%3);z>zN;z-=3)for(const fx2 of[-.85,2.85]){const[a1,a2]=P(fx2,z,0),hh=.8*U(z);x.fillStyle=dark?'#6A6EA0':'#E8E4F5';x.fillRect(a1-2*proj(z),a2-hh,4*proj(z),hh)}
    for(const fx2 of[-.85,2.85]){x.strokeStyle=dark?'#6A6EA0':'#E8E4F5';x.lineWidth=2;x.beginPath();x.moveTo(...P(fx2,ZF,.6));x.lineTo(...P(fx2,zN,.6));x.stroke()}
    // distance haze
    const hz=x.createLinearGradient(0,HY,0,HY+70);hz.addColorStop(0,SKY[1]);hz.addColorStop(1,'rgba(0,0,0,0)');
    const far=objs.filter(o=>o.z>PZ).sort((a,b)=>b.z-a.z),near=objs.filter(o=>o.z<=PZ).sort((a,b)=>b.z-a.z);
    far.forEach(drawObj);
    x.globalAlpha=dark?.55:.75;x.fillStyle=hz;x.fillRect(0,HY,W,70);x.globalAlpha=1;
    runnerSprite();
    near.forEach(drawObj);
    fx.draw(x,dt);
    // HUD pills
    const pill=(px2,txt,al,lp=13)=>{x.font=`16px ${DISPLAY}`;const w=x.measureText(txt).width+lp+13,x0=al==='r'?W-px2-w:px2;x.fillStyle=K.board;rr(x,x0,12,w,30,15);x.fill();x.lineWidth=2.5;x.strokeStyle=K.edge;x.stroke();x.fillStyle=K.ink;x.textAlign='left';x.textBaseline='middle';x.fillText(txt,x0+lp,28);x.textBaseline='alphabetic';return[x0,w]};
    pill(10,`${Math.floor(dist)} m`);
    const[cx0]=pill(10,`${coins}`,'r',33);x.fillStyle='#FFC53D';x.beginPath();x.arc(cx0+18,27,8,0,7);x.fill();x.strokeStyle='#A86B00';x.lineWidth=1.5;x.stroke();
    if(state==='ready'){x.fillStyle='rgba(0,0,0,.28)';x.fillRect(0,H/2-46,W,92);x.fillStyle='#fff';x.textAlign='center';x.font=`26px ${DISPLAY}`;x.fillText('Swipe to run',W/2,H/2-6);x.font=`14px ${DISPLAY}`;x.fillText('← → tracks · ↑ jump · ↓ roll',W/2,H/2+22)}
    if(state==='dead'){x.fillStyle='rgba(0,0,0,.4)';x.fillRect(0,0,W,H);x.fillStyle='#fff';x.textAlign='center';x.font=`32px ${DISPLAY}`;x.fillText('Crashed!',W/2,H/2-20);x.font=`18px ${DISPLAY}`;x.fillText(`Score ${score()}`,W/2,H/2+12);x.font=`13px ${DISPLAY}`;x.fillText('Tap or swipe to run again',W/2,H/2+40)}
  });
}

function taxi(root,S){
  const st=status(root,'');const W=360,H=560,{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();const k=held(S);
  const SW=34,RL=SW,RR=W-SW,LN=4,LW=(RR-RL)/LN,PY=H-120,CW=34,CH=60;
  const laneX=l=>RL+LW*(l+.5);
  let car,traffic,fare,dest,pax,money,timeLeft,state,scroll,spawnT,lvl,el=0,t=0,deadT=0,steerX=null,flash=0;
  function reset(){car={x:laneX(1),v:0,crash:0};traffic=[];fare=null;dest=null;pax=null;money=0;timeLeft=45;state='ready';scroll=0;spawnT=0;lvl=1;el=0;S.show(1);newPax();st('Drag or use ← → to steer. Drive past a waving passenger in the outside lane to pick them up.')}
  function newPax(){const side=rand(2);pax={side,y:-200-rand(300),wave:0}}
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
      const vmax=330+lvl*15;car.crash=Math.max(0,car.crash-dt);
      const brake=k.ArrowDown||k.s;car.v+=((brake?120:vmax)-car.v)*Math.min(1,dt*(brake?3:.9));
      let tx=steerX;if(k.ArrowLeft||k.a)tx=car.x-80;if(k.ArrowRight||k.d)tx=car.x+80;
      if(tx!=null)car.x+=clamp(tx-car.x,-1,1)*Math.min(Math.abs(tx-car.x),420*dt);
      car.x=clamp(car.x,RL+CW/2+2,RR-CW/2-2);
      const dy=car.v*dt;scroll+=dy;
      timeLeft-=dt;if(fare)fare.left-=dt;
      spawnT-=dt;if(spawnT<=0){const l=rand(LN),y=-CH;if(!traffic.some(o=>o.l===l&&o.y<CH*2)){traffic.push({l,x:laneX(l),y,v:Math.max(60,110+rand(110)-lvl*8),c:[K.c1,K.c4,K.c5,K.c3,K.c6][rand(5)],sw:lvl>=4&&Math.random()<Math.min(.5,(lvl-3)*.12)?1.5+Math.random()*2:0})}spawnT=Math.max(.2,1.1-lvl*.11)*(.6+Math.random()*.8)}
      for(const o of traffic){o.y+=dy-o.v*dt;if(o.sw&&!o.hit&&o.y>0&&(o.sw-=dt)<=0){const nl3=clamp(o.l+(rand(2)?1:-1),0,LN-1);if(!traffic.some(q=>q!==o&&q.l===nl3&&Math.abs(q.y-o.y)<CH*1.6)){o.l=nl3;o.blink=.6}o.sw=0}
        if(!o.hit){o.blink=Math.max(0,(o.blink||0)-dt);o.x+=(laneX(o.l)-o.x)*Math.min(1,dt*3)}
        if(o.hit){o.x+=o.vx*dt;o.rot=(o.rot||0)+dt*4*Math.sign(o.vx)}
        if(!o.hit&&Math.abs(o.x-car.x)<CW-4&&Math.abs(o.y-PY)<CH-6)crash(o)}
      traffic=traffic.filter(o=>o.y<H+CH&&o.y>-CH*3&&o.x>-60&&o.x<W+60);
      if(pax){pax.y+=dy;if(!fare&&pax.y>PY-20&&pax.y<PY+30&&inCurb(pax.side)){
          const d=900+rand(1300)+lvl*120;const ft=(d/230+5)*Math.max(.55,1-(lvl-1)*.08);fare={left:ft,max:ft};dest={side:rand(2),y:PY-d};pax=null;beep(880,120);S.fx.toast('Passenger in!','Head for the 🏁');
        }else if(pax&&pax.y>H+40)newPax()}
      if(dest){dest.y+=dy;
        if(dest.y>PY-30&&dest.y<PY+40&&inCurb(dest.side)){const bonus=Math.max(3,9-lvl),pay=10+lvl*2+Math.round(fare.left*2);money+=pay;timeLeft+=bonus;fx.add(car.x,PY,K.c2,30,240);beep(1100,200);S.fx.toast(`+$${pay}`,`+${bonus} seconds`);dest=null;fare=null;S.after(400,newPax)}
        else if(dest.y>H+80){dest.y-=1600}
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
    if(dest){const m=Math.max(0,Math.round((PY-dest.y)/10));x.font=`13px ${DISPLAY}`;x.textAlign='center';x.fillStyle=fare.left<5?K.c1:K.muted;x.fillText(`🏁 ${m} m ${dest.side?'→ right':'← left'} side · ${Math.ceil(fare.left)}s`,W/2,56)}
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
  const st=status(root,'');const W=480,H=360,{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();const k=held(S);
  const FL=H-26,RAD=[0,8,13,20,29,40],BH=[0,80,125,170,215,255],SPD=[0,85,80,75,70,65];
  let players,balls,drops,walls,pw,lvl=1,state,timeLeft,timeMax,dropsLeft,t=0,moveDir=0,clearT=0,ballCol;
  let useMouse=store.get('bubmouse')===true,two=store.get('bub2p')===true;
  const mkP=(i)=>({i,x:two?W*(i?0.7:0.3):W/2,w:26,h:34,lives:3,score:0,shots:[],face:1,walk:0,inv:0,out:false,shield:false});
  function levelDef(n){
    if(n<=BUBLV.length)return BUBLV[n-1];
    const m=n-BUBLV.length,cnt=Math.min(4,2+Math.floor(m/3)),b=[];
    for(let i=0;i<cnt;i++)b.push([Math.min(5,4+(rand(3)===0?1:0)),(i+.5)/cnt,i%2?-1:1]);
    return{b,w:cnt>=3&&rand(2)?[.5]:[],sp:1+Math.min(.5,m*.04)};
  }
  const pops=s=>2**s-1;
  function startLevel(){
    const d=levelDef(lvl);ballCol=BUBCOL[(lvl-1)%BUBCOL.length];
    balls=d.b.map(([s,fx0,dir])=>({s,x:W*fx0,y:90+(s<3?40:0),vx:dir*SPD[s]*(d.sp||1),vy:0}));
    walls=(d.w||[]).map(f=>({x:W*f,open:0}));drops=[];
    pw={double:0,sticky:0,freeze:0};dropsLeft=lvl<4?1:2;
    timeMax=timeLeft=Math.round(18+d.b.reduce((n,[s])=>n+pops(s),0)*1.7);
    players.forEach((p,i)=>{p.x=two?W*(i?0.72:0.28):W/2;p.shots=[];p.inv=0;p.shield=false;p.walk=0});
    if(walls.length&&two)players.forEach((p,i)=>{p.x=i?W*.85:W*.15});
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
    if(b.s>1)for(const d of[-1,1])balls.push({s:b.s-1,x:b.x+d*4,y:b.y,vx:d*SPD[b.s-1]*(levelDef(lvl).sp||1),vy:-Math.sqrt(2*420*BH[b.s-1])*.7});
    if(balls.length&&dropsLeft>0&&Math.random()<.13){
      dropsLeft--;const r=Math.random(),type=r<.07?'life':r<.27?'double':r<.45?'sticky':r<.6?'freeze':r<.74?'shield':r<.84?'dyn':'fruit';
      drops.push({type,x:b.x,y:b.y,vy:-100,life:7});
    }
    if(!balls.length){
      state='clear';clearT=0;const bonus=Math.ceil(timeLeft)*10;alive().forEach(q=>award(q,Math.round(bonus/alive().length)));
      FX.confetti(70);beep(990,200);st(`Level ${lvl} clear! Time bonus +${bonus}.`);
    }
  }
  function collect(d,p){
    const P=BUBPW[d.type];beep(1040,90);setTimeout(()=>beep(1320,90),90);fx.add(d.x,d.y,K.c2,18,180);S.fx.toast(`${P.ico} ${P.name}`);
    if(d.type==='life')p.lives=Math.min(6,p.lives+1);else if(d.type==='shield')p.shield=true;else if(d.type==='fruit')award(p,500);
    else if(d.type==='dyn'){const big=balls.filter(b=>b.s>1);for(const b of big){let q=[b];balls.splice(balls.indexOf(b),1);while(q.some(z=>z.s>1)){const z=q.find(z=>z.s>1);q.splice(q.indexOf(z),1);for(const dd of[-1,1])q.push({s:z.s-1,x:z.x+dd*(z.s*6),y:z.y,vx:dd*SPD[z.s-1],vy:-200})}balls.push(...q);fx.add(b.x,b.y,ballCol,30,260)}beep(140,300,'square')}
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
    x.fillStyle='rgba(0,0,0,.12)';x.beginPath();x.ellipse(b.x,FL+2,r*.8*(1-(FL-b.y)/500),3,0,0,7);x.fill();
    x.fillStyle=g;x.beginPath();x.arc(b.x,b.y,r,0,7);x.fill();x.lineWidth=2;x.strokeStyle=pw.freeze>0?'#7CC8FF':'rgba(30,31,92,.85)';x.stroke();
    x.fillStyle='rgba(255,255,255,.7)';x.beginPath();x.ellipse(b.x-r*.38,b.y-r*.45,r*.28,r*.16,-.6,0,7);x.fill();
  }
  function shade(hex,amt){const n=parseInt(hex.slice(1),16);let r=n>>16,g=n>>8&255,b2=n&255;const f=v=>Math.round(amt<0?v*(1+amt):v+(255-v)*amt);return`rgb(${f(r)},${f(g)},${f(b2)})`}
  S.loop(dt=>{
    t+=dt;
    if(state==='play'){
      timeLeft-=dt;
      pw.double=Math.max(0,pw.double-dt);pw.sticky=Math.max(0,pw.sticky-dt);pw.freeze=Math.max(0,pw.freeze-dt);
      for(const w of walls)if(!w.open&&(!balls.some(b=>b.x<w.x)||!balls.some(b=>b.x>w.x))){w.open=.001;beep(600,120);S.fx.toast('Wall opened')}
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
        for(const sh of p.shots){if(sh.stick>0){sh.stick-=dt}else{sh.y-=560*dt;if(sh.y<=12){if(pw.sticky>0){sh.y=12;sh.stick=4}else sh.dead=true}}if(sh.stick<0)sh.dead=true}
        p.shots=p.shots.filter(sh=>!sh.dead);
      });
      for(const d of drops){d.vy+=500*dt;d.y=Math.min(FL-12,d.y+d.vy*dt);d.life-=dt;const p=alive().find(p=>Math.abs(d.x-p.x)<p.w/2+12&&d.y>FL-p.h-12);if(p){d.got=true;collect(d,p)}}
      drops=drops.filter(d=>!d.got&&d.life>0);
      const bt=pw.freeze>0?0:dt;
      outer:for(const b of balls.slice()){
        if(!balls.includes(b))continue;
        b.vy+=420*bt;b.x+=b.vx*bt;b.y+=b.vy*bt;const r=RAD[b.s];
        if(b.x<r){b.x=r;b.vx=Math.abs(b.vx)}if(b.x>W-r){b.x=W-r;b.vx=-Math.abs(b.vx)}
        for(const w of walls){if(w.open)continue;if(b.x<w.x&&b.x+r>w.x-4){b.x=w.x-4-r;b.vx=-Math.abs(b.vx)}else if(b.x>w.x&&b.x-r<w.x+4){b.x=w.x+4+r;b.vx=Math.abs(b.vx)}}
        if(b.y>FL-r){b.y=FL-r;b.vy=-Math.sqrt(2*420*BH[b.s])}
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
  const W=360,H=560,{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();const k=held(S);
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
const BLASTPW={rapid:{ico:'⚡',name:'Rapid fire',dur:8},triple:{ico:'🔱',name:'Triple shot',dur:8},power:{ico:'💥',name:'Double power',dur:8},freeze:{ico:'❄️',name:'Freeze',dur:4},shield:{ico:'🛡️',name:'Shield',dur:0}};
function blast(root,S){
  const st=status(root,'Drag to move the cannon. It fires on its own. Break the rocks and don\'t let one touch you. It gets harder the longer you last.');
  const W=360,H=560,{c,x}=canvas(root,W,H);const K=pal();const fx=sparks();const k=held(S);
  const FL=H-46,RAD=[0,13,19,27,37],BH=[0,170,215,260,300],CY=FL-6;
  let cx,balls,bullets,drops,spawnT,fireT,state,score,el,pw,shield,lastDrop,dragX=null,hitT=0,t=0;
  function reset(){cx=W/2;balls=[];bullets=[];drops=[];spawnT=.6;fireT=0;score=0;el=0;pw={rapid:0,triple:0,power:0,freeze:0};shield=false;lastDrop=-20;state='ready'}
  reset();
  const rate=()=>(7.5+Math.min(7,el/25))*(pw.rapid>0?2:1),dmg=()=>(1+Math.floor(el/40))*(pw.power>0?2:1);
  const hpFor=s=>Math.max(2,Math.round((3+el*.42)*[0,.35,.65,1,1.55][s]*(.7+Math.random()*.6)));
  function start(){if(state==='ready'){state='play';beep(660,80);st('Keep moving! Rocks get tougher every few seconds.')}}
  function spawn(){
    const big=el>70&&Math.random()<Math.min(.45,(el-70)/200)?4:el>20&&Math.random()<.55?3:2;
    const side=rand(2),hp=hpFor(big);balls.push({s:big,hp,max:hp,x:side?W+RAD[big]:-RAD[big],y:60+rand(70),vx:(side?-1:1)*(55+Math.random()*25+Math.min(30,el/6)),vy:0,enter:true,hit:0});
  }
  function lose(){
    state='dead';hitT=0;bullets=[];S.shake();beep(130,400,'sawtooth');fx.add(cx,CY-20,K.c1,36,260);
    const nb=best('blast',score);st(`Crushed after ${Math.floor(el)} seconds with ${score} point${score===1?'':'s'}.${nb?' New best!':''} Tap to play again.`);
  }
  S.on(c,'pointerdown',e=>{dragX=c.pos(e).x;try{c.setPointerCapture(e.pointerId)}catch(_){}if(state==='ready')start();else if(state==='dead'&&hitT>.7)reset()});
  S.on(c,'pointermove',e=>{if(dragX==null)return;const nx=c.pos(e).x;cx=clamp(cx+(nx-dragX)*1.25,22,W-22);dragX=nx});
  ['pointerup','pointercancel'].forEach(ev=>S.on(c,ev,()=>{dragX=null}));
  S.on(window,'keydown',e=>{if(e.key===' '||e.key==='Enter'||e.key.startsWith('Arrow')){if(e.key===' '||e.key==='Enter')e.preventDefault();if(state==='ready')start();else if(state==='dead'&&hitT>.7&&(e.key===' '||e.key==='Enter'))reset()}});
  function split(b){
    score+=10*b.s;fx.add(b.x,b.y,col(b),16+b.s*3,220);beep(240+b.s*30,90,'square');
    if(b.s>1){const hp=Math.max(1,Math.ceil(b.max/2));for(const d of[-1,1])balls.push({s:b.s-1,hp,max:hp,x:b.x+d*6,y:b.y,vx:d*70,vy:-260,enter:false,hit:0})}
    if(!drops.length&&el-lastDrop>14&&Math.random()<.09){
      lastDrop=el;const ks=Object.keys(BLASTPW),type=shield&&Math.random()<.5?ks[rand(4)]:ks[rand(ks.length)];
      drops.push({type,x:b.x,y:b.y,vy:-140,life:6.5});
    }
  }
  function collect(d){
    const P=BLASTPW[d.type];beep(1040,90);setTimeout(()=>beep(1320,90),90);fx.add(d.x,d.y,K.c2,18,180);S.fx.toast(`${P.ico} ${P.name}`);
    if(d.type==='shield')shield=true;else pw[d.type]=P.dur;
  }
  function col(b){const f=b.max;return f>=80?K.c5:f>=40?K.c1:f>=18?K.c6:f>=8?K.c2:K.c3}
  S.loop(dt=>{
    t+=dt;hitT+=dt;
    if(k.ArrowLeft||k.a)cx=clamp(cx-300*dt,22,W-22);if(k.ArrowRight||k.d)cx=clamp(cx+300*dt,22,W-22);
    if(state==='play'){
      el+=dt;for(const p in pw)pw[p]=Math.max(0,pw[p]-dt);
      const cap=3+Math.floor(el/35),bigCount=balls.filter(b=>b.s>=2).length;
      spawnT-=dt;if(spawnT<=0&&bigCount<cap){spawn();spawnT=Math.max(1.1,3.6-el/45)*(.75+Math.random()*.5)}
      fireT-=dt;while(fireT<=0){
        const tri=pw.triple>0;bullets.push({x:cx,y:CY-44,vx:0});if(tri){bullets.push({x:cx,y:CY-44,vx:-150});bullets.push({x:cx,y:CY-44,vx:150})}
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
      drops=drops.filter(d=>!d.got&&d.life>0);
    }else if(state==='dead'){for(const b of balls){b.vy+=420*dt;b.y=Math.min(FL-RAD[b.s],b.y+b.vy*dt*.4)}}
    // scene
    const sky=x.createLinearGradient(0,0,0,FL);sky.addColorStop(0,K.board);sky.addColorStop(1,K.line);x.fillStyle=sky;x.fillRect(0,0,W,H);
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
    for(const d of drops){if(d.life<2&&Math.floor(t*8)%2)continue;const bob=d.y>=FL-13?Math.sin(t*5)*2:0;x.fillStyle='#fff';x.beginPath();x.arc(d.x,d.y+bob,13,0,7);x.fill();x.lineWidth=2.5;x.strokeStyle=K.c2;x.stroke();x.font='15px sans-serif';x.fillStyle='#000';x.fillText(BLASTPW[d.type].ico,d.x,d.y+bob+1)}
    x.textBaseline='alphabetic';
    if(state!=='dead'||Math.floor(t*10)%2){
      x.save();x.translate(cx,CY);x.lineWidth=2.5;x.strokeStyle=K.edge;
      if(shield){x.strokeStyle=K.c3;x.globalAlpha=.6+.25*Math.sin(t*6);x.lineWidth=3;x.beginPath();x.ellipse(0,-22,32,34,0,0,7);x.stroke();x.globalAlpha=1;x.strokeStyle=K.edge;x.lineWidth=2.5}
      x.fillStyle='#5A5F96';rr(x,-7,-46,14,30,4);x.fill();x.stroke();x.fillStyle=pw.triple>0?K.c5:K.c2;rr(x,-9,-50,18,8,3);x.fill();x.stroke();
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
    if(state==='ready'){x.fillStyle='rgba(0,0,0,.3)';x.fillRect(0,H/2-50,W,96);x.fillStyle='#fff';x.textAlign='center';x.font=`26px ${DISPLAY}`;x.fillText('Tap to start',W/2,H/2-12);x.font=`14px ${DISPLAY}`;x.fillText('Drag to move · it fires by itself',W/2,H/2+18)}
    if(state==='dead'){x.fillStyle='rgba(0,0,0,.4)';x.fillRect(0,0,W,H);x.fillStyle='#fff';x.textAlign='center';x.font=`30px ${DISPLAY}`;x.fillText('Crushed!',W/2,H/2-14);x.font=`18px ${DISPLAY}`;x.fillText(`${score} point${score===1?'':'s'}`,W/2,H/2+14);x.font=`13px ${DISPLAY}`;x.fillText('Tap to play again',W/2,H/2+40)}
  });
}

/* ---------- registry ---------- */
const PAGES={"tictactoe": "tic-tac-toe.html", "memory": "memory-match.html", "whack": "whack-a-mole.html", "simon": "simon-says.html", "hangman": "hangman.html", "snake": "snake.html", "pong": "pong.html", "flappy": "flappy-bird.html", "tower": "tower-block.html", "crane": "sky-crane.html", "blobmaze": "blob-maze.html", "breakout": "breakout.html", "2048": "2048.html", "mines": "minesweeper.html", "sudoku": "sudoku.html", "bbtan": "brick-balls.html", "paper": "land-grab.html", "runner": "rail-runner.html", "taxi": "rush-taxi.html", "solitaire": "solitaire.html", "helix": "helix-drop.html", "bubbles": "bubble-pop.html", "chess": "chess.html", "blast": "cannon-blast.html"};
const BASE_TITLE=document.title;
const GAMES=[
  {id:'tictactoe',name:'Tic-Tac-Toe',icon:'⭕',blurb:'Three in a row against the computer or a friend.',help:'Tap a square to place your mark. Use the arrows at the top to pick Easy, Medium, Hard, or 2 Players.',mount:tictactoe,levels:4,open:true,names:['Easy','Medium','Hard','2 Players']},
  {id:'memory',name:'Memory Match',icon:'🃏',blurb:'Flip cards and find every pair.',help:'Tap two cards. Matching pairs stay face up. Pick how many pairs at the top.',mount:memory,levels:5,open:true,names:['6 pairs','8 pairs','10 pairs','12 pairs','15 pairs']},
  {id:'whack',name:'Whack-a-Mole',icon:'🔨',blurb:'Whack moles as they speed up. Miss 3 and you\'re out.',help:'Tap moles before they hide. Missing a mole or hitting a bomb costs a life. ⭐ is worth 3 points.',mount:whack,run:true,unit:'moles'},
  {id:'simon',name:'Simon Says',icon:'🔴',blurb:'Repeat a pattern that grows every level.',help:'Watch the pads light up, then tap them in the same order. Sound on helps.',mount:simon,run:true,unit:'levels'},
  {id:'hangman',name:'Hangman',icon:'🔤',blurb:'Guess the word one letter at a time, solo or with a friend.',help:'Tap letters or type on your keyboard. Pick a word length at the top, or tap 2 players to type a secret word for a friend.',mount:hangman,levels:5,open:true,names:['4 letters','5 letters','6 letters','7 letters','8+ letters']},
  {id:'snake',name:'Snake',icon:'🐍',blurb:'Eat, grow, and dodge blocks as it speeds up.',help:'Arrow keys or WASD on a computer. Swipe, or use the wheel or arrows on a phone.',mount:snake,run:true,unit:'points'},
  {id:'pong',name:'Pong',icon:'🏓',blurb:'First to 5 against the computer. Pick how sharp it plays.',help:'Move your finger or mouse over the court, or use the up and down keys. Pick a mode at the top.',mount:pong,levels:5,open:true,names:['Easy','Normal','Hard','Expert','Insane']},
  {id:'flappy',name:'Flappy Bird',icon:'🐦',blurb:'Flap through gaps that keep getting tighter.',help:'Tap, click, or press Space to flap.',mount:flappy,run:true,unit:'points'},
  {id:'tower',name:'Tower Block',icon:'🧱',blurb:'Drop sliding blocks to build the tallest tower.',help:'Tap, click, or press Space to drop. Line blocks up perfectly to keep them wide.',mount:tower,run:true,unit:'floors'},
  {id:'crane',name:'Sky Crane',icon:'🏗️',blurb:'Drop swinging blocks to stack a wobbly skyscraper.',help:'Tap, click, or press Space to release the block. Perfect drops steady the tower.',mount:crane,run:true,unit:'floors',isNew:true},
  {id:'blobmaze',name:'Blob Maze',icon:'🟢',blurb:'Eat every dot and dodge the spikers.',help:'Arrow keys or WASD on a computer. Swipe, or use the wheel or arrows on a phone. Gems let you eat the spikers.',mount:blobmaze,run:true,unit:'points',isNew:true},
  {id:'breakout',name:'Breakout',icon:'🟦',blurb:'Break every brick. Tough bricks take more hits.',help:'Move your finger or mouse to steer, or use the left and right keys. Pick a brick layout at the top.',mount:breakout,levels:5,open:true,names:['Easy','Normal','Hard','Expert','Master'],unit:'points'},
  {id:'2048',name:'2048',icon:'🧮',blurb:'Merge tiles to hit bigger and bigger goals.',help:'Swipe on the board or use the arrow keys.',mount:g2048,run:true,unit:'points'},
  {id:'mines',name:'Minesweeper',icon:'💣',blurb:'Clear the field without setting off a mine.',help:'Pick a board size at the top. Tap to dig. Long-press, right-click, or switch to 🚩 to flag. Tap a number to clear around it.',mount:mines,levels:5,open:true,names:['Tiny','Easy','Medium','Hard','Expert'],isNew:true},
  {id:'sudoku',name:'Sudoku',icon:'🔢',blurb:'Fill the grid so every row, column and box has 1 to 9.',help:'Pick a difficulty at the top. Tap a square, then a number. Turn on ✏️ Notes to pencil in options. Keyboard: arrows, 1–9, Backspace, N.',mount:sudoku,levels:4,open:true,names:['Easy','Medium','Hard','Expert'],isNew:true},
  {id:'bbtan',name:'Brick Balls',icon:'🔵',blurb:'Aim, shoot, and smash numbered bricks before they land.',help:'Drag to aim and let go to shoot, or use ← → and Space. Grab +1 rings for extra balls.',mount:bbtan,run:true,unit:'rounds',isNew:true},
  {id:'paper',name:'Land Grab',icon:'🗺️',blurb:'Loop out of your land to claim the map. Don\'t get cut!',help:'Arrow keys, WASD, swipe, or the wheel or arrows. Leave your land and loop back to claim the area inside. Cross a rival\'s trail to knock them out.',mount:paper,levels:5,open:true,names:['Easy','Normal','Hard','Expert','Master'],isNew:true},
  {id:'runner',name:'Rail Runner',icon:'🚆',blurb:'Dodge trains, jump barriers, and grab coins.',help:'Swipe or use the arrow keys: left and right to switch tracks, up to jump, down to roll.',mount:runner,run:true,unit:'points',isNew:true},
  {id:'taxi',name:'Rush Taxi',icon:'🚕',blurb:'Pick up passengers and race the clock.',help:'Drag or use ← → to steer and ↓ to brake. Drive past a waving passenger in the outside lane, then reach the 🏁 on the same side.',mount:taxi,run:true,unit:'dollars',isNew:true},
  {id:'solitaire',name:'Solitaire',icon:'♠️',blurb:'Classic Klondike. Build each suit from Ace to King.',help:'Tap a card to move it to the best spot. Tap the deck to draw. Pick Draw 1 or Draw 3 at the top.',mount:solitaire,levels:2,open:true,names:['Draw 1','Draw 3'],isNew:true},
  {id:'helix',name:'Helix Drop',icon:'🌀',blurb:'Spin the tower and drop forever. How deep can you go?',help:'Drag sideways or use ← → to spin the tower. Avoid red. Chain drops for a combo, and fall through 3 rings in a row to smash the next one.',mount:helix,run:true,unit:'points',isNew:true},
  {id:'bubbles',name:'Bubble Pop',icon:'🎈',blurb:'Shoot bouncing bubbles and split them until they pop.',help:'Move with ← →, the wheel, or the arrows, and shoot with Space or 🔱. Pop every bubble before the time bar runs out. On a computer you can turn on mouse control or 2 players under the game.',mount:bubbles,run:true,unit:'points',isNew:true},
  {id:'blast',name:'Cannon Blast',icon:'🎯',blurb:'Blast numbered rocks that split as you shoot. How long can you last?',help:'Drag left and right, or use ← →, to move. The cannon fires on its own. Rocks split in two when they hit zero, and get tougher the longer you last. Grab rare power-ups: ⚡ rapid fire, 🔱 triple shot, 💥 double power, ❄️ freeze, 🛡️ shield.',mount:blast,run:true,unit:'points',names:['Endless'],isNew:true},
  {id:'chess',name:'Chess',icon:'♟️',blurb:'Play the computer or a friend on one device.',help:'Tap a piece, then a highlighted square. Pick Easy, Medium, Hard, or 2 Players at the top. Pawns promote to queens automatically.',mount:chess,levels:4,open:true,names:['Easy','Medium','Hard','2 Players'],isNew:true}
];
GAMES.sort((a,b)=>a.name.localeCompare(b.name));
const TC=['#FF8A99','#FFD166','#5FD8CC','#9FA9FF','#D2A8FF','#FFAA6B'];
const TAGS={tictactoe:'board strategy classic x o two',memory:'cards pairs brain puzzle concentration',whack:'reflex action tap quick',simon:'memory pattern colors music sound',hangman:'word letters spelling puzzle',snake:'classic arcade action retro',pong:'classic arcade sports tennis paddle retro',flappy:'arcade action tap bird reflex',tower:'stack arcade tap timing building',crane:'stack arcade tap timing building',blobmaze:'maze arcade pacman pac-man action',breakout:'arcade classic bricks paddle ball arkanoid',2048:'numbers puzzle tiles brain merge',mines:'puzzle classic logic brain mines bomb',sudoku:'puzzle numbers logic brain classic',blast:'ball blast cannon shooter rocks arcade upgrade',bbtan:'bbtan balls bricks aim shoot arcade',paper:'paper.io paper io territory land snake io',runner:'subway surfers subway surf runner endless train',taxi:'crazy taxi car driving racing cab',solitaire:'klondike cards patience card game',helix:'helix jump helo jump ball tower',bubbles:'bubble trouble pang balloons shooter arcade',chess:'board strategy classic two'};
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
  document.addEventListener('selectstart',e=>{if(playing()&&!inInput(e))e.preventDefault()});
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
    a.innerHTML=`<span class="ico" aria-hidden="true">${g.icon}</span><b>${g.name}</b><span class="d">${g.blurb}</span><span class="meta">${chips.map(c=>`<span class="chip">${c}</span>`).join('')}</span>${favBtn(g)}`;
  };
  if(q){
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
if(qIn){qIn.addEventListener('input',renderShelf);addEventListener('keydown',e=>{if(e.key==='/'&&document.activeElement!==qIn&&!document.body.classList.contains('playing')){e.preventDefault();qIn.focus()}})}
document.querySelectorAll('.tile[data-id]').forEach(t=>{const g=GAMES.find(x=>x.id===t.dataset.id);if(g&&!t.closest('#shelf'))t.insertAdjacentHTML('beforeend',favBtn(g))});
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
