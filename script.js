const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const langButton = document.querySelector('#language');
function setLanguage(lang) {
 document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
 document.querySelectorAll('[data-en]').forEach(el => {el.innerHTML = el.dataset[lang]});
 langButton.innerHTML = lang === 'zh' ? 'EN <span>↔ 中文</span>' : '中文 <span>↔ EN</span>';
 langButton.setAttribute('aria-label',lang==='zh'?'Switch to English':'切换到中文');
 try {localStorage.setItem('hafiz-language',lang)} catch {}
}
let saved='en';try{saved=localStorage.getItem('hafiz-language')||'en'}catch{}
setLanguage(saved==='zh'?'zh':'en');
langButton.addEventListener('click',()=>setLanguage(document.documentElement.lang==='en'?'zh':'en'));
const menu=document.querySelector('#menu'), nav=document.querySelector('nav');
menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',open)});
nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false')}));
document.querySelector('#copy-email').addEventListener('click',async()=>{const status=document.querySelector('#copy-status');try{await navigator.clipboard.writeText('mustofa@ihep.ac.cn');status.textContent=document.documentElement.lang==='en'?'Email copied.':'邮箱已复制。'}catch{status.textContent='mustofa@ihep.ac.cn'}});
const dialog=document.querySelector('dialog');
document.querySelectorAll('.project-visual img').forEach(img=>{img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','Enlarge '+img.alt);const open=()=>{dialog.querySelector('img').src=img.src;dialog.querySelector('img').alt=img.alt;dialog.showModal()};img.addEventListener('click',open);img.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}})});
dialog.querySelector('button').addEventListener('click',()=>dialog.close());
const progress=document.querySelector('.progress');
addEventListener('scroll',()=>{const d=document.documentElement;progress.style.width=(scrollY/Math.max(1,d.scrollHeight-innerHeight)*100)+'%'},{passive:true});
if(!reduced.matches && 'IntersectionObserver' in window){
 const observer=new IntersectionObserver(entries=>entries.forEach(({target,isIntersecting})=>{if(!isIntersecting)return;target.animate([{opacity:.35,transform:target.classList.contains('project')?'translateX(25px)':'translateY(28px)'},{opacity:1,transform:'none'}],{duration:750,easing:'cubic-bezier(.2,.65,.3,1)'});observer.unobserve(target)}),{threshold:.15});
 document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
 document.querySelector('h1').animate([{opacity:0,transform:'translateY(18px)',filter:'blur(5px)'},{opacity:1,transform:'none',filter:'blur(0)'}],{duration:1100});
}
const cursor=document.querySelector('.cursor');
if(matchMedia('(pointer:fine)').matches&&!reduced.matches){addEventListener('pointermove',e=>{cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px';cursor.style.opacity=1;cursor.classList.toggle('active',!!e.target.closest('a,button,summary,.project-visual img'))},{passive:true});document.addEventListener('pointerleave',()=>cursor.style.opacity=0)}
// Sparse ambient particles; paused when the page is hidden and disabled for reduced motion.
const canvas=document.querySelector('#ambient'),ctx=canvas.getContext('2d');
let frame;function resize(){canvas.width=innerWidth;canvas.height=innerHeight}resize();addEventListener('resize',resize);
const dots=Array.from({length:24},()=>({x:Math.random(),y:Math.random(),r:Math.random()*1.1+.3}));
function draw(time){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='rgba(216,187,115,.18)';dots.forEach((d,i)=>{ctx.beginPath();ctx.arc(d.x*canvas.width,(d.y*canvas.height+time*.003*(i%3+1))%canvas.height,d.r,0,Math.PI*2);ctx.fill()});frame=requestAnimationFrame(draw)}
if(!reduced.matches)frame=requestAnimationFrame(draw);
document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(frame);if(!document.hidden&&!reduced.matches)frame=requestAnimationFrame(draw)});
