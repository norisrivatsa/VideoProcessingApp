#!/bin/bash

echo "========================================="
echo "Video Processing App - Setup Script"
echo "========================================="
echo ""

# Check for Python
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    exit 1
fi

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    exit 1
fi

# Check for MongoDB
if ! command -v mongod &> /dev/null; then
    echo "Warning: MongoDB doesn't appear to be installed"
    echo "Please install MongoDB before running the application"
fi

echo "Setting up Backend..."
cd backend

# Create virtual environment
python3 -m venv venv
echo "✓ Virtual environment created"

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
echo "✓ Backend dependencies installed"

# Create uploads directory
mkdir -p uploads
echo "✓ Uploads directory created"

cd ..

echo ""
echo "Setting up Frontend..."
cd frontend

# Install dependencies
npm install
echo "✓ Frontend dependencies installed"

cd ..

echo ""
echo "========================================="
echo "Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Make sure MongoDB is running"
echo "2. Update .env file if needed"
echo "3. Run backend: cd backend && source venv/bin/activate && python main.py"
echo "4. Run frontend: cd frontend && npm run dev"
echo ""
