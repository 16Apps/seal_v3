const shortid = require('shortid');
const fs = require('fs');
const axios = require('axios'); // se for enviar via HTTP

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

const ultimasLeituras = new Map(); // { tag => timestamp }
const { setTimeout: sleep } = require('timers/promises');
const moment = require('moment')
const cron = require('node-cron');

module.exports = (app, dbConnection) => {

    console.log("api")

    app.get('/registro/associacoes/:id_conta', async (req, res) => {

      const id_conta = req.params.id_conta;
    
      try {
        const result = await Registro.aggregate([
          // 1️⃣ Filtra pela conta
          {
            $match: { id_conta }
          },

          // 1.5️⃣ Filtra apenas registros que têm associados
          {
            $match: {
              associados: { $exists: true, $type: 'array', $ne: [] }
            }
          },
    
          // 2️⃣ Lookup da categoria principal
          {
            $lookup: {
              from: 'categorias',
              localField: 'id_categoria',
              foreignField: '_id',
              as: 'categoria'
            }
          },
    
          // 3️⃣ Explode associados
          {
            $unwind: {
              path: '$associados',
              preserveNullAndEmptyArrays: false
            }
          },
    
          // 4️⃣ Lookup da categoria dos associados
          {
            $lookup: {
              from: 'categorias',
              localField: 'associados.id_categoria',
              foreignField: '_id',
              as: 'associados.categoria'
            }
          },
    
          // 5️⃣ Normaliza arrays (categoria e categoria associada)
          {
            $addFields: {
              categoria: { $arrayElemAt: ['$categoria', 0] },
              'associados.categoria': { $arrayElemAt: ['$associados.categoria', 0] }
            }
          },
    
          // 6️⃣ Reagrupa os associados
          {
            $group: {
              _id: '$_id',
              doc: { $first: '$$ROOT' },
              associados: { $push: '$associados' }
            }
          },
    
          // 7️⃣ Reestrutura o documento final
          {
            $replaceRoot: {
              newRoot: {
                $mergeObjects: ['$doc', { associados: '$associados' }]
              }
            }
          },
    
          // 8️⃣ Remove lixo de unwind quando não houver associados
          {
            $addFields: {
              associados: {
                $filter: {
                  input: '$associados',
                  as: 'a',
                  cond: { $ne: ['$$a', null] }
                }
              }
            }
          },

          // 8.5️⃣ Filtra apenas documentos que têm associados válidos após o filtro
          {
            $match: {
              associados: { $exists: true, $type: 'array', $ne: [] }
            }
          },
    
          // 9️⃣ Ordenação (opcional)
          {
            $sort: { createdAt: -1 }
          }
        ]);
    
        res.json(result);
      } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao buscar registros', detalhe: err.message });
      }
    });

    app.get('/relatorio/associacao-reg/:id_conta', async (req, res) => {
      const { id_conta } = req.params;
      const { data_inicio, data_fim } = req.query;

      try {
        const query = { id_conta };
        const possuiDataInicio = Boolean(data_inicio);
        const possuiDataFim = Boolean(data_fim);

        // Período é opcional; quando informado, aplica filtro de data_registro
        if (possuiDataInicio || possuiDataFim) {
          const filtroData = {};

          if (possuiDataInicio) {
            const inicio = new Date(data_inicio);
            if (Number.isNaN(inicio.getTime())) {
              return res.status(400).json({
                erro: 'data_inicio inválida. Use formato ISO, ex: 2026-04-01T00:00:00.000Z'
              });
            }
            filtroData.$gte = inicio;
          }

          if (possuiDataFim) {
            const fim = new Date(data_fim);
            if (Number.isNaN(fim.getTime())) {
              return res.status(400).json({
                erro: 'data_fim inválida. Use formato ISO, ex: 2026-04-14T23:59:59.999Z'
              });
            }
            filtroData.$lte = fim;
          }

          query.data_registro = filtroData;
        }

        const result = await AssociacaoRegistro.find(query)
          .populate('id_conta')
          .populate({
            path: 'id_registro',
            populate: [
              { path: 'id_nivel_loc1', select: 'descricao' },
              { path: 'id_nivel_loc2', select: 'descricao' },
              { path: 'id_nivel_loc3', select: 'descricao' },
              { path: 'id_nivel_loc4', select: 'descricao' },
              { path: 'id_nivel_loc1_final', select: 'descricao' },
              { path: 'id_nivel_loc2_final', select: 'descricao' },
              { path: 'id_nivel_loc3_final', select: 'descricao' },
              { path: 'id_nivel_loc4_final', select: 'descricao' }
            ]
          })
          .populate('id_colaborador')
          .populate('id_gateway')
          .populate('id_item')
          .populate('id_categoria')
          .populate({
            path: 'associados.id_registro',
            populate: [
              { path: 'id_nivel_loc1', select: 'descricao' },
              { path: 'id_nivel_loc2', select: 'descricao' },
              { path: 'id_nivel_loc3', select: 'descricao' },
              { path: 'id_nivel_loc4', select: 'descricao' },
              { path: 'id_nivel_loc1_final', select: 'descricao' },
              { path: 'id_nivel_loc2_final', select: 'descricao' },
              { path: 'id_nivel_loc3_final', select: 'descricao' },
              { path: 'id_nivel_loc4_final', select: 'descricao' }
            ]
          })
          .populate('associados.id_item')
          .populate('associados.id_categoria')
          .sort({ data_registro: -1, createdAt: -1 });

        return res.status(200).json(result);
      } catch (err) {
        console.error(err);
        return res.status(500).json({
          erro: 'Erro ao buscar associação de registros',
          detalhe: err.message
        });
      }
    });
    

    app.get('/relatorio/tags-ultimos-enderecos/:id_conta', async (req, res) => {
      const { id_conta } = req.params;

      try {
        const ultimosPorEndereco = await Registro.aggregate([
          {
            $match: {
              id_conta,
              tag: { $exists: true, $ne: null, $ne: '' }
            }
          },
          {
            $sort: { data_registro: -1, createdAt: -1 }
          },
          {
            $addFields: {
              enderecoKey: {
                $concat: [
                  { $ifNull: ['$id_nivel_loc1', ''] }, '|',
                  { $ifNull: ['$id_nivel_loc2', ''] }, '|',
                  { $ifNull: ['$id_nivel_loc3', ''] }, '|',
                  { $ifNull: ['$id_nivel_loc4', ''] }
                ]
              }
            }
          },
          {
            $group: {
              _id: {
                tag: '$tag',
                enderecoKey: '$enderecoKey'
              },
              registro: { $first: '$$ROOT' }
            }
          },
          {
            $replaceRoot: { newRoot: '$registro' }
          },
          {
            $sort: { tag: 1, data_registro: -1, createdAt: -1 }
          },
          {
            $group: {
              _id: '$tag',
              tag: { $first: '$tag' },
              id_item: { $first: '$id_item' },
              id_categoria: { $first: '$id_categoria' },
              registrosEndereco: { $push: '$$ROOT' }
            }
          },
          {
            $project: {
              _id: 0,
              tag: 1,
              id_item: 1,
              id_categoria: 1,
              registrosEndereco: { $slice: ['$registrosEndereco', 4] }, // atual + até 3 anteriores
              ultima_movimentacao: { $arrayElemAt: ['$registrosEndereco.data_registro', 0] }
            }
          },
          {
            $sort: { ultima_movimentacao: -1, tag: 1 }
          }
        ]);

        const itemIds = [...new Set(
          ultimosPorEndereco
            .map((t) => t.id_item)
            .filter(Boolean)
        )];
        const categoriaIds = [...new Set(
          ultimosPorEndereco
            .map((t) => t.id_categoria)
            .filter(Boolean)
        )];

        const localIds = [...new Set(
          ultimosPorEndereco.flatMap((t) =>
            (t.registrosEndereco || []).flatMap((r) => [
              r.id_nivel_loc1,
              r.id_nivel_loc2,
              r.id_nivel_loc3,
              r.id_nivel_loc4
            ])
          ).filter(Boolean)
        )];

        const [items, categorias, locais] = await Promise.all([
          itemIds.length
            ? Item.find({ _id: { $in: itemIds } }).select('_id descricao').lean()
            : [],
          categoriaIds.length
            ? Categoria.find({ _id: { $in: categoriaIds } }).select('_id descricao foto').lean()
            : [],
          localIds.length
            ? Localizacao.find({ _id: { $in: localIds } }).select('_id descricao').lean()
            : []
        ]);

        const itemDescricaoById = new Map(items.map((i) => [i._id, i.descricao || '']));
        const categoriaDescricaoById = new Map(categorias.map((c) => [c._id, c.descricao || '']));
        const categoriaFotoById = new Map(categorias.map((c) => [c._id, c.foto || '']));
        const localDescricaoById = new Map(locais.map((l) => [l._id, l.descricao || '']));

        const result = ultimosPorEndereco.map((tagReg) => ({
          tag: tagReg.tag,
          descricao: itemDescricaoById.get(tagReg.id_item) || '',
          categoria_descricao: categoriaDescricaoById.get(tagReg.id_categoria) || '',
          categoria_foto: categoriaFotoById.get(tagReg.id_categoria) || '',
          locais: (tagReg.registrosEndereco || []).map((reg) => ({
            data_registro: reg.data_registro,
            data_permanecia: reg.data_permanecia || null,
            tempo_permanencia_min: (
              reg.data_registro &&
              reg.data_permanecia &&
              !Number.isNaN(new Date(reg.data_registro).getTime()) &&
              !Number.isNaN(new Date(reg.data_permanecia).getTime())
            )
              ? Number((((new Date(reg.data_permanecia).getTime() - new Date(reg.data_registro).getTime()) / 60000)).toFixed(2))
              : null,
            id_nivel_loc1: reg.id_nivel_loc1 || null,
            id_nivel_loc2: reg.id_nivel_loc2 || null,
            id_nivel_loc3: reg.id_nivel_loc3 || null,
            id_nivel_loc4: reg.id_nivel_loc4 || null,
            id_categoria: reg.id_categoria || null,
            categoria_descricao: reg.id_categoria ? (categoriaDescricaoById.get(reg.id_categoria) || '') : '',
            categoria_foto: reg.id_categoria ? (categoriaFotoById.get(reg.id_categoria) || '') : '',
            local1_descricao: reg.id_nivel_loc1 ? (localDescricaoById.get(reg.id_nivel_loc1) || '') : '',
            local2_descricao: reg.id_nivel_loc2 ? (localDescricaoById.get(reg.id_nivel_loc2) || '') : '',
            local3_descricao: reg.id_nivel_loc3 ? (localDescricaoById.get(reg.id_nivel_loc3) || '') : '',
            local4_descricao: reg.id_nivel_loc4 ? (localDescricaoById.get(reg.id_nivel_loc4) || '') : ''
          }))
        }));

        const totalRegistros = result.reduce((acc, item) => {
          return acc + (Array.isArray(item.locais) ? item.locais.length : 0);
        }, 0);

        return res.status(200).json({
          total_registros: totalRegistros,
          total_tags: result.length,
          registros: result
        });
      } catch (err) {
        console.error(err);
        return res.status(500).json({
          erro: 'Erro ao buscar últimos endereços por tag',
          detalhe: err.message
        });
      }
    });


}