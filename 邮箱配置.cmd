@echo off
set "DSH_MAIL_NODE=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%DSH_MAIL_NODE%" set "DSH_MAIL_NODE=node"
"%DSH_MAIL_NODE%" "%~dp0scripts\configure-email.mjs"
if errorlevel 1 pause
