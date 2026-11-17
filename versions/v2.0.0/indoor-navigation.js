// Customer-height navigation. Pure geometry rules are also exercised by navigation.test.mjs.
export const EYE_HEIGHT = 2.12; // Store floor .52 + eye height 1.60.
export const PLAYER_RADIUS = .16;
export const ROOM = Object.freeze({minX:-4.02,maxX:2.29,minZ:-3.48,maxZ:1.12});
export const OBSTACLES = Object.freeze([
  [-3.6,-1.8,-1.95,-1.45],[-3.6,-1.8,-.8,-.3], // noodle shelves
  [-1.2,.6,-1.95,-1.45], // drinks shelf
  [-3.81,.08,-3.36,-2.65], // vending machines and hot water
  [.1,2.18,-.66,.24], // original checkout
  [-3.9,-.6,.68,1.14], // front window counter
  [1.88,2.29,-3.13,-1.17], // side window counter
  ...[-3.58,-2.92,-2.26,-1.6,-.94].map(x=>[x-.2,x+.2,.12,.52]),
  ...[-2.85,-2.15,-1.45].map(z=>[1.3,1.7,z-.2,z+.2])
]);
export function canOccupy(x,z) {
  const r=PLAYER_RADIUS;
  if(x<ROOM.minX+r||x>ROOM.maxX-r||z<ROOM.minZ+r||z>ROOM.maxZ-r)return false;
  return !OBSTACLES.some(([x0,x1,z0,z1])=>x>x0-r&&x<x1+r&&z>z0-r&&z<z1+r);
}
export function createIndoorNavigation() {
  let x=.4,z=.82,yaw=0,pitch=0,vx=0,vz=0;
  return {
    get pose(){return {x,y:EYE_HEIGHT,z,yaw,pitch};},
    reset(){x=.4;z=.82;yaw=0;pitch=0;vx=vz=0;},
    stop(){vx=vz=0;},
    look(dx,dy){yaw-=dx*.004;pitch=Math.max(-.65,Math.min(.65,pitch-dy*.003));},
    step(dt,keys){
      dt=Math.min(.05,Math.max(0,dt));
      let forward=(keys.has('ArrowUp')||keys.has('KeyW')?1:0)-(keys.has('ArrowDown')||keys.has('KeyS')?1:0);
      let side=(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0);
      const length=Math.hypot(forward,side)||1;forward/=length;side/=length;
      const speed=1.1,tx=(Math.sin(yaw)*forward+Math.cos(yaw)*side)*speed,tz=(-Math.cos(yaw)*forward+Math.sin(yaw)*side)*speed;
      const smooth=1-Math.exp(-dt*12);vx+=(tx-vx)*smooth;vz+=(tz-vz)*smooth;
      // Small axis-separated steps slide along furniture without tunnelling through it.
      const steps=Math.max(1,Math.ceil(Math.hypot(vx,vz)*dt/.035));
      for(let i=0;i<steps;i++){
        const nx=x+vx*dt/steps;if(canOccupy(nx,z))x=nx;else vx=0;
        const nz=z+vz*dt/steps;if(canOccupy(x,nz))z=nz;else vz=0;
      }
      return this.pose;
    }
  };
}
