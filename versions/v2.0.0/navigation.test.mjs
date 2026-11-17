import assert from 'node:assert/strict';
import {createIndoorNavigation,canOccupy,EYE_HEIGHT,OBSTACLES} from './indoor-navigation.js';
const nav=createIndoorNavigation();assert(canOccupy(nav.pose.x,nav.pose.z));
for(const [x0,x1,z0,z1] of OBSTACLES)assert(!canOccupy((x0+x1)/2,(z0+z1)/2));
for(const point of [[-4.2,0],[2.4,0],[0,-3.62],[.4,1.3]])assert(!canOccupy(...point));
const initial=nav.pose;nav.step(1/60,new Set(['ArrowLeft']));const first=nav.pose;
assert(first.x<initial.x);assert(initial.x-first.x<1.1/60); // accelerates instead of teleporting
let seed=1;for(let i=0;i<12000;i++){
 seed=(seed*1664525+1013904223)>>>0;
 const keys=new Set([['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'][seed%4]]);
 if(i%71===0)nav.look((seed%100)-50,(seed%80)-40);
 const pose=nav.step(i%40===0?.8:1/60,keys);assert(canOccupy(pose.x,pose.z));assert.equal(pose.y,EYE_HEIGHT);assert(Math.abs(pose.pitch)<=.65);
}
// Grid reachability verifies that the collision layout leaves real routes to all zones.
const step=.08,key=(x,z)=>`${x},${z}`,queue=[[5,10]],seen=new Set([key(5,10)]);
for(let i=0;i<queue.length;i++){
 const [x,z]=queue[i];for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,nz=z+dz,k=key(nx,nz);if(!seen.has(k)&&canOccupy(nx*step,nz*step)){seen.add(k);queue.push([nx,nz]);}}
}
for(const [x,z] of [[-2.7,-2.3],[-1.5,-1.1],[.95,-2.3],[-.4,.5]])assert(queue.some(([px,pz])=>Math.hypot(px*step-x,pz*step-z)<.18),`Walkable route to ${x},${z}`);
nav.reset();assert.deepEqual(nav.pose,{x:.4,y:EYE_HEIGHT,z:.82,yaw:0,pitch:0});
console.log('PASS: acceleration, 12,000 movement frames without wall/furniture penetration, eye/pitch limits, and reachable routes to shelves, vending machines and window bar.');
