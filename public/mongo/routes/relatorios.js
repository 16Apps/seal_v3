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

          // 2.5️⃣ Lookup do gateway
          {
            $lookup: {
              from: 'gateways',
              localField: 'id_gateway',
              foreignField: '_id',
              as: 'id_gateway'
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
    
          // 5️⃣ Normaliza arrays (categoria, gateway e categoria associada)
          {
            $addFields: {
              categoria: { $arrayElemAt: ['$categoria', 0] },
              id_gateway: { $arrayElemAt: ['$id_gateway', 0] },
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
      

}