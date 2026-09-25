const axios = require('axios');
const qs = require('qs');
const moment = require('moment');

const Gateway = require('../models/gateway');

const ip_server = 'http://localhost:3000';
const ip_middleware = 'http://10.10.20.99:5107';

const INFOR_HOMOLOGACAO = {
  baseUrl: 'http://localhost:3000',
  tokenUrl: 'https://mingle-sso.inforcloudsuite.com:443/BLUELOGISTICA_TST/as/token.oauth2',
  receiptsUrl: 'https://mingle-ionapi.inforcloudsuite.com/BLUELOGISTICA_TST/WM/wmwebservice_rest/BLUELOGISTICA_TST_BLUELOGISTICA_TST_SCE_PRD_0_wmwhse2/receipts',
  rfidUrl: 'https://mingle-ionapi.inforcloudsuite.com/BLUELOGISTICA_TST/APIFLOWS/bluelogistica/rfid',
  authorizationBasic: 'Basic QkxVRUxPR0lTVElDQV9UU1R+cTRkMUc0OEdCNTlIR1hublJxN29mWkF6WGQwYkNwX3NoeTZQbXFMLWV0UTp4SGJlSWtDZ0dNNTBzSnlSTkFGRGxoWW1pUHBYQzdyNDRJbTVhZUppOG5sNmp2azV1b0s3MmNzOU13XzBtTWhqMHN6QVhuVWU5aVVERVMwcE5NNm1JUQ==',
  grantUsername: 'BLUELOGISTICA_TST#YIRLobVp6gOGHtmIyp4ATHVfKWFhkywl8rWuuLGXMpwusD7dCZrObsxB1xlK5C69K6fZA4aZ9qBvnjfsy1YyaA',
  grantPassword: 'xja7dTAKaSAQsDKYvvQ23NpMLuAewFzk7z1fO3B4cfO7WoK9WnucjG71QGsMlwO5W9438bCxS66xX5UdJjXAoA',
  requestTimeoutMs: Number(process.env.INFOR_REQUEST_TIMEOUT_MS) || 30000
};

const INFOR = {
  baseUrl: 'http://localhost:3000',
  tokenUrl: 'https://mingle-sso.inforcloudsuite.com:443/BLUELOGISTICA_PRD/as/token.oauth2',
  receiptsUrl: 'https://mingle-ionapi.inforcloudsuite.com/BLUELOGISTICA_PRD/WM/wmwebservice_rest/BLUELOGISTICA_PRD_BLUELOGISTICA_PRD_SCE_PRD_0_wmwhse2/receipts',
  pickdetailsBaseUrl: 'https://mingle-ionapi.inforcloudsuite.com/BLUELOGISTICA_PRD/WM/wmwebservice_rest/BLUELOGISTICA_PRD_BLUELOGISTICA_PRD_SCE_PRD_0_wmwhse2/pickdetails',
  rfidUrl: 'https://mingle-ionapi.inforcloudsuite.com/BLUELOGISTICA_PRD/APIFLOWS/bluelogistica/rfid',
  authorizationBasic: 'Basic QkxVRUxPR0lTVElDQV9QUkR+VXFnNktGSElzNUlyZG9fX1NxYUZZcUpSRW1HLTI5YnNicDRDMnBtckFwWTpyenFzRUpjaXRvblM3Y190SVF2SHhMUkxmZTBHSFgyU2RTVzJFNHd1ZjA1OW9Jc1R2ODAtb0NIUmpqVGJ0Vjc5UDVHdWVDcG5VQlY3RE43M1VIQm5Ddw==',
  grantUsername: 'BLUELOGISTICA_PRD#mtjyqBCF_-q6b_xShknZYAOnJ-18WjvNhPIVuTUJyDJeYD00JJe_SISqLG9fPXXFd6-7daYTzCdDZd6M1kqXMQ',
  grantPassword: 'gdsHKdywMG-F4yKKzIKWs8uLt85fj6bpSWkEAu6t7XxMfq42Xn_5t6iFdiK0wJ2LGbSdk2VeSnJVXDx_4t3x1w',
  requestTimeoutMs: Number(process.env.INFOR_REQUEST_TIMEOUT_MS) || 30000
};

// Estado por device/portal (cada leitor isolado — nunca mistura P03 com P07 etc.)
const sensoresEmAnalise = new Map(); // chave -> { primeiraPorta, data, timeout }
// Sentido válido por device (usado pelo /registro/portal daquele Devicename)
const sentidoPorDevice = new Map(); // chave -> { tipo, id, event, ..., validoAte, timeoutLimpeza }
// Tags RFID recebidas sem sentido ainda, por Devicename
const tagsPendentesPorDevice = new Map(); // chave -> [{ tag, payload, receivedAt }]
const flushEmAndamento = new Map(); // chave -> Promise (evita flush concorrente no mesmo leitor)

const INTERVALO_MAXIMO = 10 * 1000;   // espera da 2ª porta
const SENTIDO_VALIDO_MS = 20 * 1000;  // mantém sentido e descarta sensores nesse período
// Poda entre passagens: cobre espera da 2ª porta (10s) + folga
const BUFFER_TAGS_MS = INTERVALO_MAXIMO + 5 * 1000; // 15s
const REGISTRO_URL = ip_server + '/_bd/registro';


function bodyJsonValido(body) {
  return body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length > 0;
}

