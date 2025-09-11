@echo off
echo Starting Meeting Recorder in development mode...
echo.

echo Step 1/3: Installing dependencies...
call npm install

echo.
echo Step 2/3: Building main process...
call npm run build:main

echo.
echo Step 3/3: Starting development server and Electron...
start "Dev Server" cmd /k "npm run dev:renderer"

timeout /t 5 /nobreak > nul

echo Starting Electron application...
call npm run electron

echo.
echo Meeting Recorder development setup complete!
pause