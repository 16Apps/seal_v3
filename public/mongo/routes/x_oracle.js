const axios = require('axios');
const qs = require('qs');
const Gateway = require('../models/gateway');
const Localizacao = require('../models/localizacao');

const ORACLE = {
  tokenUrl:
    process.env.ORACLE_TOKEN_URL ||
    'https://idcs-ad62d1c9759649148d38097d061b777f.identity.oraclecloud.com/oauth2/v1/token',
  clientId: process.env.ORACLE_CLIENT_ID || 'RGBU_MFCS_PAR1_APPID',
  clientSecret: process.env.ORACLE_CLIENT_SECRET || '3dcd9fdf-237a-428e-a3f2-40d92f390c95',
  scope: process.env.ORACLE_SCOPE || 'rgbu:merch:MFCS-PAR1',
  stockCountUrl:
    process.env.ORACLE_STOCK_COUNT_URL ||
    'https://rgbu.gbua.us-ashburn-1.oci.oraclecloud.com/yrqfkehlbrn8ixzaq6gw/ords/mfcs/seal/stock_count',
  bulkShipUrl:
    process.env.ORACLE_BULK_SHIP_URL ||
    'https://demo.wms.ocs.oraclecloud.com/demo_a36/wms/lgfapi/v10/entity/oblpn/bulk_ship/',
  bulkShipFacilityId: process.env.ORACLE_BULK_SHIP_FACILITY_ID || '36',
  bulkShipCompanyId: process.env.ORACLE_BULK_SHIP_COMPANY_ID || '1',
  bulkShipLocnBarcode: process.env.ORACLE_BULK_SHIP_LOCN_BARCODE || 'S111',
  bulkShipUsername: process.env.ORACLE_BULK_SHIP_USERNAME || 'rfid.integration',
  bulkShipPassword: process.env.ORACLE_BULK_SHIP_PASSWORD || 'Oracle@2026',
  requestTimeoutMs: Number(process.env.ORACLE_REQUEST_TIMEOUT_MS) || 30000,
  // registroUrl:
  //   process.env.CONNECT_REGISTRO_URL ||
  //   'https://connectiot-app.azurewebsites.net/_bd/registro'
  registroUrl:
    process.env.CONNECT_REGISTRO_URL ||
    'https://sealv3-production.up.railway.app/_bd/registro'
};

function authorizationBasicOracle() {
  const credenciais = `${ORACLE.clientId}:${ORACLE.clientSecret}`;
  return `Basic ${Buffer.from(credenciais).toString('base64')}`;
}

function authorizationBasicBulkShip() {
  if (!ORACLE.bulkShipUsername || !ORACLE.bulkShipPassword) {
    throw new Error('Credenciais do bulk_ship não configuradas.');
  }

  const credenciais = `${ORACLE.bulkShipUsername}:${ORACLE.bulkShipPassword}`;
  return `Basic ${Buffer.from(credenciais).toString('base64')}`;
}

function formatarErroOracle(error, contexto) {
  if (error.code === 'ECONNABORTED') {
    return {
      status: 504,
      body: {
        ok: false,
        error: `Timeout ao integrar com ${contexto}.`,
        details: `A API Oracle não respondeu em ${ORACLE.requestTimeoutMs}ms.`
      }
    };
  }

  if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) {
    return {
      status: 502,
      body: {
        ok: false,
        error: `Falha de conexão ao integrar com ${contexto}.`,
        details: error.message
      }
    };
  }

  const status = error.response?.status || 500;
  const details = error.response?.data || error.message;

  return {
    status,
    body: {
      ok: false,
      error: `Falha ao integrar com ${contexto}.`,
      details
    }
  };
}

function responderErroOracle(res, error, contexto) {
  if (res.headersSent) return;
  const { status, body } = formatarErroOracle(error, contexto);
  return res.status(status).json(body);
}

function normalizarEpc(valor) {
  if (valor == null) return '';
  return valor.toString().replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
}

function formatarTagMac(valor) {
  const limpo = normalizarEpc(valor);
  if (!limpo) return '';
  return limpo.match(/.{1,2}/g)?.join(':') || limpo;
}

