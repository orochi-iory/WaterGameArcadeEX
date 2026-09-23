import * as RAPIER from './rapier.mjs';

await RAPIER.init();

export class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(value) { return this.set(value.x, value.y, value.z); }
  clone() { return new Vec3(this.x, this.y, this.z); }
}

export class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  copy(value) { return this.set(value.x, value.y, value.z, value.w); }
  clone() { return new Quaternion(this.x, this.y, this.z, this.w); }
  setFromEuler(x, y, z, order = 'XYZ') {
    if (order !== 'XYZ') throw new Error(`Rapier physics adapter only supports XYZ Euler order, got ${order}`);
    const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
    const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
    this.x = s1 * c2 * c3 + c1 * s2 * s3;
    this.y = c1 * s2 * c3 - s1 * c2 * s3;
    this.z = c1 * c2 * s3 + s1 * s2 * c3;
    this.w = c1 * c2 * c3 - s1 * s2 * s3;
    return this;
  }
  vmult(vector, target = new Vec3()) {
    const qx = this.x, qy = this.y, qz = this.z, qw = this.w;
    const ix = qw * vector.x + qy * vector.z - qz * vector.y;
    const iy = qw * vector.y + qz * vector.x - qx * vector.z;
    const iz = qw * vector.z + qx * vector.y - qy * vector.x;
    const iw = -qx * vector.x - qy * vector.y - qz * vector.z;
    target.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    target.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    target.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return target;
  }
  mult(other, target = new Quaternion()) {
    target.x = this.w * other.x + this.x * other.w + this.y * other.z - this.z * other.y;
    target.y = this.w * other.y - this.x * other.z + this.y * other.w + this.z * other.x;
    target.z = this.w * other.z + this.x * other.y - this.y * other.x + this.z * other.w;
    target.w = this.w * other.w - this.x * other.x - this.y * other.y - this.z * other.z;
    return target;
  }
}

export class Sphere {
  constructor(radius) { this.kind = 'ball'; this.radius = radius; }
}

export class Box {
  constructor(halfExtents) { this.kind = 'cuboid'; this.halfExtents = halfExtents.clone(); }
}

export class Cylinder {
  constructor(radiusTop, radiusBottom, height, segments = 12) {
    this.kind = 'cylinder';
    this.radiusTop = radiusTop;
    this.radiusBottom = radiusBottom;
    this.radius = Math.max(radiusTop, radiusBottom);
    this.height = height;
    this.segments = segments;
  }
}

export class Material {
  constructor(name = '') { this.name = name; this.friction = .018; this.restitution = .34; }
}

function groups(group, mask) {
  return ((group & 0xffff) << 16) | (mask & 0xffff);
}

function rotationObject(quaternion) {
  return { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w };
}

const identityRotation = { x: 0, y: 0, z: 0, w: 1 };

export class Body {
  constructor(options = {}) {
    this._mass = options.mass || 0;
    this._isFixed = this._mass <= 0;
    this.material = options.material || null;
    this.position = new Vec3();
    this.velocity = new Vec3();
    this.angularVelocity = new Vec3();
    this.quaternion = new Quaternion();
    this.shapes = [];
    this.shapeOffsets = [];
    this._linearDamping = .01;
    this._angularDamping = .01;
    this._allowSleep = true;
    this._collisionFilterGroup = 1;
    this._collisionFilterMask = 0xffff;
    this._raw = null;
    this._world = null;
    this._inertiaRatio = { x: .0395, y: .073, z: .0395 };
  }

  get mass() { return this._mass; }
  set mass(value) {
    this._mass = value;
    if (this._raw && !this._isFixed) this._setMassProperties();
  }
  get linearDamping() { return this._linearDamping; }
  set linearDamping(value) { this._linearDamping = value; this._raw?.setLinearDamping(value); }
  get angularDamping() { return this._angularDamping; }
  set angularDamping(value) { this._angularDamping = value; this._raw?.setAngularDamping(value); }
  get allowSleep() { return this._allowSleep; }
  set allowSleep(value) { this._allowSleep = value; }
  get collisionFilterGroup() { return this._collisionFilterGroup; }
  set collisionFilterGroup(value) { this._collisionFilterGroup = value; }
  get collisionFilterMask() { return this._collisionFilterMask; }
  set collisionFilterMask(value) { this._collisionFilterMask = value; }

