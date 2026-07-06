"""
RAG (Retrieval-Augmented Generation) service for the Nutrition Assistant.

Retrieval: TF-IDF cosine similarity over curated knowledge chunks stored in SQLite.
            No external embedding API required — works fully offline.

Generation: Anthropic Claude API (claude-haiku-4-5) for grounded answer generation.
            Falls back gracefully when ANTHROPIC_API_KEY is not set.
"""

import json
import os
from typing import List, Dict, Optional, Tuple

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy.orm import Session

from app.models.assistant import KnowledgeChunk, KnowledgeSource

# Max chunks to retrieve per query
_TOP_K = 4
# Min similarity score to include a chunk
_MIN_SIMILARITY = 0.05


def retrieve_chunks(
    query: str,
    db: Session,
    top_k: int = _TOP_K,
    topic_filter: Optional[str] = None,
) -> List[Dict]:
    """
    Retrieve the most relevant knowledge chunks for a query using TF-IDF similarity.

    Returns list of dicts:
      { chunk_id, text, source_id, title, organization, url, topic, similarity }
    """
    # Load all chunks (and their source metadata) from the DB
    q = db.query(KnowledgeChunk, KnowledgeSource).join(
        KnowledgeSource, KnowledgeChunk.source_id == KnowledgeSource.source_id
    )
    if topic_filter:
        q = q.filter(KnowledgeSource.topic == topic_filter)

    rows = q.all()
    if not rows:
        return []

    chunks = []
    for chunk, source in rows:
        # Augment text with keywords for better retrieval
        keywords_text = ""
        if chunk.keywords:
            try:
                kws = json.loads(chunk.keywords)
                keywords_text = " ".join(kws)
            except Exception:
                pass
        chunks.append({
            "chunk_id": chunk.chunk_id,
            "text": chunk.text,
            "full_text": chunk.text + " " + keywords_text,
            "source_id": chunk.source_id,
            "title": source.title,
            "organization": source.organization,
            "url": source.url,
            "topic": source.topic,
        })

    if not chunks:
        return []

    # Build TF-IDF matrix from corpus + query
    corpus = [c["full_text"] for c in chunks]
    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        stop_words="english",
        min_df=1,
        sublinear_tf=True,
    )
    corpus_vectors = vectorizer.fit_transform(corpus)
    query_vector = vectorizer.transform([query])

    # Cosine similarity between query and all chunks
    scores = cosine_similarity(query_vector, corpus_vectors).flatten()

    # Pick top-k above threshold, sorted by score descending
    ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)
    results = []
    for idx, score in ranked[:top_k]:
        if score >= _MIN_SIMILARITY:
            c = chunks[idx]
            results.append({
                "chunk_id": c["chunk_id"],
                "text": c["text"],
                "source_id": c["source_id"],
                "title": c["title"],
                "organization": c["organization"],
                "url": c["url"],
                "topic": c["topic"],
                "similarity": round(float(score), 4),
            })

    return results


def _format_retrieved_context(chunks: List[Dict]) -> str:
    """Format retrieved chunks into a readable context block for the LLM prompt."""
    if not chunks:
        return "(No relevant sources retrieved.)"

    parts = []
    for i, c in enumerate(chunks, 1):
        parts.append(
            f"[Source {i}] {c['title']} — {c['organization']}\n"
            f"URL: {c['url']}\n"
            f"{c['text']}"
        )
    return "\n\n".join(parts)


