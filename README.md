# Gemini API Server

A lightweight Express.js server compliant with Vercel serverless functions, serving as a gateway to Google's Gemini Pro API with strict JSON responses.

- **General Coding Assistant**: Supports all languages (Python, JS, C++, etc.).
- **Robust JSON**: Guaranteed valid JSON responses by wrapping raw text server-side.
- **Round-Robin Rotation**: Proactively cycles API keys to maximize throughput.
- **Stateless**: Simple, scalable, and memory-efficient.
- **Logging**: Detailed logs in `logs/server.log`.

## Setup

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Environment Variables:**
    Create a `.env` file in the root. You can provide one or multiple keys (comma-separated) for automatic rotation on quota errors:
    ```env
    GEMINI_API_KEYS=key1,key2,key3
    ```

3.  **Run Locally:**
    ```bash
    node api/index.js
    ```
    Server starts at `http://localhost:3000`.

## API Usage

### Endpoint
`GET /`

### Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | The user's prompt or question. |

### Frontend Example

```javascript
async function askGemini(question) {
  try {
    const url = `http://localhost:3000/?query=${encodeURIComponent(question)}`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error("API Error");
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error:", error);
    return { error: true, message: error.message };
  }
}

// Usage
askGemini("Write a Hello World in Node.js")
  .then(data => {
      // Print the code CLEANLY (interpreting newlines)
      console.log(data.code);
  });
```

### JSON Response Structure
```json
{
  "code": "// Here is the Node.js code...\nconst http = require('http');\n..."
}
```

### Notes
- **Stateless**: Each request is independent. No context or history is stored.
- **Multi-Language**: The API can generate code in any language requested.
