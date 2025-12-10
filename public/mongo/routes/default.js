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

module.exports = (app, dbConnection) => {

    app.get('/_bd', async (req, res) => {
        try {
            let { query: obj } = req;
            let collection;
            let populate = '';
            let page = 1;
            let limit = 3500;
            let sort = '_id';
            let findReg = { $and: [] };

            // Configuração inicial do modelo e parâmetros básicos
            for (const [index, key] of Object.keys(obj).entries()) {
                const value = obj[key];

                console.log(key)

                if (key === 'versao') {

                    // Logica de validação de versão
                    return res.status(200).json([]);

                } else if (index === 0) {

                    collection = require(`../models/${value}`);

                } else {

                    // Verificação dos parâmetros de paginação, limite e populates
                    if (key === 'page') {
                        page = parseInt(value);

                    } else if (key === 'limit') {
                        limit = parseInt(value);

                    } else if (key === 'pop') {
                        populate = value;

                    } else if (key === 'sort') {
                        sort = { [value]: 1 };

                    } else if (key === '_sort') {
                        sort = { [value]: -1 };


                    } else {
                        setFindConditions(key, value, findReg);
                    }
                }
            }

            // Consulta ao banco de dados com as condições configuradas
            const regFind = await collection.find(findReg)
                .populate(populate)
                .skip((page - 1) * limit)
                .limit(limit)
                .sort(sort);

            res.status(200).json(regFind);
        } catch (error) {
            res.status(400).json([{ error: error.message }]);
        }
    });

    // Função para configurar os parâmetros de busca
    function setFindConditions(key, value, findReg) {
        if (key.includes('*in')) {
            const _key = key.replace('*in', '');
            const _obj = JSON.parse(value);
            findReg.$and.push({ [_key]: { $in: _obj } });

        } else if (value.includes('*dtP')) {
            const [start, end] = value.replace('*dtP', '').split('|');
            findReg.$and.push({
                [key]: {
                    $gte: moment(start, 'YYYY-MM-DD').startOf('day').toDate(),
                    $lte: moment(end, 'YYYY-MM-DD').endOf('day').toDate()
                }
            });

        } else if (value.includes('*dt')) {
            const date = new Date(value.replace('*dt', ''));
            const startDate = new Date(date);
            const endDate = new Date(date);
            endDate.setDate(endDate.getDate() + 1);
            findReg.$and.push({
                [key]: { $gte: startDate, $lt: endDate }
            });

        } else if (!value.includes('*')) {
            if (value === 'null') {
                findReg.$and.push({ [key]: null });
            } else {
                findReg.$and.push({ [key]: value });
            }
        }
    }

    app.patch('/_bd/:collection', async (req, res) => {

        console.log(JSON.stringify(req.body))
        const collection = require('../models/' + req.params.collection);

        res.header("Access-Control-Allow-Origin", "*");

        try {

            const documento = await collection.findOneAndUpdate(
                { _id: req.body._id },
                req.body,
                { upsert: true, new: true }
            );
            console.log(documento);
            return res.status(200).send(documento);
        } catch (err) {
            console.log(err)
            return res.status(400).send([{ error: err }]);
        }
    });

    app.delete('/_bd/:collection/:field/:value', async (req, res) => {
        const collection = require('../models/' + req.params.collection);

        res.header("Access-Control-Allow-Origin", "*");

        try {
            const query = {};
            query[req.params.field] = req.params.value;

            const result = await collection.deleteMany(query);
            if (result) {
                console.log(result);
                return res.status(200).send(result);
            } else {
                return res.status(200).send([]);
                // return res.status(404).send({ error: "Documento não encontrado" });
            }
        } catch (err) {
            console.log(err);
            return res.status(400).send([{ error: err }]);
        }
    });

    app.delete('/_bd/:collection/:field1/:value1/:field2/:value2', async (req, res) => {
        const collection = require('../models/' + req.params.collection);
        res.header("Access-Control-Allow-Origin", "*");

        try {
            const query = {};
            query[req.params.field1] = req.params.value1;
            query[req.params.field2] = req.params.value2;

            const result = await collection.deleteMany(query);

            if (result && result.deletedCount > 0) {
                console.log(result);
                return res.status(200).send(result);
            } else {
                return res.status(200).send([]); // nenhum documento encontrado
            }
        } catch (err) {
            console.log(err);
            return res.status(400).send([{ error: err.message || err }]);
        }
    });

    app.get('/_bd/limpa_base/:id_conta/:full', async (req, res) => {

        const { id_conta, full } = req.params;

        const _categoria_item = require('../models/categoria_item');
        const _categoria = require('../models/categoria');
        const _gateway = require('../models/gateway');
        const _item = require('../models/item');
        const _localizacao_planta = require('../models/localizacao_planta');
        const _localizacao = require('../models/localizacao');
        const _maquinas = require('../models/maquinas');
        const _movimentacao_item = require('../models/movimentacao_item');
        const _movimentacao_itens_base = require('../models/movimentacao_itens_base');
        const _movimentacao_mov = require('../models/movimentacao_mov');
        const _movimentacao_processo = require('../models/movimentacao_processo');
        const _movimentacao = require('../models/movimentacao');
        const _registro = require('../models/registro');

        if (full === 'true' || full === '1') {
            await _categoria_item.deleteMany({ id_conta });
            await _categoria.deleteMany({ id_conta });
            await _gateway.deleteMany({ id_conta });
            await _item.deleteMany({ id_conta });
            await _localizacao_planta.deleteMany({ id_conta });
            await _localizacao.deleteMany({ id_conta });
            await _maquinas.deleteMany({ id_conta });
        }

        await _movimentacao_item.deleteMany({ id_conta });
        await _movimentacao_itens_base.deleteMany({ id_conta });
        await _movimentacao_mov.deleteMany({ id_conta });
        await _movimentacao_processo.deleteMany({ id_conta });
        await _movimentacao.deleteMany({ id_conta });
        await _registro.deleteMany({ id_conta });

        res.json({
            sucesso: true,
            id_conta,
            limpeza_completa: full === 'true' || full === '1',
        });


    })


    // Função para gerar expressão regular com sensibilidade a diacríticos
    function diacriticSensitiveRegex(string = '') {


        return string
            .replace(/a/g, '[a,á,à,ä,â]')
            .replace(/A/g, '[A,a,á,à,ä,â]')
            .replace(/e/g, '[e,é,ë,è]')
            .replace(/E/g, '[E,e,é,ë,è]')
            .replace(/i/g, '[i,í,ï,ì]')
            .replace(/I/g, '[I,i,í,ï,ì]')
            .replace(/o/g, '[o,ó,ö,ò]')
            .replace(/O/g, '[O,o,ó,ö,ò]')
            .replace(/u/g, '[u,ü,ú,ù]')
            .replace(/U/g, '[U,u,ü,ú,ù]');
    }




    app.get('/localizacao/com-planta/:id_conta', async (req, res) => {
        try {
            const { id_conta } = req.params;

            const locais = await localizacao.aggregate([
                {
                    $match: {
                        id_conta: id_conta,
                        'areasData.points': { $exists: true, $not: { $size: 0 } },
                    }
                },
                // 🔹 Faz join com o nível pai (auto-lookup na própria collection)
                {
                    $lookup: {
                        from: 'localizacaos', // nome da coleção (plural do model Localizacao)
                        localField: 'id_nivel',
                        foreignField: '_id',
                        as: 'nivel_info'
                    }
                },
                {
                    $unwind: {
                        path: '$nivel_info',
                        preserveNullAndEmptyArrays: true // mantém mesmo se não tiver nível pai
                    }
                },
                {
                    $project: {
                        _id: 1,
                        descricao: 1,
                        id_conta: 1,
                        areasData: 1,
                        tag: 1,
                        nivel_id: '$nivel_info._id',
                        nivel_descricao: '$nivel_info.descricao'
                    }
                }
            ]);

            // 🔹 Conta apenas itens com status ativo
            const results = await Promise.all(locais.map(async (loc) => {
                const totalItens = await item.countDocuments({
                    id_conta: id_conta,
                    status: 'ativo', // ✅ apenas itens ativos
                    $expr: {
                        $or: [
                            { $eq: ['$id_nivel_loc4', loc._id] },
                            {
                                $and: [
                                    { $ne: ['$id_nivel_loc4', { $type: 'missing' }] },
                                    { $eq: ['$id_nivel_loc3', loc._id] }
                                ]
                            },
                            {
                                $and: [
                                    { $eq: ['$id_nivel_loc4', null] },
                                    { $eq: ['$id_nivel_loc3', loc._id] }
                                ]
                            },
                            {
                                $and: [
                                    { $eq: ['$id_nivel_loc4', null] },
                                    { $eq: ['$id_nivel_loc3', null] },
                                    { $eq: ['$id_nivel_loc2', loc._id] }
                                ]
                            },
                            {
                                $and: [
                                    { $eq: ['$id_nivel_loc4', null] },
                                    { $eq: ['$id_nivel_loc3', null] },
                                    { $eq: ['$id_nivel_loc2', null] },
                                    { $eq: ['$id_nivel_loc1', loc._id] }
                                ]
                            }
                        ]
                    }
                });

                return {
                    ...loc,
                    total_itens: totalItens
                };
            }));

            res.json(results);

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao buscar localizações com planta' });
        }
    });


    app.get('/localizacao/subniveis/:id_nivel', async (req, res) => {
        try {
            const { id_nivel } = req.params;

            // 🔹 Nível 1: localizações diretamente vinculadas ao id_nivel informado
            const nivel1 = await localizacao.find({ id_nivel }).lean();

            // 🔹 Extrai os IDs dessas localizações
            const idsNivel1 = nivel1.map(l => l._id);

            // 🔹 Nível 2: localizações que têm id_nivel entre os IDs do nível 1
            const nivel2 = await localizacao.find({ id_nivel: { $in: idsNivel1 } }).lean();

            const idsNivel2 = nivel2.map(l => l._id);

            // 🔹 Nível 3 (opcional, se quiser dois níveis abaixo do original)
            const nivel3 = await localizacao.find({ id_nivel: { $in: idsNivel2 } }).lean();

            // 🔹 Junta tudo em um array, mantendo o original e os dois níveis abaixo
            const all = [...nivel1, ...nivel2, ...nivel3];

            res.json({
                id_nivel_origem: id_nivel,
                total: all.length,
                niveis: all
            });

        } catch (err) {
            console.error('Erro ao buscar subníveis:', err);
            res.status(500).json({ error: 'Erro ao buscar localizações e subníveis' });
        }
    });

    app.get('/localizacao/com-areas/:id_conta', async (req, res) => {
        try {
            const { id_conta } = req.params;

            const locais = await localizacao.aggregate([
                {
                    $match: {
                        id_conta: id_conta,
                        'areasData.pointsLatLng': { $exists: true, $not: { $size: 0 } },
                    }
                },
                // 🔹 Faz join com o nível pai (auto-lookup na própria collection)
                {
                    $lookup: {
                        from: 'localizacaos', // nome da collection (plural do model Localizacao)
                        localField: 'id_nivel',
                        foreignField: '_id',
                        as: 'nivel_info'
                    }
                },
                {
                    $unwind: {
                        path: '$nivel_info',
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $project: {
                        _id: 1,
                        descricao: 1,
                        id_conta: 1,
                        areasData: 1,
                        tag: 1,
                        nivel_id: '$nivel_info._id',
                        nivel_descricao: '$nivel_info.descricao'
                    }
                }
            ]);

            // 🔹 Conta apenas itens com status ativo vinculados a cada local
            const results = await Promise.all(locais.map(async (loc) => {
                const totalItens = await item.countDocuments({
                    id_conta: id_conta,
                    status: 'ativo', // ✅ só conta itens ativos
                    $expr: {
                        $or: [
                            { $eq: ['$id_nivel_loc4', loc._id] },
                            {
                                $and: [
                                    { $ne: ['$id_nivel_loc4', { $type: 'missing' }] },
                                    { $eq: ['$id_nivel_loc3', loc._id] }
                                ]
                            },
                            {
                                $and: [
                                    { $eq: ['$id_nivel_loc4', null] },
                                    { $eq: ['$id_nivel_loc3', loc._id] }
                                ]
                            },
                            {
                                $and: [
                                    { $eq: ['$id_nivel_loc4', null] },
                                    { $eq: ['$id_nivel_loc3', null] },
                                    { $eq: ['$id_nivel_loc2', loc._id] }
                                ]
                            },
                            {
                                $and: [
                                    { $eq: ['$id_nivel_loc4', null] },
                                    { $eq: ['$id_nivel_loc3', null] },
                                    { $eq: ['$id_nivel_loc2', null] },
                                    { $eq: ['$id_nivel_loc1', loc._id] }
                                ]
                            }
                        ]
                    }
                });

                return {
                    ...loc,
                    total_itens: totalItens
                };
            }));

            res.json(results);

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao buscar localizações com áreas' });
        }
    });


    



}