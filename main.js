import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { updateAsymmetricProjection } from './projection.js';
import { SceneContentManager } from './content.js';

// --- State Variables ---
let screenW = 2.9;      // Screen width in meters
let screenH = 1.6;      // Screen height in meters
let boxDepth = 2.0;     // Virtual chamber depth in meters
let borderSize = 0.15;  // Outer border mask size in meters
let bezelSize = 6;      // Bezel size in pixels
let activeGrid = '2x2'; // '2x2' | '3x3' | '1x1'

// Eye coordinate state (the viewer)
const eyePos = new THREE.Vector3(0, 0, 4.0);
let controlMode = 'auto-walk'; // 'auto-walk' | 'mouse-track' | 'fixed'
let walkSpeed = 1.0;           // Speed multiplier
let textValue = 'WELCOME';
let rotationSpeed = 1.0;
let neonColor = '#00f3ff';

// Time variables
let clock = new THREE.Clock();
let totalTime = 0;

// --- Three.js Globals ---
let scene;
let contentManager;

// Illusion Screen View (Left Renderer)
let illusionCanvas, illusionRenderer, illusionCamera;

// Sandbox 3D View (Right Renderer)
let sandboxCanvas, sandboxRenderer, sandboxCamera, sandboxControls;

// Sandbox Helpers (Layer 1)
let eyeHelper, frustumHelper, screenPlaneHelper, screenBorderHelper;
let frustumGeometry;

// --- Initialization ---
function init() {
  // 1. Shared 3D Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040508); // Sleek deep space background
  
  // 2. Initialize Left Viewport: The Illusion Screen
  illusionCanvas = document.getElementById('illusion-canvas');
  illusionRenderer = new THREE.WebGLRenderer({ canvas: illusionCanvas, antialias: true });
  illusionRenderer.setSize(illusionCanvas.clientWidth, illusionCanvas.clientHeight);
  illusionRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  illusionRenderer.shadowMap.enabled = true;
  illusionRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // Asymmetric camera (Only views Layer 0 - the 3D content)
  illusionCamera = new THREE.PerspectiveCamera(45, screenW / screenH, 0.1, 100);
  illusionCamera.layers.set(0);
  scene.add(illusionCamera);

  // 3. Initialize Right Viewport: The Sandbox Simulator
  sandboxCanvas = document.getElementById('sandbox-canvas');
  sandboxRenderer = new THREE.WebGLRenderer({ canvas: sandboxCanvas, antialias: true });
  sandboxRenderer.setSize(sandboxCanvas.clientWidth, sandboxCanvas.clientHeight);
  sandboxRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  
  // Standard camera looking at origin (Views Layer 0 + Layer 1)
  sandboxCamera = new THREE.PerspectiveCamera(50, sandboxCanvas.clientWidth / sandboxCanvas.clientHeight, 0.1, 100);
  sandboxCamera.position.set(5, 4, 7);
  sandboxCamera.layers.enable(1); // Enable helpers
  
  sandboxControls = new OrbitControls(sandboxCamera, sandboxCanvas);
  sandboxControls.enableDamping = true;
  sandboxControls.dampingFactor = 0.05;
  sandboxControls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't orbit below ground
  sandboxControls.minDistance = 2;
  sandboxControls.maxDistance = 15;
  sandboxControls.target.set(0, 0, -boxDepth / 2);

  // 4. Initialize Content Manager (Fills Layer 0)
  contentManager = new SceneContentManager(scene, screenW, screenH, boxDepth, borderSize);

  // 5. Create Sandbox Helpers (Fills Layer 1)
  createSandboxHelpers();

  // 6. Connect UI Controls
  setupUIEventListeners();
  updateBezels();
  
  // Start Game Loop
  clock.getDelta(); // Reset clock
  animate();
}

