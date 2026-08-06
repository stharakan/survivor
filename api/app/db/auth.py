"""Port of lib/db.ts User operations (Rank 1 -- see CR-105-FINDINGS.md Table 1,
1.1-1.5). JWT issuance/verification itself is a Phase 2 concern (routes); this
module is just the user-record CRUD lib/db.ts already centralized.
"""
from datetime import datetime, timezone
from typing import Optional

import bcrypt
from bson import ObjectId
from pymongo import ReturnDocument

from app.db.mongodb import get_database, Collections
from app.models.user import User

# Sentinel distinguishing "caller didn't pass this field" from "caller passed
# None/empty" -- mirrors TS's `updates.name !== undefined` check in updateUser,
# which a plain `Optional[str] = None` default can't express (None would be
# ambiguous between "not provided" and "clear the name").
_UNSET = object()


async def create_user(email: str, password: str) -> User:
    """Port of lib/db.ts:15-29."""
    db = get_database()
    hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

    result = await db[Collections.USERS].insert_one({
        "email": email,
        "password": hashed_password,
        "createdAt": datetime.now(timezone.utc),
    })

    return User(id=str(result.inserted_id), email=email)


async def get_user_by_email(email: str) -> Optional[User]:
    """Port of lib/db.ts:31-42."""
    db = get_database()
    user = await db[Collections.USERS].find_one({"email": email})
    if not user:
        return None
    return User(id=str(user["_id"]), email=user["email"], name=user.get("name"))


async def get_user_by_id(user_id: str) -> Optional[User]:
    """Port of lib/db.ts:44-55."""
    db = get_database()
    user = await db[Collections.USERS].find_one({"_id": ObjectId(user_id)})
    if not user:
        return None
    return User(id=str(user["_id"]), email=user["email"], name=user.get("name"))


async def verify_password(email: str, password: str) -> Optional[User]:
    """Port of lib/db.ts:57-71."""
    db = get_database()
    user = await db[Collections.USERS].find_one({"email": email})
    if not user:
        return None

    is_valid = bcrypt.checkpw(password.encode("utf-8"), user["password"].encode("utf-8"))
    if not is_valid:
        return None

    return User(id=str(user["_id"]), email=user["email"], name=user.get("name"))


async def update_user(user_id: str, name=_UNSET) -> Optional[User]:
    """Port of lib/db.ts:73-94. Only `name` is updatable today, matching the TS
    signature (`Partial<Pick<User, 'name'>>`)."""
    db = get_database()
    update_data: dict = {}
    if name is not _UNSET:
        update_data["name"] = (name.strip() if name else None) or None

    result = await db[Collections.USERS].find_one_and_update(
        {"_id": ObjectId(user_id)},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        return None

    return User(id=str(result["_id"]), email=result["email"], name=result.get("name"))
