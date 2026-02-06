const mongoose = require('mongoose');
const shortid = require('shortid');

const AssociacaoSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    id_colaborador: { type: String, ref: 'Colaborador' },

    id_item: { type: String, ref: 'Item' },
    id_categoria: { type: String, ref: 'Categoria' },
    ativo: { type: String },
    descricao: { type: String },

    intervalo: { type: Number },
    range_rssi: { type: Number },
    cond_presenca: { type: String, enum: ['todos', 'qualquer'], default: 'todos' },

    associados: [{
        _id: { type: String, default: shortid.generate },
        id_item: { type: String, ref: 'Item' },
        id_categoria: { type: String, ref: 'Categoria' },
        quantidade: { type: Number },
    }],

}, {
    versionKey: false,
    timestamps: true
});

module.exports = mongoose.model('Associacao', AssociacaoSchema);
