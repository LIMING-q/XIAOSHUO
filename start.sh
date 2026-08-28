#!/bin/bash
cd "$(dirname "$0")"

if ! command -v node &> /dev/null; then
    echo ""
    echo "  [错误] 未检测到 Node.js"
    echo "  请先安装：https://nodejs.org"
    echo ""
    exit 1
fi

echo ""
echo "  正在启动墨泉..."
echo ""
node start-server.js "$@"
