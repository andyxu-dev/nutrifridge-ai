"""
AI Nutrition Assistant router.

Endpoints:
  POST /assistant/chat     — RAG + tool-calling conversation
  POST /assistant/ingest   — ingest or re-ingest the knowledge base
  GET  /assistant/sources  — list all ingested knowledge sources
  GET  /assistant/conversations/{conversation_id}  — retrieve conversation history
"""

import json
import os
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.assistant import (
    KnowledgeSource, KnowledgeChunk, Conversation, ConversationMessage
)
from app.models.user import User
from app.models.inventory import InventoryItem
from app.services.rag_service import generate_answer, retrieve_chunks
from app.services.tool_service import execute_tool, TOOL_SCHEMAS
from app.services.expiration_engine import get_expiration_risk
from app.services.health_constraint_engine import _parse_list

router = APIRouter(prefix="/assistant", tags=["assistant"])

_DISCLAIMER = (
    "This assistant provides educational nutrition information only, "
    "not personalized medical advice. Always consult a qualified healthcare "
    "professional for medical decisions."
)


# ── Request / Response schemas ─────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    conversation_id: Optional[str] = None
    mode: str = Field(default="rag", description="'rag' for knowledge-base Q&A, 'agent' for tool-calling")
    confirm_log_meal: bool = Field(default=False, description="Set True to execute a pending log_meal")


class SourceCitation(BaseModel):
    source_id: str
    title: str
    organization: str
    url: Optional[str]
    topic: str
    similarity: float


class ToolCallSummary(BaseModel):
    tool: str
    summary: str
    requires_confirmation: bool = False


class ChatResponse(BaseModel):
    conversation_id: str
    assistant_message: str
    retrieved_sources: List[dict] = []
    tool_calls: List[dict] = []
    inventory_context: List[dict] = []
    meal_log_preview: Optional[dict] = None
    requires_confirmation: bool = False
    warnings: List[str] = []
    disclaimer: str = _DISCLAIMER
    grounded: bool = False
    mode: str = "rag"


class IngestRequest(BaseModel):
    force: bool = Field(default=False, description="Re-ingest even if sources already exist")


# ── Knowledge base ingest ──────────────────────────────────────────────────

def _load_knowledge_base_file() -> List[dict]:
    """Load the curated knowledge base JSON file."""
    kb_path = os.path.join(os.path.dirname(__file__), "..", "..", "knowledge_base", "nutrition_knowledge.json")
    kb_path = os.path.normpath(kb_path)
    if not os.path.exists(kb_path):
        raise FileNotFoundError(f"Knowledge base file not found: {kb_path}")
    with open(kb_path, "r", encoding="utf-8") as f:
        return json.load(f)


def ingest_knowledge_base(db: Session, force: bool = False) -> dict:
    """
    Load the curated knowledge base JSON into the database.
    Skips existing sources unless force=True.
    """
    try:
        sources_data = _load_knowledge_base_file()
    except FileNotFoundError as e:
        return {"status": "error", "message": str(e), "sources_ingested": 0, "chunks_ingested": 0}

    sources_ingested = 0
    chunks_ingested = 0
    skipped = 0

    for src in sources_data:
        source_id = src["source_id"]
        existing = db.query(KnowledgeSource).filter(KnowledgeSource.source_id == source_id).first()

        if existing and not force:
            skipped += 1
            continue

        if existing and force:
            # Delete existing chunks then re-create
            db.query(KnowledgeChunk).filter(KnowledgeChunk.source_id == source_id).delete()
            db.delete(existing)
            db.flush()

        knowledge_source = KnowledgeSource(
            source_id=source_id,
            title=src["title"],
            organization=src["organization"],
            url=src.get("url"),
            topic=src["topic"],
            ingested_at=datetime.utcnow(),
        )
        db.add(knowledge_source)
        db.flush()
        sources_ingested += 1

        for chunk in src.get("chunks", []):
            kc = KnowledgeChunk(
                chunk_id=chunk["chunk_id"],
                source_id=source_id,
                text=chunk["text"],
                keywords=json.dumps(chunk.get("keywords", [])),
                ingested_at=datetime.utcnow(),
            )
            db.add(kc)
            chunks_ingested += 1

    db.commit()
    return {
        "status": "ok",
        "sources_ingested": sources_ingested,
        "chunks_ingested": chunks_ingested,
        "sources_skipped": skipped,
        "message": (
            f"Ingested {sources_ingested} source(s) with {chunks_ingested} chunk(s). "
            f"{skipped} source(s) already existed and were skipped."
        ),
    }


