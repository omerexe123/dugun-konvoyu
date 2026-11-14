const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { TikTokLiveConnection } = require('tiktok-live-connector');

const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'konvoy.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// -------------------------------------------------------------
// 10 Gerçek Otoyol Canavarı Kademesi (GLB Modelleri ile Birebir)
// -------------------------------------------------------------
const CAR_TIERS = [
  { tier: 1, name: 'VW Golf GTI 2025', scoreMin: 0, color: '#ef4444', file: 'models/volkswagen_golf_gti_2025.glb' },
  { tier: 2, name: 'VW Polo Sedan', scoreMin: 25, color: '#f59e0b', file: 'models/2017_volkswagen_polo_sedan.glb' },
  { tier: 3, name: 'VW Jetta GLI', scoreMin: 60, color: '#06b6d4', file: 'models/volkswagen_jetta_gli_2025.glb' },
  { tier: 4, name: 'VW Virtus 2026', scoreMin: 120, color: '#3b82f6', file: 'models/volkswagen_virtus_2026.glb' },
  { tier: 5, name: 'BMW 335i Twin-Turbo', scoreMin: 250, color: '#6366f1', file: 'models/bmw_335i.glb' },
  { tier: 6, name: 'Honda S2000 Drift King', scoreMin: 500, color: '#ec4899', file: 'models/honda_s2000_ultimate_edition.glb' },
  { tier: 7, name: 'Mercedes-AMG A45S', scoreMin: 900, color: '#84cc16', file: 'models/mercedes_a45s_amg_sedan.glb' },
  { tier: 8, name: 'BMW M5 E39 V8 Canavar', scoreMin: 1600, color: '#111111', file: 'models/bmw_m5_e39.glb' },
  { tier: 9, name: 'BMW X7 M60i Luxury SUV', scoreMin: 3200, color: '#0f172a', file: 'models/bmw_x7_m60i.glb' },
  { tier: 10, name: 'BMW 330i M-Sport Competition', scoreMin: 5500, color: '#2563eb', file: 'models/bmw_g20_330i.glb' }
];

// Özel Motosiklet Kademeleri (5 TL'lik TikTok Hediyesi)
const MOTOR_TIERS = [
  { tier: 1, name: 'Yamaha YZF-R1 Superbike', file: 'models/2022_yamaha_r1.glb' },
  { tier: 2, name: 'Kawasaki Ninja ZX-6R', file: 'models/kawasaki_ninja_zx-6r.glb' },
  { tier: 3, name: 'Bajaj Pulsar 200FS', file: 'models/bajaj_pulsar_200fs_concept.glb' },
  { tier: 4, name: 'Honda CB Twister 300', file: 'models/honda_twister_300.glb' }
];

function calculateCarTier(points) {
  for (let i = CAR_TIERS.length - 1; i >= 0; i--) {
    if (points >= CAR_TIERS[i].scoreMin) {
      return CAR_TIERS[i].tier;
    }
  }
  return 1;
}

const DEFAULT_STATE = {
  convoyName: 'Bizim Düğün Konvoyu',
  brideName: 'Gelin Hanım 👰',
  groomName: 'Damat Bey 🤵',
  brideId: null,
  groomId: null,
  battle: {
    bridePoints: 50,
    groomPoints: 50
  },
  milestone: {
    current: 0,
    target: 100
  },
  users: {},
  stats: {
    totalGifts: 0,
    totalLikes: 0,
    totalHonks: 0,
    totalOvertakes: 0,
    totalDrifts: 0,
    totalBurnouts: 0,
    totalWheelies: 0
  }
};

let gameState = { ...DEFAULT_STATE };

function loadState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      gameState = JSON.parse(raw);
      if (!gameState.battle) gameState.battle = { bridePoints: 50, groomPoints: 50 };
      if (!gameState.milestone) gameState.milestone = { current: 0, target: 100 };
      console.log(`[DB] Düğün konvoyu yüklendi: ${Object.keys(gameState.users || {}).length} araç konvoyda.`);
    } else {
      saveState(true);
    }
  } catch (err) {
    console.error('[DB] Yükleme hatası:', err.message);
    gameState = { ...DEFAULT_STATE };
    saveState(true);
  }
}

function updateBattleAndMilestone(team = 'bride', points = 1, giftCount = 0) {
  if (!gameState.battle) gameState.battle = { bridePoints: 50, groomPoints: 50 };
  if (!gameState.milestone) gameState.milestone = { current: 0, target: 100 };

  if (team === 'bride') {
    gameState.battle.bridePoints += points;
  } else {
    gameState.battle.groomPoints += points;
  }

  let milestoneCompleted = false;
  if (giftCount > 0) {
    gameState.milestone.current += giftCount;
    if (gameState.milestone.current >= gameState.milestone.target) {
      milestoneCompleted = true;
      gameState.milestone.current = 0;
      broadcast('EVENT_MILESTONE_COMPLETED', {
        message: '🎆👑 DÜĞÜN HEDEFİ TAMAMLANDI! OTOYOL HAVAİ FİŞEK VE HALAY ŞOVU!'
      });
    }
  }

  saveState();

  const total = Math.max(1, gameState.battle.bridePoints + gameState.battle.groomPoints);
  const bridePct = Math.round((gameState.battle.bridePoints / total) * 100);
  const groomPct = 100 - bridePct;

  broadcast('EVENT_BATTLE_UPDATE', {
    bridePoints: gameState.battle.bridePoints,
    groomPoints: gameState.battle.groomPoints,
    bridePct,
    groomPct,
    milestoneCurrent: gameState.milestone.current,
    milestoneTarget: gameState.milestone.target,
    milestoneCompleted
  });

  return { bridePct, groomPct, milestoneCompleted };
}

let saveTimeout = null;
function saveState(immediate = false) {
  const doSave = () => {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(gameState, null, 2), 'utf-8');
    } catch (e) {
      console.error('[DB] Kayıt hatası:', e.message);
    }
  };
  if (immediate) {
    if (saveTimeout) clearTimeout(saveTimeout);
    doSave();
  } else {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(doSave, 1500);
  }
}

loadState();

// Gelin/Damat koltuğu SADECE hediyeyle alınır (Perfume -> Gelin, Hat & Mustache -> Damat).
// Motorla çıkış SADECE 1x GG hediyesiyle olur (Beğeni motora geçirmez).

function switchToMotor(user) {
  user.vehicleType = 'motor';
  user.motorTier = 1;
  user.carName = MOTOR_TIERS[0].name;
}

