#!/bin/bash
# 在目标 Mac 上双击运行，解除 macOS 对未签名应用的拦截（显示「已损坏」时）

set -e

APP="/Applications/Code Assignment Grader.app"

if [ ! -d "$APP" ]; then
  osascript -e 'display alert "未找到应用" message "请先把 Code Assignment Grader 拖到「应用程序」文件夹，再运行此脚本。"'
  exit 1
fi

xattr -cr "$APP"
osascript -e 'display alert "已完成" message "现在可以从启动台或应用程序文件夹正常打开 Code Assignment Grader。"'
