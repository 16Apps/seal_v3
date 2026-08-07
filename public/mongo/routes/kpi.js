const categoria = require("../models/categoria");
const categoria_item = require("../models/categoria_item");
const colaborador = require("../models/colaborador");
const conta = require("../models/conta");
const funcao = require("../models/funcao");
const gateway = require("../models/gateway");
const item = require("../models/item");
const localizacao = require("../models/localizacao");
const registro = require("../models/registro");
const movimentacao = require("../models/movimentacao");
const movimentacao_mov = require("../models/movimentacao_mov");
const movimentacao_mov_item = require("../models/movimentacao_mov_item");
const movimentacao_item = require("../models/movimentacao_item");
const processos = require("../models/processos");
const registro_colaborador = require("../models/registro_colaborador");
const posicao = require("../models/posicao");

const sr_solucoes = require("../models/sr_solucoes");
const sr_categorias = require("../models/sr_categorias");

const shortid = require('shortid');
const fs = require('fs');
const readline = require('readline');
const axios = require('axios'); // se for enviar via HTTP
const moment = require('moment');
const mongoose = require('mongoose');

module.exports = (app, dbConnection) => {

  const nomeCollectionRegex = /^[a-z][a-z0-9_-]*$/i;
  const nomeCampoRegex = /^[a-z][a-z0-9_]*$/i;

  function valorFiltroNormalizado (valorBruto) {
    const v = String(valorBruto == null ? '' : valorBruto).trim();
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (/^-?\d+$/.test(v)) return parseInt(v, 10);
    if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
    return v;
  }

  /**
   * Nome exato no Mongo (ex.: items). Aceita alias do model Mongoose (ex.: item → items).
   */
  async function resolverNomeCollectionMongo (solicitada) {
    if (!solicitada || typeof solicitada !== 'string') return null;
    const mongo = mongoose.connection.db;
    if (!mongo) return null;

    const cols = (await mongo.listCollections().toArray()).map((c) => c.name);
    if (cols.includes(solicitada)) return solicitada;

    const low = solicitada.toLowerCase();
    const lowSemSeparador = low.replace(/[_-]/g, '');
    const ciHit = cols.find((n) => n.toLowerCase() === low);
    if (ciHit) return ciHit;

    const models = mongoose.models || {};
    for (const modelName of Object.keys(models)) {
      const m = models[modelName];
      const cn = m.collection && m.collection.name;
      if (!cn) continue;
      if (cn === solicitada || cn.toLowerCase() === low) return cn;
      const mnLow = modelName.toLowerCase();
      if (mnLow === low || mnLow === lowSemSeparador) return cn;
    }

    return null;
  }

  async function responderTotalCollection (req, res, id_conta, collection, campo, valorParam) {
    if (!id_conta || !collection) {
      return res.status(400).json({
        erro: 'Parâmetros obrigatórios: id_conta e collection'
      });
    }
    if (!nomeCollectionRegex.test(collection)) {
      return res.status(400).json({ erro: 'Nome de collection inválido' });
    }

    const campoTrim = campo != null ? String(campo).trim() : '';
    if (campoTrim && !nomeCampoRegex.test(campoTrim)) {
      return res.status(400).json({ erro: 'Nome de campo inválido' });
    }

    const filtro = { id_conta };
    let valorResposta = null;
    if (campoTrim) {
      const valor = valorFiltroNormalizado(valorParam);
      filtro[campoTrim] = valor;
      valorResposta = valor;
    } else if (valorParam !== undefined && valorParam !== null && String(valorParam).trim() !== '') {
      return res.status(400).json({ erro: 'Informe campo junto com valor, ou omita ambos' });
    }

    try {
      const mongo = mongoose.connection.db;
      const collectionReal  = await resolverNomeCollectionMongo(collection);
      if (!collectionReal) {
        return res.status(404).json({
          erro: 'Collection não encontrada',
          collection: collection,
          dica: 'No Mongoose o model Item usa a coleção "items". Tente o plural ou o nome exato listado no MongoDB.'
        });
      }

      const total = await mongo.collection(collectionReal).countDocuments(filtro);
      return res.json({
        id_conta,
        collection: collectionReal,
        collection_param: collection !== collectionReal ? collection : undefined,
        campo: campoTrim || null,
        valor: valorResposta,
        total
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao contar documentos', detalhe: err.message });
    }
  }

  // GET /total/:id_conta/:collection/:campo/:valor
  app.get('/total/:id_conta/:collection/:campo/:valor', async (req, res) => {
    return responderTotalCollection(
      req,
      res,
      req.params.id_conta,
      req.params.collection,
      req.params.campo,
      req.params.valor
    );
  });

  // GET /total/:id_conta/:collection — só id_conta + collection
  app.get('/total/:id_conta/:collection', async (req, res) => {
    return responderTotalCollection(
      req,
      res,
      req.params.id_conta,
      req.params.collection,
      null,
      null
    );
  });

  // GET /total/:id_conta/:campo/:valor?collection=nome_da_collection
  app.get('/total/:id_conta/:campo/:valor', async (req, res) => {
    const collection = req.query.collection;
    if (!collection || typeof collection !== 'string') {
      return res.status(400).json({
        erro: 'Use ?collection=nome (nome real no MongoDB) nesta URL com três segmentos, ou /total/:id_conta/:collection ou /total/:id_conta/:collection/:campo/:valor'
      });
    }
    return responderTotalCollection(
      req,
      res,
      req.params.id_conta,
      collection,
      req.params.campo,
      req.params.valor
    );
  });
  /** Filtro id_conta + um nível de localização (precedência loc4 → loc1). */
  function matchFiltroItensLoc (req) {
    const {
      id_conta,
      id_nivel_loc1,
      id_nivel_loc2,
      id_nivel_loc3,
      id_nivel_loc4
    } = req.query;

    if (!id_conta) {
      return { erro: 'id_conta é obrigatório' };
    }

    let locField = null;
    let locValue = null;
    if (id_nivel_loc4) { locField = 'id_nivel_loc4'; locValue = id_nivel_loc4; }
    else if (id_nivel_loc3) { locField = 'id_nivel_loc3'; locValue = id_nivel_loc3; }
    else if (id_nivel_loc2) { locField = 'id_nivel_loc2'; locValue = id_nivel_loc2; }
    else if (id_nivel_loc1) { locField = 'id_nivel_loc1'; locValue = id_nivel_loc1; }

    const match = { id_conta };
    if (locField && locValue) match[locField] = locValue;
    return { match };
  }

  /** Campo id da localização “folha” do item (loc4 preenchido → usa loc4; senão loc3…). */
  function addFieldIdLocEfetiva () {
    const naoVazio = (campo) => ({
      $and: [
        { $ne: [{ $ifNull: [`$${campo}`, ''] }, ''] },
        { $ne: [`$${campo}`, null] }
      ]
    });
    return {
      $addFields: {
        id_loc_efetiva: {
          $cond: [
            naoVazio('id_nivel_loc4'),
            '$id_nivel_loc4',
            {
              $cond: [
                naoVazio('id_nivel_loc3'),
                '$id_nivel_loc3',
                {
                  $cond: [
                    naoVazio('id_nivel_loc2'),
                    '$id_nivel_loc2',
                    {
                      $cond: [
                        naoVazio('id_nivel_loc1'),
                        '$id_nivel_loc1',
                        null
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    };
  }

  /**
   * GET /kpi/itens_por_local_capacidade?id_conta=…&id_nivel_loc1=…&…
   * Agrupa itens pela localização mais específica (mesma regra de hierarquia loc4→loc1).
   * Filtro opcional pelos níveis: mesma precedência de matchFiltroItensLoc (loc4 mais específico).
   * Compara total de itens com capacidade_maxima / capacidade_minima da localização.
   */
  app.get('/kpi/itens_por_local_capacidade', async (req, res) => {
    try {
      const filtro = matchFiltroItensLoc(req);
      if (filtro.erro) {
        return res.status(400).json({ erro: filtro.erro });
      }
      const { match } = filtro;

      const baseStages = [
        { $match: match },
        addFieldIdLocEfetiva()
      ];

      const pipelinePorLocal = [
        ...baseStages,
        { $match: { id_loc_efetiva: { $nin: [null, ''] } } },
        { $group: { _id: '$id_loc_efetiva', total_itens: { $sum: 1 } } },
        {
          $lookup: {
            from: 'localizacaos',
            localField: '_id',
            foreignField: '_id',
            as: 'loc'
          }
        },
        { $unwind: { path: '$loc', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            id_localizacao: '$_id',
            descricao: { $ifNull: ['$loc.descricao', ''] },
            tag: { $ifNull: ['$loc.tag', ''] },
            total_itens: 1,
            capacidade_maxima: {
              $convert: { input: '$loc.capacidade_maxima', to: 'double', onError: 0, onNull: 0 }
            },
            capacidade_minima: {
              $convert: { input: '$loc.capacidade_minima', to: 'double', onError: 0, onNull: 0 }
            }
          }
        },
        {
          $addFields: {
            vagas_livres: {
              $subtract: ['$capacidade_maxima', '$total_itens']
            },
            percentual_ocupacao: {
              $cond: [
                { $gt: ['$capacidade_maxima', 0] },
                {
                  $round: [
                    { $multiply: [{ $divide: ['$total_itens', '$capacidade_maxima'] }, 100] },
                    2
                  ]
                },
                null
              ]
            },
            excede_capacidade: {
              $cond: [
                { $gt: ['$capacidade_maxima', 0] },
                { $gt: ['$total_itens', '$capacidade_maxima'] },
                false
              ]
            },
            abaixo_capacidade_minima: {
              $cond: [
                { $gt: ['$capacidade_minima', 0] },
                { $lt: ['$total_itens', '$capacidade_minima'] },
                false
              ]
            }
          }
        },
        { $sort: { descricao: 1, id_localizacao: 1 } }
      ];

      const pipelineSemLocal = [
        ...baseStages,
        {
          $match: {
            $or: [
              { id_loc_efetiva: null },
              { id_loc_efetiva: '' },
              { id_loc_efetiva: { $exists: false } }
            ]
          }
        },
        { $count: 'total' }
      ];

      const [porLocal, semLocAgg] = await Promise.all([
        item.aggregate(pipelinePorLocal),
        item.aggregate(pipelineSemLocal)
      ]);

      const total_itens_sem_local = semLocAgg[0] && semLocAgg[0].total != null
        ? semLocAgg[0].total
        : 0;

      const total_itens_agrupados = porLocal.reduce((acc, row) => acc + (row.total_itens || 0), 0);

      const {
        id_nivel_loc1,
        id_nivel_loc2,
        id_nivel_loc3,
        id_nivel_loc4
      } = req.query;

      return res.json({
        id_conta: match.id_conta,
        filtro_niveis: {
          id_nivel_loc1: id_nivel_loc1 || null,
          id_nivel_loc2: id_nivel_loc2 || null,
          id_nivel_loc3: id_nivel_loc3 || null,
          id_nivel_loc4: id_nivel_loc4 || null
        },
        por_local: porLocal,
        total_itens_agrupados,
        total_itens_sem_local
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        erro: 'Erro ao gerar comparativo itens x capacidade por local',
        detalhe: err.message
      });
    }
  });

  app.get('/kpi/itens_categorias/total', async (req, res) => {
    try {
        const filtro = matchFiltroItensLoc(req);
        if (filtro.erro) {
          return res.status(400).json({ erro: filtro.erro });
        }
        const { match } = filtro;

        const pipelinePorCategoria = [
          { $match: match },

          { $match: { id_categoria_reg1: { $nin: [null, ''] } } },

          { $group: { _id: '$id_categoria_reg1', total: { $sum: 1 } } },

          {
            $lookup: {
              from: 'categoriaitems',
              localField: '_id',
              foreignField: '_id',
              as: 'cat',
            }
          },
          { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },

          {
            $project: {
              _id: 0,
              id_categoria_reg1: '$_id',
              total: 1,
              descricao: { $ifNull: ['$cat.descricao', ''] },
            }
          },

          { $sort: { descricao: 1 } }
        ];

        /** Itens sem linha correspondente em categoriaitems (id vazio ou órfão). */
        const pipelineSemVinculo = [
          { $match: match },
          {
            $lookup: {
              from: 'categoriaitems',
              localField: 'id_categoria_reg1',
              foreignField: '_id',
              as: '_catVinculo',
            }
          },
          { $match: { _catVinculo: { $size: 0 } } },
          { $count: 'total' }
        ];

        const [result, semVinculoAgg] = await Promise.all([
          item.aggregate(pipelinePorCategoria),
          item.aggregate(pipelineSemVinculo)
        ]);

        const totalSemVinculo = semVinculoAgg[0] && semVinculoAgg[0].total != null
          ? semVinculoAgg[0].total
          : 0;

        return res.json({
          porCategoria: result,
          totalSemVinculo
        });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ erro: 'Erro ao gerar resumo', detalhe: err.message });
      }
    });

  /**
   * Agrupa itens por Categoria (campo id_categoria → collection categorias).
   * Mesmo contrato que /kpi/itens_categorias/total (porCategoria + totalSemVinculo).
   */
  app.get('/kpi/itens_por_categoria/total', async (req, res) => {
    try {
      const filtro = matchFiltroItensLoc(req);
      if (filtro.erro) {
        return res.status(400).json({ erro: filtro.erro });
      }
      const { match } = filtro;

      const pipelinePorCategoria = [
        { $match: match },
        { $match: { id_categoria: { $nin: [null, ''] } } },
        { $group: { _id: '$id_categoria', total: { $sum: 1 } } },
        {
          $lookup: {
            from: 'categorias',
            localField: '_id',
            foreignField: '_id',
            as: 'cat'
          }
        },
        { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            id_categoria: '$_id',
            total: 1,
            descricao: { $ifNull: ['$cat.descricao', ''] }
          }
        },
        { $sort: { descricao: 1 } }
      ];

      const pipelineSemVinculo = [
        { $match: match },
        {
          $lookup: {
            from: 'categorias',
            localField: 'id_categoria',
            foreignField: '_id',
            as: '_catVinculo'
          }
        },
        { $match: { _catVinculo: { $size: 0 } } },
        { $count: 'total' }
      ];

      const [result, semVinculoAgg] = await Promise.all([
        item.aggregate(pipelinePorCategoria),
        item.aggregate(pipelineSemVinculo)
      ]);

      const totalSemVinculo = semVinculoAgg[0] && semVinculoAgg[0].total != null
        ? semVinculoAgg[0].total
        : 0;

      return res.json({
        porCategoria: result,
        totalSemVinculo
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao gerar resumo por categoria', detalhe: err.message });
    }
  });

  /**
   * Agrupa itens por inf_compl1 (texto livre, sem lookup).
   * Mesmo contrato que /kpi/itens_por_categoria/total (porCategoria + totalSemVinculo).
   * totalSemVinculo: itens sem inf_compl1 (ausente, null ou string vazia).
   */
  app.get('/kpi/itens_por_inf_compl1/total', async (req, res) => {
    try {
      const filtro = matchFiltroItensLoc(req);
      if (filtro.erro) {
        return res.status(400).json({ erro: filtro.erro });
      }
      const { match } = filtro;

      const pipelinePorValor = [
        { $match: match },
        { $match: { inf_compl1: { $nin: [null, ''] } } },
        { $group: { _id: '$inf_compl1', total: { $sum: 1 } } },
        {
          $project: {
            _id: 0,
            inf_compl1: '$_id',
            total: 1,
            descricao: { $ifNull: ['$_id', ''] }
          }
        },
        { $sort: { descricao: 1 } }
      ];

      const pipelineSemValor = [
        { $match: match },
        {
          $match: {
            $or: [
              { inf_compl1: { $exists: false } },
              { inf_compl1: null },
              { inf_compl1: '' }
            ]
          }
        },
        { $count: 'total' }
      ];

      const [result, semValorAgg] = await Promise.all([
        item.aggregate(pipelinePorValor),
        item.aggregate(pipelineSemValor)
      ]);

      const totalSemVinculo = semValorAgg[0] && semValorAgg[0].total != null
        ? semValorAgg[0].total
        : 0;

      return res.json({
        porCategoria: result,
        totalSemVinculo
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao gerar resumo por inf_compl1', detalhe: err.message });
    }
  });

  /**
   * GET /kpi/itens_por_status/total?id_conta=…
   * Agrupa itens por status (ativo, inativo, perda, emtransporte, etc.).
   */
  app.get('/kpi/itens_por_status/total', async (req, res) => {
    try {
      const filtro = matchFiltroItensLoc(req);
      if (filtro.erro) {
        return res.status(400).json({ erro: filtro.erro });
      }
      const { match } = filtro;

      const pipeline = [
        { $match: match },
        {
          $addFields: {
            status_norm: {
              $toLower: {
                $trim: {
                  input: {
                    $ifNull: ['$status', '']
                  }
                }
              }
            }
          }
        },
        {
          $addFields: {
            status_chave: {
              $cond: [
                { $in: ['$status_norm', ['perda', 'perca']] },
                'perda',
                {
                  $cond: [
                    { $eq: ['$status_norm', ''] },
                    'sem_status',
                    '$status_norm'
                  ]
                }
              ]
            }
          }
        },
        {
          $group: {
            _id: '$status_chave',
            total: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            status: '$_id',
            total: 1
          }
        },
        { $sort: { total: -1, status: 1 } }
      ];

      const porStatus = await item.aggregate(pipeline);
      const total = porStatus.reduce((acc, row) => acc + (Number(row.total) || 0), 0);

      return res.json({
        porStatus,
        total
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao gerar resumo por status', detalhe: err.message });
    }
  });

  /**
   * Filtro para KPIs de posição:
   * - obrigatório: id_conta
   * - opcional origem: id_nivel (atalho) ou id_nivel_loc1..4 (precedência loc4→loc1)
   * - opcional destino: id_nivel_destino (atalho) ou id_nivel_loc1_destino..4_destino (precedência loc4→loc1)
   */
  function matchFiltroPosicao (req) {
    const {
      id_conta,
      tipo,
      id_nivel,
      id_nivel_loc1,
      id_nivel_loc2,
      id_nivel_loc3,
      id_nivel_loc4,
      id_nivel_destino,
      id_nivel_loc1_destino,
      id_nivel_loc2_destino,
      id_nivel_loc3_destino,
      id_nivel_loc4_destino
    } = req.query;

    const idConta = String(id_conta == null ? '' : id_conta).trim();
    if (!idConta) {
      return { erro: 'id_conta é obrigatório' };
    }

    const match = { id_conta: idConta };

    const tipoNorm = String(tipo == null ? '' : tipo).trim().toLowerCase();
    if (tipoNorm === 'conferencia' || tipoNorm === 'inventario') {
      match.tipo = tipoNorm;
    }

    let campoOrigem = null;
    let valorOrigem = null;
    if (id_nivel_loc4) { campoOrigem = 'id_nivel_loc4'; valorOrigem = id_nivel_loc4; }
    else if (id_nivel_loc3) { campoOrigem = 'id_nivel_loc3'; valorOrigem = id_nivel_loc3; }
    else if (id_nivel_loc2) { campoOrigem = 'id_nivel_loc2'; valorOrigem = id_nivel_loc2; }
    else if (id_nivel_loc1) { campoOrigem = 'id_nivel_loc1'; valorOrigem = id_nivel_loc1; }
    else if (id_nivel) { campoOrigem = 'id_nivel_loc1'; valorOrigem = id_nivel; }
    if (campoOrigem && valorOrigem) {
      match[campoOrigem] = valorOrigem;
    }

    let campoDestino = null;
    let valorDestino = null;
    if (tipoNorm !== 'inventario') {
      if (id_nivel_loc4_destino) { campoDestino = 'id_nivel_loc4_destino'; valorDestino = id_nivel_loc4_destino; }
      else if (id_nivel_loc3_destino) { campoDestino = 'id_nivel_loc3_destino'; valorDestino = id_nivel_loc3_destino; }
      else if (id_nivel_loc2_destino) { campoDestino = 'id_nivel_loc2_destino'; valorDestino = id_nivel_loc2_destino; }
      else if (id_nivel_loc1_destino) { campoDestino = 'id_nivel_loc1_destino'; valorDestino = id_nivel_loc1_destino; }
      else if (id_nivel_destino) { campoDestino = 'id_nivel_loc1_destino'; valorDestino = id_nivel_destino; }
      if (campoDestino && valorDestino) {
        match[campoDestino] = valorDestino;
      }
    }

    return {
      match,
      filtro_niveis: {
        tipo: tipoNorm || null,
        origem: {
          id_nivel_loc1: id_nivel_loc1 || id_nivel || null,
          id_nivel_loc2: id_nivel_loc2 || null,
          id_nivel_loc3: id_nivel_loc3 || null,
          id_nivel_loc4: id_nivel_loc4 || null
        },
        destino: {
          id_nivel_loc1_destino: tipoNorm === 'inventario' ? null : (id_nivel_loc1_destino || id_nivel_destino || null),
          id_nivel_loc2_destino: tipoNorm === 'inventario' ? null : (id_nivel_loc2_destino || null),
          id_nivel_loc3_destino: tipoNorm === 'inventario' ? null : (id_nivel_loc3_destino || null),
          id_nivel_loc4_destino: tipoNorm === 'inventario' ? null : (id_nivel_loc4_destino || null)
        }
      }
    };
  }

  /** Lookup em items restrito ao id_conta do documento posicao (evita inf_compl1 de outra conta). */
  function lookupItemMesmaConta () {
    return {
      $lookup: {
        from: 'items',
        let: { idItem: '$itens.id_item', idConta: '$id_conta' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $ne: ['$$idItem', null] },
                  { $ne: ['$$idItem', ''] },
                  { $eq: ['$_id', '$$idItem'] },
                  { $eq: ['$id_conta', '$$idConta'] }
                ]
              }
            }
          },
          { $project: { inf_compl1: 1 } }
        ],
        as: '_item_doc'
      }
    };
  }

  /**
   * GET /kpi/posicao/por_tipo?id_conta=...&tipo=conferencia|inventario
   * Conta registros da collection posicao filtrados por tipo.
   * Para inventário (e também conferência), inclui total/percentual de itens com status=concluido.
   */
  app.get('/kpi/posicao/por_tipo', async (req, res) => {
    try {
      const id_conta = req.query.id_conta != null ? String(req.query.id_conta).trim() : '';
      const tipo = req.query.tipo != null ? String(req.query.tipo).trim().toLowerCase() : '';

      if (!id_conta) {
        return res.status(400).json({ erro: 'id_conta é obrigatório' });
      }
      if (tipo !== 'conferencia' && tipo !== 'inventario') {
        return res.status(400).json({ erro: 'tipo deve ser conferencia ou inventario' });
      }

      const match = { id_conta, tipo };
      const total = await posicao.countDocuments(match);

      const itensAgg = await posicao.aggregate([
        { $match: match },
        { $unwind: { path: '$itens', preserveNullAndEmptyArrays: false } },
        {
          $group: {
            _id: null,
            itens_total: { $sum: 1 },
            itens_concluidos: {
              $sum: {
                $cond: [
                  { $eq: [{ $toLower: { $ifNull: ['$itens.status', ''] } }, 'concluido'] },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]);

      const itens_total = itensAgg[0] && itensAgg[0].itens_total != null
        ? itensAgg[0].itens_total
        : 0;
      const itens_concluidos = itensAgg[0] && itensAgg[0].itens_concluidos != null
        ? itensAgg[0].itens_concluidos
        : 0;
      const percentual = itens_total > 0
        ? Math.round((itens_concluidos / itens_total) * 100)
        : 0;

      return res.json({
        id_conta,
        tipo,
        total,
        itens_total,
        itens_concluidos,
        percentual
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        erro: 'Erro ao gerar total de posição por tipo',
        detalhe: err.message
      });
    }
  });

  /**
   * GET /kpi/posicao/resumo?id_conta=...&id_nivel=...&id_nivel_destino=...
   *
   * Retorna:
   * 1) total_por_dia_ultimos_5_dias — as 5 datas mais recentes em que houve registro (não janela fixa a partir de hoje)
   * 2) total_geral_registros
   * 3) total_itens_movimentados (contagem de linhas em itens[]; não soma quantidade/contagem RFID)
   * 4) total_por_status
   */
  app.get('/kpi/posicao/resumo', async (req, res) => {
    try {
      const filtro = matchFiltroPosicao(req);
      if (filtro.erro) {
        return res.status(400).json({ erro: filtro.erro });
      }
      const { match, filtro_niveis } = filtro;

      const pipelinePorDia = [
        { $match: match },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt'
              }
            },
            total_registros: { $sum: 1 }
          }
        },
        { $sort: { _id: -1 } },
        { $limit: 5 },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            dia: '$_id',
            total_registros: 1
          }
        }
      ];

      const pipelineTotalGeral = [
        { $match: match },
        { $count: 'total' }
      ];

      // Conta cada item da posição (1 linha = 1 item), ignorando quantidade/contagem RFID
      const pipelineTotalItens = [
        { $match: match },
        {
          $project: {
            itens_total_registro: {
              $cond: [
                { $isArray: '$itens' },
                { $size: '$itens' },
                0
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            total_itens_movimentados: { $sum: '$itens_total_registro' }
          }
        },
        {
          $project: {
            _id: 0,
            total_itens_movimentados: 1
          }
        }
      ];

      const pipelinePorStatus = [
        { $match: match },
        {
          $group: {
            _id: {
              $cond: [
                {
                  $and: [
                    { $ne: [{ $ifNull: ['$status', ''] }, ''] },
                    { $ne: ['$status', null] }
                  ]
                },
                '$status',
                'sem_status'
              ]
            },
            total_registros: { $sum: 1 }
          }
        },
        { $sort: { total_registros: -1, _id: 1 } },
        {
          $project: {
            _id: 0,
            status: '$_id',
            total_registros: 1
          }
        }
      ];

      const [porDia, totalGeralAgg, totalItensAgg, porStatus] = await Promise.all([
        posicao.aggregate(pipelinePorDia),
        posicao.aggregate(pipelineTotalGeral),
        posicao.aggregate(pipelineTotalItens),
        posicao.aggregate(pipelinePorStatus)
      ]);

      const total_geral_registros = totalGeralAgg[0] && totalGeralAgg[0].total != null
        ? totalGeralAgg[0].total
        : 0;
      const total_itens_movimentados = totalItensAgg[0] && totalItensAgg[0].total_itens_movimentados != null
        ? totalItensAgg[0].total_itens_movimentados
        : 0;

      return res.json({
        id_conta: match.id_conta,
        filtro_niveis,
        total_por_dia_ultimos_5_dias: porDia,
        total_geral_registros,
        total_itens_movimentados,
        total_por_status: porStatus
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        erro: 'Erro ao gerar resumo de posições',
        detalhe: err.message
      });
    }
  });


  /**
   * GET /kpi/posicao/itens_por_inf_compl1?id_conta=...&id_nivel=...&id_nivel_destino=...
   *
   * Filtra documentos da collection posicao pelo id_conta informado na query (obrigatório).
   * Agrupa itens do array itens por inf_compl1 (lookup em items, mesma id_conta da posicao).
   * - id_conta: obrigatório (ex.: ?id_conta=69c8d05d-9131)
   * - id_nivel_loc1..4, id_nivel, id_nivel_destino: opcionais (precedência loc4→loc1)
   * - total_itens: soma de itens[].quantidade (fallback 1 quando quantidade ausente/inválida)
   */
  
  app.get('/kpi/posicao/itens_por_inf_compl1', async (req, res) => {
    try {
      const filtro = matchFiltroPosicao(req);
      if (filtro.erro) {
        return res.status(400).json({ erro: filtro.erro });
      }
      const { match, filtro_niveis } = filtro;

      const pipelinePorInfCompl1 = [
        { $match: match },
        { $unwind: { path: '$itens', preserveNullAndEmptyArrays: false } },
        lookupItemMesmaConta(),
        { $unwind: { path: '$_item_doc', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            _inf_compl1: {
              $trim: {
                input: { $ifNull: ['$_item_doc.inf_compl1', ''] }
              }
            },
            _quantidade_item: {
              $let: {
                vars: {
                  q: {
                    $convert: {
                      input: '$itens.quantidade',
                      to: 'double',
                      onError: null,
                      onNull: null
                    }
                  }
                },
                in: {
                  $cond: [
                    { $gt: ['$$q', 0] },
                    '$$q',
                    1
                  ]
                }
              }
            }
          }
        },
        { $match: { _inf_compl1: { $nin: [null, ''] } } },
        {
          $group: {
            _id: '$_inf_compl1',
            total_itens: { $sum: '$_quantidade_item' },
            total_registros: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            inf_compl1: '$_id',
            descricao: '$_id',
            total_itens: 1,
            total_registros: 1
          }
        },
        { $sort: { descricao: 1 } }
      ];

      const pipelineSemInfCompl1 = [
        { $match: match },
        { $unwind: { path: '$itens', preserveNullAndEmptyArrays: false } },
        lookupItemMesmaConta(),
        { $unwind: { path: '$_item_doc', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            _inf_compl1: {
              $trim: {
                input: { $ifNull: ['$_item_doc.inf_compl1', ''] }
              }
            }
          }
        },
        { $match: { _inf_compl1: { $in: [null, ''] } } },
        { $count: 'total' }
      ];

      const [porInfCompl1, semInfCompl1Agg] = await Promise.all([
        posicao.aggregate(pipelinePorInfCompl1),
        posicao.aggregate(pipelineSemInfCompl1)
      ]);

      const totalSemVinculo = semInfCompl1Agg[0] && semInfCompl1Agg[0].total != null
        ? semInfCompl1Agg[0].total
        : 0;

      return res.json({
        id_conta: match.id_conta,
        filtro_niveis,
        por_inf_compl1: porInfCompl1,
        totalSemVinculo
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        erro: 'Erro ao gerar agrupamento de itens por inf_compl1 em posicao',
        detalhe: err.message
      });
    }
  });

  /**
   * GET /kpi/itens_por_tempo_no_local
   *
   * Conta quantos itens em um endereço estão há mais (e há menos) que um
   * determinado intervalo de tempo, com base em item.updatedAt.
   *
   * Filtros:
   *   - id_conta (obrigatório)
   *   - id_nivel_loc1..4 (opcional; precedência loc4 -> loc1)
   *
   * Tempo (todos opcionais, somados):
   *   - anos, meses, semanas, dias, horas, minutos
   *
   *   OU forma simples:
   *   - tempo (number) + unidade ('minutos'|'horas'|'dias'|'semanas'|'meses'|'anos')
   *
   * Retorno:
   *   - corte_iso, agora_iso
   *   - acima_do_tempo: itens cujo updatedAt <= corte (estao ha MAIS que o tempo)
   *   - abaixo_do_tempo: itens cujo updatedAt > corte
   *   - total
   */
  app.get('/kpi/itens_por_tempo_no_local', async (req, res) => {
    try {
      const filtro = matchFiltroItensLoc(req);
      if (filtro.erro) {
        return res.status(400).json({ erro: filtro.erro });
      }
      const { match } = filtro;

      const numero = (v) => {
        if (v == null || v === '') return 0;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      };

      let anos = numero(req.query.anos);
      let meses = numero(req.query.meses);
      let semanas = numero(req.query.semanas);
      let dias = numero(req.query.dias);
      let horas = numero(req.query.horas);
      let minutos = numero(req.query.minutos);

      const unidadeAlias = {
        ano: 'anos', anos: 'anos', y: 'anos', year: 'anos', years: 'anos',
        mes: 'meses', meses: 'meses', month: 'meses', months: 'meses',
        semana: 'semanas', semanas: 'semanas', week: 'semanas', weeks: 'semanas',
        dia: 'dias', dias: 'dias', day: 'dias', days: 'dias',
        hora: 'horas', horas: 'horas', hour: 'horas', hours: 'horas', h: 'horas',
        minuto: 'minutos', minutos: 'minutos', min: 'minutos', minute: 'minutos', minutes: 'minutos'
      };

      if (req.query.tempo != null && req.query.unidade) {
        const u = unidadeAlias[String(req.query.unidade).trim().toLowerCase()];
        const t = numero(req.query.tempo);
        if (u && t > 0) {
          if (u === 'anos') anos += t;
          else if (u === 'meses') meses += t;
          else if (u === 'semanas') semanas += t;
          else if (u === 'dias') dias += t;
          else if (u === 'horas') horas += t;
          else if (u === 'minutos') minutos += t;
        }
      }

      const totalIntervalo = anos + meses + semanas + dias + horas + minutos;
      if (totalIntervalo <= 0) {
        return res.status(400).json({
          erro: 'Informe ao menos uma unidade de tempo (anos, meses, semanas, dias, horas ou minutos), ou tempo+unidade.'
        });
      }

      const agora = moment();
      const corte = agora
        .clone()
        .subtract(anos, 'years')
        .subtract(meses, 'months')
        .subtract(semanas, 'weeks')
        .subtract(dias, 'days')
        .subtract(horas, 'hours')
        .subtract(minutos, 'minutes')
        .toDate();

      const pipeline = [
        { $match: match },
        {
          $group: {
            _id: null,
            acima_do_tempo: {
              $sum: {
                $cond: [
                  { $lte: ['$updatedAt', corte] },
                  1,
                  0
                ]
              }
            },
            abaixo_do_tempo: {
              $sum: {
                $cond: [
                  { $gt: ['$updatedAt', corte] },
                  1,
                  0
                ]
              }
            },
            total: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            acima_do_tempo: 1,
            abaixo_do_tempo: 1,
            total: 1
          }
        }
      ];

      const {
        id_nivel_loc1,
        id_nivel_loc2,
        id_nivel_loc3,
        id_nivel_loc4
      } = req.query;

      const idsNiveis = [id_nivel_loc1, id_nivel_loc2, id_nivel_loc3, id_nivel_loc4].filter(Boolean);

      const [resultado, locsInfo] = await Promise.all([
        item.aggregate(pipeline),
        idsNiveis.length
          ? localizacao
              .find({ _id: { $in: idsNiveis } })
              .select('_id descricao tag')
              .lean()
          : Promise.resolve([])
      ]);

      const totalPorAgg = Array.isArray(resultado) && resultado.length ? resultado[0] : null;

      const locsById = {};
      (locsInfo || []).forEach((l) => { if (l && l._id) locsById[l._id] = l; });
      const descObj = (id) => {
        if (!id) return null;
        const l = locsById[id];
        return {
          _id: id,
          descricao: l ? (l.descricao || '') : '',
          tag: l ? (l.tag || '') : ''
        };
      };

      const filtroNiveisDetalhado = {
        id_nivel_loc1: descObj(id_nivel_loc1),
        id_nivel_loc2: descObj(id_nivel_loc2),
        id_nivel_loc3: descObj(id_nivel_loc3),
        id_nivel_loc4: descObj(id_nivel_loc4)
      };

      const trilha = [id_nivel_loc1, id_nivel_loc2, id_nivel_loc3, id_nivel_loc4]
        .filter(Boolean)
        .map((id) => (locsById[id] && locsById[id].descricao) || id)
        .join(' › ');

      return res.json({
        id_conta: match.id_conta,
        filtro_niveis: {
          id_nivel_loc1: id_nivel_loc1 || null,
          id_nivel_loc2: id_nivel_loc2 || null,
          id_nivel_loc3: id_nivel_loc3 || null,
          id_nivel_loc4: id_nivel_loc4 || null
        },
        filtro_niveis_detalhe: filtroNiveisDetalhado,
        trilha_localizacao: trilha,
        intervalo: { anos, meses, semanas, dias, horas, minutos },
        agora_iso: agora.toISOString(),
        corte_iso: corte.toISOString(),
        acima_do_tempo: totalPorAgg ? totalPorAgg.acima_do_tempo : 0,
        abaixo_do_tempo: totalPorAgg ? totalPorAgg.abaixo_do_tempo : 0,
        total: totalPorAgg ? totalPorAgg.total : 0
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        erro: 'Erro ao calcular itens por tempo no local',
        detalhe: err.message
      });
    }
  });


  
}