function getOrCreateConvoyUser(uniqueId, nickname = '', avatar = '', vehicleType = 'car') {
  uniqueId = String(uniqueId).trim();
  if (!uniqueId || uniqueId === 'undefined' || uniqueId === 'null') {
    uniqueId = 'izleyici_' + Math.floor(Math.random() * 90000 + 10000);
  }
  if (!nickname || nickname === 'undefined' || nickname === 'null') {
    nickname = 'Konvoycu_' + uniqueId.slice(-4);
  }
  if (!avatar || avatar.includes('undefined')) {
    avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(uniqueId)}`;
  }

  if (!gameState.users[uniqueId]) {
    // Tüm kullanıcılar standart 1. kademe araçla başlar (Beğeni ile araç yükselmez!)
    const newUser = {
      uniqueId,
      nickname,
      avatar,
      points: 0,
      tier: 1,
      vehicleType, // 'car' veya 'motor'
      motorTier: 1,
      carName: vehicleType === 'motor' ? MOTOR_TIERS[0].name : CAR_TIERS[0].name,
      likesSent: 0,
      driftCount: 0,
      shareCount: 0,
      giftsSent: 0,
      joinedAt: Date.now(),
      lastActive: Date.now()
    };
    gameState.users[uniqueId] = newUser;
    saveState();
    return newUser;
  } else {
    if (nickname && nickname !== 'undefined') gameState.users[uniqueId].nickname = nickname;
    if (avatar && !avatar.includes('undefined')) gameState.users[uniqueId].avatar = avatar;
    gameState.users[uniqueId].lastActive = Date.now();
    return gameState.users[uniqueId];
  }
}

const compression = require('compression');

// -------------------------------------------------------------
// Express & WebSocket
// -------------------------------------------------------------
const app = express();
app.use(compression({
  threshold: 1024,
  level: 6,
  filter: (req, res) => {
    if (/\.(glb|png|jpe?g|mp3|webp)(\?|$)/i.test(req.url)) return false;
    return compression.filter(req, res);
  }
}));
app.use(express.json());

// Statik Dosyalar: 3D Modeller & Sesler uzun önbellek, Kodlar (JS/CSS/HTML) her zaman güncel
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.glb') || filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.mp3')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload, timestamp: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// -------------------------------------------------------------
// TikTok Kullanıcı Metadata Ayrıştırma Motoru (Kernel Seviyesi)
// TikTok Protobuf v1/v2/v3 modellerindeki tüm gizli ve iç içe avatar/nick yollarını yakalar
// -------------------------------------------------------------
function extractTikTokUser(data) {
  if (!data) {
    const fallbackId = 'izleyici_' + Math.floor(Math.random() * 90000 + 10000);
    return {
      uniqueId: fallbackId,
      nickname: 'Misafir',
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(fallbackId)}`
    };
  }

  // 1. uniqueId / displayId / userId
  let uId = data.uniqueId ||
            data.displayId ||
            (data.user && (data.user.uniqueId || data.user.displayId || data.user.idStr || data.user.userId)) ||
            data.userId ||
            data.secUid ||
            (data.userDetails && (data.userDetails.uniqueId || data.userDetails.displayId || data.userDetails.userId));

  if (!uId || uId === 'undefined' || uId === 'null') {
    const rawNick = data.nickname || (data.user && data.user.nickname);
    if (rawNick && rawNick !== 'undefined' && rawNick !== 'null') {
      uId = 'user_' + Buffer.from(String(rawNick)).toString('hex').slice(0, 10);
    } else {
      uId = 'izleyici_' + Math.floor(Math.random() * 90000 + 10000);
    }
  }
  uId = String(uId).trim();

  // 2. nickname
  let nick = data.nickname ||
             (data.user && data.user.nickname) ||
             (data.userDetails && (data.userDetails.nickName || data.userDetails.nickname)) ||
             data.uniqueId ||
             data.displayId ||
             uId;
  nick = String(nick).trim();
  if (!nick || nick === 'undefined' || nick === 'null') {
    nick = 'Konvoycu_' + uId.slice(-4);
  }

  // 3. Gerçek Profil Fotoğrafı (Avatar)
  let rawAvatar = data.profilePictureUrl ||
                  (data.userDetails && data.userDetails.profilePictureUrls) ||
                  (data.user && (data.user.profilePictureUrl || data.user.avatarUrl)) ||
                  (Array.isArray(data.user?.avatarThumb?.urlList) && data.user.avatarThumb.urlList[0]) ||
                  (Array.isArray(data.user?.avatarMedium?.urlList) && data.user.avatarMedium.urlList[0]) ||
                  (Array.isArray(data.user?.avatarLarge?.urlList) && data.user.avatarLarge.urlList[0]) ||
                  (Array.isArray(data.userDetails?.profileThumb?.urlList) && data.userDetails.profileThumb.urlList[0]) ||
                  (Array.isArray(data.userDetails?.profilePicture?.urlList) && data.userDetails.profilePicture.urlList[0]) ||
                  (Array.isArray(data.avatarThumb?.urlList) && data.avatarThumb.urlList[0]) ||
                  (Array.isArray(data.avatarLarge?.urlList) && data.avatarLarge.urlList[0]);

  let avatar = '';
  if (rawAvatar && typeof rawAvatar === 'string' && rawAvatar.startsWith('http')) {
    // TikTok CDN Referer bloklamalarını bypass etmek için doğrudan yerel avatar proxy üzerinden ver
    if (rawAvatar.includes('tiktokcdn.com') || rawAvatar.includes('byteoversea.com') || rawAvatar.includes('ibytedtos.com')) {
      avatar = `/api/avatar-proxy?url=${encodeURIComponent(rawAvatar)}&seed=${encodeURIComponent(uId)}`;
    } else {
      avatar = rawAvatar;
    }
  } else {
    avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(uId)}`;
  }

  return { uniqueId: uId, nickname: nick, avatar };
}

// -------------------------------------------------------------
// TikTok Live Bağlantısı & Otomatik Yeniden Bağlanma Motoru
// -------------------------------------------------------------
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
let savedConfig = { targetUsername: null };
try {
  if (fs.existsSync(CONFIG_FILE)) {
    savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  }
} catch (e) {}

let liveClient = null;
let liveStatus = { connected: false, username: null, viewerCount: 0, error: null };
let reconnectTimer = null;

function connectToTikTok(targetUsername) {
  if (!targetUsername) return;
  targetUsername = targetUsername.replace(/^@/, '').trim();

  // Hedef hesabı kalıcı olarak kaydet
  savedConfig.targetUsername = targetUsername;
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(savedConfig, null, 2));
  } catch (e) {}

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (liveClient) {
    try {
      liveClient.removeAllListeners();
      liveClient.disconnect();
    } catch (e) {}
    liveClient = null;
  }

  liveStatus = { connected: false, username: targetUsername, viewerCount: 0, error: 'Bağlanılıyor...' };
  broadcast('TIKTOK_STATUS', liveStatus);

  console.log(`[TIKTOK] @${targetUsername} canlı yayınına bağlanılıyor...`);

  try {
    liveClient = new TikTokLiveConnection(targetUsername, {
      processInitialData: true,
      enableExtendedGiftInfo: false
    });

    liveClient.connect().then(state => {
      liveStatus.connected = true;
      liveStatus.error = null;
      liveStatus.roomId = state.roomId;
      console.log(`[TIKTOK] @${targetUsername} BAĞLANDI! (Oda ID: ${state.roomId})`);
      broadcast('TIKTOK_STATUS', liveStatus);
    }).catch(err => {
      const errMsg = err.message || 'Bağlantı kurulamadı';
      console.error(`[TIKTOK] Bağlantı Hatası:`, errMsg);
      liveStatus.connected = false;
      liveStatus.error = errMsg;
      broadcast('TIKTOK_STATUS', liveStatus);

      // Yayın henüz açılmadıysa vazgeçme, 5 saniyede bir otomatik tekrar dene!
      if (errMsg.includes("isn't online") || errMsg.includes('offline') || errMsg.includes('LIVE_ROOM_NOT_FOUND') || errMsg.includes('Room ID') || errMsg.includes('retrieve')) {
        console.log(`[TIKTOK] @${targetUsername} henüz yayında değil, 5 sn sonra otomatik tekrar denenecek...`);
        reconnectTimer = setTimeout(() => {
          if (!liveStatus.connected && targetUsername === savedConfig.targetUsername) {
            connectToTikTok(targetUsername);
          }
        }, 5000);
      }
    });

    liveClient.on('disconnected', () => {
      console.warn(`[TIKTOK] Bağlantı kesildi, 5 sn sonra yeniden bağlanılıyor...`);
      liveStatus.connected = false;
      liveStatus.error = 'Bağlantı kesildi, yeniden bağlanılıyor...';
      broadcast('TIKTOK_STATUS', liveStatus);
      reconnectTimer = setTimeout(() => {
        if (!liveStatus.connected && targetUsername === savedConfig.targetUsername) {
          connectToTikTok(targetUsername);
        }
      }, 5000);
    });

    liveClient.on('roomUser', data => {
      liveStatus.viewerCount = data.viewerCount || 0;
      broadcast('TIKTOK_VIEWERS', { count: liveStatus.viewerCount });
    });

    liveClient.on('chat', data => {
      const u = extractTikTokUser(data);
      const comment = (data.comment || '').trim().toLowerCase();

      broadcast('TIKTOK_CHAT', { uniqueId: u.uniqueId, nickname: u.nickname, comment: data.comment });

      // "Ben Nerdeyim" Komutu Algılayıcı (Kernel Seviyesi Regex)
      const isLocateRequest = /(nerdeyim|neredeyim|nerde|nerede|nerdeyiz|arabam\s+nerde|arabam\s+nerede|araba\s+nerde|beni\s+göster|beni\s+bul|hangisiyim)/i.test(comment);

      if (isLocateRequest) {
        handleLocateUser(u.uniqueId, u.nickname, u.avatar);
      } else if (comment.includes('katıl') || comment.includes('katil') || comment.includes('join')) {
        const existing = gameState.users[u.uniqueId];
        if (!existing) {
          broadcast('EVENT_USER_NOT_IN_CONVOY', {
            uniqueId: u.uniqueId,
            nickname: u.nickname,
            message: `🚗 @${u.nickname} konvoyda yer almak için ekrana çift tıkla (beğen), takip et veya hediye gönder!`
          });
        }
      } else if (comment.includes('korna') || comment.includes('düt')) {
        handleHonk(u.uniqueId, u.nickname);
      }
    });

    // Kural: "yayını beğendikçe konvoya katılınsın" (Beğeni konvoya katar, ancak öne geçmek için drift gerekir)
    liveClient.on('like', data => {
      const u = extractTikTokUser(data);
      const count = Number(data.likeCount || data.count || 1) || 1;
      console.log(`[TIKTOK LIKE] @${u.uniqueId} (${u.nickname}) +${count} beğeni attı!`);
      handleUserLikes(u.uniqueId, u.nickname, u.avatar, count);
    });

    // Takip eden izleyiciler otomatik konvoya katılır
    liveClient.on('follow', data => {
      const u = extractTikTokUser(data);
      console.log(`[TIKTOK FOLLOW] @${u.uniqueId} (${u.nickname}) takip etti! Konvoya katılıyor!`);
      handleUserFollow(u.uniqueId, u.nickname, u.avatar);
    });

    // Canlı yayını paylaşan izleyici anında en öne fırlar
    liveClient.on('share', data => {
      const u = extractTikTokUser(data);
      console.log(`[TIKTOK SHARE] @${u.uniqueId} (${u.nickname}) yayını paylaştı!`);
      handleUserShare(u.uniqueId, u.nickname, u.avatar);
    });

    // Streak hediyeleri (GG, Gül vb.) kaçırmadan anında işleyen akıllı takip tablosu
    const activeGiftStreaks = {};

    liveClient.on('gift', data => {
      const u = extractTikTokUser(data);
      const giftName = data.giftName || data.describe || data.giftDetails?.giftName || 'Hediye';
      const streakKey = `${u.uniqueId}_${data.giftId}`;
      const currentRepeat = Number(data.repeatCount || 1);

      let deltaCount = 1;
      if (data.giftType === 1) {
        // Streak tipi hediyelerde (1🪙) her tıklamayı anında işle, repeatEnd beklenip düşürülmesin!
        const lastCount = activeGiftStreaks[streakKey] || 0;
        if (currentRepeat > lastCount) {
          deltaCount = currentRepeat - lastCount;
          activeGiftStreaks[streakKey] = currentRepeat;
        } else if (data.repeatEnd) {
          delete activeGiftStreaks[streakKey];
          return;
        } else {
          deltaCount = 1;
        }
        if (data.repeatEnd) {
          delete activeGiftStreaks[streakKey];
        }
      } else {
        deltaCount = Number(data.repeatCount || 1);
      }

      const diamondCount = (data.diamondCount || 1) * deltaCount;
      console.log(`[TIKTOK GIFT] @${u.uniqueId} (${u.nickname}) hediye attı: ${giftName} (id:${data.giftId}) x${deltaCount}`);
      handleGiftEvent(u.uniqueId, u.nickname, u.avatar, giftName, diamondCount, deltaCount, data.giftId);
    });

    // KESİN KURAL: Yayına sadece girenler (spectator) doğrudan konvoya ALINMAZ!
    // Konvoya girmek için şart: Beğeni atmak, takip etmek veya hediye göndermek!
    liveClient.on('member', () => {
      // Spectator katılımında araç spawn edilmez!
    });

  } catch (err) {
    liveStatus.connected = false;
    liveStatus.error = err.message;
    broadcast('TIKTOK_STATUS', liveStatus);
  }
}

// Kayıtlı hesap varsa sunucu başlar başlamaz otomatik bağlan
if (savedConfig.targetUsername) {
  console.log(`[TIKTOK] Son kullanılan hesaba otomatik bağlanılıyor: @${savedConfig.targetUsername}`);
  setTimeout(() => connectToTikTok(savedConfig.targetUsername), 2000);
}

// -------------------------------------------------------------
// Oyun Mantığı & Hediye Eşleşmeleri
// -------------------------------------------------------------
function handleUserJoin(uniqueId, nickname, avatar, vehicleType = 'car') {
  let user = gameState.users[uniqueId];
  let isNew = false;
  if (!user) {
    user = getOrCreateConvoyUser(uniqueId, nickname, avatar, vehicleType);
    isNew = true;
  }
  const sorted = getSortedConvoy();
  const rankIdx = sorted.findIndex(u => u.uniqueId === user.uniqueId);

  broadcast('EVENT_CONVOY_JOIN', {
    user,
    rankIdx: Math.max(0, rankIdx),
    isNew,
    message: isNew ? `🚗❤️ ${user.nickname} yayını beğenerek konvoya katıldı!` : `🚗 ${user.nickname} konvoyda ilerliyor!`
  });
}

// Takip eden izleyiciler için özel katılım fonksiyonu
function handleUserFollow(uniqueId, nickname, avatar) {
  uniqueId = String(uniqueId || '').trim();
  if (!uniqueId || uniqueId === 'undefined') {
    uniqueId = 'izleyici_' + Math.floor(Math.random() * 90000 + 10000);
  }
  if (!nickname || nickname === 'undefined') {
    nickname = 'Konvoycu_' + uniqueId.slice(-4);
  }

  const isNew = !gameState.users[uniqueId];
  const user = getOrCreateConvoyUser(uniqueId, nickname, avatar, 'car');
  user.isFollowing = true;
  user.points = (user.points || 0) + 50;
  user.lastActive = Date.now();
  saveState();

  const sorted = getSortedConvoy();
  const rankIdx = sorted.findIndex(u => u.uniqueId === user.uniqueId);

  broadcast('EVENT_CONVOY_JOIN', {
    user,
    rankIdx: Math.max(0, rankIdx),
    sortedConvoy: sorted,
    isNew,
    message: `❤️🔔 @${user.nickname} YAYINI TAKİP EDEREK KONVOYA KATILDI!`
  });
}

function handleHonk(uniqueId, nickname) {
  let user = gameState.users[uniqueId];
  if (!user) return; // Sadece konvoydaki araçlar korna çalabilir!
  gameState.stats.totalHonks++;
  broadcast('EVENT_HONK', {
    user,
    message: `📣 ${user.nickname} KORNAYA BASTI! DÜT DÜT DÜÜÜÜT!`
  });
}

function handleSelektor(uniqueId, nickname) {
  let user = gameState.users[uniqueId];
  if (!user) return; // Sadece konvoydaki araçlar selektör yakabilir!
  broadcast('EVENT_SELEKTOR', {
    user,
    message: `💡⚡ ${user.nickname} SELEKTÖR ÇAKTI! YOL İSTİYOR!`
  });
}

// Beğeni Gelince Konvoya Katılma (Beğeni arabayı YÜKSELTMEZ, sadece konvoya katar!)
function handleUserLikes(uniqueId, nickname, avatar, count = 1) {
  uniqueId = String(uniqueId || '').trim();
  if (!uniqueId || uniqueId === 'undefined') {
    uniqueId = 'izleyici_' + Math.floor(Math.random() * 90000 + 10000);
  }
  if (!nickname || nickname === 'undefined') {
    nickname = 'Konvoycu_' + uniqueId.slice(-4);
  }

  const isNew = !gameState.users[uniqueId];
  const user = getOrCreateConvoyUser(uniqueId, nickname, avatar);

  const prevLikes = user.likesSent || 0;
  user.likesSent = prevLikes + count;
  user.points = (user.points || 0) + count;
  gameState.stats.totalLikes += count;
  user.lastActive = Date.now();
  saveState();

  const sorted = getSortedConvoy();
  const rankIdx = sorted.findIndex(u => u.uniqueId === user.uniqueId);

  // Anında konvoy katılım & beğeni bildirimini yayınla
  broadcast('EVENT_CONVOY_JOIN', {
    user,
    rankIdx: Math.max(0, rankIdx),
    sortedConvoy: sorted,
    isNew,
    count,
    message: isNew
      ? `🚗❤️ ${user.nickname} yayını beğenerek konvoya katıldı!`
      : `❤️ ${user.nickname} yayını beğendi (+${count} Beğeni)!`
  });

  // Beğeni Gelin vs Damat çekişmesini hareketlendirir
  updateBattleAndMilestone(Math.random() < 0.5 ? 'bride' : 'groom', count, 0);
}

// Canlı Yayını Paylaşma: Paylaşan kişi Zirve Kuralı ile konvoyda EN ÖNE geçer!
function handleUserShare(uniqueId, nickname, avatar) {
  uniqueId = String(uniqueId || '').trim();
  if (!uniqueId || uniqueId === 'undefined') {
    uniqueId = 'izleyici_' + Math.floor(Math.random() * 90000 + 10000);
  }
  if (!nickname || nickname === 'undefined') {
    nickname = 'Konvoycu_' + uniqueId.slice(-4);
  }

  const user = getOrCreateConvoyUser(uniqueId, nickname, avatar);
  user.shareCount = (user.shareCount || 0) + 1;
  user.points = (user.points || 0) + 50;
  user.lastActive = Date.now();
  saveState();

  const sorted = getSortedConvoy();
  const rankIdx = sorted.findIndex(u => u.uniqueId === user.uniqueId);

  broadcast('EVENT_SHARE', {
    user,
    rankIdx: Math.max(0, rankIdx),
    sortedConvoy: sorted,
    durationMs: 14000,
    message: `📢🔥 @${user.nickname} YAYINI PAYLAŞTI! EN ÖNE GEÇİYOR! (Paylaşım: ${user.shareCount}x - Sıra: #${rankIdx + 1})`
  });
}

