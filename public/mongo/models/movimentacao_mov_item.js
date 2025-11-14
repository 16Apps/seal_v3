const mongoose = require('mongoose');
const shortid = require('shortid');

const MovimentacaoMovItemSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    id_movimentacao: { type: String, ref: 'Movimentacao' },
    id_movimentacao_mov: { type: String, ref: 'Movimentacao_Mov' },

    id_item: { type: String, ref: 'Item' },
    id_categoria: { type: String, ref: 'Categoria' },
    quantidade: { type: Number },
    quantidade_registrada: { type: Number },

    modo: { type: String, enum: ['retirada', 'transferencia'], default: 'retirada' },
    modo_data: { type: Date },
    tolerancia: { type: Number, default: 30},

        id_gateway: { type: String, ref: 'Gateway' },
    id_colaborador: { type: String, ref: 'Colaborador' },
    id_nivel_loc1: { type: String, ref: 'Localizacao' },
    id_nivel_loc2: { type: String, ref: 'Localizacao' },
    id_nivel_loc3: { type: String, ref: 'Localizacao' },
    id_nivel_loc4: { type: String, ref: 'Localizacao' },


    status: { type: String, enum: ['pendente', 'atrasada', 'concluida', 'concluida_atrasada',  'ultrapassada', 'cancelada'], default: 'pendente' },
    data_status: { type: Date },
    

}, {
    versionKey: false
});

module.exports = mongoose.model('Movimentacao_Mov_Item', MovimentacaoMovItemSchema);
