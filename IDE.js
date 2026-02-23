const http = require("http");
const https = require("https");
const crypto = require("crypto");

// ================= CONFIGURATION =================
const PORT = 3000;
const ACCESS_TOKEN = "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ1c2VyLWNlbnRlciIsImV4cCI6MTc3NDI1MDc3NSwiaWF0IjoxNzcxNjU4Nzc1LCJqdGkiOiJkNmNsczV2ZnRhZTY4NGw5dTFyMCIsInR5cCI6ImFjY2VzcyIsImFwcF9pZCI6ImtpbWkiLCJzdWIiOiJkNHQ4ajNlczFyaDFvbGpvdjdnMCIsInNwYWNlX2lkIjoiZDR0OGozNnMxcmgxb2xqb3V2N2ciLCJhYnN0cmFjdF91c2VyX2lkIjoiZDR0OGozNnMxcmgxb2xqb3V2NzAiLCJzc2lkIjoiMTczMTQ2OTEyOTk4ODg0MTU3MiIsImRldmljZV9pZCI6Ijc1ODI1MjM4Nzc4NDczODkxOTciLCJyZWdpb24iOiJvdmVyc2VhcyIsIm1lbWJlcnNoaXAiOnsibGV2ZWwiOjEwfX0.xPnHXDOtIocDhiCsUrqbUVf2QDvN620i23wM5IRi_yTg8OuUESvfgPoZcqoHxxKtz8RdehtAlsEPlyKIYG96nw";

// IDE Instructions Configuration
const IDE_INSTRUCTIONS = true; // Set to true to prepend critical instructions to every request
const IDE_INSTRUCTION_TEXT = "CRITICAL INSTRUCTION (Must follow) 1st Use English 2nd Always if not mostly use tool calls in response also read my prompt preciseelybefore answering each and everypoint";

// Static IDs (will be initialized on startup)
let STATIC_CHAT_ID = "";
let STATIC_PARENT_MESSAGE_ID = "";

// State
let globalState = {
    chatId: "",
    lastMessageId: "",
    useHistory: false,
    currentModel: "SCENARIO_K2D5"
};

// Available models
const AVAILABLE_MODELS = [
    { id: "SCENARIO_K2D5", name: "Kimi 2.5", created: 1700000000, object: "model", owned_by: "moonshot" },
    { id: "SCENARIO_K2D5_TURBO", name: "Kimi 2.5 Turbo", created: 1700000000, object: "model", owned_by: "moonshot" }
];

// ================= HELPER FUNCTIONS =================

function connectEncode(obj) {
    const jsonStr = JSON.stringify(obj);
    const buffer = Buffer.from(jsonStr, 'utf-8');
    const lenBuffer = Buffer.alloc(4);
    lenBuffer.writeUInt32BE(buffer.length, 0);
    const header = Buffer.concat([Buffer.from([0x00]), lenBuffer]);
    return Buffer.concat([header, buffer]);
}

function generateId() {
    return crypto.randomBytes(16).toString("hex");
}

function sendJSON(res, data, status = 200) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
}

function sendError(res, message, type = "server_error", code = null, status = 500) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
        error: {
            message: message,
            type: type,
            param: null,
            code: code
        }
    }));
}

function isAuthenticated(req) {
    const authHeader = req.headers.authorization;
    return authHeader === "Bearer Waguri";
}

// ================= SERVER =================

