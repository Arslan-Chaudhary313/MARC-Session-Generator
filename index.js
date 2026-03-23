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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

async function startSession(phoneNumber, gender, religion, res) {
    const sessionDir = path.join('/tmp', `session_${Date.now()}`);
    
    try {
        // Dynamic loading to bypass Vercel import issues
        const { 
            default: makeWASocket, 
            useMultiFileAuthState, 
            fetchLatestBaileysVersion,
            makeCacheableSignalKeyStore,
            delay,
            DisconnectReason 
        } = require("@whiskeysockets/baileys");
        const { Boom } = require("@hapi/boom");

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
            browser: ["MARC-MD", "Chrome", "121.0.6167.140"]
        });

        if (phoneNumber && !socket.authState.creds.registered) {
            const cleanNumber = phoneNumber.replace(/[^0-9]/g, ''); 
            await delay(3000); 
            
            try {
                const code = await socket.requestPairingCode(cleanNumber);
                if (!res.headersSent) res.status(200).json({ code });
            } catch (err) {
                if (!res.headersSent) res.status(500).json({ error: "Pairing failed." });
                return;
            }
        }

        socket.ev.on("creds.update", saveCreds);
        socket.ev.on("connection.update", async (update) => {
            const { connection } = update;
            if (connection === "open") {
                const sessionBase64 = Buffer.from(JSON.stringify(state.creds)).toString("base64");
                await socket.sendMessage(socket.user.id, { text: `MARC-MD~${sessionBase64}` });
                await delay(3000);
                socket.end();
                if (fs.existsSync(sessionDir)) fs.removeSync(sessionDir);
            }
            if (connection === "close") {
                if (fs.existsSync(sessionDir)) fs.removeSync(sessionDir);
            }
        });

    } catch (mainErr) {
        console.error("Critical Error:", mainErr);
        if (!res.headersSent) res.status(500).json({ error: "Internal Server Error" });
    }
}

app.get("/get-code", async (req, res) => {
    const { number, gender, religion } = req.query;
    if (!number) return res.status(400).json({ error: "Number required" });
    await startSession(number, gender, religion, res);
});

export default app;