// Hediyenin büyüklüğüne göre dinamik kamera odaklanma süresi (ms)
function getGiftFocusDuration(diamondCount = 1) {
  const coins = Number(diamondCount) || 1;
  if (coins >= 1000) return 28000; // Galaksi / Evren -> 28 saniye VIP yayın odağı
  if (coins >= 500) return 22000;  // Aslan / Ejderha -> 22 saniye
  if (coins >= 99) return 17000;   // Şapka & Bıyık (Damat) -> 17 saniye
  if (coins >= 20) return 13000;   // Araba Yükseltme / Parfüm (Gelin) -> 13 saniye
  if (coins >= 5) return 9500;     // Parmak Kalp / Orta hediye -> 9.5 saniye
  return 7500;                     // 1 coinlik hediyeler (Gül, GG vb.) -> 7.5 saniye
}

// SADECE HEDİYE İLE ARABA YÜKSELTME FONKSİYONU
function upgradeUserVehicle(user, giftName = '', diamondCount = 1) {
  const prevTier = user.vehicleType === 'motor' ? (user.motorTier || 1) : (user.tier || 1);
  const oldCar = user.carName || (user.vehicleType === 'motor' ? MOTOR_TIERS[0].name : CAR_TIERS[0].name);

  if (user.vehicleType === 'motor') {
    const tierBoost = diamondCount >= 50 ? 2 : 1;
    user.motorTier = Math.min(MOTOR_TIERS.length, prevTier + tierBoost);
    user.carName = MOTOR_TIERS[user.motorTier - 1].name;
  } else {
    // 1 hediye = en az +1 araba kademesi atlar (büyük hediyeler daha hızlı atlatır)
    const tierBoost = (diamondCount >= 100) ? 3 : ((diamondCount >= 20) ? 2 : 1);
    user.tier = Math.min(CAR_TIERS.length, prevTier + tierBoost);
    user.carName = CAR_TIERS[user.tier - 1].name;
  }

  const currentTier = user.vehicleType === 'motor' ? user.motorTier : user.tier;
  const isUpgraded = currentTier > prevTier;
  user.giftsSent = (user.giftsSent || 0) + 1;
  saveState();

  if (isUpgraded) {
    broadcast('EVENT_CAR_UPGRADE', {
      user,
      oldCar,
      newCar: user.carName,
      message: `🏎️💨 ${user.nickname} ${giftName ? giftName.toUpperCase() + ' İLE ' : ''}ARABASINI YÜKSELTTİ! Artık ${user.carName} kullanıyor!`
    });
  }

  return isUpgraded;
}