// --- Create Sandbox View Helpers (Layer 1) ---
function createSandboxHelpers() {
  // Helper Group
  const helperGroup = new THREE.Group();
  
  // A. Screen Plane representation
  const screenGeom = new THREE.PlaneGeometry(screenW, screenH);
  const screenMat = new THREE.MeshBasicMaterial({
    color: 0x00f3ff,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  screenPlaneHelper = new THREE.Mesh(screenGeom, screenMat);
  screenPlaneHelper.position.set(0, 0, 0);
  helperGroup.add(screenPlaneHelper);

  const edgeGeom = new THREE.EdgesGeometry(screenGeom);
  screenBorderHelper = new THREE.LineSegments(edgeGeom, new THREE.LineBasicMaterial({ color: 0x00f3ff, linewidth: 2 }));
  helperGroup.add(screenBorderHelper);

  // B. Viewer Eye point representation (glowing orange sphere + sight cone)
  const eyeGeom = new THREE.SphereGeometry(0.12, 16, 16);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff9f43 });
  eyeHelper = new THREE.Mesh(eyeGeom, eyeMat);
  eyeHelper.position.copy(eyePos);
  helperGroup.add(eyeHelper);

  const sightGeom = new THREE.ConeGeometry(0.08, 0.25, 8);
  sightGeom.rotateX(Math.PI / 2); // Point forward
  const sightCone = new THREE.Mesh(sightGeom, new THREE.MeshBasicMaterial({ color: 0xff9f43 }));
  sightCone.position.set(0, 0, -0.15);
  eyeHelper.add(sightCone);

  // C. View Frustum representation (connecting eye to screen corners)
  frustumGeometry = new THREE.BufferGeometry();
  // 8 segments = 16 vertices
  const vertices = new Float32Array(16 * 3);
  frustumGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  
  frustumHelper = new THREE.LineSegments(
    frustumGeometry,
    new THREE.LineBasicMaterial({ color: 0xbd00ff, opacity: 0.6, transparent: true, linewidth: 1.5 })
  );
  helperGroup.add(frustumHelper);

  // Set all helpers to Layer 1 so they are hidden from the primary Illusion view
  helperGroup.traverse(child => {
    child.layers.set(1);
  });
  
  scene.add(helperGroup);
  
  // Initial draw
  updateSandboxHelpersGeometry();
}

// Update the frustum lines in 3D space
function updateSandboxHelpersGeometry() {
  if (!frustumGeometry) return;

  const positions = frustumGeometry.attributes.position.array;
  const W = screenW;
  const H = screenH;

  // Eye coordinates
  const ex = eyePos.x;
  const ey = eyePos.y;
  const ez = eyePos.z;

  const corners = [
    [-W/2, -H/2, 0], // Bottom Left
    [W/2, -H/2, 0],  // Bottom Right
    [W/2, H/2, 0],   // Top Right
    [-W/2, H/2, 0]   // Top Left
  ];

  let idx = 0;
  // 1. Line from Eye to Bottom-Left
  positions[idx++] = ex; positions[idx++] = ey; positions[idx++] = ez;
  positions[idx++] = corners[0][0]; positions[idx++] = corners[0][1]; positions[idx++] = corners[0][2];

  // 2. Line from Eye to Bottom-Right
  positions[idx++] = ex; positions[idx++] = ey; positions[idx++] = ez;
  positions[idx++] = corners[1][0]; positions[idx++] = corners[1][1]; positions[idx++] = corners[1][2];

  // 3. Line from Eye to Top-Right
  positions[idx++] = ex; positions[idx++] = ey; positions[idx++] = ez;
  positions[idx++] = corners[2][0]; positions[idx++] = corners[2][1]; positions[idx++] = corners[2][2];

  // 4. Line from Eye to Top-Left
  positions[idx++] = ex; positions[idx++] = ey; positions[idx++] = ez;
  positions[idx++] = corners[3][0]; positions[idx++] = corners[3][1]; positions[idx++] = corners[3][2];

  // 5. Screen Outline (BL -> BR)
  positions[idx++] = corners[0][0]; positions[idx++] = corners[0][1]; positions[idx++] = corners[0][2];
  positions[idx++] = corners[1][0]; positions[idx++] = corners[1][1]; positions[idx++] = corners[1][2];

  // 6. Screen Outline (BR -> TR)
  positions[idx++] = corners[1][0]; positions[idx++] = corners[1][1]; positions[idx++] = corners[1][2];
  positions[idx++] = corners[2][0]; positions[idx++] = corners[2][1]; positions[idx++] = corners[2][2];

  // 7. Screen Outline (TR -> TL)
  positions[idx++] = corners[2][0]; positions[idx++] = corners[2][1]; positions[idx++] = corners[2][2];
  positions[idx++] = corners[3][0]; positions[idx++] = corners[3][1]; positions[idx++] = corners[3][2];

  // 8. Screen Outline (TL -> BL)
  positions[idx++] = corners[3][0]; positions[idx++] = corners[3][1]; positions[idx++] = corners[3][2];
  positions[idx++] = corners[0][0]; positions[idx++] = corners[0][1]; positions[idx++] = corners[0][2];

  frustumGeometry.attributes.position.needsUpdate = true;
}

