const mongoose = require('mongoose');
const shortid = require('shortid');

const MovimentacaoItensBase = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    id_movimentacao: { type: String, ref: 'Movimentacao' },
    id_item: { type: String, ref: 'Item' },
    id_categoria: { type: String, ref: 'Categoria' },
    quantidade: { type: Number },
}, {
    versionKey: false
});

module.exports = mongoose.model('Movimentacao_Itens_Base', MovimentacaoItensBase);
