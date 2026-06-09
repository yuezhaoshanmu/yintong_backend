"""
Moderation module for "银童共育" Backend Service.
Integrates Alibaba Cloud Content Moderation Enhanced Version (阿里云内容安全文本审核增强版)
and executes a fast local dictionary pre-filtering array (blacklist/whitelist).

Implements:
- A custom DatabaseSecurityException for security rule violations.
- A local pre-filtering system (checks whitelist first, then blacklist).
- A wrapper for Aliyun Text Moderation API (with dry-run/mock fallbacks).
- Asynchronous BackgroundTasks moderation handler for "save-first, moderate-later" processing of voice messages.

Comment Density > 20%
"""

import os
import json
import logging
from typing import Tuple, List, Optional
from fastapi import HTTPException, status

# Try importing Alibaba Cloud Content Moderation SDK
try:
    from alibabacloud_green20220302.client import Client as GreenClient
    from alibabacloud_green20220302 import models as green_models
    from alibabacloud_tea_openapi import models as open_models
    HAS_ALIYUN_SDK = True
except ImportError:
    HAS_ALIYUN_SDK = False

# Logger config
logger = logging.getLogger("yintong.moderation")

# =====================================================================
# EXCEPTIONS & CONFIGURATION
# =====================================================================

class DatabaseSecurityException(Exception):
    """
    Custom exception raised when content moderation triggers high-risk alerts
    or custom blacklist rules. Intercepted globally by FastAPI handlers.
    """
    def __init__(self, message: str, code: str = "CONTENT_SECURITY_VIOLATION"):
        super().__init__(message)
        self.message = message
        self.code = code


# Fetch Alibaba Cloud Access Credentials
ALIBABA_CLOUD_ACCESS_KEY_ID = os.environ.get("ALIBABA_CLOUD_ACCESS_KEY_ID", "")
ALIBABA_CLOUD_ACCESS_KEY_SECRET = os.environ.get("ALIBABA_CLOUD_ACCESS_KEY_SECRET", "")
# Endpoint regions: green-cip.cn-shanghai.aliyuncs.com (default) or green-cip.cn-hangzhou.aliyuncs.com
ALIBABA_CLOUD_REGION_ID = os.environ.get("ALIBABA_CLOUD_REGION_ID", "cn-shanghai")
ALLOW_MOCK_SERVICES = os.environ.get("ALLOW_MOCK_SERVICES", "True").lower() == "true"

# Local pre-filtering dictionary definitions
DEFAULT_BLACKLIST = [
    "危险药水", "假药瓶", "刀子", "火机", "毒品", "假药", "特效仙丹", 
    "退烧神药", "境外理财", "转账汇款", "杀猪盘", "汇款转账", "中奖免费"
]

DEFAULT_WHITELIST = [
    "白兔糖", "收音机", "永久牌自行车", "二八大杠", "白糖球", "铜车铃",
    "老式电台", "大风车"
]


# Initialize Alibaba Cloud Content Moderation client
ali_green_client = None
if HAS_ALIYUN_SDK and ALIBABA_CLOUD_ACCESS_KEY_ID and ALIBABA_CLOUD_ACCESS_KEY_SECRET:
    try:
        endpoint_domain = f"green-cip.{ALIBABA_CLOUD_REGION_ID}.aliyuncs.com"
        config = open_models.Config(
            access_key_id=ALIBABA_CLOUD_ACCESS_KEY_ID,
            access_key_secret=ALIBABA_CLOUD_ACCESS_KEY_SECRET,
            endpoint=endpoint_domain
        )
        ali_green_client = GreenClient(config)
        logger.info(f"Alibaba Cloud Content Moderation client successfully initialized on {endpoint_domain}")
    except Exception as e:
        logger.error(f"Failed to initialize Aliyun Green Client: {str(e)}")
else:
    logger.warning("Alibaba Cloud credentials missing or SDK not installed. Running in local dictionary + Mock mode.")


# =====================================================================
# LOCAL DICTIONARY PRE-FILTERING
# =====================================================================

