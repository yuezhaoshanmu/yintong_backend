"""
Routes and REST controllers module for "银童共育" Backend Service.
Defines FastAPI routes for user authorization, LBS nostalgia pins, ASR voice messaging, 
and guardian-level administrative controls.
Uses dependency injection for database connections, JWT authentication, and request anti-replay nonces.

Comment Density > 20%
"""

from typing import List, Optional, Dict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from models import get_db, User, NostalgiaPin, VoiceMessage, ModerationLog, SessionLocal
from security import (
    get_current_user, verify_anti_replay, verify_password, get_password_hash,
    create_access_token, generate_blind_index,
    admin_required, elder_required, child_required, family_required
)
from moderation import (
    moderate_content_sync, moderate_voice_message_async, 
    local_filter, DatabaseSecurityException
)
from lbs import wgs84_to_gcj02, get_bounding_box, haversine_distance, cluster_pins

# Create individual sub-routers under main API namespace
router = APIRouter()


# =====================================================================
# PYDANTIC SCHEMAS (DATA VALIDATION)
# =====================================================================

class UserRegister(BaseModel):
    username: str = Field(..., max_length=50)
    password: str = Field(..., min_length=6)
    role: str = Field(..., description="ADMIN, ELDER, CHILD, CAREGIVER, VOLUNTEER")
    real_name: str
    phone_number: str
    device_mapping_credential: str

class UserLogin(BaseModel):
    username: Optional[str] = None
    phone_number: Optional[str] = None
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    role: str
    username: str

class PinCreate(BaseModel):
    title: str = Field(..., max_length=100)
    description: str
    year: str
    image_url: Optional[str] = None
    latitude: float
    longitude: float

class MessageCreate(BaseModel):
    receiver_id: Optional[int] = None
    text: str
    audio_url: Optional[str] = None
    duration_seconds: int = 0

class ReplyCreate(BaseModel):
    replied_text: str

class BlacklistUpdate(BaseModel):
    keyword: str


# =====================================================================
# AUTHENTICATION ROUTER
# =====================================================================

@router.post("/auth/register", response_model=dict, status_code=status.HTTP_201_CREATED)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    """
    Registers a new user on the platform.
    Encrypts real name, phone number, and device mapping credentials automatically.
    """
    # Check if username exists
    existing_user = db.query(User).filter(User.username == user_data.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered."
        )

    # Check if phone number is already registered using blind index
    phone_blind = generate_blind_index(user_data.phone_number)
    existing_phone = db.query(User).filter(User.phone_number_blind_index == phone_blind).first()
    if existing_phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone number already registered."
        )

    # Hash user password
    hashed_pwd = get_password_hash(user_data.password)

    # Construct ORM user, accessing decrypted property triggers transparent AES GCM encryption
    new_user = User(
        username=user_data.username,
        hashed_password=hashed_pwd,
        role=user_data.role
    )
    new_user.real_name_decrypted = user_data.real_name
    new_user.phone_number_decrypted = user_data.phone_number
    new_user.device_mapping_credential_decrypted = user_data.device_mapping_credential

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"message": "User successfully registered.", "user_id": new_user.id}


@router.post("/auth/login", response_model=TokenResponse)
def login(login_data: UserLogin, db: Session = Depends(get_db)):
    """
    Logs in a user. Supports standard username lookup or encrypted phone number lookup 
    using $O(1)$ Blind Index exact-matching.
    Returns a stateless signed JWT token.
    """
    user = None
    
    # Method A: Login via Phone Number (Requires blind index resolution)
    if login_data.phone_number:
        phone_blind = generate_blind_index(login_data.phone_number)
        user = db.query(User).filter(User.phone_number_blind_index == phone_blind).first()
    # Method B: Login via Username
    elif login_data.username:
        user = db.query(User).filter(User.username == login_data.username).first()
        
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials."
        )

    # Generate jwt token
    token = create_access_token({"sub": str(user.id), "username": user.username, "role": user.role})
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "username": user.username
    }


# =====================================================================
# NOSTALGIA PINS ROUTER (GEOSPATIAL & LBS)
# =====================================================================

