import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Cache for loaded assets
let loadedFont = null;
const fontUrl = 'https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_regular.typeface.json';

const trexUrl = 'https://raw.githubusercontent.com/code4fukui/glb-viewer/main/T-REX.glb';
const sharkUrl = 'https://models.babylonjs.com/shark.glb';
const astronautUrl = 'https://modelviewer.dev/shared-assets/models/Astronaut.glb';
const shibaUrl = 'https://raw.githubusercontent.com/Geo-Web-Project/webxr-experiments/main/shiba.glb';

// Dynamic Grid Texture Generator
function createGridTexture(lineColor, bgColor, density = 32) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 256, 256);
  
  // Outer Border
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 256, 256);
  
  // Grid Lines
  ctx.strokeStyle = lineColor + '33'; // Add transparency to inner grid lines
  ctx.lineWidth = 1.5;
  const step = 256 / (density / 4);
  for (let i = step; i < 256; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export class SceneContentManager {
  constructor(scene, screenW, screenH, boxDepth, borderSize) {
    this.scene = scene;
    this.screenW = screenW;
    this.screenH = screenH;
    this.boxDepth = boxDepth;
    this.borderSize = borderSize;
    
    this.activePreset = 'text'; // 'text' | 'trex' | 'shark' | 'astronaut' | 'shiba'
    this.neonColor = '#00f3ff';
    this.textValue = 'WELCOME';
    this.rotationSpeed = 1.0;
    this.sharkScale = 0.45;
    
    // Animation properties
    this.mixer = null;
    this.mixers = [];             // List of mixers for multiple objects
    this.loadedModel = null;
    this.modelAnimations = [];
    this.activeAnimationName = 'Run'; // Default for fox
    
    // Group for the room chamber
    this.roomGroup = new THREE.Group();
    this.scene.add(this.roomGroup);
    
    // Group for the floating 3D objects
    this.objectGroup = new THREE.Group();
    this.scene.add(this.objectGroup);
    
    // Group for particle effects
    this.particlesGroup = new THREE.Group();
    this.scene.add(this.particlesGroup);

    // Initial setups
    this.setupLights();
    this.buildRoom();
    this.buildParticles();
    this.loadFontAndCreateText();
  }

  setupLights() {
    // Ambient light for base details
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(this.ambientLight);

    // Main spotlight casting shadows on the back/floor
    this.spotLight = new THREE.SpotLight(0xffffff, 15);
    this.spotLight.position.set(0, 3, 2);
    this.spotLight.angle = Math.PI / 3;
    this.spotLight.penumbra = 0.8;
    this.spotLight.castShadow = true;
    this.spotLight.shadow.mapSize.width = 1024;
    this.spotLight.shadow.mapSize.height = 1024;
    this.spotLight.shadow.camera.near = 0.5;
    this.spotLight.shadow.camera.far = 10;
    this.spotLight.shadow.bias = -0.001;
    this.scene.add(this.spotLight);

    // Orbiting colorful accent light
    this.accentLight = new THREE.PointLight(this.neonColor, 8, 5);
    this.accentLight.position.set(0, 0, -1);
    this.scene.add(this.accentLight);
  }

  buildRoom() {
    // Clear old room geometries
    while(this.roomGroup.children.length > 0) { 
      const obj = this.roomGroup.children[0];
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach(m => m.dispose());
      } else {
        obj.material.dispose();
      }
      this.roomGroup.remove(obj); 
    }

    const W = this.screenW;
    const H = this.screenH;
    const D = this.boxDepth;
    const b = this.borderSize;

    // Inside dimensions of the room (excluding border margins)
    const roomW = W - 2 * b;
    const roomH = H - 2 * b;

    // Materials: Dark sci-fi style with grid patterns
    const wallGridTexture = createGridTexture(this.neonColor, '#0a0d14', 16);
    wallGridTexture.repeat.set(2, 2);
    const wallMaterial = new THREE.MeshStandardMaterial({
      map: wallGridTexture,
      roughness: 0.7,
      metalness: 0.2,
      side: THREE.DoubleSide
    });

    const floorGridTexture = createGridTexture(this.neonColor, '#07090d', 16);
    floorGridTexture.repeat.set(2, 2);
    const floorMaterial = new THREE.MeshStandardMaterial({
      map: floorGridTexture,
      roughness: 0.4,
      metalness: 0.5,
      side: THREE.DoubleSide
    });

    // 1. Back Wall (Z = -D)
    const backWallGeom = new THREE.PlaneGeometry(roomW, roomH);
    const backWall = new THREE.Mesh(backWallGeom, wallMaterial);
    backWall.position.set(0, 0, -D);
    backWall.receiveShadow = true;
    this.roomGroup.add(backWall);

    // 2. Left Wall (X = -W/2 + b)
    const leftWallGeom = new THREE.PlaneGeometry(D, roomH);
    const leftWall = new THREE.Mesh(leftWallGeom, wallMaterial);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-W/2 + b, 0, -D/2);
    leftWall.receiveShadow = true;
    this.roomGroup.add(leftWall);

    // 3. Right Wall (X = W/2 - b)
    const rightWallGeom = new THREE.PlaneGeometry(D, roomH);
    const rightWall = new THREE.Mesh(rightWallGeom, wallMaterial);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(W/2 - b, 0, -D/2);
    rightWall.receiveShadow = true;
    this.roomGroup.add(rightWall);

    // 4. Floor (Y = -H/2 + b)
    const floorGeom = new THREE.PlaneGeometry(roomW, D);
    const floor = new THREE.Mesh(floorGeom, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -H/2 + b, -D/2);
    floor.receiveShadow = true;
    this.roomGroup.add(floor);

    // 5. Ceiling (Y = H/2 - b)
    const ceilingGeom = new THREE.PlaneGeometry(roomW, D);
    const ceiling = new THREE.Mesh(ceilingGeom, wallMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, H/2 - b, -D/2);
    ceiling.receiveShadow = true;
    this.roomGroup.add(ceiling);

    // 6. Front Border Mask Frame (Z = 0)
    // Helps define the "window container". If 3D elements float in front of this, they look 3D.
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x07090c,
      roughness: 0.9,
      metalness: 0.1
    });

    // Top border
    const topB = new THREE.Mesh(new THREE.PlaneGeometry(W, b), frameMaterial);
    topB.position.set(0, H/2 - b/2, 0.005); // Offset slightly forward to prevent Z-fighting
    this.roomGroup.add(topB);

    // Bottom border
    const bottomB = new THREE.Mesh(new THREE.PlaneGeometry(W, b), frameMaterial);
    bottomB.position.set(0, -H/2 + b/2, 0.005);
    this.roomGroup.add(bottomB);

    // Left border
    const leftB = new THREE.Mesh(new THREE.PlaneGeometry(b, H - 2*b), frameMaterial);
    leftB.position.set(-W/2 + b/2, 0, 0.005);
    this.roomGroup.add(leftB);

    // Right border
    const rightB = new THREE.Mesh(new THREE.PlaneGeometry(b, H - 2*b), frameMaterial);
    rightB.position.set(W/2 - b/2, 0, 0.005);
    this.roomGroup.add(rightB);

    // Room Edge Outline (Glowing wireframe lines for neon highlights)
    const lineMat = new THREE.LineBasicMaterial({ color: this.neonColor, linewidth: 2 });
    
    // Front opening outline (just inside the border)
    const frontPoints = [
      new THREE.Vector3(-roomW/2, -roomH/2, 0),
      new THREE.Vector3(roomW/2, -roomH/2, 0),
      new THREE.Vector3(roomW/2, roomH/2, 0),
      new THREE.Vector3(-roomW/2, roomH/2, 0),
      new THREE.Vector3(-roomW/2, -roomH/2, 0)
    ];
    const frontLineGeom = new THREE.BufferGeometry().setFromPoints(frontPoints);
    const frontLine = new THREE.Line(frontLineGeom, lineMat);
    frontLine.position.z = 0.01; // offset forward
    this.roomGroup.add(frontLine);

    // Back opening outline
    const backPoints = [
      new THREE.Vector3(-roomW/2, -roomH/2, -D),
      new THREE.Vector3(roomW/2, -roomH/2, -D),
      new THREE.Vector3(roomW/2, roomH/2, -D),
      new THREE.Vector3(-roomW/2, roomH/2, -D),
      new THREE.Vector3(-roomW/2, -roomH/2, -D)
    ];
    const backLineGeom = new THREE.BufferGeometry().setFromPoints(backPoints);
    const backLine = new THREE.Line(backLineGeom, lineMat);
    this.roomGroup.add(backLine);

    // Connecting lines (corners)
    const corners = [
      [-roomW/2, -roomH/2],
      [roomW/2, -roomH/2],
      [roomW/2, roomH/2],
      [-roomW/2, roomH/2]
    ];
    corners.forEach(c => {
      const edgePoints = [
        new THREE.Vector3(c[0], c[1], 0),
        new THREE.Vector3(c[0], c[1], -D)
      ];
      const edgeGeom = new THREE.BufferGeometry().setFromPoints(edgePoints);
      const edgeLine = new THREE.Line(edgeGeom, lineMat);
      this.roomGroup.add(edgeLine);
    });
  }

  buildParticles() {
    // Clear old particles
    while(this.particlesGroup.children.length > 0) {
      const obj = this.particlesGroup.children[0];
      obj.geometry.dispose();
      obj.material.dispose();
      this.particlesGroup.remove(obj);
    }

    // Create floating neon dust inside the chamber box
    const particleCount = 120;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];

    const roomW = this.screenW - 2 * this.borderSize;
    const roomH = this.screenH - 2 * this.borderSize;
    const D = this.boxDepth;

    for (let i = 0; i < particleCount; i++) {
      // Allow particles to occasionally drift in front of the screen plane (up to Z = +0.6)
      positions[i * 3] = (Math.random() - 0.5) * roomW;
      positions[i * 3 + 1] = (Math.random() - 0.5) * roomH;
      positions[i * 3 + 2] = -Math.random() * D + 0.3; // Z bounds: -D to +0.3 (pop out!)

      velocities.push({
        x: (Math.random() - 0.5) * 0.05,
        y: (Math.random() - 0.5) * 0.05,
        z: Math.random() * 0.08 + 0.02 // drift forward
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Particle texture
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.3, this.neonColor);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 16);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.PointsMaterial({
      size: 0.15,
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particles = new THREE.Points(geometry, material);
    this.particlesGroup.add(particles);
    this.particleVelocities = velocities;
  }

  animateParticles(deltaTime) {
    if (!this.particlesGroup.children[0]) return;
    
    const pointsMesh = this.particlesGroup.children[0];
    const positions = pointsMesh.geometry.attributes.position.array;
    const count = positions.length / 3;

    const roomW = this.screenW - 2 * this.borderSize;
    const roomH = this.screenH - 2 * this.borderSize;
    const D = this.boxDepth;

    for (let i = 0; i < count; i++) {
      const vel = this.particleVelocities[i];
      
      // Update positions
      positions[i * 3] += vel.x * deltaTime;
      positions[i * 3 + 1] += vel.y * deltaTime;
      positions[i * 3 + 2] += vel.z * deltaTime;

      // Wrap around walls and depth
      // If particles exit front (Z > 0.6) or back (Z < -D), reset to back
      if (positions[i * 3 + 2] > 0.6) {
        positions[i * 3 + 2] = -D;
        positions[i * 3] = (Math.random() - 0.5) * roomW;
        positions[i * 3 + 1] = (Math.random() - 0.5) * roomH;
      }
      
      // Wrap X
      if (Math.abs(positions[i * 3]) > roomW / 2) {
        positions[i * 3] = -Math.sign(positions[i * 3]) * (roomW / 2);
      }
      // Wrap Y
      if (Math.abs(positions[i * 3 + 1]) > roomH / 2) {
        positions[i * 3 + 1] = -Math.sign(positions[i * 3 + 1]) * (roomH / 2);
      }
    }
    
    pointsMesh.geometry.attributes.position.needsUpdate = true;
  }

  clearObjects() {
    this.mixer = null;
    this.mixers = [];
    this.flamingoClones = [];
    this.loadedModel = null;
    this.modelAnimations = [];
    
    // Clear procedural variables
    this.proceduralGroup = null;
    this.proceduralHead = null;
    this.proceduralLegs = [];
    this.proceduralArmL = null;
    this.proceduralArmR = null;
    this.proceduralBlowpipe = null;
    this.proceduralBraidsL = [];
    this.proceduralBraidsR = [];
    this.proceduralFishbones = null;
    
    while(this.objectGroup.children.length > 0) {
      const obj = this.objectGroup.children[0];
      
      // Recursive dispose of geometries/materials inside hierarchy (important for GLTF models)
      obj.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      
      this.objectGroup.remove(obj);
    }
  }

  // Load and create 3D Text using CDN typeface font JSON
  loadFontAndCreateText() {
    this.clearObjects();

    if (this.activePreset !== 'text') {
      this.buildMeshPreset();
      return;
    }

    const materialText = new THREE.MeshStandardMaterial({
      color: this.neonColor,
      roughness: 0.1,
      metalness: 0.9,
      emissive: this.neonColor,
      emissiveIntensity: 0.4
    });

    const createTextMesh = (font) => {
      const textGeom = new TextGeometry(this.textValue, {
        font: font,
        size: 0.35,
        height: 0.15,
        curveSegments: 6,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.015,
        bevelOffset: 0,
        bevelSegments: 3
      });

      textGeom.computeBoundingBox();
      textGeom.center(); // Center the origin of the geometry

      const textMesh = new THREE.Mesh(textGeom, materialText);
      textMesh.castShadow = true;
      textMesh.receiveShadow = true;
      
      // Position slightly floating out (Z coordinate overlaps screen plane slightly)
      textMesh.position.set(0, 0, -this.boxDepth / 2 + 0.2);
      
      this.objectGroup.add(textMesh);
    };

    if (loadedFont) {
      createTextMesh(loadedFont);
    } else {
      const loader = new FontLoader();
      // Show a loading torus placeholder while font is fetched
      const tempGeom = new THREE.TorusGeometry(0.2, 0.05, 8, 24);
      const tempMesh = new THREE.Mesh(tempGeom, materialText);
      this.objectGroup.add(tempMesh);

      loader.load(fontUrl, 
        (font) => {
          loadedFont = font;
          this.clearObjects();
          if (this.activePreset === 'text') {
            createTextMesh(font);
          }
        },
        undefined,
        (err) => {
          console.error("Font failed to load. Falling back to geometric shape.", err);
          this.activePreset = 'crystal';
          this.buildMeshPreset();
        }
      );
    }
  }

  buildMeshPreset() {
    this.clearObjects();

    // Standard presets (crystal, torus)
    if (this.activePreset === 'crystal' || this.activePreset === 'torus') {
      const mat = new THREE.MeshStandardMaterial({
        color: this.neonColor,
        roughness: 0.2,
        metalness: 0.8,
        emissive: this.neonColor,
        emissiveIntensity: 0.3
      });

      if (this.activePreset === 'crystal') {
        const geom = new THREE.OctahedronGeometry(0.35, 0);
        const crystal = new THREE.Mesh(geom, mat);
        crystal.castShadow = true;
        crystal.receiveShadow = true;
        crystal.position.set(0, 0, -this.boxDepth / 2 + 0.2);

        const ringGeom = new THREE.TorusGeometry(0.55, 0.015, 8, 64);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.position.set(0, 0, -this.boxDepth / 2 + 0.2);
        ring.rotation.x = Math.PI / 3;
        
        this.objectGroup.add(crystal);
        this.objectGroup.add(ring);
      } 
      else if (this.activePreset === 'torus') {
        const geom = new THREE.TorusKnotGeometry(0.25, 0.08, 100, 16);
        const knot = new THREE.Mesh(geom, mat);
        knot.castShadow = true;
        knot.receiveShadow = true;
        knot.position.set(0, 0, -this.boxDepth / 2 + 0.2);
        this.objectGroup.add(knot);
      }
    } 
    // Preset selections
    if (this.activePreset === 'trex' || this.activePreset === 'shark' || this.activePreset === 'astronaut' || this.activePreset === 'shiba') {
      this.loadGLTFModel();
    } else if (['creeper', 'steve', 'chunsik', 'teemo', 'jinx'].includes(this.activePreset)) {
      this.buildProceduralPreset();
    }
  }

  // Load GLTF Model dynamically from Three.js CDN
  loadGLTFModel() {
    const loader = new GLTFLoader();
    const preset = this.activePreset;
    let url = trexUrl;
    if (preset === 'shark') url = sharkUrl;
    else if (preset === 'astronaut') url = astronautUrl;
    else if (preset === 'shiba') url = shibaUrl;

    // Show a loading torus placeholder
    const tempGeom = new THREE.TorusGeometry(0.25, 0.06, 8, 24);
    const tempMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
    const tempMesh = new THREE.Mesh(tempGeom, tempMat);
    this.objectGroup.add(tempMesh);

    loader.load(
      url,
      (gltf) => {
        // Double check that the user didn't switch presets while loading
        if (this.activePreset !== preset) {
          return;
        }
        
        this.clearObjects();
        const model = gltf.scene;
        this.loadedModel = model;
        this.modelAnimations = gltf.animations;

        // Traverse to enable shadows
        model.traverse(child => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        // Set scaling and default positions
        if (preset === 'trex') {
          model.scale.set(0.18, 0.18, 0.18);
          const posY = -this.screenH / 2 + this.borderSize;
          model.position.set(0, posY, -this.boxDepth / 2);
          model.rotation.y = 0; // Face front
        } 
        else if (preset === 'shark') {
          model.scale.set(this.sharkScale, this.sharkScale, this.sharkScale);
          model.position.set(0, 0, -this.boxDepth / 2);
          model.rotation.y = 0; // Swim forward
        }
        else if (preset === 'astronaut') {
          model.scale.set(0.4, 0.4, 0.4);
          model.position.set(0, 0, -this.boxDepth / 2);
          model.rotation.y = 0; // Face forward
        }
        else if (preset === 'shiba') {
          model.scale.set(1.2, 1.2, 1.2);
          const posY = -this.screenH / 2 + this.borderSize;
          model.position.set(0, posY, -this.boxDepth / 2);
          model.rotation.y = Math.PI; // Face forward (adjust if model is oriented backwards)
        }

        this.objectGroup.add(model);

        // Setup animations
        if (gltf.animations && gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(model);
          this.mixer.timeScale = this.rotationSpeed;
          
          if (preset === 'shiba') {
            this.updateShibaAnimation(this.activeAnimationName);
          } else {
            // Play first animation for trex and shark
            const action = this.mixer.clipAction(gltf.animations[0]);
            action.play();
          }
        }
      },
      undefined,
      (err) => {
        console.error(`Failed to load GLTF model: ${url}`, err);
        // Fallback
        this.clearObjects();
        this.activePreset = 'text';
        this.loadFontAndCreateText();
      }
    );
  }

  // Update shiba active animation clip
  updateShibaAnimation(animName) {
    this.activeAnimationName = animName;
    if (this.activePreset === 'shiba' && this.loadedModel && this.mixer && this.modelAnimations.length > 0) {
      let clip = THREE.AnimationClip.findByName(this.modelAnimations, animName);
      if (!clip) {
        clip = this.modelAnimations.find(a => a.name.toLowerCase().includes(animName.toLowerCase()));
      }
      if (!clip && this.modelAnimations.length > 0) {
        clip = this.modelAnimations[0];
      }
      if (clip) {
        this.mixer.stopAllAction();
        const action = this.mixer.clipAction(clip);
        action.play();
      }
    }
  }

  // Update shark scale dynamically
  updateSharkScale(newScale) {
    this.sharkScale = newScale;
    if (this.activePreset === 'shark' && this.loadedModel) {
      this.loadedModel.scale.set(newScale, newScale, newScale);
    }
  }

  // Update shark scale dynamically
  updateSharkScale(newScale) {
    this.sharkScale = newScale;
    if (this.activePreset === 'shark' && this.loadedModel) {
      this.loadedModel.scale.set(newScale, newScale, newScale);
    }
  }

  // Build procedural 3D model preset
  buildProceduralPreset() {
    this.clearObjects();
    
    this.proceduralGroup = new THREE.Group();
    const posY = -this.screenH / 2 + this.borderSize;
    this.proceduralGroup.position.set(0, posY, -this.boxDepth / 2);
    
    const preset = this.activePreset;
    
    if (preset === 'creeper') {
      this.createCreeperMesh();
    } else if (preset === 'steve') {
      this.createSteveMesh();
    } else if (preset === 'chunsik') {
      this.createChunsikMesh();
    } else if (preset === 'teemo') {
      this.createTeemoMesh();
    } else if (preset === 'jinx') {
      this.createJinxMesh();
    }
    
    this.objectGroup.add(this.proceduralGroup);
  }

  createCreeperMesh() {
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x388e3c, roughness: 0.8 });
    const darkGreenMat = new THREE.MeshStandardMaterial({ color: 0x1b5e20, roughness: 0.8 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    
    const headGeom = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    const head = new THREE.Mesh(headGeom, greenMat);
    head.position.y = 0.65;
    head.castShadow = true;
    this.proceduralGroup.add(head);
    this.proceduralHead = head;
    
    const eyeGeom = new THREE.BoxGeometry(0.08, 0.08, 0.02);
    const leftEye = new THREE.Mesh(eyeGeom, blackMat);
    leftEye.position.set(-0.09, 0.05, 0.176);
    head.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeom, blackMat);
    rightEye.position.set(0.09, 0.05, 0.176);
    head.add(rightEye);
    
    const mouthGeom = new THREE.BoxGeometry(0.14, 0.16, 0.02);
    const mouth = new THREE.Mesh(mouthGeom, blackMat);
    mouth.position.set(0, -0.08, 0.176);
    head.add(mouth);
    
    const bodyGeom = new THREE.BoxGeometry(0.26, 0.5, 0.18);
    const body = new THREE.Mesh(bodyGeom, darkGreenMat);
    body.position.y = 0.25;
    body.castShadow = true;
    this.proceduralGroup.add(body);
    
    const legGeom = new THREE.BoxGeometry(0.12, 0.24, 0.16);
    
    const legFL = new THREE.Mesh(legGeom, greenMat);
    legFL.position.set(-0.09, 0.12, 0.12);
    legFL.castShadow = true;
    this.proceduralGroup.add(legFL);
    
    const legFR = new THREE.Mesh(legGeom, greenMat);
    legFR.position.set(0.09, 0.12, 0.12);
    legFR.castShadow = true;
    this.proceduralGroup.add(legFR);
    
    const legBL = new THREE.Mesh(legGeom, greenMat);
    legBL.position.set(-0.09, 0.12, -0.12);
    legBL.castShadow = true;
    this.proceduralGroup.add(legBL);
    
    const legBR = new THREE.Mesh(legGeom, greenMat);
    legBR.position.set(0.09, 0.12, -0.12);
    legBR.castShadow = true;
    this.proceduralGroup.add(legBR);
    
    this.proceduralLegs = [legFL, legFR, legBL, legBR];
  }

  createSteveMesh() {
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xdbad88, roughness: 0.7 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x482b13, roughness: 0.8 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x00bcd4, roughness: 0.6 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x3f51b5, roughness: 0.6 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xb0bec5, metalness: 0.8, roughness: 0.2 });
    
    const headGeom = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const head = new THREE.Mesh(headGeom, skinMat);
    head.position.y = 0.68;
    head.castShadow = true;
    this.proceduralGroup.add(head);
    this.proceduralHead = head;
    
    const hairGeom = new THREE.BoxGeometry(0.32, 0.1, 0.32);
    const hair = new THREE.Mesh(hairGeom, hairMat);
    hair.position.y = 0.11;
    head.add(hair);
    
    const bodyGeom = new THREE.BoxGeometry(0.3, 0.44, 0.16);
    const body = new THREE.Mesh(bodyGeom, shirtMat);
    body.position.y = 0.32;
    body.castShadow = true;
    this.proceduralGroup.add(body);
    
    const legGeom = new THREE.BoxGeometry(0.14, 0.38, 0.16);
    const legL = new THREE.Mesh(legGeom, pantsMat);
    legL.position.set(-0.08, 0.19, 0);
    legL.castShadow = true;
    this.proceduralGroup.add(legL);
    
    const legR = new THREE.Mesh(legGeom, pantsMat);
    legR.position.set(0.08, 0.19, 0);
    legR.castShadow = true;
    this.proceduralGroup.add(legR);
    
    this.proceduralLegs = [legL, legR];
    
    const armGeom = new THREE.BoxGeometry(0.13, 0.44, 0.16);
    const armL = new THREE.Mesh(armGeom, skinMat);
    armL.position.set(-0.22, 0.32, 0);
    armL.castShadow = true;
    this.proceduralGroup.add(armL);
    this.proceduralArmL = armL;
    
    const armR = new THREE.Mesh(armGeom, skinMat);
    armR.position.set(0.22, 0.32, 0);
    armR.castShadow = true;
    this.proceduralGroup.add(armR);
    this.proceduralArmR = armR;
    
    const swordGroup = new THREE.Group();
    
    const bladeGeom = new THREE.BoxGeometry(0.04, 0.38, 0.04);
    const blade = new THREE.Mesh(bladeGeom, steelMat);
    blade.position.y = 0.22;
    blade.castShadow = true;
    swordGroup.add(blade);
    
    const guardGeom = new THREE.BoxGeometry(0.14, 0.04, 0.04);
    const guard = new THREE.Mesh(guardGeom, hairMat);
    guard.position.y = 0.04;
    swordGroup.add(guard);
    
    swordGroup.position.set(0, -0.15, 0.1);
    swordGroup.rotation.x = -Math.PI / 3;
    armR.add(swordGroup);
  }

  createChunsikMesh() {
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xffca28, roughness: 0.6 });
    const brownMat = new THREE.MeshStandardMaterial({ color: 0x795548, roughness: 0.7 });
    const pinkMat = new THREE.MeshStandardMaterial({ color: 0xff8a80, roughness: 0.6 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.9 });
    
    const headGeom = new THREE.SphereGeometry(0.2, 32, 32);
    const head = new THREE.Mesh(headGeom, yellowMat);
    head.scale.set(1.15, 0.95, 1.0);
    head.position.y = 0.58;
    head.castShadow = true;
    this.proceduralGroup.add(head);
    this.proceduralHead = head;
    
    const earGeom = new THREE.ConeGeometry(0.06, 0.09, 4);
    earGeom.rotateY(Math.PI / 4);
    
    const earL = new THREE.Mesh(earGeom, brownMat);
    earL.position.set(-0.13, 0.14, 0.05);
    earL.rotation.z = 0.25;
    head.add(earL);
    
    const earR = new THREE.Mesh(earGeom, brownMat);
    earR.position.set(0.13, 0.14, 0.05);
    earR.rotation.z = -0.25;
    head.add(earR);
    
    const eyeGeom = new THREE.SphereGeometry(0.016, 8, 8);
    const eyeL = new THREE.Mesh(eyeGeom, blackMat);
    eyeL.position.set(-0.06, 0.01, 0.17);
    head.add(eyeL);
    
    const eyeR = new THREE.Mesh(eyeGeom, blackMat);
    eyeR.position.set(0.06, 0.01, 0.17);
    head.add(eyeR);
    
    const cheekGeom = new THREE.SphereGeometry(0.035, 8, 8);
    cheekGeom.scale(1.0, 0.5, 1.0);
    
    const cheekL = new THREE.Mesh(cheekGeom, pinkMat);
    cheekL.position.set(-0.1, -0.06, 0.16);
    head.add(cheekL);
    
    const cheekR = new THREE.Mesh(cheekGeom, pinkMat);
    cheekR.position.set(0.1, -0.06, 0.16);
    head.add(cheekR);
    
    const mouthGroup = new THREE.Group();
    const mouthLineGeom = new THREE.BoxGeometry(0.035, 0.01, 0.01);
    const mouthL = new THREE.Mesh(mouthLineGeom, blackMat);
    mouthL.rotation.z = -0.3;
    mouthL.position.x = -0.015;
    const mouthR = new THREE.Mesh(mouthLineGeom, blackMat);
    mouthR.rotation.z = 0.3;
    mouthR.position.x = 0.015;
    mouthGroup.add(mouthL, mouthR);
    mouthGroup.position.set(0, -0.04, 0.185);
    head.add(mouthGroup);
    
    const bodyGeom = new THREE.SphereGeometry(0.18, 32, 32);
    const body = new THREE.Mesh(bodyGeom, yellowMat);
    body.position.y = 0.28;
    body.scale.set(1.0, 1.15, 1.0);
    body.castShadow = true;
    this.proceduralGroup.add(body);
    
    const limbGeom = new THREE.SphereGeometry(0.06, 16, 16);
    
    const armL = new THREE.Mesh(limbGeom, yellowMat);
    armL.position.set(-0.19, 0.32, 0.05);
    this.proceduralGroup.add(armL);
    this.proceduralArmL = armL;
    
    const armR = new THREE.Mesh(limbGeom, yellowMat);
    armR.position.set(0.19, 0.32, 0.05);
    this.proceduralGroup.add(armR);
    this.proceduralArmR = armR;
    
    const legL = new THREE.Mesh(limbGeom, yellowMat);
    legL.position.set(-0.11, 0.11, 0.05);
    this.proceduralGroup.add(legL);
    
    const legR = new THREE.Mesh(limbGeom, yellowMat);
    legR.position.set(0.11, 0.11, 0.05);
    this.proceduralGroup.add(legR);
    
    this.proceduralLegs = [legL, legR];
  }

  createTeemoMesh() {
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffe0b2, roughness: 0.6 });
    const greenHatMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.7 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.8 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.6 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd54f, metalness: 0.7, roughness: 0.2 });
    
    const headGeom = new THREE.SphereGeometry(0.19, 32, 32);
    const head = new THREE.Mesh(headGeom, skinMat);
    head.position.y = 0.52;
    head.castShadow = true;
    this.proceduralGroup.add(head);
    this.proceduralHead = head;
    
    const hatGeom = new THREE.ConeGeometry(0.23, 0.14, 16);
    const hat = new THREE.Mesh(hatGeom, greenHatMat);
    hat.position.y = 0.12;
    head.add(hat);
    
    const featherGeom = new THREE.BoxGeometry(0.015, 0.09, 0.03);
    const feather = new THREE.Mesh(featherGeom, redMat);
    feather.position.set(0, 0.11, -0.05);
    feather.rotation.x = -0.4;
    hat.add(feather);
    
    const goggleGeom = new THREE.SphereGeometry(0.045, 16, 16);
    goggleGeom.scale(1.0, 1.0, 0.3);
    
    const goggleL = new THREE.Mesh(goggleGeom, darkMat);
    goggleL.position.set(-0.08, 0.04, 0.18);
    goggleL.rotation.y = 0.2;
    head.add(goggleL);
    
    const goggleR = new THREE.Mesh(goggleGeom, darkMat);
    goggleR.position.set(0.08, 0.04, 0.18);
    goggleR.rotation.y = -0.2;
    head.add(goggleR);
    
    const strapGeom = new THREE.BoxGeometry(0.36, 0.02, 0.36);
    const strap = new THREE.Mesh(strapGeom, darkMat);
    strap.position.y = 0.04;
    head.add(strap);
    
    const eyeGeom = new THREE.BoxGeometry(0.04, 0.01, 0.01);
    const eyeL = new THREE.Mesh(eyeGeom, darkMat);
    eyeL.position.set(-0.06, -0.02, 0.165);
    eyeL.rotation.z = -0.15;
    head.add(eyeL);
    
    const eyeR = new THREE.Mesh(eyeGeom, darkMat);
    eyeR.position.set(0.06, -0.02, 0.165);
    eyeR.rotation.z = 0.15;
    head.add(eyeR);
    
    const bodyGeom = new THREE.SphereGeometry(0.16, 32, 32);
    const body = new THREE.Mesh(bodyGeom, darkMat);
    body.position.y = 0.26;
    body.scale.set(1.0, 1.1, 1.0);
    body.castShadow = true;
    this.proceduralGroup.add(body);
    
    const pipeGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.22, 8);
    pipeGeom.rotateX(Math.PI / 2);
    const pipe = new THREE.Mesh(pipeGeom, goldMat);
    pipe.position.set(0.12, 0.35, 0.18);
    pipe.rotation.y = -0.4;
    pipe.rotation.x = -0.2;
    pipe.castShadow = true;
    this.proceduralGroup.add(pipe);
    this.proceduralBlowpipe = pipe;
    
    const limbGeom = new THREE.SphereGeometry(0.05, 16, 16);
    const armL = new THREE.Mesh(limbGeom, skinMat);
    armL.position.set(-0.17, 0.29, 0.05);
    this.proceduralGroup.add(armL);
    
    const armR = new THREE.Mesh(limbGeom, skinMat);
    armR.position.set(0.17, 0.29, 0.05);
    this.proceduralGroup.add(armR);
    this.proceduralArmR = armR;
    
    const legL = new THREE.Mesh(limbGeom, darkMat);
    legL.position.set(-0.09, 0.1, 0.04);
    this.proceduralGroup.add(legL);
    
    const legR = new THREE.Mesh(limbGeom, darkMat);
    legR.position.set(0.09, 0.1, 0.04);
    this.proceduralGroup.add(legR);
    
    this.proceduralLegs = [legL, legR];
  }

  createJinxMesh() {
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xfff0e6, roughness: 0.6 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x00b0ff, roughness: 0.6 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.8 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x78909c, metalness: 0.8, roughness: 0.2 });
    const pinkMat = new THREE.MeshStandardMaterial({ color: 0xe91e63, roughness: 0.5 });
    
    const headGeom = new THREE.SphereGeometry(0.17, 32, 32);
    const head = new THREE.Mesh(headGeom, skinMat);
    head.position.y = 0.58;
    head.castShadow = true;
    this.proceduralGroup.add(head);
    this.proceduralHead = head;
    
    const eyeGeom = new THREE.SphereGeometry(0.016, 8, 8);
    const eyeL = new THREE.Mesh(eyeGeom, pinkMat);
    eyeL.position.set(-0.055, 0.01, 0.145);
    head.add(eyeL);
    
    const eyeR = new THREE.Mesh(eyeGeom, pinkMat);
    eyeR.position.set(0.055, 0.01, 0.145);
    head.add(eyeR);
    
    const hairCapGeom = new THREE.SphereGeometry(0.18, 16, 16);
    hairCapGeom.scale(1.02, 1.02, 1.02);
    const hairCap = new THREE.Mesh(hairCapGeom, hairMat);
    hairCap.position.set(0, 0.02, -0.01);
    head.add(hairCap);
    
    this.proceduralBraidsL = [];
    this.proceduralBraidsR = [];
    
    let lastBraidL = head;
    let lastBraidR = head;
    
    const braidSegmentGeom = new THREE.SphereGeometry(0.038, 8, 8);
    
    for (let i = 0; i < 8; i++) {
      const segment = new THREE.Mesh(braidSegmentGeom, hairMat);
      segment.castShadow = true;
      if (i === 0) {
        segment.position.set(-0.14, -0.06, -0.05);
      } else {
        segment.position.set(0, -0.07, -0.01);
      }
      lastBraidL.add(segment);
      this.proceduralBraidsL.push(segment);
      lastBraidL = segment;
    }
    
    for (let i = 0; i < 8; i++) {
      const segment = new THREE.Mesh(braidSegmentGeom, hairMat);
      segment.castShadow = true;
      if (i === 0) {
        segment.position.set(0.14, -0.06, -0.05);
      } else {
        segment.position.set(0, -0.07, -0.01);
      }
      lastBraidR.add(segment);
      this.proceduralBraidsR.push(segment);
      lastBraidR = segment;
    }
    
    const bodyGeom = new THREE.CylinderGeometry(0.09, 0.07, 0.35, 16);
    const body = new THREE.Mesh(bodyGeom, darkMat);
    body.position.y = 0.32;
    body.castShadow = true;
    this.proceduralGroup.add(body);
    
    const fishbonesGroup = new THREE.Group();
    
    const tubeGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.32, 12);
    tubeGeom.rotateX(Math.PI / 2);
    const mainTube = new THREE.Mesh(tubeGeom, steelMat);
    mainTube.castShadow = true;
    fishbonesGroup.add(mainTube);
    
    const jawGeom = new THREE.ConeGeometry(0.082, 0.12, 12);
    jawGeom.rotateX(Math.PI / 2);
    const jaw = new THREE.Mesh(jawGeom, darkMat);
    jaw.position.set(0, 0.02, 0.18);
    fishbonesGroup.add(jaw);
    
    fishbonesGroup.position.set(0.18, 0.44, 0.1);
    fishbonesGroup.rotation.y = -0.2;
    this.proceduralGroup.add(fishbonesGroup);
    this.proceduralFishbones = fishbonesGroup;
    
    const limbGeom = new THREE.SphereGeometry(0.045, 16, 16);
    const armL = new THREE.Mesh(limbGeom, skinMat);
    armL.position.set(-0.15, 0.35, 0.02);
    this.proceduralGroup.add(armL);
    
    const armR = new THREE.Mesh(limbGeom, skinMat);
    armR.position.set(0.15, 0.35, 0.02);
    this.proceduralGroup.add(armR);
    
    const legL = new THREE.Mesh(limbGeom, darkMat);
    legL.position.set(-0.07, 0.1, 0.02);
    this.proceduralGroup.add(legL);
    
    const legR = new THREE.Mesh(limbGeom, darkMat);
    legR.position.set(0.07, 0.1, 0.02);
    this.proceduralGroup.add(legR);
    
    this.proceduralLegs = [legL, legR];
  }

  // Update object properties dynamically
  updateText(newText) {
    this.textValue = newText.toUpperCase();
    if (this.activePreset === 'text') {
      this.loadFontAndCreateText();
    }
  }

  updateColor(hexColor) {
    this.neonColor = hexColor;
    
    // Update ambient/spot/accent colors
    this.accentLight.color.set(hexColor);
    
    // Rebuild room to update the grid colors
    this.buildRoom();
    this.buildParticles();

    // Update object materials (only for simple geometries)
    if (this.activePreset === 'text' || this.activePreset === 'crystal' || this.activePreset === 'torus') {
      this.objectGroup.children.forEach(mesh => {
        if (mesh.material) {
          mesh.material.color.set(hexColor);
          if (mesh.material.emissive) {
            mesh.material.emissive.set(hexColor);
          }
        }
      });
    }
  }

  updatePreset(presetName) {
    this.activePreset = presetName;
    this.clearObjects();
    
    if (presetName === 'text') {
      this.loadFontAndCreateText();
    } else {
      this.buildMeshPreset();
    }
  }

  updateDimensions(w, h, depth, border) {
    this.screenW = w;
    this.screenH = h;
    this.boxDepth = depth;
    this.borderSize = border;
    
    this.buildRoom();
    this.buildParticles();
    
    // Re-adjust model coordinates based on new dimensions
    if (this.loadedModel) {
      const preset = this.activePreset;
      if (preset === 'trex' || preset === 'shiba') {
        const posY = -h / 2 + border;
        this.loadedModel.position.set(0, posY, -depth / 2);
      } 
      else if (preset === 'shark' || preset === 'astronaut') {
        this.loadedModel.position.set(0, 0, -depth / 2);
      }
    }
    else if (this.proceduralGroup) {
      const posY = -h / 2 + border;
      this.proceduralGroup.position.set(0, posY, -depth / 2);
    }
    else if (this.objectGroup.children[0]) {
      this.objectGroup.children.forEach(obj => {
        obj.position.z = -depth / 2 + 0.2;
      });
    }
  }

  tick(time, deltaTime) {
    // 1. Animate orbiting accent light
    const radius = this.screenW * 0.35;
    this.accentLight.position.x = Math.sin(time * 1.5) * radius;
    this.accentLight.position.y = Math.cos(time * 1.1) * (this.screenH * 0.3);
    this.accentLight.position.z = -this.boxDepth / 2 + Math.sin(time * 0.8) * (this.boxDepth * 0.3);

    // 2. Update Animation Mixers (for GLTF models)
    if (this.mixer) {
      this.mixer.timeScale = this.rotationSpeed;
      this.mixer.update(deltaTime);
    }

    // 2.5 Custom trajectories for Pop-Out elements in tick loop
    if (this.loadedModel) {
      const preset = this.activePreset;
      const D = this.boxDepth;
      
      // A. T-Rex Lunge forward
      if (preset === 'trex') {
        const posY = -this.screenH / 2 + this.borderSize;
        const baseZ = -D / 2;
        // Lunge movement
        const lunge = Math.sin(time * 0.7) * (D * 0.25 + 0.35); // Moves forward/back
        this.loadedModel.position.set(0, posY, baseZ + lunge);
        
        // Tilt slightly forward during lunge
        this.loadedModel.rotation.x = -Math.max(0, lunge) * 0.12;
        // Minor head wave
        this.loadedModel.rotation.y = Math.sin(time * 1.2) * 0.08;
      } 
      // B. Shark swimming and lunging forward
      else if (preset === 'shark') {
        const swimCycle = (time * 0.18) % 1.0; 
        const startZ = -D;
        const endZ = 1.1; // Pops out in front
        this.loadedModel.position.z = startZ + swimCycle * (endZ - startZ);
        
        // Staggered swim wave
        this.loadedModel.position.x = Math.sin(time * 1.2) * (this.screenW * 0.22);
        this.loadedModel.position.y = Math.cos(time * 1.5) * (this.screenH * 0.15);
        
        // Align rotation to swim direction
        this.loadedModel.rotation.y = Math.cos(time * 1.2) * 0.15;
        this.loadedModel.rotation.x = Math.sin(time * 1.5) * 0.04;
        this.loadedModel.rotation.z = Math.cos(time * 1.2) * 0.08; // banking roll
      }
      // C. Astronaut floating slowly in zero gravity
      else if (preset === 'astronaut') {
        this.loadedModel.position.x = Math.sin(time * 0.4) * (this.screenW * 0.24);
        this.loadedModel.position.y = Math.cos(time * 0.5) * (this.screenH * 0.18);
        
        const floatCycle = Math.sin(time * 0.3);
        const startZ = -D / 2;
        this.loadedModel.position.z = startZ + floatCycle * (D * 0.4 + 0.6); // drifts forward
        
        // Slowly tumble
        this.loadedModel.rotation.x = time * 0.15;
        this.loadedModel.rotation.y = time * 0.2;
        this.loadedModel.rotation.z = time * 0.08;
      }
      // D. Shiba running, leaping and playing forward (pop out!)
      else if (preset === 'shiba') {
        const leapCycle = (time * 0.28) % 1.0;
        const startZ = -D * 0.8;
        const endZ = 1.2;
        this.loadedModel.position.z = startZ + leapCycle * (endZ - startZ);
        this.loadedModel.position.x = Math.sin(time * 1.6) * (this.screenW * 0.18);
        
        const leapHeight = Math.sin(leapCycle * Math.PI) * 0.45;
        const posY = -this.screenH / 2 + this.borderSize;
        this.loadedModel.position.y = posY + leapHeight;
        
        this.loadedModel.rotation.y = Math.PI + Math.sin(time * 1.6) * 0.2;
        this.loadedModel.rotation.x = -Math.sin(leapCycle * Math.PI) * 0.3;
        this.loadedModel.rotation.z = Math.cos(time * 2.0) * 0.1;
      }
      else if (this.proceduralGroup) {
        const preset = this.activePreset;
        const D = this.boxDepth;
        
        // Creeper Animation
        if (preset === 'creeper') {
          const cycle = (time * 0.16) % 1.0;
          const startZ = -D * 0.8;
          const endZ = 1.1;
          
          this.proceduralGroup.position.z = startZ + cycle * (endZ - startZ);
          this.proceduralGroup.position.x = Math.sin(time * 0.8) * (this.screenW * 0.1);
          
          if (this.proceduralLegs && this.proceduralLegs.length === 4) {
            const swing = Math.sin(time * 10 * this.rotationSpeed) * 0.45;
            this.proceduralLegs[0].rotation.x = swing;
            this.proceduralLegs[1].rotation.x = -swing;
            this.proceduralLegs[2].rotation.x = -swing;
            this.proceduralLegs[3].rotation.x = swing;
          }
          
          const head = this.proceduralHead;
          if (head) {
            if (cycle > 0.72) {
              const swell = 1.0 + (cycle - 0.72) * 1.3;
              this.proceduralGroup.scale.set(swell, swell, swell);
              head.material.emissive.set(0xff0000);
              head.material.emissiveIntensity = Math.sin(time * 25) * 0.8 + 0.8;
            } else {
              this.proceduralGroup.scale.set(1.0, 1.0, 1.0);
              head.material.emissive.set(0x000000);
              head.material.emissiveIntensity = 0;
            }
          }
        }
        // Steve Animation
        else if (preset === 'steve') {
          const cycle = (time * 0.22) % 1.0;
          const startZ = -D * 0.8;
          const endZ = 1.0;
          
          this.proceduralGroup.position.z = startZ + cycle * (endZ - startZ);
          this.proceduralGroup.position.x = -Math.sin(time * 1.2) * (this.screenW * 0.08);
          
          if (this.proceduralLegs && this.proceduralLegs.length === 2) {
            const swing = Math.sin(time * 12 * this.rotationSpeed) * 0.5;
            this.proceduralLegs[0].rotation.x = swing;
            this.proceduralLegs[1].rotation.x = -swing;
          }
          
          const armR = this.proceduralArmR;
          const armL = this.proceduralArmL;
          if (armR && armL) {
            if (cycle > 0.65) {
              armR.rotation.x = -Math.PI / 2 - Math.sin((cycle - 0.65) * Math.PI * 3.0) * 0.9;
              armR.rotation.z = -0.3;
            } else {
              const armSwing = Math.sin(time * 12 * this.rotationSpeed) * 0.4;
              armR.rotation.x = -armSwing;
              armR.rotation.z = 0;
              armL.rotation.x = armSwing;
            }
          }
        }
        // Chunsik Animation
        else if (preset === 'chunsik') {
          const cycle = (time * 0.25) % 1.0;
          const startZ = -D * 0.8;
          const endZ = 1.1;
          
          this.proceduralGroup.position.z = startZ + cycle * (endZ - startZ);
          this.proceduralGroup.position.x = Math.sin(time * 1.0) * (this.screenW * 0.12);
          
          const jumpHeight = Math.sin(cycle * Math.PI) * 0.42;
          this.proceduralGroup.position.y = (-this.screenH / 2 + this.borderSize) + jumpHeight;
          this.proceduralGroup.rotation.x = cycle * Math.PI * 2;
          this.proceduralGroup.rotation.y = Math.sin(time * 2.0) * 0.15;
          
          const armR = this.proceduralArmR;
          const armL = this.proceduralArmL;
          if (armR && armL) {
            const wave = Math.sin(time * 15 * this.rotationSpeed) * 0.25;
            armR.rotation.z = 0.5 + wave;
            armL.rotation.z = -0.5 - wave;
          }
        }
        // Teemo Animation
        else if (preset === 'teemo') {
          const cycle = (time * 0.2) % 1.0;
          const startZ = -D * 0.8;
          const endZ = 0.9;
          
          this.proceduralGroup.position.z = startZ + cycle * (endZ - startZ);
          this.proceduralGroup.position.x = Math.sin(time * 1.5) * (this.screenW * 0.08);
          
          if (this.proceduralLegs && this.proceduralLegs.length === 2) {
            const swing = Math.sin(time * 10 * this.rotationSpeed) * 0.4;
            this.proceduralLegs[0].rotation.x = swing;
            this.proceduralLegs[1].rotation.x = -swing;
          }
          
          const pipe = this.proceduralBlowpipe;
          const armR = this.proceduralArmR;
          if (pipe && armR) {
            if (cycle > 0.6) {
              pipe.position.set(0.04, 0.5, 0.19);
              pipe.rotation.y = -0.1;
              pipe.rotation.x = -0.05;
              armR.rotation.x = -Math.PI / 3;
              pipe.position.z = 0.19 + (cycle - 0.6) * 0.5;
            } else {
              pipe.position.set(0.12, 0.35, 0.18);
              pipe.rotation.y = -0.4;
              pipe.rotation.x = -0.2;
              armR.rotation.x = 0;
            }
          }
        }
        // Jinx Animation
        else if (preset === 'jinx') {
          const cycle = (time * 0.18) % 1.0;
          const startZ = -D * 0.7;
          const endZ = 0.8;
          
          this.proceduralGroup.position.z = startZ + cycle * (endZ - startZ);
          this.proceduralGroup.position.x = -Math.cos(time * 1.2) * (this.screenW * 0.06);
          
          const waveFreq = 8.0;
          if (this.proceduralBraidsL && this.proceduralBraidsL.length > 0) {
            this.proceduralBraidsL.forEach((seg, idx) => {
              seg.rotation.z = Math.sin(time * waveFreq + idx) * 0.18;
              seg.rotation.x = Math.cos(time * waveFreq + idx) * 0.1;
            });
          }
          if (this.proceduralBraidsR && this.proceduralBraidsR.length > 0) {
            this.proceduralBraidsR.forEach((seg, idx) => {
              seg.rotation.z = -Math.sin(time * waveFreq + idx) * 0.18;
              seg.rotation.x = Math.cos(time * waveFreq + idx) * 0.1;
            });
          }
          
          const launcher = this.proceduralFishbones;
          if (launcher) {
            if (cycle > 0.6) {
              const recoil = Math.sin((cycle - 0.6) * 60) * 0.04;
              launcher.position.z = 0.1 - recoil;
              launcher.rotation.x = -0.15 + Math.abs(recoil) * 2;
            } else {
              launcher.position.z = 0.1;
              launcher.rotation.x = -0.15;
            }
          }
        }
      }
    }
    // Simple rotation animations for geometric shapes
    else if (this.objectGroup.children[0] && (this.activePreset === 'crystal' || this.activePreset === 'torus' || this.activePreset === 'text')) {
      const mainObj = this.objectGroup.children[0];
      const speedFactor = this.rotationSpeed;
      
      mainObj.rotation.x = time * 0.5 * speedFactor;
      mainObj.rotation.y = time * 0.6 * speedFactor;
      
      const baseZ = -this.boxDepth / 2 + 0.2;
      mainObj.position.y = Math.sin(time * 2.0) * 0.1;
      mainObj.position.z = baseZ + Math.sin(time * 1.2) * (this.boxDepth * 0.3 + 0.1);
      
      if (this.objectGroup.children[1]) {
        const ringObj = this.objectGroup.children[1];
        ringObj.position.y = mainObj.position.y;
        ringObj.position.z = mainObj.position.z;
        ringObj.rotation.z = -time * 0.8 * speedFactor;
      }
    }

    // 4. Animate background dust particles
    this.animateParticles(deltaTime);
  }
}
