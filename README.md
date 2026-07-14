# OpenScribe

Open-source literacy platform. Upload a document. It reads to you.
Highlight. Take notes. Study. Write. All from your browser.

**Two editions, one project:**

| | **Static Edition** | **Server Edition** |
|---|---|---|
| **Use it** | [Open in browser →](https://phantomic12.github.io/openscribe) | `docker compose up` |
| **Server needed** | None — runs entirely in your browser | Linux server, 4-8GB RAM |
| **Setup** | Zero. Paste text or drop a file. | 5 minutes |
| **Cost** | Free, forever | Free software, you host it |
| **OCR quality** | Good (Tesseract.js in-browser) | Excellent (PaddleOCR + Surya) |
| **TTS voices** | Platform voices (Chrome/Edge: 4-20+ voices) | Piper + Edge TTS + premium APIs |
| **Best for** | Students, individuals, quick reading | Schools, districts, institutions |

## Static Edition — Use It Now

The static edition is a single HTML file with no backend. Everything runs
in your browser — TTS, highlighting, document import, OCR, notes, everything.

- **Open the demo:** `demo/tts-sync-demo.html` — drag it into any browser and press Play
- **Zero data leaves your machine.** Works fully offline after first load.
- **Install as an app** (PWA) on desktop, tablet, phone.
- **Host anywhere:** GitHub Pages, Netlify, a USB stick, or open from disk.

**Current status:** Core TTS synchronized highlighting engine is working.
Remaining phases: document import (PDF/DOCX/EPUB), annotations, writing tools,
OCR, and PWA packaging. See the [build plan](https://github.com/phantomic12/literacy-platform-research/blob/main/PLAN.md#9-browser-only-static-edition--open-anywhere).

## Server Edition — Self-Host for Your School

One Docker command. Full OCR pipeline, multi-user accounts, cloud storage,
premium TTS voices.

```bash
git clone https://github.com/phantomic12/openscribe
cd openscribe
docker compose up -d
```

Open http://localhost:3000. Create an admin account. Upload a PDF.

## Architecture

Both editions share the same React frontend codebase. The server edition
adds a FastAPI backend for better OCR, TTS, and multi-user features.

```
Static Edition                    Server Edition
─────────────────                 ─────────────────
Browser only                      Browser + Server
  Web Speech API (TTS)              Web Speech API (TTS, zero server load)
  PDF.js (document rendering)       PDF.js
  Tesseract.js (OCR)                PaddleOCR + Surya (OCR)
  IndexedDB (storage)               PostgreSQL / SQLite
  Service Worker (offline)          Piper TTS + Edge TTS
  No accounts                       FastAPI (Python 3.12+)
                                    Celery (background OCR jobs)
                                    LanguageTool (grammar)
                                    OIDC/SAML auth
```

## Tech Stack

- **Frontend (both editions):** React 19 + TypeScript + Vite (static) or Next.js 15 (server)
- **UI:** React Aria Components (accessibility-first) + Tailwind CSS
- **Document viewer:** PDF.js + mammoth.js (DOCX) + epub.js
- **Rich text:** TipTap (ProseMirror-based)
- **TTS:** Web Speech API (both) + Piper TTS (server edition)
- **OCR:** Tesseract.js (static) + PaddleOCR/Surya (server)

## Platform Support

| Platform | Static | Server | Notes |
|----------|:------:|:------:|-------|
| Windows (Chrome/Edge) | ⭐⭐⭐⭐⭐ | ✅ | Best overall |
| macOS (Safari/Chrome) | ⭐⭐⭐⭐⭐ | ✅ | Excellent TTS voices |
| Linux (Chrome) | ⭐⭐⭐ | ✅ | Weaker TTS voices, install more |
| ChromeOS | ⭐⭐⭐⭐ | ✅ | Great for schools |
| iPadOS / iOS | ⭐⭐⭐⭐ | ✅ | Safari, installable PWA |
| Android | ⭐⭐⭐⭐ | ✅ | Chrome, installable PWA |

## License

AGPL v3. See [LICENSE](LICENSE).

## Research & Planning

Detailed research (feature catalog, competitive analysis, technology evaluation,
full build plan) lives in the private research repo. If you're contributing
or evaluating the project, that's the document to read.
