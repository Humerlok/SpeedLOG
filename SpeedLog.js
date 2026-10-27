// Speed Log: lean, offline viewer for ArduPilot DataFlash (.bin) logs.
// Only the fields the user selects are read from the log and plotted.

const MAX_TRACES = 8   // one color per series slot, never cycled
const NON_NUMERIC = 'nNZaA'
const BUCKETS = 1500   // min/max pairs kept per trace for the visible window
const BIG_FILE = 150 * 1048576   // bytes; past this the loading card warns about time and memory
let drawer_greeted = false

const parser_ready = new Promise((resolve, reject) => {
    if (window.DataflashParser) {
        resolve()
        return
    }
    window.addEventListener('parser-ready', () => resolve(), { once: true })
    window.addEventListener('parser-error', () => {
        reject(new Error(t('load.no_parser')))
    }, { once: true })
})

const state = {
    log: null,
    types: [],              // [{ name, base, count, time_field, fields: [{ name, unit }], formats }]
    type_map: new Map(),
    panels: [],
    active: null,
    next_panel: 1,
    dragmode: 'zoom',       // modebar tool (zoom / pan), kept across redraws
    xrange: null,           // shared x zoom, null = autorange
    t_start: Infinity,
    t_end: -Infinity,
    modes: [],              // [{ t0, t1, name, color }]
    show_modes: true,
    marker: null,
    cursor: null,           // time pinned by a tap on a touch screen (the readout strip shows its values)
    tab: 'plots',
    expanded: new Set(),
    filter: '',
    info: null,             // what the file details sheet shows
    params: [],
    messages: [],
    msg_kinds: new Set(['MSG', 'ERR', 'EV']),
}

const series_cache = new Map()
const time_cache = new Map()

const $ = (id) => document.getElementById(id)

function el(tag, props, ...kids) {
    const e = document.createElement(tag)
    if (props) {
        for (const [k, v] of Object.entries(props)) {
            if (k === 'class') e.className = v
            else if (k === 'text') e.textContent = v
            else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
            else e.setAttribute(k, v)
        }
    }
    for (const kid of kids) {
        if (kid != null) e.append(kid)
    }
    return e
}

const ICONS = {
    chev: '<svg class="chev" viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3m-7 0l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    side: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 5v14" stroke="currentColor" stroke-width="1.8"/></svg>',
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    auto: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 4a8 8 0 010 16z" fill="currentColor"/></svg>',
    max: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    restore: '<svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="5.5" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="18.5" cy="12" r="1.7" fill="currentColor"/></svg>',
    mark: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}

// Series beyond the fourth also differ by line style, so colour is never the only cue
const DASHES = [null, null, null, null, 'dash', 'dot', 'dashdot', 'longdash']

// Flight mode names by vehicle (build_type from get_version_and_board)
const MODE_NAMES = {
    2: { 0: 'STABILIZE', 1: 'ACRO', 2: 'ALT_HOLD', 3: 'AUTO', 4: 'GUIDED', 5: 'LOITER', 6: 'RTL', 7: 'CIRCLE', 9: 'LAND', 11: 'DRIFT', 13: 'SPORT', 14: 'FLIP', 15: 'AUTOTUNE', 16: 'POSHOLD', 17: 'BRAKE', 18: 'THROW', 19: 'AVOID_ADSB', 20: 'GUIDED_NOGPS', 21: 'SMART_RTL', 22: 'FLOWHOLD', 23: 'FOLLOW', 24: 'ZIGZAG', 25: 'SYSTEMID', 26: 'AUTOROTATE', 27: 'AUTO_RTL', 28: 'TURTLE' },
    3: { 0: 'MANUAL', 1: 'CIRCLE', 2: 'STABILIZE', 3: 'TRAINING', 4: 'ACRO', 5: 'FBWA', 6: 'FBWB', 7: 'CRUISE', 8: 'AUTOTUNE', 10: 'AUTO', 11: 'RTL', 12: 'LOITER', 13: 'TAKEOFF', 14: 'AVOID_ADSB', 15: 'GUIDED', 17: 'QSTABILIZE', 18: 'QHOVER', 19: 'QLOITER', 20: 'QLAND', 21: 'QRTL', 22: 'QAUTOTUNE', 23: 'QACRO', 24: 'THERMAL', 25: 'LOITER_ALT_QLAND' },
    1: { 0: 'MANUAL', 1: 'ACRO', 3: 'STEERING', 4: 'HOLD', 5: 'LOITER', 6: 'FOLLOW', 7: 'SIMPLE', 8: 'DOCK', 9: 'CIRCLE', 10: 'AUTO', 11: 'RTL', 12: 'SMART_RTL', 15: 'GUIDED' },
    7: { 0: 'STABILIZE', 1: 'ACRO', 2: 'ALT_HOLD', 3: 'AUTO', 4: 'GUIDED', 7: 'CIRCLE', 9: 'SURFACE', 16: 'POSHOLD', 19: 'MANUAL' },
    4: { 0: 'MANUAL', 1: 'STOP', 2: 'SCAN', 3: 'SERVO_TEST', 10: 'AUTO', 16: 'INITIALISING' },
}

// ---------------------------------------------------------------- theme

let theme_cache = null

function theme_colors() {
    if (!theme_cache) {
        const cs = getComputedStyle(document.documentElement)
        const get = (name) => cs.getPropertyValue(name).trim()
        theme_cache = {
            text1: get('--text-primary'),
            text2: get('--text-secondary'),
            muted: get('--text-muted'),
            surface: get('--surface-1'),
            border: get('--border'),
            grid: get('--grid'),
            accent: get('--accent'),
            series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => get('--series-' + i)),
        }
    }
    return theme_cache
}

function is_dark() {
    const forced = document.documentElement.dataset.theme
    if (forced) return forced === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
}

// The theme button cycles automatic (follows the system) / light / dark
const THEME_CYCLE = ['auto', 'light', 'dark']
const theme_pref = () => document.documentElement.dataset.theme || 'auto'

function update_theme_button() {
    const pref = theme_pref()
    const label = t('top.theme_' + pref)
    $('themeBtn').innerHTML = pref === 'auto' ? ICONS.auto : (pref === 'dark' ? ICONS.moon : ICONS.sun)
    $('themeBtn').title = label
    $('themeBtn').setAttribute('aria-label', label)
    $('menuTheme').textContent = label
    $('themeColor').setAttribute('content', theme_colors().surface)
}

function theme_changed() {
    theme_cache = null
    update_theme_button()
    render_mode_legend()
    refresh_all()
    retheme_tools()
}

function toggle_theme() {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme_pref()) + 1) % THEME_CYCLE.length]
    if (next === 'auto') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = next
    pref_set('theme', next === 'auto' ? null : next)
    theme_changed()
}

function hex_alpha(hex, alpha) {
    const n = parseInt(hex.slice(1), 16)
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + alpha + ')'
}

// ---------------------------------------------------------------- helpers

let toast_timer
// action: { label, run } adds a button to the toast
function toast(text, error, action) {
    const box = $('toast')
    const button = $('toastAction')
    $('toastText').textContent = text
    button.hidden = !action
    button.onclick = action ? () => {
        box.hidden = true
        action.run()
    } : null
    if (action) button.textContent = action.label
    box.className = 'toast' + (error ? ' error' : '')
    box.hidden = false
    clearTimeout(toast_timer)
    toast_timer = setTimeout(() => { box.hidden = true }, error ? 7000 : (action ? 5500 : 3500))
}

