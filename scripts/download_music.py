#!/usr/bin/env python3
"""
Düğün Konvoyu - Müzik İndirme ve Playlist Senkronizasyon Scripti
YouTube Playlist: https://www.youtube.com/playlist?list=PLbrxG0gKQQ4GyYFt4alsz0pvrnnNL3-z5

Bu script:
1. YouTube playlistindeki tüm geçerli şarkıları yt-dlp ve ffmpeg ile indirir.
2. 128K MP3, Stereo, 44.1kHz standardında kodlar.
3. public/audio/music/playlist.json dosyasını üretir.
4. public/js/audio.js içerisindeki defaultPlaylist tanımını senkronize eder.
"""

import json
import os
import re
import subprocess
import sys
import unicodedata

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(PROJECT_ROOT, 'public', 'audio', 'music')
PLAYLIST_JSON = os.path.join(OUT_DIR, 'playlist.json')
AUDIO_JS = os.path.join(PROJECT_ROOT, 'public', 'js', 'audio.js')
PLAYLIST_URL = "https://www.youtube.com/playlist?list=PLbrxG0gKQQ4GyYFt4alsz0pvrnnNL3-z5"

YT_DLP_BIN = "/opt/homebrew/bin/yt-dlp"
NODE_BIN = "/opt/homebrew/bin/node"
FFPROBE_BIN = "/opt/homebrew/bin/ffprobe"


def slugify(text: str) -> str:
    """Türkçe karakterleri dönüştürür ve temiz bir slug üretir."""
    text = (text.lower()
            .replace('ı', 'i')
            .replace('ğ', 'g')
            .replace('ü', 'u')
            .replace('ş', 's')
            .replace('ö', 'o')
            .replace('ç', 'c'))
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    text = re.sub(r'[^a-z0-9]+', '_', text).strip('_')
    return text


def clean_title(title: str, uploader: str) -> str:
    """Başlık ve sanatçı bilgisini birleştirerek temiz gösterim adı üretir."""
    artist = (uploader or '').replace(' - Topic', '').strip()
    t = title.strip()
    if artist and artist.lower() not in t.lower():
        return f"{artist} - {t}"
    return t


