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
document.querySelectorAll('.project-visual img,[data-enlarge]').forEach(img=>{img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','Enlarge '+img.alt);const open=()=>{dialog.querySelector('img').src=img.src;dialog.querySelector('img').alt=img.alt;dialog.showModal()};img.addEventListener('click',open);img.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}})});
const slides=[
 ['autodeploy-cli.webp','AutoDeploy command-line interface','A practical interface for deployment, validation and diagnostics.','通过实用的命令行界面完成部署、验证与诊断。'],
 ['autodeploy-graph.webp','AutoDeploy knowledge graph','Reusable knowledge connects models, tools, hardware and previous deployment runs.','知识图谱连接模型、工具、硬件与历史部署记录，让经验可以复用。'],
 ['parser_workflow.webp','AutoDeploy model analysis workflow','Model analysis turns an input model into structured information for planning.','模型分析将输入模型转换为结构化信息，为部署规划提供依据。'],
 ['orchestrator_overview.webp','AutoDeploy execution workflow','The orchestrator coordinates execution, validation and recovery, with traceable records.','编排器协调执行、验证与恢复，并保留可追溯的过程记录。']
];
let slideIndex=0;
function changeSlide(direction){
 slideIndex=(slideIndex+direction+slides.length)%slides.length;
 const [src,alt,en,zh]=slides[slideIndex],img=document.querySelector('#autodeploy-slide'),caption=document.querySelector('.gallery-caption');
 img.src='assets/showcase/'+src;img.alt=alt;img.setAttribute('aria-label','Enlarge '+alt);
 caption.dataset.en=en;caption.dataset.zh=zh;caption.textContent=document.documentElement.lang==='en'?en:zh;
 document.querySelector('#gallery-count').textContent=String(slideIndex+1).padStart(2,'0')+' / 04';
 if(!reduced.matches)img.animate([{opacity:.25},{opacity:1}],{duration:350});
}
document.querySelector('#gallery-prev').addEventListener('click',()=>changeSlide(-1));
document.querySelector('#gallery-next').addEventListener('click',()=>changeSlide(1));
document.addEventListener('play',event=>{if(event.target.matches('audio,video'))document.querySelectorAll('audio,video').forEach(media=>{if(media!==event.target)media.pause()})},true);
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
