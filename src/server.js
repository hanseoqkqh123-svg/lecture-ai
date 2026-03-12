const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const OpenAI = require("openai");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

app.post("/api/transcribe", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "파일이 없습니다." });
        }

        const transcriptResponse = await client.audio.transcriptions.create({
            file: fs.createReadStream(req.file.path),
            model: "gpt-4o-mini-transcribe",
        });

        fs.unlinkSync(req.file.path);

        res.json({
            transcript: transcriptResponse.text || "",
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "STT 처리 실패",
            detail: error.message,
        });
    }
});

app.listen(5000, () => {
    console.log("AI server running on http://localhost:5000");
});