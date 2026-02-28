import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import type { FPKeys } from "../hooks/useFPKeys";

const WALK_SPEED = 8; // m/s
const SPRINT_SPEED = 16; // m/s
const EYE_HEIGHT = 2.7; // meters
const JUMP_VELOCITY = 7; // m/s upward
const GRAVITY = -20; // m/s²

export class FirstPersonController {
  controls: PointerLockControls;
  private camera: THREE.PerspectiveCamera;
  private moveDir = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private velocityY = 0;
  private grounded = true;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.controls = new PointerLockControls(camera, domElement);
    camera.position.y = EYE_HEIGHT;
  }

  get isLocked(): boolean {
    return this.controls.isLocked;
  }

  lock() {
    this.controls.lock();
  }

  unlock() {
    this.controls.unlock();
  }

  update(delta: number, keys: FPKeys) {
    if (!this.controls.isLocked) return;

    const speed = keys.shift ? SPRINT_SPEED : WALK_SPEED;

    // Get camera forward direction projected onto XZ plane
    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();

    // Right vector
    this.right.crossVectors(this.forward, THREE.Object3D.DEFAULT_UP).normalize();

    this.moveDir.set(0, 0, 0);

    if (keys.w) this.moveDir.add(this.forward);
    if (keys.s) this.moveDir.sub(this.forward);
    if (keys.d) this.moveDir.add(this.right);
    if (keys.a) this.moveDir.sub(this.right);

    if (this.moveDir.lengthSq() > 0) {
      this.moveDir.normalize();
      this.camera.position.x += this.moveDir.x * speed * delta;
      this.camera.position.z += this.moveDir.z * speed * delta;
    }

    // Jump
    if (keys.space && this.grounded) {
      this.velocityY = JUMP_VELOCITY;
      this.grounded = false;
    }

    // Gravity
    this.velocityY += GRAVITY * delta;
    this.camera.position.y += this.velocityY * delta;

    // Ground clamp
    if (this.camera.position.y <= EYE_HEIGHT) {
      this.camera.position.y = EYE_HEIGHT;
      this.velocityY = 0;
      this.grounded = true;
    }
  }

  resolveCollisions(colliders: THREE.Box3[]) {
    const pos = this.camera.position;
    const playerRadius = 0.4;
    const playerMin = new THREE.Vector3(
      pos.x - playerRadius,
      0,
      pos.z - playerRadius
    );
    const playerMax = new THREE.Vector3(
      pos.x + playerRadius,
      EYE_HEIGHT + 0.3,
      pos.z + playerRadius
    );
    const playerBox = new THREE.Box3(playerMin, playerMax);

    for (const box of colliders) {
      if (!playerBox.intersectsBox(box)) continue;

      // Push player out of building AABB along smallest overlap axis
      const overlapX1 = box.max.x - playerMin.x;
      const overlapX2 = playerMax.x - box.min.x;
      const overlapZ1 = box.max.z - playerMin.z;
      const overlapZ2 = playerMax.z - box.min.z;

      const minOverlap = Math.min(overlapX1, overlapX2, overlapZ1, overlapZ2);

      if (minOverlap === overlapX1) pos.x += overlapX1;
      else if (minOverlap === overlapX2) pos.x -= overlapX2;
      else if (minOverlap === overlapZ1) pos.z += overlapZ1;
      else pos.z -= overlapZ2;
    }
  }

  clampToBounds(bounds: THREE.Box3) {
    const pos = this.camera.position;
    pos.x = Math.max(bounds.min.x + 1, Math.min(bounds.max.x - 1, pos.x));
    pos.z = Math.max(bounds.min.z + 1, Math.min(bounds.max.z - 1, pos.z));
  }

  dispose() {
    this.controls.dispose();
  }
}