# ── Tool-calling (agent mode) ──────────────────────────────────────────────

def _run_agent_turn(
    user_message: str,
    conversation_history: List[dict],
    user_context: Optional[dict],
    inventory_context: List[dict],
    confirm_log_meal: bool,
    db: Session,
) -> dict:
    """
    Single agent turn: build messages, call Claude with tools, execute tool calls,
    return final response with structured metadata.

    Returns a dict matching ChatResponse fields.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return {
            "assistant_message": (
                "The AI agent is not configured. Please set the `ANTHROPIC_API_KEY` "
                "environment variable to enable the assistant."
            ),
            "retrieved_sources": [],
            "tool_calls": [],
            "meal_log_preview": None,
            "requires_confirmation": False,
            "warnings": [],
            "grounded": False,
        }

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
    except Exception as e:
        return {
            "assistant_message": f"Failed to initialize AI client: {e}",
            "retrieved_sources": [],
            "tool_calls": [],
            "meal_log_preview": None,
            "requires_confirmation": False,
            "warnings": [],
            "grounded": False,
        }

    # Also do RAG retrieval to ground the agent's responses
    rag_chunks = retrieve_chunks(user_message, db, top_k=3)
    rag_context = ""
    if rag_chunks:
        lines = []
        for c in rag_chunks:
            lines.append(f"[{c['organization']}] {c['text']}")
        rag_context = "KNOWLEDGE BASE CONTEXT:\n" + "\n\n".join(lines)

    # System prompt
    user_block = _build_user_block(user_context)
    expiring = [i for i in inventory_context if i.get("expiration_risk") in ("expired", "high")]
    inv_block = ""
    if expiring:
        inv_block = "\nITEMS EXPIRING SOON: " + ", ".join(
            f"{i['name']} ({i.get('expiration_risk', '')} risk)" for i in expiring[:5]
        )

    system = f"""You are NutriFridge AI's Nutrition Assistant — a helpful, accurate assistant for nutrition, food safety, and meal planning.

{user_block}{inv_block}

{rag_context}

TOOL USE INSTRUCTIONS:
- Use tools to look up real inventory, nutrition, and meal-log data. Do not invent facts about the user's fridge or today's meals.
- For log_meal: ALWAYS show the user a preview first and ask for confirmation before calling this tool. Only call log_meal if the user has explicitly confirmed.
- Clearly indicate which facts come from tools vs. general knowledge.
- Be concise. Use bullet points for lists of items.

