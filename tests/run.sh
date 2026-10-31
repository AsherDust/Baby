#!/bin/sh
# 用 macOS 自带的 JavaScriptCore 跑逻辑测试，不需要安装 Node。
cd "$(dirname "$0")/.." || exit 1
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
"$JSC" tests/unit.test.js && "$JSC" tests/sw.test.js