function fmt_bytes(n) {
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB'
    return Math.max(1, Math.round(n / 1024)) + ' KB'
}

function fmt_time(s) {
    const m = Math.floor(s / 60)
    return m + ':' + (s - m * 60).toFixed(1).padStart(4, '0')
}

function fmt_duration(s) {
    const m = Math.floor(s / 60)
    return m + ' min ' + Math.round(s - m * 60) + ' s'
}

// Lets the browser paint (e.g. the loading overlay) before blocking work. The timeout covers hidden tabs,
// where animation frames are paused.
function next_frame() {
    return new Promise((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve, 0))
        setTimeout(resolve, 100)
    })
}

function clean_unit(u) {
    if (!u || u === '?' || u === 'UNKNOWN' || u === 'instance' || u === '-') return ''
    return u
}

function parse_type_name(name) {
    const m = /^(.+)\[(.+)\]$/.exec(name)
    return m ? { base: m[1], instance: m[2] } : { base: name, instance: null }
}

function read_field(type, field) {
    const { base, instance } = parse_type_name(type)
    return instance == null ? state.log.get(base, field) : state.log.get_instance(base, instance, field)
}

// ---------------------------------------------------------------- log data

function build_types(log) {
    const stats = log.stats()
    const types = []
    for (const base of get_base_log_message_types(log)) {
        const mt = log.messageTypes[base]
        const fmt = log.getFMT(base)
        if (!mt || !fmt) continue

        const time_field = mt.expressions.includes('TimeUS') ? 'TimeUS' : (mt.expressions.includes('TimeMS') ? 'TimeMS' : null)
        const fields = []
        const formats = {}
        mt.expressions.forEach((name, i) => {
            if (name === time_field || NON_NUMERIC.includes(fmt.Format[i])) return
            if (mt.units && mt.units[i] === 'instance') return
            fields.push({ name, unit: clean_unit(mt.complexFields[name].units) })
            formats[name] = fmt.Format[i]
        })
        if (!fields.length) continue

        const entries = mt.instances ? Object.entries(mt.instances) : [[null, base]]
        for (const [instance, name] of entries) {
            const count = instance == null ? (stats[base] ? stats[base].count : 0) : fmt.InstancesOffsetArray[instance].length
            if (!count) continue
            types.push({ name, base, count, time_field, fields, formats })
        }
    }
    types.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    return types
}

function time_series(type) {
    if (time_cache.has(type)) return time_cache.get(type)
    const info = state.type_map.get(type)
    const raw = info.time_field ? read_field(type, info.time_field) : null
    if (!raw || !raw.length) return null
    const scale = info.time_field === 'TimeUS' ? 1e-6 : 1e-3
    const x = new Float64Array(raw.length)
    for (let i = 0; i < raw.length; i++) x[i] = raw[i] * scale
    time_cache.set(type, x)
    return x
}

function load_series(type, field) {
    const key = type + '.' + field
    if (series_cache.has(key)) return series_cache.get(key)
    const x = time_series(type)
    let y = read_field(type, field)
    if (!x || !y || y.length !== x.length) return null
    // Lat/lon ('L') is logged as int32 degrees * 1e7 and the parser does not rescale it
    if (state.type_map.get(type).formats[field] === 'L') y = y.map((v) => v * 1e-7)
    state.t_start = Math.min(state.t_start, x[0])
    state.t_end = Math.max(state.t_end, x[x.length - 1])
    const s = { x, y }
    series_cache.set(key, s)
    return s
}

function lower_bound(x, v) {
    let lo = 0
    let hi = x.length
    while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (x[mid] < v) lo = mid + 1
        else hi = mid
    }
    return lo
}

// Visible window of a series, reduced to min/max per bucket so big logs stay fast
function view_slice(s, range) {
    const n = s.x.length
    let lo = 0
    let hi = n
    if (range) {
        lo = Math.max(0, lower_bound(s.x, range[0]) - 1)
        hi = Math.min(n, lower_bound(s.x, range[1]) + 1)
    }
    const len = hi - lo
    if (len <= BUCKETS * 3) {
        return { x: Array.from(s.x.subarray(lo, hi)), y: Array.from(s.y.subarray(lo, hi)) }
    }
    const x = []
    const y = []
    const step = len / BUCKETS
    for (let b = 0; b < BUCKETS; b++) {
        const start = lo + Math.floor(b * step)
        const end = lo + Math.floor((b + 1) * step)
        let min_i = -1
        let max_i = -1
        for (let i = start; i < end; i++) {
            const v = s.y[i]
            if (!Number.isFinite(v)) continue
            if (min_i < 0 || v < s.y[min_i]) min_i = i
            if (max_i < 0 || v > s.y[max_i]) max_i = i
        }
        if (min_i < 0) continue
        const first = Math.min(min_i, max_i)
        const second = Math.max(min_i, max_i)
        x.push(s.x[first])
        y.push(s.y[first])
        if (second !== first) {
            x.push(s.x[second])
            y.push(s.y[second])
        }
    }
    return { x, y }
}

function estimate_span() {
    // Biggest timed message type gives the best idea of the log span
    let best
    for (const t of state.types) {
        if (t.time_field && (!best || t.count > best.count)) best = t
    }
    if (!best) return
    const x = time_series(best.name)
    if (x) {
        state.t_start = Math.min(state.t_start, x[0])
        state.t_end = Math.max(state.t_end, x[x.length - 1])
    }
}

function load_modes(build_type) {
    state.modes = []
    const log = state.log
    if (!('MODE' in log.messageTypes)) return
    const field = log.messageTypes.MODE.expressions.includes('ModeNum') ? 'ModeNum' : 'Mode'
    const t = log.get('MODE', 'TimeUS')
    const m = log.get('MODE', field)
    if (!t || !m) return
    const names = MODE_NAMES[build_type] || {}
    const order = []
    for (let i = 0; i < t.length; i++) {
        const name = names[m[i]] || ('Mode ' + m[i])
        if (!order.includes(name)) order.push(name)
        state.modes.push({ t0: t[i] * 1e-6, t1: i + 1 < t.length ? t[i + 1] * 1e-6 : null, name, slot: order.indexOf(name) % 8 })
    }
    state.t_start = Math.min(state.t_start, state.modes[0].t0)
}

