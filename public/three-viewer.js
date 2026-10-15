const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const ORBIT_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';

let threePromise;
function loadThree() {
  if (!threePromise) threePromise = Promise.all([import(THREE_URL), import(ORBIT_URL)]).then(([THREE, controls]) => ({ THREE, OrbitControls: controls.OrbitControls }));
  return threePromise;
}

function colorFor(product) {
  const text = `${product.name || ''} ${product.description || ''}`.toLowerCase();
  if (/preto|black|escuro/.test(text)) return 0x15161a;
  if (/branco|white|claro/.test(text)) return 0xe8e9ee;
  if (/azul|blue|ciano/.test(text)) return 0x1376b8;
  if (/vermelho|rubi|red/.test(text)) return 0xa52242;
  if (/verde|green/.test(text)) return 0x20765a;
  if (/amarelo|yellow|ouro/.test(text)) return 0xc99625;
  return product.imageUrl ? 0x18191e : (product.category === 'pants' ? 0x222432 : 0x7b29a8);
}

function material(THREE, color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .02, ...options });
}
function add(root, mesh, position, scale = null, rotation = null) {
  mesh.position.set(...position);
  if (scale) mesh.scale.set(...scale);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
}
function sphere(THREE, root, radius, mat, position, scale = [1, 1, 1]) { return add(root, new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 22), mat), position, scale); }
function capsule(THREE, root, radius, length, mat, position, scale = [1, 1, 1], rotation = null) { return add(root, new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 10, 24), mat), position, scale, rotation); }
function box(THREE, root, size, mat, position, scale = [1, 1, 1]) { return add(root, new THREE.Mesh(new THREE.BoxGeometry(...size), mat), position, scale); }

function createFace(THREE, root, skin, hair) {
  sphere(THREE, root, .39, skin, [0, 3.5, 0], [.91, 1.08, .9]);
  sphere(THREE, root, .43, hair, [0, 3.82, -.01], [.98, .62, .91]);
  sphere(THREE, root, .22, hair, [-.25, 3.86, .22], [1, .55, .8]);
  sphere(THREE, root, .22, hair, [.25, 3.86, .22], [1, .55, .8]);
  const eye = material(THREE, 0x17131b, { roughness: .35 });
  sphere(THREE, root, .035, eye, [-.13, 3.53, .365], [1.1, .7, .45]);
  sphere(THREE, root, .035, eye, [.13, 3.53, .365], [1.1, .7, .45]);
  const brow = material(THREE, 0x30202a);
  capsule(THREE, root, .018, .13, brow, [-.14, 3.61, .36], [1, .65, .7], [0, 0, -.12]);
  capsule(THREE, root, .018, .13, brow, [.14, 3.61, .36], [1, .65, .7], [0, 0, .12]);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.055, .16, 12), skin); nose.rotation.x = -Math.PI / 2; add(root, nose, [0, 3.4, .39], [1, 1, .8]);
  const mouth = material(THREE, 0x873f4f, { roughness: .55 });
  capsule(THREE, root, .014, .10, mouth, [0, 3.27, .37], [1.2, .55, .55], [0, 0, Math.PI / 2]);
  sphere(THREE, root, .08, skin, [-.39, 3.49, 0], [1, 1.3, .7]); sphere(THREE, root, .08, skin, [.39, 3.49, 0], [1, 1.3, .7]);
}

function createBaseBody(THREE, product) {
  const root = new THREE.Group();
  const skin = material(THREE, 0xb97861, { roughness: .86 });
  const hair = material(THREE, 0x17141a, { roughness: .92 });
  const underwear = material(THREE, 0x202029, { roughness: .96 });
  const pants = material(THREE, 0x171722, { roughness: .94 });
  const shoe = material(THREE, 0xf1f1f4, { roughness: .38, metalness: .08 });
  const shirt = material(THREE, colorFor(product), { roughness: .82 });

  createFace(THREE, root, skin, hair);
  capsule(THREE, root, .15, .27, skin, [0, 3.02, 0], [1, .95, 1]);
  capsule(THREE, root, .57, .82, shirt, [0, 2.31, 0], [1.15, 1.02, .7]);
  sphere(THREE, root, .5, shirt, [-.44, 2.62, 0], [.55, .55, .72]);
  sphere(THREE, root, .5, shirt, [.44, 2.62, 0], [.55, .55, .72]);

  const upperArm = (x) => {
    capsule(THREE, root, .13, .52, skin, [x, 2.25, 0], [1, 1, 1], [0, 0, x > 0 ? -.08 : .08]);
    capsule(THREE, root, .11, .52, skin, [x * 1.03, 1.73, 0], [1, 1, 1], [0, 0, x > 0 ? .06 : -.06]);
    sphere(THREE, root, .13, skin, [x * 1.04, 1.37, -.01], [1, 1.18, .9]);
  };
  upperArm(-.72); upperArm(.72);
  capsule(THREE, root, .29, .96, pants, [-.29, 1.08, 0], [1, 1, .84]);
  capsule(THREE, root, .29, .96, pants, [.29, 1.08, 0], [1, 1, .84]);
  box(THREE, root, [.58, .24, .85], shoe, [-.31, .2, .14]);
  box(THREE, root, [.58, .24, .85], shoe, [.31, .2, .14]);
  const sole = material(THREE, 0xb7bac5, { roughness: .5 });
  box(THREE, root, [.62, .075, .88], sole, [-.31, .095, .14]); box(THREE, root, [.62, .075, .88], sole, [.31, .095, .14]);
  return { root, shirt };
}

