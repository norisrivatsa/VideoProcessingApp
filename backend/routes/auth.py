from fastapi import APIRouter, HTTPException, status, Depends
from models.user import UserCreate, UserLogin, Token, UserResponse, UserRole, UserInDB
from utils.auth import get_password_hash, verify_password, create_access_token
from middleware.auth import get_current_user, require_role
from database import get_database
from datetime import datetime
from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from typing import List
import random
import string

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

def generate_user_id(db) -> str:
    """Generate a unique 6-character alphanumeric user ID"""
    while True:
        # Generate 6-character alphanumeric ID (uppercase letters and digits)
        user_id = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

        # Check if this userId already exists
        if not db.users.find_one({"userId": user_id}):
            return user_id

def generate_admin_key() -> str:
    """Generate a unique 12-character admin registration key"""
    # Generate cryptographically secure random key
    characters = string.ascii_letters + string.digits
    return ''.join(random.choices(characters, k=12))

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate):
    """Register a new user"""
    db = get_database()

    # Handle admin key validation based on role
    registered_by_key = None
    admin_key_for_new_admin = None
    admin_id = None  # ID of admin for viewer/editor

    if user_data.role in [UserRole.VIEWER, UserRole.EDITOR]:
        # Viewer/Editor must provide valid admin key
        if not user_data.admin_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Admin key is required for registration"
            )

        # Check if admin key belongs to any admin
        admin = db.users.find_one({
            "role": UserRole.ADMIN.value,
            "admin_key": user_data.admin_key
        })

        if not admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid admin key"
            )

        # Store which admin key was used and admin's userId
        registered_by_key = user_data.admin_key
        admin_id = admin["userId"]

    elif user_data.role == UserRole.ADMIN:
        # Generate unique admin key for new admin
        admin_key_for_new_admin = generate_admin_key()

    # Check if user already exists
    if db.users.find_one({"email": user_data.email}):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    if db.users.find_one({"username": user_data.username}):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )

    # Generate unique userId
    user_id_short = generate_user_id(db)

    # Create user document
    user_doc = {
        "userId": user_id_short,  # 6-character unique ID
        "username": user_data.username,
        "email": user_data.email,
        "hashed_password": get_password_hash(user_data.password),
        "role": user_data.role.value,
        "createdAt": datetime.utcnow(),
        "admin_key": admin_key_for_new_admin,  # Only set for admins
        "registered_by": registered_by_key,  # Only set for viewers/editors
        "connected_users": [] if user_data.role == UserRole.ADMIN else None  # Initialize for admins
    }

    try:
        result = db.users.insert_one(user_doc)
        mongo_id = str(result.inserted_id)  # MongoDB _id for UserResponse.id field
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already exists"
        )

    # If viewer/editor, add their userId to admin's connected_users
    if admin_id:
        db.users.update_one(
            {"userId": admin_id},
            {"$addToSet": {"connected_users": user_id_short}}  # Use 6-char userId, not ObjectId
        )

    # Create access token using userId (not MongoDB _id)
    access_token = create_access_token(data={"sub": user_id_short})

    # Prepare user response
    user_response = UserResponse(
        id=mongo_id,
        userId=user_id_short,
        username=user_data.username,
        email=user_data.email,
        role=user_data.role,
        createdAt=user_doc["createdAt"],
        admin_key=admin_key_for_new_admin  # Include admin key if user is admin
    )

    return Token(access_token=access_token, user=user_response)

@router.post("/login", response_model=Token)
async def login(credentials: UserLogin):
    """Authenticate user and return JWT token"""
    db = get_database()

    # Find user by email
    user = db.users.find_one({"email": credentials.email})

    if not user or not verify_password(credentials.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Create access token using userId (not MongoDB _id)
    access_token = create_access_token(data={"sub": user["userId"]})

    # Prepare user response
    user_response = UserResponse(
        id=str(user["_id"]),  # MongoDB _id for UserResponse.id field
        userId=user.get("userId", ""),  # Get userId or empty string for old users
        username=user["username"],
        email=user["email"],
        role=user["role"],
        createdAt=user["createdAt"],
        admin_key=user.get("admin_key")  # Include admin key if user is admin
    )

    return Token(access_token=access_token, user=user_response)

@router.get("/users", response_model=List[UserResponse])
async def get_admin_users(
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Get all users registered with the current admin's key"""
    db = get_database()

    # Get connected userIds from admin's connected_users array
    connected_user_ids = current_user.connected_users or []

    if not connected_user_ids:
        return []  # No connected users

    # Get all users with userId in connected_users array
    users_cursor = db.users.find({"userId": {"$in": connected_user_ids}})
    users = []

    for user in users_cursor:
        users.append(UserResponse(
            id=str(user["_id"]),
            userId=user.get("userId", ""),
            username=user["username"],
            email=user["email"],
            role=user["role"],
            createdAt=user["createdAt"],
            admin_key=None  # Don't expose admin keys for these users
        ))

    return users
