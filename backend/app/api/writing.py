"""Writing tools: word processor, brainstorm, outline, templates, check, predict."""

import json
import re
import subprocess
import tempfile
import os
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_session
from app.models.models import Draft

router = APIRouter()


# ── Pydantic models ──────────────────────────────────────────────

class DraftCreate(BaseModel):
    title: str = "Untitled"
    content: str = ""
    type: str = "draft"


class BrainstormCreate(BaseModel):
    title: str = "Brainstorm"
    topic: str = ""
    nodes: str = "[]"  # JSON array of {id, label, parent, color}


class OutlineCreate(BaseModel):
    title: str = "Outline"
    content: str = ""  # JSON hierarchical structure


class TextCheckRequest(BaseModel):
    text: str


# ── Templates ────────────────────────────────────────────────────

ACADEMIC_TEMPLATES = [
    {
        "id": "five_paragraph_essay",
        "name": "Five-Paragraph Essay",
        "description": "Classic structure: intro, 3 body paragraphs, conclusion",
        "structure": {
            "sections": [
                {"name": "Introduction", "prompt": "Hook + thesis statement"},
                {"name": "Body Paragraph 1", "prompt": "First main point with evidence"},
                {"name": "Body Paragraph 2", "prompt": "Second main point with evidence"},
                {"name": "Body Paragraph 3", "prompt": "Third main point with evidence"},
                {"name": "Conclusion", "prompt": "Restate thesis, synthesize points"},
            ]
        },
    },
    {
        "id": "argumentative_essay",
        "name": "Argumentative Essay",
        "description": "Take a position and defend it with evidence",
        "structure": {
            "sections": [
                {"name": "Introduction", "prompt": "Present the issue and your claim"},
                {"name": "Background", "prompt": "Context and key terms"},
                {"name": "Arguments For", "prompt": "Evidence supporting your position"},
                {"name": "Counterarguments", "prompt": "Address opposing views + rebuttal"},
                {"name": "Conclusion", "prompt": "Reinforce your claim, call to action"},
            ]
        },
    },
    {
        "id": "compare_contrast",
        "name": "Compare & Contrast",
        "description": "Analyze similarities and differences between subjects",
        "structure": {
            "sections": [
                {"name": "Introduction", "prompt": "Introduce subjects A and B"},
                {"name": "Similarities", "prompt": "What do they share?"},
                {"name": "Differences", "prompt": "How do they diverge?"},
                {"name": "Analysis", "prompt": "What do the similarities/differences mean?"},
                {"name": "Conclusion", "prompt": "Summary and significance"},
            ]
        },
    },
    {
        "id": "research_paper",
        "name": "Research Paper",
        "description": "In-depth investigation of a topic with sources",
        "structure": {
            "sections": [
                {"name": "Abstract", "prompt": "Brief summary of the paper"},
                {"name": "Introduction", "prompt": "Research question and thesis"},
                {"name": "Literature Review", "prompt": "What others have found"},
                {"name": "Methodology", "prompt": "How you conducted the research"},
                {"name": "Results", "prompt": "What you discovered"},
                {"name": "Discussion", "prompt": "Interpret your results"},
                {"name": "Conclusion", "prompt": "Summary and future directions"},
            ]
        },
    },
    {
        "id": "lab_report",
        "name": "Lab Report",
        "description": "Scientific experiment documentation",
        "structure": {
            "sections": [
                {"name": "Title", "prompt": "Descriptive title of the experiment"},
                {"name": "Purpose/Hypothesis", "prompt": "What you tested and predicted"},
                {"name": "Materials", "prompt": "Equipment and supplies used"},
                {"name": "Procedure", "prompt": "Step-by-step method"},
                {"name": "Data/Observations", "prompt": "Raw data, tables, observations"},
                {"name": "Analysis", "prompt": "Calculations, graphs, patterns"},
                {"name": "Conclusion", "prompt": "Was hypothesis supported? Sources of error"},
            ]
        },
    },
    {
        "id": "literary_analysis",
        "name": "Literary Analysis",
        "description": "Analyze themes, characters, and devices in a text",
        "structure": {
            "sections": [
                {"name": "Introduction", "prompt": "Title, author, and your thesis about the work"},
                {"name": "Summary", "prompt": "Brief plot/context overview"},
                {"name": "Analysis - Theme", "prompt": "Discuss a central theme with quotes"},
                {"name": "Analysis - Characters", "prompt": "Character development and motivation"},
                {"name": "Analysis - Devices", "prompt": "Literary devices and their effect"},
                {"name": "Conclusion", "prompt": "Synthesize analysis, broader significance"},
            ]
        },
    },
    {
        "id": "book_report",
        "name": "Book Report",
        "description": "Summary and personal response to a book",
        "structure": {
            "sections": [
                {"name": "Introduction", "prompt": "Book title, author, genre"},
                {"name": "Summary", "prompt": "Plot overview without spoilers"},
                {"name": "Character Analysis", "prompt": "Main characters and their roles"},
                {"name": "Themes", "prompt": "Major themes explored"},
                {"name": "Personal Response", "prompt": "Your thoughts, what you learned"},
                {"name": "Recommendation", "prompt": "Who would enjoy this book?"},
            ]
        },
    },
    {
        "id": "persuasive_speech",
        "name": "Persuasive Speech",
        "description": "Convince an audience to adopt your viewpoint",
        "structure": {
            "sections": [
                {"name": "Opening", "prompt": "Attention grabber + your position"},
                {"name": "Problem", "prompt": "Define the issue at stake"},
                {"name": "Solution", "prompt": "Your proposed solution or action"},
                {"name": "Benefits", "prompt": "Why your solution works"},
                {"name": "Call to Action", "prompt": "What the audience should do now"},
            ]
        },
    },
]


