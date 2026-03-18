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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ✅ Dynamic Port Binding (Crucial for Heroku/Koyeb)
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // If you have assets

// ✅ Professional Health Check & Landing
app.get('/', (req, res) => {
    // If home.html exists, send it. Otherwise, send status.
    const htmlPath = path.join(__dirname, 'home.html');
    if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
    } else {
        res.status(200).json({
            status: "Online",
            message: "MARC-MD Session Generator is operational ✅",
            architect: "Arslan Chaudhary"
        });
    }
});

async function startSession(phoneNumber, res) {
    // Unique session directory to prevent collisions
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
        // ✅ Professional Identity
        browser: ["MARC-MD", "Ubuntu", "3.0.0"]
    });

    // --- PAIRING CODE LOGIC ---
    if (phoneNumber && !socket.authState.creds.registered) {
        const cleanNumber = phoneNumber.replace(/[^0-9]/g, ''); 
        try {
            await delay(3000); 
            const code = await socket.requestPairingCode(cleanNumber);
            if (res && !res.headersSent) {
                res.status(200).json({ code });
            }
        } catch (err) {
            console.error("Pairing Request Failed:", err);
            if (res && !res.headersSent) {
                res.status(500).json({ error: "Failed to generate pairing code" });
            }
        }
    }

    // --- CONNECTION UPDATES ---
    socket.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
            // ✅ Standardized MARC-MD Session ID (Base64)
            const sessionBase64 = Buffer.from(JSON.stringify(state.creds)).toString("base64");
            const finalSessionId = `MARC-MD~${sessionBase64}`;
            
            // Professional Success Message
            const successMsg = `*SUCCESSFULLY CONNECTED!* 🚀\n\n` +
                               `*Architect:* Arslan Chaudhary\n` +
                               `*Bot Name:* ᴍᴀʀᴄ-ᴍᴅ\n\n` +
                               `*Your Session ID:* \n\`\`\`${finalSessionId}\`\`\`\n\n` +
                               `_Copy the ID above and paste it in your Bot configuration._`;

            await socket.sendMessage(socket.user.id, { text: successMsg });
            
            console.log(chalk?.green ? chalk.green("✨ Session Generated Successfully!") : "✨ Session Generated!");
            
            await delay(5000);
            socket.end();
            
            // Auto-Cleanup to save disk space on Cloud Hosting
            setTimeout(() => {
                fs.removeSync(sessionDir);
            }, 10000);
        }

        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                // Temporary session doesn't need aggressive reconnection
                console.log("Connection closed. Session process finished.");
            }
        }
    });

    socket.ev.on("creds.update", saveCreds);
}

// --- API ENDPOINT ---
app.get("/get-code", async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: "Phone number is required" });
    
    try {
        await startSession(number, res);
    } catch (e) {
        console.error("Internal Server Error:", e);
        if (!res.headersSent) res.status(500).json({ error: "System failed to initiate pairing" });
    }
});

// ✅ 0.0.0.0 Binding is REQUIRED for Cloud Port Forwarding
app.listen(PORT, "0.0.0.0", () => {
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 MARC-MD GENERATOR IS LIVE
🌐 Port: ${PORT}
👨‍💻 Architect: Arslan Chaudhary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
});
