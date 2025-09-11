@echo off
echo Starting 會議轉錄工具 in development mode...
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
echo 會議轉錄工具 development setup complete!
pause