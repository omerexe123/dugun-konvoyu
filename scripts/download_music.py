import subprocess
import urllib.parse
import os
import json

ident = 'turkiye-de-en-cok-dinlenen-oyun-havasi-albumu-misket-taverna-1-full-album'
out_dir = '/Users/omer/dugun-konvoyu/public/audio/music'
os.makedirs(out_dir, exist_ok=True)

tracks = [
    {
        'id': 'dugun_erik_dali',
        'file_id': 'dugun_erik_dali.mp3',
        'title': 'Ömer Faruk Bostan - Erik Dalı',
        'category': 'Düğün / Oyun Havası',
        'src_ident': ident,
        'src_file': 'Ömer Faruk Bostan - Erik Dalı 2017 - Potpori.mp3',
        'max_sec': 240
    },
    {
        'id': 'dugun_halay_potpori',
        'file_id': 'dugun_halay_potpori.mp3',
        'title': 'Coşkulu Davul Zurna & Halay Potpori',
        'category': 'Düğün / Halay',
        'src_ident': ident,
        'src_file': 'Best Halay Remix.mp3',
        'max_sec': 190
    },
    {
        'id': 'dugun_ankara_kostak',
        'file_id': 'dugun_ankara_kostak.mp3',
        'title': 'Ankara Oyun Havası (Kostak & Fidayda)',
        'category': 'Düğün / Ankara Havası',
        'src_ident': ident,
        'src_file': 'Dilara   Oyun Havası 1.mp3',
        'max_sec': 210
    },
    {
        'id': 'dugun_ismail_yk_8080',
        'file_id': 'dugun_ismail_yk_8080.mp3',
        'title': 'İsmail YK - 80 80 160 (Düğün Mix)',
        'category': 'Düğün / Oyun Havası',
        'src_ident': ident,
        'src_file': '🎶 İsmail YK  🎶 - 80 80 160 şarkı sözleri 🎶.mp3',
        'max_sec': 230
    },
    {
        'id': 'pop_tarkan_yolla',
        'file_id': 'pop_tarkan_yolla.mp3',
        'title': 'Tarkan - Yolla',
        'category': 'Türkçe Pop',
        'src_ident': ident,
        'src_file': 'Tarkan - Yolla.mp3',
        'max_sec': 240
    },
    {
        'id': 'pop_cagla_saz_mi_caz_mi',
        'file_id': 'pop_cagla_saz_mi_caz_mi.mp3',
        'title': 'Çağla - Saz Mı Caz Mı',
        'category': 'Türkçe Pop',
        'src_ident': ident,
        'src_file': 'mp3indirdur-Cagla-Saz-Mi-Caz-Mi.mp3',
        'max_sec': 200
    },
    {
        'id': 'pop_simge_askin_olayim',
        'file_id': 'pop_simge_askin_olayim.mp3',
        'title': 'Simge - Aşkın Olayım',
        'category': 'Türkçe Pop',
        'src_ident': ident,
        'src_file': 'Simge - Aşkın Olayım (Onurr).mp3',
        'max_sec': 230
    },
    {
        'id': 'pop_cevapsiz_cinlama',
        'file_id': 'pop_cevapsiz_cinlama.mp3',
        'title': 'Aleyna Tilki & Emrah Karaduman - Cevapsız Çınlama',
        'category': 'Türkçe Pop',
        'src_ident': ident,
        'src_file': 'Emrah Karaduman - Cevapsız Çınlama ft. Aleyna Tilki.mp3',
        'max_sec': 210
    },
    {
        'id': 'piyasa_ceza_yerli_plaka',
        'file_id': 'piyasa_ceza_yerli_plaka.mp3',
        'title': 'Ceza - Yerli Plaka (Cadde & Drift)',
        'category': 'Piyasa / Hip-Hop',
        'src_ident': ident,
        'src_file': 'Ceza - Yerli Plaka [ Orjinal Video Klip ].mp3',
        'max_sec': 240
    },
    {
        'id': 'piyasa_ben_fero_demet',
        'file_id': 'piyasa_ben_fero_demet.mp3',
        'title': 'Ben Fero - Demet Akalın (Piyasa Trap)',
        'category': 'Piyasa / Trap',
        'src_ident': ident,
        'src_file': 'Ben Fero - Demet Akalın [Official Video].mp3',
        'max_sec': 220
    },
    {
        'id': 'piyasa_drift_phonk',
        'file_id': 'piyasa_drift_phonk.mp3',
        'title': 'Kontraa - Aggressive Drift Phonk',
        'category': 'Piyasa / Drift Phonk',
        'src_ident': 'jamendo-596616',
        'src_file': '01-2238846-Kontraa-Endless _ Aggressive Drift Phonk Music.mp3',
        'max_sec': 90
    }
]

playlist = []

for t in tracks:
    target_mp3 = os.path.join(out_dir, t['file_id'])
    encoded_file = urllib.parse.quote(t['src_file'])
    url = f"https://archive.org/download/{t['src_ident']}/{encoded_file}"
    raw_tmp = f"/tmp/dl_{t['id']}.mp3"

    print(f"--> [{t['category']}] {t['title']}...")

    # Download with curl
    curl_cmd = ['curl', '-L', '-s', '--max-time', '45', url, '-o', raw_tmp]
    try:
        subprocess.run(curl_cmd, check=True)
        if not os.path.exists(raw_tmp) or os.path.getsize(raw_tmp) < 100000:
            print(f"WARN: file too small or missing for {t['title']}")
            continue

        # Transcode & normalize
        fade_start = max(10, t['max_sec'] - 3)
        ff_cmd = [
            'ffmpeg', '-y', '-i', raw_tmp,
            '-t', str(t['max_sec']),
            '-af', f'loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st={fade_start}:d=3',
            '-b:a', '128k',
            '-ar', '44100',
            target_mp3
        ]
        subprocess.run(ff_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        if os.path.exists(raw_tmp):
            os.remove(raw_tmp)

        playlist.append({
            'id': t['id'],
            'url': f"audio/music/{t['file_id']}",
            'title': t['title'],
            'category': t['category']
        })
        print(f"  ✓ Transcoded: {t['file_id']} ({os.path.getsize(target_mp3)} bytes)")
    except Exception as e:
        print(f"  ✗ Error on {t['title']}: {e}")

manifest_path = os.path.join(out_dir, 'playlist.json')
with open(manifest_path, 'w', encoding='utf-8') as f:
    json.dump(playlist, f, ensure_ascii=False, indent=2)

print(f"\nALL DONE! {len(playlist)} tracks saved to {manifest_path}")