  addShape(shape, offset = new Vec3()) {
    this.shapes.push(shape);
    this.shapeOffsets.push(offset.clone());
    return shape;
  }

  setMassProperties() { this._setMassProperties(); }
  updateMassProperties() { this._setMassProperties(); }
  _setMassProperties() {
    if (!this._raw || this._isFixed) return;
    const mass = Math.max(.001, this._mass);
    this._raw.setAdditionalMassProperties(
      mass,
      { x: 0, y: 0, z: 0 },
      { x: mass * this._inertiaRatio.x, y: mass * this._inertiaRatio.y, z: mass * this._inertiaRatio.z },
      identityRotation,
      true
    );
  }

  applyForce(force, point = this.position) {
    if (!this._raw) return;
    this._raw.addForceAtPoint({ x: force.x, y: force.y, z: force.z }, { x: point.x, y: point.y, z: point.z }, true);
  }
  applyTorque(torque) {
    if (!this._raw) return;
    this._raw.addTorque({ x: torque.x, y: torque.y, z: torque.z }, true);
  }
  applyAngularImpulse(impulse) {
    if (!this._raw) return;
    this._raw.applyTorqueImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
    this.syncFromPhysics();
  }
  applyImpulse(impulse, point = this.position) {
    if (!this._raw) return;
    if (point) this._raw.applyImpulseAtPoint({ x: impulse.x, y: impulse.y, z: impulse.z }, { x: point.x, y: point.y, z: point.z }, true);
    else this._raw.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
    this.syncFromPhysics();
  }
  resetAppliedForces() {
    if (!this._raw || this._isFixed) return;
    this._raw.resetForces(false);
    this._raw.resetTorques(false);
  }
  wakeUp() { this._raw?.wakeUp(); }

  syncFromPhysics() {
    if (!this._raw) return;
    const position = this._raw.translation();
    const velocity = this._raw.linvel();
    const angularVelocity = this._raw.angvel();
    const rotation = this._raw.rotation();
    this.position.set(position.x, position.y, position.z);
    this.velocity.set(velocity.x, velocity.y, velocity.z);
    this.angularVelocity.set(angularVelocity.x, angularVelocity.y, angularVelocity.z);
    this.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  }

  syncFixedState() {
    if (!this._raw || !this._isFixed) return;
    this._raw.setTranslation({ x: this.position.x, y: this.position.y, z: this.position.z }, true);
    this._raw.setLinvel({ x: this.velocity.x, y: this.velocity.y, z: this.velocity.z }, true);
  }
}

function colliderDescriptor(shape, offset, material, collisionGroups) {
  let descriptor;
  if (shape.kind === 'ball') descriptor = RAPIER.ColliderDesc.ball(shape.radius);
  else if (shape.kind === 'cuboid') descriptor = RAPIER.ColliderDesc.cuboid(shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z);
  else if (shape.kind === 'cylinder') {
    // Preserve the tapered shaft as an actual Rapier convex hull,
    // rather than replacing the visible shaft with a larger straight tube.
    const vertices = new Float32Array(shape.segments * 2 * 3);
    for (let index = 0; index < shape.segments; index++) {
      const angle = index / shape.segments * Math.PI * 2;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const bottom = index * 3;
      const top = (shape.segments + index) * 3;
      vertices[bottom] = cos * shape.radiusBottom;
      vertices[bottom + 1] = -shape.height / 2;
      vertices[bottom + 2] = sin * shape.radiusBottom;
      vertices[top] = cos * shape.radiusTop;
      vertices[top + 1] = shape.height / 2;
      vertices[top + 2] = sin * shape.radiusTop;
    }
    descriptor = RAPIER.ColliderDesc.convexHull(vertices) || RAPIER.ColliderDesc.cylinder(shape.height / 2, shape.radius);
  }
  else throw new Error(`Unsupported Rapier collider shape: ${shape.kind}`);
  descriptor.setTranslation(offset.x, offset.y, offset.z);
  descriptor.setDensity(0);
  descriptor.setFriction(material?.friction ?? .018);
  descriptor.setRestitution(material?.restitution ?? .34);
  descriptor.setCollisionGroups(collisionGroups);
  // A microscopic contact skin keeps adjacent torus lobes separated without
  // changing the visible ring radius or introducing a positional correction.
  if (material?.name === 'ring' && shape.kind === 'ball') descriptor.setContactSkin(.0015);
  return descriptor;
}

