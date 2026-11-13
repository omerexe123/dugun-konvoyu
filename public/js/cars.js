/**
 * Düğün Konvoyu - 3D Araç & Motosiklet Fabrikası
 * Gerçek GLB Modelleri + Siyah Mercedes C220 Gelin Arabası + 3D İnsan Sürücülü Motosikletler
 */

const CarFactory = {
  gltfCache: {},
  isLoading: false,
  isLoaded: false,

  materials: {
    tire: new THREE.MeshLambertMaterial({ color: 0x111111 }),
    rimChrome: new THREE.MeshLambertMaterial({ color: 0xdde1e4 }),
    glass: new THREE.MeshLambertMaterial({ color: 0x0a101d, transparent: true, opacity: 0.88 }),
    chrome: new THREE.MeshLambertMaterial({ color: 0xedf2f4 }),
    plasticDark: new THREE.MeshLambertMaterial({ color: 0x18181b }),
    ribbonWhite: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    flowerRed: new THREE.MeshLambertMaterial({ color: 0xd90429 }),
    flowerPink: new THREE.MeshLambertMaterial({ color: 0xff4d6d }),
    exhaustFlame: new THREE.MeshBasicMaterial({ color: 0x00f5d4 }),
    exhaustFlameOrange: new THREE.MeshBasicMaterial({ color: 0xff6b35 }),
    leatherBlack: new THREE.MeshLambertMaterial({ color: 0x141416 }),
    helmetVisor: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.95 }),
    skinTone: new THREE.MeshLambertMaterial({ color: 0xfceade })
  },

  // 10 Gerçek Otoyol Canavarı (hlX, hlY, hlZ: Farların tam 3D model far yuvası içine oturması için kernel koordinatları)
  TIER_MAP: {
    1: { file: 'models/volkswagen_golf_gti_2025.glb', targetL: 4.35, rotY: Math.PI, name: 'VW Golf GTI 2025', hlX: 0.62, hlY: 0.62, hlZ: 2.02 },
    2: { file: 'models/2017_volkswagen_polo_sedan.glb', targetL: 4.45, rotY: 0, name: 'VW Polo Sedan', hlX: 0.60, hlY: 0.62, hlZ: 2.08 },
    3: { file: 'models/volkswagen_jetta_gli_2025.glb', targetL: 4.65, rotY: Math.PI, name: 'VW Jetta GLI', hlX: 0.62, hlY: 0.60, hlZ: 2.18 },
    4: { file: 'models/volkswagen_virtus_2026.glb', targetL: 4.55, rotY: Math.PI, name: 'VW Virtus 2026', hlX: 0.60, hlY: 0.62, hlZ: 2.12 },
    5: { file: 'models/bmw_335i.glb', targetL: 4.65, rotY: 0, name: 'BMW 335i Twin-Turbo', hlX: 0.62, hlY: 0.58, hlZ: 2.18 },
    6: { file: 'models/honda_s2000_ultimate_edition.glb', targetL: 4.30, rotY: 0, name: 'Honda S2000 Drift King', hlX: 0.60, hlY: 0.52, hlZ: 2.02 },
    7: { file: 'models/mercedes_a45s_amg_sedan.glb', targetL: 4.55, rotY: 0, name: 'Mercedes-AMG A45S', hlX: 0.62, hlY: 0.60, hlZ: 2.12 },
    8: { file: 'models/bmw_m5_e39.glb', targetL: 4.80, rotY: 0, name: 'BMW M5 E39 V8', hlX: 0.60, hlY: 0.60, hlZ: 2.22 },
    9: { file: 'models/bmw_x7_m60i.glb', targetL: 5.15, rotY: 0, name: 'BMW X7 M60i SUV', hlX: 0.70, hlY: 0.80, hlZ: 2.40 },
    10: { file: 'models/bmw_g20_330i.glb', targetL: 4.80, rotY: 0, name: 'BMW 330i M-Sport Competition', hlX: 0.64, hlY: 0.62, hlZ: 2.25 }
  },

  // Özel Motosiklet Kademeleri (5 TL'lik TikTok Hediyesi)
  MOTOR_MAP: {
    1: { file: 'models/2022_yamaha_r1.glb', targetL: 2.20, rotY: Math.PI, name: 'Yamaha YZF-R1 Superbike', hlX: 0.11, hlY: 0.78, hlZ: 0.98 },
    2: { file: 'models/kawasaki_ninja_zx-6r.glb', targetL: 2.25, rotY: 0, name: 'Kawasaki Ninja ZX-6R', hlX: 0.12, hlY: 0.76, hlZ: 1.01 },
    3: { file: 'models/bajaj_pulsar_200fs_concept.glb', targetL: 2.15, rotY: Math.PI / 2, name: 'Bajaj Pulsar 200FS', hlX: 0.10, hlY: 0.86, hlZ: 0.96 },
    4: { file: 'models/honda_twister_300.glb', targetL: 2.10, rotY: -Math.PI / 2, name: 'Honda CB Twister 300', hlX: 0.0, hlY: 0.82, hlZ: 0.95 }
  },

  GELIN_MODEL: 'models/mercedes-_benz_w206_c220.glb',
  GELIN_ROT_Y: 0,

  init() {
    if (this.isLoading || this.isLoaded) return;
    this.isLoading = true;

    if (typeof THREE.GLTFLoader === 'undefined') {
      console.warn('[CarFactory] GLTFLoader bulunamadı.');
      return;
    }

    const loader = new THREE.GLTFLoader();
    const filesToLoad = new Set([
      this.GELIN_MODEL,
      ...Object.values(this.TIER_MAP).map(t => t.file),
      ...Object.values(this.MOTOR_MAP).map(m => m.file)
    ]);

    const fileList = Array.from(filesToLoad);
    let loaded = 0;

    // Donmayı önlemek için modeller aynı anda değil, 2 paralel kuyrukla indirilir
    const queue = fileList.slice();
    const pump = () => {
      const f = queue.shift();
      if (!f) return;
      loader.load(
        f,
        gltf => {
          this.gltfCache[f] = gltf.scene;
          this.queueTexturesForUpload(gltf.scene);
          loaded++;
          pump();
          // Model yüklenir yüklenmez bekletmeden anında sahneyi güncelle
          // Tüm arabaları her modelde baştan kurmak yerine toplu (debounce) yenile
          clearTimeout(this._reloadTimer);
          const doReload = () => {
            if (this._texPumping) { this._reloadTimer = setTimeout(doReload, 200); return; }
            if (window.convoy && typeof window.convoy.reloadAllCars === 'function') {
              window.convoy.reloadAllCars();
            }
          };
          this._reloadTimer = setTimeout(doReload, 400);
          if (loaded === fileList.length) {
            this.isLoaded = true;
            this.isLoading = false;
            console.log(`[CarFactory] Tüm ${loaded} GLB modeli yüklendi!`);
          }
        },
        undefined,
        err => {
          pump();
          console.warn(`[CarFactory] Model yükleme hatası (${f}):`, err.message);
          loaded++;
          if (loaded === fileList.length) {
            this.isLoaded = true;
            this.isLoading = false;
          }
        }
      );
    };
    pump();
    pump();
  },

  // Büyük GLB dokularını GPU'ya kare başına 1 adet yükle (araç ilk göründüğünde oluşan donmayı engeller, kalite aynı)
  _texQueue: [],
  _texPumping: false,
  queueTexturesForUpload(scene) {
    const seen = new Set();
    scene.traverse(ch => {
      if (!ch.isMesh || !ch.material) return;
      (Array.isArray(ch.material) ? ch.material : [ch.material]).forEach(m => {
        ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap'].forEach(k => {
          const t = m[k];
          if (t && !seen.has(t)) { seen.add(t); this._texQueue.push(t); }
        });
      });
    });
    if (this._texPumping) return;
    this._texPumping = true;
    const step = () => {
      const t = this._texQueue.shift();
      if (t && window.renderer && typeof window.renderer.initTexture === 'function') {
        try { window.renderer.initTexture(t); } catch (e) { /* yoksay */ }
      }
      if (this._texQueue.length > 0) requestAnimationFrame(step);
      else this._texPumping = false;
    };
    requestAnimationFrame(step);
  },
  // Kernel seviyesinde evrensel GLB Bounding Box ve Yön Düzelticisi
  normalizeModel(rawScene, targetL, isMotor = false, explicitRotY = Math.PI) {
    const clone = rawScene.clone(true);
    
    // Gerçekçi 3D Gölgeleri Aktifleştir
    clone.traverse(ch => {
      if (ch.isMesh) {
        ch.castShadow = true;
        ch.receiveShadow = true;
      }
    });

    let box = new THREE.Box3().setFromObject(clone);
    let size = new THREE.Vector3();
    box.getSize(size);

    // Açıkça tanımlı rotY açısını uygula (Three.js koordinatında -Z yönü otoyol ileri akışıdır)
    clone.rotation.y = explicitRotY;

    // Hedef boyuta ölçekle
    box.setFromObject(clone);
    box.getSize(size);
    const curLen = size.z || 1;
    const s = targetL / curLen;
    clone.scale.set(s, s, s);

    // Merkezi (X, Z) sıfırla ve tekerlekleri tam asfalt üstüne (Y=0) oturt
    box.setFromObject(clone);
    const center = new THREE.Vector3();
    box.getCenter(center);
    clone.position.x -= center.x;
    clone.position.z -= center.z;
    clone.position.y -= box.min.y;

    return clone;
  },

  // Asfalta Çakılı Gerçekçi Zemin Gölgesi (Contact Shadow Blob)
  shadowMaterials: [],
  currentShadowOpacity: 0.65,

  setShadowOpacity(val) {
    this.currentShadowOpacity = Math.max(0, Math.min(1.0, val));
    for (let i = this.shadowMaterials.length - 1; i >= 0; i--) {
      const mat = this.shadowMaterials[i];
      if (mat) {
        mat.opacity = this.currentShadowOpacity;
      }
    }
  },

  createContactShadow(width = 2.1, length = 4.6, opacity = null) {
    if (!this.shadowTexture) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createRadialGradient(64, 128, 14, 64, 128, 62);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.90)');
      grad.addColorStop(0.45, 'rgba(0, 0, 0, 0.55)');
      grad.addColorStop(0.80, 'rgba(0, 0, 0, 0.18)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 256);
      this.shadowTexture = new THREE.CanvasTexture(canvas);
    }

    const shadowOp = (opacity !== null) ? opacity : this.currentShadowOpacity;
    const geo = new THREE.PlaneGeometry(width, length);
    const mat = new THREE.MeshBasicMaterial({
      map: this.shadowTexture,
      transparent: true,
      opacity: shadowOp,
      depthWrite: false
    });
    this.shadowMaterials.push(mat);

    const shadowMesh = new THREE.Mesh(geo, mat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.02; // Asfaltın 2cm üstünde, z-fighting yok
    return shadowMesh;
  },

  // Kernel Seviyesinde Model Bütünlüğünü Koruyan Evrensel Tekerlek Motoru
  // Tüm araba ve motosikletlerin (VW, Mercedes C220, BMW, Honda vb.)
  // tekerleklerini kendi aks merkezinde kusursuz döndürür, tavana fırlamayı %100 engeller.
  setupVehicleWheels(container, isMotor = false) {
    const wheels = [];
    if (!container) return wheels;

    const wheelNodeRegex = /^(wheel-(front|back|rear)(-(left|right))?|(wheel|tire|rim|belvedere|w206_wheel|w206_tire|inmx7m60i_wheel|m_m_tire|polo17wheel|tire_01a|wheel_lf|roda|jerez|alloy|dianteir|traseir|pneu).*(fl|fr|rl|rr)?.*|(front|rear)[_\s](wheel|rim).*)$/i;
    const blacklistRegex = /seat|brake|tub|wiper|light|steering|steer|dash|panel|gauge|dial|door|bumper|skirt|\btrim\b|caliper|exhaust|mirror|glass|holder|bracket|arm|cover|fender|guard|wire|plate|cyl|dummy/i;
    // Bütün arabayı veya birden fazla tekeri içeren üst montaj kök grupları (bunları atla, altındaki 4 teker aksını seç)
    const rootAssemblyRegex = /^(wheels?(\.\d+)?(_\d+)?|belvedere_18_\d+|jerez_19_\d+|alloy_15_\d+|scene.*)$/i;

    const candidates = [];

    container.traverse(ch => {
      if (!ch) return;
      const name = ch.name || '';
      if (blacklistRegex.test(name)) return;
      if (rootAssemblyRegex.test(name)) return;

      // 1. Düğüm adı kuralı
      if (wheelNodeRegex.test(name)) {
        candidates.push(ch);
        return;
      }

      // 2. Malzeme bazlı (Yamaha, BMW M5, Mercedes vb. modeller)
      if (ch.isMesh && ch.material) {
        const mat = ch.material;
        const matName = (Array.isArray(mat) ? mat.map(m => m.name).join(' ') : (mat.name || '')).toLowerCase();
        if (/front_tire|rear_tire|tire1mtl|felge|a45s_tires|rims\b/i.test(matName)) {
          candidates.push(ch);
        }
      }
    });

    // Filtre: En üst seviyedeki tekil tekerlek aksını (FL, FR, RL, RR) koru!
    // Eğer bir adayın üst ebeveyni zaten adaylar arasındaysa alt parçayı (jant, vida, kapak) dahil etme
    const filtered = candidates.filter(cand => {
      let p = cand.parent;
      while (p && p !== container) {
        if (candidates.includes(p)) return false; // Üst montaj zaten listede, alt parçayı çift döndürme
        p = p.parent;
      }
      return true;
    });

    filtered.forEach(cand => {
      wheels.push(cand);
    });

    return wheels;
  },

  // 4 Adet Kusursuz Spor Alaşım Jant ve Lastik Fabrikası (Honda S2000 vb. modeller için)
  createSportsWheel() {
    const w = new THREE.Group();

    // 1. Kauçuk Dış Lastik (0.64m dış çap, 0.22m taban)
    const tireGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 24);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.82, metalness: 0.1 });
    const tire = new THREE.Mesh(tireGeo, tireMat);
    w.add(tire);

    // 2. Parlak Titanyum Alaşım Jant Çemberi
    const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.23, 20);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.20, metalness: 0.85 });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    w.add(rim);

    // 3. 5 Kollu V-Spoke Spor Jant Kolları
    for (let i = 0; i < 5; i++) {
      const spokeGeo = new THREE.BoxGeometry(0.038, 0.38, 0.04);
      const spoke = new THREE.Mesh(spokeGeo, rimMat);
      spoke.rotation.x = (i * Math.PI) / 2.5;
      w.add(spoke);
    }

    // 4. Havalandırmalı Fren Diski
    const discGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16);
    discGeo.rotateZ(Math.PI / 2);
    const discMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.35, metalness: 0.8 });
    const disc = new THREE.Mesh(discGeo, discMat);
    w.add(disc);

    w.userData.spinAxis = 'x';
    return w;
  },

  // ===========================================================
  // 1. GELİN ARABASI: SİYAH MERCEDES C220 (Birebir Lüks Sedan)
  // ===========================================================
  createGelinArabasi(brideName = 'Gelin', groomName = 'Damat') {
    const group = new THREE.Group();
    const rawGltf = this.gltfCache[this.GELIN_MODEL];

    if (rawGltf) {
      const carMesh = this.normalizeModel(rawGltf, 4.85, false, this.GELIN_ROT_Y);

      // Parlak Metalik Obsidyen Siyah Mercedes Boyası
      carMesh.traverse(ch => {
        if (ch.isMesh && ch.material) {
          const matName = (ch.material.name || '').toLowerCase();
          const meshName = (ch.name || '').toLowerCase();
          if (matName.includes('body') || matName.includes('paint') || matName.includes('car_paint') || meshName.includes('body')) {
            ch.material = new THREE.MeshStandardMaterial({
              color: 0x0c0e12,
              roughness: 0.18,
              metalness: 0.65
            });
          } else if (matName.includes('glass') || matName.includes('window') || meshName.includes('glass')) {
            ch.material = new THREE.MeshStandardMaterial({
              color: 0x0f172a,
              roughness: 0.05,
              metalness: 0.5,
              transparent: true,
              opacity: 0.65
            });
          }
        }
      });
      group.add(carMesh);
      group.userData.wheels = this.setupVehicleWheels(carMesh, false);
    } else {
      // Yüklenene kadar geçici şık siyah gövde
      const blackPaint = new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.2, metalness: 0.8 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.75, 4.8), blackPaint);
      body.position.y = 0.45;
      group.add(body);
    }

    // Kaputta Kırmızı & Pembe Gelin Buketi Kalbi (Ön Kaput +Z)
    const bouquet = new THREE.Group();
    for (let i = 0; i < 28; i++) {
      const col = i % 2 === 0 ? this.materials.flowerRed : this.materials.flowerPink;
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), col);
      flower.position.set((Math.random() - 0.5) * 0.85, 0.08, (Math.random() - 0.5) * 0.8);
      bouquet.add(flower);
    }
    bouquet.position.set(0, 1.02, 1.2);
    group.add(bouquet);

    // Asfalt zemin gölgesi (Contact shadow)
    group.add(this.createContactShadow(2.2, 4.9, 0.72));

    // Kaputtan Dikiz Aynalarına Uzanan Çapraz Kırmızı Düğün Kurdeleleri
    const ribbonL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 1.6), this.materials.flowerRed);
    ribbonL.position.set(-0.48, 1.0, 0.9);
    ribbonL.rotation.y = 0.32;
    group.add(ribbonL);

    const ribbonR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 1.6), this.materials.flowerRed);
    ribbonR.position.set(0.48, 1.0, 0.9);
    ribbonR.rotation.y = -0.32;
    group.add(ribbonR);

    // Aynalarda Dalgalanan Beyaz İpek Kurdeleler
    this.addMirrorRibbons(group, 1.15, 0.95, 0.2);

    // Sunroof'tan El Sallayan 3D Gelin & Damat Çifti
    const couple = this.createBrideAndGroom();
    couple.position.set(0, 1.05, -0.2);
    group.add(couple);

    // Çift Egzoz Alev Çıkışı (Arka Tampon -Z)
    this.createExhaustPipes(group, [-0.55, 0.55], 0.28, -2.3);

    // Lüks Multibeam LED Kristal Farlar (Mercedes far yuvasının tam içine gömülü)
    this.attachHeadlights(group, { isGelin: true, zFront: 2.26, yLight: 0.62, xOffsets: [-0.68, 0.68] });

    // Asfalt Alt Neon Paketi (Gelin arabası asil altın sarısı parıltı ile başlar)
    const neon = this.attachUnderglow(group, { isMotor: false });
    neon.setColor(0xffd700);
    neon.setEnabled(true);

    group.userData.isLeadCar = true;
    return group;
  },

  // ===========================================================
  // 2. 10 GERÇEK KONVOY ARABASI
  // ===========================================================
  createCarByTier(tier, customColorHex = null) {
    const group = new THREE.Group();
    const safeTier = Math.max(1, Math.min(10, tier || 1));
    const config = this.TIER_MAP[safeTier];
    const rawGltf = this.gltfCache[config.file];

    if (rawGltf) {
      const carMesh = this.normalizeModel(rawGltf, config.targetL, false, config.rotY !== undefined ? config.rotY : 0);
      carMesh.traverse(ch => {
        if (ch.isMesh && ch.material) {
          const matName = (ch.material.name || '').toLowerCase();
          const meshName = (ch.name || '').toLowerCase();
          if (matName.includes('body') || matName.includes('paint') || matName.includes('car_paint') || meshName.includes('body')) {
            ch.material.roughness = 0.20;
            ch.material.metalness = 0.58;
            if (ch.material.color && ch.material.color.getHex() === 0x000000) {
              ch.material.color.setHex(0x1a202c);
            }
          }
        }
      });
      group.add(carMesh);

      // Honda S2000 Özel Durumu: Yekpare SketchUp statik jant/lastiklerini gizle, 4 adet dönen spor alaşım jant tak:
      if (safeTier === 6) {
        carMesh.traverse(ch => {
          if (ch.isMesh && ch.material) {
            const matName = (Array.isArray(ch.material) ? ch.material.map(m => m.name).join(' ') : (ch.material.name || '')).toLowerCase();
            if (matName.includes('silver') || matName.includes('charcoal') || matName.includes('snow') || matName.includes('edge_color169') || matName.includes('edge_color192') || matName.includes('brembo')) {
              ch.visible = false;
            }
          }
        });

        const s2000Wheels = [];
        const offsets = [
          [-0.78, 0.33, 1.25],
          [0.78, 0.33, 1.25],
          [-0.78, 0.33, -1.25],
          [0.78, 0.33, -1.25]
        ];
        offsets.forEach(([x, y, z]) => {
          const w = this.createSportsWheel();
          w.position.set(x, y, z);
          group.add(w);
          s2000Wheels.push(w);
        });
        group.userData.wheels = s2000Wheels;
      } else {
        group.userData.wheels = this.setupVehicleWheels(carMesh, false);
      }
    } else {
      // Yüklenene kadar geçici renkli gövde
      const color = customColorHex || 0x2563eb;
      const mat = new THREE.MeshLambertMaterial({ color });
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 4.4), mat);
      body.position.y = 0.45;
      group.add(body);
    }

    // Asfalt zemin gölgesi (Contact shadow)
    group.add(this.createContactShadow(safeTier === 9 ? 2.3 : 2.05, config.targetL * 0.98, 0.65));

    // Aynalarda beyaz düğün kurdelesi
    this.addMirrorRibbons(group, 1.12, 0.9, 0.2);

    // Egzoz boruları (Arka -Z)
    this.createExhaustPipes(group, [-0.5, 0.5], 0.28, -2.15);

    // Kristal Xenon/LED Farlar: 3D modelin gerçek far yuvasının tam içine oturtulur
    const isSUV = safeTier === 9;
    this.attachHeadlights(group, {
      isSUV,
      zFront: config.hlZ !== undefined ? config.hlZ : config.targetL * 0.48,
      yLight: config.hlY !== undefined ? config.hlY : (isSUV ? 0.78 : 0.58),
      xOffsets: config.hlX !== undefined ? [-config.hlX, config.hlX] : (isSUV ? [-0.80, 0.80] : [-0.70, 0.70])
    });

    // Asfalt Alt Neon Paketi (Hediye ile açılabilir)
    this.attachUnderglow(group, { isMotor: false });

    group.userData.tier = safeTier;
    group.userData.carName = config.name;
    return group;
  },

  // ===========================================================
  // 3. 3D İNSAN SÜRÜCÜLÜ MOTOSİKLETLER (Özel 5 TL Hediyesi)
  // ===========================================================
  createMotorcycle(tier = 1, customColorHex = null) {
    const group = new THREE.Group();
    const safeTier = Math.max(1, Math.min(4, tier || 1));
    const config = this.MOTOR_MAP[safeTier];
    const rawGltf = this.gltfCache[config.file];

    // Tek teker (Wheelie) animasyonu için arka teker temas noktası (Y=0, Z=-0.85)
    // Motor öne (+Z) baktığı için arka tekerlek -Z konumundadır!
    const wheeliePivot = new THREE.Group();
    wheeliePivot.position.set(0, 0, -0.85);

    const bikeContainer = new THREE.Group();
    bikeContainer.position.set(0, 0, 0.85);

    if (rawGltf) {
      const bikeMesh = this.normalizeModel(rawGltf, config.targetL, true, config.rotY !== undefined ? config.rotY : 0);
      bikeContainer.add(bikeMesh);
      group.userData.wheels = this.setupVehicleWheels(bikeMesh, true);
    } else {
      // Yüklenene kadar geçici motor gövdesi
      const mat = new THREE.MeshLambertMaterial({ color: 0xef4444 });
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 2.1), mat);
      frame.position.y = 0.5;
      bikeContainer.add(frame);
    }

    // 3D Kasklı Biker İnsan Sürücüsü
    const rider = this.createMotorRider();
    rider.position.set(0, 0.48, 0.08);
    bikeContainer.add(rider);

    // Egzoz alev çıkışı (Arka -Z)
    this.createExhaustPipes(bikeContainer, [0.28], 0.38, -1.05);

    // Motor Ön LED Farı & Işık Huzmesi (Modelin far camı içine tam oturur, tek tekere kalkınca far da havaya kalkar!)
    const mOffsets = (config.hlX && config.hlX > 0) ? [-config.hlX, config.hlX] : [0];
    this.attachHeadlights(bikeContainer, {
      isMotor: true,
      zFront: config.hlZ !== undefined ? config.hlZ : 1.05,
      yLight: config.hlY !== undefined ? config.hlY : 0.76,
      xOffsets: mOffsets
    });

    // Motor Alt Neon Paketi (Hediye ile açılabilir, tek tekere kalkınca şasiyle beraber kalkar)
    const motorNeon = this.attachUnderglow(bikeContainer, { isMotor: true });
    group.userData.neon = motorNeon;

    wheeliePivot.add(bikeContainer);
    group.add(wheeliePivot);

    // Asfalt zemin gölgesi (Contact shadow)
    group.add(this.createContactShadow(0.85, 2.2, 0.55));

    group.userData.wheeliePivot = wheeliePivot;
    group.userData.isMotor = true;
    group.userData.motorTier = safeTier;
    group.userData.carName = config.name;
    return group;
  },

  // 3D Kasklı & Deri Montlu Motorcu İnsan Figürü (Öne +Z Yönüne Bakan)
  createMotorRider() {
    const rider = new THREE.Group();

    // 1. Deri Montlu Gövde (Öne eğik yarış duruşu, +Z yönüne)
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.20, 0.62, 8),
      this.materials.leatherBlack
    );
    torso.position.set(0, 0.45, -0.1);
    torso.rotation.x = -0.35; // Öne kapanış açısı
    rider.add(torso);

    // Sırt Koruma Plakası (Neon Yarış Şeridi - Arkada)
    const backPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.42, 0.04),
      new THREE.MeshLambertMaterial({ color: 0xef4444 })
    );
    backPlate.position.set(0, 0.47, -0.22);
    backPlate.rotation.x = -0.35;
    rider.add(backPlate);

    // 2. Aerodinamik Motorcu Kaskı
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.15, metalness: 0.4 })
    );
    helmet.position.set(0, 0.88, 0.04);
    rider.add(helmet);

    // Kask Aynalı Siyah Vizör (Kameraya +Z Yönüne Bakan)
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 10, 0, Math.PI, 0, Math.PI * 0.45),
      this.materials.helmetVisor
    );
    visor.position.set(0, 0.88, 0.09);
    visor.rotation.x = 0.2;
    visor.rotation.y = 0;
    rider.add(visor);

    // 3. Kollar & Gidon Tutuşu (Öne doğru uzanış)
    [-0.26, 0.26].forEach((side, idx) => {
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.055, 0.52, 6),
        this.materials.leatherBlack
      );
      arm.position.set(side, 0.54, 0.16);
      arm.rotation.x = 0.75;
      arm.rotation.z = side > 0 ? -0.25 : 0.25;
      rider.add(arm);

      // Eldivenler
      const glove = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 6, 6),
        new THREE.MeshLambertMaterial({ color: 0xd90429 })
      );
      glove.position.set(side * 1.05, 0.38, 0.34);
      rider.add(glove);
    });

    // 4. Bacaklar (Depoyu Saran Pozisyon)
    [-0.22, 0.22].forEach(side => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.07, 0.55, 6),
        this.materials.leatherBlack
      );
      leg.position.set(side, 0.24, -0.16);
      leg.rotation.x = -0.55;
      leg.rotation.z = side > 0 ? 0.22 : -0.22;
      rider.add(leg);

      // Bot
      const boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.22),
        this.materials.plasticDark
      );
      boot.position.set(side * 1.15, 0.05, -0.28);
      rider.add(boot);
    });

    return rider;
  },

  // Sunroof'tan El Sallayan 3D Gelin & Damat Çifti
  createBrideAndGroom() {
    const couple = new THREE.Group();

    // 1. Gelin (Sol tarafta, beyaz tül gelinlik)
    const bride = new THREE.Group();
    const brideBody = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.55, 8), this.materials.ribbonWhite);
    brideBody.position.y = 0.28;
    bride.add(brideBody);

    const brideHead = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), this.materials.skinTone);
    brideHead.position.y = 0.65;
    bride.add(brideHead);

    const brideHair = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshLambertMaterial({ color: 0x4a3525 }));
    brideHair.position.set(0, 0.67, -0.04);
    bride.add(brideHair);

    // Gelin Tacı
    const tiara = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 4, 8), new THREE.MeshBasicMaterial({ color: 0xffd700 }));
    tiara.rotation.x = Math.PI / 2;
    tiara.position.set(0, 0.77, 0.02);
    bride.add(tiara);

    // El sallayan sağ kol
    const brideArm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.35, 6), this.materials.skinTone);
    brideArm.position.set(0.24, 0.52, 0);
    brideArm.rotation.z = -0.75;
    bride.add(brideArm);

    bride.position.set(-0.35, 0, 0);
    couple.add(bride);

    // 2. Damat (Sağ tarafta, siyah smokin ve papyon)
    const groom = new THREE.Group();
    const groomBody = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.22, 0.55, 8), this.materials.leatherBlack);
    groomBody.position.y = 0.28;
    groom.add(groomBody);

    // Beyaz Gömlek Yaka & Papyon
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.03), this.materials.ribbonWhite);
    shirt.position.set(0, 0.44, 0.11);
    groom.add(shirt);

    const bow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.04), this.materials.flowerRed);
    bow.position.set(0, 0.48, 0.13);
    groom.add(bow);

    const groomHead = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), this.materials.skinTone);
    groomHead.position.y = 0.65;
    groom.add(groomHead);

    const groomHair = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.28), this.materials.plasticDark);
    groomHair.position.set(0, 0.74, -0.02);
    groom.add(groomHair);

    // El sallayan sol kol
    const groomArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.35, 6), this.materials.leatherBlack);
    groomArm.position.set(0.25, 0.52, 0);
    groomArm.rotation.z = -0.85;
    groom.add(groomArm);

    groom.position.set(0.35, 0, 0);
    couple.add(groom);

    // Kol sallama animatörü
    couple.userData.animate = (time) => {
      brideArm.rotation.z = -0.75 + Math.sin(time * 5.0) * 0.25;
      groomArm.rotation.z = -0.85 + Math.cos(time * 5.0) * 0.25;
    };

    return couple;
  },

  // Aynalarda arkaya doğru dalgalanan beyaz düğün kurdelesi
  addMirrorRibbons(g, mirrorX = 1.15, mirrorY = 0.95, mirrorZ = 0.2) {
    [-mirrorX, mirrorX].forEach(mx => {
      const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.85), this.materials.ribbonWhite);
      ribbon.position.set(mx, mirrorY, mirrorZ - 0.4);
      ribbon.rotation.x = 0.22;
      g.add(ribbon);
    });
  },

  // Egzoz Patlatma Alev Konileri (Arka -Z yönüne dönük)
  createExhaustPipes(g, xOffsets, y, zRear) {
    const flames = [];
    xOffsets.forEach(ex => {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.75, 6), this.materials.exhaustFlame);
      flame.position.set(ex, y, zRear - 0.35);
      flame.rotation.x = -Math.PI / 2;
      flame.visible = false;
      g.add(flame);
      flames.push(flame);
    });
    g.userData.flames = flames;
  },

  // ===========================================================
  // 4. KRİSTAL LED FARLAR & VOLÜMETRİK IŞIK HUZMESİ (SELEKTÖR DESTEKLİ)
  // ===========================================================
  attachHeadlights(group, options = {}) {
    const isMotor = options.isMotor || false;
    const isSUV = options.isSUV || false;
    const isGelin = options.isGelin || false;
    const zFront = options.zFront !== undefined ? options.zFront : (isMotor ? 1.05 : 2.15);
    const yLight = options.yLight !== undefined ? options.yLight : (isSUV ? 0.78 : (isMotor ? 0.70 : 0.58));
    const xOffsets = options.xOffsets || (isMotor ? [-0.08, 0.08] : [-0.70, 0.70]);

    const lenses = [];
    const cones = [];

    // Farların ana kabı
    const lightsContainer = new THREE.Group();

    // 1. Kristal LED Mercekler (3D modelin far yuvasına tam oturan kompakt elmas mercek)
    const lensGeom = new THREE.SphereGeometry(isMotor ? 0.055 : 0.07, 8, 8);
    const lensMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // 2. Volümetrik Işık Huzmesi Konileri (Yola uzanan projektör konisi)
    const coneGeom = new THREE.CylinderGeometry(
      isMotor ? 0.08 : 0.12,  // Üst çap (mercek çıkışı)
      isMotor ? 0.48 : 0.70,  // Alt çap (asfalta yayılan huzme)
      isMotor ? 5.5 : 7.0,    // Işık menzili
      10,
      1,
      true
    );
    // +Z yönüne doğru yatır
    coneGeom.rotateX(-Math.PI / 2);

    xOffsets.forEach(x => {
      // Mercek
      const lens = new THREE.Mesh(lensGeom, lensMat.clone());
      lens.position.set(x, yLight, zFront);
      lightsContainer.add(lens);
      lenses.push(lens);

      // Volümetrik Işık Konisi
      const coneMat = new THREE.MeshBasicMaterial({
        color: isGelin ? 0xfff3d6 : 0xe0f2fe,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const cone = new THREE.Mesh(coneGeom, coneMat);
      const coneRange = isMotor ? 5.5 : 7.0;
      cone.position.set(x * 0.85, yLight - 0.05, zFront + coneRange / 2);
      lightsContainer.add(cone);
      cones.push(cone);
    });

    // 3. GPU Tasarrufu: Forward rendering'de her araçta PointLight olması fragment shader'ı boğar.
    // Görsel far ve selektör etkisi volümetrik Additive koniler ve parıldayan kristal merceklerle
    // 0ms ek maliyetle kusursuz 60 FPS sağlanır.
    group.add(lightsContainer);

    group.userData.headlights = {
      lenses,
      cones,
      spotLight: null,
      baseLensColor: 0xffffff,
      baseConeOpacity: 0.16,
      baseLightIntensity: 0.0,
      isFlashing: false
    };

    return lightsContainer;
  },

  // ===========================================================
  // 5. ASFALTI AYDINLATAN ALT NEON (UNDERGLOW) SİSTEMİ
  // ===========================================================
  attachUnderglow(group, options = {}) {
    const isMotor = options.isMotor || false;
    const width = isMotor ? 0.60 : 1.85;
    const length = isMotor ? 1.30 : 3.50;
    const sideX = 0.82;
    const yGround = 0.035;

    const neonContainer = new THREE.Group();

    // Gerçekçi yumuşak neon ışık dokusu (Soft Radial Glow Canvas Texture)
    if (!CarFactory.neonTexture && typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.65)');
      grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.18)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      CarFactory.neonTexture = new THREE.CanvasTexture(canvas);
    }

    // 1. Asfalta Yayılan Difüze Yumuşak Neon Parıltısı (Zemine paralel)
    const poolGeom = new THREE.PlaneGeometry(width, length);
    poolGeom.rotateX(-Math.PI / 2);

    const poolMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      map: CarFactory.neonTexture || null,
      transparent: true,
      opacity: isMotor ? 0.60 : 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const poolMesh = new THREE.Mesh(poolGeom, poolMat);
    poolMesh.position.y = yGround;
    neonContainer.add(poolMesh);

    // 2. Marşpiyel Altı Parlak Neon Tüpleri (Sadece ARABALAR İÇİNDİR, Motosiklette marşpiyel olmaz!)
    let tubeMat = null;
    if (!isMotor) {
      const tubeGeom = new THREE.BoxGeometry(0.04, 0.03, length * 0.75);
      tubeMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.90,
        blending: THREE.AdditiveBlending
      });

      [-sideX, sideX].forEach(sx => {
        const tube = new THREE.Mesh(tubeGeom, tubeMat);
        tube.position.set(sx, yGround + 0.08, 0);
        neonContainer.add(tube);
      });
    }

    neonContainer.visible = false;
    group.add(neonContainer);

    const neonState = {
      container: neonContainer,
      poolMat,
      tubeMat,
      enabled: false,
      color: 0x00f0ff,
      setColor(hex) {
        this.color = typeof hex === 'string' ? parseInt(hex.replace('#', '0x'), 16) : hex;
        poolMat.color.setHex(this.color);
        if (tubeMat) tubeMat.color.setHex(this.color);
      },
      setEnabled(flag) {
        this.enabled = !!flag;
        neonContainer.visible = this.enabled;
      }
    };

    group.userData.neon = neonState;
    return neonState;
  }
};

window.CarFactory = CarFactory;
