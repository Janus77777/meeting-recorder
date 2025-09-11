@echo off
echo Building 會議轉錄工具 for production...
echo.

echo Step 1/2: Building application...
call npm run build

if %errorlevel% neq 0 (
    echo Build failed! Please check the errors above.
    pause
    exit /b 1
)

echo.
echo Step 2/2: Starting application...
call npm run electron

echo.
echo Application closed.
pause