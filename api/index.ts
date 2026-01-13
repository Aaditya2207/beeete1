import express, { Request, Response } from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';

import dotenv from 'dotenv';
import logger from "./logger.js";
// Load Env
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API Key Management
const envKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
const apiKeys: string[] = envKeys.split(',').map(k => k.trim()).filter(k => k);
let currentKeyIndex = 0;

if (apiKeys.length === 0) {
    logger.error('SYSTEM', "CRITICAL: No GEMINI_API_KEYS found in environment variables.");
    console.error("CRITICAL: No GEMINI_API_KEYS found in environment variables.");
}

/**
 * Get a model instance using the next available API key (Round-Robin).
 */
function getModel() {
    // Round-Robin: Increment index for every new model request
    const index = currentKeyIndex;
    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
    
    const key = apiKeys[index];
    if (!key) throw new Error("No available API keys.");
    
    const genAI = new GoogleGenerativeAI(key);
    // Log helpful debug info (not error)
    // logger.info('KEY_ASSIGNED', { index }); 
    return genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
}

const SYSTEM_PROMPT = `
You are an expert General Coding Assistant.
Your task is to write high-quality, production-ready code.

Rules:
1. Return ONLY the code. Do not provide conversational filler (e.g., "Here is the code").
2. Do not wrap the output in a JSON object. Return raw text.
3. If you need to include explanations, use comments in the target language.
4. If you use markdown code blocks, I will strip them, so it's better to return plain text.
5. You support ALL programming languages (Python, JavaScript, C++, etc.).
`;

interface CodeResponse {
    code: string;
}

/**
 * Wraps raw AI text into the expected JSON format.
 * Strips markdown code blocks if present.
 */
function formatResponse(rawText: string): CodeResponse {
    let clean = rawText;
    
    // Remove markdown code blocks (```language ... ```)
    // Regex matches ```...``` and captures the content inside
    const codeBlockRegex = /```[\w]*\n?([\s\S]*?)```/;
    const match = rawText.match(codeBlockRegex);
    
    if (match && match[1]) {
        clean = match[1].trim();
    } else {
        // Fallback: just strip any dangling backticks if fuzzy match failed
        clean = rawText.replace(/```/g, '').trim();
    }

    return {
        code: clean
    };
}

/**
 * Helper to initialize a chat session
 * Since we are stateless, this is called for every request.
 */
async function createChatSession() {
    const model = getModel();
    const initialHistory = [
        { role: "user", parts: [{ text: "System Instruction: " + SYSTEM_PROMPT }] },
        { role: "model", parts: [{ text: "// Acknowledged. I will return raw code." }] }
    ];
    
    return model.startChat({
        history: initialHistory,
        // generationConfig: { maxOutputTokens: 2048 }, // Removed per previous user edit
    });
}

/**
 * GET /
 * Main endpoint.
 */
app.get('/', async (req: Request, res: Response) => {
    try {
        const query = req.query.query as string;
        
        // LOG REQUEST
        logger.info('REQUEST', { 
            query, 
            ip: req.ip
        });

        if (!query) {
            const err = "Missing 'query' parameter.";
            logger.warn('BAD_REQUEST', { message: err });
            res.status(400).json({ error: true, message: err });
            return;
        }
        
        if (apiKeys.length === 0) {
            const err = "Server config error: No API keys.";
            logger.error('CONFIG_ERROR', { message: err });
            res.status(500).json({ error: true, message: err });
            return;
        }

        // Stateless execution - create a fresh session for this request
        // This AUTOMATICALLY picks the next key via Round-Robin
        let chatSession = await createChatSession();

        // Retry Loop for Quota Errors
        const MAX_RETRIES = apiKeys.length * 2; 
        let lastError: any = null;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                // Generate
                const result = await chatSession.sendMessage(query);
                const response = await result.response;
                const text = response.text();
                
                // LOG RAW AI RESPONSE
                logger.info('AI_RAW_RESPONSE', { attempt, rawText: text });

                // Format Response (Text -> JSON Wrapper)
                const finalResponse = formatResponse(text);

                // LOG FINAL RESPONSE
                logger.info('RESPONSE_SENT', finalResponse);
                
                res.json(finalResponse);
                return;

            } catch (err: any) {
                lastError = err;
                
                const errorMsg = err.message || "";
                const isQuotaError = errorMsg.includes('429') || errorMsg.toLowerCase().includes('quota');
                const isServiceOverloaded = errorMsg.includes('503') || errorMsg.includes('Overloaded');

                if (isQuotaError || isServiceOverloaded) {
                    const type = isQuotaError ? 'QUOTA_LIMIT' : 'SERVICE_OVERLOADED';
                    const usedKeyIndex = (currentKeyIndex - 1 + apiKeys.length) % apiKeys.length; // The key we JUST used
                    
                    logger.warn(type, { keyIndex: usedKeyIndex, error: errorMsg });
                    console.warn(`${type} on key index ${usedKeyIndex}. Retrying with next key...`);
                    
                    // Add a small delay for 503s
                    if (isServiceOverloaded) await new Promise(r => setTimeout(r, 1000));

                    // Re-initialize session 
                    // createChatSession() calls getModel(), which AUTOMATICALLY rotates to the next key
                    chatSession = await createChatSession();
                    
                    continue; 
                } else {
                    logger.error('API_ATTEMPT_ERROR', { attempt, error: errorMsg });
                    throw err; 
                }
            }
        }

        throw new Error(`Failed after ${MAX_RETRIES} attempts. Last error: ${lastError ? lastError.message : 'Unknown'}`);

    } catch (criticalError: any) {
        logger.error('CRITICAL_SERVER_ERROR', { error: criticalError.message, stack: criticalError.stack });
        res.status(500).json({
            error: true,
            message: "Internal Server Error",
            details: criticalError.message
        });
    }
});

// Start Server
if (process.env.VITE_PUBLIC_VERCEL_ENV !== 'production') {
    // Only listen if not in pure serverless mode (though Vercel handles listen usually, explicit listen is fine for local)
    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    });
}

export default app;
