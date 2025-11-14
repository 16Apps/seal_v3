const mongoose = require('mongoose');
const shortid = require('shortid');

const MovimentacaoSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    
    id_doc: { type: String},
    data_registro: { type: Date },
    id_colaborador: { type: String, ref: 'Colaborador' },

    modo: { type: String, enum: ['expedicao', 'recebimento', 'tracking', 'inventario', 'neutro', 'pedido'], default: 'neutro' },
    status: { type: String, enum: ['aberta', 'iniciada', 'emmovimentacao', 'parcial', 'finalizada', 'cancelada'], default: 'aberta' },
    data_status: { type: Date },
    historico_status: { type: Object },
    
    movimentacao_modo: { type: String},
    movimentacao_modo_data: { type: Date },
    movimentacao_tolerancia: { type: Number, default: 30},
    movimentacao_id_colaborador: { type: String, ref: 'Colaborador' },

    id_gateway: { type: Object }, // nao pode-se ter um gateway na ordem, por que as movimentacoes sao variadas entre os equipamentos
    id_nivel_loc1: { type: String, ref: 'Localizacao' },
    id_nivel_loc2: { type: String, ref: 'Localizacao' },
    id_nivel_loc3: { type: String, ref: 'Localizacao' },
    id_nivel_loc4: { type: String, ref: 'Localizacao' },

    id_nivel_loc1_dest: { type: String, ref: 'Localizacao' },
    id_nivel_loc2_dest: { type: String, ref: 'Localizacao' },
    id_nivel_loc3_dest: { type: String, ref: 'Localizacao' },
    id_nivel_loc4_dest: { type: String, ref: 'Localizacao' },

}, {
    versionKey: false
});

module.exports = mongoose.model('Movimentacao', MovimentacaoSchema);
