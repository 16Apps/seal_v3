const mongoose = require('mongoose');
const shortid = require('shortid');

const SrCategoriasSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    titulo: { type: String, required: true },
    descricao: { type: String, required: true },
    icone: { type: String, required: true },
}, {
    versionKey: false,
    timestamps: true
});

module.exports = mongoose.model('SrCategorias', SrCategoriasSchema);