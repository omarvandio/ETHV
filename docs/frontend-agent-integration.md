# Frontend-Agent Integration Guide

This guide covers how to integrate a React/Vite frontend with OpenClaw agents for the LikeTalent talent validation system.

## Overview

OpenClaw provides multiple HTTP API endpoints that can be used to trigger agent runs and receive responses. The most relevant options for frontend integration are:

1. **OpenAI Chat Completions API** (`/v1/chat/completions`) - OpenAI-compatible endpoint
2. **OpenResponses API** (`/v1/responses`) - Modern OpenResponses format with file support
3. **Webhooks** (`/hooks/agent`) - For event-driven triggers

---

## 1. Configuration Required

First, enable the HTTP endpoints in your OpenClaw config (`~/.openclaw/openclaw.json`):

```json5
{
  gateway: {
    auth: {
      mode: "token",
      token: "your-secure-token"
    },
    http: {
      endpoints: {
        chatCompletions: { enabled: true },
        responses: { enabled: true }
      }
    }
  },
  hooks: {
    enabled: true,
    token: "your-hook-token",
    path: "/hooks"
  }
}
```

Restart the Gateway after changing config:
```bash
openclaw gateway restart
```

---

## 2. Sending CV Files from Frontend

### Option A: Using OpenResponses API (Recommended)

The OpenResponses API supports `input_file` for sending documents including PDFs:

```javascript
// Frontend: Sending CV via OpenResponses API
const formData = new FormData();
const file = fileInput.files[0];

// Convert file to base64
const reader = new FileReader();
const base64 = reader.readAsDataURL(file).then(() => reader.result.split(',')[1]);

const response = await fetch('http://localhost:18789/v1/responses', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: "openclaw:ethv",  // Target the LikeTalent agent
    input: [
      {
        type: "input_file",
        source: {
          type: "base64",
          media_type: file.type,
          data: base64,
          filename: file.name
        }
      },
      {
        type: "message",
        role: "user",
        content: "Please analyze this CV and extract the candidate's skills."
      }
    ],
    instructions: "You are LikeTalent, a talent validator. Analyze the CV and identify technical skills."
  })
});

const result = await response.json();
```

### Option B: Using Webhooks

```javascript
// Frontend: Sending CV via Webhook
const formData = new FormData();
formData.append('cv', fileInput.files[0]);

// First upload file, then send webhook
const uploadResponse = await fetch('/api/upload-cv', {
  method: 'POST',
  body: formData
});
const { fileUrl } = await uploadResponse.json();

// Trigger agent via webhook
const webhookResponse = await fetch('http://localhost:18789/hooks/agent', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_HOOK_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: `Analyze this CV: ${fileUrl}`,
    name: "CV-Analysis",
    agentId: "ethv",
    wakeMode: "now"
  })
});
```

### Option C: Using multipart with base64 in Chat Completions

```javascript
// Using base64 encoded files with Chat Completions
const response = await fetch('http://localhost:18789/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: "openclaw:ethv",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Please analyze this CV and extract skills."
          },
          {
            type: "image_url",
            image_url: {
              url: `data:application/pdf;base64,${base64Data}`
            }
          }
        ]
      }
    ]
  }
});
```

**Supported file types:**
- `text/plain`, `text/markdown`, `text/html`, `text/csv`
- `application/json`, `application/pdf`
- Images: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/heic`, `image/heif`

**File size limits (configurable):**
- Files: max 5MB default
- Images: max 10MB default

---

## 3. Triggering the Agent

### Agent Selection

Choose which agent to run using one of these methods:

```javascript
// Method 1: Via model field
{
  model: "openclaw:ethv"
}

// Method 2: Via header
headers: {
  'x-openclaw-agent-id': 'ethv'
}
```

### Available Endpoints

| Endpoint | Use Case | Stream Support |
|----------|----------|----------------|
| `POST /v1/chat/completions` | OpenAI-compatible chat | Yes (SSE) |
| `POST /v1/responses` | Modern format with files | Yes (SSE) |
| `POST /hooks/agent` | Event-driven triggers | No |

### Example: Basic Agent Trigger

```javascript
// Non-streaming request
const response = await fetch('http://localhost:18789/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json',
    'x-openclaw-agent-id': 'ethv'
  },
  body: JSON.stringify({
    model: "openclaw",
    messages: [
      { role: "user", content: "Analyze this CV for data analyst position" }
    ]
  })
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

