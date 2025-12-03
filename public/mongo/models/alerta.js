const mongoose = require('mongoose');
const shortid = require('shortid');

const AlertaSchema = new mongoose.Schema({
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

    acoes: [{
        _id: { type: String, default: shortid.generate },
        acao: { type: String },
        nivel: { type: String },
        referencia: [{
            valor: { type: String },
            id_item: { type: String, ref: 'Item' },
            id_categoria: { type: String, ref: 'Categoria' },
        }]
    }],

}, {
    versionKey: false,
    timestamps: true
});

module.exports = mongoose.model('Alerta', AlertaSchema);