def get_playlist_entries():
    """Playlist meta verilerini çeker."""
    print(f"[*] Playlist metadata çekiliyor: {PLAYLIST_URL}")
    cmd = [
        YT_DLP_BIN,
        "--remote-components", "ejs:github",
        "--js-runtimes", f"node:{NODE_BIN}",
        "--flat-playlist",
        "--dump-single-json",
        PLAYLIST_URL
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
    data = json.loads(res.stdout)
    entries = data.get("entries", [])
    valid_entries = [e for e in entries if e.get("title") and e.get("id")]
    print(f"[+] Toplam {len(entries)} video bulundu, {len(valid_entries)} geçerli video işlenecek.")
    return valid_entries


def verify_audio(file_path: str):
    """FFprobe ile dosyanın geçerli bir MP3 ve ses parametrelerini doğrular."""
    if not os.path.exists(file_path):
        return False, "Dosya bulunamadı"
    size = os.path.getsize(file_path)
    if size < 50000:
        return False, f"Dosya boyutu çok küçük ({size} bytes)"

    cmd = [
        FFPROBE_BIN,
        "-v", "error",
        "-show_entries", "stream=codec_name,sample_rate,channels,bit_rate",
        "-of", "json",
        file_path
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        return False, f"FFprobe hatası: {res.stderr.strip()}"

    try:
        probe = json.loads(res.stdout)
        streams = probe.get("streams", [])
        if not streams:
            return False, "Audio stream bulunamadı"
        s = streams[0]
        codec = s.get("codec_name")
        sr = s.get("sample_rate")
        channels = s.get("channels")
        return True, f"codec={codec}, sr={sr}Hz, ch={channels}, size={size//1024}KB"
    except Exception as ex:
        return False, f"Probe parse hatası: {ex}"


def download_track(video_id: str, track_id: str):
    """Tek bir şarkıyı yt-dlp ile çeker ve mp3'e dönüştürür."""
    out_template = os.path.join(OUT_DIR, f"{track_id}.%(ext)s")
    target_mp3 = os.path.join(OUT_DIR, f"{track_id}.mp3")

    if os.path.exists(target_mp3) and os.path.getsize(target_mp3) > 100000:
        ok, msg = verify_audio(target_mp3)
        if ok:
            print(f"  [ATLANDI] Zaten mevcut: {track_id}.mp3 ({msg})")
            return target_mp3

    cmd = [
        YT_DLP_BIN,
        "--remote-components", "ejs:github",
        "--js-runtimes", f"node:{NODE_BIN}",
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "128K",
        "--postprocessor-args", "ExtractAudio:-ar 44100 -ac 2",
        "--no-playlist",
        "-o", out_template,
        f"https://www.youtube.com/watch?v={video_id}"
    ]

    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print(f"  [HATA] yt-dlp başarısız ({video_id}): {res.stderr[-300:].strip()}")
        return None

    if not os.path.exists(target_mp3):
        print(f"  [HATA] Beklenen dosya oluşmadı: {target_mp3}")
        return None

    ok, msg = verify_audio(target_mp3)
    if not ok:
        print(f"  [HATA] Doğrulama başarısız ({target_mp3}): {msg}")
        return None

    print(f"  [TAMAM] {track_id}.mp3 ({msg})")
    return target_mp3


def update_audio_js(playlist_items):
    """public/js/audio.js içindeki this.defaultPlaylist tanımını günceller."""
    if not os.path.exists(AUDIO_JS):
        print(f"[UYARI] {AUDIO_JS} bulunamadı, audio.js güncellenemedi.")
        return

    with open(AUDIO_JS, 'r', encoding='utf-8') as f:
        content = f.read()

    js_items = []
    for item in playlist_items:
        escaped_title = item['title'].replace("'", "\\'")
        js_items.append(
            f"      {{ id: '{item['id']}', title: '{escaped_title}', category: '{item['category']}', url: '{item['url']}' }}"
        )
    formatted_playlist = "this.defaultPlaylist = [\n" + ",\n".join(js_items) + "\n    ];"

    pattern = r"this\.defaultPlaylist\s*=\s*\[[\s\S]*?\];"
    if not re.search(pattern, content):
        print("[HATA] audio.js içinde this.defaultPlaylist bloğu bulunamadı!")
        return

    new_content = re.sub(pattern, formatted_playlist, content)
    with open(AUDIO_JS, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"[+] {AUDIO_JS} başarıyla güncellendi ({len(playlist_items)} şarkı entegre edildi).")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    entries = get_playlist_entries()

    playlist_items = []
    seen_slugs = set()

    for idx, e in enumerate(entries, 1):
        vid = e["id"]
        raw_title = e.get("title", f"Track {idx}")
        uploader = e.get("uploader", "")
        title = clean_title(raw_title, uploader)

        base_slug = slugify(f"{uploader} {raw_title}") if uploader else slugify(raw_title)
        if not base_slug or base_slug in seen_slugs:
            base_slug = f"{base_slug}_{vid}" if base_slug else f"track_{vid}"
        seen_slugs.add(base_slug)

        track_id = f"yt_{base_slug}"
        print(f"[{idx}/{len(entries)}] İndiriliyor: {title} ({vid}) -> {track_id}.mp3")

        mp3_path = download_track(vid, track_id)
        if mp3_path:
            playlist_items.append({
                "id": track_id,
                "url": f"audio/music/{track_id}.mp3",
                "title": title,
                "category": "Piyasa / Cadde"
            })
        else:
            print(f"[UYARI] {vid} atlandı!")

    # playlist.json yaz
    with open(PLAYLIST_JSON, 'w', encoding='utf-8') as f:
        json.dump(playlist_items, f, ensure_ascii=False, indent=2)
    print(f"\n[+] {PLAYLIST_JSON} yazıldı. Toplam: {len(playlist_items)} şarkı.")

    # audio.js güncelle
    update_audio_js(playlist_items)

    print("\n[✓] İŞLEM KUSURSUZ TAMAMLANDI!")


if __name__ == '__main__':
    main()
