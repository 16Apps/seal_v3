const mongoose = require('mongoose');
const shortid = require('shortid');

const RegistroSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    id_colaborador: { type: String, ref: 'Colaborador' },
    id_gateway: { type: String, ref: 'Gateway' },
    latitude: { type: String },
    longitude: { type: String },

    data_registro: { type: Date },
    data_permanecia: { type: Date },
    status: { type: String },

    id_item: { type: String, ref: 'Item' },
    id_categoria: { type: String, ref: 'Categoria' },
    tag: { type: String },
    rssi: { type: String },
    antena: { type: String },
    bateria: { type: String },
    temperatura: { type: String },

    id_nivel_loc1: { type: String, ref: 'Localizacao' },
    id_nivel_loc2: { type: String, ref: 'Localizacao' },
    id_nivel_loc3: { type: String, ref: 'Localizacao' },
    id_nivel_loc4: { type: String, ref: 'Localizacao' },

    id_nivel_loc1_final: { type: String, ref: 'Localizacao' },
    id_nivel_loc2_final: { type: String, ref: 'Localizacao' },
    id_nivel_loc3_final: { type: String, ref: 'Localizacao' },
    id_nivel_loc4_final: { type: String, ref: 'Localizacao' },

    id_movimentacao: { type: String, ref: 'Movimentacao' },
    id_movimentacao_processo: { type: String, ref: 'Movimentacao_Processo' },

    alerta: { type: String },
    alerta_data: { type: Date },
    alerta_data_finalizada: { type: Date },

    id_colaborador_retirada: { type: String, ref: 'Colaborador' },
    id_registro_colaborador: { type: String, ref: 'RegistroColaborador' },

}, {
    versionKey: false,
    timestamps: true
});

module.exports = mongoose.model('Registro', RegistroSchema);
