import * as THREE from 'three';

/**
 * Updates a camera's projection matrix to perform off-axis (asymmetric) projection.
 * This makes the flat screen act as a physical window to the virtual 3D room.
 * 
 * @param {THREE.PerspectiveCamera} camera - The camera to modify
 * @param {THREE.Vector3} eyePos - The 3D position of the viewer's eye
 * @param {number} screenW - The physical width of the screen (in meters)
 * @param {number} screenH - The physical height of the screen (in meters)
 * @param {number} near - Near clipping plane distance
 * @param {number} far - Far clipping plane distance
 */
export function updateAsymmetricProjection(camera, eyePos, screenW, screenH, near, far) {
  // Prevent division by zero and handle viewer going through the screen plane
  const ze = Math.max(0.1, eyePos.z);
  const xe = eyePos.x;
  const ye = eyePos.y;

  // 1. Position the camera at the viewer's eye location
  camera.position.set(xe, ye, ze);

  // 2. Set camera rotation to identity (looking down -Z axis, parallel to screen normal)
  camera.rotation.set(0, 0, 0);

  // 3. Calculate screen boundaries relative to the eye position
  const leftEdge = -screenW / 2 - xe;
  const rightEdge = screenW / 2 - xe;
  const bottomEdge = -screenH / 2 - ye;
  const topEdge = screenH / 2 - ye;

  // 4. Project these screen boundaries onto the near clipping plane at distance 'near'
  const scale = near / ze;
  const L = leftEdge * scale;
  const R = rightEdge * scale;
  const B = bottomEdge * scale;
  const T = topEdge * scale;

  // 5. Apply the asymmetric frustum using Three.js projection matrix
  camera.projectionMatrix.makePerspective(L, R, T, B, near, far);
  
  // 6. Keep the inverse projection matrix up-to-date (required for shaders/raycasting)
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