@router.post("/pins", status_code=status.HTTP_201_CREATED, dependencies=[Depends(verify_anti_replay)])
def create_nostalgia_pin(
    pin_data: PinCreate,
    current_user: dict = Depends(family_required),
    db: Session = Depends(get_db)
):
    """
    Creates a new nostalgia memory pin linked to a GPS coordinate (WGS-84).
    Proteutes synchronous moderation checks to prevent saving offensive material.
    Protected by anti-replay nonces in Redis.
    """
    # Run synchronous moderation on the pin's content (title & description combined)
    combined_content = f"{pin_data.title} {pin_data.description}"
    try:
        moderate_content_sync(combined_content)
    except DatabaseSecurityException as dse:
        # Save a safety log record showing the violation attempt
        log_entry = ModerationLog(
            type="ASR",
            content=combined_content,
            status="BLOCKED",
            reason=dse.message,
            timestamp=datetime.utcnow()
        )
        db.add(log_entry)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Security Policy Rejection: {dse.message}"
        )

    # Create the new pin
    new_pin = NostalgiaPin(
        title=pin_data.title,
        description=pin_data.description,
        year=pin_data.year,
        image_url=pin_data.image_url,
        latitude=pin_data.latitude,
        longitude=pin_data.longitude,
        creator_id=int(current_user["id"])
    )
    
    db.add(new_pin)
    db.commit()
    db.refresh(new_pin)
    
    return {"message": "Nostalgia pin created successfully.", "pin_id": new_pin.id}


@router.get("/pins/nearest")
def get_nearest_pins(
    latitude: float = Query(..., description="Query latitude in WGS-84 standard"),
    longitude: float = Query(..., description="Query longitude in WGS-84 standard"),
    radius: float = Query(5000.0, description="Query radius in meters"),
    clustering_threshold: float = Query(200.0, description="Clustering range in meters"),
    db: Session = Depends(get_db)
):
    """
    Geospatial LBS query returning nearest nostalgia pins.
    Optimized: Calculates bounding box in Python first to filter rows via database index search (SQL BETWEEN),
    converts coordinates to GCJ-02, applies exact Haversine filter, and clusters neighboring points.
    """
    # 1. Calculate Bounding Box coordinates in Python
    min_lat, max_lat, min_lng, max_lng = get_bounding_box(latitude, longitude, radius)

    # 2. Query database using index bounds (highly parameterized to prevent SQL Injection)
    candidate_pins = db.query(NostalgiaPin).filter(
        NostalgiaPin.latitude.between(min_lat, max_lat),
        NostalgiaPin.longitude.between(min_lng, max_lng)
    ).all()

    # 3. Filter precisely by distance and convert coordinates to GCJ-02 (Amap/Baidu compatible)
    filtered_pins = []
    for pin in candidate_pins:
        # Calculate distance from query center
        dist = haversine_distance(latitude, longitude, pin.latitude, pin.longitude)
        
        if dist <= radius:
            # Convert stored WGS-84 coordinates to Chinese GCJ-02 datum
            gcj_lng, gcj_lat = wgs84_to_gcj02(pin.longitude, pin.latitude)
            
            filtered_pins.append({
                "id": pin.id,
                "title": pin.title,
                "description": pin.description,
                "year": pin.year,
                "image_url": pin.image_url,
                "latitude": gcj_lat,   # Return GCJ-02 coordinates for frontend map
                "longitude": gcj_lng,  # Return GCJ-02 coordinates for frontend map
                "likes": pin.likes,
                "distance": dist,
                "creator_id": pin.creator_id,
                "created_at": pin.created_at.isoformat()
            })

    # 4. Group adjacent points using the clustering helper
    clustered_nodes = cluster_pins(filtered_pins, clustering_threshold)
    
    return {
        "center_query": {"latitude": latitude, "longitude": longitude, "radius": radius},
        "total_results": len(filtered_pins),
        "clusters": clustered_nodes
    }


# =====================================================================
# VOICE MESSAGING ROUTER (ASYNC CONTENT SAFETY WORKFLOW)
# =====================================================================

@router.post("/messages", status_code=status.HTTP_201_CREATED, dependencies=[Depends(verify_anti_replay)])
def send_voice_message(
    msg_data: MessageCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(family_required),
    db: Session = Depends(get_db)
):
    """
    Sends a voice message transcript.
    "Save-First, Moderate-Later": Immediately stores the message as PENDING,
    and runs content moderation out-of-band via FastAPI's BackgroundTasks 
    to avoid blocking the HTTP response thread with Aliyun API latencies.
    """
    # Create database record immediately
    new_message = VoiceMessage(
        sender_id=int(current_user["id"]),
        receiver_id=msg_data.receiver_id,
        text=msg_data.text,
        audio_url=msg_data.audio_url,
        duration_seconds=msg_data.duration_seconds,
        status="PENDING",
        is_unread=True
    )
    db.add(new_message)
    db.commit()
    db.refresh(new_message)

    # Spawn background task for content safety check (Aliyun + local dict pre-filter)
    background_tasks.add_task(
        moderate_voice_message_async,
        SessionLocal,  # Send database connection factory for separate thread usage
        new_message.id,
        msg_data.text
    )

    return {
        "message": "Voice message queued for delivery and safety auditing.",
        "message_id": new_message.id,
        "status": "PENDING"
    }


