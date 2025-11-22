from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    VIEWER = "viewer"
    EDITOR = "editor"
    ADMIN = "admin"

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6)
    role: UserRole = UserRole.VIEWER
    admin_key: Optional[str] = None  # Required for viewer/editor registration

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserInDB(BaseModel):
    id: str = Field(alias="_id")
    userId: str  # 6-character unique identifier
    username: str
    email: str
    hashed_password: str
    role: UserRole
    createdAt: datetime
    admin_key: Optional[str] = None  # For admins: their unique registration key
    registered_by: Optional[str] = None  # For viewers/editors: admin key they used to register
    connected_users: Optional[List[str]] = None  # For admins: list of user IDs registered under them

    class Config:
        populate_by_name = True

class UserResponse(BaseModel):
    id: str
    userId: str  # 6-character unique identifier
    username: str
    email: str
    role: UserRole
    createdAt: datetime
    admin_key: Optional[str] = None  # Only for admins: their unique registration key

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
