/**
 * Optional, explicitly labelled 2D fallback when WebGL / Three.js cannot load.
 * Not a fake 3D renderer. It keeps the editor and graph algorithms usable offline.
 */
/** RGB palette interpolation for the software-only view, not WebGL lighting. */
function canvasBlend(a,b,t) {
  const av=parseInt(a.slice(1),16), bv=parseInt(b.slice(1),16);
  const channel=shift=>Math.round(((av>>shift)&255)*(1-t)+((bv>>shift)&255)*t);
  return '#' + [channel(16),channel(8),channel(0)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export class CanvasView {
  constructor(host) {
    this.host = host; this.mode = '2d'; this.supported3D = false;
    this.canvas = document.createElement('canvas'); this.canvas.className = 'scene-canvas';
    this.canvas.setAttribute('aria-hidden', 'true'); host.prepend(this.canvas);
    this.ctx = this.canvas.getContext('2d'); this.maze = null; this.session = null;
    this.zoom = 1; this.pan = {x: 0, y: 0}; this.editing = false; this.tool = 'wall';
    this.hover = null; this.drag = null;
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(host);
    this.onWheel = e => {
      e.preventDefault(); this.zoom = Math.max(.4, Math.min(6, this.zoom * Math.exp(-e.deltaY * .001))); this.draw();
    };
    this.canvas.addEventListener('wheel', this.onWheel, {passive: false});
    this.canvas.addEventListener('pointerdown', e => {
      if (!this.editing || e.button === 2) {
        this.drag = {x: e.clientX, y: e.clientY, panX: this.pan.x, panY: this.pan.y};
        this.canvas.setPointerCapture(e.pointerId);
      }
    });
    this.canvas.addEventListener('pointermove', e => {
      if (!this.drag) return;
      this.pan.x = this.drag.panX + e.clientX - this.drag.x;
      this.pan.y = this.drag.panY + e.clientY - this.drag.y; this.draw();
    });
    this.canvas.addEventListener('pointerup', () => {this.drag = null;});
    this.canvas.addEventListener('pointercancel', () => {this.drag = null;});
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.resize();
  }
  resize() {
    this.w = Math.max(1, this.host.clientWidth); this.h = Math.max(1, this.host.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.w * dpr; this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.draw();
  }
  transform() {
    if (!this.maze) return {scale: 1, ox: 0, oy: 0};
    const scale = Math.max(1, Math.min((this.w - 80) / this.maze.width, (this.h - 110) / this.maze.height)) * this.zoom;
    return {scale, ox: (this.w - this.maze.width * scale) / 2 + this.pan.x,
      oy: (this.h - this.maze.height * scale) / 2 + this.pan.y + 10};
  }
  sync(session) {this.maze = session.maze; this.session = session; this.draw();}
  setMode() {this.mode = '2d';}
  fit() {this.pan = {x: 0, y: 0}; this.zoom = 1; this.draw();}
  setEditing(editing, tool = 'wall') {this.editing = editing; this.tool = tool; this.canvas.style.cursor = editing ? 'crosshair' : 'grab'; this.setHover(null);}
  setHover(hover) {this.hover = hover; this.draw();}
  getPick(clientX, clientY) {
    if (!this.maze) return null;
    const r = this.canvas.getBoundingClientRect(), {scale, ox, oy} = this.transform();
    const gx = (clientX - r.left - ox) / scale, gy = (clientY - r.top - oy) / scale;
    const x = Math.floor(gx), y = Math.floor(gy);
    if (x < 0 || y < 0 || x >= this.maze.width || y >= this.maze.height) return null;
    const distances = [gy - y, 1 - (gx - x), 1 - (gy - y), gx - x];
    return {index: y * this.maze.width + x, direction: distances.indexOf(Math.min(...distances)), x, y};
  }
  draw() {
    if (!this.ctx || !this.w) return;
    const c = this.ctx; c.clearRect(0, 0, this.w, this.h);
    const atmosphere = this.session?.clock?.sky;
    const daylight = atmosphere?.daylight ?? 1;
    const background = c.createLinearGradient(0,0,0,this.h);
    background.addColorStop(0,canvasBlend(canvasBlend('#080e22','#668fa7',daylight),'#ad7279',(atmosphere?.twilight??0)*.58));
    background.addColorStop(1,canvasBlend(canvasBlend('#101b2c','#314956',daylight),'#453c58',(atmosphere?.twilight??0)*.38));
    c.fillStyle = background; c.fillRect(0, 0, this.w, this.h);
    if (atmosphere && atmosphere.night > .05) {
      c.fillStyle = `rgba(202,220,255,${atmosphere.night*.6})`;
      for(let i=0;i<95;i++){const x=((i*7919+23)%997)/997*this.w,y=((i*3571+71)%983)/983*this.h;c.fillRect(x,y,i%6===0?1.8:1,i%6===0?1.8:1);}
    }
    c.strokeStyle = canvasBlend('#1b2933','#46606e',daylight); c.lineWidth = .5;
    for (let x = 0; x < this.w; x += 28) {c.beginPath(); c.moveTo(x, 0); c.lineTo(x, this.h); c.stroke();}
    for (let y = 0; y < this.h; y += 28) {c.beginPath(); c.moveTo(0, y); c.lineTo(this.w, y); c.stroke();}
    if (!this.maze || !this.session) return;
    const {width: w, height: h} = this.maze, s = this.session;
    const {scale: k, ox, oy} = this.transform();
    c.save(); c.translate(ox, oy); c.scale(k, k);
    c.fillStyle = canvasBlend('#222e44','#70808a',daylight); c.shadowColor = '#0006'; c.shadowBlur = 25;
    c.fillRect(-.22, -.22, w + .44, h + .44); c.shadowBlur = 0;
    for (let i = 0; i < w * h; i++) {
      let color = (i % w + Math.floor(i / w)) % 2 ? canvasBlend('#172438','#49616f',daylight) : canvasBlend('#1b2a40','#536a77',daylight);
      if (s.trail.has(i)) color = '#354949';
      if (s.visual[i] === 1) color = '#4bbda0';
      if (s.visual[i] === 2) color = '#356c8d';
      if (s.visual[i] === 3) color = '#997844';
      if (i === this.maze.start) color = '#28745e';
      if (i === this.maze.goal) color = '#af8144';
      c.fillStyle = color; c.fillRect(i % w + .025, Math.floor(i / w) + .025, .95, .95);
    }
    if (s.path.length) {
      c.strokeStyle = '#ffdda5'; c.lineWidth = .06; c.beginPath();
      s.path.forEach((i, n) => n ? c.lineTo(i % w + .5, Math.floor(i / w) + .5) : c.moveTo(i % w + .5, Math.floor(i / w) + .5)); c.stroke();
    }
    c.strokeStyle = canvasBlend('#7a91b0','#d1d6cc',daylight); c.lineWidth = .105; c.lineCap = 'square'; c.beginPath();
    for (let i = 0; i < w * h; i++) {
      const x = i % w, y = Math.floor(i / w), b = this.maze.walls[i];
      if (b & 1) {c.moveTo(x, y); c.lineTo(x + 1, y);}
      if (b & 8) {c.moveTo(x, y); c.lineTo(x, y + 1);}
      if (x === w - 1 && (b & 2)) {c.moveTo(x + 1, y); c.lineTo(x + 1, y + 1);}
      if (y === h - 1 && (b & 4)) {c.moveTo(x, y + 1); c.lineTo(x + 1, y + 1);}
    }
    if (atmosphere) {
      const direction = atmosphere.altitude>=0 ? atmosphere.sun : atmosphere.moon;
      c.shadowColor = `rgba(0,0,0,${.45+daylight*.2})`;
      c.shadowBlur = 3; c.shadowOffsetX = -direction[0]*k*.4;
      c.shadowOffsetY = -direction[2]*k*.4;
    }
    c.stroke(); c.shadowColor='transparent'; c.shadowBlur=0; c.shadowOffsetX=c.shadowOffsetY=0;
    if (this.session.clock?.lantern && daylight < .99) {
      const lx=s.player%w+.5, ly=Math.floor(s.player/w)+.5;
      const light=c.createRadialGradient(lx,ly,.1,lx,ly,3.2);
      light.addColorStop(0,`rgba(255,186,100,${.4*(1-daylight)})`);light.addColorStop(1,'rgba(255,186,100,0)');
      c.save();c.beginPath();c.rect(0,0,w,h);c.clip();c.globalCompositeOperation='screen';c.fillStyle=light;c.fillRect(lx-3.2,ly-3.2,6.4,6.4);c.restore();
    }
    for (const [index, color, letter] of [[this.maze.start, '#6ce5c0', 'S'], [this.maze.goal, '#ffe0a9', 'F']]) {
      c.strokeStyle = color; c.lineWidth = .04; c.beginPath(); c.arc(index % w + .5, Math.floor(index / w) + .5, .28, 0, Math.PI * 2); c.stroke();
      c.fillStyle = color; c.font = 'bold .28px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(letter, index % w + .5, Math.floor(index / w) + .5);
    }
    c.fillStyle = '#fff6d5'; c.beginPath(); c.arc(s.player % w + .5, Math.floor(s.player / w) + .5, .20, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#fff6d5'; c.lineWidth = .02; c.beginPath(); c.arc(s.player % w + .5, Math.floor(s.player / w) + .5, .29, 0, Math.PI * 2); c.stroke();
    if (this.editing && this.hover) {
      const {x, y, direction: d} = this.hover; c.fillStyle = this.tool === 'goal' ? '#f1b96cb0' : '#6ce5c0b0';
      if (this.tool === 'wall') {
        if (d === 0) c.fillRect(x + .05, y - .08, .9, .16);
        if (d === 1) c.fillRect(x + .92, y + .05, .16, .9);
        if (d === 2) c.fillRect(x + .05, y + .92, .9, .16);
        if (d === 3) c.fillRect(x - .08, y + .05, .16, .9);
      } else c.fillRect(x + .1, y + .1, .8, .8);
    }
    c.restore();
  }
  update() {
    const clock = this.session?.clock;
    if (clock && (this.lastLitTime !== clock.visualMinutes || this.lastLantern !== clock.lantern)) {
      this.lastLitTime = clock.visualMinutes; this.lastLantern = clock.lantern; this.draw();
    }
  }
  capture() {return new Promise(resolve => this.canvas.toBlob(resolve, 'image/png'));}
  dispose() {this.resizeObserver.disconnect(); this.canvas.remove();}
}
