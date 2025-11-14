const mongoose = require('mongoose');
const shortid = require('shortid');

const EquipamentoSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    descricao: { type: String },
    ativo: { type: Number, enum: [0, 1], default: 1 },
    foto: { type: String },
    modelo: { type: String },
    serial: { type: String },
    identificador: { type: String },
    metodo_comunicacao: { type: String },
    metodo_comunicacao_url: { type: String },
}, {
    versionKey: false,
    timestamps: true
});

module.exports = mongoose.model('Equipamento', EquipamentoSchema);
