# 🎥 LiveLink — Ultra-Low-Latency Multi-Camera LAN Studio

> A self-hosted, browser-based multi-camera streaming system designed for professional multi-camera live productions over local LAN and Wi-Fi networks. Engineered to replace VDO.Ninja with guaranteed 1080p60/4K quality, locked frame rates, hardware NVENC encoding, and sub-100ms glass-to-glass latency.

---

## ⚡ Quick Start

### 1. Launch the LiveLink Studio Host
Run directly with Node.js on the main production laptop (or any machine on your LAN):

```bash
# Clone and start with one command
git clone <repo-url>
cd VideoShare
npm install
npm run build
npm start
```

Or run via the CLI binary:
```bash
npx livelink --port 4443 --room studio
```

The server will automatically:
1. Detect all active LAN IPv4 interfaces (e.g. `10.30.137.98` or `192.168.1.x`).
2. Generate a local self-signed TLS certificate with multi-IP Subject Alternative Names (SAN).
3. Initialize the Mediasoup C++ SFU worker.
4. **Launch an Instant Worldwide Cloudflare Public Tunnel** providing a free, secure global HTTPS link (e.g. `https://xxxx.trycloudflare.com`) with zero router configuration or port forwarding!
5. Output the URLs and a QR code in the terminal.

---

## 🌐 URLs & Access Endpoints

| Portal | URL | Description |
| :--- | :--- | :--- |
| **Worldwide Public Portal** | `https://<YOUR_TUNNEL_ID>.trycloudflare.com` | Accessible from **any computer, phone, or tablet in the world** |
| **Individual Stream Feed** | `https://<HOST>/view/:room/:streamId` | Clean, transparent, full-viewport feed for OBS Studio or any browser |
| **Director Multiview** | `https://<HOST>/receiver?room=studio` | Main switcher with Program/Preview bus, audio mixer, and ISO recorder |
| **Camera Sender** | `https://<HOST>/sender?room=studio` | Laptop connected to DSLR / HDMI capture card or screen share |
| **Diagnostics & Benchmark** | `https://<HOST>/test?room=studio` | Glass-to-glass latency tool and synthetic multi-camera simulator |
| **OBS Clean Multiview** | `https://<HOST>/multiview/:room` | Clean multi-view grid for secondary monitor or OBS scene |
| **Local Zero-SSL Port** | `http://localhost:8080/receiver?room=studio` | Direct local testing without SSL prompts |

---

## 🔗 Direct Broadcast Links for Any Computer

Every camera stream connected to LiveLink automatically receives a dedicated, worldwide direct broadcast link.

1. In the **Director Multiview**, click the red **Broadcast Links** button in the top toolbar.
2. The modal displays:
   - **Worldwide Public Host** URL with active status.
   - Each camera feed with a **Copy Link** button (e.g. `https://<TUNNEL_URL>/view/studio/cam_1`).
   - A **Test in New Tab** link.
3. Paste that link into:
   - **Any computer's browser**: Viewers anywhere in the world will see the camera stream at full quality.
   - **OBS Studio / vMix**: Add a *Browser Source*, paste the link, set resolution to `1920x1080` @ `60fps`, and enable *"Control audio via OBS"*.
   - **Smartphones & Tablets**: Point mobile browsers to the broadcast link for instant remote monitoring.

---

## 🛑 How LiveLink Solves VDO.Ninja's Weaknesses

| Problem | VDO.Ninja Failure Mode | LiveLink Engineering Solution |
| :--- | :--- | :--- |
| **Bitrate Caps** | Capped at ~2.5 Mbps; heavy pixelation during camera movement | Manual slider up to **80+ Mbps** with custom SDP munging (`b=AS:50000`, `x-google-min-bitrate=25000`) |
| **Frame Rate Stutter** | Silently drops to 15-24 fps under minor load | Enforces strict `{ exact: 60 }` capture constraints and locked encoding framerate |
| **Quality Downscaling** | Degrades to 720p/360p automatically | Forces `degradationPreference = 'maintain-framerate'` and `contentHint = 'motion'` |
| **High CPU & Thermal Throttling** | Software VP8 or Baseline H.264 fallback | High Profile 4.2 H.264 forcing hardware encoders (NVENC, QuickSync, Apple VideoToolbox, AMD AMF) |
| **Audio Distortion & Lip-Sync Drift** | AEC, AGC & Noise suppression enabled by default | Disables all DSP filters for camera mics; uncompressed Opus stereo 256k; per-channel lip-sync delay offset |
| **Receiver Latency** | Accumulates 150-300ms jitter buffer | Tunes `playoutDelayHint = 0` and `jitterBufferTarget = 0` for <100ms LAN latency |