# ── Word prediction: common English n-grams ─────────────────────

# Top 200 most common English words for basic prediction
COMMON_WORDS = [
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "I",
    "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
    "this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
    "or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
    "so", "up", "out", "if", "about", "who", "get", "which", "go", "me",
    "when", "make", "can", "like", "time", "no", "just", "him", "know", "take",
    "people", "into", "year", "your", "good", "some", "could", "them", "see", "other",
    "than", "then", "now", "look", "only", "come", "its", "over", "think", "also",
    "back", "after", "use", "two", "how", "our", "work", "first", "well", "way",
    "even", "new", "want", "because", "any", "these", "give", "day", "most", "us",
    "great", "between", "need", "large", "often", "hand", "high", "place", "small", "different",
    "important", "long", "world", "still", "own", "found", "here", "many", "each", "same",
    "last", "thought", "might", "came", "made", "school", "every", "another", "much", "really",
    "always", "never", "something", "began", "asked", "told", "seemed", "during", "without", "enough",
    "began", "number", "state", "part", "little", "while", "three", "before", "through", "right",
    "family", "around", "found", "house", "head", "left", "life", "children", "country", "later",
    "together", "young", "before", "example", "however", "although", "fact", "because", "second",
    "water", "room", "mother", "area", "money", "story", "help", "research", "provide", "using",
]

# Bigrams: word pairs for better predictions
COMMON_BIGRAMS = {
    "the": ["following", "first", "same", "most", "other", "best", "new", "end"],
    "of": ["the", "a", "this", "these", "all", "its", "their", "his"],
    "in": ["the", "a", "this", "which", "order", "addition", "many", "recent"],
    "to": ["the", "a", "be", "make", "get", "do", "see", "take"],
    "and": ["the", "a", "its", "their", "other", "then", "also", "so"],
    "is": ["a", "the", "not", "an", "that", "it", "also", "often"],
    "that": ["the", "a", "it", "this", "is", "are", "they", "these"],
    "for": ["the", "a", "example", "instance", "this", "all", "many", "each"],
    "it": ["is", "was", "has", "can", "would", "should", "will", "may"],
    "on": ["the", "a", "this", "your", "their", "its", "these", "both"],
    "with": ["the", "a", "this", "these", "its", "their", "each", "an"],
    "as": ["a", "the", "well", "it", "they", "an", "part", "such"],
    "be": ["a", "the", "able", "used", "found", "seen", "made", "done"],
    "are": ["the", "a", "not", "also", "often", "still", "now", "more"],
    "was": ["a", "the", "not", "also", "an", "still", "very", "first"],
}


def _predict_words(prefix: str, max_results: int = 5) -> list[dict]:
    """Simple n-gram word prediction based on last word prefix."""
    if not prefix.strip():
        return []

    words = prefix.strip().split()
    results = []

    if len(words) >= 2:
        # Try bigram prediction
        last_word = words[-2].lower()
        current_prefix = words[-1].lower()
        if last_word in COMMON_BIGRAMS:
            candidates = COMMON_BIGRAMS[last_word]
            for c in candidates:
                if c.startswith(current_prefix) and c != current_prefix:
                    results.append({"word": c, "confidence": 0.7})
    elif len(words) == 1:
        current_prefix = words[-1].lower()
    else:
        return []

    # Fall back to common words matching prefix
    current_prefix = words[-1].lower() if words else ""
    for w in COMMON_WORDS:
        if w.startswith(current_prefix) and w != current_prefix:
            entry = {"word": w, "confidence": 0.4}
            if entry not in results:
                results.append(entry)

    return results[:max_results]


# ── Spell/grammar check (LanguageTool subprocess) ────────────────

def _check_text(text: str) -> list[dict]:
    """Run LanguageTool on text. Falls back to basic check."""
    # Try LanguageTool via subprocess
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as tmp:
            tmp.write(text)
            tmp_path = tmp.name

        result = subprocess.run(
            ["languagetool", "--json", tmp_path],
            capture_output=True, text=True, timeout=15
        )
        os.unlink(tmp_path)

        if result.returncode == 0 and result.stdout.strip():
            data = json.loads(result.stdout)
            errors = []
            for match in data.get("matches", []):
                errors.append({
                    "message": match.get("message", ""),
                    "offset": match.get("offset", 0),
                    "length": match.get("length", 0),
                    "context": match.get("context", {}).get("text", ""),
                    "suggestions": [r.get("value") for r in match.get("replacements", [])],
                    "rule": match.get("rule", {}).get("id", ""),
                })
            return errors
    except (FileNotFoundError, json.JSONDecodeError, subprocess.TimeoutExpired, Exception):
        pass

    # Basic fallback: flag common patterns
    return _basic_spellcheck(text)


