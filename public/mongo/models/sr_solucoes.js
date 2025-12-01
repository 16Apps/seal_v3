const mongoose = require('mongoose');
const shortid = require('shortid');


const SrSolucoesSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_categoria: { type: String, ref: 'SrCategorias' },
    titulo: { type: String, required: true },
    descricao: { type: String, required: true },
    link: { type: String, required: true },
    icone: { type: String, required: true },
    banner: { type: String, required: true },
    imagens: [{
        _id: { type: String, default: shortid.generate },
        acao: { type: String }
    }],
    videos: [{
        _id: { type: String, default: shortid.generate },
        url: { type: String }
    }],
}, {
    versionKey: false,
    timestamps: true
});

module.exports = mongoose.model('SrSolucoes', SrSolucoesSchema);