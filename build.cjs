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
