#!/usr/bin/env bash
# PreToolUse hook: block Claude Code from reading or modifying .env files.
# Reads the tool input JSON from stdin and rejects it if it references a .env
# file. `.env.example` is a committed, secret-free template, so it is allowed.

input=$(cat)

# Remove any references to the allowed .env.example, then see whether the input
# still mentions a .env file. This blocks cat/less/Read/Edit/etc. on .env,
# .env.local, .env.prod, ... while permitting .env.example.
stripped=$(printf '%s' "$input" | sed 's/\.env\.example//g')

if printf '%s' "$stripped" | grep -q '\.env'; then
  echo "Error: Access to .env files is blocked by the protect-env hook (.env.example is allowed)." >&2
  exit 2
fi

exit 0
