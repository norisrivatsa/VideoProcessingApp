#!/bin/bash

# Get the script's directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================="
echo "Video Processing App - Startup Script"
echo "========================================="
echo ""

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo "Shutting down servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
    echo "Shutdown complete"
    exit 0
}

# Set trap to cleanup on Ctrl+C
trap cleanup SIGINT SIGTERM

# Check if MongoDB is running
echo "Checking MongoDB status..."
if systemctl is-active --quiet mongodb || systemctl is-active --quiet mongod; then
    echo "✓ MongoDB is running"
elif pgrep -x mongod > /dev/null; then
    echo "✓ MongoDB is running"
else
    echo "✗ Error: MongoDB is not running!"
    echo ""
    echo "Please start MongoDB first:"
    echo "  sudo systemctl start mongodb"
    echo ""
    exit 1
fi

echo ""
echo "Starting Backend Server..."
cd "$SCRIPT_DIR/backend"
source venv/bin/activate
python main.py &
BACKEND_PID=$!

# Give backend a moment to start
sleep 2

echo ""
echo "Starting Frontend Development Server..."
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "========================================="
echo "Application Started Successfully!"
echo "========================================="
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers"
echo "========================================="
echo ""

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