@router.get("/messages")
def get_voice_messages(
    current_user: dict = Depends(family_required),
    db: Session = Depends(get_db)
):
    """Retrieves voice messages involving the current user."""
    user_id = int(current_user["id"])
    messages = db.query(VoiceMessage).filter(
        (VoiceMessage.sender_id == user_id) | (VoiceMessage.receiver_id == user_id)
    ).order_by(VoiceMessage.created_at.desc()).all()
    
    return [
        {
            "id": m.id,
            "sender_id": m.sender_id,
            "receiver_id": m.receiver_id,
            "text": m.text,  # Note: text is masked to asterisks if status is BLOCKED
            "audio_url": m.audio_url,
            "duration_seconds": m.duration_seconds,
            "is_unread": m.is_unread,
            "status": m.status,
            "replied_text": m.replied_text,
            "created_at": m.created_at.isoformat()
        } for m in messages
    ]


@router.post("/messages/{msg_id}/reply")
def reply_voice_message(
    msg_id: int,
    reply_data: ReplyCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(family_required),
    db: Session = Depends(get_db)
):
    """
    Replies to a voice message.
    The reply text is moderated asynchronously using BackgroundTasks.
    """
    msg = db.query(VoiceMessage).filter(VoiceMessage.id == msg_id).first()
    if not msg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found."
        )

    # Update immediately
    msg.replied_text = f"[Pending Security Audit] {reply_data.replied_text}"
    db.commit()

    # Define inner task helper to moderate replies asynchronously
    def moderate_reply_task(session_factory, message_id, reply_text):
        session = session_factory()
        try:
            # Perform local dict and Aliyun checks on reply
            clean_reply = moderate_content_sync(reply_text)
            message = session.query(VoiceMessage).filter(VoiceMessage.id == message_id).first()
            if message:
                message.replied_text = clean_reply
                session.commit()
        except DatabaseSecurityException as dse:
            # Mask to asterisks if security violation
            message = session.query(VoiceMessage).filter(VoiceMessage.id == message_id).first()
            if message:
                message.replied_text = "*" * len(reply_text)
                log_entry = ModerationLog(
                    type="VOICE",
                    content=reply_text,
                    status="BLOCKED",
                    reason=f"Reply block: {dse.message}",
                    timestamp=datetime.utcnow()
                )
                session.add(log_entry)
                session.commit()
        finally:
            session.close()

    background_tasks.add_task(
        moderate_reply_task,
        SessionLocal,
        msg.id,
        reply_data.replied_text
    )

    return {"message": "Reply saved and queued for safety audit."}


# =====================================================================
# GUARDIAN ADMIN CONTROL ROUTER
# =====================================================================

@router.get("/admin/logs", dependencies=[Depends(admin_required)])
def get_moderation_logs(db: Session = Depends(get_db)):
    """Retrieves content safety logs showing safety violations. Restricted to ADMIN."""
    logs = db.query(ModerationLog).order_by(ModerationLog.timestamp.desc()).all()
    return logs


@router.get("/admin/blacklist", dependencies=[Depends(admin_required)])
def get_blacklist():
    """Retrieves the current local dictionary blacklist. Restricted to ADMIN."""
    return {"blacklist": local_filter.blacklist}


@router.post("/admin/blacklist", dependencies=[Depends(admin_required)])
def add_to_blacklist(data: BlacklistUpdate):
    """Adds a new word to the local blacklist dictionary. Restricted to ADMIN."""
    word = data.keyword.strip()
    if not word:
        raise HTTPException(status_code=400, detail="Empty word.")
    if word not in local_filter.blacklist:
        local_filter.blacklist.append(word)
    return {"message": f"Word '{word}' added to blacklist.", "blacklist": local_filter.blacklist}


@router.delete("/admin/blacklist/{word}", dependencies=[Depends(admin_required)])
def delete_from_blacklist(word: str):
    """Removes a word from the local blacklist. Restricted to ADMIN."""
    if word in local_filter.blacklist:
        local_filter.blacklist.remove(word)
        return {"message": f"Word '{word}' removed from blacklist."}
    raise HTTPException(status_code=404, detail="Word not found in blacklist.")
