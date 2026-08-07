const websocketStream = require('websocket-stream');
const axios = require('axios');
const moment = require('moment');
const Gateway = require('../models/gateway');

let aedes = null;
let mqttDisponivel = false;
let mqttErro = '';

try {
    const pacoteAedes = require('aedes');
    Aedes = pacoteAedes.Aedes;
    mqttDisponivel = true;
} catch (err) {
    mqttErro = err.message;
    console.log('MQTT (aedes) indisponível:', err.message);
}

module.exports = (app, dbConnection, server) => {
    const PORTA_PADRAO = Number(process.env.MQTT_PORT) || 1883;
    // const URL_POST_PADRAO =
    //     process.env.MQTT_REGistro_URL ||
    //     `http://127.0.0.1:${process.env.PORT || 3000}/_bd/registro`;

        const URL_POST_PADRAO =
        process.env.MQTT_REGistro_URL ||
        `https://connectiot-app.azurewebsites.net/_bd/registro`;

    // http://127.0.0.1
    const INTERVALO_ENVIO_MS = Number(process.env.MQTT_INTERVALO_MS) || 5000;

    let mqttServer = null;
    const ultimoEnvioPorTag = new Map();

    let mqttConfig = {
        ativo: false,
        tokem: '',
        port: PORTA_PADRAO,
        topics: (process.env.MQTT_TOPICS || 'zebra/+/tags,rfid/+/read,#').split(',').map((t) => t.trim()).filter(Boolean),
        urlPost: URL_POST_PADRAO,
        antena: '0',
        id_nivel_loc1: '',
        id_nivel_loc2: '',
        id_nivel_loc3: '',
        id_nivel_loc4: '',
        id_nivel_loc1_final: '',
        id_nivel_loc2_final: '',
        id_nivel_loc3_final: '',
        id_nivel_loc4_final: ''
    };

    let mqttStatus = {
        brokerAtivo: false,
        porta: PORTA_PADRAO,
        clientesConectados: 0,
        ultimaTag: '',
        ultimoTopico: '',
        totalPublicacoes: 0,
        totalEnviados: 0,
        totalIgnorados: 0,
        totalErros: 0,
        startedAt: null,
        ultimoErro: null
    };

    const formatarMAC = (valor) => {
        if (!valor) return '';
        const limpo = valor.toString().replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
        if (!limpo) return '';
        return limpo.match(/.{1,2}/g)?.join(':') || limpo;
    };

    const normalizarEpc = (valor) => {
        if (valor == null) return '';
        return valor.toString().replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    };

    const parsePayload = (raw) => {
        if (raw == null) return null;
        const texto = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
        if (!texto.trim()) return null;
        try {
            return JSON.parse(texto);
        } catch {
            return { epc: texto.trim() };
        }
    };

    /** Extrai leituras RFID de formatos comuns (Zebra FX / IoT Connector e genéricos). */
    const extrairLeituras = (payload) => {
        if (!payload || typeof payload !== 'object') return [];

        const lista = [];
        const pushLeitura = (item) => {
            if (!item || typeof item !== 'object') return;
            const epc =
                item.epc ||
                item.EPC ||
                item.id ||
                item.tagId ||
                item.tag_id ||
                item.TID ||
                item.data;
            const tag = normalizarEpc(epc);
            if (!tag) return;
            lista.push({
                tag,
                antena: String(
                    item.antenna ??
                    item.antennaId ??
                    item.antennaID ??
                    item.antena ??
                    item.AntennaID ??
                    '0'
                ),
                rssi:
                    item.rssi ??
                    item.peakRssi ??
                    item.peakRSSI ??
                    item.RSSI ??
                    item.signalStrength ??
                    '',
                data_leitura:
                    item.timestamp ||
                    item.readTime ||
                    item.eventTime ||
                    item.time ||
                    null
            });
        };

        if (Array.isArray(payload)) {
            payload.forEach(pushLeitura);
            return lista;
        }

        const candidatos =
            payload.data?.reads ||
            payload.data?.tag_reads ||
            payload.tag_reads ||
            payload.tagReads ||
            payload.reads ||
            payload.tags ||
            payload.events ||
            payload.body?.data?.reads;

        if (Array.isArray(candidatos)) {
            candidatos.forEach(pushLeitura);
            return lista;
        }

        if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
            pushLeitura(payload.data);
            return lista;
        }

        pushLeitura(payload);
        return lista;
    };

    const topicoPermitido = (topic) => {
        const permitidos = mqttConfig.topics || [];
        if (!permitidos.length || permitidos.includes('#')) return true;
        return permitidos.some((padrao) => {
            if (padrao === topic) return true;
            if (padrao.endsWith('/#')) {
                return topic.startsWith(padrao.slice(0, -2));
            }
            if (padrao.includes('+')) {
                const regex = new RegExp('^' + padrao.replace(/\+/g, '[^/]+').replace(/\//g, '\\/') + '$');
                return regex.test(topic);
            }
            return false;
        });
    };

    async function enviarRegistro(leitura) {
        if (!mqttConfig.ativo || !mqttConfig.tokem) return { ok: false, motivo: 'mqtt_inativo' };

        const tag = leitura.tag;
        if (!tag) return { ok: false, motivo: 'tag_invalida' };

        const agora = Date.now();
        const ultimo = ultimoEnvioPorTag.get(tag) || 0;
        if (agora - ultimo < INTERVALO_ENVIO_MS) {
            mqttStatus.totalIgnorados += 1;
            return { ok: false, motivo: 'debounce' };
        }

        const gateway = await Gateway.findOne({ tokem: mqttConfig.tokem + '-A' + leitura.antena, ativo: 1 }).lean();
        console.log(mqttConfig.tokem + '-A' + leitura.antena)
  
        if (!gateway) {
            mqttStatus.totalIgnorados += 1;
            return { ok: false, motivo: 'gateway_nao_encontrado' };
        }

        const rssiNum = parseFloat(leitura.rssi);
        console.log(gateway.intervalo_reg_rssi)
        const threshold = gateway.intervalo_reg_rssi || 0;
        if (threshold > 0 && !isNaN(rssiNum) && Math.abs(rssiNum) < threshold) {
            mqttStatus.totalIgnorados += 1;
            return { ok: false, motivo: 'rssi_baixo' };
        }

        const payload = {
            tokem: mqttConfig.tokem + '-A' + leitura.antena,
            tag,
            // data_leitura: leitura.data_leitura
            //     ? moment(leitura.data_leitura).format('YYYY-MM-DD HH:mm:ss')
            //     : moment().format('YYYY-MM-DD HH:mm:ss'),
            antena: leitura.antena || mqttConfig.antena || '0',
            rssi: leitura.rssi ?? '',
            bateria: '0',
            temperatura: '0',
            latitude: '',
            longitude: '',
            id_nivel_loc1: mqttConfig.id_nivel_loc1 || '',
            id_nivel_loc2: mqttConfig.id_nivel_loc2 || '',
            id_nivel_loc3: mqttConfig.id_nivel_loc3 || '',
            id_nivel_loc4: mqttConfig.id_nivel_loc4 || '',
            id_nivel_loc1_final: mqttConfig.id_nivel_loc1_final || '',
            id_nivel_loc2_final: mqttConfig.id_nivel_loc2_final || '',
            id_nivel_loc3_final: mqttConfig.id_nivel_loc3_final || '',
            id_nivel_loc4_final: mqttConfig.id_nivel_loc4_final || ''
        };

        console.log(payload)

        try {
            const resp = await axios.post(mqttConfig.urlPost, payload, { timeout: 8000 });
            console.log(resp.status)
            if (resp.status >= 200 && resp.status < 300) {
                ultimoEnvioPorTag.set(tag, agora);
                mqttStatus.totalEnviados += 1;
                mqttStatus.ultimaTag = tag;
                return { ok: true };
            }
            mqttStatus.totalErros += 1;
            mqttStatus.ultimoErro = `HTTP ${resp.status}`;
            return { ok: false, motivo: 'http_erro' };
        } catch (err) {
            mqttStatus.totalErros += 1;
            mqttStatus.ultimoErro = err.message;
            console.error('[MQTT] Erro ao enviar registro:', err.message);
            return { ok: false, motivo: 'post_erro' };
        }
    }

    async function processarMensagem(topic, payloadBuffer) {
        mqttStatus.totalPublicacoes += 1;
        mqttStatus.ultimoTopico = topic;

        if (!topicoPermitido(topic)) return;

        const parsed = parsePayload(payloadBuffer);
        const leituras = extrairLeituras(parsed);
        if (!leituras.length) return;

        for (const leitura of leituras) {
            await enviarRegistro(leitura);
        }

        const io = app.get('io');
        if (io) {
            io.emit('mqtt:leitura', {
                topic,
                total: leituras.length,
                leituras,
                ts: new Date().toISOString()
            });
        }
    }

    function configurarAutenticacao(broker) {
        const user = process.env.MQTT_USER;
        const pass = process.env.MQTT_PASS;
        if (!user) return;

        broker.authenticate = (client, username, password, callback) => {
            const autorizado = username === user && (!pass || password === pass);
            callback(null, autorizado);
        };
    }

     function iniciarBroker() {
        return new Promise( async (resolve, reject) => {
            if (!mqttDisponivel) {
                return reject(new Error(mqttErro || 'Pacote aedes não instalado'));
            }
            if (mqttServer) return resolve();

            const broker = await Aedes.createBroker();
            configurarAutenticacao(broker);

            broker.on('client', (client) => {
                mqttStatus.clientesConectados += 1;
                console.log('[MQTT] Cliente conectado:', client?.id);
            });

            broker.on('clientDisconnect', (client) => {
                mqttStatus.clientesConectados = Math.max(0, mqttStatus.clientesConectados - 1);
                console.log('[MQTT] Cliente desconectado:', client?.id);
            });

            broker.on('publish', (packet, client) => {
                if (!client) return;
                const topic = packet.topic.toString();
                processarMensagem(topic, packet.payload).catch((err) => {
                    console.error('[MQTT] Erro ao processar publicação:', err);
                });
            });
            websocketStream.createServer(
                {
                    server: server,
                    path: '/mqtt'
                },
                broker.handle
            );
            
            mqttServer = {
                close: (cb) => {
                    mqttStatus.brokerAtivo = false;
                    if (cb) cb();
                }
            };
            
            mqttStatus.brokerAtivo = true;
            mqttStatus.porta = process.env.PORT || 3000;
            
            console.log('[MQTT] Broker WebSocket ativo em /mqtt');
            resolve();
        });
    }

    function pararBroker() {
        return new Promise((resolve) => {
            if (!mqttServer) {
                mqttStatus.brokerAtivo = false;
                return resolve();
            }
            mqttServer.close(() => {
                mqttServer = null;
                mqttStatus.brokerAtivo = false;
                mqttStatus.clientesConectados = 0;
                console.log('[MQTT] Broker encerrado');
                resolve();
            });
        });
    }

    app.post('/mqtt/start', async (req, res) => {
        try {
            const body = req.body || {};

            mqttConfig = {
                ...mqttConfig,
                ativo: true,
                tokem: body.tokem || mqttConfig.tokem,
                port: Number(body.port) || mqttConfig.port || PORTA_PADRAO,
                topics: Array.isArray(body.topics) && body.topics.length
                    ? body.topics
                    : (body.topics ? String(body.topics).split(',') : mqttConfig.topics),
                urlPost: body.urlPost || mqttConfig.urlPost,
                antena: body.antena != null ? String(body.antena) : mqttConfig.antena,
                id_nivel_loc1: body.id_nivel_loc1 || '',
                id_nivel_loc2: body.id_nivel_loc2 || '',
                id_nivel_loc3: body.id_nivel_loc3 || '',
                id_nivel_loc4: body.id_nivel_loc4 || '',
                id_nivel_loc1_final: body.id_nivel_loc1_final || '',
                id_nivel_loc2_final: body.id_nivel_loc2_final || '',
                id_nivel_loc3_final: body.id_nivel_loc3_final || '',
                id_nivel_loc4_final: body.id_nivel_loc4_final || ''
            };

            mqttConfig.topics = mqttConfig.topics.map((t) => String(t).trim()).filter(Boolean);

            ultimoEnvioPorTag.clear();
            mqttStatus.totalPublicacoes = 0;
            mqttStatus.totalEnviados = 0;
            mqttStatus.totalIgnorados = 0;
            mqttStatus.totalErros = 0;
            mqttStatus.ultimaTag = '';
            mqttStatus.ultimoTopico = '';
            mqttStatus.startedAt = new Date().toISOString();

            if (mqttServer) await pararBroker();
            await iniciarBroker();

            return res.json({
                ok: true,
                msg: 'Servidor MQTT iniciado. Configure o leitor Zebra para publicar neste host/porta.',
                mqttConfig: {
                    ...mqttConfig,
                    urlPost: mqttConfig.urlPost
                },
                mqttStatus,
                mqttDisponivel
            });
        } catch (err) {
            console.error('[MQTT] Erro /mqtt/start:', err);
            return res.status(500).json({
                ok: false,
                msg: err.message || 'Erro ao iniciar servidor MQTT',
                mqttDisponivel,
                mqttErro
            });
        }
    });

    app.post('/mqtt/stop', async (req, res) => {
        try {
            mqttConfig.ativo = false;
            await pararBroker();
            return res.json({
                ok: true,
                msg: 'Servidor MQTT finalizado.',
                mqttStatus,
                mqttDisponivel
            });
        } catch (err) {
            return res.status(500).json({
                ok: false,
                msg: err.message || 'Erro ao parar servidor MQTT'
            });
        }
    });

    app.get('/mqtt/status', (req, res) => {
        return res.json({
            ok: true,
            mqttConfig,
            mqttStatus,
            mqttDisponivel,
            mqttErro
        });
    });

    /** Simula uma publicação (teste sem leitor físico). */
    app.post('/mqtt/simular', async (req, res) => {
        try {
            const body = req.body || {};
            const leituras = extrairLeituras(body.payload || body);
            if (!leituras.length) {
                return res.status(400).json({ ok: false, msg: 'Nenhuma leitura no payload' });
            }
            const resultados = [];
            for (const l of leituras) {
                resultados.push(await enviarRegistro(l));
            }
            return res.json({ ok: true, leituras, resultados });
        } catch (err) {
            return res.status(500).json({ ok: false, msg: err.message });
        }
    });

    if (process.env.MQTT_AUTO_START === '1' && mqttDisponivel) {
        mqttConfig.ativo = true;
        mqttConfig.tokem = process.env.MQTT_TOKEM || mqttConfig.tokem;
        iniciarBroker().catch((err) => {
            console.error('[MQTT] Falha no auto-start:', err.message);
        });
    }

    console.log('MQTT module carregado');
};
