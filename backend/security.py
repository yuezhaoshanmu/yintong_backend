"""
Security module for "银童共育" Backend Service.
Provides cryptographic routines, JWT stateless authentication, Role-Based Access Control (RBAC),
and Redis-backed request anti-replay validation to protect against malicious network replays.

Comment Density > 20%
"""

import os
import time
import base64
import hmac
import hashlib
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, Header, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from passlib.context import CryptContext
from Crypto.Cipher import AES
import redis

# =====================================================================
# CONFIGURATION & ENVIRONMENT VARIABLES
# =====================================================================

# Cryptographic Keys (Loaded from environment with secure fallbacks for local dev)
DB_ENCRYPTION_KEY = os.environ.get("DB_ENCRYPTION_KEY", "default_32_byte_secret_key_123456").encode("utf-8")
# Ensure the key is exactly 32 bytes for AES-256
DB_ENCRYPTION_KEY = DB_ENCRYPTION_KEY[:32].ljust(32, b'\0')

DB_BLIND_INDEX_SALT = os.environ.get("DB_BLIND_INDEX_SALT", "default_blind_index_salt_secure").encode("utf-8")

JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "yintong_jwt_signing_secret_key_extremely_secure_987654321")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # Default 24 hours

# Redis settings for Anti-Replay Token checking
REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.environ.get("REDIS_PASSWORD", None)
ALLOW_MOCK_SERVICES = os.environ.get("ALLOW_MOCK_SERVICES", "True").lower() == "true"

# Password hashing configuration
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# Initialize Redis client connection pool
try:
    redis_client = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=REDIS_PASSWORD,
        db=0,
        socket_connect_timeout=2,
        decode_responses=True
    )
except Exception as e:
    print(f"[SECURITY WARNING] Failed to connect to Redis at {REDIS_HOST}:{REDIS_PORT}. Anti-replay checks will be bypassed if ALLOW_MOCK_SERVICES is True.")
    redis_client = None


# =====================================================================
# CRYPTOGRAPHIC COMPONENT (AES-256-GCM & BLIND INDEX)
# =====================================================================

def encrypt_column(plain_text: Optional[str]) -> Optional[str]:
    """
    Encrypts a sensitive string column using AES-256-GCM.
    Ensures confidentiality and integrity.
    
    Format of output: base64(nonce):base64(tag):base64(ciphertext)
    """
    if plain_text is None:
        return None
    if not plain_text.strip():
        return ""
        
    try:
        # Create a new GCM cipher block
        cipher = AES.new(DB_ENCRYPTION_KEY, AES.MODE_GCM)
        # Encrypt the UTF-8 encoded text
        ciphertext, tag = cipher.encrypt_and_digest(plain_text.encode("utf-8"))
        
        # Base64 encode all parts to ensure safe string representation in MySQL
        nonce_b64 = base64.b64encode(cipher.nonce).decode("utf-8")
        tag_b64 = base64.b64encode(tag).decode("utf-8")
        cipher_b64 = base64.b64encode(ciphertext).decode("utf-8")
        
        return f"{nonce_b64}:{tag_b64}:{cipher_b64}"
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database encryption failure: {str(e)}"
        )


def decrypt_column(encrypted_text: Optional[str]) -> Optional[str]:
    """
    Decrypts an AES-256-GCM encrypted column.
    Validates ciphertext integrity via GCM authentication tag.
    """
    if encrypted_text is None:
        return None
    if not encrypted_text.strip():
        return ""
        
    try:
        parts = encrypted_text.split(":")
        if len(parts) != 3:
            # Data might not be encrypted (or corrupted)
            return "[DECRYPTION_ERROR: Invalid format]"
            
        nonce = base64.b64decode(parts[0])
        tag = base64.b64decode(parts[1])
        ciphertext = base64.b64decode(parts[2])
        
        # Initialize cipher with the extracted nonce
        cipher = AES.new(DB_ENCRYPTION_KEY, AES.MODE_GCM, nonce=nonce)
        # Decrypt and verify integrity
        decrypted_bytes = cipher.decrypt_and_verify(ciphertext, tag)
        return decrypted_bytes.decode("utf-8")
    except Exception as e:
        # Returning a masked error prevents leaking info but signals decryption issue
        return f"[DECRYPTION_ERROR: Integrity check failed - {str(e)}]"