function handleMotorcycleUpgrade(uniqueId, nickname, avatar) {
  let user = gameState.users[uniqueId];
  if (!user) user = getOrCreateConvoyUser(uniqueId, nickname, avatar, 'motor');

  switchToMotor(user);
  upgradeUserVehicle(user, 'Özel Motor', 20);
  addPointsToConvoyUser(user, 25, 'Özel Motor Çıkışı');

  const sorted = getSortedConvoy();
  const rankIdx = sorted.findIndex(u => u.uniqueId === user.uniqueId);

  broadcast('EVENT_MOTOR_SPAWN', {
    user,
    rankIdx,
    sortedConvoy: sorted,
    message: `🏍️💨 ${user.nickname} ÖZEL 3D MOTOSİKLETİ VE SÜRÜCÜSÜYLE KONVOYA ÇIKTI!`
  });
}

function addPointsToConvoyUser(user, pointsToAdd, reason = '') {
  user.points += pointsToAdd;
  saveState();

  const sorted = getSortedConvoy();
  const newRank = sorted.findIndex(u => u.uniqueId === user.uniqueId);

  broadcast('EVENT_POINTS', {
    uniqueId: user.uniqueId,
    pointsAdded: pointsToAdd,
    newTotal: user.points,
    rankIdx: newRank,
    carName: user.carName,
    reason,
    sortedConvoy: sorted
  });
}