---

## 4. Receiving Agent Responses

### Non-Streaming (Polling)

```javascript
// Simple request/response
async function submitCV(cvFile) {
  const response = await fetch('http://localhost:18789/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: "openclaw:ethv",
      messages: [
        { 
          role: "user", 
          content: `Please analyze this CV file and identify technical skills. CV: ${cvFile}`
        }
      ]
    })
  });
  
  const result = await response.json();
  return result.choices[0].message.content;
}
```

### Streaming (Server-Sent Events)

For real-time responses, use streaming:

```javascript
// Streaming response with SSE
async function* streamCVAnalysis(cvData) {
  const response = await fetch('http://localhost:18789/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: "openclaw:ethv",
      stream: true,
      messages: [
        { role: "user", content: `Analyze this CV: ${cvData}` }
      ]
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices?.[0]?.delta?.content) {
            yield parsed.choices[0].delta.content;
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }
}

// Usage in React component
function CVAnalyzer() {
  const [result, setResult] = useState('');
  
  useEffect(() => {
    const stream = streamCVAnalysis(cvData);
    stream.then(async (generator) => {
      for await (const chunk of generator) {
        setResult(prev => prev + chunk);
      }
    });
  }, [cvData]);
}
```

### OpenResponses Streaming Format

```javascript
// Using /v1/responses with SSE
const response = await fetch('http://localhost:18789/v1/responses', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: "openclaw:ethv",
    stream: true,
    input: "Analyze this CV"
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const events = chunk.split('\n');
  
  for (const event of events) {
    if (event.startsWith('event: ') && event.includes('data: ')) {
      const [eventType, data] = event.split('\n');
      const parsed = JSON.parse(data.slice(6)); // Remove 'data: '
      
      // Handle different event types:
      // - response.output_text.delta
      // - response.completed
      // - response.failed
    }
  }
}
```

---

## 5. Real-Time Communication Options

### Option 1: SSE (Recommended for real-time)

Server-Sent Events provide lightweight real-time updates:

```javascript
// React hook for SSE
function useAgentStream(prompt) {
  const [content, setContent] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource(
      `http://localhost:18789/v1/chat/completions?prompt=${encodeURIComponent(prompt)}`,
      {
        headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
      }
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.choices?.[0]?.delta?.content) {
        setContent(prev => prev + data.choices[0].delta.content);
      }
    };

    eventSource.onerror = () => eventSource.close();

    return () => eventSource.close();
  }, [prompt]);

  return { content, isComplete };
}
```

**Note:** OpenClaw uses POST for streaming, not GET with EventSource. Use the fetch-based approach shown earlier.

### Option 2: Polling

Simple but less efficient:

```javascript
// Simple polling approach
async function checkStatus(runId) {
  const response = await fetch(`http://localhost:18789/api/runs/${runId}`, {
    headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
  });
  return response.json();
}

// In React
useEffect(() => {
  const interval = setInterval(async () => {
    const status = await checkStatus(runId);
    if (status.status === 'completed') {
      setResult(status.result);
      clearInterval(interval);
    }
  }, 2000);
  return () => clearInterval(interval);
}, [runId]);
```

### Option 3: WebSocket

OpenClaw doesn't have native WebSocket support, but you can wrap the SSE stream:

```javascript
// Convert SSE to WebSocket-like interface
class AgentWebSocket {
  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.callbacks = {};
  }

  async send(message) {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "openclaw:ethv",
        stream: true,
        messages: [{ role: "user", content: message }]
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      this.emit('message', chunk);
    }
  }

  on(event, callback) {
    this.callbacks[event] = callback;
  }

  emit(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event](data);
    }
  }
}
```

---

## 6. Authentication

### Setting Up Authentication

```javascript
// Auth config (in ~/.openclaw/openclaw.json)
{
  gateway: {
    auth: {
      mode: "token",          // or "password"
      token: "your-token",   // or use OPENCLAW_GATEWAY_TOKEN env var
      rateLimit: 100         // optional: requests per minute
    }
  }
}
```

### Using Authentication in Requests

```javascript
// Option 1: Bearer token (recommended)
headers: {
  'Authorization': 'Bearer YOUR_TOKEN'
}

