#!/usr/bin/env node
// Builds dist/SpeedLog.html: one self-contained file (scripts, parser and CSS inlined) that works
// when opened straight from disk (file://), with no server and no network.
//
//   node build.cjs

const fs = require('fs')
const path = require('path')

const root = __dirname
const out_dir = path.join(root, 'dist')
const out_file = path.join(out_dir, 'SpeedLog.html')

function read(rel) {
    const file = path.resolve(root, rel)
    if (!fs.existsSync(file)) {
        throw new Error('Missing ' + rel + '. The vendored libraries in modules/ are incomplete, restore them from the repository.')
    }
    return fs.readFileSync(file, 'utf8')
}

// Keep inlined code from ending the script element early
function inline_safe(code) {
    return code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')
}

// parser.js is an ES module; as a classic script inside a closure it only needs its export removed
function parser_script() {
    const code = read('modules/JsDataflashParser/parser.js')
    const export_line = /^export default DataflashParser\s*$/m
    if (!export_line.test(code)) {
        throw new Error('parser.js no longer ends with "export default DataflashParser", update build.cjs')
    }
    const body = code.replace(export_line, '')
    return '<script>\nwindow.DataflashParser = (function () {\n' + inline_safe(body) + '\nreturn DataflashParser\n})()\n</script>'
}

let html = read('index.html')

html = html.replace(/<!-- parser:start -->[\s\S]*?<!-- parser:end -->/, () => parser_script())
// Installable (PWA) build: register the service worker. Not in development, where a cache would hide edits,
// and not inside the Android WebView, whose assets host has no sw.js.
const pwa_script = `<script>
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && location.hostname !== 'appassets.androidplatform.net') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}))
}
</script>`
html = html.replace('<!-- pwa -->', () => pwa_script)
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => '<style>\n' + read(href) + '\n</style>')
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => '<script>\n' + inline_safe(read(src)) + '\n</script>')

const external = html.match(/<(?:script|link|img|iframe)\b[^>]*\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//gi)
const leftover = html.match(/<script\b[^>]*\bsrc=/gi)
if (external || leftover) {
    throw new Error('Built file still references external resources: ' + JSON.stringify(external || leftover))
}

fs.mkdirSync(out_dir, { recursive: true })
fs.writeFileSync(out_file, html)
console.log('Wrote ' + path.relative(process.cwd(), out_file) + ' (' + (Buffer.byteLength(html) / 1048576).toFixed(2) + ' MB)')

// site/: what goes on a web server (installable as an app from the browser). The service worker gets a
// version taken from the page, so a changed build replaces the cached copy on the users' devices.
const site_dir = path.join(root, 'site')
fs.rmSync(site_dir, { recursive: true, force: true })
fs.mkdirSync(path.join(site_dir, 'images'), { recursive: true })
fs.writeFileSync(path.join(site_dir, 'index.html'), html)
const version = require('crypto').createHash('sha256').update(html).digest('hex').slice(0, 12)
fs.writeFileSync(path.join(site_dir, 'sw.js'), read('sw.js').replace('__VERSION__', version))
fs.copyFileSync(path.join(root, 'manifest.webmanifest'), path.join(site_dir, 'manifest.webmanifest'))
for (const file of fs.readdirSync(path.join(root, 'images'))) {
    fs.copyFileSync(path.join(root, 'images', file), path.join(site_dir, 'images', file))
}
console.log('Wrote site/ (service worker version ' + version + ')')
