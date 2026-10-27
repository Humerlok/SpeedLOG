// Speed Log: the views. "Log Viewer" is the plotter (SpeedLog.js); "Hardware Report" and "PID Review" are the
// original tools ported into the page (hardware.js / pid.js, ported from the former standalone tools). They all work on the one
// file opened in the top bar, and the tool views are set up the first time they are opened.

const TOOLS = {
    hardware: { root: 'hwRoot', pane: 'toolHardware', nav: 'hwNav', empty: 'hwEmpty', api: () => window.HW },
    pid: { root: 'pidRoot', pane: 'toolPid', nav: 'pidNav', empty: 'pidEmpty', api: () => window.PID },
}

// The file the views share. kind is 'bin' (a log) or 'param' (a parameter file); id changes with every file
const session = { id: 0, kind: '', name: '', buffer: null, text: '' }
const tool_state = { hardware: { inited: false, loaded: 0 }, pid: { inited: false, loaded: 0 } }
let view = 'viewer'

function set_session(kind, name, buffer, text) {
    session.id++
    session.kind = kind
    session.name = name
    session.buffer = buffer || null
    session.text = text || ''
    window.app_file_name = name
}

function update_view_tabs() {
    const have = !!session.kind
    $('viewTabs').hidden = !have
    for (const b of document.querySelectorAll('.viewtab')) {
        b.classList.toggle('active', b.dataset.view === view)
        b.setAttribute('aria-selected', String(b.dataset.view === view))
        // A parameter file has no flight data to plot or analyse
        const needs_log = b.dataset.view !== 'hardware'
        b.disabled = needs_log && session.kind === 'param'
    }
}

function show_view(name) {
    view = name
    const have = !!session.kind
    const viewer_ready = view === 'viewer' && !!state.log
    $('app').hidden = !viewer_ready
    for (const key of Object.keys(TOOLS)) $(TOOLS[key].pane).hidden = !(view === key && have)
    $('welcome').hidden = view === 'viewer' ? viewer_ready : have
    if (view !== 'viewer') set_focus(false)
    hide_menu()
    update_view_tabs()
    apply_side_state()
    if (viewer_ready) {
        for (const p of state.panels) fit_plot(p)
    } else if (view !== 'viewer' && have) {
        run_tool(view)
    }
}

async function run_tool(name) {
    const tool = TOOLS[name]
    const ts = tool_state[name]
    const root = $(tool.root)
    try {
        if (!ts.inited) {
            ts.inited = true
            root.innerHTML = window.TOOL_MARKUP[name]
            make_sections(root, name)
            await app_loading_call(() => tool.api().init(root), name === 'pid' ? 'load.pid' : 'load.hw')
            watch_setup()
            translate_tool(root)
            apply_i18n()
        }
        if (ts.loaded === session.id) return
        ts.loaded = session.id
        if (name === 'pid') $('pidSetupBox').open = true
        await app_loading_call(async () => {
            const api = tool.api()
            api.reset()
            if (session.kind === 'bin') {
                if (name === 'hardware') await api.load_log(session.buffer)
                else await api.load(session.buffer)
            } else if (name === 'hardware') {
                api.load_param_file(session.text)
            }
        }, name === 'pid' ? 'load.pid' : 'load.hw')
        if (name === 'hardware') upgrade_status(root)
        translate_tool(root)
        apply_i18n()
        if (name === 'pid') settle_setup()
        open_first_section(name)
    } catch (err) {
        console.error(err)
        toast(t('load.fail', { err: err.message }), true)
    }
}

// ---------------------------------------------------------------- what the ported tools expect from the page

// message is an i18n key saying what is being done ("Calculating…"); the tools pass it along from their markup.
// A recalculation of the PID Review also drives the Calculate button and dims the previous result.
async function app_loading_call(fn, message) {
    show_overlay(t(message || 'load.loading'))
    set_progress(null)
    const calc = message === 'pid.calculating'
    if (calc) calc_state('busy')
    await next_frame()
    try {
        await fn()
    } finally {
        hide_overlay()
        if (calc) settle_setup()
    }
}

// ---------------------------------------------------------------- PID Review setup and Calculate button

function calc_state(state_name) {
    const btn = document.getElementById('calculate')
    if (!btn) return
    const busy = state_name === 'busy'
    btn.setAttribute('aria-busy', String(busy))
    if (state_name === 'done') btn.dataset.state = 'done'
    else delete btn.dataset.state
    $('calcLabel').textContent = t(busy ? 'pid.calculating' : (state_name === 'done' ? 'pid.done' : 'pid.calculate'))
    $('pidRoot').classList.toggle('calculating', busy)
}

