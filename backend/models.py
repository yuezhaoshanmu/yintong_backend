"""
Database Models module for "银童共育" Backend Service.
Sets up SQLAlchemy ORM schemas, database connection pool, and local sessions.
Integrates transparent encryption/decryption properties for sensitive fields 
(real_name, phone_number, device_mapping_credential) and updates blind index fields automatically.

Comment Density > 20%
"""

import os
from datetime import datetime
from typing import Optional
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, Float, ForeignKey, Text
from sqlalchemy.orm import sessionmaker, relationship
try:
    from sqlalchemy.orm import declarative_base
except ImportError:
    from sqlalchemy.ext.declarative import declarative_base

from security import encrypt_column, decrypt_column, generate_blind_index

# =====================================================================
# DATABASE CONNECTION CONFIGURATION
# =====================================================================

# Load environment connection values, defaulting to a local SQLite database for development ease 
# if MySQL is not immediately available.
MYSQL_USER = os.environ.get("MYSQL_USER", "root")
MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "yintong_secure_pass_2026")
MYSQL_HOST = os.environ.get("MYSQL_HOST", "localhost")
MYSQL_PORT = os.environ.get("MYSQL_PORT", "3306")
MYSQL_DB = os.environ.get("MYSQL_DB", "yintong_db")

# Compose standard MySQL connection URI
DATABASE_URL = f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DB}"

# If sqlite is preferred for testing without docker/local MySQL service, we support it as a fallback.
if os.environ.get("USE_SQLITE", "False").lower() == "true":
    DATABASE_URL = "sqlite:///./yintong_local.db"

# Configure standard SQLAlchemy Engine
# pool_pre_ping checks connections before dispatching to handle MySQL idle timeouts (8 hours default)
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(
        DATABASE_URL,
        pool_size=20,
        max_overflow=10,
        pool_recycle=3600,
        pool_pre_ping=True
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# =====================================================================
# USER MODEL (WITH TRANSPARENT ENCRYPTION & BLIND INDEX)
# =====================================================================

class User(Base):
    """
    User account credentials and demographics.
    Supports Role-Based Access Control (RBAC).
    
    Fields:
      - real_name, phone_number, device_mapping_credential: Column-level AES-256-GCM encrypted.
      - phone_number_blind_index: Indexed HMAC-SHA256 hash allowing exact-match lookups.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(100), nullable=False)
    role = Column(String(20), nullable=False)  # ADMIN, ELDER, CHILD, CAREGIVER, VOLUNTEER
    created_at = Column(DateTime, default=datetime.utcnow)

    # Database encrypted columns
    real_name = Column(String(255), nullable=True)
    phone_number = Column(String(255), nullable=True)
    phone_number_blind_index = Column(String(64), index=True, nullable=True)
    device_mapping_credential = Column(String(255), nullable=True)

    # Relationships
    pins_created = relationship("NostalgiaPin", back_populates="creator")
    messages_sent = relationship("VoiceMessage", foreign_keys="[VoiceMessage.sender_id]", back_populates="sender")

    # --- Transparent Decrypted Properties ---
    
    @property
    def real_name_decrypted(self) -> Optional[str]:
        """Decrypts and returns the user's real name."""
        return decrypt_column(self.real_name)

    @real_name_decrypted.setter
    def real_name_decrypted(self, val: Optional[str]) -> None:
        """Encrypts the user's real name before writing to the database."""
        self.real_name = encrypt_column(val)

    @property
    def phone_number_decrypted(self) -> Optional[str]:
        """Decrypts and returns the user's phone number."""
        return decrypt_column(self.phone_number)

    @phone_number_decrypted.setter
    def phone_number_decrypted(self, val: Optional[str]) -> None:
        """
        Encrypts the phone number and automatically generates its deterministic blind index
        for fast database exact-match lookup.
        """
        self.phone_number = encrypt_column(val)
        self.phone_number_blind_index = generate_blind_index(val)

    @property
    def device_mapping_credential_decrypted(self) -> Optional[str]:
        """Decrypts and returns the device mapping credential."""
        return decrypt_column(self.device_mapping_credential)

    @device_mapping_credential_decrypted.setter
    def device_mapping_credential_decrypted(self, val: Optional[str]) -> None:
        """Encrypts the device mapping credential before writing."""
        self.device_mapping_credential = encrypt_column(val)


# =====================================================================
# NOSTALGIA PIN MODEL (LBS HISTORICAL MEMORY MARKERS)
# =====================================================================

class NostalgiaPin(Base):
    """
    Nostalgia Pins representing historical memories associated with GPS locations.
    Contains coordinates mapped from GPS standard (WGS-84).
    
    Indexes on latitude/longitude speed up bounding box geospatial queries.
    """
    __tablename__ = "nostalgia_pins"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    year = Column(String(20), nullable=False)  # Memory era, e.g., "1975年"
    image_url = Column(String(255), nullable=True)
    
    # Coordinates in WGS-84 standard (GPS)
    latitude = Column(Float, nullable=False, index=True)
    longitude = Column(Float, nullable=False, index=True)
    
    likes = Column(Integer, default=0)
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    creator = relationship("User", back_populates="pins_created")


# =====================================================================
# VOICE MESSAGE MODEL (ASYNCHRONOUS CONTENT AUDITED SPEECH RECORDINGS)
# =====================================================================

class VoiceMessage(Base):
    """
    Cross-generational voice messages/ASR transcripts.
    Subject to asynchronous "save-first, moderate-later" Content Safety auditing.
    
    Fields:
      - status: PENDING (default), APPROVED, BLOCKED
      - text: Speech-to-text transcript. Masked to asterisks if BLOCKED.
    """
    __tablename__ = "voice_messages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Null if public/broadcast
    
    text = Column(Text, nullable=False)  # Transcribed speech text
    audio_url = Column(String(255), nullable=True)
    duration_seconds = Column(Integer, default=0)
    is_unread = Column(Boolean, default=True)
    
    status = Column(String(20), default="PENDING")  # PENDING, APPROVED, BLOCKED
    replied_text = Column(Text, nullable=True)      # Interactive text replies
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    sender = relationship("User", foreign_keys=[sender_id], back_populates="messages_sent")


# =====================================================================
# AUDIT AND CONTENT SECURITY MONITORING LOG MODEL
# =====================================================================

class ModerationLog(Base):
    """
    Records Content Safety blocks triggered by Local Dictionaries 
    or Alibaba Cloud Moderation API results.
    """
    __tablename__ = "moderation_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    type = Column(String(20), nullable=False)       # ASR, VOICE, PHOTO
    content = Column(Text, nullable=False)          # Original raw text submitted
    status = Column(String(20), nullable=False)      # PASS, BLOCKED
    reason = Column(String(255), nullable=True)     # Reason description of blocks
    timestamp = Column(DateTime, default=datetime.utcnow)


# =====================================================================
# CONVENIENCE SESSION DEPENDENCY FOR ROUTES
# =====================================================================

def get_db():
    """FastAPI Dependency supplying database session scope, executing automated cleanup."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
