require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]:', reason.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]:', err.message || err);
});

const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const TelegramBotPkg = require('node-telegram-bot-api');
const TelegramBot = TelegramBotPkg.default || TelegramBotPkg;
const Database = require('better-sqlite3');
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
const { exec } = require('child_process');

// === MAIN CONFIGURATION ===
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '';
let MY_CHAT_ID = process.env.MY_CHAT_ID || '';
let MODEL_TEXT = process.env.MODEL_TEXT || 'qwen2.5:1.5b';
const MODEL_VISION = process.env.MODEL_VISION || 'huihui_ai/qwen2.5-vl-abliterated:3b';
const PORT = process.env.PORT || 3000;

let state = {
  isMuted: false,
  awayMode: false,
  activeAlert: null,
  waReady: false
};

// === 1. SQLITE DATABASE ===
const db = new Database('asisten.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS wa_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT, chat_name TEXT, message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS allowed_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name TEXT UNIQUE
  );
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task TEXT, done INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time TEXT, message TEXT, triggered INTEGER DEFAULT 0
  );
`);

const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
if (!fs.existsSync('./jadwal.json')) {
  const defaultSched = fs.existsSync('./jadwal.example.json')
    ? fs.readFileSync('./jadwal.example.json', 'utf8')
    : JSON.stringify({ "Monday": [], "Tuesday": [], "Wednesday": [], "Thursday": [], "Friday": [], "Saturday": [], "Sunday": [] }, null, 2);
  fs.writeFileSync('./jadwal.json', defaultSched);
}

// === 2. HARDWARE CONTROL (X11 DPMS & AUDIO) ===
function wakeScreen() {
  if (state.awayMode) return;
  exec('DISPLAY=:0 xset s off && DISPLAY=:0 xset dpms force on && DISPLAY=:0 xset s reset && DISPLAY=:0 xdotool key shift');
}
function turnOffScreen() {
  exec('DISPLAY=:0 xset s off && DISPLAY=:0 xset dpms force off');
}
function playAlarmSound(textToSpeak = '') {
  if (state.isMuted || state.awayMode) return;
  exec('killall mpg123 espeak-ng 2>/dev/null');
  if (fs.existsSync('./alarm.mp3')) {
    exec('mpg123 -f 15000 ./alarm.mp3');
  } else if (textToSpeak) {
    exec(`espeak-ng -v en "${textToSpeak}"`);
  }
}
function stopAlarmSound() {
  exec('killall mpg123 espeak-ng 2>/dev/null');
  state.activeAlert = null;
}

// === 3. WHATSAPP LISTENER (READ-ONLY & WHITELISTED) ===
let knownGroups = [];
let chatNameCache = {};

const waClient = new Client({
  authStrategy: new LocalAuth(),
  webVersionCache: { type: 'none' },
  puppeteer: {
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote'
    ]
  }
});

waClient.on('qr', qr => qrcode.generate(qr, { small: true }));

waClient.on('ready', async () => {
  console.log('✅ WhatsApp Listener is Ready!');
  state.waReady = true;
  try {
    const chats = await waClient.getChats();
    chats.forEach(c => {
      if (c.name && !c.id._serialized.includes('@newsletter') && !c.id._serialized.includes('status')) {
        chatNameCache[c.id._serialized] = c.name;
        if (!knownGroups.includes(c.name)) knownGroups.push(c.name);
      }
    });
    console.log(`📋 Loaded ${knownGroups.length} WhatsApp chats/groups.`);
  } catch (e) {}
});

waClient.on('message_create', async msg => {
  try {
    const fromId = msg.from || '';
    const toId = msg.to || '';

    if (fromId.includes('@newsletter') || toId.includes('@newsletter') || fromId.includes('status@broadcast')) return;
    if (!msg.body || !msg.body.trim()) return;

    const chatId = msg.fromMe ? toId : fromId;
    let chatName = chatNameCache[chatId] || chatNameCache[fromId] || '';

    if (!chatName) {
      try {
        const chat = await msg.getChat();
        if (chat && chat.name) {
          chatName = chat.name;
          chatNameCache[chatId] = chatName;
        }
      } catch (err) {}
    }

    const senderName = (msg._data && msg._data.notifyName) ? msg._data.notifyName : (msg.fromMe ? 'Me' : (msg.author || fromId.split('@')[0]));
    if (!chatName) chatName = senderName;

    chatName = String(chatName).trim();
    const cleanSender = String(senderName).trim();

    if (chatName && !knownGroups.includes(chatName)) {
      knownGroups.unshift(chatName);
    }

    const allowedList = db.prepare('SELECT group_name FROM allowed_groups').all().map(g => g.group_name.toLowerCase().trim());
    const isAllowed = allowedList.some(allowed =>
      allowed && (chatName.toLowerCase().includes(allowed) || cleanSender.toLowerCase().includes(allowed))
    );

    if (isAllowed) {
      db.prepare('INSERT INTO wa_messages (sender, chat_name, message) VALUES (?, ?, ?)').run(cleanSender, chatName, msg.body.trim());
    }
  } catch (e) {
    console.error('WA Message Error:', e.message);
  }
});
waClient.initialize().catch(err => console.error('WA Init Warning:', err.message));

// === 4. OLLAMA AI ENGINE ===
async function detectBestModel() {
  try {
    const res = await axios.get('http://127.0.0.1:11434/api/tags');
    const names = res.data.models.map(m => m.name);
    if (names.includes(MODEL_TEXT)) return;
    if (names.includes('huihui_ai/qwen2.5-abliterate:1.5b')) MODEL_TEXT = 'huihui_ai/qwen2.5-abliterate:1.5b';
    else if (names.includes('qwen2.5:1.5b')) MODEL_TEXT = 'qwen2.5:1.5b';
    else if (names.includes('huihui_ai/qwen2.5-abliterate:3b')) MODEL_TEXT = 'huihui_ai/qwen2.5-abliterate:3b';
    console.log(`🤖 Using AI Text Model: ${MODEL_TEXT}`);
  } catch (e) {}
}

async function askAI(prompt, jsonMode = false) {
  const res = await axios.post('http://127.0.0.1:11434/api/generate', {
    model: MODEL_TEXT,
    prompt,
    format: jsonMode ? 'json' : undefined,
    stream: false,
    keep_alive: -1,
    options: { temperature: 0.2, num_ctx: 512, num_predict: 90, num_thread: 3 }
  }, { timeout: 120000 });
  return res.data.response;
}

async function parseScheduleImageToJSON(base64Image) {
  const prompt = `Convert this schedule image into JSON with keys: "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday". Map Indonesian days: Senin=Monday, Selasa=Tuesday, Rabu=Wednesday, Kamis=Thursday, Jumat=Friday, Sabtu=Saturday, Minggu=Sunday. Format: "HH:MM - Subject". Output ONLY valid JSON!`;
  const res = await axios.post('http://127.0.0.1:11434/api/generate', {
    model: MODEL_VISION,
    prompt,
    images: [base64Image],
    format: 'json',
    stream: false,
    keep_alive: '30s',
    options: { num_ctx: 1536, num_thread: 3 }
  }, { timeout: 180000 });
  return JSON.parse(res.data.response);
}

setTimeout(async () => {
  await detectBestModel();
  askAI('Say OK.').then(() => console.log('🧠 AI Model locked in RAM & ready!')).catch(e => console.error('AI Warmup:', e.message));
}, 4000);

// === 5. BILINGUAL PROMPT & INSTANT REMINDER HANDLER ===
async function handleUserPrompt(text) {
  try {
    const reminderKeywords = /(panggil|ingatkan|bangunkan|alarm|remind|wake|call)/i;
    const timeRegex = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/;

    if (reminderKeywords.test(text) && timeRegex.test(text)) {
      const match = text.match(timeRegex);
      const formattedTime = `${match[1].padStart(2, '0')}:${match[2]}`;

      let taskMsg = text
        .replace(timeRegex, '')
        .replace(/^(tolong|bisa|coba)?\s*(panggil|ingatkan|bangunkan|remind|wake|call)\s*(saya|aku|me|up)?\s*(saat|pada|di|jam|pukul|at|on|for|untuk)?\s*/i, '')
        .replace(/^(untuk|buat|to|for)\s*/i, '')
        .trim() || 'Scheduled Reminder';

      db.prepare('INSERT INTO reminders (time, message) VALUES (?, ?)').run(formattedTime, taskMsg);
      return `⏰ Reminder Set! I will wake the screen and call you at ${formattedTime} for: "${taskMsg}".`;
    }

    const today = DAYS_EN[new Date().getDay()];
    const schedule = JSON.parse(fs.readFileSync('./jadwal.json', 'utf8'));
    const waLogs = db.prepare("SELECT chat_name, sender, message FROM wa_messages ORDER BY id DESC LIMIT 4").all();
    const todos = db.prepare('SELECT id, task FROM todos WHERE done = 0').all();
    const reminders = db.prepare('SELECT time, message FROM reminders WHERE triggered = 0').all();

    const fullPrompt = `Reply concisely in English.
