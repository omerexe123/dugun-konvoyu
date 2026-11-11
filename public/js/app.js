/**
 * Düğün Konvoyu - Uygulama Girişi, WebSocket, Otomatik Yönetmen Kamerası ve Arayüz Kontrolü
 */

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('canvas-container');

  // 1. Three.js Sahnesi & Kamera (Canlı Şehir Bulvarı)
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a); // Slate-900 Gece Gökyüzü
  scene.fog = new THREE.FogExp2(0x0f172a, 0.0035);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 500);
  camera.position.set(0, 11, 24);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Retina ekranlarda 4K render yapıp GPU'yu eritmemesi için pixel ratio 1.0'a sabitlenir
  renderer.setPixelRatio(1.0);
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  container.appendChild(renderer.domElement);

  window.renderer = renderer;
  window.scene = scene;

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enabled = false;

  // Aydınlatma (Canlı Bulvar Işıkları)
  const ambientLight = new THREE.AmbientLight(0xffeedd, 1.1);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0x94a3b8, 0x1e293b, 0.75);
  hemiLight.position.set(0, 80, 0);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfffaed, 1.6);
  sunLight.position.set(25, 90, 35);
  sunLight.castShadow = false;
  scene.add(sunLight);

  // 2. Motorlar
  CarFactory.init();
  const highway = new HighwayEngine(scene);
  const audio = window.convoyAudio;
  const convoy = new ConvoyManager(scene, camera, controls, audio);
  window.convoy = convoy; // Kernel referansı: CarFactory modelleri yüklediğinde arabaları anında yeniler

  // -------------------------------------------------------------
  // Dinamik Gün / Gece (Aydınlık & Karanlık) Çevre Motoru
  // -------------------------------------------------------------
  const dayNight = {
    mode: 'auto', // 'auto' | 'day' | 'sunset' | 'night'
    time: 21.5,   // 0-24 saat
    speed: 0.25,  // 24 saat döngü akış hızı

    states: {
      day: {
        sky: new THREE.Color(0x38bdf8),
        fog: new THREE.Color(0x38bdf8),
        fogDensity: 0.0020,
        ambient: new THREE.Color(0xffffff),
        ambientInt: 1.4,
        sun: new THREE.Color(0xfffbeb),
        sunInt: 2.2,
        sunPos: new THREE.Vector3(30, 95, 40),
        hemiSky: new THREE.Color(0xbae6fd),
        hemiGround: new THREE.Color(0x64748b),
        coneOpacity: 0.05
      },
      sunset: {
        sky: new THREE.Color(0xd95328),
        fog: new THREE.Color(0x9a3412),
        fogDensity: 0.0030,
        ambient: new THREE.Color(0xfed7aa),
        ambientInt: 0.9,
        sun: new THREE.Color(0xfb923c),
        sunInt: 1.6,
        sunPos: new THREE.Vector3(65, 30, 25),
        hemiSky: new THREE.Color(0xfb7185),
        hemiGround: new THREE.Color(0x334155),
        coneOpacity: 0.22
      },
      night: {
        sky: new THREE.Color(0x090d16),
        fog: new THREE.Color(0x090d16),
        fogDensity: 0.0036,
        ambient: new THREE.Color(0x1e293b),
        ambientInt: 0.45,
        sun: new THREE.Color(0x60a5fa),
        sunInt: 0.4,
        sunPos: new THREE.Vector3(15, 75, 30),
        hemiSky: new THREE.Color(0x334155),
        hemiGround: new THREE.Color(0x020617),
        coneOpacity: 0.28
      }
    },

    setMode(newMode) {
      this.mode = newMode;
      if (newMode === 'day') this.time = 12.0;
      else if (newMode === 'sunset') this.time = 19.5;
      else if (newMode === 'night') this.time = 0.5;
      this.updateUI();
    },

    cycleNext() {
      const modes = ['auto', 'day', 'sunset', 'night'];
      const nextIdx = (modes.indexOf(this.mode) + 1) % modes.length;
      this.setMode(modes[nextIdx]);
    },

    updateUI() {
      document.querySelectorAll('.btn-time').forEach(b => {
        const isMatch = b.dataset.time === this.mode;
        b.style.background = isMatch ? 'rgba(56,189,248,0.25)' : 'rgba(255,255,255,0.08)';
        b.style.borderColor = isMatch ? '#38bdf8' : 'rgba(255,255,255,0.15)';
        b.style.color = isMatch ? '#e0f2fe' : '#cbd5e1';
      });
    },

    update(dt) {
      if (this.mode === 'auto') {
        this.time = (this.time + dt * this.speed) % 24.0;
      }

      const h = this.time;
      let sA, sB, f = 0;

      if (h >= 6.0 && h < 17.0) {
        sA = this.states.day; sB = this.states.day; f = 0;
      } else if (h >= 17.0 && h < 20.5) {
        sA = this.states.day; sB = this.states.sunset; f = (h - 17.0) / 3.5;
      } else if (h >= 20.5 && h < 22.0) {
        sA = this.states.sunset; sB = this.states.night; f = (h - 20.5) / 1.5;
      } else if (h >= 22.0 || h < 4.5) {
        sA = this.states.night; sB = this.states.night; f = 0;
      } else {
        sA = this.states.night; sB = this.states.day; f = (h - 4.5) / 1.5;
      }

      scene.background.lerpColors(sA.sky, sB.sky, f);
      scene.fog.color.lerpColors(sA.fog, sB.fog, f);
      scene.fog.density = THREE.MathUtils.lerp(sA.fogDensity, sB.fogDensity, f);

      ambientLight.color.lerpColors(sA.ambient, sB.ambient, f);
      ambientLight.intensity = THREE.MathUtils.lerp(sA.ambientInt, sB.ambientInt, f);

      sunLight.color.lerpColors(sA.sun, sB.sun, f);
      sunLight.intensity = THREE.MathUtils.lerp(sA.sunInt, sB.sunInt, f);
      sunLight.position.lerpVectors(sA.sunPos, sB.sunPos, f);

      hemiLight.color.lerpColors(sA.hemiSky, sB.hemiSky, f);
      hemiLight.groundColor.lerpColors(sA.hemiGround, sB.hemiGround, f);

      const targetConeOpacity = THREE.MathUtils.lerp(sA.coneOpacity, sB.coneOpacity, f);

      if (convoy && convoy.convoyCars) {
        Object.values(convoy.convoyCars).forEach(c => {
          const hl = c.group?.userData?.headlights;
          if (hl && !hl.isFlashing) {
            hl.baseConeOpacity = targetConeOpacity;
            hl.cones.forEach(cone => {
              cone.material.opacity = targetConeOpacity;
            });
          }
        });
        if (convoy.leadCar?.userData?.headlights) {
          const lhl = convoy.leadCar.userData.headlights;
          if (!lhl.isFlashing) {
            lhl.baseConeOpacity = targetConeOpacity;
            lhl.cones.forEach(cone => {
              cone.material.opacity = targetConeOpacity;
            });
          }
        }
      }
    }
  };

  window.dayNight = dayNight;

  // OBS Modu Kontrolü (?obs=1)
  const urlParams = new URLSearchParams(window.location.search);
  const isObs = urlParams.get('obs') === '1';
  if (isObs) {
    document.body.classList.add('obs-mode');
  }

  const autoUser = urlParams.get('user');

  // UI Referansları
  const tiktokInput = document.getElementById('tiktok-username');
  const btnConnect = document.getElementById('btn-connect');
  const btnDisconnect = document.getElementById('btn-disconnect');
  const statusBadge = document.getElementById('connection-status');
  const liveLogs = document.getElementById('live-logs');
  const camSelect = document.getElementById('camera-select');
  const btnMute = document.getElementById('btn-mute');
  const btnReset = document.getElementById('btn-reset');
  const btnAutoDemo = document.getElementById('btn-auto-demo');

  // 3. WebSocket Bağlantısı (Otomatik Yeniden Bağlanmalı)
  let ws = null;
  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
      console.log('[WS] Düğün konvoyu sunucusuna bağlandı!');
      addLog('Sunucuya bağlandı.', 'log-sys');
      if (autoUser) {
        setTimeout(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'CONNECT_TIKTOK', username: autoUser }));
          }
        }, 500);
      }
    };

    ws.onmessage = evt => {
      try {
        const msg = JSON.parse(evt.data);
        handleServerEvent(msg);
      } catch (e) {
        console.error('[WS] Hata:', e);
      }
    };

    ws.onclose = () => {
      setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = () => {
      try { ws.close(); } catch (e) {}
    };
  }
  connectWebSocket();

  function handleServerEvent(msg) {
    const { type, payload } = msg;

    switch (type) {
      case 'INIT_CONVOY_STATE':
        convoy.syncInitialState(payload);
        updateTiktokStatus(payload.liveStatus);
        break;

      case 'TIKTOK_STATUS':
        updateTiktokStatus(payload);
        break;

      case 'TIKTOK_CHAT':
        addLog(`💬 <b>${payload.nickname}:</b> ${escapeHtml(payload.comment)}`, 'log-chat');
        break;

      case 'EVENT_CONVOY_JOIN':
        convoy.spawnOrUpdateCar(payload.user, payload.rankIdx || Object.keys(convoy.convoyCars).length);
        addLog(payload.message, 'log-join');
        break;

      // 1. Gül -> Drift Aksiyonu
      case 'EVENT_DRIFT':
        convoy.triggerDrift(payload.user.uniqueId);
        addLog(payload.message, 'log-drift');
        break;

      // 2. Lastik Yakma -> Burnout Aksiyonu
      case 'EVENT_BURNOUT':
        convoy.triggerBurnout(payload.user.uniqueId);
        addLog(payload.message, 'log-burnout');
        break;

      // 3. Özel 5 TL Motor Çıkışı
      case 'EVENT_MOTOR_SPAWN':
        convoy.spawnOrUpdateCar(payload.user, payload.rankIdx || 0);
        convoy.focusCar(payload.user.uniqueId, 4500);
        convoy.showBanner(payload.message, 'banner-motor', 5000, payload.giftIcon || 'images/gifts/rosa.webp');
        addLog(payload.message, 'log-motor');
        break;

      // 4. Motor Ön Kaldırma (Wheelie)
      case 'EVENT_WHEELIE':
        convoy.triggerWheelie(payload.user.uniqueId);
        addLog(payload.message, 'log-wheelie');
        break;

      // 5. Puan & Sıralama Güncellemesi
      case 'EVENT_POINTS':
        if (payload.sortedConvoy && payload.sortedConvoy.length > 0) {
          payload.sortedConvoy.forEach((u, idx) => {
            convoy.spawnOrUpdateCar(u, idx);
          });
          const leaderEl = document.getElementById('hud-leader-name');
          if (leaderEl && payload.sortedConvoy[0]) {
            leaderEl.textContent = payload.sortedConvoy[0].nickname;
          }
        } else {
          convoy.spawnOrUpdateCar(payload.user || { uniqueId: payload.uniqueId, points: payload.newTotal, tier: payload.newTier, carName: payload.carName }, payload.rankIdx || 0);
        }
        break;

      case 'EVENT_CAR_UPGRADE':
        convoy.spawnOrUpdateCar(payload.user);
        convoy.showBanner(payload.message, 'banner-upgrade', 4500);
        if (audio) audio.playUpgradeFanfare();
        addLog(payload.message, 'log-upgrade');
        break;

      case 'EVENT_OVERTAKE':
        convoy.triggerOvertake(payload.user.uniqueId);
        addLog(payload.message, 'log-overtake');
        break;

      case 'EVENT_HONK':
        convoy.triggerHonk(payload.user.uniqueId);
        convoy.showBanner(payload.message, 'banner-honk', 3000);
        addLog(payload.message, 'log-honk');
        break;

      case 'EVENT_SELEKTOR':
        convoy.triggerSelektor(payload.user?.uniqueId);
        addLog(payload.message, 'log-selektor');
        break;

      case 'EVENT_COUPLE_UPDATE':
        convoy.updateLeadCarCouple(payload.brideName, payload.groomName);
        convoy.showBanner(payload.message, 'banner-couple', 5000);
        addLog(payload.message, 'log-couple');
        break;

      case 'EVENT_GALAXY_FESTIVAL':
        if (audio) audio.startDavulZurnaTheme(15000);
        convoy.showBanner(payload.message, 'banner-galaxy', 7000, payload.giftIcon || 'images/gifts/galaxy.webp');
        addLog(payload.message, 'log-galaxy');
        break;

      case 'EVENT_NEW_BRIDE':
        convoy.updateLeadCarCouple(payload.brideName, payload.groomName);
        convoy.showBanner(payload.message, 'banner-couple', 6000, payload.giftIcon || 'images/gifts/swan.webp');
        convoy.focusCar(null, 5000);
        if (audio) audio.startDavulZurnaTheme(10000);
        addLog(payload.message, 'log-couple');
        break;

      case 'EVENT_NEW_GROOM':
        convoy.updateLeadCarCouple(payload.brideName, payload.groomName);
        convoy.showBanner(payload.message, 'banner-couple', 6000, payload.giftIcon || 'images/gifts/lion.webp');
        convoy.focusCar(null, 5000);
        if (audio) audio.startDavulZurnaTheme(10000);
        addLog(payload.message, 'log-couple');
        break;

      case 'EVENT_NEON_EQUIP':
        convoy.setCarNeon(payload.uniqueId, payload.neonColor);
        convoy.showBanner(payload.message, 'banner-neon', 4500, payload.giftIcon || 'images/gifts/sunglasses.webp');
        convoy.focusCar(payload.uniqueId, 4000);
        addLog(payload.message, 'log-neon');
        break;

      case 'CONVOY_RESET':
        convoy.resetToLeadCarOnly(payload.brideName || 'Gelin Hanım 👰', payload.groomName || 'Damat Bey 🤵');
        addLog('🗑️ Konvoy sıfırlandı. Sadece Gelin & Damat arabası kaldı.', 'log-sys');
        break;
    }
  }

  function updateTiktokStatus(status) {
    if (!statusBadge) return;
    if (status.connected) {
      statusBadge.className = 'status-pill connected';
      statusBadge.innerHTML = `🟢 <b>@${status.username}</b> Canlı Bağlı`;
      if (btnConnect) btnConnect.style.display = 'none';
      if (btnDisconnect) btnDisconnect.style.display = 'inline-block';
    } else {
      statusBadge.className = 'status-pill disconnected';
      statusBadge.innerHTML = `🔴 Bağlantı Yok ${status.error ? `(${status.error})` : ''}`;
      if (btnConnect) btnConnect.style.display = 'inline-block';
      if (btnDisconnect) btnDisconnect.style.display = 'none';
    }
  }

  // Buton Olayları
  if (btnConnect) {
    btnConnect.addEventListener('click', () => {
      const u = tiktokInput.value.trim().replace(/^@/, '');
      if (u) ws.send(JSON.stringify({ type: 'CONNECT_TIKTOK', username: u }));
    });
  }

  if (btnDisconnect) {
    btnDisconnect.addEventListener('click', () => {
      ws.send(JSON.stringify({ type: 'DISCONNECT_TIKTOK' }));
    });
  }

  if (btnMute) {
    btnMute.addEventListener('click', () => {
      if (audio) {
        const isM = audio.toggleMute();
        btnMute.textContent = isM ? '🔇 Ses Kapalı' : '🔊 Ses Açık';
      }
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (confirm('Düğün konvoyunu sıfırlamak istiyor musunuz?')) {
        fetch('/api/reset', { method: 'POST' });
      }
    });
  }

  if (camSelect) {
    camSelect.addEventListener('change', (e) => {
      const mode = parseInt(e.target.value, 10);
      convoy.cameraMode = mode;
      controls.enabled = (mode === 7);
    });
  }

  // Gün / Gece Aydınlatma Butonları
  document.querySelectorAll('.btn-time').forEach(b => {
    b.addEventListener('click', () => {
      dayNight.setMode(b.dataset.time);
    });
  });

  // Müzik & Radyo Kontrolleri
  const btnMusicToggle = document.getElementById('btn-music-toggle');
  const btnMusicPrev = document.getElementById('btn-music-prev');
  const btnMusicNext = document.getElementById('btn-music-next');
  const musicSelect = document.getElementById('music-select');
  const musicVolSlider = document.getElementById('music-volume');
  const sfxVolSlider = document.getElementById('sfx-volume');
  const hudNowPlaying = document.getElementById('hud-now-playing');

  if (btnMusicToggle) {
    btnMusicToggle.addEventListener('click', () => {
      if (audio) audio.toggleMusic();
    });
  }

  if (btnMusicPrev) {
    btnMusicPrev.addEventListener('click', () => {
      if (audio) audio.prevTrack();
    });
  }

  if (btnMusicNext) {
    btnMusicNext.addEventListener('click', () => {
      if (audio) audio.nextTrack();
    });
  }

  if (musicSelect) {
    musicSelect.addEventListener('change', (e) => {
      if (audio) audio.playTrack(parseInt(e.target.value, 10));
    });
  }

  if (musicVolSlider) {
    musicVolSlider.addEventListener('input', (e) => {
      if (audio) audio.setMusicVolume(parseFloat(e.target.value) / 100);
    });
  }

  if (sfxVolSlider) {
    sfxVolSlider.addEventListener('input', (e) => {
      if (audio) audio.setSfxVolume(parseFloat(e.target.value) / 100);
    });
  }

  const btnTogglePanel = document.getElementById('btn-toggle-panel');
  const controlPanel = document.querySelector('.control-panel');
  if (btnTogglePanel && controlPanel) {
    btnTogglePanel.addEventListener('click', () => {
      controlPanel.classList.toggle('mobile-open');
    });
  }

  if (hudNowPlaying) {
    hudNowPlaying.addEventListener('click', () => {
      if (audio) audio.nextTrack();
    });
  }

  // Klavye kısayolları:
  // 0-7: Kamera
  // F: Selektör
  // L: Gün / Gece döngüsü
  // M: Sessize al / Aç
  // N: Sonraki şarkı
  // B: Önceki şarkı
  // P: Müzik duraklat / başlat
  window.addEventListener('keydown', (e) => {
    // Input alanında yazıyorsa kısayolları engelle
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) {
      return;
    }

    if (e.key >= '0' && e.key <= '7') {
      const mode = parseInt(e.key, 10);
      convoy.cameraMode = mode;
      controls.enabled = (mode === 7);
      if (camSelect) camSelect.value = String(mode);
    } else if (e.key === 'f' || e.key === 'F') {
      const u = getSimUser();
      simulate({ type: 'selektor', uniqueId: u, nickname: u });
    } else if (e.key === 'l' || e.key === 'L') {
      dayNight.cycleNext();
    } else if (e.key === 'n' || e.key === 'N') {
      if (audio) audio.nextTrack();
    } else if (e.key === 'b' || e.key === 'B') {
      if (audio) audio.prevTrack();
    } else if (e.key === 'p' || e.key === 'P') {
      if (audio) audio.toggleMusic();
    } else if (e.key === 'm' || e.key === 'M') {
      if (audio) {
        const isM = audio.toggleMute();
        if (btnMute) btnMute.textContent = isM ? '🔇 Ses Kapalı' : '🔊 Ses Açık';
      }
    }
  });

  // İlk kullanıcı etkileşiminde ses kilidini çöz
  ['click', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, () => {
      if (audio) audio.init();
    }, { once: true });
  });

  // -----------------------------------------------------------
  // Simülatör ve Otomatik Demo
  // -----------------------------------------------------------
  function simulate(payload) {
    fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(e => console.error(e));
  }

  const simInput = document.getElementById('sim-username');
  function getSimUser() {
    return simInput ? (simInput.value.trim() || 'Damat_Adayi') : 'Damat_Adayi';
  }

  document.querySelectorAll('[data-sim]').forEach(b => {
    b.addEventListener('click', () => {
      const action = b.getAttribute('data-sim');
      const u = getSimUser();
      switch (action) {
        case 'join': simulate({ type: 'join', uniqueId: u, nickname: u }); break;
        case 'honk': simulate({ type: 'honk', uniqueId: u, nickname: u }); break;
        case 'selektor': simulate({ type: 'selektor', uniqueId: u, nickname: u }); break;
        case 'drift':
        case 'rose':
          simulate({ type: 'drift', uniqueId: u, nickname: u }); break;
        case 'motor':
          simulate({ type: 'motor', uniqueId: u, nickname: u }); break;
        case 'wheelie':
          simulate({ type: 'wheelie', uniqueId: u, nickname: u }); break;
        case 'burnout':
          simulate({ type: 'burnout', uniqueId: u, nickname: u }); break;
        case 'overtake':
          simulate({ type: 'overtake', uniqueId: u, nickname: u }); break;
        case 'like':
          simulate({ type: 'like', uniqueId: u, nickname: u }); break;
        case 'galaxy':
          simulate({ type: 'galaxy', uniqueId: u, nickname: u }); break;
        case 'neon':
          simulate({ type: 'neon', uniqueId: u, nickname: u }); break;
        case 'bride':
          simulate({ type: 'bride', uniqueId: u, nickname: u }); break;
        case 'groom':
          simulate({ type: 'groom', uniqueId: u, nickname: u }); break;
      }
    });
  });

  // Otomatik Demo Akışı
  let autoDemoInterval = null;
  const demoUsers = [
    { nick: 'Ahmet_GolfR', type: 'car' },
    { nick: 'Can_YamahaR1', type: 'motor' },
    { nick: 'Mert_M5V8', type: 'car' },
    { nick: 'Burak_Ninja', type: 'motor' },
    { nick: 'Zeynep_GelinAdayi', type: 'car' },
    { nick: 'Selin_S2000', type: 'car' },
    { nick: 'Emre_X7SUV', type: 'car' },
    { nick: 'Kaan_Pulsar', type: 'motor' }
  ];

  if (btnAutoDemo) {
    btnAutoDemo.addEventListener('click', () => {
      if (autoDemoInterval) {
        clearInterval(autoDemoInterval);
        autoDemoInterval = null;
        btnAutoDemo.textContent = '🤖 Otomatik Demo';
        btnAutoDemo.style.background = 'linear-gradient(135deg, #10b981, #059669)';
      } else {
        btnAutoDemo.textContent = '⏹️ Demoyu Durdur';
        btnAutoDemo.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';

        // Konvoya araçları sok
        demoUsers.forEach((u, i) => {
          setTimeout(() => {
            if (u.type === 'motor') simulate({ type: 'motor', uniqueId: u.nick, nickname: u.nick });
            else simulate({ type: 'join', uniqueId: u.nick, nickname: u.nick });
          }, i * 250);
        });

        const actions = ['honk', 'drift', 'burnout', 'wheelie', 'overtake', 'like'];
        autoDemoInterval = setInterval(() => {
          const randUser = demoUsers[Math.floor(Math.random() * demoUsers.length)];
          const randAct = actions[Math.floor(Math.random() * actions.length)];
          simulate({ type: randAct, uniqueId: randUser.nick, nickname: randUser.nick });
        }, 2200);
      }
    });
  }

  function addLog(html, cls = '') {
    if (!liveLogs) return;
    const item = document.createElement('div');
    item.className = `log-item ${cls}`;
    item.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString()}</span> ${html}`;
    liveLogs.insertBefore(item, liveLogs.firstChild);
    if (liveLogs.children.length > 40) liveLogs.removeChild(liveLogs.lastChild);
  }

  function escapeHtml(str) {
    return str.replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t));
  }

  // -----------------------------------------------------------
  // 60 FPS Ana Render Döngüsü & Performans Takibi
  // -----------------------------------------------------------
  let lastT = performance.now();
  let frameCount = 0;
  let fpsTimer = performance.now();
  window.currentFPS = 60;

  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;

    frameCount++;
    if (now - fpsTimer >= 1000) {
      window.currentFPS = Math.round((frameCount * 1000) / (now - fpsTimer));
      frameCount = 0;
      fpsTimer = now;
    }

    dayNight.update(dt);
    highway.update(dt);
    convoy.update(dt);

    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
});
