"""
SQLAlchemy models for the AI Nutrition Assistant.

Tables:
  knowledge_sources  — source metadata (organization, URL, topic)
  knowledge_chunks   — text chunks with retrieval keywords
  conversations      — chat session records
  conversation_messages — individual turns in a conversation
"""

import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float
from app.database import Base


class KnowledgeSource(Base):
    __tablename__ = "knowledge_sources"

    id = Column(Integer, primary_key=True, index=True)
    source_id = Column(String, unique=True, nullable=False, index=True)
    title = Column(String, nullable=False)
    organization = Column(String, nullable=False)
    url = Column(String, nullable=True)
    topic = Column(String, nullable=False)  # nutrition / food_safety / food_storage / health_conditions / meal_planning
    ingested_at = Column(DateTime, default=datetime.datetime.utcnow)


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id = Column(Integer, primary_key=True, index=True)
    chunk_id = Column(String, unique=True, nullable=False, index=True)
    source_id = Column(String, ForeignKey("knowledge_sources.source_id", ondelete="CASCADE"), nullable=False)
    text = Column(Text, nullable=False)
    keywords = Column(Text, nullable=True)   # JSON list of keywords for retrieval
    ingested_at = Column(DateTime, default=datetime.datetime.utcnow)


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(String, unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(String, ForeignKey("conversations.conversation_id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False)    # "user" | "assistant"
    content = Column(Text, nullable=False)
    # Metadata stored as JSON strings
    retrieved_sources = Column(Text, nullable=True)   # JSON list of source citations
    tool_calls_summary = Column(Text, nullable=True)  # JSON list of tool call summaries
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
