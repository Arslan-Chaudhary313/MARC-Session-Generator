import express from "express";
import pino from "pino";
import fs from "fs-extra";
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Baileys Loading via Require (Most Stable for Vercel)
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    delay 
} = require("@whiskeysockets/baileys");

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

async function startSession(phoneNumber, res) {
    const sessionDir = path.join('/tmp', `session_${Date.now()}`);
    
    try {
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
            await delay(2000); 
            const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
            const code = await socket.requestPairingCode(cleanNumber);
            if (!res.headersSent) res.status(200).json({ code });
        }

        socket.ev.on("creds.update", saveCreds);

        socket.ev.on("connection.update", async (update) => {
            const { connection } = update;
            if (connection === "open") {
                const sessionID = Buffer.from(JSON.stringify(state.creds)).toString("base64");
                await socket.sendMessage(socket.user.id, { text: `MARC-MD~${sessionID}` });
                await delay(2000);
                socket.end();
                if (fs.existsSync(sessionDir)) fs.removeSync(sessionDir);
            }
        });

    } catch (err) {
        console.error("Critical Error:", err);
        if (!res.headersSent) res.status(500).json({ error: "Server Error. Try again." });
    }
}

app.get("/get-code", async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: "Number is missing" });
    await startSession(number, res);
});

export default app;