export class World {
  constructor(options = {}) {
    const gravity = options.gravity || new Vec3(0, -9.81, 0);
    this._world = new RAPIER.World({ x: gravity.x, y: gravity.y, z: gravity.z });
    this._world.numInternalPgsIterations = 2;
    this._world.maxCcdSubsteps = 2;
    this.gravity = gravity;
    this.broadphase = { dirty: false };
    this.solver = { iterations: 8, tolerance: .0001 };
    this._bodies = new Set();
  }
  addBody(body) {
    const desc = body._isFixed
      ? RAPIER.RigidBodyDesc.fixed()
        .setTranslation(body.position.x, body.position.y, body.position.z)
        .setRotation(rotationObject(body.quaternion))
      : RAPIER.RigidBodyDesc.dynamic()
        .setAdditionalMassProperties(
          body.mass,
          { x: 0, y: 0, z: 0 },
          { x: body.mass * body._inertiaRatio.x, y: body.mass * body._inertiaRatio.y, z: body.mass * body._inertiaRatio.z },
          identityRotation
        )
        .setTranslation(body.position.x, body.position.y, body.position.z)
        .setRotation(rotationObject(body.quaternion))
        .setLinvel(body.velocity.x, body.velocity.y, body.velocity.z)
        .setAngvel({ x: body.angularVelocity.x, y: body.angularVelocity.y, z: body.angularVelocity.z });
    if (!body._isFixed) {
      desc.setLinearDamping(body._linearDamping).setAngularDamping(body._angularDamping).setCanSleep(body._allowSleep).setCcdEnabled(true).setSoftCcdPrediction(.08);
    }
    body._raw = this._world.createRigidBody(desc);
    body._world = this;
    const interactionGroups = groups(body.collisionFilterGroup, body.collisionFilterMask);
    for (let index = 0; index < body.shapes.length; index++) {
      const descriptor = colliderDescriptor(body.shapes[index], body.shapeOffsets[index], body.material, interactionGroups);
      this._world.createCollider(descriptor, body._raw);
    }
    body.syncFromPhysics();
    this._bodies.add(body);
    return body;
  }
  removeBody(body) {
    if (body._raw) this._world.removeRigidBody(body._raw);
    this._bodies.delete(body);
    body._raw = null;
  }
  step(dt) {
    this._world.timestep = dt;
    this.solver.iterations = Math.max(1, this.solver.iterations | 0);
    this._world.numSolverIterations = this.solver.iterations;
    // Only moving tank fixtures are synchronized from the scene. Dynamic rings
    // never receive a cached position, velocity, force, or torque: Rapier owns
    // their full state and integrates the direct API calls made this step.
    for (const body of this._bodies) body.syncFixedState();
    this._world.step();
    // Rapier keeps addForce/addTorque active until explicitly reset. The game
    // treats each call as a per-step impulse-like force, so clear the native
    // accumulators after this integration and before the next frame builds its
    // new force set.
    for (const body of this._bodies) {
      body.syncFromPhysics();
      body.resetAppliedForces();
    }
  }
}
