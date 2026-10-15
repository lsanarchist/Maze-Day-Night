/**
 * Maze Lab · animated sun, moon, sky and lighting · v1.1.0
 * The model shares its orbit with WorldClock. All textures are generated locally.
 * One dynamic directional shadow source per day/night phase. Local lanterns do
 * not cast shadows, keeping the cost bounded even on a 40×40 maze.
 */
export class DayNightEnvironment {
  constructor(T, scene, renderer) {
    this.T = T; this.scene = scene; this.renderer = renderer;
    this.group = new T.Group(); this.group.name = 'Day / night'; scene.add(this.group);
    this.hemi = new T.HemisphereLight(0xd7edff, 0x25323e, 1.5);
    this.sun = this.makeLight(0xffe7bf); this.moon = this.makeLight(0xa6c8ff);
    this.group.add(this.hemi, this.sun, this.sun.target, this.moon, this.moon.target);
    this.tempColor = new T.Color(); this.dayTop = new T.Color('#448ac3'); this.nightTop = new T.Color('#050b20');
    this.dayHorizon = new T.Color('#cadfea'); this.nightHorizon = new T.Color('#172945');
    this.duskTop = new T.Color('#72517b'); this.duskHorizon = new T.Color('#f0a271');
    this.daySkyLight = new T.Color('#dbecff'); this.nightSkyLight = new T.Color('#718bc7');
    this.warm = new T.Color('#ffac65'); this.neutral = new T.Color('#fff0d4');
    this.skyMaterial = new T.ShaderMaterial({side: T.BackSide, depthWrite: false, toneMapped: false,
      uniforms: {topColor: {value: this.dayTop.clone()}, horizonColor: {value: this.dayHorizon.clone()}},
      vertexShader: 'varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `varying vec3 vDirection; uniform vec3 topColor; uniform vec3 horizonColor;
        void main(){float h=normalize(vDirection).y;float f=pow(max(h,0.0),0.6);
          gl_FragColor=vec4(mix(horizonColor,topColor,f),1.0);
          #include <colorspace_fragment>
        }`
    });
    this.sky = new T.Mesh(new T.SphereGeometry(420, 28, 16), this.skyMaterial);
    this.sky.frustumCulled = false; this.sky.renderOrder = -10; this.group.add(this.sky);
    scene.background = null; scene.fog = new T.Fog(0xcadfea, 70, 190);
    const glow = document.createElement('canvas'); glow.width = glow.height = 128;
    const c = glow.getContext('2d'), g = c.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.22, 'rgba(255,255,255,.55)'); g.addColorStop(.6, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0,0,128,128); this.glowTexture = new T.CanvasTexture(glow);
    this.sunBody = new T.Mesh(new T.SphereGeometry(1, 24, 16), new T.MeshBasicMaterial({color: 0xffedb5, toneMapped: false, fog: false}));
    this.sunGlow = new T.Sprite(new T.SpriteMaterial({map: this.glowTexture, color: 0xffbb66, transparent: true, opacity: .5, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false}));
    const moonCanvas = document.createElement('canvas'); moonCanvas.width = moonCanvas.height = 256;
    const mc = moonCanvas.getContext('2d'); mc.fillStyle = '#d7e5f1'; mc.fillRect(0,0,256,256);
    let seed = 48; const random = () => {seed = (Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<60;i++){const x=random()*256,y=random()*256,r=3+random()*15;mc.fillStyle='rgba(81,106,134,.22)';mc.beginPath();mc.arc(x,y,r,0,Math.PI*2);mc.fill();mc.strokeStyle='rgba(249,253,255,.22)';mc.lineWidth=2;mc.stroke();}
    this.moonTexture = new T.CanvasTexture(moonCanvas); this.moonTexture.colorSpace = T.SRGBColorSpace;
    this.moonBody = new T.Mesh(new T.SphereGeometry(1, 24, 16), new T.MeshBasicMaterial({map: this.moonTexture, color: 0xc4ddff, toneMapped: false, fog: false}));
    this.moonGlow = new T.Sprite(new T.SpriteMaterial({map: this.glowTexture, color: 0xa0bfff, transparent: true, opacity: .18, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false}));
    this.group.add(this.sunBody, this.sunGlow, this.moonBody, this.moonGlow);
    const points = new Float32Array(900 * 3);
    for(let i=0;i<900;i++){const y=.08+random()*.92,a=random()*Math.PI*2,r=Math.sqrt(1-y*y);points.set([r*Math.cos(a)*330,y*330,r*Math.sin(a)*330],i*3);}
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position',new T.BufferAttribute(points,3));
    this.stars = new T.Points(geometry, new T.PointsMaterial({color:0xcfe0ff,size:.55,sizeAttenuation:true,transparent:true,opacity:0,depthWrite:false,toneMapped:false,fog:false}));
    this.group.add(this.stars); this.resize(16,16);
  }
  makeLight(color) {
    const T = this.T, light = new T.DirectionalLight(color, 0);
    light.castShadow = true; light.shadow.mapSize.set(2048,2048);
    light.shadow.bias = -.0002; light.shadow.normalBias = .035;
    light.shadow.camera.near = .1; light.shadow.camera.far = 250;
    return light;
  }
  resize(width,height) {
    const span = Math.max(width,height); this.orbitRadius = span*.62+1.2;
    this.lightRadius = span*2+20;
    const extent = Math.hypot(width,height)*.64+3;
    for (const light of [this.sun,this.moon]) {
      Object.assign(light.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,far:this.lightRadius*2.8});
      light.shadow.camera.updateProjectionMatrix();
    }
    const r = .58+span*.021;
    this.sunBody.scale.setScalar(r); this.moonBody.scale.setScalar(r*.88);
    this.sunGlow.scale.setScalar(r*5.5); this.moonGlow.scale.setScalar(r*4.5);
    this.scene.fog.near = span*3+32; this.scene.fog.far = span*9+100;
  }
  update(clock,camera,mode,time) {
    const sky = clock.sky, {daylight:d,twilight:t,night:n} = sky;
    this.lastState = sky;
    this.sun.position.fromArray(sky.sun).multiplyScalar(this.lightRadius);
    this.moon.position.fromArray(sky.moon).multiplyScalar(this.lightRadius);
    this.sun.intensity = sky.sunPower; this.moon.intensity = sky.moonPower;
    this.sun.visible = this.sun.intensity > .001; this.moon.visible = this.moon.intensity > .001;
    this.sun.color.copy(this.warm).lerp(this.neutral,Math.max(0,sky.altitude));
    this.hemi.intensity = .48 + d*1.05;
    this.hemi.color.copy(this.nightSkyLight).lerp(this.daySkyLight,d);
    this.hemi.groundColor.setHex(0x263140);
    this.skyMaterial.uniforms.topColor.value.copy(this.nightTop).lerp(this.dayTop,d).lerp(this.duskTop,t*.6);
    this.skyMaterial.uniforms.horizonColor.value.copy(this.nightHorizon).lerp(this.dayHorizon,d).lerp(this.duskHorizon,t*.85);
    this.scene.fog.color.copy(this.skyMaterial.uniforms.horizonColor.value);
    this.sky.position.copy(camera.position); this.stars.position.copy(camera.position);
    this.stars.material.opacity = n*.92; this.stars.visible = mode==='3d' && n>.015;
    this.sunBody.position.fromArray(sky.sun).multiplyScalar(this.orbitRadius);
    this.moonBody.position.fromArray(sky.moon).multiplyScalar(this.orbitRadius);
    this.sunGlow.position.copy(this.sunBody.position); this.moonGlow.position.copy(this.moonBody.position);
    this.sunBody.visible = this.sunGlow.visible = mode==='3d' && sky.altitude>=-.035;
    this.moonBody.visible = this.moonGlow.visible = mode==='3d' && sky.altitude<=.035;
    this.sunBody.material.color.copy(this.warm).lerp(this.neutral,Math.max(0,sky.altitude));
    this.moonBody.rotation.y = .4;
    this.renderer.toneMappingExposure = 1.18;
  }
  snapshot() {
    return {sunPosition:this.sun.position.toArray(),moonPosition:this.moon.position.toArray(),
      sunIntensity:this.sun.intensity,moonIntensity:this.moon.intensity,ambientIntensity:this.hemi.intensity,
      starsOpacity:this.stars.material.opacity,sunVisible:this.sunBody.visible,moonVisible:this.moonBody.visible};
  }
  dispose() {
    this.scene.remove(this.group);
    const materials=new Set(),geometries=new Set();
    this.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
    for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
    this.glowTexture.dispose();this.moonTexture.dispose();this.sun.dispose();this.moon.dispose();this.scene.fog=null;
  }
}
