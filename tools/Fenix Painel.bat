@echo off
setlocal
title Fenix Trade - Painel
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0fenix-control.ps1" %*
if errorlevel 1 (
  echo.
  echo O painel do Fenix encontrou um erro.
  pause
)
