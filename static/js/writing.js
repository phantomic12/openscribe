// OpenScribe Writing Tools — rich text editor, word prediction, dictionary/thesaurus, speak-as-typing

const Writing = {
  STATE: {
    drafts: [],
    currentDraft: null,
    wordPredictor: null,
  },

  init() {
    this._initWordPredictor();
    this._loadDrafts();
  },

  // ── Word Prediction ──────────────────────────────────────────
  _initWordPredictor() {
    // Simple n-gram based on common English words
    this.commonWords = [
      'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'I',
      'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
      'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
      'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
      'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
      'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
      'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
      'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
      'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
      'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
    ];
    this._buildNgrams();
  },

  _buildNgrams() {
    this.bigrams = {};
    for (let i = 0; i < this.commonWords.length - 1; i++) {
      const w1 = this.commonWords[i];
      const w2 = this.commonWords[i + 1];
      if (!this.bigrams[w1]) this.bigrams[w1] = [];
      if (!this.bigrams[w1].includes(w2)) this.bigrams[w1].push(w2);
    }
  },

  predict(prefix, maxResults = 5) {
    if (!prefix || prefix.length < 2) return [];
    const lastWord = prefix.split(/\s+/).pop().toLowerCase();
    const matches = [];

    // Exact prefix matches
    for (const word of this.commonWords) {
      if (word.startsWith(lastWord) && word !== lastWord) {
        matches.push({ word, score: 1.0 });
      }
    }

    // Bigram suggestions
    const words = prefix.trim().split(/\s+/);
    if (words.length >= 1) {
      const prev = words[words.length - 1].toLowerCase();
      const nextWords = this.bigrams[prev] || [];
      for (const w of nextWords) {
        if (w.startsWith(lastWord) && !matches.find(m => m.word === w)) {
          matches.push({ word: w, score: 0.8 });
        }
      }
    }

    return matches.sort((a, b) => b.score - a.score).slice(0, maxResults);
  },

  // ── Dictionary / Thesaurus ───────────────────────────────────
  // Basic lookup using free dictionary API
  async lookupWord(word) {
    try {
      const resp = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data || !data.length) return null;

      const entry = data[0];
      return {
        word: entry.word,
        phonetic: entry.phonetic,
        meanings: entry.meanings.map(m => ({
          partOfSpeech: m.partOfSpeech,
          definitions: m.definitions.slice(0, 3).map(d => d.definition),
          synonyms: m.synonyms?.slice(0, 5) || [],
          antonyms: m.antonyms?.slice(0, 5) || [],
        })),
        audioUrl: entry.phonetics?.find(p => p.audio)?.audio || null,
      };
    } catch(e) {
      return null;
    }
  },

  // ── Speak-as-typing ──────────────────────────────────────────
  speakAsTyping(text, mode = 'word') {
    if (!text) return;
    speechSynthesis.cancel();

    let utterance;
    if (mode === 'character') {
      utterance = new SpeechSynthesisUtterance(text.split('').join(' '));
    } else if (mode === 'sentence') {
      utterance = new SpeechSynthesisUtterance(text);
    } else {
      // word mode — speak the last word
      const lastWord = text.split(/\s+/).pop();
      if (!lastWord) return;
      utterance = new SpeechSynthesisUtterance(lastWord);
    }

    const voices = speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang.startsWith('en') && v.localService);
    if (enVoice) utterance.voice = enVoice;
    speechSynthesis.speak(utterance);
  },

  // ── Drafts ───────────────────────────────────────────────────
  async _loadDrafts() {
    this.STATE.drafts = await OSDB.listDrafts();
  },

  async createDraft(type = 'draft', title = '') {
    const draft = {
      id: crypto.randomUUID(),
      type,
      title: title || `Untitled ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await OSDB.saveDraft(draft);
    this.STATE.drafts.unshift(draft);
    this.STATE.currentDraft = draft;
    if (this.onDraftsChanged) this.onDraftsChanged();
    return draft;
  },

  async saveDraftContent(content) {
    if (!this.STATE.currentDraft) return;
    this.STATE.currentDraft.content = content;
    this.STATE.currentDraft.updatedAt = Date.now();
    await OSDB.saveDraft(this.STATE.currentDraft);
  },

  async deleteDraft(id) {
    await OSDB.deleteDraft(id);
    this.STATE.drafts = this.STATE.drafts.filter(d => d.id !== id);
    if (this.STATE.currentDraft?.id === id) this.STATE.currentDraft = null;
    if (this.onDraftsChanged) this.onDraftsChanged();
  },

  setCurrentDraft(draft) {
    this.STATE.currentDraft = draft;
    if (this.onDraftSelected) this.onDraftSelected(draft);
  },

  // ── Spell Check ──────────────────────────────────────────────
  async checkSpelling(text) {
    // Simple client-side spell check using common misspellings
    const commonErrors = {
      'teh': 'the', 'recieve': 'receive', 'adress': 'address',
      'alot': 'a lot', 'definately': 'definitely', 'occured': 'occurred',
      'untill': 'until', 'wierd': 'weird', 'accomodate': 'accommodate',
      'acheive': 'achieve', 'begining': 'beginning', 'beleive': 'believe',
      'calender': 'calendar', 'comittee': 'committee', 'concious': 'conscious',
      'curiousity': 'curiosity', 'dissapear': 'disappear', 'embarass': 'embarrass',
      'enviroment': 'environment', 'familar': 'familiar', 'freind': 'friend',
      'guarentee': 'guarantee', 'harrass': 'harass', 'immediatly': 'immediately',
      'independant': 'independent', 'neccessary': 'necessary', 'occassion': 'occasion',
      'paralel': 'parallel', 'prefered': 'preferred', 'relevent': 'relevant',
      'seperate': 'separate', 'succesful': 'successful', 'tommorrow': 'tomorrow',
      'truely': 'truly', 'unfortunatly': 'unfortunately', 'visable': 'visible',
    };

    const errors = [];
    const words = text.split(/\b/);
    let pos = 0;

    for (const word of words) {
      const lower = word.toLowerCase();
      if (commonErrors[lower]) {
        errors.push({
          word,
          suggestion: commonErrors[lower],
          position: pos,
          message: `Did you mean "${commonErrors[lower]}"?`,
        });
      }
      pos += word.length;
    }

    return errors;
  },

  // ── Templates ────────────────────────────────────────────────
  getTemplates() {
    return [
      { name: 'Essay (5 Paragraph)', type: 'draft', content: 'Introduction:\n\nBody Paragraph 1:\n\nBody Paragraph 2:\n\nBody Paragraph 3:\n\nConclusion:\n' },
      { name: 'Compare & Contrast', type: 'draft', content: 'Topic A:\n\nTopic B:\n\nSimilarities:\n\nDifferences:\n\nConclusion:\n' },
      { name: 'Book Report', type: 'draft', content: 'Title & Author:\n\nSummary:\n\nMain Characters:\n\nThemes:\n\nPersonal Response:\n' },
      { name: 'Research Paper', type: 'draft', content: 'Abstract:\n\nIntroduction:\n\nLiterature Review:\n\nMethodology:\n\nResults:\n\nDiscussion:\n\nConclusion:\n\nReferences:\n' },
      { name: 'Persuasive Essay', type: 'draft', content: 'Position Statement:\n\nArgument 1:\n\nArgument 2:\n\nCounter-argument:\n\nRebuttal:\n\nCall to Action:\n' },
      { name: 'Narrative', type: 'draft', content: 'Setting:\n\nCharacters:\n\nBeginning:\n\nMiddle (Conflict):\n\nEnd (Resolution):\n' },
      { name: 'Lab Report', type: 'draft', content: 'Title:\n\nHypothesis:\n\nMaterials:\n\nProcedure:\n\nData & Observations:\n\nAnalysis:\n\nConclusion:\n' },
      { name: 'Brainstorm Map', type: 'brainstorm', content: '{"nodes":[{"id":"center","text":"Main Topic","x":400,"y":300}],"edges":[]}' },
      { name: 'Outline', type: 'outline', content: 'I. Main Topic\n  A. Subtopic\n    1. Detail\n    2. Detail\n  B. Subtopic\nII. Second Topic\n' },
      { name: 'Column Notes', type: 'column_notes', content: '| Main Ideas | Supporting Details | Questions |\n|---|---|---|\n| | | |\n| | | |\n' },
    ];
  },

  async applyTemplate(templateName) {
    const templates = this.getTemplates();
    const tmpl = templates.find(t => t.name === templateName);
    if (!tmpl) return null;
    return this.createDraft(tmpl.type, templateName).then(draft => {
      draft.content = tmpl.content;
      return OSDB.saveDraft(draft).then(() => {
        if (this.onDraftSelected) this.onDraftSelected(draft);
        return draft;
      });
    });
  },

  // ── Export ──────────────────────────────────────────────────
  exportDraft(format = 'txt') {
    if (!this.STATE.currentDraft) return null;
    const draft = this.STATE.currentDraft;
    const content = `# ${draft.title}\n\n${draft.content}`;

    if (format === 'html') {
      return `<!DOCTYPE html><html><head><title>${draft.title}</title></head><body>${content.replace(/\n/g,'<br>')}</body></html>`;
    }
    return content;
  },

  downloadDraft(format = 'txt') {
    const content = this.exportDraft(format);
    if (!content) return;

    const mime = format === 'html' ? 'text/html' : 'text/plain';
    const ext = format === 'html' ? 'html' : 'txt';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.STATE.currentDraft.title}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

window.Writing = Writing;
