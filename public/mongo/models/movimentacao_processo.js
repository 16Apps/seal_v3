const mongoose = require('mongoose');
const shortid = require('shortid');

const MovimentacaoProcesso = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    id_movimentacao: { type: String, ref: 'Movimentacao' },
    id_movimentacao_item_base: { type: String, ref: 'Movimentacao_Itens_Base' },
    id_movimentacao_mov: { type: String, ref: 'Movimentacao_Mov' },
    id_registro: { type: String, ref: 'Registro' },
    status: { type: String, enum: ['pendente', 'atrasada', 'concluida', 'concluida_atrasada',  'ultrapassada', 'cancelada', 'alerta', 'nao_encontrado', 'encontrado', 'encontrado_manual', 'excedente'], default: 'pendente' },
    status_info: { type: String},

    tag: { type: String},
    modo_data: { type: Date },

}, {
    versionKey: false
});

module.exports = mongoose.model('Movimentacao_Processo', MovimentacaoProcesso);