class ContentFilter:
    """
    Helper class for local dictionary pre-filtering using blacklists/whitelists.
    Allows rapid filtering of strings without network round-trips.
    """
    def __init__(self, blacklist: List[str] = None, whitelist: List[str] = None):
        self.blacklist = blacklist if blacklist is not None else DEFAULT_BLACKLIST
        self.whitelist = whitelist if whitelist is not None else DEFAULT_WHITELIST

    def pre_filter(self, text: str) -> Tuple[bool, str, Optional[str]]:
        """
        Executes fast pre-filtering on text.
        1. Normalizes the string.
        2. Removes whitelist terms from text checking to avoid false positives.
        3. Scans for blacklist occurrences in the remainder.
        
        Returns:
          (is_passed: bool, clean_text: str, hit_reason: Optional[str])
        """
        if not text:
            return True, "", None

        normalized = text.strip()
        temp_text = normalized.lower()

        # Step A: Filter out whitelist keywords from the temp text to prevent false positives
        # E.g., If "白兔糖" is whitelisted, checking text "这个白兔糖不危险" won't trigger "危险" in the blacklist
        for white_word in self.whitelist:
            temp_text = temp_text.replace(white_word.lower(), "")

        # Step B: Perform exact substring matching on blacklist items
        for black_word in self.blacklist:
            if black_word.lower() in temp_text:
                # Calculate masked string
                masked = "*" * len(normalized)
                return False, masked, f"Local dictionary hit: {black_word}"

        return True, normalized, None


# Instantiated global filter
local_filter = ContentFilter()


# =====================================================================
# ALIBABA CLOUD CONTENT MODERATION CLIENT CALL
# =====================================================================

def call_aliyun_moderation_api(text: str) -> Tuple[bool, str, Optional[str]]:
    """
    Calls Alibaba Cloud Content Moderation Enhanced Version API for text audit.
    If the API returns risk assessment "high" or a custom library hit "C_customized",
    returns (False, masked_text, reason).
    
    If credentials are missing or the API call fails, falls back to Mock mode
    if ALLOW_MOCK_SERVICES is enabled.
    """
    if not text:
        return True, "", None

    # If the Client is configured, make the official SDK remote request
    if ali_green_client is not None:
        try:
            # Structuring the service parameter mapping
            # "comment_detection" is standard for general social text and user comments
            service_params = json.dumps({"content": text})
            request = green_models.TextModerationRequest(
                service="comment_detection",
                service_parameters=service_params
            )
            
            # Send synchronous request
            response = ali_green_client.text_moderation(request)
            
            # Alibaba Cloud Green 2.0 response parsing
            if response.status_code == 200:
                result_data = response.body
                # Standard response format holds details under results/labels
                # Check for risk assessment or custom hits
                # In Green 2.0, the response contains a JSON string or dict
                # E.g., result_data: { "code": 200, "data": { "labels": "...", "reason": "...", "riskLevel": "high" } }
                body_dict = json.loads(result_data) if isinstance(result_data, str) else result_data
                
                if body_dict and "data" in body_dict:
                    data_payload = body_dict["data"]
                    risk_level = data_payload.get("riskLevel", "low").lower()
                    labels = data_payload.get("labels", "")
                    
                    # Mandate: If custom library hit "C_customized" or risk assessment as "high"
                    if risk_level == "high" or "c_customized" in labels.lower():
                        masked = "*" * len(text)
                        reason = f"Aliyun Content Safety Block. Risk: {risk_level.upper()}, Labels: {labels}"
                        return False, masked, reason
                        
                return True, text, None
            else:
                logger.error(f"Aliyun API returned status code {response.status_code}")
                # Fall through to mock logic on connection error if allowed
        except Exception as err:
            logger.error(f"Aliyun API network failure: {str(err)}")
            # Fall through to mock logic on connection error if allowed

    # Mock mode fallback (useful for local development and testing)
    if ALLOW_MOCK_SERVICES:
        logger.warning(f"Mocking Aliyun Content Moderation for text: '{text}'")
        # Custom mock block rules for testing
        text_lower = text.lower()
        if "c_customized" in text_lower or "high-risk" in text_lower or "诈骗" in text_lower or "转账" in text_lower:
            masked = "*" * len(text)
            reason = "Mocked Aliyun Block: custom library hit 'C_customized' / high-risk words detected"
            return False, masked, reason
        return True, text, None

    # If mock services are not allowed and the real client failed, we raise a system exception
    raise DatabaseSecurityException("Alibaba Cloud Moderation service is currently unreachable and mock fallback is disabled.")


