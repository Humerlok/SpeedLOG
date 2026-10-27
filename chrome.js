// Speed Log: the chrome around the plots (top bar, menus, sheets, drawer, focus mode, presets, cursor readout, shortcuts).
// Loaded before SpeedLog.js and used by it; everything here runs from setup() or from user actions, never at load.

// ---------------------------------------------------------------- preferences

const PREF_PREFIX = 'logviewerlite-'

function pref_get(key) {
    try {
        return localStorage.getItem(PREF_PREFIX + key)
    } catch {
        return null
    }
}

function pref_set(key, value) {
    try {
        if (value == null) localStorage.removeItem(PREF_PREFIX + key)
        else localStorage.setItem(PREF_PREFIX + key, String(value))
    } catch { /* storage may be blocked */ }
}

// ---------------------------------------------------------------- menus

let open_menu_el = null
let open_menu_anchor = null

// A menu that code builds is created once, on first use
function menu_for(id) {
    let menu = $(id)
    if (!menu) {
        menu = el('div', { id, class: 'menu', role: 'menu', hidden: '' })
        document.body.append(menu)
    }
    return menu
}

// items: [{ label, run, checked, disabled } | { separator: true }]; without items the menu keeps the buttons it has
function show_menu(menu, anchor, items) {
    hide_menu()
    if (items) {
        menu.textContent = ''
        for (const item of items) {
            if (item.separator) {
                menu.append(el('div', { class: 'menu-sep', role: 'separator' }))
                continue
            }
            const radio = item.checked !== undefined
            const button = el('button', { class: 'menu-item', type: 'button', role: radio ? 'menuitemradio' : 'menuitem', text: item.label })
            if (radio) button.setAttribute('aria-checked', String(!!item.checked))
            button.disabled = !!item.disabled
            button.addEventListener('click', () => {
                hide_menu()
                item.run()
            })
            menu.append(button)
        }
    }
    menu.hidden = false
    const box = anchor.getBoundingClientRect()
    const w = menu.offsetWidth
    const h = menu.offsetHeight
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, box.right - w))
    const below = box.bottom + 4
    menu.style.left = left + 'px'
    menu.style.top = (below + h > window.innerHeight - 8 ? Math.max(8, box.top - h - 4) : below) + 'px'
    anchor.setAttribute('aria-expanded', 'true')
    open_menu_el = menu
    open_menu_anchor = anchor
    const first = menu.querySelector('.menu-item:not(:disabled)')
    if (first) first.focus()
}

function hide_menu(refocus) {
    if (!open_menu_el) return
    open_menu_el.hidden = true
    open_menu_anchor.setAttribute('aria-expanded', 'false')
    if (refocus) open_menu_anchor.focus()
    open_menu_el = null
    open_menu_anchor = null
}

function menu_keydown(ev) {
    if (!open_menu_el) return false
    if (ev.key === 'Escape') {
        hide_menu(true)
        return true
    }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        const items = Array.from(open_menu_el.querySelectorAll('.menu-item:not(:disabled)'))
        const i = items.indexOf(document.activeElement)
        const next = ev.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1)
        if (items.length) items[next].focus()
        ev.preventDefault()
        return true
    }
    if (ev.key === 'Tab') hide_menu()
    return false
}

// ---------------------------------------------------------------- sheets (log details, shortcuts)

let sheet_opener = null

function open_sheet(id) {
    close_sheet()
    const sheet = $(id)
    sheet_opener = document.activeElement
    sheet.hidden = false
    const close = sheet.querySelector('.sheet-head .icon-btn')
    if (close) close.focus()
}

function close_sheet() {
    for (const sheet of document.querySelectorAll('.sheet-wrap')) {
        if (sheet.hidden) continue
        sheet.hidden = true
        if (sheet_opener && sheet_opener.isConnected && !sheet_opener.hidden) sheet_opener.focus()
        sheet_opener = null
    }
}

const sheet_open = () => !!document.querySelector('.sheet-wrap:not([hidden])')

