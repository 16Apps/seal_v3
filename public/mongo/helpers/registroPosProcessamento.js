const moment = require('moment');

const Gateway = require('../models/gateway');
const Registro = require('../models/registro');
const Categoria = require('../models/categoria');
const Posicao = require('../models/posicao');
const Associacao = require('../models/associacao');
const AssociacaoRegistro = require('../models/associacao_reg');

function delay(ms) {
    return new Promise(function (resolve) {
        setTimeout(resolve, ms);
    });
}

function temNivelRegistro(reg) {
    return !!(reg && (
        reg.id_nivel_loc1 || reg.id_nivel_loc2 || reg.id_nivel_loc3 || reg.id_nivel_loc4
    ));
}

async function concluirItemPosicaoChegada(posicao, id_item) {
    const agora = moment().toDate();
    const item = posicao.itens.find(function (i) { return i.id_item === id_item; });
    if (!item) return null;

    item.status_destino = 'concluido';
    item.status_destino_data = agora;

    const total = posicao.itens.length;
    const concluidos = posicao.itens.filter(function (i) { return i.status_destino === 'concluido'; }).length;

    if (concluidos === total) {
        posicao.status = 'concluido';
    } else if (concluidos > 0) {
        posicao.status = 'parcial';
    } else {
        posicao.status = 'aberta';
    }

    posicao.status_data = agora;
    await posicao.save();
    return posicao;
}

/**
 * Atende ordem pendente quando o item chega ao destino (gateway posicao_esperada_auto = 2).
 */
async function checkPosicaoEsperadaEntrada(_reg, logTag) {
    if (!_reg || !_reg.id_item) return;

    const tag = logTag || '[posicao-entrada]';
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date();
    fim.setHours(23, 59, 59, 999);

    const filtro = {
        previsao_chegada_data: { $gte: inicio, $lte: fim },
        itens: {
            $elemMatch: {
                id_item: _reg.id_item,
                status_destino: 'pendente'
            }
        }
    };

    if (_reg.id_nivel_loc4) {
        filtro.id_nivel_loc1_destino = _reg.id_nivel_loc1;
        filtro.id_nivel_loc2_destino = _reg.id_nivel_loc2;
        filtro.id_nivel_loc3_destino = _reg.id_nivel_loc3;
        filtro.id_nivel_loc4_destino = _reg.id_nivel_loc4;
    } else if (_reg.id_nivel_loc3) {
        filtro.id_nivel_loc1_destino = _reg.id_nivel_loc1;
        filtro.id_nivel_loc2_destino = _reg.id_nivel_loc2;
        filtro.id_nivel_loc3_destino = _reg.id_nivel_loc3;
        filtro.id_nivel_loc4_destino = '';
    } else if (_reg.id_nivel_loc2) {
        filtro.id_nivel_loc1_destino = _reg.id_nivel_loc1;
        filtro.id_nivel_loc2_destino = _reg.id_nivel_loc2;
        filtro.id_nivel_loc3_destino = '';
        filtro.id_nivel_loc4_destino = '';
    } else if (_reg.id_nivel_loc1) {
        filtro.id_nivel_loc1_destino = _reg.id_nivel_loc1;
        filtro.id_nivel_loc2_destino = '';
        filtro.id_nivel_loc3_destino = '';
        filtro.id_nivel_loc4_destino = '';
    } else {
        return;
    }

    const posicao = await Posicao.findOne(filtro);
    if (!posicao) return;

    await concluirItemPosicaoChegada(posicao, _reg.id_item);
    console.log(tag + ' Ordem atendida (chegada) item ' + _reg.id_item);
}

