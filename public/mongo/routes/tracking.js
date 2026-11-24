const shortid = require('shortid');
const moment = require('moment');

const Gateway = require('../models/gateway');
const Item = require('../models/item');
const Registro = require('../models/registro');
const TrackingRegra = require('../models/trackingregra');
const TrackingGuarda = require('../models/trackingguarda');

module.exports = (app, dbConnection) => {

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
            leituras_minima: numParam(regra.leituras_minima),
            minima_rssi: numParam(regra.minima_rssi),
            diferenca_rssi: numParam(regra.diferenca_rssi),
            confirmacoes_consecutivas: numParam(regra.confirmacoes_consecutivas),
            tolerancia_sem_leitura: numParam(regra.tolerancia_sem_leitura),
            tempo_minimo_local: numParam(regra.tempo_minimo_local),
            ativo: regra.ativo
        };
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
     * Avalia a guarda (disputa na janela):
     * - filtra pela janela efetiva (deslizante) quando janela_analise > 0
     * - filtra RSSI mínimo (se > 0; 0 = ignora)
     * - exige leituras_minima / confirmacoes_consecutivas (0 = ignora)
     * - diferenca_rssi (0 = ignora): na troca, desafiante precisa superar o campeão em dB
     * - vencedor = gateway com MAIS leituras; empate → melhor RSSI (-31 ganha de -50)
     *
     * opts: { dataRef, idGatewayCampeao, idGatewayDesafiante }
     */
    function avaliarGuarda(guarda, regra, opts) {
        opts = opts || {};
        const janelaSeg = numParam(regra && regra.janela_analise);
        const dataRef = opts.dataRef || (guarda && guarda.janela_fim) || new Date();
        const leiturasBrutas = filtrarLeiturasJanela(
            guarda && guarda.leituras,
            janelaSeg,
            dataRef
        );

        const janelaInicio = janelaSeg > 0
            ? new Date(new Date(dataRef).getTime() - janelaSeg * 1000)
            : (guarda && guarda.janela_inicio) || null;
        const janelaFim = janelaSeg > 0
            ? new Date(dataRef)
            : (guarda && guarda.janela_fim) || new Date(dataRef);

        const baseMetricas = {
            janela: {
                inicio: janelaInicio,
                fim: janelaFim,
                segundos: janelaSeg,
                leituras_brutas: Array.isArray(guarda && guarda.leituras) ? guarda.leituras.length : 0,
                leituras_na_janela: leiturasBrutas.length
            },
            leituras: { consideradas: 0, minima: numParam(regra && regra.leituras_minima) },
            minima_rssi: {
                usado: null,
                limite: limiarRssi(regra && regra.minima_rssi),
                atende: true,
                ignorado: limiarRssi(regra && regra.minima_rssi) == null
            },
            diferenca_rssi: {
                gateway_concorrente_id: null,
                rssi_candidato: null,
                rssi_concorrente: null,
                vantagem: null,
                exigida: numParam(regra && regra.diferenca_rssi),
                atende: true,
                ignorado: numParam(regra && regra.diferenca_rssi) <= 0,
                aplicavel: false
            },
            confirmacoes: {
                obtidas: 0,
                necessarias: numParam(regra && regra.confirmacoes_consecutivas),
                atende: true,
                ignorado: numParam(regra && regra.confirmacoes_consecutivas) <= 0
            }
        };

        if (!leiturasBrutas.length) {
            return {
                ok: false,
                motivo: 'Nenhuma leitura na janela',
                metricas: baseMetricas,
                grupos: [],
                candidato: null,
                confirmacoes: 0
            };
        }

        const leituras = leiturasBrutas.filter(function (l) {
            return rssiAtendeMinimo(l.rssi, regra);
        });

        const leiturasMin = numParam(regra.leituras_minima);
        const confMin = numParam(regra.confirmacoes_consecutivas);
        const limiar = limiarRssi(regra.minima_rssi);
        const diffExigida = numParam(regra.diferenca_rssi);

        baseMetricas.leituras.consideradas = leituras.length;
        if (leituras.length) {
            let melhorAbs = -Infinity;
            leituras.forEach(function (l) {
                const r = Number(l.rssi);
                if (Number.isFinite(r) && r > melhorAbs) melhorAbs = r;
            });
            baseMetricas.minima_rssi.usado = Number.isFinite(melhorAbs) ? melhorAbs : null;
        }

        if (!leituras.length) {
            baseMetricas.minima_rssi.atende = false;
            return {
                ok: false,
                motivo: limiar != null
                    ? `Nenhuma leitura com RSSI >= ${limiar} dBm`
                    : 'Nenhuma leitura válida na janela',
                metricas: baseMetricas,
                grupos: [],
                candidato: null,
                confirmacoes: 0
            };
        }

        if (leiturasMin > 0 && leituras.length < leiturasMin) {
            return {
                ok: false,
                motivo: `Aguardando leituras mínimas (${leituras.length}/${leiturasMin})`,
                metricas: baseMetricas,
                grupos: [],
                candidato: null,
                confirmacoes: 0
            };
        }

        const grupos = {};
        leituras.forEach(function (l) {
            const k = chaveGatewayLeitura(l);
            if (!grupos[k]) {
                grupos[k] = {
                    key: k,
                    id_gateway: strId(l.id_gateway),
                    count: 0,
                    melhor_rssi: -Infinity,
                    amostra: l,
                    leituras: []
                };
            }
            const g = grupos[k];
            g.count += 1;
            g.leituras.push(l);
            const r = Number(l.rssi);
            if (Number.isFinite(r) && r > g.melhor_rssi) {
                g.melhor_rssi = r;
                g.amostra = l;
            }
        });

        const ordenados = Object.keys(grupos).map(function (k) { return grupos[k]; })
            .sort(function (a, b) {
                if (b.count !== a.count) return b.count - a.count;
                return b.melhor_rssi - a.melhor_rssi;
            });

        const vencedor = ordenados[0];
        if (!vencedor) {
            return {
                ok: false,
                motivo: 'Sem candidato de gateway/localização',
                metricas: baseMetricas,
                grupos: ordenados,
                candidato: null,
                confirmacoes: 0
            };
        }

        baseMetricas.minima_rssi.usado = Number.isFinite(vencedor.melhor_rssi)
            ? vencedor.melhor_rssi
            : baseMetricas.minima_rssi.usado;

        let consecutivas = 0;
        for (var i = leituras.length - 1; i >= 0; i--) {
            const l = leituras[i];
            const k = chaveGatewayLeitura(l);
            if (k === vencedor.key) consecutivas += 1;
            else break;
        }

        baseMetricas.confirmacoes.obtidas = consecutivas;
        baseMetricas.confirmacoes.atende = !(confMin > 0 && consecutivas < confMin);

        // diferenca_rssi: só na tentativa de troca (candidato ≠ campeão atual)
        const idCampeao = strId(opts.idGatewayCampeao);
        const idVencedor = strId(vencedor.id_gateway);
        if (diffExigida > 0 && idCampeao && idVencedor && idCampeao !== idVencedor) {
            const grupoCampeao = ordenados.find(function (g) {
                return strId(g.id_gateway) === idCampeao;
            });
            const rssiCand = Number.isFinite(vencedor.melhor_rssi) ? vencedor.melhor_rssi : null;
            const rssiCamp = grupoCampeao && Number.isFinite(grupoCampeao.melhor_rssi)
                ? grupoCampeao.melhor_rssi
                : null;
            const vantagem = (rssiCand != null && rssiCamp != null) ? (rssiCand - rssiCamp) : null;

            baseMetricas.diferenca_rssi.aplicavel = true;
            baseMetricas.diferenca_rssi.gateway_concorrente_id = idCampeao;
            baseMetricas.diferenca_rssi.rssi_candidato = rssiCand;
            baseMetricas.diferenca_rssi.rssi_concorrente = rssiCamp;
            baseMetricas.diferenca_rssi.vantagem = vantagem;
            baseMetricas.diferenca_rssi.ignorado = false;

            if (vantagem == null || vantagem < diffExigida) {
                baseMetricas.diferenca_rssi.atende = false;
                return {
                    ok: false,
                    motivo: vantagem == null
                        ? `Aguardando leitura do gateway atual para comparar diferença de RSSI (${diffExigida} dB)`
                        : `Diferença de RSSI insuficiente (${vantagem} dB / ${diffExigida} dB exigidos)`,
                    metricas: baseMetricas,
                    grupos: ordenados,
                    candidato: vencedor,
                    confirmacoes: consecutivas
                };
            }
            baseMetricas.diferenca_rssi.atende = true;
        }

        if (confMin > 0 && consecutivas < confMin) {
            return {
                ok: false,
                motivo: `Aguardando confirmações consecutivas do gateway vencedor (${consecutivas}/${confMin})`,
                metricas: baseMetricas,
                grupos: ordenados,
                candidato: vencedor,
                confirmacoes: consecutivas
            };
        }

        return {
            ok: true,
            motivo: 'Disputa resolvida na janela',
            metricas: baseMetricas,
            grupos: ordenados,
            candidato: vencedor,
            confirmacoes: consecutivas
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
        const conf = m.confirmacoes || {};
        const diff = m.diferenca_rssi || {};
        const partes = [];

        if (mesmo) {
            partes.push(`${itemNome} permanece em ${nome(gwCamp)}.`);
        } else {
            partes.push(`${itemNome} continua em ${nome(gwCamp)}.`);
            if (diff.rssi_candidato != null && diff.rssi_concorrente != null) {
                partes.push(
                    `O ${nome(gwCand)} está lendo melhor, com ${diff.rssi_candidato} dBm contra ${diff.rssi_concorrente} dBm do ${nome(gwCamp)}.`
                );
                if (!diff.ignorado && diff.exigida > 0) {
                    const vantagem = diff.vantagem != null ? diff.vantagem : (diff.rssi_candidato - diff.rssi_concorrente);
                    if (diff.atende) {
                        partes.push(
                            `A vantagem de ${vantagem} dB atende aos ${diff.exigida} dB exigidos pela regra do ${nome(gwLeitura || gwCand)}.`
                        );
                    } else {
                        partes.push(
                            `A vantagem de ${vantagem} dB ainda não atende aos ${diff.exigida} dB exigidos pela regra do ${nome(gwLeitura || gwCand)}.`
                        );
                    }
                }
            } else if (Number.isFinite(gwCand.melhor_rssi)) {
                partes.push(`O ${nome(gwCand)} lidera a janela com ${gwCand.melhor_rssi} dBm.`);
            }
        }

        if (!conf.ignorado && conf.necessarias > 0) {
            partes.push(
                `O ${nome(gwCand)} já obteve ${conf.obtidas} das ${conf.necessarias} confirmações necessárias para assumir.`
            );
        }

        if (ctx.tempoMinimo && ctx.tempoMinimo.aplicavel && !ctx.tempoMinimo.ok) {
            const falta = Math.max(0, (ctx.tempoMinimo.exigido || 0) - (ctx.tempoMinimo.permanencia || 0));
            partes.push(
                `Ainda faltam ${falta}s de permanência mínima no local atual (${ctx.tempoMinimo.permanencia || 0}s / ${ctx.tempoMinimo.exigido || 0}s).`
            );
        }

        if (ctx.applied && !mesmo) {
            partes.push(`${itemNome} foi assumido por ${nome(gwCand)}.`);
        }

        return partes.join(' ');
    }

    function montarPayloadAfericao(ctx) {
        const m = (ctx.avaliacao && ctx.avaliacao.metricas) || {};
        const tol = ctx.tolerancia || {};
        const tMin = ctx.tempoMinimo || { ok: true };
        const regraDisp = ctx.regraDisputa;
        const regraLocal = ctx.regraLocalAtual;

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
                        count: ctx.avaliacao.candidato.count
                    }
                    : null
            ),
            desafiante: !!ctx.desafiante,
            regra: resumoRegra(regraDisp),
            regra_local_atual: resumoRegra(regraLocal),
            precedencia: ctx.precedencia || 'leitura',
            janela: m.janela || null,
            leituras: m.leituras || null,
            minima_rssi: m.minima_rssi || null,
            diferenca_rssi: m.diferenca_rssi || null,
            confirmacoes: m.confirmacoes || null,
            tolerancia_sem_leitura: {
                desde_ultima: tol.gap != null ? tol.gap : null,
                configurada: ctx.toleranciaSeg != null ? ctx.toleranciaSeg : numParam(regraDisp && regraDisp.tolerancia_sem_leitura),
                so_permanencia: !!tol.soPermanencia,
                troca_local: !!tol.trocaLocal,
                ignorado: !(ctx.toleranciaSeg > 0)
            },
            tempo_minimo_local: {
                permanencia: tMin.diffSeg != null ? tMin.diffSeg : null,
                exigido: numParam((regraLocal || regraDisp) && (regraLocal || regraDisp).tempo_minimo_local),
                falta: (!tMin.ok && tMin.diffSeg != null)
                    ? Math.max(0, numParam((regraLocal || regraDisp).tempo_minimo_local) - tMin.diffSeg)
                    : 0,
                atende: tMin.ok !== false,
                aplicavel: !!tMin.aplicavel || (tMin.ok === false),
                motivo: tMin.motivo || null,
                origem_regra: regraLocal && regraDisp && strId(regraLocal._id) !== strId(regraDisp._id)
                    ? 'local_atual'
                    : 'disputa'
            },
            disputa: !!(ctx.avaliacao && ctx.avaliacao.grupos && ctx.avaliacao.grupos.length > 1),
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

    /**
     * tempo_minimo_local: filtra passagem rápida (só permite TROCA de local após X s no local atual).
     * 0 → ignora. Mesmo local sempre ok.
     */
    function tempoMinimoLocalOk(item, regra, locAlvo, dataLeitura) {
        const minLocal = numParam(regra && regra.tempo_minimo_local);
        if (minLocal <= 0) return { ok: true, aplicavel: false, ignorado: true };

        const mesmoLocal = mesmoLocalReal(
            item.id_nivel_loc1, item.id_nivel_loc2, item.id_nivel_loc3, item.id_nivel_loc4,
            locAlvo.id_nivel_loc1, locAlvo.id_nivel_loc2, locAlvo.id_nivel_loc3, locAlvo.id_nivel_loc4
        );

        if (mesmoLocal) return { ok: true, mesmoLocal: true, aplicavel: false };

        const ref =
            (item.registro_atual && item.registro_atual.data_registro) ||
            (item.registro_atual && item.registro_atual.data_permanecia) ||
            item.updatedAt ||
            null;

        if (!ref) return { ok: true, aplicavel: true, exigido: minLocal };

        const diffSeg = diffSegundos(ref, dataLeitura);
        if (diffSeg < minLocal) {
            return {
                ok: false,
                aplicavel: true,
                motivo: `Tempo mínimo no local não atingido (${diffSeg}s / ${minLocal}s)`,
                diffSeg: diffSeg,
                exigido: minLocal
            };
        }
        return { ok: true, aplicavel: true, diffSeg: diffSeg, exigido: minLocal };
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
        let tag = strId(body.tag);

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
            tag = String(item.tag_secundaria).trim();
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

        const ultimoRegistro = await Registro.findOne({ tag, id_conta: gateway.id_conta })
            .sort({ createdAt: -1 })
            .limit(1);

        let gatewayCampeao = null;
        let regraCampeao = null;
        if (ultimoRegistro && ultimoRegistro.id_gateway) {
            gatewayCampeao = await Gateway.findOne({ _id: ultimoRegistro.id_gateway, ativo: 1 });
            if (gatewayCampeao && gatewayCampeao.id_tracking_regra) {
                regraCampeao = await TrackingRegra.findOne({
                    _id: gatewayCampeao.id_tracking_regra,
                    ativo: 1
                });
                if (regraCampeao && regraCampeao.id_conta &&
                    strId(regraCampeao.id_conta) !== strId(gateway.id_conta)) {
                    regraCampeao = null;
                }
            }
        }

        const desafiante = !!(gatewayCampeao && strId(gatewayCampeao._id) !== strId(gateway._id));
        /**
         * Precedência:
         * - disputa/troca → regra do desafiante (janela, leituras, rssi, diferença, confirmações)
         * - tempo_minimo_local da troca → regra do local atual (campeão), se existir; senão do desafiante
         * - keep-alive no mesmo GW → regra do próprio gateway
         */
        const regraDisputa = regraLeitura;
        const regraLocalAtual = (desafiante && regraCampeao) ? regraCampeao : regraLeitura;
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
                tempoMinimo: extraAfericao.tempoMinimo,
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
                regraLocalAtual,
                precedencia,
                avaliacao: extraAfericao.avaliacao,
                tolerancia: extraAfericao.tolerancia,
                toleranciaSeg,
                tempoMinimo: extraAfericao.tempoMinimo,
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
            if (!simular) {
                await emitirSocketAfericao(req, gateway, body, afericao, dataLeitura);
            }
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
                        janela: { inicio: dataLeitura, fim: dataLeitura, segundos: janelaSeg, leituras_brutas: 1, leituras_na_janela: 1 },
                        leituras: { consideradas: 0, minima: numParam(regraDisputa.leituras_minima) },
                        minima_rssi: { usado: rssiNum, limite: limiarRssiRegra, atende: false, ignorado: false },
                        diferenca_rssi: { exigida: numParam(regraDisputa.diferenca_rssi), atende: true, ignorado: numParam(regraDisputa.diferenca_rssi) <= 0, aplicavel: false },
                        confirmacoes: { obtidas: 0, necessarias: numParam(regraDisputa.confirmacoes_consecutivas), atende: true, ignorado: numParam(regraDisputa.confirmacoes_consecutivas) <= 0 }
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
         * Keep-alive rápido: SOMENTE mesmo gateway + mesmo local dentro da tolerância
         * → atualiza permanência sem abrir disputa.
         */
        if (toleranciaSeg > 0 && ultimoRegistro) {
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

            const tMin = tempoMinimoLocalOk(item, regraLocalAtual, loc, dataLeitura);
            if (!tMin.ok) {
                return finalizar({
                    success: true,
                    ignored: true,
                    pending: true,
                    message: tMin.motivo,
                    regra: resumoRegra(regraDisputa),
                    tag, tokem
                }, {
                    tolerancia: tol,
                    tempoMinimo: tMin,
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
                tempoMinimo: tMin,
                gatewayCandidato: gateway
            });
        }

        // --- Disputa na janela ---
        if (!simular) {
            await TrackingGuarda.updateMany(
                {
                    id_conta: gateway.id_conta,
                    tag: tag,
                    status: 'aberto',
                    janela_fim: { $lt: dataLeitura }
                },
                { $set: { status: 'expirado', motivo: 'Janela de análise expirada' } }
            );
        }

        let guarda = await TrackingGuarda.findOne({
            id_conta: gateway.id_conta,
            tag: tag,
            status: 'aberto',
            janela_fim: { $gte: dataLeitura }
        }).sort({ createdAt: -1 });

        if (!guarda) {
            guarda = new TrackingGuarda({
                _id: shortid.generate(),
                id_conta: gateway.id_conta,
                id_tracking_regra: regraDisputa._id,
                id_item: item._id,
                tag: tag,
                status: 'aberto',
                janela_inicio: dataLeitura,
                janela_fim: new Date(agora + janelaSeg * 1000),
                leituras: [],
                confirmacoes: 0
            });
        } else if (desafiante) {
            // Troca: reancora a guarda na regra/janela do desafiante
            guarda.id_tracking_regra = regraDisputa._id;
            const fimDesafiante = new Date(agora + janelaSeg * 1000);
            if (!guarda.janela_fim || new Date(guarda.janela_fim).getTime() < fimDesafiante.getTime()) {
                guarda.janela_fim = fimDesafiante;
            }
            const inicioDesejado = new Date(agora - janelaSeg * 1000);
            if (!guarda.janela_inicio || new Date(guarda.janela_inicio).getTime() > inicioDesejado.getTime()) {
                guarda.janela_inicio = inicioDesejado;
            }
        }

        // Cópia das leituras para simulação não poluir a guarda persistida
        const leiturasBase = Array.isArray(guarda.leituras) ? guarda.leituras.slice() : [];
        leiturasBase.push(leituraDoc);
        const guardaEval = {
            leituras: leiturasBase,
            janela_inicio: guarda.janela_inicio,
            janela_fim: guarda.janela_fim
        };

        if (!simular) {
            guarda.leituras.push(leituraDoc);
        }

        const avaliacao = avaliarGuarda(guardaEval, regraDisputa, {
            dataRef: dataLeitura,
            idGatewayCampeao: gatewayCampeao && gatewayCampeao._id,
            idGatewayDesafiante: desafiante ? gateway._id : null
        });

        if (!simular) {
            guarda.confirmacoes = avaliacao.confirmacoes || 0;
            if (avaliacao.candidato && avaliacao.candidato.amostra) {
                const a = avaliacao.candidato.amostra;
                guarda.melhor_rssi = avaliacao.candidato.melhor_rssi;
                guarda.id_gateway_vencedor = a.id_gateway;
                guarda.id_nivel_loc1 = a.id_nivel_loc1;
                guarda.id_nivel_loc2 = a.id_nivel_loc2;
                guarda.id_nivel_loc3 = a.id_nivel_loc3;
                guarda.id_nivel_loc4 = a.id_nivel_loc4;
                guarda.id_nivel_loc1_final = a.id_nivel_loc1_final;
                guarda.id_nivel_loc2_final = a.id_nivel_loc2_final;
                guarda.id_nivel_loc3_final = a.id_nivel_loc3_final;
                guarda.id_nivel_loc4_final = a.id_nivel_loc4_final;
            }
        }

        const janelaMetricas = avaliacao.metricas && avaliacao.metricas.janela;
        let gatewayCandidatoResumo = gateway;
        if (avaliacao.candidato && avaliacao.candidato.id_gateway) {
            if (strId(avaliacao.candidato.id_gateway) === strId(gateway._id)) {
                gatewayCandidatoResumo = Object.assign({}, resumoGateway(gateway), {
                    melhor_rssi: avaliacao.candidato.melhor_rssi,
                    count: avaliacao.candidato.count
                });
            } else {
                const gwCand = await Gateway.findOne({ _id: avaliacao.candidato.id_gateway });
                gatewayCandidatoResumo = Object.assign({}, resumoGateway(gwCand) || { _id: avaliacao.candidato.id_gateway }, {
                    melhor_rssi: avaliacao.candidato.melhor_rssi,
                    count: avaliacao.candidato.count
                });
            }
        }

        if (!avaliacao.ok) {
            if (!simular) {
                guarda.motivo = avaliacao.motivo;
                await guarda.save();
            }
            return finalizar({
                success: true,
                ignored: false,
                pending: true,
                message: avaliacao.motivo,
                guarda: {
                    _id: guarda._id,
                    leituras: leiturasBase.length,
                    confirmacoes: avaliacao.confirmacoes || 0,
                    janela_inicio: (janelaMetricas && janelaMetricas.inicio) || guarda.janela_inicio,
                    janela_fim: (janelaMetricas && janelaMetricas.fim) || guarda.janela_fim,
                    melhor_rssi: avaliacao.candidato ? avaliacao.candidato.melhor_rssi : null,
                    id_gateway_vencedor: avaliacao.candidato ? avaliacao.candidato.id_gateway : null,
                    leituras_vencedor: avaliacao.candidato ? avaliacao.candidato.count : 0
                },
                regra: resumoRegra(regraDisputa),
                tag, tokem
            }, {
                avaliacao,
                gatewayCandidato: gatewayCandidatoResumo
            });
        }

        const amostraWin = avaliacao.candidato && avaliacao.candidato.amostra;
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

        let gatewayAplicar = gateway;
        const idWin = avaliacao.candidato && avaliacao.candidato.id_gateway;
        if (idWin && strId(idWin) !== strId(gateway._id)) {
            const gwWin = await Gateway.findOne({ _id: idWin, ativo: 1 });
            if (gwWin) gatewayAplicar = gwWin;
        }

        const tol = resolverToleranciaVencedor({
            ultimoRegistro,
            gatewayVencedorId: gatewayAplicar._id,
            locVencedor,
            dataLeitura,
            toleranciaSeg
        });

        if (tol.soPermanencia) {
            let aplicado = { retorno: 'Permanência (simulado)', status: 'permanencia', registro: ultimoRegistro };
            if (!simular) {
                aplicado = await atualizarPermanencia({
                    gateway: gatewayAplicar,
                    item,
                    tag,
                    loc: locVencedor,
                    leitura: amostraWin || leituraDoc,
                    dataLeitura,
                    ultimoRegistro
                });
                guarda.status = 'aplicado';
                guarda.motivo = aplicado.retorno;
                guarda.id_registro = aplicado.registro && aplicado.registro._id;
                await guarda.save();
            }
            return finalizar({
                success: true,
                ignored: false,
                applied: !simular,
                permanence: true,
                message: simular ? 'Simulação: permanência após disputa' : aplicado.retorno,
                status: aplicado.status,
                gap_segundos: tol.gap,
                tolerancia_segundos: toleranciaSeg,
                id_registro: aplicado.registro && aplicado.registro._id,
                guarda: {
                    _id: guarda._id,
                    leituras: leiturasBase.length,
                    confirmacoes: avaliacao.confirmacoes || 0,
                    melhor_rssi: avaliacao.candidato ? avaliacao.candidato.melhor_rssi : null,
                    id_gateway_vencedor: idWin || null
                },
                regra: resumoRegra(regraDisputa),
                tag, tokem
            }, {
                avaliacao,
                tolerancia: tol,
                gatewayCandidato: gatewayAplicar
            });
        }

        // Permanência mínima: regra do local atual (campeão) na troca
        const tMin = tempoMinimoLocalOk(item, regraLocalAtual, locVencedor, dataLeitura);
        if (!tMin.ok) {
            if (!simular) {
                guarda.motivo = tMin.motivo;
                await guarda.save();
            }
            return finalizar({
                success: true,
                ignored: false,
                pending: true,
                message: tMin.motivo,
                guarda: {
                    _id: guarda._id,
                    leituras: leiturasBase.length,
                    confirmacoes: avaliacao.confirmacoes || 0
                },
                regra: resumoRegra(regraDisputa),
                tag, tokem
            }, {
                avaliacao,
                tolerancia: tol,
                tempoMinimo: tMin,
                gatewayCandidato: gatewayAplicar
            });
        }

        let aplicado = { retorno: 'Entrada (simulado)', status: 'entrada', registro: null, ciclo: true };
        if (!simular) {
            aplicado = await aplicarLocalizacao({
                gateway: gatewayAplicar,
                item,
                tag,
                loc: locVencedor,
                leitura: amostraWin || leituraDoc,
                dataLeitura,
                ultimoRegistro,
                forcarNovoCiclo: !!tol.forcarNovoCiclo,
                gapSegundos: tol.gap
            });
            guarda.status = 'aplicado';
            guarda.motivo = aplicado.retorno;
            guarda.id_registro = aplicado.registro && aplicado.registro._id;
            await guarda.save();
        }

        return finalizar({
            success: true,
            ignored: false,
            applied: !simular,
            ciclo: !!aplicado.ciclo,
            message: simular ? 'Simulação: aplicaria disputa' : aplicado.retorno,
            status: aplicado.status,
            gap_segundos: tol.gap,
            id_registro: aplicado.registro && aplicado.registro._id,
            guarda: {
                _id: guarda._id,
                leituras: leiturasBase.length,
                confirmacoes: avaliacao.confirmacoes || 0,
                melhor_rssi: avaliacao.candidato ? avaliacao.candidato.melhor_rssi : null,
                id_gateway_vencedor: idWin || null,
                leituras_vencedor: avaliacao.candidato ? avaliacao.candidato.count : 0
            },
            regra: resumoRegra(regraDisputa),
            tag, tokem
        }, {
            avaliacao,
            tolerancia: tol,
            tempoMinimo: tMin,
            gatewayCandidato: gatewayAplicar
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

};
