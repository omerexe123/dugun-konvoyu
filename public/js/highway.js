/**
 * Düğün Konvoyu - Sonsuz Şehir Bulvarı ve Canlı Çevre Motoru
 * Gerçek 3D Şehir Modeli (city.glb) + 3 Şeritli Bulvar + Konfeti + Drift & Burnout Duman Parçacıkları
 */

class HighwayEngine {
  constructor(scene) {
    this.scene = scene;
    this.roadSegments = [];
    this.cityContainer = null;
    this.cityBlocks = [];
    this.confettiParticles = null;
    this.scrollSpeed = 16.5; // Gerçekçi düğün konvoyu seyir hızı (~60 km/s) - 60 FPS kilit akış

    // Duman & Kıvılcım Parçacık Havuzu
    this.smokePool = [];
    this.activeParticles = [];

    // Asfaltta Kalan Lastik İzi (Skid Marks) Havuzu
    this.skidMarkPool = [];
    this.activeSkidMarks = [];

    // Duman & Kıvılcım
    this.materials = {
      smokeWhite: new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.65 }),
      smokeDark: new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.75 }),
      sparkGold: new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    };

    this.initRoad();
    this.initCityModel();
    this.initConfetti();
    this.initParticlePool();
    this.initSkidMarkPool();

    window.highwayEngine = this;
  }

  // -------------------------------------------------------------
  // 1. Sonsuz Şehir Zemin Tabanı (Derin Asfalt Altlığı & Kesintisiz Bulvar Runway)
  // -------------------------------------------------------------
  initRoad() {
    // 1. Sonsuz Derin Zemin Tabanı (Ufuk boşluklarını engeller)
    const groundGeo = new THREE.PlaneGeometry(2400, 2400);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x181e28,
      roughness: 0.95,
      metalness: 0.05
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.position.set(0, -0.05, 0);
    groundMesh.receiveShadow = true;
    this.scene.add(groundMesh);
    this.groundMesh = groundMesh;

    // 2. Bulvar Altı Kesintisiz Asfalt Şeridi (Blok geçişlerinde 1 milimetre dahi mavi boşluk/delik oluşmasını engeller)
    const roadRunwayGeo = new THREE.PlaneGeometry(36.0, 2400);
    roadRunwayGeo.rotateX(-Math.PI / 2);
    const roadRunwayMat = new THREE.MeshStandardMaterial({
      color: 0x181e28, // Asfalt ile birebir aynı koyu renk (asla mavi zemin görünmez)
      roughness: 0.92,
      metalness: 0.05
    });
    const roadRunway = new THREE.Mesh(roadRunwayGeo, roadRunwayMat);
    roadRunway.position.set(0, -0.015, 0);
    roadRunway.receiveShadow = true;
    this.scene.add(roadRunway);
    this.roadRunway = roadRunway;
  }

  // -------------------------------------------------------------
  // 2. 3D Şehir Modeli (beautiful_city.glb) - Birebir Gerçek Cadde & 60 FPS
  // -------------------------------------------------------------
  initCityModel() {
    if (typeof THREE.GLTFLoader === 'undefined') return;

    if (HighwayEngine.cachedCity) {
      this.setupCityBlocks(HighwayEngine.cachedCity);
      return;
    }

    if (HighwayEngine.isLoadingCity) return;
    HighwayEngine.isLoadingCity = true;

    const loader = new THREE.GLTFLoader();
    loader.load('models/beautiful_city.glb', gltf => {
      HighwayEngine.isLoadingCity = false;
      const baseScene = gltf.scene;

      // 60 FPS KİLİT OPTİMİZASYON & SOKAK ENGELLERİNİN (OTOBÜS DURAKLARI, TABELALAR, REKLAMLAR) TAMAMEN KALDIRILMASI:
      baseScene.traverse(ch => {
        if (!ch) return;
        const name = (ch.name || '').toLowerCase();
        const matNames = Array.isArray(ch.material)
          ? ch.material.map(m => m.name || '').join(' ').toLowerCase()
          : (ch.material?.name || '').toLowerCase();

        // 1. Yol, kaldırım ve yol çizgilerini KESİNLİKLE KORU (Asla gizlenemez, mavi ekran oluşmasını %100 engeller)
        const isRoadOrGround = matNames.includes('material.007') || matNames.includes('material.011') || matNames.includes('material.009') || name.includes('road') || name.includes('street');

        // 2. Yalnızca yola taşan tabela, otobüs durağı reklam panosu ve alçak trafik direklerini gizle:
        const isClutter = !isRoadOrGround && (
          matNames.includes('material.008') ||
          matNames.includes('trafic') ||
          matNames.includes('material.019') ||
          matNames.includes('material.021') ||
          matNames.includes('material.022') ||
          /smallasset|circle\.|kiosk|shelter|billboard/i.test(name) ||
          /cube\.(001|048)/i.test(name) ||
          /plane\.00[68]/i.test(name)
        );

        if (isClutter) {
          ch.visible = false;
          return;
        }

        if (ch.isMesh) {
          ch.castShadow = false;
          ch.frustumCulled = !isRoadOrGround;
          ch.receiveShadow = isRoadOrGround;

          // PBR Doku ve Malzeme Kalitesini Koru & Şeffaf Delikleri Engelle
          if (ch.material) {
            if (matNames.includes('material.009')) {
              // Yol çizgileri
              ch.material.transparent = true;
              ch.material.depthWrite = false;
              ch.renderOrder = 2;
            } else if (matNames.includes('blass') || name.includes('grate')) {
              // Menfez ve ızgaralar asfaltın altına delik açmasın
              ch.material.transparent = false;
              ch.material.opacity = 1.0;
              ch.material.depthWrite = true;
            } else {
              ch.material.roughness = THREE.MathUtils.clamp(ch.material.roughness ?? 0.7, 0.45, 0.85);
              ch.material.metalness = THREE.MathUtils.clamp(ch.material.metalness ?? 0.1, 0.05, 0.35);
            }
          }
        }
      });

      HighwayEngine.cachedCity = baseScene;
      this.setupCityBlocks(baseScene);
      console.log('[HighwayEngine] 3D beautiful_city.glb ana cadde olarak yerleştirildi!');
    }, undefined, err => {
      HighwayEngine.isLoadingCity = false;
      console.warn('[HighwayEngine] beautiful_city.glb yükleme uyarısı:', err.message);
    });
  }

  setupCityBlocks(baseScene) {
    const s = 8.0;
    const zRoadCenter = 0.713876;
    const yRoadSurface = -0.490819;
    const xRoadCenter = -4.180;
    // Modelin GLTF uzayındaki gerçek cadde uzunluğu: 15.560436 * 8.0 = 124.4835m
    const blockLength = 124.4835;

    this.cityLoopLength = blockLength;

    // 8 Blok ile 1000 metrelik kesintisiz şehir bulvarı (Kamerayı her koordinatta dinamik çevreler)
    const blockZPositions = [
      blockLength * 3.0,
      blockLength * 2.0,
      blockLength * 1.0,
      0,
      -blockLength * 1.0,
      -blockLength * 2.0,
      -blockLength * 3.0,
      -blockLength * 4.0
    ];

    // Eski konteyner varsa sahneden temizle
    if (this.cityContainer) {
      this.scene.remove(this.cityContainer);
    }
    this.cityContainer = new THREE.Group();
    this.cityBlocks = [];

    blockZPositions.forEach(zPos => {
      const blockGroup = new THREE.Group();

      const clone = baseScene.clone(true);
      // Caddeyi dünya koordinatlarında Z eksenine döndür (-90 derece):
      clone.rotation.y = -Math.PI / 2;
      clone.scale.set(s, s, s);

      // Caddeyi tam konvoyun altına (X=0) ve asfalt kotuna (Y=0) oturt:
      clone.position.set(
        zRoadCenter * s,
        -yRoadSurface * s,
        -xRoadCenter * s
      );

      blockGroup.add(clone);
      blockGroup.position.set(0, 0, zPos);

      this.cityContainer.add(blockGroup);
      this.cityBlocks.push(blockGroup);
    });

    this.scene.add(this.cityContainer);
  }

  // -------------------------------------------------------------
  // 3. Konfeti Efekti
  // -------------------------------------------------------------
  initConfetti() {
    const count = 180;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const palette = [
      [1.0, 0.85, 0.2],  // Altın
      [0.95, 0.15, 0.35],// Kırmızı
      [0.15, 0.75, 0.95],// Turkuaz
      [1.0, 0.45, 0.75], // Pembe
      [1.0, 1.0, 1.0]    // Beyaz
    ];

    // Kamera z=24'te olduğu için konfetiyi sadece arabaların üzerine (z: -35 ile +6 arası) sınırla
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 11.0;
      positions[i * 3 + 1] = 1.5 + Math.random() * 12.0;
      positions[i * 3 + 2] = -35.0 + Math.random() * 41.0;

      const col = palette[i % palette.length];
      colors[i * 3] = col[0];
      colors[i * 3 + 1] = col[1];
      colors[i * 3 + 2] = col[2];
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Kare billboard polygonları önleyen yumuşak dairesel konfeti dokusu
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const radGrad = ctx.createRadialGradient(16, 16, 0, 16, 16, 15);
    radGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    radGrad.addColorStop(0.75, 'rgba(255, 255, 255, 0.95)');
    radGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(16, 16, 15, 0, Math.PI * 2);
    ctx.fill();
    const confettiTex = new THREE.CanvasTexture(canvas);

    const material = new THREE.PointsMaterial({
      size: 0.20,
      map: confettiTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.90,
      depthWrite: false
    });

    this.confettiParticles = new THREE.Points(geometry, material);
    this.scene.add(this.confettiParticles);
  }

  // -------------------------------------------------------------
  // 4. Drift & Burnout Gerçekçi Volumetrik Duman & Kıvılcım Sistemi
  // -------------------------------------------------------------
  createSmokeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.90)');
    grad.addColorStop(0.35, 'rgba(240, 245, 255, 0.55)');
    grad.addColorStop(0.70, 'rgba(220, 230, 245, 0.18)');
    grad.addColorStop(1, 'rgba(200, 215, 235, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();
    return new THREE.CanvasTexture(canvas);
  }

  createSkidTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, 'rgba(10, 12, 16, 0)');
    grad.addColorStop(0.12, 'rgba(12, 14, 18, 0.95)');
    grad.addColorStop(0.40, 'rgba(18, 20, 24, 0.65)');
    grad.addColorStop(0.60, 'rgba(12, 14, 18, 0.95)');
    grad.addColorStop(0.88, 'rgba(12, 14, 18, 0.95)');
    grad.addColorStop(1, 'rgba(10, 12, 16, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  initParticlePool() {
    this.smokeTexture = this.createSmokeTexture();
    const geom = new THREE.PlaneGeometry(1.0, 1.0);
    this.smokeMat = new THREE.MeshBasicMaterial({
      map: this.smokeTexture,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });

    const fireworkColors = [0xff0055, 0x00f0ff, 0xffd700, 0x39ff14, 0xff00ff, 0xffffff];
    this.fireworkMaterials = fireworkColors.map(col => new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 1.0,
      depthWrite: false
    }));

    for (let i = 0; i < 80; i++) {
      const clonedMat = this.smokeMat.clone();
      const p = new THREE.Mesh(geom, clonedMat);
      p.userData.origSmokeMat = clonedMat;
      p.visible = false;
      this.scene.add(p);
      this.smokePool.push(p);
    }
  }

  // -------------------------------------------------------------
  // 4. Drift & Burnout Gerçekçi ve Hafif Duman Sistemi
  // -------------------------------------------------------------
  emitDriftSmoke(worldPos, count = 1, isMotor = false) {
    // Aracın tam arka tamponunun ve arka lastiklerinin arkasında
    const rearZOffset = isMotor ? -1.30 : -2.35;
    for (let i = 0; i < count; i++) {
      const p = this.smokePool.find(item => !item.visible);
      if (!p) break;

      p.visible = true;
      p.material = p.userData.origSmokeMat || this.smokeMat;
      p.material.opacity = 0.30; // Hafif ve şeffaf duman
      p.position.set(
        worldPos.x + (Math.random() - 0.5) * (isMotor ? 0.35 : 0.85),
        0.12 + Math.random() * 0.08,
        worldPos.z + rearZOffset - Math.random() * 0.25
      );
      const initScale = 0.35 + Math.random() * 0.20;
      p.scale.set(initScale, initScale, initScale);
      p.rotation.z = Math.random() * Math.PI * 2;
      p.userData = {
        vx: (Math.random() - 0.5) * 0.8,
        vy: 0.45 + Math.random() * 0.60,
        vz: -3.5 - Math.random() * 2.5,
        rotSpeed: (Math.random() - 0.5) * 2.0,
        grow: 1.1 + Math.random() * 0.6,
        life: 0.55,
        maxLife: 0.55,
        baseOpacity: 0.30,
        isSmoke: true
      };
      this.activeParticles.push(p);
    }
  }

  emitBurnoutSmoke(worldPos, count = 2, isMotor = false) {
    // Aracın tam arkasında, aracın üstüne çıkmayan hafif lastik dumanı
    const rearZOffset = isMotor ? -1.35 : -2.40;
    for (let i = 0; i < count; i++) {
      const p = this.smokePool.find(item => !item.visible);
      if (!p) break;

      p.visible = true;
      p.material = p.userData.origSmokeMat || this.smokeMat;
      p.material.opacity = 0.42; // Hafif ve estetik duman
      p.position.set(
        worldPos.x + (Math.random() - 0.5) * (isMotor ? 0.45 : 1.10),
        0.14 + Math.random() * 0.10,
        worldPos.z + rearZOffset - Math.random() * 0.30
      );
      const initScale = 0.45 + Math.random() * 0.25;
      p.scale.set(initScale, initScale, initScale);
      p.rotation.z = Math.random() * Math.PI * 2;
      p.userData = {
        vx: (Math.random() - 0.5) * 1.6,
        vy: 0.70 + Math.random() * 0.90,
        vz: -4.0 - Math.random() * 3.0,
        rotSpeed: (Math.random() - 0.5) * 2.5,
        grow: 1.4 + Math.random() * 0.8,
        life: 0.65,
        maxLife: 0.65,
        baseOpacity: 0.42,
        isSmoke: true
      };
      this.activeParticles.push(p);
    }
  }

  emitWheelieSparks(worldPos, count = 4) {
    for (let i = 0; i < count; i++) {
      const p = this.smokePool.find(item => !item.visible);
      if (!p) break;

      p.visible = true;
      p.material = this.materials.sparkGold;
      p.position.set(
        worldPos.x + (Math.random() - 0.5) * 0.25,
        0.08,
        worldPos.z - 1.1 - Math.random() * 0.2
      );
      p.scale.set(0.3, 0.3, 0.3);
      p.userData = {
        vx: (Math.random() - 0.5) * 2.5,
        vy: 0.8 + Math.random() * 1.5,
        vz: -1.0 - Math.random() * 4.0,
        rotSpeed: 0,
        grow: 0.4,
        life: 0.35,
        maxLife: 0.35,
        baseOpacity: 1.0,
        isSpark: true,
        isSmoke: false
      };
      this.activeParticles.push(p);
    }
  }

  // Gökyüzü Havai Fişek Patlaması (Düğün Hedefi & Büyük Hediyeler İçin)
  emitFireworks(worldPos = null, count = 35) {
    const origin = worldPos ? worldPos.clone() : new THREE.Vector3((Math.random() - 0.5) * 22, 13 + Math.random() * 8, -15 - Math.random() * 35);
    origin.y = Math.max(10, origin.y);
    const colors = [0xff0055, 0x00f0ff, 0xffd700, 0x39ff14, 0xff00ff, 0xffffff];

    for (let i = 0; i < count; i++) {
      const p = this.smokePool.find(item => !item.visible);
      if (!p) break;

      p.visible = true;
      p.position.copy(origin);
      p.material = this.fireworkMaterials[Math.floor(Math.random() * this.fireworkMaterials.length)];

      const angle = Math.random() * Math.PI * 2;
      const speed = 5.0 + Math.random() * 10.0;
      const upSpeed = (Math.random() - 0.2) * 8.0;

      p.scale.set(0.35, 0.35, 0.35);
      p.userData = {
        vx: Math.cos(angle) * speed,
        vy: upSpeed,
        vz: Math.sin(angle) * speed,
        rotSpeed: 0,
        grow: -0.12,
        life: 1.2 + Math.random() * 0.5,
        maxLife: 1.2,
        baseOpacity: 1.0,
        isSpark: false,
        isSmoke: false,
        isFirework: true
      };
      this.activeParticles.push(p);
    }
  }

  // -------------------------------------------------------------
  // 5. Asfaltta Kalan Kusursuz Lastik İzi (Skid Marks) Sistemi
  // -------------------------------------------------------------
  initSkidMarkPool() {
    this.skidTexture = this.createSkidTexture();
    const geom = new THREE.PlaneGeometry(0.26, 1.0);
    geom.rotateX(-Math.PI / 2); // Yere paralel asfalt temas yüzeyi

    for (let i = 0; i < 350; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.skidTexture,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -2.0
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.visible = false;
      this.skidMarkPool.push(mesh);
    }

    this.lastWheelPositions = {};
  }

  emitSkidMarks(carId, worldPos, yawAngle = 0, isMotor = false) {
    // Aracın bulunduğu en yakın şehir cadde bloğunu bul
    if (!this.cityBlocks || this.cityBlocks.length === 0) return;
    const containerZ = this.cityContainer ? this.cityContainer.position.z : 0;
    let bestBlock = this.cityBlocks[0];
    let minDist = Math.abs(worldPos.z - (bestBlock.position.z + containerZ));
    for (let i = 1; i < this.cityBlocks.length; i++) {
      const d = Math.abs(worldPos.z - (this.cityBlocks[i].position.z + containerZ));
      if (d < minDist) {
        minDist = d;
        bestBlock = this.cityBlocks[i];
      }
    }
    if (!bestBlock) return;

    // Arka tekerleklerin dünya konumları (açıya göre)
    const cosY = Math.cos(yawAngle);
    const sinY = Math.sin(yawAngle);

    // Motor: Tek arka tekerlek; Araba: Sağ ve sol arka tekerlekler
    const offsets = isMotor
      ? [{ x: -sinY * 0.85, z: -cosY * 0.85 }]
      : [
          { x: -0.74 * cosY - sinY * 1.55, z: 0.74 * sinY - cosY * 1.55 },
          { x: 0.74 * cosY - sinY * 1.55, z: -0.74 * sinY - cosY * 1.55 }
        ];

    this.lastWheelPositions = this.lastWheelPositions || {};

    offsets.forEach((off, idx) => {
      const wx = worldPos.x + off.x;
      const wz = worldPos.z + off.z;
      const blockWorldZ = bestBlock.position.z + containerZ;
      const curLocalX = wx - bestBlock.position.x;
      const curLocalZ = wz - blockWorldZ;
      const key = `${carId || 'c'}_${idx}`;

      const prev = this.lastWheelPositions[key];
      if (!prev || prev.seg !== bestBlock) {
        this.lastWheelPositions[key] = { x: curLocalX, z: curLocalZ, seg: bestBlock };
        return;
      }

      const dx = curLocalX - prev.x;
      const dz = curLocalZ - prev.z;
      const dist = Math.hypot(dx, dz);

      // En az 10 cm harekette yeni iz bas
      if (dist < 0.10) return;

      const mark = this.skidMarkPool.find(m => !m.visible);
      if (!mark) return;

      const midX = (prev.x + curLocalX) / 2;
      const midZ = (prev.z + curLocalZ) / 2;
      const trackAngle = Math.atan2(dx, dz);

      mark.visible = true;
      mark.material.opacity = 0.92;
      mark.scale.set(1.0, 1.0, dist + 0.35);
      mark.position.set(midX, 0.02, midZ);
      mark.rotation.y = trackAngle;
      mark.userData = { life: 9.0, seg: bestBlock };

      if (mark.parent !== bestBlock) {
        if (mark.parent) mark.parent.remove(mark);
        bestBlock.add(mark);
      }
      this.activeSkidMarks.push(mark);

      prev.x = curLocalX;
      prev.z = curLocalZ;
    });
  }

  clearSkidTrack(carId) {
    if (!this.lastWheelPositions) return;
    delete this.lastWheelPositions[`${carId || 'c'}_0`];
    delete this.lastWheelPositions[`${carId || 'c'}_1`];
  }

  // -------------------------------------------------------------
  // 6. Kare Başına Güncelleme (60 FPS)
  // -------------------------------------------------------------
  update(dt) {
    const moveDist = this.scrollSpeed * dt;

    // Gerçek Sonsuz Otoyol Motoru: Şehir blokları ve zemin KAMERA eksenini dinamik takip eder!
    const loopLen = this.cityLoopLength || 124.4835;
    const numBlocks = this.cityBlocks.length || 8;
    const totalLength = loopLen * numBlocks;

    this.accumulatedScroll = (this.accumulatedScroll || 0) + moveDist;

    const camZ = (window.convoy && window.convoy.camera) ? window.convoy.camera.position.z : 0;

    // Asfalt zemin ve runway plakaları kamerayı lockstep takip eder (ASLA zemin delinmez)
    if (this.groundMesh) this.groundMesh.position.z = camZ;
    if (this.roadRunway) this.roadRunway.position.z = camZ;

    // Şehir blokları kamera ekseninde [camZ - 150m, camZ + 846m] penceresinde kesintisiz akar
    const minZ = camZ - 150.0;
    this.cityBlocks.forEach((block, idx) => {
      const baseOffset = idx * loopLen;
      let worldZ = (baseOffset - this.accumulatedScroll) % totalLength;
      while (worldZ < minZ) worldZ += totalLength;
      while (worldZ >= minZ + totalLength) worldZ -= totalLength;
      block.position.z = worldZ;
    });

    // 3. Konfeti Salınımı (Kamera eksenini kirletmeden yumuşak süzülme)
    if (this.confettiParticles) {
      const pos = this.confettiParticles.geometry.attributes.position.array;
      for (let i = 0; i < pos.length / 3; i++) {
        pos[i * 3 + 1] -= dt * 2.8;
        pos[i * 3] += Math.sin(Date.now() * 0.002 + i) * 0.02;
        if (pos[i * 3 + 1] < 0.3) {
          pos[i * 3 + 1] = 13.0;
          pos[i * 3] = (Math.random() - 0.5) * 11.0;
          pos[i * 3 + 2] = -35.0 + Math.random() * 41.0;
        }
      }
      this.confettiParticles.geometry.attributes.position.needsUpdate = true;
    }

    // 4. Duman, Kıvılcım & Havai Fişek Parçacıklarını Güncelle
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];
      p.userData.life -= dt;

      if (p.userData.life <= 0) {
        p.visible = false;
        if (p.userData.isSpark || p.userData.isFirework) p.material = p.userData.origSmokeMat || this.smokeMat;
        this.activeParticles.splice(i, 1);
        continue;
      }

      if (p.userData.isFirework) {
        p.userData.vy -= 9.8 * dt * 0.45; // Havai fişek yerçekimi
      }

      p.position.x += p.userData.vx * dt;
      p.position.y += p.userData.vy * dt;
      p.position.z += (p.userData.vz + this.scrollSpeed * 0.35) * dt;

      const scaleInc = p.userData.grow * dt;
      p.scale.x = Math.max(0.05, p.scale.x + scaleInc);
      p.scale.y = Math.max(0.05, p.scale.y + scaleInc);
      p.scale.z = Math.max(0.05, p.scale.z + scaleInc);

      if (p.userData.isSmoke) {
        p.rotation.z += (p.userData.rotSpeed || 0) * dt;
        const fade = Math.max(0, p.userData.life / (p.userData.maxLife || 1.0));
        p.material.opacity = fade * (p.userData.baseOpacity || 0.75);
      } else if (!p.userData.isSpark && !p.userData.isFirework) {
        p.material.opacity = Math.max(0, p.userData.life);
      }
    }

    // 5. Asfalttaki Lastik İzlerini (Skid Marks) Akıcı Silikleştir
    for (let i = this.activeSkidMarks.length - 1; i >= 0; i--) {
      const sm = this.activeSkidMarks[i];
      sm.userData.life -= dt;
      if (sm.userData.life <= 0) {
        sm.visible = false;
        this.activeSkidMarks.splice(i, 1);
      } else {
        // Son 2 saniyede yavaşça saydamlaşıp kaybolsun
        sm.material.opacity = Math.min(0.88, sm.userData.life * 0.25);
      }
    }
  }
}

window.HighwayEngine = HighwayEngine;
