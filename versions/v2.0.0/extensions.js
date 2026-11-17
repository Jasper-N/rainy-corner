// EXTENSION: additive models and controls. The original scene remains in scene.js.
import * as T from 'three';
import { createIndoorNavigation } from './indoor-navigation.js';
import { createEnvironmentStore, showRainbow } from './environment-state.js';

export async function installExtensions(ctx) {
  const { scene, root, renderer, camera, controls, animated, mirror, rain, ripples, moon, fill, truckLights, truckBeams, truckPools, truckBulbs, reduced } = ctx;
  const store = createEnvironmentStore();
  const navigation=createIndoorNavigation(),keys=new Set();
  const yieldWork=async(progress,label)=>{if(ctx.yieldLoad)await ctx.yieldLoad(progress,label);else await new Promise(resolve=>setTimeout(resolve,0));};
  const mobile = matchMedia('(pointer:coarse)').matches || innerWidth < 700;
  if (mobile) { renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25)); moon.shadow.mapSize.set(1024, 1024); mirror.getRenderTarget().setSize(512,512); rain.geometry.setDrawRange(0,600); }
  const extension = new T.Group(); extension.name = '月灯・増築'; root.add(extension);
  let indoor = null, inside = false, transitioning = false, disposed = false, last = 0, phase = 0;
  let hovered = null, messageTimer, switchTimer, restoreTimer, savedView;
  const machines = [], seasonal = [], snowCaps = [], extensionLamps = [], wetSurfaces = [];
  const ownMaterials = new Map(), labelMaterials = new Map();
  let group = extension;
  // Merge only added static meshes, grouped by material; original scene is untouched.
  async function batchStatic(parent) {
    parent.updateMatrixWorld(true);const inverse=parent.matrixWorld.clone().invert(),buckets=new Map();
    parent.traverse(object=>{
      if(!object.isMesh||object.material.transparent||seasonal.includes(object)||snowCaps.includes(object))return;
      for(let ancestor=object;ancestor&&ancestor!==parent;ancestor=ancestor.parent)if(ancestor.userData.action)return;
      const material=object.material;if(Array.isArray(material))return;
      if(!buckets.has(material))buckets.set(material,[]);buckets.get(material).push(object);
    });
    for(const [material,objects] of buckets){
      if(objects.length<2)continue;const pieces=[];let length=0;
      for(const object of objects){const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();geometry.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,object.matrixWorld));pieces.push(geometry);length+=geometry.attributes.position.count;}
      const merged=new T.BufferGeometry();
      for(const [attribute,size] of [['position',3],['normal',3],['uv',2]]){const array=new Float32Array(length*size);let offset=0;for(const geometry of pieces){const data=geometry.attributes[attribute];if(data)array.set(data.array,offset);offset+=geometry.attributes.position.count*size;}merged.setAttribute(attribute,new T.BufferAttribute(array,size));}
      const combined=new T.Mesh(merged,material);combined.castShadow=true;combined.receiveShadow=true;parent.add(combined);
      for(const object of objects){object.removeFromParent();object.geometry.dispose();}pieces.forEach(geometry=>geometry.dispose());
      await yieldWork();
    }
  }
  function material(color, emissive = 0) {
    const key = `${color}:${emissive}`;
    if (!ownMaterials.has(key)) ownMaterials.set(key, new T.MeshToonMaterial({ color, emissive: color, emissiveIntensity: emissive }));
    return ownMaterials.get(key);
  }
  function mesh(geometry, mat, x, y, z) {
    const object = new T.Mesh(geometry, mat); object.position.set(x, y, z);
    object.castShadow = true; object.receiveShadow = true; group.add(object); return object;
  }
  function box(w, h, d, x, y, z, color, em = 0) { return mesh(new T.BoxGeometry(w, h, d), material(color, em), x, y, z); }
  function cylinder(r, h, x, y, z, color, segments = 10) { return mesh(new T.CylinderGeometry(r, r, h, segments), material(color), x, y, z); }
  function tube(points, color, radius = .025) {
    const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
    return mesh(new T.TubeGeometry(curve, Math.max(4, points.length * 4), radius, 5, false), material(color), 0, 0, 0);
  }
  function label(text, w, h, x, y, z, bg = '#d8ddc8', fg = '#3e6564', angle = 0) {
    const key=JSON.stringify([text,w,h,bg,fg]);
    if(labelMaterials.has(key)){const cached=mesh(new T.PlaneGeometry(w,h),labelMaterials.get(key),x,y,z);cached.rotation.y=angle;return cached;}
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.max(64, Math.round(512 * h / w));
    const c = cv.getContext('2d'); c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = fg; c.font = `bold ${Math.min(cv.height * .55, 95)}px "Yu Gothic","PingFang SC",sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 256, cv.height / 2, 480);
    const texture = new T.CanvasTexture(cv); texture.colorSpace = T.SRGBColorSpace;
    const object = mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide }), x, y, z);
    labelMaterials.set(key,object.material);object.rotation.y = angle; return object;
  }
  function lamp(x, y, z, power = 16) {
    const source = new T.PointLight(0xffdda2, power, 7, 2); source.position.set(x, y, z); group.add(source);
    extensionLamps.push({ source, power }); return source;
  }
  function cap(w, d, x, y, z) {
    const object = mesh(new T.BoxGeometry(w, .045, d), new T.MeshToonMaterial({ color: 0xc7d8dc, transparent: true, opacity: 0, depthWrite: false }), x, y, z);
    object.castShadow = false; snowCaps.push(object); return object;
  }
  function bicycle(x, z, color) {
    const prior = group, bike = new T.Group(); prior.add(bike); group = bike; bike.position.set(x, .12, z); bike.rotation.y = Math.PI / 2;
    for (const wx of [-.5, .5]) {
      mesh(new T.TorusGeometry(.32, .035, 6, 16), material(0x263a46), wx, .37, 0);
      mesh(new T.TorusGeometry(.275, .012, 4, 16), material(0x9dacac), wx, .37, 0);
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; tube([[wx, .37, 0], [wx + Math.cos(a) * .27, .37 + Math.sin(a) * .27, 0]], 0x8a9b9b, .005); }
    }
    tube([[-.5,.37,0],[-.17,.86,0],[.08,.37,0],[-.5,.37,0]], color);
    tube([[.08,.37,0],[.38,.91,0],[-.17,.86,0]], color);
    tube([[.5,.37,0],[.33,1.05,0],[.12,1.08,0]], 0x839da0);
    tube([[-.17,.86,0],[-.2,1,0]], 0x839da0);
    box(.27,.055,.17,-.2,1.03,0,0x30434b); box(.27,.2,.26,.46,.9,0,0x718b8e);
    group = prior;
  }
  function car(x, z, color, van = false) {
    const prior = group, vehicle = new T.Group(); prior.add(vehicle); group = vehicle; vehicle.position.set(x, .09, z);
    box(1.35,.2,2.55,0,.38,0,0x344856); box(1.36,.57,2.5,0,.74,0,color);
    box(1.25,van ? .98 : .76,van ? 2 : 1.65,0,van ? 1.38 : 1.25,-.15,color);
    box(1.29,.08,van ? 2.04 : 1.71,0,van ? 1.91 : 1.67,-.15,0xb6c6be);
    box(1.11,.48,.025,0,1.32,van ? .865 : .69,0x345462);
    for (const side of [-1,1]) {
      box(.025,.48,van ? .78 : 1.2,side*.639,1.32,van ? .4 : -.1,0x3b5b65);
      box(.035,.045,.18,side*.69,.92,.25,0xc3cebf);
      for (const wz of [-.79,.83]) { const tire = cylinder(.26,.15,side*.69,.29,wz,0x233441,12); tire.rotation.z = Math.PI/2; cylinder(.13,.16,side*.7,.29,wz,0x9bafac,10).rotation.z = Math.PI/2; }
      box(.27,.15,.025,side*.44,.78,1.27,0xe5dcb4,.45);
    }
    box(1.4,.1,.12,0,.45,1.29,0x738b91); label('月見  39-24',.43,.13,0,.55,1.36,'#ddd4a3','#425b62');
    // Caps are local to this car; their coordinates are preserved in the shared list.
    cap(1.27,van ? 2.02 : 1.69,0,van ? 1.97 : 1.73,-.15);
    group = prior;
  }

  // Left extension abuts the original x=-6 base; no original street geometry moves.
  // Feedback revision: 8-wide lot, three generous bays, unobstructed front aisle.
  box(8,.5,12,-10,-.3,0,0x182335); box(8,.08,12,-10,-.01,0,0x47536b);
  const asphalt = box(8,.025,11.8,-10,.045,0,0x293b4b); wetSurfaces.push(asphalt);
  for (let z = -5.8; z < 6; z += .5) box(.04,.24,.025,-13.99,-.23,z,0x34485b);
  for (const x of [-13.7,-11.15,-8.6,-6.05]) box(.045,.015,3.5,x,.072,-.35,0xa7b9b7);
  for (const x of [-12.425,-9.875,-7.325]) {
    box(2.5,.015,.045,x,.072,-2.1,0xa7b9b7);
    const p = label('P',.65,.65,x,.078,1.1); p.rotation.x = -Math.PI/2;
  }
  await yieldWork(.73,'铺设停车场');
  car(-12.425,-.5,0x91aaa3);await yieldWork(.75,'停放车辆');car(-9.875,-.5,0xb8b8a8,true);await yieldWork();car(-7.325,-.5,0xa7a4b0);
  box(.1,1.9,.1,-6.35,1,2.7,0x71868b);
  label('P  無料',1.2,.52,-6.35,2.05,2.73,'#587875','#e4e3c9'); label('入口  ←',1.2,.3,-6.35,1.58,2.74,'#d7ddca','#466965');
  const exitArrow=label('→',1.05,.65,-8.1,.08,4.2,'#293b4b','#a7b9b7');exitArrow.rotation.x=-Math.PI/2;
  // Low Japanese metal railings. Street entry: x=-6, z=3.15..5.8;
  // pedestrian opening: x=-6, z=1.45..2.55. Both are deliberately left clear.
  function fence(x1,z1,x2,z2) {
    const length=Math.hypot(x2-x1,z2-z1),steps=Math.ceil(length/.9);
    for(let i=0;i<=steps;i++){
      const x=x1+(x2-x1)*i/steps,z=z1+(z2-z1)*i/steps;
      box(.065,.88,.065,x,.52,z,0x647c83);box(.09,.055,.09,x,.99,z,0x92a39c);
    }
    for(const y of [.38,.86]){
      const rail=box(length,.045,.045,(x1+x2)/2,y,(z1+z2)/2,0x778e91);
      rail.rotation.y=-Math.atan2(z2-z1,x2-x1);
    }
  }
  fence(-13.85,-5.8,-13.85,5.8);fence(-13.85,-5.8,-6.15,-5.8);
  fence(-13.85,5.8,-6.15,5.8);fence(-6.15,-5.8,-6.15,1.45);fence(-6.15,2.55,-6.15,3.15);
  // Cycle shelter occupies the rear edge of the extended lot, beyond the original wall.
  box(5.8,.1,2.15,-10.1,.11,-4.25,0x707e83);
  for (const x of [-12.85,-7.35]) for (const z of [-5.2,-3.3]) cylinder(.045,2.15,x,1.18,z,0x8b9ea0);
  box(5.95,.09,2.35,-10.1,2.29,-4.25,0x70868d);
  for (let x = -13; x < -7.1; x += .22) box(.022,.035,2.35,x,2.35,-4.25,0x91a3a2);
  cap(5.95,2.35,-10.1,2.38,-4.25); label('自転車置場',1.65,.24,-10.1,2.18,-3.05,'#647e80','#dfdfc5');
  for (let i = 0; i < 5; i++) {
    await yieldWork(.78+i*.015,'搭建自行车棚');
    bicycle(-12.3+i*1.1,-4.18,[0x859f9d,0xb19b88,0x8795ab][i%3]);
    tube([[-12.3+i*1.1,.15,-3.32],[-12.3+i*1.1,.55,-3.32],[-12.05+i*1.1,.55,-3.32],[-12.05+i*1.1,.15,-3.32]],0x9aa9a4,.022);
  }
  cylinder(.07,3.9,-13.35,2,-2.3,0x516b7a); tube([[-13.35,3.9,-2.3],[-13.35,4.1,-2.3],[-12.95,4.1,-2.3]],0x69808b,.05);
  box(.55,.08,.3,-12.9,4.05,-2.3,0xdacb9d,.7); lamp(-12.9,3.9,-2.3,22);
  cap(7.9,11.75,-10,.095,0); cap(11.8,11.8,0,.112,0); cap(8.5,8.55,-1.55,.35,-1.55); cap(7.05,4.6,-.9,4.17,-1.42);
  // Restrained planter trees bring seasonal colour without changing the original store.
  for (const [x,z] of [[-13.15,3.8],[-6.7,-5.1]]) {
    box(.7,.4,.7,x,.24,z,0x667e7d); cylinder(.08,1.2,x,.95,z,0x8b8174);
    const leaves = mesh(new T.IcosahedronGeometry(.65,0),new T.MeshToonMaterial({color:0x829b8b}),x,1.8,z);
    seasonal.push(leaves); cap(.65,.65,x,2.35,z);
  }
  // Rain puddles on the extension use the same muted night reflections.
  for(let i=0;i<8;i++) {
    const puddle=mesh(new T.CircleGeometry(.22+(i%3)*.1,12),new T.MeshBasicMaterial({color:0xa0c2c5,transparent:true,opacity:.11,depthWrite:false}),-12.8+(i%3)*2.6,.074,-2.4+Math.floor(i/3)*2.8);
    puddle.rotation.x=-Math.PI/2; puddle.scale.y=.5; wetSurfaces.push(puddle);
  }

  await yieldWork(.88,'准备天气与入口');
  // Door target: feathered pale-yellow sprite; hit area has no opaque mesh.
  const cv=document.createElement('canvas'); cv.width=cv.height=128;
  const c=cv.getContext('2d'), gradient=c.createRadialGradient(64,64,6,64,64,64);
  gradient.addColorStop(0,'rgba(255,237,184,.65)'); gradient.addColorStop(.36,'rgba(255,225,158,.28)'); gradient.addColorStop(1,'rgba(255,225,158,0)');
  c.fillStyle=gradient; c.fillRect(0,0,128,128);
  const portal=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(cv),color:0xffe4a8,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
  portal.position.set(.4,1.3,1.85); portal.scale.set(1.35,1.65,1); extension.add(portal); portal.userData.action='enter';
  const exitPortal=new T.Sprite(portal.material.clone());exitPortal.name='室内退出光晕';
  exitPortal.position.set(.4,1.65,1.02);exitPortal.scale.set(1.1,1.45,1);exitPortal.visible=false;exitPortal.userData.action='exit';extension.add(exitPortal);

  // All precipitation shares this world, including the view through the real glazing.
  const count=mobile ? 260 : 700, positions=new Float32Array(count*3), speeds=new Float32Array(count);
  let randomSeed=74; const random=()=>((randomSeed=(randomSeed*1664525+1013904223)>>>0)/4294967296);
  for(let i=0;i<count;i++){positions.set([-14+random()*20,random()*8+.4,random()*12-6],i*3);speeds[i]=.65+random()*.6;}
  const snowGeometry=new T.BufferGeometry(); snowGeometry.setAttribute('position',new T.BufferAttribute(positions,3));
  const flakes=new T.Points(snowGeometry,new T.PointsMaterial({color:0xd3e0e3,size:mobile?.06:.045,transparent:true,opacity:0,depthWrite:false})); scene.add(flakes);
  const extraRainPositions=new Float32Array((mobile?140:340)*6);
  for(let i=0;i<extraRainPositions.length;i+=6){const x=-14+random()*8,y=random()*8+.3,z=random()*12-6;extraRainPositions.set([x,y,z,x-.035,y+.17,z+.015],i);}
  const extraRainGeometry=new T.BufferGeometry(); extraRainGeometry.setAttribute('position',new T.BufferAttribute(extraRainPositions,3));
  const extraRain=new T.LineSegments(extraRainGeometry,new T.LineBasicMaterial({color:0xa8c4e0,transparent:true,opacity:.23,depthWrite:false}));scene.add(extraRain);
  // Soft, low-saturation rainbow, at the distant edge of the shared diorama.
  const rainbow=new T.Group(); rainbow.position.set(-2,-.1,-5.9); scene.add(rainbow);
  [0xb89499,0xc6aa8b,0xc9bd92,0x91b7a0,0x8daabd,0x9b9db9].forEach((color,i)=>{
    const arc=new T.Mesh(new T.TorusGeometry(6.5-i*.13,.065,5,64,Math.PI),new T.MeshBasicMaterial({color,transparent:true,opacity:0,depthWrite:false}));rainbow.add(arc);
  });

  async function buildInterior() {
    indoor=new T.Group(); indoor.name='月灯・室内';root.add(indoor);group=indoor;
    // Interior materials have a separate pool and are disposed on every exit.
    const outsideMaterials=new Map(ownMaterials),outsideLabels=new Map(labelMaterials);ownMaterials.clear();labelMaterials.clear();
    // Solid original walls and roof stay visible; an inner ceiling closes the room.
    box(6.5,.08,4.7,-.9,3.46,-1.25,0xded8be);
    function noodleShelf(x,z,drinks=false) {
      box(1.8,.1,.48,x,.63,z,0xb8c1b4);
      for(const y of [.8,1.2,1.6]) {
        box(1.8,.06,.48,x,y,z,0xe7dec5); box(1.8,.055,.025,x,y,z+.25,0xd6c7a2);
        for(let i=0;i<8;i++) {
          const px=x-.78+i*.22, color=[0xb37b72,0xc5ae77,0x8d9f82,0xb9afa0][i%4];
          if(drinks) {
            cylinder(.061,.22,px,y+.14,z+.06,color);
            cylinder(.027,.055,px,y+.277,z+.06,0xd5dbc8);
            label(i%2?'TEA':'우유',.1,.085,px,y+.14,z+.123,'#dedbc2','#596e62');
          } else if(y===1.6) {
            const cup=mesh(new T.CylinderGeometry(.085,.062,.17,8),material(color),px,y+.12,z+.06);
            cylinder(.089,.02,px,y+.21,z+.06,0xe9dfc5);
            label(i%2?'辛':'컵',.09,.085,px,y+.13,z+.147,'#ded5b7','#845850');
          } else {
            box(.17,.22,.12,px,y+.14,z+.05,color);
            label(i%3===0?'라면':i%3===1?'SNACK':'辛',.145,.1,px,y+.14,z+.116,'#e5d9b9','#765b50');
            box(.09,.025,.012,px,y-.02,z+.266,0xe9cc8e);
          }
          // Rear-facing products make the cutaway readable from either side.
          box(.16,.18,.1,px,y+.12,z-.16,color);
        }
      }
      label(drinks?'음료 · DRINK':'라면 · SNACK',1.2,.16,x,1.9,z+.255,'#d4d5b9','#566d62');
    }
    noodleShelf(-2.7,-1.7);await yieldWork();noodleShelf(-2.7,-.55);await yieldWork();noodleShelf(-.3,-1.7,true);await yieldWork();
    // A row of vending machines on the back wall, followed immediately by hot water.
    for(let k=0;k<3;k++) {
      await yieldWork();
      const machine=new T.Group(); indoor.add(machine);group=machine;machine.position.set(-3.35+k*.95,0,-3.02);
      box(.86,2.18,.59,0,1.63,0,[0x9a797b,0x7c9c8d,0x8098a1][k]);
      const window=box(.68,1.45,.025,-.03,1.73,.31,0xb8d4c9,.5);
      // Individual material allows feedback without changing every display.
      window.material=window.material.clone(); machine.userData.display=window;
      for(let row=0;row<4;row++)for(let col=0;col<3;col++){
        const x=-.24+col*.21,y=1.14+row*.32,canColor=[0xa6575c,0x71977f,0xb1b9ac][(k+col)%3];
        cylinder(.063,.21,x,y,.36,canColor,10); cylinder(.062,.015,x,y+.112,.36,0xb8c6c0);
        label((k+col)%3===0?'Coca-Cola':(k+col)%3===1?'Sprite':'TEA',.16,.07,x,y,.426,`#${canColor.toString(16)}`,'#e8e0ca');
      }
      box(.5,.15,.04,0,.78,.33,0x2d4551);box(.07,.3,.04,.34,1.2,.34,0xd6d7b8);
      label('음료 · DRINK',.75,.18,0,2.57,.33,'#d6dfc8','#4e6c66');
      const can=cylinder(.066,.21,0,.79,.4,0xa6575c);can.visible=false;machine.userData.can=can;
      machine.userData.action='vend';machine.userData.until=0;machines.push(machine);group=indoor;
    }
    const water=new T.Group();indoor.add(water);group=water;water.position.set(-.35,0,-3.02);
    box(.82,.7,.65,0,.88,0,0xbfbba6);box(.75,.07,.68,0,1.27,0,0xe5dbc0);
    box(.56,.82,.45,0,1.72,0,0x8fa5a0);box(.44,.23,.025,0,1.8,.24,0xd9d9bd,.2);
    cylinder(.14,.02,0,2.15,0,0xc6c9b5);box(.12,.08,.12,0,1.49,.28,0x4d686e);box(.4,.035,.3,0,1.32,.19,0x677e7d);
    cylinder(.1,.17,0,1.41,.25,0xc0a47d);
    label('飲用熱水  90°C',.73,.16,0,2.29,.25,'#e4d7ae','#78654d');label('컵라면 · HOT',.68,.13,0,1.05,.34,'#c3c1aa','#526b65');
    const steam=mesh(new T.CylinderGeometry(.02,.015,.19,6),new T.MeshBasicMaterial({color:0xe4d6b2,transparent:true,opacity:0}),0,1.43,.3);
    water.userData.action='water';water.userData.steam=steam;water.userData.until=0;machines.push(water);group=indoor;
    // Continuous window counter and Korean convenience-store high stools.
    box(3.3,.09,.43,-2.25,1.4,.9,0xd4ba8f);
    for(const x of [-3.65,-.85])box(.06,.85,.06,x,.95,.9,0x6c8080);
    for(let i=0;i<5;i++){
      const x=-3.58+i*.66;cylinder(.19,.07,x,1.08,.32,0xa6b4a0);
      cylinder(.035,.56,x,.77,.32,0x70878a);cylinder(.2,.045,x,.5,.32,0x657b7d);
      const ring=mesh(new T.TorusGeometry(.13,.014,5,12),material(0x94a5a0),x,.7,.32);ring.rotation.x=Math.PI/2;
      box(.35,.24,.04,x,1.28,.12,0x9bad9f);
    }
    // Right-side window bar leaves the original checkout clear.
    box(.4,.09,1.95,2.08,1.4,-2.15,0xd4ba8f);
    for(const z of [-2.85,-2.15,-1.45]){
      cylinder(.18,.07,1.5,1.08,z,0xa6b4a0);cylinder(.035,.56,1.5,.77,z,0x70878a);cylinder(.19,.04,1.5,.5,z,0x657b7d);
    }
    label('잠깐 쉬어가요 · 月灯',1.85,.2,-2.55,2.95,-3.49,'#a6b4a3','#f0e1bc');
    const warmA=new T.PointLight(0xffdda2,8,7,2);warmA.position.set(-1,2.8,.15);indoor.add(warmA);const warmB=new T.PointLight(0xffdfa9,6,5,2);warmB.position.set(1,2.7,-2);indoor.add(warmB);
    indoor.userData.materials=new Map(ownMaterials);ownMaterials.clear();for(const [k,v] of outsideMaterials)ownMaterials.set(k,v);
    labelMaterials.clear();for(const [k,v] of outsideLabels)labelMaterials.set(k,v);await batchStatic(indoor);
    group=extension;
  }

  await yieldWork(.94,'合并新增模型');await batchStatic(extension);
  const details=document.createElement('details');details.className='environment';details.open=!mobile;
  details.innerHTML='<summary>月灯 · 環境 <small>ENVIRONMENT</small></summary><div class="panel-body"><fieldset><legend>季節 / SEASON</legend><div class="choices seasons" data-group="season"></div></fieldset><fieldset><legend>天気 / WEATHER</legend><div class="choices" data-group="weather"></div></fieldset><fieldset><legend>時間 / TIME</legend><div class="choices" data-group="timeOfDay"></div></fieldset><p class="panel-note" aria-live="polite">拖动旋转 · 滚轮 / 双指缩放<br>点击门口暖光，进店歇一会。</p></div>';
  document.body.append(details);
  const options={season:[['spring','春'],['summer','夏'],['autumn','秋'],['winter','冬']],weather:[['clear','晴'],['cloudy','多云'],['rain','雨'],['snow','雪'],['fog','雾'],['rainbow','彩虹']],timeOfDay:[['day','白天'],['dusk','黄昏'],['night','夜晚']]};
  const note=details.querySelector('.panel-note');
  for(const [key,values] of Object.entries(options))for(const [value,text] of values){
    const button=document.createElement('button');button.type='button';button.textContent=text;button.dataset.key=key;button.dataset.value=value;
    button.addEventListener('click',()=>store.set({[key]:value}));details.querySelector(`[data-group="${key}"]`).append(button);
  }
  const caption=document.createElement('div');caption.className='scene-caption';caption.innerHTML='<strong>月灯 MART</strong><span>TSUKIAKARI · A LITTLE CORNER OF THE NIGHT</span>';document.body.append(caption);
  const action=document.createElement('button');action.type='button';action.className='scene-action';action.textContent='进入便利店 ↗';action.addEventListener('click',()=>switchView(!inside));document.body.append(action);
  const exitButton=document.createElement('button');exitButton.type='button';exitButton.className='scene-action scene-exit';exitButton.textContent='← 返回室外';exitButton.hidden=true;exitButton.addEventListener('click',()=>switchView(false));document.body.append(exitButton);
  const walkUI=document.createElement('div');walkUI.className='indoor-walk';walkUI.hidden=true;
  const walkHint=document.createElement('p');walkHint.className='walk-hint';walkHint.textContent='方向键 / WASD 移动 · 拖动转头 · 门口光晕返回室外';walkUI.append(walkHint);
  const pad=document.createElement('div');pad.className='walk-pad';pad.setAttribute('aria-label','室内移动');walkUI.append(pad);
  for(const [key,text,title] of [['ArrowUp','↑','向前移动'],['ArrowLeft','←','向左移动'],['ArrowDown','↓','向后移动'],['ArrowRight','→','向右移动']]){
    const button=document.createElement('button');button.type='button';button.textContent=text;button.dataset.direction=key;button.setAttribute('aria-label',title);
    button.addEventListener('pointerdown',event=>{if(!inside||transitioning)return;event.preventDefault();button.setPointerCapture?.(event.pointerId);keys.add(key);});
    const release=()=>keys.delete(key);button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);pad.append(button);
  }
  document.body.append(walkUI);
  const tooltip=document.createElement('div');tooltip.className='scene-tooltip';tooltip.hidden=true;document.body.append(tooltip);
  const fade=document.createElement('div');fade.className='scene-fade';fade.setAttribute('aria-hidden','true');document.body.append(fade);
  const toast=document.createElement('div');toast.className='scene-toast';toast.setAttribute('role','status');document.body.append(toast);
  function announce(text){toast.textContent=text;clearTimeout(messageTimer);messageTimer=setTimeout(()=>toast.textContent='',3200);}
  function updatePanel(state,message=''){
    details.querySelectorAll('button').forEach(button=>{
      button.setAttribute('aria-pressed',String(state[button.dataset.key]===button.dataset.value));
      const blocked=button.dataset.key==='weather'&&((button.dataset.value==='snow'&&state.season==='summer')||(button.dataset.value==='rainbow'&&state.season==='winter'));
      button.disabled=blocked;button.title=blocked?(state.season==='summer'?'夏季不可选雪':'冬季不可选彩虹'):'';
    });
    note.textContent=message||(state.weather==='rainbow'?'彩虹为雨后放晴；夜晚隐藏彩虹。':'室内外共享天气 · 切换约 0.8 秒');
    if(message)announce(message);
  }
  updatePanel(store.state);

  const hemi=scene.children.find(object=>object.isHemisphereLight);
  const baseLights=[];root.traverse(object=>{if(object.isPointLight&&!extensionLamps.some(l=>l.source===object))baseLights.push({object,intensity:object.intensity});});
  mirror.material.uniforms.environmentWet={value:1};
  mirror.material.fragmentShader='uniform float environmentWet;\n'+mirror.material.fragmentShader.replace('#include <tonemapping_fragment>','gl_FragColor.rgb=mix(vec3(0.027,0.046,0.072),gl_FragColor.rgb,environmentWet);\n#include <tonemapping_fragment>');
  mirror.material.needsUpdate=true; // The reflector was already compiled during staged startup.
  const originalWet=animated.find(a=>a.delay===.7)?.obj;
  const originalWetMaterials=[];originalWet?.traverse(object=>{if(object.material?.transparent)originalWetMaterials.push({material:object.material,opacity:object.material.opacity});});
  // Start with the exact original rain/night light values. State changes interpolate from here.
  const values={sky:new T.Color(0x101725),hemi:new T.Color(0xa5bbef),ground:new T.Color(0x353042),moon:new T.Color(0x9ebcff),fill:new T.Color(0xe69aca),leaf:new T.Color(0x829b8b),ambient:1.25,sun:1.7,fillPower:.65,lamps:1,wet:1,snow:0,rain:1,fog:0,rainbow:0,background:0};
  let target={...values};for(const key of ['sky','hemi','ground','moon','fill','leaf'])target[key]=values[key].clone();
  const fog=new T.FogExp2(0x101725,0);scene.fog=fog;
  function targetFor(state){
    const day=state.timeOfDay==='day',dusk=state.timeOfDay==='dusk';
    const overcast=['cloudy','rain','snow','fog'].includes(state.weather);
    const skies=day?(overcast?0x81969f:0x9eafb2):dusk?(overcast?0x646b7f:0x998a86):0x101725;
    return {sky:new T.Color(skies),hemi:new T.Color(day?0xc5d4d3:dusk?0xd7bbb0:0xa5bbef),ground:new T.Color(day?0x727d77:0x353042),moon:new T.Color(day?0xe1dfc5:dusk?0xf0c69d:0x9ebcff),fill:new T.Color(day?0xb1c5c6:dusk?0xa9aec9:0xe69aca),leaf:new T.Color({spring:0x9bb39b,summer:0x779b8d,autumn:0xb39b7f,winter:0x99a9a5}[state.season]),ambient:day?(overcast?1.7:2):dusk?1.4:1.25,sun:day?(overcast?1.2:2.5):dusk?1.65:1.7,fillPower:day?.5:.65,lamps:day?.25:dusk?.7:1,wet:['rain','rainbow'].includes(state.weather)?1:0,snow:state.weather==='snow'?1:0,rain:state.weather==='rain'?1:0,fog:state.weather==='fog'?.045:state.weather==='cloudy'?.009:0,rainbow:showRainbow(state)?1:0,background:1};
  }
  const dryAsphalt=new T.Color(0x394a55),wetAsphalt=new T.Color(0x293b4b);
  const unsubscribe=store.subscribe((state,message)=>{target=targetFor(state);updatePanel(state,message);});
  const hiddenStages=[1.35,1.65]; // Replace furnishings only; keep walls and roof opaque.
  function switchView(nextInside){
    if(disposed||ctx.isLoading?.()||transitioning||nextInside===inside)return;transitioning=true;controls.enabled=false;fade.classList.add('active');tooltip.hidden=true;
    keys.clear();navigation.stop();
    switchTimer=setTimeout(async()=>{
      try{
        if(disposed)return;
        if(nextInside){
          savedView={position:camera.position.clone(),target:controls.target.clone(),min:controls.minDistance,max:controls.maxDistance,minPolar:controls.minPolarAngle,maxPolar:controls.maxPolarAngle,fov:camera.fov,near:camera.near};
          // Let OrbitControls consume any remaining outdoor damping before disabling it.
          controls.update();await buildInterior();if(disposed){disposeTree(indoor);indoor?.removeFromParent();return;}
          inside=true;navigation.reset();camera.fov=68;camera.near=.04;camera.updateProjectionMatrix();applyCustomerView();
          announce('方向键移动，拖动转头；门口暖光和左下角按钮都可返回室外。');
        }else{
          inside=false;disposeTree(indoor);root.remove(indoor);indoor=null;machines.length=0;
          camera.position.copy(savedView.position);controls.target.copy(savedView.target);controls.minDistance=savedView.min;controls.maxDistance=savedView.max;controls.minPolarAngle=savedView.minPolar;controls.maxPolarAngle=savedView.maxPolar;camera.fov=savedView.fov;camera.near=savedView.near;camera.updateProjectionMatrix();controls.update();
        }
        renderer.shadowMap.needsUpdate=true;portal.visible=!inside;exitPortal.visible=inside;action.hidden=inside;exitButton.hidden=!inside;walkUI.hidden=!inside;
        canvas.setAttribute('aria-label',inside?'月灯便利店顾客视角。方向键或WASD移动，拖动转头，门口光晕或返回按钮退出。':'雨夜便利店三维微缩景观。拖动旋转，滚轮缩放，双指缩放，双击重播组装动画。');
        if(inside)details.open=false;
      }catch(error){
        console.error('Scene switch failed',error);announce('切换未完成，请重试。');
        if(!inside&&indoor){disposeTree(indoor);indoor.removeFromParent();indoor=null;machines.length=0;}
      }finally{
        if(!disposed){fade.classList.remove('active');restoreTimer=setTimeout(()=>{transitioning=false;controls.enabled=!inside;},reduced?20:370);}
      }
    },reduced?20:370);
  }
  function applyCustomerView(){
    const pose=navigation.pose;camera.position.set(pose.x,pose.y,pose.z);
    camera.lookAt(pose.x+Math.sin(pose.yaw)*Math.cos(pose.pitch),pose.y+Math.sin(pose.pitch),pose.z-Math.cos(pose.yaw)*Math.cos(pose.pitch));camera.updateMatrixWorld();
  }

  function disposeTree(object){
    if(!object)return;const geometries=new Set(),materials=new Set(),textures=new Set();
    object.traverse(child=>{if(child.geometry)geometries.add(child.geometry);for(const mat of Array.isArray(child.material)?child.material:child.material?[child.material]:[]){materials.add(mat);for(const value of Object.values(mat))if(value?.isTexture)textures.add(value);}});
    textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());
  }
  const raycaster=new T.Raycaster(),pointer=new T.Vector2();let press=null;
  function hit(event){
    const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
    // Raycast the whole room so solid shelves/walls block interactions behind them.
    const hits=raycaster.intersectObjects(inside?[root]:[portal],true);
    for(const result of hits){if(!result.object.isMesh&&!result.object.isSprite)continue;let visible=true;for(let object=result.object;object;object=object.parent)if(!object.visible){visible=false;break;}if(!visible)continue;return result;}return null;
  }
  function actionable(hit){let object=hit?.object;while(object&&!object.userData.action)object=object.parent;return object;}
  function move(event){
    if(inside&&press){navigation.look(event.clientX-press.lastX,event.clientY-press.lastY);press.lastX=event.clientX;press.lastY=event.clientY;applyCustomerView();tooltip.hidden=true;return;}
    if(transitioning)return;hovered=actionable(hit(event));renderer.domElement.style.cursor=hovered?'pointer':'';tooltip.hidden=!hovered;
    if(hovered){tooltip.textContent=hovered===portal?'进入月灯 MART':hovered===exitPortal?'返回室外':hovered.userData.action==='water'?'接一杯热水':'取一罐饮料';tooltip.style.left=`${Math.max(85,Math.min(innerWidth-85,event.clientX))}px`;tooltip.style.top=`${Math.max(60,event.clientY-12)}px`;}
  }
  function down(event){press={x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,time:performance.now()};if(inside)canvas.setPointerCapture?.(event.pointerId); }
  function up(event){
    if(!press||transitioning)return;const distance=Math.hypot(event.clientX-press.x,event.clientY-press.y);const valid=distance<8&&performance.now()-press.time<700;press=null;if(!valid)return;
    const object=actionable(hit(event));if(!object)return;
    if(object===portal)switchView(true);else if(object===exitPortal)switchView(false);else{object.userData.until=performance.now()+1800;announce(object.userData.action==='water'?'热水已接好，慢慢享用。':'饮料已送至取货口。');}
  }
  function leave(){hovered=null;tooltip.hidden=true;renderer.domElement.style.cursor='';}
  function cancel(){press=null;leave();}
  const movementKeys=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD']);
  function keyDown(event){if(!inside||transitioning||event.altKey||event.ctrlKey||event.metaKey||['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName))return;if(movementKeys.has(event.code)){event.preventDefault();keys.add(event.code);}else if(event.code==='Escape')switchView(false);}
  function keyUp(event){keys.delete(event.code);}
  function blur(){keys.clear();navigation.stop();press=null;}
  function visibility(){if(document.hidden)blur();}
  globalThis.addEventListener('keydown',keyDown);globalThis.addEventListener('keyup',keyUp);globalThis.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);
  const canvas=renderer.domElement;canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('pointerleave',leave);
  function update(now,assemblyTime){
    renderer.shadowMap.autoUpdate=assemblyTime<=6;
    const dt=Math.min(.05,Math.max(0,(now-(last||now))/1000));last=now;phase+=dt;
    if(inside&&!transitioning){navigation.step(dt,keys);applyCustomerView();}
    // Exponential easing reaches >99% in 0.8 seconds at every refresh rate.
    const alpha=reduced?1:1-Math.exp(-dt*7);
    for(const key of Object.keys(values))if(values[key]?.isColor)values[key].lerp(target[key],alpha);else values[key]=T.MathUtils.lerp(values[key],target[key],alpha);
    if(values.background>.001)scene.background=values.sky;
    hemi.color.copy(values.hemi);hemi.groundColor.copy(values.ground);hemi.intensity=values.ambient;
    moon.color.copy(values.moon);moon.intensity=values.sun;fill.color.copy(values.fill);fill.intensity=values.fillPower;
    fog.color.copy(values.sky);fog.density=values.fog;
    baseLights.forEach(l=>l.object.intensity=l.intensity*values.lamps);extensionLamps.forEach(l=>l.source.intensity=l.power*values.lamps);
    seasonal.forEach(object=>object.material.color.copy(values.leaf));
    snowCaps.forEach(object=>{object.visible=values.snow>.005;object.material.opacity=values.snow*.95;});
    mirror.material.uniforms.environmentWet.value=values.wet;mirror.visible=assemblyTime>.6&&values.wet>.002;
    rain.visible=assemblyTime>3.8&&values.rain>.005;rain.material.opacity=.23*values.rain;
    ripples.forEach(r=>{r.ring.visible=assemblyTime>4&&values.rain>.02;r.ring.material.opacity*=values.rain;});
    originalWetMaterials.forEach(({material,opacity})=>material.opacity=opacity*values.wet);
    wetSurfaces.forEach(object=>{if(object.material.transparent)object.material.opacity=.11*values.wet;});
    asphalt.material.color.copy(dryAsphalt).lerp(wetAsphalt,values.wet);
    truckLights.forEach(l=>l.intensity*=values.lamps);truckBeams.forEach(b=>b.material.uniforms.strength.value*=values.lamps);truckPools.forEach(b=>b.material.uniforms.strength.value*=values.wet*values.lamps);truckBulbs.forEach(b=>b.material.color.multiplyScalar(.25+.75*values.lamps));
    const breath=reduced?1:1+Math.sin(phase*1.6)*.07;portal.scale.set(1.35*breath,1.65*breath,1);portal.material.opacity=hovered===portal?1:.65+(reduced?0:Math.sin(phase*1.6)*.12);
    exitPortal.scale.set(1.1*breath,1.45*breath,1);exitPortal.material.opacity=hovered===exitPortal?1:portal.material.opacity;
    if(inside)for(const a of animated)if(hiddenStages.includes(a.delay))a.obj.visible=false;
    flakes.visible=values.snow>.005;flakes.material.opacity=.8*values.snow;
    if(flakes.visible){for(let i=0;i<count;i++){const j=i*3;positions[j]+=Math.sin(phase+i)*dt*.06;positions[j+1]-=dt*speeds[i]*.65;const roof=positions[j]>-4.5&&positions[j]<2.8&&positions[j+2]>-3.9&&positions[j+2]<1.9?4.25:positions[j]<-6.1&&positions[j+2]<-3.1?2.4:.15;if(positions[j+1]<roof)positions[j+1]=8;}snowGeometry.attributes.position.needsUpdate=true;}
    extraRain.visible=assemblyTime>3.8&&values.rain>.005;extraRain.material.opacity=.23*values.rain;
    if(extraRain.visible){for(let j=0;j<extraRainPositions.length;j+=6){extraRainPositions[j+1]-=dt*4.8;extraRainPositions[j+4]-=dt*4.8;const floor=extraRainPositions[j+2]<-3.1?2.4:.1;if(extraRainPositions[j+1]<floor){extraRainPositions[j+1]=8;extraRainPositions[j+4]=8.17;}}extraRainGeometry.attributes.position.needsUpdate=true;}
    rainbow.visible=values.rainbow>.005;rainbow.children.forEach(arc=>arc.material.opacity=values.rainbow*.18);
    if(inside)for(const machine of machines){const active=machine.userData.until>now;if(machine.userData.display)machine.userData.display.material.emissiveIntensity=active?.55+Math.sin(now*.015)*.15:.5;if(machine.userData.can){machine.userData.can.visible=active;machine.userData.can.position.y=.75+(active?Math.min(.23,(machine.userData.until-now)/6000):0);}if(machine.userData.steam)machine.userData.steam.material.opacity=active?.55:0;}
  }
  function dispose(){
    if(disposed)return;disposed=true;unsubscribe();clearTimeout(messageTimer);clearTimeout(switchTimer);clearTimeout(restoreTimer);
    keys.clear();globalThis.removeEventListener('keydown',keyDown);globalThis.removeEventListener('keyup',keyUp);globalThis.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);
    canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('pointerleave',leave);
    for(const object of [indoor,extension,flakes,extraRain,rainbow]){disposeTree(object);object?.removeFromParent();}
    for(const element of [details,caption,action,exitButton,walkUI,tooltip,fade,toast])element.remove();
  }
  return { update, dispose, store, get inside(){return inside;}, get transitioning(){return transitioning;}, switchView, get disposed(){return disposed;} };
}
