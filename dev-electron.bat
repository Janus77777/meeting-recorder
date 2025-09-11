@echo off
echo Starting Meeting Recorder in DEVELOPMENT mode...
echo.

echo Setting NODE_ENV to development...
set NODE_ENV=development

echo Starting Electron with development settings...
call npm run electron

echo.
echo Application closed.
pause