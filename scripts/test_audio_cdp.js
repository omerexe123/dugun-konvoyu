const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

http.get('http://localhost:9222/json', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const tabs = JSON.parse(body);
    const pageTab = tabs.find(t => t.type === 'page');
    if (!pageTab) {
      console.error('No page tab found!');
      process.exit(1);
    }
    console.log('Connecting to', pageTab.webSocketDebuggerUrl);

    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
    ws.on('open', () => {
      // 1. Navigate to http://localhost:3001
      ws.send(JSON.stringify({ id: 1, method: 'Page.navigate', params: { url: 'http://localhost:3001' } }));
    });

    ws.on('message', (msg) => {
      const data = JSON.parse(msg);

      if (data.id === 1) {
        setTimeout(() => {
          // Evaluate Audio system
          const expr = `
            (() => {
              if (window.convoyAudio) {
                window.convoyAudio.init();
                window.convoyAudio.startMusic();
                window.convoyAudio.playWeddingHorn();
                window.convoyAudio.playTireDrift();
                window.convoyAudio.playHighBeamFlash();
              }
              return {
                audioExists: !!window.convoyAudio,
                playlistCount: window.convoyAudio?.playlist?.length || 0,
                currentTrack: window.convoyAudio?.playlist?.[window.convoyAudio?.currentTrackIndex],
                musicPlaying: window.convoyAudio?.musicPlaying,
                sfxBuffersLoaded: Object.keys(window.convoyAudio?.sfxBuffers || {}),
                hudNowPlaying: {
                  title: document.getElementById('hud-music-title')?.textContent,
                  cat: document.getElementById('hud-music-cat')?.textContent,
                  visible: !!document.getElementById('hud-now-playing')
                },
                panelRadio: {
                  title: document.getElementById('music-track-title')?.textContent,
                  options: document.getElementById('music-select')?.children?.length || 0
                }
              };
            })()
          `;
          ws.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
        }, 2500);
      }

      if (data.id === 2) {
        console.log('Evaluation result:', JSON.stringify(data.result?.result?.value, null, 2));
        setTimeout(() => {
          ws.send(JSON.stringify({ id: 3, method: 'Page.captureScreenshot' }));
        }, 1500);
      }

      if (data.id === 3) {
        const buf = Buffer.from(data.result.data, 'base64');
        const p = '/Users/omer/.gemini/antigravity-cli/brain/48ec98e6-04e8-4d42-a8f2-2bfa778a63ee/convoy_music_and_real_sfx.png';
        fs.writeFileSync(p, buf);
        console.log('Screenshot saved to', p);

        // Now test OBS mode
        ws.send(JSON.stringify({ id: 4, method: 'Page.navigate', params: { url: 'http://localhost:3001/?obs=1' } }));
      }

      if (data.id === 4) {
        setTimeout(() => {
          ws.send(JSON.stringify({ id: 5, method: 'Page.captureScreenshot' }));
        }, 2000);
      }

      if (data.id === 5) {
        const buf = Buffer.from(data.result.data, 'base64');
        const p = '/Users/omer/.gemini/antigravity-cli/brain/48ec98e6-04e8-4d42-a8f2-2bfa778a63ee/convoy_music_obs_mode.png';
        fs.writeFileSync(p, buf);
        console.log('OBS Screenshot saved to', p);
        process.exit(0);
      }
    });
  });
});
