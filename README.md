# AAAI (All Autonomous AI Assistant)

**All Autonomous AI Assistant (AAAI)** is an AI project that aims to create an AI system capable of assisting with various aspects of daily life, ranging from the simple to the complex.

The project explores how a self-hosted, local-first AI system can continuously observe, organize, and assist with daily schedules, multi-platform communications, personal tasks, and local hardware automation without depending on proprietary cloud AI services.

> **Status: Early development / Experimental**

**Quick Navigation:**
[Project Goals](#project-goals) •
[Roadmap](#roadmap) •
[Design Principles](#design-principles) •
[Hardware Requirements](#hardware--system-requirements) •
[Installation Guide](#step-by-step-installation) •
[Telegram Commands](#telegram-commands) •
[Project Structure](#project-structure) •
[Development Status](#development-status) •
[Development](#development) •
[Disclaimer](#disclaimer) •
[License](#license)

---

# Project Goals

The long-term goal of AAAI is to build an autonomous, always-on personal assistant capable of integrating across multiple data sources and hardware interfaces:

- Daily schedules, reminders, and personal task management
- Messaging platforms (WhatsApp, Telegram, Discord)
- Educational and productivity platforms (School LMS, calendars, documents)
- Local room hardware (Ambient wall display, audio alerts, power management)
- Potentially more complex autonomous workflows in the future

The core reasoning engine and personal database should remain local, private, and independent from the underlying data sources or control interfaces.

Conceptually:

```text
                       AAAI
                         │
            Autonomous Reasoning Layer
           (Local LLM & Vision Engine)
                         │
              Context & Memory Layer
          (SQLite DB / Schedule / Logs)
                         │
          ┌──────────────┼──────────────┐
          │              │              │
    Data Sources   Control Interfaces  Hardware Layer
          │              │              │
     ┌────┼────┐    ┌────┴────┐    ┌────┼────┐
     │    │    │    │         │    │    │    │
    WA   TG   LMS  Web UI    Bot  X11 Audio Power
```

This architecture is intended to allow AAAI to gradually expand from simple daily reminders into complex multi-platform life assistance without rewriting the core local AI foundation.

---

# Roadmap

The project is developed incrementally. Early versions prioritize stability, 24/7 local operation on modest hardware, privacy, and practical daily utility over feature count.

## v0.0 — Foundation

Establish the core local AI bridge, local database, schedule structure, hardware display/audio control, and power safety foundations.

### Completed

- [x] Create initial project architecture
- [x] Implement local SQLite storage (`asisten.db`)
- [x] Define JSON schedule format (`jadwal.json`)
- [x] Integrate local LLM inference via Ollama (`Qwen2.5`)
- [x] Implement permanent RAM model locking (`keep_alive: -1`)
- [x] Implement bilingual prompt handling (Indonesian and English input with English output)
- [x] Implement instant regex parser for time-based wake/call commands
- [x] Implement minute-by-minute cron scheduler for classes and reminders
- [x] Implement X11 DPMS display wake and sleep automation
- [x] Implement ALSA/MPG123/eSpeak audio alert and mute controls
- [x] Implement fullscreen dark-mode Web UI kiosk dashboard
- [x] Implement 60-second AC power loss watchdog and auto safe shutdown (`power-watchdog.sh`)
- [x] Implement power outage and system boot timestamp logging

### Remaining

- [ ] Implement structured rotating application logs
- [ ] Establish automated backup for SQLite database and schedule JSON
- [ ] Implement configurable multi-sound alarm profiles
- [ ] Implement system temperature and resource monitoring on the dashboard

**Current goal:**

> AAAI runs reliably 24/7 on a wall-mounted Linux system, managing daily schedules, tasks, and hardware wake-up alerts autonomously.

---

## v0.1 — Multi-Platform Ingestion & Remote Control

Focus on connecting AAAI to daily messaging platforms and remote control channels.

### v0.1.0 — WhatsApp & Telegram Foundation

- [x] Read-only WhatsApp Web listener (`whatsapp-web.js`)
- [x] Automatic filtering of `@newsletter` channels and status broadcasts
- [x] Dynamic WhatsApp group and contact whitelist management
- [x] Telegram Bot remote controller (`node-telegram-bot-api`)
- [x] Automatic Telegram Chat ID detection and authorization lock
- [x] Remote Stealth "Away Mode" (`/away` and `/home`) to prevent startling people in the room
- [x] Remote screen and speaker override commands (`/screen_off`, `/screen_on`, `/mute`, `/unmute`)
- [x] AI Vision schedule parser from Telegram photos (`Qwen2.5-VL`)
- [ ] WhatsApp connection health check and auto-reauthentication alerts
- [ ] Message summarization for high-volume school groups

### v0.1.1 — Personal Telegram & Discord Ingestion

- [ ] Read-only ingestion for personal Telegram channels and school groups
- [ ] Discord bot/listener for school and community announcement channels
- [ ] Unified message normalization across WhatsApp, Telegram, and Discord
- [ ] Keyword and urgency detection (e.g., holiday announcements, schedule changes, deadlines)

### v0.1.2 — School LMS Integration

- [ ] School LMS connector / scraper foundation
- [ ] Automatic extraction of new assignments and due dates
- [ ] Synchronization between LMS deadlines and the local AAAI To-Do list
- [ ] Proactive morning briefing alerts for upcoming LMS deadlines

**v0.1 goal:**

> AAAI aggregates announcements across WhatsApp, Telegram, Discord, and School LMS to provide accurate daily briefings and deadline tracking.

---

## v0.2 — Context Memory & Proactive Assistance

Focus on moving from reactive commands to proactive daily assistance.

- [ ] Long-term conversational memory and user preference storage
- [ ] Automatic conflict detection between school schedule changes and personal reminders
- [ ] Offline progress and habit tracking
- [ ] Context-aware study and task recommendations
- [ ] Weekly summary reports via Telegram

**v0.2 goal:**

> AAAI proactively identifies schedule changes, cancellations, and pending tasks without requiring manual checks.

---

## v0.3 — Voice & Local Interaction

Explore hands-free room interaction in addition to keyboard and Telegram triggers.

- [ ] Local wake-word detection research
- [ ] Local Speech-to-Text (Whisper.cpp) integration
- [ ] Natural local Text-to-Speech (Piper TTS) integration
- [ ] Offline voice command execution

**v0.3 goal:**

> Hands-free voice interaction inside the room while maintaining strict privacy modes when away.

---

## v0.4 — Complex Autonomous Workflows

Expand AAAI toward complex multi-step digital tasks.

- [ ] Modular tool-use / agent plugin framework
- [ ] Local file and document summarization
- [ ] Automated study material and flashcard generation
- [ ] Cross-device synchronization between desktop PC, Linux server, and Android

**v0.4 goal:**

> AAAI assists with complex multi-step workflows across devices.

---

## v1.0 — Stable Release

The first major stable release.

Potential requirements:

- [ ] Stable multi-platform ingestion (WhatsApp, Telegram, Discord, LMS)
- [ ] Reliable 24/7 daemon operation and crash recovery
- [ ] Complete hardware and power management integration
- [ ] Comprehensive documentation and setup scripts
- [ ] Modular configuration system
- [ ] Automated test suite

---

# Design Principles

AAAI is developed around several core principles:

### 1. Local-first and self-hosted

Core AI reasoning, personal schedules, and message logs should run locally on user-owned hardware without relying on paid third-party AI APIs.

### 2. Passive and safe platform observation

When reading external messaging platforms such as WhatsApp, AAAI operates strictly in read-only mode with explicit group whitelisting to prevent spam and protect account safety.

### 3. Hardware and environment awareness

An always-on room assistant must respect physical privacy—staying dark and silent when idle or when the user is away (`/away`), and waking the display or speaker only when triggered or scheduled.

### 4. Resilience on modest hardware

The system is optimized to run 24/7 on low-power dual-core laptops (such as an Intel Core i7-6600U) with automatic safe shutdown during power outages.

### 5. Bilingual comprehension, English immersion

To support daily language learning, AAAI accepts natural input in both Indonesian and English while consistently delivering interfaces and responses in clear English.

### 6. Incremental development

Each stage produces a practical, working improvement used in real daily life before expanding into more complex autonomous capabilities.

---

# Hardware & System Requirements

### Minimum Specifications

| Component | Requirement |
| :--- | :--- |
| **CPU** | Dual-Core 64-bit x86_64 with AVX2 support (e.g., Intel Core i5/i7 6th Gen Skylake or newer) |
| **RAM** | 8 GB RAM (for `qwen2.5:1.5b` + headless Chromium + Debian XFCE) |
| **Storage** | 64 GB SSD (~15 GB free space for OS, Node.js, and Ollama models) |
| **OS** | Debian 12 (Bookworm) with **XFCE Desktop Environment (X11/Xorg)** |
| **Power** | AC Adapter + working internal battery (for 60-second blackout buffer) |

> **Note:** An X11 session (such as XFCE on Xorg) is required because AAAI uses `xset dpms` and `xdotool` to control physical screen power states.

### Reference Hardware (Tested 24/7 Build)

- **Device:** Toshiba Portege Z30-C
- **CPU:** Intel Core i7-6600U (2 Cores / 4 Threads)
- **RAM:** 16 GB DDR3L
- **Storage:** 256 GB SATA SSD

---

# Step-by-Step Installation

### 1. BIOS Configuration (Auto Power-On)

To allow the laptop to boot automatically when electricity returns after a power outage:

1. Enter BIOS setup on boot (press `F2` or `Del`).
2. Navigate to **Power Management** or **Advanced**.
3. Set **Wake on AC** / **Power On by AC** to **Enabled**.
4. Save and exit (`F10`).

### 2. System Packages & Display Setup (Debian 12 XFCE)

Install the required system packages and remove default screen lockers so remote screen wake commands never get trapped on a login prompt:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y xfce4 xfce4-goodies lightdm x11-xserver-utils xdotool \
acpi alsa-utils mpg123 espeak-ng chromium curl git sqlite3 \
build-essential python3 tlp lm-sensors fonts-noto-color-emoji

sudo apt purge -y light-locker xfce4-screensaver
sudo systemctl enable --now tlp
```

Enable auto-login in `/etc/lightdm/lightdm.conf` under `[Seat:*]`:

```ini
autologin-user=YOUR_LINUX_USERNAME
autologin-user-timeout=0
```

Configure `/etc/systemd/logind.conf` to prevent suspend on lid close or idle:

```ini
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
IdleAction=ignore
```

Restart `systemd-logind`:

```bash
sudo systemctl restart systemd-logind
```

### 3. Node.js 22 LTS & PM2

Install official Node.js 22 LTS from NodeSource to ensure native compatibility with `better-sqlite3`:

```bash
curl -fsSL [https://deb.nodesource.com/setup_22.x](https://deb.nodesource.com/setup_22.x) | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 4. Ollama & Local AI Models

Install Ollama and pull the text and vision models:

```bash
curl -fsSL [https://ollama.com/install.sh](https://ollama.com/install.sh) | sh
ollama pull qwen2.5:1.5b
ollama pull huihui_ai/qwen2.5-vl-abliterated:3b
```

Lock the active model in RAM and limit CPU threads to keep temperatures low during 24/7 operation:

```bash
sudo mkdir -p /etc/systemd/system/ollama.service.d
cat << 'EOF' | sudo tee /etc/systemd/system/ollama.service.d/override.conf
[Service]
Environment="OLLAMA_NUM_THREADS=3"
Environment="OLLAMA_KEEP_ALIVE=-1"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
EOF

sudo systemctl daemon-reload
sudo systemctl restart ollama
```

### 5. Clone & Configure AAAI

```bash
git clone [https://github.com/CloroLab/AAAI.git](https://github.com/CloroLab/AAAI.git) ~/aaai
cd ~/aaai
npm install
cp .env.example .env
nano .env
```

Fill in your `TELEGRAM_TOKEN` (from `@BotFather`) and `MY_CHAT_ID` inside `.env` (or leave `MY_CHAT_ID` blank and send `/start` to your bot on Telegram to auto-detect it). Optionally place a custom `alarm.mp3` file in `~/aaai/alarm.mp3`.

### 6. Link WhatsApp & Start 24/7 Service

Run `node server.js` once in the foreground to scan the WhatsApp Web QR code using **WhatsApp -> Linked Devices** on your phone:

```bash
node server.js
```

Once `✅ WhatsApp Listener is Ready!` appears, press `Ctrl+C` and start the persistent PM2 service:

```bash
pm2 start server.js --name "aaai"
pm2 save
pm2 startup
```

*(Run the `sudo env PATH=...` command output by `pm2 startup`)*.

### 7. Kiosk Autostart & 60s Power Watchdog

Copy the autostart desktop entry (launches the fullscreen dashboard on boot and turns off the display after 60 seconds of inactivity):

```bash
mkdir -p ~/.config/autostart
cp ~/aaai/scripts/dashboard-kiosk.desktop ~/.config/autostart/dashboard-kiosk.desktop
```

Setup the 60-second AC power outage auto-shutdown daemon:

```bash
sudo cp ~/aaai/scripts/power-watchdog.sh /usr/local/bin/power-watchdog.sh
sudo nano /usr/local/bin/power-watchdog.sh   # Insert your TELEGRAM_TOKEN and CHAT_ID
sudo chmod +x /usr/local/bin/power-watchdog.sh
sudo touch /var/log/power-history.log && sudo chmod 666 /var/log/power-history.log

cat << 'EOF' | sudo tee /etc/systemd/system/power-watchdog.service
[Unit]
Description=Auto Safe Shutdown on AC Power Loss (60s)
After=network-online.target

[Service]
ExecStart=/usr/local/bin/power-watchdog.sh
Restart=always
User=root

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now power-watchdog.service
```

---

# Telegram Commands

| Command | Action |
| :--- | :--- |
| `/help` | Display all available bot commands. |
| `/morning` | Generate today's briefing (Schedule + To-Do List + WhatsApp updates). |
| `/groups` | List allowed WhatsApp groups and view recently detected chats. |
| `/allow_group <name>` | Add a WhatsApp group or contact name to the whitelist. |
| `/remove_group <name>` | Remove a WhatsApp group from the whitelist. |
| `/clear_wa` | Clear all saved WhatsApp messages from the dashboard feed. |
| `/add <task>` | Add a new task to the To-Do list. |
| `/done <id>` | Mark a To-Do item as completed by ID. |
| `/away` | **Stealth Away Mode:** Turn screen OFF & mute speaker; incoming alarms stay silent. |
| `/home` | **Home Mode:** Restore normal screen wake and audio alerts. |
| `/mute` / `/unmute` | Mute or unmute the laptop speaker remotely. |
| `/screen_off` / `/screen_on` | Force the laptop display OFF or ON remotely. |
| `/stop_alarm` | Stop a currently ringing alarm. |
| `/power_log` | View the last 15 AC power outage and system boot logs. |
| **Send Photo** | Parse a timetable image into `jadwal.json` using AI Vision. |
| **Free Chat (EN / ID)** | Set reminders (`"Panggil saya jam 13.00 untuk belajar"`) or ask questions. |

---

# Project Structure

```text
AAAI/
├── README.md
├── LICENSE
├── package.json
├── .env.example
├── .gitignore
├── jadwal.example.json
├── server.js
├── public/
│   └── index.html
└── scripts/
    ├── dashboard-kiosk.desktop
    └── power-watchdog.sh
```

The repository structure will evolve as new data connectors and autonomous modules are separated into internal packages.

---

# Development Status

| Component | Status |
| ----------------------------------------- | -------------- |
| Project foundation & Express API | 🟢 Complete |
| SQLite database (`wa_messages`, `todos`) | 🟢 Complete |
| Local LLM integration (Ollama `Qwen2.5`) | 🟢 Complete |
| Vision schedule parser (`Qwen2.5-VL`) | 🟢 Complete |
| Bilingual prompt & regex reminder parser | 🟢 Complete |
| X11 DPMS display & ALSA audio control | 🟢 Complete |
| Fullscreen Kiosk Web UI (`public/`) | 🟢 Complete |
| WhatsApp read-only listener & whitelist | 🟢 Complete |
| Telegram remote control & Away Mode | 🟢 Complete |
| 60s AC power loss auto-shutdown watchdog | 🟢 Complete |
| Personal Telegram group ingestion | 🟡 Planned |
| Discord announcement ingestion | ⚪ Planned |
| School LMS assignment sync | ⚪ Planned |
| Proactive conflict & holiday detection | 🟡 In progress |
| Local voice interaction (STT/TTS) | ⚪ Planned |

### Status Legend

- 🟢 **Complete** — implemented and tested
- 🟡 **In progress** — actively being developed
- ⚪ **Planned** — not yet implemented

---

# Development

AAAI is currently developed in Node.js (v22 LTS) using Express, `better-sqlite3`, `whatsapp-web.js`, `node-telegram-bot-api`, and Ollama.

Basic commands used during development and operation:

```bash
# Run manually in foreground
node server.js

# Monitor 24/7 logs via PM2
pm2 logs aaai

# Check loaded Ollama models
ollama list
```

---

# Disclaimer

AAAI is an experimental personal AI and hardware automation project created for educational, research, and daily productivity purposes.

WhatsApp Web integration relies on headless browser automation (`whatsapp-web.js`) and is strictly intended for passive, read-only personal notification monitoring. Hardware power and display controls (`xset`, `xdotool`, `acpi`) are designed for Debian/XFCE (X11) systems and may behave differently on other Linux distributions or laptop models.

---

# License

This project is licensed under the GNU General Public License v3.0 (GPL-3.0). See [`LICENSE`](LICENSE) for details.
