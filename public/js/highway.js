/**
 * Düğün Konvoyu - Sonsuz Şehir Bulvarı ve Canlı Çevre Motoru
 * Gerçek 3D Şehir Modeli (city.glb) + 3 Şeritli Bulvar + Konfeti + Drift & Burnout Duman Parçacıkları
 */

class HighwayEngine {
  constructor(scene) {
    this.scene = scene;
    this.roadSegments = [];
    this.cityBlocks = [];
    this.confettiParticles = null;
    this.scrollSpeed = 38.0; // Otoyol akış hızı (60 FPS kilitli)

    // Duman & Kıvılcım Parçacık Havuzu
    this.smokePool = [];
    this.activeParticles = [];

    // Asfaltta Kalan Lastik İzi (Skid Marks) Havuzu
    this.skidMarkPool = [];
    this.activeSkidMarks = [];

    // Gerçekçi PBR Fiziksel Materyaller
    this.materials = {
      roadAsphalt: new THREE.MeshStandardMaterial({
        color: 0x16181c,
        roughness: 0.85,
        metalness: 0.08
      }),
      roadStripe: new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.40,
        metalness: 0.05
      }),
      curbStone: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.65,
        metalness: 0.05
      }),
      sidewalk: new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.78,
        metalness: 0.05
      }),
      grassVerge: new THREE.MeshStandardMaterial({
        color: 0x14532d,
        roughness: 0.90,
        metalness: 0.02
      }),
      plazaWalk: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.75,
        metalness: 0.08
      }),
      
      // Aydınlatma
      lampPole: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.35,
        metalness: 0.85
      }),
      lampBulb: new THREE.MeshBasicMaterial({ color: 0xffedd5 }),

      // Duman & Kıvılcım
      smokeWhite: new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.65 }),
      smokeDark: new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.75 }),
      sparkGold: new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    };

    this.initRoad();
    this.initCityModel();
    this.initTreeModels();
    this.initConfetti();
    this.initParticlePool();
    this.initSkidMarkPool();

    window.highwayEngine = this;
  }

  // -------------------------------------------------------------
  // 1. Sonsuz 3 Şeritli Bulvar & Devasa Zemin İnşası
  // -------------------------------------------------------------
  initRoad() {
    // 1600x1600m devasa ufuk zemin düzlemi
    const groundGeo = new THREE.PlaneGeometry(1600, 1600);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x090d16 });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.position.y = -0.36;
    groundMesh.receiveShadow = true;
    this.scene.add(groundMesh);

    // 4 segment x 160m = 640 metrelik kesintisiz otoyol (Z: -320m ile +320m arası)
    const segLength = 160;
    for (let i = 0; i < 4; i++) {
      const zOffset = (i * segLength) - (segLength * 1.5);
      const segmentGroup = new THREE.Group();

      this.buildBoulevardSegment(segmentGroup, segLength);
      segmentGroup.position.z = zOffset;

      this.scene.add(segmentGroup);
      this.roadSegments.push(segmentGroup);
    }
  }

  buildBoulevardSegment(g, length) {
    const roadWidth = 12.0; // 3 Şeritli geniş cadde

    // Asfalt Yol
    const road = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, 0.3, length), this.materials.roadAsphalt);
    road.position.y = -0.15;
    road.receiveShadow = true;
    g.add(road);

    // Beyaz Güvenlik Kenar Çizgileri
    [-5.6, 5.6].forEach(ex => {
      const edgeLine = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, length), this.materials.roadStripe);
      edgeLine.position.set(ex, 0.01, 0);
      edgeLine.receiveShadow = true;
      g.add(edgeLine);
    });

    // Beyaz Kesikli Şerit Çizgileri (-3.8 ve +3.8 şerit sınırları)
    [-1.9, 1.9].forEach(lx => {
      for (let sz = -length / 2 + 5; sz <= length / 2 - 5; sz += 9) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 5.2), this.materials.roadStripe);
        dash.position.set(lx, 0.01, sz);
        dash.receiveShadow = true;
        g.add(dash);
      }
    });

    // Yaya Geçitleri (Zebra)
    [-40, 40].forEach(zz => {
      for (let zx = -5.0; zx <= 5.0; zx += 1.25) {
        const zebra = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.02, 3.8), this.materials.roadStripe);
        zebra.position.set(zx, 0.015, zz);
        zebra.receiveShadow = true;
        g.add(zebra);
      }
    });

    // Sağ ve Sol Kaldırımlar, Park Şeritleri, Ağaçlar & Sokak Lambaları (Boşluksuz 26m Kesintisiz Zemin)
    [-1, 1].forEach(side => {
      const dirX = side;
      // Bordür Taşı (6.0m - 6.4m)
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, length), this.materials.curbStone);
      curb.position.set(dirX * 6.2, 0.14, 0);
      curb.castShadow = true;
      curb.receiveShadow = true;
      g.add(curb);

      // Yaya Kaldırımı (6.4m - 13.4m, Genişlik: 7.0m)
      const walk = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.22, length), this.materials.sidewalk);
      walk.position.set(dirX * 9.9, 0.11, 0);
      walk.receiveShadow = true;
      g.add(walk);

      // Ağaçlı Yeşil Şerit (13.4m - 18.4m, Genişlik: 5.0m)
      const verge = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.24, length), this.materials.grassVerge);
      verge.position.set(dirX * 15.9, 0.12, 0);
      verge.receiveShadow = true;
      g.add(verge);

      // Gökdelen Önü Granit Meydan / Plaza (18.4m - 26.0m, Genişlik: 7.6m)
      const plaza = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.20, length), this.materials.plazaWalk);
      plaza.position.set(dirX * 22.2, 0.10, 0);
      plaza.receiveShadow = true;
      g.add(plaza);

      // Modern Sokak Lambaları (Kaldırım kenarında dirX * 6.7)
      for (let tz = -length / 2 + 15; tz <= length / 2 - 15; tz += 24) {
        const lamp = this.createStreetLamp(dirX);
        lamp.position.set(dirX * 6.7, 0.2, tz);
        g.add(lamp);
      }
    });
  }

  // -------------------------------------------------------------
  // 1.2 Gerçek 3D Ağaçların (tree_large & tree_small) Yüklenmesi
  // -------------------------------------------------------------
  initTreeModels() {
    this.treeTemplates = [];
    if (typeof THREE.GLTFLoader === 'undefined') return;
    const loader = new THREE.GLTFLoader();

    ['models/tree_large.glb', 'models/tree_small.glb'].forEach((path, idx) => {
      loader.load(path, gltf => {
        const treeScene = gltf.scene;
        treeScene.traverse(ch => {
          if (ch.isMesh) {
            ch.castShadow = true;
            ch.receiveShadow = true;
            if (ch.material) {
              ch.material.roughness = 0.85;
            }
          }
        });
        const box = new THREE.Box3().setFromObject(treeScene);
        const size = new THREE.Vector3();
        box.getSize(size);
        const targetH = idx === 0 ? 7.2 : 5.0;
        const s = targetH / (size.y || 1);
        treeScene.scale.set(s, s, s);

        this.treeTemplates.push(treeScene);
        if (this.treeTemplates.length === 2) {
          this.populateTrees();
        }
      }, undefined, err => {
        console.warn('[HighwayEngine] Ağaç yükleme uyarısı:', err.message);
      });
    });
  }

  populateTrees() {
    if (!this.treeTemplates || this.treeTemplates.length === 0) return;
    this.roadSegments.forEach(seg => {
      [-1, 1].forEach(side => {
        for (let tz = -70; tz <= 70; tz += 16) {
          const tmpl = this.treeTemplates[Math.abs(tz) % 2];
          if (!tmpl) continue;
          const tree = tmpl.clone(true);
          tree.position.set(side * 15.9, 0.12, tz + (Math.sin(tz) * 1.5));
          tree.rotation.y = (Math.abs(tz) * 0.7) % (Math.PI * 2);
          seg.add(tree);
        }
      });
    });
  }

  createStreetLamp(dirX) {
    const lamp = new THREE.Group();

    // Dikey Direk
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 5.2, 6), this.materials.lampPole);
    pole.position.y = 2.6;
    pole.castShadow = true;
    lamp.add(pole);

    // Yola doğru uzanan yatay eğik kol
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.08), this.materials.lampPole);
    arm.position.set(-dirX * 0.7, 5.15, 0);
    lamp.add(arm);

    // Işıklı Armatür Başlığı
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, 0.22), this.materials.lampBulb);
    bulb.position.set(-dirX * 1.35, 5.08, 0);
    lamp.add(bulb);

    return lamp;
  }

  // -------------------------------------------------------------
  // 2. Anında (0ms) Yüklenen Şehir ve 3D city.glb Entegrasyonu
  // -------------------------------------------------------------
  initCityModel() {
    // 1. Önce ANINDA (0 milisaniye) çalışan modern prosedürel şehir bloklarını inşa et
    this.initInstantProceduralCity();

    if (typeof THREE.GLTFLoader === 'undefined') return;

    const loader = new THREE.GLTFLoader();
    loader.load('models/city.glb', gltf => {
      const baseScene = gltf.scene;

      // Orijinal dokuları ve PBR materyalleri koru!
      baseScene.traverse(ch => {
        if (ch.isMesh) {
          ch.castShadow = true;
          ch.receiveShadow = true;
          ch.frustumCulled = true;
          if (ch.material) {
            ch.material.roughness = 0.70;
            ch.material.metalness = 0.15;
          }
        }
      });

      // Bounding box hesapla
      const box = new THREE.Box3().setFromObject(baseScene);
      const size = new THREE.Vector3();
      box.getSize(size);

      // Ölçekleme (Bulvar kenarında heybetli gökdelen blokları)
      const targetBlockLength = 65.0; // 65 metrelik blok
      const s = targetBlockLength / (size.z || 1);

      // Peş peşe dizilecek 6 optimize şehir bloğu (3 Sol, 3 Sağ - Kaldırım kenarı x = ±26m)
      const blockPositions = [
        // Sol Taraf (x = -26.0)
        { x: -26.0, z: -65.0, rotY: 0 },
        { x: -26.0, z: 0.0, rotY: 0 },
        { x: -26.0, z: 65.0, rotY: 0 },
        // Sağ Taraf (x = 26.0)
        { x: 26.0, z: -65.0, rotY: Math.PI },
        { x: 26.0, z: 0.0, rotY: Math.PI },
        { x: 26.0, z: 65.0, rotY: Math.PI }
      ];

      // Prosedürel geçici binaları sahneden kaldır
      if (this.proceduralBlocks && this.proceduralBlocks.length > 0) {
        this.proceduralBlocks.forEach(b => this.scene.remove(b));
        this.cityBlocks = [];
      }

      blockPositions.forEach(cfg => {
        const clone = baseScene.clone(true);
        clone.scale.set(s, s, s);

        const b = new THREE.Box3().setFromObject(clone);
        clone.position.x = cfg.x;
        clone.position.y = -b.min.y;
        clone.position.z = cfg.z;
        clone.rotation.y = cfg.rotY;

        this.scene.add(clone);
        this.cityBlocks.push(clone);
      });

      console.log(`[HighwayEngine] 3D Şehir Modeli (city.glb) bulvar kenarına (6 blok, 195m) yerleştirildi!`);
    }, undefined, err => {
      console.warn('[HighwayEngine] city.glb arka plan yükleme uyarısı (Prosedürel şehir devrede):', err.message);
    });

    // 3. Uzak Ufuk Metropol Silueti (360 derece çevreleyen gökdelenler)
    this.initDistantSkyline();
  }

  // 0 Milisaniye Anında Yüklenen Gece Şehri Silueti
  initInstantProceduralCity() {
    this.proceduralBlocks = [];

    const blockConfigs = [
      { x: -26.0, z: -65.0, rotY: 0 },
      { x: -26.0, z: 0.0, rotY: 0 },
      { x: -26.0, z: 65.0, rotY: 0 },
      { x: 26.0, z: -65.0, rotY: Math.PI },
      { x: 26.0, z: 0.0, rotY: Math.PI },
      { x: 26.0, z: 65.0, rotY: Math.PI }
    ];

    const towerColors = [0x1e293b, 0x0f172a, 0x334155, 0x18181b];
    const windowMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const cyanBandMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    blockConfigs.forEach(cfg => {
      const blockGroup = new THREE.Group();

      const buildings = [
        { dx: 0, dz: -14, w: 10, d: 11, h: 32 },
        { dx: -2, dz: 0, w: 12, d: 12, h: 48 },
        { dx: 1, dz: 14, w: 11, d: 10, h: 28 }
      ];

      buildings.forEach((b, bIdx) => {
        const mat = new THREE.MeshLambertMaterial({ color: towerColors[bIdx % towerColors.length] });
        const tower = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
        tower.position.set(b.dx, b.h / 2, b.dz);
        blockGroup.add(tower);

        // Işıklı Pencere Şeritleri
        for (let floor = 4; floor < b.h - 4; floor += 3.5) {
          const winBand = new THREE.Mesh(
            new THREE.BoxGeometry(b.w * 0.75, 0.45, 0.1),
            windowMat
          );
          winBand.position.set(b.dx, floor, b.dz + b.d / 2 + 0.06);
          blockGroup.add(winBand);
        }

        // Çatı Neon Hattı
        const neonBorder = new THREE.Mesh(
          new THREE.BoxGeometry(b.w + 0.1, 0.4, b.d + 0.1),
          cyanBandMat
        );
        neonBorder.position.set(b.dx, b.h + 0.2, b.dz);
        blockGroup.add(neonBorder);

        // Çatı İletişim Kulesi & Kırmızı Havacılık İkaz Işığı
        if (b.h > 40) {
          const spire = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.3, 7.0, 6),
            this.materials.lampPole
          );
          spire.position.set(b.dx, b.h + 3.5, b.dz);
          blockGroup.add(spire);

          const beacon = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xef4444 })
          );
          beacon.position.set(b.dx, b.h + 7.1, b.dz);
          blockGroup.add(beacon);
        }
      });

      blockGroup.position.set(cfg.x, 0, cfg.z);
      blockGroup.rotation.y = cfg.rotY;

      this.scene.add(blockGroup);
      this.cityBlocks.push(blockGroup);
      this.proceduralBlocks.push(blockGroup);
    });

    console.log('[HighwayEngine] 0ms Anında Prosedürel Şehir Silueti devrede! Harita bekleme süresi sıfırlandı.');
  }

  // -------------------------------------------------------------
  // 2.2 Ufuk Çizgisini Kapatan 360° Kesintisiz Metropol Silueti
  // -------------------------------------------------------------
  initDistantSkyline() {
    this.distantBlocks = [];
    const distantGroup = new THREE.Group();

    const dTowerColors = [0x0f172a, 0x1e293b, 0x020617, 0x1e1b4b, 0x111827];
    const dWindowMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.75 });
    const dSpireMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

    // 1. Yan Kanatlar (Sol ve Sağ Derinlik Hatları: X = -85, +85)
    [-85, 85].forEach(sideX => {
      for (let dz = -260; dz <= 260; dz += 36) {
        const h = 50 + Math.sin(dz * 0.08) * 25 + (Math.abs(dz) % 18);
        const w = 18 + (Math.abs(dz) % 8);
        const d = 16 + (Math.abs(dz) % 6);

        const towerMat = new THREE.MeshLambertMaterial({
          color: dTowerColors[Math.floor(Math.abs(dz) % dTowerColors.length)]
        });
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), towerMat);
        tower.position.set(sideX, h / 2, dz);
        distantGroup.add(tower);

        for (let fl = 8; fl < h - 8; fl += 6.0) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 0.45, d + 0.1), dWindowMat);
          win.position.set(sideX, fl, dz);
          distantGroup.add(win);
        }

        const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.4, 9, 4), dSpireMat);
        spire.position.set(sideX, h + 4.5, dz);
        distantGroup.add(spire);

        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 6), beaconMat);
        beacon.position.set(sideX, h + 9.2, dz);
        distantGroup.add(beacon);
      }
    });

    // 2. Ön ve Arka Ufuk Çizgisi (Kameranın baktığı yönlerde asla boşluk kalmaz)
    [-270, 270].forEach(endZ => {
      for (let dx = -140; dx <= 140; dx += 32) {
        if (Math.abs(dx) < 18) continue; // Yol eksenini çok az açık bırak ama arka planı kapat
        const h = 55 + Math.cos(dx * 0.1) * 25 + (Math.abs(dx) % 20);
        const w = 20 + (Math.abs(dx) % 8);
        const d = 18 + (Math.abs(dx) % 6);

        const towerMat = new THREE.MeshLambertMaterial({
          color: dTowerColors[Math.floor(Math.abs(dx) % dTowerColors.length)]
        });
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), towerMat);
        tower.position.set(dx, h / 2, endZ);
        distantGroup.add(tower);

        for (let fl = 8; fl < h - 8; fl += 6.5) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.45, d * 0.72), dWindowMat);
          win.position.set(dx, fl, endZ);
          distantGroup.add(win);
        }

        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 6), beaconMat);
        beacon.position.set(dx, h + 1.0, endZ);
        distantGroup.add(beacon);
      }
    });

    this.scene.add(distantGroup);
    this.distantBlocks.push(distantGroup);
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
  // 4. Drift & Burnout & Kıvılcım Parçacık Sistemi
  // -------------------------------------------------------------
  initParticlePool() {
    // 60 adet yeniden kullanılabilir duman küresi
    const geom = new THREE.SphereGeometry(0.22, 5, 5);
    for (let i = 0; i < 60; i++) {
      const p = new THREE.Mesh(geom, this.materials.smokeWhite.clone());
      p.visible = false;
      this.scene.add(p);
      this.smokePool.push(p);
    }
  }

  emitDriftSmoke(worldPos, count = 3) {
    for (let i = 0; i < count; i++) {
      const p = this.smokePool.find(item => !item.visible);
      if (!p) break;

      p.visible = true;
      p.position.set(
        worldPos.x + (Math.random() - 0.5) * 0.8,
        0.18 + Math.random() * 0.15,
        worldPos.z - 1.8 - Math.random() * 0.4
      );
      p.scale.set(1.0, 1.0, 1.0);
      p.material.opacity = 0.65;
      p.userData = {
        vx: (Math.random() - 0.5) * 1.5,
        vy: 0.8 + Math.random() * 1.2,
        vz: -2.0 - Math.random() * 3.0,
        grow: 2.8 + Math.random() * 1.5,
        life: 0.65
      };
      this.activeParticles.push(p);
    }
  }

  emitBurnoutSmoke(worldPos, count = 8) {
    for (let i = 0; i < count; i++) {
      const p = this.smokePool.find(item => !item.visible);
      if (!p) break;

      p.visible = true;
      p.position.set(
        worldPos.x + (Math.random() - 0.5) * 1.4,
        0.2 + Math.random() * 0.25,
        worldPos.z - 1.9 - Math.random() * 0.5
      );
      p.scale.set(1.4, 1.4, 1.4);
      p.material.opacity = 0.85;
      p.userData = {
        vx: (Math.random() - 0.5) * 3.0,
        vy: 1.5 + Math.random() * 2.5,
        vz: -2.0 - Math.random() * 4.0,
        grow: 4.2 + Math.random() * 2.0,
        life: 0.95
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
      p.scale.set(0.4, 0.4, 0.4);
      p.userData = {
        vx: (Math.random() - 0.5) * 2.5,
        vy: 0.8 + Math.random() * 1.5,
        vz: -1.0 - Math.random() * 4.0,
        grow: 0.5,
        life: 0.35,
        isSpark: true
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
      const chosenColor = colors[Math.floor(Math.random() * colors.length)];
      p.material = new THREE.MeshBasicMaterial({ color: chosenColor, transparent: true, opacity: 1.0 });

      const angle = Math.random() * Math.PI * 2;
      const speed = 5.0 + Math.random() * 10.0;
      const upSpeed = (Math.random() - 0.2) * 8.0;

      p.scale.set(0.35, 0.35, 0.35);
      p.userData = {
        vx: Math.cos(angle) * speed,
        vy: upSpeed,
        vz: Math.sin(angle) * speed,
        grow: -0.12,
        life: 1.2 + Math.random() * 0.5,
        isSpark: false,
        isFirework: true
      };
      this.activeParticles.push(p);
    }
  }

  // -------------------------------------------------------------
  // 5. Asfaltta Kalan Lastik İzi (Skid Marks) Sistemi (Kesintisiz Şeritler)
  // -------------------------------------------------------------
  initSkidMarkPool() {
    // Birim quad geometrisi (Z ekseninde 1.0m, kalınlık 0.28m)
    const geom = new THREE.PlaneGeometry(0.28, 1.0);
    geom.rotateX(-Math.PI / 2); // Yere paralel asfalt temas yüzeyi

    for (let i = 0; i < 300; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x0a0c10,
        transparent: true,
        opacity: 0.90,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.visible = false;
      this.skidMarkPool.push(mesh);
    }

    this.lastWheelPositions = {};
  }

  emitSkidMarks(carId, worldPos, yawAngle = 0, isMotor = false) {
    // Aracın bulunduğu en yakın yol segmentini bul
    let bestSeg = this.roadSegments[0];
    let minDist = Math.abs(worldPos.z - bestSeg.position.z);
    for (let i = 1; i < this.roadSegments.length; i++) {
      const d = Math.abs(worldPos.z - this.roadSegments[i].position.z);
      if (d < minDist) {
        minDist = d;
        bestSeg = this.roadSegments[i];
      }
    }
    if (!bestSeg) return;

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
      const curLocalX = wx;
      const curLocalZ = wz - bestSeg.position.z;
      const key = `${carId || 'c'}_${idx}`;

      const prev = this.lastWheelPositions[key];
      if (!prev || prev.seg !== bestSeg) {
        this.lastWheelPositions[key] = { x: curLocalX, z: curLocalZ, seg: bestSeg };
        return;
      }

      const dx = curLocalX - prev.x;
      const dz = curLocalZ - prev.z;
      const dist = Math.hypot(dx, dz);

      // Çok minik adımlarda boşa mesh harcama (en az 12 cm hareket)
      if (dist < 0.12) return;

      const mark = this.skidMarkPool.find(m => !m.visible);
      if (!mark) return;

      const midX = (prev.x + curLocalX) / 2;
      const midZ = (prev.z + curLocalZ) / 2;
      const trackAngle = Math.atan2(dx, dz);

      mark.visible = true;
      mark.material.opacity = 0.90;
      // 0.35m ek bindirme (overlap) ile kesiklik tamamen yok edilir, pürüzsüz sürekli kauçuk şeridi oluşur
      mark.scale.set(1.0, 1.0, dist + 0.35);
      mark.position.set(midX, 0.012, midZ);
      mark.rotation.y = trackAngle;
      mark.userData = { life: 9.0, seg: bestSeg };

      if (mark.parent !== bestSeg) {
        if (mark.parent) mark.parent.remove(mark);
        bestSeg.add(mark);
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

    // 1. Asfalt Bulvar Segmentlerini Döndür (640m kesintisiz sonsuz döngü)
    this.roadSegments.forEach(seg => {
      seg.position.z -= moveDist;
      if (seg.position.z < -320) {
        seg.position.z += 640;
      }
    });

    // 2. 3D Şehir Bloklarını Akıcı Döndür (195m kesintisiz cadde döngüsü)
    this.cityBlocks.forEach(block => {
      block.position.z -= moveDist;
      if (block.position.z < -97.5) {
        block.position.z += 195.0;
      }
    });

    // 3. Uzak Metropol Ufuk Çizgisi: 360° sabit çevre silueti (Hiçbir açıda boşluk kalmaz)
    // Sabit metropol ufku ile gerçek dünya derinlik hissi kilitlendi.

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
        if (p.userData.isSpark || p.userData.isFirework) p.material = this.materials.smokeWhite;
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

      if (!p.userData.isSpark) {
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
