# curl + WebDAV tutorial

The `agentscript.acequia.io` server is plain WebDAV over HTTPS with
Bearer-token auth, so all of this is just standard HTTP methods via `curl`.

## Setup: get the token into your shell

The token lives in `getWebDAVClient.js`. Pull it out once per shell session:

```sh
TOKEN=$(grep -oE "eyJ[A-Za-z0-9_.-]+" ~/Dropbox/Repos/Apps/getWebDAVClient.js)
```

## Download

**A single file** — plain GET:
```sh
curl -H "Authorization: Bearer $TOKEN" \
  https://agentscript.acequia.io/agentscript/apps/NYC/index.html \
  -o index.html
```

**A folder** — WebDAV/HTTP has no "download folder as zip." List it with
`PROPFIND` (Depth 1), then GET each file:
```sh
curl -s -X PROPFIND -H "Authorization: Bearer $TOKEN" -H "Depth: 1" \
  https://agentscript.acequia.io/agentscript/apps/NYC/ \
  | grep -oE '<href>[^<]+' | sed 's/<href>//'
```
That prints each file's URL (including the folder itself). Loop over the file
URLs with `-o` to save each locally, recreating subfolders with `mkdir -p` as
needed for deeper trees.

## Upload

**A single file** — PUT, `-T` streams the local file as the request body:
```sh
curl -T index.html -H "Authorization: Bearer $TOKEN" \
  https://agentscript.acequia.io/agentscript/apps/NYC/index.html
```

**A folder** — WebDAV directories must exist before you can PUT into them
(`MKCOL`), then PUT each file:
```sh
curl -X MKCOL -H "Authorization: Bearer $TOKEN" \
  https://agentscript.acequia.io/agentscript/apps/MyFolder/

curl -T localfile.txt -H "Authorization: Bearer $TOKEN" \
  https://agentscript.acequia.io/agentscript/apps/MyFolder/localfile.txt
```
For a whole tree: walk your local folder, `MKCOL` each directory (trailing
slash, ignore 405 if it already exists), then `PUT` each file — that's exactly
what `uploadApps.js` automates for you.

## Other useful verbs
- `curl -X DELETE ...` — delete a file or (empty) folder
- `curl -X MOVE -H "Destination: <new-url>" ...` — rename/move

All confirmed working against the live server (verified with a scratch
`curl-test/` folder: uploaded/downloaded/listed/deleted it, then cleaned up).
