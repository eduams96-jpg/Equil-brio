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
  echo A preparar as dependencias de compilacao...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :error
)

echo.
echo A criar o instalador Financas Pessoais Desktop v0.18...
call npm run desktop:check
if errorlevel 1 goto :error
call npm run desktop:build:win
if errorlevel 1 goto :error

echo.
echo Instalador criado com sucesso em:
echo %cd%\dist-desktop
if exist "%cd%\dist-desktop" explorer "%cd%\dist-desktop"
pause
exit /b 0

:error
echo.
echo Nao foi possivel criar o instalador.
echo Nenhum dado pessoal foi alterado.
pause
exit /b 1
