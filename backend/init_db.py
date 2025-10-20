#!/usr/bin/env python3
"""
Database initialization script for MCP Marketplace
Creates tables if they don't exist and handles migrations
"""

from database import create_tables, SessionLocal, engine
from sqlalchemy import inspect
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def init_database():
    """Initialize database tables if they don't exist"""
    try:
        # Check if tables exist
        inspector = inspect(engine)
        existing_tables = inspector.get_table_names()
        
        if not existing_tables:
            print("No tables found. Creating database tables...")
            create_tables()
            print("✅ Database initialized successfully!")
        else:
            print(f"✅ Database tables already exist: {existing_tables}")
            
        # Test database connection
        db = SessionLocal()
        try:
            # Simple query to test connection
            from sqlalchemy import text
            db.execute(text("SELECT 1"))
            print("✅ Database connection successful!")
        except Exception as e:
            print(f"❌ Database connection failed: {e}")
        finally:
            db.close()
            
    except Exception as e:
        print(f"❌ Database initialization failed: {e}")
        raise

def generate_encryption_key():
    """Generate a new encryption key for the ENCRYPTION_KEY environment variable"""
    from cryptography.fernet import Fernet
    key = Fernet.generate_key()
    print(f"Generated ENCRYPTION_KEY: {key.decode()}")
    print("Add this to your .env file:")
    print(f"ENCRYPTION_KEY={key.decode()}")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "generate-key":
        generate_encryption_key()
    else:
        init_database()
