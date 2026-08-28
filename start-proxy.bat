@echo off
chcp 65001 >nul
title 墨泉 CORS 代理
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [错误] 未检测到 Node.js，请先安装：https://nodejs.org
  echo.
  pause
  exit /b 1
)
node proxy.js
echo.
echo  代理已退出。
pause