Day: ${today}, ${new Date().toTimeString().slice(0,5)}.
Schedule: ${JSON.stringify(schedule[today] || [])}
To-Do: ${JSON.stringify(todos)}
Reminders: ${JSON.stringify(reminders)}
WhatsApp: ${JSON.stringify(waLogs)}
User: "${text}"
Assistant:`;

    return await askAI(fullPrompt, false);
  } catch (err) {
    return `⚠️ AI Engine Busy: ${err.message}`;
  }
}

// === 6. TELEGRAM BOT CONTROLLER ===
if (TELEGRAM_TOKEN && TELEGRAM_TOKEN !== 'your_telegram_bot_token_here') {
  const bot = new TelegramBot(TELEGRAM_TOKEN, {
    polling: { interval: 2000, autoStart: true, params: { timeout: 10 } },
    request: { family: 4 }
  });

  bot.on('polling_error', err => console.error('[Telegram Polling]:', err.message));

  function checkTelegramAuth(msg) {
    const incomingId = msg.chat.id.toString();
    if (!MY_CHAT_ID || MY_CHAT_ID === 'your_numeric_telegram_chat_id_here' || !/^\d+$/.test(MY_CHAT_ID)) {
      MY_CHAT_ID = incomingId;
      bot.sendMessage(incomingId, `🔓 **Telegram Connected!**\nYour Chat ID is: \`${incomingId}\`\nAdd this to your \`.env\` file.`, { parse_mode: 'Markdown' });
      return true;
    }
    return incomingId === MY_CHAT_ID;
  }

  bot.on('photo', async msg => {
    if (!checkTelegramAuth(msg)) return;
    bot.sendMessage(MY_CHAT_ID, '📸 Analyzing schedule image...');
    try {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const fileLink = await bot.getFileLink(fileId);
      const imgRes = await axios.get(fileLink, { responseType: 'arraybuffer' });
      const base64 = Buffer.from(imgRes.data, 'binary').toString('base64');

      const newSchedule = await parseScheduleImageToJSON(base64);
      fs.writeFileSync('./jadwal.json', JSON.stringify(newSchedule, null, 2));
      bot.sendMessage(MY_CHAT_ID, `✅ **Schedule updated:**\n\`\`\`json\n${JSON.stringify(newSchedule, null, 2)}\n\`\`\``, { parse_mode: 'Markdown' });
    } catch (err) {
      bot.sendMessage(MY_CHAT_ID, '❌ Failed to parse image: ' + err.message);
    }
  });

  bot.on('message', async msg => {
    if (!checkTelegramAuth(msg) || msg.photo) return;
    const text = (msg.text || '').trim();

    if (text === '/help' || text === '/start') {
      return bot.sendMessage(MY_CHAT_ID, `🤖 **AAAI Wall Assistant Commands:**
• \`/morning\` - Daily briefing
• \`/groups\` - View & manage allowed WhatsApp groups
• \`/allow_group <name>\` - Allow a WA group/contact
• \`/remove_group <name>\` - Remove a WA group/contact
• \`/clear_wa\` - Clear WhatsApp feed
• \`/add <task>\` & \`/done <id>\` - Manage To-Do List
• \`/away\` & \`/home\` - Stealth Away Mode vs Home Mode
• \`/mute\` & \`/unmute\` - Mute or unmute speaker
• \`/screen_off\` & \`/screen_on\` - Control screen
• \`/stop_alarm\` - Stop ringing alarm
• \`/power_log\` - View power history`, { parse_mode: 'Markdown' });
    }

    if (text === '/groups') {
      const allowed = db.prepare('SELECT group_name FROM allowed_groups').all().map(g => g.group_name);
      return bot.sendMessage(MY_CHAT_ID, `📋 **Allowed WA Groups:**\n${allowed.length ? allowed.map(g => `✅ ${g}`).join('\n') : '*(None)*'}\n\n🔍 **Detected Chats:**\n${knownGroups.length ? knownGroups.slice(0, 20).map(g => `• \`${g}\``).join('\n') : '*(Send a WA message first)*'}`, { parse_mode: 'Markdown' });
    }
    if (text.startsWith('/allow_group ')) {
      const gName = text.replace('/allow_group ', '').trim();
      db.prepare('INSERT OR IGNORE INTO allowed_groups (group_name) VALUES (?)').run(gName);
      return bot.sendMessage(MY_CHAT_ID, `✅ Allowed: **"${gName}"**`, { parse_mode: 'Markdown' });
    }
    if (text.startsWith('/remove_group ')) {
      const gName = text.replace('/remove_group ', '').trim();
      db.prepare('DELETE FROM allowed_groups WHERE lower(group_name) = lower(?)').run(gName);
      return bot.sendMessage(MY_CHAT_ID, `🗑️ Removed: **"${gName}"**`, { parse_mode: 'Markdown' });
    }
    if (text === '/clear_wa') { db.prepare('DELETE FROM wa_messages').run(); return bot.sendMessage(MY_CHAT_ID, '🧹 WhatsApp feed cleared!'); }
    if (text === '/mute') { state.isMuted = true; stopAlarmSound(); exec('amixer set Master mute'); return bot.sendMessage(MY_CHAT_ID, '🔇 Speaker **MUTED**.'); }
    if (text === '/unmute') { state.isMuted = false; exec('amixer set Master unmute && amixer set Master 80%'); return bot.sendMessage(MY_CHAT_ID, '🔊 Speaker **UNMUTED**.'); }
    if (text === '/away') { state.awayMode = true; state.isMuted = true; stopAlarmSound(); turnOffScreen(); return bot.sendMessage(MY_CHAT_ID, '🚪 **Away Mode Enabled.**'); }
    if (text === '/home') { state.awayMode = false; state.isMuted = false; exec('amixer set Master unmute'); wakeScreen(); return bot.sendMessage(MY_CHAT_ID, '🏠 **Home Mode Enabled.**'); }
    if (text === '/screen_off') { turnOffScreen(); return bot.sendMessage(MY_CHAT_ID, '🌑 Screen OFF.'); }
    if (text === '/screen_on') { state.awayMode = false; wakeScreen(); return bot.sendMessage(MY_CHAT_ID, '💡 Screen ON.'); }
    if (text === '/stop_alarm') { stopAlarmSound(); return bot.sendMessage(MY_CHAT_ID, '⏹️ Alarm stopped.'); }
    if (text === '/power_log') {
      const logs = fs.existsSync('/var/log/power-history.log') ? fs.readFileSync('/var/log/power-history.log', 'utf8').split('\n').slice(-15).join('\n') : 'No logs yet.';
      return bot.sendMessage(MY_CHAT_ID, `⚡ **Power Logs:**\n\`\`\`\n${logs}\n\`\`\``, { parse_mode: 'Markdown' });
    }
    if (text.startsWith('/add ')) {
      const task = text.replace('/add ', '').trim();
      db.prepare('INSERT INTO todos (task) VALUES (?)').run(task);
      return bot.sendMessage(MY_CHAT_ID, `✅ Task added: "${task}"`);
    }
    if (text.startsWith('/done ')) {
      const id = parseInt(text.replace('/done ', '').trim());
      db.prepare('UPDATE todos SET done = 1 WHERE id = ?').run(id);
      return bot.sendMessage(MY_CHAT_ID, `🎉 Task [${id}] completed!`);
    }
    if (text === '/morning') {
      bot.sendMessage(MY_CHAT_ID, '⏳ Generating morning briefing...');
      const briefing = await handleUserPrompt('Give me my daily briefing.');
      return bot.sendMessage(MY_CHAT_ID, briefing);
    }

    bot.sendMessage(MY_CHAT_ID, '⏳ Thinking...');
    const reply = await handleUserPrompt(text);
    bot.sendMessage(MY_CHAT_ID, reply);
  });

  global.sendTelegramNotification = (text) => {
    if (MY_CHAT_ID && /^\d+$/.test(MY_CHAT_ID)) bot.sendMessage(MY_CHAT_ID, text);
  };
}

