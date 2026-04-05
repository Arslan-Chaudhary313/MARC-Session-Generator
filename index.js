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

// Port configuration for Leapcell and other cloud hosting platforms
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Serve the home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

/**
 * Initializes the WhatsApp session and requests a pairing code.
 * @param {string} phoneNumber - The user's WhatsApp number.
 * @param {object} res - The Express response object.
 */
async function startSession(phoneNumber, res) {
    // Temporary directory for session storage
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

        // Request pairing code if the number is provided and not yet registered
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
                    res.status(500).json({ error: "Pairing failed. Please try again." });
                }
                return;
            }
        }

        socket.ev.on("creds.update", saveCreds);

        socket.ev.on("connection.update", async (update) => {
            const { connection } = update;
            
            if (connection === "open") {
                // Generate Session ID base64 string
                const sessionBase64 = Buffer.from(JSON.stringify(state.creds)).toString("base64");
                const finalSession = `MARC-MD~${sessionBase64}`;
                
                // Send success message with Session ID to the user's WhatsApp
                await socket.sendMessage(socket.user.id, { 
                    text: `*Successfully Connected to MARC-MD!* 🚀\n\n*Your Session ID:* \n\n\`\`\`${finalSession}\`\`\`` 
                });
                
                await delay(5000);
                socket.end();
                
                // Clean up temporary session directory after successful connection
                if (fs.existsSync(sessionDir)) fs.removeSync(sessionDir);
            }

            if (connection === "close") {
                // Clean up temporary session directory on connection close
                if (fs.existsSync(sessionDir)) fs.removeSync(sessionDir);
            }
        });

    } catch (mainErr) {
        console.error("Session Initialization Error:", mainErr);
        if (!res.headersSent) res.status(500).json({ error: "Internal Server Error" });
    }
}

// API endpoint to generate pairing code
app.get("/get-code", async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: "Phone number is required." });
    await startSession(number, res);
});

// Bind the server to 0.0.0.0 for compatibility with Leapcell and other cloud providers
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 MARC-MD Session Generator is running on port ${PORT}`);
});
