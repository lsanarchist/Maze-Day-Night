/**
 * Maze Lab · Three.js scene adapter · v1.0.0
 * THREE and OrbitControls are injected so the graph/controller stay dependency-free.
 * One shared scene, TWO cameras. Camera changes never reconstruct the maze/session.
 */
import {DayNightEnvironment} from './environment.js';

export class ThreeView {
  constructor(THREE, OrbitControls, host) {
    this.T = THREE; this.host = host; this.supported3D = true; this.mode = '3d';
    this.maze = null; this.session = null; this.editing = false; this.tool = 'wall';
    this.hover = null; this.lastPlayer = -1; this.pathKey = null;
    this.renderer = new THREE.WebGLRenderer({antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x101a23);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.24;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'scene-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.prepend(this.canvas);
    this.scene = new THREE.Scene();
    this.environment = new DayNightEnvironment(THREE, this.scene, this.renderer);
    this.sun = this.environment.sun;
    this.perspective = new THREE.PerspectiveCamera(40, 1, .1, 600);
    this.orthographic = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 600);
    this.orthographic.up.set(0, 0, -1);
    this.cameras = {'3d': this.perspective, '2d': this.orthographic};
    this.controls3d = new OrbitControls(this.perspective, this.canvas);
    this.controls3d.enableDamping = true; this.controls3d.dampingFactor = .12;
    this.controls3d.maxPolarAngle = Math.PI * .455;
    this.controls3d.minPolarAngle = .06;
    this.controls3d.enablePan = true;
    this.controls3d.screenSpacePanning = false;
    this.controls3d.target.set(0, 0, 0);
    this.controls2d = new OrbitControls(this.orthographic, this.canvas);
    this.controls2d.enableRotate = false; this.controls2d.enableDamping = true;
    this.controls2d.dampingFactor = .12;
    this.controls2d.minZoom = .4; this.controls2d.maxZoom = 6;
    this.controls2d.screenSpacePanning = true;
    this.controls2d.mouseButtons.LEFT = THREE.MOUSE.PAN;
    this.controls2d.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    this.controls2d.touches.ONE = THREE.TOUCH.PAN;
    this.controls2d.enabled = false;
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.04);
    this.hitPoint = new THREE.Vector3(); this.matrix = new THREE.Matrix4();
    this.dummy = new THREE.Object3D(); this.color = new THREE.Color();
    this.playerFrom = new THREE.Vector3(); this.playerTarget = new THREE.Vector3();
    this.playerT = 1; this.lastPath = null;
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(host);
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
  }

  get camera() {return this.cameras[this.mode];}
  get controls() {return this.mode === '3d' ? this.controls3d : this.controls2d;}

  resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.aspect = w / h; this.perspective.aspect = this.aspect; this.perspective.updateProjectionMatrix();
    const width = this.maze?.width || 16, height = this.maze?.height || 16;
    const span = Math.max(height + 4.4, (width + 4.4) / this.aspect);
    this.orthographic.left = -span * this.aspect / 2; this.orthographic.right = span * this.aspect / 2;
    this.orthographic.top = span / 2; this.orthographic.bottom = -span / 2;
    this.orthographic.updateProjectionMatrix();
  }

  /** Fit each camera independently, leaving the shared game state untouched. */
  fit(both = false) {
    if (!this.maze) return;
    const T = this.T, {width: w, height: h} = this.maze;
    const radius = Math.hypot(w, h) / 2 + 1;
    if (both || this.mode === '3d') {
      const verticalFov = T.MathUtils.degToRad(this.perspective.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * this.aspect);
      const distance = radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2) * 1.07;
      this.controls3d.target.set(0, Math.max(w,h)*.075, 0);
      this.perspective.position.copy(new T.Vector3(.85, 1.12, 1.25).normalize().multiplyScalar(distance)).add(this.controls3d.target);
      this.perspective.lookAt(this.controls3d.target);
      this.controls3d.minDistance = 3; this.controls3d.maxDistance = distance * 3;
      this.controls3d.update(); this.controls3d.saveState();
    }
    if (both || this.mode === '2d') {
      this.controls2d.target.set(0, 0, 0);
      this.orthographic.position.set(0, Math.max(w, h) * 2.5 + 10, 0);
      this.orthographic.up.set(0, 0, -1);
      this.orthographic.zoom = 1; this.orthographic.lookAt(0, 0, 0);
      this.orthographic.updateProjectionMatrix(); this.controls2d.update(); this.controls2d.saveState();
    }
  }

  setMode(mode) {
    if (!['2d', '3d'].includes(mode)) return;
    // Flush remaining damping before disabling a camera, rather than carrying a drag across views.
    this.controls.update(); this.mode = mode;
    this.applyControls(); this.setHover(null);
  }

  setEditing(editing, tool = 'wall') {
    this.editing = editing; this.tool = tool; this.applyControls(); this.setHover(null);
    this.canvas.style.cursor = editing ? 'crosshair' : 'grab';
  }

  applyControls() {
    this.controls3d.enabled = this.mode === '3d'; this.controls2d.enabled = this.mode === '2d';
    // Editing uses left click; right drag and wheel remain available for camera movement.
    this.controls3d.mouseButtons.LEFT = this.editing ? null : this.T.MOUSE.ROTATE;
    this.controls3d.mouseButtons.RIGHT = this.T.MOUSE.PAN;
    this.controls2d.mouseButtons.LEFT = this.editing ? null : this.T.MOUSE.PAN;
    this.controls2d.mouseButtons.RIGHT = this.T.MOUSE.PAN;
    this.controls3d.touches.ONE = this.editing ? null : this.T.TOUCH.ROTATE;
    this.controls2d.touches.ONE = this.editing ? null : this.T.TOUCH.PAN;
  }

  cellPosition(index, y = 0) {
    return new this.T.Vector3(index % this.maze.width + .5 - this.maze.width / 2,
      y, Math.floor(index / this.maze.width) + .5 - this.maze.height / 2);
  }

  disposeGroup(group) {
    if (!group) return;
    const geometries = new Set(), materials = new Set();
    group.traverse(obj => {
      if (obj.geometry) geometries.add(obj.geometry);
      for (const material of (Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [])) materials.add(material);
      if (obj.isInstancedMesh || obj.isLight) obj.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) {material.map?.dispose(); material.dispose();}
    this.scene.remove(group);
  }

  build(maze, resetCamera = false) {
    const T = this.T;
    this.disposeGroup(this.board); this.maze = maze;
    this.board = new T.Group(); this.scene.add(this.board); this.lastPath = null; this.pathLine = null;
    const {width: w, height: h} = maze;
    const baseMaterial = new T.MeshStandardMaterial({color: 0x243642, roughness: .85, metalness: .08});
    const base = new T.Mesh(new T.BoxGeometry(w + .55, .3, h + .55), baseMaterial);
    base.position.y = -.19; base.receiveShadow = true; base.castShadow = true; this.board.add(base);
    const ground = new T.Mesh(new T.PlaneGeometry(w * 5 + 20, h * 5 + 20), new T.MeshStandardMaterial({color: 0x354452, roughness: 1}));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.36; ground.receiveShadow = true; this.board.add(ground);
    const gridSize = Math.max(w, h) * 4;
    const grid = new T.GridHelper(gridSize, gridSize, 0x23313a, 0x1a2730);
    grid.position.y = -.35; grid.material.transparent = true; grid.material.opacity = .28; this.board.add(grid);
    const floorMaterial = new T.MeshStandardMaterial({color: 0xffffff, roughness: .97, metalness: 0});
    this.tiles = new T.InstancedMesh(new T.BoxGeometry(.97, .05, .97), floorMaterial, w * h);
    this.tiles.receiveShadow = true;
    for (let i = 0; i < w * h; i++) {
      this.dummy.position.copy(this.cellPosition(i, -.013)); this.dummy.rotation.set(0, 0, 0); this.dummy.scale.set(1, 1, 1); this.dummy.updateMatrix();
      this.tiles.setMatrixAt(i, this.dummy.matrix); this.tiles.setColorAt(i, this.color.setHex(0x263c4a));
    }
    this.tiles.instanceMatrix.needsUpdate = true; this.board.add(this.tiles);
    const edges = [];
    for (let i = 0; i < w * h; i++) {
      const x = i % w - w / 2, z = Math.floor(i / w) - h / 2;
      if (maze.walls[i] & 1) edges.push([x + .5, z, 0]);
      if (maze.walls[i] & 8) edges.push([x, z + .5, Math.PI / 2]);
      if (i % w === w - 1 && (maze.walls[i] & 2)) edges.push([x + 1, z + .5, Math.PI / 2]);
      if (Math.floor(i / w) === h - 1 && (maze.walls[i] & 4)) edges.push([x + .5, z + 1, 0]);
    }
    this.wallMesh = new T.InstancedMesh(new T.BoxGeometry(1.1, .61, .1), new T.MeshStandardMaterial({color: 0x8aa0aa, roughness: .77, metalness: .07}), edges.length);
    const caps = new T.InstancedMesh(new T.BoxGeometry(1.1, .027, .103), new T.MeshStandardMaterial({color: 0xa9c0c8, roughness: .72}), edges.length);
    this.wallMesh.castShadow = true; this.wallMesh.receiveShadow = true;
    for (let i = 0; i < edges.length; i++) {
      const [x, z, rotation] = edges[i];
      this.dummy.position.set(x, .305, z); this.dummy.rotation.set(0, rotation, 0); this.dummy.updateMatrix(); this.wallMesh.setMatrixAt(i, this.dummy.matrix);
      this.dummy.position.y = .62; this.dummy.updateMatrix(); caps.setMatrixAt(i, this.dummy.matrix);
    }
    this.wallMesh.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true;
    this.board.add(this.wallMesh, caps);
    const ring = (index, color, radius) => {
      const marker = new T.Mesh(new T.TorusGeometry(radius, .035, 8, 32), new T.MeshBasicMaterial({color}));
      marker.rotation.x = Math.PI / 2; marker.position.copy(this.cellPosition(index, .075)); this.board.add(marker); return marker;
    };
    this.startMarker = ring(maze.start, 0x6ce5c0, .3);
    this.goalMarker = ring(maze.goal, 0xf1b96c, .3);
    const goalPole = new T.Mesh(new T.CylinderGeometry(.015, .015, .93, 6), new T.MeshStandardMaterial({color: 0xffddaa}));
    goalPole.position.copy(this.cellPosition(maze.goal, .5)); goalPole.position.x -= .16; this.board.add(goalPole);
    const flag = new T.Mesh(new T.PlaneGeometry(.29, .2), new T.MeshBasicMaterial({color: 0xf1b96c, side: T.DoubleSide}));
    flag.position.copy(goalPole.position); flag.position.x += .135; flag.position.y = .87; this.board.add(flag);
    this.player = new T.Group();
    const sphere = new T.Mesh(new T.SphereGeometry(.21, 20, 14), new T.MeshStandardMaterial({color: 0xfff8d5, roughness: .3, metalness: .15, emissive: 0xc4a672, emissiveIntensity: .26}));
    sphere.position.y = .25; sphere.castShadow = true; this.player.add(sphere);
    this.playerHalo = new T.Mesh(new T.TorusGeometry(.28, .019, 8, 32), new T.MeshBasicMaterial({color: 0xfff4c8}));
    this.playerHalo.rotation.x = Math.PI / 2; this.playerHalo.position.y = .055; this.player.add(this.playerHalo);
    const pointer = new T.Mesh(new T.ConeGeometry(.085, .14, 4), new T.MeshBasicMaterial({color: 0xfff8d5}));
    pointer.rotation.z = Math.PI; pointer.position.y = .79; this.player.add(pointer); this.playerPointer = pointer;
    this.playerLight = new T.PointLight(0xffc78d, 0, 6, 2);
    this.playerLight.position.set(0, .95, 0); this.player.add(this.playerLight);
    this.goalLight = new T.PointLight(0xffcf99, 0, 4.3, 2);
    this.goalLight.position.copy(this.cellPosition(maze.goal, 1.05)); this.board.add(this.goalLight);
    this.playerSphere = sphere;
    this.board.add(this.player); this.lastPlayer = -1; this.playerT = 1;
    this.hoverMesh = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({color: 0x6ce5c0, opacity: .57, transparent: true, depthWrite: false}));
    this.hoverMesh.visible = false; this.board.add(this.hoverMesh);
    this.environment.resize(w, h);
    this.resize(); if (resetCamera) this.fit(true);
  }

  sync(session, rebuild = false, immediate = false) {
    const newSize = !this.maze || this.maze.width !== session.maze.width || this.maze.height !== session.maze.height;
    if (!this.maze || rebuild) this.build(session.maze, newSize);
    this.session = session;
    const m = session.maze;
    for (let i = 0; i < m.walls.length; i++) {
      let color = ((i % m.width + Math.floor(i / m.width)) % 2) ? 0x203543 : 0x233846;
      if (session.trail.has(i)) color = 0x354949;
      if (session.visual[i] === 1) color = 0x48bd99;
      if (session.visual[i] === 2) color = 0x356c8d;
      if (session.visual[i] === 3) color = 0xb08342;
      if (i === m.start) color = 0x28745e;
      if (i === m.goal) color = 0xb38644;
      if (i === session.player) color = 0x8c8e67;
      this.tiles.setColorAt(i, this.color.setHex(color));
    }
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
    if (session.player !== this.lastPlayer || immediate || rebuild) {
      this.playerFrom.copy(this.player.position); this.playerTarget.copy(this.cellPosition(session.player));
      const first = this.lastPlayer < 0 || immediate || rebuild;
      this.playerT = first || this.reducedMotion ? 1 : 0;
      if (this.playerT === 1) this.player.position.copy(this.playerTarget);
      this.lastPlayer = session.player;
    }
    if (this.lastPath !== session.path) {
      if (this.pathLine) {this.board.remove(this.pathLine); this.pathLine.geometry.dispose(); this.pathLine.material.dispose(); this.pathLine = null;}
      if (session.path.length > 1) {
        const positions = session.path.map(index => this.cellPosition(index, .058));
        this.pathLine = new this.T.Line(new this.T.BufferGeometry().setFromPoints(positions), new this.T.LineBasicMaterial({color: 0xffd59b, transparent: true, opacity: .9}));
        this.board.add(this.pathLine);
      }
      this.lastPath = session.path;
    }
  }

  getPick(clientX, clientY) {
    if (!this.maze) return null;
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1);
    this.camera.updateMatrixWorld(); this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.plane, this.hitPoint);
    if (!hit) return null;
    const gx = hit.x + this.maze.width / 2, gy = hit.z + this.maze.height / 2;
    const x = Math.floor(gx), y = Math.floor(gy);
    if (x < 0 || y < 0 || x >= this.maze.width || y >= this.maze.height) return null;
    const fx = gx - x, fy = gy - y;
    const distances = [fy, 1 - fx, 1 - fy, fx];
    const direction = distances.indexOf(Math.min(...distances));
    return {index: y * this.maze.width + x, direction, x, y};
  }

  setHover(pick) {
    this.hover = pick;
    if (!this.hoverMesh) return;
    this.hoverMesh.visible = Boolean(pick && this.editing);
    if (!pick || !this.editing) return;
    const pos = this.cellPosition(pick.index);
    if (this.tool === 'wall') {
      const d = pick.direction;
      pos.x += [0, .5, 0, -.5][d]; pos.z += [-.5, 0, .5, 0][d]; pos.y = .67;
      this.hoverMesh.scale.set(d % 2 ? .13 : .94, .07, d % 2 ? .94 : .13);
    } else {
      pos.y = .06; this.hoverMesh.scale.set(.85, .025, .85);
    }
    this.hoverMesh.position.copy(pos);
    this.hoverMesh.material.color.setHex(this.tool === 'goal' ? 0xf1b96c : 0x6ce5c0);
  }

  update(dt, time) {
    this.controls.update();
    if (this.player && this.playerT < 1) {
      this.playerT = Math.min(1, this.playerT + dt / .13);
      const t = this.playerT * this.playerT * (3 - 2 * this.playerT);
      this.player.position.lerpVectors(this.playerFrom, this.playerTarget, t);
    }
    if (this.playerPointer && !this.reducedMotion) this.playerPointer.position.y = .78 + Math.sin(time * 2.7) * .045;
    if (this.session?.clock) {
      this.environment.update(this.session.clock, this.camera, this.mode, time);
      const night = 1-this.session.clock.sky.daylight;
      this.playerLight.intensity = this.session.clock.lantern ? night*9 : 0;
      this.goalLight.intensity = night*3;
      this.playerSphere.material.emissiveIntensity = .2 + night*.75;
    }
    this.renderer.render(this.scene, this.camera);
  }

  capture() {
    this.renderer.render(this.scene, this.camera);
    return new Promise(resolve => this.canvas.toBlob(resolve, 'image/png'));
  }

  dispose() {
    this.resizeObserver.disconnect(); this.controls2d.dispose(); this.controls3d.dispose();
    this.disposeGroup(this.board); this.environment.dispose(); this.renderer.dispose(); this.canvas.remove();
  }
}
