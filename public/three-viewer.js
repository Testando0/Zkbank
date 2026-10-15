const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const ORBIT_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';

let threePromise;
function loadThree() {
  if (!threePromise) threePromise = Promise.all([import(THREE_URL), import(ORBIT_URL)]).then(([THREE, controls]) => ({ THREE, OrbitControls: controls.OrbitControls }));
  return threePromise;
}

function colorFor(product) {
  const text = `${product.name || ''} ${product.description || ''}`.toLowerCase();
  if (/preto|black|escuro/.test(text)) return 0x15131a;
  if (/branco|white|claro/.test(text)) return 0xf3f3f4;
  if (/azul|blue|ciano/.test(text)) return 0x1687c7;
  if (/vermelho|rubi|red/.test(text)) return 0xb92955;
  if (/verde|green/.test(text)) return 0x238b68;
  if (/amarelo|yellow|ouro/.test(text)) return 0xd9a52b;
  return product.category === 'pants' ? 0x211e31 : 0x8f31c6;
}

function makeMaterial(THREE, product, color, texture) {
  return new THREE.MeshStandardMaterial({
    color,
    map: texture || null,
    roughness: 0.72,
    metalness: 0.03,
    side: THREE.DoubleSide,
  });
}

function createMannequin(THREE, product, texture) {
  const root = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xb8755f, roughness: 0.86 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17151c, roughness: 0.95 });
  const garmentColor = colorFor(product);
  const garment = makeMaterial(THREE, product, garmentColor, texture);
  const garmentAccent = makeMaterial(THREE, product, garmentColor, texture);
  const category = product.category || 'shirt';

  const capsule = (radius, length, material, position, scale = [1, 1, 1]) => {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 8, 18), material);
    mesh.position.set(...position); mesh.scale.set(...scale); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  const sphere = (radius, material, position, scale = [1, 1, 1]) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 28, 20), material);
    mesh.position.set(...position); mesh.scale.set(...scale); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  const box = (size, material, position, radius = 0.08) => {
    const geometry = new THREE.BoxGeometry(...size);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
  };

  sphere(0.39, skin, [0, 3.48, 0], [0.88, 1.08, 0.88]);
  capsule(0.15, 0.24, skin, [0, 2.98, 0], [1, 0.95, 1]);
  capsule(0.56, 0.92, category === 'shirt' || category === 'accessory' ? garment : dark, [0, 2.27, 0], [1.12, 1, 0.62]);
  capsule(0.12, 1.15, skin, [-0.72, 2.28, 0], [1, 1, 0.95]);
  capsule(0.12, 1.15, skin, [0.72, 2.28, 0], [1, 1, 0.95]);
  sphere(0.15, skin, [-0.73, 1.58, 0], [1, 1.2, 1]);
  sphere(0.15, skin, [0.73, 1.58, 0], [1, 1.2, 1]);
  capsule(0.27, 1.06, category === 'pants' ? garment : dark, [-0.29, 1.08, 0], [0.92, 1, 0.82]);
  capsule(0.27, 1.06, category === 'pants' ? garment : dark, [0.29, 1.08, 0], [0.92, 1, 0.82]);
  box([0.48, 0.18, 0.76], category === 'shoes' ? garmentAccent : new THREE.MeshStandardMaterial({ color: 0xf1f1f3, roughness: 0.44 }), [-0.3, 0.2, 0.12]);
  box([0.48, 0.18, 0.76], category === 'shoes' ? garmentAccent : new THREE.MeshStandardMaterial({ color: 0xf1f1f3, roughness: 0.44 }), [0.3, 0.2, 0.12]);

  if (category === 'shirt' || category === 'accessory') {
    capsule(0.59, 0.82, garment, [0, 2.3, -0.03], [1.12, 1.02, 0.64]);
    capsule(0.16, 0.26, garment, [-0.6, 2.53, 0], [1, 1.1, 1]);
    capsule(0.16, 0.26, garment, [0.6, 2.53, 0], [1, 1.1, 1]);
  }
  if (category === 'pants') {
    capsule(0.3, 1.1, garment, [-0.29, 1.12, 0], [1, 1, 0.88]);
    capsule(0.3, 1.1, garment, [0.29, 1.12, 0], [1, 1, 0.88]);
  }
  if (category === 'shoes') {
    box([0.5, 0.2, 0.8], garment, [-0.3, 0.22, 0.18]);
    box([0.5, 0.2, 0.8], garment, [0.3, 0.22, 0.18]);
  }
  if (category === 'accessory') {
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.5, 0.18, 32), garment);
    hat.position.set(0, 3.89, 0); hat.castShadow = true; root.add(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.05, 32), garment);
    brim.position.set(0, 3.78, 0); brim.castShadow = true; root.add(brim);
  }

  const seam = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 8, 28), garmentAccent);
  seam.rotation.x = Math.PI / 2; seam.position.set(0, 2.65, -0.42); root.add(seam);
  return root;
}

