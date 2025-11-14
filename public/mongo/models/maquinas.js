const mongoose = require('mongoose');
const shortid = require('shortid');

const MaquinasSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    descricao: { type: String },
    ativo: { type: Number, enum: [0, 1], default: 1 },
    foto: { type: String },
    finalidade: { type: String },
    propriedade: { type: String },
    identificador: { type: String },
    terceiro: { type: String },
    valor_hora: { type: Number },
}, {
    versionKey: false
});

module.exports = mongoose.model('Maquinas', MaquinasSchema);
