#!/usr/bin/env bash
# PreToolUse hook: block Claude Code from reading or modifying .env files.
#
# Reads the PreToolUse event JSON from stdin and inspects only the fields that
# name a *target* (never file content or search patterns), so writing docs or
# code that merely mentions ".env" is fine — only touching an actual .env file
# is blocked. `.env.example` (committed, secret-free template) is allowed.
#
# Target fields checked per tool:
#   Bash              -> .command
#   Read/Edit/Write   -> .file_path
#   Grep              -> .path, .glob   (NOT .pattern, so searching for the
#                                        literal text ".env" still works)

input=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: protect-env hook requires jq, which is not installed. Run: brew install jq" >&2
  exit 2
fi

# Pull just the target strings for the tool being invoked. On any parse failure
# jq yields empty output, so nothing is blocked (the harness owns this JSON and
# emits it well-formed).
targets=$(printf '%s' "$input" | jq -r '
  .tool_name as $t
  | .tool_input as $ti
  | if   $t == "Bash"  then ($ti.command   // "")
    elif $t == "Grep"  then [($ti.path // ""), ($ti.glob // "")] | join("\n")
    elif ($t == "Read" or $t == "Edit" or $t == "Write")
                       then ($ti.file_path // "")
    else ""
    end
' 2>/dev/null)

# Remove references to the allowed .env.example, then block if a .env target
# still remains.
stripped=$(printf '%s' "$targets" | sed 's/\.env\.example//g')

if printf '%s' "$stripped" | grep -q '\.env'; then
  echo "Error: Access to .env files is blocked by the protect-env hook (.env.example is allowed)." >&2
  exit 2
fi

exit 0
