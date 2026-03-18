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
import chalk from "chalk"; // ✅ Chalk Imported for Professional Logging
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ✅ Dynamic Port Binding for Cloud Hosting (Heroku/Koyeb)
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Health Check & Landing Page Handler
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, 'home.html');
    if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
    } else {
        res.status(200).json({
            status: "Online",
            message: "ᴍᴀʀᴄ-ᴍᴅ Session Generator is operational ✅",
            architect: "𝐀𝐫𝐬𝐥𝐚𝐧 𝐂𝐡𝐚𝐮𝐝𝐡𝐚𝐫𝐲 👑"
        });
    }
});

async function startSession(phoneNumber, res) {
    // Unique session directory for isolated processes
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
        browser: ["MARC-MD", "Ubuntu", "3.0.0"]
    });

    // --- PAIRING CODE GENERATION ---
    if (phoneNumber && !socket.authState.creds.registered) {
        const cleanNumber = phoneNumber.replace(/[^0-9]/g, ''); 
        try {
            await delay(3000); 
            const code = await socket.requestPairingCode(cleanNumber);
            if (res && !res.headersSent) {
                res.status(200).json({ code });
                console.log(chalk.cyan(`🔑 Pairing Code Generated for: ${cleanNumber}`));
            }
        } catch (err) {
            console.error(chalk.red("❌ Pairing Request Failed:"), err.message);
            if (res && !res.headersSent) {
                res.status(500).json({ error: "Failed to generate pairing code" });
            }
        }
    }

    // --- CONNECTION HANDLER ---
    socket.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
            // ✅ Standardized Base64 Session Formatting
            const sessionBase64 = Buffer.from(JSON.stringify(state.creds)).toString("base64");
            const finalSessionId = `MARC-MD~${sessionBase64}`;
            
            const successMsg = `*SUCCESSFULLY CONNECTED!* 🚀\n\n` +
                               `*Architect:* 𝐀𝐫𝐬𝐥𝐚𝐧 𝐂𝐡𝐚𝐮𝐝𝐡𝐚𝐫𝐲 👑\n` +
                               `*Bot Name:* ᴍᴀʀᴄ-ᴍᴅ\n\n` +
                               `*Your Session ID:* \n\`\`\`${finalSessionId}\`\`\`\n\n` +
                               `_Copy the ID above and paste it in your Bot configuration._`;

            await socket.sendMessage(socket.user.id, { text: successMsg });
            
            console.log(chalk.green.bold("\n✨ SESSION GENERATED SUCCESSFULLY!"));
            console.log(chalk.yellow("ID: ") + chalk.white(finalSessionId) + "\n");
            
            await delay(5000);
            socket.end();
            
            // Cleanup to maintain server health
            setTimeout(() => {
                fs.removeSync(sessionDir);
                console.log(chalk.gray("📂 Temp session files cleaned up."));
            }, 10000);
        }

        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log(chalk.blue("ℹ️ Connection closed. Process finalized."));
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
        console.error(chalk.red("🔥 Internal Error:"), e);
        if (!res.headersSent) res.status(500).json({ error: "System failure" });
    }
});

// ✅ Cloud-Ready Server Listener
app.listen(PORT, "0.0.0.0", () => {
    console.log(chalk.blue.bold(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 MARC-MD SESSION GENERATOR IS LIVE
🌐 URL: http://0.0.0.0:${PORT}
👨‍💻 ARCHITECT: 𝐀𝐫𝐬𝐥𝐚𝐧 𝐂𝐡𝐚𝐮𝐝𝐡𝐚𝐫𝐲 👑
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `));
});