// -------------------------------------------------------------
// Özel Gelin, Damat ve Alt Neon Hediyeleri (streamtoearn.io Türkiye Hediyeleri Birebir)
// -------------------------------------------------------------
function handleBecomeBride(uniqueId, nickname, avatar, giftLabel = 'Perfume (20🪙)') {
  let user = gameState.users[uniqueId];
  if (!user) user = getOrCreateConvoyUser(uniqueId, nickname, avatar);
  upgradeUserVehicle(user, giftLabel, 20);
  gameState.brideId = uniqueId;
  gameState.brideName = nickname;
  user.points += 60;
  saveState();

  broadcast('EVENT_NEW_BRIDE', {
    user,
    brideName: nickname,
    groomName: gameState.groomName,
    durationMs: 15000,
    giftIcon: 'images/gifts/perfume.webp',
    giftName: giftLabel,
    message: `👰👑 ${nickname} ${giftLabel} GÖNDEREREK YENİ GELİN OLDU! MERCEDES GELİN TAHTINA GEÇTİ!`
  });
}

function handleBecomeGroom(uniqueId, nickname, avatar, giftLabel = 'Hat and Mustache (99🪙)') {
  let user = gameState.users[uniqueId];
  if (!user) user = getOrCreateConvoyUser(uniqueId, nickname, avatar);
  upgradeUserVehicle(user, giftLabel, 99);
  gameState.groomId = uniqueId;
  gameState.groomName = nickname;
  user.points += 60;
  saveState();

  broadcast('EVENT_NEW_GROOM', {
    user,
    brideName: gameState.brideName,
    groomName: nickname,
    durationMs: 18000,
    giftIcon: 'images/gifts/hat_mustache.webp',
    giftName: giftLabel,
    message: `🤵👑 ${nickname} ${giftLabel} GÖNDEREREK YENİ DAMAT OLDU! MERCEDES DAMAT TAHTINA GEÇTİ!`
  });
}

function handleTikTokGift(uniqueId, nickname, avatar) {
  let user = gameState.users[uniqueId];
  if (!user) user = getOrCreateConvoyUser(uniqueId, nickname, avatar);
  addPointsToConvoyUser(user, 20, 'TikTok Hediyesi');
  saveState();

  broadcast('EVENT_GIFT_GENERIC', {
    uniqueId,
    user,
    giftIcon: 'images/gifts/tiktok.webp',
    message: `🎵✨ ${nickname} TIKTOK HEDİYESİ (1🪙) İLE KONVOYDA İLERLİYOR!`
  });
}

