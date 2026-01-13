import logger from './logger.js';
import path from 'path';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API Key Management
const apiKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "").split(',').map(k => k.trim()).filter(k => k);
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

/**
 * Wraps raw AI text into the expected JSON format.
 * Strips markdown code blocks if present.
 */
function formatResponse(rawText) {
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
    });
}

/**
 * GET /
 * Main endpoint.
 */
app.get('/', async (req, res) => {
    try {
        const query = req.query.query;
        
        // LOG REQUEST
        logger.info('REQUEST', { 
            query, 
            ip: req.ip
        });

        if (!query) {
            const err = "Missing 'query' parameter.";
            logger.warn('BAD_REQUEST', { message: err });
            return res.status(400).json({ error: true, message: err });
        }
        
        if (apiKeys.length === 0) {
            const err = "Server config error: No API keys.";
            logger.error('CONFIG_ERROR', { message: err });
            return res.status(500).json({ error: true, message: err });
        }

        // Stateless execution - create a fresh session for this request
        // This AUTOMATICALLY picks the next key via Round-Robin
        let chatSession = await createChatSession();

        // Retry Loop for Quota Errors
        const MAX_RETRIES = apiKeys.length * 2; 
        let lastError = null;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                // Generate
                const result = await chatSession.sendMessage(query);
                const response = await result.response;
                const text = response.text();
                
                // LOG RAW AI RESPONSE
                logger.info('AI_RAW_RESPONSE', { attempt, rawText: text });

                // Format Response (Text -> JSON Wrapper)
                // This eliminates "Invalid JSON" errors from the model itself
                const finalResponse = formatResponse(text);

                // LOG FINAL RESPONSE
                logger.info('RESPONSE_SENT', finalResponse);
                
                return res.json(finalResponse);

            } catch (err) {
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

    } catch (criticalError) {
        logger.error('CRITICAL_SERVER_ERROR', { error: criticalError.message, stack: criticalError.stack });
        return res.status(500).json({
            error: true,
            message: "Internal Server Error",
            details: criticalError.message
        });
    }
});


export default app;