async function gerarOrdemPosicaoEsperada(_regBase, logTag) {
    const tag = logTag || '[gerar-ordem]';

    const gateway = await Gateway.findOne({
        _id: _regBase.id_gateway,
        ativo: 1,
        posicao_esperada_auto: 1
    }).lean();

    if (!gateway) {
        console.log(tag + ' Gateway não parametrizado para gerar Ordem de Posição Esperada');
        return;
    }

    const assocReg = await AssociacaoRegistro.findOne({ id_registro: _regBase._id }).lean();
    if (!assocReg || !Array.isArray(assocReg.associados) || assocReg.associados.length === 0) {
        console.log(tag + ' Sem AssociacaoRegistro para o registro base');
        return;
    }

    const origem = {
        id_nivel_loc1: gateway.id_nivel_loc1 || '',
        id_nivel_loc2: gateway.id_nivel_loc2 || '',
        id_nivel_loc3: gateway.id_nivel_loc3 || '',
        id_nivel_loc4: gateway.id_nivel_loc4 || ''
    };

    const now = moment().toDate();
    const nowPlus30 = new Date(now.getTime() + 30 * 60 * 1000);

    if (gateway.id_nivel_loc1_destino) {
        const destino = {
            id_nivel_loc1: gateway.id_nivel_loc1_destino || '',
            id_nivel_loc2: gateway.id_nivel_loc2_destino || '',
            id_nivel_loc3: gateway.id_nivel_loc3_destino || '',
            id_nivel_loc4: gateway.id_nivel_loc4_destino || ''
        };

        const itens = [];
        for (let i = 0; i < assocReg.associados.length; i++) {
            itens.push({
                id_item: assocReg.associados[i].id_item || null,
                id_categoria: assocReg.associados[i].id_categoria || null,
                tag: assocReg.associados[i].tag || '',
                ean: '',
                rssi: assocReg.associados[i].rssi || '',
                quantidade: 1,
                status: 'concluido',
                status_data: now,
                id_gatweway: _regBase.id_gateway || '',
                id_colaborador: _regBase.id_colaborador || '',
                status_destino: 'pendente',
                status_destino_data: ''
            });

            if (i === assocReg.associados.length - 1) {
                await Posicao.create({
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
                    id_nivel_loc4_destino: destino.id_nivel_loc4
                });
                console.log(tag + ' Ordem (destino coletor) criada');
            }
        }
        return;
    }

    for (let i = 0; i < assocReg.associados.length; i++) {
        const categoriaBase = await Categoria.findOne({ _id: assocReg.associados[i].id_categoria }).lean();
        if (!categoriaBase) continue;

        const destino = {
            id_nivel_loc1: categoriaBase.id_nivel_loc1 || '',
            id_nivel_loc2: categoriaBase.id_nivel_loc2 || '',
            id_nivel_loc3: categoriaBase.id_nivel_loc3 || '',
            id_nivel_loc4: categoriaBase.id_nivel_loc4 || ''
        };

        await Posicao.create({
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
                id_item: assocReg.associados[i].id_item || null,
                id_categoria: assocReg.associados[i].id_categoria || null,
                tag: assocReg.associados[i].tag || '',
                ean: '',
                rssi: assocReg.associados[i].rssi || '',
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
            id_nivel_loc4_destino: destino.id_nivel_loc4
        });
        console.log(tag + ' Ordem (destino categoria) criada tag=' + (assocReg.associados[i].tag || ''));
    }
}

/**
 * Associação por janela temporal ±intervalo no mesmo gateway (gera_associao = 1).
 */
