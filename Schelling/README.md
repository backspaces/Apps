# Schelling

Live: [schelling.backspaces.deno.net](https://schelling.backspaces.deno.net)

Schelling segregation model — [AgentScript](https://agentscript.org)'s
`SchellingModel`, with density/tolerance sliders and a live "% happy" plot
via `GUIDiv`. Adapted from
`src/agentscript/views2gui/schelling.html`, with its imports pointed at the
`https://agentscript.org/...` CDN instead of local relative paths.

Unlike the other apps in this folder, this one isn't published via
`uploadApps.js`/WebDAV — it's hosted directly as a Deno Deploy Playground.
Click [Schelling.webloc](Schelling.webloc) to open it, or see
[../DenoDeploy/README.md](../DenoDeploy/README.md) for how it was set up
and how to edit it (via the Playground's browser editor at
`console.deno.com/backspaces/schelling/playground`, not from this folder).