function formatarErroInfor(error, contexto) {
  if (error.code === 'ECONNABORTED') {
    return {
      status: 504,
      body: {
        ok: false,
        error: `Timeout ao integrar com ${contexto}.`,
        details: `A API externa não respondeu em ${INFOR.requestTimeoutMs}ms.`
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

function responderErroInfor(res, error, contexto) {
  if (res.headersSent) return;
  const { status, body } = formatarErroInfor(error, contexto);
  return res.status(status).json(body);
}

async function obterTokenInfor() {
  const data = qs.stringify({
    grant_type: 'password',
    username: INFOR.grantUsername,
    password: INFOR.grantPassword
  });

  const response = await axios.request({
    method: 'post',
    maxBodyLength: Infinity,
    timeout: INFOR.requestTimeoutMs,
    url: INFOR.tokenUrl,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: INFOR.authorizationBasic
    },
    data,
    validateStatus: (status) => status < 500
  });

  const accessToken = response.data && response.data.access_token;
  if (!accessToken) {
    const err = new Error('Resposta OAuth sem access_token.');
    err.response = response;
    throw err;
  }

  return accessToken;
}

async function postInforComToken(url, payload) {
  const accessToken = await obterTokenInfor();
  return axios.request({
    method: 'post',
    maxBodyLength: Infinity,
    timeout: INFOR.requestTimeoutMs,
    url,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    data: payload,
    validateStatus: () => true
  });
}

async function getInforComToken(url) {
  const accessToken = await obterTokenInfor();
  return axios.request({
    method: 'get',
    maxBodyLength: Infinity,
    timeout: INFOR.requestTimeoutMs,
    url,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    },
    validateStatus: () => true
  });
}

/** Extrai toids únicos de receiptdetails (inf_compl1 no Seal). Usa linhas com qtyexpected > 0. */
function extrairToidsDeReceiptdetails(receiptdetails) {
  const toids = [];
  for (const det of receiptdetails || []) {
    const toid = String(det && det.toid != null ? det.toid : '').trim();
    if (!toid) continue;
    const qtyExpected = Number(det.qtyexpected) || 0;
    if (qtyExpected <= 0) continue;
    toids.push(toid);
  }
  return [...new Set(toids)];
}

async function montarPosicaoPorInfCompl1(id_conta, id_doc, idsUnicos) {
  const Item = require('../models/item');
  const Posicao = require('../models/posicao');
  const shortid = require('shortid');

  if (!idsUnicos.length) {
    return { itensResposta: [], itensPosicao: [], posicao: null };
  }

  const itensDb = await Item.find({
    id_conta,
    inf_compl1: { $in: idsUnicos }
  })
    .select('_id tag id_categoria inf_compl1')
    .populate('id_categoria', 'descricao ean')
    .lean();

  const porInfCompl1 = new Map();
  for (const it of itensDb) {
    const chave = String(it.inf_compl1 || '').trim();
    if (chave && !porInfCompl1.has(chave)) {
      porInfCompl1.set(chave, it);
    }
  }

  const agora = new Date();
  const itensResposta = [];
  const itensPosicao = [];

  for (const infId of idsUnicos) {
    const cadastro = porInfCompl1.get(infId);
    if (!cadastro) {
      itensResposta.push({
        id: infId,
        cadastrado: false,
        mensagem: 'Item não cadastrado'
      });
      continue;
    }

    const cat = cadastro.id_categoria;
    const idCategoria = (cat && cat._id) || (typeof cadastro.id_categoria === 'string' ? cadastro.id_categoria : null);
    const ean = (cat && cat.ean) || '';
    const descricaoCategoria = (cat && cat.descricao) || '';

    itensResposta.push({
      id: infId,
      cadastrado: true,
      _id: cadastro._id,
      epc: cadastro.tag || '',
      id_categoria: idCategoria,
      ean,
      descricao_categoria: descricaoCategoria
    });

    itensPosicao.push({
      _id: shortid.generate(),
      id_item: cadastro._id,
      id_categoria: idCategoria,
      tag: cadastro.tag || '',
      ean,
      rssi: '',
      inf_compl_1: infId,
      quantidade: 1,
      status: 'pendente',
      status_data: agora,
      status_destino: 'pendente',
      status_destino_data: ''
    });
  }

  await Posicao.deleteMany({ id_conta, id_doc });

  let posicao = null;
  if (itensPosicao.length) {
    posicao = await Posicao.create({
      _id: shortid.generate(),
      id_conta,
      id_colaborador: '',
      ativo: '1',
      id_doc,
      descricao: id_doc,
      tipo: 'conferencia',
      status: 'pendente',
      status_data: agora,
      partida_data: agora,
      tolerancia: 30,
      itens: itensPosicao
    });
  }

  return { itensResposta, itensPosicao, posicao };
}

module.exports = (app) => {

  /** Socket exclusivo do log do portal — não altera o fluxo de registro. */
  function emitirLogPortal(dados) {
    try {
      const io = app.get('io');
      if (!io) return;
      io.emit('x_naturgy_portal_log', {
        data_hora: moment().utcOffset(-3).format('YYYY-MM-DD HH:mm:ss'),
        tag: dados.tag || '',
        rssi: dados.rssi != null ? String(dados.rssi) : '',
        status_sensor: dados.status_sensor || '',
        device: dados.device || '',
        tokem: dados.tokem || '',
        antena: dados.antena || ''
      });
    } catch (e) {
      console.warn('[x_naturgy] emitirLogPortal:', e.message);
    }
  }

  function roomPortalConta(idConta) {
    return 'portal:' + String(idConta || '');
  }

  /** True se portal_movimentacao está aberto (alguém na room portal:{id_conta}). */
  function portalOnline(idConta) {
    try {
      const io = app.get('io');
      if (!io || !idConta) return false;
      const room = io.sockets.adapter.rooms.get(roomPortalConta(idConta));
      return !!(room && room.size > 0);
    } catch (e) {
      return false;
    }
  }

  // Sinaleiro ativo por gateway (nome base): bloqueia nova chamada até expirar o timeout GPO anterior
  const sinaleiroAtivoPorGateway = new Map(); // name -> { ate: timestamp }

  async function acionarSinaleiro(deviceName, cor, tempo) {
    // GPO usa o nome base do leitor (P02), não o tokem com sentido (P02-E / P02-S)
    const name = String(deviceName || '').trim().replace(/-[EeSs]$/, '');
    const corNum = Number(cor);
    const tempoNum = Number(tempo);
    if (!name) throw new Error('Informe deviceName.');
    if (![1, 2, 4].includes(corNum)) throw new Error('cor inválida (use 1=verde, 2=amarelo, 4=vermelho).');
    if (!Number.isFinite(tempoNum) || tempoNum < 0) throw new Error('Informe tempo (timeout) válido.');

    const agora = Date.now();
    const ativo = sinaleiroAtivoPorGateway.get(name);
    if (ativo && agora < ativo.ate) {
      return {
        ok: true,
        ignored: true,
        reason: 'sinaleiro ainda ativo neste gateway',
        gateway: name,
        restanteMs: ativo.ate - agora
      };
    }

    const payload = {
      command: 'WriteGPO',
      device: { name: name },
      data: { value: corNum, timeout: tempoNum }
    };

    const response = await axios.post(ip_middleware, payload, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true
    });

    const ok = response.status >= 200 && response.status < 300;
    if (ok) {
      sinaleiroAtivoPorGateway.set(name, { ate: Date.now() + tempoNum });
    }

    return {
      ok,
      status: response.status,
      enviado: payload,
      resposta: response.data
    };
  }

  async function sinaleiroSePortalFechado(gateway) {
    if (!gateway || !gateway.tokem) return;
    if (portalOnline(gateway.id_conta)) return;

    try {
      const r = await acionarSinaleiro(gateway.tokem, 4, 10000);
      if (r.ignored) return;
      console.log('[x_naturgy] sinaleiro portal fechado:', {
        tokem: gateway.tokem,
        ok: r.ok,
        status: r.status
      });
    } catch (e) {
      console.warn('[x_naturgy] sinaleiro portal fechado:', e.message);
    }
  }

  app.post('/api/get-token', async (req, res) => {
    try {
      const accessToken = await obterTokenInfor();
      return res.status(200).json({
        access_token: accessToken,
        token_type: 'Bearer'
      });
    } catch (error) {
      console.error('[api/get-token] Erro:', error.response?.data || error.message);
      return responderErroInfor(res, error, 'autenticação externa');
    }
  });

  /**
   * GET /x_naturgy/pickdetails/:id?id_conta=...
   * Consulta picks na Infor pelo orderkey, cruza com item.inf_compl1 da conta
   * e grava/recria Posicao com id_doc = orderkey.
   */
  app.get('/x_naturgy/pickdetails/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      const id_conta = String(req.query.id_conta || '').trim();

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: 'Informe o id (orderkey).'
        });
      }

      if (!id_conta) {
        return res.status(400).json({
          ok: false,
          error: 'Informe id_conta.'
        });
      }

      const url = `${INFOR.pickdetailsBaseUrl}/${encodeURIComponent(id)}/findpicksbyorderkey`;
      console.log('[x_naturgy/pickdetails] url:', url);

      const response = await postInforComToken(url, '');

      const sucesso = response.status >= 200 && response.status < 300;

      if (!sucesso) {
        return res.status(response.status).json({
          ok: false,
          error: 'API Infor retornou erro no findpicksbyorderkey.',
          details: response.data
        });
      }

      const raw = response.data;
      let ids = [];

      if (Array.isArray(raw)) {
        ids = raw.map((item) => (item && item.id != null ? item.id : null)).filter((v) => v != null);
      } else if (raw && Array.isArray(raw.pickdetails)) {
        ids = raw.pickdetails.map((item) => (item && item.id != null ? item.id : null)).filter((v) => v != null);
      } else if (raw && Array.isArray(raw.data)) {
        ids = raw.data.map((item) => (item && item.id != null ? item.id : null)).filter((v) => v != null);
      } else if (raw && raw.id != null) {
        ids = [raw.id];
      }

      const idsUnicos = [...new Set(ids.map((v) => String(v).trim()).filter(Boolean))];

      if (!idsUnicos.length) {
        return res.status(200).json({ ok: true, itens: [], posicao: null });
      }

      const Item = require('../models/item');
      const Posicao = require('../models/posicao');
      const shortid = require('shortid');

      const itensDb = await Item.find({
        id_conta,
        inf_compl1: { $in: idsUnicos }
      })
        .select('_id tag id_categoria inf_compl1')
        .populate('id_categoria', 'descricao ean')
        .lean();

      const porInfCompl1 = new Map();
      for (const it of itensDb) {
        const chave = String(it.inf_compl1 || '').trim();
        if (chave && !porInfCompl1.has(chave)) {
          porInfCompl1.set(chave, it);
        }
      }

      const agora = new Date();
      const itensResposta = [];
      const itensPosicao = [];

      for (const infId of idsUnicos) {
        const cadastro = porInfCompl1.get(infId);
        if (!cadastro) {
          itensResposta.push({
            id: infId,
            cadastrado: false,
            mensagem: 'Item não cadastrado'
          });
          continue;
        }

        const cat = cadastro.id_categoria;
        const idCategoria = (cat && cat._id) || (typeof cadastro.id_categoria === 'string' ? cadastro.id_categoria : null);
        const ean = (cat && cat.ean) || '';
        const descricaoCategoria = (cat && cat.descricao) || '';

        itensResposta.push({
          id: infId,
          cadastrado: true,
          _id: cadastro._id,
          epc: cadastro.tag || '',
          id_categoria: idCategoria,
          ean,
          descricao_categoria: descricaoCategoria
        });

        itensPosicao.push({
          _id: shortid.generate(),
          id_item: cadastro._id,
          id_categoria: idCategoria,
          tag: cadastro.tag || '',
          ean,
          rssi: '',
          inf_compl_1: infId,
          quantidade: 1,
          status: 'pendente',
          status_data: agora,
          status_destino: 'pendente',
          status_destino_data: ''
        });
      }

      // Se já existir posição com esse id_doc na conta, remove e cria nova
      await Posicao.deleteMany({ id_conta, id_doc: id });

      const posicao = await Posicao.create({
        _id: shortid.generate(),
        id_conta,
        id_colaborador: '',
        ativo: '1',
        id_doc: id,
        descricao: id,
        tipo: 'conferencia',
        status: 'pendente',
        status_data: agora,
        partida_data: agora,
        tolerancia: 30,
        itens: itensPosicao
      });

      return res.status(200).json({
        ok: true,
        itens: itensResposta,
        posicao
      });
    } catch (error) {
      console.error('[x_naturgy/pickdetails] Erro:', error.response?.data || error.message);
      return responderErroInfor(res, error, 'API findpicksbyorderkey');
    }
  });


  /**
   * GET /x_naturgy/receiptdetails/:id?id_conta=...
   * Consulta receipt na Infor (receiptkey), extrai toid de receiptdetails,
   * cruza com item.inf_compl1 da conta e grava/recria Posicao com id_doc = receiptkey.
   */
  app.get('/x_naturgy/receiptdetails/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      const id_conta = String(req.query.id_conta || '').trim();

      if (!id) {
        return res.status(400).json({
          ok: false,
          error: 'Informe o id (receiptkey).'
        });
      }

      if (!id_conta) {
        return res.status(400).json({
          ok: false,
          error: 'Informe id_conta.'
        });
      }

      const url = `${INFOR.receiptsUrl}/${encodeURIComponent(id)}`;
      console.log('[x_naturgy/receiptdetails] url:', url);

      const response = await getInforComToken(url);
      console.log('[x_naturgy/receiptdetails] status:', response.status);
      const sucesso = response.status >= 200 && response.status < 300;

      if (!sucesso) {
        return res.status(response.status).json({
          ok: false,
          error: 'API Infor retornou erro ao consultar receipt.',
          details: response.data
        });
      }

      const raw = response.data;
      const receiptdetails = raw && Array.isArray(raw.receiptdetails) ? raw.receiptdetails : [];
      let idsUnicos = extrairToidsDeReceiptdetails(receiptdetails);
      console.log('idsUnicos:', idsUnicos);

      // if(idsUnicos.length == 0){
      //   idsUnicos = ["NS001", "NS002"]
      // }

      console.log('idsUnicos:', idsUnicos);

      if (!idsUnicos.length) {
        return res.status(200).json({ ok: true, itens: [], posicao: null });
      }

      const { itensResposta, posicao } = await montarPosicaoPorInfCompl1(id_conta, id, idsUnicos);

      return res.status(200).json({
        ok: true,
        itens: itensResposta,
        posicao
      });
    } catch (error) {
      console.error('[x_naturgy/receiptdetails] Erro:', error.response?.data || error.message);
      return responderErroInfor(res, error, 'API receipts');
    }
  });

  app.get('/x_naturgy/:id_posicao', async (req, res) => {
    try {
      const { id_posicao } = req.params;
      const Posicao = require("../models/posicao");
      const Localizacao = require("../models/localizacao");
      const Item = require("../models/item");

      const posicao = await Posicao.findById(id_posicao);
      if (!posicao) {
        return res.status(404).json({ ok: false, error: 'Posição não encontrada.' });
      }

      const localizacao = await Localizacao.findById(posicao.id_nivel_loc2);
      if (!localizacao) {
        return res.status(404).json({ ok: false, error: 'Localização não encontrada.' });
      }


      // Recebimento
      if (localizacao.descricao == 'Recebimento') {

        const _naturgyEntrada = {
          receiptkey: posicao.id_doc,
          receiptdetails: []
        };

        for (const item of posicao.itens) {

          _naturgyEntrada.receiptdetails.push({
            receiptkey: posicao.id_doc,
            sku: item.ean,
            qtyreceived: 1, // item.quantidade,
            toid: item.inf_compl_1,
            lottable02: posicao.descricao  == 'testeceg' ? 'TESTE178502' : posicao.descricao
          });
        }

        const response = await axios.request({
          method: 'post',
          maxBodyLength: Infinity,
          timeout: INFOR.requestTimeoutMs,
          url: INFOR.baseUrl + '/x_naturgy/receipts',
          data: _naturgyEntrada,
          validateStatus: () => true
        });

        let json = {
          status: response.status,
          retorno: response.data.data,
          payload: _naturgyEntrada,
        }

        if (response.status == 200) {
          return res.status(200).json(json);
        } else {
          return res.status(response.data.status).json(json);
        }

      }

      // Saída
      console.log("localizacao.descricao: " + localizacao.descricao)
      if (localizacao.descricao == 'Saída') {
        const resultados = [];

        for (const item of posicao.itens) {
          const itemModel = await Item.findById(item.id_item);
          if (!itemModel) continue;

          const _naturgySaida = {
            orderkey: posicao.id_doc,
            id: itemModel.inf_compl1
          };

          const response = await axios.request({
            method: 'post',
            maxBodyLength: Infinity,
            timeout: INFOR.requestTimeoutMs,
            url: INFOR.baseUrl + '/x_naturgy/rfid',
            data: _naturgySaida,
            validateStatus: () => true
          });

          resultados.push({
            payload: _naturgySaida,
            status: response.status,
            data: response.data
          });
        }

        const todosOk = resultados.length > 0 && resultados.every((r) => r.status >= 200 && r.status < 300);

        return res.status(todosOk ? 200 : 502).json({
          ok: todosOk,
          resultados
        });
      }

      return res.status(400).json({
        ok: false,
        error: 'Localização não configurada para integração Naturgy.',
        localizacao: localizacao.descricao
      });
    } catch (error) {
      console.error('[x_naturgy/:id_posicao] Erro:', error.response?.data || error.message);
      return responderErroInfor(res, error, 'integração Naturgy');
    }
  });


  /**
   * POST /x_naturgy/receipts
   * Body: { receiptkey, receiptdetails, ... } — repassado para a API Infor.
   * Obtém um token novo a cada chamada.
   */
  app.post('/x_naturgy/receipts', async (req, res) => {
    try {

        const payload = req.body;

        if (!bodyJsonValido(payload)) {
            return res.status(400).json({
                ok: false,
                error: 'Body inválido. Envie um JSON com receiptkey e receiptdetails.'
            });
        }

        if (!payload.receiptkey || !Array.isArray(payload.receiptdetails)) {
            return res.status(400).json({
                ok: false,
                error: 'Body inválido. Informe receiptkey e receiptdetails (array).'
            });
        }

        const response = await postInforComToken(
            INFOR.receiptsUrl,
            payload
        );

        console.log('STATUS INFOR:', response.status);
        console.log('DATA INFOR:', response.data);

        let json = {
          status: response.status,
          data: response.data.message
        }

        console.log('JSON INFOR:', json);

        return res.status(response.status).json(json);

    } catch (error) {

        console.error(
            '[x_naturgy/receipts] Erro:',
            error.response?.data || error.message
        );

        return res.status(500).json({
            error: error.message
        });
    }
});

  /**
   * POST /x_naturgy/rfid
   * Body: { orderkey, id, ... } — repassado para APIFLOWS/bluelogistica/rfid.
   * Obtém um token novo a cada chamada.
   */
  app.post('/x_naturgy/rfid', async (req, res) => {
    try {
      const payload = req.body;
      console.log('[x_naturgy/rfid] payload:', payload);

      if (!bodyJsonValido(payload)) {
        return res.status(400).json({
          ok: false,
          error: 'Body inválido. Envie um JSON com orderkey e id.'
        });
      }

      if (!payload.orderkey || payload.id == null || payload.id === '') {
        return res.status(400).json({
          ok: false,
          error: 'Body inválido. Informe orderkey e id.'
        });
      }

      const response = await postInforComToken(INFOR.rfidUrl, payload);
      const sucesso = response.status >= 200 && response.status < 300;

      console.log("response: " + response)


      return res.status(response.status).json({
        ok: sucesso,
        status: response.status,
        data: response.data,
        ...(sucesso ? {} : { error: 'API Infor retornou erro no RFID.' })
      });
    } catch (error) {
      console.error('[x_naturgy/rfid] Erro:', error.response?.data || error.message);
      return responderErroInfor(res, error, 'API RFID');
    }
  });

  // Sentido do device (ainda válido na janela de 20s)
  function normalizarChaveDevice(valor) {
    return String(valor || '').trim().toUpperCase();
  }

  /** Unifica Devicename do RFID e do sensor (campos e casing diferentes). */
  function chaveFromBody(body) {
    const b = body || {};
    const fromName = b.Devicename || b.DeviceName || b.devicename || b.deviceName || b.device || '';
    if (String(fromName).trim()) return normalizarChaveDevice(fromName);
    return normalizarChaveDevice(b.id || '');
  }

  function rawDeviceFromBody(body) {
    const b = body || {};
    return String(
      b.Devicename || b.DeviceName || b.devicename || b.deviceName || b.device || b.id || ''
    ).trim();
  }

  function getSentidoDevice(chave) {
    const key = normalizarChaveDevice(chave);
    const reg = sentidoPorDevice.get(key);
    if (!reg) return null;
    if (Date.now() > reg.validoAte) {
      limparSentidoDevice(key);
      return null;
    }
    return reg;
  }

  function limparSentidoDevice(chave) {
    const key = normalizarChaveDevice(chave);
    const reg = sentidoPorDevice.get(key);
    if (reg && reg.timeoutLimpeza) clearTimeout(reg.timeoutLimpeza);
    sentidoPorDevice.delete(key);
  }

  function limparSequenciaDevice(chave) {
    const key = normalizarChaveDevice(chave);
    const pendente = sensoresEmAnalise.get(key);
    if (pendente && pendente.timeout) clearTimeout(pendente.timeout);
    sensoresEmAnalise.delete(key);
  }

  function tokemPorSentido(deviceName, tipoMovimento) {
    // tokem cadastrado costuma ser P03-E (device original + sufixo); mantém casing do cadastro via device “cru”
    const sendido = tipoMovimento === 'saida' ? 'S' : 'E';
    const base = String(deviceName || '').trim();
    // Preferência: usa a forma guardada no movimento, senão a chave
    return base + '-' + sendido;
  }

  function montarRegistroPortal(tokemPortal, payload) {
    return {
      tokem: tokemPortal,
      tag: payload.Tagid || payload.TagId || payload.tagid || payload.tag,
      data_leitura: '',
      antena: payload.Antennaname || payload.AntennaName || '0',
      rssi: payload.Rssi || payload.rssi || '-0',
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

  async function enviarRegistroPortal(registro) {
    const resp = await axios.post(REGISTRO_URL, registro, { timeout: 5000 });
    if (resp.data && resp.data.ignored) {
      const err = new Error(resp.data.message || 'Registro ignorado');
      err.ignored = true;
      err.response = resp;
      throw err;
    }
    return resp.data;
  }

  /**
   * Consome a fila deste leitor.
   * @param {boolean} aoFecharSentido - se true, envia TUDO da fila (não descarta por idade).
   *   A idade só limpa lixo entre passagens no enfileirar / limparFilaDevice.
   */
  function consumirTagsPendentes(deviceName, aoFecharSentido) {
    const key = normalizarChaveDevice(deviceName);
    const agora = Date.now();
    const lista = [];
    const descartadas = [];

    for (const [k, arr] of tagsPendentesPorDevice.entries()) {
      if (normalizarChaveDevice(k) !== key) continue;
      for (const item of (arr || [])) {
        const idade = agora - item.receivedAt;
        if (aoFecharSentido || idade <= BUFFER_TAGS_MS) {
          lista.push({ ...item, idadeMs: idade });
        } else {
          descartadas.push({ tag: item.tag, idadeMs: idade });
        }
      }
      tagsPendentesPorDevice.delete(k);
    }

    if (descartadas.length) {
      console.warn('[x_naturgy] tags descartadas por idade no consumo:', {
        device: key,
        descartadas
      });
    }

    // Dedupe por EPC (mantém a mais recente)
    const porTag = new Map();
    for (const item of lista) {
      const prev = porTag.get(item.tag);
      if (!prev || item.receivedAt >= prev.receivedAt) porTag.set(item.tag, item);
    }
    return Array.from(porTag.values());
  }

  function limparFilaDevice(deviceName, motivo) {
    const key = normalizarChaveDevice(deviceName);
    const tinha = tagsPendentesPorDevice.get(key);
    if (tinha && tinha.length) {
      console.log('[x_naturgy] limpando fila do device:', {
        device: key,
        qtd: tinha.length,
        motivo
      });
    }
    tagsPendentesPorDevice.delete(key);
  }

  /** Mantém tags deste leitor enquanto aguarda o sentido. */
  function enfileirarTagPendente(deviceName, payload) {
    const key = normalizarChaveDevice(deviceName);
    const agora = Date.now();
    const tag = String(
      payload.Tagid || payload.TagId || payload.tagid || payload.tag || ''
    ).trim();
    if (!tag || !key) return { buffered: 0, tag: null };

    let lista = tagsPendentesPorDevice.get(key) || [];
    // Poda só lixo antigo entre passagens (15s)
    lista = lista.filter((t) => agora - t.receivedAt <= BUFFER_TAGS_MS);
    lista = lista.filter((t) => t.tag !== tag);
    lista.push({
      tag,
      payload,
      receivedAt: agora,
      deviceRaw: String(deviceName || '').trim()
    });
    tagsPendentesPorDevice.set(key, lista);

    console.log('[x_naturgy] tag bufferizada:', {
      device: key,
      tag,
      naFila: lista.length,
      fase: 'aguardando'
    });
    return { buffered: lista.length, tag };
  }

  /**
   * Ao ter sentido neste leitor, envia as tags bufferizadas só dele.
   * Lock por device evita dois flushes concorrentes (sensor + portal) esvaziarem a fila sem enviar.
   */
  async function flushTagsPendentes(deviceName, movimento, deviceRawParaTokem) {
    const key = normalizarChaveDevice(deviceName);

    if (flushEmAndamento.has(key)) {
      console.log('[x_naturgy] flush: aguardando flush em andamento', { device: key });
      return flushEmAndamento.get(key);
    }

    const job = (async () => {
      const snapshotAntes = (tagsPendentesPorDevice.get(key) || []).map((t) => ({
        tag: t.tag,
        idadeMs: Date.now() - t.receivedAt
      }));

      // Ao fechar sentido: NÃO filtra por idade — aproveita tudo que estava na fila deste leitor
      const lista = consumirTagsPendentes(key, true);

      if (!lista.length || !movimento || !movimento.tipo) {
        console.log('[x_naturgy] flush: nada a enviar', {
          device: key,
          sentido: movimento && movimento.tipo,
          snapshotAntes,
          filasAbertas: Array.from(tagsPendentesPorDevice.keys())
        });
        return { enviados: 0, falhas: 0, pendentes: 0, snapshotAntes };
      }

      const baseTokem = String(
        deviceRawParaTokem
        || movimento.devicenameRaw
        || movimento.devicename
        || deviceName
        || ''
      ).trim();
      const tokemPortal = tokemPorSentido(baseTokem, movimento.tipo);

      const gateway = await Gateway.findOne({ tokem: tokemPortal, ativo: 1 });
      if (!gateway) {
        const atual = tagsPendentesPorDevice.get(key) || [];
        tagsPendentesPorDevice.set(key, atual.concat(lista));
        console.warn(
          `[x_naturgy] flush tags: gateway ${tokemPortal} não encontrado (device ${key}). Tags reenfileiradas.`
        );
        return { enviados: 0, falhas: lista.length, tokemPortal, pendentes: lista.length };
      }

      let enviados = 0;
      let falhas = 0;
      const requeue = [];

      for (const item of lista) {
        try {
          const registro = montarRegistroPortal(tokemPortal, item.payload);
          await enviarRegistroPortal(registro);
          enviados += 1;
        } catch (err) {
          falhas += 1;
          // ignored (debounce 5s) = já foi registrado recentemente; não reenfileira
          if (!err.ignored) requeue.push(item);
          console.error(
            `[x_naturgy] flush tag ${item.tag} em ${key}:`,
            err.response?.data || err.message
          );
        }
      }

      if (enviados > 0) {
        await sinaleiroSePortalFechado(gateway);
      }

      if (requeue.length) {
        const atual = tagsPendentesPorDevice.get(key) || [];
        tagsPendentesPorDevice.set(key, atual.concat(requeue));
      }

      console.log('[x_naturgy] flush tags pendentes:', {
        device: key,
        sentido: movimento.tipo,
        tokemPortal,
        enviados,
        falhas,
        requeue: requeue.length,
        idadesMs: lista.map((t) => t.idadeMs)
      });

      return { enviados, falhas, tokemPortal, pendentes: lista.length };
    })();

    flushEmAndamento.set(key, job);
    try {
      return await job;
    } finally {
      flushEmAndamento.delete(key);
    }
  }

  /**
   * POST /x_naturgy/registro/sensor
   * Por device: 1ª porta → espera até 10s a 2ª → marca sentido por 20s (descarta sensores nesse período).
   */
  app.post('/x_naturgy/registro/sensor', async (req, res) => {
    try {
      const {
        id,
        event,
        port,
        message
      } = req.body;

      const porta = Number(port);

      if (![1, 2].includes(porta)) {
        return res.status(400).json({
          success: false,
          message: 'A porta deve ser 1 ou 2.'
        });
      }

      const chaveSensor = chaveFromBody(req.body);
      const deviceRaw = rawDeviceFromBody(req.body);

      if (!chaveSensor) {
        return res.status(400).json({
          success: false,
          message: 'Informe Devicename (ou id).'
        });
      }

      const agora = Date.now();
      const deviceLog = deviceRaw || chaveSensor;

      // Já tem sentido válido neste portal → descarta sensores por 20s
      const sentidoAtivo = getSentidoDevice(chaveSensor);
      if (sentidoAtivo) {
        limparSequenciaDevice(chaveSensor);
        emitirLogPortal({
          tag: 'SENSOR',
          rssi: '',
          antena: String(porta),
          device: deviceLog,
          status_sensor: 'sensor_descartado'
        });
        return res.json({
          success: true,
          status: 'descartado',
          message: `Sentido ${sentidoAtivo.tipo} ativo para este portal; sensores descartados.`,
          tipo: sentidoAtivo.tipo,
          restanteMs: sentidoAtivo.validoAte - agora
        });
      }

      const estadoAnterior = sensoresEmAnalise.get(chaveSensor);

      // 1ª porta: inicia sequência e aguarda até 10s
      if (!estadoAnterior) {
        const timeout = setTimeout(() => {
          sensoresEmAnalise.delete(chaveSensor);
          limparFilaDevice(chaveSensor, 'sequencia_expirada');
          console.log(
            `Sequência expirada para ${chaveSensor}. Porta inicial: ${porta}`
          );
        }, INTERVALO_MAXIMO);

        // Nova passagem: zera fila — só entram tags DEPOIS deste 1º sensor
        limparFilaDevice(chaveSensor, 'inicio_aguardando');

        sensoresEmAnalise.set(chaveSensor, {
          primeiraPorta: porta,
          data: agora,
          timeout,
          deviceRaw
        });

        console.log('[x_naturgy] sensor aguardando 2ª porta:', {
          device: chaveSensor,
          primeiraPorta: porta
        });

        emitirLogPortal({
          tag: 'SENSOR',
          rssi: '',
          antena: String(porta),
          device: deviceLog,
          status_sensor: 'sensor_1'
        });

        return res.json({
          success: true,
          status: 'aguardando',
          device: chaveSensor,
          primeiraPorta: porta,
          limiteSegundos: INTERVALO_MAXIMO / 1000
        });
      }

      const tempoDecorrido = agora - estadoAnterior.data;
      clearTimeout(estadoAnterior.timeout);
      sensoresEmAnalise.delete(chaveSensor);

      if (tempoDecorrido > INTERVALO_MAXIMO) {
        emitirLogPortal({
          tag: 'SENSOR',
          rssi: '',
          antena: String(porta),
          device: deviceLog,
          status_sensor: 'sensor_expirado'
        });
        return res.json({
          success: true,
          status: 'expirado',
          message: `O intervalo máximo de ${INTERVALO_MAXIMO / 1000} segundos foi ultrapassado.`
        });
      }

      if (estadoAnterior.primeiraPorta === porta) {
        // Mesma porta de novo: reinicia a espera com esta como 1ª
        const timeout = setTimeout(() => {
          sensoresEmAnalise.delete(chaveSensor);
          limparFilaDevice(chaveSensor, 'sequencia_expirada');
          console.log(
            `Sequência expirada para ${chaveSensor}. Porta inicial: ${porta}`
          );
        }, INTERVALO_MAXIMO);

        sensoresEmAnalise.set(chaveSensor, {
          primeiraPorta: porta,
          data: agora,
          timeout,
          deviceRaw
        });

        // Reinício da 1ª porta: só tags a partir de agora
        limparFilaDevice(chaveSensor, 'reinicio_aguardando');

        emitirLogPortal({
          tag: 'SENSOR',
          rssi: '',
          antena: String(porta),
          device: deviceLog,
          status_sensor: 'sensor_1'
        });

        return res.json({
          success: true,
          status: 'aguardando',
          message: `A porta ${porta} foi recebida de novo; reiniciando sequência.`,
          device: chaveSensor,
          primeiraPorta: porta,
          limiteSegundos: INTERVALO_MAXIMO / 1000
        });
      }

      let tipoMovimento = null;
      // if (estadoAnterior.primeiraPorta === 1 && porta === 2) tipoMovimento = 'entrada';
      // if (estadoAnterior.primeiraPorta === 2 && porta === 1) tipoMovimento = 'saida';
      if (estadoAnterior.primeiraPorta === 1 && porta === 2) tipoMovimento = 'saida';
      if (estadoAnterior.primeiraPorta === 2 && porta === 1) tipoMovimento = 'entrada';

      if (!tipoMovimento) {
        emitirLogPortal({
          tag: 'SENSOR',
          rssi: '',
          antena: String(porta),
          device: deviceLog,
          status_sensor: 'sensor_ignorado'
        });
        return res.json({
          success: true,
          status: 'ignorado',
          message: 'Sequência de portas inválida.'
        });
      }

      const validoAte = agora + SENTIDO_VALIDO_MS;
      const timeoutLimpeza = setTimeout(() => {
        sentidoPorDevice.delete(chaveSensor);
        console.log(`Sentido expirado para ${chaveSensor} (${tipoMovimento}).`);
      }, SENTIDO_VALIDO_MS);

      const rawParaTokem = deviceRaw || estadoAnterior.deviceRaw || chaveSensor;

      const movimento = {
        tipo: tipoMovimento,
        id,
        event,
        devicename: chaveSensor,
        devicenameRaw: rawParaTokem,
        message,
        primeiraPorta: estadoAnterior.primeiraPorta,
        segundaPorta: porta,
        intervaloMilissegundos: tempoDecorrido,
        data: new Date(),
        validoAte
      };

      sentidoPorDevice.set(chaveSensor, {
        ...movimento,
        timeoutLimpeza
      });

      console.log('Movimento identificado (por device):', {
        device: chaveSensor,
        deviceRaw: rawParaTokem,
        tipo: tipoMovimento,
        validoPorMs: SENTIDO_VALIDO_MS
      });

      emitirLogPortal({
        tag: 'SENSOR',
        rssi: '',
        antena: String(porta),
        device: deviceLog,
        tokem: tokemPorSentido(rawParaTokem, tipoMovimento),
        status_sensor: tipoMovimento === 'entrada' ? 'sensor_entrada' : 'sensor_saida'
      });

      // Aguarda o flush para as tags bufferizadas deste leitor entrarem agora
      const flush = await flushTagsPendentes(chaveSensor, movimento, rawParaTokem);

      return res.json({
        success: true,
        status: 'concluido',
        movimento,
        flush
      });

    } catch (error) {
      console.error('Erro ao processar sensor:', error);

      return res.status(500).json({
        success: false,
        message: 'Erro interno ao processar o sensor.',
        error: error.message
      });
    }
  });


  app.post('/x_naturgy/registro/portal', async (req, res) => {

    const payload = req.body;
    const deviceRaw = rawDeviceFromBody(payload);
    const deviceName = chaveFromBody(payload);

    if (!deviceName) {
      return res.status(400).json({
        ok: false,
        error: 'Informe Devicename.'
      });
    }

    const tagId = payload.Tagid || payload.TagId || payload.tagid || payload.tag;
    if (!tagId) {
      return res.status(400).json({
        ok: false,
        error: 'Informe Tagid.'
      });
    }

    // Normaliza para o restante do fluxo
    payload.Tagid = tagId;
    const rssi = payload.Rssi || payload.rssi || '';
    const antena = payload.Antennaname || payload.AntennaName || '';

    const movimento = getSentidoDevice(deviceName);

    console.log('sentido device ' + deviceName + ':', movimento && movimento.tipo);

    // Só bufferiza DEPOIS da 1ª porta (status aguardando).
    // Antes de qualquer sensor → descarta a tag.
    if (!movimento || !movimento.tipo) {
      const emAguardo = sensoresEmAnalise.has(deviceName);

      if (!emAguardo) {
        console.log('[x_naturgy] tag descartada (sem 1º sensor ainda):', {
          device: deviceName,
          tag: tagId
        });
        emitirLogPortal({
          tag: tagId,
          rssi,
          antena,
          device: deviceRaw || deviceName,
          status_sensor: 'pre_sensor'
        });
        return res.status(200).json({
          ok: true,
          discarded: true,
          fase: 'pre_sensor',
          device: deviceName,
          tag: tagId,
          message: 'Tag descartada: aguardando o 1º sensor deste portal.'
        });
      }

      const fila = enfileirarTagPendente(deviceName, payload);

      emitirLogPortal({
        tag: tagId,
        rssi,
        antena,
        device: deviceRaw || deviceName,
        status_sensor: 'aguardando'
      });

      return res.status(202).json({
        ok: true,
        buffered: true,
        fase: 'aguardando',
        status: 'aguardando',
        device: deviceName,
        tag: fila.tag,
        naFila: fila.buffered,
        bufferMs: BUFFER_TAGS_MS,
        message: 'Tag bufferizada após o 1º sensor; será enviada ao concluir o sentido.'
      });
    }

    // Com sentido: drena fila deste leitor (se o sensor ainda não drenou) e registra a tag atual
    const flush = await flushTagsPendentes(
      deviceName,
      movimento,
      movimento.devicenameRaw || deviceRaw
    );

    const tokemPortal = tokemPorSentido(
      movimento.devicenameRaw || deviceRaw,
      movimento.tipo
    );

    emitirLogPortal({
      tag: tagId,
      rssi,
      antena,
      device: deviceRaw || deviceName,
      tokem: tokemPortal,
      status_sensor: movimento.tipo // entrada | saida
    });

    const gateway = await Gateway.findOne({ tokem: tokemPortal, ativo: 1 });
    if (!gateway) {
      return res.status(404).json({
        ok: false,
        error: 'Gateway não encontrado.',
        tokem: tokemPortal
      });
    }

    const registro = montarRegistroPortal(tokemPortal, payload);

    try {
      await enviarRegistroPortal(registro);
    } catch (err) {
      if (err.ignored) {
        return res.status(200).json({
          ok: true,
          ignored: true,
          message: err.message,
          flush,
          sentido: movimento.tipo
        });
      }
      throw err;
    }

    await sinaleiroSePortalFechado(gateway);

    return res.status(200).json({
      ok: true,
      gateway: gateway,
      registro: registro,
      sentido: movimento.tipo,
      flush
    });

  });

  app.post('/x_naturgy/registro/cadastro', async (req, res) => {

    const payload = req.body;
    
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
      REGISTRO_URL,
      registro,
      { timeout: 5000 }
    );

    return res.status(200).json({
      ok: true,
      gateway: gateway,
      registro: registro
    });

  });

  // Sinaleiro GPO: deviceName + cor (1 verde, 2 amarelo, 4 vermelho) + tempo (timeout)
  app.post('/x_naturgy/sinaleiro', async (req, res) => {
    try {
      const deviceName = String(req.body?.deviceName || req.body?.Devicename || '').trim();
      const cor = Number(req.body?.cor);
      const tempo = Number(req.body?.tempo);
      const resultado = await acionarSinaleiro(deviceName, cor, tempo);
      return res.status(200).json(resultado);
    } catch (error) {
      const msg = error.message || String(error);
      if (
        msg.includes('Informe deviceName') ||
        msg.includes('cor inválida') ||
        msg.includes('Informe tempo')
      ) {
        return res.status(400).json({ ok: false, error: msg });
      }
      console.error('[x_naturgy/sinaleiro]', msg);
      return res.status(502).json({ ok: false, error: msg });
    }
  });

};