// --- Animation Loop ---
function animate() {
  requestAnimationFrame(animate);

  const deltaTime = clock.getDelta();
  totalTime += deltaTime * walkSpeed;

  // 1. Process Viewer Movement based on selected Control Mode
  if (controlMode === 'auto-walk') {
    // Generate walking curve: moves left to right, up and down, back and forth
    eyePos.x = Math.sin(totalTime * 0.7) * (screenW * 0.9);
    eyePos.y = Math.cos(totalTime * 0.4) * (screenH * 0.25);
    eyePos.z = 3.5 + Math.cos(totalTime * 0.6) * 1.0;
    
    // Sync slider values to reflect auto movement visually
    updateUISliderValues();
  }

  // Update eye visual dot in Sandbox View
  if (eyeHelper) {
    eyeHelper.position.copy(eyePos);
  }

  // 2. Update Content Animation (floating object, lights, dust particles)
  contentManager.tick(clock.getElapsedTime(), deltaTime);

  // 3. Render Left Viewport: The Illusion View
  // Recalculate asymmetric projection camera
  updateAsymmetricProjection(illusionCamera, eyePos, screenW, screenH, 0.1, 50);
  
  // Render scene from this camera
  illusionRenderer.render(scene, illusionCamera);

  // 4. Render Right Viewport: The 3D Sandbox View
  // Update orbital controls
  sandboxControls.update();
  // Update line geometry before rendering
  updateSandboxHelpersGeometry();
  // Render
  sandboxRenderer.render(scene, sandboxCamera);
}

// --- Update UI Slider Values from code-state ---
function updateUISliderValues() {
  document.getElementById('input-eye-x').value = eyePos.x;
  document.getElementById('val-eye-x').textContent = eyePos.x.toFixed(2) + 'm';
  
  document.getElementById('input-eye-y').value = eyePos.y;
  document.getElementById('val-eye-y').textContent = eyePos.y.toFixed(2) + 'm';
  
  document.getElementById('input-eye-z').value = eyePos.z;
  document.getElementById('val-eye-z').textContent = eyePos.z.toFixed(2) + 'm';
}

// --- Bezel Overlay Controller ---
function updateBezels() {
  const container = document.getElementById('bezel-overlay');
  const toggle = document.getElementById('toggle-bezels');
  
  if (!toggle.checked) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'block';
  container.innerHTML = ''; // Clear previous

  const borderThickness = bezelSize + 'px';

  if (activeGrid === '2x2') {
    // 2x2 grid needs 1 horizontal and 1 vertical line
    const vLine = document.createElement('div');
    vLine.className = 'bezel-line bezel-v';
    vLine.style.width = borderThickness;
    
    const hLine = document.createElement('div');
    hLine.className = 'bezel-line bezel-h';
    hLine.style.height = borderThickness;
    
    container.appendChild(vLine);
    container.appendChild(hLine);
  } 
  else if (activeGrid === '3x3') {
    // 3x3 grid needs 2 vertical lines and 2 horizontal lines
    const v1 = document.createElement('div');
    v1.className = 'bezel-line bezel-v bezel-v-3a';
    v1.style.width = borderThickness;
    
    const v2 = document.createElement('div');
    v2.className = 'bezel-line bezel-v bezel-v-3b';
    v2.style.width = borderThickness;

    const h1 = document.createElement('div');
    h1.className = 'bezel-line bezel-h bezel-h-3a';
    h1.style.height = borderThickness;

    const h2 = document.createElement('div');
    h2.className = 'bezel-line bezel-h bezel-h-3b';
    h2.style.height = borderThickness;

    container.appendChild(v1);
    container.appendChild(v2);
    container.appendChild(h1);
    container.appendChild(h2);
  }
}

