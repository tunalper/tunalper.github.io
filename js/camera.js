// Mirror of the shader camera so sprites land exactly on the procedural sea.
export class Camera {
  constructor() {
    this.w = 1; this.h = 1;
    this.x = 0; this.y = 4; this.z = 0;
    this.cp = 1; this.sp = 0; this.fov = 1;
  }

  update(S, w, h) {
    this.w = w; this.h = h;
    this.x = S.cam[0]; this.y = S.cam[1]; this.z = S.cam[2];
    this.cp = Math.cos(S.pitch); this.sp = Math.sin(S.pitch);
    this.fov = S.fov;
    this.pitch = S.pitch;
  }

  // world point -> screen pixel (row 0 = top). Returns false behind camera.
  project(x, y, z, o) {
    const dx = x - this.x, dy = y - this.y, dz = z - this.z;
    const yc = dy * this.cp + dz * this.sp;
    const zc = -dy * this.sp + dz * this.cp;
    if (zc < 0.08) return false;
    const k = (this.fov * this.h) / zc;
    o.x = dx * k + this.w * 0.5;
    o.y = this.h * 0.5 - yc * k;
    o.k = k;
    o.z = zc;
    return true;
  }

  // direction -> screen point at infinity (vanishing point)
  vanish(dx, dy, dz, o) {
    const yc = dy * this.cp + dz * this.sp;
    const zc = -dy * this.sp + dz * this.cp;
    if (zc < 1e-4) return false;
    const k = (this.fov * this.h) / zc;
    o.x = dx * k + this.w * 0.5;
    o.y = this.h * 0.5 - yc * k;
    return true;
  }

  // screen row of the horizon (may be off screen)
  horizon() {
    const t = Math.tan(Math.min(this.pitch, 1.5));
    return this.h * 0.5 - this.fov * t * this.h;
  }
}