function load_params() {
    state.params = []
    if (!('PARM' in state.log.messageTypes)) return
    const names = state.log.get('PARM', 'Name')
    const values = state.log.get('PARM', 'Value')
    if (!names || !values) return
    const seen = new Map()
    for (let i = 0; i < names.length; i++) {
        const prev = seen.get(names[i])
        if (prev) prev.last = values[i]
        else seen.set(names[i], { name: names[i], first: values[i], last: values[i] })
    }
    state.params = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function load_messages() {
    state.messages = []
    const log = state.log
    const add = (type, fn) => {
        if (!(type in log.messageTypes)) return
        const t = log.get(type, 'TimeUS')
        if (!t) return
        for (let i = 0; i < t.length; i++) state.messages.push({ t: t[i] * 1e-6, kind: type, text: fn(i) })
    }
    const text = log.get('MSG', 'Message')
    add('MSG', (i) => text[i])
    const sub = log.get('ERR', 'Subsys')
    const code = log.get('ERR', 'ECode')
    const modes = MODE_NAMES[state.build_type] || {}
    add('ERR', (i) => {
        const name = enum_name('LogErrorSubsystem', sub[i])
        const label = name ? subsystem_name(name) + ' (' + sub[i] + ')' : t('err.subsystem') + ' ' + sub[i]
        const mode = modes[code[i]] ? modes[code[i]] + ' (' + code[i] + ')' : code[i]
        const meaning = name ? error_code_text(name, code[i], mode) : t('err.unknown')
        return label + ': ' + meaning + ' [' + t('err.code') + ' ' + code[i] + ']'
    })
    const id = log.get('EV', 'Id')
    add('EV', (i) => {
        const name = enum_name('LogEvent', id[i])
        return name ? event_text(name) + ' (' + id[i] + ')' : t('ev.event') + ' ' + id[i]
    })
    state.messages.sort((a, b) => a.t - b.t)
}

// ---------------------------------------------------------------- sidebar tree

function field_matches(type, f, q) {
    return !q || type.name.toLowerCase().includes(q) || f.name.toLowerCase().includes(q) ||
        field_doc(type.name, f.name).toLowerCase().includes(q) || msg_doc(type.name).toLowerCase().includes(q)
}

function render_tree() {
    const tree = $('tree')
    const q = state.filter
    tree.textContent = ''
    let shown = 0
    for (const type of state.types) {
        const visible_fields = type.fields.filter((f) => field_matches(type, f, q))
        if (!visible_fields.length) continue
        shown++
        const open = q ? true : state.expanded.has(type.name)
        const type_desc = msg_doc(type.name)
        const head = el('button', { class: 'type-head' + (type.time_field ? '' : ' untimed'), 'aria-expanded': String(open), 'data-type': type.name, title: (type_desc ? type.name + ': ' + type_desc : '') + (type.time_field ? '' : (type_desc ? ' - ' : '') + t('side.notime')) })
        head.innerHTML = ICONS.chev
        head.append(el('span', { class: 'type-name', text: type.name }), type_desc ? el('span', { class: 'type-desc', text: type_desc }) : null, el('span', { class: 'badge', text: type.count.toLocaleString() }))
        const item = el('div', { class: 'type' + (open ? ' open' : ''), role: 'treeitem' }, head)
        if (open) {
            const list = el('ul', { class: 'fields' })
            for (const f of visible_fields) {
                const key = type.name + '.' + f.name
                const box = el('input', { type: 'checkbox', 'data-key': key, 'data-type': type.name, 'data-field': f.name })
                if (!type.time_field) box.disabled = true
                box.checked = !!(state.active && state.active.traces.some((t) => t.key === key))
                const desc = field_doc(type.name, f.name)
                list.append(el('li', { title: desc, 'data-key': key }, el('label', { class: 'field' }, box, el('span', { class: 'fname', text: f.name }), el('span', { class: 'elsewhere' }), el('span', { class: 'funit', text: f.unit })), desc ? el('div', { class: 'fdesc', text: desc }) : null))
            }
            item.append(list)
        }
        tree.append(item)
    }
    if (!shown) tree.append(el('div', { class: 'no-results', text: t('side.nomatch') }))
    $('sideSummary').textContent = q ? t('side.types_match', { n: shown, total: state.types.length }) : t('side.types', { n: state.types.length })
    sync_checks()
}

// The checkboxes follow the active panel; a field plotted in another panel shows a dot in its series colour and the
// panel number instead, so what is already on screen can be told from the tree
function sync_checks() {
    const keys = new Set(state.active ? state.active.traces.map((t) => t.key) : [])
    const elsewhere = new Map()
    for (const p of state.panels) {
        if (p === state.active) continue
        for (const tr of p.traces) {
            if (!elsewhere.has(tr.key)) elsewhere.set(tr.key, { slot: tr.slot, panels: [] })
            elsewhere.get(tr.key).panels.push(p.id)
        }
    }
    for (const li of $('tree').querySelectorAll('li[data-key]')) {
        li.querySelector('input').checked = keys.has(li.dataset.key)
        const mark = li.querySelector('.elsewhere')
        const where = elsewhere.get(li.dataset.key)
        mark.textContent = ''
        mark.title = ''
        if (!where) continue
        mark.append(el('span', { class: 'dot-elsewhere', style: '--c: var(--series-' + (where.slot + 1) + ')' }), 'P' + where.panels.join(','))
        mark.title = t('side.elsewhere', { n: where.panels.join(', ') })
    }
    update_side_ui()
}

function on_tree_click(ev) {
    const head = ev.target.closest('.type-head')
    if (head) {
        if (state.filter) return
        const name = head.dataset.type
        if (state.expanded.has(name)) state.expanded.delete(name)
        else state.expanded.add(name)
        const scroll = $('tree').scrollTop
        render_tree()
        $('tree').scrollTop = scroll
    }
}

function on_tree_change(ev) {
    const box = ev.target
    if (box.dataset.key) toggle_trace(box.dataset.type, box.dataset.field, null, true)
}

// ---------------------------------------------------------------- panels

const TOUCH = window.matchMedia('(pointer: coarse)').matches

// Screen format shared by CSS and JS (UI_PLAN section 3): html.mode-desktop|compact|phone|tablet. The sidebar is a
// drawer (html.side-drawer) in every format but desktop, and in compact when the screen is wide enough to dock it
const SCREEN_MODES = ['desktop', 'compact', 'phone', 'tablet']
function screen_mode() {
    const w = window.innerWidth
    const h = window.innerHeight
    if (w <= 600 && h > w) return 'phone'
    if (h <= 600) return 'compact'
    if (w <= 860) return 'tablet'
    return 'desktop'
}

const is_drawer = () => {
    const mode = screen_mode()
    return mode === 'phone' || mode === 'tablet' || (mode === 'compact' && window.innerWidth < 800)
}

// Returns true when the format (or the drawer decision) changed
let current_mode = ''
let current_drawer = null
function apply_mode() {
    const mode = screen_mode()
    const drawer = is_drawer()
    const cl = document.documentElement.classList
    for (const m of SCREEN_MODES) cl.toggle('mode-' + m, m === mode)
    cl.toggle('side-drawer', drawer)
    const changed = mode !== current_mode || drawer !== current_drawer
    current_mode = mode
    current_drawer = drawer
    return changed
}

const plot_config = () => ({
    displaylogo: false,
    displayModeBar: TOUCH ? false : 'hover', // touch gestures replace zoom/pan; PNG has a panel header button
    responsive: false,
    // The stock camera button exports a transparent background and cannot download inside the Android WebView,
    // so it is replaced by "Save PNG" below.
    modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d', 'toImage'],
    modeBarButtonsToAdd: [{
        name: 'Save PNG',
        title: t('plot.png'),
        icon: Plotly.Icons.camera,
        click: (gd) => export_png(gd),
    }],
})

// window.AndroidBridge is provided by the Android app, where files are saved through the system file picker
async function export_png(gd) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const options = { format: 'png', scale: 2 }
    // Plots are transparent on screen; give the image the card color so it reads on any background
    await Plotly.relayout(gd, { paper_bgcolor: theme_colors().surface })
    try {
        if (window.AndroidBridge) {
            const url = await Plotly.toImage(gd, options)
            window.AndroidBridge.savePng(url.slice(url.indexOf(',') + 1), 'logviewer-' + stamp + '.png')
        } else {
            await Plotly.downloadImage(gd, Object.assign({ filename: 'logviewer-' + stamp }, options))
        }
    } catch (err) {
        console.error(err)
        toast(t('plot.png_fail', { err: err.message }), true)
    } finally {
        await Plotly.relayout(gd, { paper_bgcolor: 'rgba(0,0,0,0)' })
    }
}

