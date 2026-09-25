const shortid = require('shortid');
const fs = require('fs');
const axios = require('axios'); // se for enviar via HTTP
const path = require('path');

const Gateway = require("../models/gateway");
const Item = require("../models/item");
const Categoria = require("../models/categoria");
const CategoriaItem = require("../models/categoria_item");
const Localizacao = require("../models/localizacao");
const Registro = require("../models/registro");
const Alerta = require("../models/alerta");
const Posicao = require("../models/posicao");
const Associacao = require("../models/associacao");
const AssociacaoRegistro = require("../models/associacao_reg");

const Interacao = require("../models/interacao");
const Colaborador = require("../models/colaborador");
const RegistroColaborador = require("../models/registro_colaborador");

const ultimasLeituras = new Map(); // { "tag|tokem" => timestamp }
const DEBOUNCE_LEITURA_SEG = 6; // leitor envia ~5s; folga evita processar o próximo tick como ciclo novo
const { setTimeout: sleep } = require('timers/promises');
const moment = require('moment')
const cron = require('node-cron');

let _urlRegistro = 'https://connectiot-app.azurewebsites.net/_bd/registro';
let _urlRegistroLocal = 'http://localhost:3000/_bd/registro';

module.exports = (app, dbConnection) => {

    console.log("api")

    function salvarLogArquivo(titulo, dados) {
        try {
            const dir = path.join(__dirname, '../../../logs');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const arquivo = path.join(dir, `middleware_${moment().format('YYYY-MM-DD')}.log`);
            const linha =
                `[${moment().format('YYYY-MM-DD HH:mm:ss')}] ${titulo} ` +
                `${typeof dados === 'string' ? dados : JSON.stringify(dados)}\n`;
            fs.appendFileSync(arquivo, linha, 'utf8');
        } catch (err) {
            console.error('Erro ao gravar log:', err.message);
        }
    }

    app.post('/x_midleware/registro', async (req, res) => {

        const payload = req.body;
        console.log('/x_midleware/registro', payload);
        salvarLogArquivo('/x_midleware/registro', payload);

        const tokemPortal = payload.Devicename;

        const gateway = await Gateway.findOne({ tokem: tokemPortal, ativo: 1 });
        if (!gateway) {
            return res.status(404).json({
                ok: false,
                error: 'Gateway não encontrado.'
            });
        }

        const registro = {
            tokem: tokemPortal,
            tag: payload.Tagid,
            data_leitura: "",
            antena: payload.Antennaname || "0",
            rssi: payload.Rssi || "-0",
            bateria: "0",
            temperatura: "0",
            latitude: "",
            longitude: "",
            id_nivel_loc1: "",
            id_nivel_loc2: "",
            id_nivel_loc3: "",
            id_nivel_loc4: "",
            id_nivel_loc1_final: "",
            id_nivel_loc2_final: "",
            id_nivel_loc3_final: "",
            id_nivel_loc4_final: ""
        };

        await axios.post(
            _urlRegistro, //!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! SERVER PROD
            registro,
            { timeout: 5000 }
        );

        return res.status(200).json({
            ok: true,
            gateway: gateway,
            registro: registro
        });

    });

    app.post('/_bd/registro/gateway', async (req, res) => {
        try {
            const payload = req.body;

            console.log('payload', payload);

            if (!Array.isArray(payload) || payload.length === 0) {
                return res.status(400).json({ erro: 'Payload inválido' });
            }

            // Função para formatar MAC como endereço MAC (XX:XX:XX:XX:XX:XX)
            const formatarMAC = (mac) => {
                if (!mac) return '';
                // Remove tudo que não é alfanumérico e converte para maiúsculo
                const limpo = mac.toString().replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
                // Adiciona : a cada 2 caracteres
                return limpo.match(/.{1,2}/g)?.join(':') || limpo;
            };

            // 1️⃣ tokem: query (?tokem=) tem prioridade; senão body (item com gateway)
            const tokemQuery = req.query.tokem ? String(req.query.tokem).trim() : '';
            let gateway = null;

            if (tokemQuery) {
                gateway = await Gateway.findOne({
                    $or: [
                        { tokem: tokemQuery },
                        { tokem: formatarMAC(tokemQuery) }
                    ],
                    ativo: 1
                });
            } else {
                const gatewayItem = payload.find(i => i.gateway);
                if (!gatewayItem) {
                    return res.status(400).json({ erro: 'Gateway não informado' });
                }
                gateway = await Gateway.findOne({
                    tokem: formatarMAC(gatewayItem.gateway),
                    ativo: 1
                });
            }

            if (!gateway) {
                return res.status(400).json({ erro: 'Gateway não encontrado no banco de dados' });
            }

            const tokem = gateway.tokem;

            // 2️⃣ Filtra apenas leituras com MAC
            const leituras = payload.filter(i => i.mac);

            let enviados = 0;
            let erros = [];



            // 3️⃣ Envio ordeiro (um por vez)
            for (const leitura of leituras) {
                const registro = {
                    tokem: tokem,
                    tag: formatarMAC(leitura.mac),     // MAC formatado como endereço MAC
                    data_leitura: "", //leitura.timestamp ? moment(leitura.timestamp).format('YYYY-MM-DD HH:mm:ss') : moment().format('YYYY-MM-DD HH:mm:ss'),
                    antena: "0",
                    rssi: leitura.rssi ?? "",
                    bateria: "0",
                    temperatura: "0",
                    latitude: "",
                    longitude: "",
                    id_nivel_loc1: "",
                    id_nivel_loc2: "",
                    id_nivel_loc3: "",
                    id_nivel_loc4: "",
                    id_nivel_loc1_final: "",
                    id_nivel_loc2_final: "",
                    id_nivel_loc3_final: "",
                    id_nivel_loc4_final: ""
                };

                console.log('/_bd/registro/gateway::' + JSON.stringify(registro))

                //'https://sealairtracking-3d3268c3e73f.herokuapp.com/_bd/registro',\
                //'http://localhost:5000/_bd/registro',

                // Verifica se deve filtrar por RSSI (aceita apenas sinais fortes o suficiente)
                const rssiValor = parseFloat(leitura.rssi) * -1 || 0;
                // const rssiAbsoluto = Math.abs(rssiValor);
                const thresholdRSSI = gateway.intervalo_reg_rssi || 0;

                // Se não há threshold configurado ou o sinal está dentro do threshold, envia
                if (thresholdRSSI === 0 || rssiValor < thresholdRSSI) {
                    try {
                        await axios.post(
                            'https://connectiot-app.azurewebsites.net/_bd/registro',
                            registro,
                            { timeout: 5000 }
                        );

                        enviados++;
                    } catch (err) {
                        erros.push({
                            mac: leitura.mac,
                            erro: err.message
                        });
                    }
                }
            }

            return res.json({
                gateway: tokem,
                total_leituras: leituras.length,
                enviados,
                erros
            });

        } catch (err) {
            console.error(err);
            res.status(500).json({ erro: 'Erro interno' });
        }
    });

    app.post('/_bd/registro', async (req, res) => {

        console.log("chegou_aqui_no_registro")
        console.log(req.body)

        let retorno;
        let status;

        let {
            tokem,
            id_colaborador,
            tag,
            id_categoria,
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
            id_nivel_loc4,
            id_nivel_loc1_final,
            id_nivel_loc2_final,
            id_nivel_loc3_final,
            id_nivel_loc4_final,
            inf_compl1,
            inf_compl2,
            inf_compl3,
            inf_compl4,
            inf_compl5
        } = req.body;


        //Todo: Normaliza data_leitura como Date real (evita skew UTC vs horário local)
        if (!data_leitura) {
            data_leitura = new Date();
        } else if (!(data_leitura instanceof Date)) {
            const raw = String(data_leitura).trim();
            const mLocal = moment(raw, 'YYYY-MM-DD HH:mm:ss', true);
            if (mLocal.isValid()) {
                // Interpreta relógio local como Brasília (UTC-3)
                data_leitura = mLocal.utcOffset(-3, true).toDate();
            } else {
                const parsed = new Date(raw);
                data_leitura = isNaN(parsed.getTime()) ? new Date() : parsed;
            }
        }

        // Todo: Inibe leituras repetidas do mesmo coletor (leitor ~5s → debounce 6s)
        const agora = Date.now();
        const chaveLeitura = String(tag || '') + '|' + String(tokem || '');
        if (ultimasLeituras.has(chaveLeitura)) {
            const ultimo = ultimasLeituras.get(chaveLeitura);
            const diffSegundos = (agora - ultimo) / 1000;
            if (diffSegundos <= DEBOUNCE_LEITURA_SEG) {
                return res.status(200).json({
                    success: true,
                    ignored: true,
                    message: `Leitura ignorada: última foi há ${diffSegundos.toFixed(2)}s (menos de ${DEBOUNCE_LEITURA_SEG}s no mesmo coletor)`
                });
            };
        };
        ultimasLeituras.set(chaveLeitura, agora);


        //Todo: Busca cadastro do gateway
        let gateway = await Gateway.findOne({ tokem, ativo: 1 });
        if (!gateway) {
            return res.status(200).json({
                success: true,
                ignored: true,
                message: `Gateway ${tokem} não cadastrado na conta`
            });
        };

        // Todo: Checa associação do Gateway
        // Se existir associação, resolve para o gateway primário
        console.log('gateway1', gateway.tokem);
        if (gateway.tokem_associado) {
            const visited = new Set();
            let current = gateway;

            while (current?.tokem_associado) {
                // evita loop (ex.: A -> B -> A)
                if (visited.has(current.tokem)) break;
                visited.add(current.tokem);

                const tokemPrimario = String(current.tokem_associado).trim();

                const primary = await Gateway.findOne({
                    tokem: tokemPrimario,
                    ativo: 1,
                    // se quiser garantir mesma conta, descomente:
                    // id_conta: current.id_conta
                });

                if (!primary) {
                    return res.status(200).json({
                        success: true,
                        ignored: true,
                        message: `Gateway ${current.tokem} possui tokem_associado (${tokemPrimario}), mas o primário não está cadastrado/ativo`
                    });
                }

                current = primary;
            }

            gateway = current; // <- a partir daqui, "gateway" é o primário
        };


        // Todo: Filtra por RSSI (mesma regra de /_bd/registro/gateway)
        // Aceita apenas sinais fortes o suficiente conforme gateway.intervalo_reg_rssi
        {
            const rssiValor = parseFloat(rssi) * -1 || 0;
            const thresholdRSSI = gateway.intervalo_reg_rssi || 0;
            if (thresholdRSSI !== 0 && !(rssiValor < thresholdRSSI)) {
                return res.status(200).json({
                    success: true,
                    ignored: true,
                    message: `Leitura ignorada por RSSI: valor ${rssiValor} fora do intervalo ${thresholdRSSI} (gateway ${gateway.tokem})`
                });
            }
        }

        // Todo: Envia dados para log via socket
        const io = req.app.get('io');
        const dadosRegistro = {
            tokem,
            id_colaborador,
            tag,
            id_categoria: id_categoria ?? null,
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
            id_nivel_loc4,
            id_nivel_loc1_final,
            id_nivel_loc2_final,
            id_nivel_loc3_final,
            id_nivel_loc4_final,
            inf_compl1,
            inf_compl2,
            inf_compl3,
            inf_compl4,
            inf_compl5
        };
        io.emit(gateway._id, dadosRegistro);
        io.emit(gateway.id_conta, dadosRegistro);

        // Todo: Se não foi informado o nível de localização, usa o nível do gateway
        // if (!id_nivel_loc1 && gateway.modo == 'fixo') {
        id_nivel_loc1 = gateway.id_nivel_loc1;
        id_nivel_loc2 = gateway.id_nivel_loc2;
        id_nivel_loc3 = gateway.id_nivel_loc3;
        id_nivel_loc4 = gateway.id_nivel_loc4;
        // };

        // Todo: Busca cadastro do item
        let item = await Item.findOne({ tag, id_conta: gateway.id_conta });
        if (!item) return res.status(200).json({
            success: true,
            ignored: true,
            message: `Item ${tag} não cadastrado na conta`
        });

        // Todo: Caso o Item possua uma tag Secundária
        if (item.tag_secundaria) {
            tag = item.tag_secundaria;
            const itemPrimario = await Item.findOne({ tag, id_conta: gateway.id_conta });
            if (!itemPrimario) return res.status(200).json({
                success: true,
                ignored: true,
                message: `Item ${tag} não cadastrado na conta`
            });
            item = itemPrimario;
        };

        // Todo: Cria um novo ciclo de Registro e Atualiza Status e Endereço do Item (SKU)
        let _addReg = async () => {

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

                associados: [],

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

                interacoes: []

            });
            await novoRegistro.save();
            await _updItem(novoRegistro)

            await _checkAssociacao(novoRegistro)
            await _checkInteracao('entrada', novoRegistro)

            // _checkAlerta(novoRegistro)

        };

        //Todo: Atualiza Status e Endereço do Item (SKU)
        let _updItem = async (_reg) => {
            item.status = 'ativo'
            if (id_categoria != null && String(id_categoria).trim() !== '') {
                item.id_categoria = id_categoria;
            }
            item.id_nivel_loc1 = id_nivel_loc1;
            item.id_nivel_loc2 = id_nivel_loc2;
            item.id_nivel_loc3 = id_nivel_loc3;
            item.id_nivel_loc4 = id_nivel_loc4;
            item.registro_atual = _reg
            await item.save();

            try {
                await axios.get(`https://connectiot-app.azurewebsites.net/_bd/item/preencher-inf-complementares`, {
                    params: { id_item: item._id }
                });
            } catch (err) {
                console.error('Erro ao executar preenchimento inf_compl do item:', err.message);
            };
        };

        // Todo: Checa último registro do item
        let ultimoRegistro = await Registro.findOne({ tag, id_conta: gateway.id_conta }).sort({ createdAt: -1 }).limit(1);;

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

        if (ultimoRegistro?.data_permanecia && ultimoRegistro?.data_registro) {

            // updatedAt = horário real do Mongo (evita skew de data_permanecia)
            const refUltima = ultimoRegistro.updatedAt || ultimoRegistro.data_permanecia;
            const diffSegundos = Math.floor((Date.now() - new Date(refUltima).getTime()) / 1000);
            // Janela de disputa entre gateways: intervalo_ausencia do coletor (fallback 60s)
            const intervaloAusencia = Number(gateway.intervalo_ausencia) > 0
                ? Number(gateway.intervalo_ausencia)
                : 60;
            const dentroJanela = Number.isFinite(diffSegundos) && diffSegundos >= 0 && diffSegundos <= intervaloAusencia;

            console.log(`Diferença: ${diffSegundos} segundos ${intervaloAusencia}`);

            const gatewayDiferente = String(ultimoRegistro.id_gateway || '') !== String(gateway._id || '');

            const mesmoLocal =
                String(ultimoRegistro.id_nivel_loc1 || '') === String(id_nivel_loc1 || '') &&
                String(ultimoRegistro.id_nivel_loc2 || '') === String(id_nivel_loc2 || '') &&
                String(ultimoRegistro.id_nivel_loc3 || '') === String(id_nivel_loc3 || '') &&
                String(ultimoRegistro.id_nivel_loc4 || '') === String(id_nivel_loc4 || '');

            // RSSI: -30 é mais forte que -40 (maior algebricamente = melhor)
            const rssiAtual = parseFloat(rssi);
            const rssiAnterior = parseFloat(ultimoRegistro.rssi);
            const rssiComparavel = !Number.isNaN(rssiAtual) && !Number.isNaN(rssiAnterior);
            const rssiMaisFraco = rssiComparavel && rssiAtual < rssiAnterior;
            const rssiMaisForteOuIgual = rssiComparavel && rssiAtual >= rssiAnterior;

            // Dentro da janela + outro gateway + RSSI mais fraco → ignora (não “rouba” a tag)
            if (dentroJanela && gatewayDiferente && rssiMaisFraco) {
                return res.status(200).json({
                    success: true,
                    ignored: true,
                    message: `Leitura descartada: gateway diferente e RSSI mais fraco em ${diffSegundos}s (${rssiAtual} < ${rssiAnterior}, janela ${intervaloAusencia}s)`
                });
            }

            // Novo ciclo somente se: mudou LOCAL ou estourou ausência.
            // Gateway diferente DENTRO da janela NÃO abre ciclo — atualiza o atual
            // (e se RSSI melhor/igual, assume o novo gateway = “melhor sinal vence”).
            const estorouAusencia = diffSegundos > intervaloAusencia;
            const abrirNovoCiclo = !mesmoLocal || estorouAusencia;

            if (abrirNovoCiclo) {

                await _addReg();

            } else {

                // Permanência no mesmo ciclo
                ultimoRegistro.rssi = rssi;
                ultimoRegistro.bateria = bateria;
                ultimoRegistro.temperatura = temperatura;
                ultimoRegistro.data_permanecia = data_leitura;
                ultimoRegistro.status = 'permanencia';

                // Outro gateway com sinal melhor/igual (ou sem RSSI comparável): assume o coletor atual
                if (gatewayDiferente && (rssiMaisForteOuIgual || !rssiComparavel)) {
                    ultimoRegistro.id_gateway = gateway._id;
                    ultimoRegistro.id_nivel_loc1 = id_nivel_loc1;
                    ultimoRegistro.id_nivel_loc2 = id_nivel_loc2;
                    ultimoRegistro.id_nivel_loc3 = id_nivel_loc3;
                    ultimoRegistro.id_nivel_loc4 = id_nivel_loc4;
                    retorno = `Permanência: gateway assumido por melhor/igual RSSI (${rssiAtual} >= ${rssiAnterior})`;
                }

                await ultimoRegistro.save();

                try {
                    await Item.updateOne(
                        { _id: item._id },
                        {
                            $set: {
                                status: 'ativo',
                                id_nivel_loc1: id_nivel_loc1 || item.id_nivel_loc1,
                                id_nivel_loc2: id_nivel_loc2 || item.id_nivel_loc2,
                                id_nivel_loc3: id_nivel_loc3 || item.id_nivel_loc3,
                                id_nivel_loc4: id_nivel_loc4 || item.id_nivel_loc4,
                                'registro_atual': ultimoRegistro.toObject ? ultimoRegistro.toObject() : ultimoRegistro
                            }
                        }
                    );
                } catch (err) {
                    console.error('Erro ao sincronizar item na permanência:', err.message);
                }

                status = 'permanencia';
                retorno = retorno || 'Sem movimentação, mesma localização (permanência)';
            };


        } else {

            await _addReg();

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

    async function _checkAssociacao(_reg) {

        // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        // Todo: Falta Verificar por Associacao por Categoria : idItem e idCategoria
        // Todo: Falta Verificar por Associacao por Item (SkU)

        const gateway = await Gateway.findOne({ _id: _reg.id_gateway, ativo: 1 }).lean();
        if (!gateway || Number(gateway.gera_associao) === 0) {
            console.log('ℹ️ checkAssociacao: gateway sem gera_associao — ação descartada');
            return;
        }

        function delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        // Todo: Verifica se o Item(SKU) lido  possui associação
        let associacao = await Associacao.findOne({
            ativo: '1',
            $or: [
                { id_item: _reg.id_item },
                { id_categoria: _reg.id_categoria }
            ]
        });

        if (!associacao) {
            console.log("ℹ️ checkAssociacao:", "Não encontrado");
            return;
        }

        // Todo: Verifica se há associados Genericos
        const associadosValidos = (associacao.associados || []).filter((associado) => {
            const idItem = (associado.id_item || '').trim();
            const idCategoria = (associado.id_categoria || '').trim();
            return idItem == '' || idCategoria == '';
        });

        if (associadosValidos.length === 0) {
            console.log("ℹ️ checkAssociacao:", "Sem associação genérica");
            return;
        }

        const intervaloSegundos = Number(associacao.intervalo) > 0 ? Number(associacao.intervalo) : 5;

        // Evita duplicidade: associação recente da mesma tag no mesmo gateway
        const janelaMs = (intervaloSegundos + 5) * 1000;
        const associacaoRecente = await AssociacaoRegistro.findOne({
            tag: _reg.tag,
            id_gateway: _reg.id_gateway,
            createdAt: { $gte: new Date(Date.now() - janelaMs) }
        }).sort({ createdAt: -1 }).lean();

        if (associacaoRecente) {
            console.log(
                'ℹ️ checkAssociacao: já existe associação recente para tag '
                + _reg.tag + ' no gateway — ignorado'
            );
            return;
        }

        console.log("🕒 checkAssociacao: Aguardando " + associacao.intervalo + "s para confirmar leituras...");
        await delay((associacao.intervalo * 1000) + 1000 || 8000);

        // Revalida após o delay (outro ciclo paralelo pode ter gravado no meio)
        const associacaoAposEspera = await AssociacaoRegistro.findOne({
            tag: _reg.tag,
            id_gateway: _reg.id_gateway,
            createdAt: { $gte: new Date(Date.now() - janelaMs) }
        }).sort({ createdAt: -1 }).lean();

        if (associacaoAposEspera) {
            console.log(
                'ℹ️ checkAssociacao: associação criada por outro ciclo durante a espera — ignorado'
            );
            return;
        }

        const base = new Date(_reg.data_registro || _reg.data_permanecia || new Date());
        const inicio = new Date(base.getTime() - (intervaloSegundos * 1000));
        const fim = new Date(base.getTime() + (intervaloSegundos * 1000));

        const registrosIntervalo = await Registro.find({
            data_registro: { $gte: inicio, $lte: fim },
            id_gateway: _reg.id_gateway,
            tag: { $ne: _reg.tag }
        }).sort({ data_registro: -1 });


        let asssociao_reg = {
            id_conta: _reg.id_conta,
            id_registro: _reg._id,
            id_colaborador: '',
            id_gateway: _reg.id_gateway,

            id_item: _reg.id_item,
            id_categoria: _reg.id_categoria,
            tag: _reg.tag,
            rssi: _reg.rssi,
            data_registro: _reg.data_registro,

            quantidade_esperada: associadosValidos[0].quantidade,
            quantidade_encontrada: registrosIntervalo.length,
            status: associadosValidos[0].quantidade == registrosIntervalo.length ? 'associacao_ok' : 'associacao_erro',

            associados: []
        }

        for (let i = 0; i < registrosIntervalo.length; i++) {
            asssociao_reg.associados.push({
                id_registro: registrosIntervalo[i]._id,
                id_item: registrosIntervalo[i].id_item,
                id_categoria: registrosIntervalo[i].id_categoria,
                tag: registrosIntervalo[i].tag,
                rssi: registrosIntervalo[i].rssi,
                data_leitura: registrosIntervalo[i].data_permanecia
            })
        }

        await new AssociacaoRegistro(asssociao_reg).save();
        console.log("✅ checkAssociacao: Registro de associacao criado " + registrosIntervalo.length + " registros");

        // Todo: Se houver registros no intervalo, gera a Ordem de Posição Esperada
        if (registrosIntervalo.length > 0) {
            await _gerarOrdem(_reg);
        }

    };

    async function _gerarOrdem(_regBase) {

        // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        // Checar se o Gateway, possui endereço fixo para Destino de Ordens de Posição Esperada

        // try {

        // Todo: Busca pelo Gateway, e checa se ele está parametrizado para Gerar Ordem de Posição Esperada
        const gateway = await Gateway.findOne({ _id: _regBase.id_gateway, ativo: 1, posicao_esperada_auto: 1 }).lean();
        if (!gateway) {
            console.log('ℹ️ gerarOrdem: Gateway não parametrizado para gerar Ordem de Posição Esperada');
            return;
        };

        const _reg = await AssociacaoRegistro.findOne({ id_registro: _regBase._id }).lean();

        const origem = {
            id_nivel_loc1: gateway.id_nivel_loc1 || '',
            id_nivel_loc2: gateway.id_nivel_loc2 || '',
            id_nivel_loc3: gateway.id_nivel_loc3 || '',
            id_nivel_loc4: gateway.id_nivel_loc4 || ''
        };

        // Todo: Se o Gateway possui endereço fixo para Destino de Ordens de Posição Esperada, gera a Ordem de Posição Esperada
        if (gateway.id_nivel_loc1_destino) {


            const now = moment().toDate();
            const nowPlus30 = new Date(now.getTime() + 30 * 60 * 1000);

            let destino = {
                id_nivel_loc1: gateway.id_nivel_loc1_destino || '',
                id_nivel_loc2: gateway.id_nivel_loc2_destino || '',
                id_nivel_loc3: gateway.id_nivel_loc3_destino || '',
                id_nivel_loc4: gateway.id_nivel_loc4_destino || ''
            };

            let itens = [];
            for (let i = 0; i < _reg.associados.length; i++) {

                itens.push({
                    id_item: _reg.associados[i].id_item || null,
                    id_categoria: _reg.associados[i].id_categoria || null,

                    tag: _reg.associados[i].tag || '',
                    ean: '',
                    rssi: _reg.associados[i].rssi || '',

                    quantidade: 1,
                    status: 'concluido',
                    status_data: now,

                    id_gatweway: _regBase.id_gateway || '',
                    id_colaborador: _regBase.id_colaborador || '',

                    status_destino: 'pendente',
                    status_destino_data: ''
                })

                if (i == _reg.associados.length - 1) {


                    const posicao = await Posicao.create({
                        id_conta: _regBase.id_conta,
                        id_colaborador: _regBase.id_colaborador || '',

                        ativo: '1',
                        id_doc: _regBase._id,
                        descricao: 'Ordem de Posição Esperada (Automática)',
                        icone: 'portal',

                        partida_data: now,
                        tolerancia: 30,

                        previsao_chegada_data: nowPlus30,
                        previsao_chegada_tolerancia: 30,

                        status: 'aberta',
                        status_data: now,

                        id_nivel_loc1: origem.id_nivel_loc1,
                        id_nivel_loc2: origem.id_nivel_loc2,
                        id_nivel_loc3: origem.id_nivel_loc3,
                        id_nivel_loc4: origem.id_nivel_loc4,

                        itens: itens,

                        id_nivel_loc1_destino: destino.id_nivel_loc1,
                        id_nivel_loc2_destino: destino.id_nivel_loc2,
                        id_nivel_loc3_destino: destino.id_nivel_loc3,
                        id_nivel_loc4_destino: destino.id_nivel_loc4,
                    });

                    console.log('✅ gerarOrdem: Ordem de Posição Esperada (Automática) / Destino Coletor, criada ' + _reg.associados[i].tag);
                };
            };

        } else {


            const now = moment().toDate();
            const nowPlus30 = new Date(now.getTime() + 30 * 60 * 1000);

            for (let i = 0; i < _reg.associados.length; i++) {
                const categoriaBase = await Categoria.findOne({ _id: _reg.associados[i].id_categoria }).lean();

                let destino = {
                    id_nivel_loc1: categoriaBase.id_nivel_loc1 || '',
                    id_nivel_loc2: categoriaBase.id_nivel_loc2 || '',
                    id_nivel_loc3: categoriaBase.id_nivel_loc3 || '',
                    id_nivel_loc4: categoriaBase.id_nivel_loc4 || ''
                };


                const posicao = await Posicao.create({
                    id_conta: _regBase.id_conta,
                    id_colaborador: _regBase.id_colaborador || '',

                    ativo: '1',
                    id_doc: _regBase._id,
                    descricao: 'Ordem de Posição Esperada (Automática)',
                    icone: 'portal',

                    partida_data: now,
                    tolerancia: 30,

                    previsao_chegada_data: nowPlus30,
                    previsao_chegada_tolerancia: 30,

                    status: 'aberta',
                    status_data: now,

                    id_nivel_loc1: origem.id_nivel_loc1,
                    id_nivel_loc2: origem.id_nivel_loc2,
                    id_nivel_loc3: origem.id_nivel_loc3,
                    id_nivel_loc4: origem.id_nivel_loc4,

                    itens: [{

                        id_item: _reg.associados[i].id_item || null,
                        id_categoria: _reg.associados[i].id_categoria || null,

                        tag: _reg.associados[i].tag || '',
                        ean: '',
                        rssi: _reg.associados[i].rssi || '',

                        quantidade: 1,
                        status: 'concluido',
                        status_data: now,

                        id_gatweway: _regBase.id_gateway || '',
                        id_colaborador: _regBase.id_colaborador || '',

                        status_destino: 'pendente',
                        status_destino_data: ''

                    }],
                    id_nivel_loc1_destino: destino.id_nivel_loc1,
                    id_nivel_loc2_destino: destino.id_nivel_loc2,
                    id_nivel_loc3_destino: destino.id_nivel_loc3,
                    id_nivel_loc4_destino: destino.id_nivel_loc4,
                });

                console.log('✅ gerarOrdem: Ordem de Posição Esperada (Automática) Destino Item, criada ' + _reg.associados[i].tag);

            };

        }



        // } catch (error) {
        //     console.log('gerarOrdem:1_error' + error);
        //     return;
        // }

    };


    async function _checkInteracao(movimento, _reg) {

        if (!_reg) {
            return
        };


        // Todo: Busca pela Posição
        // Checa-se também se trata-se de entrada ou saida indevida ou nao 
        let posicao
        const inicio = new Date();
        inicio.setHours(0, 0, 0, 0);

        const fim = new Date();
        fim.setHours(23, 59, 59, 999);

        let campoStatus = movimento === 'saida'
            ? { status: "pendente" }
            : { status_destino: "pendente" };

        let filtro = {
            itens: {
                $elemMatch: {
                    id_item: _reg.id_item,
                    ...campoStatus
                }
            }
        };

        if (movimento == 'entrada') {

            filtro.previsao_chegada_data = { $gte: inicio, $lte: fim }

            if (_reg.id_nivel_loc4) {
                filtro.id_nivel_loc1_destino = _reg.id_nivel_loc1;
                filtro.id_nivel_loc2_destino = _reg.id_nivel_loc2;
                filtro.id_nivel_loc3_destino = _reg.id_nivel_loc3;
                filtro.id_nivel_loc4_destino = _reg.id_nivel_loc4;
            }
            // Nível 3 → 2
            else if (_reg.id_nivel_loc3) {
                filtro.id_nivel_loc1_destino = _reg.id_nivel_loc1;
                filtro.id_nivel_loc2_destino = _reg.id_nivel_loc2;
                filtro.id_nivel_loc3_destino = _reg.id_nivel_loc3;
                filtro.id_nivel_loc4_destino = "";
            }
            // Nível 2 → 1
            else if (_reg.id_nivel_loc2) {
                filtro.id_nivel_loc1_destino = _reg.id_nivel_loc1;
                filtro.id_nivel_loc2_destino = _reg.id_nivel_loc2;
                filtro.id_nivel_loc3_destino = "";
                filtro.id_nivel_loc4_destino = "";
            }
            // Nível 1 → 0
            else if (_reg.id_nivel_loc1) {
                filtro.id_nivel_loc1_destino = _reg.id_nivel_loc1;
                filtro.id_nivel_loc2_destino = "";
                filtro.id_nivel_loc3_destino = "";
                filtro.id_nivel_loc4_destino = "";
            }

        } else if (movimento == 'saida') {

            filtro.partida_data = { $gte: inicio, $lte: fim }

            if (_reg.id_nivel_loc4) {
                filtro.id_nivel_loc3 = _reg.id_nivel_loc3;
                filtro.id_nivel_loc4 = "";
            }
            // Nível 3 → 2
            else if (_reg.id_nivel_loc3) {
                filtro.id_nivel_loc3 = _reg.id_nivel_loc3;
                filtro.id_nivel_loc4 = "";
            }
            // Nível 2 → 1
            else if (_reg.id_nivel_loc2) {
                filtro.id_nivel_loc2 = _reg.id_nivel_loc2;
                filtro.id_nivel_loc3 = "";
            }
            // Nível 1 → 0
            else if (_reg.id_nivel_loc1) {
                filtro.id_nivel_loc1 = _reg.id_nivel_loc1;
                filtro.id_nivel_loc2 = "";
            }

        };
        console.log('movimento_reg', _reg);
        console.log('posicaofiltro', filtro);
        posicao = await Posicao.findOne(filtro);
        console.log('posicao', posicao);

        // Todo: Se não houver Posição, trata-se de entrada ou saida indevida
        if (!posicao) {
            movimento == movimento + '_i'
        } else {

            // Todo: Altera o Status da Posição e do Item
            if (movimento == 'entrada') {
                concluirItemPosicaoChegada(posicao, _reg.id_item)
            } else {
                concluirItemPosicao(posicao, _reg.id_item)
            }
        };


        // Todo: Verifica se há Interação para o Endereço do Registro de Leitura
        const query = {};

        if (_reg.id_nivel_loc4) {
            query.id_nivel_loc4 = _reg.id_nivel_loc4;
        } else if (_reg.id_nivel_loc3) {
            query.id_nivel_loc3 = _reg.id_nivel_loc3;
            query.id_nivel_loc4 = { $in: [null, ""] };
        } else if (_reg.id_nivel_loc2) {
            query.id_nivel_loc2 = _reg.id_nivel_loc2;
            query.id_nivel_loc3 = { $in: [null, ""] };
        } else if (_reg.id_nivel_loc1) {
            query.id_nivel_loc1 = _reg.id_nivel_loc1;
            query.id_nivel_loc2 = { $in: [null, ""] };
        }

        let interacao = await Interacao.findOne(query);

        if (!interacao) {
            console.log("checkInteracao:", "Não encontrado");
            return;
        };

        // 🔹 URL correta para OBJECTS
        // const urlSepioo = 'http://localhost:3000/sepioo';
        const urlSepioo = 'https://connectiot-app.azurewebsites.net/sepioo';

        for (let i = 0; i < interacao.acoes.length; i++) {

            // Todo: Verifica se a Ação PDI LED Verde ou Vermelho
            if (interacao.acoes[i].movimento == movimento && (interacao.acoes[i].acao == 'pdi_led_vr' || interacao.acoes[i].acao == 'pdi_led_vm')) {

                let _serialPDI = interacao.acoes[i].serial;
                if (interacao.acoes[i].equipamento == 'pdi_vinculado') {
                    let _item = await Item.findOne({ _id: _reg.id_item });
                    if (_item && _item.vinculos_device && Array.isArray(_item.vinculos_device) && _item.vinculos_device.length > 0 && _item.vinculos_device[0].id_mac) {
                        _serialPDI = _item.vinculos_device[0].id_mac;
                        console.log('Serial PDI:' + _serialPDI);
                    } else {
                        console.log('Item sem vinculos_device válido ou id_mac não encontrado');
                        return;
                    }
                }

                // 🔹 payload padrão da Sepioo
                const payload = {
                    color: interacao.acoes[i].acao == 'pdi_led_vr' ? 'RED' : 'GREEN',
                    pattern: 'FLASH_1_SECOND',
                    duration: interacao.acoes[i].comando ?? 5,
                    durationInMinutes: 0,
                    objectIds: [_serialPDI]
                };

                const axiosFlashOpts = {
                    headers: {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache'
                    },
                    timeout: 12000
                };

                try {
                    axios.post(urlSepioo + '/flash', payload, axiosFlashOpts)
                        .then(async function (res) {
                            await _atualizaInteracaoRegistro(_reg, _serialPDI, 'ok', JSON.stringify(payload), JSON.stringify(res.data));
                        })
                        .catch(async function (err) {
                            await _atualizaInteracaoRegistro(_reg, _serialPDI, 'error', JSON.stringify(payload), JSON.stringify(err.code || err.message));
                        });

                } catch (error) {
                    await _atualizaInteracaoRegistro(_reg, _serialPDI, 'error', JSON.stringify(payload), JSON.stringify(error.code || error.message));
                }

            };

            // Todo: Verifica se a Ação para PDI Display
            if (interacao.acoes[i].movimento == movimento && interacao.acoes[i].acao == 'pdi_display') {

                let _serialPDI = interacao.acoes[i].serial;
                if (interacao.acoes[i].equipamento == 'pdi_vinculado') {
                    let _item = await Item.findOne({ _id: _reg.id_item });
                    if (_item && _item.vinculos_device && Array.isArray(_item.vinculos_device) && _item.vinculos_device.length > 0 && _item.vinculos_device[0].id_mac) {
                        _serialPDI = _item.vinculos_device[0].id_mac;
                        console.log('Serial PDI:' + _serialPDI);
                    } else {
                        console.log('Item sem vinculos_device válido ou id_mac não encontrado');
                        return;
                    }
                };

                const runPdiDisplaySepioo = async function () {
                    try {
                        const responseDisplay = await axios.get(urlSepioo + '/object/' + _serialPDI, {
                            headers: {
                                'Cache-Control': 'no-cache'
                            },
                            timeout: 12000
                        });

                        const rawFields = responseDisplay.data && responseDisplay.data.customFields;

                        let customFields = rawFields && typeof rawFields === 'object'
                            ? Object.assign({}, rawFields)
                            : {};
                        customFields.DESTINO = movimento.includes('_i') ? 'Incorreto' : 'Correto';

                        // customFields =  {
                        //     "SEQUENCE": "921-943",
                        //     "PARTNUMBER": "1 6EA 711 049 \n 2 6EA 711 049 \n 3 6EA 711 049 \n 4 6EA 711 049 \n 5 6EA 711 049 \n 6 6EA 711 049 \n 7 6 EA 711 049",
                        //     "INSERTION": "1 \n 2\n 3\n 4\n 5\n 6\n 7\n 8\n 9\n 10",
                        //     "STATUS": "INICIO",
                        //     "DESTINO": movimento.includes('_i') ? 'Incorreto' : 'Correto'
                        // }

                        const payload = {
                            objectId: _serialPDI,
                            deviceIds: [_serialPDI],
                            customFields
                        };

                        await axios.post(urlSepioo + '/object', payload, {
                            headers: {
                                'Content-Type': 'application/json',
                                'Cache-Control': 'no-cache'
                            },
                            timeout: 12000
                        })
                            .then(async function (res) {
                                await _atualizaInteracaoRegistro(_reg, _serialPDI, 'ok', JSON.stringify(payload), JSON.stringify(res.data));
                            })
                            .catch(async function (err) {
                                await _atualizaInteracaoRegistro(_reg, _serialPDI, 'error', JSON.stringify(payload), JSON.stringify(err.code || err.message));
                            });

                    } catch (error) {
                        if (_serialPDI) {
                            await _atualizaInteracaoRegistro(_reg, _serialPDI, 'error', JSON.stringify(payload), JSON.stringify(error.code || error.message));
                        };
                    }
                };
                runPdiDisplaySepioo();
            };
        };

    };

    async function _atualizaInteracaoRegistro(_reg, _id, status, envio, retorno) {
        _reg.interacoes.push({
            interacao_id: _id,
            interacao_status: status,
            interacao_envio: envio,
            interacao_retorno: retorno
        })
        await _reg.save();
    };

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

    async function concluirItemPosicaoChegada(posicao, id_item) {

        const agora = moment().toDate();

        // 1️⃣ localiza item dentro do array
        const item = posicao.itens.find(i => i.id_item === id_item);
        if (!item) return null;

        // 2️⃣ atualiza os campos do item
        item.status_destino = "concluido";
        item.status_destino_data = agora;

        // 3️⃣ recalcular status geral
        const total = posicao.itens.length;
        const concluidos = posicao.itens.filter(i => i.status_destino === "concluido").length;
        const pendentes = posicao.itens.filter(i => i.status_destino === "pendente").length;

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
    };







































    async function _XcheckAssociacaoBkp(movimento, _reg) {

        let tpAssociacao = 'item';

        function delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        // 1️⃣ Verifica se o SKU LIDO possui associação
        let associacao = await Associacao.findOne({
            id_item: _reg.id_item,
            ativo: '1'
        });

        if (!associacao) {

            tpAssociacao = 'categoria';

            console.log('✔ Associado Qnt ' + _reg.id_categoria)

            // 1️⃣ 1️⃣ Verifica se a ITEM LIDA possui associação
            associacao = await Associacao.findOne({
                id_categoria: _reg.id_categoria,
                ativo: '1'
            });

            if (!associacao) {
                return; // item sem associação
            }

        }

        console.log("checkAssociacao:", associacao._id);

        // 🕒 Aguarda 6 segundos para garantir que as outras leituras chegaram
        console.log("⏳ Associação encontrada, aguardando 6s para confirmar leituras..." + tpAssociacao);


        // 2️⃣ Define intervalo de ±5 segundos
        let base = new Date(_reg.data_permanecia);
        let inicio = new Date(base.getTime() - (associacao.intervalo * 1000) || 5000);
        let fim = new Date(base.getTime() + (associacao.intervalo * 1000) || 5000);
        await delay((associacao.intervalo * 1000) + 3000 || 8000);

        console.log("-> Associação Inicio, checagem ::::::" + tpAssociacao)
        console.log("-> Associação Inicio, checagem ::::::" + associacao.associados)

        // 3️⃣ Percorre os itens associados
        for (let associado of associacao.associados) {

            console.log("-> Associação Inicio, checagem ::::::" + associado.id_categoria)

            if (tpAssociacao == 'item') {

                if (!associado.id_item || associado.id_item === "") continue;

                // Verifica leitura do item associado
                let regAssociado = await Registro.findOne({
                    id_item: associado.id_item,
                    id_gateway: _reg.id_gateway,
                    data_permanecia: { $gte: inicio, $lte: fim }
                });

                let obj = associado.toObject();

                obj.encontrado = null;
                let statusAssociacao = _reg.status
                if (regAssociado) {
                    associado.encontrado = regAssociado.data_permanecia;
                    obj.encontrado = regAssociado.data_permanecia;
                    console.log(`   ✔ Associado ${associado.id_item} encontrado no intervalo`);
                } else {
                    statusAssociacao = 'associacao_erro'
                    console.log(`   ❌ Associado ${associado.id_item} NÃO encontrado no intervalo`);
                }

                _reg.associados.push(obj)

                // 4️⃣ Atualiza o Registro no banco incluindo os associados
                await Registro.updateOne(
                    { _id: _reg._id },
                    {
                        $set: {
                            status: statusAssociacao,
                            associados: _reg.associados
                        }
                    }
                );

            } else {

                console.log("Modo Categoria ::::::" + associado)

                if (!associado.id_categoria || associado.id_categoria === "") continue;

                // Verifica leitura do item associado
                // let regAssociado = await Registro.find({
                //     id_categoria: associado.id_categoria,
                //     id_gateway: _reg.id_gateway,
                //     data_permanecia: { $gte: inicio, $lte: fim }
                // });

                let regAssociado = await Registro.aggregate([
                    {
                        $match: {
                            id_categoria: associado.id_categoria,
                            id_gateway: _reg.id_gateway,
                            data_permanecia: { $gte: inicio, $lte: fim }
                        }
                    },
                    {
                        $sort: { data_permanecia: -1 } // opcional: pega o mais recente
                    },
                    {
                        $group: {
                            _id: "$id_item",
                            registro: { $first: "$$ROOT" }
                        }
                    },
                    {
                        $replaceRoot: { newRoot: "$registro" }
                    }
                ]);

                let statusAssociacao = _reg.status

                console.log('✔ Associado Qnt ' + regAssociado.length + '::' + associado.id_categoria)

                let obj = associado.toObject();
                obj.encontrado = null;
                obj.encontrado_categoria = 0;

                if (regAssociado.length > 0) {

                    associado.encontrado = regAssociado.length;
                    obj.encontrado_categoria = regAssociado.length;;

                    if (regAssociado.length >= associado.quantidade) {
                        console.log(`   ✔ Associado ${associado.id_item} encontrado no intervalo`);
                    } else {
                        statusAssociacao = 'associacao_erro'
                        console.log(`   ❌ Associado ${associado.id_item} QNT encontrado no intervalo`);
                    }

                    // Atençao !! Está filtrando apenas um Item associados, onde poderá ter mais
                    _reg.associados.push(obj)

                } else {
                    statusAssociacao = 'associacao_erro'
                    console.log(`   ❌ Associado ${associado.id_item} NÃO encontrado no intervalo`);
                }



                // 4️⃣ Atualiza o Registro no banco incluindo os associados
                await Registro.updateOne(
                    { _id: _reg._id },
                    {
                        $set: {
                            status: statusAssociacao,
                            associados: _reg.associados
                        }
                    }
                );

                _gerarOrdem(_reg._id)
            };
        };
    };

    async function _XcheckInteracao(movimento, _reg) {

        if (!_reg) {
            return
        };

        //console.log("_checkInteracao: " + movimento + ' ' + _reg.id_nivel_loc1)


        const query = {};

        if (_reg.id_nivel_loc4) {
            query.id_nivel_loc4 = _reg.id_nivel_loc4;
        } else if (_reg.id_nivel_loc3) {
            query.id_nivel_loc3 = _reg.id_nivel_loc3;
            query.id_nivel_loc4 = { $in: [null, ""] };
        } else if (_reg.id_nivel_loc2) {
            query.id_nivel_loc2 = _reg.id_nivel_loc2;
            query.id_nivel_loc3 = { $in: [null, ""] };
        } else if (_reg.id_nivel_loc1) {
            query.id_nivel_loc1 = _reg.id_nivel_loc1;
            query.id_nivel_loc2 = { $in: [null, ""] };
        }

        let interacao = await Interacao.findOne(query);

        //console.log("_checkInteracao_result: " + interacao)

        //checa se trata-se de entrada ou saida indevida ou nao 
        let posicao
        const inicio = new Date();
        inicio.setHours(0, 0, 0, 0);

        const fim = new Date();
        fim.setHours(23, 59, 59, 999);

        let campoStatus = movimento === 'saida'
            ? { status: "pendente" }
            : { status_destino: "pendente" };

        let filtro = {
            itens: {
                $elemMatch: {
                    id_item: _reg.id_item,
                    ...campoStatus
                }
            }
        };

        if (movimento == 'entrada') {

            filtro.previsao_chegada_data = { $gte: inicio, $lte: fim }

            if (_reg.id_nivel_loc4) {
                filtro.id_nivel_loc3_destino = _reg.id_nivel_loc3;
                filtro.id_nivel_loc4_destino = "";
            }
            // Nível 3 → 2
            else if (_reg.id_nivel_loc3) {
                filtro.id_nivel_loc3_destino = _reg.id_nivel_loc3;
                filtro.id_nivel_loc4_destino = "";
            }
            // Nível 2 → 1
            else if (_reg.id_nivel_loc2) {
                filtro.id_nivel_loc2_destino = _reg.id_nivel_loc2;
                filtro.id_nivel_loc3_destino = "";
            }
            // Nível 1 → 0
            else if (_reg.id_nivel_loc1) {
                filtro.id_nivel_loc1_destino = _reg.id_nivel_loc1;
                filtro.id_nivel_loc2_destino = "";
            }

        } else if (movimento == 'saida') {

            filtro.partida_data = { $gte: inicio, $lte: fim }

            if (_reg.id_nivel_loc4) {
                filtro.id_nivel_loc3 = _reg.id_nivel_loc3;
                filtro.id_nivel_loc4 = "";
            }
            // Nível 3 → 2
            else if (_reg.id_nivel_loc3) {
                filtro.id_nivel_loc3 = _reg.id_nivel_loc3;
                filtro.id_nivel_loc4 = "";
            }
            // Nível 2 → 1
            else if (_reg.id_nivel_loc2) {
                filtro.id_nivel_loc2 = _reg.id_nivel_loc2;
                filtro.id_nivel_loc3 = "";
            }
            // Nível 1 → 0
            else if (_reg.id_nivel_loc1) {
                filtro.id_nivel_loc1 = _reg.id_nivel_loc1;
                filtro.id_nivel_loc2 = "";
            }

        }

        console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!filtro: ' + JSON.stringify(filtro));

        posicao = await Posicao.findOne(filtro);
        if (!posicao) {
            movimento == movimento + '_i'
        } else {
            if (movimento == 'entrada') {
                concluirItemPosicaoChegada(posicao, _reg.id_item)
            } else {
                concluirItemPosicao(posicao, _reg.id_item)
            }
        }

        //console.log('_regPosicao:' + posicao + ' >> id_nivel_loc1:' + _reg.id_nivel_loc1 + " >> filtro:" + JSON.stringify(filtro))

        // 🔹 URL correta para OBJECTS
        // const urlSepioo = 'http://localhost:3000/sepioo';
        // const urlSepioo = 'https://connectiot-app.azurewebsites.net/sepioo';
        if (interacao && Array.isArray(interacao.acoes)) {

            for (let i = 0; i < interacao.acoes.length; i++) {

                console.log("_checkInteracao: " + '......>>' + movimento + ' ' + interacao.acoes[i].movimento + ' ' + interacao.acoes[i].acao)

                if (interacao.acoes[i].movimento == movimento && (interacao.acoes[i].acao == 'pdi_led_vr' || interacao.acoes[i].acao == 'pdi_led_vm')) {

                    if (posicao && posicao.itens && Array.isArray(posicao.itens) && posicao.itens.length > 0 && posicao.itens[0].id_item) {
                        // concluirItemPosicao(posicao, posicao.itens[0].id_item)
                    }
                    let _serialPDI = interacao.acoes[i].serial;
                    if (interacao.acoes[i].equipamento == 'pdi_vinculado') {
                        let _item = await Item.findOne({ _id: _reg.id_item });
                        if (_item && _item.vinculos_device && Array.isArray(_item.vinculos_device) && _item.vinculos_device.length > 0 && _item.vinculos_device[0].id_mac) {
                            _serialPDI = _item.vinculos_device[0].id_mac;
                            console.log('Serial PDI:' + _serialPDI);
                        } else {
                            console.log('Item sem vinculos_device válido ou id_mac não encontrado');
                            return;
                        }
                    }

                    // 🔹 payload padrão da Sepioo
                    const payload = {
                        color: interacao.acoes[i].acao == 'pdi_led_vr' ? 'RED' : 'GREEN',
                        pattern: 'FLASH_1_SECOND',
                        duration: interacao.acoes[i].comando ?? 5,
                        durationInMinutes: 0,
                        objectIds: [_serialPDI]
                    };

                    console.log(payload)

                    const axiosFlashOpts = {
                        headers: {
                            'Content-Type': 'application/json',
                            'Cache-Control': 'no-cache'
                        },
                        timeout: 12000
                    };
                    axios.post(urlSepioo + '/flash', payload, axiosFlashOpts)
                        .then(function () {
                            // opcional: console.log('Sepioo /flash ok');
                        })
                        .catch(function (err) {
                            console.error(
                                'Sepioo /flash falhou (não bloqueia o registro):',
                                err.code || err.message,
                                err.response && err.response.status,
                                err.response && err.response.data
                            );
                        });

                }

                if (interacao.acoes[i].movimento == movimento && interacao.acoes[i].acao == 'pdi_display') {

                    let _serialPDI = interacao.acoes[i].serial;
                    if (interacao.acoes[i].equipamento == 'pdi_vinculado') {
                        let _item = await Item.findOne({ _id: _reg.id_item });
                        if (_item && _item.vinculos_device && Array.isArray(_item.vinculos_device) && _item.vinculos_device.length > 0 && _item.vinculos_device[0].id_mac) {
                            _serialPDI = _item.vinculos_device[0].id_mac;
                            console.log('Serial PDI:' + _serialPDI);
                        } else {
                            console.log('Item sem vinculos_device válido ou id_mac não encontrado');
                            return;
                        }
                    }

                    const runPdiDisplaySepioo = async function () {
                        try {
                            const responseDisplay = await axios.get(urlSepioo + '/object/' + _serialPDI, {
                                headers: {
                                    'Cache-Control': 'no-cache'
                                },
                                timeout: 12000
                            });

                            const rawFields = responseDisplay.data && responseDisplay.data.customFields;
                            console.log('Retorno pdi_display:', rawFields);

                            const customFields = rawFields && typeof rawFields === 'object'
                                ? Object.assign({}, rawFields)
                                : {};
                            // customFields.DESTINO = movimento.includes('_i') ? 'Incorreto' : 'Correto';

                            customFields = {
                                "SEQUENCE": "921-943",
                                "PARTNUMBER": "1 6EA 711 049 \n 2 6EA 711 049 \n 3 6EA 711 049 \n 4 6EA 711 049 \n 5 6EA 711 049 \n 6 6EA 711 049 \n 7 6 EA 711 049",
                                "INSERTION": "1 \n 2\n 3\n 4\n 5\n 6\n 7\n 8\n 9\n 10",
                                "STATUS": "INICIO",
                                "DESTINO": movimento.includes('_i') ? 'Incorreto' : 'Correto'
                            }

                            const payload = {
                                objectId: _serialPDI,
                                deviceIds: [_serialPDI],
                                customFields
                            };

                            await axios.post(urlSepioo + '/object', payload, {
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Cache-Control': 'no-cache'
                                },
                                timeout: 12000
                            });

                        } catch (error) {
                            console.error(
                                'pdi_display Sepioo falhou (não bloqueia o registro):',
                                error && error.response && error.response.data ? error.response.data : (error && error.message)
                            );
                        }
                    };
                    runPdiDisplaySepioo();
                }



                // if (interacao.acoes[i].movimento == 'entrada' || interacao.acoes[i].movimento == 'entrada_i') {
                // } else if (interacao.acoes[i].movimento == 'saida' || interacao.acoes[i].movimento == 'saida_i') {
                //}
            }
        }


    }




    async function _checkAlerta(_reg) {

        try {

            // Envia notificação externa (ex: WhatsApp) conforme tipo de alerta
            const enviarNotificacaoAlerta = async (tipoAlerta, itensLocal, referencia, alertaDoc, regAtual) => {
                try {
                    // Ajuste aqui se o número de destino variar por conta / alerta
                    const telefoneDestino = "553192912523";

                    // Monta descrição das localizações (níveis)
                    let descricaoLoc = "";
                    try {
                        const partes = [];
                        if (regAtual?.id_nivel_loc1) {
                            const n1 = await Localizacao.findById(regAtual.id_nivel_loc1);
                            if (n1) partes.push(n1.descricao);
                        }
                        if (regAtual?.id_nivel_loc2) {
                            const n2 = await Localizacao.findById(regAtual.id_nivel_loc2);
                            if (n2) partes.push(n2.descricao);
                        }
                        if (regAtual?.id_nivel_loc3) {
                            const n3 = await Localizacao.findById(regAtual.id_nivel_loc3);
                            if (n3) partes.push(n3.descricao);
                        }
                        if (regAtual?.id_nivel_loc4) {
                            const n4 = await Localizacao.findById(regAtual.id_nivel_loc4);
                            if (n4) partes.push(n4.descricao);
                        }
                        if (partes.length > 0) {
                            descricaoLoc = ` Localização: ${partes.join(" > ")}.`;
                        }
                    } catch (e) {
                        console.error("Erro ao montar descrição de localização para alerta:", e.message);
                    }

                    let mensagemBase = "Olá, sou o bot da Seal RTI! ";

                    if (tipoAlerta === "tol_max") {
                        mensagemBase += `Alerta de TOLERÂNCIA MÁXIMA excedida. Local com ${itensLocal.length} itens, limite configurado: ${referencia}.${descricaoLoc}`;
                    } else if (tipoAlerta === "tol_min") {
                        mensagemBase += `Alerta de TOLERÂNCIA MÍNIMA não atingida. Local com ${itensLocal.length} itens, mínimo configurado: ${referencia}.${descricaoLoc}`;
                    } else if (tipoAlerta === "itens_fixo") {
                        mensagemBase += `Alerta de QUANTIDADE FIXA divergente. Local com ${itensLocal.length} itens, quantidade esperada: ${referencia}.${descricaoLoc}`;
                    } else {
                        mensagemBase += `Alerta detectado do tipo: ${tipoAlerta}.${descricaoLoc}`;
                    }

                    // Pode enriquecer com mais dados do registro / localização
                    const payload = {
                        to: telefoneDestino,
                        message: mensagemBase
                    };

                    await axios.post(
                        "http://ec2-44-204-148-169.compute-1.amazonaws.com:3333/send/16apps",
                        payload,
                        { timeout: 8000 }
                    );

                    console.log("📲 Notificação de alerta enviada:", payload);
                } catch (err) {
                    console.error("Erro ao enviar notificação de alerta:", err.message);
                }
            };

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
                            itensLocal = await Item.find({ id_nivel_loc3: _reg.id_nivel_loc3, id_nivel_loc4: "" }); //null  
                        } else if (_reg.id_nivel_loc2) {
                            itensLocal = await Item.find({ id_nivel_loc2: _reg.id_nivel_loc2, id_nivel_loc3: "" }); //null  
                        } else if (_reg.id_nivel_loc1) {
                            itensLocal = await Item.find({ id_nivel_loc1: _reg.id_nivel_loc1, id_nivel_loc2: "" }); //null  
                        };

                        if (alerta.acoes[i].acao == 'tol_max') {
                            console.log('tol_max:' + alerta.acoes[i].referencia[0].valor + ' tol_itens: ' + itensLocal.length)
                            if (itensLocal.length > alerta.acoes[i].referencia[0].valor) {
                                _reg.alerta = alerta.acoes[i].acao
                                console.log('alerta_tol_max')
                                await enviarNotificacaoAlerta(
                                    'tol_max',
                                    itensLocal,
                                    alerta.acoes[i].referencia[0].valor,
                                    alerta,
                                    _reg
                                );
                            }

                        } else if (alerta.acoes[i].acao == 'tol_min') {
                            console.log('tol_min:' + alerta.acoes[i].referencia[0].valor + ' tol_itens: ' + itensLocal.length)
                            if (itensLocal.length < alerta.acoes[i].referencia[0].valor) {
                                _reg.alerta = alerta.acoes[i].acao
                                console.log('alerta_tol_min')
                                await enviarNotificacaoAlerta(
                                    'tol_min',
                                    itensLocal,
                                    alerta.acoes[i].referencia[0].valor,
                                    alerta,
                                    _reg
                                );
                            }

                        } else if (alerta.acoes[i].acao == 'itens_fixo') {
                            console.log('itens_fixo:' + alerta.acoes[i].referencia.length + ' tol_itens: ' + itensLocal.length)
                            if (itensLocal.length != alerta.acoes[i].referencia.length) {
                                _reg.alerta = alerta.acoes[i].acao
                                console.log('alerta_itens_fixo')
                                await enviarNotificacaoAlerta(
                                    'itens_fixo',
                                    itensLocal,
                                    alerta.acoes[i].referencia.length,
                                    alerta,
                                    _reg
                                );
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

    cron.schedule('*/5 * * * * *', async () => {
        await verificarItensSemLeituraGlobal();
    });
    // cron.schedule('2-59/5 * * * * *', async () => {
    //     await verificarItensSemLeituraGlobal();
    // });

    async function verificarItensSemLeituraGlobal() {

        const itens = await Item.find({ mov_tracking: 1 });
        const agora = moment();

        for (const item of itens) {

            const dataUltima = item.registro_atual?.data_permanecia || item.updatedAt;
            if (!dataUltima) continue;

            const diffSegundos = agora.diff(moment(dataUltima), 'seconds');

            if (diffSegundos > 5) {

                if (item.status !== 'perda') {

                    await Item.updateOne(
                        { _id: item._id },
                        {
                            $set: {
                                status: 'perda',
                                id_nivel_loc1: null,
                                id_nivel_loc2: null,
                                id_nivel_loc3: null,
                                id_nivel_loc4: null
                            }
                        }
                    );

                    console.log(`🚨 Item ${item.tag} sem leitura há ${diffSegundos}s`);

                    // aqui você pode:
                    // - disparar evento
                    // - enviar webhook
                    // - notificar IA
                }
            }
        }
    }


    console.log('schedule')
    cron.schedule('*/5 * * * * *', async () => { // */5 segundos
        // console.log('⏱️ Executando verificarAlertasSair() -', new Date().toLocaleTimeString());
        await verificarAlertasSair();
    });

    // cron.schedule('*/5 * * * * *', async () => {
    //     await verificarAlertasSair();
    // });


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

                    if (item.tag == 'C3:00:00:44:8A:D6') {
                        // console.log("1::::" + item.status)
                    }

                    let novoStatus = item.status;
                    const diffSegundos = agora.diff(moment(dataPermanecia), 'seconds');

                    if (item.tag == 'C3:00:00:44:8A:D6') {
                        // console.log("2::::" + item.mov_tracking + ":::" + novoStatus)
                    }
                    if (item.mov_tracking === 1) {
                        novoStatus = diffSegundos > tempoLimiteSegundos ? 'perda' : 'ativo';
                    };

                    // 🔍 Caso esteja em perda de sinal, verificar registro e correlacionar colaborador
                    if (novoStatus === 'perda') {

                        // ✍️ Atualiza status do item se mudou
                        if (item.status !== novoStatus) {

                            await Item.updateOne(
                                { _id: item._id },
                                { $set: { status: novoStatus } }
                            );
                            _checkInteracao('saida', item.registro_atual)
                            console.log(`🔄 Item ${item._id} -> ${novoStatus} (${diffSegundos}s)`);
                        }

                        // ✅ Verifica correlação com associação



                        // ✅ Verifica correlação com colaborador
                        const base = moment(dataPermanecia);
                        const inicioJanela = base.clone().subtract(30, 'seconds').toDate();
                        const fimJanela = base.clone().add(30, 'seconds').toDate();

                        // Busca o ultimo registro do item
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
                                $cond: [{ $ne: ['$status', 'ativo'] }, 1, 0]
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



    const importarCsvItensHandler = async (req, res) => {
        try {
            const { id_conta, itens } = req.body; // o front envia { id_conta, itens: [...] }

            const resultados = [];

            for (const linha of itens) {
                const {
                    tag,
                    id_interno,
                    categoria,
                    categoria_item,
                    categoria_item_epc,
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
                    loc_nivel4,
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
                // 1️⃣ Verificar / criar / atualizar Categoria Item
                // =====================================================
                let cat_item = await CategoriaItem.findOne({ id_conta, descricao: categoria_item });
                if (!cat_item) {
                    cat_item = await CategoriaItem.create({
                        id_conta,
                        descricao: categoria_item,
                        tag: categoria_item_epc,
                    });
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
                let item = await Item.findOne({ id_conta, tag: tag });

                const dadosItem = {
                    id_conta,
                    id_categoria: cat._id,
                    id_categoria_reg1: cat_item._id,
                    tag: tag,
                    descricao: categoria,
                    inf_compl1: inf1,
                    inf_compl2: inf2,
                    inf_compl3: inf3,
                    inf_compl4: inf4,
                    id_nivel_loc1: id_loc1,
                    id_nivel_loc2: id_loc2,
                    id_nivel_loc3: id_loc3,
                    id_nivel_loc4: id_loc4,
                    mov_livre: 0,
                    mov_tracking: 0,
                };

                if (item) {
                    // Atualiza o existente
                    await Item.updateOne({ _id: item._id }, { $set: dadosItem });
                    resultados.push({ tag: tag, acao: 'atualizado', id: item._id });
                } else {
                    // Cria novo
                    const novo = await Item.create(dadosItem);
                    resultados.push({ tag: tag, acao: 'criado', id: novo._id });
                }
            }

            res.json({ success: true, total: resultados.length, resultados });
        } catch (err) {
            console.error('Erro ao importar itens:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    };

    app.post('/_bd/importar-csv-itens', importarCsvItensHandler);
    app.post('/register/skus', importarCsvItensHandler);

    app.get('/_bd/item/preencher-inf-complementares', async (req, res) => {
        try {
            const { id_conta, id_item } = req.query;

            if (!id_conta && !id_item) {
                return res.status(400).json({
                    success: false,
                    error: 'Informe id_conta ou id_item'
                });
            }

            const filtroItens = {
                id_categoria: { $exists: true, $ne: null, $ne: '' }
            };
            if (id_conta) filtroItens.id_conta = id_conta;
            if (id_item) filtroItens._id = id_item;

            const itens = await Item.find(filtroItens)
                .select('_id id_conta id_categoria inf_compl1 inf_compl2 inf_compl3 inf_compl4')
                .lean();

            if (!itens.length) {
                return res.json({
                    success: true,
                    total_itens_lidos: 0,
                    total_itens_atualizados: 0
                });
            }

            const categoriaIds = [...new Set(itens.map((i) => i.id_categoria).filter(Boolean))];
            const contasIds = [...new Set(itens.map((i) => i.id_conta).filter(Boolean))];

            const filtroCategorias = {
                _id: { $in: categoriaIds }
            };
            if (id_conta) {
                filtroCategorias.id_conta = id_conta;
            } else if (contasIds.length) {
                filtroCategorias.id_conta = { $in: contasIds };
            }

            const categorias = await Categoria.find({
                ...filtroCategorias
            }).select('_id id_conta valor_labelInf1 valor_labelInf2 valor_labelInf3 valor_labelInf4').lean();

            const categoriaByIdConta = new Map(
                categorias.map((c) => [`${c._id}::${c.id_conta}`, c])
            );

            const isVazio = (valor) => valor === undefined || valor === null || String(valor).trim() === '';

            const operacoes = [];
            for (const item of itens) {
                const categoria = categoriaByIdConta.get(`${item.id_categoria}::${item.id_conta}`);
                if (!categoria) continue;

                const set = {};
                if (isVazio(item.inf_compl1) && !isVazio(categoria.valor_labelInf1)) set.inf_compl1 = categoria.valor_labelInf1;
                if (isVazio(item.inf_compl2) && !isVazio(categoria.valor_labelInf2)) set.inf_compl2 = categoria.valor_labelInf2;
                if (isVazio(item.inf_compl3) && !isVazio(categoria.valor_labelInf3)) set.inf_compl3 = categoria.valor_labelInf3;
                if (isVazio(item.inf_compl4) && !isVazio(categoria.valor_labelInf4)) set.inf_compl4 = categoria.valor_labelInf4;

                if (Object.keys(set).length > 0) {
                    operacoes.push({
                        updateOne: {
                            filter: { _id: item._id },
                            update: { $set: set }
                        }
                    });
                }
            }

            if (!operacoes.length) {
                return res.json({
                    success: true,
                    total_itens_lidos: itens.length,
                    total_itens_atualizados: 0
                });
            }

            const bulkResult = await Item.bulkWrite(operacoes, { ordered: false });

            return res.json({
                success: true,
                total_itens_lidos: itens.length,
                total_itens_atualizados: bulkResult.modifiedCount || 0
            });
        } catch (err) {
            console.error('Erro ao preencher inf_compl com valores da categoria:', err);
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
    });

    // Itens sem id_categoria_reg1 → copia id_nivel_cat1 da Categoria (SKU) vinculada
    app.get('/_bd/item/alinhar-categoria-reg1', async (req, res) => {
        try {
            const { id_conta } = req.query;

            if (!id_conta) {
                return res.status(400).json({
                    success: false,
                    error: 'Informe id_conta'
                });
            }

            const isVazio = (valor) =>
                valor === undefined || valor === null || String(valor).trim() === '';

            const itens = await Item.find({
                id_conta,
                id_categoria: { $exists: true, $nin: [null, ''] },
                $or: [
                    { id_categoria_reg1: { $exists: false } },
                    { id_categoria_reg1: null },
                    { id_categoria_reg1: '' }
                ]
            }).select('_id id_categoria id_categoria_reg1').lean();

            if (!itens.length) {
                return res.json({
                    success: true,
                    total_itens_lidos: 0,
                    total_itens_atualizados: 0
                });
            }

            const categoriaIds = [...new Set(itens.map((i) => i.id_categoria).filter(Boolean))];
            const categorias = await Categoria.find({
                id_conta,
                _id: { $in: categoriaIds },
                id_nivel_cat1: { $exists: true, $nin: [null, ''] }
            }).select('_id id_nivel_cat1').lean();

            const catById = new Map(categorias.map((c) => [c._id, c]));

            const operacoes = [];
            for (const it of itens) {
                const cat = catById.get(it.id_categoria);
                if (!cat || isVazio(cat.id_nivel_cat1)) continue;
                if (!isVazio(it.id_categoria_reg1)) continue;

                operacoes.push({
                    updateOne: {
                        filter: { _id: it._id },
                        update: { $set: { id_categoria_reg1: cat.id_nivel_cat1 } }
                    }
                });
            }

            if (!operacoes.length) {
                return res.json({
                    success: true,
                    total_itens_lidos: itens.length,
                    total_itens_atualizados: 0
                });
            }

            const bulkResult = await Item.bulkWrite(operacoes, { ordered: false });

            return res.json({
                success: true,
                total_itens_lidos: itens.length,
                total_itens_atualizados: bulkResult.modifiedCount || 0
            });
        } catch (err) {
            console.error('Erro ao alinhar id_categoria_reg1 dos itens:', err);
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
    });

    app.post('/_bd/importar-csv-secundarios', async (req, res) => {
        try {
            const { id_conta, itens } = req.body; // o front envia { id_conta, itens: [...] }

            const resultados = [];

            for (const linha of itens) {
                const {
                    categoria,
                    ean,
                    categoria_item,
                    categoria_epc
                } = linha;

                // =====================================================
                // 1️⃣ Verificar / criar / atualizar Categoria
                // =====================================================
                let cat = await Categoria.findOne({ id_conta, descricao: categoria });
                if (!cat) {
                    cat = await Categoria.create({
                        id_conta,
                        descricao: categoria,
                        ean: ean,
                        // labelInf1: label1,
                        // labelInf2: label2,
                        // labelInf3: label3,
                        // labelInf4: label4
                    });
                } else {
                    // Atualiza labels se mudou
                    const atualiza = {
                        // labelInf1: label1,
                        // labelInf2: label2,
                        // labelInf3: label3,
                        // labelInf4: label4
                    };
                    await Categoria.updateOne({ _id: cat._id }, { $set: atualiza });
                }

                // =====================================================
                // 1️⃣ Verificar / criar / atualizar Categoria Item
                // =====================================================
                let cat_item = await CategoriaItem.findOne({ id_conta, descricao: categoria_item });
                if (!cat_item) {
                    cat_item = await CategoriaItem.create({
                        id_conta,
                        descricao: categoria_item,
                        tag: categoria_epc,
                    });
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
                        _id: '$id_nivel_loc1',
                        total_itens: { $sum: 1 },
                        ativos: {
                            $sum: {
                                $cond: [{ $eq: ['$status', 'ativo'] }, 1, 0]
                            }
                        },
                        perca: {
                            $sum: {
                                $cond: [{ $ne: ['$status', 'ativo'] }, 1, 0]
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

    app.get('/posicao/buscar-destino', async (req, res) => {
        const Posicao = require('../models/posicao');
        const {
            id_nivel_loc1_destino,
            id_nivel_loc2_destino,
            id_nivel_loc3_destino,
            id_nivel_loc4_destino,
            tag
        } = req.query;

        console.log(req.query);

        try {

            let filtro = { $and: [] };

            if (id_nivel_loc1_destino) filtro.$and.push({ id_nivel_loc1_destino });
            if (id_nivel_loc2_destino) filtro.$and.push({ id_nivel_loc2_destino });
            if (id_nivel_loc3_destino) filtro.$and.push({ id_nivel_loc3_destino });
            if (id_nivel_loc4_destino) filtro.$and.push({ id_nivel_loc4_destino });

            filtro.$and.push({
                itens: {
                    $elemMatch: {
                        tag: tag,
                        $or: [
                            { status_destino: "pendente" },
                            { status_destino: "" },
                            { status_destino: null },
                            { status_destino: { $exists: false } }
                        ]
                    }
                }
            });

            if (filtro.$and.length === 1) {
                filtro = filtro.$and[0];
            }

            const posicao = await Posicao.findOne(filtro);

            if (!posicao) {
                return res.status(404).send({ message: "Nenhum registro encontrado" });
            }

            return res.status(200).send(posicao);

        } catch (e) {
            console.error(e);
            return res.status(400).send({ error: true, message: e.toString() });
        }
    });

    // Portal: localiza ordem de posição por tag pendente (+ níveis do gateway, se houver)
    app.get('/posicao/por-tag-pendente', async (req, res) => {
        const Posicao = require('../models/posicao');
        const {
            tag,
            id_conta,
            id_nivel_loc1,
            id_nivel_loc2,
            id_nivel_loc3,
            id_nivel_loc4
        } = req.query;

        if (!tag) {
            return res.status(400).json({ ok: false, message: 'Tag não informada.' });
        }

        try {
            let filtro = { $and: [] };

            if (id_conta) filtro.$and.push({ id_conta });
            if (id_nivel_loc1) filtro.$and.push({ id_nivel_loc1 });
            if (id_nivel_loc2) filtro.$and.push({ id_nivel_loc2 });
            if (id_nivel_loc3) filtro.$and.push({ id_nivel_loc3 });
            if (id_nivel_loc4) filtro.$and.push({ id_nivel_loc4 });

            filtro.$and.push({
                itens: {
                    $elemMatch: {
                        tag: tag,
                        status: 'pendente'
                    }
                }
            });

            const query = filtro.$and.length === 1 ? filtro.$and[0] : filtro;
            const posicao = await Posicao.findOne(query).sort({ createdAt: -1 });

            if (!posicao) {
                return res.status(404).json({ ok: false, message: 'Nenhuma posição encontrada para a tag informada.' });
            }

            return res.status(200).json({ ok: true, posicao });
        } catch (e) {
            console.error('[posicao/por-tag-pendente]', e);
            return res.status(400).json({ ok: false, message: e.toString() });
        }
    });

    /**
     * Portal checagem_multipla: atende uma tag individualmente na ordem (não carrega a ordem inteira).
     * POST /posicao/atender-tag
     * Body: { tag, id_conta, id_nivel_loc1..4, id_gateway, rssi }
     * - pendente → conclui item (update atômico); recalcula parcial/concluido
     * - já concluído → reabre como pendente (update atômico) e recalcula o pedido
     * - não encontrada → not_found (portal trata como excedente visual)
     */
    app.post('/posicao/atender-tag', async (req, res) => {
        const Posicao = require('../models/posicao');
        const {
            tag,
            id_conta,
            id_nivel_loc1,
            id_nivel_loc2,
            id_nivel_loc3,
            id_nivel_loc4,
            id_gateway,
            rssi
        } = req.body || {};

        const tagRaw = String(tag || '').trim();
        if (!tagRaw) {
            return res.status(400).json({ ok: false, message: 'Tag não informada.' });
        }

        function normalizaTagPos(valor) {
            if (valor == null) return '';
            return String(valor).replace(/[^0-9A-Za-z]/g, '').toUpperCase();
        }

        const chave = normalizaTagPos(tagRaw);
        const tagsCandidatas = [...new Set([tagRaw, chave].filter(Boolean))];

        function montarFiltroBase() {
            const filtro = { $and: [] };
            if (id_conta) filtro.$and.push({ id_conta });
            if (id_nivel_loc1) filtro.$and.push({ id_nivel_loc1 });
            if (id_nivel_loc2) filtro.$and.push({ id_nivel_loc2 });
            if (id_nivel_loc3) filtro.$and.push({ id_nivel_loc3 });
            if (id_nivel_loc4) filtro.$and.push({ id_nivel_loc4 });
            return filtro;
        }

        function acharItem(posicao) {
            return (posicao.itens || []).find((it) => {
                const t = normalizaTagPos(it.tag);
                return t && (t === chave || tagsCandidatas.indexOf(String(it.tag || '')) >= 0);
            }) || null;
        }

        function statusOrdemPorItens(itens) {
            const lista = itens || [];
            const todosConcluidos = lista.length > 0 && lista.every((it) => it.status === 'concluido');
            const algumConcluido = lista.some((it) => it.status === 'concluido');
            if (todosConcluidos) return 'concluido';
            if (algumConcluido) return 'parcial';
            return 'pendente';
        }

        async function recalcularStatusOrdemAtomico(idPosicao) {
            const atual = await Posicao.findById(idPosicao).lean();
            if (!atual) return null;
            const novoStatus = statusOrdemPorItens(atual.itens);
            await Posicao.updateOne(
                { _id: idPosicao },
                { $set: { status: novoStatus, status_data: new Date() } }
            );
            return { ...atual, status: novoStatus };
        }

        try {
            let posicao = null;
            let item = null;
            let tagMatch = tagRaw;

            // 1) Prefere item ainda pendente
            for (const tagBusca of tagsCandidatas) {
                const filtro = montarFiltroBase();
                filtro.$and.push({
                    itens: { $elemMatch: { tag: tagBusca, status: 'pendente' } }
                });
                const query = filtro.$and.length === 1 ? filtro.$and[0] : filtro;
                posicao = await Posicao.findOne(query).sort({ createdAt: -1 }).lean();
                if (posicao) {
                    item = acharItem(posicao);
                    if (item && item.status === 'pendente') {
                        tagMatch = String(item.tag || tagBusca);
                        break;
                    }
                    posicao = null;
                    item = null;
                }
            }

            // 2) Já lida / qualquer status (reabrir)
            if (!posicao) {
                for (const tagBusca of tagsCandidatas) {
                    const filtro = montarFiltroBase();
                    filtro.$and.push({
                        itens: { $elemMatch: { tag: tagBusca } }
                    });
                    const query = filtro.$and.length === 1 ? filtro.$and[0] : filtro;
                    posicao = await Posicao.findOne(query).sort({ createdAt: -1 }).lean();
                    if (posicao) {
                        item = acharItem(posicao);
                        if (item) {
                            tagMatch = String(item.tag || tagBusca);
                            break;
                        }
                        posicao = null;
                        item = null;
                    }
                }
            }

            if (!posicao || !item) {
                return res.status(200).json({
                    ok: true,
                    resultado: 'not_found',
                    message: 'Nenhuma ordem encontrada para a tag.'
                });
            }

            const horaAnterior = item.status_data || null;
            const agora = new Date();
            const setItem = {
                'itens.$.status_data': agora
            };
            if (rssi != null && rssi !== '') setItem['itens.$.rssi'] = String(rssi);
            if (id_gateway) setItem['itens.$.id_gatweway'] = String(id_gateway);

            // Relida: item já concluído → reabre como pendente (atômico)
            if (item.status === 'concluido') {
                setItem['itens.$.status'] = 'pendente';
                const upd = await Posicao.updateOne(
                    {
                        _id: posicao._id,
                        itens: { $elemMatch: { tag: tagMatch, status: 'concluido' } }
                    },
                    { $set: setItem }
                );

                if (!upd.matchedCount && !upd.n) {
                    // Outra request já alterou — relê estado atual
                    const atual = await recalcularStatusOrdemAtomico(posicao._id);
                    const itemAtual = atual ? acharItem(atual) : null;
                    return res.status(200).json({
                        ok: true,
                        resultado: itemAtual && itemAtual.status === 'pendente' ? 'reaberto' : 'atendido',
                        message: 'Estado atualizado por outra leitura concorrente.',
                        posicao: {
                            id_posicao: posicao._id,
                            id_doc: (atual && atual.id_doc) || posicao.id_doc || '',
                            descricao: (atual && atual.descricao) || posicao.descricao || '',
                            tipo: (atual && atual.tipo) || posicao.tipo || '',
                            status: (atual && atual.status) || posicao.status,
                            total_itens: ((atual && atual.itens) || []).length,
                            pendentes: ((atual && atual.itens) || []).filter((it) => it.status === 'pendente').length,
                            concluidos: ((atual && atual.itens) || []).filter((it) => it.status === 'concluido').length
                        },
                        item: {
                            tag: tagMatch,
                            status: (itemAtual && itemAtual.status) || 'pendente',
                            status_data: (itemAtual && itemAtual.status_data) || agora,
                            id_item: (itemAtual && itemAtual.id_item) || item.id_item || null
                        },
                        lida_em_anterior: horaAnterior
                    });
                }

                const atual = await recalcularStatusOrdemAtomico(posicao._id);
                const itensReab = (atual && atual.itens) || [];
                return res.status(200).json({
                    ok: true,
                    resultado: 'reaberto',
                    message: 'Item reaberto como pendente. Status do pedido atualizado.',
                    posicao: {
                        id_posicao: posicao._id,
                        id_doc: (atual && atual.id_doc) || posicao.id_doc || '',
                        descricao: (atual && atual.descricao) || posicao.descricao || '',
                        tipo: (atual && atual.tipo) || posicao.tipo || '',
                        status: (atual && atual.status) || 'pendente',
                        total_itens: itensReab.length,
                        pendentes: itensReab.filter((it) => it.status === 'pendente').length,
                        concluidos: itensReab.filter((it) => it.status === 'concluido').length
                    },
                    item: {
                        tag: tagMatch,
                        status: 'pendente',
                        status_data: agora,
                        id_item: item.id_item || null
                    },
                    lida_em_anterior: horaAnterior
                });
            }

            // Atende item pendente (update atômico no item — evita corrida entre tags)
            setItem['itens.$.status'] = 'concluido';
            const upd = await Posicao.updateOne(
                {
                    _id: posicao._id,
                    itens: { $elemMatch: { tag: tagMatch, status: 'pendente' } }
                },
                { $set: setItem }
            );

            const matched = (upd.matchedCount != null ? upd.matchedCount : upd.n) || 0;
            if (!matched) {
                // Já foi concluído por outra request concorrente
                const atual = await recalcularStatusOrdemAtomico(posicao._id);
                const itemAtual = atual ? acharItem(atual) : null;
                const itens = (atual && atual.itens) || [];
                return res.status(200).json({
                    ok: true,
                    resultado: 'atendido',
                    message: 'Item já atendido (leitura concorrente).',
                    posicao: {
                        id_posicao: posicao._id,
                        id_doc: (atual && atual.id_doc) || posicao.id_doc || '',
                        descricao: (atual && atual.descricao) || posicao.descricao || '',
                        tipo: (atual && atual.tipo) || posicao.tipo || '',
                        status: (atual && atual.status) || posicao.status,
                        total_itens: itens.length,
                        pendentes: itens.filter((it) => it.status === 'pendente').length,
                        concluidos: itens.filter((it) => it.status === 'concluido').length
                    },
                    item: {
                        tag: tagMatch,
                        status: (itemAtual && itemAtual.status) || 'concluido',
                        status_data: (itemAtual && itemAtual.status_data) || agora,
                        id_item: (itemAtual && itemAtual.id_item) || item.id_item || null
                    }
                });
            }

            const atual = await recalcularStatusOrdemAtomico(posicao._id);
            const itens = (atual && atual.itens) || [];
            const todosConcluidos = itens.length > 0 && itens.every((it) => it.status === 'concluido');

            return res.status(200).json({
                ok: true,
                resultado: 'atendido',
                message: todosConcluidos
                    ? 'Item atendido. Ordem concluída.'
                    : 'Item atendido na ordem.',
                posicao: {
                    id_posicao: posicao._id,
                    id_doc: (atual && atual.id_doc) || posicao.id_doc || '',
                    descricao: (atual && atual.descricao) || posicao.descricao || '',
                    tipo: (atual && atual.tipo) || posicao.tipo || '',
                    status: (atual && atual.status) || (todosConcluidos ? 'concluido' : 'parcial'),
                    total_itens: itens.length,
                    pendentes: itens.filter((it) => it.status === 'pendente').length,
                    concluidos: itens.filter((it) => it.status === 'concluido').length
                },
                item: {
                    tag: tagMatch,
                    status: 'concluido',
                    status_data: agora,
                    id_item: item.id_item || null
                }
            });
        } catch (e) {
            console.error('[posicao/atender-tag]', e);
            return res.status(400).json({ ok: false, message: e.toString() });
        }
    });

    app.patch('/_app/check-tag', async (req, res) => {
        res.header("Access-Control-Allow-Origin", "*");

        try {



            const { tag, ...dados } = req.body;

            if (!tag) {
                return res.status(400).send({ error: "TAG não informada" });
            }

            // findOne + update + create
            const item = await Item.findOneAndUpdate(
                { tag: tag },   // filtro
                { tag, ...dados }, // atualiza ou insere
                { new: true, upsert: true }
            );

            return res.status(200).send(item);

        } catch (err) {
            console.log(err);
            return res.status(400).send([{ error: err }]);
        }
    });

    app.get('/posicao/item/:id_item', async (req, res) => {
        const Posicao = require('../models/posicao');
        const id_item = req.params.id_item;

        try {
            const result = await Posicao.aggregate([

                // Guarda o array completo de itens da posição (antes do unwind)
                { $addFields: { _itens_posicao: '$itens' } },

                // Explode o array de itens
                { $unwind: '$itens' },

                // Filtra apenas itens do ID desejado
                { $match: { 'itens.id_item': id_item } },

                // Lookup da localização origem
                //{
                //     $lookup: {
                //         from: 'localizacaos',
                //         localField: 'id_nivel_loc1',
                //         foreignField: '_id',
                //         as: 'localizacao_origem'
                //     }
                // },

                {
                    $lookup: {
                        from: 'localizacaos',
                        localField: 'id_nivel_loc1',
                        foreignField: '_id',
                        as: 'origem_n1'
                    }
                },
                {
                    $lookup: {
                        from: 'localizacaos',
                        localField: 'id_nivel_loc2',
                        foreignField: '_id',
                        as: 'origem_n2'
                    }
                },
                {
                    $lookup: {
                        from: 'localizacaos',
                        localField: 'id_nivel_loc3',
                        foreignField: '_id',
                        as: 'origem_n3'
                    }
                },
                {
                    $lookup: {
                        from: 'localizacaos',
                        localField: 'id_nivel_loc4',
                        foreignField: '_id',
                        as: 'origem_n4'
                    }
                },

                // Lookup da localização destino
                {
                    $lookup: {
                        from: 'localizacaos',
                        localField: 'id_nivel_loc1_destino',
                        foreignField: '_id',
                        as: 'destino_n1'
                    }
                },
                {
                    $lookup: {
                        from: 'localizacaos',
                        localField: 'id_nivel_loc2_destino',
                        foreignField: '_id',
                        as: 'destino_n2'
                    }
                },
                {
                    $lookup: {
                        from: 'localizacaos',
                        localField: 'id_nivel_loc3_destino',
                        foreignField: '_id',
                        as: 'destino_n3'
                    }
                },
                {
                    $lookup: {
                        from: 'localizacaos',
                        localField: 'id_nivel_loc4_destino',
                        foreignField: '_id',
                        as: 'destino_n4'
                    }
                },

                // Lookup do gateway
                {
                    $lookup: {
                        from: 'gateways',
                        localField: 'itens.id_gatweway',
                        foreignField: '_id',
                        as: 'gateway'
                    }
                },

                // Lookup do colaborador
                {
                    $lookup: {
                        from: 'colaboradors',
                        localField: 'itens.id_colaborador',
                        foreignField: '_id',
                        as: 'colaborador'
                    }
                },

                // Lookup da categoria principal
                {
                    $lookup: {
                        from: 'categorias',
                        localField: 'itens.id_categoria',
                        foreignField: '_id',
                        as: 'categoria'
                    }
                },

                // Lookup dos níveis (CategoriaItem)
                {
                    $lookup: {
                        from: 'categoriaitems',
                        localField: 'categoria.id_nivel_cat1',
                        foreignField: '_id',
                        as: 'cat_nivel_1'
                    }
                },
                {
                    $lookup: {
                        from: 'categoriaitems',
                        localField: 'categoria.id_nivel_cat2',
                        foreignField: '_id',
                        as: 'cat_nivel_2'
                    }
                },
                {
                    $lookup: {
                        from: 'categoriaitems',
                        localField: 'categoria.id_nivel_cat3',
                        foreignField: '_id',
                        as: 'cat_nivel_3'
                    }
                },
                {
                    $lookup: {
                        from: 'categoriaitems',
                        localField: 'categoria.id_nivel_cat4',
                        foreignField: '_id',
                        as: 'cat_nivel_4'
                    }
                },

                // Reduzir arrays
                {
                    $project: {
                        _id: 1,
                        id_conta: 1,
                        id_doc: 1,
                        descricao: 1,

                        // Origem / Destino
                        localizacao_origem: {
                            nivel1: { $arrayElemAt: ['$origem_n1.descricao', 0] },
                            nivel2: { $arrayElemAt: ['$origem_n2.descricao', 0] },
                            nivel3: { $arrayElemAt: ['$origem_n3.descricao', 0] },
                            nivel4: { $arrayElemAt: ['$origem_n4.descricao', 0] }
                        },

                        localizacao_destino: {
                            nivel1: { $arrayElemAt: ['$destino_n1.descricao', 0] },
                            nivel2: { $arrayElemAt: ['$destino_n2.descricao', 0] },
                            nivel3: { $arrayElemAt: ['$destino_n3.descricao', 0] },
                            nivel4: { $arrayElemAt: ['$destino_n4.descricao', 0] }
                        },
                        // Gateway
                        gateway: { $arrayElemAt: ['$gateway.descricao', 0] },

                        // Colaborador
                        colaborador: { $arrayElemAt: ['$colaborador.nome', 0] },

                        // Categoria e níveis
                        categoria: {
                            descricao: { $arrayElemAt: ['$categoria.descricao', 0] },
                            nivel1: { $arrayElemAt: ['$cat_nivel_1.descricao', 0] },
                            nivel2: { $arrayElemAt: ['$cat_nivel_2.descricao', 0] },
                            nivel3: { $arrayElemAt: ['$cat_nivel_3.descricao', 0] },
                            nivel4: { $arrayElemAt: ['$cat_nivel_4.descricao', 0] },
                        },

                        // Dados do item
                        item: {
                            id_item: '$itens.id_item',
                            tag: '$itens.tag',
                            ean: '$itens.ean',
                            quantidade: '$itens.quantidade',
                            status: '$itens.status',
                            status_data: '$itens.status_data',
                            status_destino: '$itens.status_destino',
                            status_destino_data: '$itens.status_destino_data'
                        },

                        // Datas gerais da posição
                        partida_data: 1,
                        previsao_chegada_data: 1,
                        status: 1,
                        status_data: 1,
                        // Array completo `itens` da collection posicao (não só a linha do unwind)
                        itens: '$_itens_posicao'
                    }
                }
            ]);

            return res.status(200).send(result);

        } catch (err) {
            console.error(err);
            return res.status(500).send({ erro: err });
        }
    });


    app.post('/_bd/categoria/importar', async (req, res) => {

        const lista = req.body; // array de objetos enviados
        const id_conta = req.body[0].id_conta;

        console.log(req.body.length + " itens recebidos para importação");

        if (!Array.isArray(lista)) {
            return res.status(400).json({ erro: "Lista inválida" });
        }

        let criados = 0;
        let atualizados = 0;
        let erros = [];

        for (const item of lista) {
            try {
                let filter = {
                    id_conta: id_conta,
                    ean: item.ean
                };

                let update = {
                    descricao: item.descricao,
                    observacao: item.observacao || '',
                    foto: item.foto || '',
                    labelInf1: item.labelInf1 || '',
                    labelInf2: item.labelInf2 || '',
                    labelInf3: item.labelInf3 || '',
                    labelInf4: item.labelInf4 || '',
                    labelInf5: item.labelInf5 || '',
                    valor_labelInf1: item.valor_labelInf1 || '',
                    valor_labelInf2: item.valor_labelInf2 || '',
                    valor_labelInf3: item.valor_labelInf3 || '',
                    valor_labelInf4: item.valor_labelInf4 || '',
                    valor_labelInf5: item.valor_labelInf5 || '',
                    estoque_minimo: item.estoque_minimo || 0,
                    estoque_maximo: item.estoque_maximo || 0,
                    valor: item.valor || 0,
                    id_nivel_cat1: item.id_nivel_cat1 || '',
                    id_nivel_cat2: item.id_nivel_cat2 || '',
                    id_nivel_cat3: item.id_nivel_cat3 || '',
                    id_nivel_cat4: item.id_nivel_cat4 || ''
                };

                let result = await Categoria.findOneAndUpdate(
                    filter,
                    update,
                    { new: true, upsert: true, setDefaultsOnInsert: true }
                );

                if (result.createdAt === result.updatedAt) {
                    criados++;
                } else {
                    atualizados++;
                }

            } catch (err) {
                erros.push({ item: item.ean, erro: err.message });
            }
        }

        return res.json({
            status: "ok",
            total_recebidos: lista.length,
            criados,
            atualizados,
            erros
        });
    });

    app.get('/_bd/posicao/relatorio-itens/:id_conta', async (req, res) => {
        try {
            const { id_conta } = req.params;

            const relatorio = await Posicao.aggregate([

                // 1️⃣ Filtra pela conta
                {
                    $match: { id_conta }
                },

                // 2️⃣ Explode os itens
                {
                    $unwind: '$itens'
                },

                // 3️⃣ Categoria
                {
                    $lookup: {
                        from: 'categorias',
                        localField: 'itens.id_categoria',
                        foreignField: '_id',
                        as: 'categoria'
                    }
                },
                { $unwind: { path: '$categoria', preserveNullAndEmptyArrays: true } },

                // 4️⃣ CategoriaItem (nível)
                {
                    $lookup: {
                        from: 'categoriaitems',
                        localField: 'itens.id_categoria_reg1',
                        foreignField: '_id',
                        as: 'categoria_item'
                    }
                },
                {
                    $unwind: {
                        path: '$categoria_item',
                        preserveNullAndEmptyArrays: true
                    }
                },

                // 5️⃣ Local origem
                {
                    $lookup: {
                        from: 'localizacaos',
                        localField: 'id_nivel_loc1',
                        foreignField: '_id',
                        as: 'origem'
                    }
                },
                { $unwind: { path: '$origem', preserveNullAndEmptyArrays: true } },

                // 6️⃣ Local destino
                {
                    $lookup: {
                        from: 'localizacaos',
                        localField: 'id_nivel_loc1_destino',
                        foreignField: '_id',
                        as: 'destino'
                    }
                },
                { $unwind: { path: '$destino', preserveNullAndEmptyArrays: true } },

                {
                    $sort: { partida_data: -1 }
                },

                // 7️⃣ Monta o relatório
                {
                    $project: {
                        _id: 0,

                        tag: '$itens.tag',
                        ean: '$itens.ean',

                        categoria: '$categoria.descricao',
                        categoria_item: '$categoria_item.descricao',

                        status_origem: '$itens.status',
                        data_origem: '$partida_data',

                        status_destino: '$itens.status_destino',
                        data_destino: '$previsao_chegada_data',

                        local_origem: '$origem.descricao',
                        local_destino: '$destino.descricao',

                        // 🔹 Situação
                        situacao: {
                            $cond: [
                                {
                                    $and: [
                                        { $ne: ['$partida_data', null] },
                                        { $eq: ['$previsao_chegada_data', null] }
                                    ]
                                },
                                'Saiu e não chegou',
                                {
                                    $cond: [
                                        { $ne: ['$previsao_chegada_data', null] },
                                        'Saiu e chegou',
                                        'Em trânsito'
                                    ]
                                }
                            ]
                        },

                        // 🔹 Intervalo em segundos
                        intervalo_segundos: {
                            $cond: [
                                { $ne: ['$partida_data', null] },
                                {
                                    $divide: [
                                        {
                                            $subtract: [
                                                { $ifNull: ['$previsao_chegada_data', '$$NOW'] },
                                                '$partida_data'
                                            ]
                                        },
                                        1000 // ms → segundos
                                    ]
                                },
                                null
                            ]
                        }
                    }
                },

                // 8️⃣ Ordena por data de saída


            ]);

            res.json({
                success: true,
                total: relatorio.length,
                relatorio
            });

        } catch (err) {
            console.error('Erro no relatório de itens:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.get('/_bd/registro/:id/ultimos-associados', async (req, res) => {
        try {
            const { id } = req.params;

            // 1) Busca o registro base
            const registroBase = await Registro.findOne({ _id: String(id) }).lean();
            if (!registroBase) {
                return res.status(404).json({ erro: 'Registro não encontrado' });
            }

            const associados = Array.isArray(registroBase.associados) ? registroBase.associados : [];
            if (associados.length === 0) {
                return res.json({
                    registro: registroBase,
                    ultimos_por_associado: []
                });
            }

            // 2) Define o "escopo" para pegar os últimos registros no MESMO portal/contexto
            // (ajuste se você quiser menos ou mais restrições)
            const filtroBase = {
                id_conta: registroBase.id_conta,
                id_gateway: registroBase.id_gateway,
                id_nivel_loc1: registroBase.id_nivel_loc1,
                id_nivel_loc2: registroBase.id_nivel_loc2,
                id_nivel_loc3: registroBase.id_nivel_loc3,
                id_nivel_loc4: registroBase.id_nivel_loc4
            };

            // 3) Para cada associado, busca os últimos N registros daquela categoria
            const ultimos_por_associado = await Promise.all(
                associados.map(async (a) => {
                    const idCategoria = a?.id_categoria ? String(a.id_categoria) : '';
                    const qtd = Number(a?.encontrado_categoria) || 0;

                    // se não tiver categoria ou quantidade, não busca
                    if (!idCategoria || qtd <= 0) {
                        return {
                            associado: a,
                            filtro: null,
                            registros: []
                        };
                    }

                    const filtro = {
                        ...filtroBase,
                        id_categoria: idCategoria
                    };

                    const registros = await Registro.find(filtro)
                        .sort({ data_registro: -1 })  // últimos primeiro
                        .limit(qtd)
                        .lean();

                    return {
                        associado: a,
                        filtro,
                        registros
                    };
                })
            );

            return res.json({
                registro: registroBase,
                ultimos_por_associado
            });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ erro: 'Erro interno' });
        }
    });

    // GET /_bd/posicao/gerar-ordem/:id_registro
    // GET /_bd/posicao/gerar-ordem/:id_registro
    // app.get('/_bd/posicao/gerar-ordem/:id_registro', async (req, res) => {
    async function _XgerarOrdem(id_registro) {

        console.log('_gerarOrdem:1');
        try {
            // const { id_registro } = req.params;

            const now = new Date();
            const nowPlus30 = new Date(now.getTime() + 30 * 60 * 1000);

            // 1) Registro base
            const registroBase = await Registro.findOne({ _id: String(id_registro) }).lean();
            // if (!registroBase) return res.status(404).json({ erro: 'Registro não encontrado' });
            if (!registroBase) {
                console.log('_gerarOrdem:1_registroBase not found');
                return;
            } else {
                console.log('_gerarOrdem:1_registroBase found' + JSON.stringify(registroBase));
            }

            // 2) Gateway -> origem
            const gateway = await Gateway.findOne({ _id: String(registroBase.id_gateway), ativo: 1, posicao_esperada_auto: 1 }).lean();
            // if (!gateway) return res.status(400).json({ erro: 'Gateway do registro não encontrado/ativo' });
            if (!gateway) {
                console.log('_gerarOrdem:1_gateway not found');
                return;
            };

            const origem = {
                id_nivel_loc1: gateway.id_nivel_loc1 || '',
                id_nivel_loc2: gateway.id_nivel_loc2 || '',
                id_nivel_loc3: gateway.id_nivel_loc3 || '',
                id_nivel_loc4: gateway.id_nivel_loc4 || ''
            };

            // 3) Categorias válidas vindas de associados
            const associados = Array.isArray(registroBase.associados) ? registroBase.associados : [];

            const categoriasValidas = associados
                .map(a => a?.id_categoria ? String(a.id_categoria) : '')
                .filter(Boolean);

            const setCategoriasValidas = new Set(categoriasValidas);

            if (setCategoriasValidas.size === 0) {
                console.log('_gerarOrdem:1_setCategoriasValidas not found');
                return;
                // return res.status(400).json({ erro: 'Registro não possui associados com id_categoria válido' });
            }

            // 4) Buscar últimos registros por categoria, limitando por encontrado_categoria
            const filtroBase = {
                id_conta: registroBase.id_conta,
                id_gateway: registroBase.id_gateway,
                id_nivel_loc1: registroBase.id_nivel_loc1,
                id_nivel_loc2: registroBase.id_nivel_loc2,
                id_nivel_loc3: registroBase.id_nivel_loc3,
                id_nivel_loc4: registroBase.id_nivel_loc4
            };

            const registrosPorAssociado = await Promise.all(
                associados.map(async (a) => {
                    const idCat = a?.id_categoria ? String(a.id_categoria) : '';
                    const qtd = Number(a?.encontrado_categoria) || 0;

                    if (!idCat || qtd <= 0) return [];

                    return Registro.find({ ...filtroBase, id_categoria: idCat })
                        .sort({ data_registro: -1 })
                        .limit(qtd)
                        .lean();
                })
            );

            console.log('_gerarOrdem:1_checks');

            // Flatten
            const registros = registrosPorAssociado.flat();

            // 5) Filtra “garantido” (regra 1 do seu ajuste)
            const registrosFiltrados = registros.filter(r => setCategoriasValidas.has(String(r.id_categoria)));

            // remove duplicados por _id
            const mapById = new Map();
            for (const r of registrosFiltrados) mapById.set(String(r._id), r);
            const registrosUnicos = Array.from(mapById.values());

            if (registrosUnicos.length === 0) {
                console.log('_gerarOrdem:1_registrosUnicos not found');
                return;
                // return res.status(400).json({ erro: 'Nenhum registro encontrado para as categorias dos associados' });
            }

            // 6) Define categoria referência para destino (regra 2 do seu ajuste)
            // prioridade: categoria do registroBase, se estiver no set. Senão: primeira categoria válida.
            const categoriaRefDestino = setCategoriasValidas.has(String(registroBase.id_categoria))
                ? String(registroBase.id_categoria)
                : String(categoriasValidas[0]);

            const categoriaDestino = await Categoria.findOne({
                _id: categoriaRefDestino,
                id_conta: String(registroBase.id_conta),
                ativo: 1
            }).lean();

            if (!categoriaDestino) {
                console.log('_gerarOrdem:1_categoriaDestino not found');
                return;
                // return res.status(400).json({ erro: 'Categoria de referência para destino não encontrada/ativa' });
            }

            const destino = {
                id_nivel_loc1_destino: categoriaDestino.id_nivel_loc1 || '',
                id_nivel_loc2_destino: categoriaDestino.id_nivel_loc2 || '',
                id_nivel_loc3_destino: categoriaDestino.id_nivel_loc3 || '',
                id_nivel_loc4_destino: categoriaDestino.id_nivel_loc4 || ''
            };

            // 7) Monta itens (status concluido / destino pendente)
            const itens = registrosUnicos.map((r) => ({
                id_item: r.id_item || null,
                id_categoria: r.id_categoria || null,

                tag: r.tag || '',
                ean: '',     // opcional enriquecer com Categoria.ean
                rssi: r.rssi || '',

                quantidade: 1,
                status: 'concluido',
                status_data: now,

                id_gatweway: r.id_gateway || '',
                id_colaborador: r.id_colaborador || registroBase.id_colaborador || '',

                status_destino: 'pendente',
                status_destino_data: ''
            }));

            console.log('gerarOrdem:2' + JSON.stringify(itens));

            // 8) Cria Posicao
            const posicao = await Posicao.create({
                id_conta: registroBase.id_conta,
                id_colaborador: registroBase.id_colaborador || gateway.id_colaborador || '',

                ativo: '1',
                id_doc: registroBase._id,
                descricao: 'Ordem de Posição Esperada (Automática)',
                icone: 'portal',

                partida_data: now,
                tolerancia: 30,

                previsao_chegada_data: nowPlus30,
                previsao_chegada_tolerancia: 30,

                status: 'aberta',
                status_data: now,

                ...origem,
                itens,
                ...destino
            });

            console.log('_gerarOrdem:1_posicao created');

            // return res.json({
            //     ok: true,
            //     posicao_id: posicao._id,
            //     categoria_destino: categoriaRefDestino,
            //     total_itens: itens.length,
            //     origem,
            //     destino
            // });
        } catch (err) {
            console.error(err);
            console.log('_gerarOrdem:1_error: ' + err);
            // return res.status(500).json({ erro: 'Erro interno' });
        }
    };







}