// "Ben Nerdeyim" Komutu: Kullanıcının konvoydaki yerini bulup kamerayı üzerine kilitler
function handleLocateUser(uniqueId, nickname = '', avatar = '') {
  let user = gameState.users[uniqueId];
  if (!user) {
    broadcast('EVENT_USER_NOT_IN_CONVOY', {
      uniqueId,
      nickname: nickname || 'Misafir',
      message: `🚗 @${nickname || 'Misafir'} henüz konvoyda değilsin! Katılmak için yayını beğen, takip et veya hediye gönder!`
    });
    return;
  }

  user.lastActive = Date.now();
  const sorted = getSortedConvoy();
  const rankIdx = sorted.findIndex(u => u.uniqueId === user.uniqueId);

  broadcast('EVENT_LOCATE_USER', {
    user,
    rankIdx: Math.max(0, rankIdx),
    sortedConvoy: sorted,
    message: `🎯 @${user.nickname} İŞTE BURADASIN! (Konvoy Sırası: #${rankIdx + 1})`
  });
}

// Hediye Ayrıştırma Motoru - StreamToEarn.io Türkiye Kataloğu ile Birebir Eşleşme
function handleGiftEvent(uniqueId, nickname, avatar, giftName, diamondCount, repeatCount, giftId = null) {
  let user = gameState.users[uniqueId];
  if (!user) user = getOrCreateConvoyUser(uniqueId, nickname, avatar);

  gameState.stats.totalGifts += repeatCount;
  const gName = (giftName || '').toLowerCase().trim();
  const sGiftId = String(giftId || '');

  // Gelin vs Damat Savaş Puanı & Toplu Düğün Hedefi
  const isBrideSide = gName.includes('perfume') || gName.includes('parfüm') || gName.includes('swan') || gName.includes('kuğu') || gName.includes('rose') || gName.includes('gül') || gName.includes('kalp');
  updateBattleAndMilestone(isBrideSide ? 'bride' : 'groom', (diamondCount || 1) * 3 * repeatCount, repeatCount);

  const durationMs = getGiftFocusDuration(diamondCount);

  // 1. KURAL: ROSE (GÜL - 1🪙) HEDİYESİ
  // KESİN AYRIŞTIRMA: 1x-19x Gül kesinlikle DRİFT ATIP SOLLATIR (Asla motora yükselmez!).
  // 20x ve üzeri Gül ise ARABA YÜKSELTİR.
  const isRoseGift = gName.includes('rose') || gName.includes('gül') || gName.includes('gul') || sGiftId === '5655';

  if (isRoseGift) {
    if (repeatCount >= 20 || diamondCount >= 20) {
      upgradeUserVehicle(user, `${repeatCount >= 20 ? repeatCount + 'x Gül' : giftName}`, diamondCount || 20);
      addPointsToConvoyUser(user, 60 * Math.max(1, Math.floor((diamondCount || repeatCount) / 20)), 'Araba Yükseltme');
      const sorted = getSortedConvoy();
      const sortedRank = sorted.findIndex(u => u.uniqueId === user.uniqueId);
      broadcast('EVENT_CAR_UPGRADE', {
        user,
        rankIdx: Math.max(0, sortedRank),
        sortedConvoy: sorted,
        durationMs,
        giftIcon: 'images/gifts/rose.webp',
        message: `🚀✨ ${user.nickname} 20x ROSE (${diamondCount || 20}🪙) İLE ARABASINI YÜKSELTTİ! YENİ ARAÇ: ${user.carName}!`
      });
      return;
    } else {
      // 1x Gül -> Kesin ve tavizsiz DRİFT AT VE SOLLA GEÇ!
      gameState.stats.totalDrifts = (gameState.stats.totalDrifts || 0) + 1;
      user.driftCount = (user.driftCount || 0) + repeatCount;
      addPointsToConvoyUser(user, 15 * repeatCount, `${giftName} Drifti`);
      saveState();
      const sorted = getSortedConvoy();
      const newRank = sorted.findIndex(u => u.uniqueId === user.uniqueId);
      broadcast('EVENT_DRIFT', {
        user,
        rankIdx: Math.max(0, newRank),
        sortedConvoy: sorted,
        durationMs,
        giftIcon: 'images/gifts/rose.webp',
        message: `🌹💨 ${user.nickname} GÜL (1🪙) İLE DRİFT ATTI VE SOLLAYIP GEÇTİ! (Konvoy Sırası: #${newRank + 1})`
      });
      return;
    }
  }

  // 2. KURAL: PERFUME (Parfüm) -> GELİN OLMA
  if (gName.includes('perfume') || gName.includes('parfüm') || gName.includes('parfum') || gName.includes('swan') || gName.includes('kuğu')) {
    handleBecomeBride(uniqueId, nickname, avatar, `${giftName} (${diamondCount || 20}🪙)`);
    return;
  }

  // 3. KURAL: HAT AND MUSTACHE (Şapka ve Bıyık) -> DAMAT OLMA
  if (gName.includes('mustache') || gName.includes('bıyık') || gName.includes('hat and') || gName.includes('şapka') || gName.includes('lion') || gName.includes('aslan')) {
    handleBecomeGroom(uniqueId, nickname, avatar, `${giftName} (${diamondCount || 99}🪙)`);
    return;
  }

  // 4. KURAL: TIKTOK (1🪙) -> KONVOY PUANI
  if (gName.includes('tiktok') || gName.includes('sunglasses') || gName.includes('gözlük')) {
    handleTikTokGift(uniqueId, nickname, avatar);
    return;
  }

  // 5. KURAL: GG (1🪙) -> BEĞENİ BEKLEMEDEN DİREKT MOTORLA KONVOYA ÇIKMA (Gül asla buraya giremez!)
  const isGG = !isRoseGift && (
    gName === 'gg' ||
    /\bgg\b/i.test(gName) ||
    gName.includes('good game') ||
    gName.includes('oyun kolu') ||
    gName.includes('gamepad') ||
    gName.includes('motosiklet') ||
    gName.includes('motor') ||
    gName.includes('bike') ||
    /6084|6083|6085|6086|6104|6105|6106|6107|6108/.test(sGiftId)
  );

  if (isGG) {
    switchToMotor(user);
    addPointsToConvoyUser(user, 20 * repeatCount, 'GG Motor Çıkışı');
    saveState();
    const sorted = getSortedConvoy();
    const ggRank = sorted.findIndex(u => u.uniqueId === user.uniqueId);
    broadcast('EVENT_MOTOR_SPAWN', {
      user,
      rankIdx: Math.max(0, ggRank),
      sortedConvoy: sorted,
      durationMs,
      giftIcon: 'images/gifts/gg.webp',
      message: `🏍️💨 ${user.nickname} GG (1🪙) İLE ÖZEL MOTORUYLA KONVOYA FIRLADI!`
    });
    return;
  }

  // 6. KURAL: CAKE SLICE (Pasta Dilimi - 1🪙) -> LASTİK YAKMA & BURNOUT
  if (gName.includes('cake') || gName.includes('pasta') || gName.includes('slice') || gName.includes('fire') || gName.includes('ateş') || gName.includes('çörek') || gName.includes('corek') || gName.includes('burnout') || gName.includes('lastik')) {
    gameState.stats.totalBurnouts = (gameState.stats.totalBurnouts || 0) + 1;
    addPointsToConvoyUser(user, 25 * repeatCount, 'Pasta Dilimi Burnout');
    saveState();
    const sorted = getSortedConvoy();
    broadcast('EVENT_BURNOUT', {
      user,
      sortedConvoy: sorted,
      durationMs,
      giftIcon: 'images/gifts/cake_slice.webp',
      message: `💨🔥 ${user.nickname} CAKE SLICE (1🪙) İLE LASTİK YAKIYOR! ASFALTI AĞLATIYOR!`
    });
    return;
  }

  // 7. KURAL: ICE CREAM CONE (Dondurma - 1🪙) -> MOTORSA TEK TEKER, ARABAYSA DRİFT!
  if (gName.includes('ice cream') || gName.includes('dondurma') || gName.includes('cone') || gName.includes('külah')) {
    if (user.vehicleType === 'motor') {
      gameState.stats.totalWheelies = (gameState.stats.totalWheelies || 0) + 1;
      addPointsToConvoyUser(user, 25 * repeatCount, 'Dondurma Tek Teker');
      saveState();
      broadcast('EVENT_WHEELIE', {
        user,
        durationMs,
        giftIcon: 'images/gifts/ice_cream.webp',
        message: `🏍️⚡ ${user.nickname} ICE CREAM CONE (1🪙) İLE MOTOSİKLETİNİ TEK TEKERE KALDIRDI!`
      });
    } else {
      // Araç motor değilse araba ile drift atsın ve sollasın:
      gameState.stats.totalDrifts = (gameState.stats.totalDrifts || 0) + 1;
      user.driftCount = (user.driftCount || 0) + repeatCount;
      addPointsToConvoyUser(user, 25 * repeatCount, 'Dondurma Yanlama Drifti');
      saveState();
      const sorted = getSortedConvoy();
      const newRank = sorted.findIndex(u => u.uniqueId === user.uniqueId);
      broadcast('EVENT_DRIFT', {
        user,
        rankIdx: Math.max(0, newRank),
        sortedConvoy: sorted,
        durationMs,
        giftIcon: 'images/gifts/ice_cream.webp',
        message: `🌹💨 ${user.nickname} DONDURMA (1🪙) İLE YANLADI VE SOLLADI! (Sıra: #${newRank + 1})`
      });
    }
    return;
  }

  // 8. KURAL: DİĞER TÜM 1 COINLİK HEDİYELER -> DRİFT AT VE SOLLA GEÇ!
  gameState.stats.totalDrifts = (gameState.stats.totalDrifts || 0) + 1;
  user.driftCount = (user.driftCount || 0) + repeatCount;
  addPointsToConvoyUser(user, 15 * repeatCount, `${giftName} Drifti`);
  saveState();
  const sorted = getSortedConvoy();
  const newRank = sorted.findIndex(u => u.uniqueId === user.uniqueId);
  broadcast('EVENT_DRIFT', {
    user,
    rankIdx: Math.max(0, newRank),
    sortedConvoy: sorted,
    durationMs,
    giftIcon: 'images/gifts/rose.webp',
    message: `🌹💨 ${user.nickname} ${giftName.toUpperCase()} İLE DRİFT ATTI VE SOLLAYIP GEÇTİ! (Konvoy Sırası: #${newRank + 1})`
  });
}