function panel_button(cls, icon, onclick) {
    const b = el('button', { class: 'icon-btn ' + cls, type: 'button', onclick })
    b.innerHTML = icon
    return b
}

function add_panel() {
    const p = { id: state.next_panel++, traces: [], yrange: null, attached: false, maximized: false, height: null }
    const chips = el('div', { class: 'chips' })
    p.png_btn = panel_button('pa-png', ICONS.camera, () => export_png(p.plot))
    p.clear_btn = panel_button('pa-clear', ICONS.trash, () => clear_panel(p))
    p.max_btn = panel_button('pa-max', ICONS.max, () => toggle_maximize(p))
    p.more_btn = panel_button('pa-more', ICONS.more, () => open_panel_menu(p))
    p.more_btn.setAttribute('aria-haspopup', 'menu')
    p.remove_btn = panel_button('pa-remove', ICONS.close, () => remove_panel(p))
    p.title = el('div', { class: 'panel-title' }, el('span', { class: 'pt-label' }), el('span', { class: 'pt-num', text: String(p.id) }))
    p.hint = el('div', { class: 'hint' }, el('span', { class: 'hint-text' }), el('button', { class: 'btn primary hint-btn', type: 'button', onclick: () => set_side(true, true) }))
    p.chips = chips
    p.plot = el('div', { class: 'plotbox' })
    p.el = el('section', { class: 'panel empty' },
        el('div', { class: 'panel-head' }, p.title, chips, el('div', { class: 'panel-actions' }, p.png_btn, p.clear_btn, p.max_btn, p.more_btn, p.remove_btn)),
        p.plot,
        p.hint)
    relabel_panel(p)
    p.el.addEventListener('pointerdown', () => set_active(p), true)
    if (TOUCH) setup_touch(p)
    new ResizeObserver(() => fit_plot(p)).observe(p.plot)
    state.panels.push(p)
    $('panels').append(p.el)
    set_active(p)
    update_side_ui()
    return p
}

function toggle_maximize(p) {
    p.maximized = !p.maximized
    for (const q of state.panels) {
        if (q !== p && p.maximized) q.maximized = false
        q.el.classList.toggle('maximized', q.maximized)
    }
    $('panels').classList.toggle('has-max', state.panels.some((q) => q.maximized))
    for (const q of state.panels) relabel_panel(q)
    set_active(p)
    setTimeout(() => {
        for (const q of state.panels) fit_plot(q)
    }, 30)
}

function move_panel(p, step) {
    const i = state.panels.indexOf(p)
    const j = i + step
    if (j < 0 || j >= state.panels.length) return
    state.panels.splice(i, 1)
    state.panels.splice(j, 0, p)
    for (const q of state.panels) $('panels').append(q.el)
    update_side_ui()
    refresh_all() // the flight mode names are drawn on the first panel only
}

function set_panel_height(p, size) {
    p.height = size
    for (const s of ['s', 'm', 'l']) p.el.classList.toggle('h-' + s, s === size)
    setTimeout(() => fit_plot(p), 30)
}

function open_panel_menu(p) {
    const i = state.panels.indexOf(p)
    const items = [
        { label: t('plot.move_up'), disabled: i === 0, run: () => move_panel(p, -1) },
        { label: t('plot.move_down'), disabled: i === state.panels.length - 1, run: () => move_panel(p, 1) },
    ]
    if (screen_mode() === 'desktop') {
        items.push({ separator: true })
        for (const [size, key] of [['s', 'plot.h_s'], ['m', 'plot.h_m'], ['l', 'plot.h_l']]) {
            items.push({ label: t(key) + ' (' + { s: 180, m: 260, l: 400 }[size] + ' px)', checked: p.height === size, run: () => set_panel_height(p, p.height === size ? null : size) })
        }
    }
    show_menu(menu_for('panelMenu'), p.more_btn, items)
}

// Touch gestures on a plot. Plotly's own pinch is far too sharp on a phone (a small pinch zooms a lot), so
// on touch screens its drag handling is off and this does the time axis itself: one finger drags sideways to
// pan (vertical drags still scroll the page), two fingers pinch with a damped zoom, double tap resets.
const PINCH_DAMPING = 0.5 // 1 = zoom exactly with the fingers, lower = gentler
const MIN_SPAN = 0.05 // seconds

function setup_touch(p) {
    const box = p.plot
    box.style.touchAction = 'pan-y'
    let g = null // gesture in progress
    let last_tap = 0

    const full_range = () => [state.t_start, state.t_end]
    const current = () => state.xrange || full_range()
    const geometry = () => {
        const xa = box._fullLayout && box._fullLayout.xaxis
        if (!xa) return null
        const r = box.getBoundingClientRect()
        return { left: r.left + xa._offset, width: xa._length }
    }
    const set_range = (a, b) => {
        const [t0, t1] = full_range()
        const span = Math.min(Math.max(b - a, MIN_SPAN), t1 - t0)
        a = Math.min(Math.max(a, t0), t1 - span)
        state.xrange = span >= t1 - t0 ? null : [a, a + span]
        schedule_refresh()
    }
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)

    box.addEventListener('touchstart', (ev) => {
        const geo = geometry()
        if (!geo) return
        if (ev.touches.length === 2) {
            const [a, b] = current()
            const mid = (ev.touches[0].clientX + ev.touches[1].clientX) / 2
            g = { mode: 'pinch', d0: dist(ev.touches), range: [a, b], frac: Math.min(1, Math.max(0, (mid - geo.left) / geo.width)) }
        } else if (ev.touches.length === 1) {
            const now = Date.now()
            const double = now - last_tap < 300
            if (double) reset_zoom()
            last_tap = now
            g = { mode: 'wait', x: ev.touches[0].clientX, y: ev.touches[0].clientY, range: current(), t0: now, double }
        }
    }, { passive: true })

    box.addEventListener('touchmove', (ev) => {
        const geo = geometry()
        if (!g || !geo) return
        if (g.mode === 'pinch' && ev.touches.length === 2) {
            ev.preventDefault()
            const ratio = Math.pow(g.d0 / dist(ev.touches), PINCH_DAMPING)
            const [a, b] = g.range
            const span = (b - a) * ratio
            const anchor = a + g.frac * (b - a)
            set_range(anchor - g.frac * span, anchor + (1 - g.frac) * span)
        } else if (ev.touches.length === 1 && g.mode !== 'pinch') {
            const dx = ev.touches[0].clientX - g.x
            const dy = ev.touches[0].clientY - g.y
            if (g.mode === 'wait') {
                if (Math.hypot(dx, dy) < 8) return
                g.mode = Math.abs(dx) > Math.abs(dy) ? 'pan' : 'scroll'
            }
            if (g.mode !== 'pan') return
            ev.preventDefault()
            const [a, b] = g.range
            const shift = (dx / geo.width) * (b - a)
            set_range(a - shift, b - shift)
        }
    }, { passive: false })

    // A tap that moved nowhere pins the cursor at that instant; the readout strip shows every trace there
    const end = (ev) => {
        if (ev.touches.length) return
        const geo = geometry()
        if (g && g.mode === 'wait' && !g.double && geo && ev.type === 'touchend' && Date.now() - g.t0 < 350) {
            const touch = ev.changedTouches[0]
            const [a, b] = current()
            const frac = (touch.clientX - geo.left) / geo.width
            if (frac >= 0 && frac <= 1) set_cursor(a + frac * (b - a))
        }
        g = null
    }
    box.addEventListener('touchend', end, { passive: true })
    box.addEventListener('touchcancel', end, { passive: true })
}

