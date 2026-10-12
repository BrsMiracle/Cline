#!/usr/bin/env bash
# Scan every branch AND the full commit history of a repo for secrets and PII.
#
#   tools/scan_secrets.sh [repo-dir]      (default: current directory)
#
# Uses `git grep` over every commit rather than walking objects by hand, so it
# also covers files that were deleted from every branch.
set -uo pipefail
REPO="${1:-.}"
cd "$REPO" || exit 1

PATTERNS=$(mktemp)
trap 'rm -f "$PATTERNS"' EXIT
cat > "$PATTERNS" <<'PEOF'
gh[pousr]_[A-Za-z0-9]{20,}
github_pat_[A-Za-z0-9_]{20,}
sk-ant-[A-Za-z0-9_-]{20,}
sk-(proj-)?[A-Za-z0-9_-]{32,}
AKIA[0-9A-Z]{16}
aws_secret_access_key
yAIzaSy[A-Za-z0-9_-]{33}
xox[baprs]-[0-9A-Za-z-]{10,}
hooks\.slack\.com/services
discord(app)?\.com/api/webhooks
-----BEGIN [A-Z ]*PRIVATE KEY-----
https?://[A-Za-z0-9._%-]+:[^[:space:]@/]{6,}@
[Aa]uthorization["'"'":= ]+[Bb]earer[[:space:]]+[A-Za-z0-9._-]{20,}
(^|[^0-9])1[3-9][0-9]{9}([^0-9]|$)
[0-9]{17}[0-9Xx]
(^|[^0-9A-Za-z])[1-9][0-9]{15,18}([^0-9]|$)
PEOF

commits=$(git rev-list --all)
n=$(echo "$commits" | wc -l)
echo "repo:   $(pwd)"
echo "refs:   $(git branch -r | wc -l) remote branches"
echo "commits scanned: $n"
echo "-------------------------------------------------------------------"
hits=0
while IFS= read -r p; do
  [ -z "$p" ] && continue
  r=$(git grep -lE "$p" $commits 2>/dev/null | head -5)
  if [ -n "$r" ]; then
    hits=$((hits+1))
    echo "★ $p"
    echo "$r" | sed 's/^/    /'
  fi
done < "$PATTERNS"
echo "-------------------------------------------------------------------"
if [ "$hits" -eq 0 ]; then
  echo "no matches -> no credentials or PII found"
else
  echo "$hits pattern(s) matched - verify each one by hand (base64 image data,"
  echo "getty timestamps and long counters are the usual false positives)."
fi