function montarPayloadRegistro(gateway, leitura) {
  return {
    tokem: gateway.tokem,
    tag: leitura.tag,
    data_leitura: '',
    antena: String(leitura.antenna ?? 0),
    rssi: leitura.rssi ?? '',
    bateria: '0',
    temperatura: '0',
    latitude: '',
    longitude: '',
    id_nivel_loc1: '',
    id_nivel_loc2: '',
    id_nivel_loc3: '',
    id_nivel_loc4: '',
    id_nivel_loc1_final: '',
    id_nivel_loc2_final: '',
    id_nivel_loc3_final: '',
    id_nivel_loc4_final: ''
  };
}

async function enviarRegistroConnect(payload) {
  return axios.post(ORACLE.registroUrl, payload, {
    timeout: ORACLE.requestTimeoutMs,
    validateStatus: () => true
  });
}

function emitirSocketConta(req, gateway, retorno) {
  const io = req.app.get('io');
  if (!io || !gateway?.id_conta) return;
  io.emit(gateway.id_conta, retorno);
  if (gateway._id) io.emit(gateway._id, retorno);
}

function montarTokemPortal(antenna) {
  return `PORTAL-A${antenna ?? 0}`;
}

async function obterLocalDoGateway(gateway) {
  if (!gateway) return '';

  const ids = [
    gateway.id_nivel_loc2,
    gateway.id_nivel_loc3,
    gateway.id_nivel_loc4,
    gateway.id_nivel_loc1
  ].filter(Boolean);

  for (const id of ids) {
    const localizacao = await Localizacao.findById(id).lean();
    if (localizacao?.descricao) {
      return String(localizacao.descricao).trim();
    }
  }

  return String(gateway.descricao || '').trim();
}

function montarItemStockCount(epc, local) {
  return {
    EPC: normalizarEpc(epc),
    local: String(local || '').trim()
  };
}

async function obterTokenOracle() {
  const data = qs.stringify({
    grant_type: 'client_credentials',
    scope: ORACLE.scope
  });

  const response = await axios.request({
    method: 'post',
    maxBodyLength: Infinity,
    timeout: ORACLE.requestTimeoutMs,
    url: ORACLE.tokenUrl,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: authorizationBasicOracle()
    },
    data,
    validateStatus: (status) => status < 500
  });

  const accessToken = response.data?.access_token;
  if (!accessToken) {
    const err = new Error('Resposta OAuth Oracle sem access_token.');
    err.response = response;
    throw err;
  }

  return accessToken;
}

async function enviarStockCountComToken(items) {
  const accessToken = await obterTokenOracle();

  return axios.request({
    method: 'put',
    maxBodyLength: Infinity,
    timeout: ORACLE.requestTimeoutMs,
    url: ORACLE.stockCountUrl,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    data: { items },
    validateStatus: () => true
  });
}

async function enviarBulkShipComToken(containerNbr) {
  const tag = normalizarEpc(containerNbr);

  return axios.request({
    method: 'post',
    maxBodyLength: Infinity,
    timeout: ORACLE.requestTimeoutMs,
    url: ORACLE.bulkShipUrl,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorizationBasicBulkShip()
    },
    data: {
      parameters: {
        facility_id: ORACLE.bulkShipFacilityId,
        company_id: ORACLE.bulkShipCompanyId,
        container_nbr__in: [tag]
      },
      options: {
        locn_barcode: ORACLE.bulkShipLocnBarcode
      }
    },
    validateStatus: () => true
  });
}

function extrairLeiturasPortal(payload) {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => extrairLeiturasPortal(item));
  }

  if (!payload || typeof payload !== 'object') return [];

  const data = payload.data;
  if (!data || typeof data !== 'object') return [];

  const tag = normalizarEpc(data.idHex);
  if (!tag) return [];

  return [{
    type: payload.type,
    timestamp: payload.timestamp,
    tag,
    antenna: data.antenna ?? 0,
    rssi: data.peakRssi ?? data.rssi ?? '',
    reads: data.reads ?? 1
  }];
}

function montarItensStockCount(posicao, localDescricao) {
  const local = String(localDescricao || '').trim();
  const items = [];

  for (const item of posicao.itens || []) {
    const epc = normalizarEpc(item.tag);
    if (!epc) continue;

    items.push({
      EPC: epc,
      local
    });
  }

  return items;
}

