@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ATUALIZAR-SEM-CHAVE.ps1"
pause
