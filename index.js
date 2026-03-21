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
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { Boom } from '@hapi/boom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

async function startSession(phoneNumber, gender, religion, res) {
    // UPDATED: Using /tmp directory for Vercel compatibility to avoid permission issues
    const sessionDir = path.join('/tmp', `session_${Date.now()}`);
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
        browser: ["MARC-MD", "Ubuntu", "3.0.0"]
    });

    if (phoneNumber && !socket.authState.creds.registered) {
        const cleanNumber = phoneNumber.replace(/[^0-9]/g, ''); 
        try {
            await delay(3000); 
            const code = await socket.requestPairingCode(cleanNumber);
            if (res && !res.headersSent) res.status(200).json({ code });
        } catch (err) {
            if (res && !res.headersSent) res.status(500).json({ error: "Pairing failed" });
        }
    }

    socket.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === "close") {
            const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            
            // Auto-reconnect Logic: Reconnect if it's not a manual logout
            if (reason !== DisconnectReason.loggedOut) {
                console.log("Connection lost. Reconnecting...");
                startSession(phoneNumber, gender, religion, res);
            } else {
                console.log("Connection closed. Session ended or logged out.");
                fs.removeSync(sessionDir);
            }
        } else if (connection === "open") {
            const sessionBase64 = Buffer.from(JSON.stringify(state.creds)).toString("base64");
            const finalSession = `MARC-MD~${sessionBase64}`;
            
            // Log for developer context (Internal use)
            console.log(`Session generated for: ${gender} | ${religion}`);

            await socket.sendMessage(socket.user.id, { 
                text: `*Successfully Connected!* 🚀\n\n*User Profile:* ${gender} | ${religion}\n\n*Session ID:* \n\`\`\`${finalSession}\`\`\`\n\n_Copy the ID above and use it in your Heroku/VPS config._` 
            });
            
            await delay(5000);
            socket.end();
            // Cleanup after successful generation
            if (fs.existsSync(sessionDir)) fs.removeSync(sessionDir);
        }
    });

    socket.ev.on("creds.update", saveCreds);
}

app.get("/get-code", async (req, res) => {
    // FIXED: Now accepting gender and religion from query params
    const { number, gender, religion } = req.query;
    
    if (!number) return res.status(400).json({ error: "Number required" });
    try {
        await startSession(number, gender || 'Not Specified', religion || 'Not Specified', res);
    } catch (e) {
        if (!res.headersSent) res.status(500).json({ error: "Error" });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Generator ready on port ${PORT}`);
});
