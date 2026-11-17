export class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.style={};this.dataset={};this.attributes={};this.listeners=new Map();this.hidden=false;this.classList={add(){},remove(){}};}
  append(...elements){for(const element of elements){element.parent=this;this.children.push(element);}}
  appendChild(element){this.append(element);return element;}

  remove(){if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(k,v){if(!this.listeners.has(k))this.listeners.set(k,new Set());this.listeners.get(k).add(v);}
  removeEventListener(k,v){this.listeners.get(k)?.delete(v);}
  emit(k,event){this.listeners.get(k)?.forEach(fn=>fn(event));}
  getBoundingClientRect(){return {left:0,top:0,width:innerWidth,height:innerHeight};}
  set innerHTML(value){if(value.includes('panel-body')){this.groups={};for(const key of ['season','weather','timeOfDay']){this.groups[key]=new Element();this.append(this.groups[key]);}this.note=new Element();this.append(this.note);}}
  querySelector(selector){if(selector==='.panel-note')return this.note;return this.groups[selector.match(/"(.*?)"/)[1]];}
  querySelectorAll(selector){const found=[];function visit(element){if(selector==='button'&&element.tagName==='button')found.push(element);element.children.forEach(visit);}visit(this);return found;}
  getContext(){return {fillRect(){},fillText(){},createRadialGradient(){return {addColorStop(){}};}};}
}
export const body=new Element('body');
export const globalEvents=new Element();
globalThis.addEventListener=globalEvents.addEventListener.bind(globalEvents);globalThis.removeEventListener=globalEvents.removeEventListener.bind(globalEvents);
globalThis.document=Object.assign(new Element(),{body,createElement:tag=>new Element(tag)});

globalThis.document.getElementById=()=>null;
