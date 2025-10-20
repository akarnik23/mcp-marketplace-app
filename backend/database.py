from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
import uuid
import os
from datetime import datetime
from cryptography.fernet import Fernet

# Database setup
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./marketplace.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Encryption helpers
def get_cipher():
    """Get Fernet cipher for encryption/decryption"""
    key = os.getenv("ENCRYPTION_KEY")
    if not key:
        raise ValueError("ENCRYPTION_KEY environment variable not set")
    return Fernet(key.encode())

def encrypt_value(value: str) -> str:
    """Encrypt a string value"""
    if not value:
        return value
    return get_cipher().encrypt(value.encode()).decode()

def decrypt_value(encrypted: str) -> str:
    """Decrypt an encrypted string value"""
    if not encrypted:
        return encrypted
    return get_cipher().decrypt(encrypted.encode()).decode()

# Database Models
class User(Base):
    __tablename__ = "users"
    
    # Use String(36) for UUID storage (works with both SQLite and PostgreSQL)
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    github_id = Column(String, unique=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    avatar_url = Column(String)
    render_api_key_encrypted = Column(Text)  # Store user's Render API key encrypted
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    deployments = relationship("Deployment", back_populates="user")

class MCPTemplate(Base):
    __tablename__ = "mcp_templates"
    
    # Use String(36) for UUID storage (works with both SQLite and PostgreSQL)
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    name = Column(String, unique=True, index=True)
    description = Column(Text)
    template_data = Column(Text)  # JSON string of template
    version = Column(String, default="1.0.0")
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships - No direct relationship to deployments since template_id is a string reference

class Deployment(Base):
    __tablename__ = "deployments"
    
    # Use String(36) for UUID storage (works with both SQLite and PostgreSQL)
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    
    # Foreign keys - use String(36) for UUID storage
    user_id = Column(String(36), ForeignKey("users.id"), index=True)
    template_id = Column(String, index=True)  # Changed to String to store template name
    
    render_service_id = Column(String, unique=True, index=True)
    status = Column(String, default="pending")  # pending, deploying, active, failed
    deployment_url = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="deployments")
    # No direct template relationship since template_id is a string reference to template name
    api_keys = relationship("APIKey", back_populates="deployment")

class APIKey(Base):
    __tablename__ = "api_keys"
    
    # Use String(36) for UUID storage (works with both SQLite and PostgreSQL)
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    
    # Foreign keys - use String(36) for UUID storage
    user_id = Column(String(36), ForeignKey("users.id"), index=True)
    deployment_id = Column(String(36), ForeignKey("deployments.id"), index=True)
    
    key_name = Column(String)  # e.g., "GITHUB_TOKEN", "SPOTIFY_CLIENT_ID"
    key_type = Column(String)  # render_api_key, mcp_api_key, etc.
    encrypted_value = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User")
    deployment = relationship("Deployment", back_populates="api_keys")

# Database functions
def create_tables():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
