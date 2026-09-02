import Model from 'https://agentscript.org/models/SchellingModel.js'

const WORLD_SIZE = 25 // matches SchellingModel's own default (World.defaultOptions(25))

// deno-lint-ignore no-explicit-any
let model: any = new Model()
model.setup()

const clients = new Set<ReadableStreamDefaultController>()

function snapshot() {
    return JSON.stringify({
        worldSize: WORLD_SIZE,
        percentHappy: model.percentHappy,
        ticks: model.ticks,
        done: model.done,
        // [x, y, 0|1] — 0 = Os (red), 1 = Xs (blue), matches the Playground's color mapping
        // deno-lint-ignore no-explicit-any
        turtles: model.turtles.map((t: any) => [t.x, t.y, t.breed.name === 'Os' ? 0 : 1]),
    })
}

function broadcast() {
    const msg = new TextEncoder().encode(`data: ${snapshot()}\n\n`)
    for (const controller of clients) {
        try {
            controller.enqueue(msg)
        } catch {
            clients.delete(controller)
        }
    }
}

function toggle(x: number, y: number) {
    const p = model.patches.patch(x, y)
    if (!p) return
    const here = p.turtlesHere
    if (here.length === 0) {
        p.sprout(1, model.Os, () => {})
    } else {
        const t = here[0]
        if (t.breed.name === 'Os') {
            t.die()
            p.sprout(1, model.Xs, () => {})
        } else {
            t.die()
        }
    }
    model.setPercentHappy()
    broadcast()
}

function restart() {
    model = new Model()
    model.setup()
    broadcast()
}

setInterval(() => {
    if (!model.done) {
        model.step()
        broadcast()
    }
}, 400)

Deno.serve(async req => {
    const url = new URL(req.url)

    if (url.pathname === '/') {
        const html = await Deno.readTextFile(new URL('./index.html', import.meta.url))
        return new Response(html, { headers: { 'content-type': 'text/html' } })
    }

    if (url.pathname === '/events') {
        let thisController: ReadableStreamDefaultController
        const stream = new ReadableStream({
            start(controller) {
                thisController = controller
                clients.add(controller)
                controller.enqueue(new TextEncoder().encode(`data: ${snapshot()}\n\n`))
            },
            cancel() {
                clients.delete(thisController)
            },
        })
        return new Response(stream, {
            headers: {
                'content-type': 'text/event-stream',
                'cache-control': 'no-cache',
                connection: 'keep-alive',
            },
        })
    }

    if (url.pathname === '/toggle' && req.method === 'POST') {
        const { x, y } = await req.json()
        toggle(x, y)
        return new Response('ok')
    }

    if (url.pathname === '/restart' && req.method === 'POST') {
        restart()
        return new Response('ok')
    }

    return new Response('not found', { status: 404 })
})
