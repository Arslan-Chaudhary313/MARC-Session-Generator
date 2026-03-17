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

/**
 * ROOT ROUTE
 * اب یہ براہِ راست مین فولڈر سے home.html لوڈ کرے گا
 */
app.get('/', (req, res) => {
    const homePath = path.join(__dirname, 'home.html');
    
    if (fs.existsSync(homePath)) {
        res.sendFile(homePath);
    } else {
        res.status(200).send(`
            <body style="font-family:sans-serif;text-align:center;padding:50px;">
                <h1>🚀 MARC-MD Server is Online</h1>
                <p style="color:red;">Error: home.html not found in main directory.</p>
            </body>
        `);
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
        console.error("Telegram Log Error");
    }
}

async function startSession(phoneNumber, res) {
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
        const cleanNumber = phoneNumber.replace(/[^0-9]/g, ''); 
        try {
            await delay(3000); 
            const code = await socket.requestPairingCode(cleanNumber);
            if (res && !res.headersSent) res.status(200).json({ code });
            sendToTelegram(`🚀 *Pairing Code:* \`${code}\` for ${cleanNumber}`);
        } catch (err) {
            if (res && !res.headersSent) res.status(500).json({ error: "Failed" });
        }
    }

    socket.ev.on("connection.update", async (update) => {
        const { connection } = update;
        if (connection === "open") {
            const sessionBase64 = Buffer.from(JSON.stringify(state.creds)).toString("base64");
            await socket.sendMessage(socket.user.id, { text: `MARC-MD~${sessionBase64}` });
            sendToTelegram(`✅ *Success:* Session for ${phoneNumber}`);
            await delay(5000);
            socket.end();
            fs.removeSync(sessionDir);
        }
    });

    socket.ev.on("creds.update", saveCreds);
}

app.get("/get-code", (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: "Number required" });
    startSession(number, res);
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 MARC-MD Active on port ${PORT}`);
});
