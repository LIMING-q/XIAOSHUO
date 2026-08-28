@echo off
chcp 65001 >nul
title 墨泉 · AI 小说生成器
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo  [错误] 未检测到 Node.js
    echo  请先安装：https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo.
echo  正在启动墨泉...
echo.
node start-server.js %1
pause
