"""
Main Application Entrypoint for "银童共育" Backend Service.
Initializes FastAPI, sets up CORS middleware, registers routers under the '/api' prefix,
configures global security exception handlers, and auto-generates tables on startup.

Comment Density > 20%
"""

import logging
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from models import Base, engine
from routes import router as api_router
from moderation import DatabaseSecurityException

# =====================================================================
# LOGGER CONFIGURATION
# =====================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("yintong.main")


# =====================================================================
# DATABASE SCHEMAS AUTO-CREATION & SEEDING
# =====================================================================
try:
    logger.info("Initializing database schemas...")
    # Base.metadata.create_all will automatically construct MySQL tables
    # if they do not exist yet. Safe for dev and container deployments.
    Base.metadata.create_all(bind=engine)
    logger.info("Database schemas initialized successfully.")
except Exception as e:
    logger.error(f"Failed to auto-initialize database tables: {str(e)}")


def seed_database():
    """
    Seeds initial platform user data, nostalgia pins, voice messages,
    and moderation records if the database is currently empty.
    Runs dynamically so encrypted values are generated using current keys.
    """
    from models import SessionLocal, User, NostalgiaPin, VoiceMessage, ModerationLog
    from security import get_password_hash
    
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            logger.info("Database is empty. Seeding platform defaults...")
            
            # A. Create Users (Names and Phones automatically encrypted)
            daughter = User(username="daughter_wang", role="ADMIN")
            daughter.hashed_password = get_password_hash("securepass123")
            daughter.real_name_decrypted = "王女士"
            daughter.phone_number_decrypted = "13800138000"
            daughter.device_mapping_credential_decrypted = "guardian-terminal-99"
            db.add(daughter)

            elder = User(username="elder_grandpa", role="ELDER")
            elder.hashed_password = get_password_hash("securepass123")
            elder.real_name_decrypted = "李爷爷"
            elder.phone_number_decrypted = "13900139000"
            elder.device_mapping_credential_decrypted = "elder-tablet-101"
            db.add(elder)

            child = User(username="child_mengmeng", role="CHILD")
            child.hashed_password = get_password_hash("securepass123")
            child.real_name_decrypted = "萌萌"
            child.phone_number_decrypted = "13500135000"
            child.device_mapping_credential_decrypted = "child-sandbox-55"
            db.add(child)
            
            # Commit users so they acquire keys/ids
            db.commit()

            # B. Create Nostalgia Pins (stored in WGS-84)
            pin1 = NostalgiaPin(
                title="老红专合作社的白兔糖",
                description="那时一分钱能买两颗，纸壳包着的甜味，是我们那代人童年里最珍贵、最香甜的记忆。",
                year="1975年",
                latitude=39.90923,
                longitude=116.397428,
                likes=4,
                creator_id=elder.id
            )
            db.add(pin1)

            pin2 = NostalgiaPin(
                title="大院里的第一台黑白电视机",
                description="全村老小几十口人都围在我们家门口，磕着瓜子，只为了看一集那几个闪烁跳动的黑白西游记人影。",
                year="1982年",
                latitude=39.915,
                longitude=116.400,
                likes=3,
                creator_id=elder.id
            )
            db.add(pin2)

            pin3 = NostalgiaPin(
                title="胡同口嗡嗡作响的竹编大风车",
                description="风一吹，那大风车就发出了清脆欢快的竹鸣声，孩子们骑着竹木马，跟着大风车跑过了一整个灿烂的夏天。",
                year="1990年",
                latitude=39.905,
                longitude=116.390,
                likes=5,
                creator_id=elder.id
            )
            db.add(pin3)

            # C. Create Voice Messages
            msg1 = VoiceMessage(
                sender_id=child.id,
                receiver_id=elder.id,
                text="爷爷，您说的那个白兔糖真的那么甜吗？下次等我放假，带我一起去胡同小卖部买吧！我想听你讲过去的故事。",
                duration_seconds=15,
                status="APPROVED",
                is_unread=True
            )
            db.add(msg1)

            msg2 = VoiceMessage(
                sender_id=daughter.id,
                receiver_id=elder.id,
                text="爸，今天的降压药记得在吃完午饭后准时吃绿色的那颗。萌萌今天下课说要跟你一起连麦拼收音机，别忘了开视频呀！",
                duration_seconds=22,
                status="APPROVED",
                is_unread=False,
                replied_text="好嘞，药已经吃下去了！晚上等你们回家连麦，爷爷把新拼好的收音机留给萌萌看。"
            )
            db.add(msg2)

            # D. Create Moderation Logs
            log1 = ModerationLog(
                type="ASR",
                content="“爷爷，我们今天下午放学什么时候一起去公园看喂小鸭子呀？”",
                status="PASS"
            )
            log2 = ModerationLog(
                type="ASR",
                content="“[敏感词过滤] 赶紧把那个藏在线盒后面的危险假药水放下！”",
                status="BLOCKED",
                reason="触发【药敏药品词】安全风险过滤"
            )
            db.add(log1)
            db.add(log2)

            db.commit()
            logger.info("Database seeding successfully completed.")
    except Exception as ex:
        db.rollback()
        logger.error(f"Failed to seed initial database: {str(ex)}")
    finally:
        db.close()



# =====================================================================
# FASTAPI APP INITIALIZATION
# =====================================================================
app = FastAPI(
    title="银童共育 全龄智慧服务平台 Backend REST Engine",
    description="Secure, decoupled API service for Silver-Child cross-generational interaction.",
    version="1.0.0"
)

# Configure CORS to allow frontend communication
# Customize allowed origins in production for maximum safety
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_seeding():
    """Trigger the database seeding on application startup."""
    seed_database()


# =====================================================================
# GLOBAL EXCEPTION HANDLERS (SECURITY WALL)
# =====================================================================

@app.exception_handler(DatabaseSecurityException)
async def database_security_exception_handler(request: Request, exc: DatabaseSecurityException):
    """
    Globally catches content safety policy violations and database security exceptions.
    Ensures that bad data attempts are abortive, masked, and return a clean HTTP 400 Bad Request
    with consistent security codes to the front-end clients.
    """
    logger.warning(f"Database security policy violation blocked at path {request.url.path}: {exc.message}")
    
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "success": False,
            "error_code": exc.code,
            "message": exc.message,
            "timestamp": datetime_string_now()
        }
    )


def datetime_string_now() -> str:
    """Convenience helper returning ISO formatted time string."""
    from datetime import datetime
    return datetime.utcnow().isoformat()


# =====================================================================
# MOUNT ROUTERS & HEALTH CHECK
# =====================================================================

# Mount the modular router under /api
app.include_router(api_router, prefix="/api")


@app.get("/health", status_code=status.HTTP_200_OK)
def health_check():
    """Health check endpoint utilized by Docker healthchecks to verify engine status."""
    return {
        "status": "healthy",
        "service": "yintong-backend-rest-engine",
        "timestamp": datetime_string_now()
    }
