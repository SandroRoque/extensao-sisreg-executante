(function () {
    'use strict';

    const INTERNADO_STORAGE_KEY = 'sisregExecutanteJaInternado';
    const TRANSFER_MODAL_ID = 'sisreg-transfer-modal';
    const TRANSFER_MENU_LINK_ID = 'sisreg-transfer-custom-link';
    const RELEASE_MODAL_ID = 'sisreg-release-modal';
    const RELEASE_MENU_LINK_ID = 'sisreg-release-custom-link';

    const DEFAULT_USER_CONTEXT = {
        usuario: null,
        perfil: null,
        unidade_nome: null,
        unidade_cnes: null
    };
    const REQUIRED_PROFILE = 'EXECUTANTE INT';

    let clinicOptionsCache = null;
    let latestTransferResults = [];
    let latestReleaseResults = [];
    let latestTransferSortState = {
        key: 'dt_internacao',
        direction: 'asc'
    };
    let latestReleaseSortState = {
        key: 'dt_internacao',
        direction: 'asc'
    };
    let latestReleaseSearchState = {
        clinica: '',
        cnsPaciente: '',
        currentPage: 0,
        totalPages: 1
    };

    function normalizeText(value) {
        return String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    const DEBUG = false;

    function debugLog(...args) {
        if (DEBUG) {
            console.log(...args);
        }
    }

    function debugInfo(...args) {
        if (DEBUG) {
            console.info(...args);
        }
    }

    function loadUserContext() {
        try {
            if (window.top && window.top.__SISREG_EXECUTANTE_USER__) {
                return {
                    ...DEFAULT_USER_CONTEXT,
                    ...window.top.__SISREG_EXECUTANTE_USER__
                };
            }
        } catch (err) {
            debugInfo('Unable to read top-window SISREG context.', err);
        }

        return { ...DEFAULT_USER_CONTEXT };
    }

    function saveUserContext(context) {
        try {
            window.top.__SISREG_EXECUTANTE_USER__ = {
                ...DEFAULT_USER_CONTEXT,
                ...context
            };
        } catch (err) {
            debugInfo('Unable to store top-window SISREG context.', err);
        }
    }

    function updateSisregUser(patch) {
        const next = {
            ...loadUserContext(),
            ...patch
        };

        saveUserContext(next);
        window.sisregExecutanteUser = next;
        debugLog('SISREG executante context:', next);
    }

    function hasExecutanteProfile() {
        let context = null;

        if (window.top === window) {
            context = window.sisregExecutanteUser || window.__SISREG_EXECUTANTE_USER__ || null;
        } else {
            try {
                context = window.top.sisregExecutanteUser || window.top.__SISREG_EXECUTANTE_USER__ || null;
            } catch (err) {
                debugInfo('Unable to read top-window SISREG context from iframe.', err);
            }
        }

        return normalizeText(context?.perfil) === normalizeText(REQUIRED_PROFILE);
    }

    function parseDetalheUsuario(el) {
        if (!el) {
            return;
        }

        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();

        const usuarioMatch = text.match(/Operador:\s*([^\s]+)/i);
        const perfilMatch = text.match(/Perfil:\s*(.+?)(?=\s*(Unidade:|$))/i);
        const unidadeMatch = text.match(/Unidade:\s*(.*?)\s*\((\d+)\)/i);

        updateSisregUser({
            usuario: usuarioMatch ? usuarioMatch[1].trim() : null,
            perfil: perfilMatch ? perfilMatch[1].trim() : null,
            unidade_nome: unidadeMatch ? unidadeMatch[1].trim() : null,
            unidade_cnes: unidadeMatch ? unidadeMatch[2].trim() : null
        });
    }

    function bootstrapUserContext() {
        window.sisregExecutanteUser = loadUserContext();

        const detalheUsuario = document.getElementById('detalheUsuario');
        if (detalheUsuario) {
            parseDetalheUsuario(detalheUsuario);
            return;
        }

        const observer = new MutationObserver(() => {
            const lateDetalheUsuario = document.getElementById('detalheUsuario');
            if (!lateDetalheUsuario) return;

            parseDetalheUsuario(lateDetalheUsuario);
            observer.disconnect();
        });

        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    function loadInternadoState() {
        try {
            const raw = localStorage.getItem(INTERNADO_STORAGE_KEY);
            if (!raw) return {};

            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (err) {
            console.warn('Failed to load internado state:', err);
            return {};
        }
    }

    function saveInternadoState(state) {
        try {
            localStorage.setItem(INTERNADO_STORAGE_KEY, JSON.stringify(state));
        } catch (err) {
            console.warn('Failed to save internado state:', err);
        }
    }

    function setInternadoState(solicitacaoId, checked) {
        const current = loadInternadoState();
        current[solicitacaoId] = checked;
        saveInternadoState(current);
    }

    function isInternado(solicitacaoId) {
        const current = loadInternadoState();
        return Boolean(current[solicitacaoId]);
    }

    function extractSolicitacaoIdFromRow(row) {
        const onclickValue = row.getAttribute('onclick') || '';
        const match = onclickValue.match(/mostrarFicha\('([^']+)'\)/);
        return match ? match[1] : null;
    }

    function findInternarTable() {
        return Array.from(document.querySelectorAll('table.table_listagem')).find((table) => {
            const titleCell = table.querySelector('td.td_titulo_tabela');
            return normalizeText(titleCell && titleCell.textContent) === 'laudos autorizados';
        });
    }

    function ensureInternadoHeader(headerRow) {
        if (headerRow.querySelector('[data-sisreg-ja-internado-header="1"]')) {
            return;
        }

        const acaoHeader = Array.from(headerRow.children).find((cell) => {
            return normalizeText(cell.textContent) === 'acao';
        });

        const headerCell = document.createElement('td');
        headerCell.className = 'td_titulo_campo';
        headerCell.setAttribute('data-sisreg-ja-internado-header', '1');
        headerCell.textContent = 'Ja Internado';

        if (acaoHeader) {
            headerRow.insertBefore(headerCell, acaoHeader);
        } else {
            headerRow.appendChild(headerCell);
        }
    }

    function updateInternadoRowHighlight(row, checked) {
        row.style.background = checked ? '#f5a351' : '';
    }

    function createCheckboxCell(row, solicitacaoId) {
        const cell = document.createElement('td');
        cell.align = 'center';
        cell.setAttribute('data-sisreg-ja-internado-cell', '1');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = isInternado(solicitacaoId);
        checkbox.title = 'Marcar paciente como ja internado';

        checkbox.addEventListener('click', (event) => {
            event.stopPropagation();
        });

        checkbox.addEventListener('change', (event) => {
            event.stopPropagation();
            setInternadoState(solicitacaoId, checkbox.checked);
            updateInternadoRowHighlight(row, checkbox.checked);
        });

        cell.addEventListener('click', (event) => {
            event.stopPropagation();
        });

        cell.appendChild(checkbox);
        return cell;
    }

    function ensureInternadoCells(table) {
        const rows = Array.from(table.querySelectorAll('tr.linha_selecionavel'));

        rows.forEach((row) => {
            const solicitacaoId = extractSolicitacaoIdFromRow(row);
            if (!solicitacaoId) return;

            const existingCell = row.querySelector('[data-sisreg-ja-internado-cell="1"]');
            if (existingCell) {
                const checkbox = existingCell.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    checkbox.checked = isInternado(solicitacaoId);
                    updateInternadoRowHighlight(row, checkbox.checked);
                }
                return;
            }

            const acaoCell = Array.from(row.children).find((cell) => {
                return cell.querySelector('input[type="button"][value="Internar"]');
            });

            const checkboxCell = createCheckboxCell(row, solicitacaoId);
            const checkbox = checkboxCell.querySelector('input[type="checkbox"]');
            updateInternadoRowHighlight(row, checkbox ? checkbox.checked : false);

            if (acaoCell) {
                row.insertBefore(checkboxCell, acaoCell);
            } else {
                row.appendChild(checkboxCell);
            }
        });
    }

    function enhanceInternarView() {
        const table = findInternarTable();
        if (!table) return false;

        const headerRow = table.querySelector('tr[align="center"]');
        if (!headerRow) return false;

        ensureInternadoHeader(headerRow);
        ensureInternadoCells(table);
        return true;
    }

    async function postForm(url, data, extra = {}) {
        const response = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Content-Type': 'application/x-www-form-urlencoded',
                ...(extra.headers || {})
            },
            body: new URLSearchParams(data),
            ...extra
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`HTTP ${response.status} em ${url}\n${text.slice(0, 400)}`);
        }

        return response;
    }

    function buildUrl(path, params) {
        const url = new URL(path, location.origin);
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.set(key, value);
        });
        return url.toString();
    }

    function sleep(ms) {
        return new Promise((resolve) => {
            window.setTimeout(resolve, ms);
        });
    }

    async function httpGetText(url, extra = {}) {
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                ...(extra.headers || {})
            },
            ...extra
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`HTTP ${response.status} em ${url}\n${text.slice(0, 400)}`);
        }

        return response.text();
    }

    async function fetchTransferClinics() {
        if (clinicOptionsCache) {
            return clinicOptionsCache;
        }

        const response = await fetch('/cgi-bin/config_saida_permanencia', {
            method: 'GET',
            credentials: 'include',
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} loading config_saida_permanencia`);
        }

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const select = doc.querySelector('select[name="cmb_clinica"]');

        clinicOptionsCache = Array.from(select ? select.options : [])
            .map((option) => ({
                value: option.value,
                label: (option.textContent || '').replace(/\s+/g, ' ').trim()
            }))
            .filter((option) => option.label);

        return clinicOptionsCache;
    }

    async function pesquisarInternacoes(clinicaOrigem, cnsPaciente = '', pageIndex = 0) {
        const response = await postForm('/cgi-bin/config_saida_permanencia', {
            etapa: 'PESQUISAR',
            cns_paciente: cnsPaciente,
            no_usuario: '',
            co_procedimento: '',
            cmb_clinica: String(clinicaOrigem),
            dt_inicial: '',
            dt_final: '',
            ordenacao: '2',
            pagina: String(pageIndex)
        }, {
            referrer: `${location.origin}/cgi-bin/config_saida_permanencia`
        });

        return response.text();
    }

    function extractInternacoesDoHtml(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const tabela = Array.from(doc.querySelectorAll('table.table_listagem')).find((table) => {
            return normalizeText(table.textContent).includes('internacoes em andamento');
        });

        if (!tabela) {
            return [];
        }

        const linhas = Array.from(tabela.querySelectorAll('tr'))
            .filter((row) => (row.getAttribute('onclick') || '').includes('mostrarFicha('));

        return linhas.map((row) => {
            const cells = Array.from(row.querySelectorAll('td'));
            const onclickValue = row.getAttribute('onclick') || '';
            const match = onclickValue.match(/mostrarFicha\('(\d+)'\)/);

            return {
                cod_solicitacao_ficha: match ? match[1] : '',
                dt_internacao: (cells[0]?.textContent || '').trim(),
                paciente: (cells[1]?.textContent || '').trim(),
                procedimento: (cells[2]?.textContent || '').replace(/\s+/g, ' ').trim(),
                clinica: (cells[3]?.textContent || '').replace(/\s+/g, ' ').trim()
            };
        }).filter((item) => item.cod_solicitacao_ficha);
    }

    function extractPaginationFromHtml(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const txtPaginaInput = doc.querySelector('input[name="txtPagina"]');
        const pagerCell = txtPaginaInput ? txtPaginaInput.closest('td') : null;
        const pagerText = text(pagerCell);
        const totalPagesMatch = pagerText.match(/\bde\s+(\d+)\b/i);

        if (totalPagesMatch) {
            return {
                currentPage: Math.max(0, Number(txtPaginaInput?.value || txtPaginaInput?.getAttribute('value') || 1) - 1),
                totalPages: Math.max(1, Number(totalPagesMatch[1]))
            };
        }

        const hiddenPage = doc.querySelector('input[name="pagina"]');
        const currentPage = Math.max(0, Number(hiddenPage?.getAttribute('value') || hiddenPage?.value || 0));
        return {
            currentPage,
            totalPages: 1
        };
    }

    async function buscarInternacoes(params = {}) {
        const html = await pesquisarInternacoes(
            params.clinica ?? '',
            params.cnsPaciente ?? '',
            params.pageIndex ?? 0
        );

        return {
            html,
            items: extractInternacoesDoHtml(html),
            pagination: extractPaginationFromHtml(html)
        };
    }

    async function salvarTransferencia(codSolicitacaoFicha, clinicaDestino) {
        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = today.getFullYear();
        const dataTransferencia = `${day}/${month}/${year}`;

        return postForm('/cgi-bin/config_transf_clinica_especialidade', {
            etapa: 'SALVAR_TRANSFERENCIA',
            co_clinica: String(clinicaDestino),
            dt_transferencia: dataTransferencia,
            dt_prev_alta: '',
            cod_solicitacao_ficha: String(codSolicitacaoFicha)
        }, {
            referrer: `${location.origin}/cgi-bin/config_transf_clinica_especialidade`
        });
    }

    async function enviarAlta(coMotivo, codSolicitacaoFicha) {
        const url = buildUrl('/cgi-bin/config_saida_permanencia', {
            etapa: 'SALVAR_ALTA',
            co_motivo: String(coMotivo),
            justificativa_perm: '',
            co_clinica: '',
            cod_solicitacao_ficha: String(codSolicitacaoFicha)
        });

        return httpGetText(url, {
            referrer: `${location.origin}/cgi-bin/config_saida_permanencia`
        });
    }

    function text(node) {
        return (node?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function findLabeledCell(cells, labelName) {
        const expected = normalizeText(labelName);
        return cells.find((cell) => {
            return normalizeText(text(cell)).startsWith(expected);
        }) || null;
    }

    function parseSisregDate(rawValue) {
        const raw = (rawValue || '').trim();
        if (!raw) return null;

        const match = raw.match(/(\d{2})[./](\d{2})[./](\d{4})(?:\s*-\s*(\d{2}):(\d{2})(?::(\d{2}))?)?/);
        if (!match) return null;

        const [, dd, mm, yyyy, hh = '00', min = '00', ss = '00'] = match;
        const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));
        return Number.isNaN(+date) ? null : date;
    }

    function parseAihTable(table) {
        const out = {
            codSol: '',
            cns: '',
            nome: '',
            codProced: '',
            procedimento: '',
            numeroAih: '',
            dataSolicitacao: null,
            dataAutorizacao: null,
            dataReserva: null,
            dataInternacao: null,
            dataPrevistaAlta: null,
            dataAlta: null,
            statusAih: ''
        };

        if (!table) return out;

        const cells = Array.from(table.querySelectorAll('td'));

        function label(name) {
            return findLabeledCell(cells, name);
        }

        function readNextRowSameCol(cell) {
            if (!cell) return '';
            const row = cell.parentElement;
            const nextRow = row ? row.nextElementSibling : null;
            const target = nextRow && nextRow.cells ? nextRow.cells[cell.cellIndex] : null;
            return text(target);
        }

        function getAfterColon(cell) {
            if (!cell) return '';
            const raw = text(cell);
            if (raw.includes(':')) {
                const parts = raw.split(':');
                return (parts[1] || '').trim();
            }
            const sibling = cell.nextElementSibling;
            return text(sibling) || readNextRowSameCol(cell) || '';
        }

        out.codSol = getAfterColon(label('Código Solicitação')) || getAfterColon(label('Codigo Solicitacao'));
        out.numeroAih = getAfterColon(label('Número AIH')) || getAfterColon(label('Numero AIH'));
        out.nome = readNextRowSameCol(label('Nome do Paciente'));

        let trocaCell = null;
        cells.forEach((cell) => {
            if (!trocaCell && /troca de procedimentos/i.test(text(cell))) {
                trocaCell = cell;
            }
        });

        if (trocaCell) {
            const approvedRow = trocaCell.parentElement?.nextElementSibling?.nextElementSibling || null;
            const approvedCell = approvedRow?.cells ? approvedRow.cells[3] : null;
            const approved = text(approvedCell);
            out.statusAih = approved === 'Aprovada' ? 'TROCA_APROVADA' : 'TROCA_PENDENTE';
        }

        if (!out.statusAih) {
            out.statusAih = readNextRowSameCol(label('Status da Solicitação')) || readNextRowSameCol(label('Status da Solicitacao'));
        }

        out.dataSolicitacao = parseSisregDate(getAfterColon(label('Data de Solicitação')) || getAfterColon(label('Data de Solicitacao')));
        out.dataAutorizacao = parseSisregDate(getAfterColon(label('Data de Autorização')) || getAfterColon(label('Data de Autorizacao')));
        out.dataReserva = parseSisregDate(getAfterColon(label('Data de Reserva')));
        out.dataInternacao = parseSisregDate(getAfterColon(label('Data de Internação')) || getAfterColon(label('Data de Internacao')));
        out.dataPrevistaAlta = parseSisregDate(getAfterColon(label('Data Prevista de Alta')));
        out.dataAlta = parseSisregDate(getAfterColon(label('Data de Alta')));

        const procedureLabel = label('Procedimento Solicitado');
        if (procedureLabel) {
            const row = procedureLabel.parentElement?.nextElementSibling || null;
            const c0 = row?.cells ? row.cells[procedureLabel.cellIndex] : null;
            const c1 = row?.cells ? row.cells[procedureLabel.cellIndex + 1] : null;
            out.procedimento = text(c0);
            out.codProced = text(c1);
        }

        if (out.statusAih === 'TROCA_APROVADA' && trocaCell) {
            const headerRow = trocaCell.parentElement?.nextElementSibling || null;
            const headerCell = headerRow?.cells ? headerRow.cells[1] : null;
            if (headerCell && /procedimento/i.test(text(headerCell))) {
                const valueRow = headerRow.nextElementSibling;
                const valueCell = valueRow?.cells ? valueRow.cells[1] : null;
                const cellText = text(valueCell);
                if (cellText) {
                    const parts = cellText.split(' - ', 2);
                    if (parts.length === 2) {
                        out.codProced = parts[0].trim();
                        out.procedimento = parts[1].trim();
                    }
                }
            }
        }

        out.cns = readNextRowSameCol(label('CNS'));
        return out;
    }

    async function getAihTable(codSolicitacaoFicha) {
        const url = buildUrl('/cgi-bin/cons_aih', {
            etapa: 'VISUALIZAR_FICHA',
            co_solicitacao: '',
            cns: '',
            no_usuario: '',
            dt_inicial_sol: '',
            dt_final_sol: '',
            dt_inicial_res: '',
            dt_final_res: '',
            co_procedimento: '',
            co_ups_sol: '',
            co_clinica: '',
            co_prioridade: '',
            cod_solicitacao_ficha: String(codSolicitacaoFicha),
            ordenacao: '',
            pagina: '0'
        });

        const html = await httpGetText(url, {
            referrer: `${location.origin}/cgi-bin/cons_aih`
        });
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.querySelector('table.table_listagem');
    }

    async function getAihDetalhe(codSolicitacaoFicha) {
        const table = await getAihTable(codSolicitacaoFicha);
        return parseAihTable(table);
    }

    async function pegaNumeroAihAltaCondicional(codSolicitacaoFicha, coMotivo = 38, opts = {}) {
        const maxTentativas = opts.maxTentativas != null ? opts.maxTentativas : 8;
        const esperaMs = opts.esperaMs != null ? opts.esperaMs : 1500;

        try {
            const detalhe = await getAihDetalhe(codSolicitacaoFicha);

            if (!detalhe.numeroAih) {
                if (detalhe.statusAih === 'TROCA_PENDENTE') {
                    debugInfo('Status TROCA_PENDENTE. Nao enviar alta.');
                    return {
                        numeroAih: null,
                        detalhe,
                        motivo: 'TROCA_PENDENTE'
                    };
                }

                const hasInternacao = detalhe && detalhe.dataInternacao instanceof Date && !Number.isNaN(+detalhe.dataInternacao);
                if (!hasInternacao) {
                    debugInfo('Sem data de internacao valida. Nao enviar alta.');
                    return {
                        numeroAih: null,
                        detalhe,
                        motivo: 'SEM_INTERNACAO'
                    };
                }

                debugInfo('Numero AIH vazio, enviando alta...');
                await enviarAlta(coMotivo, codSolicitacaoFicha);

                for (let tentativa = 0; tentativa < maxTentativas; tentativa += 1) {
                    if (tentativa > 0) {
                        await sleep(esperaMs);
                    }

                    const detalheAtualizado = await getAihDetalhe(codSolicitacaoFicha);
                    debugInfo(
                        'AIH da internacao do dia',
                        detalheAtualizado.dataInternacao,
                        'de',
                        detalheAtualizado.nome + ':',
                        detalheAtualizado.numeroAih
                    );

                    if (detalheAtualizado.numeroAih) {
                        return {
                            numeroAih: detalheAtualizado.numeroAih,
                            detalhe: detalheAtualizado,
                            motivo: ''
                        };
                    }

                    if (detalheAtualizado.statusAih === 'TROCA_PENDENTE') {
                        return {
                            numeroAih: null,
                            detalhe: detalheAtualizado,
                            motivo: 'TROCA_PENDENTE'
                        };
                    }
                }

                const detalheFinal = await getAihDetalhe(codSolicitacaoFicha);
                return {
                    numeroAih: detalheFinal.numeroAih || null,
                    detalhe: detalheFinal,
                    motivo: detalheFinal.numeroAih ? '' : 'SEM_AIH'
                };
            }

            debugInfo('AIH da internacao do dia', detalhe.dataInternacao, 'de', detalhe.nome + ':', detalhe.numeroAih);
            return {
                numeroAih: detalhe.numeroAih || null,
                detalhe,
                motivo: ''
            };
        } catch (err) {
            console.error('Erro ao obter numero AIH condicionalmente:', err);
            return {
                numeroAih: null,
                detalhe: null,
                motivo: 'ERRO',
                erro: err
            };
        }
    }

    function getTopDocument() {
        return window.top.document;
    }

    async function fetchFichaHtml(codSolicitacaoFicha) {
        const response = await postForm('/cgi-bin/config_saida_permanencia', {
            etapa: 'VISUALIZAR_FICHA',
            cod_solicitacao_ficha: String(codSolicitacaoFicha)
        }, {
            referrer: `${location.origin}/cgi-bin/config_saida_permanencia`
        });

        return response.text();
    }

    function sanitizeFichaTree(root) {
        root.querySelectorAll('script, link, style, img, iframe, frame, object, embed, meta, base').forEach((node) => {
            node.remove();
        });

        root.querySelectorAll('*').forEach((element) => {
            Array.from(element.attributes).forEach((attribute) => {
                const attrName = attribute.name.toLowerCase();
                const attrValue = attribute.value.trim().toLowerCase();

                if (attrName.startsWith('on') || attrName === 'srcdoc') {
                    element.removeAttribute(attribute.name);
                    return;
                }

                if (
                    (attrName === 'href' ||
                        attrName === 'src' ||
                        attrName === 'action' ||
                        attrName === 'formaction' ||
                        attrName === 'xlink:href') &&
                    (attrValue.startsWith('javascript:') || attrValue.startsWith('data:text/html'))
                ) {
                    element.removeAttribute(attribute.name);
                }
            });
        });

        root.querySelectorAll('br').forEach((node) => {
            if (!node.parentElement || node.parentElement.children.length > 3) {
                node.remove();
            }
        });

        root.querySelectorAll('input, select, textarea, button').forEach((field) => {
            field.disabled = true;
        });

        root.querySelectorAll('form').forEach((form) => {
            form.removeAttribute('action');
            form.removeAttribute('onsubmit');
            form.removeAttribute('target');
        });

        root.querySelectorAll('a').forEach((link) => {
            link.removeAttribute('href');
            link.removeAttribute('target');
        });
    }

    function createFichaStyleElement(ownerDocument) {
        const style = ownerDocument.createElement('style');
        style.textContent = `
            .sisreg-ficha-view {
                color: #20303a;
                font: 13px/1.45 "Segoe UI", Tahoma, sans-serif;
            }
            .sisreg-ficha-view * {
                box-sizing: border-box;
            }
            .sisreg-ficha-view table {
                width: 100%;
                border-collapse: separate;
                border-spacing: 0;
                margin: 0 0 14px;
                background: #ffffff;
                border: 1px solid #d5dfe5;
                border-radius: 10px;
                overflow: hidden;
            }
            .sisreg-ficha-view td,
            .sisreg-ficha-view th {
                padding: 8px 10px;
                border-bottom: 1px solid #e7edf1;
                vertical-align: top;
                word-break: break-word;
            }
            .sisreg-ficha-view tr:last-child > td,
            .sisreg-ficha-view tr:last-child > th {
                border-bottom: 0;
            }
            .sisreg-ficha-view .td_titulo_tabela,
            .sisreg-ficha-view .table_listagem .td_titulo_tabela,
            .sisreg-ficha-view td[bgcolor="#AABFBF"],
            .sisreg-ficha-view th[bgcolor="#AABFBF"] {
                background: linear-gradient(180deg, #e8f0f3 0%, #dde8ec 100%);
                color: #17313d;
                font-weight: 700;
                font-size: 13px;
                letter-spacing: 0.02em;
                text-transform: uppercase;
            }
            .sisreg-ficha-view .td_titulo_campo,
            .sisreg-ficha-view td[align="right"] {
                background: #f5f8fa;
                color: #46606d;
                font-weight: 600;
                width: 26%;
            }
            .sisreg-ficha-view input,
            .sisreg-ficha-view select,
            .sisreg-ficha-view textarea,
            .sisreg-ficha-view button {
                width: 100%;
                max-width: 100%;
                padding: 8px 10px;
                border: 1px solid #c6d3da;
                border-radius: 8px;
                background: #f6f8fa;
                color: #29404c;
                font: inherit;
            }
            .sisreg-ficha-view textarea {
                min-height: 96px;
                resize: vertical;
            }
            .sisreg-ficha-view input:disabled,
            .sisreg-ficha-view select:disabled,
            .sisreg-ficha-view textarea:disabled,
            .sisreg-ficha-view button:disabled {
                opacity: 1;
                cursor: default;
            }
            .sisreg-ficha-view form {
                margin: 0;
            }
            .sisreg-ficha-view center {
                text-align: left;
            }
            .sisreg-ficha-view hr {
                border: 0;
                border-top: 1px solid #dde5ea;
                margin: 12px 0;
            }
            .sisreg-ficha-view .hidden,
            .sisreg-ficha-view [style*="display:none"] {
                display: none !important;
            }
        `;
        return style;
    }

    function extractFichaContent(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const mainPage = doc.querySelector('#main_page');
        const body = doc.body;
        const source = mainPage || body;

        if (!source) {
            const fallback = document.createElement('div');
            fallback.textContent = 'Ficha nao disponivel.';
            return fallback;
        }

        const clone = source.cloneNode(true);
        sanitizeFichaTree(clone);

        const wrapper = document.createElement('div');
        wrapper.appendChild(createFichaStyleElement(document));

        const view = document.createElement('div');
        view.className = 'sisreg-ficha-view';

        Array.from(clone.childNodes).forEach((childNode) => {
            view.appendChild(document.importNode(childNode, true));
        });

        wrapper.appendChild(view);

        return wrapper;
    }

    function showTransferResultsView(modal) {
        modal.querySelector('#sisreg-transfer-results-view').style.display = 'block';
        modal.querySelector('#sisreg-transfer-detail-view').style.display = 'none';
    }

    function showTransferDetailView(modal, title, contentNode) {
        modal.querySelector('#sisreg-transfer-results-view').style.display = 'none';
        modal.querySelector('#sisreg-transfer-detail-view').style.display = 'block';
        modal.querySelector('#sisreg-transfer-detail-title').textContent = title;
        modal.querySelector('#sisreg-transfer-detail-content').replaceChildren(contentNode);
    }

    async function openFichaInModal({ statusNode, title, onRender, codSolicitacaoFicha, errorLabel }) {
        try {
            const html = await fetchFichaHtml(codSolicitacaoFicha);
            const content = extractFichaContent(html);
            onRender(title, content);
            if (statusNode) {
                statusNode.textContent = '';
            }
        } catch (err) {
            console.error(errorLabel, err);
            if (statusNode) {
                statusNode.textContent = err.message;
            }
        }
    }

    async function openFichaFromTransferResult(modal, codSolicitacaoFicha) {
        const status = modal.querySelector('#sisreg-transfer-status');
        const patient = latestTransferResults.find((item) => item.cod_solicitacao_ficha === codSolicitacaoFicha);
        status.textContent = `Carregando ficha de ${patient ? patient.paciente : codSolicitacaoFicha}...`;

        await openFichaInModal({
            statusNode: status,
            codSolicitacaoFicha,
            title: patient ? `Ficha de ${patient.paciente}` : `Ficha ${codSolicitacaoFicha}`,
            onRender: (title, content) => showTransferDetailView(modal, title, content),
            errorLabel: 'Failed to load ficha:'
        });
    }

    function clearElementChildren(node) {
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
    }

    function compareNullableValues(a, b) {
        if (a == null && b == null) return 0;
        if (a == null) return 1;
        if (b == null) return -1;
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
    }

    function sortInternacaoResults(results, sortState) {
        const items = [...results];
        const factor = sortState.direction === 'desc' ? -1 : 1;

        items.sort((left, right) => {
            let primary = 0;

            if (sortState.key === 'dt_internacao') {
                primary = compareNullableValues(parseSisregDate(left.dt_internacao)?.getTime() ?? null, parseSisregDate(right.dt_internacao)?.getTime() ?? null);
            } else if (sortState.key === 'paciente') {
                primary = compareNullableValues(normalizeText(left.paciente), normalizeText(right.paciente));
            } else if (sortState.key === 'procedimento') {
                primary = compareNullableValues(normalizeText(left.procedimento), normalizeText(right.procedimento));
            } else if (sortState.key === 'clinica') {
                primary = compareNullableValues(normalizeText(left.clinica), normalizeText(right.clinica));
            }

            if (primary !== 0) {
                return primary * factor;
            }

            const fallbackDate = compareNullableValues(parseSisregDate(left.dt_internacao)?.getTime() ?? null, parseSisregDate(right.dt_internacao)?.getTime() ?? null);
            if (fallbackDate !== 0) {
                return fallbackDate;
            }

            return compareNullableValues(normalizeText(left.paciente), normalizeText(right.paciente));
        });

        return items;
    }

    function getSortIndicator(sortState, key) {
        if (sortState.key !== key) {
            return '';
        }

        return sortState.direction === 'asc' ? ' ▲' : ' ▼';
    }

    function updateSortableHeaderLabels(modal, selector, sortState) {
        modal.querySelectorAll(selector).forEach((header) => {
            const key = header.getAttribute('data-sisreg-sort-key');
            const label = header.getAttribute('data-sisreg-sort-label') || header.textContent.trim();
            header.textContent = `${label}${getSortIndicator(sortState, key)}`;
        });
    }

    function toggleSortState(currentState, key) {
        if (currentState.key === key) {
            return {
                key,
                direction: currentState.direction === 'asc' ? 'desc' : 'asc'
            };
        }

        return {
            key,
            direction: 'asc'
        };
    }

    function createStyledCell(ownerDocument, textValue, styleText) {
        const cell = ownerDocument.createElement('td');
        cell.style.cssText = styleText;
        cell.textContent = textValue;
        return cell;
    }

    function appendEmptyStateRow(tbody, colspan, message) {
        const ownerDocument = tbody.ownerDocument;
        const row = ownerDocument.createElement('tr');
        const cell = ownerDocument.createElement('td');
        cell.colSpan = colspan;
        cell.style.cssText = 'padding:12px; text-align:center;';
        cell.textContent = message;
        row.appendChild(cell);
        tbody.appendChild(row);
    }

    function appendTransferResultRows(tbody, results, destinationValue) {
        const ownerDocument = tbody.ownerDocument;

        results.forEach((item) => {
            const row = ownerDocument.createElement('tr');
            row.setAttribute('data-sisreg-transfer-row', item.cod_solicitacao_ficha);

            row.appendChild(createStyledCell(ownerDocument, item.dt_internacao, 'padding:6px; border:1px solid #c9d2d8;'));
            row.appendChild(createStyledCell(ownerDocument, item.paciente, 'padding:6px; border:1px solid #c9d2d8;'));
            row.appendChild(createStyledCell(ownerDocument, item.procedimento, 'padding:6px; border:1px solid #c9d2d8;'));
            row.appendChild(createStyledCell(ownerDocument, item.clinica, 'padding:6px; border:1px solid #c9d2d8;'));
            row.appendChild(createStyledCell(ownerDocument, item.cod_solicitacao_ficha, 'padding:6px; border:1px solid #c9d2d8;'));

            const actionsCell = ownerDocument.createElement('td');
            actionsCell.style.cssText = 'padding:6px; border:1px solid #c9d2d8; white-space:nowrap;';

            const openButton = ownerDocument.createElement('button');
            openButton.type = 'button';
            openButton.setAttribute('data-sisreg-open-ficha', item.cod_solicitacao_ficha);
            openButton.textContent = 'Abrir ficha';

            const transferButton = ownerDocument.createElement('button');
            transferButton.type = 'button';
            transferButton.setAttribute('data-sisreg-transfer-one', item.cod_solicitacao_ficha);
            transferButton.textContent = 'Transferir';
            transferButton.disabled = !destinationValue;

            actionsCell.appendChild(openButton);
            actionsCell.appendChild(ownerDocument.createTextNode(' '));
            actionsCell.appendChild(transferButton);
            row.appendChild(actionsCell);

            tbody.appendChild(row);
        });
    }

    function appendReleaseResultRows(tbody, results) {
        const ownerDocument = tbody.ownerDocument;

        results.forEach((item) => {
            const row = ownerDocument.createElement('tr');
            row.setAttribute('data-sisreg-release-row', item.cod_solicitacao_ficha);

            row.appendChild(createStyledCell(ownerDocument, item.dt_internacao, 'padding:6px; border:1px solid #c9d2d8;'));
            row.appendChild(createStyledCell(ownerDocument, item.paciente, 'padding:6px; border:1px solid #c9d2d8;'));
            row.appendChild(createStyledCell(ownerDocument, item.procedimento, 'padding:6px; border:1px solid #c9d2d8;'));
            row.appendChild(createStyledCell(ownerDocument, item.clinica, 'padding:6px; border:1px solid #c9d2d8;'));
            row.appendChild(createStyledCell(ownerDocument, item.cod_solicitacao_ficha, 'padding:6px; border:1px solid #c9d2d8;'));

            const aihCell = createStyledCell(ownerDocument, '-', 'padding:6px; border:1px solid #c9d2d8;');
            aihCell.setAttribute('data-sisreg-release-aih', item.cod_solicitacao_ficha);
            row.appendChild(aihCell);

            const actionsCell = ownerDocument.createElement('td');
            actionsCell.style.cssText = 'padding:6px; border:1px solid #c9d2d8; white-space:nowrap;';

            const openButton = ownerDocument.createElement('button');
            openButton.type = 'button';
            openButton.setAttribute('data-sisreg-release-open', item.cod_solicitacao_ficha);
            openButton.textContent = 'Abrir ficha';

            const releaseButton = ownerDocument.createElement('button');
            releaseButton.type = 'button';
            releaseButton.setAttribute('data-sisreg-release-one', item.cod_solicitacao_ficha);
            releaseButton.textContent = 'Efetuar alta';

            actionsCell.appendChild(openButton);
            actionsCell.appendChild(ownerDocument.createTextNode(' '));
            actionsCell.appendChild(releaseButton);
            row.appendChild(actionsCell);

            tbody.appendChild(row);
        });
    }

    function renderTransferResults(modal, results) {
        const destinationSelect = modal.querySelector('#sisreg-transfer-destination');
        const tbody = modal.querySelector('#sisreg-transfer-results-body');
        const summary = modal.querySelector('#sisreg-transfer-summary');
        const sortedResults = sortInternacaoResults(results, latestTransferSortState);

        clearElementChildren(tbody);
        if (sortedResults.length === 0) {
            appendEmptyStateRow(tbody, 6, 'Nenhum paciente encontrado.');
        } else {
            appendTransferResultRows(tbody, sortedResults, destinationSelect.value);
        }
        summary.textContent = `${results.length} paciente(s) encontrado(s).`;
        updateSortableHeaderLabels(modal, '[data-sisreg-transfer-sort-key]', latestTransferSortState);
    }

    function setTransferFeedback(modal, message = '', isError = false) {
        const feedback = modal.querySelector('#sisreg-transfer-feedback');
        if (!feedback) return;

        feedback.textContent = message;
        feedback.style.color = isError ? '#9f2d20' : '#2c5f2d';
    }

    function renderReleaseResults(modal, results) {
        const tbody = modal.querySelector('#sisreg-release-results-body');
        const summary = modal.querySelector('#sisreg-release-summary');
        const pager = modal.querySelector('#sisreg-release-pager');
        const prevButton = modal.querySelector('#sisreg-release-prev');
        const nextButton = modal.querySelector('#sisreg-release-next');
        const sortedResults = sortInternacaoResults(results, latestReleaseSortState);

        clearElementChildren(tbody);
        if (sortedResults.length === 0) {
            appendEmptyStateRow(tbody, 7, 'Nenhum paciente encontrado.');
        } else {
            appendReleaseResultRows(tbody, sortedResults);
        }
        summary.textContent = `${results.length} paciente(s) nesta pagina.`;
        pager.textContent = `Pagina ${latestReleaseSearchState.currentPage + 1} de ${latestReleaseSearchState.totalPages}`;
        prevButton.disabled = latestReleaseSearchState.currentPage <= 0;
        nextButton.disabled = latestReleaseSearchState.currentPage >= latestReleaseSearchState.totalPages - 1;
        updateSortableHeaderLabels(modal, '[data-sisreg-release-sort-key]', latestReleaseSortState);
    }

    function setReleaseAihCell(modal, codSolicitacaoFicha, value) {
        const cell = modal.querySelector(`[data-sisreg-release-aih="${codSolicitacaoFicha}"]`);
        if (!cell) return;

        if (!value || value === '-' || value === 'SEM AIH' || value === 'ERRO' || value === 'Processando...') {
            cell.textContent = value || '-';
            return;
        }

        const ownerDocument = cell.ownerDocument;
        const wrapper = ownerDocument.createElement('div');
        wrapper.style.cssText = 'display:flex; align-items:center; gap:6px; flex-wrap:wrap;';

        const valueNode = ownerDocument.createElement('span');
        valueNode.textContent = value;

        const button = ownerDocument.createElement('button');
        button.type = 'button';
        button.setAttribute('data-sisreg-copy-aih', codSolicitacaoFicha);
        button.setAttribute('data-sisreg-copy-aih-value', value);
        button.style.cssText = 'padding:2px 6px;';
        button.textContent = 'Copiar';

        clearElementChildren(cell);
        cell.appendChild(wrapper);
        wrapper.appendChild(valueNode);
        wrapper.appendChild(button);
    }

    async function copyTextToClipboard(value) {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(value);
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
    }

    async function runTransferSearch(modal) {
        const originSelect = modal.querySelector('#sisreg-transfer-origin');
        const destinationSelect = modal.querySelector('#sisreg-transfer-destination');
        const procedureInput = modal.querySelector('#sisreg-transfer-procedure');
        const status = modal.querySelector('#sisreg-transfer-status');
        const searchButton = modal.querySelector('#sisreg-transfer-search');
        const bulkButton = modal.querySelector('#sisreg-transfer-bulk');

        if (!originSelect.value) {
            status.textContent = 'Selecione a clinica de origem.';
            return;
        }

        searchButton.disabled = true;
        bulkButton.disabled = true;
        status.textContent = 'Buscando pacientes internados...';

        try {
            const result = await buscarInternacoes({
                clinica: originSelect.value
            });
            latestTransferResults = result.items.filter((item) => {
                return normalizeText(item.procedimento).includes(normalizeText(procedureInput.value));
            });
            renderTransferResults(modal, latestTransferResults);
            status.textContent = 'Busca concluida.';
            bulkButton.disabled = latestTransferResults.length === 0 || !destinationSelect.value;
        } catch (err) {
            console.error('Transfer search failed:', err);
            status.textContent = err.message;
        } finally {
            searchButton.disabled = false;
        }
    }

    async function transferSinglePatient(modal, codSolicitacaoFicha) {
        const destinationSelect = modal.querySelector('#sisreg-transfer-destination');
        const status = modal.querySelector('#sisreg-transfer-status');
        const destinationLabel = destinationSelect.options[destinationSelect.selectedIndex]?.text || destinationSelect.value;

        if (!destinationSelect.value) {
            status.textContent = 'Selecione a clinica de destino.';
            return;
        }

        const patient = latestTransferResults.find((item) => item.cod_solicitacao_ficha === codSolicitacaoFicha);
        const confirmed = window.confirm(
            `Transferir ${patient ? patient.paciente : codSolicitacaoFicha} para ${destinationLabel}?`
        );

        if (!confirmed) {
            return;
        }

        status.textContent = `Transferindo ${patient ? patient.paciente : codSolicitacaoFicha}...`;

        try {
            await salvarTransferencia(codSolicitacaoFicha, destinationSelect.value);
            status.textContent = 'Transferencia concluida. Atualizando lista...';
            await runTransferSearch(modal);
            setTransferFeedback(
                modal,
                `Transferencia concluida: ${patient ? patient.paciente : codSolicitacaoFicha} para ${destinationLabel}.`
            );
        } catch (err) {
            console.error('Single transfer failed:', err);
            status.textContent = err.message;
            setTransferFeedback(modal, 'Falha ao concluir a transferencia.', true);
        }
    }

    async function transferAllPatients(modal) {
        const destinationSelect = modal.querySelector('#sisreg-transfer-destination');
        const status = modal.querySelector('#sisreg-transfer-status');
        const destinationLabel = destinationSelect.options[destinationSelect.selectedIndex]?.text || destinationSelect.value;

        if (!destinationSelect.value) {
            status.textContent = 'Selecione a clinica de destino.';
            return;
        }

        if (latestTransferResults.length === 0) {
            status.textContent = 'Nao ha pacientes para transferir.';
            return;
        }

        const confirmed = window.confirm(
            `Transferir ${latestTransferResults.length} paciente(s) para ${destinationLabel}?`
        );

        if (!confirmed) {
            return;
        }

        let transferred = 0;

        for (const item of latestTransferResults) {
            status.textContent = `Transferindo ${transferred + 1}/${latestTransferResults.length}: ${item.paciente}`;
            await salvarTransferencia(item.cod_solicitacao_ficha, destinationSelect.value);
            transferred += 1;
        }

        status.textContent = `Transferencia concluida: ${transferred}/${latestTransferResults.length}. Atualizando lista...`;
        await runTransferSearch(modal);
        setTransferFeedback(
            modal,
            `Transferencia concluida: ${transferred} paciente(s) para ${destinationLabel}.`
        );
    }

    function showReleaseResultsView(modal) {
        modal.querySelector('#sisreg-release-results-view').style.display = 'block';
        modal.querySelector('#sisreg-release-detail-view').style.display = 'none';
    }

    function showReleaseDetailView(modal, title, contentNode) {
        modal.querySelector('#sisreg-release-results-view').style.display = 'none';
        modal.querySelector('#sisreg-release-detail-view').style.display = 'block';
        modal.querySelector('#sisreg-release-detail-title').textContent = title;
        modal.querySelector('#sisreg-release-detail-content').replaceChildren(contentNode);
    }

    async function openFichaFromReleaseResult(modal, codSolicitacaoFicha) {
        const status = modal.querySelector('#sisreg-release-status');
        const patient = latestReleaseResults.find((item) => item.cod_solicitacao_ficha === codSolicitacaoFicha);
        status.textContent = `Carregando ficha de ${patient ? patient.paciente : codSolicitacaoFicha}...`;

        await openFichaInModal({
            statusNode: status,
            codSolicitacaoFicha,
            title: patient ? `Ficha de ${patient.paciente}` : `Ficha ${codSolicitacaoFicha}`,
            onRender: (title, content) => showReleaseDetailView(modal, title, content),
            errorLabel: 'Failed to load release ficha:'
        });
    }

    async function runReleaseSearch(modal) {
        const clinicSelect = modal.querySelector('#sisreg-release-clinic');
        const cnsInput = modal.querySelector('#sisreg-release-cns');
        const searchButton = modal.querySelector('#sisreg-release-search');
        const status = modal.querySelector('#sisreg-release-status');

        searchButton.disabled = true;
        status.textContent = 'Buscando internados...';

        try {
            latestReleaseSearchState = {
                clinica: clinicSelect.value,
                cnsPaciente: cnsInput.value.trim(),
                currentPage: 0,
                totalPages: 1
            };

            const result = await buscarInternacoes({
                clinica: latestReleaseSearchState.clinica,
                cnsPaciente: latestReleaseSearchState.cnsPaciente,
                pageIndex: 0
            });
            latestReleaseResults = result.items;
            Object.assign(latestReleaseSearchState, result.pagination);
            renderReleaseResults(modal, latestReleaseResults);
            status.textContent = 'Busca concluida.';
        } catch (err) {
            console.error('Release search failed:', err);
            status.textContent = err.message;
        } finally {
            searchButton.disabled = false;
        }
    }

    async function loadReleasePage(modal, pageIndex) {
        const status = modal.querySelector('#sisreg-release-status');
        status.textContent = `Carregando pagina ${pageIndex + 1}...`;

        try {
            const result = await buscarInternacoes({
                clinica: latestReleaseSearchState.clinica,
                cnsPaciente: latestReleaseSearchState.cnsPaciente,
                pageIndex
            });
            latestReleaseResults = result.items;
            Object.assign(latestReleaseSearchState, result.pagination);
            renderReleaseResults(modal, latestReleaseResults);
            status.textContent = 'Busca concluida.';
        } catch (err) {
            console.error('Release pagination failed:', err);
            status.textContent = err.message;
        }
    }

    function getSelectedReleaseReason(modal) {
        const select = modal.querySelector('#sisreg-release-reason');
        return {
            value: select.value,
            label: select.options[select.selectedIndex]?.text || select.value
        };
    }

    async function processRelease(modal, codSolicitacaoFicha) {
        const status = modal.querySelector('#sisreg-release-status');
        const patient = latestReleaseResults.find((item) => item.cod_solicitacao_ficha === codSolicitacaoFicha);
        const aihCell = modal.querySelector(`[data-sisreg-release-aih="${codSolicitacaoFicha}"]`);
        const reason = getSelectedReleaseReason(modal);

        if (!reason.value) {
            status.textContent = 'Selecione o motivo da alta.';
            return;
        }

        const confirmed = window.confirm(
            `Efetuar alta de ${patient ? patient.paciente : codSolicitacaoFicha} com motivo "${reason.label}"?`
        );

        if (!confirmed) {
            return;
        }

        try {
            status.textContent = `Processando alta de ${patient ? patient.paciente : codSolicitacaoFicha}...`;
            setReleaseAihCell(modal, codSolicitacaoFicha, 'Processando...');
            const resultado = await pegaNumeroAihAltaCondicional(codSolicitacaoFicha, reason.value);
            const numeroAih = resultado && resultado.numeroAih;

            if (numeroAih) {
                setReleaseAihCell(modal, codSolicitacaoFicha, numeroAih);
                const row = modal.querySelector(`[data-sisreg-release-row="${codSolicitacaoFicha}"]`);
                if (row) {
                    row.style.opacity = '0.65';
                    row.style.background = '#eef7e8';
                }
                status.textContent = `AIH obtida: ${numeroAih}`;
                return;
            }

            setReleaseAihCell(modal, codSolicitacaoFicha, 'SEM AIH');
            status.textContent = 'Alta processada, mas nao foi possivel obter o numero da AIH.';
        } catch (err) {
            console.error('Release processing failed:', err);
            setReleaseAihCell(modal, codSolicitacaoFicha, 'ERRO');
            status.textContent = err.message;
        }
    }

    function createTransferModal(topDocument) {
        const existing = topDocument.getElementById(TRANSFER_MODAL_ID);
        if (existing) {
            return existing;
        }

        const modal = topDocument.createElement('div');
        modal.id = TRANSFER_MODAL_ID;
        modal.style.cssText = [
            'position: fixed',
            'inset: 0',
            'display: none',
            'align-items: center',
            'justify-content: center',
            'background: rgba(12, 19, 26, 0.42)',
            'z-index: 999999'
        ].join(';');

        modal.innerHTML = `
            <div style="width:min(1100px, calc(100vw - 32px)); max-height:calc(100vh - 32px); overflow:auto; background:#f7f8fa; border:1px solid #7d8b96; box-shadow:0 14px 40px rgba(0,0,0,0.28); padding:16px; font:13px Arial, sans-serif;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <div style="font-size:18px; font-weight:bold;">Transferencia de Clinica</div>
                    <button type="button" id="sisreg-transfer-close">Fechar</button>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr auto; gap:12px; align-items:end; margin-bottom:12px;">
                    <label style="display:block;">
                        <span style="display:block; margin-bottom:4px;">Clinica de origem</span>
                        <select id="sisreg-transfer-origin" style="width:100%; box-sizing:border-box;"></select>
                    </label>
                    <label style="display:block;">
                        <span style="display:block; margin-bottom:4px;">Clinica de destino</span>
                        <select id="sisreg-transfer-destination" style="width:100%; box-sizing:border-box;"></select>
                    </label>
                    <label style="display:block;">
                        <span style="display:block; margin-bottom:4px;">Procedimento contem</span>
                        <input id="sisreg-transfer-procedure" type="text" style="width:100%; box-sizing:border-box;">
                    </label>
                    <div style="display:flex; gap:8px;">
                        <button type="button" id="sisreg-transfer-search">Buscar</button>
                        <button type="button" id="sisreg-transfer-bulk" disabled>Transferir todos</button>
                    </div>
                </div>
                <div id="sisreg-transfer-status" style="min-height:18px; margin-bottom:6px; color:#1f2b34;"></div>
                <div id="sisreg-transfer-feedback" style="min-height:18px; margin-bottom:6px; color:#2c5f2d;"></div>
                <div id="sisreg-transfer-results-view">
                    <div id="sisreg-transfer-summary" style="min-height:18px; margin-bottom:10px; color:#42515c;"></div>
                    <table style="width:100%; border-collapse:collapse; background:#fff;">
                        <thead>
                            <tr style="background:#d8dedc;">
                                <th data-sisreg-transfer-sort-key="dt_internacao" data-sisreg-sort-key="dt_internacao" data-sisreg-sort-label="Dt. Internacao" style="padding:6px; border:1px solid #c9d2d8; text-align:left; cursor:pointer; user-select:none;">Dt. Internacao</th>
                                <th data-sisreg-transfer-sort-key="paciente" data-sisreg-sort-key="paciente" data-sisreg-sort-label="Paciente" style="padding:6px; border:1px solid #c9d2d8; text-align:left; cursor:pointer; user-select:none;">Paciente</th>
                                <th data-sisreg-release-sort-key="procedimento" data-sisreg-sort-key="procedimento" data-sisreg-sort-label="Procedimento" style="padding:6px; border:1px solid #c9d2d8; text-align:left; cursor:pointer; user-select:none;">Procedimento</th>
                                <th data-sisreg-release-sort-key="clinica" data-sisreg-sort-key="clinica" data-sisreg-sort-label="Clinica" style="padding:6px; border:1px solid #c9d2d8; text-align:left; cursor:pointer; user-select:none;">Clinica</th>
                                <th style="padding:6px; border:1px solid #c9d2d8; text-align:left;">Solicitacao</th>
                                <th style="padding:6px; border:1px solid #c9d2d8; text-align:left;">Acoes</th>
                            </tr>
                        </thead>
                        <tbody id="sisreg-transfer-results-body">
                            <tr>
                                <td colspan="6" style="padding:12px; text-align:center;">Nenhuma busca realizada.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div id="sisreg-transfer-detail-view" style="display:none;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div id="sisreg-transfer-detail-title" style="font-size:16px; font-weight:bold;">Ficha</div>
                        <button type="button" id="sisreg-transfer-detail-back">Voltar para transferencias</button>
                    </div>
                    <div id="sisreg-transfer-detail-content" style="background:#fff; border:1px solid #c9d2d8; padding:12px; overflow:auto;"></div>
                </div>
            </div>
        `;

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });

        topDocument.body.appendChild(modal);

        modal.querySelector('#sisreg-transfer-close').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        modal.querySelector('#sisreg-transfer-detail-back').addEventListener('click', () => {
            showTransferResultsView(modal);
        });

        modal.querySelector('#sisreg-transfer-search').addEventListener('click', () => {
            runTransferSearch(modal);
        });

        modal.querySelector('#sisreg-transfer-bulk').addEventListener('click', async () => {
            const bulkButton = modal.querySelector('#sisreg-transfer-bulk');
            bulkButton.disabled = true;

            try {
                await transferAllPatients(modal);
            } catch (err) {
                console.error('Bulk transfer failed:', err);
                modal.querySelector('#sisreg-transfer-status').textContent = err.message;
            } finally {
                bulkButton.disabled = latestTransferResults.length === 0;
            }
        });

        modal.querySelector('#sisreg-transfer-destination').addEventListener('change', () => {
            const bulkButton = modal.querySelector('#sisreg-transfer-bulk');
            bulkButton.disabled = latestTransferResults.length === 0 || !modal.querySelector('#sisreg-transfer-destination').value;
            renderTransferResults(modal, latestTransferResults);
        });

        modal.querySelector('#sisreg-transfer-results-body').addEventListener('click', async (event) => {
            const openButton = event.target.closest('[data-sisreg-open-ficha]');
            if (openButton) {
                await openFichaFromTransferResult(modal, openButton.getAttribute('data-sisreg-open-ficha'));
                return;
            }

            const transferButton = event.target.closest('[data-sisreg-transfer-one]');
            if (transferButton) {
                await transferSinglePatient(modal, transferButton.getAttribute('data-sisreg-transfer-one'));
            }
        });

        modal.querySelector('thead').addEventListener('click', (event) => {
            const header = event.target.closest('[data-sisreg-transfer-sort-key]');
            if (!header) {
                return;
            }

            latestTransferSortState = toggleSortState(
                latestTransferSortState,
                header.getAttribute('data-sisreg-transfer-sort-key')
            );
            renderTransferResults(modal, latestTransferResults);
        });

        return modal;
    }

    function createReleaseModal(topDocument) {
        const existing = topDocument.getElementById(RELEASE_MODAL_ID);
        if (existing) {
            return existing;
        }

        const modal = topDocument.createElement('div');
        modal.id = RELEASE_MODAL_ID;
        modal.style.cssText = [
            'position: fixed',
            'inset: 0',
            'display: none',
            'align-items: center',
            'justify-content: center',
            'background: rgba(12, 19, 26, 0.42)',
            'z-index: 999999'
        ].join(';');

        modal.innerHTML = `
            <div style="width:min(1120px, calc(100vw - 32px)); max-height:calc(100vh - 32px); overflow:auto; background:#f7f8fa; border:1px solid #7d8b96; box-shadow:0 14px 40px rgba(0,0,0,0.28); padding:16px; font:13px Arial, sans-serif;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <div style="font-size:18px; font-weight:bold;">Altas ++</div>
                    <button type="button" id="sisreg-release-close">Fechar</button>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr auto; gap:12px; align-items:end; margin-bottom:12px;">
                    <label style="display:block;">
                        <span style="display:block; margin-bottom:4px;">Clinica</span>
                        <select id="sisreg-release-clinic" style="width:100%; box-sizing:border-box;"></select>
                    </label>
                    <label style="display:block;">
                        <span style="display:block; margin-bottom:4px;">CNS</span>
                        <input id="sisreg-release-cns" type="text" inputmode="numeric" style="width:100%; box-sizing:border-box;">
                    </label>
                    <label style="display:block;">
                        <span style="display:block; margin-bottom:4px;">Motivo da alta</span>
                        <select id="sisreg-release-reason" style="width:100%; box-sizing:border-box;">
                            <option value="38">1.2 ALTA MELHORADO</option>
                            <option value="37">1.1 ALTA CURADO</option>
                            <option value="40">1.4 ALTA A PEDIDO</option>
                            <option value="41">1.5 ALTA COM PREVISAO DE RETORNO PARA ACOMPANHAMENTO DO PACIENTE</option>
                            <option value="42">1.6 ALTA POR EVASAO</option>
                            <option value="44">1.8 ALTA POR OUTROS MOTIVOS</option>
                            <option value="75">1.9 ALTA DE PACIENTE AGUDO EM PSIQUIATRIA</option>
                            <option value="53">3.1 TRANSFERIDO PARA OUTRO ESTABELECIMENTO</option>
                            <option value="59">3.2 TRANSFERENCIA PARA INTERNACAO DOMICILIAR</option>
                            <option value="54">4.1 OBITO COM DECLARACAO DE OBITO FORNECIDA PELO MEDICO ASSISTENTE</option>
                            <option value="55">4.2 OBITO COM DECLARACAO DE OBITO FORNECIDA PELO INSTITUTO MEDICO LEGAL - IML</option>
                            <option value="56">4.3 OBITO COM DECLARACAO DE OBITO FORNECIDA PELO SERVICO DE VERIFICACAO DE OBITO - SVO.</option>
                            <option value="57">5.1 ENCERRAMENTO ADMINISTRATIVO</option>
                        </select>
                    </label>
                    <div style="display:flex; gap:8px;">
                        <button type="button" id="sisreg-release-search">Buscar</button>
                    </div>
                </div>
                <div id="sisreg-release-status" style="min-height:18px; margin-bottom:6px; color:#1f2b34;"></div>
                <div id="sisreg-release-results-view">
                    <div id="sisreg-release-summary" style="min-height:18px; margin-bottom:10px; color:#42515c;"></div>
                    <div style="display:flex; justify-content:flex-end; align-items:center; gap:8px; margin-bottom:10px;">
                        <button type="button" id="sisreg-release-prev" disabled>Anterior</button>
                        <div id="sisreg-release-pager" style="min-width:120px; text-align:center;">Pagina 1 de 1</div>
                        <button type="button" id="sisreg-release-next" disabled>Proxima</button>
                    </div>
                    <table style="width:100%; border-collapse:collapse; background:#fff;">
                        <thead>
                            <tr style="background:#d8dedc;">
                                <th data-sisreg-release-sort-key="dt_internacao" data-sisreg-sort-key="dt_internacao" data-sisreg-sort-label="Dt. Internacao" style="padding:6px; border:1px solid #c9d2d8; text-align:left; cursor:pointer; user-select:none;">Dt. Internacao</th>
                                <th data-sisreg-release-sort-key="paciente" data-sisreg-sort-key="paciente" data-sisreg-sort-label="Paciente" style="padding:6px; border:1px solid #c9d2d8; text-align:left; cursor:pointer; user-select:none;">Paciente</th>
                                <th data-sisreg-release-sort-key="procedimento" data-sisreg-sort-key="procedimento" data-sisreg-sort-label="Procedimento" style="padding:6px; border:1px solid #c9d2d8; text-align:left; cursor:pointer; user-select:none;">Procedimento</th>
                                <th data-sisreg-release-sort-key="clinica" data-sisreg-sort-key="clinica" data-sisreg-sort-label="Clinica" style="padding:6px; border:1px solid #c9d2d8; text-align:left; cursor:pointer; user-select:none;">Clinica</th>
                                <th style="padding:6px; border:1px solid #c9d2d8; text-align:left;">Solicitacao</th>
                                <th style="padding:6px; border:1px solid #c9d2d8; text-align:left;">AIH</th>
                                <th style="padding:6px; border:1px solid #c9d2d8; text-align:left;">Acoes</th>
                            </tr>
                        </thead>
                        <tbody id="sisreg-release-results-body">
                            <tr>
                                <td colspan="7" style="padding:12px; text-align:center;">Nenhuma busca realizada.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div id="sisreg-release-detail-view" style="display:none;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div id="sisreg-release-detail-title" style="font-size:16px; font-weight:bold;">Ficha</div>
                        <button type="button" id="sisreg-release-detail-back">Voltar para altas</button>
                    </div>
                    <div id="sisreg-release-detail-content" style="background:#fff; border:1px solid #c9d2d8; padding:12px; overflow:auto;"></div>
                </div>
            </div>
        `;

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });

        topDocument.body.appendChild(modal);

        modal.querySelector('#sisreg-release-close').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        modal.querySelector('#sisreg-release-detail-back').addEventListener('click', () => {
            showReleaseResultsView(modal);
        });

        modal.querySelector('#sisreg-release-search').addEventListener('click', () => {
            runReleaseSearch(modal);
        });

        modal.querySelector('#sisreg-release-prev').addEventListener('click', async () => {
            if (latestReleaseSearchState.currentPage <= 0) {
                return;
            }
            await loadReleasePage(modal, latestReleaseSearchState.currentPage - 1);
        });

        modal.querySelector('#sisreg-release-next').addEventListener('click', async () => {
            if (latestReleaseSearchState.currentPage >= latestReleaseSearchState.totalPages - 1) {
                return;
            }
            await loadReleasePage(modal, latestReleaseSearchState.currentPage + 1);
        });

        modal.querySelector('#sisreg-release-results-body').addEventListener('click', async (event) => {
            const copyButton = event.target.closest('[data-sisreg-copy-aih]');
            if (copyButton) {
                try {
                    await copyTextToClipboard(copyButton.getAttribute('data-sisreg-copy-aih-value') || '');
                    modal.querySelector('#sisreg-release-status').textContent = `AIH copiada: ${copyButton.getAttribute('data-sisreg-copy-aih-value') || ''}`;
                } catch (err) {
                    console.error('Failed to copy AIH:', err);
                    modal.querySelector('#sisreg-release-status').textContent = 'Falha ao copiar a AIH.';
                }
                return;
            }

            const openButton = event.target.closest('[data-sisreg-release-open]');
            if (openButton) {
                await openFichaFromReleaseResult(modal, openButton.getAttribute('data-sisreg-release-open'));
                return;
            }

            const releaseButton = event.target.closest('[data-sisreg-release-one]');
            if (releaseButton) {
                await processRelease(modal, releaseButton.getAttribute('data-sisreg-release-one'));
            }
        });

        modal.querySelector('thead').addEventListener('click', (event) => {
            const header = event.target.closest('[data-sisreg-release-sort-key]');
            if (!header) {
                return;
            }

            latestReleaseSortState = toggleSortState(
                latestReleaseSortState,
                header.getAttribute('data-sisreg-release-sort-key')
            );
            renderReleaseResults(modal, latestReleaseResults);
        });

        return modal;
    }

    function populateClinicSelect(select, options) {
        const ownerDocument = select.ownerDocument;
        select.innerHTML = '';

        const placeholder = ownerDocument.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Selecione a clinica';
        select.appendChild(placeholder);

        options.forEach((optionData) => {
            const option = ownerDocument.createElement('option');
            option.value = optionData.value;
            option.textContent = optionData.label;
            select.appendChild(option);
        });
    }

    async function openTransferModal() {
        const topDocument = getTopDocument();
        const modal = createTransferModal(topDocument);
        const originSelect = modal.querySelector('#sisreg-transfer-origin');
        const destinationSelect = modal.querySelector('#sisreg-transfer-destination');
        const status = modal.querySelector('#sisreg-transfer-status');

        modal.style.display = 'flex';
        showTransferResultsView(modal);
        status.textContent = 'Carregando clinicas...';

        try {
            const options = await fetchTransferClinics();
            populateClinicSelect(originSelect, options);
            populateClinicSelect(destinationSelect, options);
            status.textContent = '';
        } catch (err) {
            console.error('Failed to load clinic options:', err);
            status.textContent = err.message;
        }
    }

    async function openReleaseModal() {
        const topDocument = getTopDocument();
        const modal = createReleaseModal(topDocument);
        const clinicSelect = modal.querySelector('#sisreg-release-clinic');
        const status = modal.querySelector('#sisreg-release-status');

        modal.style.display = 'flex';
        showReleaseResultsView(modal);
        status.textContent = 'Carregando clinicas...';

        try {
            const options = await fetchTransferClinics();
            populateClinicSelect(clinicSelect, options);
            status.textContent = '';
        } catch (err) {
            console.error('Failed to load release clinics:', err);
            status.textContent = err.message;
        }
    }

    function ensureTransferMenuEntry() {
        if (window !== window.top) {
            return false;
        }

        const topDocument = getTopDocument();
        if (!topDocument.body) {
            return false;
        }

        if (topDocument.getElementById(TRANSFER_MENU_LINK_ID)) {
            return true;
        }

        const nativeTransferLink = Array.from(topDocument.querySelectorAll('a')).find((link) => {
            return normalizeText(link.textContent) === 'clinica/especialidade';
        });

        if (!nativeTransferLink) {
            return false;
        }

        const nativeItem = nativeTransferLink.closest('li');
        if (!nativeItem) {
            return false;
        }

        const customItem = topDocument.createElement('li');
        customItem.style.whiteSpace = 'normal';
        customItem.style.float = 'left';
        customItem.style.width = '100%';

        const customLink = topDocument.createElement('a');
        customLink.id = TRANSFER_MENU_LINK_ID;
        customLink.href = '#';
        customLink.textContent = 'TRANSFERENCIAS ++';
        customLink.style.cssText = nativeTransferLink.getAttribute('style') || '';
        customLink.addEventListener('click', (event) => {
            event.preventDefault();
            openTransferModal();
        });

        customItem.appendChild(customLink);
        nativeItem.insertAdjacentElement('afterend', customItem);
        return true;
    }

    function ensureReleaseMenuEntry() {
        if (window !== window.top) {
            return false;
        }

        const topDocument = getTopDocument();
        if (!topDocument.body) {
            return false;
        }

        if (topDocument.getElementById(RELEASE_MENU_LINK_ID)) {
            return true;
        }

        const nativeReleaseLink = Array.from(topDocument.querySelectorAll('a')).find((link) => {
            return normalizeText(link.textContent) === 'saida/permanencia';
        });

        if (!nativeReleaseLink) {
            return false;
        }

        const nativeItem = nativeReleaseLink.closest('li');
        if (!nativeItem) {
            return false;
        }

        const parentLink = nativeReleaseLink.cloneNode(true);
        parentLink.href = '#';
        parentLink.removeAttribute('target');
        parentLink.removeAttribute('onclick');
        parentLink.removeAttribute('title');
        parentLink.className = 'sf-with-ul';
        parentLink.innerHTML = 'saída/permanência&nbsp;&nbsp;<span class="sf-sub-indicator"> »</span>';

        const nativeSubLink = nativeReleaseLink.cloneNode(true);
        nativeSubLink.id = '';
        nativeSubLink.style.cssText = 'float: none; width: auto;';

        const customSubItem = topDocument.createElement('li');
        customSubItem.style.cssText = 'white-space: normal; float: left; width: 100%;';

        const customLink = topDocument.createElement('a');
        customLink.id = RELEASE_MENU_LINK_ID;
        customLink.href = '#';
        customLink.style.cssText = 'float: none; width: auto;';
        customLink.textContent = 'ALTAS ++';
        customLink.addEventListener('click', (event) => {
            event.preventDefault();
            openReleaseModal();
        });
        customSubItem.appendChild(customLink);

        const nativeSubItem = topDocument.createElement('li');
        nativeSubItem.style.cssText = 'white-space: normal; float: left; width: 100%;';
        nativeSubItem.appendChild(nativeSubLink);

        const submenu = topDocument.createElement('ul');
        submenu.className = 'sf-menu sf-js-enabled sf-shadow';
        submenu.style.cssText = 'float: none; width: 21.1818em; display: none; visibility: hidden;';
        submenu.appendChild(nativeSubItem);
        submenu.appendChild(customSubItem);

        nativeItem.className = 'current';
        nativeItem.innerHTML = '';
        nativeItem.appendChild(parentLink);
        nativeItem.appendChild(submenu);

        const setSubmenuVisible = (visible) => {
            submenu.style.display = visible ? 'block' : 'none';
            submenu.style.visibility = visible ? 'visible' : 'hidden';
        };

        let closeTimer = null;
        const scheduleClose = () => {
            if (closeTimer) {
                window.clearTimeout(closeTimer);
            }
            closeTimer = window.setTimeout(() => {
                setSubmenuVisible(false);
            }, 120);
        };
        const cancelClose = () => {
            if (closeTimer) {
                window.clearTimeout(closeTimer);
                closeTimer = null;
            }
        };

        parentLink.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const willOpen = submenu.style.display !== 'block' || submenu.style.visibility !== 'visible';
            setSubmenuVisible(willOpen);
        });

        nativeItem.addEventListener('mouseenter', () => {
            cancelClose();
            setSubmenuVisible(true);
        });

        nativeItem.addEventListener('mouseleave', () => {
            scheduleClose();
        });

        submenu.addEventListener('mouseenter', () => {
            cancelClose();
            setSubmenuVisible(true);
        });

        submenu.addEventListener('mouseleave', () => {
            scheduleClose();
        });

        topDocument.addEventListener('click', (event) => {
            if (!nativeItem.contains(event.target)) {
                setSubmenuVisible(false);
            }
        });

        if (window.top.jQuery) {
            window.top.jQuery(topDocument).find('ul.sf-menu').supersubs({
                minWidth: 12,
                maxWidth: 27,
                extraWidth: 1
            }).superfish();
        }

        return true;
    }

    function startUiObserver() {
        const runEnhancements = () => {
            if (!hasExecutanteProfile()) {
                return false;
            }

            enhanceInternarView();
            ensureTransferMenuEntry();
            ensureReleaseMenuEntry();
            return true;
        };

        let intervalId = null;
        const stopInterval = () => {
            if (intervalId) {
                window.clearInterval(intervalId);
                intervalId = null;
            }
        };

        if (runEnhancements()) {
            stopInterval();
        } else {
            intervalId = window.setInterval(() => {
                if (runEnhancements()) {
                    stopInterval();
                }
            }, 1000);
        }

        const observer = new MutationObserver(() => {
            if (runEnhancements()) {
                stopInterval();
            }
        });

        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    if (window.top === window) {
        bootstrapUserContext();
    }
    startUiObserver();
})();