function loadImageTexture(THREE, url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const loader = new THREE.TextureLoader(); loader.setCrossOrigin('anonymous');
    loader.load(url, (texture) => { texture.colorSpace = THREE.SRGBColorSpace; resolve(texture); }, undefined, () => resolve(null));
  });
}

function removePhotoBackground(THREE, source) {
  return new Promise((resolve) => {
    if (!source || !source.image) return resolve(null);
    const image = source.image; const size = 768;
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const scale = Math.min(size / image.width, size / image.height);
    const w = image.width * scale, h = image.height * scale;
    ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
    const pixels = ctx.getImageData(0, 0, size, size); const d = pixels.data;
    const sample = (x, y) => { const i = (y * size + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const edge = [...sample(2, 2), ...sample(size - 3, 2), ...sample(2, size - 3), ...sample(size - 3, size - 3)];
    const bg = [0, 1, 2].map((channel) => (edge[channel] + edge[channel + 3] + edge[channel + 6] + edge[channel + 9]) / 4);
    for (let i = 0; i < d.length; i += 4) {
      const dist = Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);
      const saturation = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
      const likelyPurpleBackground = dist < 105 && d[i + 2] > d[i + 1] * .92 && d[i + 0] < d[i + 2] * 1.16 && saturation > 22;
      if (likelyPurpleBackground) d[i + 3] = Math.max(0, Math.min(255, (dist - 45) * 4));
    }
    ctx.putImageData(pixels, 0, 0);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; resolve(texture);
  });
}

async function mountGhostFittingRoom(mount, product) {
  const { THREE, OrbitControls } = await loadThree();
  if (!mount || !document.body.contains(mount)) return () => {};
  mount.innerHTML = '';
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x09070e); scene.fog = new THREE.Fog(0x09070e, 6, 11);
  const camera = new THREE.PerspectiveCamera(27, 1, .1, 100); camera.position.set(0, 2.35, 7.55);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12; mount.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .075; controls.enablePan = false; controls.minDistance = 5.25; controls.maxDistance = 8.7; controls.target.set(0, 2.05, 0); controls.autoRotate = true; controls.autoRotateSpeed = .9;
  scene.add(new THREE.HemisphereLight(0xf8eaff, 0x14091c, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 3.8); key.position.set(3.8, 6.5, 4.5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key);
  const rim = new THREE.PointLight(0xa53cff, 20, 9, 2); rim.position.set(-3.2, 3.8, -2.2); scene.add(rim);
  const cyan = new THREE.PointLight(0x31d9ff, 15, 8, 2); cyan.position.set(3, 2, 1.8); scene.add(cyan);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.25, 64), material(THREE, 0x191026, { roughness: .73, metalness: .18 })); floor.rotation.x = -Math.PI / 2; floor.position.y = .05; floor.receiveShadow = true; scene.add(floor);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.56, .018, 8, 96), new THREE.MeshBasicMaterial({ color: 0xc048ff, transparent: true, opacity: .75 })); ring.rotation.x = -Math.PI / 2; ring.position.y = .07; scene.add(ring);

  const source = await loadImageTexture(THREE, product.imageUrl);
  const { root, shirt } = createBaseBody(THREE, product); scene.add(root);
  if (source && (product.category || 'shirt') === 'shirt') {
    const cutout = await removePhotoBackground(THREE, source);
    if (cutout) {
      const graphic = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 1.35), new THREE.MeshBasicMaterial({ map: cutout, transparent: true, alphaTest: .035, depthWrite: false, side: THREE.DoubleSide }));
      graphic.position.set(0, 2.32, .515); graphic.castShadow = false; root.add(graphic);
    }
    source.dispose();
  }

  const resize = () => { const width = Math.max(1, mount.clientWidth), height = Math.max(260, mount.clientHeight); camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false); };
  const observer = new ResizeObserver(resize); observer.observe(mount); resize();
  let stopped = false;
  const animate = () => { if (stopped) return; controls.update(); renderer.render(scene, camera); requestAnimationFrame(animate); }; animate();
  const setView = (angle) => { controls.autoRotate = false; root.rotation.y = Number(angle) || 0; };
  window.ghostThreeSetView = setView;
  const cleanup = () => { stopped = true; observer.disconnect(); controls.dispose(); renderer.dispose(); scene.traverse((object) => { if (object.geometry) object.geometry.dispose(); if (object.material) { const list = Array.isArray(object.material) ? object.material : [object.material]; list.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); } }); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); if (window.ghostThreeSetView === setView) delete window.ghostThreeSetView; };
  return cleanup;
}

window.ghostThreeReady = loadThree();
window.mountGhostFittingRoom = mountGhostFittingRoom;
