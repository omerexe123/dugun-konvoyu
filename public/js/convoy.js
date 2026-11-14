/**
 * Düğün Konvoyu - Konvoy Dizilimi, Drift, Burnout, Motor Ön Kaldırma (Wheelie),
 * Otomatik Yönetmen Kamerası ve Olay Yöneticisi
 */

class ConvoyManager {
  constructor(scene, camera, controls, audioEngine) {
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;
    this.audio = audioEngine;

    this.leadCar = null;           // Siyah Mercedes C220 Gelin Arabası
    this.convoyCars = {};          // uniqueId -> { group, user, currentPos, targetPos, tier, labelEl, ... }
    this.sortedUserIds = [];
    this.labelsContainer = document.getElementById('labels-container');
    this.banner = document.getElementById('event-banner');

    // Kamera Modu: 0 = Otomatik Canlı Yayın Yönetmeni (Varsayılan), 1-7 = Manuel Açılar
    this.cameraMode = 0;
    this.focusedCarId = null;
    this.focusUntil = 0;
    this.idleTimer = 0;
    this.latestJoinedCarId = null;
    this.joinFocusCarId = null;
    this.joinFocusUntil = 0;
    this.joinFocusStart = 0;
    this.joinFocusDuration = 6000;
    this.locateFocusCarId = null;
    this.locateFocusUntil = 0;
    this.locateFocusStart = 0;
    this.locateFocusDuration = 6500;
    this.currentCamPos = new THREE.Vector3(0, 5.5, 16.0);
    this.currentCamLook = new THREE.Vector3(0, 1.2, 0.0);

    // 60 FPS Sıfır GC Bellek & Layout Thrashing Önleme Havuzu
    this.activeCarsList = [];
    this.tempV = new THREE.Vector3();
    this.viewportW = typeof window !== 'undefined' ? window.innerWidth : 1920;
    this.viewportH = typeof window !== 'undefined' ? window.innerHeight : 1080;
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        this.viewportW = window.innerWidth;
        this.viewportH = window.innerHeight;
      });
    }

    this.initLeadCar();

    window.convoy = this;
  }

  hashString(str) {
    let hash = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash) + s.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  // Konvoyu Tamamen Sıfırla: Sadece Gelin & Damat Arabası Kalsın!
  resetToLeadCarOnly(brideName = 'Gelin Hanım 👰', groomName = 'Damat Bey 🤵') {
    // 1. Sahnedeki tüm konvoy araçlarını ve DOM etiketlerini kaldır
    Object.values(this.convoyCars).forEach(cObj => {
      if (cObj.group) this.scene.remove(cObj.group);
      if (cObj.labelEl && cObj.labelEl.parentNode) {
        cObj.labelEl.parentNode.removeChild(cObj.labelEl);
      }
    });
    this.convoyCars = {};
    this.activeCarsList = [];
    this.focusedCarId = null;

    // 2. Gelin arabası çift isimlerini güncelle
    this.updateLeadCarCouple(brideName, groomName);

    // 3. HUD lider adını sıfırla
    const leaderEl = document.getElementById('hud-leader-name');
    if (leaderEl) leaderEl.textContent = 'Konvoy Boş (Katıl bekleniyor)';

    // 4. Kamerayı gelin arabasına odakla
    this.cameraMode = 0;
    this.currentCamPos.set(0, 6.2, 19.0);
    this.currentCamLook.set(0, 1.2, 6.0);
  }

  // Alt Neon özelliği tamamen kaldırıldı
  setCarNeon() {}

  // Tek bir GLB modeli indiğinde sadece o modeli kullanan aracı yenile (Donmayı sıfırlayan cerrahi güncelleme)
  refreshCarMesh(cObj) {
    if (!cObj || !cObj.group) return;
    const isMotorcycle = cObj.isMotor;
    const targetTier = isMotorcycle ? (cObj.user.motorTier || 1) : (cObj.user.tier || 1);
    while (cObj.group.children.length > 0) {
      cObj.group.remove(cObj.group.children[0]);
    }
    cObj.carMesh = null;
    let newVehicle = isMotorcycle ? CarFactory.createMotorcycle(targetTier) : CarFactory.createCarByTier(targetTier);
    cObj.group.add(newVehicle);
    cObj.carMesh = newVehicle;
    cObj.tier = targetTier;
    cObj.group.userData.wheels = newVehicle.userData.wheels || [];
    cObj.group.userData.wheeliePivot = newVehicle.userData.wheeliePivot || null;
    this.updateCarLabel(cObj.user, cObj, cObj.rankIdx);
  }

  refreshLeadCar() {
    if (!this.leadCar) return;
    const oldPos = this.leadCar.position.clone();
    this.scene.remove(this.leadCar);
    this.leadCar = CarFactory.createGelinArabasi('Gelin', 'Damat');
    this.leadCar.position.copy(oldPos);
    this.scene.add(this.leadCar);
  }

  reloadAllCars() {
    if (this.leadCar) {
      this.scene.remove(this.leadCar);
      this.initLeadCar();
    }
    Object.values(this.convoyCars).forEach(cObj => {
      cObj.tier = -1;
      if (cObj.carMesh) {
        cObj.group.remove(cObj.carMesh);
        cObj.carMesh = null;
      }
      this.spawnOrUpdateCar(cObj.user, cObj.rankIdx);
    });
  }

  // Öncü Siyah Mercedes Gelin Arabası (Konvoyun Başında, Z = 6.0)
  initLeadCar() {
    this.leadCar = CarFactory.createGelinArabasi('Gelin', 'Damat');
    this.leadCar.position.set(0, 0, 6.0);
    this.scene.add(this.leadCar);

    // Gelin Arabası Üstünde Yüzen Bordo 3D Plaka (Yağmur ❤️ Enes)
    if (!this.leadLabelEl) {
      this.leadLabelEl = document.createElement('div');
      this.leadLabelEl.className = 'lead-car-label';
      this.leadLabelEl.id = 'lead-car-label';
      this.leadLabelEl.innerHTML = `<span id="lead-bride-name">Gelin Hanım</span> <span class="lead-heart">❤️</span> <span id="lead-groom-name">Damat Bey</span>`;
      this.labelsContainer.appendChild(this.leadLabelEl);
    }
  }

  updateLeadCarCouple(brideName, groomName) {
    const brideEl = document.getElementById('lead-bride-name');
    const groomEl = document.getElementById('lead-groom-name');
    if (brideEl) brideEl.textContent = brideName || 'Gelin';
    if (groomEl) groomEl.textContent = groomName || 'Damat';
  }

  // Konvoy Başlangıç Durumunu Eşitle
  syncInitialState(payload) {
    const { gameState, sortedConvoy } = payload;
    this.updateLeadCarCouple(gameState.brideName, gameState.groomName);

    if (sortedConvoy && sortedConvoy.length > 0) {
      const leaderEl = document.getElementById('hud-leader-name');
      if (leaderEl) leaderEl.textContent = sortedConvoy[0].nickname;
    }

    sortedConvoy.forEach((u, rankIdx) => {
      this.spawnOrUpdateCar(u, rankIdx);
    });
  }

  spawnOrUpdateCar(user, rankIdx = 0) {
    let cObj = this.convoyCars[user.uniqueId];

    // 3 Şeritli Ultra-Ferah Konvoy Dizilimi (Aynı kadrajda en fazla 3 araba kuralı)
    // Şeritler: 0: Orta Şerit (0m), 1: Sağ Şerit (3.50m), 2: Sol Şerit (-3.50m)
    const laneOffsetsX = [0, 3.50, -3.50];
    const targetX = laneOffsetsX[rankIdx % 3];
    // Ultra-ferah takip mesafesi: Gelin arabası arkası 20m VIP koridoru, sıralar arası net 22m aralık!
    const targetZ = -20.0 - rankIdx * 22.0;

    const isMotorcycle = user.vehicleType === 'motor';

    if (!cObj) {
      const group = new THREE.Group();
      this.scene.add(group);

      const labelEl = document.createElement('div');
      labelEl.className = 'car-label';
      labelEl.id = `label-${user.uniqueId}`;
      this.labelsContainer.appendChild(labelEl);

      cObj = {
        group,
        carMesh: null,
        user,
        currentPos: new THREE.Vector3(targetX, 0, targetZ),
        targetPos: new THREE.Vector3(targetX, 0, targetZ),
        tier: 0,
        isMotor: isMotorcycle,
        labelEl,
        rankIdx,
        isOvertaking: false,
        isDrifting: false,
        isBurnout: false,
        isWheelie: false,
        giftFocusUntil: 0
      };
      group.position.copy(cObj.currentPos);
      this.convoyCars[user.uniqueId] = cObj;
      this.latestJoinedCarId = user.uniqueId;
    }

    this.latestJoinedCarId = user.uniqueId;
    cObj.rankIdx = rankIdx;
    cObj.user = user;

    // Araç kademesi: Beğeni ile araç artmaz, yeni kullanıcılar Tier 1 başlar, hediye ile yükselir!
    const targetTier = isMotorcycle ? (user.motorTier || 1) : (user.tier || 1);

    // Araç Tipi veya Kademesi Değişmişse Yenile
    const needsRebuild = (cObj.isMotor !== isMotorcycle) || (cObj.tier !== targetTier);
    if (needsRebuild) {
      // Eski araba/motor kalıntılarını temizle
      while (cObj.group.children.length > 0) {
        cObj.group.remove(cObj.group.children[0]);
      }
      cObj.carMesh = null;

      let newVehicle;
      if (isMotorcycle) {
        newVehicle = CarFactory.createMotorcycle(targetTier);
        cObj.isMotor = true;
        cObj.tier = targetTier;
      } else {
        newVehicle = CarFactory.createCarByTier(targetTier);
        cObj.isMotor = false;
        cObj.tier = targetTier;
      }

      cObj.group.add(newVehicle);
      cObj.carMesh = newVehicle;
      cObj.group.userData.wheels = newVehicle.userData.wheels || [];
      cObj.group.userData.wheeliePivot = newVehicle.userData.wheeliePivot || null;
    }

    // Hedef Konumu Belirle
    if (!cObj.isOvertaking && !cObj.isDrifting) {
      cObj.targetPos.set(targetX, 0, targetZ);
    }

    this.updateCarLabel(user, cObj, rankIdx);
    this.activeCarsList = Object.values(this.convoyCars);
  }

  updateCarLabel(user, cObj, rankIdx) {
    if (!cObj || !cObj.labelEl) return;
    const isLead = rankIdx === 0;
    const isMotor = cObj.isMotor;
    const fallbackSeed = encodeURIComponent(user.uniqueId || 'guest');
    const avatarUrl = user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${fallbackSeed}`;

    let card = cObj.labelEl.querySelector('.user-plate-card');
    if (!card) {
      cObj.labelEl.innerHTML = `
        <div class="user-plate-card ${isLead ? 'plate-lead' : (isMotor ? 'plate-motor' : 'plate-car')}">
          <div class="plate-avatar-wrap">
            <img class="plate-avatar-img" referrerpolicy="no-referrer" data-src="${avatarUrl}" src="${avatarUrl}" onerror="this.onerror=null;this.src='https://api.dicebear.com/7.x/bottts/svg?seed=${fallbackSeed}'" />
            ${isLead ? '<span class="plate-crown">👑</span>' : ''}
          </div>
          <div class="plate-nick-tag">${user.nickname || 'Misafir'}</div>
        </div>
      `;
      return;
    }

    // Kart sınıfını güncelle
    const targetClass = `user-plate-card ${isLead ? 'plate-lead' : (isMotor ? 'plate-motor' : 'plate-car')}`;
    if (card.className !== targetClass) card.className = targetClass;

    // Avatar görselini güncelle
    const imgEl = card.querySelector('.plate-avatar-img');
    if (imgEl && imgEl.getAttribute('data-src') !== avatarUrl) {
      imgEl.setAttribute('data-src', avatarUrl);
      imgEl.src = avatarUrl;
    }

    // Taç kontrolü
    const crownEl = card.querySelector('.plate-crown');
    if (isLead && !crownEl) {
      const wrap = card.querySelector('.plate-avatar-wrap');
      if (wrap) wrap.insertAdjacentHTML('beforeend', '<span class="plate-crown">👑</span>');
    } else if (!isLead && crownEl) {
      crownEl.remove();
    }

    // Kullanıcı adı
    const nickEl = card.querySelector('.plate-nick-tag');
    if (nickEl && nickEl.textContent !== (user.nickname || 'Misafir')) {
      nickEl.textContent = user.nickname || 'Misafir';
    }
  }

  // -------------------------------------------------------------
  // 1. GÜL HEDİYESİ -> UZUN VE GERÇEKÇİ 60 FPS DRİFT (LASTİK İZLERİ DAHİL)
  // -------------------------------------------------------------
  triggerDrift(uniqueId) {
    const cObj = this.convoyCars[uniqueId];
    if (!cObj || cObj.isDrifting) return;

    cObj.isDrifting = true;
    this.focusCar(uniqueId, 5000);

    if (this.audio) this.audio.playTireDrift();
    this.showBanner(`🌹💨 ${cObj.user.nickname} GÜL HEDİYESİYLE ASFALTI AĞLATIYOR! UZUN DRİFT!`, 'banner-drift', 4500, 'images/gifts/rose.webp');

    const startX = cObj.group.position.x;
    // Kendi şeridinden dışarı fırlamadan, şerit içinde kontrollü ve estetik drift
    const driftDir = startX >= 0 ? -1 : 1;
    cObj.driftState = {
      elapsed: 0,
      duration: 3.8,
      dir: driftDir,
      startX: startX,
      maxLateral: 0.75 // Diğer şeritteki araçlara çarpmayan şerit içi drift
    };
  }

  // -------------------------------------------------------------
  // 2. LASTİK YAKMA (BURNOUT) AKSİYONU (LASTİK İZLERİ DAHİL)
  // -------------------------------------------------------------
  triggerBurnout(uniqueId) {
    const cObj = this.convoyCars[uniqueId];
    if (!cObj || cObj.isBurnout) return;

    cObj.isBurnout = true;
    this.triggerGiftFocus(uniqueId, 5500);

    if (this.audio) this.audio.playBurnoutRev();
    this.showBanner(`💨🔥 ${cObj.user.nickname} LASTİK YAKIYOR! ASFALTI KAZIYOR!`, 'banner-burnout', 4500, 'images/gifts/fire.webp');

    // Alevleri aç
    const flames = cObj.group.userData?.flames || [];
    flames.forEach(f => f.visible = true);

    cObj.burnoutState = {
      elapsed: 0,
      duration: 4.0
    };
  }

  // -------------------------------------------------------------
  // 3. MOTOR ÖN KALDIRMA (WHEELIE) AKSİYONU (MOTOR DEĞİLSE DRİFT ATAR)
  // -------------------------------------------------------------
  triggerWheelie(uniqueId) {
    const cObj = this.convoyCars[uniqueId];
    if (!cObj) return;

    // Kural: Eğer araç motosiklet değil de araba ise tek teker yerine efsane drift at:
    if (!cObj.isMotor) {
      this.triggerDrift(uniqueId);
      return;
    }

    if (cObj.isWheelie) return;

    const pivot = cObj.carMesh?.userData?.wheeliePivot || cObj.group?.userData?.wheeliePivot || cObj.carMesh;
    if (!pivot) return;

    cObj.isWheelie = true;
    this.triggerGiftFocus(uniqueId, 5500);

    if (this.audio) this.audio.playMotorcycleRev();
    this.showBanner(`🏍️⚡ ${cObj.user.nickname} DONDURMA HEDİYESİYLE TEK TEKER ÖN KALDIRDI!`, 'banner-wheelie', 4500, 'images/gifts/ice_cream.webp');

    cObj.wheelieState = {
      elapsed: 0,
      duration: 3.8,
      pivot
    };
  }

  // -------------------------------------------------------------
  // 4. MAKAS ATMA (Overtake) - 60 FPS Pürüzsüz Şerit Değiştirme
  // -------------------------------------------------------------
  triggerOvertake(uniqueId) {
    const cObj = this.convoyCars[uniqueId];
    if (!cObj || cObj.isOvertaking) return;

    cObj.isOvertaking = true;
    this.triggerGiftFocus(uniqueId, 5000);

    if (this.audio) this.audio.playExhaustBackfire();
    this.showBanner(`🔥💨 ${cObj.user.nickname} SOL ŞERİDE GEÇİP MAKAS ATTI!`, 'banner-overtake');

    // Makas atmaya başlarken öndeki araca yol istemek için selektör çak!
    this.triggerSelektor(uniqueId);

    const startX = cObj.group.position.x;
    const laneOffset = startX < 0 ? 2.95 : -2.95;
    cObj.overtakeState = {
      elapsed: 0,
      duration: 3.5,
      startX,
      targetX: startX + laneOffset
    };
  }

  // -------------------------------------------------------------
  // 5. SELEKTÖR ATMA (HIGH-BEAM FLASH) AKSİYONU
  // -------------------------------------------------------------
  triggerSelektor(uniqueId) {
    let targetGroup = null;
    let nick = 'Konvoy';

    if (!uniqueId || uniqueId === 'lead') {
      targetGroup = this.leadCar;
      nick = 'Gelin Arabası 👰🤵';
    } else if (this.convoyCars[uniqueId]) {
      targetGroup = this.convoyCars[uniqueId].group;
      nick = this.convoyCars[uniqueId].user.nickname;
      this.focusCar(uniqueId, 3200);
    } else {
      const first = Object.values(this.convoyCars)[0];
      if (first) {
        targetGroup = first.group;
        nick = first.user.nickname;
      } else if (this.leadCar) {
        targetGroup = this.leadCar;
        nick = 'Gelin Arabası 👰🤵';
      }
    }

    if (!targetGroup) return;

    // Farları bul (motorlarda bikeContainer içinde olabilir)
    let hl = targetGroup.userData.headlights;
    if (!hl) {
      targetGroup.traverse(ch => {
        if (ch.userData && ch.userData.headlights) hl = ch.userData.headlights;
      });
    }

    if (!hl || hl.isFlashing) return;
    hl.isFlashing = true;

    if (this.audio) this.audio.playHighBeamFlash();
    this.showBanner(`💡⚡ ${nick} SELEKTÖR ÇAKTI! YOL İSTİYOR!`, 'banner-selektor', 2800);

    // 3 Kademeli Hızlı Stroboskopik Selektör Flaşı ("ÇAT ÇAT ÇAT!")
    const pulsePattern = [
      { delay: 0, on: true },
      { delay: 90, on: false },
      { delay: 160, on: true },
      { delay: 250, on: false },
      { delay: 330, on: true },
      { delay: 440, on: false }
    ];

    pulsePattern.forEach(p => {
      setTimeout(() => {
        if (!hl) return;
        const isHigh = p.on;

        // Kristal mercekler akkor bembeyaz parıldar (far yuvası içinde kalarak)
        hl.lenses.forEach(lens => {
          lens.scale.setScalar(isHigh ? 1.35 : 1.0);
          lens.material.color.setHex(isHigh ? 0xffffff : 0xe2e8f0);
        });

        // Volümetrik ışık huzmesi yolu kesen dev projektöre dönüşür
        hl.cones.forEach(cone => {
          cone.material.opacity = isHigh ? 0.78 : hl.baseConeOpacity;
          cone.scale.set(isHigh ? 1.6 : 1.0, isHigh ? 1.6 : 1.0, isHigh ? 1.4 : 1.0);
        });

        // Dinamik zemin aydınlatması
        if (hl.spotLight) {
          hl.spotLight.intensity = isHigh ? 5.2 : hl.baseLightIntensity;
        }

        if (p.delay === 440) {
          hl.isFlashing = false;
        }
      }, p.delay);
    });
  }

  // Korna Çalma (Korna basılınca eş zamanlı selektör çakar!)
  triggerHonk(uniqueId) {
    if (this.audio) this.audio.playWeddingHorn();
    this.triggerSelektor(uniqueId);
  }

  // -------------------------------------------------------------
  // 5. KAMERA YÖNETİMİ (Otomatik Yönetmen + Sinematik Gezinme)
  // -------------------------------------------------------------
  addTrauma(amount = 0.45) {
    this.cameraTrauma = Math.min(1.0, (this.cameraTrauma || 0) + amount);
  }

  focusCar(uniqueId, durationMs = 5000) {
    this.focusedCarId = uniqueId;
    this.focusUntil = Date.now() + durationMs;
    this.giftFocusStart = Date.now();
    this.giftFocusDuration = durationMs;
    this.giftFocusUntil = Date.now() + durationMs;
    this.idleTimer = 0;
    const cObj = this.convoyCars[uniqueId];
    if (cObj) {
      cObj.giftFocusStart = Date.now();
      cObj.giftFocusDuration = durationMs;
      cObj.giftFocusUntil = Date.now() + durationMs;
    }
  }

  // Hediye Geldiğinde Kamerayı Odakla ve Mesafeyi Genişlet
  triggerGiftFocus(uniqueId, durationMs = 7000) {
    this.addTrauma(0.40);
    this.focusCar(uniqueId, durationMs);
    this.giftFocusCarId = uniqueId;
    this.giftFocusStart = Date.now();
    this.giftFocusDuration = durationMs;
    this.giftFocusUntil = Date.now() + durationMs;
    const cObj = this.convoyCars[uniqueId];
    if (cObj) {
      cObj.giftFocusUntil = Date.now() + durationMs;
      cObj.giftFocusStart = Date.now();
      cObj.giftFocusDuration = durationMs;
    }
  }

  // Yeni Biri Katıldığında: Kamera arkada bekler, yeni araç kameranın önünden hızla geçip konvoya yerleşir!
  triggerJoinFocus(uniqueId, durationMs = 6000) {
    this.latestJoinedCarId = uniqueId;
    this.joinFocusCarId = uniqueId;
    this.joinFocusStart = Date.now();
    this.joinFocusDuration = durationMs;
    this.joinFocusUntil = Date.now() + durationMs;
    const cObj = this.convoyCars[uniqueId];
    if (cObj) {
      cObj.joinFocusStart = Date.now();
      cObj.joinFocusDuration = durationMs;
      cObj.joinFocusUntil = Date.now() + durationMs;
    }
  }

  // "Ben Nerdeyim" Komutu: Kamerayı anında kullanıcının arabasına kilitler, selektör ve korna çalar!
  triggerLocateCar(uniqueId, rankIdx = 0, customMsg = null) {
    const cObj = this.convoyCars[uniqueId];
    if (!cObj) return;

    this.addTrauma(0.25);
    this.locateFocusCarId = uniqueId;
    this.locateFocusStart = Date.now();
    this.locateFocusDuration = 6500;
    this.locateFocusUntil = Date.now() + 6500;

    const nick = cObj.user.nickname || 'Misafir';
    const msg = customMsg || `🎯 ${nick} İŞTE BURADASIN! (Sıra: #${rankIdx + 1})`;
    this.showBanner(msg, 'banner-locate', 5500);

    // Kendi arabasında selektör çak ve korna bas!
    this.triggerSelektor(uniqueId);
    if (this.audio) this.audio.playWeddingHorn();
  }

  // Toplu Düğün Hedefi Kutlaması (Havai Fişek & Ekran Sarsıntısı)
  triggerMilestoneCelebration() {
    this.addTrauma(0.75);
    this.showBanner('🎆👑 DÜĞÜN HEDEFİ TAMAMLANDI! OTOYOL HAVAİ FİŞEK VE HALAY ŞOVU!', 'banner-galaxy', 8000, 'images/gifts/galaxy.webp');
    if (this.audio) this.audio.startDavulZurnaTheme(15000);

    // 6 ardışık havai fişek patlaması
    if (window.highwayEngine) {
      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          if (window.highwayEngine) {
            window.highwayEngine.emitFireworks();
            this.addTrauma(0.25);
          }
        }, i * 450);
      }
    }
  }

  // En çok drift atan konvoy lideri aracını bulur (Rank 0 / Max Drifts - Solla Geç Lideri)
  getTopDrifterCar() {
    const cars = this.activeCarsList;
    if (!cars || cars.length === 0) return null;
    let topCar = cars.find(c => c.rankIdx === 0);
    if (!topCar) {
      topCar = cars.slice().sort((a, b) => {
        const driftB = b.user?.driftCount || 0;
        const driftA = a.user?.driftCount || 0;
        if (driftB !== driftA) return driftB - driftA;
        return (b.user?.points || 0) - (a.user?.points || 0);
      })[0];
    }
    return topCar || cars[0];
  }

  getTopLikerCar() {
    return this.getTopDrifterCar();
  }

  updateCamera(dt = 0.016) {
    if (this.cameraMode === 9) {
      this.controls.update();
      return;
    }

    const leadZ = this.leadCar ? this.leadCar.position.z : 6.0;
    const now = Date.now();

    // Failsafe: currentCamPos veya currentCamLook NaN olursa anında güvenli konuma sıfırla (Mavi ekran koruması)
    if (!Number.isFinite(this.currentCamPos.x) || !Number.isFinite(this.currentCamPos.y) || !Number.isFinite(this.currentCamPos.z)) {
      this.currentCamPos.set(0, 4.3, leadZ - 13.5);
    }
    if (!Number.isFinite(this.currentCamLook.x) || !Number.isFinite(this.currentCamLook.y) || !Number.isFinite(this.currentCamLook.z)) {
      this.currentCamLook.set(0, 1.4, leadZ + 24.0);
    }

    const isGiftActive = this.giftFocusCarId && (now < this.giftFocusUntil) && this.convoyCars[this.giftFocusCarId];
    const isLocateActive = !isGiftActive && this.locateFocusCarId && (now < this.locateFocusUntil) && this.convoyCars[this.locateFocusCarId];
    const isJoinActive = !isGiftActive && !isLocateActive && this.joinFocusCarId && (now < this.joinFocusUntil) && this.convoyCars[this.joinFocusCarId];

    // -----------------------------------------------------------------
    // SABİT ARKA-YUKARI AÇI YÖNETMENİ (Kamera ASLA dönmez, daima arkadan yukarıdan çeker)
    // 1. Öncelik: Hediye Atan
    // 2. Öncelik: "Ben Nerdeyim" Diyen
    // 3. Öncelik: Yeni Katılan
    // 4. Öncelik (Varsayılan): EN ÇOK DRİFT ATAN LİDER! (Katılan yoksa gelin arabası)
    // -----------------------------------------------------------------
    if (this.cameraMode === 0) {
      let targetObj = null;

      if (isGiftActive) {
        targetObj = this.convoyCars[this.giftFocusCarId];
      } else if (isLocateActive) {
        targetObj = this.convoyCars[this.locateFocusCarId];
      } else if (isJoinActive) {
        targetObj = this.convoyCars[this.joinFocusCarId];
      } else {
        targetObj = this.getTopDrifterCar();
      }

      let targetPos;
      if (targetObj && targetObj.group) {
        targetPos = targetObj.group.position;
      } else if (this.leadCar) {
        targetPos = this.leadCar.position;
      } else {
        targetPos = new THREE.Vector3(0, 0, leadZ);
      }

      // KESİN VE DEĞİŞMEZ ARKA-YUKARI PERSPEKTİF:
      // Kamera daima hedefin arkasında (-Z) ve yukarıda (+Y), ileriye (+Z otoyoluna) bakar
      const camX = THREE.MathUtils.clamp(targetPos.x * 0.70, -3.8, 3.8);
      const camY = 4.3; // Arka yukarı açı: Araç tavanını, plakayı, yolu ve öndeki konvoyu mükemmel gösterir
      const camZ = targetPos.z - 13.5; // Kesin ve sabit arkadan takip

      const targetCamPos = new THREE.Vector3(camX, camY, camZ);
      const targetLookAt = new THREE.Vector3(targetPos.x * 0.35, 1.40, targetPos.z + 24.0);

      if (Number.isFinite(targetCamPos.x) && Number.isFinite(targetCamPos.y) && Number.isFinite(targetCamPos.z)) {
        this.currentCamPos.lerp(targetCamPos, 0.048);
      }
      if (Number.isFinite(targetLookAt.x) && Number.isFinite(targetLookAt.y) && Number.isFinite(targetLookAt.z)) {
        this.currentCamLook.lerp(targetLookAt, 0.055);
      }

      this.camera.position.copy(this.currentCamPos);
      this.camera.lookAt(this.currentCamLook);
      this.applyCameraShake(dt);
      return;
    }

    // Manuel Kamera Modları (1-8)
    switch (this.cameraMode) {
      case 1: // 🚘 Arka Konvoy İzometrik (Geniş & Ferah)
        this.camera.position.set(0, 7.2, leadZ - 18.0);
        this.camera.lookAt(0, 1.2, leadZ + 20.0);
        break;
      case 2: // 👰 Gelin Arabası Ön Sinematik (Alçak Karşılama)
        this.camera.position.set(2.8, 2.1, leadZ + 9.5);
        this.camera.lookAt(0, 1.25, leadZ - 2.0);
        break;
      case 3: // 🚁 Helikopter / Kuşbakışı (Televizyon Yayını)
        this.camera.position.set(0, 19.0, leadZ - 12.0);
        this.camera.lookAt(0, 1.2, leadZ + 18.0);
        break;
      case 4: // 🏎️ Yan Şerit Takip Arabası (Side Tracking)
        this.camera.position.set(5.2, 2.6, leadZ - 4.0);
        this.camera.lookAt(0, 1.2, leadZ + 16.0);
        break;
      case 5: // 🎯 Konvoy İçi Aksiyon / Arka Takip
        this.camera.position.set(0, 2.8, leadZ - 8.5);
        this.camera.lookAt(0, 1.2, leadZ + 30.0);
        break;
      case 6: // 📹 Yol Kenarı Hız Radarı (Drive-by)
        this.camera.position.set(-6.2, 1.8, leadZ - 6.0);
        this.camera.lookAt(0, 1.1, leadZ + 14.0);
        break;
      case 7: // ⚡ Makas & Selektör Kamerası
        this.camera.position.set(3.4, 4.2, leadZ - 12.0);
        this.camera.lookAt(0, 1.2, leadZ + 16.0);
        break;
      case 8: // 🌌 Sinematik Şehir Panoraması (Ultra-Wide Skyline)
        this.camera.position.set(-14.0, 15.0, leadZ - 24.0);
        this.camera.lookAt(0, 2.0, leadZ + 30.0);
        break;
    }

    this.applyCameraShake(dt);
    this.camera.updateMatrixWorld(true);
  }

  applyCameraShake(dt) {
    if (this.cameraTrauma && this.cameraTrauma > 0) {
      const shakePower = this.cameraTrauma * this.cameraTrauma;
      this.camera.position.x += (Math.random() - 0.5) * 0.45 * shakePower;
      this.camera.position.y += (Math.random() - 0.5) * 0.35 * shakePower;
      this.camera.position.z += (Math.random() - 0.5) * 0.25 * shakePower;
      this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 1.5);
    }
  }

  showBanner(msg, cssClass = '', duration = 4000, giftIcon = null) {
    if (!this.banner) return;
    const iconHtml = giftIcon ? `<img src="${giftIcon}" class="banner-gift-img" alt="Hediye" />` : '';
    this.banner.innerHTML = `${iconHtml}<div class="banner-text">${msg}</div>`;
    this.banner.className = `event-banner active ${cssClass}`;

    if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
    this.bannerTimeout = setTimeout(() => {
      this.banner.className = 'event-banner';
    }, duration);
  }

  // -------------------------------------------------------------
  // 6. Kare Başına Güncelleme (60 FPS): ACC & Çarpışma Önleme
  // -------------------------------------------------------------
  update(dt) {
    const carsList = this.activeCarsList;
    const now = Date.now();
    const activeGiftCar = (this.giftFocusCarId && now < this.giftFocusUntil) ? this.convoyCars[this.giftFocusCarId] : null;

    // 1. Akıllı Takip Mesafesi (ACC), Hediye Alanı Açma ve Çarpışma Önleme Algoritması
    carsList.forEach(cObj => {
      const currentZ = cObj.group.position.z;
      const currentX = cObj.group.position.x;

      let effectiveTargetZ = cObj.targetPos.z;
      let effectiveTargetX = cObj.targetPos.x;

      // HEDİYE ALAN KAHRAMAN ARAÇ: Kameranın önünden yavaşça ve pürüzsüzce geçmesi için öne VIP süzülüş!
      if (activeGiftCar && cObj === activeGiftCar) {
        const totalDur = this.giftFocusDuration || 7000;
        const elapsed = Math.max(0, now - (this.giftFocusStart || (this.giftFocusUntil - totalDur)));
        const p = Math.min(1.0, elapsed / totalDur);
        const heroSurge = Math.sin(p * Math.PI) * 9.0; // Maksimum 9 metre kontrollü ve estetik süzülüş
        effectiveTargetZ += heroSurge;
      }

      // YENİ KATILAN ARAÇ FLYBY: Kameranın önünden hızla süzülüp konvoydaki yerine fırlar!
      const activeJoinCar = (this.joinFocusCarId && now < this.joinFocusUntil) ? this.convoyCars[this.joinFocusCarId] : null;
      if (activeJoinCar && cObj === activeJoinCar) {
        const totalDur = this.joinFocusDuration || 6000;
        const elapsed = Math.max(0, now - (this.joinFocusStart || (this.joinFocusUntil - totalDur)));
        const p = Math.min(1.0, elapsed / totalDur);
        const joinSurge = Math.sin(p * Math.PI) * 11.0;
        effectiveTargetZ += joinSurge;
      }

      // ACC & Takip Mesafesi (Gelin arabası ve öndeki araçla ultra-ferah 20m takip mesafesi)
      if (this.leadCar && Math.abs(currentX - this.leadCar.position.x) < 2.2) {
        const MIN_LEAD_DIST = 20.0;
        if (effectiveTargetZ > this.leadCar.position.z - MIN_LEAD_DIST) {
          effectiveTargetZ = this.leadCar.position.z - MIN_LEAD_DIST;
        }
      }

      // Aynı şeritteki (lateralDist < 2.2m) araçlar arası ferah tampon mesafesi koruması
      carsList.forEach(other => {
        if (other === cObj) return;
        const otherZ = other.group.position.z;
        const otherX = other.group.position.x;
        const lateralDist = Math.abs(currentX - otherX);

        if (lateralDist < 2.2 && otherZ > currentZ) {
          const SAFE_FOLLOW_DIST = 18.0;
          if (effectiveTargetZ > otherZ - SAFE_FOLLOW_DIST) {
            effectiveTargetZ = otherZ - SAFE_FOLLOW_DIST;
          }
        }
      });

      // Dinamik İleri Akış Hissi: Her araç (drift yapanlar dahil!) otoyol akışına göre Z pozisyonunu kesintisiz korur
      const distToTarget = Math.abs(effectiveTargetZ - currentZ);
      const lerpSpeed = THREE.MathUtils.clamp(distToTarget * 0.015 + 0.05, 0.04, 0.10);
      cObj.group.position.z = THREE.MathUtils.lerp(currentZ, effectiveTargetZ, lerpSpeed);

      // KESİN GÜVENLİK SINIRI: Hiçbir araç gelin arabasının önüne geçemez ve harita dışına fırlayamaz!
      const maxAllowedZ = this.leadCar ? this.leadCar.position.z - 16.0 : -10.0;
      if (cObj.group.position.z > maxAllowedZ) {
        cObj.group.position.z = maxAllowedZ;
      }

      // 60 FPS PÜRÜZSÜZ DRİFT FİZİĞİ (Şerit dışına taşmadan, estetik kayma)
      if (cObj.isDrifting && cObj.driftState) {
        const ds = cObj.driftState;
        ds.elapsed += dt;
        const p = Math.min(1.0, ds.elapsed / ds.duration);

        if (p < 0.20) {
          // Giriş
          const f = p / 0.20;
          const smooth = f * f * (3 - 2 * f);
          cObj.group.rotation.y = ds.dir * THREE.MathUtils.lerp(0, 0.45, smooth);
          cObj.group.rotation.z = -ds.dir * 0.05 * smooth;
          cObj.group.position.x = ds.startX + ds.dir * ds.maxLateral * smooth;
        } else if (p < 0.76) {
          // Apex / Sustained Slide
          const slideF = (p - 0.20) / 0.56;
          const sway = Math.sin(slideF * Math.PI * 4) * 0.04;
          cObj.group.rotation.y = ds.dir * (0.42 + sway);
          cObj.group.rotation.z = -ds.dir * 0.04;
          cObj.group.position.x = ds.startX + ds.dir * (ds.maxLateral + sway);

          if (window.highwayEngine) {
            window.highwayEngine.emitDriftSmoke(cObj.group.position, 1, cObj.isMotor);
            window.highwayEngine.emitSkidMarks(cObj.user.uniqueId, cObj.group.position, cObj.group.rotation.y, cObj.isMotor);
          }
        } else if (p < 1.0) {
          // Çıkış
          const exitF = (p - 0.76) / 0.24;
          const smoothExit = exitF * exitF * (3 - 2 * exitF);
          cObj.group.rotation.y = -ds.dir * 0.15 * (1.0 - smoothExit);
          cObj.group.rotation.z = 0;
          cObj.group.position.x = THREE.MathUtils.lerp(ds.startX + ds.dir * ds.maxLateral, cObj.targetPos.x, smoothExit);

          if (window.highwayEngine) {
            window.highwayEngine.emitDriftSmoke(cObj.group.position, 1, cObj.isMotor);
            window.highwayEngine.emitSkidMarks(cObj.user.uniqueId, cObj.group.position, cObj.group.rotation.y, cObj.isMotor);
          }
        } else {
          cObj.isDrifting = false;
          cObj.driftState = null;
          cObj.group.rotation.set(0, 0, 0);
          if (window.highwayEngine) window.highwayEngine.clearSkidTrack(cObj.user.uniqueId);
        }
      } else if (cObj.isOvertaking && cObj.overtakeState) {
        // 60 FPS PÜRÜZSÜZ MAKAS / ŞERİT DEĞİŞTİRME FİZİĞİ (setInterval kesinlikle yok)
        const os = cObj.overtakeState;
        os.elapsed += dt;
        const p = Math.min(1.0, os.elapsed / os.duration);
        const s = Math.sin(p * Math.PI);
        cObj.group.position.x = THREE.MathUtils.lerp(os.startX, os.targetX, s);
        cObj.group.rotation.y = Math.cos(p * Math.PI) * (os.targetX > os.startX ? 0.08 : -0.08);

        if (p >= 1.0) {
          cObj.isOvertaking = false;
          cObj.overtakeState = null;
          cObj.group.rotation.set(0, 0, 0);
        }
      } else {
        cObj.group.position.x = THREE.MathUtils.lerp(currentX, effectiveTargetX, 0.07);
      }

      // 60 FPS PÜRÜZSÜZ BURNOUT FİZİĞİ
      if (cObj.isBurnout && cObj.burnoutState) {
        const bs = cObj.burnoutState;
        bs.elapsed += dt;
        if (window.highwayEngine) {
          window.highwayEngine.emitBurnoutSmoke(cObj.group.position, 2, cObj.isMotor);
          window.highwayEngine.emitSkidMarks(cObj.user.uniqueId, cObj.group.position, 0, cObj.isMotor);
        }
        if (bs.elapsed >= bs.duration) {
          cObj.isBurnout = false;
          cObj.burnoutState = null;
          const flames = cObj.group.userData?.flames || [];
          flames.forEach(f => f.visible = false);
          if (window.highwayEngine) window.highwayEngine.clearSkidTrack(cObj.user.uniqueId);
        }
      }

      // 60 FPS PÜRÜZSÜZ TEK TEKER (WHEELIE) FİZİĞİ
      if (cObj.isWheelie && cObj.wheelieState) {
        const ws = cObj.wheelieState;
        ws.elapsed += dt;
        const p = Math.min(1.0, ws.elapsed / ws.duration);
        const pivot = ws.pivot || cObj.group.userData.wheeliePivot;

        if (pivot) {
          if (p < 0.20) {
            const f = p / 0.20;
            pivot.rotation.x = THREE.MathUtils.lerp(0, -0.68, f * f * (3 - 2 * f));
          } else if (p < 0.82) {
            pivot.rotation.x = -0.68 + Math.sin(ws.elapsed * 14) * 0.04;
            if (window.highwayEngine) {
              window.highwayEngine.emitWheelieSparks(cObj.group.position, 3);
              window.highwayEngine.emitSkidMarks(cObj.user.uniqueId, cObj.group.position, 0, true);
            }
          } else if (p < 1.0) {
            const f = (p - 0.82) / 0.18;
            pivot.rotation.x = THREE.MathUtils.lerp(-0.68, 0, f * f * (3 - 2 * f));
          } else {
            pivot.rotation.x = 0;
            cObj.isWheelie = false;
            cObj.wheelieState = null;
            if (this.audio) this.audio.playWheelieLand();
            if (window.highwayEngine) window.highwayEngine.clearSkidTrack(cObj.user.uniqueId);
          }
        }
      }

      // Gerçekçi Süspansiyon & Gövde Duruşu (Asla çarpık kalmaz, şeritte kusursuz dik durur)
      if (!cObj.isDrifting && !cObj.isBurnout && !cObj.isWheelie && !cObj.isOvertaking) {
        const dX = effectiveTargetX - cObj.group.position.x;
        const isChangingLanes = Math.abs(dX) > 0.25;
        // Direksiyon açısı: Sadece şerit değiştirirken max 5 derece, şeritteyken kusursuz 0
        const targetYaw = isChangingLanes ? THREE.MathUtils.clamp(dX * 0.05, -0.09, 0.09) : 0;
        // Viraj gövde yatışı: Sadece şerit değiştirirken hafif yatış, şeritteyken tam dik (0)
        const targetRoll = isChangingLanes ? THREE.MathUtils.clamp(-dX * (cObj.isMotor ? 0.08 : 0.015), -0.10, 0.10) : 0;

        cObj.group.rotation.y = THREE.MathUtils.lerp(cObj.group.rotation.y, targetYaw, 0.12);
        cObj.group.rotation.z = THREE.MathUtils.lerp(cObj.group.rotation.z, targetRoll, 0.12);
        cObj.group.rotation.x = THREE.MathUtils.lerp(cObj.group.rotation.x, 0, 0.12);

        // Gerçekçi Asfalt Titreşimi
        const rumbleTime = Date.now() * 0.012 + (cObj.rankIdx || 1);
        cObj.group.position.y = Math.sin(rumbleTime * 1.5) * 0.005 + Math.sin(rumbleTime * 3.7) * 0.002;
      }
    });

    // Gelin arabası: Yüksek hız süzülüşü ve amortisör nefesi
    if (this.leadCar) {
      const leadTime = Date.now() * 0.012;
      this.leadCar.position.y = Math.sin(leadTime * 1.6) * 0.006 + Math.sin(leadTime * 3.5) * 0.002;
      this.leadCar.rotation.z = Math.sin(leadTime * 0.45) * 0.003;
      this.leadCar.rotation.x = Math.sin(leadTime * 0.75) * 0.002;
    }

    // 2. KESİN VE SERT ÇARPIŞMA / İÇ İÇE GİRME ENGELLEYİCİ (Aynı şeritteki tampon teması)
    // Kural: Yalnızca arkadaki araç geriye doğru esnetilir. Öndeki araç asla ileri fırlatılmaz!
    for (let i = 0; i < carsList.length; i++) {
      const vA = carsList[i];
      for (let j = i + 1; j < carsList.length; j++) {
        const vB = carsList[j];

        const absX = Math.abs(vB.group.position.x - vA.group.position.x);
        const dz = vB.group.position.z - vA.group.position.z;
        const absZ = Math.abs(dz);

        // Yalnızca aynı şeritte (absX < 1.8m) ve tampon temasında (absZ < 10.0m) ayırma:
        if (absX < 1.8 && absZ < 10.0) {
          const pushBack = (10.0 - absZ) * 0.4;
          if (dz > 0) {
            // vB önde, vA arkada -> vA geriye çekilir
            vA.group.position.z -= pushBack;
          } else {
            // vA önde, vB arkada -> vB geriye çekilir
            vB.group.position.z -= pushBack;
          }
        }
      }
    }

    // 3. Tekerlekleri otoyol hızına göre döndür (60 FPS pürüzsüz dönüş)
    const baseWheelSpeed = ((window.highwayEngine ? window.highwayEngine.scrollSpeed : 38.0) / 0.33);
    if (this.leadCar && this.leadCar.userData.wheels) {
      this.leadCar.userData.wheels.forEach(w => {
        const spinDir = (w.position && w.position.x < 0) ? -1 : 1;
        w.rotateX(baseWheelSpeed * spinDir * dt);
      });
    }

    carsList.forEach(cObj => {
      // Motosikletlerde (isMotor) statik model geometrisini %100 koru; tekerlek/maşa kırılmasını engelle
      if (cObj.isMotor) return;

      let carWheels = cObj.group.userData.wheels;
      if (!carWheels && cObj.carMesh) carWheels = cObj.carMesh.userData.wheels;
      if (!carWheels) {
        cObj.group.traverse(ch => {
          if (ch.userData && ch.userData.wheels) carWheels = ch.userData.wheels;
        });
        cObj.group.userData.wheels = carWheels || [];
      }
      if (carWheels && carWheels.length > 0) {
        const mult = cObj.isBurnout ? 4.2 : (cObj.isDrifting ? 2.0 : 1.0);
        carWheels.forEach(w => {
          if (!w) return;
          // KERNEL GÜVENLİK SHIELD:
          // Sadece doğrulanmış bağımsız aks merkezine sahip tekerlekler döner.
          // Pivotu (0,0,0)'da olan parçalar ASLA döndürülmez (tekerleğin motora batmasını/tavana fırlamasını %100 engeller)!
          if (w.userData && w.userData.spinAxis === 'x') {
            w.rotateX(baseWheelSpeed * mult * dt);
          } else if (w.position && Math.hypot(w.position.x, w.position.z) > 0.40) {
            const spinDir = (w.position.x < 0) ? -1 : 1;
            w.rotateX(baseWheelSpeed * mult * spinDir * dt);
          }
        });
      }
    });

    // 4. Rastgele konvoy içi dostça selektör selamlaşması (Her 8-12 saniyede bir)
    this.ambientSelektorTimer = (this.ambientSelektorTimer || 0) + dt;
    if (this.ambientSelektorTimer > 8.5) {
      this.ambientSelektorTimer = 0;
      if (carsList.length > 0 && Math.random() < 0.6) {
        const randCar = carsList[Math.floor(Math.random() * carsList.length)];
        this.triggerSelektor(randCar.user.uniqueId);
      } else if (this.leadCar && Math.random() < 0.4) {
        this.triggerSelektor('lead');
      }
    }

    // 5. Kamerayı güncelle
    this.updateCamera(dt);

    // 6. Etiketleri ve Araç Görünürlüğünü Senkronize Güncelle
    this.updateLabels();
  }

  // 3D Etiketleri ve Araç LOD / Mesafe Kırpması (Kernel Düzeyi Titreşimsiz ve Tavanına Çakılı)
  updateLabels() {
    const camera = this.camera;
    // Sıfır DOM Reflow (Layout Thrashing önleyici önbellek)
    const w = this.viewportW;
    const h = this.viewportH;
    const tempV = this.tempV;

    // Gelin Arabası Bordo Plakası (Tam Tavanın Üstüne Sabit)
    let leadScreen = null;
    if (this.leadCar && this.leadLabelEl) {
      tempV.set(this.leadCar.position.x, this.leadCar.position.y + 1.46, this.leadCar.position.z);
      tempV.project(camera);
      if (tempV.z > 1 || tempV.z < -1) {
        this.leadLabelEl.style.display = 'none';
      } else {
        const lx = (tempV.x * 0.5 + 0.5) * w;
        const ly = (-tempV.y * 0.5 + 0.5) * h;
        const lDist = camera.position.distanceTo(this.leadCar.position);
        if (lDist > 65) {
          this.leadLabelEl.style.display = 'none';
        } else {
          this.leadLabelEl.style.display = 'flex';
          const lScale = Math.max(0.45, Math.min(1.15, 18.0 / Math.max(15.0, lDist)));
          this.leadLabelEl.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0) scale(${lScale.toFixed(2)}) translate(-50%, -100%)`;
          leadScreen = { x: lx, y: ly };
        }
      }
    }

    // 1. Aday etiketleri topla ve mesafeyi hesapla
    const candidates = [];
    this.activeCarsList.forEach(cObj => {
      const carPos = cObj.group.position;

      // Tüm araçlar 3D sahnesinde her zaman aktiftir (Three.js GPU culling otomatik halleder)
      cObj.group.visible = true;

      if (!cObj.labelEl) return;

      const dist = camera.position.distanceTo(carPos);

      // KERNEL CLUTTER SHIELD: 38 metreden uzaktaki araçların etiketleri doğrudan cullanır
      if (dist > 38) {
        cObj.labelEl.style.display = 'none';
        return;
      }

      const labelHeight = cObj.isMotor ? 1.52 : 1.46;
      tempV.set(carPos.x, carPos.y + labelHeight, carPos.z);
      tempV.project(camera);

      // Kamera arkasında veya frustum dışındaysa gizle
      if (tempV.z > 1 || tempV.z < -1) {
        cObj.labelEl.style.display = 'none';
        return;
      }

      const sx = (tempV.x * 0.5 + 0.5) * w;
      const sy = (-tempV.y * 0.5 + 0.5) * h;

      // Ekran dışı toleransı
      if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) {
        cObj.labelEl.style.display = 'none';
        return;
      }

      candidates.push({ cObj, dist, sx, sy });
    });

    // 2. Kameraya en YAKIN olan araçları önce sırala
    candidates.sort((a, b) => a.dist - b.dist);

    // 3. Ekran Uzayı Çakışma Önleyici (Screen-space Occlusion Shield):
    const placedBoxes = [];
    if (leadScreen) {
      placedBoxes.push({ x: leadScreen.x, y: leadScreen.y });
    }

    let renderedCount = 0;
    const MAX_VISIBLE_LABELS = 3; // Ekranda aynı anda en fazla 3 net, kristal etiket! (Aynı kadrajda en fazla 3 araba kuralı)

    for (const item of candidates) {
      const { cObj, dist, sx, sy } = item;

      if (renderedCount >= MAX_VISIBLE_LABELS) {
        cObj.labelEl.style.display = 'none';
        continue;
      }

      // Daha önce yerleştirilmiş bir etiketle çakışıyor mu? (Genişletilmiş güvenlik kutusu)
      const overlaps = placedBoxes.some(box => 
        Math.abs(sx - box.x) < 80 && Math.abs(sy - box.y) < 40
      );

      if (overlaps) {
        cObj.labelEl.style.display = 'none';
        continue;
      }

      // Çakışma yok: etiketi yerleştir
      placedBoxes.push({ x: sx, y: sy });
      renderedCount++;

      cObj.labelEl.style.display = 'flex';

      // Büyütülmüş Doğrusal 3D Perspektif (Yakındayken 1.25x büyük, net ve tavana çakılı)
      const scale = THREE.MathUtils.clamp(20.0 / Math.max(14.0, dist), 0.55, 1.25);
      
      // 26 metreden sonra yumuşakça sönümlenir (fade-out)
      const opacity = dist > 26 ? Math.max(0, 1 - (dist - 26) / 10) : 1;

      // Dinamik Z-Index: Kameraya daha YAKIN olan aracın etiketi her zaman en üstte kalır!
      const zIndex = Math.max(1, Math.min(999, Math.round(1000 - dist * 10)));
      
      cObj.labelEl.style.zIndex = zIndex;
      cObj.labelEl.style.opacity = opacity.toFixed(2);
      cObj.labelEl.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) scale(${scale.toFixed(2)}) translate(-50%, -100%)`;
    }
  }
}

window.ConvoyManager = ConvoyManager;