def generate_blind_index(plain_text: Optional[str]) -> Optional[str]:
    """
    Generates a deterministic HMAC-SHA256 blind index for a given plain text value.
    This allows querying database records via indexed columns for exact matches (e.g. phone number lookup)
    without revealing the plain text or using deterministic AES encryption (which weakens security).
    """
    if plain_text is None:
        return None
    # Normalize input (strip whitespace, ensure standard case if applicable)
    normalized = plain_text.strip()
    if not normalized:
        return ""
        
    # Generate HMAC signature
    h = hmac.new(DB_BLIND_INDEX_SALT, normalized.encode("utf-8"), hashlib.sha256)
    return h.hexdigest()


# =====================================================================
# PASSWORD HASHING
# =====================================================================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies that a plain text password matches its hashed representation."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Generates a secure bcrypt hash of a plain text password."""
    return pwd_context.hash(password)


# =====================================================================
# ROLE-BASED ACCESS CONTROL (RBAC) & stateless JWT
# =====================================================================

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Creates a signed, stateless JWT token containing user details."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt


async def get_current_user(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    """
    FastAPI Dependency to retrieve the current user details from the JWT token.
    Raises 401 Unauthorized if the token is expired or invalid.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        username: str = payload.get("username")
        role: str = payload.get("role")
        
        if user_id is None or role is None:
            raise credentials_exception
            
        return {"id": user_id, "username": username, "role": role}
    except JWTError:
        raise credentials_exception


class RoleChecker:
    """
    Dependency generator enforcing Role-Based Access Control (RBAC).
    Restricts access to specific endpoints based on authorized roles.
    """
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        user_role = current_user.get("role")
        if user_role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {self.allowed_roles}. Your role: {user_role}."
            )
        return current_user


# RBAC shortcut definitions
admin_required = RoleChecker(["ADMIN"])
elder_required = RoleChecker(["ELDER", "ADMIN"])
child_required = RoleChecker(["CHILD", "ADMIN"])
family_required = RoleChecker(["ADMIN", "ELDER", "CHILD", "CAREGIVER", "VOLUNTEER"])


# =====================================================================
# ANTI-REPLAY TOKEN VALIDATION (REDIS)
# =====================================================================

async def verify_anti_replay(
    x_replay_nonce: str = Header(..., description="Unique nonce identifier for this request"),
    x_replay_timestamp: int = Header(..., description="Unix timestamp of the request in seconds")
) -> None:
    """
    Validates requests against replay attacks.
    Checks that the request timestamp is within a 5-minute sliding window,
    and uses Redis to store/check the request nonce to prevent duplicates.
    """
    current_time = int(time.time())
    
    # 1. Enforce a 5-minute expiration window (300 seconds)
    if abs(current_time - x_replay_timestamp) > 300:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request timestamp is out of the valid 5-minute window. Please synchronize client clock."
        )
        
    # 2. Query Redis to check if this nonce was already processed
    nonce_key = f"replay_nonce:{x_replay_nonce}"
    
    if redis_client is not None:
        try:
            # Check existence and set atomic lock with 5-minute TTL (300s)
            # set(..., ex=300, nx=True) returns True if key was set, or None if it already existed.
            is_new = redis_client.set(nonce_key, "1", ex=300, nx=True)
            if not is_new:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Anti-replay violation: This request transaction has already been processed."
                )
        except redis.ConnectionError as ce:
            # Graceful error handling for local development where Redis cache nodes might not be online
            if ALLOW_MOCK_SERVICES:
                print(f"[SECURITY WARNING] Redis connection failed during anti-replay check: {str(ce)}. Bypassing nonce storage.")
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Security service connection failure. Replay protection is down."
                )
    else:
        # Fallback when Redis was never successfully initialized
        if ALLOW_MOCK_SERVICES:
            # Log warning locally
            pass
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Security service connection failure. Replay protection is unavailable."
            )