// === 7. CRON SCHEDULER ===
cron.schedule('* * * * *', () => {
  const now = new Date();
  const currentHM = now.toTimeString().slice(0, 5);
  const today = DAYS_EN[now.getDay()];

  const dueReminders = db.prepare('SELECT * FROM reminders WHERE time = ? AND triggered = 0').all(currentHM);
  dueReminders.forEach(r => {
    db.prepare('UPDATE reminders SET triggered = 1 WHERE id = ?').run(r.id);
    triggerNotification(`REMINDER: ${r.message}`);
  });

  const schedule = JSON.parse(fs.readFileSync('./jadwal.json', 'utf8'));
  const todayList = schedule[today] || [];
  todayList.forEach(item => {
    if (item.startsWith(currentHM)) {
      triggerNotification(`CLASS NOW: ${item}`);
    }
  });
});

function triggerNotification(messageText) {
  state.activeAlert = { text: messageText, time: new Date().toLocaleTimeString() };
  if (state.awayMode) {
    if (global.sendTelegramNotification) global.sendTelegramNotification(`🔔 **[Silent Alert - Away Mode]**\n${messageText}`);
  } else {
    wakeScreen();
    playAlarmSound(messageText);
    if (global.sendTelegramNotification) global.sendTelegramNotification(`🔔 **ALARM RINGING IN ROOM:**\n${messageText}\n*(Send /stop_alarm to silence)*`);
  }
}

