#!/bin/bash

echo "Starting Backend Server..."
cd backend

# Activate virtual environment
source venv/bin/activate

# Run the server
python main.py
