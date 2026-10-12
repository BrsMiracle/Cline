#!/usr/bin/env bash
# Publish the travel guide to a public GitHub repo so it can be served by
# GitHub Pages (and opened directly in a browser, no download needed).
#
# Usage:  tools/publish_guide.sh [owner/repo]     (default: BrsMiracle/ClineNEW)
#
# GitHub Pages only serves private repos on paid plans, so the guide lives in a
# dedicated public repo. The bot token must have access to that repo — add it
# under Settings -> Applications -> Installed GitHub Apps -> Configure ->
# Repository access.
set -euo pipefail

REPO="${1:-BrsMiracle/ClineNEW}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/singapore-malaysia-november-guide.html"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ ! -f "$SRC" ]; then
  echo "missing $SRC — run: python3 tools/build.py" >&2
  exit 1
fi

cp "$SRC" "$WORK/index.html"
cp "$SRC" "$WORK/singapore-malaysia-november-guide.html"
touch "$WORK/.nojekyll"

OWNER="${REPO%%/*}"
NAME="${REPO##*/}"
cat > "$WORK/README.md" <<EOF
# 新加坡 × 马来西亚 11 月旅行攻略

在线查看：https://${OWNER,,}.github.io/${NAME}/

单文件 HTML，图片全部内嵌为 base64，可直接浏览，也可下载后离线打开。

- \`index.html\` — 攻略本体（11 个章节：机票逐日价格与航班时刻表、主线逐日行程、
  四段陆路交通详解、五城景点与门票、美食、出入境、预算、数据来源）
- \`singapore-malaysia-november-guide.html\` — 同一内容，便于按文件名引用
EOF

cd "$WORK"
git init -q -b main
git add -A
git -c user.name=cline -c user.email=cline@local commit -q -m "Publish Singapore x Malaysia travel guide"
git remote add origin "https://github.com/${REPO}.git"

if git push -q -f -u origin main 2>/dev/null; then
  echo "pushed to ${REPO}"
  echo "now enable Pages: Settings -> Pages -> Source: Deploy from a branch -> main / (root) -> Save"
  echo "site will appear at: https://${OWNER,,}.github.io/${NAME}/"
else
  echo "push to ${REPO} denied. Grant the GitHub App access to that repo:" >&2
  echo "  GitHub -> Settings -> Applications -> Installed GitHub Apps -> Configure -> Repository access" >&2
  exit 1
fi