// After a calculation: Calculate says it is up to date, the setup folds into one line with what was asked
function settle_setup() {
    const btn = document.getElementById('calculate')
    if (!btn) return
    calc_state(btn.disabled ? 'done' : 'ready')
    const axis = document.querySelector('#pidSetup input[name="Axis"]:checked')
    const label = axis ? axis.nextElementSibling.textContent : '-'
    $('pidSetupSummary').textContent = t('pid.summary', { axis: label, win: $('FFTWindow_size').value, from: $('TimeStart').value, to: $('TimeEnd').value })
    for (const radio of document.querySelectorAll('#pidSetup input[name="Axis"]')) {
        radio.parentElement.title = radio.disabled ? t('pid.no_data') : ''
    }
    if (btn.disabled && session.kind === 'bin') $('pidSetupBox').open = false
}

// Changing anything in the form makes the last result out of date again
function watch_setup() {
    const form = $('pidSetup')
    const stale = () => {
        const btn = document.getElementById('calculate')
        if (btn && btn.dataset.state === 'done') calc_state('ready')
    }
    form.addEventListener('input', stale)
    form.addEventListener('change', stale)
}

// ---------------------------------------------------------------- status marks of the Hardware Report

const ST_ICONS = {
    ok: '<svg class="st-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M4.6 8.4l2.3 2.3 4.5-5" fill="none" stroke="var(--surface-1)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bad: '<svg class="st-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="2.5" fill="currentColor"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="var(--surface-1)" stroke-width="1.8" stroke-linecap="round"/></svg>',
    warn: '<svg class="st-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5L15 14H1z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/><path d="M8 6v4M8 11.7v.1" stroke="var(--surface-1)" stroke-width="1.7" stroke-linecap="round"/></svg>',
}
const ST_MARKS = { '\u2705': 'ok', '\u274C': 'bad', '\u26A0\uFE0F': 'warn', '\u26A0': 'warn' }

// The tool writes check and cross emoji into its text; they look different on every Android and say nothing to
// someone who cannot tell the colours apart. Each becomes an icon with a word, in the palette.
function upgrade_status(root) {
    const marks = new RegExp('(' + Object.keys(ST_MARKS).join('|') + ')', 'g')
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const found = []
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        marks.lastIndex = 0
        if (marks.test(n.nodeValue)) found.push(n)
    }
    for (const node of found) {
        const frag = document.createDocumentFragment()
        for (const part of node.nodeValue.split(marks)) {
            const kind = ST_MARKS[part]
            if (!kind) {
                if (part) frag.append(part)
                continue
            }
            const span = el('span', { class: 'st ' + kind })
            span.innerHTML = ST_ICONS[kind]
            span.append(el('span', { class: 'st-text', 'data-i18n': 'st.' + kind, text: t('st.' + kind) }))
            frag.append(span)
        }
        node.replaceWith(frag)
    }
}

function app_alert(message) {
    toast(translate_text(String(message)), true)
}

