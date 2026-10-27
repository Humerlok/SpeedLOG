#!/usr/bin/env node
// Builds descriptions.js from the ArduPilot documentation data (autotest.ardupilot.org):
// the log message definitions (LogMessages.xml) and the parameter definitions (apm.pdef.json), for each vehicle.
// The result is committed, so this only needs to run when the descriptions should be refreshed:
//
//   node tools/build_descriptions.cjs
//
// Output: window.AP_DOCS_GZ = { common, pt, copter, plane, rover, sub }, each a gzip + base64 JSON chunk.

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const VEHICLES = [
    { key: 'copter', dir: 'Copter', pdef: 'ArduCopter' },
    { key: 'plane', dir: 'Plane', pdef: 'ArduPlane' },
    { key: 'rover', dir: 'Rover', pdef: 'Rover' },
    { key: 'sub', dir: 'Sub', pdef: 'ArduSub' },
]
const BASE = 'https://autotest.ardupilot.org'

async function get(url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(url + ': HTTP ' + res.status)
    return Buffer.from(await res.arrayBuffer())
}

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const attr = (tag, name) => {
    const m = new RegExp('[ <]' + name + '="([^"]*)"').exec(tag)
    return m ? decode(m[1]) : ''
}

// LogMessages.xml is regular enough to read with a few patterns: logformat > fields > field > (description, enum > element > value)
function parse_messages(xml) {
    const msgs = {}
    const enums = {}
    for (const lf of xml.split('<logformat ').slice(1)) {
        const name = attr('<logformat ' + lf.slice(0, lf.indexOf('>') + 1), 'name')
        const desc = /<description>([\s\S]*?)<\/description>/.exec(lf)
        const fields = {}
        const fsec = lf.slice(lf.indexOf('<fields>'))
        for (const f of fsec.split('<field ').slice(1)) {
            const fname = attr('<field ' + f.slice(0, f.indexOf('>') + 1), 'name')
            const fd = /<description>([\s\S]*?)<\/description>/.exec(f)
            if (fd && decode(fd[1])) fields[fname] = decode(fd[1])
            for (const en of f.split('<enum ').slice(1)) {
                const ename = attr('<enum ' + en.slice(0, en.indexOf('>') + 1), 'name')
                const vals = {}
                for (const el of en.split('<element ').slice(1)) {
                    const v = /<value>([\s\S]*?)<\/value>/.exec(el)
                    if (v) vals[decode(v[1])] = attr('<element ' + el.slice(0, el.indexOf('>') + 1), 'name')
                }
                if (Object.keys(vals).length && !(ename in enums)) enums[ename] = vals
            }
        }
        msgs[name] = { d: desc ? decode(desc[1]) : '', f: fields }
    }
    return { msgs, enums }
}

function parse_params(json) {
    const out = {}
    for (const group of Object.values(json)) {
        if (typeof group !== 'object') continue
        for (const [name, p] of Object.entries(group)) {
            if (!p || typeof p !== 'object' || !p.Description) continue
            const e = { n: p.DisplayName || '', d: p.Description }
            if (p.Units) e.u = p.Units
            if (p.Range) e.r = p.Range.low + ' to ' + p.Range.high
            if (p.Values) e.v = p.Values
            if (p.Bitmask) e.b = p.Bitmask
            out[name] = e
        }
    }
    return out
}

async function main() {
    const msgs = {}
    const enums = {}
    const params = {}
    for (const v of VEHICLES) {
        console.log('Fetching ' + v.key)
        const xml = zlib.gunzipSync(await get(`${BASE}/LogMessages/${v.dir}/LogMessages.xml.gz`)).toString('utf8')
        const m = parse_messages(xml)
        // Vehicles share most messages; keep the first definition and only add what is new
        for (const [name, def] of Object.entries(m.msgs)) {
            if (!msgs[name]) msgs[name] = def
            else {
                if (!msgs[name].d) msgs[name].d = def.d
                for (const [f, d] of Object.entries(def.f)) if (!(f in msgs[name].f)) msgs[name].f[f] = d
            }
        }
        for (const [name, vals] of Object.entries(m.enums)) if (!(name in enums)) enums[name] = vals
        const pj = JSON.parse((await get(`${BASE}/Parameters/${v.pdef}/apm.pdef.json`)).toString('utf8'))
        params[v.key] = parse_params(pj)
    }
    // Texts the published documentation lacks, taken from the ArduPilot source and forum (tools/supplement.json)
    const sup_file = path.join(__dirname, 'supplement.json')
    if (fs.existsSync(sup_file)) {
        const sup = JSON.parse(fs.readFileSync(sup_file, 'utf8'))
        for (const [name, def] of Object.entries(sup)) {
            if (!msgs[name]) msgs[name] = { d: '', f: {} }
            if (def.d && (!msgs[name].d || msgs[name].d === 'null')) msgs[name].d = def.d
            for (const [f, d] of Object.entries(def.f || {})) {
                if (!msgs[name].f[f] || msgs[name].f[f] === 'null') msgs[name].f[f] = d
            }
        }
    }
    // Only the enums the viewer decodes
    const keep = {}
    for (const name of ['LogErrorSubsystem', 'LogEvent']) keep[name] = enums[name]

    // One gzip chunk for the messages and one per vehicle for its parameters, so the viewer only unpacks what a log needs
    const pack = (obj) => zlib.gzipSync(Buffer.from(JSON.stringify(obj)), { level: 9 }).toString('base64')
    const chunks = { common: pack({ msgs, enums: keep }) }
    // Brazilian Portuguese texts for the message and field descriptions: { english text: translation }, kept in
    // tools/translations_pt.json. Only strings still used by the documentation are packed.
    const pt_file = path.join(__dirname, 'translations_pt.json')
    if (fs.existsSync(pt_file)) {
        const all = JSON.parse(fs.readFileSync(pt_file, 'utf8'))
        const used = new Set()
        for (const m of Object.values(msgs)) {
            used.add(m.d)
            for (const d of Object.values(m.f)) used.add(d)
        }
        const pt = {}
        for (const [en, text] of Object.entries(all)) if (used.has(en) && text && text !== en) pt[en] = text
        chunks.pt = pack(pt)
        console.log('translations: ' + Object.keys(pt).length + ' of ' + used.size + ' texts')
    }
    for (const v of VEHICLES) chunks[v.key] = pack(params[v.key])
    const file = path.join(__dirname, '..', 'descriptions.js')
    fs.writeFileSync(file, '// Generated by tools/build_descriptions.cjs, do not edit.' + String.fromCharCode(10) + 'window.AP_DOCS_GZ = ' + JSON.stringify(chunks) + String.fromCharCode(10))
    console.log('messages: ' + Object.keys(msgs).length + ', params: ' + VEHICLES.map((v) => v.key + ' ' + Object.keys(params[v.key]).length).join(', '))
}

main().catch((err) => { console.error(err); process.exit(1) })
