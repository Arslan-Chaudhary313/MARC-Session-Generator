import express from "express";
import pino from "pino";
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import pkg from "@whiskeysockets/baileys";

const { default: makeWASocket, useMultiFileAuthState, delay } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));

app.get("/get-code", async (req, res) => {
    const number = req.query.number;
    if (!number) return res.status(400).send("Number missing");

    const sessionDir = path.join('/tmp', `session_${Date.now()}`);
    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const socket = makeWASocket({
            auth: state,
            logger: pino({ level: "fatal" }), // صرف اہم ایررز دکھائے گا
            browser: ["MARC-MD", "Chrome", "1.0.0"]
        });

        if (!socket.authState.creds.registered) {
            await delay(2000);
            const code = await socket.requestPairingCode(number.replace(/[^0-9]/g, ''));
            res.status(200).json({ code });
        }

        socket.ev.on("creds.update", saveCreds);
        socket.ev.on("connection.update", async (up) => {
            if (up.connection === "open") {
                const id = Buffer.from(JSON.stringify(state.creds)).toString("base64");
                await socket.sendMessage(socket.user.id, { text: `MARC-MD~${id}` });
                socket.end();
            }
        });
    } catch (err) {
        if (!res.headersSent) res.status(500).send("Error: " + err.message);
    }
});

export default app;