// Downloads. The Android app has no browser download manager, so it saves through the system file picker
function app_save(blob, name) {
    if (window.AndroidBridge && window.AndroidBridge.saveFile) {
        const reader = new FileReader()
        reader.onload = () => window.AndroidBridge.saveFile(String(reader.result).split(',')[1], name)
        reader.readAsDataURL(blob)
        return
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
}

const TOOL_ICONS = {
    'exclamation-triangle-orange': '#d97706',
    'exclamation-triangle-red': '#dc2626',
}

function app_icon(name) {
    const color = TOOL_ICONS[name] || '#d97706'
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 3L2 21h20L12 3z" fill="' + color + '"/>' +
        '<path d="M12 9v6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="18" r="1.3" fill="#fff"/></svg>'
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

// Plots made by the tools get the Speed Log colours
function themed_layout(layout) {
    const c = theme_colors()
    const out = Object.assign({}, layout)
    out.paper_bgcolor = 'rgba(0,0,0,0)'
    out.plot_bgcolor = 'rgba(0,0,0,0)'
    out.font = Object.assign({ family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', size: 12, color: c.text2 }, layout && layout.font)
    for (const key of Object.keys(out)) {
        if (/^[xy]axis[0-9]*$/.test(key)) {
            out[key] = Object.assign({ gridcolor: c.grid, linecolor: c.grid, zerolinecolor: c.grid, tickfont: { color: c.text2 } }, out[key])
        }
    }
    if (out.scene) {
        const axis = (a) => Object.assign({ gridcolor: c.grid, zerolinecolor: c.grid, color: c.text2 }, a)
        out.scene = Object.assign({}, out.scene, { xaxis: axis(out.scene.xaxis), yaxis: axis(out.scene.yaxis), zaxis: axis(out.scene.zaxis) })
    }
    out.legend = Object.assign({ orientation: 'h', x: 0, xanchor: 'left', y: 1.02, yanchor: 'bottom' }, out.legend, { font: Object.assign({ color: c.text2 }, out.legend && out.legend.font) })
    // The look of the viewer plots: its series colours, modebar and hover label
    if (!out.colorway) out.colorway = c.series
    out.modebar = Object.assign({ bgcolor: 'rgba(0,0,0,0)', color: c.muted, activecolor: c.accent }, out.modebar)
    out.hoverlabel = Object.assign({ bgcolor: c.surface, bordercolor: c.border, font: { color: c.text1, size: 12 } }, out.hoverlabel)
    if (TOUCH && !out.scene) out.dragmode = false
    return out
}

function app_plot(kind, div, data, layout, config) {
    const cfg = Object.assign({}, plot_config(), config, { responsive: true })
    const done = Plotly[kind](div, data, themed_layout(layout), cfg)
    done.then(() => {
        watch_size(div)
        if (TOUCH && !(layout && layout.scene)) tool_touch(div)
    })
    return done
}

// A plot keeps the size it was drawn at. The tools draw into boxes that are hidden (closed sections) or that change
// size (screen turned, section opened), so each plot follows its box, as the Speed Log plots do.
const watched_plots = new WeakSet()

function fit_div(gd) {
    // Plotly sizes to the box including its border
    const box = gd.getBoundingClientRect()
    if (!gd._fullLayout || box.width <= 0 || box.height <= 0) return
    if (Math.abs(gd._fullLayout.width - box.width) > 2 || Math.abs(gd._fullLayout.height - box.height) > 2) {
        Plotly.Plots.resize(gd)
        clearTimeout(gd.fit_timer)
        gd.fit_timer = setTimeout(() => fit_div(gd), 450)
    }
}

function watch_size(gd) {
    if (watched_plots.has(gd)) return
    watched_plots.add(gd)
    new ResizeObserver(() => fit_div(gd)).observe(gd)
}

// Same touch gestures as the Speed Log plots, on the plots of the tool views: one finger drags sideways to pan
// (vertical drags still scroll the page), two fingers pinch with a damped zoom, double tap shows everything again
function tool_touch(gd) {
    if (gd.dataset.touch) return
    gd.dataset.touch = '1'
    gd.style.touchAction = 'pan-y'
    let g = null
    let last_tap = 0
    const axis = () => gd._fullLayout && gd._fullLayout.xaxis
    const span = (a) => a.range.map(Number)
    const apply = (a, b) => Plotly.relayout(gd, { 'xaxis.range': [a, b] })
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)

    gd.addEventListener('touchstart', (ev) => {
        const xa = axis()
        if (!xa || !xa.range) return
        if (ev.touches.length === 2) {
            const r = gd.getBoundingClientRect()
            const mid = (ev.touches[0].clientX + ev.touches[1].clientX) / 2
            const frac = Math.min(1, Math.max(0, (mid - r.left - xa._offset) / xa._length))
            g = { mode: 'pinch', d0: dist(ev.touches), range: span(xa), frac }
        } else if (ev.touches.length === 1) {
            const now = Date.now()
            if (now - last_tap < 300) Plotly.relayout(gd, { 'xaxis.autorange': true, 'yaxis.autorange': true })
            last_tap = now
            g = { mode: 'wait', x: ev.touches[0].clientX, y: ev.touches[0].clientY, range: span(xa) }
        }
    }, { passive: true })

    gd.addEventListener('touchmove', (ev) => {
        const xa = axis()
        if (!g || !xa) return
        if (g.mode === 'pinch' && ev.touches.length === 2) {
            ev.preventDefault()
            const ratio = Math.pow(g.d0 / dist(ev.touches), PINCH_DAMPING)
            const [a, b] = g.range
            const width = (b - a) * ratio
            const anchor = a + g.frac * (b - a)
            apply(anchor - g.frac * width, anchor + (1 - g.frac) * width)
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
            const shift = (dx / xa._length) * (b - a)
            apply(a - shift, b - shift)
        }
    }, { passive: false })

    const end = (ev) => { if (!ev.touches.length) g = null }
    gd.addEventListener('touchend', end, { passive: true })
    gd.addEventListener('touchcancel', end, { passive: true })
}

// ---------------------------------------------------------------- sections picked in the sidebar

// A tool view is a long page of sections. Like the viewer, the sidebar lists them and only the one picked is shown,
// filling the screen. A header starts a section that runs up to the next header; what comes before the first header
// (the Hardware Report warnings) stays on top. The PID Review setup moves into the sidebar.
function make_sections(root, name) {
    let current = null
    let n = 0
    for (const node of Array.from(root.children)) {
        if (node.classList.contains('skip')) continue
        let start
        let block = false
        if (name === 'hardware') {
            if (node.classList.contains('always')) {
                current = null
                continue
            }
            start = node.tagName === 'H3'
            block = node.tagName === 'DIV' && !!node.firstElementChild && node.firstElementChild.tagName === 'H3'
        } else {
            start = node.tagName === 'TABLE' && !!node.querySelector('h2')
            if (node.classList.contains('pid-form')) {
                $('pidSetup').append(node)
                continue
            }
        }
        if (start || block) {
            current = 'sec' + (n++)
            node.classList.add('sec-start')
            if (block) node.classList.add('sec-block')
            node.dataset.sec = current
        } else if (current) {
            node.classList.add('sec-member')
            node.dataset.sec = current
        }
        // A box that holds a plot lets the plot take the room that is left
        if (node.querySelector(':scope > div[style*="--plot-h"]')) node.classList.add('plot-card')
    }
}

// The sidebar list: one entry per section that has something to show
function refresh_nav(name) {
    const tool = TOOLS[name]
    const root = $(tool.root)
    const nav = $(tool.nav)
    const open = root.querySelector('.sec-start.sec-open')
    nav.textContent = ''
    for (const start of root.querySelectorAll('.sec-start')) {
        if (start.hidden) continue
        const title = start.querySelector('h2, h3') || start
        const label = Array.from(title.childNodes).filter((c) => c.nodeType === Node.TEXT_NODE).map((c) => c.nodeValue).join(' ').replace(/\s+/g, ' ').trim()
        if (!label) continue
        const item = el('button', { class: 'nav-item' + (start === open ? ' active' : ''), type: 'button', text: label })
        item.addEventListener('click', () => select_section(name, start))
        nav.append(item)
    }
}

function select_section(name, start) {
    const tool = TOOLS[name]
    const root = $(tool.root)
    const id = start.dataset.sec
    for (const e of root.querySelectorAll('.sec-open')) e.classList.remove('sec-open')
    for (const e of root.querySelectorAll('[data-sec="' + id + '"]')) e.classList.add('sec-open')
    $(tool.empty).hidden = true
    refresh_nav(name)
    $(tool.pane).querySelector('.pane').scrollTop = 0
    // Plots drawn while their section was closed have no size yet: size them as soon as the section shows
    requestAnimationFrame(() => fit_tool_plots(name, id))
    setTimeout(() => fit_tool_plots(name, id), 60)
}

function fit_tool_plots(name, id) {
    const sel = id ? '[data-sec="' + id + '"] .js-plotly-plot, [data-sec="' + id + '"].js-plotly-plot' : '.js-plotly-plot'
    for (const gd of $(TOOLS[name].root).querySelectorAll(sel)) fit_div(gd)
}

// A new file opens on the first section that has something to show
function open_first_section(name) {
    const tool = TOOLS[name]
    for (const e of $(tool.root).querySelectorAll('.sec-open')) e.classList.remove('sec-open')
    refresh_nav(name)
    const first = $(tool.nav).querySelector('.nav-item')
    if (first) first.click()
    $(tool.empty).hidden = !!first
}

// ---------------------------------------------------------------- wiring

function retheme_tools() {
    const c = theme_colors()
    for (const div of document.querySelectorAll('.tool .js-plotly-plot')) {
        const update = { paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', 'font.color': c.text2, 'legend.font.color': c.text2 }
        for (const key of Object.keys(div.layout || {})) {
            if (/^[xy]axis[0-9]*$/.test(key)) {
                update[key + '.gridcolor'] = c.grid
                update[key + '.linecolor'] = c.grid
                update[key + '.zerolinecolor'] = c.grid
                update[key + '.tickfont.color'] = c.text2
            }
        }
        Plotly.relayout(div, update)
    }
}

// --topbar-h is the top bar (the drawer and its scrim start below it), --chrome-h the fixed chrome above the plots:
// top bar plus the tools bar (zero while that one is hidden, and zero for both in focus mode)
function update_chrome_vars() {
    const bar = document.querySelector('.topbar')
    const tools = document.querySelector('.wbar')
    const focus = document.body.classList.contains('focus')
    const root = document.documentElement.style
    root.setProperty('--topbar-h', (focus ? 0 : bar.offsetHeight) + 'px')
    root.setProperty('--chrome-h', focus ? '0px' : (bar.offsetHeight + (tools ? tools.offsetHeight : 0)) + 'px')
}

function views_setup() {
    for (const b of document.querySelectorAll('.viewtab')) {
        b.addEventListener('click', () => show_view(b.dataset.view))
    }
    const watcher = new ResizeObserver(update_chrome_vars)
    watcher.observe(document.querySelector('.topbar'))
    if (document.querySelector('.wbar')) watcher.observe(document.querySelector('.wbar'))
    update_chrome_vars()
}