// --- UI Event Listeners Binder ---
function setupUIEventListeners() {
  
  // 1. Dashboard Tab Switcher
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPanel = document.getElementById(btn.getAttribute('data-tab'));
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // 2. Control Mode selection (Auto-walk, Mouse track, Fixed)
  const modeRadios = document.querySelectorAll('input[name="control-mode"]');
  modeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      controlMode = e.target.value;
      
      const speedSlider = document.getElementById('input-walk-speed');
      // Disable sliders during auto walk to prevent conflict
      const sliders = ['input-eye-x', 'input-eye-y', 'input-eye-z'];
      
      if (controlMode === 'auto-walk') {
        speedSlider.disabled = false;
        sliders.forEach(id => document.getElementById(id).disabled = true);
      } else {
        speedSlider.disabled = true;
        sliders.forEach(id => document.getElementById(id).disabled = false);
      }
    });
  });

  // Init manual sliders to disabled since we default to auto-walk
  ['input-eye-x', 'input-eye-y', 'input-eye-z'].forEach(id => document.getElementById(id).disabled = true);

  // 3. Eye Position Sliders (X, Y, Z)
  document.getElementById('input-eye-x').addEventListener('input', (e) => {
    eyePos.x = parseFloat(e.target.value);
    document.getElementById('val-eye-x').textContent = eyePos.x.toFixed(2) + 'm';
  });
  document.getElementById('input-eye-y').addEventListener('input', (e) => {
    eyePos.y = parseFloat(e.target.value);
    document.getElementById('val-eye-y').textContent = eyePos.y.toFixed(2) + 'm';
  });
  document.getElementById('input-eye-z').addEventListener('input', (e) => {
    eyePos.z = parseFloat(e.target.value);
    document.getElementById('val-eye-z').textContent = eyePos.z.toFixed(2) + 'm';
  });

  // 4. Auto-walk speed slider
  document.getElementById('input-walk-speed').addEventListener('input', (e) => {
    walkSpeed = parseFloat(e.target.value);
    document.getElementById('val-walk-speed').textContent = walkSpeed.toFixed(1) + 'x';
  });

  // 5. Preset Positions Buttons
  const presetButtons = document.querySelectorAll('.btn-preset-pos');
  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Force change to Fixed mode to lock position
      document.querySelector('input[value="fixed"]').click();
      
      const coords = btn.getAttribute('data-pos').split(',').map(Number);
      eyePos.set(coords[0], coords[1], coords[2]);
      updateUISliderValues();
    });
  });

  // 6. Object Presets Selector (Text, Crystal, Torus, Robot, Flamingo)
  const objButtons = document.querySelectorAll('.btn-select[data-obj]');
  objButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      objButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const preset = btn.getAttribute('data-obj');
      contentManager.updatePreset(preset);
      
      // Hide or show text / robot / flamingo settings fields accordingly
      const textInput = document.getElementById('field-text-input');
      const robotAnimSelectBox = document.getElementById('field-robot-anim');
      const flamingoCountBox = document.getElementById('field-flamingo-count');
      
      if (preset === 'text') {
        textInput.style.display = 'flex';
        robotAnimSelectBox.style.display = 'none';
        flamingoCountBox.style.display = 'none';
      } else if (preset === 'robot') {
        textInput.style.display = 'none';
        robotAnimSelectBox.style.display = 'flex';
        flamingoCountBox.style.display = 'none';
        // Sync select dropdown to active action
        document.getElementById('select-robot-anim').value = contentManager.activeAnimationName;
      } else if (preset === 'flamingo') {
        textInput.style.display = 'none';
        robotAnimSelectBox.style.display = 'none';
        flamingoCountBox.style.display = 'flex';
        // Sync slider value
        document.getElementById('input-flamingo-count').value = contentManager.flamingoCount;
        document.getElementById('val-flamingo-count').textContent = contentManager.flamingoCount + '마리';
      } else {
        textInput.style.display = 'none';
        robotAnimSelectBox.style.display = 'none';
        flamingoCountBox.style.display = 'none';
      }
    });
  });

  // Robot Animation Select Listener
  document.getElementById('select-robot-anim').addEventListener('change', (e) => {
    contentManager.updateRobotAnimation(e.target.value);
  });

  // Flamingo Count Slider Listener
  document.getElementById('input-flamingo-count').addEventListener('input', (e) => {
    const count = parseInt(e.target.value);
    document.getElementById('val-flamingo-count').textContent = count + '마리';
    contentManager.updateFlamingoCount(count);
  });

  // 7. Custom Text Input
  const textInputEl = document.getElementById('input-text');
  textInputEl.addEventListener('input', (e) => {
    let cleanVal = e.target.value.replace(/[^A-Za-z0-9\s!\?\-]/g, ''); // Filter to ASCII characters for standard font compatibility
    e.target.value = cleanVal;
    textValue = cleanVal || ' ';
    contentManager.updateText(textValue);
  });

  // 8. Color Picker & Swatches
  const colorPicker = document.getElementById('input-color');
  colorPicker.addEventListener('input', (e) => {
    neonColor = e.target.value;
    contentManager.updateColor(neonColor);
    
    // update neon elements in UI
    document.documentElement.style.setProperty('--color-neon-cyan', neonColor);
  });

  const swatches = document.querySelectorAll('.color-swatch');
  swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      const col = swatch.getAttribute('data-color');
      colorPicker.value = col;
      neonColor = col;
      contentManager.updateColor(col);
      document.documentElement.style.setProperty('--color-neon-cyan', col);
    });
  });

  // 9. Rotation Speed slider
  document.getElementById('input-rotation-speed').addEventListener('input', (e) => {
    rotationSpeed = parseFloat(e.target.value);
    contentManager.rotationSpeed = rotationSpeed;
  });

  // 10. Depth & Border Sliders
  document.getElementById('input-box-depth').addEventListener('input', (e) => {
    boxDepth = parseFloat(e.target.value);
    document.getElementById('val-box-depth').textContent = boxDepth.toFixed(1) + 'm';
    contentManager.updateDimensions(screenW, screenH, boxDepth, borderSize);
    sandboxControls.target.set(0, 0, -boxDepth / 2);
  });

  document.getElementById('input-border-size').addEventListener('input', (e) => {
    borderSize = parseFloat(e.target.value);
    document.getElementById('val-border-size').textContent = borderSize.toFixed(2) + 'm';
    contentManager.updateDimensions(screenW, screenH, boxDepth, borderSize);
  });

  // 11. Multivision Grid Selector (2x2, 3x3, 1x1)
  const gridButtons = document.querySelectorAll('.btn-select[data-grid]');
  gridButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      gridButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeGrid = btn.getAttribute('data-grid');
      updateBezels();
    });
  });

  // 12. Bezel Toggle & Size Slider
  document.getElementById('toggle-bezels').addEventListener('change', () => {
    updateBezels();
  });
  document.getElementById('input-bezel-size').addEventListener('input', (e) => {
    bezelSize = parseInt(e.target.value);
    document.getElementById('val-bezel-size').textContent = bezelSize + 'px';
    updateBezels();
  });

  // 13. Physical Screen dimension sliders
  document.getElementById('input-screen-w').addEventListener('input', (e) => {
    screenW = parseFloat(e.target.value);
    document.getElementById('val-screen-w').textContent = screenW.toFixed(1) + 'm';
    
    // Lock aspect ratio to 16:9 for school multivision
    screenH = screenW * (9 / 16);
    document.getElementById('input-screen-h').value = screenH;
    document.getElementById('val-screen-h').textContent = screenH.toFixed(1) + 'm';
    
    contentManager.updateDimensions(screenW, screenH, boxDepth, borderSize);
    updateScreenHelpersSize();
  });

  document.getElementById('input-screen-h').addEventListener('input', (e) => {
    screenH = parseFloat(e.target.value);
    document.getElementById('val-screen-h').textContent = screenH.toFixed(1) + 'm';
    
    // Auto-scale width as well to keep proportions
    screenW = screenH * (16 / 9);
    document.getElementById('input-screen-w').value = screenW;
    document.getElementById('val-screen-w').textContent = screenW.toFixed(1) + 'm';
    
    contentManager.updateDimensions(screenW, screenH, boxDepth, borderSize);
    updateScreenHelpersSize();
  });

  // 14. Reset Sandbox Camera view
  document.getElementById('btn-reset-sandbox').addEventListener('click', () => {
    sandboxCamera.position.set(5, 4, 7);
    sandboxControls.target.set(0, 0, -boxDepth / 2);
    sandboxControls.update();
  });

  // 15. Mouse Pointer tracking logic
  document.addEventListener('mousemove', (e) => {
    if (controlMode !== 'mouse-track') return;

    // Map mouse normalized coordinates [-1, 1] relative to viewport
    const mx = (e.clientX / window.innerWidth) * 2 - 1;
    const my = -(e.clientY / window.innerHeight) * 2 + 1;

    // Interpolate to physical coordinates
    eyePos.x = mx * (screenW * 0.95);
    eyePos.y = my * (screenH * 0.9);
    
    updateUISliderValues();
  });

  // 16. Fullscreen toggle logic
  const fullscreenBtn = document.getElementById('btn-fullscreen');
  const panelIllusion = document.getElementById('panel-illusion');
  const exitOverlay = document.getElementById('fs-overlay');
  const closeOverlayBtn = document.getElementById('btn-close-overlay');

  const enterFullscreen = () => {
    if (panelIllusion.requestFullscreen) {
      panelIllusion.requestFullscreen();
    } else if (panelIllusion.webkitRequestFullscreen) {
      panelIllusion.webkitRequestFullscreen();
    }
  };

  fullscreenBtn.addEventListener('click', () => {
    enterFullscreen();
  });

  // Handle fullscreen state change
  const onFullscreenChange = () => {
    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (isFullscreen) {
      document.body.classList.add('fullscreen-active');
      exitOverlay.classList.add('active');
      
      // Resize canvases immediately
      resizeCanvases();
    } else {
      document.body.classList.remove('fullscreen-active');
      exitOverlay.classList.remove('active');
      resizeCanvases();
    }
  };

  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  closeOverlayBtn.addEventListener('click', () => {
    exitOverlay.classList.remove('active');
  });

  // 17. Window Resizing listener
  window.addEventListener('resize', () => {
    resizeCanvases();
  });
}