def _build_system_prompt(user_context: Optional[Dict], retrieved_context: str) -> str:
    """Build the LLM system prompt with user profile context and retrieved sources."""
    user_block = ""
    if user_context:
        lines = [
            f"Name: {user_context.get('name', 'User')}",
            f"Goal: {user_context.get('goal', 'not specified')}",
            f"Diet style: {user_context.get('diet_style', 'not specified')}",
        ]
        if user_context.get("health_conditions"):
            lines.append(f"Health conditions: {', '.join(user_context['health_conditions'])}")
        if user_context.get("allergies"):
            lines.append(f"Allergies: {', '.join(user_context['allergies'])}")
        if user_context.get("strict_avoid_foods"):
            lines.append(f"Strictly avoids: {', '.join(user_context['strict_avoid_foods'])}")
        user_block = "USER PROFILE:\n" + "\n".join(lines)
    else:
        user_block = "USER PROFILE: No profile data available."

    has_sources = retrieved_context.strip() and retrieved_context != "(No relevant sources retrieved.)"

    grounding_instruction = (
        "You have access to relevant knowledge-base excerpts below. "
        "When answering, clearly identify which facts come from these sources and which are general knowledge. "
        "Always cite the source name and organization when stating a fact from the retrieved context. "
        "Do NOT fabricate source citations that are not in the retrieved context."
    ) if has_sources else (
        "No relevant knowledge-base sources were retrieved for this query. "
        "You may still answer from general knowledge, but clearly state that the answer is not backed by a retrieved source. "
        "Do NOT fabricate source citations."
    )

    return f"""You are NutriFridge AI's Nutrition Assistant — a helpful, accurate assistant that answers questions about nutrition, food storage, food safety, expiration dates, and meal planning.

{user_block}

RETRIEVED KNOWLEDGE-BASE SOURCES:
{retrieved_context}

INSTRUCTIONS:
- {grounding_instruction}
- When recommending foods or dietary changes related to health conditions, remind the user to consult a registered dietitian or physician for medical-grade advice. Do this once per response, naturally integrated — not as a boilerplate block.
- If the user asks about specific items in their inventory, reference them by name.
- Distinguish clearly between: (1) grounded facts from the retrieved sources, (2) personalized recommendations based on the user's profile, and (3) general nutritional knowledge.
- Keep responses concise and practical. Use short paragraphs or bullet points when listing multiple items.
- Do not recommend foods that conflict with the user's allergies or strict avoidance list.
- Today's date context is available — if discussing expiration or storage timelines, frame advice relative to "today" and "days remaining."

DISCLAIMER: This assistant provides educational nutrition information only, not personalized medical advice. Always consult a qualified healthcare professional for medical decisions."""


def generate_answer(
    query: str,
    db: Session,
    user_context: Optional[Dict] = None,
    inventory_context: Optional[List[Dict]] = None,
    conversation_history: Optional[List[Dict]] = None,
) -> Dict:
    """
    Full RAG pipeline:
      1. Retrieve relevant knowledge chunks
      2. Build grounded prompt
      3. Call Claude API (or return graceful fallback if key not set)

    Returns:
      {
        "answer": str,
        "retrieved_sources": list of source citations,
        "grounded": bool (True if sources were retrieved),
        "error": str | None
      }
    """
    # Step 1: Retrieve
    retrieved = retrieve_chunks(query, db, top_k=_TOP_K)
    context_str = _format_retrieved_context(retrieved)

    # Step 2: Build messages
    system_prompt = _build_system_prompt(user_context, context_str)

    messages: List[Dict] = []
    if conversation_history:
        # Include prior turns (up to last 6 to avoid token overflow)
        for turn in conversation_history[-6:]:
            messages.append({"role": turn["role"], "content": turn["content"]})

    # Augment query with inventory context if provided
    user_message = query
    if inventory_context:
        urgent = [i for i in inventory_context if i.get("expiration_risk") in ("expired", "high")]
        if urgent:
            item_list = ", ".join(f"{i['name']} ({i.get('quantity', '')} {i.get('unit', '')})" for i in urgent[:5])
            user_message = f"{query}\n\n[Inventory context: Items expiring soon — {item_list}]"

    messages.append({"role": "user", "content": user_message})

    # Step 3: Call Anthropic API
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return {
            "answer": (
                "The AI assistant is not configured. Please set the `ANTHROPIC_API_KEY` "
                "environment variable to enable the nutrition assistant.\n\n"
                + (_format_retrieved_context_plain(retrieved) if retrieved else "")
            ),
            "retrieved_sources": _build_citations(retrieved),
            "grounded": bool(retrieved),
            "error": "ANTHROPIC_API_KEY not set",
        }

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=1024,
            system=system_prompt,
            messages=messages,
        )
        answer_text = response.content[0].text
    except Exception as e:
        return {
            "answer": f"The assistant encountered an error: {e}",
            "retrieved_sources": _build_citations(retrieved),
            "grounded": bool(retrieved),
            "error": str(e),
        }

    return {
        "answer": answer_text,
        "retrieved_sources": _build_citations(retrieved),
        "grounded": bool(retrieved),
        "error": None,
    }


def _format_retrieved_context_plain(chunks: List[Dict]) -> str:
    """Plain text of retrieved chunks for fallback display."""
    if not chunks:
        return ""
    lines = ["Relevant information from our knowledge base:"]
    for c in chunks:
        lines.append(f"\n• [{c['organization']}] {c['title']}: {c['text']}")
    return "\n".join(lines)


def _build_citations(chunks: List[Dict]) -> List[Dict]:
    """Build deduplicated source citation list from retrieved chunks."""
    seen: set = set()
    citations = []
    for c in chunks:
        key = c["source_id"]
        if key not in seen:
            seen.add(key)
            citations.append({
                "source_id": c["source_id"],
                "title": c["title"],
                "organization": c["organization"],
                "url": c["url"],
                "topic": c["topic"],
                "similarity": c["similarity"],
            })
    return citations