---

## 📷 DSLR Camera & Capture Card Setup Guide

To achieve true broadcast-grade 1080p60 or 4K with your DSLRs or mirrorless cameras:

### 1. Camera Body Configuration
1. **Clean HDMI Output**:
   - Sony: `Menu` → `Setup` → `HDMI Settings` → `HDMI Info. Display` → **Off**. Set `HDMI Resolution` to **1080p** or **2160p**.
   - Canon: `Menu` → `Shooting Settings` → `HDMI display` → **Without info**.
   - Panasonic (Lumix): `Setup` → `TV Connection` → `HDMI Rec Output` → `Info Display` → **Off**.
   - Nikon: `Setup Menu` → `HDMI` → `Advanced` → `Output display info` → **Off**.
2. **Disable Auto Power-Off / Eco Mode**:
   - Sony: `Power Save Start Time` → **Off** or `Auto Power OFF Temp.` → **High**.
   - Canon: `Auto Power Off` → **Disable**.
   - Nikon: `Custom Settings` → `Timers/AE lock` → `Monitor off delay` → **No limit**.
3. **Power Delivery**: Use dummy batteries (AC adapter couplers) or USB-C PD power banks to prevent battery exhaustion during long broadcasts.
4. **Shutter Speed Rule**:
   - When shooting at 60 fps, set camera shutter speed to **1/120s** (180° shutter rule) for natural motion blur.
   - When shooting under 50Hz lighting (Europe/Asia), shoot at 50 fps with **1/100s** shutter to eliminate light flicker.

### 2. HDMI Capture Card Optimization
- Recommended capture cards: Elgato Cam Link 4K, Magewell USB Capture HDMI, AVerMedia Live Gamer MINI, or reliable USB 3.0 UVC HDMI capture dongles.
- **Always plug into a native USB 3.0/3.1 port (blue/red port)**, never through unpowered passive hubs.

---

## 📶 Network Recommendations for LAN & Wi-Fi Production

| Setup | Recommendation |
| :--- | :--- |
| **Host Receiver Laptop** | **Always connect via Gigabit Ethernet cable (Cat 6)** directly to the router or gigabit switch. |
| **Camera Sender Laptops** | If Wi-Fi is required: Connect to a **5 GHz or 6 GHz Wi-Fi 6 (802.11ax)** SSID. Avoid 2.4 GHz due to congestion. |
| **Router Settings** | Use channel width **80 MHz or 160 MHz** on 5 GHz. Select DFS-free channels (e.g. 36, 40, 44, 48 or 149, 153, 157). |
| **Bandwidth Budget** | - 4 × 1080p60 @ 30 Mbps = 120 Mbps aggregate uplink.<br>- Gigabit Ethernet (1000 Mbps) provides over **8× headroom**. |

---

## 🎛 Production Multiviewer Features

- **Program / Preview Bus**: Click any camera tile to set as Preview (green), press **Spacebar** or click **CUT** to switch to Program (red). Keyboard shortcuts `1`–`9` select cameras.
- **Real-Time Telemetry HUD**: Every stream displays actual resolution, fps, bitrate in Mbps, RTT/latency in ms, packet loss, jitter, dropped frames, and hardware encoder/decoder implementations.
- **Multi-Channel Audio Mixer**: Click **Audio Mixer** in the toolbar for individual channel faders, solo, mute, and per-camera lip-sync delay offset sliders (0–500 ms).
- **ISO Multi-Camera Recording**: Click **ISO Record (R)** to record all cameras simultaneously at full bitrate with synchronized timecode tags for multi-cam editing in DaVinci Resolve or Adobe Premiere.
- **Director Cues**: Click **Director Cue** to send teleprompter cues ("Cam 2: Tighten framing") directly to camera operators' laptop screens.
- **Remote Camera Control**: Click the Sliders icon on any camera tile to remotely adjust its bitrate, frame rate, request an instant keyframe, or re-initialize capture.

---

## 🧪 Automated Testing & Diagnostics

LiveLink comes with a built-in multi-sender stress-testing harness:

### 1. In Browser:
Navigate to the **Benchmark** tab (`/test`), choose between 1, 2, 4, 6, or 8 senders, and click **Spawn Senders**. Or in the Multiview tab, click **Simulate 4 Cameras (1080p60)** to immediately generate 4 concurrent broadcast feeds with running millisecond clocks and moving test patterns.

### 2. Via CLI:
Simulate 4 or 8 senders from the command line:
```bash
node scripts/simulate-senders.js --count 4 --duration 30
```

---

## 📜 License
MIT License. Built for professional live video production.