def _basic_spellcheck(text: str) -> list[dict]:
    """Basic built-in spell/grammar check without external tools."""
    errors = []

    # Check for repeated words
    for m in re.finditer(r'\b(\w+)\s+\1\b', text, re.IGNORECASE):
        errors.append({
            "message": f"Repeated word: '{m.group(1)}'",
            "offset": m.start(),
            "length": m.end() - m.start(),
            "context": text[max(0, m.start() - 20):m.end() + 20],
            "suggestions": [m.group(1)],
            "rule": "REPEATED_WORD",
        })

    # Check for double punctuation
    for m in re.finditer(r'[.!?]{2,}', text):
        errors.append({
            "message": "Multiple punctuation marks",
            "offset": m.start(),
            "length": m.end() - m.start(),
            "context": text[max(0, m.start() - 10):m.end() + 10],
            "suggestions": [m.group()[0]],
            "rule": "MULTIPLE_PUNCTUATION",
        })

    # Check for common misspellings
    common_misspellings = {
        "teh": "the", "recieve": "receive", "adress": "address",
        "occured": "occurred", "seperate": "separate", "definately": "definitely",
        "goverment": "government", "acheive": "achieve", "begining": "beginning",
        "calender": "calendar", "comittee": "committee", "enviroment": "environment",
    }
    for word, correction in common_misspellings.items():
        for m in re.finditer(r'\b' + word + r'\b', text, re.IGNORECASE):
            errors.append({
                "message": f"Misspelling: '{m.group()}' -> '{correction}'",
                "offset": m.start(),
                "length": m.end() - m.start(),
                "context": text[max(0, m.start() - 10):m.end() + 10],
                "suggestions": [correction],
                "rule": "COMMON_MISSPELLING",
            })

    return errors


# ── Routes ───────────────────────────────────────────────────────

@router.post("/draft")
async def create_draft(
    body: DraftCreate,
    session: AsyncSession = Depends(get_session),
):
    """Create a new draft document."""
    draft = Draft(
        title=body.title,
        content=body.content,
        type=body.type,
    )
    session.add(draft)
    await session.commit()
    await session.refresh(draft)

    return {
        "id": draft.id,
        "title": draft.title,
        "content": draft.content,
        "type": draft.type,
        "created_at": draft.created_at.isoformat() if draft.created_at else None,
    }


@router.post("/brainstorm")
async def create_brainstorm(
    body: BrainstormCreate,
    session: AsyncSession = Depends(get_session),
):
    """Create a new mind map / graphic organizer stored as JSON."""
    nodes = body.nodes
    if isinstance(nodes, str):
        try:
            nodes = json.loads(nodes)
        except json.JSONDecodeError:
            nodes = []

    content = json.dumps({
        "topic": body.topic,
        "nodes": nodes,
    })

    draft = Draft(
        title=body.title,
        content=content,
        type="brainstorm",
    )
    session.add(draft)
    await session.commit()
    await session.refresh(draft)

    return {
        "id": draft.id,
        "title": draft.title,
        "type": "brainstorm",
        "content": json.loads(draft.content),
        "created_at": draft.created_at.isoformat() if draft.created_at else None,
    }


@router.post("/outline")
async def create_outline(
    body: OutlineCreate,
    session: AsyncSession = Depends(get_session),
):
    """Create a new hierarchical outline stored as JSON."""
    content = body.content
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        parsed = {"title": body.title, "items": []}

    # If raw text, try to parse indented structure
    if isinstance(parsed, dict) and not parsed.get("items"):
        lines = content.strip().split("\n")
        parsed = {"title": body.title, "items": [{"text": l.strip(), "level": 0} for l in lines if l.strip()]}

    draft = Draft(
        title=body.title,
        content=json.dumps(parsed),
        type="outline",
    )
    session.add(draft)
    await session.commit()
    await session.refresh(draft)

    return {
        "id": draft.id,
        "title": draft.title,
        "type": "outline",
        "content": json.loads(draft.content),
        "created_at": draft.created_at.isoformat() if draft.created_at else None,
    }


@router.get("/templates")
async def list_templates():
    """List available writing templates."""
    return {"templates": ACADEMIC_TEMPLATES}


@router.post("/check")
async def check_text(body: TextCheckRequest):
    """Spell check and grammar check."""
    if not body.text.strip():
        return {"errors": [], "text": body.text}

    errors = _check_text(body.text)
    return {
        "text": body.text[:500],
        "errors": errors,
        "error_count": len(errors),
    }


@router.get("/predict")
async def predict_words(
    prefix: str = Query(default="", description="Current word prefix to predict"),
):
    """Word prediction suggestions."""
    predictions = _predict_words(prefix)
    return {"prefix": prefix, "predictions": predictions}
