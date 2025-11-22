from pymongo import MongoClient
from pymongo.database import Database
import logging
import os
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

class MongoDB:
    client: MongoClient = None
    db: Database = None

mongodb = MongoDB()

def connect_to_mongo():
    """Connect to MongoDB"""
    try:
        mongodb.client = MongoClient(os.getenv("MONGODB_URL"))
        mongodb.db = mongodb.client[os.getenv("MONGODB_DB_NAME")]

        # Create indexes
        mongodb.db.users.create_index("email", unique=True)
        mongodb.db.users.create_index("username", unique=True)
        mongodb.db.videos.create_index("userId")
        mongodb.db.videos.create_index([("userId", 1), ("uploadDate", -1)])

        logger.info("Connected to MongoDB successfully")
    except Exception as e:
        logger.error(f"Could not connect to MongoDB: {e}")
        raise

def close_mongo_connection():
    """Close MongoDB connection"""
    if mongodb.client:
        mongodb.client.close()
        logger.info("Closed MongoDB connection")

def get_database() -> Database:
    """Get database instance"""
    return mongodb.db
