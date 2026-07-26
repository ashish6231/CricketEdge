#!/bin/bash
# Start both backend + frontend servers

echo "🏏 Starting CricketLiveLoad Analytics Dashboard..."

# Start backend
cd "$(dirname "$0")/cricket_api"
echo "📡 Starting FastAPI backend on port 8000..."
python3 -m uvicorn api_server:app --host 0.0.0.0 --port 8000 &
BACK_PID=$!

# Start frontend
cd "$(dirname "$0")/frontend"
echo "🖥️  Starting React frontend on port 3000..."
npx vite --port 3000 &
FRONT_PID=$!

echo ""
echo "✅ Both servers running!"
echo "   Frontend: http://localhost:3000"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for Ctrl+C
trap "kill $BACK_PID $FRONT_PID 2>/dev/null; echo 'Servers stopped.'; exit" INT TERM
wait
