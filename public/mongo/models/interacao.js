const mongoose = require('mongoose');
const shortid = require('shortid');

const InteracaoSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    id_colaborador: { type: String, ref: 'Colaborador' },

    ativo: { type: String },
    descricao: { type: String },
    icone: { type: String },

    id_nivel_loc1: { type: String, ref: 'Localizacao' },
    id_nivel_loc2: { type: String, ref: 'Localizacao' },
    id_nivel_loc3: { type: String, ref: 'Localizacao' },
    id_nivel_loc4: { type: String, ref: 'Localizacao' },

    enviar_email: { type: Number },
    enviar_whats: { type: Number },

    acoes: [{
        _id: { type: String, default: shortid.generate },
        movimento: { type: String },
        equipamento: { type: String },
        serial: { type: String },
        acao: { type: String },
        comando: { type: String }
    }],

}, {
    versionKey: false,
    timestamps: true
});

module.exports = mongoose.model('Interacao', InteracaoSchema);