async function checkAssociacao(_reg, logTag) {
    const tag = logTag || '[associacao]';

    const gateway = await Gateway.findOne({ _id: _reg.id_gateway, ativo: 1 }).lean();
    if (!gateway || Number(gateway.gera_associao) === 0) {
        console.log(tag + ' gateway sem gera_associao — descartado');
        return;
    }

    const associacao = await Associacao.findOne({
        ativo: '1',
        $or: [
            { id_item: _reg.id_item },
            { id_categoria: _reg.id_categoria }
        ]
    });

    if (!associacao) {
        console.log(tag + ' regra de associação não encontrada');
        return;
    }

    const associadosValidos = (associacao.associados || []).filter(function (associado) {
        const idItem = (associado.id_item || '').trim();
        const idCategoria = (associado.id_categoria || '').trim();
        return idItem === '' || idCategoria === '';
    });

    if (associadosValidos.length === 0) {
        console.log(tag + ' sem associação genérica');
        return;
    }

    const intervaloSegundos = Number(associacao.intervalo) > 0 ? Number(associacao.intervalo) : 5;
    const janelaMs = (intervaloSegundos + 5) * 1000;

    const associacaoRecente = await AssociacaoRegistro.findOne({
        tag: _reg.tag,
        id_gateway: _reg.id_gateway,
        createdAt: { $gte: new Date(Date.now() - janelaMs) }
    }).sort({ createdAt: -1 }).lean();

    if (associacaoRecente) {
        console.log(tag + ' associação recente duplicada — ignorado');
        return;
    }

    const esperaMs = (Number(associacao.intervalo) * 1000) + 1000 || 8000;
    console.log(tag + ' aguardando ' + associacao.intervalo + 's para confirmar leituras...');
    await delay(esperaMs);

    const associacaoAposEspera = await AssociacaoRegistro.findOne({
        tag: _reg.tag,
        id_gateway: _reg.id_gateway,
        createdAt: { $gte: new Date(Date.now() - janelaMs) }
    }).sort({ createdAt: -1 }).lean();

    if (associacaoAposEspera) {
        console.log(tag + ' associação criada por outro ciclo — ignorado');
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

    const asssociao_reg = {
        id_conta: _reg.id_conta,
        id_registro: _reg._id,
        id_colaborador: _reg.id_colaborador || '',
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
    };

    for (let i = 0; i < registrosIntervalo.length; i++) {
        asssociao_reg.associados.push({
            id_registro: registrosIntervalo[i]._id,
            id_item: registrosIntervalo[i].id_item,
            id_categoria: registrosIntervalo[i].id_categoria,
            tag: registrosIntervalo[i].tag,
            rssi: registrosIntervalo[i].rssi,
            data_leitura: registrosIntervalo[i].data_permanecia
        });
    }

    await new AssociacaoRegistro(asssociao_reg).save();
    console.log(tag + ' registro de associação criado (' + registrosIntervalo.length + ' associados)');

    if (registrosIntervalo.length > 0) {
        await gerarOrdemPosicaoEsperada(_reg, tag);
    }
}

/**
 * Pós-processamento após novo ciclo de registro (tracking / registros).
 * @param {object} reg — documento Registro já salvo
 * @param {object} [gateway] — gateway já carregado (opcional)
 * @param {{ logTag?: string, fireAndForgetAssociacao?: boolean }} [opts]
 */
async function posProcessamentoNovoRegistro(reg, gateway, opts) {
    opts = opts || {};
    const logTag = opts.logTag || '[registro-pos]';

    if (!reg || !reg._id) return;

    const gw = gateway || await Gateway.findOne({ _id: reg.id_gateway, ativo: 1 }).lean();
    if (!gw) return;

    if (Number(gw.posicao_esperada_auto) === 2 && reg.status === 'entrada' && temNivelRegistro(reg)) {
        try {
            await checkPosicaoEsperadaEntrada(reg, logTag);
        } catch (err) {
            console.error(logTag + ' erro ao checar posição:', err && err.message ? err.message : err);
        }
    }

    if (Number(gw.gera_associao) === 1) {
        const runAssociacao = function () {
            return checkAssociacao(reg, logTag).catch(function (err) {
                console.error(logTag + ' erro em associação:', err && err.message ? err.message : err);
            });
        };
        if (opts.fireAndForgetAssociacao !== false) {
            void runAssociacao();
        } else {
            await runAssociacao();
        }
    }
}

module.exports = {
    posProcessamentoNovoRegistro,
    checkAssociacao,
    gerarOrdemPosicaoEsperada,
    checkPosicaoEsperadaEntrada,
    concluirItemPosicaoChegada
};