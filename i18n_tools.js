// Speed Log: Portuguese for the texts of the Hardware Report and PID Review views.
// The ported tools build most of their text in code; known labels are translated by exact match. Anything not
// listed (device names, values, free-form messages) stays as the tool wrote it.

const TOOL_PT = {
    'Accel': 'Acelerômetro',
    'Accel calibration:': 'Calibração do acelerômetro:',
    'Accel health:': 'Saúde do acelerômetro:',
    'Accel temperature calibration:': 'Calibração de temperatura do acelerômetro:',
    'Actual': 'Real',
    'Airspeed': 'Velocidade do ar',
    'Airspeed Sensors': 'Sensores de velocidade do ar',
    'All': 'Todos',
    'Altitude': 'Altitude',
    'Amplitude scale': 'Escala de amplitude',
    'Analysis time': 'Intervalo de análise',
    'Axis': 'Eixo',
    'Barometer': 'Barômetro',
    'Barometers': 'Barômetros',
    'Basic Configuration Parameters': 'Parâmetros de configuração básica',
    'Board Voltage': 'Tensão da placa',
    'Branches @ HEAD:': 'Branches no HEAD:',
    'Bus fault': 'Falha de barramento',
    'Calculate': 'Calcular',
    'Calibration': 'Calibração',
    'Changed from defaults': 'Alterados em relação ao padrão',
    'Clock drift': 'Deriva do relógio',
    'Compass': 'Bússola',
    'Compasses': 'Bússolas',
    'Components': 'Componentes',
    'Configuration parameters excluding calibrations, flight modes, etc. You may select certain of these to be included with the check boxes below. For sharing and comparing similar vehicle configurations.': 'Parâmetros de configuração, sem calibrações, modos de voo etc. Você pode incluir alguns deles nas caixas de seleção abaixo. Serve para compartilhar e comparar configurações de veículos parecidos.',
    'Constraining NaN': 'Limitando NaN',
    'Data Rates': 'Taxas de dados',
    'Dead zone': 'Zona morta',
    'Declination': 'Declinação',
    'Download Files': 'Baixar arquivos',
    'Download Parameters': 'Baixar parâmetros',
    'Download Waypoints': 'Baixar waypoints',
    'DroneCAN devices': 'Dispositivos DroneCAN',
    'Dropped messages': 'Mensagens descartadas',
    'End (s)': 'Fim (s)',
    'Error': 'Erro',
    'FFT Settings': 'Configurações da FFT',
    'Fast loop': 'Laço rápido',
    'Fault Address: 0x': 'Endereço da falha: 0x',
    'Fault ICS Register:': 'Registrador ICS da falha:',
    'Fault Line:': 'Linha da falha:',
    'Fault Long Return Address: 0x': 'Endereço longo de retorno da falha: 0x',
    'Fault Thread Priority:': 'Prioridade da thread da falha:',
    'Fault Thread name:': 'Nome da thread da falha:',
    'Fault Type:': 'Tipo da falha:',
    'Flight Controller': 'Controladora de voo',
    'Flight Data': 'Dados de voo',
    'Flight modes': 'Modos de voo',
    'For more information see ArduPilot': 'Para mais informações, veja a documentação do ArduPilot',
    'Found commit:': 'Commit encontrado:',
    'Free Buffer Space': 'Espaço livre no buffer',
    'Free memory': 'Memória livre',
    'Frequency domain': 'Domínio da frequência',
    'Frequency resolution:': 'Resolução de frequência:',
    'Frequency scale': 'Escala de frequência',
    'Gyro': 'Giroscópio',
    'Gyro calibration:': 'Calibração do giroscópio:',
    'Gyro health:': 'Saúde do giroscópio:',
    'Gyro temperature calibration:': 'Calibração de temperatura do giroscópio:',
    'Hard fault': 'Falha grave (hard fault)',
    'Health': 'Saúde',
    'Inertial Sensors': 'Sensores inerciais',
    'Inputs': 'Entradas',
    'Internal Error Count:': 'Contagem de erros internos:',
    'Internal Error Line:': 'Linha do erro interno:',
    'Internal Error Mask:': 'Máscara de erros internos:',
    'Internal Errors': 'Erros internos',
    'Interrupt pending': 'Interrupção pendente',
    'Iron calibration:': 'Calibração de ferro:',
    'Last MAVLink Command:': 'Último comando MAVLink:',
    'Last MAVLink Message:': 'Última mensagem MAVLink:',
    'Load': 'Carga',
    'Log Composition': 'Composição do log',
    'Log stats': 'Estatísticas do log',
    'Logging rate:': 'Taxa de gravação:',
    'Loop times': 'Tempos do laço',
    'Memory management fault': 'Falha de gerenciamento de memória',
    'Memory usage': 'Uso de memória',
    'Minimal Configuration': 'Configuração mínima',
    'Motor calibration:': 'Calibração do motor:',
    'No pending interrupt': 'Nenhuma interrupção pendente',
    'None': 'Nenhum',
    'Official release:': 'Versão oficial:',
    'Options': 'Opções',
    'Ordering': 'Ordenação',
    'Orientation': 'Orientação',
    'Output': 'Saída',
    'PID component': 'Componente do PID',
    'Parameters Changed During Logging': 'Parâmetros alterados durante a gravação',
    'PendSV not pending': 'PendSV não pendente',
    'PendSV pending': 'PendSV pendente',
    'PID Spectrogram': 'Espectrograma do PID',
    'Position': 'Posição',
    'Position offset:': 'Deslocamento de posição:',
    'Position offsets': 'Deslocamentos de posição',
    'Power Spectral Density': 'Densidade espectral de potência',
    'Power flags': 'Flags de energia',
    'Pre loop': 'Pré-laço',
    'Reserved': 'Reservado',
    'Reserved for Debug': 'Reservado para depuração',
    'Reset': 'Reiniciar',
    'Response': 'Resposta',
    'Reversals': 'Reversões',
    'Save All Parameters': 'Salvar todos os parâmetros',
    'Save Changed Parameters': 'Salvar parâmetros alterados',
    'Save Minimal Parameters': 'Salvar parâmetros mínimos',
    'Scheduler Task:': 'Tarefa do escalonador:',
    'Semaphore Line:': 'Linha do semáforo:',
    'Setup': 'Configuração',
    'Spectrogram': 'Espectrograma',
    'Stack': 'Pilha (stack)',
    'Start (s)': 'Início (s)',
    'Step Response': 'Resposta ao degrau',
    'Stream rates': 'Taxas de stream',
    'SysTick not pending': 'SysTick não pendente',
    'SysTick pending': 'SysTick pendente',
    'Target': 'Alvo',
    'Temperature': 'Temperatura',
    'Test': 'Teste',
    'Tests': 'Testes',
    'Thread mode': 'Modo thread',
    'Throttle': 'Acelerador',
    'Time (s)': 'Tempo (s)',
    'Time domain': 'Domínio do tempo',
    'Type': 'Tipo',
    'Usage fault': 'Falha de uso (usage fault)',
    'Use': 'Uso',
    'Value': 'Valor',
    'Version check failed to get branches.': 'A verificação de versão não conseguiu obter os branches.',
    'Version check failed to get commit (': 'A verificação de versão não conseguiu obter o commit (',
    'Version check failed to get whitelist (': 'A verificação de versão não conseguiu obter a whitelist (',
    'Version check failed, offline (': 'Verificação de versão indisponível, offline (',
    'Waiting for sample': 'Aguardando amostra',
    'Warning: not official firmware release.': 'Aviso: não é uma versão oficial do firmware.',
    'Warnings': 'Avisos',
    'Watchdog reboot detected, see Watchdog section.': 'Reinício por watchdog detectado, veja a seção Watchdog.',
    'Watchdog reset': 'Reinício por watchdog',
    'Wind compensation': 'Compensação de vento',
    'Wind compensation:': 'Compensação de vento:',
    'Window size': 'Tamanho da janela',
    'Window size must be a power of two': 'O tamanho da janela deve ser uma potência de dois',
    'saves only those parameters that have been changed from their default value': 'salva apenas os parâmetros alterados em relação ao valor padrão',
}