# =====================================================================
# DUAL-STAGE SYNCHRONOUS MODERATION
# =====================================================================

def moderate_content_sync(text: str) -> str:
    """
    Synchronously moderates text.
    1. Runs local whitelist/blacklist pre-filter.
    2. Runs Alibaba Cloud Content Moderation API.
    
    If either blocks the content:
      - Masks text to asterisks.
      - Raises a DatabaseSecurityException.
    Otherwise, returns the clean text.
    """
    # Stage 1: Local Pre-filter
    local_passed, local_text, local_reason = local_filter.pre_filter(text)
    if not local_passed:
        logger.warning(f"Content blocked by Local Dictionary: {local_reason}")
        raise DatabaseSecurityException(
            message=f"Database security policy block: {local_reason}",
            code="LOCAL_DICTIONARY_BLOCK"
        )

    # Stage 2: Alibaba Cloud Moderation
    api_passed, api_text, api_reason = call_aliyun_moderation_api(local_text)
    if not api_passed:
        logger.warning(f"Content blocked by Alibaba Cloud API: {api_reason}")
        raise DatabaseSecurityException(
            message=f"Database security policy block: {api_reason}",
            code="ALIYUN_MODERATION_BLOCK"
        )

    return api_text


# =====================================================================
# ASYNCHRONOUS BACKGROUND TASK WORKFLOW (Save-First, Moderate-Later)
# =====================================================================

def moderate_voice_message_async(
    db_session_factory,
    message_id: int,
    raw_text: str
) -> None:
    """
    Asynchronously processes moderation for a voice message (Background task).
    Updates the message text (masks if blocked), changes the message status,
    and logs the result in `moderation_logs` table.
    
    This operates out-of-band to prevent third-party API network latency 
    from blocking the main application response thread.
    """
    # Open a new database connection since this runs in a separate background thread
    db = db_session_factory()
    try:
        from models import VoiceMessage, ModerationLog
        from datetime import datetime
        
        # 1. Retrieve the message record
        msg = db.query(VoiceMessage).filter(VoiceMessage.id == message_id).first()
        if not msg:
            logger.error(f"[ASYNC MODERATION] VoiceMessage ID {message_id} not found in database.")
            return

        # 2. Stage A: Run Local pre-filter check
        local_passed, local_text, local_reason = local_filter.pre_filter(raw_text)
        
        if not local_passed:
            # Block and update immediately
            msg.text = local_text
            msg.status = "BLOCKED"
            
            # Log the security exception/event
            log_entry = ModerationLog(
                type="VOICE",
                content=raw_text,
                status="BLOCKED",
                reason=local_reason,
                timestamp=datetime.utcnow()
            )
            db.add(log_entry)
            db.commit()
            logger.info(f"[ASYNC MODERATION] Message {message_id} BLOCKED by local dict.")
            return

        # 3. Stage B: Run Alibaba Cloud API check
        api_passed, api_text, api_reason = call_aliyun_moderation_api(local_text)
        
        if not api_passed:
            # Block and mask
            msg.text = api_text
            msg.status = "BLOCKED"
            
            log_entry = ModerationLog(
                type="VOICE",
                content=raw_text,
                status="BLOCKED",
                reason=api_reason,
                timestamp=datetime.utcnow()
            )
            db.add(log_entry)
            logger.info(f"[ASYNC MODERATION] Message {message_id} BLOCKED by Aliyun API.")
        else:
            # Pass and approve
            msg.text = api_text
            msg.status = "APPROVED"
            
            log_entry = ModerationLog(
                type="VOICE",
                content=raw_text,
                status="PASS",
                reason="Passed all security levels",
                timestamp=datetime.utcnow()
            )
            db.add(log_entry)
            logger.info(f"[ASYNC MODERATION] Message {message_id} APPROVED.")
            
        db.commit()
    except Exception as e:
        logger.error(f"[ASYNC MODERATION] Error during async moderation for message {message_id}: {str(e)}")
        db.rollback()
    finally:
        db.close()
