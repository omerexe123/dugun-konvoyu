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
    this.currentCamPos = new THREE.Vector3(0, 6.2, 19.0);
    this.currentCamLook = new THREE.Vector3(0, 1.2, 0.0);

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

  // Araç / Motosiklet Alt Neon Paketini Aktifleştir
  setCarNeon(uniqueId, colorHex = '#00f0ff') {
    const cObj = this.convoyCars[uniqueId];
    if (!cObj) return;

    let neon = cObj.group.userData.neon;
    if (!neon) {
      cObj.group.traverse(ch => {
        if (ch.userData && ch.userData.neon) neon = ch.userData.neon;
      });
    }

    if (neon) {
      neon.setColor(colorHex);
      neon.setEnabled(true);
      if (cObj.user) cObj.user.neonColor = colorHex;
    }
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

    // 3 Şeritli Prestijli ve Geniş Konvoy Dizilimi
    // Şeritler: 0: Orta Şerit (0m), 1: Sağ Şerit (2.95m), 2: Sol Şerit (-2.95m)
    const laneOffsetsX = [0, 2.95, -2.95];
    const targetX = laneOffsetsX[rankIdx % 3];
    // Artırılmış devasa ferah konvoy mesafesi: Arabalar ve motorlar asla iç içe giremez
    // Gelin arabası arkasında 26m VIP güvenlik koridoru, sıra başı 24.0m ferah aralık, şerit kademesi 7.5m
    const targetZ = -26.0 - Math.floor(rankIdx / 3) * 24.0 - (rankIdx % 3) * 7.5;

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
    }

    cObj.rankIdx = rankIdx;
    cObj.user = user;

    // Araç kademesi: Beğeni ile araç artmaz, yeni kullanıcılar Tier 1 başlar, hediye ile yükselir!
    const targetTier = isMotorcycle ? (user.motorTier || 1) : (user.tier || 1);

    // Araç Tipi veya Kademesi Değişmişse Yenile
    const needsRebuild = (cObj.isMotor !== isMotorcycle) || (cObj.tier !== targetTier);
    if (needsRebuild) {
      // Eski araba/motor ve alt neon kalıntılarını tamamen temizle (asfaltta askıda neon kalmasını %100 engeller)
      while (cObj.group.children.length > 0) {
        cObj.group.remove(cObj.group.children[0]);
      }
      cObj.group.userData.neon = null;
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
      if (newVehicle.userData.neon) {
        cObj.group.userData.neon = newVehicle.userData.neon;
      }
    }

    // Hedef Konumu Belirle
    if (!cObj.isOvertaking && !cObj.isDrifting) {
      cObj.targetPos.set(targetX, 0, targetZ);
    }

    this.updateCarLabel(user, cObj, rankIdx);
    if (user.neonColor) {
      this.setCarNeon(user.uniqueId, user.neonColor);
    }
  }

  updateCarLabel(user, cObj, rankIdx) {
    if (!cObj || !cObj.labelEl) return;
    const isLead = rankIdx === 0;
    const carName = cObj.carMesh?.userData?.carName || user.carName || 'Araç';
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
          <div class="plate-sub-badge ${isLead ? 'badge-lead-sub' : (isMotor ? 'badge-motor-sub' : 'badge-car-sub')}">
            ${isMotor ? '🏍️' : '🚗'} ${carName} &bull; ${user.points || 1}p
          </div>
          <div class="plate-pin"></div>
        </div>
      `;
      return;
    }

    // Kart sınıfını güncelle
    const targetClass = `user-plate-card ${isLead ? 'plate-lead' : (isMotor ? 'plate-motor' : 'plate-car')}`;
    if (card.className !== targetClass) card.className = targetClass;

    // Avatar görselini gereksiz DOM yok etmelerine izin vermeden güncelle
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

    // Alt rozet
    const subBadge = card.querySelector('.plate-sub-badge');
    if (subBadge) {
      const targetSubClass = `plate-sub-badge ${isLead ? 'badge-lead-sub' : (isMotor ? 'badge-motor-sub' : 'badge-car-sub')}`;
      if (subBadge.className !== targetSubClass) subBadge.className = targetSubClass;
      subBadge.innerHTML = `${isMotor ? '🏍️' : '🚗'} ${carName} &bull; ${user.points || 1}p`;
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
    // Hangi tarafta olduğuna göre içe/karşı şeride doğru savrulma yönü
    const driftDir = startX >= 0 ? -1 : 1;
    cObj.driftState = {
      elapsed: 0,
      duration: 3.8,
      dir: driftDir,
      startX: startX,
      maxLateral: 1.85
    };
  }

  // -------------------------------------------------------------
  // 2. LASTİK YAKMA (BURNOUT) AKSİYONU (LASTİK İZLERİ DAHİL)
  // -------------------------------------------------------------
  triggerBurnout(uniqueId) {
    const cObj = this.convoyCars[uniqueId];
    if (!cObj || cObj.isBurnout) return;

    cObj.isBurnout = true;
    this.focusCar(uniqueId, 4800);

    if (this.audio) this.audio.playBurnoutRev();
    this.showBanner(`💨🔥 ${cObj.user.nickname} LASTİK YAKIYOR! ASFALTI KAZIYOR!`, 'banner-burnout', 4500, 'images/gifts/fire.webp');

    // Alevleri aç
    const flames = cObj.group.userData?.flames || [];
    flames.forEach(f => f.visible = true);

    let t = 0;
    const burnoutInterval = setInterval(() => {
      t += 0.035;

      // Araba titremesi & yoğun duman
      cObj.group.position.x += (Math.random() - 0.5) * 0.08;
      if (window.highwayEngine) {
        window.highwayEngine.emitBurnoutSmoke(cObj.group.position, 6);
        window.highwayEngine.emitSkidMarks(uniqueId, cObj.group.position, 0, cObj.isMotor);
      }

      if (t >= 1.0) {
        clearInterval(burnoutInterval);
        flames.forEach(f => f.visible = false);
        cObj.isBurnout = false;
        cObj.group.position.copy(cObj.targetPos);
        if (window.highwayEngine) window.highwayEngine.clearSkidTrack(uniqueId);
      }
    }, 35);
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
    this.focusCar(uniqueId, 4500);

    if (this.audio) this.audio.playMotorcycleRev();
    this.showBanner(`🏍️⚡ ${cObj.user.nickname} DONDURMA HEDİYESİYLE TEK TEKER ÖN KALDIRDI!`, 'banner-wheelie', 4500, 'images/gifts/ice_cream.webp');

    cObj.wheelieState = {
      elapsed: 0,
      duration: 3.6,
      pivot
    };
  }

  // -------------------------------------------------------------
  // 4. MAKAS ATMA (Overtake)
  // -------------------------------------------------------------
  triggerOvertake(uniqueId) {
    const cObj = this.convoyCars[uniqueId];
    if (!cObj || cObj.isOvertaking) return;

    cObj.isOvertaking = true;
    this.focusCar(uniqueId, 4000);

    if (this.audio) this.audio.playExhaustBackfire();
    this.showBanner(`🔥💨 ${cObj.user.nickname} SOL ŞERİDE GEÇİP MAKAS ATTI!`, 'banner-overtake');

    const startPos = cObj.group.position.clone();
    const laneOut = new THREE.Vector3(startPos.x < 0 ? 3.8 : -3.8, 0, startPos.z + 8.0);
    const laneBack = new THREE.Vector3(cObj.targetPos.x, 0, cObj.targetPos.z);

    let progress = 0;
    // Makas atmaya başlarken öndeki araca yol istemek için selektör çak!
    this.triggerSelektor(uniqueId);

    const animInterval = setInterval(() => {
      progress += 0.045;
      if (progress < 0.45) {
        cObj.group.position.lerpVectors(startPos, laneOut, progress / 0.45);
        cObj.group.rotation.y = startPos.x < 0 ? -0.2 : 0.2;
      } else if (progress < 0.85) {
        cObj.group.position.lerpVectors(laneOut, laneBack, (progress - 0.45) / 0.4);
        cObj.group.rotation.y = startPos.x < 0 ? 0.2 : -0.2;
      } else if (progress <= 1.0) {
        cObj.group.rotation.y = 0;
        cObj.group.position.lerp(cObj.targetPos, 0.15);
      } else {
        clearInterval(animInterval);
        cObj.isOvertaking = false;
        cObj.group.rotation.y = 0;
      }
    }, 30);
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
    this.idleTimer = 0;
    const cObj = this.convoyCars[uniqueId];
    if (cObj) {
      cObj.giftFocusUntil = Date.now() + durationMs;
    }
  }

  // Hediye Geldiğinde Kamerayı Odakla ve Mesafeyi Genişlet
  triggerGiftFocus(uniqueId, durationMs = 6500) {
    this.addTrauma(0.50);
    this.focusCar(uniqueId, durationMs);
    this.giftFocusCarId = uniqueId;
    this.giftFocusUntil = Date.now() + durationMs;
    const cObj = this.convoyCars[uniqueId];
    if (cObj) {
      cObj.giftFocusUntil = Date.now() + durationMs;
    }
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

  updateCamera(dt = 0.016) {
    if (this.cameraMode === 7) {
      this.controls.update();
      return;
    }

    const leadZ = this.leadCar ? this.leadCar.position.z : 0;
    const now = Date.now();
    const isFocusActive = this.focusedCarId && (now < this.focusUntil) && this.convoyCars[this.focusedCarId];

    // Hediye Odağında Geniş, Sinematik ve Uzak Takip (Asla arabanın içine zoom yapmaz!)
    if (isFocusActive) {
      const fPos = this.convoyCars[this.focusedCarId].group.position;
      this.idleTimer += dt;

      // Araçlar birbirinden uzak olduğu için kamera uzakta ve yüksekte kalır, odak onda olur!
      const camDist = 26.0;
      const camHeight = 9.5 + Math.sin(this.idleTimer * 0.25) * 1.5;
      const camX = fPos.x * 0.35 + Math.sin(this.idleTimer * 0.20) * 2.2;

      const targetCamPos = new THREE.Vector3(camX, camHeight, fPos.z + camDist);
      const targetLookAt = new THREE.Vector3(fPos.x, fPos.y + 1.2, fPos.z - 4.5);

      this.currentCamPos.lerp(targetCamPos, 0.05);
      this.currentCamLook.lerp(targetLookAt, 0.05);

      this.camera.position.copy(this.currentCamPos);
      this.camera.lookAt(this.currentCamLook);

      this.applyCameraShake(dt);
      return;
    }

    // Otomatik Yönetmen Modu (cameraMode === 0)
    if (this.cameraMode === 0) {
      // Hediye Yoksa Boşta Sinematik ve Geniş Bulvar Gezinmesi
      this.idleTimer += dt;
      const orbitAngle = this.idleTimer * 0.16;
      const orbitRadius = 24.0 + Math.sin(this.idleTimer * 0.10) * 4.0;
      const camY = 8.2 + Math.sin(this.idleTimer * 0.14) * 1.8;

      const targetCamPos = new THREE.Vector3(
        Math.sin(orbitAngle) * 3.4,
        camY,
        leadZ + orbitRadius
      );
      const targetLookAt = new THREE.Vector3(0, 1.3, leadZ - 8.0);

      this.currentCamPos.lerp(targetCamPos, 0.035);
      this.currentCamLook.lerp(targetLookAt, 0.035);

      this.camera.position.copy(this.currentCamPos);
      this.camera.lookAt(this.currentCamLook);

      this.applyCameraShake(dt);
      return;
    }

    // Manuel Kamera Modları (1-6)
    switch (this.cameraMode) {
      case 1: // Standart Konvoy İzometrik
        this.camera.position.set(0, 6.2, leadZ + 14.0);
        this.camera.lookAt(0, 1.2, leadZ - 12.0);
        break;
      case 2: // Gelin Arabası Ön Sinematik
        this.camera.position.set(0, 2.2, leadZ + 7.5);
        this.camera.lookAt(0, 1.3, leadZ);
        break;
      case 3: // Helikopter / Kuşbakışı
        this.camera.position.set(0, 36, leadZ - 8);
        this.camera.lookAt(0, 0, leadZ - 4);
        break;
      case 4: // Yol Kenarı Radar / Dron
        this.camera.position.set(-5.2, 3.8, leadZ + 8);
        this.camera.lookAt(0, 1.0, leadZ - 6);
        break;
      case 5: // Odak Takip
        if (this.focusedCarId && this.convoyCars[this.focusedCarId]) {
          const fCar = this.convoyCars[this.focusedCarId].group.position;
          this.camera.position.set(fCar.x + 4.0, fCar.y + 3.0, fCar.z + 7.5);
          this.camera.lookAt(fCar.x, fCar.y + 0.8, fCar.z - 1.5);
        } else {
          this.camera.position.set(6, 5.5, leadZ + 11);
          this.camera.lookAt(0, 1.4, leadZ - 6);
        }
        break;
      case 6: // Tampon Kamerası
        this.camera.position.set(0, 1.8, leadZ + 6.0);
        this.camera.lookAt(0, 1.0, leadZ - 20);
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
    const carsList = Object.values(this.convoyCars);
    const now = Date.now();
    const activeGiftCar = (this.giftFocusCarId && now < this.giftFocusUntil) ? this.convoyCars[this.giftFocusCarId] : null;

    // 1. Akıllı Takip Mesafesi (ACC), Hediye Alanı Açma ve Çarpışma Önleme Algoritması
    carsList.forEach(cObj => {
      if (cObj.isOvertaking) return;

      const currentZ = cObj.group.position.z;
      const currentX = cObj.group.position.x;
      const prevX = currentX;
      const prevZ = currentZ;

      let effectiveTargetZ = cObj.targetPos.z;
      let effectiveTargetX = cObj.targetPos.x;

      // ACC & Takip Mesafesi YALNIZCA araç drift veya burnout yapmıyorken hedef Z pozisyonunu belirler
      if (!cObj.isDrifting && !cObj.isBurnout) {
        // A. Gelin Arabası ile Takip Mesafesi (Lead Car at Z=6.0)
        if (this.leadCar && Math.abs(currentX - this.leadCar.position.x) < 2.5) {
          const MIN_LEAD_DIST = 26.0; // Gelin arabasının arkasında 26m devasa ferah mesafe
          if (effectiveTargetZ > this.leadCar.position.z - MIN_LEAD_DIST) {
            effectiveTargetZ = this.leadCar.position.z - MIN_LEAD_DIST;
          }
        }

        // B. Hediye Atan Araca VIP Koridor / Mesafe Açma (Diğer arabalarla mesafesini artır!)
        if (activeGiftCar && activeGiftCar !== cObj) {
          const giftZ = activeGiftCar.group.position.z;
          const giftX = activeGiftCar.group.position.x;
          const latDist = Math.abs(currentX - giftX);

          if (latDist < 3.2) {
            // Aynı veya bitişik şeritte ise: arkasındaki araçlar en az 26m geriye çekilir, önündekiler 20m açılır!
            if (currentZ <= giftZ) {
              const GIFT_REAR_DIST = 26.0;
              if (effectiveTargetZ > giftZ - GIFT_REAR_DIST) {
                effectiveTargetZ = giftZ - GIFT_REAR_DIST;
              }
            } else {
              const GIFT_FRONT_DIST = 20.0;
              if (effectiveTargetZ < giftZ + GIFT_FRONT_DIST) {
                effectiveTargetZ = giftZ + GIFT_FRONT_DIST;
              }
            }
          } else if (Math.abs(currentZ - giftZ) < 12.0) {
            // Yanındaki şeritlerdeki araçlar dışa açılarak sahneyi hediye aracına bırakır
            const pushX = currentX >= giftX ? 1.0 : -1.0;
            effectiveTargetX = THREE.MathUtils.clamp(effectiveTargetX + pushX * 0.9, -4.2, 4.2);
          }
        }

        // C. Normal Konvoy Araçları Arası Takip & Yavaşlama (ACC)
        carsList.forEach(other => {
          if (other === cObj) return;

          const otherZ = other.group.position.z;
          const otherX = other.group.position.x;

          // "other" aracı bizim önümüzde mi? (Z ekseninde +Z yönü ön taraftır)
          if (otherZ > currentZ) {
            const lateralDist = Math.abs(currentX - otherX);
            const forwardDist = otherZ - currentZ;

            // Eğer cObj arkada kalması gereken bir araçsa frenleme ve takip mesafesi uygula
            if (cObj.targetPos.z <= other.targetPos.z) {
              if (lateralDist < 2.5) {
                const SAFE_FOLLOW_DIST = 18.0; // Minimum 18m güvenli tampon mesafesi
                if (effectiveTargetZ > otherZ - SAFE_FOLLOW_DIST) {
                  effectiveTargetZ = otherZ - SAFE_FOLLOW_DIST;
                }
                if (forwardDist < SAFE_FOLLOW_DIST - 1.0) {
                  cObj.group.position.z = Math.min(cObj.group.position.z, otherZ - SAFE_FOLLOW_DIST);
                }
              }
            } else {
              // cObj daha yüksek puana sahip ve öne geçiyor (Overtake): Aynı şerittelerse yana açıl
              if (lateralDist < 2.4 && forwardDist < 10.0) {
                const passDir = currentX >= 0 ? 1 : -1;
                cObj.group.position.x += passDir * 0.05;
              }
            }
          } else {
            // Yan yana geçerken iç içe girmeyi önleyen yanal itme kuvveti
            const forwardDist = Math.abs(otherZ - currentZ);
            const lateralDist = Math.abs(currentX - otherX);
            if (forwardDist < 7.0 && lateralDist < 2.4) {
              const pushDir = currentX >= otherX ? 1 : -1;
              cObj.group.position.x += pushDir * 0.05;
            }
          }
        });

        // Dinamik Frenleme & Gazlama Hissi: Mesafeye göre yumuşak lerp
        const distToTarget = Math.abs(effectiveTargetZ - currentZ);
        const lerpSpeed = THREE.MathUtils.clamp(distToTarget * 0.015 + 0.05, 0.04, 0.12);
        cObj.group.position.z = THREE.MathUtils.lerp(currentZ, effectiveTargetZ, lerpSpeed);
      }

      // 60 FPS PÜRÜZSÜZ DRİFT FİZİĞİ (Tug-of-war ve takılma kesinlikle yok)
      if (cObj.isDrifting && cObj.driftState) {
        const ds = cObj.driftState;
        ds.elapsed += dt;
        const p = Math.min(1.0, ds.elapsed / ds.duration);

        if (p < 0.20) {
          // 1. Giriş: Agresif direksiyon açısı & şasi yatışı
          const f = p / 0.20;
          const smooth = f * f * (3 - 2 * f);
          cObj.group.rotation.y = ds.dir * THREE.MathUtils.lerp(0, 0.62, smooth);
          cObj.group.rotation.z = -ds.dir * 0.08 * smooth;
          cObj.group.position.x = ds.startX + ds.dir * ds.maxLateral * smooth;
        } else if (p < 0.76) {
          // 2. Apex / Sustained Slide: Asfaltı ağlatan derin ve kontrollü drift
          const slideF = (p - 0.20) / 0.56;
          const sway = Math.sin(slideF * Math.PI * 4) * 0.05;
          cObj.group.rotation.y = ds.dir * (0.58 + sway);
          cObj.group.rotation.z = -ds.dir * 0.07;
          cObj.group.position.x = ds.startX + ds.dir * (ds.maxLateral + sway * 0.5);

          if (window.highwayEngine) {
            window.highwayEngine.emitDriftSmoke(cObj.group.position, 4);
            window.highwayEngine.emitSkidMarks(cObj.user.uniqueId, cObj.group.position, cObj.group.rotation.y, cObj.isMotor);
          }
        } else if (p < 1.0) {
          // 3. Çıkış / Toparlanma: Kontra direksiyon & şeride pürüzsüz oturma
          const exitF = (p - 0.76) / 0.24;
          const smoothExit = exitF * exitF * (3 - 2 * exitF);
          cObj.group.rotation.y = -ds.dir * 0.22 * (1.0 - smoothExit);
          cObj.group.rotation.z = 0;
          cObj.group.position.x = THREE.MathUtils.lerp(ds.startX + ds.dir * ds.maxLateral, cObj.targetPos.x, smoothExit);

          if (window.highwayEngine) {
            window.highwayEngine.emitDriftSmoke(cObj.group.position, 2);
            window.highwayEngine.emitSkidMarks(cObj.user.uniqueId, cObj.group.position, cObj.group.rotation.y, cObj.isMotor);
          }
        } else {
          cObj.isDrifting = false;
          cObj.driftState = null;
          cObj.group.rotation.set(0, 0, 0);
          if (window.highwayEngine) window.highwayEngine.clearSkidTrack(cObj.user.uniqueId);
        }
      } else {
        cObj.group.position.x = THREE.MathUtils.lerp(currentX, effectiveTargetX, 0.08);
      }

      cObj.group.position.z = THREE.MathUtils.lerp(currentZ, effectiveTargetZ, lerpSpeed);

      // 60 FPS PÜRÜZSÜZ TEK TEKER (WHEELIE) FİZİĞİ
      if (cObj.isWheelie && cObj.wheelieState) {
        const ws = cObj.wheelieState;
        ws.elapsed += dt;
        const p = Math.min(1.0, ws.elapsed / ws.duration);
        const pivot = ws.pivot;

        if (p < 0.20) {
          const f = p / 0.20;
          pivot.rotation.x = THREE.MathUtils.lerp(0, -0.68, f * f * (3 - 2 * f));
        } else if (p < 0.82) {
          pivot.rotation.x = -0.68 + Math.sin(ws.elapsed * 14) * 0.04;
          if (window.highwayEngine) {
            window.highwayEngine.emitWheelieSparks(cObj.group.position, 4);
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

      // Gerçekçi Süspansiyon & Gövde Yatıșı (Body Roll, Pitch & Mikro Canlılık)
      if (!cObj.isDrifting && !cObj.isBurnout && !cObj.isWheelie && !cObj.isOvertaking) {
        const velX = (cObj.group.position.x - prevX) / Math.max(0.001, dt);
        const velZ = (cObj.group.position.z - prevZ) / Math.max(0.001, dt);

        // Şerit değiştirirken viraja yatma (Roll)
        const targetRoll = THREE.MathUtils.clamp(-velX * (cObj.isMotor ? 0.32 : 0.07), -0.35, 0.35);
        // Direksiyon burun açısı (Yaw)
        const targetYaw = THREE.MathUtils.clamp(velX * (cObj.isMotor ? 0.22 : 0.04), -0.22, 0.22);
        // İvme / Fren çökmesi (Pitch)
        const accelZ = velZ - (cObj.lastVelZ || 0);
        cObj.lastVelZ = velZ;
        const targetPitch = THREE.MathUtils.clamp(-accelZ * 0.03, -0.04, 0.04);

        cObj.group.rotation.z = THREE.MathUtils.lerp(cObj.group.rotation.z, targetRoll, 0.15);
        cObj.group.rotation.y = THREE.MathUtils.lerp(cObj.group.rotation.y, targetYaw, 0.15);
        cObj.group.rotation.x = THREE.MathUtils.lerp(cObj.group.rotation.x, targetPitch, 0.12);

        // Gerçekçi Asfalt Titreşimi & Yüksek Hız İlerleme Hissi
        const rumbleTime = Date.now() * 0.012 + (cObj.rankIdx || 1);
        cObj.group.position.y = Math.sin(rumbleTime * 1.5) * 0.008 + (Math.sin(rumbleTime * 3.7) * 0.003);
        // Çok hafif konvoy içi ileri-geri gaz esnemesi (gerçek sürüş hissi)
        const cruiseSway = Math.sin(rumbleTime * 0.45) * 0.005;
        cObj.group.position.z += cruiseSway;
      }
    });

    // Gelin arabası: Yüksek hız süzülüşü ve amortisör nefesi
    if (this.leadCar) {
      const leadTime = Date.now() * 0.012;
      this.leadCar.position.y = Math.sin(leadTime * 1.6) * 0.007 + (Math.sin(leadTime * 3.5) * 0.003);
      this.leadCar.rotation.z = Math.sin(leadTime * 0.45) * 0.004;
      this.leadCar.rotation.x = Math.sin(leadTime * 0.75) * 0.003;
    }

    // 2. KESİN VE SERT ÇARPIŞMA / İÇ İÇE GİRME ENGELLEYİCİ (2D Bounding Box Mutual Separation)
    // Fiziksel sınır: İki aracın gövdesi ve sürücüsü hiçbir şart altında iç içe giremez!
    for (let i = 0; i < carsList.length; i++) {
      const vA = carsList[i];
      for (let j = i + 1; j < carsList.length; j++) {
        const vB = carsList[j];

        const dx = vB.group.position.x - vA.group.position.x;
        const dz = vB.group.position.z - vA.group.position.z;
        const absX = Math.abs(dx);
        const absZ = Math.abs(dz);

        const minZDist = (vA.isMotor && vB.isMotor) ? 9.5 : 14.5;
        const minXDist = 2.45;

        if (absX < minXDist && absZ < minZDist) {
          // İki araç tehlikeli temas sınırında: hem Z hem X ekseninde anında sertçe it!
          const overlapZ = minZDist - absZ;
          if (dz >= 0) {
            vA.group.position.z -= overlapZ * 0.6;
            vB.group.position.z += overlapZ * 0.4;
          } else {
            vB.group.position.z -= overlapZ * 0.6;
            vA.group.position.z += overlapZ * 0.4;
          }

          const overlapX = minXDist - absX;
          const pushDir = dx >= 0 ? 1 : -1;
          vB.group.position.x += pushDir * overlapX * 0.5;
          vA.group.position.x -= pushDir * overlapX * 0.5;
        }
      }
    }

    // 3. Tekerlekleri otoyol hızına göre döndür (60 FPS pürüzsüz dönüş)
    const baseWheelSpeed = ((window.highwayEngine ? window.highwayEngine.scrollSpeed : 38.0) / 0.33);
    if (this.leadCar && this.leadCar.userData.wheels) {
      this.leadCar.userData.wheels.forEach(w => {
        w.rotateX(baseWheelSpeed * dt);
      });
    }

    carsList.forEach(cObj => {
      let carWheels = cObj.group.userData.wheels;
      if (!carWheels && cObj.carMesh) carWheels = cObj.carMesh.userData.wheels;
      if (!carWheels) {
        cObj.group.traverse(ch => {
          if (ch.userData && ch.userData.wheels) carWheels = ch.userData.wheels;
        });
      }
      if (carWheels && carWheels.length > 0) {
        const mult = cObj.isBurnout ? 4.2 : (cObj.isDrifting ? 2.0 : 1.0);
        carWheels.forEach(w => {
          w.rotateX(baseWheelSpeed * mult * dt);
        });
      }
    });

    // 4. Rastgele konvoy içi dostça selektör selamlaşması (Her 8-12 saniyede bir)
    this.ambientSelektorTimer = (this.ambientSelektorTimer || 0) + dt;
    if (this.ambientSelektorTimer > 8.5) {
      this.ambientSelektorTimer = 0;
      const cars = Object.values(this.convoyCars);
      if (cars.length > 0 && Math.random() < 0.6) {
        const randCar = cars[Math.floor(Math.random() * cars.length)];
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

  // 3D Etiketleri ve Araç LOD / Mesafe Kırpması
  updateLabels() {
    const camera = this.camera;
    camera.updateMatrixWorld(true);
    const container = this.labelsContainer || document.body;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const tempV = new THREE.Vector3();

    // Gelin Arabası Bordo Plakası (Tavanın ve sunroof'un üstünde)
    if (this.leadCar && this.leadLabelEl) {
      tempV.set(this.leadCar.position.x, this.leadCar.position.y + 1.38, this.leadCar.position.z - 0.25);
      tempV.project(camera);
      if (tempV.z > 1 || tempV.z < -1) {
        this.leadLabelEl.style.display = 'none';
      } else {
        this.leadLabelEl.style.display = 'flex';
        const lx = (tempV.x * 0.5 + 0.5) * w;
        const ly = (-tempV.y * 0.5 + 0.5) * h;
        const lDist = camera.position.distanceTo(this.leadCar.position);
        // Yakın açıda (<=16m) sabit 0.95x; uzak açılarda yumuşakça küçülür
        const lScale = lDist <= 16.0 ? 0.95 : Math.max(0.32, Math.min(0.95, Math.pow(16.0 / lDist, 0.70)));
        this.leadLabelEl.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0) scale(${lScale.toFixed(2)}) translate(-50%, -100%)`;
      }
    }

    // Konvoy Araçları Etiketleri + Distance Culling
    Object.values(this.convoyCars).forEach(cObj => {
      const carPos = cObj.group.position;

      // 100+ araca kadar kesintisiz akış (-280m derinlik)
      const isVisibleRange = (carPos.z > -280 && carPos.z < 80);
      cObj.group.visible = isVisibleRange;

      if (!cObj.labelEl) return;

      if (!isVisibleRange) {
        cObj.labelEl.style.display = 'none';
        return;
      }

      // Aracın tam tavanı üstünde sabit hizalanmış pozisyon (Araba: 1.30m, Motor: 1.48m)
      const labelHeight = cObj.isMotor ? 1.48 : 1.30;
      tempV.set(carPos.x, carPos.y + labelHeight, carPos.z);
      tempV.project(camera);

      if (tempV.z > 1 || tempV.z < -1) {
        cObj.labelEl.style.display = 'none';
      } else {
        cObj.labelEl.style.display = 'flex';
        const sx = (tempV.x * 0.5 + 0.5) * w;
        const sy = (-tempV.y * 0.5 + 0.5) * h;
        const dist = camera.position.distanceTo(carPos);
        // Dinamik Perspektif Ölçeklendirme:
        // Yakın açılarda (dist <= 18m) 1.0x tam boyutunda kalır;
        // Kamera uzaklaştıkça araçları kapatmayacak şekilde yumuşakça küçülür (0.28x sınırına kadar)
        const baseDist = 18.0;
        const scale = dist <= baseDist
          ? 1.0
          : Math.max(0.28, Math.min(1.05, Math.pow(baseDist / dist, 0.72)));
        const opacity = dist > 140 ? Math.max(0, 1 - (dist - 140) / 50) : 1;
        cObj.labelEl.style.opacity = opacity.toFixed(2);
        cObj.labelEl.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) scale(${scale.toFixed(2)}) translate(-50%, -100%)`;
      }
    });
  }
}

window.ConvoyManager = ConvoyManager;
