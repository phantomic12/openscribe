# OpenScribe

Self-hosted literacy platform. Upload a document. It reads to you.
Highlight. Take notes. Study. Write. All from your browser.

## What It Does

- **Read aloud** — text-to-speech with synchronized word and sentence highlighting
- **OCR** — scan or upload any document, it becomes readable text
- **Study** — highlight, annotate, extract to study guides and column notes
- **Write** — talking word processor, mind maps, outlines, word prediction
- **Test** — built-in assessment tools with timed exam mode
- **All platforms** — browser-based. Windows, Mac, Linux, ChromeOS, iPad.
- **Self-hosted** — one Docker command. Student data stays on your server.

## Quick Start

```bash
git clone https://github.com/phantomic12/openscribe
cd openscribe
docker compose up -d
```

Open http://localhost:3000. Create an admin account. Upload a PDF.

## Architecture

```
Browser (Next.js + React)  ←→  Server (FastAPI + Python)
     Web Speech API             PaddleOCR + Surya
     PDF.js                     Piper TTS + Edge TTS
     TipTap editor              LanguageTool
     IndexedDB                  PostgreSQL / SQLite
```

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend:** FastAPI (Python 3.12+), Celery for background OCR jobs
- **Database:** PostgreSQL (multi-user) or SQLite (single-user)
- **TTS:** Web Speech API in-browser (zero server load), Piper for offline high quality
- **OCR:** PaddleOCR + Surya for layout analysis, Tesseract as CPU fallback

## Requirements

- Docker and Docker Compose
- 4GB RAM (8GB recommended for OCR)
- GPU optional (accelerates OCR ~3x)

## License

AGPL v3. See [LICENSE](LICENSE).
