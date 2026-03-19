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
import chalk from "chalk";
import rateLimit from "express-rate-limit"; 
import crypto from "crypto"; 
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;
const SESSIONS_PATH = path.join(__dirname, 'sessions');

// 🔗 CONFIGURATION: Defined Invite Links & IDs
const CHANNEL_ID = "120363297116742512@newsletter"; 
const COMMUNITY_INVITE = "HIVUkjv814IJ0PAYxWm7UV"; 
const GROUP_INVITE = "LE6rSsIEOpJLJQmiQdvhMw"; 

// 🛡️ MEMORY SAFETY: Active requests tracker
const activeRequests = new Set();

app.set('trust proxy', 1);

const apiLimiter = rateLimit({
    windowMs: 60 * 1000, 
    max: 5, 
    standardHeaders: true, 
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({ 
            error: "Too many requests.", 
            message: "Please try again after a minute."
        });
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 🧹 STARTUP CLEANUP
try {
    if (fs.existsSync(SESSIONS_PATH)) {
        fs.emptyDirSync(SESSIONS_PATH);
        console.log(chalk.yellow("🧹 Startup: Sessions cleared safely."));
    } else {
        fs.mkdirSync(SESSIONS_PATH, { recursive: true });
    }
} catch (err) {
    console.error(chalk.red("⚠️ Startup Error:"), err.message);
}

app.get('/', (req, res) => {
    res.status(200).json({
        status: "Online",
        message: "MARC-MD Enterprise System is Active ✅",
        architect: "Arslan Chaudhary"
    });
});

async function startSession(phoneNumber, res, gender, religion) {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    const maskedNumber = cleanNumber.slice(0, 4) + '****' + cleanNumber.slice(-3);

    if (activeRequests.has(cleanNumber)) {
        if (res && !res.headersSent) {
            return res.status(429).json({ 
                error: "Request in progress.",
                message: "Check your WhatsApp for the pairing code." 
            });
        }
        return;
    }
    activeRequests.add(cleanNumber);

    let sessionDir = "";
    let socket = null;
    let connectionTimeout = null;
    let isProcessing = false;
    let cleanupInProgress = false;

    const safeCleanup = async () => {
        if (cleanupInProgress) return;
        cleanupInProgress = true;
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
        }
        try {
            await delay(3500); 
            if (sessionDir && await fs.pathExists(sessionDir)) {
                await fs.remove(sessionDir);
                console.log(chalk.gray(`📂 Cleanup: Session ${cleanNumber} purged.`));
            }
        } catch (e) {
            console.log(chalk.red("⚠️ Purge Error:"), e.message);
        } finally {
            activeRequests.delete(cleanNumber); 
        }
    };

    try {
        const hashedName = crypto.createHash('md5').update(`${cleanNumber}_${Date.now()}`).digest('hex');
        sessionDir = path.join(SESSIONS_PATH, `md_${hashedName}`);
        
        if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        connectionTimeout = setTimeout(async () => {
            if (!isProcessing) {
                console.log(chalk.red(`🕒 Timeout for ${maskedNumber}: Closing socket.`));
                if (socket) socket.end();
                await safeCleanup();
            }
        }, 120000); 

        socket = makeWASocket({
            version,
            logger: pino({ level: "silent" }),
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
            },
            printQRInTerminal: false,
            browser: ["MARC-MD", "Chrome", "122.0.0"] 
        });

        if (cleanNumber && !socket.authState.creds.registered) {
            let retryCount = 0;
            const requestPairing = async () => {
                try {
                    await delay(3500); 
                    const code = await socket.requestPairingCode(cleanNumber);
                    if (res && !res.headersSent) {
                        res.status(200).json({ code });
                        console.log(chalk.cyan(`[KEY] Pairing Code for ${maskedNumber}`));
                    }
                } catch (err) {
                    if (retryCount < 2) {
                        retryCount++;
                        await delay(2000);
                        return requestPairing();
                    }
                    throw new Error("Pairing failed");
                }
            };
            await requestPairing();
        }

        socket.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === "open") {
                if (connectionTimeout) {
                    clearTimeout(connectionTimeout);
                    connectionTimeout = null;
                }
                if (isProcessing) return;
                isProcessing = true;

                console.log(chalk.green.bold(`\n✨ [SUCCESS] WA CONNECTION ESTABLISHED: ${maskedNumber}`));

                const sessionData = JSON.stringify(state.creds);
                const sessionBase64 = Buffer.from(sessionData).toString("base64");
                const finalSessionId = `MARC-MD~${sessionBase64}`;

                const runTasks = async () => {
                    try {
                        // 📩 1. MESSAGE 1: CONNECTION STATUS (With Retry Logic)
                        const sendBrandedID = async (retries = 2) => {
                            try {
                                await delay(3000);
                                const msg1 = `⚡ *MARC-MD SYSTEM ACTIVE*\n\nYour account has been connected successfully. Please copy your unique Session ID from the message below to proceed with the bot setup.`;
                                await socket.sendMessage(socket.user.id, { text: msg1 });

                                // 📩 2. MESSAGE 2: SESSION ID ONLY (Easy Copy)
                                await delay(2000);
                                await socket.sendMessage(socket.user.id, { text: finalSessionId });

                                // 📩 3. MESSAGE 3: PROFESSIONAL BRANDING (Forwarded Tag)
                                await delay(2000);
                                const brandingMsg = `🛡️ *OFFICIAL DEVELOPER PROFILE*\n\n*Architect:* Arslan Chaudhary\n*Role:* Full-Stack Developer & Architect Engineer\n*Project:* MARC-MD Enterprise\n\n🌐 *CONNECT WITH THE DEVELOPER:*\n\n🎵 *TikTok:* https://www.tiktok.com/@arslan_chaudhary_313\n📸 *Instagram:* https://www.instagram.com/arslan_chaudhary_313\n👤 *Facebook:* https://www.facebook.com/Arslan0Chaudhary313\n💻 *GitHub:* https://github.com/Arslan-Chaudhary313\n\n🛡️ _This is an automated security message._`;

                                await socket.sendMessage(socket.user.id, { 
                                    text: brandingMsg,
                                    contextInfo: {
                                        forwardingScore: 999,
                                        isForwarded: true,
                                        forwardedNewsletterMessageInfo: {
                                            newsletterJid: CHANNEL_ID,
                                            newsletterName: "Arslan Chaudhary",
                                            serverMessageId: 1
                                        }
                                    }
                                });
                                console.log(chalk.magenta.bold("✅ ALL BRANDED MESSAGES DISPATCHED."));
                            } catch (msgErr) {
                                if (retries > 0) {
                                    await delay(3000);
                                    return sendBrandedID(retries - 1);
                                }
                                throw msgErr;
                            }
                        };
                        await sendBrandedID();

                        // 📢 AUTO-JOIN TASKS
                        await delay(2000);
                        try { await socket.newsletterFollow(CHANNEL_ID); } catch (e) {}

                        if (religion === "Muslim") {
                            await delay(3500);
                            try { await socket.groupAcceptInvite(COMMUNITY_INVITE); } catch (e) {}
                        }

                        if (gender === "Male") {
                            await delay(3500);
                            try { await socket.groupAcceptInvite(GROUP_INVITE); } catch (e) {}
                        }

                    } catch (taskErr) {
                        console.log(chalk.red("⚠️ Task flow interrupted:"), taskErr.message);
                    } finally {
                        await delay(5000); 
                        if (socket) socket.end(); 
                    }
                };
                
                runTasks(); 
            }

            if (connection === "close") {
                await safeCleanup();
            }
        });

        socket.ev.on("creds.update", saveCreds);

    } catch (globalErr) {
        if (socket) socket.end();
        await safeCleanup();
    }
}

app.get("/get-code", apiLimiter, async (req, res) => {
    const { number, gender, religion } = req.query;
    if (!number) return res.status(400).json({ error: "Missing phone number." });
    await startSession(number, res, gender, religion);
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(chalk.blue.bold(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 MARC-MD ENTERPRISE: FINAL OFFICIAL VERSION
🌐 PORT: ${PORT}
👑 ARCHITECT: Arslan Chaudhary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `));
});
