# Putting the Apps folder on GitHub

How this repo was created (Sept 2026), for next time.

## Background

`~/Dropbox/Repos/Apps` holds small static browser apps that publish to
`agentscript.acequia.io` via `uploadApps.js` (WebDAV). It had no git repo of its
own — it was accidentally sitting *inside* a stray empty repo at `~/.git`.

## 1. Clean up the stray home repo

There was a `~/.git` with no commits and nothing tracked (an accidental
`git init` in the home directory at some point). It made VSCode source control
and `git status` show the entire home folder.

```bash
rm -rf /Users/owen/.git   # no commits, nothing tracked — zero data loss
```

## 2. Init the Apps repo

```bash
cd ~/Dropbox/Repos/Apps
git init -b main
printf 'node_modules/\n.DS_Store\n**/.DS_Store\nnpm-debug.log\nyarn-error.log\n' > .gitignore
git add -A
git commit -m "Initial commit"
```

Note: the hardcoded WebDAV token in `getWebDAVClient.js` is a low-risk,
revocable dashboard token — we chose a **public** repo and left it as-is. If
that ever matters, revoke/rotate it in the acequia dashboard and move it to an
untracked file or env var.

## 3. Authenticate the GitHub CLI (one time per machine)

`gh` is the modern way — no manual personal access token needed.

```bash
gh auth login
```

Answers used:

| Prompt | Answer |
| --- | --- |
| What account do you want to log into? | GitHub.com |
| Preferred protocol for Git operations? | HTTPS |
| Authenticate Git with your GitHub credentials? | Yes |
| How would you like to authenticate? | Login with a web browser |

It prints a one-time code (e.g. `1B76-F3BC`), then opens the browser:

1. **Device Activation** → shows "Signed in as backspaces" → **Continue**
2. **Authorize GitHub CLI** → review scopes (gists, org read, repo,
   workflow — all standard) → **Authorize github**
3. **Confirm access** (sudo mode) → passkey / authenticator / password.
   A Google passkey on the account worked here.

Terminal finishes with:

```
✓ Authentication complete.
✓ Configured git protocol
✓ Logged in as backspaces
```

Credentials are stored in the macOS keychain and `gh` acts as git's credential
helper, so `git push` over HTTPS just works from then on.

## 4. Create the GitHub repo and push

One command creates the remote repo, wires up `origin`, and pushes `main`:

```bash
cd ~/Dropbox/Repos/Apps
gh repo create Apps --public --source=. --remote=origin --push
```

## 5. Normal workflow from here

```bash
git add -A && git commit -m "..." && git push
```

## Caveat: git inside Dropbox

This repo lives under `~/Dropbox`. Fine for a solo repo, but if Dropbox ever
syncs mid-write you can get `.git` object corruption. If that happens, the fix
is usually `git fsck` + re-clone from GitHub.
