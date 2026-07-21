// OpenScribe Annotation Tools — highlighting, notes, bookmarks, extraction

const Annotations = {
  currentColor: '#ffeb3b',
  currentLabel: 'Main Idea',
  colors: [
    { color: '#ffeb3b', name: 'Yellow', label: 'Main Idea' },
    { color: '#4ade80', name: 'Green', label: 'Evidence' },
    { color: '#60a5fa', name: 'Blue', label: 'Question' },
    { color: '#f472b6', name: 'Pink', label: 'Detail' },
    { color: '#fb923c', name: 'Orange', label: 'Vocab' },
    { color: '#c084fc', name: 'Purple', label: 'Important' },
  ],
  noteColors: ['#fef3c7', '#d1fae5', '#dbeafe', '#fce7f3', '#ffedd5', '#ede9fe'],
  selectionMode: false,
  selectionRange: null,

  init(readerInstance) {
    this.reader = readerInstance;

    // Listen for text selection
    document.addEventListener('mouseup', () => this._onTextSelection());
    document.addEventListener('keyup', (e) => {
      if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        setTimeout(() => this._onTextSelection(), 50);
      }
    });
  },

  setColor(colorHex, label) {
    this.currentColor = colorHex;
    this.currentLabel = label || '';
  },

  toggleSelectionMode() {
    this.selectionMode = !this.selectionMode;
    return this.selectionMode;
  },

  _onTextSelection() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.toString().trim()) return;

    const range = sel.getRangeAt(0);
    if (!range) return;

    // Find which word spans are in the selection
    const container = document.getElementById('docText');
    if (!container || !container.contains(range.commonAncestorContainer)) return;

    // Get all word spans in selection
    const wordEls = container.querySelectorAll('.word');
    const selectedWords = [];
    wordEls.forEach(el => {
      if (sel.containsNode(el, true)) {
        selectedWords.push(parseInt(el.dataset.idx));
      }
    });

    if (selectedWords.length > 0) {
      this.selectionRange = {
        start: Math.min(...selectedWords),
        end: Math.max(...selectedWords)
      };
    }
  },

  async highlightSelection() {
    if (!this.selectionRange) return null;
    const { start, end } = this.selectionRange;
    return this.addHighlight(start, end, this.currentColor, this.currentLabel);
  },

  async addHighlight(startWordIdx, endWordIdx, color, label) {
    const words = this.reader.STATE.words;
    if (startWordIdx >= words.length) return null;

    // Apply visual highlight
    for (let i = startWordIdx; i <= endWordIdx && i < words.length; i++) {
      const el = words[i].el;
      if (el) {
        el.style.backgroundColor = color;
        el.style.borderRadius = '2px';
      }
    }

    // Save to DB
    const ann = await OSDB.saveAnnotation({
      id: crypto.randomUUID(),
      documentId: this.reader.STATE.documentId,
      pageIndex: this.reader.STATE.currentPage,
      type: 'highlight',
      color,
      label,
      wordRange: { start: startWordIdx, end: endWordIdx },
      text: words.slice(startWordIdx, endWordIdx + 1).map(w => w.text).join(' '),
      createdAt: Date.now()
    });

    this.selectionRange = null;
    if (this.onAnnotationAdded) this.onAnnotationAdded(ann);
    return ann;
  },

  async addNote(x, y, noteText, noteType = 'sticky_note') {
    const ann = await OSDB.saveAnnotation({
      id: crypto.randomUUID(),
      documentId: this.reader.STATE.documentId,
      pageIndex: this.reader.STATE.currentPage,
      type: noteType,
      position: { x, y },
      noteText,
      color: this.noteColors[Math.floor(Math.random() * this.noteColors.length)],
      createdAt: Date.now()
    });

    if (this.onAnnotationAdded) this.onAnnotationAdded(ann);
    return ann;
  },

  async addBookmark(wordIdx) {
    const words = this.reader.STATE.words;
    const text = wordIdx < words.length ? words[wordIdx].text : '';

    const ann = await OSDB.saveAnnotation({
      id: crypto.randomUUID(),
      documentId: this.reader.STATE.documentId,
      pageIndex: this.reader.STATE.currentPage,
      type: 'bookmark',
      wordIndex: wordIdx,
      noteText: text,
      createdAt: Date.now()
    });

    if (this.onAnnotationAdded) this.onAnnotationAdded(ann);
    return ann;
  },

  async addBubbleNote(wordIdx, questionType, question, answer, options) {
    const words = this.reader.STATE.words;
    const text = wordIdx < words.length ? words[wordIdx].text : '';

    const ann = await OSDB.saveAnnotation({
      id: crypto.randomUUID(),
      documentId: this.reader.STATE.documentId,
      pageIndex: this.reader.STATE.currentPage,
      type: 'bubble_note',
      wordIndex: wordIdx,
      noteText: question,
      questionType,
      answer,
      options: options || [],
      createdAt: Date.now()
    });

    if (this.onAnnotationAdded) this.onAnnotationAdded(ann);
    return ann;
  },

  async removeAnnotation(annotationId) {
    await OSDB.deleteAnnotation(annotationId);
    // Re-render page to clear visual highlights
    await this.reader._renderCurrentPage();
    if (this.onAnnotationRemoved) this.onAnnotationRemoved(annotationId);
  },

  async eraseHighlightsOnPage() {
    await OSDB.deleteAnnotationsForDocument(this.reader.STATE.documentId);
    await this.reader._renderCurrentPage();
    if (this.onAnnotationsCleared) this.onAnnotationsCleared();
  },

  // ── Extraction ───────────────────────────────────────────────
  async extractStudyGuide() {
    const anns = await OSDB.getAnnotations(this.reader.STATE.documentId);
    const highlights = anns.filter(a => a.type === 'highlight');

    if (!highlights.length) return { title: 'Study Guide', content: 'No highlights found.' };

    // Group by label/color
    const grouped = {};
    for (const h of highlights) {
      const label = h.label || h.color;
      if (!grouped[label]) grouped[label] = [];
      grouped[label].push(h.text);
    }

    let content = '';
    for (const [label, texts] of Object.entries(grouped)) {
      content += `\n## ${label}\n\n`;
      texts.forEach((t, i) => {
        content += `${i + 1}. ${t}\n`;
      });
    }

    return { title: 'Study Guide', content: content.trim() };
  },

  async extractColumnNotes() {
    const anns = await OSDB.getAnnotations(this.reader.STATE.documentId);
    const highlights = anns.filter(a => a.type === 'highlight');

    if (!highlights.length) return { title: 'Column Notes', content: 'No highlights found.' };

    // 3-column: Main Idea | Evidence | Other
    const cols = { 'Main Idea': [], 'Evidence': [], 'Other': [] };
    for (const h of highlights) {
      const label = h.label || 'Other';
      const bucket = cols[label] ? label : 'Other';
      cols[bucket].push(h.text);
    }

    const maxLen = Math.max(...Object.values(cols).map(a => a.length));
    let content = '| Main Idea | Evidence | Other |\n|---|---|---|\n';
    for (let i = 0; i < maxLen; i++) {
      content += `| ${cols['Main Idea'][i] || ''} | ${cols['Evidence'][i] || ''} | ${cols['Other'][i] || ''} |\n`;
    }

    return { title: 'Column Notes', content };
  },

  async extractVocabularyGuide() {
    const anns = await OSDB.getAnnotations(this.reader.STATE.documentId);
    const vocab = anns.filter(a => a.type === 'highlight' && a.label === 'Vocab');

    if (!vocab.length) return { title: 'Vocabulary Guide', content: 'No vocabulary highlights found. Use the Vocab label when highlighting.' };

    let content = '| Word | Definition |\n|---|---|\n';
    for (const v of vocab) {
      content += `| ${v.text} | _look up definition_ |\n`;
    }

    return { title: 'Vocabulary Guide', content };
  },

  async listBookmarks() {
    const anns = await OSDB.getAnnotations(this.reader.STATE.documentId);
    return anns.filter(a => a.type === 'bookmark');
  },

  async listBubbleNotes() {
    const anns = await OSDB.getAnnotations(this.reader.STATE.documentId);
    return anns.filter(a => a.type === 'bubble_note');
  }
};

window.Annotations = Annotations;
