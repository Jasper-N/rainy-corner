// Yield through a paint before constructing the next batch. No worker/backend needed.
export function createLoadingProgress() {
  const element=document.getElementById('scene-loading');
  const bar=document.getElementById('loading-progress');
  const label=document.getElementById('loading-label');
  let progress=0,finished=false;
  return {
    async yield(progressValue,text){
      if(!finished&&Number.isFinite(progressValue)){
        progress=Math.max(progress,Math.min(1,progressValue));
        if(bar){bar.style.transform=`scaleX(${progress})`;bar.parentElement?.setAttribute('aria-valuenow',String(Math.round(progress*100)));}
        if(label&&text)label.textContent=`${text} · ${Math.round(progress*100)}%`;
      }
      await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
    },
    finish(){finished=true;if(bar)bar.style.transform='scaleX(1)';if(label)label.textContent='月灯 MART · 欢迎光临';element?.classList.add('complete');setTimeout(()=>element?.remove(),600);}
  };
}
