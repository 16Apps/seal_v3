const axios = require('axios');
const qs = require('qs');

const Localizacao = require('../models/localizacao');
const Categoria = require('../models/categoria');
const Item = require('../models/item');
const Posicao = require('../models/posicao');
const Gateway = require('../models/gateway');

const ip_server = 'https://connectiot-app.azurewebsites.net';
const REGISTRO_URL = ip_server + '/_bd/registro';
const POSICAO_URL = ip_server + '/_bd/posicao';

const ultimasLeituras = new Map(); // { tag => timestamp }
const DEBOUNCE_LEITURA_MS = 10 * 1000;

function normalizarEpc(valor) {
  if (valor == null) return '';
  return valor.toString().replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
}

function parseDataBrasil(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor;

  const str = String(valor).trim();
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    const [, dia, mes, ano, hora = '0', minuto = '0', segundo = '0'] = match;
    return new Date(Number(ano), Number(mes) - 1, Number(dia), Number(hora), Number(minuto), Number(segundo));
  }

  const fallback = new Date(valor);
  return isNaN(fallback.getTime()) ? null : fallback;
}

module.exports = (app) => {

  app.get('/x_dsv/:id_posicao', async (req, res) => {
    try {
      const { id_posicao } = req.params;
      const posicao = await Posicao.findById(id_posicao);
      if (!posicao) {
        return res.status(404).json({ ok: false, error: 'Ordem de posição não encontrada.' });
      }
      return res.status(200).json({ ok: true, posicao });
    } catch (error) {
      console.error('[x_dsv/:id_posicao] Erro:', error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/x_dsv/registro', async (req, res) => {

    let id_conta = "b2428437-bd6b"

    let {
      datahora,
      pedido,
      notafiscal,

      destinatario,
      endereco,
      numero,
      bairro,
      cidade,
      uf,

      descricao_item,
      epc,
      tag,
      fornecedor
    } = req.body;

    try {

      //1. Verificar se o Destinatário já existe pelo Nome
      let localizacaoDestino = await Localizacao.findOne({ id_conta, descricao: destinatario });
      //1.1 Se não existir, registrar o Destinatário em Localizacao, com os dados de enderço
      //> Colletions: localizacao
      if (!localizacaoDestino) {
        localizacaoDestino = await Localizacao.create({
          id_conta,
          id_nivel: null,
          descricao: destinatario,
          logradouro: endereco,
          numero: numero,
          bairro: bairro,
          cidade: cidade,
          estado: uf
        });
      }

      //2. Verificar se a Categoria já existe pelo Nome
      let categoria = await Categoria.findOne({ id_conta, descricao: descricao_item });
      //2.1 Se não existir Cadastrar, com labels Label1 = Tag, Label2 = Fornecedor
      //> Colletions: categoria
      if (!categoria) {
        categoria = await Categoria.create({
          id_conta,
          descricao: descricao_item,
          labelInf1: 'Tag',
          labelInf2: 'Fornecedor'
        });
      }

      //3. Verificar se o Item já existe pelo EPC
      const epcNormalizado = normalizarEpc(epc);
      let item = await Item.findOne({ id_conta, tag: epcNormalizado });
      //3.1 Se não existir, vincular Categoria, Fornecedor e Tag Inf1. e Inf2. 
      //> Colletions: item
      if (!item) {
        item = await Item.create({
          id_conta,
          id_categoria: categoria._id,
          descricao: descricao_item,
          tag: epcNormalizado,
          inf_compl1: tag,
          inf_compl2: fornecedor
        });
      }

      //4. Preciso registrar uma Ordem de Posicao
      //4.1 Verificar se a Ordem de Posicao já existe pelo pedido
      let posicao = await Posicao.findOne({ id_conta, id_doc: pedido });
      //> Colletions: posicao

      const itemPosicao = {
        id_item: item._id,
        id_categoria: categoria._id,
        tag: item.tag,
        quantidade: 1,
        status: 'pendente',
        status_data: new Date(),
        status_destino: 'pendente',
        status_destino_data: new Date()
      };

      if (!posicao) {
        //4.2 Se não existir Registrar a Ordem de Posicao
        //4.2.2 Localizacao de inicio, a primeira localizacao cadastrada da conta
        const localizacaoInicio = await Localizacao.findOne({ id_conta, id_nivel: null }).sort({ createdAt: 1 });

        //4.2.2 Segundo nivel: a primeira localizacao filha (id_nivel = _id da localizacao de inicio)
        let localizacaoInicioNivel2 = null;
        if (localizacaoInicio) {
          localizacaoInicioNivel2 = await Localizacao.findOne({ id_conta, id_nivel: localizacaoInicio._id }).sort({ createdAt: 1 });
        }

        posicao = await Posicao.create({
          id_conta,
          ativo: '1',
          id_doc: pedido,
          descricao: notafiscal,
          tipo: 'conferencia',
          status: 'pendente',
          status_data: new Date(),
          partida_data: parseDataBrasil(datahora) || new Date(),

          //4.2.2 Localizacao de inicio, a primeira localizacao cadastrada da conta
          id_nivel_loc1: localizacaoInicio ? localizacaoInicio._id : null,
          //4.2.2 Segundo nivel: a primeira localizacao filha (id_nivel = _id da localizacao de inicio)
          id_nivel_loc2: localizacaoInicioNivel2 ? localizacaoInicioNivel2._id : null,

          //4.2.3 localizacao de destino, o Destinatário informado, 
          id_nivel_loc1_destino: localizacaoDestino._id,

          //4.2.1  Com o Items, 
          itens: [itemPosicao]
        });
      } else {
        //4.3 Se existir, vincular o Item a Ordem de Posicao
        const jaVinculado = (posicao.itens || []).some((it) => it.id_item === item._id);
        if (!jaVinculado) {
          posicao.itens.push(itemPosicao);
          await posicao.save();
        }
      }

      //5. Atualizar Item
      //5.1 Definir no cadastro do Item, a Ordem de Posicao
      item.registro_mov = { id_posicao: posicao._id, id_doc: posicao.id_doc };
      //5.2 Definir no cadastro do Item, a Localizacao conforme a informada na Ordem de Posicao (primeira cadastrada: primeiro e segundo nivel)
      item.id_nivel_loc1 = posicao.id_nivel_loc1 || null;
      item.id_nivel_loc2 = posicao.id_nivel_loc2 || null;
      await item.save();
      //> Colletions: item

      return res.status(200).json({
        ok: true,
        destinatario: localizacaoDestino,
        categoria: categoria,
        item: item,
        posicao: posicao
      });

    } catch (error) {
      console.error('[x_dsv/registro] Erro:', error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }

  });

  async function buscaRegistro(gateway, tag) {

    console.log(gateway, tag);
    try {
      if (!gateway || !tag) {
        return { ok: false, message: 'Gateway ou tag não informados.' };
      }

      const filtro = { $and: [] };

      ['id_nivel_loc1', 'id_nivel_loc2', 'id_nivel_loc3', 'id_nivel_loc4'].forEach((campo) => {
        const valor = gateway[campo];
        if (valor) {
          filtro.$and.push({ [campo]: valor });
        }
      });

      filtro.$and.push({
        itens: {
          $elemMatch: {
            tag: tag,
            status: 'pendente'
          }
        }
      });


      const query = filtro.$and.length === 1 ? filtro.$and[0] : filtro;
      let posicao = await Posicao.findOne(query);
   
      if (!posicao) {
        return { ok: false, message: 'Nenhuma posição encontrada para a tag informada.' };
      }

      const item = (posicao.itens || []).find((it) => it.tag === tag && it.status === 'pendente');
      if (item) {
        item.status = 'concluido';
        item.status_data = new Date();
      }

      const itens = posicao.itens || [];
      const todosConcluidos = itens.length > 0 && itens.every((it) => it.status === 'concluido');
      const algumConcluido = itens.some((it) => it.status === 'concluido');
      if (todosConcluidos) {
        posicao.status = 'concluido';
      } else if (algumConcluido) {
        posicao.status = 'parcial';
      }

      // await axios.patch(
      //   POSICAO_URL,
      //   posicao,
      //   { timeout: 5000 }
      // );

      return { ok: true, posicao };
    } catch (error) {
      console.error('[x_dsv/buscaRegistro] Erro:', error.message);
      return { ok: false, message: error.message };
    }
  };

  app.post('/x_dsv/registro/portal', async (req, res) => {

    const payload = req.body;
    const tag = payload.Tagid;
    const tokemPortal = payload.Devicename;

    const agora = Date.now();
    if (tag && ultimasLeituras.has(tag)) {
      const diffMs = agora - ultimasLeituras.get(tag);
      if (diffMs < DEBOUNCE_LEITURA_MS) {
        return res.status(200).json({
          ok: true,
          ignored: true,
          message: `Leitura ignorada: última foi há ${(diffMs / 1000).toFixed(2)}s (menos de 10s)`
        });
      }
    }
    if (tag) {
      ultimasLeituras.set(tag, agora);
    }

    const gateway = await Gateway.findOne({ tokem: tokemPortal, ativo: 1 });
    if (!gateway) {
      return res.status(404).json({
        ok: false,
        error: 'Gateway não encontrado.'
      });
    }

    const registro = {
      tokem: tokemPortal,
      tag: tag,
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

    console.log(tag);
    buscaRegistro(gateway, tag);

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



};
