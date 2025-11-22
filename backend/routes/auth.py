from fastapi import APIRouter, HTTPException, status
from models.user import UserCreate, UserLogin, Token, UserResponse
from utils.auth import get_password_hash, verify_password, create_access_token
from database import get_database
from datetime import datetime
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate):
    """Register a new user"""
    db = get_database()

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

    # Create user document
    user_doc = {
        "username": user_data.username,
        "email": user_data.email,
        "hashed_password": get_password_hash(user_data.password),
        "role": user_data.role.value,
        "createdAt": datetime.utcnow()
    }

    try:
        result = db.users.insert_one(user_doc)
        user_id = str(result.inserted_id)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already exists"
        )

    # Create access token
    access_token = create_access_token(data={"sub": user_id})

    # Prepare user response
    user_response = UserResponse(
        id=user_id,
        username=user_data.username,
        email=user_data.email,
        role=user_data.role,
        createdAt=user_doc["createdAt"]
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

    # Create access token
    user_id = str(user["_id"])
    access_token = create_access_token(data={"sub": user_id})

    # Prepare user response
    user_response = UserResponse(
        id=user_id,
        username=user["username"],
        email=user["email"],
        role=user["role"],
        createdAt=user["createdAt"]
    )

    return Token(access_token=access_token, user=user_response)