DISCLAIMER: Always remind the user (once per response) to consult a healthcare professional for medical dietary advice when relevant."""

    messages: List[dict] = []
    for turn in conversation_history[-8:]:
        messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": user_message})

    all_tool_calls: List[dict] = []
    all_tool_results: List[dict] = []
    pending_log_preview: Optional[dict] = None
    requires_confirmation = False
    max_iterations = 5
    final_message = ""

    for iteration in range(max_iterations):
        try:
            response = client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=1024,
                system=system,
                tools=TOOL_SCHEMAS,
                messages=messages,
            )
        except Exception as e:
            return {
                "assistant_message": f"Agent error: {e}",
                "retrieved_sources": _build_citations(rag_chunks),
                "tool_calls": all_tool_calls,
                "meal_log_preview": pending_log_preview,
                "requires_confirmation": requires_confirmation,
                "warnings": [],
                "grounded": bool(rag_chunks),
            }

        # Check stop reason
        if response.stop_reason == "end_turn":
            # Extract final text
            for block in response.content:
                if hasattr(block, "text"):
                    final_message = block.text
                    break
            break

        if response.stop_reason == "tool_use":
            # Process tool calls
            tool_use_blocks = [b for b in response.content if b.type == "tool_use"]
            text_blocks = [b for b in response.content if hasattr(b, "text")]

            # Add assistant turn with tool calls to message history
            messages.append({"role": "assistant", "content": response.content})

            tool_results_content = []
            for tb in tool_use_blocks:
                tool_name = tb.name
                tool_input = tb.input if isinstance(tb.input, dict) else {}

                # Execute tool
                confirmed = confirm_log_meal if tool_name == "log_meal" else False
                result = execute_tool(tool_name, tool_input, db, confirmed_log_meal=confirmed)

                all_tool_calls.append({
                    "tool": tool_name,
                    "summary": result["summary"],
                    "requires_confirmation": result.get("requires_confirmation", False),
                })

                if result.get("requires_confirmation"):
                    requires_confirmation = True
                    pending_log_preview = result.get("meal_log_preview")

                # Build tool result for next API call
                tool_result_data = {
                    "result": result.get("result"),
                    "summary": result["summary"],
                }
                if result.get("error"):
                    tool_result_data["error"] = result["error"]

                tool_results_content.append({
                    "type": "tool_result",
                    "tool_use_id": tb.id,
                    "content": json.dumps(tool_result_data),
                })

                all_tool_results.append(tool_result_data)

            # If there's a pending confirmation, stop and ask user
            if requires_confirmation:
                # Extract any partial text from the assistant turn
                partial_text = ""
                for tb in text_blocks:
                    partial_text = tb.text
                    break
                final_message = partial_text or (
                    "I've prepared the meal log. Would you like me to log this meal? "
                    "Please confirm by sending 'yes' or 'confirm'."
                )
                break

            # Add tool results to messages and continue
            messages.append({"role": "user", "content": tool_results_content})
            continue

        # Unexpected stop
        break

    if not final_message:
        # Extract from last response
        for block in response.content:
            if hasattr(block, "text"):
                final_message = block.text
                break

    return {
        "assistant_message": final_message,
        "retrieved_sources": _build_citations(rag_chunks),
        "tool_calls": all_tool_calls,
        "meal_log_preview": pending_log_preview,
        "requires_confirmation": requires_confirmation,
        "warnings": [],
        "grounded": bool(rag_chunks) or bool(all_tool_calls),
    }


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Main chat endpoint.

    mode="rag"   — uses knowledge-base retrieval + LLM for grounded Q&A
    mode="agent" — uses LLM tool-calling to check real inventory, macros, and logs
    """
    # Resolve or create conversation
    conversation_id = request.conversation_id
    if conversation_id:
        conv = db.query(Conversation).filter(Conversation.conversation_id == conversation_id).first()
        if not conv:
            conv = Conversation(conversation_id=conversation_id)
            db.add(conv)
            db.flush()
    else:
        conversation_id = str(uuid.uuid4())
        conv = Conversation(conversation_id=conversation_id)
        db.add(conv)
        db.flush()

    # Load conversation history
    history_rows = (
        db.query(ConversationMessage)
        .filter(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.id)
        .all()
    )
    conversation_history = [{"role": r.role, "content": r.content} for r in history_rows]

    # Build user context from profile
    user = db.query(User).first()
    user_context: Optional[dict] = None
    if user:
        user_context = {
            "name": user.name,
            "goal": user.goal,
            "diet_style": user.diet_style,
            "health_conditions": _parse_list(user.health_conditions),
            "allergies": _parse_list(user.allergies),
            "strict_avoid_foods": _parse_list(user.strict_avoid_foods),
            "macro_strategy": user.macro_strategy,
        }

    # Build inventory context (expiring items)
    inventory = db.query(InventoryItem).all()
    inventory_context = [
        {
            "name": i.name,
            "quantity": i.quantity,
            "unit": i.unit,
            "best_before_date": str(i.best_before_date) if i.best_before_date else None,
            "expiration_risk": get_expiration_risk(i.best_before_date),
        }
        for i in inventory
        if get_expiration_risk(i.best_before_date) in ("expired", "high", "medium")
    ][:10]

    # Route to correct mode
    mode = request.mode if request.mode in ("rag", "agent") else "rag"

    if mode == "agent":
        result = _run_agent_turn(
            user_message=request.message,
            conversation_history=conversation_history,
            user_context=user_context,
            inventory_context=inventory_context,
            confirm_log_meal=request.confirm_log_meal,
            db=db,
        )
        assistant_message = result["assistant_message"]
        retrieved_sources = result["retrieved_sources"]
        tool_calls = result["tool_calls"]
        meal_log_preview = result["meal_log_preview"]
        requires_confirmation = result["requires_confirmation"]
        warnings = result.get("warnings", [])
        grounded = result["grounded"]
    else:
        # RAG mode
        rag_result = generate_answer(
            query=request.message,
            db=db,
            user_context=user_context,
            inventory_context=inventory_context,
            conversation_history=conversation_history,
        )
        assistant_message = rag_result["answer"]
        retrieved_sources = rag_result["retrieved_sources"]
        tool_calls = []
        meal_log_preview = None
        requires_confirmation = False
        warnings = []
        if rag_result.get("error"):
            warnings.append(rag_result["error"])
        grounded = rag_result["grounded"]

    # Persist messages
    user_msg_row = ConversationMessage(
        conversation_id=conversation_id,
        role="user",
        content=request.message,
    )
    db.add(user_msg_row)

    assistant_msg_row = ConversationMessage(
        conversation_id=conversation_id,
        role="assistant",
        content=assistant_message,
        retrieved_sources=json.dumps(retrieved_sources),
        tool_calls_summary=json.dumps(tool_calls),
    )
    db.add(assistant_msg_row)

    # Update conversation timestamp
    conv.updated_at = datetime.utcnow()
    db.commit()

    return ChatResponse(
        conversation_id=conversation_id,
        assistant_message=assistant_message,
        retrieved_sources=retrieved_sources,
        tool_calls=tool_calls,
        inventory_context=inventory_context,
        meal_log_preview=meal_log_preview,
        requires_confirmation=requires_confirmation,
        warnings=warnings,
        disclaimer=_DISCLAIMER,
        grounded=grounded,
        mode=mode,
    )


