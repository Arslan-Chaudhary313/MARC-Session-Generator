import pkg from "@whiskeysockets/baileys";
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    delay,
    DisconnectReason 
} = pkg;

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

// Middlewares
app.use(cors());
app.use(express.json());

// Serving home.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

async function startSession(phoneNumber, gender, religion, res) {
    // Vercel friendly temp directory logic
    const sessionDir = path.join('/tmp', `session_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    try {
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
            // Maintained your updated browser string for stability
            browser: ["MARC-MD", "Chrome", "121.0.6167.140"]
        });

        // Requesting Pairing Code Logic
        if (phoneNumber && !socket.authState.creds.registered) {
            const cleanNumber = phoneNumber.replace(/[^0-9]/g, ''); 
            
            // Wait for socket initialization
            await delay(3000); 
            
            try {
                const code = await socket.requestPairingCode(cleanNumber);
                if (!res.headersSent) {
                    res.status(200).json({ code });
                }
            } catch (err) {
                console.error("Pairing Error:", err);
                if (!res.headersSent) {
                    res.status(500).json({ error: "Pairing failed. Please refresh and try again." });
                }
                return;
            }
        }

        socket.ev.on("creds.update", saveCreds);

        socket.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === "open") {
                // Maintained MARC-MD session formatting logic
                const sessionBase64 = Buffer.from(JSON.stringify(state.creds)).toString("base64");
                const finalSession = `MARC-MD~${sessionBase64}`;
                
                await socket.sendMessage(socket.user.id, { 
                    text: `*Successfully Connected to MARC-MD!* 🚀\n\n*Profile:* ${gender} | ${religion}\n\n*Your Session ID:* \n\n\`\`\`${finalSession}\`\`\`\n\n_Keep this safe and do not share it._` 
                });
                
                await delay(3000);
                socket.end();
                // Clean up /tmp folder
                if (fs.existsSync(sessionDir)) fs.removeSync(sessionDir);
            }

            if (connection === "close") {
                const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
                if (reason !== DisconnectReason.loggedOut) {
                    // Logic preserved for silent closure
                }
                if (fs.existsSync(sessionDir)) fs.removeSync(sessionDir);
            }
        });

    } catch (mainErr) {
        console.error("Main Process Error:", mainErr);
        if (!res.headersSent) res.status(500).json({ error: "Internal Server Error" });
    }
}

app.get("/get-code", async (req, res) => {
    const { number, gender, religion } = req.query;
    if (!number) return res.status(400).json({ error: "Number is required" });
    
    await startSession(number, gender, religion, res);
});

// VERCEL COMPLIANCE: Exporting the app
export default app;

// Local development support
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 8000;
    app.listen(PORT, () => console.log(`🚀 MARC-MD Server running on port ${PORT}`));
}
