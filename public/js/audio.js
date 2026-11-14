/**
 * Düğün Konvoyu - Profesyonel Gerçek Ses & Müzik Motoru (ConvoyAudioEngine)
 * - Gerçek Lastik Drift & Asfalt Kayma Sesi
 * - Gerçek Selektör Röle / Far Çakma Sesi
 * - Gerçek Türk Düğün Kornası (Düt Düt Düt Düüüüt Düt!)
 * - Gerçek Kesici / Motor Devri & Burnout
 * - Kesintisiz Arka Plan Düğün, Pop & Piyasa Müzik Çaları
 */
class ConvoyAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.sfxVolume = 0.75;
    this.musicVolume = 0.50;

    // SFX Buffer Deposu
    this.sfxBuffers = {};
    this.sfxLoading = {};
    this.sfxUrls = {
      wedding_horn: 'audio/sfx/wedding_horn.mp3',
      horn_single: 'audio/sfx/horn_single.mp3',
      drift: 'audio/sfx/drift_real.mp3',
      burnout: 'audio/sfx/burnout_real.mp3',
      motorcycle: 'audio/sfx/motorcycle_rev_real.mp3',
      selektor: 'audio/sfx/selektor_real.mp3'
    };

    // Müzik Çalar (Kernel Seviyesi Tekil Çalma Korumalı)
    this.musicAudio = new Audio();
    this.musicAudio.preload = 'auto';
    this.musicAudio.volume = this.musicVolume;
    this.musicPlaying = false;
    this.currentTrackIndex = 0;
    this.playlist = [];
    this._switchingTrack = false;
    this._lastTrackSwitchTime = 0;
    this._errorRetryTimer = null;

    // Çoklu Sekme ve OBS Ses Çakışmasını Engelleyen Master Mutex
    this.tabId = 'tab_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    this.tabChannel = null;
    this._initCrossTabSync();

    // URL Parametreleri (OBS veya Sessiz Mod: ?nomusic=1 veya ?mute=1)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('nomusic') === '1' || urlParams.get('mute') === '1') {
      this.muted = true;
      this.musicAudio.volume = 0;
    }

    // Varsayılan Çalma Listesi (JSON yüklenene kadar veya offline yedek)
    this.defaultPlaylist = [
      { id: 'dugun_kara_uzum_habbesi', title: 'İbrahim Tatlıses - Kara Üzüm Habbesi', category: 'Düğün / Halay', url: 'audio/music/dugun_kara_uzum_habbesi.mp3' },
      { id: 'dugun_erik_dali', title: 'Ömer Faruk Bostan - Erik Dalı', category: 'Düğün / Oyun Havası', url: 'audio/music/dugun_erik_dali.mp3' },
      { id: 'dugun_halay_potpori', title: 'Coşkulu Davul Zurna & Halay Potpori', category: 'Düğün / Halay', url: 'audio/music/dugun_halay_potpori.mp3' },
      { id: 'dugun_ankara_kostak', title: 'Ankara Oyun Havası (Kostak & Fidayda)', category: 'Düğün / Ankara Havası', url: 'audio/music/dugun_ankara_kostak.mp3' },
      { id: 'dugun_ismail_yk_8080', title: 'İsmail YK - 80 80 160 (Düğün Mix)', category: 'Düğün / Oyun Havası', url: 'audio/music/dugun_ismail_yk_8080.mp3' },
      { id: 'pop_tarkan_yolla', title: 'Tarkan - Yolla', category: 'Türkçe Pop', url: 'audio/music/pop_tarkan_yolla.mp3' },
      { id: 'pop_cagla_saz_mi_caz_mi', title: 'Çağla - Saz Mı Caz Mı', category: 'Türkçe Pop', url: 'audio/music/pop_cagla_saz_mi_caz_mi.mp3' },
      { id: 'pop_simge_askin_olayim', title: 'Simge - Aşkın Olayım', category: 'Türkçe Pop', url: 'audio/music/pop_simge_askin_olayim.mp3' },
      { id: 'pop_cevapsiz_cinlama', title: 'Aleyna Tilki & Emrah Karaduman - Cevapsız Çınlama', category: 'Türkçe Pop', url: 'audio/music/pop_cevapsiz_cinlama.mp3' },
      { id: 'piyasa_ceza_yerli_plaka', title: 'Ceza - Yerli Plaka (Cadde & Drift)', category: 'Piyasa / Hip-Hop', url: 'audio/music/piyasa_ceza_yerli_plaka.mp3' },
      { id: 'piyasa_ben_fero_demet', title: 'Ben Fero - Demet Akalın (Piyasa Trap)', category: 'Piyasa / Trap', url: 'audio/music/piyasa_ben_fero_demet.mp3' },
      { id: 'piyasa_drift_phonk', title: 'Kontraa - Aggressive Drift Phonk', category: 'Piyasa / Drift Phonk', url: 'audio/music/piyasa_drift_phonk.mp3' }
    ];

    this.initDone = false;
    this._setupMusicEvents();
    this.loadPlaylist();

    // İlk kullanıcı etkileşiminde ses bağlamını ve müziği uyandır
    const unlockAudio = () => {
      this.init();
      // Eğer henüz müzik çalmıyorsa otomatik başlat
      if (!this.musicPlaying && !this.muted) {
        this.startMusic();
      }
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    // OBS / Yayın Modu: OBS Browser Source içinde insan tıklaması olmayacağı için doğrudan ses motorunu tetikle
    if (urlParams.get('obs') === '1' || urlParams.get('autoplay') === '1') {
      const tryAutoStart = () => {
        this.init();
        if (!this.musicPlaying && !this.muted) {
          this.startMusic();
        }
      };
      setTimeout(tryAutoStart, 300);
      setTimeout(tryAutoStart, 1000);
      setTimeout(tryAutoStart, 2500);
    }
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (!this.initDone) {
      this.initDone = true;
      this.preloadAllSfx();
    }
  }

  // --- SFX YÜKLEME & ÇALMA SİSTEMİ ---
  async preloadAllSfx() {
    for (const [key, url] of Object.entries(this.sfxUrls)) {
      this.loadSfxBuffer(key, url);
    }
  }

  async loadSfxBuffer(key, url) {
    if (this.sfxBuffers[key] || this.sfxLoading[key]) return;
    this.sfxLoading[key] = true;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuf = await res.arrayBuffer();
      if (!this.ctx) this.init();
      const decoded = await this.ctx.decodeAudioData(arrayBuf);
      this.sfxBuffers[key] = decoded;
    } catch (e) {
      console.warn(`[ConvoyAudio] SFX yüklenemedi: ${key} (${url}) -> Sentetik yedek devrede.`, e);
    } finally {
      this.sfxLoading[key] = false;
    }
  }

  playBuffer(key, options = {}) {
    if (this.muted) return null;
    this.init();
    const buffer = this.sfxBuffers[key];
    if (!buffer || !this.ctx) return null;

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      // Hız / Pitch ayarı
      const rate = options.rate !== undefined ? options.rate : 1.0;
      source.playbackRate.setValueAtTime(rate, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      const vol = (options.volume !== undefined ? options.volume : 1.0) * this.sfxVolume;
      gain.gain.setValueAtTime(Math.max(0.001, vol), this.ctx.currentTime);

      source.connect(gain);
      gain.connect(this.ctx.destination);

      source.start(this.ctx.currentTime + (options.delay || 0));
      return source;
    } catch (e) {
      console.warn('[ConvoyAudio] Buffer çalma hatası:', e);
      return null;
    }
  }

  // 1. GERÇEK TÜRK DÜĞÜN KORNASI (Örneklenmiş Gerçek Korna Ritmi)
  playWeddingHorn() {
    if (this.muted) return;
    this.init();

    if (this.sfxBuffers.wedding_horn) {
      this.playBuffer('wedding_horn', { volume: 0.95 });
      return;
    }

    // Yedek (Buffer henüz gelmediyse)
    const pattern = [[0, 0.22], [0.28, 0.16], [0.48, 0.16], [0.68, 0.42], [1.15, 0.28]];
    pattern.forEach(([startOffset, dur]) => {
      setTimeout(() => {
        if (this.muted || !this.ctx) return;
        const t = this.ctx.currentTime;
        [349.23, 440.0].forEach(freq => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.18 * this.sfxVolume, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + dur);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + dur);
        });
      }, startOffset * 1000);
    });
  }

  // Tekli Gerçek Korna
  playSingleHorn() {
    if (this.muted) return;
    this.init();
    if (this.sfxBuffers.horn_single) {
      this.playBuffer('horn_single', { volume: 0.9 });
    } else {
      this.playWeddingHorn();
    }
  }

  // 2. GERÇEK LASTİK KAYMA & DRİFT SESİ (Authentic Tire Screech)
  playTireDrift() {
    if (this.muted) return;
    this.init();

    if (this.sfxBuffers.drift) {
      // Doğal varyasyon için rastgele hafif pitch farkı (+-%6)
      const jitter = 0.94 + Math.random() * 0.12;
      this.playBuffer('drift', { volume: 0.85, rate: jitter });
      return;
    }

    // Yedek
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(840, t);
      osc.frequency.linearRampToValueAtTime(1180, t + 0.35);
      osc.frequency.linearRampToValueAtTime(720, t + 1.2);
      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.24 * this.sfxVolume, t + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 1.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 1.35);
    } catch (e) {}
  }

  // 3. GERÇEK BURNOUT (LASTİK YAKMA & DEVİR)
  playBurnoutRev() {
    if (this.muted) return;
    this.init();

    if (this.sfxBuffers.burnout) {
      this.playBuffer('burnout', { volume: 1.0 });
      return;
    }

    // Yedek
    this.playTireDrift();
  }

  // 4. GERÇEK MOTOSİKLET YÜKSEK DEVİR SESİ (14.000 RPM)
  playMotorcycleRev() {
    if (this.muted) return;
    this.init();

    if (this.sfxBuffers.motorcycle) {
      const jitter = 0.96 + Math.random() * 0.08;
      this.playBuffer('motorcycle', { volume: 0.95, rate: jitter });
      return;
    }

    // Yedek
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(950, t + 0.6);
      osc.frequency.exponentialRampToValueAtTime(450, t + 1.4);
      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.32 * this.sfxVolume, t + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 1.55);
    } catch (e) {}
  }

  // 5. GERÇEK SELEKTÖR SESİ (Otomotiv Röle & Stalk Tıklama)
  playHighBeamFlash() {
    if (this.muted) return;
    this.init();

    if (this.sfxBuffers.selektor) {
      this.playBuffer('selektor', { volume: 0.95 });
      return;
    }

    // Yedek
    try {
      const t = this.ctx.currentTime;
      [0, 0.13].forEach(offset => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1350, t + offset);
        osc.frequency.exponentialRampToValueAtTime(1950, t + offset + 0.04);
        gain.gain.setValueAtTime(0.20 * this.sfxVolume, t + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.05);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t + offset);
        osc.stop(t + offset + 0.06);
      });
    } catch (e) {}
  }

  // 6. EGZOZ PATLATMA / ALEV ATMA (Pop & Bang)
  playExhaustBackfire() {
    if (this.muted) return;
    this.init();

    const pops = [0, 0.08, 0.18, 0.3];
    pops.forEach(delay => {
      setTimeout(() => {
        if (this.muted || !this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160, t);
        osc.frequency.exponentialRampToValueAtTime(25, t + 0.12);
        gain.gain.setValueAtTime(0.45 * this.sfxVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.12);
      }, delay * 1000);
    });
  }

  // 7. MAKAS ATMA RÜZGAR / FIRLAMA (Whoosh)
  playOvertakeWhoosh() {
    if (this.muted) return;
    this.init();
    try {
      const t = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate * 0.35;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(400, t);
      filter.frequency.exponentialRampToValueAtTime(1400, t + 0.15);
      filter.frequency.exponentialRampToValueAtTime(300, t + 0.35);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.3 * this.sfxVolume, t + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(t);
      noise.stop(t + 0.35);
    } catch (e) {}
  }

  // 8. ARABA YÜKSELTME FANFARI
  playUpgradeFanfare() {
    if (this.muted) return;
    this.init();
    try {
      const t = this.ctx.currentTime;
      const notes = [329.63, 440.0, 554.37, 659.25, 880.0];
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = idx === notes.length - 1 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(freq, t + idx * 0.08);

        const dur = idx === notes.length - 1 ? 0.5 : 0.14;
        gain.gain.setValueAtTime(0.22 * this.sfxVolume, t + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.01, t + idx * 0.08 + dur);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t + idx * 0.08);
        osc.stop(t + idx * 0.08 + dur);
      });
    } catch (e) {}
  }

  // 9. TEK TEKER (WHEELIE) YERE İNİŞ
  playWheelieLand() {
    if (this.muted) return;
    this.init();
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.22);
      gain.gain.setValueAtTime(0.4 * this.sfxVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    } catch (e) {}
  }

  // --- ARKA PLAN MÜZİK MOTORU (TEKİL MASTER & ÇOKLU SEKME KORUMALI) ---

  // Çoklu sekme ve pencere senkronizasyonu: Aynı anda yalnızca 1 sekme müzik çalabilir
  _initCrossTabSync() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.tabChannel = new BroadcastChannel('convoy_audio_master');
        this.tabChannel.onmessage = (event) => {
          if (!event || !event.data) return;
          if (event.data.type === 'CLAIM_MASTER_PLAYBACK' && event.data.tabId !== this.tabId) {
            // Başka bir sekme müzik başlattı: Bu sekmedeki müziği anında ve sessizce durdur!
            if (this.musicPlaying) {
              console.log('[ConvoyAudio] Başka bir sekme aktifleşti. Çift müzik çalmasını önlemek için bu sekme susturuldu.');
              this.pauseMusic(false);
            }
          }
        };
      } catch (e) {}
    }

    // BroadcastChannel olmayan tarayıcılar için LocalStorage Fallback
    window.addEventListener('storage', (e) => {
      if (e.key === 'convoy_music_master_tab') {
        if (e.newValue && e.newValue !== this.tabId && this.musicPlaying) {
          console.log('[ConvoyAudio] LocalStorage uyarısı: Başka sekme aktif, müzik durduruluyor.');
          this.pauseMusic(false);
        }
      }
    });
  }

  _claimMasterPlayback() {
    try {
      localStorage.setItem('convoy_music_master_tab', this.tabId);
      localStorage.setItem('convoy_music_master_time', Date.now().toString());
      if (this.tabChannel) {
        this.tabChannel.postMessage({ type: 'CLAIM_MASTER_PLAYBACK', tabId: this.tabId });
      }
    } catch (e) {}
  }

  _setupMusicEvents() {
    this.musicAudio.addEventListener('ended', () => {
      // Şarkı bittiğinde sonraki parçaya yumuşak geçiş
      this.nextTrack();
    });

    this.musicAudio.addEventListener('error', (e) => {
      // Şarkı geçişinde iptal (MEDIA_ERR_ABORTED - code 1) olduysa sonsuz döngü ve çakışma başlatma
      if (this.musicAudio.error && this.musicAudio.error.code === 1) {
        return;
      }
      console.warn('[ConvoyAudio] Müzik parçası çalınamadı:', e);
      clearTimeout(this._errorRetryTimer);
      this._errorRetryTimer = setTimeout(() => {
        if (this.musicPlaying) {
          this.nextTrack();
        }
      }, 2500);
    });
  }

  async loadPlaylist() {
    try {
      const res = await fetch('audio/music/playlist.json');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          this.playlist = data;
        } else {
          this.playlist = this.defaultPlaylist;
        }
      } else {
        this.playlist = this.defaultPlaylist;
      }
    } catch (e) {
      this.playlist = this.defaultPlaylist;
    }
    this._populateTrackSelector();
    this.updateNowPlayingUI();
  }

  _populateTrackSelector() {
    const sel = document.getElementById('music-select');
    if (!sel) return;
    sel.innerHTML = '';
    this.playlist.forEach((track, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${i + 1}. [${track.category}] ${track.title}`;
      sel.appendChild(opt);
    });
    sel.value = this.currentTrackIndex;
  }

  playTrack(index) {
    if (!this.playlist || this.playlist.length === 0) return;

    // Hızlı tıklama ve ardışık tetiklemeleri engelleyen 250ms atomik kilit
    const now = Date.now();
    if (this._switchingTrack && (now - this._lastTrackSwitchTime < 250)) {
      return;
    }
    this._switchingTrack = true;
    this._lastTrackSwitchTime = now;

    this.currentTrackIndex = (index + this.playlist.length) % this.playlist.length;
    const track = this.playlist[this.currentTrackIndex];

    clearTimeout(this._errorRetryTimer);

    // Eski çalan parçayı anında ve temiz şekilde durdur
    try {
      this.musicAudio.pause();
    } catch (e) {}

    // Diğer tüm açık sekmelere "ben çalıyorum, siz susun" emri ver
    this._claimMasterPlayback();

    this.musicAudio.src = track.url;
    this.musicAudio.currentTime = 0;
    this.musicAudio.volume = this.muted ? 0 : this.musicVolume;

    // unlockAudio gibi arayüz olaylarının aynı anda startMusic çağırmasını engellemek için durumu hemen true yap
    this.musicPlaying = true;
    this.updateNowPlayingUI();

    const playPromise = this.musicAudio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          this._switchingTrack = false;
          this.musicPlaying = true;
          this.updateNowPlayingUI();
        })
        .catch(err => {
          this._switchingTrack = false;
          // Eğer şarkı kullanıcı veya yeni parça seçimi yüzünden kesildiyse (AbortError), normal karşıla
          if (err.name === 'AbortError') {
            return;
          }
          console.log('[ConvoyAudio] Müzik otomatik başlatma kullanıcı etkileşimi bekliyor:', err.message);
          this.musicPlaying = false;
          this.updateNowPlayingUI();
        });
    } else {
      this._switchingTrack = false;
    }
  }

  startMusic() {
    if (this.musicPlaying) return;
    if (!this.musicAudio.src && this.playlist.length > 0) {
      this.playTrack(this.currentTrackIndex);
    } else {
      this._claimMasterPlayback();
      this.musicAudio.play().then(() => {
        this.musicPlaying = true;
        this.updateNowPlayingUI();
      }).catch(() => {});
    }
  }

  pauseMusic(broadcast = true) {
    clearTimeout(this._errorRetryTimer);
    try {
      this.musicAudio.pause();
    } catch (e) {}
    this.musicPlaying = false;
    this.updateNowPlayingUI();

    if (broadcast) {
      try {
        if (localStorage.getItem('convoy_music_master_tab') === this.tabId) {
          localStorage.removeItem('convoy_music_master_tab');
        }
      } catch (e) {}
    }
  }

  toggleMusic() {
    if (this.musicPlaying) {
      this.pauseMusic(true);
    } else {
      this.startMusic();
    }
    return this.musicPlaying;
  }

  nextTrack() {
    this.playTrack(this.currentTrackIndex + 1);
  }

  prevTrack() {
    this.playTrack(this.currentTrackIndex - 1);
  }

  // Düğün Kutlama / Halay Özel Teması (İkinci bir ses kanalı açmaz, doğrudan tekil motoru halaya yönlendirir)
  startDavulZurnaTheme(durationMs = 15000) {
    if (this.muted) return;
    const halayIndex = this.playlist.findIndex(t => t.id === 'dugun_halay_potpori');
    if (halayIndex !== -1 && this.currentTrackIndex !== halayIndex) {
      this.playTrack(halayIndex);
    }
  }

  setMusicVolume(vol) {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    if (!this.muted) {
      this.musicAudio.volume = this.musicVolume;
    }
  }

  setSfxVolume(vol) {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      this.musicAudio.volume = 0;
    } else {
      this.musicAudio.volume = this.musicVolume;
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }
    this.updateNowPlayingUI();
    return this.muted;
  }

  destroy() {
    this.pauseMusic(false);
    clearTimeout(this._errorRetryTimer);
    if (this.musicAudio) {
      this.musicAudio.onended = null;
      this.musicAudio.onerror = null;
      this.musicAudio.src = '';
      try { this.musicAudio.load(); } catch (e) {}
    }
    if (this.tabChannel) {
      try { this.tabChannel.close(); } catch (e) {}
    }
    if (this.ctx && this.ctx.state !== 'closed') {
      try { this.ctx.close(); } catch (e) {}
    }
  }

  updateNowPlayingUI() {
    const track = (this.playlist && this.playlist[this.currentTrackIndex]) || this.defaultPlaylist[0];

    // HUD Göstergesi
    const hudCat = document.getElementById('hud-music-cat');
    const hudTitle = document.getElementById('hud-music-title');
    const hudEq = document.querySelector('.hud-music-equalizer');
    if (hudCat) hudCat.textContent = track ? track.category : 'Düğün Konvoyu';
    if (hudTitle) hudTitle.textContent = track ? track.title : 'Müzik Yükleniyor...';
    if (hudEq) {
      hudEq.classList.toggle('playing', this.musicPlaying && !this.muted);
    }

    // Panel Göstergesi
    const panCat = document.getElementById('music-track-category');
    const panTitle = document.getElementById('music-track-title');
    const panBtn = document.getElementById('btn-music-toggle');
    const sel = document.getElementById('music-select');

    if (panCat) panCat.textContent = track ? track.category : '';
    if (panTitle) panTitle.textContent = track ? track.title : '';
    if (panBtn) {
      panBtn.innerHTML = this.musicPlaying && !this.muted ? '⏸️ Müzik Durdur' : '▶️ Müzik Başlat';
    }
    if (sel && sel.value !== String(this.currentTrackIndex)) {
      sel.value = this.currentTrackIndex;
    }
  }
}

// Eski arka plan örneği varsa kesin olarak temizle (Bellek sızıntısı ve hayalet ses engeli)
if (window.convoyAudio && typeof window.convoyAudio.destroy === 'function') {
  window.convoyAudio.destroy();
}
window.convoyAudio = new ConvoyAudioEngine();
