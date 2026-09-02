// Upload app folder(s) from ./Apps to the WebDAV apps folder.
// deno -A uploadApps.js            uploads every folder in .
// deno -A uploadApps.js NYC        uploads just the NYC folder

import { getWebDAVClient } from './getWebDAVClient.js'
import { join, relative } from 'jsr:@std/path@^1'
import { walk } from 'jsr:@std/fs@^1/walk'
import { Buffer } from 'node:buffer'

const [client, baseURL] = getWebDAVClient()
console.log('client', client)
console.log('baseURL', baseURL)

const LOCAL_APPS_DIR = '.'
const REMOTE_BASE = '/agentscript/apps/'

const SKIP_PATTERNS = [
    /(^|\/)\.[^/]+(\/|$)/,
    /(^|\/)node_modules(\/|$)/,
    /\.DS_Store$/,
]

if (!(await client.exists(REMOTE_BASE))) {
    await client.createDirectory(REMOTE_BASE)
    console.log('📁 Created:', REMOTE_BASE)
} else {
    console.log(`📁 ${REMOTE_BASE} Already exists`)
}

async function ensureRemoteDir(remoteDir) {
    if (!(await client.exists(remoteDir))) {
        await client.createDirectory(remoteDir, { recursive: true })
        console.log(`📁 Created remote folder: ${remoteDir}`)
    }
}

// --- Upload the top-level README (describes the Apps folder itself) ---
async function uploadRootReadme() {
    const localPath = join(LOCAL_APPS_DIR, 'README.md')

    try {
        await Deno.stat(localPath)
    } catch {
        return // no root README
    }

    const remotePath = REMOTE_BASE + 'README.md'
    const content = Buffer.from(await Deno.readFile(localPath))
    await client.putFileContents(remotePath, content, { overwrite: true })
    console.log(`✅ Uploaded: ${remotePath}`)
}

// --- Upload a single app folder, recursively ---
async function uploadFolder(folderName) {
    const localDir = join(LOCAL_APPS_DIR, folderName)
    const remoteRoot = REMOTE_BASE + folderName + '/'

    try {
        await ensureRemoteDir(remoteRoot)

        for await (const entry of walk(localDir, {
            includeDirs: true,
            skip: SKIP_PATTERNS,
        })) {
            const rel = relative(localDir, entry.path)
            if (rel === '') continue
            const remotePath = remoteRoot + rel.split('/').join('/')

            if (entry.isDirectory) {
                await ensureRemoteDir(remotePath + '/')
            } else {
                try {
                    const content = Buffer.from(await Deno.readFile(entry.path))
                    await client.putFileContents(remotePath, content, {
                        overwrite: true,
                    })
                    console.log(`✅ Uploaded: ${remotePath}`)
                } catch (err) {
                    console.warn(`⚠️ Failed to upload ${entry.path}:`, err)
                }
            }
        }
    } catch (err) {
        console.error(`❌ Failed to upload ${folderName}:`, err)
    }
}

// --- Main: upload one named folder, or every folder found ---
const argFolder = Deno.args[0]
let folders

if (argFolder) {
    folders = [argFolder]
} else {
    folders = []
    for await (const dirEntry of Deno.readDir(LOCAL_APPS_DIR)) {
        if (
            dirEntry.isDirectory &&
            !dirEntry.name.startsWith('.') &&
            dirEntry.name !== 'node_modules' &&
            !dirEntry.name.endsWith('-src')
        ) {
            folders.push(dirEntry.name)
        }
    }
}

console.log('folders', folders)
await uploadRootReadme()
console.log(`🚀 Uploading ${folders.length} app folder(s) to WebDAV...`)
for (const folder of folders) {
    await uploadFolder(folder)
}
console.log('✅ Done.')