// Plotly keeps the size it was drawn at; make it follow the box, which stretches to fill the screen.
// Plots.resize is debounced and a redraw landing in that window can undo it, so the size is checked again
// once it has had time to settle.
function fit_plot(p) {
    const gd = p.plot
    const off = () => !p.attached || !gd._fullLayout || gd.offsetWidth <= 0 ||
        (Math.abs(gd._fullLayout.height - gd.clientHeight) <= 1 && Math.abs(gd._fullLayout.width - gd.clientWidth) <= 1)
    if (off()) return
    Plotly.Plots.resize(gd)
    clearTimeout(p.fit_timer)
    p.fit_timer = setTimeout(() => {
        if (!off()) Plotly.Plots.resize(gd)
    }, 450)
}

function relabel_panel(p) {
    const title = t('plot.panel', { n: p.id })
    p.el.setAttribute('aria-label', title)
    p.title.firstElementChild.textContent = t('plot.panel_word') + ' '
    p.hint.firstElementChild.textContent = t('plot.hint')
    p.hint.lastElementChild.textContent = t('plot.hint_btn')
    const label = (btn, text) => {
        btn.title = text
        btn.setAttribute('aria-label', text)
    }
    label(p.png_btn, t('plot.png'))
    label(p.clear_btn, t('plot.clear_aria'))
    p.clear_btn.title = t('plot.clear')
    label(p.max_btn, t(p.maximized ? 'plot.restore' : 'plot.maximize'))
    p.max_btn.setAttribute('aria-pressed', String(p.maximized))
    p.max_btn.innerHTML = p.maximized ? ICONS.restore : ICONS.max
    label(p.more_btn, t('plot.more'))
    label(p.remove_btn, t('plot.remove'))
}

function set_active(p) {
    if (state.active === p) return
    state.active = p
    for (const q of state.panels) q.el.classList.toggle('active', q === p)
    sync_checks()
}

function clear_panel(p) {
    p.traces = []
    p.yrange = null
    update_chips(p)
    render_panel(p)
    sync_checks()
}

function remove_panel(p) {
    if (p.attached) Plotly.purge(p.plot)
    p.el.remove()
    state.panels.splice(state.panels.indexOf(p), 1)
    if (!state.panels.length) add_panel()
    if (state.active === p || !state.panels.includes(state.active)) {
        state.active = null
        set_active(state.panels[state.panels.length - 1])
    }
    $('panels').classList.toggle('has-max', state.panels.some((q) => q.maximized))
    sync_checks()
    refresh_all()
}

function update_chips(p) {
    p.chips.textContent = ''
    for (const tr of p.traces) {
        const label = t('plot.remove_trace', { key: tr.key })
        const dot = el('span', { class: 'dot' })
        if (DASHES[tr.slot]) dot.dataset.dash = DASHES[tr.slot]
        const chip = el('button', { class: 'chip', style: '--c: var(--series-' + (tr.slot + 1) + ')', title: label, 'aria-label': label, onclick: () => toggle_trace(tr.type, tr.field, p) },
            dot, el('span', { text: tr.key }), tr.unit ? el('small', { text: tr.unit }) : null)
        chip.insertAdjacentHTML('beforeend', ICONS.close)
        p.chips.append(chip)
    }
}

// from_tree: the field was ticked in the sidebar; on a screen where the sidebar is a drawer the toast says where it went
function toggle_trace(type, field, panel, from_tree) {
    const p = panel || state.active
    if (!p) return
    const key = type + '.' + field
    const idx = p.traces.findIndex((t) => t.key === key)
    if (idx >= 0) {
        p.traces.splice(idx, 1)
    } else {
        if (p.traces.length >= MAX_TRACES) {
            toast(t('plot.max', { n: MAX_TRACES }))
            sync_checks()
            return
        }
        if (!load_series(type, field)) {
            toast(t('plot.nodata', { key }), true)
            sync_checks()
            return
        }
        let slot = 0
        while (p.traces.some((t) => t.slot === slot)) slot++
        const unit = state.type_map.get(type).fields.find((f) => f.name === field).unit
        p.traces.push({ key, type, field, unit, slot })
        if (from_tree && is_drawer() && !$('app').classList.contains('collapsed')) {
            toast(t('plot.added', { n: p.id }), false, { label: t('plot.view'), run: () => set_side(false, true) })
        }
    }
    update_chips(p)
    render_panel(p)
    sync_checks()
}

function mode_shapes() {
    const c = theme_colors()
    const shapes = []
    if (state.show_modes) {
        const alpha = is_dark() ? 0.16 : 0.11
        for (const m of state.modes) {
            const t1 = m.t1 == null ? Math.max(state.t_end, m.t0) : m.t1
            shapes.push({ type: 'rect', xref: 'x', yref: 'paper', x0: m.t0, x1: t1, y0: 0, y1: 1, fillcolor: hex_alpha(c.series[m.slot], alpha), line: { width: 0 }, layer: 'below' })
        }
    }
    if (state.marker != null) {
        shapes.push({ type: 'line', xref: 'x', yref: 'paper', x0: state.marker, x1: state.marker, y0: 0, y1: 1, line: { color: c.accent, width: 1.5, dash: 'dot' } })
    }
    if (state.cursor != null) {
        shapes.push({ type: 'line', xref: 'x', yref: 'paper', x0: state.cursor, x1: state.cursor, y0: 0, y1: 1, line: { color: c.muted, width: 1 } })
    }
    return shapes
}

// Tick labels as m:ss when the log runs past 10 minutes; plain seconds below that
function time_ticks() {
    const a = state.xrange ? state.xrange[0] : state.t_start
    const b = state.xrange ? state.xrange[1] : state.t_end
    if (!(b - a > 600)) return { ticksuffix: ' s' }
    const step = [10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200].find((s) => (b - a) / s <= 9) || 7200
    const vals = []
    for (let v = Math.ceil(a / step) * step; v <= b; v += step) vals.push(v)
    return { tickmode: 'array', tickvals: vals, ticktext: vals.map((v) => Math.floor(v / 60) + ':' + String(Math.round(v % 60)).padStart(2, '0')), ticksuffix: ' s' }
}

function mode_annotations() {
    if (!state.show_modes) return []
    const c = theme_colors()
    const a = state.xrange ? state.xrange[0] : state.t_start
    const b = state.xrange ? state.xrange[1] : state.t_end
    const out = []
    for (const m of state.modes) {
        const t0 = Math.max(m.t0, a)
        const t1 = Math.min(m.t1 == null ? state.t_end : m.t1, b)
        if ((t1 - t0) / (b - a) < 0.045) continue
        out.push({ x: t0, xref: 'x', y: 1, yref: 'paper', xanchor: 'left', yanchor: 'top', xshift: 4, yshift: -3, text: m.name, showarrow: false, font: { size: 11, color: c.muted } })
    }
    return out
}