function getSortedConvoy() {
  return Object.values(gameState.users).sort((a, b) => {
    // 1. KURAL: Canlı yayını en çok paylaşan kişi EN ÖNE GEÇER (shareCount - Zirve Kuralı)
    const shareB = b.shareCount || 0;
    const shareA = a.shareCount || 0;
    if (shareB !== shareA) return shareB - shareA;

    // 2. KURAL: En çok drift atan sollar ve öne geçer (driftCount - Solla Geç Kuralı)
    const driftB = b.driftCount || 0;
    const driftA = a.driftCount || 0;
    if (driftB !== driftA) return driftB - driftA;

    // 3. Eşitlikte genel puan (hediyeler vb.)
    const ptsB = b.points || 0;
    const ptsA = a.points || 0;
    if (ptsB !== ptsA) return ptsB - ptsA;

    // 4. Eşitlikte beğeni sayısı (Beğenerek katılanlar arasında adil sıra)
    const likesB = b.likesSent || 0;
    const likesA = a.likesSent || 0;
    if (likesB !== likesA) return likesB - likesA;

    // 5. Eşitlikte katılım zamanı ve ID ile kararlı sıralama
    return (a.joinedAt || 0) - (b.joinedAt || 0) || String(a.uniqueId).localeCompare(String(b.uniqueId));
  });
}

// -------------------------------------------------------------
// REST API
// -------------------------------------------------------------
app.get('/api/status', (req, res) => {
  res.json({ liveStatus, stats: gameState.stats, convoyCount: Object.keys(gameState.users).length });
});

// TikTok Avatar Proxy (Referer & Hotlink Bloklamalarını Bypass Eder, Önbelleğe Alır)
app.get('/api/avatar-proxy', async (req, res) => {
  const targetUrl = req.query.url;
  const seed = req.query.seed || 'avatar';
  if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.startsWith('http')) {
    return res.redirect(`https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`);
  }

  try {
    const fetchRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });

    if (!fetchRes.ok) {
      return res.redirect(`https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`);
    }

    const contentType = fetchRes.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    const buffer = await fetchRes.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.redirect(`https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`);
  }
});

app.post('/api/connect', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Kullanıcı adı gerekli!' });
  connectToTikTok(username);
  res.json({ success: true, message: `@${username} konvoyuna bağlanılıyor...` });
});

app.post('/api/disconnect', (req, res) => {
  if (liveClient) {
    try {
      liveClient.removeAllListeners();
      liveClient.disconnect();
    } catch (e) {}
    liveClient = null;
  }
  liveStatus = { connected: false, username: null, viewerCount: 0, error: null };
  broadcast('TIKTOK_STATUS', liveStatus);
  res.json({ success: true });
});

