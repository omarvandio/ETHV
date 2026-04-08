// ============================================================
// ETHV AI Provider Abstraction
// Swap LLM providers via env vars — no code changes needed
//
// Supported providers:
//   anthropic  → MiniMax, Claude (api.minimax.io or api.anthropic.com)
//   openai     → GPT, DeepSeek, Grok, Groq (OpenAI-compatible)
//
// ENV VARS:
//   AI_PROVIDER      = anthropic | openai        (default: anthropic)
//   AI_BASE_URL      = https://api.minimax.io/anthropic
//   AI_API_KEY       = sk-...
//   AI_MODEL         = MiniMax-M2.5 | gpt-4o | deepseek-chat | etc.
// ============================================================

require('dotenv').config();
const https = require('https');
const http  = require('http');

const PROVIDER  = process.env.AI_PROVIDER  || 'anthropic';
const BASE_URL  = process.env.AI_BASE_URL  || 'https://api.minimax.io/anthropic';
const API_KEY   = process.env.AI_API_KEY   || process.env.MINIMAX_API_KEY || '';
const MODEL     = process.env.AI_MODEL     || process.env.MINIMAX_MODEL   || 'MiniMax-M2.5';

// ── Low-level HTTP request ────────────────────────────────────────────────────

function httpRequest(urlStr, options, body) {
  return new Promise((resolve, reject) => {
    const url    = new URL(urlStr);
    const client = url.protocol === 'https:' ? https : http;
    const bodyBuf = Buffer.from(body);

    const req = client.request({
      hostname: url.hostname,
      path:     url.pathname + (url.search || ''),
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      method:   'POST',
      headers:  { ...options.headers, 'Content-Length': bodyBuf.length }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });

    req.on('error', reject);
    req.write(bodyBuf);
    req.end();
  });
}

// ── Anthropic Messages format ─────────────────────────────────────────────────
// Used by: MiniMax, Claude (Anthropic)
// Trick: prefill assistant message to skip thinking preamble & force JSON output

async function callAnthropic({ messages, maxTokens, prefill, system }) {
  const msgs = [...messages];
  if (prefill) msgs.push({ role: 'assistant', content: prefill });

  const payload = { model: MODEL, max_tokens: maxTokens, messages: msgs };
  if (system) payload.system = system;

  const body = JSON.stringify(payload);
  const { status, body: raw } = await httpRequest(
    BASE_URL + '/v1/messages',
    {
      headers: {
        'x-api-key':          API_KEY,
        'anthropic-version':  '2023-06-01',
        'content-type':       'application/json',
      }
    },
    body
  );

  console.log('[AI] Anthropic status:', status);
  const parsed = JSON.parse(raw);
  const textBlock = (parsed?.content || []).find(c => c.type === 'text');
  let text = textBlock?.text || '';
  // Reattach prefill — model continues from it but doesn't echo it back
  if (prefill && !text.trimStart().startsWith(prefill.trim())) {
    text = prefill + text;
  }
  return text;
}

// ── OpenAI Chat Completions format ────────────────────────────────────────────
// Used by: GPT-4o, DeepSeek, Grok, Groq, Together, etc.

async function callOpenAI({ messages, maxTokens, system, jsonMode }) {
  const msgs = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages;

  const payload = { model: MODEL, max_tokens: maxTokens, messages: msgs };
  if (jsonMode) payload.response_format = { type: 'json_object' };

  const body = JSON.stringify(payload);
  const { status, body: raw } = await httpRequest(
    BASE_URL + '/v1/chat/completions',
    {
      headers: {
        'Authorization': 'Bearer ' + API_KEY,
        'content-type':  'application/json',
      }
    },
    body
  );

  console.log('[AI] OpenAI status:', status);
  const parsed = JSON.parse(raw);
  return parsed?.choices?.[0]?.message?.content || '';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * callAI(prompt, options) → string (raw text from model)
 *
 * @param {string} prompt        - User prompt
 * @param {object} options
 *   maxTokens  {number}  default 2048
 *   prefill    {string}  Force response to start with this (Anthropic only — e.g. '[' for JSON arrays)
 *   system     {string}  System message
 *   jsonMode   {boolean} Request JSON output (OpenAI json_object mode)
 */
async function callAI(prompt, options = {}) {
  const { maxTokens = 2048, prefill = null, system = null, jsonMode = false } = options;
  const messages = [{ role: 'user', content: prompt }];

  const _t0 = Date.now();
  console.log('[AI] Provider:', PROVIDER, '| Model:', MODEL, '| maxTokens:', maxTokens, '| promptLen:', prompt.length);

  let result;
  if (PROVIDER === 'openai') {
    result = await callOpenAI({ messages, maxTokens, system, jsonMode });
  } else {
    result = await callAnthropic({ messages, maxTokens, prefill, system });
  }
  console.log(`[AI] HTTP round-trip: ${Date.now() - _t0}ms | responseLen: ${result.length}`);
  return result;
}

// Like callAI but accepts a full messages array — used for multi-turn quiz generation
async function callAIMessages(messages, options = {}) {
  const { maxTokens = 2048, prefill = null, system = null } = options;

  const _t0 = Date.now();
  console.log('[AI] (chat) turns:', messages.length, '| maxTokens:', maxTokens);

  let result;
  if (PROVIDER === 'openai') {
    result = await callOpenAI({ messages, maxTokens, system });
  } else {
    result = await callAnthropic({ messages, maxTokens, prefill, system });
  }
  console.log(`[AI] HTTP round-trip: ${Date.now() - _t0}ms | responseLen: ${result.length}`);
  return result;
}

/**
 * parseJSON(text) → parsed object/array or null
 * Handles: markdown fences, thinking preamble, {/} inside strings
 */
function parseJSON(text) {
  const cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

  // String-aware balanced extractor — properly skips {/} inside "..." values
  function extractFrom(startChar) {
    const closeChar = startChar === '{' ? '}' : ']';
    const idx = cleaned.indexOf(startChar);
    if (idx === -1) return null;

    let depth = 0, inString = false, escape = false;
    for (let i = idx; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (escape)               { escape = false; continue; }
      if (c === '\\' && inString) { escape = true;  continue; }
      if (c === '"')              { inString = !inString; continue; }
      if (inString)               continue;
      if (c === startChar)        depth++;
      else if (c === closeChar) {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(cleaned.slice(idx, i + 1)); } catch (e) {
          console.error('[parseJSON] JSON.parse failed:', e.message, '| near:', cleaned.slice(Math.max(idx, i - 100), i + 20));
          return null;
        }
        }
      }
    }
    return null;
  }

  // Try whichever bracket appears first in the text
  const objIdx = cleaned.indexOf('{');
  const arrIdx = cleaned.indexOf('[');
  const tryArr = arrIdx !== -1 && (objIdx === -1 || arrIdx < objIdx);
  return tryArr
    ? (extractFrom('[') || extractFrom('{') || null)
    : (extractFrom('{') || extractFrom('[') || null);
}

module.exports = { callAI, callAIMessages, parseJSON, PROVIDER, MODEL };