// The Y unit sits horizontally above the axis instead of a rotated axis title, which saves width on narrow screens
function unit_annotation(units) {
    if (!units.length) return []
    return [{ xref: 'paper', yref: 'paper', x: 0, y: 1, xanchor: 'left', yanchor: 'bottom', text: units.join(', '), showarrow: false, font: { size: 12, color: theme_colors().text2 } }]
}

function build_layout(p, first) {
    const c = theme_colors()
    const units = [...new Set(p.traces.map((t) => t.unit).filter(Boolean))]
    const axis = { gridcolor: c.grid, linecolor: c.grid, zeroline: false, tickfont: { color: c.text2 } }
    return {
        margin: window.innerWidth <= 560 ? { l: 46, r: 10, t: 22, b: 30 } : { l: 58, r: 30, t: 22, b: 34 },
        modebar: { bgcolor: 'rgba(0,0,0,0)', color: c.muted, activecolor: c.accent },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', size: 12, color: c.text2 },
        showlegend: false,
        hovermode: 'x unified',
        dragmode: TOUCH ? false : state.dragmode, // touch gestures are handled by setup_touch
        hoverlabel: { bgcolor: c.surface, bordercolor: c.border, font: { color: c.text1, size: 12 } },
        xaxis: Object.assign({}, axis, time_ticks(), {
            range: state.xrange || undefined,
            autorange: !state.xrange,
            hoverformat: '.3f', // no thousands separator in the tooltip header
            showspikes: true,
            spikemode: 'across',
            spikethickness: 1,
            spikecolor: c.muted,
            spikedash: 'dot',
        }),
        yaxis: Object.assign({}, axis, {
            range: p.yrange || undefined,
            autorange: !p.yrange,
            automargin: true,
        }),
        shapes: mode_shapes(),
        annotations: (first ? mode_annotations() : []).concat(unit_annotation(units)),
    }
}

function build_traces(p) {
    const c = theme_colors()
    return p.traces.map((t) => {
        const d = view_slice(load_series(t.type, t.field), state.xrange)
        return {
            type: 'scatter',
            mode: 'lines',
            x: d.x,
            y: d.y,
            name: t.key,
            line: { color: c.series[t.slot], width: TOUCH ? 2 : 1.6, dash: DASHES[t.slot] || 'solid' },
            hovertemplate: '%{y:.6~g}' + (t.unit ? ' ' + t.unit : '') + '<extra>%{fullData.name}</extra>',
        }
    })
}

function render_panel(p) {
    p.el.classList.toggle('empty', !p.traces.length)
    if (!p.traces.length) {
        if (p.attached) Plotly.purge(p.plot)
        p.attached = false
        return
    }
    Plotly.react(p.plot, build_traces(p), build_layout(p, state.panels[0] === p), plot_config()).then(() => {
        if (!p.attached) {
            p.attached = true
            p.plot.on('plotly_relayout', (ev) => on_relayout(p, ev))
            if (!TOUCH) {
                p.plot.on('plotly_hover', (ev) => sync_hover(p, ev))
                p.plot.on('plotly_unhover', () => sync_unhover(p))
            }
        }
        fit_plot(p)
    })
}

// The cursor follows the mouse in every panel: the hover at one time shows the tooltip and spike of all of them
let hover_busy = false
let hover_frame = 0
function sync_hover(source, ev) {
    if (hover_busy || !ev.points || !ev.points.length) return
    const x = ev.points[0].x
    cancelAnimationFrame(hover_frame)
    hover_frame = requestAnimationFrame(() => {
        hover_busy = true
        try {
            for (const q of state.panels) {
                if (q !== source && q.attached) Plotly.Fx.hover(q.plot, { xval: x }, 'xy')
            }
        } finally {
            hover_busy = false
        }
    })
}

function sync_unhover(source) {
    if (hover_busy) return
    cancelAnimationFrame(hover_frame)
    hover_busy = true
    try {
        for (const q of state.panels) {
            if (q !== source && q.attached) Plotly.Fx.unhover(q.plot)
        }
    } finally {
        hover_busy = false
    }
}

let refresh_pending = false
function schedule_refresh() {
    if (refresh_pending) return
    refresh_pending = true
    setTimeout(() => {
        refresh_pending = false
        refresh_all()
    }, 20)
}

function refresh_all() {
    for (const p of state.panels) render_panel(p)
}

function on_relayout(p, ev) {
    let dirty = false
    // Zoom/Pan from the modebar: keep it for every redraw and every panel until another tool is picked
    if (typeof ev.dragmode === 'string') {
        state.dragmode = ev.dragmode
        for (const q of state.panels) {
            if (q !== p && q.attached) Plotly.relayout(q.plot, { dragmode: ev.dragmode })
        }
    }
    if (ev['xaxis.range[0]'] !== undefined) {
        state.xrange = [Number(ev['xaxis.range[0]']), Number(ev['xaxis.range[1]'])]
        dirty = true
    } else if (Array.isArray(ev['xaxis.range'])) {
        state.xrange = ev['xaxis.range'].map(Number)
        dirty = true
    } else if (ev['xaxis.autorange']) {
        // Double click / reset: back to the full view everywhere
        for (const q of state.panels) q.yrange = null
        if (state.xrange) {
            state.xrange = null
            dirty = true
        }
    }
    if (ev['yaxis.range[0]'] !== undefined) p.yrange = [Number(ev['yaxis.range[0]']), Number(ev['yaxis.range[1]'])]
    else if (ev['yaxis.autorange']) p.yrange = null
    if (dirty) schedule_refresh()
}

function reset_zoom() {
    state.xrange = null
    for (const p of state.panels) p.yrange = null
    refresh_all()
}

function set_marker(time) {
    state.marker = time
    if (state.xrange && (time < state.xrange[0] || time > state.xrange[1])) {
        const half = (state.xrange[1] - state.xrange[0]) / 2
        state.xrange = [time - half, time + half]
    }
    show_tab('plots')
    refresh_all()
    toast(t('plot.marker', { t: fmt_time(time) }))
}

function render_mode_legend() {
    const box = $('modeLegend')
    box.textContent = ''
    const seen = new Map()
    for (const m of state.modes) {
        if (!seen.has(m.name)) seen.set(m.name, m.slot)
    }
    box.hidden = !state.show_modes || !seen.size
    const c = theme_colors()
    const alpha = is_dark() ? 0.16 : 0.11
    for (const [name, slot] of seen) {
        const sw = el('i')
        sw.style.background = hex_alpha(c.series[slot], alpha + 0.12)
        box.append(el('span', {}, sw, name))
    }
}

// ---------------------------------------------------------------- tables

function fmt_param(v) {
    return String(parseFloat(Math.fround(v).toPrecision(7)))
}

// What a parameter's value means: the option name for a choice, the active bits for a bitmask
function param_value_meaning(info, value) {
    if (!info) return ''
    if (info.v && info.v[String(value)] !== undefined) return info.v[String(value)]
    if (info.b && Number.isInteger(value) && value > 0) {
        return Object.entries(info.b).filter(([bit]) => Math.floor(value / 2 ** Number(bit)) % 2 === 1).map(([, name]) => name).join(', ')
    }
    return ''
}

