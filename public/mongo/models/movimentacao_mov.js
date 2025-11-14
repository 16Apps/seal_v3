const mongoose = require('mongoose');
const shortid = require('shortid');

const MovimentacaoMovSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    id_movimentacao: { type: String, ref: 'Movimentacao' },
    id_processo: { type: String, ref: 'Processos' },

    modo: { type: String, enum: ['expedicao', 'recebimento', 'retirada', 'transferencia', 'inventario'], default: 'expedicao' },
    modo_data: { type: Date },
    tolerancia: { type: Number, default: 30},
    
    id_colaborador: { type: String, ref: 'Colaborador' },
    id_nivel_loc1: { type: String, ref: 'Localizacao' },
    id_nivel_loc2: { type: String, ref: 'Localizacao' },
    id_nivel_loc3: { type: String, ref: 'Localizacao' },
    id_nivel_loc4: { type: String, ref: 'Localizacao' },

    status: { type: String, enum: ['pendente', 'parcial', 'atrasada', 'concluida', 'concluida_atrasada',  'ultrapassada', 'cancelada'], default: 'pendente' },
    data_status: { type: Date },
    id_gateway: { type: String, ref: 'Gateway' }

}, {
    versionKey: false
});

module.exports = mongoose.model('Movimentacao_Mov', MovimentacaoMovSchema);
