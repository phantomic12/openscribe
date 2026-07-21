"""SQLAlchemy ORM models for OpenScribe."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return uuid.uuid4().hex


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    author: Mapped[str] = mapped_column(String(500), default="")
    language: Mapped[str] = mapped_column(String(10), default="en")
    source_format: Mapped[str] = mapped_column(String(20), nullable=False)
    source_filename: Mapped[str] = mapped_column(String(500), default="")
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    storage_path: Mapped[str] = mapped_column(String(1000), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    pages: Mapped[list["Page"]] = relationship("Page", back_populates="document", cascade="all, delete-orphan")
    annotations: Mapped[list["Annotation"]] = relationship("Annotation", back_populates="document", cascade="all, delete-orphan")
    reading_state: Mapped[Optional["ReadingState"]] = relationship("ReadingState", back_populates="document", uselist=False, cascade="all, delete-orphan")


class Page(Base):
    __tablename__ = "pages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    document_id: Mapped[str] = mapped_column(String(32), ForeignKey("documents.id"), nullable=False)
    page_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, default="")
    image_path: Mapped[str] = mapped_column(String(1000), default="")
    ocr_json: Mapped[str] = mapped_column(Text, default="{}")
    dimensions: Mapped[str] = mapped_column(String(100), default="{}")

    document: Mapped["Document"] = relationship("Document", back_populates="pages")


class Annotation(Base):
    __tablename__ = "annotations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    document_id: Mapped[str] = mapped_column(String(32), ForeignKey("documents.id"), nullable=False)
    page_index: Mapped[int] = mapped_column(Integer, default=0)
    type: Mapped[str] = mapped_column(String(20), nullable=False, default="highlight")
    bbox: Mapped[str] = mapped_column(String(200), default="{}")
    color: Mapped[str] = mapped_column(String(20), default="#FFFF00")
    label: Mapped[str] = mapped_column(String(200), default="")
    note_text: Mapped[str] = mapped_column(Text, default="")
    question_type: Mapped[str] = mapped_column(String(50), default="")
    options: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    document: Mapped["Document"] = relationship("Document", back_populates="annotations")


class ReadingState(Base):
    __tablename__ = "reading_states"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    document_id: Mapped[str] = mapped_column(String(32), ForeignKey("documents.id"), unique=True, nullable=False)
    current_page: Mapped[int] = mapped_column(Integer, default=0)
    current_word_index: Mapped[int] = mapped_column(Integer, default=0)
    voice: Mapped[str] = mapped_column(String(50), default="en-US-JennyNeural")
    speed: Mapped[float] = mapped_column(Float, default=1.0)
    chunk_size: Mapped[str] = mapped_column(String(20), default="sentence")
    mode: Mapped[str] = mapped_column(String(20), default="read")

    document: Mapped["Document"] = relationship("Document", back_populates="reading_state")


class Draft(Base):
    __tablename__ = "drafts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    title: Mapped[str] = mapped_column(String(500), nullable=False, default="Untitled")
    content: Mapped[str] = mapped_column(Text, default="")
    type: Mapped[str] = mapped_column(String(50), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
