const mongoose = require('mongoose');
const shortid = require('shortid');

const MovimentacaoItemSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    id_movimentacao: { type: String, ref: 'Movimentacao' },
    id_movimentacao_mov: { type: String, ref: 'Movimentacao_Mov' },
    id_colaborador: { type: String, ref: 'Colaborador' },
    id_gateway: { type: String, ref: 'Gateway' },

    id_categoria: { type: String, ref: 'Categoria' },
    id_item: { type: String, ref: 'Item' },
    
    ean: { type: String },
    tag: { type: String },
    antena: { type: String },
    rssi: { type: String },

    reg_status: { type: String, enum: ['nao_encontrado', 'encontrado', 'encontrado_manual', 'excedente'], default: 'nao_encontrado' },
    reg_data: { type: Date },
        

}, {
    versionKey: false
});

module.exports = mongoose.model('Movimentacao_Item', MovimentacaoItemSchema);
