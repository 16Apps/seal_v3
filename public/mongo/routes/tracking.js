const shortid = require('shortid');
const moment = require('moment');

const Gateway = require('../models/gateway');
const Item = require('../models/item');
const Registro = require('../models/registro');
const TrackingRegra = require('../models/trackingregra');
const TrackingGuarda = require('../models/trackingguarda');

module.exports = (app, dbConnection) => {

    /**
     * Disputa em memória (alinhado ao Aferidor): leituras + janela + campeão por tag.
     * Evita persistir TrackingGuarda a cada leitura e permite fechar janela no relógio.
     */
    const disputaMemoria = new Map();
    const MAX_LEITURAS_MEMORIA = 5000;
    const SWEEP_JANELA_MS = 1000;
    const _sweeping = new Set();

    function chaveDisputaMemoria(idConta, tag) {
        return strId(idConta) + '::' + String(tag || '').trim();
    }

    function obterEstadoDisputa(idConta, tag) {
        const k = chaveDisputaMemoria(idConta, tag);
        if (!disputaMemoria.has(k)) {
            disputaMemoria.set(k, {
                id_conta: strId(idConta),
                tag: String(tag || '').trim(),
                janela_inicio: null,
                janela_fim: null,
                leituras: [],
                id_gateway_campeao: null,
                id_tracking_regra: null
            });
        }
        return disputaMemoria.get(k);
    }

    function abrirJanelaEstado(st, inicio, janelaSeg) {
        const seg = numParam(janelaSeg);
        const iniMs = new Date(inicio).getTime();
        st.janela_inicio = new Date(iniMs);
        st.janela_fim = new Date(iniMs + seg * 1000);
    }

    function leiturasNaJanelaFechada(st, ini, fim) {
        const tIni = new Date(ini).getTime();
        const tFim = new Date(fim).getTime();
        return (st.leituras || []).filter(function (l) {
            if (!l || !l.data_leitura) return false;
            const t = new Date(l.data_leitura).getTime();
            return Number.isFinite(t) && t >= tIni && t <= tFim;
        });
    }

    function trimLeiturasMemoria(st) {
        if (!st || !Array.isArray(st.leituras)) return;
        if (st.leituras.length > MAX_LEITURAS_MEMORIA) {
            st.leituras = st.leituras.slice(-MAX_LEITURAS_MEMORIA);
        }
    }

    function idCampeaoPosAvaliacao(st, avaliacao) {
        const g = (avaliacao && avaliacao.metricas && avaliacao.metricas.gordura) || {};
        if (g.id_final) return strId(g.id_final);
        if (avaliacao && avaliacao.ok && avaliacao.candidato) return strId(avaliacao.candidato.id_gateway);
        if (avaliacao && avaliacao.id_campeao_mantido) return strId(avaliacao.id_campeao_mantido);
        return st.id_gateway_campeao || null;
    }

    /**
     * Fecha uma janela, resolve campeão e aplica localização (como executarChecagemJanela do Aferidor).
     */
    async function fecharJanelaDisputaMemoria(st, params) {
        params = params || {};
        if (!st || !st.janela_inicio || !st.janela_fim) {
            return { fechou: false, motivo: 'Sem janela aberta' };
        }

        const regra = params.regra;
        const janelaIni = st.janela_inicio;
        const janelaFim = st.janela_fim;
        const dataRef = params.dataRef || janelaFim;
        const simular = !!params.simular;

        const leiturasJanela = leiturasNaJanelaFechada(st, janelaIni, janelaFim);
        const idCampeaoAntes = st.id_gateway_campeao ||
            (params.gatewayCampeao && params.gatewayCampeao._id) ||
            null;

        const avaliacao = avaliarGuarda({
            leituras: leiturasJanela,
            janela_inicio: janelaIni,
            janela_fim: janelaFim
        }, regra, {
            dataRef: dataRef,
            idGatewayCampeao: idCampeaoAntes
        });

        const idCampeaoNovo = idCampeaoPosAvaliacao(st, avaliacao);
        if (idCampeaoNovo) st.id_gateway_campeao = idCampeaoNovo;

        const janelaSeg = numParam(regra && regra.janela_analise);
        abrirJanelaEstado(st, janelaFim, janelaSeg);

        const resultado = {
            fechou: true,
            avaliacao: avaliacao,
            applied: false,
            aplicado: null,
            pending: !avaliacao.ok,
            janela_fechada: { inicio: janelaIni, fim: janelaFim, leituras: leiturasJanela.length }
        };

        if (!avaliacao.ok || !avaliacao.candidato) {
            return resultado;
        }

        const amostraWin = avaliacao.candidato.amostra;
        const locVencedor = {
            id_nivel_loc1: (amostraWin && amostraWin.id_nivel_loc1) || '',
            id_nivel_loc2: (amostraWin && amostraWin.id_nivel_loc2) || '',
            id_nivel_loc3: (amostraWin && amostraWin.id_nivel_loc3) || '',
            id_nivel_loc4: (amostraWin && amostraWin.id_nivel_loc4) || '',
            id_nivel_loc1_final: (amostraWin && amostraWin.id_nivel_loc1_final) || '',
            id_nivel_loc2_final: (amostraWin && amostraWin.id_nivel_loc2_final) || '',
            id_nivel_loc3_final: (amostraWin && amostraWin.id_nivel_loc3_final) || '',
            id_nivel_loc4_final: (amostraWin && amostraWin.id_nivel_loc4_final) || ''
        };

        let gatewayAplicar = params.gatewayLeitura;
        const idWin = avaliacao.candidato.id_gateway;
        if (idWin && strId(idWin) !== strId(params.gatewayLeitura && params.gatewayLeitura._id)) {
            const gwWin = await Gateway.findOne({ _id: idWin, ativo: 1 });
            if (gwWin) gatewayAplicar = gwWin;
        }

        const dataLeitura = params.dataLeitura || new Date(janelaFim);
        const tol = resolverToleranciaVencedor({
            ultimoRegistro: params.ultimoRegistro,
            gatewayVencedorId: gatewayAplicar._id,
            locVencedor: locVencedor,
            dataLeitura: dataLeitura,
            toleranciaSeg: numParam(regra && regra.tolerancia_sem_leitura)
        });

        if (tol.soPermanencia) {
            if (!simular) {
                resultado.aplicado = await atualizarPermanencia({
                    gateway: gatewayAplicar,
                    item: params.item,
                    tag: params.tag,
                    loc: locVencedor,
                    leitura: amostraWin || params.leituraDoc,
                    dataLeitura: dataLeitura,
                    ultimoRegistro: params.ultimoRegistro
                });
            } else {
                resultado.aplicado = { retorno: 'Permanência (simulado)', status: 'permanencia', registro: params.ultimoRegistro };
            }
            resultado.applied = !simular;
            resultado.permanence = true;
            resultado.gatewayAplicar = gatewayAplicar;
            return resultado;
        }

        if (!simular) {
            resultado.aplicado = await aplicarLocalizacao({
                gateway: gatewayAplicar,
                item: params.item,
                tag: params.tag,
                loc: locVencedor,
                leitura: amostraWin || params.leituraDoc,
                dataLeitura: dataLeitura,
                ultimoRegistro: params.ultimoRegistro,
                forcarNovoCiclo: !!tol.forcarNovoCiclo,
                gapSegundos: tol.gap
            });
        } else {
            resultado.aplicado = { retorno: 'Entrada (simulado)', status: 'entrada', registro: null, ciclo: true };
        }
        resultado.applied = !simular;
        resultado.ciclo = !!(resultado.aplicado && resultado.aplicado.ciclo);
        resultado.gatewayAplicar = gatewayAplicar;
        resultado.tolerancia = tol;
        return resultado;
    }

    async function rotacionarJanelasVencidas(st, params) {
        const limiteMs = Math.max(Date.now(), new Date(params.dataLeitura).getTime());
        let ultimo = null;
        while (st.janela_fim && new Date(st.janela_fim).getTime() <= limiteMs) {
            ultimo = await fecharJanelaDisputaMemoria(st, params);
        }
        return ultimo;
    }

    async function sweepJanelasMemoria() {
        disputaMemoria.forEach(function (st, k) {
            if (!st.janela_fim || _sweeping.has(k)) return;
            if (Date.now() < new Date(st.janela_fim).getTime()) return;

            _sweeping.add(k);
            (async function () {
                try {
                    if (!st.id_tracking_regra) {
                        _sweeping.delete(k);
                        return;
                    }
                    const ctx = await carregarContextoDisputa(st.id_conta, st.tag, st.id_tracking_regra);
                    if (!ctx) {
                        _sweeping.delete(k);
                        return;
                    }
                    while (st.janela_fim && Date.now() >= new Date(st.janela_fim).getTime()) {
                        await fecharJanelaDisputaMemoria(st, {
                            regra: ctx.regra,
                            item: ctx.item,
                            tag: st.tag,
                            ultimoRegistro: ctx.ultimoRegistro,
                            gatewayCampeao: ctx.gatewayCampeao,
                            gatewayLeitura: ctx.gatewayCampeao,
                            dataLeitura: st.janela_fim,
                            simular: false,
                            leituraDoc: null
                        });
                    }
                } catch (e) {
                    console.error('[tracking] sweep janela:', k, e && e.message);
                } finally {
                    _sweeping.delete(k);
                }
            })();
        });
    }

    async function carregarContextoDisputa(idConta, tag, idRegra) {
        const item = await Item.findOne({ tag: tag, id_conta: idConta });
        if (!item) return null;
        const regra = await TrackingRegra.findOne({ _id: idRegra, ativo: 1 });
        if (!regra) return null;
        const ultimoRegistro = await Registro.findOne({ tag: tag, id_conta: idConta })
            .sort({ createdAt: -1 })
            .limit(1);
        let gatewayCampeao = null;
        if (ultimoRegistro && ultimoRegistro.id_gateway) {
            gatewayCampeao = await Gateway.findOne({ _id: ultimoRegistro.id_gateway, ativo: 1 });
        }
        return { item: item, regra: regra, ultimoRegistro: ultimoRegistro, gatewayCampeao: gatewayCampeao };
    }

    /**
     * Todos os tempos da regra estão em segundos.
     * Parâmetro === 0 → ignorado (não aplica aquela restrição).
     */

    function parseDataLeituraBrasil(raw) {
        if (!raw && raw !== 0) {
            return moment().utcOffset(-3).toDate();
        }
        if (raw instanceof Date && !isNaN(raw.getTime())) {
            return raw;
        }
        const str = String(raw).trim();
        if (!str) {
            return moment().utcOffset(-3).toDate();
        }
        const mLocal = moment(str, 'YYYY-MM-DD HH:mm:ss', true);
        if (mLocal.isValid()) {
            return mLocal.utcOffset(-3, true).toDate();
        }
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) return parsed;
        return moment().utcOffset(-3).toDate();
    }

    function strId(v) {
        if (v == null) return '';
        if (typeof v === 'object' && v._id) return String(v._id).trim();
        return String(v).trim();
    }

    /** Tag EPC/MAC: remove separadores e reinsere como AA:BB:CC:… (aceita entrada com ou sem ":"). */
    function formatarTagLeitura(valor) {
        if (valor == null) return '';
        const limpo = String(valor).replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
        if (!limpo) return String(valor).trim();
        const pares = limpo.match(/.{1,2}/g);
        return pares ? pares.join(':') : limpo;
    }

    function numParam(v) {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }

    function temNivel(...ids) {
        return ids.some(function (id) { return !!strId(id); });
    }

    function chaveLocal(l1, l2, l3, l4) {
        return [strId(l1), strId(l2), strId(l3), strId(l4)].join('|');
    }

    /** Mesmo local só se AMBOS tiverem nível preenchido e a chave coincidir (vazio≠vazio). */
    function mesmoLocalReal(a1, a2, a3, a4, b1, b2, b3, b4) {
        if (!temNivel(a1, a2, a3, a4) || !temNivel(b1, b2, b3, b4)) return false;
        return chaveLocal(a1, a2, a3, a4) === chaveLocal(b1, b2, b3, b4);
    }

    function diffSegundos(de, ate) {
        return Math.floor((new Date(ate).getTime() - new Date(de).getTime()) / 1000);
    }

    function descricaoMovimento(item, loc) {
        if (loc.id_nivel_loc4 && strId(item.id_nivel_loc4) !== strId(loc.id_nivel_loc4)) {
            return 'Movimentado Nível 4 de ' + (item.id_nivel_loc4 || '—') + ' para ' + loc.id_nivel_loc4;
        }
        if (loc.id_nivel_loc3 && strId(item.id_nivel_loc3) !== strId(loc.id_nivel_loc3)) {
            return 'Movimentado Nível 3 de ' + (item.id_nivel_loc3 || '—') + ' para ' + loc.id_nivel_loc3;
        }
        if (loc.id_nivel_loc2 && strId(item.id_nivel_loc2) !== strId(loc.id_nivel_loc2)) {
            return 'Movimentado Nível 2 de ' + (item.id_nivel_loc2 || '—') + ' para ' + loc.id_nivel_loc2;
        }
        if (loc.id_nivel_loc1 && strId(item.id_nivel_loc1) !== strId(loc.id_nivel_loc1)) {
            return 'Movimentado Nível 1 de ' + (item.id_nivel_loc1 || '—') + ' para ' + loc.id_nivel_loc1;
        }
        return 'Entrada em nova localização';
    }

    async function resolverGatewayPorTokem(tokem) {
        let gateway = await Gateway.findOne({ tokem: String(tokem || '').trim(), ativo: 1 });
        if (!gateway) return null;

        if (gateway.tokem_associado) {
            const visited = new Set();
            let current = gateway;
            while (current && current.tokem_associado) {
                if (visited.has(current.tokem)) break;
                visited.add(current.tokem);
                const primary = await Gateway.findOne({
                    tokem: String(current.tokem_associado).trim(),
                    ativo: 1
                });
                if (!primary) break;
                current = primary;
            }
            gateway = current;
        }
        return gateway;
    }

    function resolverLocalizacao(body, gateway) {
        const loc = {
            id_nivel_loc1: strId(body.id_nivel_loc1),
            id_nivel_loc2: strId(body.id_nivel_loc2),
            id_nivel_loc3: strId(body.id_nivel_loc3),
            id_nivel_loc4: strId(body.id_nivel_loc4),
            id_nivel_loc1_final: strId(body.id_nivel_loc1_final),
            id_nivel_loc2_final: strId(body.id_nivel_loc2_final),
            id_nivel_loc3_final: strId(body.id_nivel_loc3_final),
            id_nivel_loc4_final: strId(body.id_nivel_loc4_final)
        };

        if (!temNivel(loc.id_nivel_loc1, loc.id_nivel_loc2, loc.id_nivel_loc3, loc.id_nivel_loc4)) {
            loc.id_nivel_loc1 = strId(gateway.id_nivel_loc1);
            loc.id_nivel_loc2 = strId(gateway.id_nivel_loc2);
            loc.id_nivel_loc3 = strId(gateway.id_nivel_loc3);
            loc.id_nivel_loc4 = strId(gateway.id_nivel_loc4);
        }

        if (!temNivel(loc.id_nivel_loc1_final, loc.id_nivel_loc2_final, loc.id_nivel_loc3_final, loc.id_nivel_loc4_final)) {
            loc.id_nivel_loc1_final = strId(gateway.id_nivel_loc1_destino);
            loc.id_nivel_loc2_final = strId(gateway.id_nivel_loc2_destino);
            loc.id_nivel_loc3_final = strId(gateway.id_nivel_loc3_destino);
            loc.id_nivel_loc4_final = strId(gateway.id_nivel_loc4_destino);
        }

        return loc;
    }

    /**
     * minima_rssi = limiar absoluto em dBm.
     * Usuário informa 30 → trata como -30. Leitura precisa ser >= limiar (-37 ok, -35 com limiar -30 ignora).
     * 0 → ignora o filtro.
     * Entre leituras, maior valor algébrico vence (-37 é melhor que -38).
     */
    function limiarRssi(minimaRssi) {
        const n = numParam(minimaRssi);
        if (n === 0) return null;
        return n > 0 ? -n : n;
    }

    function rssiAtendeMinimo(rssi, regra) {
        const limiar = limiarRssi(regra && regra.minima_rssi);
        if (limiar == null) return true;
        const r = Number(rssi);
        if (!Number.isFinite(r)) return false;
        return r >= limiar;
    }

    function resumoRegra(regra) {
        if (!regra) return null;
        return {
            _id: regra._id,
            descricao: regra.descricao || '',
            janela_analise: numParam(regra.janela_analise),
            gordura_percentual: numParam(regra.gordura_percentual),
            minima_rssi: numParam(regra.minima_rssi),
            tolerancia_sem_leitura: numParam(regra.tolerancia_sem_leitura),
            ativo: regra.ativo
        };
    }

    /**
     * Vantagem percentual do desafiante sobre o campeão (mesma regra do Aferidor).
     */
    function vantagemPercentual(valorCampeao, valorDesafiante, opts) {
        opts = opts || {};
        const c = Number(valorCampeao);
        const d = Number(valorDesafiante);
        if (!Number.isFinite(c) || !Number.isFinite(d)) return null;
        const base = opts.usarAbs ? Math.abs(c) : c;
        if (!(base > 0)) return null;
        return ((d - c) / base) * 100;
    }

    /**
     * Métricas por gateway na janela (após filtro RSSI).
     */
    function calcularMetricasPorGateway(leituras, tIni, tFim, regra) {
        const mapa = {};
        const tIniMs = tIni ? new Date(tIni).getTime() : null;
        const tFimMs = tFim ? new Date(tFim).getTime() : null;

        (leituras || []).forEach(function (l) {
            if (!l) return;
            if (tIniMs != null || tFimMs != null) {
                const t = l.data_leitura ? new Date(l.data_leitura).getTime() : NaN;
                if (!Number.isFinite(t)) return;
                if (tIniMs != null && t < tIniMs) return;
                if (tFimMs != null && t > tFimMs) return;
            }
            if (!rssiAtendeMinimo(l.rssi, regra)) return;

            const idGw = strId(l.id_gateway);
            if (!idGw) return;

            if (!mapa[idGw]) {
                mapa[idGw] = {
                    id_gateway: idGw,
                    qtd: 0,
                    somaRssi: 0,
                    qtdRssi: 0,
                    media: null,
                    melhor: null,
                    melhor_rssi: -Infinity,
                    leituras: [],
                    amostra: l
                };
            }
            const m = mapa[idGw];
            m.qtd += 1;
            m.leituras.push(l);
            const rssi = Number(l.rssi);
            if (Number.isFinite(rssi)) {
                m.somaRssi += rssi;
                m.qtdRssi += 1;
                if (m.melhor == null || rssi > m.melhor) {
                    m.melhor = rssi;
                    m.melhor_rssi = rssi;
                    m.amostra = l;
                }
            }
        });

        Object.keys(mapa).forEach(function (idGw) {
            const m = mapa[idGw];
            m.media = m.qtdRssi > 0 ? (m.somaRssi / m.qtdRssi) : null;
            if (!Number.isFinite(m.melhor_rssi)) m.melhor_rssi = m.melhor;
        });
        return mapa;
    }

    /**
     * Placar 3 critérios (qtd, média RSSI, melhor RSSI) — igual ao Aferidor.
     */
    function calcularVencedorDisputa(porGw) {
        const ids = Object.keys(porGw || {});
        const resultadoVazio = {
            id_gateway: null,
            placar: {},
            criterios: {},
            empate: true,
            grupos: []
        };
        if (!ids.length) return resultadoVazio;

        const placar = {};
        ids.forEach(function (id) {
            placar[id] = { qtd: 0, media: 0, melhor: 0, total: 0 };
        });

        function disputaCriterio(campo, maiorMelhor) {
            let melhorVal = null;
            const ganhadores = [];
            ids.forEach(function (id) {
                let v = porGw[id][campo];
                if (v == null || !Number.isFinite(Number(v))) return;
                v = Number(v);
                if (melhorVal == null) {
                    melhorVal = v;
                    ganhadores.length = 0;
                    ganhadores.push(id);
                    return;
                }
                if (maiorMelhor) {
                    if (v > melhorVal) { melhorVal = v; ganhadores.length = 0; ganhadores.push(id); }
                    else if (v === melhorVal) ganhadores.push(id);
                } else {
                    if (v < melhorVal) { melhorVal = v; ganhadores.length = 0; ganhadores.push(id); }
                    else if (v === melhorVal) ganhadores.push(id);
                }
            });
            if (ganhadores.length === 1) {
                placar[ganhadores[0]][campo] = 1;
                placar[ganhadores[0]].total += 1;
            }
            return { valor: melhorVal, ganhadores: ganhadores };
        }

        const dQtd = disputaCriterio('qtd', true);
        const dMedia = disputaCriterio('media', true);
        const dMelhor = disputaCriterio('melhor', true);

        let vencedorId = null;
        let melhorTotal = -1;
        ids.forEach(function (id) {
            if (placar[id].total > melhorTotal) {
                melhorTotal = placar[id].total;
                vencedorId = id;
            } else if (placar[id].total === melhorTotal) {
                vencedorId = null;
            }
        });

        const grupos = ids.map(function (id) {
            const m = porGw[id];
            return {
                key: id,
                id_gateway: id,
                count: m.qtd,
                melhor_rssi: Number.isFinite(m.melhor_rssi) ? m.melhor_rssi : m.melhor,
                amostra: m.amostra,
                leituras: m.leituras,
                media: m.media
            };
        }).sort(function (a, b) {
            if (b.count !== a.count) return b.count - a.count;
            return (b.melhor_rssi || -Infinity) - (a.melhor_rssi || -Infinity);
        });

        return {
            id_gateway: vencedorId,
            placar: placar,
            criterios: { qtd: dQtd, media: dMedia, melhor: dMelhor },
            empate: !vencedorId && melhorTotal >= 0,
            grupos: grupos
        };
    }

    /**
     * Gordura ao trocar campeão (mesma lógica do Aferidor).
     * 2+ pontos no placar → vencedor assume; 0–1 ponto → gordura nos 3 tópicos.
     */
    function aplicarGorduraDisputa(venc, porGw, idCampeaoAtual, gorduraPct) {
        const gordura = numParam(gorduraPct);
        const resultado = {
            id_gateway: venc && venc.id_gateway ? venc.id_gateway : null,
            empate: !!(venc && venc.empate),
            placar: (venc && venc.placar) || {},
            ganhouPorGordura: false,
            gorduraExigida: gordura,
            vantagens: null,
            motivoGordura: null
        };

        if (!venc || !venc.id_gateway || gordura <= 0 || !strId(idCampeaoAtual)) return resultado;

        const idCamp = strId(idCampeaoAtual);
        const idCand = strId(venc.id_gateway);
        if (!idCamp || !idCand || idCamp === idCand) return resultado;

        const placarCand = (venc.placar && venc.placar[idCand]) || {};
        const pontosVencedor = Number(placarCand.total) || 0;
        if (pontosVencedor >= 2) {
            resultado.motivoGordura =
                'Troca pelo placar (' + pontosVencedor + '/3 critérios); gordura não bloqueia com 2+ pontos.';
            return resultado;
        }

        const mCamp = porGw[idCamp];
        const mCand = porGw[idCand];
        if (!mCamp || !mCand) return resultado;

        const pctQtd = vantagemPercentual(mCamp.qtd || 0, mCand.qtd || 0, { usarAbs: false });
        const pctMedia = vantagemPercentual(mCamp.media, mCand.media, { usarAbs: true });
        const pctMelhor = vantagemPercentual(mCamp.melhor, mCand.melhor, { usarAbs: true });

        resultado.vantagens = { qtd: pctQtd, media: pctMedia, melhor: pctMelhor };

        function atende(pct) {
            return pct != null && pct >= gordura;
        }

        if (!(atende(pctQtd) && atende(pctMedia) && atende(pctMelhor))) {
            resultado.id_gateway = idCamp;
            resultado.empate = false;
            resultado.ganhouPorGordura = true;
            resultado.motivoGordura =
                `Campeão mantido por gordura (${gordura}% nos 3 critérios). ` +
                `Vantagens: qtd ${pctQtd != null ? pctQtd.toFixed(1) + '%' : '—'}, ` +
                `média ${pctMedia != null ? pctMedia.toFixed(1) + '%' : '—'}, ` +
                `melhor ${pctMelhor != null ? pctMelhor.toFixed(1) + '%' : '—'}.`;
        }

        return resultado;
    }

    function resumoGateway(gw) {
        if (!gw) return null;
        return {
            _id: gw._id || gw.id || null,
            descricao: gw.descricao || gw.tokem || String(gw._id || ''),
            tokem: gw.tokem || ''
        };
    }

    function chaveGatewayLeitura(l) {
        return strId(l && l.id_gateway) ||
            ('loc:' + chaveLocal(l && l.id_nivel_loc1, l && l.id_nivel_loc2, l && l.id_nivel_loc3, l && l.id_nivel_loc4));
    }

    function filtrarLeiturasJanela(leiturasBrutas, janelaSeg, dataRef) {
        const lista = Array.isArray(leiturasBrutas) ? leiturasBrutas.slice() : [];
        if (!(janelaSeg > 0) || !dataRef) return lista;
        const fim = new Date(dataRef).getTime();
        const inicio = fim - (janelaSeg * 1000);
        return lista.filter(function (l) {
            const t = l && l.data_leitura ? new Date(l.data_leitura).getTime() : NaN;
            return Number.isFinite(t) && t >= inicio && t <= fim;
        });
    }

    /**
     * Avalia a guarda ao fechar a janela (lógica alinhada ao Aferidor):
     * - decisão apenas quando dataRef >= janela_fim
     * - placar em 3 critérios (qtd, média RSSI, melhor RSSI)
     * - gordura_percentual ao trocar campeão
     *
     * opts: { dataRef, idGatewayCampeao }
     */
    function avaliarGuarda(guarda, regra, opts) {
        opts = opts || {};
        const janelaSeg = numParam(regra && regra.janela_analise);
        const dataRef = opts.dataRef ? new Date(opts.dataRef) : new Date();
        const janelaInicio = (guarda && guarda.janela_inicio) || dataRef;
        const janelaFim = (guarda && guarda.janela_fim) || dataRef;
        const janelaFimMs = new Date(janelaFim).getTime();
        const dataRefMs = dataRef.getTime();

        const leiturasBrutas = Array.isArray(guarda && guarda.leituras) ? guarda.leituras : [];
        const limiar = limiarRssi(regra && regra.minima_rssi);

        const baseMetricas = {
            janela: {
                inicio: janelaInicio,
                fim: janelaFim,
                segundos: janelaSeg,
                leituras_brutas: leiturasBrutas.length,
                fechada: dataRefMs >= janelaFimMs
            },
            minima_rssi: {
                limite: limiar,
                ignorado: limiar == null
            },
            placar: {},
            gordura: {
                exigida: numParam(regra && regra.gordura_percentual),
                ignorado: numParam(regra && regra.gordura_percentual) <= 0
            }
        };

        if (dataRefMs < janelaFimMs) {
            const resto = Math.ceil((janelaFimMs - dataRefMs) / 1000);
            return {
                ok: false,
                motivo: `Aguardando fechamento da janela (${resto}s)`,
                metricas: baseMetricas,
                grupos: [],
                candidato: null,
                placar_pontos: 0
            };
        }

        const porGw = calcularMetricasPorGateway(leiturasBrutas, janelaInicio, janelaFim, regra);
        const idsGw = Object.keys(porGw);

        baseMetricas.leituras_consideradas = idsGw.reduce(function (acc, id) {
            return acc + porGw[id].qtd;
        }, 0);

        if (!idsGw.length) {
            return {
                ok: false,
                motivo: limiar != null
                    ? `Nenhuma leitura com RSSI >= ${limiar} dBm na janela`
                    : 'Nenhuma leitura válida na janela',
                metricas: baseMetricas,
                grupos: [],
                candidato: null,
                placar_pontos: 0
            };
        }

        const disputa = calcularVencedorDisputa(porGw);
        baseMetricas.placar = disputa.placar;
        baseMetricas.criterios = disputa.criterios;

        if (disputa.empate || !disputa.id_gateway) {
            return {
                ok: false,
                motivo: 'Empate na disputa da janela (placar dos 3 critérios)',
                metricas: baseMetricas,
                grupos: disputa.grupos,
                candidato: disputa.grupos[0] || null,
                empate: true,
                placar_pontos: 0
            };
        }

        const gord = aplicarGorduraDisputa(
            disputa,
            porGw,
            opts.idGatewayCampeao,
            regra && regra.gordura_percentual
        );
        baseMetricas.gordura = Object.assign(baseMetricas.gordura, {
            vantagens: gord.vantagens,
            ganhouPorGordura: gord.ganhouPorGordura,
            motivo: gord.motivoGordura,
            id_final: gord.id_gateway
        });

        const idFinal = strId(gord.id_gateway);
        if (!idFinal || !porGw[idFinal]) {
            return {
                ok: false,
                motivo: gord.motivoGordura || 'Sem vencedor após gordura',
                metricas: baseMetricas,
                grupos: disputa.grupos,
                candidato: null,
                ganhouPorGordura: gord.ganhouPorGordura,
                placar_pontos: 0
            };
        }

        const gwWin = porGw[idFinal];
        const candidato = {
            key: idFinal,
            id_gateway: idFinal,
            count: gwWin.qtd,
            melhor_rssi: gwWin.melhor_rssi,
            amostra: gwWin.amostra,
            leituras: gwWin.leituras,
            media: gwWin.media
        };

        const placarPontos = (disputa.placar[idFinal] && disputa.placar[idFinal].total) || 0;

        if (gord.ganhouPorGordura) {
            return {
                ok: false,
                motivo: gord.motivoGordura,
                metricas: baseMetricas,
                grupos: disputa.grupos,
                candidato: candidato,
                ganhouPorGordura: true,
                id_vencedor_janela: disputa.id_gateway,
                id_campeao_mantido: idFinal,
                placar_pontos: placarPontos
            };
        }

        return {
            ok: true,
            motivo: idsGw.length > 1
                ? 'Disputa resolvida na janela (placar + gordura)'
                : 'Janela fechada — gateway único',
            metricas: baseMetricas,
            grupos: disputa.grupos,
            candidato: candidato,
            disputa_multi_gateway: idsGw.length > 1,
            placar_pontos: placarPontos
        };
    }

    function montarNarrativaAfericao(ctx) {
        const itemNome = (ctx.item && (ctx.item.descricao || ctx.item.tag)) || ctx.tag || 'Tag';
        const gwLeitura = ctx.gatewayLeitura;
        const gwCamp = ctx.gatewayCampeao;
        const gwCand = ctx.gatewayCandidato;
        const m = ctx.metricas || {};
        const nome = function (g, fallback) {
            return (g && (g.descricao || g.tokem)) || fallback || 'gateway';
        };

        if (!gwCamp || !gwCand) {
            return ctx.motivo || 'Aguardando disputa entre gateways.';
        }

        const mesmo = strId(gwCamp._id) === strId(gwCand._id);
        const gord = m.gordura || {};
        const partes = [];

        if (ctx.motivo) partes.push(ctx.motivo);
        else if (mesmo) {
            partes.push(`${itemNome} permanece em ${nome(gwCamp)}.`);
        } else {
            partes.push(`${itemNome}: disputa entre ${nome(gwCamp)} e ${nome(gwCand)}.`);
            if (Number.isFinite(gwCand.melhor_rssi)) {
                partes.push(`Líder provisório ${nome(gwCand)} (melhor RSSI ${gwCand.melhor_rssi} dBm).`);
            }
        }

        if (gord.ganhouPorGordura && gord.motivo) {
            partes.push(gord.motivo);
        } else if (!gord.ignorado && gord.exigida > 0 && gord.vantagens) {
            const v = gord.vantagens;
            partes.push(
                `Gordura ${gord.exigida}%: vantagens qtd ${v.qtd != null ? v.qtd.toFixed(1) + '%' : '—'}, ` +
                `média ${v.media != null ? v.media.toFixed(1) + '%' : '—'}, ` +
                `melhor ${v.melhor != null ? v.melhor.toFixed(1) + '%' : '—'}.`
            );
        }

        if (m.janela && m.janela.fechada === false) {
            partes.push('Aguardando fechamento da janela de análise.');
        }

        if (ctx.applied && !mesmo) {
            partes.push(`${itemNome} foi assumido por ${nome(gwCand)}.`);
        }

        return partes.join(' ');
    }

    function montarPayloadAfericao(ctx) {
        const m = (ctx.avaliacao && ctx.avaliacao.metricas) || {};
        const tol = ctx.tolerancia || {};
        const regraDisp = ctx.regraDisputa;

        return {
            tipo: 'tracking_afericao',
            via: 'tracking',
            tag: ctx.tag,
            item: ctx.item ? {
                _id: ctx.item._id,
                descricao: ctx.item.descricao || '',
                tag: ctx.item.tag || ctx.tag
            } : { tag: ctx.tag },
            gateway_leitura: resumoGateway(ctx.gatewayLeitura),
            gateway_campeao: resumoGateway(ctx.gatewayCampeao),
            gateway_candidato: resumoGateway(ctx.gatewayCandidato) || (
                ctx.avaliacao && ctx.avaliacao.candidato
                    ? {
                        _id: ctx.avaliacao.candidato.id_gateway,
                        descricao: ctx.avaliacao.candidato.id_gateway,
                        melhor_rssi: ctx.avaliacao.candidato.melhor_rssi,
                        count: ctx.avaliacao.candidato.count,
                        media: ctx.avaliacao.candidato.media
                    }
                    : null
            ),
            desafiante: !!ctx.desafiante,
            regra: resumoRegra(regraDisp),
            precedencia: ctx.precedencia || 'leitura',
            janela: m.janela || null,
            leituras_consideradas: m.leituras_consideradas != null ? m.leituras_consideradas : null,
            minima_rssi: m.minima_rssi || null,
            placar: m.placar || null,
            criterios: m.criterios || null,
            gordura: m.gordura || {
                exigida: numParam(regraDisp && regraDisp.gordura_percentual),
                ignorado: numParam(regraDisp && regraDisp.gordura_percentual) <= 0
            },
            tolerancia_sem_leitura: {
                desde_ultima: tol.gap != null ? tol.gap : null,
                configurada: ctx.toleranciaSeg != null ? ctx.toleranciaSeg : numParam(regraDisp && regraDisp.tolerancia_sem_leitura),
                so_permanencia: !!tol.soPermanencia,
                troca_local: !!tol.trocaLocal,
                ignorado: !(ctx.toleranciaSeg > 0)
            },
            disputa: !!(ctx.avaliacao && (
                ctx.avaliacao.disputa_multi_gateway ||
                (ctx.avaliacao.grupos && ctx.avaliacao.grupos.length > 1)
            )),
            ganhou_por_gordura: !!(ctx.avaliacao && ctx.avaliacao.ganhouPorGordura),
            placar_pontos: ctx.avaliacao && ctx.avaliacao.placar_pontos,
            decisao: {
                ok: !!(ctx.avaliacao && ctx.avaliacao.ok),
                pending: !!ctx.pending,
                applied: !!ctx.applied,
                permanence: !!ctx.permanence,
                ignored: !!ctx.ignored,
                message: ctx.motivo || (ctx.avaliacao && ctx.avaliacao.motivo) || '',
                narrativa: ctx.narrativa || ''
            },
            data_leitura: ctx.dataLeitura || null,
            simulado: !!ctx.simulado
        };
    }

    /** Envia leitura ao socket assim que o item está validado (antes de aplicar regras/guarda). */
    async function emitirSocketLeituraDireta(req, gateway, body, dataLeitura, item, tag) {
        try {
            const io = req.app.get('io');
            if (!io || !gateway) return;
            const payloadSocket = Object.assign({}, body || {}, {
                data_leitura: dataLeitura,
                via: 'tracking',
                tag: tag,
                id_gateway: gateway._id,
                tokem: gateway.tokem || (body && body.tokem) || '',
                id_item: item && item._id,
                item_descricao: item && item.descricao,
                rssi: body && body.rssi != null ? Number(body.rssi) : body && body.rssi
            });
            if (gateway._id) io.emit(gateway._id, payloadSocket);
            if (gateway.id_conta) io.emit(gateway.id_conta, payloadSocket);
        } catch (e) { /* ignore */ }
    }

    async function emitirSocketAfericao(req, gateway, body, afericao, dataLeitura) {
        try {
            const io = req.app.get('io');
            if (!io || !gateway) return;
            const payloadSocket = Object.assign({}, body || {}, {
                data_leitura: dataLeitura,
                via: 'tracking',
                id_gateway: gateway._id,
                id_tracking_regra: afericao && afericao.regra && afericao.regra._id,
                afericao: afericao
            });
            io.emit(gateway._id, payloadSocket);
            if (gateway.id_conta) io.emit(gateway.id_conta, payloadSocket);
            if (afericao) {
                io.emit('tracking_afericao:' + gateway.id_conta, afericao);
            }
        } catch (e) { /* ignore */ }
    }

    /**
     * Tolerância só para o gateway/local ganhador (ou o mesmo da presença atual):
     * - dentro do tempo → permanência
     * - após gap → novo ciclo
     * Outro gateway ganhando disputa → troca de local (entrada), sem ignorar por tolerância.
     */
    function resolverToleranciaVencedor({ ultimoRegistro, gatewayVencedorId, locVencedor, dataLeitura, toleranciaSeg }) {
        if (!ultimoRegistro || toleranciaSeg <= 0) {
            return { soPermanencia: false, forcarNovoCiclo: false, gap: null };
        }

        const refUltima =
            ultimoRegistro.data_permanecia ||
            ultimoRegistro.updatedAt ||
            ultimoRegistro.data_registro;
        const gap = diffSegundos(refUltima, dataLeitura);

        const mesmoGateway = strId(ultimoRegistro.id_gateway) === strId(gatewayVencedorId);
        const mesmoLocal = mesmoLocalReal(
            ultimoRegistro.id_nivel_loc1, ultimoRegistro.id_nivel_loc2,
            ultimoRegistro.id_nivel_loc3, ultimoRegistro.id_nivel_loc4,
            locVencedor.id_nivel_loc1, locVencedor.id_nivel_loc2,
            locVencedor.id_nivel_loc3, locVencedor.id_nivel_loc4
        );

        // Tolerância só se o vencedor é o mesmo gateway ou o mesmo local da presença atual
        if (!(mesmoGateway || mesmoLocal)) {
            return { soPermanencia: false, forcarNovoCiclo: false, gap: gap, trocaLocal: true };
        }

        if (gap >= 0 && gap <= toleranciaSeg) {
            return { soPermanencia: true, forcarNovoCiclo: false, gap: gap };
        }
        if (gap > toleranciaSeg) {
            return { soPermanencia: false, forcarNovoCiclo: true, gap: gap };
        }
        return { soPermanencia: false, forcarNovoCiclo: false, gap: gap };
    }

    async function atualizarPermanencia({ gateway, item, tag, loc, leitura, dataLeitura, ultimoRegistro }) {
        ultimoRegistro.rssi = String(leitura.rssi != null ? leitura.rssi : ultimoRegistro.rssi);
        ultimoRegistro.bateria = leitura.bateria != null ? String(leitura.bateria) : ultimoRegistro.bateria;
        ultimoRegistro.temperatura = leitura.temperatura != null ? String(leitura.temperatura) : ultimoRegistro.temperatura;
        ultimoRegistro.data_permanecia = dataLeitura;
        ultimoRegistro.status = 'permanencia';
        ultimoRegistro.id_gateway = gateway._id;
        if (loc) {
            ultimoRegistro.id_nivel_loc1 = loc.id_nivel_loc1 || null;
            ultimoRegistro.id_nivel_loc2 = loc.id_nivel_loc2 || null;
            ultimoRegistro.id_nivel_loc3 = loc.id_nivel_loc3 || null;
            ultimoRegistro.id_nivel_loc4 = loc.id_nivel_loc4 || null;
        }
        await ultimoRegistro.save();

        item.status = 'ativo';
        if (loc) {
            item.id_nivel_loc1 = loc.id_nivel_loc1 || '';
            item.id_nivel_loc2 = loc.id_nivel_loc2 || '';
            item.id_nivel_loc3 = loc.id_nivel_loc3 || '';
            item.id_nivel_loc4 = loc.id_nivel_loc4 || '';
        }
        item.registro_atual = ultimoRegistro.toObject ? ultimoRegistro.toObject() : ultimoRegistro;
        await item.save();

        return {
            status: 'permanencia',
            retorno: 'Permanência atualizada (dentro da tolerância)',
            registro: ultimoRegistro,
            novo: false
        };
    }

    async function aplicarLocalizacao({ gateway, item, tag, loc, leitura, dataLeitura, ultimoRegistro, forcarNovoCiclo, gapSegundos }) {
        if (!ultimoRegistro) {
            ultimoRegistro = await Registro.findOne({ tag, id_conta: gateway.id_conta })
                .sort({ createdAt: -1 })
                .limit(1);
        }

        const locPreenchida = temNivel(loc.id_nivel_loc1, loc.id_nivel_loc2, loc.id_nivel_loc3, loc.id_nivel_loc4);
        const itemTinhaLocal = temNivel(item.id_nivel_loc1, item.id_nivel_loc2, item.id_nivel_loc3, item.id_nivel_loc4);
        const ultimoTinhaLocal = !!(ultimoRegistro && temNivel(
            ultimoRegistro.id_nivel_loc1, ultimoRegistro.id_nivel_loc2,
            ultimoRegistro.id_nivel_loc3, ultimoRegistro.id_nivel_loc4
        ));

        // Compara com o registro atual (fonte da presença), não só com o item
        const mesmoLocal = ultimoRegistro
            ? mesmoLocalReal(
                ultimoRegistro.id_nivel_loc1, ultimoRegistro.id_nivel_loc2,
                ultimoRegistro.id_nivel_loc3, ultimoRegistro.id_nivel_loc4,
                loc.id_nivel_loc1, loc.id_nivel_loc2, loc.id_nivel_loc3, loc.id_nivel_loc4
            )
            : mesmoLocalReal(
                item.id_nivel_loc1, item.id_nivel_loc2, item.id_nivel_loc3, item.id_nivel_loc4,
                loc.id_nivel_loc1, loc.id_nivel_loc2, loc.id_nivel_loc3, loc.id_nivel_loc4
            );

        /**
         * Status:
         * - permanencia → só atualização do MESMO ciclo no MESMO local
         * - entrada → 1ª presença no local, troca de local, ou novo ciclo após gap
         * - em_transito → leitura sem localização resolvida
         */
        let status = 'entrada';
        let retorno = 'Entrada registrada via tracking';

        if (!locPreenchida) {
            status = (itemTinhaLocal || ultimoTinhaLocal) ? 'em_transito' : 'permanencia_em_transito';
            retorno = (itemTinhaLocal || ultimoTinhaLocal)
                ? 'Localização não informada, em trânsito.'
                : 'O item já encontrava-se em trânsito';
        } else if (mesmoLocal && !forcarNovoCiclo && ultimoRegistro) {
            // Continua no mesmo ciclo
            return atualizarPermanencia({ gateway, item, tag, loc, leitura, dataLeitura, ultimoRegistro });
        } else if (mesmoLocal && forcarNovoCiclo) {
            status = 'entrada';
            retorno = gapSegundos != null
                ? `Novo ciclo de leitura (gap sem leitura: ${gapSegundos}s)`
                : 'Novo ciclo de leitura (mesmo local após gap)';
        } else if (!mesmoLocal && locPreenchida) {
            // Troca de local (A → B) ou 1ª localização do item → sempre ENTRADA
            status = 'entrada';
            retorno = (itemTinhaLocal || ultimoTinhaLocal)
                ? descricaoMovimento(item, loc)
                : 'Primeira entrada no local';
        }

        const novoRegistro = new Registro({
            _id: shortid.generate(),
            id_conta: gateway.id_conta,
            id_gateway: gateway._id,
            latitude: leitura.latitude || '',
            longitude: leitura.longitude || '',
            data_registro: dataLeitura,
            data_permanecia: dataLeitura,
            status: status,
            id_item: item._id,
            id_categoria: item.id_categoria || null,
            tag: tag,
            rssi: String(leitura.rssi != null ? leitura.rssi : ''),
            antena: leitura.antena != null ? String(leitura.antena) : '',
            bateria: leitura.bateria != null ? String(leitura.bateria) : '',
            temperatura: leitura.temperatura != null ? String(leitura.temperatura) : '',
            associados: [],
            id_nivel_loc1: loc.id_nivel_loc1 || null,
            id_nivel_loc2: loc.id_nivel_loc2 || null,
            id_nivel_loc3: loc.id_nivel_loc3 || null,
            id_nivel_loc4: loc.id_nivel_loc4 || null,
            id_nivel_loc1_final: loc.id_nivel_loc1_final || null,
            id_nivel_loc2_final: loc.id_nivel_loc2_final || null,
            id_nivel_loc3_final: loc.id_nivel_loc3_final || null,
            id_nivel_loc4_final: loc.id_nivel_loc4_final || null,
            interacoes: []
        });
        await novoRegistro.save();

        if (ultimoRegistro) {
            item.registro_anterior = ultimoRegistro.toObject
                ? ultimoRegistro.toObject()
                : ultimoRegistro;
        }
        item.status = 'ativo';
        // Em trânsito: limpa local; entrada: grava o local resolvido
        if (status === 'em_transito' || status === 'permanencia_em_transito') {
            item.id_nivel_loc1 = '';
            item.id_nivel_loc2 = '';
            item.id_nivel_loc3 = '';
            item.id_nivel_loc4 = '';
        } else {
            item.id_nivel_loc1 = loc.id_nivel_loc1 || '';
            item.id_nivel_loc2 = loc.id_nivel_loc2 || '';
            item.id_nivel_loc3 = loc.id_nivel_loc3 || '';
            item.id_nivel_loc4 = loc.id_nivel_loc4 || '';
        }
        item.registro_atual = novoRegistro.toObject ? novoRegistro.toObject() : novoRegistro;
        await item.save();

        return {
            status,
            retorno,
            registro: novoRegistro,
            novo: true,
            ciclo: !!(forcarNovoCiclo || (!mesmoLocal && locPreenchida))
        };
    }

    /**
     * Processa uma única leitura de tracking.
     * opts.simular = true → mesma decisão, sem gravar guarda/movimento.
     */
    async function processarLeituraTracking(body, req, opts) {
        body = body || {};
        opts = opts || {};
        const simular = !!(opts.simular || body.simular);
        const tokem = strId(body.tokem);
        let tag = formatarTagLeitura(body.tag);

        if (!tokem || !tag) {
            return {
                success: false,
                ignored: true,
                message: 'Informe tokem e tag.',
                tag: tag || null,
                tokem: tokem || null
            };
        }

        const dataLeitura = parseDataLeituraBrasil(body.data_leitura);
        const rssiNum = Number(body.rssi);

        const gateway = await resolverGatewayPorTokem(tokem);
        if (!gateway) {
            return {
                success: true,
                ignored: true,
                message: `Gateway ${tokem} não cadastrado/ativo`,
                tag, tokem
            };
        }

        let item = await Item.findOne({ tag, id_conta: gateway.id_conta });
        if (!item) {
            return {
                success: true,
                ignored: true,
                message: `Item ${tag} não cadastrado na conta`,
                tag, tokem
            };
        }
        if (item.tag_secundaria) {
            tag = formatarTagLeitura(item.tag_secundaria);
            const primario = await Item.findOne({ tag, id_conta: gateway.id_conta });
            if (!primario) {
                return {
                    success: true,
                    ignored: true,
                    message: `Item primário ${tag} não cadastrado na conta`,
                    tag, tokem
                };
            }
            item = primario;
        }

        if (!simular) {
            await emitirSocketLeituraDireta(req, gateway, body, dataLeitura, item, tag);
        }

        if (!gateway.id_tracking_regra) {
            return {
                success: true,
                ignored: true,
                message: `Gateway ${gateway.tokem} sem regra de tracking vinculada`,
                tag, tokem
            };
        }

        // Regra do gateway que está lendo (desafiante ou keep-alive)
        const regraLeitura = await TrackingRegra.findOne({
            _id: gateway.id_tracking_regra,
            ativo: 1
        });
        if (!regraLeitura) {
            return {
                success: true,
                ignored: true,
                message: `Regra de tracking ${gateway.id_tracking_regra} não encontrada/ativa`,
                tag, tokem
            };
        }
        if (regraLeitura.id_conta && strId(regraLeitura.id_conta) !== strId(gateway.id_conta)) {
            return {
                success: true,
                ignored: true,
                message: `Regra de tracking ${gateway.id_tracking_regra} não pertence à conta do gateway`,
                tag, tokem
            };
        }

        const loc = resolverLocalizacao(body, gateway);

        const ultimoRegistro = await Registro.findOne({ tag, id_conta: gateway.id_conta })
            .sort({ createdAt: -1 })
            .limit(1);

        let gatewayCampeao = null;
        const stCampeaoMem = obterEstadoDisputa(gateway.id_conta, tag);
        if (stCampeaoMem.id_gateway_campeao) {
            gatewayCampeao = await Gateway.findOne({ _id: stCampeaoMem.id_gateway_campeao, ativo: 1 });
        }
        if (!gatewayCampeao && ultimoRegistro && ultimoRegistro.id_gateway) {
            gatewayCampeao = await Gateway.findOne({ _id: ultimoRegistro.id_gateway, ativo: 1 });
            if (gatewayCampeao && !stCampeaoMem.id_gateway_campeao) {
                stCampeaoMem.id_gateway_campeao = gatewayCampeao._id;
            }
        }

        const desafiante = !!(gatewayCampeao && strId(gatewayCampeao._id) !== strId(gateway._id));
        /** Disputa e filtros usam a regra vinculada ao gateway que está lendo. */
        const regraDisputa = regraLeitura;
        const precedencia = desafiante ? 'desafiante' : 'leitura';

        const janelaSeg = numParam(regraDisputa.janela_analise);
        const toleranciaSeg = numParam(regraDisputa.tolerancia_sem_leitura);
        const limiarRssiRegra = limiarRssi(regraDisputa.minima_rssi);
        const agora = dataLeitura.getTime();

        async function finalizar(resposta, extraAfericao) {
            extraAfericao = extraAfericao || {};
            const candidatoGw = extraAfericao.gatewayCandidato ||
                (extraAfericao.avaliacao && extraAfericao.avaliacao.candidato
                    ? { _id: extraAfericao.avaliacao.candidato.id_gateway, descricao: extraAfericao.avaliacao.candidato.id_gateway, melhor_rssi: extraAfericao.avaliacao.candidato.melhor_rssi, count: extraAfericao.avaliacao.candidato.count }
                    : gateway);

            const narrativa = montarNarrativaAfericao({
                tag,
                item,
                gatewayLeitura: gateway,
                gatewayCampeao: gatewayCampeao || gateway,
                gatewayCandidato: candidatoGw,
                metricas: extraAfericao.avaliacao && extraAfericao.avaliacao.metricas,
                motivo: resposta.message,
                applied: resposta.applied,
                avaliacao: extraAfericao.avaliacao
            });

            const afericao = montarPayloadAfericao({
                tag,
                item,
                gatewayLeitura: gateway,
                gatewayCampeao: gatewayCampeao,
                gatewayCandidato: candidatoGw,
                desafiante,
                regraDisputa,
                precedencia,
                avaliacao: extraAfericao.avaliacao,
                tolerancia: extraAfericao.tolerancia,
                toleranciaSeg,
                pending: resposta.pending,
                applied: resposta.applied,
                permanence: resposta.permanence,
                ignored: resposta.ignored,
                motivo: resposta.message,
                narrativa,
                dataLeitura,
                simulado: simular
            });

            resposta.afericao = afericao;
            resposta.simulado = simular;
            // Socket da leitura bruta já foi emitido após validar o item (emitirSocketLeituraDireta).
            return resposta;
        }

        if (limiarRssiRegra != null && !rssiAtendeMinimo(rssiNum, regraDisputa)) {
            return finalizar({
                success: true,
                ignored: true,
                message: `Leitura ignorada por RSSI (${rssiNum} dBm < mínimo ${limiarRssiRegra} dBm)`,
                rssi: rssiNum,
                minima_rssi_param: regraDisputa.minima_rssi,
                limiar_rssi: limiarRssiRegra,
                regra: resumoRegra(regraDisputa),
                tag, tokem
            }, {
                avaliacao: {
                    ok: false,
                    motivo: `RSSI abaixo do mínimo`,
                    metricas: {
                        janela: { inicio: dataLeitura, fim: dataLeitura, segundos: janelaSeg, leituras_brutas: 1, fechada: true },
                        minima_rssi: { limite: limiarRssiRegra, atende: false, ignorado: false, usado: rssiNum },
                        leituras_consideradas: 0
                    }
                }
            });
        }

        const leituraDoc = {
            data_leitura: dataLeitura,
            rssi: Number.isFinite(rssiNum) ? rssiNum : null,
            antena: body.antena != null ? String(body.antena) : '',
            tokem: tokem,
            id_gateway: gateway._id,
            bateria: body.bateria != null ? String(body.bateria) : '',
            temperatura: body.temperatura != null ? String(body.temperatura) : '',
            latitude: body.latitude != null ? String(body.latitude) : '',
            longitude: body.longitude != null ? String(body.longitude) : '',
            id_nivel_loc1: loc.id_nivel_loc1,
            id_nivel_loc2: loc.id_nivel_loc2,
            id_nivel_loc3: loc.id_nivel_loc3,
            id_nivel_loc4: loc.id_nivel_loc4,
            id_nivel_loc1_final: loc.id_nivel_loc1_final,
            id_nivel_loc2_final: loc.id_nivel_loc2_final,
            id_nivel_loc3_final: loc.id_nivel_loc3_final,
            id_nivel_loc4_final: loc.id_nivel_loc4_final
        };

        /**
         * Keep-alive rápido: só sem janela de disputa (janela 0).
         * Com janela > 0, TODAS as leituras passam pela guarda (como no Aferidor).
         */
        if (janelaSeg <= 0 && toleranciaSeg > 0 && ultimoRegistro) {
            const refUltima =
                ultimoRegistro.data_permanecia ||
                ultimoRegistro.updatedAt ||
                ultimoRegistro.data_registro;
            const gap = diffSegundos(refUltima, dataLeitura);
            const mesmoGateway = strId(ultimoRegistro.id_gateway) === strId(gateway._id);
            const mesmoLocal = mesmoLocalReal(
                ultimoRegistro.id_nivel_loc1, ultimoRegistro.id_nivel_loc2,
                ultimoRegistro.id_nivel_loc3, ultimoRegistro.id_nivel_loc4,
                loc.id_nivel_loc1, loc.id_nivel_loc2, loc.id_nivel_loc3, loc.id_nivel_loc4
            );

            if (mesmoGateway && mesmoLocal && gap >= 0 && gap <= toleranciaSeg) {
                let aplicado = { retorno: 'Permanência (simulado)', status: 'permanencia', registro: ultimoRegistro };
                if (!simular) {
                    aplicado = await atualizarPermanencia({
                        gateway, item, tag, loc, leitura: leituraDoc, dataLeitura, ultimoRegistro
                    });
                }
                return finalizar({
                    success: true,
                    ignored: false,
                    applied: !simular,
                    permanence: true,
                    message: simular ? 'Simulação: permanência dentro da tolerância' : aplicado.retorno,
                    status: aplicado.status,
                    gap_segundos: gap,
                    tolerancia_segundos: toleranciaSeg,
                    id_registro: aplicado.registro && aplicado.registro._id,
                    regra: resumoRegra(regraDisputa),
                    tag, tokem
                }, {
                    tolerancia: { soPermanencia: true, gap: gap },
                    gatewayCandidato: gateway
                });
            }
        }

        // Sem janela → aplica direto
        if (janelaSeg <= 0) {
            const tol = resolverToleranciaVencedor({
                ultimoRegistro,
                gatewayVencedorId: gateway._id,
                locVencedor: loc,
                dataLeitura,
                toleranciaSeg
            });

            if (tol.soPermanencia) {
                let aplicado = { retorno: 'Permanência (simulado)', status: 'permanencia', registro: ultimoRegistro };
                if (!simular) {
                    aplicado = await atualizarPermanencia({
                        gateway, item, tag, loc, leitura: leituraDoc, dataLeitura, ultimoRegistro
                    });
                }
                return finalizar({
                    success: true,
                    ignored: false,
                    applied: !simular,
                    permanence: true,
                    message: simular ? 'Simulação: permanência' : aplicado.retorno,
                    status: aplicado.status,
                    gap_segundos: tol.gap,
                    tolerancia_segundos: toleranciaSeg,
                    id_registro: aplicado.registro && aplicado.registro._id,
                    regra: resumoRegra(regraDisputa),
                    tag, tokem
                }, {
                    tolerancia: tol,
                    gatewayCandidato: gateway
                });
            }

            let aplicado = { retorno: 'Entrada (simulado)', status: 'entrada', registro: null, ciclo: true };
            if (!simular) {
                aplicado = await aplicarLocalizacao({
                    gateway, item, tag, loc, leitura: leituraDoc, dataLeitura, ultimoRegistro,
                    forcarNovoCiclo: !!tol.forcarNovoCiclo,
                    gapSegundos: tol.gap
                });
            }

            return finalizar({
                success: true,
                ignored: false,
                applied: !simular,
                ciclo: !!aplicado.ciclo,
                message: simular ? 'Simulação: aplicaria localização' : aplicado.retorno,
                status: aplicado.status,
                gap_segundos: tol.gap,
                id_registro: aplicado.registro && aplicado.registro._id,
                regra: resumoRegra(regraDisputa),
                tag, tokem
            }, {
                tolerancia: tol,
                gatewayCandidato: gateway
            });
        }

        // --- Disputa na janela (memória + fechamento no relógio, como o Aferidor) ---
        const st = obterEstadoDisputa(gateway.id_conta, tag);
        st.id_tracking_regra = regraDisputa._id;
        if (gatewayCampeao && gatewayCampeao._id && !st.id_gateway_campeao) {
            st.id_gateway_campeao = gatewayCampeao._id;
        }

        const paramsJanela = {
            regra: regraDisputa,
            item: item,
            tag: tag,
            ultimoRegistro: ultimoRegistro,
            gatewayCampeao: gatewayCampeao,
            gatewayLeitura: gateway,
            dataLeitura: dataLeitura,
            simular: simular,
            leituraDoc: leituraDoc
        };

        await rotacionarJanelasVencidas(st, paramsJanela);

        if (!st.janela_inicio) {
            abrirJanelaEstado(st, dataLeitura, janelaSeg);
        }

        st.leituras.push(leituraDoc);
        trimLeiturasMemoria(st);

        const dataMs = dataLeitura.getTime();
        let fechamento = null;
        if (st.janela_fim && dataMs >= new Date(st.janela_fim).getTime()) {
            fechamento = await fecharJanelaDisputaMemoria(st, paramsJanela);
        }

        const idCampeaoMemo = st.id_gateway_campeao || (gatewayCampeao && gatewayCampeao._id);
        const leiturasNaJanelaAtual = leiturasNaJanelaFechada(st, st.janela_inicio, st.janela_fim);
        const avaliacao = avaliarGuarda({
            leituras: leiturasNaJanelaAtual,
            janela_inicio: st.janela_inicio,
            janela_fim: st.janela_fim
        }, regraDisputa, {
            dataRef: dataLeitura,
            idGatewayCampeao: idCampeaoMemo
        });

        const janelaMetricas = avaliacao.metricas && avaliacao.metricas.janela;
        let gatewayCandidatoResumo = gateway;
        if (avaliacao.candidato && avaliacao.candidato.id_gateway) {
            if (strId(avaliacao.candidato.id_gateway) === strId(gateway._id)) {
                gatewayCandidatoResumo = Object.assign({}, resumoGateway(gateway), {
                    melhor_rssi: avaliacao.candidato.melhor_rssi,
                    count: avaliacao.candidato.count,
                    media: avaliacao.candidato.media
                });
            } else {
                const gwCand = await Gateway.findOne({ _id: avaliacao.candidato.id_gateway });
                gatewayCandidatoResumo = Object.assign({}, resumoGateway(gwCand) || { _id: avaliacao.candidato.id_gateway }, {
                    melhor_rssi: avaliacao.candidato.melhor_rssi,
                    count: avaliacao.candidato.count,
                    media: avaliacao.candidato.media
                });
            }
        }

        const memoriaResumo = {
            via: 'memoria',
            leituras_total: st.leituras.length,
            leituras_janela_atual: leiturasNaJanelaAtual.length,
            placar_pontos: avaliacao.placar_pontos || 0,
            janela_inicio: (janelaMetricas && janelaMetricas.inicio) || st.janela_inicio,
            janela_fim: (janelaMetricas && janelaMetricas.fim) || st.janela_fim,
            id_gateway_campeao: st.id_gateway_campeao || null,
            melhor_rssi: avaliacao.candidato ? avaliacao.candidato.melhor_rssi : null,
            id_gateway_vencedor_janela: avaliacao.candidato ? avaliacao.candidato.id_gateway : null
        };

        if (fechamento && fechamento.fechou) {
            const avF = fechamento.avaliacao || avaliacao;
            const gwCand = fechamento.gatewayAplicar || gatewayCandidatoResumo;

            if (fechamento.applied) {
                return finalizar({
                    success: true,
                    ignored: false,
                    applied: true,
                    permanence: !!fechamento.permanence,
                    ciclo: !!fechamento.ciclo,
                    message: (fechamento.aplicado && fechamento.aplicado.retorno) || avF.motivo,
                    status: fechamento.aplicado && fechamento.aplicado.status,
                    gap_segundos: fechamento.tolerancia && fechamento.tolerancia.gap,
                    tolerancia_segundos: toleranciaSeg,
                    id_registro: fechamento.aplicado && fechamento.aplicado.registro && fechamento.aplicado.registro._id,
                    memoria: memoriaResumo,
                    regra: resumoRegra(regraDisputa),
                    tag, tokem
                }, {
                    avaliacao: avF,
                    tolerancia: fechamento.tolerancia,
                    gatewayCandidato: gwCand
                });
            }

            return finalizar({
                success: true,
                ignored: false,
                pending: !!fechamento.pending,
                message: avF.motivo || 'Janela fechada',
                memoria: memoriaResumo,
                regra: resumoRegra(regraDisputa),
                tag, tokem
            }, {
                avaliacao: avF,
                gatewayCandidato: gatewayCandidatoResumo
            });
        }

        return finalizar({
            success: true,
            ignored: false,
            pending: true,
            message: avaliacao.motivo || 'Aguardando fechamento da janela de análise',
            memoria: memoriaResumo,
            regra: resumoRegra(regraDisputa),
            tag, tokem
        }, {
            avaliacao,
            gatewayCandidato: gatewayCandidatoResumo
        });
    }

    async function processarListaTracking(raw, req, opts) {
        opts = opts || {};
        const isArray = Array.isArray(raw);
        const lista = isArray
            ? raw
            : (raw && typeof raw === 'object' ? [raw] : []);

        if (!lista.length) {
            return {
                statusCode: 400,
                body: {
                    success: false,
                    message: 'Envie um objeto ou um array de leituras.'
                }
            };
        }

        const results = [];
        for (var i = 0; i < lista.length; i++) {
            const itemBody = lista[i];
            if (!itemBody || typeof itemBody !== 'object' || Array.isArray(itemBody)) {
                results.push({
                    success: false,
                    ignored: true,
                    message: 'Item inválido no array (esperado objeto).',
                    index: i
                });
                continue;
            }
            const r = await processarLeituraTracking(itemBody, req, opts);
            r.index = i;
            results.push(r);
        }

        if (!isArray) {
            const r = results[0];
            const statusCode = (r && r.success === false && r.message === 'Informe tokem e tag.') ? 400 : 200;
            return { statusCode, body: r };
        }

        return {
            statusCode: 200,
            body: {
                success: true,
                total: results.length,
                applied: results.filter(function (r) { return r.applied; }).length,
                pending: results.filter(function (r) { return r.pending; }).length,
                ignored: results.filter(function (r) { return r.ignored; }).length,
                simulado: !!opts.simular,
                results: results
            }
        };
    }

    app.post('/_bd/tracking', async (req, res) => {
        try {
            const out = await processarListaTracking(req.body, req, { simular: false });
            return res.status(out.statusCode).json(out.body);
        } catch (err) {
            console.error('[tracking] erro:', err);
            return res.status(500).json({
                success: false,
                message: 'Erro ao processar tracking',
                error: err && err.message
            });
        }
    });

    /**
     * Mesma lógica de decisão, sem registrar movimentação / alterar guarda.
     * Útil para o Aferidor reavaliar leituras.
     */
    app.post('/_bd/tracking/simular', async (req, res) => {
        try {
            const out = await processarListaTracking(req.body, req, { simular: true });
            return res.status(out.statusCode).json(out.body);
        } catch (err) {
            console.error('[tracking/simular] erro:', err);
            return res.status(500).json({
                success: false,
                message: 'Erro ao simular tracking',
                error: err && err.message
            });
        }
    });

    setInterval(sweepJanelasMemoria, SWEEP_JANELA_MS);

};
