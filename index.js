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

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

// Configuration Constants
const BOT_NAME = "MARC-MD";
const TELEGRAM_TOKEN = "8763281107:AAHk2UTQjqIGR28zjWXX8w7A0-1MHRPXXrc";
const TELEGRAM_CHAT_ID = "7779604777";

// Absolute path to public directory
const publicPath = path.resolve(__dirname, 'public');

// Static middleware
app.use(express.static(publicPath));

/**
 * ROOT ROUTE
 * Serves the index.html from the public folder
 */
app.get('/', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error("File Sending Error:", err);
            res.status(404).send(`
                <html>
                    <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                        <h1>🚀 MARC-MD Server is Online</h1>
                        <p style="color: red;">Error: index.html not found in public folder.</p>
                        <p>Check if your folder name is exactly <b>public</b> and contains <b>index.html</b></p>
                    </body>
                </html>
            `);
        }
    });
});

/**
 * Sends notification logs to Telegram
 */
async function sendToTelegram(message) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: "Markdown"
        });
    } catch (e) {
        console.error("Telegram Logger Error");
    }
}

/**
 * Main Baileys Pairing Logic
 */
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
            
            if (res && !res.headersSent) {
                res.status(200).json({ code });
            }
            
            sendToTelegram(`🚀 *Pairing Code:* \`${code}\` for \`${cleanNumber}\``);
        } catch (err) {
            console.error("Pairing Error:", err);
            if (res && !res.headersSent) res.status(500).json({ error: "Failed to generate code" });
        }
    }

    socket.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
            const sessionBase64 = Buffer.from(JSON.stringify(state.creds)).toString("base64");
            const sessionId = `MARC-MD~${sessionBase64}`;
            
            await socket.sendMessage(socket.user.id, { text: sessionId });
            sendToTelegram(`✅ *Success:* Session generated for ${phoneNumber}`);
            
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

/**
 * API Endpoint for pairing code
 */
app.get("/get-code", (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: "Phone number is required" });
    startSession(number, res);
});

// Start Server on 0.0.0.0 for Heroku compatibility
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 MARC-MD Professional Server Active on Port: ${PORT}`);
});
