// Speed Log: what log messages, fields and parameters mean, from the ArduPilot documentation.
// The data (descriptions.js, made by tools/build_descriptions.cjs) is gzip + base64: one chunk with the message
// definitions and one per vehicle with its parameters, so only what the open log needs is unpacked.

const docs = {
    msgs: {},       // type -> { d: description, f: { field: description } }
    enums: {},      // LogErrorSubsystem / LogEvent: number -> name
    params: {},     // parameter name -> { n, d, u, r, v, b }
    pt: null,       // English description -> Portuguese, loaded when the language is Portuguese
    vehicle: '',
    ready: false,
}

// Vehicle ids used by the VER message / LogHelpers build_type
const VEHICLE_KEYS = { 1: 'rover', 2: 'copter', 3: 'plane', 7: 'sub' }

async function unpack_docs(b64) {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
    return JSON.parse(await new Response(stream).text())
}

async function load_docs(build_type) {
    const packed = window.AP_DOCS_GZ
    if (!packed || typeof DecompressionStream === 'undefined') return
    try {
        if (!docs.ready) {
            const common = await unpack_docs(packed.common)
            docs.msgs = common.msgs
            docs.enums = common.enums
        }
        if (lang === 'pt' && !docs.pt && packed.pt) docs.pt = await unpack_docs(packed.pt)
        const key = VEHICLE_KEYS[build_type] || 'copter'
        if (docs.vehicle !== key) {
            docs.params = await unpack_docs(packed[key])
            docs.vehicle = key
        }
        docs.ready = true
    } catch (err) {
        console.warn('Could not unpack the documentation texts', err)
    }
}

// The documentation sometimes has the literal text "null" where a description is missing
function localize(text) {
    if (!text || text === 'null') return ''
    return (lang === 'pt' && docs.pt && docs.pt[text]) || text
}

// The viewer lists multi-instance messages as BARO[0], BARO[1]; the documentation has one entry, BARO
function doc_entry(type) {
    return docs.msgs[type] || docs.msgs[type.replace(/[[][0-9]+[\]]$/, '')]
}

function msg_doc(type) {
    const m = doc_entry(type)
    return localize(m && m.d)
}

function field_doc(type, field) {
    const m = doc_entry(type)
    return localize(m && m.f[field])
}

function param_doc(name) {
    return docs.params[name] || null
}

// Instance parameters such as BATT2_FS_LOW_ACT are documented once, as BATT_FS_LOW_ACT
function param_info(name) {
    const direct = param_doc(name)
    if (direct) return direct
    const m = /^([A-Z_]+?)([0-9]+)(_.*)$/.exec(name)
    return m ? param_doc(m[1] + m[3]) || param_doc(m[1] + m[2] + m[3]) : null
}

function enum_name(enum_type, value) {
    const e = docs.enums[enum_type]
    return e ? e[String(value)] || '' : ''
}

// The description shown under a field (or in a tooltip), empty when the documentation does not cover it
function describe_field(type, field) {
    return field_doc(type, field)
}

function param_summary(info) {
    if (!info) return ''
    const bits = [info.d]
    if (info.r) bits.push(t('param.range') + ': ' + info.r)
    if (info.u) bits.push(t('param.units') + ': ' + info.u)
    if (info.v) bits.push(t('param.options') + ': ' + Object.entries(info.v).map(([k, v]) => k + ' = ' + v).join('; '))
    else if (info.b) bits.push(t('param.options') + ': ' + Object.entries(info.b).map(([k, v]) => 'bit ' + k + ' = ' + v).join('; '))
    return bits.join('. ')
}