module.exports = (app) => {

  app.get('/x_oracle/token', async (req, res) => {
    try {
      const accessToken = await obterTokenOracle();
      return res.status(200).json({
        ok: true,
        access_token: accessToken,
        token_type: 'Bearer'
      });
    } catch (error) {
      console.error('[x_oracle/token] Erro:', error.response?.data || error.message);
      return responderErroOracle(res, error, 'autenticação Oracle');
    }
  });

  app.put('/x_oracle/stock_count', async (req, res) => {
    try {
      const body = req.body || {};
      const items = Array.isArray(body.items) ? body.items : [];

      if (!items.length) {
        return res.status(400).json({
          ok: false,
          error: 'Body inválido. Envie { items: [{ EPC, local }] }.'
        });
      }

      const payload = items.map((item) => ({
        EPC: normalizarEpc(item.EPC || item.epc || item.tag),
        local: String(item.local || item.localizacao || '').trim()
      })).filter((item) => item.EPC && item.local);

      if (!payload.length) {
        return res.status(400).json({
          ok: false,
          error: 'Nenhum item válido. Informe EPC e local em cada item.'
        });
      }



      const response = await enviarStockCountComToken(payload);
      const sucesso = response.status >= 200 && response.status < 300;

      return res.status(response.status).json({
        ok: sucesso,
        status: response.status,
        payload: { items: payload },
        data: response.data,
        ...(sucesso ? {} : { error: 'API Oracle retornou erro no stock_count.' })
      });
    } catch (error) {
      console.error('[x_oracle/stock_count] Erro:', error.response?.data || error.message);
      return responderErroOracle(res, error, 'stock_count Oracle');
    }
  });

  app.get('/x_oracle/:id_posicao', async (req, res) => {
    try {
      const { id_posicao } = req.params;
      const Posicao = require('../models/posicao');
      const Localizacao = require('../models/localizacao');

      const posicao = await Posicao.findById(id_posicao);
      if (!posicao) {
        return res.status(404).json({ ok: false, error: 'Posição não encontrada.' });
      }

      const localizacao = await Localizacao.findById(posicao.id_nivel_loc2);
      if (!localizacao) {
        return res.status(404).json({ ok: false, error: 'Localização (nível 2) não encontrada.' });
      }

      const items = montarItensStockCount(posicao, localizacao.descricao);
      if (!items.length) {
        return res.status(400).json({
          ok: false,
          error: 'Nenhum item com tag EPC na posição.',
          local: localizacao.descricao
        });
      }

      const response = await enviarStockCountComToken(items);
      const sucesso = response.status >= 200 && response.status < 300;

      return res.status(sucesso ? 200 : response.status).json({
        ok: sucesso,
        status_oracle: response.status,
        local: localizacao.descricao,
        payload: { items },
        resposta: response.data,
        ...(sucesso ? {} : { error: 'API Oracle retornou erro no stock_count.' })
      });
    } catch (error) {
      console.error('[x_oracle/:id_posicao] Erro:', error.response?.data || error.message);
      return responderErroOracle(res, error, 'integração Oracle');
    }
  });

  app.post('/x_oracle/registro', async (req, res) => {
    try {
      const payload = req.body;
      console.log('[x_oracle/registro] payload:', JSON.stringify(payload));


      const leituras = extrairLeiturasPortal(payload);
      if (!leituras.length) {
        return res.status(400).json({
          ok: false,
          error: 'Payload inválido. Informe data.idHex (tag EPC).'
        });
      }

      let enviados = 0;
      let ignorados = 0;
      const erros = [];
      const resultados = [];

      for (const leitura of leituras) {
        const tokemPortal = montarTokemPortal(leitura.antenna);
        const gateway = await Gateway.findOne({ tokem: tokemPortal, ativo: 1 });

        if (!gateway) {
          ignorados++;
          resultados.push({
            tag: leitura.tag,
            tokem: tokemPortal,
            ignorado: true,
            motivo: 'gateway_nao_encontrado'
          });
          continue;
        }

        const rssiNum = parseFloat(leitura.rssi);
        const thresholdRSSI = gateway.intervalo_reg_rssi || 0;
        // Coletor: threshold positivo (ex: 30). Leitor: RSSI negativo (ex: -25, -33).
        // Descarta se |rssi| > threshold (ex: |-33|=33 > 30 descarta; |-25|=25 aceita).
        if (thresholdRSSI > 0 && !isNaN(rssiNum) && Math.abs(rssiNum) > thresholdRSSI) {
          ignorados++;
          resultados.push({
            tag: leitura.tag,
            tokem: gateway.tokem,
            ignorado: true,
            motivo: 'rssi_baixo'
          });
          continue;
        }

        const registroPayload = montarPayloadRegistro(gateway, leitura);
        let registroConnect = null;
        let responseBulkShip = null;

        try {
          responseBulkShip = await enviarBulkShipComToken(leitura.tag);
          const retornoBulkShip = {
            tipo: 'oracle_bulk_ship',
            tag: leitura.tag,
            tokem: gateway.tokem,
            status: responseBulkShip.status,
            data: responseBulkShip.data
          };
          console.log('[x_oracle/registro] responseBulkShip:', JSON.stringify(retornoBulkShip));
          emitirSocketConta(req, gateway, retornoBulkShip);
        } catch (err) {
          erros.push({
            tag: leitura.tag,
            tokem: gateway.tokem,
            erro: `Falha no bulk_ship Oracle: ${err.message}`
          });
        }

        try {
          const responseRegistro = await enviarRegistroConnect(registroPayload);
          registroConnect = {
            status: responseRegistro.status,
            data: responseRegistro.data
          };
          console.log('[x_oracle/registro] registro:', JSON.stringify({
            status: responseRegistro.status,
            payload: registroPayload,
            data: responseRegistro.data
          }));
          emitirSocketConta(req, gateway, registroPayload);
        } catch (err) {
          erros.push({
            tag: leitura.tag,
            tokem: gateway.tokem,
            erro: `Falha ao enviar registro Connect: ${err.message}`
          });
        }

        const local = await obterLocalDoGateway(gateway);
        if (!local) {
          erros.push({
            tag: leitura.tag,
            tokem: gateway.tokem,
            erro: 'Gateway sem endereço/localização configurada no cadastro.'
          });
          continue;
        }

        const item = montarItemStockCount(leitura.tag, local);
        if (!item.EPC) {
          erros.push({
            tag: leitura.tag,
            tokem: gateway.tokem,
            erro: 'EPC inválido na leitura.'
          });
          continue;
        }

        const oraclePayload = { items: [item] };
        console.log('[x_oracle/registro] stock_count:', JSON.stringify(oraclePayload));

        try {
          const response = await enviarStockCountComToken(oraclePayload.items);

          console.log('[x_oracle/registro] stock_count response:', JSON.stringify({
            status: response.status,
            data: response.data
          }));

          const sucesso = response.status >= 200 && response.status < 300;
          const retornoStockCount = {
            tipo: 'oracle_stock_count',
            tag: leitura.tag,
            tokem: gateway.tokem,
            local,
            status: response.status,
            payload: oraclePayload,
            data: response.data
          };
          emitirSocketConta(req, gateway, retornoStockCount);

          if (sucesso) {
            enviados++;
          } else {
            erros.push({
              tag: leitura.tag,
              tokem: gateway.tokem,
              local,
              status: response.status,
              erro: response.data?.message || response.data?.error || 'Oracle stock_count retornou erro'
            });
          }

          resultados.push({
            tag: leitura.tag,
            tokem: gateway.tokem,
            local,
            payload: oraclePayload,
            registro: registroPayload,
            registro_connect: registroConnect,
            bulk_ship: responseBulkShip ? {
              status: responseBulkShip.status,
              data: responseBulkShip.data
            } : null,
            status: response.status,
            data: response.data
          });
        } catch (err) {
          erros.push({
            tag: leitura.tag,
            tokem: gateway.tokem,
            local,
            erro: err.message
          });
        }
      }

      return res.json({
        ok: erros.length === 0,
        total_leituras: leituras.length,
        enviados,
        ignorados,
        erros,
        resultados
      });
    } catch (err) {
      console.error('[x_oracle/registro] Erro:', err);
      return res.status(500).json({ ok: false, error: 'Erro interno', details: err.message });
    }
  });

};
