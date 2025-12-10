const mongoose = require('mongoose');
const shortid = require('shortid');

const CategoriaItemSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_nivel: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    ativo: { type: Number, enum: [0, 1], default: 1 },
    descricao: { type: String },
    foto: { type: String },
    

    codif_epc: { type: String },
    codif_epc_inicial: { type: String },
    codif_epc_comprimento: { type: String },
    tag: { type: String },
    
    observacao: { type: String },
}, {
    versionKey: false
});



module.exports = mongoose.model('CategoriaItem', CategoriaItemSchema);
