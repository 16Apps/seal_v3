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

const sr_solucoes = require("../models/sr_solucoes");
const sr_categorias = require("../models/sr_categorias");

const shortid = require('shortid');
const fs = require('fs');
const readline = require('readline');
const axios = require('axios'); // se for enviar via HTTP
const moment = require('moment');
const mongoose = require('mongoose');

module.exports = (app, dbConnection) => {


    // Rota para contar total de itens por localização baseado nos filtros de nível
    app.get('/itens_categorias/total', async (req, res) => {
        try {
            const {
              id_conta,
              id_nivel_loc1,
              id_nivel_loc2,
              id_nivel_loc3,
              id_nivel_loc4,
            } = req.query;
        
            if (!id_conta) {
              return res.status(400).json({ erro: 'id_conta é obrigatório' });
            }
        
            // Regra de precedência: se vier loc4 usa loc4; senão loc3; senão loc2; senão loc1
            let locField = null;
            let locValue = null;
        
            if (id_nivel_loc4) { locField = 'id_nivel_loc4'; locValue = id_nivel_loc4; }
            else if (id_nivel_loc3) { locField = 'id_nivel_loc3'; locValue = id_nivel_loc3; }
            else if (id_nivel_loc2) { locField = 'id_nivel_loc2'; locValue = id_nivel_loc2; }
            else if (id_nivel_loc1) { locField = 'id_nivel_loc1'; locValue = id_nivel_loc1; }
        
            const match = { id_conta };
            if (locField && locValue) match[locField] = locValue;
        
            const pipeline = [
              { $match: match },
        
              // opcional: ignora itens sem categoria_reg1
              { $match: { id_categoria_reg1: { $nin: [null, ''] } } },
        
              { $group: { _id: '$id_categoria_reg1', total: { $sum: 1 } } },
        
              // lookup na CategoriaItem para trazer a descrição
              // OBS: por padrão o mongoose usa o plural em minúsculo: CategoriaItem -> "categoriaitems"
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
        
            const result = await item.aggregate(pipeline);
            return res.json(result);
          } catch (err) {
            console.error(err);
            return res.status(500).json({ erro: 'Erro ao gerar resumo', detalhe: err.message });
          }
        });

    

    app.get('/itens/total/:id_conta', async (req, res) => {
        try {
            const { id_conta } = req.params;
            const { nivel1, nivel2, nivel3, nivel4 } = req.query;

            // Determina qual campo de localização usar e qual id_nivel buscar
            let campoLocalizacao = null;
            let idNivelFiltro = null;

            // Prioridade: nível mais específico primeiro
            if (nivel4 && nivel4 !== '' && nivel4 !== 'null') {
                campoLocalizacao = 'id_nivel_loc4';
                idNivelFiltro = nivel4;
            } else if (nivel3 && nivel3 !== '' && nivel3 !== 'null') {
                campoLocalizacao = 'id_nivel_loc3';
                idNivelFiltro = nivel3;
            } else if (nivel2 && nivel2 !== '' && nivel2 !== 'null') {
                campoLocalizacao = 'id_nivel_loc2';
                idNivelFiltro = nivel2;
            } else if (nivel1 && nivel1 !== '' && nivel1 !== 'null') {
                campoLocalizacao = 'id_nivel_loc1';
                idNivelFiltro = nivel1;
            }

            // Busca as localizações baseadas no filtro
            const queryLocalizacao = {
                id_conta: id_conta
            };

            if (idNivelFiltro) {
                queryLocalizacao.id_nivel = idNivelFiltro;
            } else {
                // Se não há filtro, busca todas as localizações do nível 1 (sem id_nivel)
                queryLocalizacao.id_nivel = null;
            }

            const localizacoes = await localizacao.find(queryLocalizacao).lean();

            // Para cada localização, conta os itens vinculados
            const resultados = await Promise.all(localizacoes.map(async (loc) => {
                let queryItens = {
                    id_conta: id_conta
                };

                // Monta a query baseada no campo de localização determinado
                if (campoLocalizacao === 'id_nivel_loc4') {
                    queryItens.id_nivel_loc4 = loc._id;
                } else if (campoLocalizacao === 'id_nivel_loc3') {
                    queryItens.id_nivel_loc4 = loc._id;
                } else if (campoLocalizacao === 'id_nivel_loc2') {
                    queryItens.id_nivel_loc3 = loc._id;
                } else if (campoLocalizacao === 'id_nivel_loc1') {
                    queryItens.id_nivel_loc2 = loc._id;
                } else {
                    // Sem filtro: conta itens do nível 1
                    queryItens.id_nivel_loc1 = loc._id;
                }

                const total = await item.countDocuments(queryItens);

                return {
                    _id: loc._id,
                    descricao: loc.descricao,
                    tag: loc.tag,
                    total_itens: total
                };
            }));

            // Calcula o total geral
            const totalGeral = resultados.reduce((sum, loc) => sum + loc.total_itens, 0);

            // Busca o último item cadastrado da conta (mais recente por createdAt)
            const ultimoItemCadastrado = await item
                .findOne({ id_conta })
                .sort({ createdAt: -1 })
                .lean();

            res.json({
                total: totalGeral,
                localizacoes: resultados,
                ultimo_item_cadastrado: ultimoItemCadastrado
                    ? {
                        _id: ultimoItemCadastrado._id,
                        descricao: ultimoItemCadastrado.descricao || '',
                        tag: ultimoItemCadastrado.tag || '',
                        id_categoria: ultimoItemCadastrado.id_categoria || null,
                        createdAt: ultimoItemCadastrado.createdAt || null
                    }
                    : null,
                filtros: {
                    nivel1: nivel1 || null,
                    nivel2: nivel2 || null,
                    nivel3: nivel3 || null,
                    nivel4: nivel4 || null
                }
            });

        } catch (err) {
            console.error('Erro ao contar itens por localização:', err);
            res.status(500).json({ error: 'Erro ao contar itens por localização' });
        }
    });

    app.get('/registro/ultimos-por-item', async (req, res) => {
        try {
          const {
            id_conta,
            id_nivel_loc1,
            id_nivel_loc2,
            id_nivel_loc3,
            id_nivel_loc4
          } = req.query;
      
          if (!id_conta) return res.status(400).json({ erro: 'id_conta é obrigatório' });
      
          // Regra de precedência: 4 > 3 > 2 > 1
          let locField = null;
          let locValue = null;
      
          if (id_nivel_loc4) { locField = 'id_nivel_loc4'; locValue = id_nivel_loc4; }
          else if (id_nivel_loc3) { locField = 'id_nivel_loc3'; locValue = id_nivel_loc3; }
          else if (id_nivel_loc2) { locField = 'id_nivel_loc2'; locValue = id_nivel_loc2; }
          else if (id_nivel_loc1) { locField = 'id_nivel_loc1'; locValue = id_nivel_loc1; }
      
          const match = { id_conta };
          if (locField && locValue) match[locField] = locValue;
      
          // nomes reais das collections (evita erro de pluralização)
          const CategoriaColl = mongoose.model('Categoria').collection.name;
          const LocalizacaoColl = mongoose.model('Localizacao').collection.name;
          const ItemColl = mongoose.model('Item').collection.name;
          const CategoriaItemColl = mongoose.model('CategoriaItem').collection.name;
      
          const pipeline = [
            { $match: match },
      
            // pega o "último" por item (mais recente)
            { $sort: { data_registro: -1, createdAt: -1 } },
      
            {
              $group: {
                _id: '$id_item',
                doc: { $first: '$$ROOT' }
              }
            },
            { $replaceRoot: { newRoot: '$doc' } },
      
            // Categoria do registro (descrição)
            {
              $lookup: {
                from: CategoriaColl,
                localField: 'id_categoria',
                foreignField: '_id',
                as: 'categoria'
              }
            },
            { $unwind: { path: '$categoria', preserveNullAndEmptyArrays: true } },
      
            // Localizações do registro (descrições)
            { $lookup: { from: LocalizacaoColl, localField: 'id_nivel_loc1', foreignField: '_id', as: 'loc1' } },
            { $lookup: { from: LocalizacaoColl, localField: 'id_nivel_loc2', foreignField: '_id', as: 'loc2' } },
            { $lookup: { from: LocalizacaoColl, localField: 'id_nivel_loc3', foreignField: '_id', as: 'loc3' } },
            { $lookup: { from: LocalizacaoColl, localField: 'id_nivel_loc4', foreignField: '_id', as: 'loc4' } },
      
            // Localizações finais (descrições)
            { $lookup: { from: LocalizacaoColl, localField: 'id_nivel_loc1_final', foreignField: '_id', as: 'loc1f' } },
            { $lookup: { from: LocalizacaoColl, localField: 'id_nivel_loc2_final', foreignField: '_id', as: 'loc2f' } },
            { $lookup: { from: LocalizacaoColl, localField: 'id_nivel_loc3_final', foreignField: '_id', as: 'loc3f' } },
            { $lookup: { from: LocalizacaoColl, localField: 'id_nivel_loc4_final', foreignField: '_id', as: 'loc4f' } },
      
            { $unwind: { path: '$loc1', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$loc2', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$loc3', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$loc4', preserveNullAndEmptyArrays: true } },
      
            { $unwind: { path: '$loc1f', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$loc2f', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$loc3f', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$loc4f', preserveNullAndEmptyArrays: true } },
      
            // Busca o Item para pegar id_categoria_reg1
            {
              $lookup: {
                from: ItemColl,
                localField: 'id_item',
                foreignField: '_id',
                as: 'item'
              }
            },
            { $unwind: { path: '$item', preserveNullAndEmptyArrays: true } },
      
            // CategoriaItem do Item (descrição do vínculo reg1)
            {
              $lookup: {
                from: CategoriaItemColl,
                localField: 'item.id_categoria_reg1',
                foreignField: '_id',
                as: 'catReg1'
              }
            },
            { $unwind: { path: '$catReg1', preserveNullAndEmptyArrays: true } },
      
            // saída final
            {
              $project: {
                _id: 0,
      
                id_item: 1,
                data_registro: 1,
                data_permanecia: 1,
                tag: 1,
                rssi: 1,
      
                // categoria do registro
                id_categoria: 1,
                categoria_descricao: { $ifNull: ['$categoria.descricao', ''] },
      
                // vínculo do item: categoria_reg1
                id_categoria_reg1: '$item.id_categoria_reg1',
                categoria_reg1_descricao: { $ifNull: ['$catReg1.descricao', ''] },
      
                // níveis atuais
                id_nivel_loc1: 1,
                id_nivel_loc2: 1,
                id_nivel_loc3: 1,
                id_nivel_loc4: 1,
      
                nivel_loc1_descricao: { $ifNull: ['$loc1.descricao', ''] },
                nivel_loc2_descricao: { $ifNull: ['$loc2.descricao', ''] },
                nivel_loc3_descricao: { $ifNull: ['$loc3.descricao', ''] },
                nivel_loc4_descricao: { $ifNull: ['$loc4.descricao', ''] },
      
                // níveis finais
                id_nivel_loc1_final: 1,
                id_nivel_loc2_final: 1,
                id_nivel_loc3_final: 1,
                id_nivel_loc4_final: 1,
      
                nivel_loc1_final_descricao: { $ifNull: ['$loc1f.descricao', ''] },
                nivel_loc2_final_descricao: { $ifNull: ['$loc2f.descricao', ''] },
                nivel_loc3_final_descricao: { $ifNull: ['$loc3f.descricao', ''] },
                nivel_loc4_final_descricao: { $ifNull: ['$loc4f.descricao', ''] },
              }
            },
      
            { $sort: { data_registro: -1 } }
          ];
      
          const result = await registro.aggregate(pipeline).allowDiskUse(true);
          return res.json(result);
      
        } catch (err) {
          console.error(err);
          return res.status(500).json({ erro: 'Erro ao buscar últimos registros', detalhe: err.message });
        }
      });

      app.get('/registro/ultimos-por_localizacao', async (req, res) => {
        try {
          const {
            id_conta,
            id_nivel_loc1,
            id_nivel_loc2,
            id_nivel_loc3,
            id_nivel_loc4
          } = req.query;
      
          if (!id_conta) return res.status(400).json({ erro: 'id_conta é obrigatório' });
      
          // Regra de precedência: 4 > 3 > 2 > 1
          let locField = null;
          let locValue = null;
      
          if (id_nivel_loc4) { locField = 'id_nivel_loc4'; locValue = id_nivel_loc4; }
          else if (id_nivel_loc3) { locField = 'id_nivel_loc3'; locValue = id_nivel_loc3; }
          else if (id_nivel_loc2) { locField = 'id_nivel_loc2'; locValue = id_nivel_loc2; }
          else if (id_nivel_loc1) { locField = 'id_nivel_loc1'; locValue = id_nivel_loc1; }
      
          const match = { id_conta };
          if (locField && locValue) match[locField] = locValue;
      
          const LocalizacaoColl = mongoose.model('Localizacao').collection.name;
          const CategoriaColl = mongoose.model('Categoria').collection.name;
      
          const pipeline = [
            { $match: match },
      
            // último registro por item
            { $sort: { data_registro: -1, createdAt: -1 } },
            { $group: { _id: '$id_item', doc: { $first: '$$ROOT' } } },
            { $replaceRoot: { newRoot: '$doc' } },
      
            // duração (ms)
            {
              $addFields: {
                duracao_ms: {
                  $cond: [
                    { $and: ['$data_registro', '$data_permanecia'] },
                    { $subtract: ['$data_permanecia', '$data_registro'] },
                    null
                  ]
                }
              }
            },
      
            // ✅ AGRUPA por LOCALIZAÇÃO + CATEGORIA
            {
              $group: {
                _id: {
                  id_categoria: '$id_categoria',
                  id_nivel_loc1: '$id_nivel_loc1',
                  id_nivel_loc2: '$id_nivel_loc2',
                  id_nivel_loc3: '$id_nivel_loc3',
                  id_nivel_loc4: '$id_nivel_loc4',
                },
                total_itens: { $sum: 1 },
                tempo_medio_ms: { $avg: '$duracao_ms' },
              }
            },
      
            // lookups (agora em cima do agregado)
            {
              $lookup: {
                from: CategoriaColl,
                localField: '_id.id_categoria',
                foreignField: '_id',
                as: 'categoria'
              }
            },
            { $unwind: { path: '$categoria', preserveNullAndEmptyArrays: true } },
      
            { $lookup: { from: LocalizacaoColl, localField: '_id.id_nivel_loc1', foreignField: '_id', as: 'loc1' } },
            { $lookup: { from: LocalizacaoColl, localField: '_id.id_nivel_loc2', foreignField: '_id', as: 'loc2' } },
            { $lookup: { from: LocalizacaoColl, localField: '_id.id_nivel_loc3', foreignField: '_id', as: 'loc3' } },
            { $lookup: { from: LocalizacaoColl, localField: '_id.id_nivel_loc4', foreignField: '_id', as: 'loc4' } },
      
            { $unwind: { path: '$loc1', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$loc2', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$loc3', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$loc4', preserveNullAndEmptyArrays: true } },
      
            // saída final
            {
              $project: {
                _id: 0,
      
                id_categoria: '$_id.id_categoria',
                categoria_descricao: { $ifNull: ['$categoria.descricao', ''] },
      
                id_nivel_loc1: '$_id.id_nivel_loc1',
                id_nivel_loc2: '$_id.id_nivel_loc2',
                id_nivel_loc3: '$_id.id_nivel_loc3',
                id_nivel_loc4: '$_id.id_nivel_loc4',
      
                nivel_loc1_descricao: { $ifNull: ['$loc1.descricao', ''] },
                nivel_loc2_descricao: { $ifNull: ['$loc2.descricao', ''] },
                nivel_loc3_descricao: { $ifNull: ['$loc3.descricao', ''] },
                nivel_loc4_descricao: { $ifNull: ['$loc4.descricao', ''] },
      
                total_itens: 1,
      
                tempo_medio_ms: { $ifNull: ['$tempo_medio_ms', 0] },
                tempo_medio_seg: { $divide: [{ $ifNull: ['$tempo_medio_ms', 0] }, 1000] },
                tempo_medio_min: { $divide: [{ $ifNull: ['$tempo_medio_ms', 0] }, 1000 * 60] },
              }
            },
      
            // ordena como preferir:
            { $sort: { total_itens: -1 } }
          ];
      
          const result = await registro.aggregate(pipeline).allowDiskUse(true);
          return res.json(result);
      
        } catch (err) {
          console.error(err);
          return res.status(500).json({ erro: 'Erro ao buscar agrupado', detalhe: err.message });
        }
      });
      

      app.get('/registro/total-diario', async (req, res) => {
        try {
          const {
            id_conta,
            id_nivel_loc1,
            id_nivel_loc2,
            id_nivel_loc3,
            id_nivel_loc4
          } = req.query;
      
          if (!id_conta) return res.status(400).json({ erro: 'id_conta é obrigatório' });
      
          // Regra de precedência: 4 > 3 > 2 > 1
          let locField = null;
          let locValue = null;
      
          if (id_nivel_loc4) { locField = 'id_nivel_loc4'; locValue = id_nivel_loc4; }
          else if (id_nivel_loc3) { locField = 'id_nivel_loc3'; locValue = id_nivel_loc3; }
          else if (id_nivel_loc2) { locField = 'id_nivel_loc2'; locValue = id_nivel_loc2; }
          else if (id_nivel_loc1) { locField = 'id_nivel_loc1'; locValue = id_nivel_loc1; }
      
          const match = { id_conta };
          if (locField && locValue) match[locField] = locValue;
      
          const pipeline = [
            { $match: match },
      
            // garante que só entra registro com data_registro válida
            { $match: { data_registro: { $type: 'date' } } },
      
            // agrupa por dia
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$data_registro',
                    timezone: 'America/Sao_Paulo'
                  }
                },
                total: { $sum: 1 }
              }
            },
      
            {
              $project: {
                _id: 0,
                data: '$_id',   // "2026-01-30"
                total: 1
              }
            },
      
            // decrescente (mais recente primeiro)
            { $sort: { data: -1 } }
          ];
      
          const result = await registro.aggregate(pipeline).allowDiskUse(true);
          return res.json(result);
      
        } catch (err) {
          console.error(err);
          return res.status(500).json({ erro: 'Erro ao gerar total diário', detalhe: err.message });
        }
      });

}