// Option 2: Custom header
headers: {
  'x-openclaw-token': 'YOUR_TOKEN'
}

// Option 3: Query parameter (not recommended for production)
fetch('http://localhost:18789/v1/chat/completions?token=YOUR_TOKEN', ...)
```

### Authentication Methods

| Method | Config Key | Environment Variable |
|--------|-----------|---------------------|
| Token | `gateway.auth.token` | `OPENCLAW_GATEWAY_TOKEN` |
| Password | `gateway.auth.password` | `OPENCLAW_GATEWAY_PASSWORD` |
| OAuth | `gateway.auth.oauth` | Provider-specific |

### WebSocket Authentication (for real-time)

The Gateway uses a challenge-response protocol:

```javascript
// Step 1: Receive challenge from Gateway
{
  "type": "event",
  "event": "connect.challenge",
  "payload": { "nonce": "...", "ts": 1737264000000 }
}

// Step 2: Connect with auth
{
  "type": "req",
  "id": "...",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": { "id": "frontend", "version": "1.0.0", "platform": "web" },
    "role": "operator",
    "scopes": ["operator.read", "operator.write"],
    "auth": { "token": "YOUR_TOKEN" }
  }
}

// Step 3: Gateway returns hello-ok
{
  "type": "res",
  "id": "...",
  "ok": true,
  "payload": { "type": "hello-ok", "protocol": 3 }
}
```

### Security Notes

- Treat the Gateway token as a **full operator credential**
- The HTTP endpoints provide direct agent access - secure accordingly
- Keep endpoints behind loopback, Tailscale, or trusted reverse proxy
- Don't expose directly to the public internet
- Consider using separate tokens for frontend vs. admin access
- Device tokens are issued per connection and can be revoked

---

## 7. Complete React Integration Example

```jsx
// hooks/useOpenClaw.js
import { useState, useCallback } from 'react';

const GATEWAY_URL = 'http://localhost:18789';
const AGENT_ID = 'ethv';
const TOKEN = import.meta.env.VITE_OPENCLAW_TOKEN;

