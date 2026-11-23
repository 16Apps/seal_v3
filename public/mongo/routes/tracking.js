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

    /**
     * Avalia a guarda: leituras_minima, confirmacoes_consecutivas.
     * Só considera leituras que passam no limiar de RSSI (se minima_rssi > 0).
     * Qualquer parâmetro 0 é ignorado.
     */
    function avaliarGuarda(guarda, regra) {
        const leiturasBrutas = Array.isArray(guarda.leituras) ? guarda.leituras.slice() : [];
        if (!leiturasBrutas.length) {
            return { ok: false, motivo: 'Nenhuma leitura na janela' };
        }

        const leituras = leiturasBrutas.filter(function (l) {
            return rssiAtendeMinimo(l.rssi, regra);
        });

        const leiturasMin = numParam(regra.leituras_minima);
        const confMin = numParam(regra.confirmacoes_consecutivas);
        const limiar = limiarRssi(regra.minima_rssi);

        if (!leituras.length) {
            return {
                ok: false,
                motivo: limiar != null
                    ? `Nenhuma leitura com RSSI >= ${limiar} dBm`
                    : 'Nenhuma leitura válida na janela'
            };
        }

        if (leiturasMin > 0 && leituras.length < leiturasMin) {
            return { ok: false, motivo: `Aguardando leituras mínimas (${leituras.length}/${leiturasMin})` };
        }

        const grupos = {};
        leituras.forEach(function (l) {
            const k = chaveLocal(l.id_nivel_loc1, l.id_nivel_loc2, l.id_nivel_loc3, l.id_nivel_loc4);
            if (!grupos[k]) {
                grupos[k] = {
                    key: k,
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
            // -37 > -38 → melhor sinal
            if (Number.isFinite(r) && r > g.melhor_rssi) {
                g.melhor_rssi = r;
                g.amostra = l;
            }
        });

        const ordenados = Object.keys(grupos).map(function (k) { return grupos[k]; })
            .sort(function (a, b) {
                if (b.melhor_rssi !== a.melhor_rssi) return b.melhor_rssi - a.melhor_rssi;
                return b.count - a.count;
            });

        const vencedor = ordenados[0];
        if (!vencedor) {
            return { ok: false, motivo: 'Sem candidato de localização' };
        }

        let consecutivas = 0;
        for (var i = leituras.length - 1; i >= 0; i--) {
            const l = leituras[i];
            const k = chaveLocal(l.id_nivel_loc1, l.id_nivel_loc2, l.id_nivel_loc3, l.id_nivel_loc4);
            if (k === vencedor.key) consecutivas += 1;
            else break;
        }

        if (confMin > 0 && consecutivas < confMin) {
            return {
                ok: false,
                motivo: `Aguardando confirmações consecutivas (${consecutivas}/${confMin})`,
                candidato: vencedor,
                confirmacoes: consecutivas
            };
        }

        return {
            ok: true,
            motivo: 'Critérios da regra atendidos',
            candidato: vencedor,
            confirmacoes: consecutivas
        };
    }

    /**
     * tempo_minimo_local: filtra passagem rápida (só permite TROCA de local após X s no local atual).
     * 0 → ignora. Mesmo local sempre ok.
     */
    function tempoMinimoLocalOk(item, regra, locAlvo, dataLeitura) {
        const minLocal = numParam(regra.tempo_minimo_local);
        if (minLocal <= 0) return { ok: true };

        const mesmoLocal = mesmoLocalReal(
            item.id_nivel_loc1, item.id_nivel_loc2, item.id_nivel_loc3, item.id_nivel_loc4,
            locAlvo.id_nivel_loc1, locAlvo.id_nivel_loc2, locAlvo.id_nivel_loc3, locAlvo.id_nivel_loc4
        );

        if (mesmoLocal) return { ok: true, mesmoLocal: true };

        // Tempo desde o início da presença no local (data_registro), não da última ping
        const ref =
            (item.registro_atual && item.registro_atual.data_registro) ||
            (item.registro_atual && item.registro_atual.data_permanecia) ||
            item.updatedAt ||
            null;

        if (!ref) return { ok: true };

        const diffSeg = diffSegundos(ref, dataLeitura);
        if (diffSeg < minLocal) {
            return {
                ok: false,
                motivo: `Tempo mínimo no local não atingido (${diffSeg}s / ${minLocal}s)`,
                diffSeg: diffSeg
            };
        }
        return { ok: true, diffSeg: diffSeg };
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

    app.post('/_bd/tracking', async (req, res) => {
        try {
            const body = req.body || {};
            const tokem = strId(body.tokem);
            let tag = strId(body.tag);

            if (!tokem || !tag) {
                return res.status(400).json({
                    success: false,
                    message: 'Informe tokem e tag.'
                });
            }

            const dataLeitura = parseDataLeituraBrasil(body.data_leitura);
            const rssiNum = Number(body.rssi);

            const gateway = await resolverGatewayPorTokem(tokem);
            if (!gateway) {
                return res.status(200).json({
                    success: true,
                    ignored: true,
                    message: `Gateway ${tokem} não cadastrado/ativo`
                });
            }

            if (!gateway.id_tracking_regra) {
                return res.status(200).json({
                    success: true,
                    ignored: true,
                    message: `Gateway ${gateway.tokem} sem regra de tracking vinculada`
                });
            }

            const regra = await TrackingRegra.findOne({
                _id: gateway.id_tracking_regra,
                ativo: 1
            });
            if (!regra) {
                return res.status(200).json({
                    success: true,
                    ignored: true,
                    message: `Regra de tracking ${gateway.id_tracking_regra} não encontrada/ativa`
                });
            }

            const loc = resolverLocalizacao(body, gateway);

            let item = await Item.findOne({ tag, id_conta: gateway.id_conta });
            if (!item) {
                return res.status(200).json({
                    success: true,
                    ignored: true,
                    message: `Item ${tag} não cadastrado na conta`
                });
            }
            if (item.tag_secundaria) {
                tag = String(item.tag_secundaria).trim();
                const primario = await Item.findOne({ tag, id_conta: gateway.id_conta });
                if (!primario) {
                    return res.status(200).json({
                        success: true,
                        ignored: true,
                        message: `Item primário ${tag} não cadastrado na conta`
                    });
                }
                item = primario;
            }

            try {
                const io = req.app.get('io');
                if (io) {
                    const payloadSocket = Object.assign({}, body, {
                        data_leitura: dataLeitura,
                        via: 'tracking',
                        id_tracking_regra: regra._id
                    });
                    io.emit(gateway._id, payloadSocket);
                    io.emit(gateway.id_conta, payloadSocket);
                }
            } catch (e) { /* ignore */ }

            const janelaSeg = numParam(regra.janela_analise);
            const toleranciaSeg = numParam(regra.tolerancia_sem_leitura); // tempo de permanência / lock
            const limiarRssiRegra = limiarRssi(regra.minima_rssi); // 30 → -30; 0 → null (ignora)
            const agora = dataLeitura.getTime();

            // Filtro absoluto de RSSI (ex.: param 30 = -30; leitura -35 é ignorada)
            if (limiarRssiRegra != null && !rssiAtendeMinimo(rssiNum, regra)) {
                return res.status(200).json({
                    success: true,
                    ignored: true,
                    message: `Leitura ignorada por RSSI (${rssiNum} dBm < mínimo ${limiarRssiRegra} dBm)`,
                    rssi: rssiNum,
                    minima_rssi_param: regra.minima_rssi,
                    limiar_rssi: limiarRssiRegra
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

            const ultimoRegistro = await Registro.findOne({ tag, id_conta: gateway.id_conta })
                .sort({ createdAt: -1 })
                .limit(1);

            /**
             * Tolerância / tempo de permanência (se > 0):
             * - dentro do tempo + MESMO LOCAL (preenchido) → atualiza data_permanecia
             * - dentro do tempo + outro gateway/local → IGNORA (não vira permanência no local novo)
             * - após o tempo (gap) → novo ciclo (entrada), mesmo no mesmo local
             */
            let forcarNovoCiclo = false;
            let gapPermanencia = null;

            if (toleranciaSeg > 0 && ultimoRegistro) {
                const refUltima =
                    ultimoRegistro.data_permanecia ||
                    ultimoRegistro.updatedAt ||
                    ultimoRegistro.data_registro;

                const gap = diffSegundos(refUltima, dataLeitura);
                gapPermanencia = gap;
                const mesmoGateway = strId(ultimoRegistro.id_gateway) === strId(gateway._id);
                const mesmoLocal = mesmoLocalReal(
                    ultimoRegistro.id_nivel_loc1, ultimoRegistro.id_nivel_loc2,
                    ultimoRegistro.id_nivel_loc3, ultimoRegistro.id_nivel_loc4,
                    loc.id_nivel_loc1, loc.id_nivel_loc2, loc.id_nivel_loc3, loc.id_nivel_loc4
                );

                if (gap >= 0 && gap <= toleranciaSeg) {
                    // Permanência só no mesmo local real — troca A→B nunca atualiza como permanência
                    if (mesmoLocal) {
                        const aplicado = await atualizarPermanencia({
                            gateway, item, tag, loc, leitura: leituraDoc, dataLeitura, ultimoRegistro
                        });
                        return res.status(200).json({
                            success: true,
                            ignored: false,
                            applied: true,
                            permanence: true,
                            message: aplicado.retorno,
                            status: aplicado.status,
                            gap_segundos: gap,
                            tolerancia_segundos: toleranciaSeg,
                            id_registro: aplicado.registro && aplicado.registro._id,
                            regra: { _id: regra._id, descricao: regra.descricao }
                        });
                    }

                    // Outro gateway / outro local ainda dentro da tolerância → não rouba
                    return res.status(200).json({
                        success: true,
                        ignored: true,
                        message: mesmoGateway
                            ? `Leitura ignorada: local diferente dentro da tolerância (${gap}s / ${toleranciaSeg}s)`
                            : `Leitura ignorada: outro gateway dentro da tolerância (${gap}s / ${toleranciaSeg}s desde a última leitura)`,
                        gap_segundos: gap,
                        tolerancia_segundos: toleranciaSeg,
                        id_gateway_atual: ultimoRegistro.id_gateway,
                        id_gateway_candidato: gateway._id
                    });
                }

                // Gap > tolerância → próximo apply abre novo ciclo (entrada)
                if (gap > toleranciaSeg) {
                    forcarNovoCiclo = true;
                }
            }

            // Sem janela de análise → aplica direto (respeita tempo_minimo_local se > 0)
            if (janelaSeg <= 0) {
                const tMin = tempoMinimoLocalOk(item, regra, loc, dataLeitura);
                if (!tMin.ok) {
                    return res.status(200).json({
                        success: true,
                        ignored: true,
                        pending: true,
                        message: tMin.motivo
                    });
                }

                const aplicado = await aplicarLocalizacao({
                    gateway, item, tag, loc, leitura: leituraDoc, dataLeitura, ultimoRegistro,
                    forcarNovoCiclo, gapSegundos: gapPermanencia
                });

                return res.status(200).json({
                    success: true,
                    ignored: false,
                    applied: true,
                    ciclo: !!aplicado.ciclo,
                    message: aplicado.retorno,
                    status: aplicado.status,
                    gap_segundos: gapPermanencia,
                    id_registro: aplicado.registro && aplicado.registro._id,
                    regra: { _id: regra._id, descricao: regra.descricao }
                });
            }

            // Guarda na janela de análise
            await TrackingGuarda.updateMany(
                {
                    id_conta: gateway.id_conta,
                    tag: tag,
                    status: 'aberto',
                    janela_fim: { $lt: dataLeitura }
                },
                { $set: { status: 'expirado', motivo: 'Janela de análise expirada' } }
            );

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
                    id_tracking_regra: regra._id,
                    id_item: item._id,
                    tag: tag,
                    status: 'aberto',
                    janela_inicio: dataLeitura,
                    janela_fim: new Date(agora + janelaSeg * 1000),
                    leituras: [],
                    confirmacoes: 0
                });
            }

            guarda.leituras.push(leituraDoc);

            const avaliacao = avaliarGuarda(guarda, regra);
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

            if (!avaliacao.ok) {
                guarda.motivo = avaliacao.motivo;
                await guarda.save();
                return res.status(200).json({
                    success: true,
                    ignored: false,
                    pending: true,
                    message: avaliacao.motivo,
                    guarda: {
                        _id: guarda._id,
                        leituras: guarda.leituras.length,
                        confirmacoes: guarda.confirmacoes,
                        janela_inicio: guarda.janela_inicio,
                        janela_fim: guarda.janela_fim,
                        melhor_rssi: guarda.melhor_rssi
                    },
                    regra: { _id: regra._id, descricao: regra.descricao }
                });
            }

            const locVencedor = {
                id_nivel_loc1: guarda.id_nivel_loc1 || '',
                id_nivel_loc2: guarda.id_nivel_loc2 || '',
                id_nivel_loc3: guarda.id_nivel_loc3 || '',
                id_nivel_loc4: guarda.id_nivel_loc4 || '',
                id_nivel_loc1_final: guarda.id_nivel_loc1_final || '',
                id_nivel_loc2_final: guarda.id_nivel_loc2_final || '',
                id_nivel_loc3_final: guarda.id_nivel_loc3_final || '',
                id_nivel_loc4_final: guarda.id_nivel_loc4_final || ''
            };

            const tMin = tempoMinimoLocalOk(item, regra, locVencedor, dataLeitura);
            if (!tMin.ok) {
                guarda.motivo = tMin.motivo;
                await guarda.save();
                return res.status(200).json({
                    success: true,
                    ignored: false,
                    pending: true,
                    message: tMin.motivo,
                    guarda: {
                        _id: guarda._id,
                        leituras: guarda.leituras.length,
                        confirmacoes: guarda.confirmacoes
                    }
                });
            }

            let gatewayAplicar = gateway;
            if (guarda.id_gateway_vencedor && String(guarda.id_gateway_vencedor) !== String(gateway._id)) {
                const gwWin = await Gateway.findOne({ _id: guarda.id_gateway_vencedor, ativo: 1 });
                if (gwWin) gatewayAplicar = gwWin;
            }

            const leituraVencedora = (avaliacao.candidato && avaliacao.candidato.amostra) || leituraDoc;
            const aplicado = await aplicarLocalizacao({
                gateway: gatewayAplicar,
                item,
                tag,
                loc: locVencedor,
                leitura: leituraVencedora,
                dataLeitura,
                ultimoRegistro,
                forcarNovoCiclo,
                gapSegundos: gapPermanencia
            });

            guarda.status = 'aplicado';
            guarda.motivo = aplicado.retorno;
            guarda.id_registro = aplicado.registro && aplicado.registro._id;
            await guarda.save();

            return res.status(200).json({
                success: true,
                ignored: false,
                applied: true,
                ciclo: !!aplicado.ciclo,
                message: aplicado.retorno,
                status: aplicado.status,
                gap_segundos: gapPermanencia,
                id_registro: aplicado.registro && aplicado.registro._id,
                guarda: {
                    _id: guarda._id,
                    leituras: guarda.leituras.length,
                    confirmacoes: guarda.confirmacoes,
                    melhor_rssi: guarda.melhor_rssi,
                    id_gateway_vencedor: guarda.id_gateway_vencedor
                },
                regra: { _id: regra._id, descricao: regra.descricao }
            });

        } catch (err) {
            console.error('[tracking] erro:', err);
            return res.status(500).json({
                success: false,
                message: 'Erro ao processar tracking',
                error: err && err.message
            });
        }
    });

};