// === 8. EXPRESS API ===
const app = express();
app.use(express.json());
app.use(express.static('public'));

app.get('/api/status', (req, res) => {
  const today = DAYS_EN[new Date().getDay()];
  const schedule = JSON.parse(fs.readFileSync('./jadwal.json', 'utf8'));
  const todos = db.prepare('SELECT * FROM todos WHERE done = 0').all();
  const reminders = db.prepare('SELECT * FROM reminders WHERE triggered = 0').all();
  const wa = db.prepare('SELECT * FROM wa_messages ORDER BY id DESC LIMIT 5').all();
  const allowedGroups = db.prepare('SELECT group_name FROM allowed_groups').all().map(g => g.group_name);
  res.json({ today, schedule: schedule[today] || [], todos, reminders, wa, allowedGroups, knownGroups, state });
});

app.post('/api/groups/add', (req, res) => {
  const name = (req.body.name || '').trim();
  if (name) db.prepare('INSERT OR IGNORE INTO allowed_groups (group_name) VALUES (?)').run(name);
  res.json({ ok: true });
});

app.post('/api/groups/remove', (req, res) => {
  const name = (req.body.name || '').trim();
  db.prepare('DELETE FROM allowed_groups WHERE group_name = ?').run(name);
  res.json({ ok: true });
});

app.post('/api/wa/clear', (req, res) => {
  db.prepare('DELETE FROM wa_messages').run();
  res.json({ ok: true });
});

app.post('/api/dismiss', (req, res) => {
  stopAlarmSound();
  res.json({ ok: true });
});

app.post('/api/ask', async (req, res) => {
  const answer = await handleUserPrompt(req.body.prompt || '');
  res.json({ answer });
});

app.listen(PORT, () => console.log(`🚀 AAAI Wall Dashboard active at http://localhost:${PORT}`));
