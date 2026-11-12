#!/usr/bin/env bash
# Usage: .overnight/commit.sh "message"  — runs checks, refreshes LOCK, commits, pushes overnight-fixes.
set -e
cd "$(git rev-parse --show-toplevel)"
.overnight/check.sh
date -u +%Y-%m-%dT%H:%M:%SZ > .overnight/LOCK
git add -A
git commit -qm "$1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -q origin overnight-fixes
echo "pushed: $1"
