// OpenScribe Reader Engine — TTS, document rendering, file import
// Extends the tts-sync-demo.html core with multi-page, PDF/DOCX/EPUB support

const Reader = {
  STATE: {
    words: [],
    currentWordIdx: -1,
    currentChunkStart: -1,
    currentChunkEnd: -1,
    currentPage: 0,
    totalPages: 0,
    chunkSize: 'sentence',
    rate: 1.0,
    playing: false,
    paused: false,
    utterance: null,
    voices: [],
    selectedVoiceURI: null,
    documentId: null,
    pages: [],  // [{text, ocr, imageDataUrl}]
    silent: false,
  },

  // ── Initialization ──────────────────────────────────────────
  async init(containerId) {
    this.container = document.getElementById(containerId);
    this._loadVoices();
    speechSynthesis.onvoiceschanged = () => this._loadVoices();
    this._bindKeys();
  },

  _loadVoices() {
    this.STATE.voices = speechSynthesis.getVoices();
    if (this.STATE.voices.length && !this.STATE.selectedVoiceURI) {
      const en = this.STATE.voices.find(v => v.lang.startsWith('en') && v.localService);
      const def = en || this.STATE.voices[0];
      this.STATE.selectedVoiceURI = def.voiceURI;
    }
    if (this.onVoicesChanged) this.onVoicesChanged(this.STATE.voices);
  },

  // ── Document Loading ────────────────────────────────────────
  async loadDocument(doc) {
    this.STATE.documentId = doc.id;
    this.STATE.pages = doc.pages || [];
    this.STATE.totalPages = this.STATE.pages.length || 1;
    this.STATE.currentPage = 0;

    // Restore reading state
    try {
      const state = await OSDB.getReadingState(doc.id);
      this.STATE.currentPage = state.currentPage || 0;
      this.STATE.currentWordIdx = state.currentWordIndex || 0;
      this.STATE.chunkSize = state.chunkSize || 'sentence';
      this.STATE.rate = state.speed || 1.0;
      if (state.voice) this.STATE.selectedVoiceURI = state.voice;
    } catch(e) {}

    return this._renderCurrentPage();
  },

  async loadText(title, text) {
    const pages = text.split(/\n{3,}/).filter(p => p.trim());
    const doc = {
      id: crypto.randomUUID(),
      title: title || 'Untitled',
      author: '',
      language: 'en',
      sourceFormat: 'txt',
      sourceFilename: '',
      pages: pages.map(t => ({ text: t.trim(), ocr: null, imageDataUrl: null, dimensions: { width: 800, height: 600 } })),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    if (pages.length === 0) doc.pages = [{ text: text, ocr: null, imageDataUrl: null, dimensions: { width: 800, height: 600 } }];
    await OSDB.saveDocument(doc);
    return this.loadDocument(doc);
  },

  async loadFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const title = file.name.replace(/\.[^.]+$/, '');

    if (ext === 'pdf') return this._loadPDF(file, title);
    if (ext === 'docx') return this._loadDOCX(file, title);
    if (ext === 'epub') return this._loadEPUB(file, title);
    if (['png','jpg','jpeg','tiff','bmp'].includes(ext)) return this._loadImage(file, title);
    // txt, rtf, html, etc.
    const text = await file.text();
    return this.loadText(title, text);
  },

  async _loadPDF(file, title) {
    if (typeof pdfjsLib === 'undefined') {
      // Load PDF.js dynamically
      await this._loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.min.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.worker.min.mjs';
    }
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pages = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const text = textContent.items.map(item => item.str).join(' ');

      // Render page to canvas for display
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      pages.push({
        text,
        ocr: null,
        imageDataUrl: canvas.toDataURL('image/png'),
        dimensions: { width: viewport.width, height: viewport.height }
      });

      if (this.onProgress) this.onProgress(i, pdf.numPages);
    }

    const doc = {
      id: crypto.randomUUID(),
      title,
      author: '',
      language: 'en',
      sourceFormat: 'pdf',
      sourceFilename: file.name,
      pages,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await OSDB.saveDocument(doc);
    return this.loadDocument(doc);
  },

  async _loadDOCX(file, title) {
    if (typeof mammoth === 'undefined') {
      await this._loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js');
    }
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return this.loadText(title, result.value);
  },

  async _loadEPUB(file, title) {
    // EPUB: extract text using basic zip parsing approach
    // For now, use a simple approach: read as text and extract content
    const buffer = await file.arrayBuffer();
    // Simple EPUB text extraction — falls back to treating it as raw
    const decoder = new TextDecoder('utf-8');
    let text = decoder.decode(buffer);
    // Strip HTML/XML tags
    text = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length < 100) throw new Error('EPUB parsing requires epub.js library — paste text directly for now');
    return this.loadText(title, text);
  },

  async _loadImage(file, title) {
    // Try OCR if Tesseract is available
    const dataUrl = await this._readFileAsDataURL(file);
    let text = '';

    if (typeof Tesseract !== 'undefined') {
      try {
        if (this.onProgress) this.onProgress(0, 1, 'Running OCR...');
        const result = await Tesseract.recognize(dataUrl, 'eng', {
          logger: m => { if (m.status === 'recognizing text' && this.onProgress) this.onProgress(Math.round(m.progress * 100), 100, 'OCR...'); }
        });
        text = result.data.text;
      } catch(e) {
        text = '[OCR failed — image loaded as visual only]';
      }
    } else {
      text = '[Install Tesseract.js for OCR support]';
    }

    const doc = {
      id: crypto.randomUUID(),
      title,
      author: '',
      language: 'en',
      sourceFormat: 'image',
      sourceFilename: file.name,
      pages: [{ text, ocr: null, imageDataUrl: dataUrl, dimensions: { width: 800, height: 600 } }],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await OSDB.saveDocument(doc);
    return this.loadDocument(doc);
  },

  // ── Page Rendering ──────────────────────────────────────────
  async _renderCurrentPage() {
    const pages = this.STATE.pages;
    const idx = this.STATE.currentPage;
    if (!pages.length) return;

    const page = pages[idx];
    this.STATE.words = [];
    const container = this.container;
    if (!container) return;

    let html = '';

    // Show page image if available
    if (page.imageDataUrl && page.imageDataUrl.startsWith('data:')) {
      html += `<div class="page-image"><img src="${page.imageDataUrl}" style="max-width:100%;border-radius:8px;" alt="Page ${idx+1}"></div>`;
    }

    html += `<div class="doc-text" id="docText">`;

    const text = page.text || '';
    const paragraphs = text.split(/\n+/);
    paragraphs.forEach((para, pi) => {
      if (pi > 0) html += '<br>';
      const tokens = para.match(/\S+/g) || [];
      tokens.forEach((token, ti) => {
        const charStart = this.STATE.words.length;
        html += `<span class="word" data-idx="${charStart}">${this._escapeHtml(token)}</span>`;
        this.STATE.words.push({
          text: token,
          el: null,
          startChar: charStart,
          endChar: charStart + token.length,
        });
        if (ti < tokens.length - 1) html += ' ';
      });
    });

    html += '</div>';
    container.innerHTML = html;

    // Wire up word click handlers
    container.querySelectorAll('.word').forEach(el => {
      const idx = parseInt(el.dataset.idx);
      this.STATE.words[idx].el = el;
      el.addEventListener('click', () => this.clickWord(idx));
    });

    // Restore highlights from annotations
    await this._renderAnnotations();

    this._updatePageUI();
    if (this.onPageChange) this.onPageChange(idx);
    return this.STATE.words.length;
  },

  async _renderAnnotations() {
    if (!this.STATE.documentId) return;
    try {
      const anns = await OSDB.getAnnotations(this.STATE.documentId, this.STATE.currentPage);
      for (const ann of anns) {
        if (ann.type === 'highlight' && ann.wordRange) {
          for (let i = ann.wordRange.start; i <= ann.wordRange.end && i < this.STATE.words.length; i++) {
            const el = this.STATE.words[i].el;
            if (el) {
              el.style.backgroundColor = ann.color || '#ffeb3b';
              el.dataset.annotationId = ann.id;
            }
          }
        }
      }
    } catch(e) {}
  },

  // ── TTS Engine ──────────────────────────────────────────────
  getSelectedVoice() {
    return this.STATE.voices.find(v => v.voiceURI === this.STATE.selectedVoiceURI) || null;
  },

  getChunkBounds(wordIdx) {
    const size = this.STATE.chunkSize;
    const words = this.STATE.words;
    if (!words.length) return { start: 0, end: 0 };
    if (size === 'word') return { start: wordIdx, end: wordIdx };

    if (size === 'sentence') {
      let start = wordIdx;
      while (start > 0) {
        const prev = words[start - 1].text;
        if (/[.!?]$/.test(prev)) break;
        if (words[start].startChar - words[start - 1].endChar > 2) break;
        start--;
      }
      let end = wordIdx;
      while (end < words.length - 1) {
        if (/[.!?]$/.test(words[end].text)) { end++; break; }
        if (end + 1 < words.length && words[end + 1].startChar - words[end].endChar > 2) { end++; break; }
        end++;
      }
      if (end === words.length - 1) end = words.length;
      return { start, end };
    }

    // Paragraph
    let start = wordIdx;
    while (start > 0) {
      if (words[start].startChar - words[start - 1].endChar > 2) break;
      start--;
    }
    let end = wordIdx;
    while (end < words.length - 1) {
      end++;
      if (words[end].startChar - words[end - 1].endChar > 2) break;
    }
    if (end === words.length - 1) end = words.length;
    return { start, end };
  },

  clearHighlights() {
    this.STATE.words.forEach(w => {
      if (w.el) { w.el.classList.remove('chunk-active', 'speaking'); }
    });
  },

  highlightChunk(start, end) {
    if (this.STATE.currentChunkStart >= 0) {
      for (let i = this.STATE.currentChunkStart; i < this.STATE.currentChunkEnd && i < this.STATE.words.length; i++) {
        if (this.STATE.words[i].el) this.STATE.words[i].el.classList.remove('chunk-active');
      }
    }
    for (let i = start; i < end && i < this.STATE.words.length; i++) {
      if (this.STATE.words[i].el) this.STATE.words[i].el.classList.add('chunk-active');
    }
    this.STATE.currentChunkStart = start;
    this.STATE.currentChunkEnd = end;
  },

  highlightWord(wordIdx) {
    if (this.STATE.currentWordIdx >= 0 && this.STATE.currentWordIdx < this.STATE.words.length) {
      const el = this.STATE.words[this.STATE.currentWordIdx].el;
      if (el) el.classList.remove('speaking');
    }
    if (wordIdx >= 0 && wordIdx < this.STATE.words.length) {
      const el = this.STATE.words[wordIdx].el;
      if (el) {
        el.classList.add('speaking');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    this.STATE.currentWordIdx = wordIdx;
    if (this.onWordChange) this.onWordChange(wordIdx);
    this._saveState();
  },

  speakFrom(wordIdx) {
    if (!this.STATE.words.length) return;
    this.stop();

    const voice = this.getSelectedVoice();
    const chunk = this.getChunkBounds(wordIdx);
    const chunkWords = this.STATE.words.slice(chunk.start, chunk.end);
    const text = chunkWords.map(w => w.text).join(' ');

    if (this.STATE.silent) {
      // Silent mode: highlight without audio
      this.highlightChunk(chunk.start, chunk.end);
      this.highlightWord(wordIdx);
      this._silentAdvance(chunk, wordIdx);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.rate = this.STATE.rate;
    utterance.volume = 1;
    utterance.lang = voice?.lang || 'en-US';

    this.highlightChunk(chunk.start, chunk.end);
    this.highlightWord(wordIdx);

    let lastWordInChunk = wordIdx;
    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        let charPos = 0;
        for (let i = chunk.start; i < chunk.end; i++) {
          const w = this.STATE.words[i];
          const nextPos = charPos + w.text.length;
          if (event.charIndex >= charPos && event.charIndex < nextPos + 1) {
            this.highlightWord(i);
            lastWordInChunk = i;
            break;
          }
          charPos = nextPos + 1;
        }
      }
    };

    utterance.onend = () => {
      if (chunk.end < this.STATE.words.length) {
        this.STATE.utterance = null;
        this.STATE.playing = true;
        this.STATE.paused = false;
        this.speakFrom(chunk.end);
      } else {
        // End of page — advance to next page
        this._nextPage();
      }
    };

    utterance.onerror = (e) => {
      if (e.error === 'canceled' || e.error === 'interrupted') return;
      this._done();
    };

    this.STATE.utterance = utterance;
    this.STATE.playing = true;
    this.STATE.paused = false;
    speechSynthesis.speak(utterance);
    this._updateUI(true);
  },

  _silentAdvance(chunk, wordIdx) {
    // Advance through words silently at configurable WPM
    const wpm = this.STATE.rate * 150; // base WPM
    const msPerWord = 60000 / wpm;
    this._silentTimer = setInterval(() => {
      wordIdx++;
      if (wordIdx >= chunk.end) {
        clearInterval(this._silentTimer);
        if (chunk.end < this.STATE.words.length) {
          const nextChunk = this.getChunkBounds(chunk.end);
          this.highlightChunk(nextChunk.start, nextChunk.end);
          this._silentAdvance(nextChunk, nextChunk.start);
        } else {
          this._nextPage();
        }
        return;
      }
      this.highlightWord(wordIdx);
    }, msPerWord);
  },

  // ── Controls ────────────────────────────────────────────────
  play() {
    if (this.STATE.paused && this.STATE.utterance) {
      speechSynthesis.resume();
      this.STATE.paused = false;
      this.STATE.playing = true;
      this._updateUI(true);
      return;
    }
    const startIdx = this.STATE.currentWordIdx >= 0 ? this.STATE.currentWordIdx : 0;
    this.speakFrom(startIdx);
  },

  pause() {
    if (this.STATE.playing && !this.STATE.paused) {
      if (this.STATE.silent) {
        clearInterval(this._silentTimer);
      } else {
        speechSynthesis.pause();
      }
      this.STATE.paused = true;
      this._updateUI(false);
    }
  },

  stop() {
    if (this._silentTimer) clearInterval(this._silentTimer);
    speechSynthesis.cancel();
    this.STATE.utterance = null;
    this._done();
  },

  skip(dir) {
    const chunk = this.getChunkBounds(this.STATE.currentWordIdx >= 0 ? this.STATE.currentWordIdx : 0);
    let target;
    if (dir < 0) {
      target = Math.max(0, chunk.start - 1);
      const prevChunk = this.getChunkBounds(target);
      target = prevChunk.start;
    } else {
      target = chunk.end;
    }
    speechSynthesis.cancel();
    if (this._silentTimer) clearInterval(this._silentTimer);
    this.STATE.utterance = null;
    if (target < this.STATE.words.length) {
      this.clearHighlights();
      this.speakFrom(target);
    } else {
      this._nextPage();
    }
  },

  clickWord(wordIdx) {
    this.stop();
    this.speakFrom(wordIdx);
  },

  setChunkSize(size) {
    this.STATE.chunkSize = size;
    if (this.STATE.playing && this.STATE.currentWordIdx >= 0) {
      const idx = this.STATE.currentWordIdx;
      speechSynthesis.cancel();
      this.STATE.utterance = null;
      this.clearHighlights();
      this.speakFrom(idx);
    }
  },

  setVoice(uri) {
    this.STATE.selectedVoiceURI = uri;
    if (this.STATE.playing && this.STATE.currentWordIdx >= 0) {
      const idx = this.STATE.currentWordIdx;
      speechSynthesis.cancel();
      this.STATE.utterance = null;
      this.clearHighlights();
      this.speakFrom(idx);
    }
  },

  setSpeed(rate) {
    this.STATE.rate = parseFloat(rate);
    if (this.STATE.utterance && this.STATE.playing) {
      const idx = this.STATE.currentWordIdx >= 0 ? this.STATE.currentWordIdx : 0;
      speechSynthesis.cancel();
      this.STATE.utterance = null;
      this.clearHighlights();
      this.speakFrom(idx);
    }
  },

  setSilentMode(silent) {
    this.STATE.silent = silent;
    if (this.STATE.playing) {
      const idx = this.STATE.currentWordIdx >= 0 ? this.STATE.currentWordIdx : 0;
      this.stop();
      this.speakFrom(idx);
    }
  },

  // ── Page Navigation ──────────────────────────────────────────
  nextPage() { this._nextPage(); },
  prevPage() {
    if (this.STATE.currentPage > 0) {
      this.stop();
      this.STATE.currentPage--;
      this.STATE.currentWordIdx = 0;
      this._renderCurrentPage();
    }
  },

  _nextPage() {
    if (this.STATE.currentPage < this.STATE.totalPages - 1) {
      this.stop();
      this.STATE.currentPage++;
      this.STATE.currentWordIdx = 0;
      this._renderCurrentPage().then(() => {
        if (this.STATE.playing) this.speakFrom(0);
      });
    } else {
      this._done();
    }
  },

  goToPage(n) {
    if (n >= 0 && n < this.STATE.totalPages) {
      this.stop();
      this.STATE.currentPage = n;
      this.STATE.currentWordIdx = 0;
      this._renderCurrentPage();
    }
  },

  // ── Internal ─────────────────────────────────────────────────
  _done() {
    this.STATE.playing = false;
    this.STATE.paused = false;
    this.STATE.utterance = null;
    if (this._silentTimer) clearInterval(this._silentTimer);
    this.clearHighlights();
    this._updateUI(false);
  },

  _updateUI(playing) {
    if (this.onStateChange) this.onStateChange(playing, this.STATE.paused);
  },

  _updatePageUI() {
    if (this.onPageChange) this.onPageChange(this.STATE.currentPage);
  },

  async _saveState() {
    if (!this.STATE.documentId) return;
    try {
      await OSDB.saveReadingState({
        documentId: this.STATE.documentId,
        currentPage: this.STATE.currentPage,
        currentWordIndex: this.STATE.currentWordIdx,
        voice: this.STATE.selectedVoiceURI,
        speed: this.STATE.rate,
        chunkSize: this.STATE.chunkSize,
      });
    } catch(e) {}
  },

  _bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.isContentEditable) return;
      switch (e.key) {
        case ' ': e.preventDefault(); if (this.STATE.playing && !this.STATE.paused) this.pause(); else this.play(); break;
        case 'ArrowLeft': e.preventDefault(); this.skip(-1); break;
        case 'ArrowRight': e.preventDefault(); this.skip(1); break;
        case 'Escape': e.preventDefault(); this.stop(); break;
      }
    });
  },

  // ── Utilities ────────────────────────────────────────────────
  _escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  _readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  },
};

window.Reader = Reader;
