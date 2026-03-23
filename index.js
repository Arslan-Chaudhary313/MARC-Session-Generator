import express from "express";
import pino from "pino";
import fs from "fs-extra";
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import pkg from "@whiskeysockets/baileys";

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    delay 
} = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Render/Heroku کے لیے پورٹ کی سیٹنگ
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// ہوم پیج
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

async function startSession(phoneNumber, res) {
    // سیشن کے لیے عارضی فولڈر
    const sessionDir = path.join(__dirname, 'auth_info', `session_${Date.now()}`);
    
    try {
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

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

        // پیئرنگ کوڈ کی درخواست
        if (phoneNumber && !socket.authState.creds.registered) {
            const cleanNumber = phoneNumber.replace(/[^0-9]/g, ''); 
            await delay(3000); 
            
            try {
                const code = await socket.requestPairingCode(cleanNumber);
                if (!res.headersSent) {
                    res.status(200).json({ code });
                }
            } catch (err) {
                if (!res.headersSent) {
                    res.status(500).json({ error: "Pairing failed. Try again." });
                }
                return;
            }
        }

        socket.ev.on("creds.update", saveCreds);

        socket.ev.on("connection.update", async (update) => {
            const { connection } = update;
            
            if (connection === "open") {
                // سیشن آئی ڈی بنانا
                const sessionBase64 = Buffer.from(JSON.stringify(state.creds)).toString("base64");
                const finalSession = `MARC-MD~${sessionBase64}`;
                
                // واٹس ایپ پر میسج بھیجنا
                await socket.sendMessage(socket.user.id, { 
                    text: `*Successfully Connected to MARC-MD!* 🚀\n\n*Your Session ID:* \n\n\`\`\`${finalSession}\`\`\`` 
                });
                
                await delay(5000);
                socket.end();
                // کام ختم ہونے کے بعد فولڈر صاف کرنا
                if (fs.existsSync(sessionDir)) fs.removeSync(sessionDir);
            }

            if (connection === "close") {
                if (fs.existsSync(sessionDir)) fs.removeSync(sessionDir);
            }
        });

    } catch (mainErr) {
        console.error("Error:", mainErr);
        if (!res.headersSent) res.status(500).json({ error: "Server Error" });
    }
}

app.get("/get-code", async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: "Number is required" });
    await startSession(number, res);
});

// سرور شروع کرنا
app.listen(PORT, () => {
    console.log(`🚀 MARC-MD Session Generator is running on port ${PORT}`);
});