const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
    }

    // Authentication Check
    if (!isAuthenticated(req)) {
        sendError(res, "Invalid or missing authentication token", "authentication_error", "invalid_api_key", 401);
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    // Helper to read body
    const readBody = () => new Promise((resolve, reject) => {
        let body = [];
        req.on('data', (chunk) => body.push(chunk));
        req.on('end', () => {
            try {
                const buffer = Buffer.concat(body);
                const text = buffer.toString();
                resolve(text ? JSON.parse(text) : {});
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });

    try {
        if (req.method === "GET" && path === "/history") {
            const enable = url.searchParams.get("enable") === 'true' || url.searchParams.get("value") === 'true';
            globalState.useHistory = enable;
            sendJSON(res, {
                message: `History mode set to ${globalState.useHistory}`,
                useHistory: globalState.useHistory,
                currentIds: {
                    chatId: globalState.chatId,
                    lastMessageId: globalState.lastMessageId
                }
            });
        }
        else if (req.method === "POST" && path === "/history") {
            const body = await readBody();
            const enable = body.enable === true || body.value === true;
            globalState.useHistory = enable;
            sendJSON(res, {
                message: `History mode set to ${globalState.useHistory}`,
                useHistory: globalState.useHistory
            });
        }
        else if (req.method === "POST" && path === "/new") {
            console.log("Starting new chat...");
            try {
                const { chatId, lastMessageId } = await startNewChat();
                if (chatId) {
                    globalState.chatId = chatId;
                    globalState.lastMessageId = lastMessageId; // Update global state

                    // Also update STATIC IDs so they become the new default for history:false
                    STATIC_CHAT_ID = chatId;
                    if (lastMessageId) STATIC_PARENT_MESSAGE_ID = lastMessageId;

                    sendJSON(res, {
                        message: "New chat started",
                        chatId: globalState.chatId,
                        lastMessageId: globalState.lastMessageId
                    });
                } else {
                    sendError(res, "Failed to obtain chat ID", "upstream_error", null, 500);
                }
            } catch (error) {
                console.error("Error starting new chat:", error);
                sendError(res, error.message, "upstream_error", null, 500);
            }
        }
        else if (req.method === "POST" && path === "/v1/chat/completions") {
            const body = await readBody();

            if (!globalState.chatId) {
                sendError(res, "Server not ready. No Chat ID.", "server_error", null, 503);
                return;
            }

            const { messages, deepThink, search } = body;

            const useDeepThink = deepThink === true;
            const useSearch = search === true;

            const lastMessage = messages && messages.length > 0 ? messages[messages.length - 1] : { content: "" };
            let prompt = lastMessage.content;

            // Handle array content (multimodal/agents)
            if (Array.isArray(prompt)) {
                prompt = prompt
                    .filter(p => p.type === 'text')
                    .map(p => p.text)
                    .join('\n');
            }

            if (!prompt) prompt = " "; // Ensure non-empty prompt

            // Apply IDE instructions if enabled
            if (IDE_INSTRUCTIONS) {
                prompt = `${IDE_INSTRUCTION_TEXT}\n\n${prompt}`;
            }

            let currentChatId = globalState.useHistory ? globalState.chatId : STATIC_CHAT_ID;
            let parentId = globalState.useHistory ? globalState.lastMessageId : STATIC_PARENT_MESSAGE_ID;

            console.log(`Sending message using ChatID: ${currentChatId}, ParentID: ${parentId}, History: ${globalState.useHistory}, Model: ${globalState.currentModel}, IDE Mode: ${IDE_INSTRUCTIONS}`);

            const payload = {
                "chat_id": currentChatId,
                "scenario": globalState.currentModel,
                "tools": [],
                "message": {
                    "parent_id": parentId,
                    "role": "user",
                    "blocks": [
                        { "message_id": "", "text": { "content": prompt } }
                    ],
                    "scenario": globalState.currentModel
                },
                "options": { "thinking": useDeepThink }
            };

            if (useSearch) {
                payload.tools.push({ "type": "TOOL_TYPE_SEARCH", "search": {} });
            }

            const headers = {
                "accept": "*/*",
                "authorization": `Bearer ${ACCESS_TOKEN}`,
                "connect-protocol-version": "1",
                "content-type": "application/connect+json",
                "r-timezone": "Asia/Calcutta",
                "x-language": "en-US",
                "x-msh-device-id": "7586915550627013133",
                "x-msh-platform": "web",
                "x-msh-session-id": "1731469129988841572",
                "x-traffic-id": "d4t8j3es1rh1oljov7g0",
                "referer": `https://www.kimi.com/chat/${currentChatId}`
            };

            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive"
            });

            const postData = connectEncode(payload);

            const kReq = https.request("https://www.kimi.com/apiv2/kimi.gateway.chat.v1.ChatService/Chat", {
                method: "POST",
                headers: headers
            }, (kRes) => {
                console.log(`Kimi API Status: ${kRes.statusCode}`);
                let buffer = Buffer.alloc(0);

                kRes.on("data", (chunk) => {
                    // console.log("Received chunk length:", chunk.length);
                    buffer = Buffer.concat([buffer, chunk]);

                    while (buffer.length >= 5) {
                        const length = buffer.readUInt32BE(1);
                        if (buffer.length < 5 + length) break;

                        const frame = buffer.subarray(5, 5 + length);
                        buffer = buffer.subarray(5 + length);

                        try {
                                const jsonStr = frame.toString('utf-8');
                                const data = JSON.parse(jsonStr);
                                // console.log("Parsed Frame:", JSON.stringify(data).slice(0, 200));

                                if (globalState.useHistory) {
                                if (data.message && data.message.id) {
                                    globalState.lastMessageId = data.message.id;
                                }
                            }

                            let content = null;
                            if (data.delta && data.delta.content) {
                                content = data.delta.content;
                            } else if (data.block && data.block.text && data.block.text.content) {
                                content = data.block.text.content;
                            }

                            if (content) {
                                const openAIChunk = {
                                    id: "chatcmpl-" + generateId(),
                                    object: "chat.completion.chunk",
                                    created: Math.floor(Date.now() / 1000),
                                    model: "kimi",
                                    choices: [{
                                        index: 0,
                                        delta: { content: content },
                                        finish_reason: null
                                    }]
                                };
                                res.write(`data: ${JSON.stringify(openAIChunk)}\n\n`);
                            }
                        } catch (e) {
                            console.error("Error parsing frame:", e);
                        }
                    }
                });

                kRes.on("end", () => {
                    res.write("data: [DONE]\n\n");
                    res.end();
                });
            });

            kReq.on("error", (e) => {
                console.error("Request error:", e);
                // If headers already sent, we can't send JSON error, just end.
                res.end();
            });

            kReq.write(postData);
            kReq.end();
        } else if (path === "/models") {
            if (req.method === "GET") {
                sendJSON(res, {
                    object: "list",
                    data: AVAILABLE_MODELS
                });
            } else if (req.method === "POST") {
                try {
                    const body = await readBody();
                    const newModel = body.model;

                    const modelExists = AVAILABLE_MODELS.some(m => m.id === newModel);
                    if (!modelExists) {
                        sendError(res, "Invalid model ID. Must be SCENARIO_K2D5 or SCENARIO_K2D5_TURBO", "invalid_request_error", "model_not_found", 400);
                        return;
                    }

                    globalState.currentModel = newModel;
                    sendJSON(res, {
                        message: "Model updated",
                        currentModel: globalState.currentModel
                    }, 201);
                } catch (e) {
                    sendError(res, "Invalid JSON", "invalid_request_error", "invalid_json", 400);
                }
            } else {
                sendError(res, "Method not allowed", "invalid_request_error", "method_not_allowed", 405);
            }
        } else {
            sendError(res, "Not Found", "invalid_request_error", "not_found", 404);
        }
    } catch (e) {
        console.error("Server error:", e);
        if (!res.headersSent) {
            sendError(res, e.message, "server_error", null, 500);
        }
    }
});

