# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Frontend only on http://localhost:3000
npm run server       # Backend only on http://localhost:3003
npm run dev:all      # Both simultaneously (frontend + backend)

# Production
npm run build        # Vite build to /dist
npm run preview      # Preview production build

# Type checking (no test runner configured)
npm run lint         # TypeScript check via tsc --noEmit

# Clean
npm run clean        # Remove /dist
```

## Architecture

**Multi-port stack:**
- `localhost:3000` — Vite dev server (React frontend)
- `localhost:3003` — Express backend (`src/server/index.cjs`)
- `localhost:18789` — OpenClaw AI server (MiniMax-M2.5, must be running locally)

Vite proxies `/v1`, `/api`, `/hooks`, `/health` to port 3003. The backend in turn proxies AI requests to port 18789.

There is also a **separate backend** at `backend/server.js` — a Discord.js bot server with its own `package.json`, independent from the main app.

## Key Flows

**CV Analysis pipeline:**
`CVUpload.tsx` → POST `/api/*` → `src/server/index.cjs` → OpenClaw (localhost:18789) → structured JSON response

**LinkedIn Analysis:**
`LinkedInAnalyzer.tsx` → POST `/api/linkedin-scrape` → Jina AI (https://r.jina.ai/) → profile markdown → AI analysis

**Auth:**
Wallet connection via wagmi + Web3Modal. Auth token stored in `localStorage` as `auth_token`. `ProtectedRoute.tsx` guards routes — bypass with `VITE_WALLET_BYPASS=true` in `.env`.

## Environment Variables

```
VITE_OPENCLAW_URL=http://localhost:18789
VITE_OPENCLAW_TOKEN=<token>
VITE_WALLETCONNECT_PROJECT_ID=<your_id>
VITE_WALLET_BYPASS=true          # Skips wallet auth (dev only)
VITE_API_BASE_URL=http://localhost:3000/api
GEMINI_API_KEY=<key>             # For Google Gemini (build-time)
```

## Frontend Structure

```
src/
├── App.tsx              # Root: WagmiProvider, QueryClient, AuthContext, router
├── store/AuthContext.tsx # Auth token context (localStorage)
├── web3/config.ts       # wagmi chains (mainnet + Sepolia), Web3Modal setup
├── services/
│   ├── apiClient.ts     # Axios instance with Bearer token interceptor
│   └── openclaw.js      # CV scoring, skill extraction, role suggestions logic
├── pages/
│   ├── Landing.tsx      # Public; hero + wallet connect button
│   ├── Dashboard.tsx    # Skill stats, quick actions
│   ├── CVUpload.tsx     # Main feature: file upload + full AI analysis UI
│   ├── LinkedInAnalyzer.tsx  # LinkedIn URL scraping + profile analysis
│   ├── Validation.tsx   # Skill quiz, scoring, on-chain badge claims
│   └── Opportunities.tsx # Job board with match scores
└── components/
    ├── Navbar.tsx        # Wallet display, nav links
    └── ProtectedRoute.tsx
```

Pages under `ProtectedRoute` require wallet connection (or `VITE_WALLET_BYPASS=true`).

## Backend (`src/server/index.cjs`)

Express server on port 3003. Key endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/chat/completions` | POST | Proxies to OpenClaw AI |
| `/api/linkedin-scrape` | POST | Fetches LinkedIn via Jina AI |
| `/api/analyze-profile` | POST | AI profile analysis |
| `/health`, `/api/health` | GET | Health checks |

The server extracts JSON from AI responses with regex fallbacks when the model returns freetext.

## AI Response Shape (CV Analysis)

The OpenClaw API is expected to return (or be parsed into):

```javascript
{
  name, email, phone, location, linkedin, github, portfolio,
  current_position, company, skills: [], experience_years,
  certifications: [], languages: [], education: [], summary,
  web3_relevance: 'high|medium|low',
  score: 0-100, ats_score: 0-100,
  dimensions: { ats, enfoque, impacto, claridad, contacto, legibilidad },
  suggested_roles: [{ title, match_percentage }],
  strengths: [], improvements: [],
  stats: { word_count, reading_time_minutes, spelling_score }
}
```

## Path Alias

`@/*` maps to the project root (not `src/`). Configured in both `vite.config.ts` and `tsconfig.json`.

## Document Processing

`CVUpload.tsx` supports PDF, DOCX, TXT, MD. Processing strategies in priority order:
1. `pdf-parse` / `mammoth` for text extraction
2. `pdfjs-dist` for rendering
3. Tesseract.js OCR as fallback (requires `eng.traineddata` / `spa.traineddata` at project root)