function render_params() {
    const q = $('paramSearch').value.trim().toLowerCase()
    const only = $('paramChanged').checked
    const body = el('tbody')
    let n = 0
    for (const p of state.params) {
        const info = param_info(p.name)
        if (q && !p.name.toLowerCase().includes(q) && !(info && (info.n + ' ' + info.d).toLowerCase().includes(q))) continue
        const changed = p.first !== p.last
        if (only && !changed) continue
        n++
        const value = el('td', { class: 'num' }, el('div', { text: fmt_param(p.last) }))
        const meaning = param_value_meaning(info, p.last)
        if (meaning) value.append(el('div', { class: 'pmeaning', text: meaning }))
        if (changed) {
            const was = param_value_meaning(info, p.first)
            value.append(el('div', { class: 'was', text: t('param.was', { v: fmt_param(p.first) + (was ? ' (' + was + ')' : '') }) }))
        }
        const row = el('tr', { class: 'param-row' + (changed ? ' changed' : '') })
        // A tap on the row expands its description
        row.addEventListener('click', () => row.classList.toggle('open'))
        const desc = el('td', { class: 'pdesc' })
        if (info) {
            desc.title = param_summary(info)
            desc.append(el('div', { class: 'pname', text: info.n }), el('div', { class: 'ptext', text: info.d }))
            const extra = []
            if (info.r) extra.push(t('param.range') + ': ' + info.r + (info.u ? ' ' + info.u : ''))
            else if (info.u) extra.push(t('param.units') + ': ' + info.u)
            if (extra.length) desc.append(el('div', { class: 'pextra', text: extra.join('   ') }))
        }
        row.append(el('td', { class: 'mono' }, p.name), value, desc)
        body.append(row)
    }
    if (!n) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: '3', text: state.params.length ? t('param.none_match') : t('param.none') })))
    $('paramTable').textContent = ''
    $('paramTable').append(el('table', {}, el('thead', {}, el('tr', {}, el('th', { text: t('param.name') }), el('th', { class: 'num', text: t('param.value') }), el('th', { text: t('param.desc') }))), body))
}

function render_messages() {
    const q = $('msgSearch').value.trim().toLowerCase()
    const body = el('tbody')
    let n = 0
    for (const m of state.messages) {
        if (!state.msg_kinds.has(m.kind) || (q && !m.text.toLowerCase().includes(q))) continue
        if (++n > 3000) break
        const tag = el('span', { class: 'tag' + (m.kind === 'ERR' ? ' err' : ''), text: (m.kind === 'ERR' ? '▲ ' : '') + m.kind })
        const mark = el('span', { class: 'mk', 'aria-hidden': 'true' })
        mark.innerHTML = ICONS.mark
        const text = el('td', {}, mark, m.text)
        const row = el('tr', { class: 'click' + (m.kind === 'ERR' ? ' err' : ''), title: t('msg.mark') }, el('td', { class: 'num', text: fmt_time(m.t) }), el('td', {}, tag), text)
        row.addEventListener('click', () => set_marker(m.t))
        body.append(row)
    }
    if (!n) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: '3', text: state.messages.length ? t('msg.none_match') : t('msg.none') })))
    $('msgTable').textContent = ''
    $('msgTable').append(el('table', { class: 'msg-table' }, el('thead', {}, el('tr', {}, el('th', { text: t('msg.time') }), el('th', { text: t('msg.type') }), el('th', { text: t('msg.text') }))), body))
}

function render_kinds() {
    const box = $('msgKinds')
    box.textContent = ''
    for (const kind of ['MSG', 'ERR', 'EV']) {
        const on = state.msg_kinds.has(kind)
        const count = state.messages.filter((m) => m.kind === kind).length
        const button = el('button', {
            class: 'kind', type: 'button', 'aria-pressed': String(on),
            onclick: () => {
                if (state.msg_kinds.has(kind)) state.msg_kinds.delete(kind)
                else state.msg_kinds.add(kind)
                render_kinds()
                render_messages()
            },
        })
        button.innerHTML = ICONS.check.replace('<svg ', '<svg class="kind-check" aria-hidden="true" ')
        button.append(el('span', { text: kind }), el('small', { class: 'kind-count', text: String(count) }))
        box.append(button)
    }
}

// Only the plots use the field sidebar: on the other tabs it is put away, and comes back with the plots
function show_tab(name) {
    state.tab = name
    for (const tab of document.querySelectorAll('.tab')) {
        const on = tab.dataset.tab === name
        tab.classList.toggle('active', on)
        tab.setAttribute('aria-selected', String(on))
    }
    $('panePlots').hidden = name !== 'plots'
    $('paneParams').hidden = name !== 'params'
    $('paneMsgs').hidden = name !== 'msgs'
    $('plotTools').hidden = name !== 'plots'
    if (name !== 'plots') set_focus(false)
    apply_side_state()
    if (name === 'plots') {
        for (const p of state.panels) {
            if (p.attached) Plotly.Plots.resize(p.plot)
        }
    }
}

// ---------------------------------------------------------------- loading

// detail: { name, size } while a file is being opened. The step text changes with set_overlay_text; the elapsed time
// runs under the bar so a long load shows it is alive
let overlay_timer = 0
let overlay_t0 = 0
let overlay_step = ''
function show_overlay(text, detail) {
    overlay_step = text
    set_progress(0)
    $('overlay').hidden = false
    $('overlayDetail').hidden = !detail
    $('overlayDetail').textContent = detail ? detail.name + '  ·  ' + fmt_bytes(detail.size) : ''
    $('overlayWarn').hidden = !(detail && detail.size > BIG_FILE)
    overlay_t0 = Date.now()
    clearInterval(overlay_timer)
    overlay_timer = setInterval(draw_overlay_text, 500)
    draw_overlay_text()
}

function set_overlay_text(text) {
    overlay_step = text
    draw_overlay_text()
}

function draw_overlay_text() {
    const s = Math.floor((Date.now() - overlay_t0) / 1000)
    $('overlayText').textContent = s >= 2 ? overlay_step + '  (' + s + ' s)' : overlay_step
}

function hide_overlay() {
    clearInterval(overlay_timer)
    $('overlay').hidden = true
}

function set_progress(fraction) {
    const bar = $('overlayBar')
    bar.classList.toggle('indeterminate', fraction == null)
    bar.firstElementChild.style.width = fraction == null ? '' : Math.round(fraction * 100) + '%'
}

function read_file(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onprogress = (ev) => {
            if (ev.lengthComputable) set_progress(ev.loaded / ev.total)
        }
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error || new Error(t('load.read_fail')))
        reader.readAsArrayBuffer(file)
    })
}

// A parameter file only has something for the Hardware Report: the viewer and PID Review need a log
async function open_param_file(file) {
    show_overlay(t('load.reading', { name: file.name }), { name: file.name, size: file.size })
    try {
        const text = await file.text()
        set_session('param', file.name, null, text)
        state.log = null
        state.info = { kind: 'param', name: file.name, size: file.size }
        show_file_info()
        show_view('hardware')
    } catch (err) {
        console.error(err)
        toast(t('load.fail', { err: err.message }), true)
    } finally {
        hide_overlay()
    }
}

