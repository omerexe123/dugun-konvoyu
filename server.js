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
  { tier: 10, name: 'Mercedes EQS 580 Maybach', scoreMin: 5500, color: '#7c3aed', file: 'models/2024_mercedes_benz_eqs_580.glb' }
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
// Puan sıralamasıyla otomatik atama YOK.

// Beğeniyle motora geçiş eşiği (toplam beğeni sayısı)
const MOTOR_LIKE_THRESHOLD = 100;

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
    // Arabalar ve motorlar rastgele çeşitlilikte olsun
    const assignedCarTier = Math.floor(Math.random() * CAR_TIERS.length) + 1;
    const assignedMotorTier = Math.floor(Math.random() * MOTOR_TIERS.length) + 1;
    const newUser = {
      uniqueId,
      nickname,
      avatar,
      points: 1,
      tier: assignedCarTier,
      vehicleType, // 'car' veya 'motor'
      motorTier: assignedMotorTier,
      carName: vehicleType === 'motor' ? MOTOR_TIERS[assignedMotorTier - 1].name : CAR_TIERS[assignedCarTier - 1].name,
      likesSent: 0,
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
  level: 6
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

      if (comment.includes('katıl') || comment.includes('katil') || comment.includes('join')) {
        handleUserJoin(u.uniqueId, u.nickname, u.avatar);
      } else if (comment.includes('korna') || comment.includes('düt')) {
        handleHonk(u.uniqueId, u.nickname);
      }
    });

    // Kural: "yayını beğendikçe konvoya katılınsın ve öne geçilsin"
    liveClient.on('like', data => {
      const u = extractTikTokUser(data);
      const count = Number(data.likeCount || data.count || 1) || 1;
      console.log(`[TIKTOK LIKE] @${u.uniqueId} (${u.nickname}) +${count} beğeni attı!`);
      handleUserLikes(u.uniqueId, u.nickname, u.avatar, count);
    });

    liveClient.on('gift', data => {
      if (data.giftType === 1 && !data.repeatEnd) return;
      const repeatCount = data.repeatCount || 1;
      const diamondCount = (data.diamondCount || 1) * repeatCount;
      const giftName = data.giftName || 'Hediye';
      const u = extractTikTokUser(data);

      console.log(`[TIKTOK GIFT] @${u.uniqueId} (${u.nickname}) hediye attı: ${giftName} x${repeatCount}`);
      handleGiftEvent(u.uniqueId, u.nickname, u.avatar, giftName, diamondCount, repeatCount);
    });

    // Yeni izleyici odaya katıldığında da konvoy ve avatar listesini güncelle
    liveClient.on('member', data => {
      const u = extractTikTokUser(data);
      handleUserJoin(u.uniqueId, u.nickname, u.avatar);
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

function handleHonk(uniqueId, nickname) {
  let user = gameState.users[uniqueId];
  if (!user) user = getOrCreateConvoyUser(uniqueId, nickname);
  gameState.stats.totalHonks++;
  broadcast('EVENT_HONK', {
    user,
    message: `📣 ${user.nickname} KORNAYA BASTI! DÜT DÜT DÜÜÜÜT!`
  });
}

function handleSelektor(uniqueId, nickname) {
  let user = gameState.users[uniqueId];
  if (!user) user = getOrCreateConvoyUser(uniqueId, nickname);
  broadcast('EVENT_SELEKTOR', {
    user,
    message: `💡⚡ ${user.nickname} SELEKTÖR ÇAKTI! YOL İSTİYOR!`
  });
}

// Beğeni Gelince Otomatik Konvoya Katılma & Puan (1 Beğeni = 1 Puan, Konvoyda Öne Geçiş)
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
  gameState.stats.totalLikes += count;

  // Beğeni eşiği aşıldıysa araçtan motora terfi (sadece bir kez, eşik geçişinde)
  const unlockedMotor = user.vehicleType !== 'motor' &&
    prevLikes < MOTOR_LIKE_THRESHOLD && user.likesSent >= MOTOR_LIKE_THRESHOLD;
  if (unlockedMotor) switchToMotor(user);

  const sorted = getSortedConvoy();
  const rankIdx = sorted.findIndex(u => u.uniqueId === user.uniqueId);

  // Anında konvoy katılım & beğeni bildirimini yayınla
  broadcast('EVENT_CONVOY_JOIN', {
    user,
    rankIdx: Math.max(0, rankIdx),
    isNew,
    count,
    message: isNew
      ? `🚗❤️ ${user.nickname} yayını beğenerek konvoya katıldı!`
      : `❤️ ${user.nickname} yayını beğendi (+${count} Beğeni)!`
  });

  // Her beğeni anında puan kazandırır ve konvoyda öne taşır!
  addPointsToConvoyUser(user, count, `${count} Beğeni`);

  if (unlockedMotor) {
    const newRank = getSortedConvoy().findIndex(u => u.uniqueId === user.uniqueId);
    broadcast('EVENT_MOTOR_SPAWN', {
      user,
      rankIdx: Math.max(0, newRank),
      message: `🏍️❤️ ${user.nickname} ${MOTOR_LIKE_THRESHOLD} BEĞENİYE ULAŞTI, MOTORA TERFİ ETTİ!`
    });
  }
}

function handleMotorcycleUpgrade(uniqueId, nickname, avatar) {
  let user = gameState.users[uniqueId];
  if (!user) user = getOrCreateConvoyUser(uniqueId, nickname, avatar, 'motor');

  switchToMotor(user);
  user.points += 25;
  saveState();

  const sorted = getSortedConvoy();
  const rankIdx = sorted.findIndex(u => u.uniqueId === user.uniqueId);

  broadcast('EVENT_MOTOR_SPAWN', {
    user,
    rankIdx,
    message: `🏍️💨 ${user.nickname} ÖZEL 3D MOTOSİKLETİ VE SÜRÜCÜSÜYLE KONVOYA ÇIKTI!`
  });
}

function addPointsToConvoyUser(user, pointsToAdd, reason = '') {
  const prevTier = user.tier;
  user.points += pointsToAdd;

  if (user.vehicleType === 'motor') {
    if (user.points >= 2500) user.motorTier = 4;
    else if (user.points >= 1000) user.motorTier = 3;
    else if (user.points >= 350) user.motorTier = 2;
    else user.motorTier = 1;
    user.carName = MOTOR_TIERS[user.motorTier - 1].name;
  } else {
    user.tier = calculateCarTier(user.points);
    user.carName = CAR_TIERS[user.tier - 1].name;
  }

  saveState();

  const sorted = getSortedConvoy();
  const newRank = sorted.findIndex(u => u.uniqueId === user.uniqueId);
  const tierUp = user.vehicleType === 'car' ? (user.tier > prevTier) : false;

  broadcast('EVENT_POINTS', {
    uniqueId: user.uniqueId,
    pointsAdded: pointsToAdd,
    newTotal: user.points,
    rankIdx: newRank,
    carName: user.carName,
    tierUp,
    reason,
    sortedConvoy: sorted
  });

  if (tierUp) {
    broadcast('EVENT_CAR_UPGRADE', {
      user,
      oldCar: CAR_TIERS[prevTier - 1].name,
      newCar: user.carName,
      message: `🏎️💨 ${user.nickname} ARABASINI YÜKSELTTİ! Artık ${user.carName} kullanıyor!`
    });
  }
}

// -------------------------------------------------------------
// Özel Gelin, Damat ve Alt Neon Hediyeleri (streamtoearn.io Türkiye Hediyeleri Birebir)
// -------------------------------------------------------------
function handleBecomeBride(uniqueId, nickname, avatar, giftLabel = 'Perfume (20🪙)') {
  let user = gameState.users[uniqueId];
  if (!user) user = getOrCreateConvoyUser(uniqueId, nickname, avatar);
  gameState.brideId = uniqueId;
  gameState.brideName = nickname;
  user.points += 60;
  saveState();

  broadcast('EVENT_NEW_BRIDE', {
    user,
    brideName: nickname,
    groomName: gameState.groomName,
    giftIcon: 'images/gifts/perfume.webp',
    giftName: giftLabel,
    message: `👰👑 ${nickname} ${giftLabel} GÖNDEREREK YENİ GELİN OLDU! MERCEDES GELİN TAHTINA GEÇTİ!`
  });
}

function handleBecomeGroom(uniqueId, nickname, avatar, giftLabel = 'Hat and Mustache (99🪙)') {
  let user = gameState.users[uniqueId];
  if (!user) user = getOrCreateConvoyUser(uniqueId, nickname, avatar);
  gameState.groomId = uniqueId;
  gameState.groomName = nickname;
  user.points += 60;
  saveState();

  broadcast('EVENT_NEW_GROOM', {
    user,
    brideName: gameState.brideName,
    groomName: nickname,
    giftIcon: 'images/gifts/hat_mustache.webp',
    giftName: giftLabel,
    message: `🤵👑 ${nickname} ${giftLabel} GÖNDEREREK YENİ DAMAT OLDU! MERCEDES DAMAT TAHTINA GEÇTİ!`
  });
}

function handleEquipNeon(uniqueId, nickname, avatar, color = null) {
  let user = gameState.users[uniqueId];
  if (!user) user = getOrCreateConvoyUser(uniqueId, nickname, avatar);
  const neonPalette = ['#00f0ff', '#ff007f', '#39ff14', '#8b5cf6', '#ffd700'];
  const chosenColor = color || neonPalette[Math.floor(Math.random() * neonPalette.length)];
  user.neonColor = chosenColor;
  user.points += 20;
  saveState();

  broadcast('EVENT_NEON_EQUIP', {
    uniqueId,
    neonColor: chosenColor,
    user,
    giftIcon: 'images/gifts/tiktok.webp',
    message: `🌈✨ ${nickname} TIKTOK HEDİYESİYLE ŞASİ ALTI ÖZEL NEON TAKTI!`
  });
}

// Hediye Ayrıştırma Motoru - StreamToEarn.io Türkiye Kataloğu ile Birebir Eşleşme
function handleGiftEvent(uniqueId, nickname, avatar, giftName, diamondCount, repeatCount) {
  let user = gameState.users[uniqueId];
  if (!user) user = getOrCreateConvoyUser(uniqueId, nickname, avatar);

  gameState.stats.totalGifts += repeatCount;
  const gName = (giftName || '').toLowerCase();

  // 1. KURAL: PERFUME (Parfüm) -> GELİN OLMA
  if (gName.includes('perfume') || gName.includes('parfüm') || gName.includes('parfum') || gName.includes('swan') || gName.includes('kuğu')) {
    handleBecomeBride(uniqueId, nickname, avatar, `${giftName} (${diamondCount || 20}🪙)`);
    return;
  }

  // 2. KURAL: HAT AND MUSTACHE (Şapka ve Bıyık) -> DAMAT OLMA
  if (gName.includes('mustache') || gName.includes('bıyık') || gName.includes('hat and') || gName.includes('şapka') || gName.includes('lion') || gName.includes('aslan')) {
    handleBecomeGroom(uniqueId, nickname, avatar, `${giftName} (${diamondCount || 99}🪙)`);
    return;
  }

  // 3. KURAL: TIKTOK (1🪙) -> ŞASİ ALTI NEON IŞIK TAKMA
  if (gName.includes('tiktok') || gName.includes('sunglasses') || gName.includes('gözlük') || gName.includes('neon')) {
    handleEquipNeon(uniqueId, nickname, avatar);
    return;
  }

  // 4. KURAL: GG (1🪙) -> BEĞENİ BEKLEMEDEN DİREKT MOTORLA KONVOYA ÇIKMA
  if (gName.includes('gg') || gName.includes('motor')) {
    switchToMotor(user);
    addPointsToConvoyUser(user, 20 * repeatCount, 'GG Motor Çıkışı');
    const ggRank = getSortedConvoy().findIndex(u => u.uniqueId === user.uniqueId);
    broadcast('EVENT_MOTOR_SPAWN', {
      user,
      rankIdx: Math.max(0, ggRank),
      giftIcon: 'images/gifts/gg.webp',
      message: `🏍️💨 ${user.nickname} GG (1🪙) İLE ÖZEL MOTORUYLA KONVOYA FIRLADI!`
    });
    return;
  }

  // 5. KURAL: CAKE SLICE (Pasta Dilimi - 1🪙) -> LASTİK YAKMA & BURNOUT
  if (gName.includes('cake') || gName.includes('pasta') || gName.includes('slice') || gName.includes('fire') || gName.includes('ateş')) {
    gameState.stats.totalBurnouts = (gameState.stats.totalBurnouts || 0) + 1;
    addPointsToConvoyUser(user, 25 * repeatCount, 'Pasta Dilimi Burnout');
    broadcast('EVENT_BURNOUT', {
      user,
      giftIcon: 'images/gifts/cake_slice.webp',
      message: `💨🔥 ${user.nickname} CAKE SLICE (1🪙) İLE LASTİK YAKIYOR! ASFALTI AĞLATIYOR!`
    });
    return;
  }

  // 6. KURAL: ICE CREAM CONE (Dondurma - 1🪙) -> MOTOR ÖN KALDIRMA (TEK TEKER / WHEELIE)
  if (gName.includes('ice cream') || gName.includes('dondurma') || gName.includes('cone') || gName.includes('külah')) {
    // Kullanıcı henüz motor değilse motora geçir ve tek teker yaptır
    if (user.vehicleType !== 'motor') {
      user.vehicleType = 'motor';
      user.motorTier = 1;
      user.carName = MOTOR_TIERS[0].name;
    }
    gameState.stats.totalWheelies = (gameState.stats.totalWheelies || 0) + 1;
    addPointsToConvoyUser(user, 25 * repeatCount, 'Dondurma Tek Teker');
    broadcast('EVENT_WHEELIE', {
      user,
      giftIcon: 'images/gifts/ice_cream.webp',
      message: `🏍️⚡ ${user.nickname} ICE CREAM CONE (1🪙) İLE MOTOSİKLETİNİ TEK TEKERE KALDIRDI!`
    });
    return;
  }

  // 7. KURAL: ROSE (GÜL - 1🪙) VE DİĞER TÜM 1 COINLİK HEDİYELER -> UZUN VE EFSANE DRİFT!
  gameState.stats.totalDrifts = (gameState.stats.totalDrifts || 0) + 1;
  addPointsToConvoyUser(user, 15 * repeatCount, `${giftName} Drifti`);
  broadcast('EVENT_DRIFT', {
    user,
    giftIcon: 'images/gifts/rose.webp',
    message: `🌹💨 ${user.nickname} ROSE (1🪙) İLE YANLIYOR! EFSANE DRİFT!`
  });
}

function getSortedConvoy() {
  return Object.values(gameState.users).sort((a, b) => b.points - a.points);
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
    case 'honk': handleHonk(uId, nick); break;
    case 'selektor':
    case 'highbeam':
      handleSelektor(uId, nick);
      break;
    case 'drift':
    case 'rose':
      handleGiftEvent(uId, nick, avatar, 'Gül', 1, 1);
      break;
    case 'motor':
      handleMotorcycleUpgrade(uId, nick, avatar);
      break;
    case 'wheelie':
      handleGiftEvent(uId, nick, avatar, 'Kalp', 15, 1);
      break;
    case 'burnout':
      handleGiftEvent(uId, nick, avatar, 'Çörek', 30, 1);
      break;
    case 'overtake':
      handleGiftEvent(uId, nick, avatar, 'Finger Heart', 5, 1);
      break;
    case 'like':
      handleUserLikes(uId, nick, avatar, 30);
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
      handleEquipNeon(uId, nick, avatar, '#00f0ff');
      break;
    default:
      return res.status(400).json({ error: 'Bilinmeyen simülasyon tipi' });
  }

  res.json({ success: true, message: `Simüle edildi: ${type}` });
});

// -------------------------------------------------------------
// WebSocket
// -------------------------------------------------------------
wss.on('connection', ws => {
  const sortedConvoy = getSortedConvoy();
  ws.send(JSON.stringify({
    type: 'INIT_CONVOY_STATE',
    payload: {
      gameState,
      liveStatus,
      sortedConvoy,
      carTiers: CAR_TIERS,
      motorTiers: MOTOR_TIERS
    }
  }));

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'CONNECT_TIKTOK') {
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
      console.error('[WS] Mesaj işleme hatası:', e.message);
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
