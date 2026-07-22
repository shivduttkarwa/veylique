@echo off
REM 1) Commit local code changes first (clean tree needed for a safe pull).
REM 2) Pull the theme editor's latest content (collections, images, added
REM    sections) and replay this commit on top, so local never reverts it.
REM 3) Push.
git add .
git status
set /p msg="Enter commit message: "
git commit -m "%msg%"
echo.
echo Pulling latest from GitHub (includes theme editor changes)...
git pull --rebase origin master
if errorlevel 1 (
  echo.
  echo *** Pull/rebase hit a conflict - resolve it, then run: git rebase --continue ***
  pause
  exit /b 1
)
git push origin master
pause