const TOOL_NODE_ORIGINAL = new WeakMap()   // text node or element -> the English text it had

function translate_text(text) {
    if (lang !== 'pt') return text
    const key = text.trim()
    const pt = TOOL_PT[key]
    return pt ? text.replace(key, pt) : text
}

// Translates (or restores) the text of a tool view: text nodes, plus value / title on controls
function translate_tool(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue.trim()) continue
        if (!TOOL_NODE_ORIGINAL.has(n)) TOOL_NODE_ORIGINAL.set(n, n.nodeValue)
        const en = TOOL_NODE_ORIGINAL.get(n)
        const next = lang === 'pt' ? translate_text(en) : en
        if (n.nodeValue !== next) n.nodeValue = next
    }
    for (const e of root.querySelectorAll('input[type="button"], [title]')) {
        for (const attr of ['value', 'title']) {
            if (!e.hasAttribute(attr) || (attr === 'value' && e.type !== 'button')) continue
            let store = TOOL_NODE_ORIGINAL.get(e)
            if (!store) TOOL_NODE_ORIGINAL.set(e, store = {})
            if (!(attr in store)) store[attr] = e.getAttribute(attr)
            const next = lang === 'pt' ? translate_text(store[attr]) : store[attr]
            if (e.getAttribute(attr) !== next) e.setAttribute(attr, next)
        }
    }
    apply_i18n(root)
}
