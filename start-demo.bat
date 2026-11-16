@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\express" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto :error
)

echo Starting climate evidence demo at http://localhost:4173
start "" /b cmd /c "timeout /t 2 >nul & start "" http://localhost:4173"
call npm start
goto :eof

:error
echo Dependency installation failed. Run "npm install" in this folder and try again.
pause
