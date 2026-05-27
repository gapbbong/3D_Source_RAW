import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Cache for loaded assets
let loadedFont = null;
const fontUrl = 'https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_regular.typeface.json';

const robotUrl = 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/gltf/RobotExpressive/RobotExpressive.glb';
const flamingoUrl = 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/gltf/Flamingo.glb';

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
    
    this.activePreset = 'text'; // 'text' | 'crystal' | 'torus' | 'robot' | 'flamingo'
    this.neonColor = '#00f3ff';
    this.textValue = 'WELCOME';
    this.rotationSpeed = 1.0;
    
    // Animation properties
    this.mixer = null;
    this.mixers = [];             // List of mixers for multiple objects (e.g. flamingo flock)
    this.flamingoClones = [];     // List of cloned flamingo meshes
    this.flamingoCount = 3;       // Default number of flamingos in flock
    this.baseFlamingoModel = null;
    this.flamingoAnimations = [];
    
    this.loadedModel = null;
    this.modelAnimations = [];
    this.activeAnimationName = 'Jump'; // Default for robot
    
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
    // GLTF presets (robot, flamingo)
    else if (this.activePreset === 'robot' || this.activePreset === 'flamingo') {
      this.loadGLTFModel();
    }
  }

  // Load GLTF Model dynamically from Three.js CDN
  loadGLTFModel() {
    const loader = new GLTFLoader();
    const preset = this.activePreset;
    const url = preset === 'robot' ? robotUrl : flamingoUrl;

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
        
        if (preset === 'flamingo') {
          this.baseFlamingoModel = gltf.scene;
          this.flamingoAnimations = gltf.animations;
          this.recreateFlamingoFlock();
        } 
        else if (preset === 'robot') {
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

          // Scale robot to fit inside
          model.scale.set(0.3, 0.3, 0.3);
          
          // Position standing on the bottom floor of the chamber (slightly forward)
          const posY = -this.screenH / 2 + this.borderSize;
          model.position.set(0, posY, -this.boxDepth / 2);
          model.rotation.y = 0; // Face towards the viewer/front
          
          this.objectGroup.add(model);

          // Setup animations
          if (gltf.animations && gltf.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(model);
            this.mixer.timeScale = this.rotationSpeed;
            this.updateRobotAnimation(this.activeAnimationName);
          }
        }
      },
      undefined,
      (err) => {
        console.error(`Failed to load GLTF model: ${url}`, err);
        // Fallback
        this.clearObjects();
        this.activePreset = 'crystal';
        this.buildMeshPreset();
      }
    );
  }

  // Instantiates N flamingo models at staggered intervals
  recreateFlamingoFlock() {
    // Clear old clones and mixers
    this.mixers = [];
    this.flamingoClones = [];
    
    // Clear objectGroup children
    while(this.objectGroup.children.length > 0) {
      const obj = this.objectGroup.children[0];
      obj.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
      this.objectGroup.remove(obj);
    }

    if (!this.baseFlamingoModel || !this.flamingoAnimations || this.flamingoAnimations.length === 0) return;

    const N = this.flamingoCount;
    for (let i = 0; i < N; i++) {
      const clone = this.baseFlamingoModel.clone();
      
      // Scale
      clone.scale.set(0.004, 0.004, 0.004);
      
      // Enable shadows
      clone.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // Add to scene group
      this.objectGroup.add(clone);
      this.flamingoClones.push(clone);

      // Create a mixer for this specific clone
      const mixer = new THREE.AnimationMixer(clone);
      const action = mixer.clipAction(this.flamingoAnimations[0]);
      action.play();
      
      // Randomize animation play offsets so they don't flap wings in sync
      const clipDuration = this.flamingoAnimations[0].duration;
      mixer.update(Math.random() * clipDuration);
      mixer.timeScale = this.rotationSpeed;
      
      this.mixers.push(mixer);
    }
  }

  // Update flamingo count and rebuild flock
  updateFlamingoCount(count) {
    this.flamingoCount = count;
    if (this.activePreset === 'flamingo' && this.baseFlamingoModel) {
      this.recreateFlamingoFlock();
    }
  }

  // Update robot active animation clip
  updateRobotAnimation(animName) {
    this.activeAnimationName = animName;
    if (this.activePreset === 'robot' && this.loadedModel && this.mixer && this.modelAnimations.length > 0) {
      const clip = THREE.AnimationClip.findByName(this.modelAnimations, animName);
      if (clip) {
        this.mixer.stopAllAction();
        const action = this.mixer.clipAction(clip);
        action.play();
      }
    }
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
    this.baseFlamingoModel = null;
    this.flamingoAnimations = [];
    
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
    if (this.activePreset === 'robot' && this.loadedModel) {
      const posY = -h / 2 + border;
      this.loadedModel.position.set(0, posY, -depth / 2);
    } 
    else if (this.activePreset === 'flamingo' && this.baseFlamingoModel) {
      this.recreateFlamingoFlock();
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
      // Sync speed slider with mixer timescale dynamically
      this.mixer.timeScale = this.rotationSpeed;
      this.mixer.update(deltaTime);
    }
    
    if (this.mixers && this.mixers.length > 0) {
      this.mixers.forEach(m => {
        m.timeScale = this.rotationSpeed;
        m.update(deltaTime);
      });
    }

    // 2.5 Custom trajectory for Robot Jump (lunge forward out of screen!)
    if (this.activePreset === 'robot' && this.loadedModel) {
      const posY = -this.screenH / 2 + this.borderSize;
      const baseZ = -this.boxDepth / 2;
      let offsetZ = 0;

      if (this.mixer && this.activeAnimationName === 'Jump') {
        const clip = THREE.AnimationClip.findByName(this.modelAnimations, 'Jump');
        if (clip) {
          const action = this.mixer.existingAction(clip);
          if (action && action.isRunning()) {
            const timeInClip = action.time % clip.duration;
            const u = timeInClip / clip.duration;
            // Lunge forward Z-axis (towards screen)
            // Pops out by about 0.8 meters in front of Z=0 screen plane
            const maxLunge = this.boxDepth * 0.5 + 0.8;
            offsetZ = Math.sin(u * Math.PI) * maxLunge;
            
            // Tilt slightly forward to amplify landing/jumping effect
            this.loadedModel.rotation.x = -Math.sin(u * Math.PI) * 0.18;
          }
        }
      } else {
        this.loadedModel.rotation.x = 0;
      }
      this.loadedModel.position.set(0, posY, baseZ + offsetZ);
    }

    // 3. Custom trajectory for Flamingo Flock (fly forward out of screen!)
    if (this.activePreset === 'flamingo' && this.flamingoClones.length > 0) {
      const D = this.boxDepth;
      const N = this.flamingoClones.length;

      this.flamingoClones.forEach((clone, i) => {
        // Stagger flight cycle progress along Z-axis by adding offsets
        const offset = i / N;
        // Fly cycle: 0 to 1 loop, staggered
        const flyCycle = (time * 0.18 + offset) % 1.0; 
        
        // Z moves from deep inside (-D) to popping out (+1.2 meters)
        const startZ = -D;
        const endZ = 1.2; 
        clone.position.z = startZ + flyCycle * (endZ - startZ);
        
        // Staggered V-formation spread layout (horizontal)
        const horizontalSpread = (i - (N - 1) / 2) * (this.screenW * 0.16);
        clone.position.x = Math.sin(time * 1.0 + i * 2.0) * (this.screenW * 0.12) + horizontalSpread;
        
        // Vertical altitude staggering
        const verticalSpread = Math.sin(i * 3.14) * (this.screenH * 0.08);
        clone.position.y = Math.cos(time * 1.4 + i * 1.5) * (this.screenH * 0.12) + verticalSpread;
        
        // Point bird in direction of flight (heading forward towards screen/viewer)
        clone.rotation.y = Math.cos(time * 1.0 + i * 2.0) * 0.12;
        clone.rotation.x = Math.sin(time * 1.4 + i * 1.5) * 0.04;
        clone.rotation.z = Math.cos(time * 1.0 + i * 2.0) * 0.05;
      });
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
