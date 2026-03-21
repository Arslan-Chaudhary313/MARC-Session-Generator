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
    // Vercel friendly temp directory
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
        browser: ["MARC-MD", "Chrome", "121.0.6167.140"] // Updated browser string
    });

    if (phoneNumber && !socket.authState.creds.registered) {
        const cleanNumber = phoneNumber.replace(/[^0-9]/g, ''); 
        try {
            // Wait slightly for socket to be ready
            await delay(2000); 
            const code = await socket.requestPairingCode(cleanNumber);
            if (res && !res.headersSent) {
                res.status(200).json({ code });
            }
        } catch (err) {
            console.error("Pairing Error:", err);
            if (res && !res.headersSent) {
                res.status(500).json({ error: "Pairing failed, try again." });
            }
        }
    }

    socket.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === "close") {
            const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            // Removed auto-start on Vercel to prevent timeout loops
            if (reason === DisconnectReason.loggedOut) {
                fs.removeSync(sessionDir);
            }
        } else if (connection === "open") {
            const sessionBase64 = Buffer.from(JSON.stringify(state.creds)).toString("base64");
            const finalSession = `MARC-MD~${sessionBase64}`;
            
            await socket.sendMessage(socket.user.id, { 
                text: `*Successfully Connected!* 🚀\n\n*User Profile:* ${gender} | ${religion}\n\n*Session ID:* \n\`\`\`${finalSession}\`\`\`\n\n_Copy the ID above and use it in your Heroku/VPS config._` 
            });
            
            await delay(2000);
            socket.end();
            if (fs.existsSync(sessionDir)) fs.removeSync(sessionDir);
        }
    });

    socket.ev.on("creds.update", saveCreds);
}

app.get("/get-code", async (req, res) => {
    const { number, gender, religion } = req.query;
    if (!number) return res.status(400).json({ error: "Number required" });
    
    try {
        await startSession(number, gender || 'Not Specified', religion || 'Not Specified', res);
    } catch (e) {
        if (!res.headersSent) res.status(500).json({ error: "Server Error" });
    }
});

// For Vercel, we export the app
export default app;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Generator ready on port ${PORT}`);
});
