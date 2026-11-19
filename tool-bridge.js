/* Only presentation metadata crosses the frame boundary. */
(()=>{
 'use strict';
 const root=document.documentElement,query=new URLSearchParams(location.search),embedded=query.get('embed')==='1'&&parent!==window;
 const allowedOrigin=value=>{try{const u=new URL(value);return u.origin===value&&(value==='https://chxnho-learning-portal.chxnho.workers.dev'||['http:','https:'].includes(u.protocol)&&['localhost','127.0.0.1'].includes(u.hostname));}catch{return false;}};
 const candidate=query.get('parentOrigin'),parentOrigin=embedded&&allowedOrigin(candidate)?candidate:null;
 root.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
 if(embedded)root.classList.add('tool-embedded');
 let lastHeight=0;
 const contentHeight=()=>{
  const main=document.querySelector('#dc-root #tool-main');if(!main)return 400;
  // Measure content, never viewport-sized body or scrollHeight: the parent's
  // height update must not become the next child's minimum content height.
  return Math.min(16000,Math.max(320,Math.ceil(main.getBoundingClientRect().bottom+window.scrollY+48)));
 };
 const send=type=>{if(!parentOrigin)return;const height=contentHeight();if(type==='baeumgil:resize'&&height===lastHeight)return;lastHeight=height;parent.postMessage({type,height},parentOrigin);};
 let resizePending=false;
 const resize=()=>{if(resizePending)return;resizePending=true;requestAnimationFrame(()=>{resizePending=false;send('baeumgil:resize');});};
 addEventListener('message',event=>{
  if(!parentOrigin||event.origin!==parentOrigin||event.source!==parent||!event.data||event.data.type!=='baeumgil:theme'||!['light','dark'].includes(event.data.theme))return;
  root.dataset.theme=event.data.theme;
 });
 const init=()=>{
  const preferences=document.createElement('div');preferences.className='tool-preferences';
  const theme=document.createElement('button');theme.type='button';theme.textContent='화면 테마 바꾸기';theme.onclick=()=>{root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';};
  const print=document.createElement('button');print.type='button';print.textContent='인쇄';print.onclick=()=>window.print();preferences.append(theme,print);document.body.append(preferences);
  const feedback=document.createElement('p');feedback.className='tool-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');document.body.prepend(feedback);
  let drawPending=false,timeout;
  document.addEventListener('click',event=>{
   if(!event.target.closest?.('.tool-draw'))return;
   drawPending=true;feedback.textContent='배치 결과를 확인하고 있습니다.';
   clearTimeout(timeout);timeout=setTimeout(()=>{drawPending=false;feedback.textContent='안내 메시지와 배치 결과를 확인해 주세요.';},1800);
  },true);
  let ready=false,observedMain=null;
  const sizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
  const scan=()=>{
   const main=document.querySelector('#dc-root #tool-main');
   if(main&&main!==observedMain){if(observedMain)sizeObserver?.unobserve(observedMain);observedMain=main;sizeObserver?.observe(main);}
   if(main&&!ready){ready=true;send('baeumgil:ready');}
   document.querySelectorAll('.tool-result-board').forEach(board=>{board.tabIndex=0;board.setAttribute('role','region');board.setAttribute('aria-label','자리 배치 미리보기. 가로·세로로 스크롤할 수 있습니다.');});
   if(drawPending&&document.querySelector('#dc-root [data-tool-result]')){drawPending=false;clearTimeout(timeout);feedback.textContent='새 배치를 만들었습니다. 조건 충족 여부와 결과를 확인해 주세요.';}
   resize();
  };
  new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
  scan();addEventListener('resize',resize);
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