@router.post("/ingest")
def ingest(request: IngestRequest = IngestRequest(), db: Session = Depends(get_db)):
    """
    Ingest or re-ingest the curated nutrition knowledge base into the database.
    Pass force=true to re-ingest all sources even if they already exist.
    """
    result = ingest_knowledge_base(db, force=request.force)
    return result


@router.get("/sources")
def get_sources(db: Session = Depends(get_db)):
    """List all ingested knowledge sources with metadata."""
    sources = db.query(KnowledgeSource).order_by(KnowledgeSource.topic).all()
    chunk_counts = {}
    chunks = db.query(KnowledgeChunk).all()
    for c in chunks:
        chunk_counts[c.source_id] = chunk_counts.get(c.source_id, 0) + 1

    return {
        "total_sources": len(sources),
        "total_chunks": sum(chunk_counts.values()),
        "sources": [
            {
                "source_id": s.source_id,
                "title": s.title,
                "organization": s.organization,
                "url": s.url,
                "topic": s.topic,
                "chunk_count": chunk_counts.get(s.source_id, 0),
                "ingested_at": s.ingested_at.isoformat() if s.ingested_at else None,
            }
            for s in sources
        ],
    }


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str, db: Session = Depends(get_db)):
    """Retrieve the message history for a conversation."""
    conv = db.query(Conversation).filter(Conversation.conversation_id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    messages = (
        db.query(ConversationMessage)
        .filter(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.id)
        .all()
    )

    return {
        "conversation_id": conversation_id,
        "created_at": conv.created_at.isoformat(),
        "updated_at": conv.updated_at.isoformat(),
        "messages": [
            {
                "role": m.role,
                "content": m.content,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in messages
        ],
    }


# ── Helpers ────────────────────────────────────────────────────────────────

def _build_user_block(user_context: Optional[dict]) -> str:
    if not user_context:
        return "USER PROFILE: No profile data available."
    lines = [
        f"Name: {user_context.get('name', 'User')}",
        f"Goal: {user_context.get('goal', 'not specified')}",
        f"Diet style: {user_context.get('diet_style') or 'not specified'}",
    ]
    if user_context.get("health_conditions"):
        lines.append(f"Health conditions: {', '.join(user_context['health_conditions'])}")
    if user_context.get("allergies"):
        lines.append(f"Allergies: {', '.join(user_context['allergies'])}")
    if user_context.get("strict_avoid_foods"):
        lines.append(f"Strictly avoids: {', '.join(user_context['strict_avoid_foods'])}")
    return "USER PROFILE:\n" + "\n".join(lines)


def _build_citations(chunks: List[dict]) -> List[dict]:
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
