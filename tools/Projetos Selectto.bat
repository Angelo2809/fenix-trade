@echo off
setlocal EnableExtensions
title Projetos Selectto

set "PROJECTS_ROOT=%USERPROFILE%\Documents\Projetos\"
if exist "%~dp0orbit\tools\orbit bst.bat" set "PROJECTS_ROOT=%~dp0"
if exist "%~dp0..\..\orbit\tools\orbit bst.bat" set "PROJECTS_ROOT=%~dp0..\..\"

if not exist "%PROJECTS_ROOT%fenix-trade\tools\Fenix Painel.bat" goto missing_projects

:menu
cls
echo ==============================================
echo  Projetos Selectto - Selecione o projeto
echo ==============================================
echo.
echo  1 - Orbit BST
echo  2 - Angelera SaaS
echo  3 - Selectto Finance
echo  4 - HelpDrive
echo  5 - Fenix Trade
echo  0 - Sair
echo.
set "CHOICE="
set /p "CHOICE=Digite uma opcao: "
if not defined CHOICE exit /b 0

if "%CHOICE%"=="1" goto orbit
if "%CHOICE%"=="2" goto angelera
if "%CHOICE%"=="3" goto finance
if "%CHOICE%"=="4" goto helpdrive
if "%CHOICE%"=="5" goto fenix
if "%CHOICE%"=="0" exit /b 0
echo.
echo Opcao invalida.
pause
goto menu

:orbit
call "%PROJECTS_ROOT%orbit\tools\orbit bst.bat"
goto menu

:angelera
call "%PROJECTS_ROOT%Angelera-SaaS\tools\Angelera SaaS Painel.bat"
goto menu

:finance
call "%PROJECTS_ROOT%finance\tools\Selectto Finance Painel.bat"
goto menu

:helpdrive
call "%PROJECTS_ROOT%help-drive\tools\HelpDrive Painel.bat"
goto menu

:fenix
call "%PROJECTS_ROOT%fenix-trade\tools\Fenix Painel.bat"
goto menu

:missing_projects
echo.
echo Pasta de projetos nao encontrada:
echo %PROJECTS_ROOT%
echo.
pause
exit /b 1