// Adjust helper geometries in sandbox when screen size changes
function updateScreenHelpersSize() {
  if (!screenPlaneHelper || !screenBorderHelper) return;

  // Dispose old
  screenPlaneHelper.geometry.dispose();
  screenBorderHelper.geometry.dispose();

  // Create new geometries
  const screenGeom = new THREE.PlaneGeometry(screenW, screenH);
  screenPlaneHelper.geometry = screenGeom;
  
  const edgeGeom = new THREE.EdgesGeometry(screenGeom);
  screenBorderHelper.geometry = edgeGeom;
}

// Resize render canvases to match current card container sizes
function resizeCanvases() {
  // Left Canvas
  const iw = illusionCanvas.parentElement.clientWidth;
  const ih = illusionCanvas.parentElement.clientHeight;
  illusionRenderer.setSize(iw, ih);
  illusionCamera.aspect = iw / ih;
  illusionCamera.updateProjectionMatrix();

  // Right Canvas
  const sw = sandboxCanvas.parentElement.clientWidth;
  const sh = sandboxCanvas.parentElement.clientHeight;
  sandboxRenderer.setSize(sw, sh);
  sandboxCamera.aspect = sw / sh;
  sandboxCamera.updateProjectionMatrix();
}

// Initialize on page load
window.addEventListener('load', () => {
  init();
  // Call once to settle canvas aspect ratios
  setTimeout(resizeCanvases, 100);
});