export function useOpenClaw() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const analyzeCV = useCallback(async (cvFile) => {
    setIsLoading(true);
    setError(null);

    try {
      // Convert file to base64
      const base64 = await fileToBase64(cvFile);

      const response = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
          'x-openclaw-agent-id': AGENT_ID
        },
        body: JSON.stringify({
          model: "openclaw",
          messages: [
            {
              role: "system",
              content: "You are LikeTalent, a talent validator. Analyze CVs and identify technical skills."
            },
            {
              role: "user",
              content: `Please analyze this CV and extract: 1) Technical skills, 2) Experience level, 3) Recommended roles. CV content: ${base64}`
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Gateway error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const analyzeCVStream = useCallback(async function* (cvFile) {
    setIsLoading(true);
    setError(null);

    try {
      const base64 = await fileToBase64(cvFile);

      const response = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
          'x-openclaw-agent-id': AGENT_ID
        },
        body: JSON.stringify({
          model: "openclaw",
          stream: true,
          messages: [
            {
              role: "system",
              content: "You are LikeTalent, a talent validator."
            },
            {
              role: "user",
              content: `Analyze this CV: ${base64}`
            }
          ]
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') return;

              try {
                const parsed = JSON.parse(data);
                if (parsed.choices?.[0]?.delta?.content) {
                  yield parsed.choices[0].delta.content;
                }
              } catch (e) {
                // Skip invalid JSON lines
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { analyzeCV, analyzeCVStream, isLoading, error };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

```jsx
// components/CVAnalyzer.jsx
import { useState } from 'react';
import { useOpenClaw } from '../hooks/useOpenClaw';

export function CVAnalyzer() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState('');
  const { analyzeCV, analyzeCVStream, isLoading, error } = useOpenClaw();

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setResult('');
  };

  const handleAnalyze = async () => {
    if (!file) return;

    // Using streaming
    setResult('');
    for await (const chunk of await analyzeCVStream(file)) {
      setResult(prev => prev + chunk);
    }
  };

  return (
    <div className="cv-analyzer">
      <input type="file" onChange={handleFileChange} accept=".pdf,.txt,.doc" />
      
      <button onClick={handleAnalyze} disabled={!file || isLoading}>
        {isLoading ? 'Analyzing...' : 'Analyze CV'}
      </button>

      {error && <div className="error">{error}</div>}
      
      {result && (
        <div className="result">
          <h3>Analysis Result:</h3>
          <pre>{result}</pre>
        </div>
      )}
    </div>
  );
}
```

---

## 8. Environment Variables

Store sensitive values in `.env`:

```bash
# .env
VITE_OPENCLAW_URL=http://localhost:18789
VITE_OPENCLAW_TOKEN=your-secure-token
```

```javascript
// Usage
const TOKEN = import.meta.env.VITE_OPENCLAW_TOKEN;
```

---

## 9. OpenClaw API Endpoints Summary

### HTTP Endpoints

| Endpoint | Method | Description | Streaming |
|----------|--------|-------------|-----------|
| `/v1/chat/completions` | POST | OpenAI-compatible chat API | ✅ SSE |
| `/v1/responses` | POST | Modern format with file support | ✅ SSE |
| `/hooks/agent` | POST | Webhook trigger for agent runs | ❌ |
| `/api/v1/events` | GET | Server-Sent Events for channel events | ✅ SSE |
| `/api/v1/check` | GET | Health probe endpoint | N/A |

### WebSocket Protocol

For full bidirectional communication:

```
ws://localhost:18789/
```

Protocol frames:
- **Request**: `{type: "req", id, method, params}`
- **Response**: `{type: "res", id, ok, payload|error}`
- **Event**: `{type: "event", event, payload, seq?, stateVersion?}`

### Key Methods (WebSocket)

| Method | Description |
|--------|-------------|
| `connect` | Initial handshake with auth |
| `chat.send` | Send message to agent |
| `agent.run` | Trigger agent execution |
| `sessions.list` | List active sessions |
| `system-presence` | Get connected devices |

## 10. Production Considerations

### Network Security

```bash
# SSH tunnel for remote access
ssh -N -L 18789:127.0.0.1:18789 user@gateway-host

# Or use Tailscale for direct access
```

### Rate Limiting

Configure in `~/.openclaw/openclaw.json`:

```json5
{
  gateway: {
    auth: {
      rateLimit: 100  // requests per minute
    }
  }
}
```

### TLS/HTTPS

For production, use a reverse proxy (nginx, Caddy, traefik) with TLS termination:

```nginx
# nginx example
server {
  listen 443 ssl;
  server_name your-domain.com;
  
  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;
  
  location / {
    proxy_pass http://127.0.0.1:18789;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

---

## Summary

| Feature | Recommended Approach |
|---------|---------------------|
| Send CV files | Use `/v1/responses` with `input_file` or base64 in `/v1/chat/completions` |
| Trigger agent | Use `/v1/chat/completions` or `/v1/responses` |
| Receive responses | Use streaming (`stream: true`) with SSE |
| Real-time updates | SSE streaming (lightweight, built-in) |
| Authentication | Bearer token in `Authorization` header |
| Full bidirectional | WebSocket with `connect` protocol |

**Key endpoints:**
- `POST /v1/chat/completions` - OpenAI-compatible
- `POST /v1/responses` - Modern with file support
- `POST /hooks/agent` - Webhook triggers
- `ws://localhost:18789/` - WebSocket for real-time

**Security:** Keep tokens secure, use HTTPS in production, restrict network access.