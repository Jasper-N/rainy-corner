// Exercises the complete original scene + async startup using real Three.js geometry.
// GPU calls are replaced with a renderer adapter; this is not a shader/FPS test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from './vendor/three.module.js';
import {Element,body,globalEvents} from './test-support.mjs';
globalThis.innerWidth=1440;globalThis.innerHeight=1000;globalThis.devicePixelRatio=2;globalThis.matchMedia=()=>({matches:false});
let renders=0,compiles=0;const timers=new Set();
globalThis.requestAnimationFrame=callback=>{const timer=setTimeout(()=>{timers.delete(timer);callback(performance.now());},3);timers.add(timer);return timer;};
globalThis.cancelAnimationFrame=timer=>{clearTimeout(timer);timers.delete(timer);};
class Renderer {
 constructor(){this.domElement=new Element('canvas');this.shadowMap={};}
 setPixelRatio(){}setSize(){}render(scene,camera){scene.updateMatrixWorld(true);camera.updateMatrixWorld();renders++;}
 async compileAsync(){compiles++;await new Promise(resolve=>setTimeout(resolve,0));}
 dispose(){this.disposed=true;}
}
class Controls extends T.EventDispatcher {
 constructor(camera){super();this.camera=camera;this.target=new T.Vector3();this.enabled=true;}
 update(){this.camera.lookAt(this.target);this.camera.updateMatrixWorld();}
 dispose(){}
}
class Reflector extends T.Mesh {
 constructor(geometry){super(geometry,new T.ShaderMaterial({fragmentShader:'gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );\n#include <tonemapping_fragment>'}));}
 getRenderTarget(){return {setSize(){}};}dispose(){}
}
globalThis.StartupRenderer=Renderer;globalThis.StartupControls=Controls;globalThis.StartupReflector=Reflector;
const local=name=>JSON.stringify(new URL(name,import.meta.url).href);
const extensionSource=fs.readFileSync(new URL('./extensions.js',import.meta.url),'utf8').replace("'three'",local('./vendor/three.module.js')).replace("'./environment-state.js'",local('./environment-state.js')).replace("'./indoor-navigation.js'",local('./indoor-navigation.js'));
let source=fs.readFileSync(new URL('./scene.js',import.meta.url),'utf8')
 .replace("'three'",local('./vendor/three.module.js'))
 .replace("import {OrbitControls} from './vendor/OrbitControls.js';",'const OrbitControls=globalThis.StartupControls;')
 .replace("import {Reflector} from './vendor/Reflector.js';",'const Reflector=globalThis.StartupReflector;')
 .replace("'./extensions.js'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(extensionSource).toString('base64')))
 .replace("'./loading.js'",local('./loading.js')).replace('new T.WebGLRenderer(','new globalThis.StartupRenderer(');
source+='\nglobalThis.startupFixture={scene,root,renderer,camera,animated,extension,geometryCache};';
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const {scene,root,camera,animated,extension,geometryCache}=globalThis.startupFixture;
assert.equal(animated.length,20);assert(compiles>=21);assert(renders>25,'Frames paint between model construction batches');assert(geometryCache.size>0);
const current=fs.readFileSync(new URL('./scene.js',import.meta.url),'utf8');
const unchangedModels=current.slice(current.indexOf('await part(0'),current.indexOf('// EXTENSION: additive')).replace(/^await part\(/gm,'part(');
assert.equal(createHash('sha256').update(unchangedModels).digest('hex'),'7ab9813e488088b2a86384108798ab7766340537ea32383fd55379eb4d65289a','Original model definitions remain unchanged');
async function settle(){const until=performance.now()+5000;while(extension.transitioning){if(performance.now()>until)throw Error('Transition timed out');await new Promise(resolve=>setTimeout(resolve,20));}await new Promise(resolve=>setTimeout(resolve,20));}
extension.switchView(true);await settle();assert(extension.inside);assert.equal(camera.position.y,2.12);
const wallGroup=animated.find(a=>a.delay===1.05).obj,roofGroup=animated.find(a=>a.delay===2.4).obj;assert(wallGroup.visible);assert(roofGroup.visible);
const ray=new T.Raycaster();ray.camera=camera;
function nearest(origin,direction){scene.updateMatrixWorld(true);ray.set(new T.Vector3(...origin),new T.Vector3(...direction));return ray.intersectObject(root,true).find(hit=>{if(!hit.object.isMesh)return false;for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;return true;});}
assert.equal(nearest([-1.5,2.12,-1.1],[-1,0,0]).object,wallGroup.children[1],'Solid left wall hides the parking lot');
assert.equal(nearest([.8,2.12,-2.2],[0,0,-1]).object,wallGroup.children[0],'Solid back wall hides the street');
const ceiling=nearest([.5,2.12,-1.1],[0,1,0]);assert(ceiling.distance>1.2&&ceiling.distance<1.4,'Opaque ceiling closes the room');
assert(nearest([.4,2.12,.5],[0,0,1]).object.material.transparent,'Exterior is viewed through real door glass');
// Actual scene geometry must not block the inside door glow.
const canvas=globalThis.startupFixture.renderer.domElement;
canvas.emit('pointerdown',{clientX:200,clientY:200});canvas.emit('pointermove',{clientX:200-Math.PI/.004,clientY:200});canvas.emit('pointerup',{clientX:200-Math.PI/.004,clientY:200});
const point=new T.Vector3(.4,2.05,1.02).project(camera),event={clientX:(point.x+1)*innerWidth/2,clientY:(1-point.y)*innerHeight/2};
canvas.emit('pointerdown',event);canvas.emit('pointerup',event);await settle();assert(!extension.inside,'Door halo returns to outdoor view in the full scene');
globalEvents.emit('pagehide',{persisted:false});for(const timer of timers)clearTimeout(timer);
assert(extension.disposed);console.log(`PASS: all 20 original model groups built across ${renders} paint opportunities; geometry reuse; original models unchanged; full-scene wall/ceiling occlusion, real glass and inside exit-glow raycast.`);
