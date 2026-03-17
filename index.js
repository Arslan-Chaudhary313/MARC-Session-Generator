import baileys from "@whiskeysockets/baileys";
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    delay,
    DisconnectReason 
} = baileys;

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

// Config
const BOT_NAME = "MARC-MD";
const TELEGRAM_TOKEN = "8763281107:AAHk2UTQjqIGR28zjWXX8w7A0-1MHRPXXrc";
const TELEGRAM_CHAT_ID = "7779604777";

const publicPath = path.join(__dirname, 'public');

// پبلک فولڈر چیک
app.use(express.static(publicPath));

app.get('/', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(200).send('MARC-MD Server is running! (index.html missing in public folder)');
    }
});

async function sendToTelegram(message) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: "Markdown"
        });
    } catch (e) {
        console.log("Telegram log failed");
    }
}

async function startSession(phoneNumber, res) {
    // سیشن فولڈر کا نام یونیک بنانا تاکہ کریش نہ ہو
    const sessionDir = path.join(__dirname, 'sessions', `session_${Date.now()}`);
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
            await delay(3000); 
            let code = await socket.requestPairingCode(phoneNumber);
            if (res && !res.headersSent) res.status(200).json({ code });
            sendToTelegram(`🚀 *Pairing Code:* \`${code}\` for ${phoneNumber}`);
        } catch (err) {
            if (res && !res.headersSent) res.status(500).json({ error: "Failed to get code" });
        }
    }

    socket.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "open") {
            const sessionBase64 = Buffer.from(JSON.stringify(state.creds)).toString("base64");
            const sessionId = `MARC-MD~${sessionBase64}`;
            
            await socket.sendMessage(socket.user.id, { text: sessionId });
            sendToTelegram(`✅ *Success:* ${phoneNumber}`);
            
            await delay(5000);
            socket.end();
            // فائلز ڈیلیٹ کرنا تاکہ ہیروکو ہینگ نہ ہو
            fs.removeSync(sessionDir);
        }
        
        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (!shouldReconnect) fs.removeSync(sessionDir);
        }
    });

    socket.ev.on("creds.update", saveCreds);
}

app.get("/get-code", (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: "Number required" });
    startSession(number, res);
});

// ہیروکو کے لیے 0.0.0.0 پر لسن کرنا لازمی ہے
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 MARC-MD Active on port ${PORT}`);
});
