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

    // 3 Şeritli Doğal Konvoy Dizilimi (-2.85: Sol, 0: Orta, 2.85: Sağ)
    const laneOffsetsX = [0, 2.85, -2.85];
    const targetX = laneOffsetsX[rankIdx % 3];
    // Artırılmış ferah konvoy aralığı: Araçlar arası mesafe artırıldı, iç içe girmeyi engeller
    // Sıra başı 14.5m ferah aralık, şerit kademesi 4.2m
    const targetZ = -10.0 - Math.floor(rankIdx / 3) * 14.5 - (rankIdx % 3) * 4.2;

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
      if (cObj.carMesh) cObj.group.remove(cObj.carMesh);

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
  // 1. GÜL HEDİYESİ -> UZUN VE GERÇEKÇİ DRİFT (LASTİK İZLERİ DAHİL)
  // -------------------------------------------------------------
  triggerDrift(uniqueId) {
    const cObj = this.convoyCars[uniqueId];
    if (!cObj || cObj.isDrifting) return;

    cObj.isDrifting = true;
    this.focusCar(uniqueId, 5000);

    if (this.audio) this.audio.playTireDrift();
    this.showBanner(`🌹💨 ${cObj.user.nickname} GÜL HEDİYESİYLE ASFALTI AĞLATIYOR! UZUN DRİFT!`, 'banner-drift', 4500, 'images/gifts/rose.webp');

    const startX = cObj.group.position.x;
    // Sağa veya sola doğru savrulma yönü
    const driftDir = startX > 0 ? -1 : 1;
    let t = 0;
    const totalDurationSec = 3.6;
    const intervalMs = 30;
    const step = intervalMs / (totalDurationSec * 1000);

    const driftInterval = setInterval(() => {
      t += step;

      if (t < 0.20) {
        // Aşama 1: Agresif direksiyon kırma & şasi yatışı
        const phase1 = t / 0.20;
        cObj.group.rotation.y = driftDir * THREE.MathUtils.lerp(0, 0.62, phase1);
        cObj.group.rotation.z = -driftDir * 0.08 * phase1; // Gövde viraja yatar
        cObj.group.position.x += driftDir * 0.07;
      } else if (t < 0.78) {
        // Aşama 2: Uzun ve derin yanlama (Sustained Power Slide)
        // Karşı şeride doğru kayış & kontrollü dalgalanma
        cObj.group.rotation.y = driftDir * (0.58 + Math.sin(t * 12) * 0.07);
        cObj.group.rotation.z = -driftDir * (0.06 + Math.sin(t * 10) * 0.02);
        cObj.group.position.x += driftDir * 0.065;

        // Yoğun lastik dumanı fışkırt & asfaltta kesintisiz pürüzsüz lastik izi çiz
        if (window.highwayEngine) {
          window.highwayEngine.emitDriftSmoke(cObj.group.position, 4);
          window.highwayEngine.emitSkidMarks(uniqueId, cObj.group.position, cObj.group.rotation.y, cObj.isMotor);
        }
      } else if (t < 1.0) {
        // Aşama 3: Kontra verme (Counter-Steer) & Şeride toparlama
        const phase3 = (t - 0.78) / 0.22;
        cObj.group.rotation.y = -driftDir * 0.26 * (1.0 - phase3);
        cObj.group.rotation.z = 0;
        cObj.group.position.lerp(cObj.targetPos, 0.12);

        // Toparlarken hafif duman ve iz
        if (window.highwayEngine) {
          window.highwayEngine.emitDriftSmoke(cObj.group.position, 2);
          window.highwayEngine.emitSkidMarks(uniqueId, cObj.group.position, cObj.group.rotation.y, cObj.isMotor);
        }
      } else {
        clearInterval(driftInterval);
        cObj.group.rotation.set(0, 0, 0);
        cObj.isDrifting = false;
        if (window.highwayEngine) window.highwayEngine.clearSkidTrack(uniqueId);
      }
    }, intervalMs);
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
  // 3. MOTOR ÖN KALDIRMA (WHEELIE) AKSİYONU (KUSURSUZ ASFALT HİZASI)
  // -------------------------------------------------------------
  triggerWheelie(uniqueId) {
    const cObj = this.convoyCars[uniqueId];
    if (!cObj || cObj.isWheelie) return;

    const pivot = cObj.carMesh?.userData?.wheeliePivot;
    if (!pivot) return;

    cObj.isWheelie = true;
    this.focusCar(uniqueId, 4500);

    if (this.audio) this.audio.playMotorcycleRev();
    this.showBanner(`🏍️⚡ ${cObj.user.nickname} TEK TEKER ÖN KALDIRDI!`, 'banner-wheelie', 4500, 'images/gifts/heart.webp');

    let t = 0;
    const wheelieInterval = setInterval(() => {
      t += 0.035;

      if (t < 0.22) {
        // Ön tekerleği YUKARI (-0.68 radyan ~ 39 derece) kaldır!
        // Araç +Z yönüne baktığı için negatif pitch açısı ön tekerleği havaya diker!
        pivot.rotation.x = THREE.MathUtils.lerp(pivot.rotation.x, -0.68, 0.25);
      } else if (t < 0.82) {
        // Tek tekerde denge, gazlama & asfalta değen arka demirden kıvılcımlar
        pivot.rotation.x = -0.68 + Math.sin(t * 14) * 0.04;
        if (window.highwayEngine) {
          window.highwayEngine.emitWheelieSparks(cObj.group.position, 4);
          window.highwayEngine.emitSkidMarks(uniqueId, cObj.group.position, 0, true);
        }
      } else if (t < 1.0) {
        // Önü yumuşakça asfalta indir
        pivot.rotation.x = THREE.MathUtils.lerp(pivot.rotation.x, 0, 0.22);
      } else {
        clearInterval(wheelieInterval);
        pivot.rotation.x = 0;
        cObj.isWheelie = false;
        if (this.audio) this.audio.playWheelieLand();
        if (window.highwayEngine) window.highwayEngine.clearSkidTrack(uniqueId);
      }
    }, 32);
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
    this.focusCar(uniqueId, durationMs);
    this.giftFocusCarId = uniqueId;
    this.giftFocusUntil = Date.now() + durationMs;
    const cObj = this.convoyCars[uniqueId];
    if (cObj) {
      cObj.giftFocusUntil = Date.now() + durationMs;
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

    // Kamera Manuel Modda Bile Olsa Hediye Odağında Araca Zoom Yap
    if (isFocusActive) {
      const fPos = this.convoyCars[this.focusedCarId].group.position;
      const targetCamPos = new THREE.Vector3(fPos.x + 3.2, fPos.y + 2.2, fPos.z + 6.6);
      const targetLookAt = new THREE.Vector3(fPos.x, fPos.y + 0.8, fPos.z - 1.2);

      this.currentCamPos.lerp(targetCamPos, 0.08);
      this.currentCamLook.lerp(targetLookAt, 0.08);

      this.camera.position.copy(this.currentCamPos);
      this.camera.lookAt(this.currentCamLook);
      return;
    }

    // Otomatik Yönetmen Modu (cameraMode === 0)
    if (this.cameraMode === 0) {
      // Hediye Yoksa Boşta Sinematik Gezinme (Gelin Arabası & Konvoy Süzülüşü)
      this.idleTimer += dt;
      const orbitAngle = this.idleTimer * 0.22;
      const orbitRadius = 14.0 + Math.sin(this.idleTimer * 0.15) * 3.0;
      const camY = 5.5 + Math.sin(this.idleTimer * 0.2) * 2.0;

      const targetCamPos = new THREE.Vector3(
        Math.sin(orbitAngle) * 5.5,
        camY,
        leadZ + orbitRadius
      );
      const targetLookAt = new THREE.Vector3(0, 1.2, leadZ - 6.0);

      this.currentCamPos.lerp(targetCamPos, 0.04);
      this.currentCamLook.lerp(targetLookAt, 0.04);

      this.camera.position.copy(this.currentCamPos);
      this.camera.lookAt(this.currentCamLook);
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
        this.camera.position.set(-11, 4.2, leadZ + 8);
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
      if (cObj.isOvertaking || cObj.isDrifting || cObj.isBurnout) return;

      let effectiveTargetZ = cObj.targetPos.z;
      let effectiveTargetX = cObj.targetPos.x;
      const currentZ = cObj.group.position.z;
      const currentX = cObj.group.position.x;

      // A. Gelin Arabası ile Takip Mesafesi (Lead Car at Z=6.0)
      if (this.leadCar && Math.abs(currentX - this.leadCar.position.x) < 2.5) {
        const MIN_LEAD_DIST = 14.0; // Gelin arabasının arkasında en az 14m ferah mesafe
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
          // Aynı veya bitişik şeritte ise: arkasındaki araçlar en az 18m geriye çekilir, önündekiler 14m açılır!
          if (currentZ <= giftZ) {
            const GIFT_REAR_DIST = 18.0;
            if (effectiveTargetZ > giftZ - GIFT_REAR_DIST) {
              effectiveTargetZ = giftZ - GIFT_REAR_DIST;
            }
          } else {
            const GIFT_FRONT_DIST = 14.0;
            if (effectiveTargetZ < giftZ + GIFT_FRONT_DIST) {
              effectiveTargetZ = giftZ + GIFT_FRONT_DIST;
            }
          }
        } else if (Math.abs(currentZ - giftZ) < 8.0) {
          // Yanındaki şeritlerdeki araçlar dışa açılarak sahneyi hediye aracına bırakır
          const pushX = currentX >= giftX ? 1.0 : -1.0;
          effectiveTargetX = THREE.MathUtils.clamp(effectiveTargetX + pushX * 0.8, -4.2, 4.2);
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
            if (lateralDist < 2.4) {
              const SAFE_FOLLOW_DIST = 12.0; // Minimum 12m güvenli tampon mesafesi
              if (effectiveTargetZ > otherZ - SAFE_FOLLOW_DIST) {
                effectiveTargetZ = otherZ - SAFE_FOLLOW_DIST;
              }
              if (forwardDist < SAFE_FOLLOW_DIST - 1.0) {
                cObj.group.position.z = Math.min(cObj.group.position.z, otherZ - SAFE_FOLLOW_DIST);
              }
            }
          } else {
            // cObj daha yüksek puana sahip ve öne geçiyor (Overtake): Aynı şerittelerse yana açıl
            if (lateralDist < 2.2 && forwardDist < 8.0) {
              const passDir = currentX >= 0 ? 1 : -1;
              cObj.group.position.x += passDir * 0.04;
            }
          }
        } else {
          // Yan yana geçerken iç içe girmeyi önleyen yanal itme kuvveti
          const forwardDist = Math.abs(otherZ - currentZ);
          const lateralDist = Math.abs(currentX - otherX);
          if (forwardDist < 5.5 && lateralDist < 2.2) {
            const pushDir = currentX >= otherX ? 1 : -1;
            cObj.group.position.x += pushDir * 0.04;
          }
        }
      });

      // Dinamik Frenleme & Gazlama Hissi: Mesafeye göre yumuşak lerp
      const distToTarget = Math.abs(effectiveTargetZ - currentZ);
      const lerpSpeed = THREE.MathUtils.clamp(distToTarget * 0.015 + 0.05, 0.04, 0.12);

      cObj.group.position.x = THREE.MathUtils.lerp(currentX, effectiveTargetX, 0.08);
      cObj.group.position.z = THREE.MathUtils.lerp(currentZ, effectiveTargetZ, lerpSpeed);
    });

    // 2. KESİN VE SERT ÇARPIŞMA / İÇ İÇE GİRME ENGELLEYİCİ (Hard Non-Penetration Clamp)
    // Fiziksel sınır: İki aracın gövdesi hiçbir zaman iç içe giremez!
    const activeVehicles = carsList.filter(c => !c.isDrifting && !c.isBurnout);
    activeVehicles.sort((a, b) => b.group.position.z - a.group.position.z);

    for (let i = 0; i < activeVehicles.length; i++) {
      const front = activeVehicles[i];
      for (let j = i + 1; j < activeVehicles.length; j++) {
        const rear = activeVehicles[j];
        const latDist = Math.abs(front.group.position.x - rear.group.position.x);
        if (latDist < 2.2) {
          const minGap = (front.isMotor && rear.isMotor) ? 6.5 : 9.5;
          if (rear.group.position.z > front.group.position.z - minGap) {
            rear.group.position.z = front.group.position.z - minGap;
          }
        }
      }
    }

    // 3. Tekerlekleri otoyol hızına göre döndür (60 FPS pürüzsüz dönüş)
    const baseWheelSpeed = ((window.highwayEngine ? window.highwayEngine.scrollSpeed : 38.0) / 0.33);
    if (this.leadCar && this.leadCar.userData.wheels) {
      this.leadCar.userData.wheels.forEach(w => {
        w.rotation.x += baseWheelSpeed * dt;
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
        const mult = (cObj.isDrifting || cObj.isBurnout) ? 1.75 : 1.0;
        carWheels.forEach(w => {
          w.rotation.x += baseWheelSpeed * mult * dt;
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
    const w = window.innerWidth;
    const h = window.innerHeight;
    const tempV = new THREE.Vector3();

    // Gelin Arabası Bordo Plakası (Tavanın ve sunroof'un üstünde)
    if (this.leadCar && this.leadLabelEl) {
      tempV.set(this.leadCar.position.x, this.leadCar.position.y + 1.45, this.leadCar.position.z - 0.45);
      tempV.project(camera);
      if (tempV.z > 1) {
        this.leadLabelEl.style.display = 'none';
      } else {
        this.leadLabelEl.style.display = 'flex';
        const lx = (tempV.x * 0.5 + 0.5) * w;
        const ly = (-tempV.y * 0.5 + 0.5) * h;
        const lDist = camera.position.distanceTo(this.leadCar.position);
        const lScale = Math.max(0.60, Math.min(0.95, 36 / lDist));
        this.leadLabelEl.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0) translate(-50%, -100%) scale(${lScale.toFixed(2)})`;
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

      // Aracın tam tavanı üstünde sabit hizalanmış pozisyon (Araba: 1.30m, Motor: 1.55m)
      const labelHeight = cObj.isMotor ? 1.55 : 1.30;
      tempV.set(carPos.x, carPos.y + labelHeight, carPos.z);
      tempV.project(camera);

      if (tempV.z > 1) {
        cObj.labelEl.style.display = 'none';
      } else {
        cObj.labelEl.style.display = 'flex';
        const sx = (tempV.x * 0.5 + 0.5) * w;
        const sy = (-tempV.y * 0.5 + 0.5) * h;
        const dist = camera.position.distanceTo(carPos);
        // Aşırı büyümeyi engelleyen kompakt ölçek (0.40 - 0.70 arası)
        const scale = Math.max(0.40, Math.min(0.70, 26 / dist));
        const opacity = dist > 90 ? Math.max(0, 1 - (dist - 90) / 45) : 1;
        cObj.labelEl.style.opacity = opacity.toFixed(2);
        cObj.labelEl.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(2)})`;
      }
    });
  }
}

window.ConvoyManager = ConvoyManager;
