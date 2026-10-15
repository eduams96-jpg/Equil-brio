@echo off
setlocal
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js / npm nao foi encontrado.
  echo Instala o Node.js LTS e volta a executar este ficheiro.
  pause
  exit /b 1
)
if not exist node_modules\electron\dist\electron.exe (
  echo A preparar o Equilibrio Desktop pela primeira vez...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :error
  if not exist node_modules\electron\dist\electron.exe (
    node node_modules\electron\install.js
    if errorlevel 1 goto :error
  )
)
call npm run desktop
exit /b %errorlevel%
:error
echo.
echo Ocorreu um erro durante a instalacao das dependencias.
pause
exit /b 1
