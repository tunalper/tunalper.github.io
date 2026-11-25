// Two-pass WebGL renderer: procedural world -> low-res target -> post/palette.
import { VERT, WORLD, POST, MESH_VS, MESH_FS } from './shaders.js';
import { GL_PALETTE } from './palette.js';

export class Renderer {
  constructor(canvas, { preserve = false } = {}) {
    const opts = {
      antialias: false, alpha: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: preserve,
      powerPreference: 'high-performance', desynchronized: false,
    };
    const gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
    if (!gl) throw new Error('webgl-unavailable');
    this.gl = gl;
    this.canvas = canvas;
    this.lost = false;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.init(); this.lost = false; if (this.w) this.resize(this.w, this.h); });
    this.init();
  }

  init() {
    const gl = this.gl;
    this.tri = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tri);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.world = this.program(VERT, WORLD);
    this.post = this.program(VERT, POST);
    this.texW = this.texture();
    this.texF = this.texture();
    this.texScene = this.texture();
    this.texW2 = this.texture();
    this.texM = this.texture();
    this.fbo = gl.createFramebuffer();
    // the 3D pass (Scylla): its own target with a depth buffer
    this.mesh = this.program(MESH_VS, MESH_FS, ['aPos', 'aNrm', 'aCol']);
    this.mfbo = gl.createFramebuffer();
    this.mdepth = gl.createRenderbuffer();
    this.vbo = gl.createBuffer();
    this.ibo = gl.createBuffer();
    this.iboKey = null;
    this.vboSize = 0;
  }

  program(vs, fs, attrs = ['aPos']) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  texture() {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  resize(w, h) {
    const gl = this.gl;
    this.w = w; this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    for (const t of [this.texW, this.texF, this.texScene, this.texW2, this.texM]) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texScene, 0);
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.mdepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.mfbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texM, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.mdepth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // geometry: interleaved [x y z  nx ny nz  r g b emissive], static index list
  drawMesh(S, M) {
    const gl = this.gl;
    const P = this.mesh;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.mfbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.useProgram(P.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const bytes = M.vcount * 40;
    if (bytes > this.vboSize) { gl.bufferData(gl.ARRAY_BUFFER, M.verts.byteLength, gl.DYNAMIC_DRAW); this.vboSize = M.verts.byteLength; }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, M.verts.subarray(0, M.vcount * 10));
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    if (this.iboKey !== M.indexKey) { gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, M.index, gl.STATIC_DRAW); this.iboKey = M.indexKey; }
    gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24);
    const u = P.u;
    gl.uniform3f(u.uCam, S.cam[0], S.cam[1], S.cam[2]);
    gl.uniform1f(u.uPitch, S.pitch);
    gl.uniform1f(u.uFov, S.fov);
    gl.uniform1f(u.uAspect, this.w / this.h);
    gl.uniform3f(u.uKey, S.moonDir[0], S.moonDir[1], S.moonDir[2]);
    gl.uniform3f(u.uSky, 0.38, 0.82, -0.42);
    gl.uniform1f(u.uFlash, S.flash[1]);
    gl.drawElements(gl.TRIANGLES, M.icount, gl.UNSIGNED_SHORT, 0);
    gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
    gl.disable(gl.DEPTH_TEST);
  }

  upload(tex, pb) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, pb.w, pb.h, gl.RGBA, gl.UNSIGNED_BYTE, pb.data);
  }

  render(S, layerW, layerF, layerW2, mesh) {
    if (this.lost) return;
    const gl = this.gl;
    const meshOn = !!(mesh && mesh.icount > 0);
    if (meshOn) this.drawMesh(S, mesh);
    if (layerW2 && (layerW2.used || layerW2.dirty)) this.upload(this.texW2, layerW2);
    // an empty layer is uploaded once (to clear it) and then left alone
    if (layerW.used || layerW.dirty) this.upload(this.texW, layerW);
    if (layerF.used || layerF.dirty) this.upload(this.texF, layerF);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.tri);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // pass 1: world
    const W = this.world;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(W.p);
    const u = W.u;
    gl.uniform2f(u.uRes, this.w, this.h);
    gl.uniform1f(u.uTime, S.time);
    gl.uniform3f(u.uCam, S.cam[0], S.cam[1], S.cam[2]);
    gl.uniform1f(u.uPitch, S.pitch);
    gl.uniform1f(u.uFov, S.fov);
    gl.uniform3f(u.uWhirl, S.whirl[0], S.whirl[1], S.whirl[2]);
    gl.uniform1f(u.uSpin, S.spin);
    gl.uniform1f(u.uWorld, S.world);
    gl.uniform1f(u.uStorm, S.storm);
    gl.uniform1f(u.uMoon, S.moon);
    gl.uniform3f(u.uMoonDir, S.moonDir[0], S.moonDir[1], S.moonDir[2]);
    gl.uniform4f(u.uFlash, S.flash[0], S.flash[1], 0, 0);
    gl.uniform4f(u.uMouse, S.mouse[0], S.mouse[1], S.mouse[2], S.mouse[3]);
    gl.uniform4f(u.uCore, S.core[0], S.core[1], S.core[2], S.core[3]);
    gl.uniform1f(u.uDeep, S.deep);
    gl.uniform1f(u.uAbyss, S.abyss);
    gl.uniform1f(u.uRadar, S.radar);
    gl.uniform1f(u.uGrid, S.grid);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texW); gl.uniform1i(u.uW, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texF); gl.uniform1i(u.uF, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.texM); gl.uniform1i(u.uM, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.texW2); gl.uniform1i(u.uW2, 3);
    gl.uniform1f(u.uMeshOn, meshOn ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // pass 2: tear, split, quantise to the palette
    const P = this.post;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(P.p);
    const v = P.u;
    gl.uniform2f(v.uRes, this.w, this.h);
    gl.uniform1f(v.uTime, S.time);
    gl.uniform1f(v.uGlitch, S.glitch);
    gl.uniform1f(v.uSplit, S.split);
    gl.uniform1f(v.uFade, S.fade);
    gl.uniform1f(v.uRed, S.red);
    gl.uniform1f(v.uDither, S.dither);
    gl.uniform1f(v.uShake, S.shake);
    if (!this.palSet || this.palProg !== P.p) { gl.uniform3fv(v.uPal, GL_PALETTE); this.palProg = P.p; this.palSet = true; }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texScene); gl.uniform1i(v.uTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
