# Kimi Proxy Bridge Documentation

A lightweight Node.js proxy server that provides an OpenAI-compatible API interface for Kimi AI.

## 🚀 Getting Started

### Prerequisites
- Node.js installed (v16+ recommended)
- No external dependencies (uses native `http`/`https` modules)
- A valid [Kimi.ai](kimi.ai) account
## 🔑 Obtaining Your Access Token

Before running the server, you must configure your Kimi access token:
1. Navigate to kimi.ai and log in to your account
2. Open **Developer Tools**:
3. Navigate to the Application tab (or Storage in Firefox)
4. In the left sidebar, expand Local Storage → https://kimi.ai
5. Locate the key `access_token`
6. Copy its value (a long JWT string starting with eyJ...)
### Alternatively, via Console:
```javascript
// In the Console tab, type:
localStorage.getItem('access_token')
// Copy the returned string value
```
## ⚙️ Configuration
Edit either `main.js` or `IDE.js` (whichever you're using) and set your access token:
```javascript
// Around line 10-15, replace with your actual token
const ACCES_TOKEN = "";
```
### Running the Server
```bash
node main.js
# or
node IDE.js
```
The server listens on **port 3000** by default.
On startup, it automatically initializes a new chat session to generate a static Chat ID.

### Authentication
All requests must include the following header:
```http
Authorization: Bearer Waguri
```
Quick Smoke Test
```bash
curl http://localhost:3000/models -H "Authorization: Bearer Waguri"
```
You can change apiKey in main.js/IDE.js at Around line 65

---

## Usage & WalkThrough
#### - [Walkthrough & Usage](https://youtu.be/GlWP-YYddZg)
---

## 📡 API Endpoints

### 1. Chat Completions (OpenAI Compatible)
**POST** `/v1/chat/completions`

cURL example:
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer Waguri" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "role": "user", "content": "Hello! How are you?" }
    ],
    "model": "model",
    "stream": false
  }'
  ```
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer Waguri" \
  -H "Content-Type: application/json" \
  -N \
  -d '{
    "messages": [
      { "role": "user", "content": "Tell me a short story" }
    ],
    "model": "model",
    "stream": true
  }'
```
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer Waguri" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "role": "user", "content": "Solve this complex math problem: 2x + 5 = 15" }
    ],
    "model": "model",
    "deepThink": true,
    "stream": false
  }'
```
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer Waguri" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "role": "user", "content": "What are the latest news about AI?" }
    ],
    "model": "model",
    "search": true,
    "stream": false
  }'
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

cURL example:

```bash
curl -X GET http://localhost:3000/models \
  -H "Authorization: Bearer Waguri"
  ```
**POST** `/models`
Switch the active model scenario.

cURL example:

```bash
curl -X POST http://localhost:3000/models \
  -H "Authorization: Bearer Waguri" \
  -H "Content-Type: application/json" \
  -d '{"model": "SCENARIO_K2D5_TURBO"}'
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


