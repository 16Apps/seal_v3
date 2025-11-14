const shortid = require('shortid');
const fs = require('fs');
const axios = require('axios'); // se for enviar via HTTP

const Gateway = require("../models/gateway");
const Item = require("../models/item");
const Categoria = require("../models/categoria");
const Localizacao = require("../models/localizacao");
const Registro = require("../models/registro");
const Alerta = require("../models/alerta");
const Posicao = require("../models/posicao");

const Interacao = require("../models/interacao");
const Colaborador = require("../models/colaborador");
const RegistroColaborador = require("../models/registro_colaborador");

const ultimasLeituras = new Map(); // { tag => timestamp }
const { setTimeout: sleep } = require('timers/promises');
const moment = require('moment')
const cron = require('node-cron');

module.exports = (app, dbConnection) => {

    console.log("api")

    app.post('/_bd/registro', async (req, res) => {

        let {
            tokem,
            id_colaborador,
            tag,
            data_leitura,
            antena,
            rssi,
            bateria,
            temperatura,
            latitude,
            longitude,
            id_nivel_loc1,
            id_nivel_loc2,
            id_nivel_loc3,
            id_nivel_loc4
        } = req.body;

        // Verificar Localização
        let retorno;
        let status;


        // Inibir leituras repetidas em menos de 5 segundos
        const agora = Date.now();
        if (ultimasLeituras.has(tag)) {
            const ultimo = ultimasLeituras.get(tag);
            const diffSegundos = (agora - ultimo) / 1000;
            if (diffSegundos < 5) {
                return res.status(200).json({
                    success: true,
                    ignored: true,
                    message: `Leitura ignorada: última foi há ${diffSegundos.toFixed(2)}s (menos de 5s)`
                });
            };
        };

        ultimasLeituras.set(tag, agora);
        // final validação

        // Cadastro do gateway
        const gateway = await Gateway.findOne({ tokem, ativo: 1 });
        if (!gateway) return res.status(200).json({
            success: true,
            ignored: true,
            message: `Gateway ${tokem} não cadastrado na conta`
        });

        // Cadastro do item
        let item = await Item.findOne({ tag, id_conta: gateway.id_conta });
        if (!item) return res.status(200).json({
            success: true,
            ignored: true,
            message: `Item ${tag} não cadastrado na conta`
        });

        // Ultimo registro do item
        let ultimoRegistro = await Registro.findOne({ tag, id_conta: gateway.id_conta }).sort({ createdAt: -1 }).limit(1);;

        let _addReg = async () => {

            console.log("novo");

            const novoRegistro = new Registro({
                _id: shortid.generate(),
                id_conta: gateway.id_conta,
                id_colaborador,
                id_gateway: gateway._id,
                latitude,
                longitude,

                data_registro: data_leitura,
                data_permanecia: data_leitura,
                status: status,

                id_item: item != null ? item._id : null,
                id_categoria: item != null ? item.id_categoria : null,
                tag,
                rssi,
                antena,
                bateria,
                temperatura,

                id_nivel_loc1: id_nivel_loc1,
                id_nivel_loc2: id_nivel_loc2,
                id_nivel_loc3: id_nivel_loc3,
                id_nivel_loc4: id_nivel_loc4,

                id_nivel_loc1_final: null,
                id_nivel_loc2_final: null,
                id_nivel_loc3_final: null,
                id_nivel_loc4_final: null,

                id_movimentacao: null,
                id_movimentacao_processo: null,

                alerta: null,
                alerta_data: null,
                alerta_data_finalizada: null,

            });
            await novoRegistro.save();
            await _updItem(novoRegistro)

            console.log("..................." + '_addReg')
            _checkAlerta(novoRegistro)
            _checkInteracao('entrada', novoRegistro)
        };

        let _updItem = async (_reg) => {

            item.status = 'ativo'
            item.id_nivel_loc1 = id_nivel_loc1;
            item.id_nivel_loc2 = id_nivel_loc2;
            item.id_nivel_loc3 = id_nivel_loc3;
            item.id_nivel_loc4 = id_nivel_loc4;
            item.registro_atual = _reg
            await item.save();

        };

        if (id_nivel_loc1) {
            status = 'entrada';

            if (id_nivel_loc4 && item.id_nivel_loc4 != id_nivel_loc4) {
                retorno = 'Movimentado Nível 4 de ' + item.id_nivel_loc4 + ' para ' + id_nivel_loc4

            } else if (id_nivel_loc3 && item.id_nivel_loc3 != id_nivel_loc3) {
                retorno = 'Movimentado Nível 3 de ' + item.id_nivel_loc3 + ' para ' + id_nivel_loc3;

            } else if (id_nivel_loc2 && item.id_nivel_loc2 != id_nivel_loc2) {
                retorno = 'Movimentado Nível 2 de ' + item.id_nivel_loc1 + ' para ' + id_nivel_loc2;

            } else if (id_nivel_loc1 && item.id_nivel_loc1 != id_nivel_loc1) {
                retorno = 'Movimentado Nível 1 de ' + item.id_nivel_loc1 + ' para ' + id_nivel_loc1;

            } else {
                retorno = 'Sem movimentação, mesma localização';
                status = 'permanencia'
            };
        } else {

            if (item.id_nivel_loc1) {
                retorno = 'Localização não informada, em trânsito.';
                status = 'em_transito';
            } else {
                retorno = 'O item já encontrava-se em trânsito';
                status = 'permanencia_em_transito';
            };
        };

        if (ultimoRegistro) {

            if (ultimoRegistro?.data_permanecia && ultimoRegistro?.data_registro) {
                const diffMs = new Date(ultimoRegistro.data_permanecia) - new Date(ultimoRegistro.data_registro);
                const diffSegundos = Math.floor(diffMs / 1000);
                console.log(`Diferença: ${diffSegundos} segundos ${gateway.intervalo_ausencia}`);

                // Ultrapassou o limte de perca de leitura
                if (diffSegundos > gateway.intervalo_ausencia) {

                    _addReg();

                } else {

                    ultimoRegistro.rssi = rssi;
                    ultimoRegistro.bateria = bateria;
                    ultimoRegistro.temperatura = temperatura;
                    ultimoRegistro.data_permanecia = data_leitura;

                    if (status == 'em_transito' || status == 'entrada') {

                        ultimoRegistro.id_nivel_loc1_final = id_nivel_loc1;
                        ultimoRegistro.id_nivel_loc2_final = id_nivel_loc2;
                        ultimoRegistro.id_nivel_loc3_final = id_nivel_loc3;
                        ultimoRegistro.id_nivel_loc4_final = id_nivel_loc4;

                        _addReg();

                    };

                    // Atualizar Registro
                    await ultimoRegistro.save();

                    await sleep(1600);
                    await _updItem(ultimoRegistro)

                    console.log("..................." + '_updReg')
                    _checkAlerta(ultimoRegistro)


                };
            };

        } else {

            _addReg();

        }

        // Final
        return res.status(200).json({
            success: true,
            ignored: false,
            message: `Item ${tag} registrado`,
            retorno,
            status
        })
    });


    async function _checkInteracao(movimento, _reg) {

        if(!_reg){
            return
        }
        
        console.log("_checkInteracao: " + movimento + ' ' + _reg.id_nivel_loc1)

        let interacao
        if (_reg.id_nivel_loc4) {
            interacao = await Interacao.findOne({ id_nivel_loc4: _reg.id_nivel_loc4 });
        } else if (_reg.id_nivel_loc3) {
            interacao = await Interacao.findOne({ id_nivel_loc3: _reg.id_nivel_loc3, id_nivel_loc4: null });
        } else if (_reg.id_nivel_loc2) {
            interacao = await Interacao.findOne({ id_nivel_loc2: _reg.id_nivel_loc2, id_nivel_loc3: null });
        } else if (_reg.id_nivel_loc1) {
            interacao = await Interacao.findOne({ id_nivel_loc1: _reg.id_nivel_loc1, id_nivel_loc2: null });
        };


        //checa se trata-se de entrada ou saida indevida ou nao 
        let posicao
        const inicio = new Date();
        inicio.setHours(0, 0, 0, 0);

        const fim = new Date();
        fim.setHours(23, 59, 59, 999);

        let filtro = {
            itens: {
                $elemMatch: {
                    id_item: _reg.id_item,
                    status: "pendente"
                }
            }
        };

        if (movimento == 'entrada') {

            filtro.previsao_chegada_data = { $gte: inicio, $lte: fim }

            if (_reg.id_nivel_loc4) {
                filtro.id_nivel_loc3_destino = _reg.id_nivel_loc3;
                filtro.id_nivel_loc4_destino = null;
            }
            // Nível 3 → 2
            else if (_reg.id_nivel_loc3) {
                filtro.id_nivel_loc3_destino = _reg.id_nivel_loc3;
                filtro.id_nivel_loc4_destino = null;
            }
            // Nível 2 → 1
            else if (_reg.id_nivel_loc2) {
                filtro.id_nivel_loc2_destino = _reg.id_nivel_loc2;
                filtro.id_nivel_loc3_destino = null;
            }
            // Nível 1 → 0
            else if (_reg.id_nivel_loc1) {
                filtro.id_nivel_loc1_destino = _reg.id_nivel_loc1;
                filtro.id_nivel_loc2_destino = null;
            }

        } else if (movimento == 'saida') {

            filtro.partida_data = { $gte: inicio, $lte: fim }

            if (_reg.id_nivel_loc4) {
                filtro.id_nivel_loc3 = _reg.id_nivel_loc3;
                filtro.id_nivel_loc4 = null;
            }
            // Nível 3 → 2
            else if (_reg.id_nivel_loc3) {
                filtro.id_nivel_loc3 = _reg.id_nivel_loc3;
                filtro.id_nivel_loc4 = null;
            }
            // Nível 2 → 1
            else if (_reg.id_nivel_loc2) {
                filtro.id_nivel_loc2 = _reg.id_nivel_loc2;
                filtro.id_nivel_loc3 = null;
            }
            // Nível 1 → 0
            else if (_reg.id_nivel_loc1) {
                filtro.id_nivel_loc1 = _reg.id_nivel_loc1;
                filtro.id_nivel_loc2 = null;
            }

        }

        posicao = await Posicao.findOne(filtro);
        if (!posicao) {
            movimento == movimento + '_i'
        }

        console.log('_regPosicao:' + posicao)

        // 🔹 URL correta para OBJECTS
        const urlSepioo = 'http://localhost:3001/sepioo';

        if (interacao && Array.isArray(interacao.acoes)) {

            for (let i = 0; i < interacao.acoes.length; i++) {

                console.log('......>>' + movimento + ' ' + interacao.acoes[i].movimento)

                if (interacao.acoes[i].movimento == movimento && (interacao.acoes[i].acao == 'pdi_led_vr' || interacao.acoes[i].acao == 'pdi_led_vm')) {

                    concluirItemPosicao(posicao, posicao.itens[0].id_item)

                    // 🔹 payload padrão da Sepioo
                    const payload = {
                        color: interacao.acoes[i].acao == 'pdi_led_vr' ? 'RED' : 'GREEN',
                        pattern: 'FLASH_1_SECOND',
                        duration: interacao.acoes[i].comando ?? 5,
                        durationInMinutes: 0,
                        objectIds: [interacao.acoes[i].serial]
                    };

                    console.log(payload)

                    const response = await axios.post(urlSepioo + '/flash', payload, {
                        headers: {
                            'Content-Type': 'application/json',
                            'Cache-Control': 'no-cache'
                        }
                    });

                    console.log(response.data)

                }


                // if (interacao.acoes[i].movimento == 'entrada' || interacao.acoes[i].movimento == 'entrada_i') {
                // } else if (interacao.acoes[i].movimento == 'saida' || interacao.acoes[i].movimento == 'saida_i') {
                //}
            }
        }


    }

    async function concluirItemPosicao(posicao, id_item) {
        const agora = moment().toDate();

        // 1️⃣ localiza item dentro do array
        const item = posicao.itens.find(i => i.id_item === id_item);
        if (!item) return null;

        // 2️⃣ atualiza os campos do item
        item.status = "concluido";
        item.status_data = agora;

        // 3️⃣ recalcular status geral
        const total = posicao.itens.length;
        const concluidos = posicao.itens.filter(i => i.status === "concluido").length;
        const pendentes = posicao.itens.filter(i => i.status === "pendente").length;

        if (concluidos === total) {
            posicao.status = "concluido";     // ou "finalizada", conforme sua regra
        } else if (concluidos > 0) {
            posicao.status = "parcial";
        } else {
            posicao.status = "aberta";
        }

        posicao.status_data = agora;

        // 4️⃣ salva o documento
        await posicao.save();

        return posicao;
    }


    async function _checkAlerta(_reg) {

        try {

            console.log("CHECAR ITEM NAO MAIS LIDO TALVEZ ALGO AQUI, DE  ITENS COM A ULTIMA LEITURA ANTIGA")

            _reg = await Registro.findOne({ _id: _reg._id });


            let alerta
            if (_reg.id_nivel_loc4) {
                alerta = await Alerta.findOne({ id_nivel_loc4: _reg.id_nivel_loc4 });
            } else if (_reg.id_nivel_loc3) {
                alerta = await Alerta.findOne({ id_nivel_loc3: _reg.id_nivel_loc3, id_nivel_loc4: null });
            } else if (_reg.id_nivel_loc2) {
                alerta = await Alerta.findOne({ id_nivel_loc2: _reg.id_nivel_loc2, id_nivel_loc3: null });
            } else if (_reg.id_nivel_loc1) {
                alerta = await Alerta.findOne({ id_nivel_loc1: _reg.id_nivel_loc1, id_nivel_loc2: null });
            };

            if (alerta && Array.isArray(alerta.acoes)) {

                for (let i = 0; i < alerta.acoes.length; i++) {

                    if (alerta.acoes[i].acao == 'tol_max' || alerta.acoes[i].acao == 'tol_min' || alerta.acoes[i].acao == 'itens_fixo') {

                        let itensLocal
                        if (_reg.id_nivel_loc4) {
                            itensLocal = await Item.find({ id_nivel_loc4: _reg.id_nivel_loc4 });
                        } else if (_reg.id_nivel_loc3) {
                            itensLocal = await Item.find({ id_nivel_loc3: _reg.id_nivel_loc3, id_nivel_loc4: null });
                        } else if (_reg.id_nivel_loc2) {
                            itensLocal = await Item.find({ id_nivel_loc2: _reg.id_nivel_loc2, id_nivel_loc3: null });
                        } else if (_reg.id_nivel_loc1) {
                            itensLocal = await Item.find({ id_nivel_loc1: _reg.id_nivel_loc1, id_nivel_loc2: null });
                        };


                        if (alerta.acoes[i].acao == 'tol_max') {
                            console.log('tol_max:' + alerta.acoes[i].referencia[0].valor + ' tol_itens: ' + itensLocal.length)
                            if (itensLocal.length > alerta.acoes[i].referencia[0].valor) {
                                _reg.alerta = alerta.acoes[i].acao
                                console.log('alerta_tol_max')
                            }

                        } else if (alerta.acoes[i].acao == 'tol_min') {
                            console.log('tol_min:' + alerta.acoes[i].referencia[0].valor + ' tol_itens: ' + itensLocal.length)
                            if (itensLocal.length < alerta.acoes[i].referencia[0].valor) {
                                _reg.alerta = alerta.acoes[i].acao
                                console.log('alerta_tol_min')
                            }

                        } else if (alerta.acoes[i].acao == 'itens_fixo') {
                            console.log('itens_fixo:' + alerta.acoes[i].referencia.length + ' tol_itens: ' + itensLocal.length)
                            if (itensLocal.length != alerta.acoes[i].referencia.length) {
                                _reg.alerta = alerta.acoes[i].acao
                                console.log('alerta_itens_fixo')
                            }
                        }

                    } else if (alerta.acoes[i].acao == 'aproximar') {

                        console.log('aproximar:' + parseFloat(alerta.acoes[i].referencia[0].valor) * -1 + ' rssi: ' + parseFloat(_reg.rssi) * -1)
                        if (parseFloat(alerta.acoes[i].referencia[0].valor) * -1 > parseFloat(_reg.rssi) * -1) {
                            _reg.alerta = alerta.acoes[i].acao
                            console.log('alerta_aproximar')
                        }

                    } else if (alerta.acoes[i].acao == 'distanciar') {

                        console.log('distanciar:' + parseFloat(alerta.acoes[i].referencia[0].valor) * -1 + ' rssi: ' + parseFloat(_reg.rssi) * -1)
                        if (parseFloat(alerta.acoes[i].referencia[0].valor) * -1 < parseFloat(_reg.rssi) * -1) {
                            _reg.alerta = alerta.acoes[i].acao
                            console.log('alerta_distanciar')
                        }

                    };
                };

                _reg.alerta_data = moment().format('YYYY-MM-DD HH:mm:ss');
                _reg.alerta_data_finalizada = null,
                    await _reg.save();
                console.log('🔔 Alerta encontrado:', alerta);
                return alerta; // interrompe ao encontrar o primeiro
            };

            console.log('✅ Nenhum alerta encontrado');
            return null;
        } catch (err) {
            console.error('Erro ao verificar alertas:', err);
            throw err;
        }
    };

    console.log('schedule')
    cron.schedule('*/5 * * * * *', async () => { // */5 segundos
        console.log('⏱️ Executando verificarAlertasSair() -', new Date().toLocaleTimeString());
        await verificarAlertasSair();
    });

    async function verificarAlertasSair() {
        try {
            // 1️⃣ Buscar alertas com ação "sair"
            const alertas = await Alerta.find({ "acoes.acao": "sair", ativo: "1" });

            for (const alerta of alertas) {
                const acaoSair = alerta.acoes.find(a => a.acao === 'sair');
                if (!acaoSair || !acaoSair.referencia?.length) continue;

                const tempoLimiteSegundos = parseInt(acaoSair.referencia[0].valor, 10) || 0;

                const filtrosNivel = [
                    alerta.id_nivel_loc1 && { id_nivel_loc1: alerta.id_nivel_loc1 },
                    alerta.id_nivel_loc2 && { id_nivel_loc2: alerta.id_nivel_loc2 },
                    alerta.id_nivel_loc3 && { id_nivel_loc3: alerta.id_nivel_loc3 },
                    alerta.id_nivel_loc4 && { id_nivel_loc4: alerta.id_nivel_loc4 },
                ].filter(Boolean);

                if (!filtrosNivel.length) continue;

                const queryItens = {
                    id_conta: alerta.id_conta,
                    $or: filtrosNivel
                };

                const itens = await Item.find(queryItens);
                const agora = moment();

                for (const item of itens) {
                    //const dataPermanecia = item?.registro_atual?.data_permanecia;
                    const dataPermanecia = item.updatedAt
                    if (!dataPermanecia) continue;

                    const diffSegundos = agora.diff(moment(dataPermanecia), 'seconds');
                    const novoStatus = diffSegundos > tempoLimiteSegundos ? 'perca' : 'ativo';

                    // 🔍 Caso esteja em perda de sinal, verificar registro e correlacionar colaborador
                    if (novoStatus === 'perca') {

                        const base = moment(dataPermanecia);
                        const inicioJanela = base.clone().subtract(30, 'seconds').toDate();
                        const fimJanela = base.clone().add(30, 'seconds').toDate();

                        // ✍️ Atualiza status do item se mudou
                        if (item.status !== novoStatus) {
                            await Item.updateOne(
                                { _id: item._id },
                                { $set: { status: novoStatus } }
                            );
                            _checkInteracao('saida', item.registro_atual)
                            console.log(`🔄 Item ${item._id} -> ${novoStatus} (${diffSegundos}s)`);
                        }

                        // Busca o registro principal do item
                        const registroItem = await Registro.findOne({
                            id_item: item._id,
                            id_conta: alerta.id_conta
                        }).sort({ data_permanecia: -1 });

                        // ⚠️ Se já tem vínculo com colaborador, não precisa checar
                        if (registroItem && (registroItem.id_colaborador_retirada || registroItem.id_registro_colaborador)) {
                            continue;
                        }

                        // Monta filtro por níveis do item
                        const matchNiveis = {};
                        if (item.id_nivel_loc1) matchNiveis.id_nivel_loc1 = item.id_nivel_loc1;
                        if (item.id_nivel_loc2) matchNiveis.id_nivel_loc2 = item.id_nivel_loc2;
                        if (item.id_nivel_loc3) matchNiveis.id_nivel_loc3 = item.id_nivel_loc3;
                        if (item.id_nivel_loc4) matchNiveis.id_nivel_loc4 = item.id_nivel_loc4;

                        // Procura colaborador próximo no tempo e local
                        const colab = await RegistroColaborador.findOne({
                            id_conta: alerta.id_conta,
                            ...matchNiveis,
                            $or: [
                                { data_permanecia: { $gte: inicioJanela, $lte: fimJanela } },
                                { data_registro: { $gte: inicioJanela, $lte: fimJanela } }
                            ]
                        }).sort({ data_permanecia: -1, data_registro: -1 });

                        if (colab) {
                            console.log(`🧩 Correlação detectada: item ${item._id} ↔ colaborador ${colab.id_colaborador_ident}`);

                            // 🧠 Atualiza o registro do item com os IDs do colaborador
                            if (registroItem) {
                                await Registro.updateOne(
                                    { _id: registroItem._id },
                                    {
                                        $set: {
                                            id_colaborador_retirada: colab.id_colaborador_ident,
                                            id_registro_colaborador: colab._id
                                        }
                                    }
                                );

                                // 🔄 Atualiza também no objeto registro_atual do item
                                await Item.updateOne(
                                    { _id: item._id },
                                    {
                                        $set: {
                                            'registro_atual.id_colaborador_retirada': colab.id_colaborador_ident,
                                            'registro_atual.id_registro_colaborador': colab._id
                                        }
                                    }
                                );

                                console.log(`✅ Registro ${registroItem._id} atualizado com colaborador ${colab.id_colaborador_ident}`);
                            };
                        };
                    };


                }
            }
        } catch (err) {
            console.error('Erro ao verificar alertas de saída:', err);
        }
    }



    app.post('/_bd/registro_colaborador', async (req, res) => {
        try {
            const data = req.body;

            // ✅ 1️⃣ Determina o nível válido (do último para o primeiro)
            const nivel =
                data.id_nivel_loc4 ||
                data.id_nivel_loc3 ||
                data.id_nivel_loc2 ||
                data.id_nivel_loc1;

            if (!nivel) {
                return res.status(400).json({ erro: 'Nenhum nível de localização informado' });
            }

            // ✅ 2️⃣ Identifica gateway e conta
            const gateway = await Gateway.findOne({ tokem: data.tokem });
            if (!gateway) {
                return res.status(404).json({ erro: 'Gateway não encontrado' });
            }

            const id_conta = gateway.id_conta;
            const id_gateway = gateway._id;

            // ✅ 3️⃣ Identifica colaborador pela tag
            const colaborador = await Colaborador.findOne({
                id_conta,
                tag: data.tag,
            });

            if (!colaborador) {
                return res.status(404).json({ erro: 'Colaborador não encontrado para a tag informada' });
            }

            const id_colaborador = colaborador._id;


            // ✅ 4️⃣ Busca último registro do colaborador
            const ultimo = await RegistroColaborador.findOne({
                id_colaborador,
            }).sort({ data_registro: -1 });

            const agora = moment(data.data_leitura, 'YYYY-MM-DD HH:mm:ss');

            if (ultimo && ultimo.id_nivel_loc1 === data.id_nivel_loc1 &&
                ultimo.id_nivel_loc2 === data.id_nivel_loc2 &&
                ultimo.id_nivel_loc3 === data.id_nivel_loc3 &&
                ultimo.id_nivel_loc4 === data.id_nivel_loc4) {

                // calcula intervalo
                const diffSeg = agora.diff(moment(ultimo.data_permanecia || ultimo.data_registro), 'seconds');

                if (diffSeg <= 5) {
                    // 🔄 Atualiza permanência
                    ultimo.data_permanecia = agora.toDate();
                    await ultimo.save();
                    return res.json({ atualizado: true, _id: ultimo._id });
                }
            }

            // ✅ 5️⃣ Caso contrário, cria novo registro
            const novo = new RegistroColaborador({
                id_conta,
                id_colaborador: gateway.id_colaborador,
                id_gateway,
                data_registro: agora.toDate(),
                data_permanecia: agora.toDate(),
                status: 'entrada',
                id_colaborador_ident: id_colaborador,
                tag: data.tag,
                rssi: data.rssi,
                antena: data.antena,
                bateria: data.bateria,
                temperatura: data.temperatura,
                id_nivel_loc1: data.id_nivel_loc1,
                id_nivel_loc2: data.id_nivel_loc2,
                id_nivel_loc3: data.id_nivel_loc3,
                id_nivel_loc4: data.id_nivel_loc4,
                latitude: data.latitude,
                longitude: data.longitude,
            });

            await novo.save();

            return res.json({ criado: true, _id: novo._id });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ erro: 'Falha ao registrar leitura', detalhes: err.message });
        }
    });


    app.get('/_bd/itens/resumo/:id_conta/:id_nivel1?', async (req, res) => {
        try {

            const { id_conta, id_nivel1 } = req.params;

            // 🔹 Monta filtro base sempre com id_conta
            const filtro = { id_conta };

            // 🔹 Se veio o id_nivel1, adiciona ao filtro
            if (id_nivel1 && id_nivel1 !== 'null' && id_nivel1 !== 'undefined') {
                filtro.id_nivel_loc1 = id_nivel1;
            }

            // 🔹 1️⃣ Resumo com status filtrado
            const resumoPromise = Item.aggregate([
                { $match: filtro },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        // apenas ativos alocados
                        alocados: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $eq: ['$status', 'ativo'] },
                                            { $ne: ['$id_nivel_loc1', null] },
                                            { $ne: ['$id_nivel_loc1', ''] }
                                        ]
                                    },
                                    1,
                                    0
                                ]
                            }
                        },
                        // apenas ativos em transporte
                        em_transporte: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $eq: ['$status', 'ativo'] },
                                            {
                                                $or: [
                                                    { $eq: ['$id_nivel_loc1', null] },
                                                    { $eq: ['$id_nivel_loc1', ''] }
                                                ]
                                            }
                                        ]
                                    },
                                    1,
                                    0
                                ]
                            }
                        },
                        // total de perdas
                        perca: {
                            $sum: {
                                $cond: [{ $eq: ['$status', 'perca'] }, 1, 0]
                            }
                        }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        total: 1,
                        alocados: 1,
                        em_transporte: 1,
                        perca: 1
                    }
                }
            ]);

            // 🔹 2️⃣ Últimos itens (mantém igual)
            const ultimoItemPromise = Item.findOne({ id_conta })
                .sort({ updatedAt: -1 })
                .select('descricao id_nivel_loc1 updatedAt tag');

            const ultimoAlocadoPromise = Item.findOne({
                id_conta,
                id_nivel_loc1: { $nin: [null, ''] },
                status: 'ativo'
            })
                .sort({ updatedAt: -1 })
                .select('descricao id_nivel_loc1 updatedAt tag');

            const ultimoEmTransportePromise = Item.findOne({
                id_conta,
                $or: [{ id_nivel_loc1: null }, { id_nivel_loc1: '' }],
                status: 'ativo'
            })
                .sort({ updatedAt: -1 })
                .select('descricao id_nivel_loc1 updatedAt tag');

            // 🔹 3️⃣ Itens com alerta ativo
            const itensAlertaPromise = Item.find({
                id_conta,
                'registro_atual.alerta': { $exists: true, $ne: null, $ne: '' },
                'registro_atual.alerta_data_finalizada': null
            })
                .select('descricao tag registro_atual.alerta registro_atual.alerta_data_finalizada updatedAt')
                .sort({ updatedAt: -1 });

            // 🔹 4️⃣ Executa tudo em paralelo
            const [
                resumo,
                ultimoItem,
                ultimoAlocado,
                ultimoEmTransporte,
                itensAlerta
            ] = await Promise.all([
                resumoPromise,
                ultimoItemPromise,
                ultimoAlocadoPromise,
                ultimoEmTransportePromise,
                itensAlertaPromise
            ]);

            const dadosResumo = resumo[0] || {
                total: 0,
                alocados: 0,
                em_transporte: 0,
                perca: 0
            };

            // 🔹 5️⃣ Retorno final
            res.json({
                success: true,
                id_conta,
                ...dadosResumo,
                total_alertas: itensAlerta.length,
                itens_alerta: itensAlerta,
                ultimo_item: ultimoItem || null,
                ultimo_alocado: ultimoAlocado || null,
                ultimo_em_transporte: ultimoEmTransporte || null
            });

        } catch (err) {
            console.error('Erro ao gerar resumo de itens:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });






    app.post('/_bd/importar-csv-itens', async (req, res) => {
        try {
            const { id_conta, itens } = req.body; // o front envia { id_conta, itens: [...] }

            const resultados = [];

            for (const linha of itens) {
                const {
                    id_interno,
                    categoria,
                    label1,
                    label2,
                    label3,
                    label4,
                    inf1,
                    inf2,
                    inf3,
                    inf4,
                    loc_nivel1,
                    loc_nivel2,
                    loc_nivel3,
                    loc_nivel4
                } = linha;

                // =====================================================
                // 1️⃣ Verificar / criar / atualizar Categoria
                // =====================================================
                let cat = await Categoria.findOne({ id_conta, descricao: categoria });
                if (!cat) {
                    cat = await Categoria.create({
                        id_conta,
                        descricao: categoria,
                        labelInf1: label1,
                        labelInf2: label2,
                        labelInf3: label3,
                        labelInf4: label4
                    });
                } else {
                    // Atualiza labels se mudou
                    const atualiza = {
                        labelInf1: label1,
                        labelInf2: label2,
                        labelInf3: label3,
                        labelInf4: label4
                    };
                    await Categoria.updateOne({ _id: cat._id }, { $set: atualiza });
                }

                // =====================================================
                // 2️⃣ Verificar / criar / atualizar Localizações (níveis)
                // =====================================================
                async function getOrCreateLocal(descricao, nivel, id_conta, id_pai = null) {
                    if (!descricao) return null;

                    // 🔹 Para nível 1, o id_nivel sempre será null
                    const filtro = id_pai ? { id_conta, descricao, id_nivel: id_pai } : { id_conta, descricao, id_nivel: null };

                    let loc = await Localizacao.findOne(filtro);

                    if (!loc) {
                        loc = await Localizacao.create({
                            id_conta,
                            descricao,
                            id_nivel: id_pai ? id_pai : null
                        });
                    } else {
                        // Apenas garante que a descrição não seja perdida
                        if (!loc.descricao && descricao) {
                            await Localizacao.updateOne({ _id: loc._id }, { $set: { descricao } });
                        }
                    }

                    return loc._id;
                }

                const id_loc1 = await getOrCreateLocal(loc_nivel1, 1, id_conta, null);
                const id_loc2 = await getOrCreateLocal(loc_nivel2, 2, id_conta, id_loc1);
                const id_loc3 = await getOrCreateLocal(loc_nivel3, 3, id_conta, id_loc2);
                const id_loc4 = await getOrCreateLocal(loc_nivel4, 4, id_conta, id_loc3);

                // =====================================================
                // 3️⃣ Verificar / atualizar ou criar Item
                // =====================================================
                let item = await Item.findOne({ id_conta, tag: id_interno });

                const dadosItem = {
                    id_conta,
                    id_categoria: cat._id,
                    tag: id_interno,
                    descricao: categoria,
                    inf_compl1: inf1,
                    inf_compl2: inf2,
                    inf_compl3: inf3,
                    inf_compl4: inf4,
                    id_nivel_loc1: id_loc1,
                    id_nivel_loc2: id_loc2,
                    id_nivel_loc3: id_loc3,
                    id_nivel_loc4: id_loc4
                };

                if (item) {
                    // Atualiza o existente
                    await Item.updateOne({ _id: item._id }, { $set: dadosItem });
                    resultados.push({ tag: id_interno, acao: 'atualizado', id: item._id });
                } else {
                    // Cria novo
                    const novo = await Item.create(dadosItem);
                    resultados.push({ tag: id_interno, acao: 'criado', id: novo._id });
                }
            }

            res.json({ success: true, total: resultados.length, resultados });
        } catch (err) {
            console.error('Erro ao importar itens:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.get('/_bd/itens/agrupados/:id_conta/:id_nivel1?', async (req, res) => {
        try {
            const { id_conta, id_nivel1 } = req.params;

            // 🔹 Monta filtro base sempre com id_conta
            const filtro = { id_conta };

            // 🔹 Se veio o id_nivel1, adiciona ao filtro
            if (id_nivel1 && id_nivel1 !== 'null' && id_nivel1 !== 'undefined') {
                filtro.id_nivel_loc1 = id_nivel1;
            }

            console.log(filtro)

            // 🔹 1️⃣ Agrupa os itens do nível 1, somando por status
            const agrupado = await Item.aggregate([
                { $match: filtro },
                {
                    $group: {
                        _id: '$id_nivel_loc3',
                        total_itens: { $sum: 1 },
                        ativos: {
                            $sum: {
                                $cond: [{ $eq: ['$status', 'ativo'] }, 1, 0]
                            }
                        },
                        perca: {
                            $sum: {
                                $cond: [{ $eq: ['$status', 'perca'] }, 1, 0]
                            }
                        }
                    }
                },
                { $sort: { total_itens: -1 } }
            ]);

            // 🔹 2️⃣ Calcula total geral
            const totalGeral = agrupado.reduce((soma, a) => soma + a.total_itens, 0);

            // 🔹 3️⃣ Busca descrições das localizações (nível 3)
            const idsLoc3 = agrupado.map(a => a._id).filter(Boolean);
            const locais = await Localizacao.find(
                { _id: { $in: idsLoc3 } },
                { _id: 1, descricao: 1 }
            );

            // 🔹 4️⃣ Monta resultado final com percentual
            const resultado = agrupado.map(a => {
                const local = locais.find(l => l._id === a._id);
                const percentual = totalGeral > 0
                    ? ((a.total_itens / totalGeral) * 100).toFixed(2)
                    : 0;

                return {
                    id_nivel_loc3: a._id,
                    descricao: local ? local.descricao : 'Nível 3 não identificado',
                    total_itens: a.total_itens,
                    ativos: a.ativos,
                    perca: a.perca,
                    percentual: parseFloat(percentual)
                };
            });

            // 🔹 5️⃣ Retorna com total geral incluso
            res.json({
                success: true,
                id_nivel1,
                total_geral: totalGeral,
                total_grupos: resultado.length,
                resultado
            });

        } catch (err) {
            console.error('Erro ao agrupar itens por nível 3:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });



    app.get('/ultimas6h/:id_conta', async (req, res) => {
        try {
            const { id_conta } = req.params;

            // 1️⃣ busca o último registro
            const ultimo = await Registro.findOne({ id_conta })
                .sort({ data_permanecia: -1 })
                .select('data_permanecia');

            if (!ultimo) {
                return res.json({ message: 'Nenhum registro encontrado' });
            }

            // 2️⃣ define intervalo das últimas 6h
            const dataFinal = ultimo.data_permanecia;
            const dataInicial = new Date(dataFinal.getTime() - 6 * 60 * 60 * 1000);

            // 3️⃣ filtra registros no intervalo e agrupa por hora
            const registros = await Registro.aggregate([
                {
                    $match: {
                        id_conta,
                        data_permanecia: { $gte: dataInicial, $lte: dataFinal }
                    }
                },
                {
                    $group: {
                        _id: {
                            ano: { $year: "$data_permanecia" },
                            mes: { $month: "$data_permanecia" },
                            dia: { $dayOfMonth: "$data_permanecia" },
                            hora: { $hour: "$data_permanecia" }
                        },
                        total: { $sum: 1 },
                        registros: { $push: "$$ROOT" }
                    }
                },
                {
                    $sort: { "_id.ano": -1, "_id.mes": -1, "_id.dia": -1, "_id.hora": -1 }
                },
                {
                    $addFields: {
                        data_hora: {
                            $dateToString: {
                                format: "%Y-%m-%d %H:00",
                                date: {
                                    $dateFromParts: {
                                        year: "$_id.ano",
                                        month: "$_id.mes",
                                        day: "$_id.dia",
                                        hour: "$_id.hora"
                                    }
                                }
                            }
                        }
                    }
                }
            ]);

            res.json({
                periodo: {
                    inicio: dataInicial,
                    fim: dataFinal
                },
                totalGrupos: registros.length,
                registros
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao buscar registros' });
        }
    });

}