function trap_tab(ev, container) {
    const items = Array.from(container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((e) => !e.disabled && !e.hidden && e.offsetParent !== null)
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (ev.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
        ev.preventDefault()
        last.focus()
    } else if (!ev.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
        ev.preventDefault()
        first.focus()
    }
}

// ---------------------------------------------------------------- the file in the top bar

function show_file_info() {
    const info = state.info
    if (!info) return
    const meta = [fmt_bytes(info.size)]
    if (info.fw) meta.push(info.fw)
    if (info.board) meta.push(info.board)
    if (info.duration) meta.push(fmt_duration(info.duration))
    $('fileName').textContent = info.name
    $('fileMeta').textContent = meta.join('  ·  ')
    $('fileInfo').hidden = false
    $('fileInfo').setAttribute('aria-label', t('file.details') + ': ' + info.name)
    $('menuDetails').hidden = false
    render_file_sheet()
}

function render_file_sheet() {
    const info = state.info
    const box = $('fileDetails')
    box.textContent = ''
    if (!info) return
    const rows = [[t('file.name'), info.name], [t('file.size'), fmt_bytes(info.size)]]
    if (info.kind === 'param') {
        rows.push([t('file.kind_param'), '.param'])
    } else {
        if (info.fw) rows.push([t('file.fw'), info.fw])
        if (info.board) rows.push([t('file.board'), info.board])
        if (info.duration) rows.push([t('file.duration'), fmt_duration(info.duration)])
        rows.push([t('file.types'), info.types.toLocaleString()], [t('file.messages'), info.messages.toLocaleString()], [t('file.params'), info.params.toLocaleString()])
    }
    for (const [name, value] of rows) box.append(el('dt', { text: name }), el('dd', { text: value }))
}

// ---------------------------------------------------------------- sidebar: drawer, docked, put away

// The sidebar of the field tree. Docked, the user's choice is kept in side_pref; as a drawer it starts closed and
// drawer_open says whether it is up. Only the plots tab uses it.
let side_pref = true
let drawer_open = false

function side_is_open() {
    return !$('app').classList.contains('collapsed')
}

// open: show or hide; user: the user did it (focus follows into the drawer and back out)
function set_side(open, user) {
    if (view !== 'viewer') return
    const was = side_is_open()
    if (is_drawer()) drawer_open = open
    else side_pref = open
    apply_side_state()
    if (!is_drawer() || was === side_is_open()) return
    if (open && user) $('sideClose').focus()
    else if (!open && user) $('sideToggle').focus()
}

function toggle_side() {
    if (view === 'viewer') {
        set_side(!side_is_open(), true)
        return
    }
    const pane = $(TOOLS[view].pane)
    pane.classList.toggle('collapsed')
    $('sideToggle').setAttribute('aria-expanded', String(!pane.classList.contains('collapsed')))
    fit_tool_plots(view)
}

// Brings every part of the page that depends on the sidebar in line with the format, the tab and the open state
function apply_side_state() {
    const drawer = is_drawer()
    const app = $('app')
    const plots = view === 'viewer' && !!state.log && state.tab === 'plots'
    const open = plots && (drawer ? drawer_open : side_pref)
    // The other tabs put the sidebar away without forgetting what the user chose
    app.classList.toggle('collapsed', !open)
    const modal = open && drawer
    $('sideScrim').hidden = !modal
    const sidebar = $('sidebar')
    if (modal) {
        sidebar.setAttribute('role', 'dialog')
        sidebar.setAttribute('aria-modal', 'true')
    } else {
        sidebar.removeAttribute('role')
        sidebar.removeAttribute('aria-modal')
    }
    // The tool views list their sections in a strip above the content instead of a drawer
    if (screen_mode() !== 'desktop') {
        for (const key of Object.keys(TOOLS)) $(TOOLS[key].pane).classList.remove('collapsed')
    }
    const toggle = $('sideToggle')
    if (view === 'viewer') toggle.hidden = !plots
    else toggle.hidden = !(session.kind && screen_mode() === 'desktop')
    toggle.setAttribute('aria-expanded', String(view === 'viewer' ? open : !$(TOOLS[view].pane).classList.contains('collapsed')))
    update_side_ui()
    update_chrome_vars()
    setTimeout(fit_all_plots, 30)
}

function fit_all_plots() {
    for (const p of state.panels) fit_plot(p)
}

// The badge on the sidebar button, and the selector of the panel that gets the ticked fields
function update_side_ui() {
    const total = state.panels.reduce((sum, p) => sum + p.traces.length, 0)
    const toggle = $('sideToggle')
    let badge = $('sideBadge')
    if (!badge) {
        badge = el('span', { id: 'sideBadge', class: 'toggle-badge', hidden: '' })
        toggle.append(badge)
    }
    badge.textContent = String(total)
    badge.hidden = !total || side_is_open()

    const select = $('targetPanel')
    const signature = lang + '|' + state.panels.map((p) => p.id + ':' + p.traces.length).join(',')
    if (select.dataset.signature !== signature) {
        select.dataset.signature = signature
        select.textContent = ''
        for (const p of state.panels) {
            select.append(el('option', { value: String(p.id), text: t('plot.panel', { n: p.id }) + (p.traces.length ? '  ·  ' + p.traces.length : '') }))
        }
    }
    select.value = state.active ? String(state.active.id) : ''
}

function update_search_clear() {
    $('searchClear').hidden = !$('search').value
}

// ---------------------------------------------------------------- descriptions in the field tree

// Shown by default where there is room; the user's choice, once made, is remembered
function apply_desc_pref() {
    const saved = pref_get('desc')
    const mode = screen_mode()
    const visible = saved != null ? saved === '1' : (mode === 'desktop' || mode === 'tablet')
    document.documentElement.classList.toggle('hide-desc', !visible)
    $('descToggle').checked = visible
}

// ---------------------------------------------------------------- focus mode

function set_focus(on) {
    on = !!on && view === 'viewer' && !!state.log && state.tab === 'plots'
    if (document.body.classList.contains('focus') === on) return
    document.body.classList.toggle('focus', on)
    $('focusHandle').hidden = !on
    $('focusBtn').setAttribute('aria-pressed', String(on))
    hide_menu()
    if (on && is_drawer()) set_side(false)
    update_chrome_vars()
    setTimeout(fit_all_plots, 30)
    setTimeout(fit_all_plots, 260)
    if (on) $('focusHandle').focus()
    else $('focusBtn').focus()
}

// ---------------------------------------------------------------- cursor readout (touch)

function fmt_val(v) {
    return Number.isFinite(v) ? String(Number(v.toPrecision(6))) : '-'
}

function nearest_index(x, time) {
    const i = lower_bound(x, time)
    if (i <= 0) return 0
    if (i >= x.length) return x.length - 1
    return time - x[i - 1] <= x[i] - time ? i - 1 : i
}

// A tap pins the cursor at an instant and the strip below the plots lists every trace's value there
function set_cursor(time) {
    state.cursor = time
    draw_readout()
    refresh_all()
}

function draw_readout() {
    const box = $('readout')
    if (state.cursor == null) {
        box.hidden = true
        return
    }
    $('readout').querySelector('.readout-time').textContent = 't = ' + state.cursor.toFixed(3) + ' s'
    const items = $('readout').querySelector('.readout-items')
    items.textContent = ''
    for (const p of state.panels) {
        for (const tr of p.traces) {
            const s = load_series(tr.type, tr.field)
            if (!s) continue
            const i = nearest_index(s.x, state.cursor)
            const dot = el('span', { class: 'dot', style: '--c: var(--series-' + (tr.slot + 1) + ')' })
            if (DASHES[tr.slot]) dot.dataset.dash = DASHES[tr.slot]
            items.append(el('span', { class: 'readout-item' }, dot, el('span', { class: 'rname', text: tr.key }), el('span', { class: 'rval', text: fmt_val(s.y[i]) }), tr.unit ? el('span', { class: 'runit', text: tr.unit }) : null))
        }
    }
    box.hidden = false
}

function hide_readout() {
    state.cursor = null
    $('readout').hidden = true
}

// ---------------------------------------------------------------- presets

// Panels ready to be built in one tap. A preset keeps only the fields this log has; one with none is not offered.
// Add more here: fields are 'MESSAGE.Field' and an instanced message (BAT[0]) is found by its base name.
const PRESETS = [
    { id: 'attitude', fields: ['ATT.Roll', 'ATT.Pitch', 'ATT.Yaw'] },
    { id: 'altitude', fields: ['CTUN.Alt', 'CTUN.DAlt', 'BARO.Alt'] },
    { id: 'battery', fields: ['BAT.Volt', 'BAT.Curr'] },
    { id: 'vibration', fields: ['VIBE.VibeX', 'VIBE.VibeY', 'VIBE.VibeZ'] },
    { id: 'motors', fields: ['RCOU.C1', 'RCOU.C2', 'RCOU.C3', 'RCOU.C4'] },
    { id: 'gps', fields: ['GPS.NSats', 'GPS.HDop'] },
    { id: 'rc', fields: ['RCIN.C1', 'RCIN.C2', 'RCIN.C3', 'RCIN.C4'] },
]

function resolve_preset_field(key) {
    const dot = key.indexOf('.')
    const name = key.slice(0, dot)
    const field = key.slice(dot + 1)
    const type = state.type_map.get(name) || state.types.find((ty) => ty.base === name)
    return type && type.time_field && type.fields.some((f) => f.name === field) ? { type: type.name, field } : null
}

function preset_fields(preset) {
    return preset.fields.map(resolve_preset_field).filter(Boolean)
}

function apply_preset(preset) {
    const fields = preset_fields(preset)
    if (!fields.length) return
    const target = state.active && !state.active.traces.length ? state.active : add_panel()
    for (const f of fields) toggle_trace(f.type, f.field, target)
    $('panels').lastElementChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

function open_presets_menu() {
    const items = PRESETS.filter((p) => preset_fields(p).length).map((p) => ({ label: t('preset.' + p.id), run: () => apply_preset(p) }))
    if (!items.length) items.push({ label: t('preset.none'), disabled: true, run: () => {} })
    show_menu(menu_for('presetsMenu'), $('presetsBtn'), items)
}

// ---------------------------------------------------------------- texts built in code

const SHORTCUTS = [
    ['S', 'help.side', 'sideToggle'],
    ['M', 'help.modes', 'modesSwitch'],
    ['R', 'help.reset', 'resetZoom'],
    ['P', 'help.panel', 'addPanel'],
    ['F', 'help.focus', 'focusBtn'],
    ['/', 'help.search'],
    ['?', 'help.help'],
]

function render_help_sheet() {
    const box = $('helpList')
    box.textContent = ''
    for (const [key, text] of SHORTCUTS) {
        const dt = el('dt')
        dt.append(el('kbd', { class: 'kbd', text: key }))
        box.append(dt, el('dd', { text: t(text) }))
    }
}

// Tooltips of the buttons that have a shortcut name it (not on a touch screen, which has no keyboard)
function decorate_titles() {
    if (TOUCH) return
    for (const [key, , id] of SHORTCUTS) {
        const button = id && $(id)
        if (button && button.dataset.i18nTitle) button.title = t(button.dataset.i18nTitle) + ' (' + key + ')'
    }
}

// Called by set_lang and at start: everything of the chrome that holds text
function update_chrome_text() {
    const next = lang === 'pt' ? 'English' : 'Português (Brasil)'
    $('menuLang').textContent = t('top.lang_to', { name: next })
    update_theme_button()
    render_help_sheet()
    render_file_sheet()
    show_file_info()
    decorate_titles()
    $('focusHandle').innerHTML = ICONS.restore
}

// ---------------------------------------------------------------- format changes

function on_mode_change() {
    hide_menu()
    $('overflowBtn').hidden = screen_mode() !== 'phone'
    if (is_drawer()) drawer_open = false
    apply_desc_pref()
    apply_side_state()
}

// ---------------------------------------------------------------- wiring

function chrome_setup() {
    const side = pref_get('side-w')
    if (side) document.documentElement.style.setProperty('--side-w', side + 'px')
    $('focusHandle').innerHTML = ICONS.restore
    render_help_sheet()
    decorate_titles()
    on_mode_change()

    $('sideToggle').addEventListener('click', toggle_side)
    $('sideClose').addEventListener('click', () => set_side(false, true))
    $('sideScrim').addEventListener('click', () => set_side(false, true))
    $('targetPanel').addEventListener('change', () => {
        const p = state.panels.find((q) => String(q.id) === $('targetPanel').value)
        if (p) set_active(p)
    })
    $('descToggle').addEventListener('change', () => {
        pref_set('desc', $('descToggle').checked ? '1' : '0')
        apply_desc_pref()
    })
    $('searchClear').addEventListener('click', () => {
        $('search').value = ''
        $('search').dispatchEvent(new Event('input'))
        $('search').focus()
    })

    $('fileInfo').addEventListener('click', () => open_sheet('fileSheet'))
    $('menuDetails').addEventListener('click', () => {
        hide_menu()
        open_sheet('fileSheet')
    })
    $('menuHelp').addEventListener('click', () => {
        hide_menu()
        open_sheet('helpSheet')
    })
    $('menuLang').addEventListener('click', () => {
        hide_menu()
        set_lang(lang === 'pt' ? 'en' : 'pt')
    })
    $('menuTheme').addEventListener('click', () => {
        hide_menu()
        toggle_theme()
    })
    $('overflowBtn').addEventListener('click', () => {
        if (open_menu_el === $('overflowMenu')) hide_menu()
        else show_menu($('overflowMenu'), $('overflowBtn'))
    })
    $('presetsBtn').addEventListener('click', () => {
        if (open_menu_el === $('presetsMenu')) hide_menu()
        else open_presets_menu()
    })
    for (const sheet of document.querySelectorAll('.sheet-wrap')) {
        sheet.addEventListener('click', (ev) => {
            if (ev.target.closest('[data-close]')) close_sheet()
        })
    }
    $('focusBtn').addEventListener('click', () => set_focus(true))
    $('focusHandle').addEventListener('click', () => set_focus(false))
    $('readout').querySelector('.readout-close').addEventListener('click', () => {
        hide_readout()
        refresh_all()
    })

    document.addEventListener('pointerdown', (ev) => {
        if (open_menu_el && !open_menu_el.contains(ev.target) && !open_menu_anchor.contains(ev.target)) hide_menu()
    }, true)
    document.addEventListener('keydown', on_key)
}

function typing() {
    const e = document.activeElement
    return !!e && (/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName) || e.isContentEditable)
}

function on_key(ev) {
    if (ev.key === 'Escape') {
        if (menu_keydown(ev)) return
        if (sheet_open()) close_sheet()
        else if (is_drawer() && side_is_open() && view === 'viewer') set_side(false, true)
        else if (document.body.classList.contains('focus')) set_focus(false)
        return
    }
    if (menu_keydown(ev)) return
    if (ev.key === 'Tab') {
        const sheet = document.querySelector('.sheet-wrap:not([hidden]) .sheet')
        if (sheet) trap_tab(ev, sheet)
        else if (view === 'viewer' && is_drawer() && side_is_open()) trap_tab(ev, $('sidebar'))
        return
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey || typing() || sheet_open()) return
    const plots = view === 'viewer' && !!state.log && state.tab === 'plots'
    switch (ev.key) {
    case '?':
        ev.preventDefault()
        open_sheet('helpSheet')
        break
    case '/':
        if (plots) {
            ev.preventDefault()
            set_side(true, false)
            $('search').focus()
        }
        break
    case 's': case 'S':
        if (plots) set_side(!side_is_open(), true)
        break
    case 'm': case 'M':
        if (plots) {
            $('modesToggle').checked = !$('modesToggle').checked
            $('modesToggle').dispatchEvent(new Event('change'))
        }
        break
    case 'r': case 'R':
        if (plots) reset_zoom()
        break
    case 'p': case 'P':
        if (plots) $('addPanel').click()
        break
    case 'f': case 'F':
        if (plots) set_focus(!document.body.classList.contains('focus'))
        break
    }
}
