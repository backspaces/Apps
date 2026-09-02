# SchellingLive

A shared, live-running version of the Schelling segregation model — unlike
[Schelling](../Schelling/) (a Deno Deploy Playground where every visitor
runs their own independent copy client-side), this one runs **once**,
server-side, and every connected viewer watches (and can affect) the exact
same simulation in real time.

Live (permanently deployed, `runtime mode: dynamic app`, entrypoint
`server.ts`): **https://schellinglive.backspaces.deno.net**

Also demoable via Deno Deploy's **Tunnel** feature, which exposes a
locally-running copy (on your own laptop) to a public URL instead:

```sh
cd Apps/SchellingLive
deno run --tunnel -A server.ts
```

First run authenticates via browser (same device-code flow as the CLI
elsewhere in [DenoDeploy](../DenoDeploy/)) and asks which app to associate
the tunnel with — pick `schellinglive` (it must already exist; `--tunnel`
can only select an existing app, not create one). It then prints a public
URL — share that, not `localhost:8000`.

## How it works

- `server.ts` imports `SchellingModel` from `https://agentscript.org/models/SchellingModel.js`
  and steps it on a `setInterval` loop (every 400ms), entirely headless — no
  DOM/browser APIs involved, confirmed to run fine under plain `deno run`.
- Each tick, the current turtle positions/breeds are broadcast to every
  connected browser over **Server-Sent Events** (`GET /events`).
- `index.html` is a thin client: no local model, no `Animator` — it just
  draws whatever state arrives over SSE onto a `<canvas>`.
- Clicking a cell `POST`s `{x, y}` to `/toggle`, which cycles that patch
  (empty → red/`Os` → blue/`Xs` → empty) on the **one shared model
  instance** and immediately re-broadcasts — every viewer sees every click,
  from anyone.
- The **Restart** button `POST`s to `/restart`, which reinitializes the
  model for everyone at once.

Deliberately no view-only mode or per-user permissions — anyone with the
link can click/restart. For a small trusted-team demo that's the point:
watching everyone's clicks land on each other's screens live is more
interesting than it is disruptive.

## Notes

- World size is hardcoded to 25 (`SchellingModel`'s own default) in both
  `server.ts` and `index.html` — if that ever changes, update both.
- The permanent deployment and the tunnel are two independent ways to run
  the *same* app record — running `--tunnel` doesn't replace or restart
  the permanently-deployed copy, they're just two separate live instances
  (each with its own in-memory model state) that happen to share a name.
