// Integration smoke test using real Three.js geometry and a minimal DOM adapter.
// Covers scene lifecycle/state/raycasting without needing a GPU; not a visual or FPS test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from './vendor/three.module.js';
import {Element,body,globalEvents} from './test-support.mjs';
globalThis.innerWidth=1440;globalThis.innerHeight=1000;globalThis.devicePixelRatio=2;
globalThis.matchMedia=()=>({matches:false});
const extensionSource=fs.readFileSync(new URL('./extensions.js',import.meta.url),'utf8')
 .replace("'three'",JSON.stringify(new URL('./vendor/three.module.js',import.meta.url).href))
 .replace("'./environment-state.js'",JSON.stringify(new URL('./environment-state.js',import.meta.url).href))
 .replace("'./indoor-navigation.js'",JSON.stringify(new URL('./indoor-navigation.js',import.meta.url).href));
const {installExtensions}=await import('data:text/javascript;base64,'+Buffer.from(extensionSource).toString('base64'));
async function settle(app){const start=performance.now();while(app.transitioning){if(performance.now()-start>4000)throw new Error('Transition timed out');await new Promise(resolve=>setTimeout(resolve,15));}}
async function run(mobile){
 globalThis.innerWidth=mobile?390:1440;globalThis.matchMedia=()=>({matches:mobile});
 const scene=new T.Scene(),root=new T.Group();scene.add(root);
 const hemi=new T.HemisphereLight(0xa5bbef,0x353042,1.25),moon=new T.DirectionalLight(),fill=new T.DirectionalLight();scene.add(hemi,moon,fill);
 const camera=new T.PerspectiveCamera(34,innerWidth/innerHeight,.1,100);camera.position.set(16,13,19);
 const controls={target:new T.Vector3(0,1.3,0),minDistance:9,maxDistance:35,minPolarAngle:.16,maxPolarAngle:1.5,update(){camera.lookAt(this.target);camera.updateMatrixWorld();}};controls.update();
 const canvas=new Element('canvas'),renderer={domElement:canvas,setPixelRatio(){},shadowMap:{}};
 const mirror=new T.Mesh(new T.PlaneGeometry(11.8,11.8),new T.ShaderMaterial({fragmentShader:'#include <tonemapping_fragment>'}));mirror.getRenderTarget=()=>({setSize(){}});
 const rain=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({transparent:true,opacity:.23}));
 const animated=[1.05,1.35,1.65,2.4,2.8].map(delay=>{const obj=new T.Group();root.add(obj);return {delay,obj};});
 const app=await installExtensions({scene,root,renderer,camera,controls,animated,mirror,rain,ripples:[],moon,fill,truckLights:[],truckBeams:[],truckPools:[],truckBulbs:[],reduced:true});
 let time=8000;const tick=()=>{time+=16.67;for(const a of animated)a.obj.visible=true;app.update(time,8);scene.updateMatrixWorld(true);if(!app.inside)controls.update();};tick();
 const panel=body.children.find(e=>e.className==='environment');assert.equal(panel.querySelectorAll('button').length,13);
 const portal=root.getObjectByName('月灯・増築').children.find(o=>o.userData.action==='enter');assert(portal);
 // Hit the actual portal with the real Three.js Raycaster via the pointer handlers.
 const projected=portal.getWorldPosition(new T.Vector3()).project(camera);const event={clientX:(projected.x+1)*innerWidth/2,clientY:(1-projected.y)*innerHeight/2};
 canvas.emit('pointerdown',event);canvas.emit('pointerup',event);
 await settle(app);tick();assert(app.inside,'Door halo enters the interior');
 const indoor=root.getObjectByName('月灯・室内');assert(indoor);assert.equal(indoor.children.filter(o=>o.userData.action==='vend').length,3);assert.equal(indoor.children.filter(o=>o.userData.action==='water').length,1);
 assert(animated.every(a=>a.obj.visible===![1.35,1.65].includes(a.delay)));assert.equal(camera.position.y,2.12);assert.equal(camera.fov,68);assert.equal(controls.enabled,false);
 const exitButton=body.children.find(e=>e.className==='scene-action scene-exit');assert.equal(exitButton.hidden,false);assert(root.getObjectByName('室内退出光晕').visible);
 globalEvents.emit('keydown',{code:'ArrowLeft',preventDefault(){}});for(let i=0;i<50;i++)tick();globalEvents.emit('keyup',{code:'ArrowLeft'});
 globalEvents.emit('keydown',{code:'ArrowUp',preventDefault(){}});for(let i=0;i<90;i++)tick();globalEvents.emit('keyup',{code:'ArrowUp'});
 assert.equal(camera.position.y,2.12);assert(camera.position.z<.4);assert(camera.position.x<.4);globalEvents.emit('blur',{});
 for(const season of ['spring','summer','autumn','winter'])for(const weather of ['clear','cloudy','rain','snow','fog','rainbow'])for(const timeOfDay of ['day','dusk','night']){
  app.store.set({season,weather,timeOfDay});tick();const state=app.store.state;
  assert(!(state.season==='summer'&&state.weather==='snow'));assert(!(state.season==='winter'&&state.weather==='rainbow'));
  assert.equal(rain.visible,state.weather==='rain');assert(Number.isFinite(hemi.intensity));assert.equal(scene.fog.density,state.weather==='fog'?.045:state.weather==='cloudy'?.009:0);
  const snowButton=panel.querySelectorAll('button').find(b=>b.dataset.value==='snow');assert.equal(snowButton.disabled,state.season==='summer');
  const rainbowButton=panel.querySelectorAll('button').find(b=>b.dataset.value==='rainbow');assert.equal(rainbowButton.disabled,state.season==='winter');
 }
 let released=0;const geometries=new Set(),materials=new Set(),textures=new Set();
 indoor.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material){materials.add(o.material);if(o.material.map)textures.add(o.material.map);}});
 for(const resource of [...geometries,...materials,...textures])resource.addEventListener('dispose',()=>released++);
 exitButton.emit('click',{});await settle(app);tick();assert(!app.inside);assert(!root.getObjectByName('月灯・室内'));assert.equal(released,geometries.size+materials.size+textures.size);
 assert.deepEqual(camera.position.toArray(),[16,13,19]);assert(animated.every(a=>a.obj.visible));
 const stableCount=root.children.length;
 for(let i=0;i<4;i++){
  app.switchView(true);await settle(app);tick();
  if(i===0){
    // Turn at customer height and hit the upper, eye-level portion of the door glow.
    canvas.emit('pointerdown',{clientX:200,clientY:200});canvas.emit('pointermove',{clientX:200-Math.PI/.004,clientY:200});canvas.emit('pointerup',{clientX:200-Math.PI/.004,clientY:200});
    scene.updateMatrixWorld(true);const point=new T.Vector3(.4,2.05,1.02).project(camera);const exitEvent={clientX:(point.x+1)*innerWidth/2,clientY:(1-point.y)*innerHeight/2};
    canvas.emit('pointerdown',exitEvent);canvas.emit('pointerup',exitEvent);await settle(app);assert(!app.inside,'Door glow exits from customer view');
  }else{app.switchView(false);await settle(app);}
  tick();assert.equal(root.children.length,stableCount);assert.equal(camera.fov,34);assert.equal(exitButton.hidden,true);
 }
 app.dispose();assert(app.disposed);assert(!root.getObjectByName('月灯・増築'));for(const callbacks of canvas.listeners.values())assert.equal(callbacks.size,0);assert.equal(body.children.length,0);
 console.log(`PASS ${mobile?'mobile':'desktop'}: 72 environment combinations, real enter/exit halo raycasts, customer eye height + keyboard movement, solid room stages retained, fixed exit button, 3 vending machines, hot water, 5 enter/exit cycles, camera restore, all indoor GPU-resource dispose events, listener cleanup.`);
}
await run(false);await run(true);
