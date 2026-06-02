import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for AI Chat Interaction
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history } = req.body;
      if (!message) {
        return res.status(400).json({ error: "訊息內容不能為空" });
      }

      // Read key strictly from the custom x-gemini-key header passed from user's browser
      const requestApiKey = req.headers['x-gemini-key'] as string;

      if (!requestApiKey || !requestApiKey.trim()) {
        return res.status(401).json({ 
          error: "基於絕對隱私與安全防護，本工具已限制只能使用您私人的 API Key。請點擊上方「設定個人 AI 金鑰」輸入金鑰後再撥打 AI 對話。" 
        });
      }

      // Dynamically instantiate the GoogleGenAI SDK with the user's secure key
      const activeAi = new GoogleGenAI({
        apiKey: requestApiKey.trim(),
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Convert format for the Gemini API call using @google/genai SDK
      // contents format: [{ role: 'user' | 'model', parts: [{ text: '...' }] }]
      const contents = [];
      if (history && Array.isArray(history)) {
        for (const msg of history) {
          contents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
          });
        }
      }
      contents.push({
        role: "user",
        parts: [{ text: message }]
      });

      const systemInstruction = "你是一位精通生產力工具與個人看板（Kanban）設計的 AI 助理。請以和藹、專業、簡潔且條理清晰的態度協助使用者。你可以：\n1. 協助他們對工作任務進行結構化拆解，提供靈感與方向。\n2. 教授他們如何更有效率地使用待辦（Todo）、進行中（In Progress）與已完成（Done）欄位。\n3. 給出有創意、高效益的看板日常運用建議。\n請使用繁體中文、排版優美、善用 Markdown 格式（像是粗體、列表等）來回答，保持對答長度適中，親切友善。";

      // Robust calling wrapper with retry & fallback to handle high demand or 503 errors gracefully
      let response;
      const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];
      const maxRetries = 2;
      let lastError: any = null;

      for (const model of modelsToTry) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`嘗試使用 ${model} 模型進行生成 (第 ${attempt}/${maxRetries} 次)...`);
            response = await activeAi.models.generateContent({
              model: model,
              contents: contents,
              config: {
                systemInstruction: systemInstruction
              }
            });
            break; // Succeeded! Break out of the attempts loop.
          } catch (err: any) {
            lastError = err;
            const errStr = typeof err === 'string' ? err : (err.message || JSON.stringify(err));
            const isTransient = errStr.includes("503") || errStr.includes("UNAVAILABLE") || errStr.includes("demand");
            console.warn(`[伺服器] 模型 ${model} 出現問題 (嘗試 ${attempt}/${maxRetries}):`, errStr);
            
            if (isTransient && attempt < maxRetries) {
              const backoffMs = attempt * 800;
              await new Promise(resolve => setTimeout(resolve, backoffMs));
              continue; // Retry
            }
            break; // Move to next model choice if retry fails or it's not transient
          }
        }
        if (response) {
          break; // If any model succeeded, break models loop.
        }
      }

      if (!response && lastError) {
        throw lastError;
      }

      const text = response?.text || "抱歉，我暫時無法解讀我的思考。請再試一次。";
      res.json({ text });
    } catch (error: any) {
      console.error("Gemini API 呼叫失敗:", error);
      res.status(500).json({ 
        error: `Gemini API 呼叫失敗: ${error.message || error}` 
      });
    }
  });

  // Vite development middleware vs. static build
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