app.post('/api/reset', (req, res) => {
  gameState = {
    ...DEFAULT_STATE,
    brideName: 'Gelin Hanım 👰',
    groomName: 'Damat Bey 🤵',
    brideId: null,
    groomId: null,
    users: {}
  };
  saveState(true);
  broadcast('CONVOY_RESET', {
    brideName: gameState.brideName,
    groomName: gameState.groomName
  });
  res.json({ success: true, message: 'Konvoy sıfırlandı, sadece gelin damat arabası bırakıldı.' });
});

const recentClientErrors = [];
app.post('/api/client-error', (req, res) => {
  const errData = { ...req.body, time: new Date().toISOString() };
  recentClientErrors.unshift(errData);
  if (recentClientErrors.length > 50) recentClientErrors.pop();
  console.error('[CLIENT ERROR LOG]', JSON.stringify(errData));
  res.json({ ok: true });
});

app.get('/api/errors', (req, res) => {
  res.json({ errors: recentClientErrors });
});

app.post('/api/simulate', (req, res) => {
  const { type, uniqueId, nickname, avatar: reqAvatar, profilePictureUrl, giftName, diamondCount, count } = req.body;
  const uId = uniqueId || 'konvoycu_1';
  const nick = nickname || 'Düğüncü_Ahmet';
  let avatar = reqAvatar || profilePictureUrl;
  if (!avatar) {
    avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(uId)}`;
  } else if (avatar.includes('tiktokcdn.com') || avatar.includes('byteoversea.com')) {
    avatar = `/api/avatar-proxy?url=${encodeURIComponent(avatar)}&seed=${encodeURIComponent(uId)}`;
  }

  switch (type) {
    case 'join': handleUserJoin(uId, nick, avatar); break;
    case 'follow': handleUserFollow(uId, nick, avatar); break;
    case 'honk': handleHonk(uId, nick); break;
    case 'selektor':
    case 'highbeam':
      handleSelektor(uId, nick);
      break;
    case 'drift':
    case 'rose':
      handleGiftEvent(uId, nick, avatar, 'Gül', 1, 1);
      break;
    case 'upgrade':
      handleGiftEvent(uId, nick, avatar, '20x Rose (Araba Yükselt)', 20, 20);
      break;
    case 'motor':
      handleMotorcycleUpgrade(uId, nick, avatar);
      break;
    case 'wheelie':
      handleGiftEvent(uId, nick, avatar, 'Ice Cream Cone', 1, 1);
      break;
    case 'burnout':
      handleGiftEvent(uId, nick, avatar, 'Cake Slice (Burnout)', 1, 1);
      break;
    case 'overtake':
      handleGiftEvent(uId, nick, avatar, 'Finger Heart', 5, 1);
      break;
    case 'like':
      handleUserLikes(uId, nick, avatar, 30);
      break;
    case 'share':
      handleUserShare(uId, nick, avatar);
      break;
    case 'galaxy':
      handleGiftEvent(uId, nick, avatar, 'Galaksi', 1000, 1);
      break;
    case 'bride':
      handleBecomeBride(uId, nick, avatar);
      break;
    case 'groom':
      handleBecomeGroom(uId, nick, avatar);
      break;
    case 'neon':
      handleTikTokGift(uId, nick, avatar);
      break;
    case 'locate':
    case 'findme':
      handleLocateUser(uId, nick, avatar);
      break;
    default:
      return res.status(400).json({ error: 'Bilinmeyen simülasyon tipi' });
  }

  res.json({ success: true, message: `Simüle edildi: ${type}` });
});

// -------------------------------------------------------------
// WebSocket & Çoklu İstemci Ses Koordinasyonu (OBS vs Tarayıcı)
// -------------------------------------------------------------
let activeAudioClientId = null;
let activeAudioTime = 0;
let activeAudioWs = null;

wss.on('connection', ws => {
  // 6 saniyeden eski ölü liderliği temizle
  if (activeAudioClientId && (Date.now() - activeAudioTime > 6000)) {
    activeAudioClientId = null;
    activeAudioWs = null;
  }

  const sortedConvoy = getSortedConvoy();
  ws.send(JSON.stringify({
    type: 'INIT_CONVOY_STATE',
    payload: {
      gameState,
      liveStatus,
      sortedConvoy,
      carTiers: CAR_TIERS,
      motorTiers: MOTOR_TIERS,
      activeAudioClientId
    }
  }));

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'CLAIM_AUDIO_LEADER' || msg.type === 'AUDIO_HEARTBEAT') {
        activeAudioClientId = msg.clientId;
        activeAudioTime = Date.now();
        activeAudioWs = ws;
        ws.audioClientId = msg.clientId;

        if (msg.type === 'CLAIM_AUDIO_LEADER') {
          // Diğer tüm istemcilere (OBS veya diğer sekmelere) anında susturma emri ver
          wss.clients.forEach(client => {
            if (client !== ws && client.readyState === 1) {
              client.send(JSON.stringify({
                type: 'MUTEX_STOP_AUDIO',
                payload: { activeClientId: msg.clientId }
              }));
            }
          });
        }
      } else if (msg.type === 'RELEASE_AUDIO_LEADER') {
        if (activeAudioClientId === msg.clientId) {
          activeAudioClientId = null;
          activeAudioWs = null;
        }
      } else if (msg.type === 'CONNECT_TIKTOK') {
        connectToTikTok(msg.username);
      } else if (msg.type === 'DISCONNECT_TIKTOK') {
        if (liveClient) {
          try { liveClient.disconnect(); } catch (e) {}
          liveClient = null;
        }
        liveStatus = { connected: false, username: null, viewerCount: 0, error: null };
        broadcast('TIKTOK_STATUS', liveStatus);
      }
    } catch (e) {
      console.warn('[WS message error]', e.message);
    }
  });

  ws.on('close', () => {
    if (ws.audioClientId && ws.audioClientId === activeAudioClientId) {
      activeAudioClientId = null;
      activeAudioWs = null;
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  let localIp = 'localhost';
  if (nets['en0']) {
    const v4 = nets['en0'].find(n => n.family === 'IPv4' && !n.internal);
    if (v4) localIp = v4.address;
  }
  if (localIp === 'localhost') {
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          localIp = net.address;
          break;
        }
      }
    }
  }

  console.log(`====================================================`);
  console.log(`🚗💨 DÜĞÜN KONVOYU TIKTOK CANLI YAYIN OYUNU ÇALIŞIYOR!`);
  console.log(`👉 Bilgisayar: http://localhost:${PORT}`);
  console.log(`👉 Telefondan Giriş (Aynı Wi-Fi): http://${localIp}:${PORT}`);
  console.log(`👉 Telefondan Temiz Yayın: http://${localIp}:${PORT}?obs=1`);
  console.log(`====================================================`);
});