async function mountGhostFittingRoom(mount, product) {
  const { THREE, OrbitControls } = await loadThree();
  if (!mount || !document.body.contains(mount)) return () => {};
  mount.innerHTML = '';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x09070e);
  scene.fog = new THREE.Fog(0x09070e, 5.5, 10);
  const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
  camera.position.set(0, 2.4, 7.3);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  mount.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.07; controls.enablePan = false;
  controls.minDistance = 5.1; controls.maxDistance = 8.2; controls.target.set(0, 2.05, 0); controls.autoRotate = true; controls.autoRotateSpeed = 1.25;

  scene.add(new THREE.HemisphereLight(0xf1d9ff, 0x14091c, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 3.4); key.position.set(3.5, 6, 4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key);
  const rim = new THREE.PointLight(0x9c42ff, 18, 9, 2); rim.position.set(-3, 3.5, -2); scene.add(rim);
  const cyan = new THREE.PointLight(0x31d9ff, 12, 8, 2); cyan.position.set(3, 1.5, 1); scene.add(cyan);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.2, 64), new THREE.MeshStandardMaterial({ color: 0x1c1029, roughness: 0.76, metalness: 0.2 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.05; floor.receiveShadow = true; scene.add(floor);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.018, 8, 96), new THREE.MeshBasicMaterial({ color: 0xa83cff, transparent: true, opacity: 0.65 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07; scene.add(ring);

  let texture = null;
  if (product.imageUrl) {
    try {
      texture = await new Promise((resolve) => new THREE.TextureLoader().load(product.imageUrl, resolve, undefined, () => resolve(null)));
      if (texture) { texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = renderer.capabilities.getMaxAnisotropy(); }
    } catch (_) { texture = null; }
  }
  const mannequin = createMannequin(THREE, product, texture);
  scene.add(mannequin);

  const resize = () => { const width = Math.max(1, mount.clientWidth); const height = Math.max(260, mount.clientHeight); camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false); };
  const observer = new ResizeObserver(resize); observer.observe(mount); resize();
  let stopped = false;
  const animate = () => { if (stopped) return; controls.update(); renderer.render(scene, camera); requestAnimationFrame(animate); };
  animate();
  const setView = (angle) => { controls.autoRotate = false; mannequin.rotation.y = Number(angle) || 0; };
  window.ghostThreeSetView = setView;
  const cleanup = () => { stopped = true; observer.disconnect(); controls.dispose(); renderer.dispose(); scene.traverse((object) => { if (object.geometry) object.geometry.dispose(); if (object.material) { const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material) => { if (material.map) material.map.dispose(); material.dispose(); }); } }); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); if (window.ghostThreeSetView === setView) delete window.ghostThreeSetView; };
  return cleanup;
}

window.ghostThreeReady = loadThree();
window.mountGhostFittingRoom = mountGhostFittingRoom;