function startNewChat() {
    return new Promise((resolve, reject) => {
        const initialContent = IDE_INSTRUCTIONS 
            ? `${IDE_INSTRUCTION_TEXT}\n\nHello` 
            : "Hello";

        const payload = {
            "scenario": globalState.currentModel,
            "tools": [{"type": "TOOL_TYPE_SEARCH", "search": {}}],
            "message": {
                "role": "user",
                "blocks": [{"message_id": "", "text": {"content": initialContent}}],
                "scenario": globalState.currentModel
            },
            "options": {"thinking": false}
        };

        const headers = {
            "accept": "*/*",
            "authorization": `Bearer ${ACCESS_TOKEN}`,
            "connect-protocol-version": "1",
            "content-type": "application/connect+json",
            "x-msh-device-id": "7586915550627013133",
            "x-msh-platform": "web",
            "x-msh-session-id": "1731469129988841572",
            "referer": "https://www.kimi.com/"
        };

        const postData = connectEncode(payload);

        const req = https.request("https://www.kimi.com/apiv2/kimi.gateway.chat.v1.ChatService/Chat", {
            method: "POST",
            headers: headers
        }, (res) => {
            let buffer = Buffer.alloc(0);
            let foundChatId = null;
            let foundMessageId = null;

            res.on("data", (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);
                while (buffer.length >= 5) {
                    const length = buffer.readUInt32BE(1);
                    if (buffer.length < 5 + length) break;

                    const frame = buffer.subarray(5, 5 + length);
                    buffer = buffer.subarray(5 + length);

                    try {
                        const data = JSON.parse(frame.toString('utf-8'));
                        if (data.chat && data.chat.id) foundChatId = data.chat.id;
                        if (data.message && data.message.id) foundMessageId = data.message.id;
                    } catch (e) {}
                }
            });

            res.on("end", () => {
                if (foundChatId) {
                    resolve({ chatId: foundChatId, lastMessageId: foundMessageId });
                } else {
                    reject(new Error("No chat ID returned"));
                }
            });
        });

        req.on("error", (e) => reject(e));
        req.write(postData);
        req.end();
    });
}

// Initialize and start
(async () => {
    process.on('uncaughtException', (err) => {
        console.error('UNCAUGHT EXCEPTION:', err);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('UNHANDLED REJECTION:', reason);
    });

    try {
        console.log("Initializing... getting fresh Chat ID...");
        console.log(`IDE Instructions mode: ${IDE_INSTRUCTIONS ? 'ENABLED' : 'DISABLED'}`);
        const { chatId, lastMessageId } = await startNewChat();
        STATIC_CHAT_ID = chatId;
        STATIC_PARENT_MESSAGE_ID = lastMessageId;

        globalState.chatId = STATIC_CHAT_ID;
        globalState.lastMessageId = STATIC_PARENT_MESSAGE_ID;

        console.log(`Initialized with ChatID: ${STATIC_CHAT_ID}`);

        server.listen(PORT, () => {
            console.log(`Kimi Proxy Server running on port ${PORT}`);
            console.log(`History mode default: ${globalState.useHistory}`);
            console.log(`IDE Instructions: ${IDE_INSTRUCTIONS ? 'ON' : 'OFF'}`);
        });
    } catch (e) {
        console.error("Failed to initialize:", e);
        process.exit(1);
    }
})();
