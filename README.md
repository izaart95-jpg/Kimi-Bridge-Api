# Kimi Proxy Server Documentation

A lightweight Node.js proxy server that provides an OpenAI-compatible API interface for Kimi AI (Moonshot).

## 🚀 Getting Started

### Prerequisites
- Node.js installed (v16+ recommended)
- No external dependencies (uses native `http`/`https` modules)
- Getting kimi-auth : Go to kimi.com log in open Dev tools Go to Applications click on cookies and copy value of kimi-auth Paste its value in ACCES_TOKEN
### Running the Server
```bash
node main.js
```
The server listens on **port 3000** by default.
On startup, it automatically initializes a new chat session to generate a static Chat ID.

### Authentication
All requests must include the following header:
```http
Authorization: Bearer Waguri
```
For Example 
curl http://localhost:3000/models -H "Authorization: Bearer Waguri"

You can change apiKey in main.js/beta.js at Around line 65

---

## 📡 API Endpoints

### 1. Chat Completions (OpenAI Compatible)
**POST** `/v1/chat/completions`

Streamed responses compatible with OpenAI clients.

**Request Body:**
```json
{
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "model": "kimi",
  "deepThink": false,  // Optional: Enable deep thinking (default: false)
  "search": false      // Optional: Enable web search (default: false)
}
```

**Features:**
- **Streaming**: Returns Server-Sent Events (SSE) in `data: {...}` format.
- **Multimodal Support**: Handles `content` as a simple string or an array of objects (useful for Agents).
  ```json
  "content": [
    { "type": "text", "text": "Hello world" }
  ]
  ```

### 2. Manage History Mode
**GET / POST** `/history`

Control whether the server maintains conversation history or treats every message as a standalone turn.

- **History: `false` (Default)**
  - Behaves like `static.py`.
  - Reuses a fixed `STATIC_CHAT_ID` and `STATIC_PARENT_MESSAGE_ID`.
  - Every message branches from the original initialization point.
  
- **History: `true`**
  - Behaves like `continue.py`.
  - Automatically updates `lastMessageId` after every response.
  - Maintains a continuous conversation context.

**Usage:**
```http
POST /history
Content-Type: application/json

{ "enable": true }
```
*Or via GET:* `/history?enable=true`

### 3. Start New Chat
**POST** `/new`

Forces the server to initialize a fresh chat session.
- Generates new `Chat ID` and `Parent Message ID`.
- Updates the **Static** IDs used for non-history mode.
- Resets the **Global** IDs used for history mode.

**Response:**
```json
{
  "message": "New chat started",
  "chatId": "...",
  "lastMessageId": "..."
}
```

### 4. Model Management
**GET** `/models`
Lists available models: `SCENARIO_K2D5` (Kimi 2.5) and `SCENARIO_K2D5_TURBO`.

**POST** `/models`
Switch the active model scenario.

**Request:**
```json
{ "model": "SCENARIO_K2D5_TURBO" }
```

---

## 🛠️ Technical Details

### State Management
The server maintains an internal `globalState`:
- **Static IDs**: Created on startup or via `/new`. Used when history is **OFF**.
- **Dynamic IDs**: Updated continuously when history is **ON**.
- **Model**: Globally switched for all subsequent requests.

### Error Handling
- Returns standard OpenAI-style error objects.
- Includes a global `uncaughtException` handler to prevent server crashes on malformed payloads.

### Multimodal / Agent Support
- Automatically filters and joins text from array-based content fields.
- Safe to use with complex Agent frameworks that send structured content.


