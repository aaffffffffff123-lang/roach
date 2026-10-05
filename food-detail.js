// 닭뼈·콜라 미끼 전용. 기존 THREE 인스턴스를 인자로 받으며 밥은 건드리지 않는다.
export function makeFoodBait(THREE, kind) {
  if (kind !== 'bone' && kind !== 'cola') return null;
  const group = new THREE.Group(), TAU = Math.PI * 2;
  const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const random = (a, b) => a + Math.random() * (b - a);
  let ratio = 1, lastRatio = -1, lastDraw = -1, disposed = false;
  const food = { bite() {}, update() {}, mouthTarget() {}, dispose };
  group.userData.food = food;

  function mesh(geometry, material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  }

  function canvasPlane(size, resolution = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = resolution;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const plane = mesh(
      new THREE.PlaneGeometry(size, size),
      material, 0, .0016, 0
    );
    plane.rotation.x = -Math.PI / 2;
    plane.castShadow = false;
    return { canvas, ctx: canvas.getContext('2d'), texture };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    group.traverse(m => {
      if (m.geometry) geometries.add(m.geometry);
      for (const mat of (
        Array.isArray(m.material) ? m.material : [m.material]
      )) {
        if (!mat) continue;
        materials.add(mat);
        if (mat.map) textures.add(mat.map);
      }
    });
    for (const t of textures) t.dispose();
    for (const m of materials) m.dispose();
    for (const g of geometries) g.dispose();
  }

  if (kind === 'bone') {
    const ivory = new THREE.MeshStandardMaterial({
      color: 0xe6d8b8, roughness: .66
    });
    const cartilage = new THREE.MeshStandardMaterial({
      color: 0xf1e6cd, roughness: .43
    });
    const bone = mesh(
      new THREE.CylinderGeometry(.007, .009, .16, 12),
      ivory, .005, .011
    );
    bone.rotation.z = Math.PI / 2;

    for (const end of [-1, 1]) {
      for (const side of [-1, 1]) {
        const joint = mesh(
          new THREE.SphereGeometry(.010, 12, 8),
          cartilage,
          end * .077, .012, side * .005
        );
        joint.scale.set(1.25, .8, .85);
      }
    }

    const oil = canvasPlane(.23, 128), o = oil.ctx;
    const gradient = o.createRadialGradient(58, 66, 2, 58, 66, 43);
    gradient.addColorStop(0, 'rgba(126,68,20,.14)');
    gradient.addColorStop(1, 'rgba(126,68,20,0)');
    o.fillStyle = gradient;
    o.save();
    o.translate(64, 64);
    o.scale(1, .47);
    o.translate(-64, -64);
    o.fillRect(0, 0, 128, 128);
    o.restore();
    oil.texture.needsUpdate = true;

    const geometry = new THREE.SphereGeometry(1, 36, 22);
    const positions = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const source = new Float32Array(positions.array.length);
    const heat = new Float32Array(positions.count);
    const remain = new Float32Array(positions.count);
    const colors = new Float32Array(positions.array.length);
    const crust = [];
    const pale = new THREE.Color(0xe3bd87);
    const toasted = new THREE.Color(0x9d4316);
    const golden = new THREE.Color(0xd2933f);
    const charred = new THREE.Color(0x542617);
    const c = new THREE.Color();

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const u = uv.getX(i), v = uv.getY(i);
      const taper = 1 - .28 * (x + 1) / 2;
      const wrinkle =
        1 + .043 * Math.sin(u * 83 + v * 17) * Math.sin(v * 61);
      const px = -.023 + x * .057;
      const py = Math.max(.003, .030 + y * .036 * taper * wrinkle);
      const pz = z * .038 * taper * wrinkle;
      positions.setXYZ(i, px, py, pz);
      source.set([px, py, pz], i * 3);
      remain[i] = 1;
      const speckle =
        .5 + .5 * Math.sin(u * 197 + Math.sin(v * 211) * 7);
      c.copy(toasted).lerp(golden, speckle * .8);
      if (speckle < .16) c.lerp(charred, .55);
      crust.push(c.clone());
      c.toArray(colors, i * 3);
    }

    geometry.setAttribute(
      'color', new THREE.BufferAttribute(colors, 3)
    );
    geometry.computeVertexNormals();
    const meat = mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: .46, metalness: 0
      })
    );

    // 뜯긴 속살의 가는 섬유.
    const fibers = [];
    const fiberMat = new THREE.MeshStandardMaterial({
      color: 0xf1d3a1, roughness: .8
    });
    for (let k = 0; k < 12; k++) {
      const x = random(-.052, .010), z = random(-.018, .018);
      let nearest = 0, best = Infinity;
      for (let i = 0; i < positions.count; i++) {
        if (source[i * 3 + 1] < .04) continue;
        const d =
          (source[i * 3] - x) ** 2 +
          (source[i * 3 + 2] - z) ** 2;
        if (d < best) {
          best = d;
          nearest = i;
        }
      }
      const line = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-.009, 0, 0),
        new THREE.Vector3(0, .0008, .001),
        new THREE.Vector3(.008, 0, -.001)
      ]);
      const strand = mesh(
        new THREE.TubeGeometry(line, 5, .0007, 3, false),
        fiberMat
      );
      strand.rotation.y = random(-.4, .4);
      strand.visible = false;
      fibers.push({ strand, i: nearest });
    }

    food.bite = (x, z, dt) => {
      if (disposed) return;
      for (let i = 0; i < positions.count; i++) {
        const d2 =
          (source[i * 3] - x) ** 2 +
          (source[i * 3 + 2] - z) ** 2;
        heat[i] += dt * Math.exp(-d2 / .00030);
      }
    };

    food.update = (nextRatio, time = 0) => {
      if (disposed) return;
      ratio = clamp(nextRatio);
      if (
        ratio > 0 &&
        time - lastDraw < .07 &&
        Math.abs(ratio - lastRatio) < .008
      ) return;
      lastDraw = time;
      lastRatio = ratio;
      const average = heat.reduce((sum, h) => sum + h, 0) / heat.length;
      const loss = 1 - ratio;

      for (let i = 0; i < positions.count; i++) {
        const damage = clamp(
          loss ** 4 + loss * heat[i] / (average + .01)
        );
        const r = remain[i] = ratio === 0 ? 0 : 1 - damage;
        const s = Math.sqrt(r);
        positions.setXYZ(
          i,
          source[i * 3],
          lerp(.012, source[i * 3 + 1], s),
          source[i * 3 + 2] * s
        );
        c.copy(crust[i]).lerp(pale, clamp((damage - .025) * 5));
        c.toArray(colors, i * 3);
      }

      positions.needsUpdate = geometry.attributes.color.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      meat.visible = ratio > .001;

      for (const f of fibers) {
        const r = remain[f.i];
        f.strand.visible = r > .12 && r < .90;
        f.strand.position.fromBufferAttribute(positions, f.i);
        f.strand.position.y += .0006;
        f.strand.scale.setScalar(Math.sqrt(r));
      }
    };

    food.mouthTarget = angle => {
      const nx = Math.cos(angle), nz = Math.sin(angle);
      let best = -Infinity, target = { x: -.023, z: 0 };
      for (let i = 0; i < positions.count; i++) {
        if (remain[i] < .12 || positions.getY(i) > .038) continue;
        const x = positions.getX(i), z = positions.getZ(i);
        const score = x * nx + z * nz;
        if (score > best) {
          best = score;
          target = { x, z };
        }
      }
      return target;
    };
  } else {
    const surface = canvasPlane(.86, 384);
    const ctx = surface.ctx, N = surface.canvas.width;
    const wet = document.createElement('canvas');
    wet.width = wet.height = N;
    const w = wet.getContext('2d'), ppm = N / .86;
    const bites = [], droplets = [], bubbles = [];
    const phase = random(0, TAU), p2 = random(0, TAU), p5 = random(0, TAU);
    const flow = a => Math.atan2(
      Math.sin(a - phase), Math.cos(a - phase)
    );
    const edge = a =>
      .235 * (
        1 + .14 * Math.sin(a * 2 + p2) +
        .09 * Math.sin(a * 3 + phase) +
        .06 * Math.sin(a * 5 + p5)
      ) + .055 * Math.exp(-(flow(a) ** 2) / .025);

    for (let i = 0; i < 14; i++) {
      const a = random(0, TAU), r = random(.28, .37);
      droplets.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r * .76,
        r: random(.002, .008)
      });
    }
    for (let i = 0; i < 22; i++) {
      bubbles.push({
        a: random(0, TAU),
        r: random(.05, .22),
        size: random(.001, .003),
        life: random(4, 12)
      });
    }

    function path(g, size) {
      g.beginPath();
      for (let i = 0; i <= 96; i++) {
        const a = i / 96 * TAU, r = edge(a) * size;
        const x = N / 2 + Math.cos(a) * r * ppm;
        const y = N / 2 + Math.sin(a) * r * .76 * ppm;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
    }

    food.bite = (x, z, dt) => {
      if (disposed) return;
      let b = bites.find(p => Math.hypot(p.x - x, p.z - z) < .032);
      if (!b) {
        b = { x, z, heat: 0 };
        if (bites.length >= 16) bites.shift();
        bites.push(b);
      }
      b.heat += dt;
    };

    food.update = (nextRatio, time = 0) => {
      if (disposed) return;
      ratio = clamp(nextRatio);
      if (
        ratio > 0 &&
        time - lastDraw < .1 &&
        Math.abs(ratio - lastRatio) < .008
      ) return;
      lastDraw = time;
      lastRatio = ratio;
      ctx.clearRect(0, 0, N, N);
      w.clearRect(0, 0, N, N);

      // 원래 윤곽은 얇은 끈적임으로 남긴다.
      path(ctx, 1);
      ctx.fillStyle = 'rgba(86,44,17,.055)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(101,53,20,.13)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const size = Math.sqrt(ratio);
      if (ratio > 0) {
        path(w, size);
        const liquid = w.createRadialGradient(
          N * .43, N * .43, 0,
          N / 2, N / 2, ppm * .27 * size
        );
        liquid.addColorStop(0, 'rgba(58,24,8,.74)');
        liquid.addColorStop(.7, 'rgba(92,40,13,.55)');
        liquid.addColorStop(1, 'rgba(125,65,22,.28)');
        w.fillStyle = liquid;
        w.fill();
        w.strokeStyle = 'rgba(171,116,58,.34)';
        w.lineWidth = 1;
        w.stroke();
        w.save();
        w.clip();
        w.strokeStyle = `rgba(255,239,210,${.27 * size})`;
        w.lineWidth = 1.5;
        w.beginPath();
        w.ellipse(
          N / 2 - size * 23, N / 2 - size * 35,
          size * 61, size * 12, -.3, Math.PI, TAU * .91
        );
        w.stroke();

        for (const b of bubbles) {
          if (time >= b.life) continue;
          const x = N / 2 + Math.cos(b.a) * b.r * ppm;
          const y = N / 2 + Math.sin(b.a) * b.r * .76 * ppm;
          w.strokeStyle =
            `rgba(248,220,170,${.5 * (1 - time / b.life)})`;
          w.lineWidth = .6;
          w.beginPath();
          w.arc(x, y, b.size * ppm, 0, TAU);
          w.stroke();
        }

        w.restore();
        w.globalCompositeOperation = 'destination-out';
        for (const b of bites) {
          const r =
            Math.min(.055, .012 * Math.sqrt(b.heat * (1 - ratio))) * ppm;
          if (r < .1) continue;
          w.fillStyle = 'rgba(0,0,0,.8)';
          w.beginPath();
          w.arc(
            N / 2 + b.x * ppm,
            N / 2 + b.z * ppm,
            r, 0, TAU
          );
          w.fill();
        }
        w.globalCompositeOperation = 'source-over';
      }

      ctx.drawImage(wet, 0, 0);
      for (const d of droplets) {
        ctx.fillStyle = `rgba(93,41,12,${.05 + .43 * ratio})`;
        ctx.beginPath();
        ctx.ellipse(
          N / 2 + d.x * ppm,
          N / 2 + d.z * ppm,
          d.r * ppm * (.3 + .7 * size),
          d.r * ppm * .6 * (.3 + .7 * size),
          .3, 0, TAU
        );
        ctx.fill();
      }
      surface.texture.needsUpdate = true;
    };

    food.mouthTarget = angle => {
      let target = { x: 0, z: 0 }, best = Infinity;
      for (const offset of [0, -.23, .23, -.46, .46]) {
        const a = angle + offset;
        const r = edge(a) * Math.sqrt(ratio);
        const x = Math.cos(a) * r, z = Math.sin(a) * r * .76;
        const heat = bites.reduce((s, b) =>
          s + b.heat * Math.exp(
            -((b.x - x) ** 2 + (b.z - z) ** 2) / .001
          ), 0
        );
        const score = Math.abs(offset) + heat * .2;
        if (score < best) {
          best = score;
          target = { x, z };
        }
      }
      return target;
    };
  }

  food.update(1, 0);
  return group;
}
