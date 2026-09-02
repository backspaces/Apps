# blog-src

11ty source for the blog. Builds to `../Blog` (the folder that actually gets
deployed by `../uploadApps.js`, same as every other app in `Apps/`). This
folder itself is never uploaded — only its build output is.

No `package.json` / `node_modules` — 11ty is run ad hoc via `npx`, pinned to
major version 3 for stability.

```sh
# from inside blog-src/
npx @11ty/eleventy@3 --serve   # local dev server with live reload
npx @11ty/eleventy@3           # one-off build into ../Blog
```

Then deploy the built site like any other app:

```sh
# from Apps/
deno -A uploadApps.js Blog
```

## Adding a post

Add a new `.md` file under `content/posts/`, e.g.:

```md
---
title: My New Post
date: 2026-07-20
---

Post body here.
```

It picks up the `posts` tag and post layout automatically from
`content/posts/posts.json`, and shows up on the home page.

## Notes

- `pathPrefix` in `.eleventy.js` is set to `/agentscript/apps/Blog/` to match
  where this deploys on acequia — required so CSS/nav links resolve
  correctly. If the deploy path ever changes, update it there.
