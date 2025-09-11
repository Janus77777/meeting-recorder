@echo off
echo Starting 會議轉錄工具 in DEVELOPMENT mode...
echo.

echo Setting NODE_ENV to development...
set NODE_ENV=development

echo Starting Electron with development settings...
call npm run electron

echo.
echo Application closed.
pause