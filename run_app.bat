@echo off
cd /d "%~dp0"
if exist "C:\Users\SYOGA\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" (
  "C:\Users\SYOGA\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" server.py
  if errorlevel 1 (
    echo Failed to start the app with the bundled Python runtime.
    pause
    exit /b 1
  )
  exit /b 0
)
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 server.py
  if errorlevel 1 (
    echo Failed to start the app with Python launcher.
    pause
    exit /b 1
  )
  exit /b 0
)
where python >nul 2>nul
if %errorlevel%==0 (
  python server.py
  if errorlevel 1 (
    echo Failed to start the app with Python.
    pause
    exit /b 1
  )
  exit /b 0
)
echo Python was not found on this system.
echo Install Python 3 or Python Launcher for Windows, then try again.
pause
exit /b 1