async function open_file(file) {
    if (/\.(param|parm)$/i.test(file.name)) {
        await open_param_file(file)
        return
    }
    if (!/\.bin$/i.test(file.name)) {
        toast(t('load.only_bin'), true)
        return
    }
    show_overlay(t('load.reading', { name: file.name }), { name: file.name, size: file.size })
    try {
        const buffer = await read_file(file)
        await parser_ready
        set_overlay_text(t('load.indexing'))
        set_progress(null)
        await next_frame()
        const log = new window.DataflashParser()
        // No message types requested: only offsets are indexed, fields are read when plotted
        log.processData(buffer, [])
        let info = {}
        try {
            info = get_version_and_board(log)
        } catch (err) {
            console.warn('Could not read version info', err)
        }
        // Message and parameter descriptions, and the names behind ERR / EV codes
        set_overlay_text(t('load.docs'))
        await load_docs(info.build_type)
        set_session('bin', file.name, buffer)
        load_log(log, file, info)
    } catch (err) {
        console.error(err)
        toast(t('load.fail', { err: err.message }), true)
    } finally {
        hide_overlay()
    }
}

function reset_state() {
    for (const p of state.panels) {
        if (p.attached) Plotly.purge(p.plot)
    }
    $('panels').textContent = ''
    $('panels').classList.remove('has-max')
    Object.assign(state, {
        panels: [], active: null, next_panel: 1, xrange: null, t_start: Infinity, t_end: -Infinity,
        modes: [], marker: null, cursor: null, expanded: new Set(), filter: '',
    })
    hide_readout()
    series_cache.clear()
    time_cache.clear()
    $('search').value = ''
    update_search_clear()
    $('paramSearch').value = ''
    $('msgSearch').value = ''
    $('paramChanged').checked = false
}

function load_log(log, file, info) {
    const types = build_types(log)
    if (!types.length) {
        throw new Error(t('load.no_messages'))
    }
    reset_state()
    state.log = log
    state.types = types
    state.type_map = new Map(state.types.map((t) => [t.name, t]))

    state.build_type = info.build_type
    estimate_span()
    load_modes(info.build_type)
    load_params()
    load_messages()

    const stats = log.stats()
    state.info = {
        kind: 'bin',
        name: file.name,
        size: file.size,
        fw: info.fw_string || '',
        board: info.flight_controller || '',
        duration: state.t_end > state.t_start ? state.t_end - state.t_start : 0,
        types: Object.keys(stats).length,
        messages: Object.values(stats).reduce((sum, s) => sum + (s.count || 0), 0),
        params: state.params.length,
    }
    show_file_info()
    $('paramCount').textContent = state.params.length || ''
    $('msgCount').textContent = state.messages.length || ''

    // A parameter file gives no viewer, so come back to it when a log is opened
    if (view === 'viewer' || session.kind === 'bin') show_view(view)
    render_tree()
    render_mode_legend()
    render_params()
    render_kinds()
    render_messages()
    add_panel()
    show_tab('plots')
    // The first log opened on a screen with a drawer shows the fields at once; there is nothing else to do yet
    if (is_drawer() && !drawer_greeted) {
        drawer_greeted = true
        set_side(true)
    }
}

// ---------------------------------------------------------------- wiring

// Called by set_lang once the static markup is translated: redo everything built from code
function on_lang_change() {
    for (const p of state.panels) {
        relabel_panel(p)
        update_chips(p)
    }
    for (const key of Object.keys(TOOLS)) {
        if (tool_state[key].inited) translate_tool($(TOOLS[key].root))
    }
    update_chrome_text()
    update_side_ui()
    if (!state.log) return
    // The Portuguese description texts are unpacked on first use
    load_docs(state.build_type).then(() => {
        load_messages()
        render_tree()
        render_params()
        render_kinds()
        render_messages()
        refresh_all()
    })
}

function setup() {
    apply_i18n()
    views_setup()
    $('langBtn').addEventListener('click', () => set_lang(lang === 'pt' ? 'en' : 'pt'))
    const saved_theme = pref_get('theme')
    if (saved_theme === 'light' || saved_theme === 'dark') document.documentElement.dataset.theme = saved_theme
    $('sideToggle').innerHTML = ICONS.side
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (!document.documentElement.dataset.theme) theme_changed()
    })
    apply_mode()
    chrome_setup()
    update_chrome_text()

    const input = $('fileInput')
    $('openBtn').addEventListener('click', () => input.click())
    $('dropCard').addEventListener('click', () => input.click())
    $('welcomeOpen').addEventListener('click', (ev) => {
        ev.stopPropagation()
        input.click()
    })
    $('dropCard').addEventListener('keydown', (ev) => {
        if (ev.target === $('dropCard') && (ev.key === 'Enter' || ev.key === ' ')) {
            ev.preventDefault()
            input.click()
        }
    })
    input.addEventListener('change', () => {
        if (input.files[0]) open_file(input.files[0])
        input.value = ''
    })
    $('themeBtn').addEventListener('click', toggle_theme)

    // Drag and drop anywhere on the page
    let depth = 0
    const has_files = (ev) => ev.dataTransfer && Array.from(ev.dataTransfer.types).includes('Files')
    window.addEventListener('dragenter', (ev) => {
        if (!has_files(ev)) return
        ev.preventDefault()
        depth++
        $('dragVeil').hidden = false
    })
    window.addEventListener('dragover', (ev) => {
        if (has_files(ev)) ev.preventDefault()
    })
    window.addEventListener('dragleave', (ev) => {
        if (!has_files(ev)) return
        if (--depth <= 0) {
            depth = 0
            $('dragVeil').hidden = true
        }
    })
    window.addEventListener('drop', (ev) => {
        if (!has_files(ev)) return
        ev.preventDefault()
        depth = 0
        $('dragVeil').hidden = true
        if (ev.dataTransfer.files[0]) open_file(ev.dataTransfer.files[0])
    })

    // Sidebar
    $('tree').addEventListener('click', on_tree_click)
    $('tree').addEventListener('change', on_tree_change)
    $('search').addEventListener('input', () => {
        state.filter = $('search').value.trim().toLowerCase()
        update_search_clear()
        render_tree()
    })
    $('search').addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && $('search').value) {
            ev.stopPropagation()
            $('search').value = ''
            $('search').dispatchEvent(new Event('input'))
        }
    })
    const resizer = $('resizer')
    resizer.addEventListener('pointerdown', (ev) => {
        resizer.setPointerCapture(ev.pointerId)
        resizer.classList.add('drag')
    })
    resizer.addEventListener('pointermove', (ev) => {
        if (!resizer.classList.contains('drag')) return
        document.documentElement.style.setProperty('--side-w', Math.min(560, Math.max(220, ev.clientX)) + 'px')
        for (const p of state.panels) {
            if (p.attached) Plotly.Plots.resize(p.plot)
        }
    })
    resizer.addEventListener('pointerup', () => {
        resizer.classList.remove('drag')
        pref_set('side-w', parseInt(getComputedStyle(document.documentElement).getPropertyValue('--side-w')))
    })

    // Workspace
    for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', () => show_tab(tab.dataset.tab))
    $('addPanel').addEventListener('click', () => {
        add_panel()
        $('panels').lastElementChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
    $('resetZoom').addEventListener('click', reset_zoom)
    $('modesToggle').addEventListener('change', () => {
        state.show_modes = $('modesToggle').checked
        render_mode_legend()
        refresh_all()
    })
    $('paramSearch').addEventListener('input', render_params)
    $('paramChanged').addEventListener('change', render_params)
    $('msgSearch').addEventListener('input', render_messages)
    window.addEventListener('resize', () => {
        if (apply_mode()) on_mode_change()
        for (const p of state.panels) {
            if (p.attached && p.plot.offsetWidth > 0) Plotly.Plots.resize(p.plot)
        }
    })
}

setup()
