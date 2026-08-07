const mongoose = require('mongoose');
const shortid = require('shortid');

const AssociacaoRegistroSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    id_registro: { type: String, ref: 'Registro' },
    id_colaborador: { type: String, ref: 'Colaborador' },
    id_gateway: { type: String, ref: 'Gateway' },
  
    id_item: { type: String, ref: 'Item' },
    id_categoria: { type: String, ref: 'Categoria' },
    tag: { type: String },
    rssi: { type: String },
    data_registro: { type: Date },

    quantidade_esperada: { type: Number },
    quantidade_encontrada: { type: Number },
    status: { type: String },

    associados: [{
        _id: { type: String, default: shortid.generate },
        id_registro: { type: String, ref: 'Registro' },
        id_item: { type: String, ref: 'Item' },
        id_categoria: { type: String, ref: 'Categoria' },
        quantidade: { type: Number },
        tag: { type: String },
        rssi: { type: String },
        data_leitura: { type: Date }
    }],

}, {
    versionKey: false,
    timestamps: true
});

module.exports = mongoose.model('AssociacaoRegistro', AssociacaoRegistroSchema);
