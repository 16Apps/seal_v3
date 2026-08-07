const mongoose = require('mongoose');
const shortid = require('shortid');

const AlertaSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    id_colaborador: { type: String, ref: 'Colaborador' },

    ativo: { type: Number, enum: [0, 1], default: 1 },
    descricao: { type: String },
    icone: { type: String },

    id_nivel_loc1: { type: String, ref: 'Localizacao' },
    id_nivel_loc2: { type: String, ref: 'Localizacao' },
    id_nivel_loc3: { type: String, ref: 'Localizacao' },
    id_nivel_loc4: { type: String, ref: 'Localizacao' },

    acoes: [{
        _id: { type: String, default: shortid.generate },
        acao: { type: String, enum: ['aproximar', 'distanciar', 'sair', 'itens_fixo', 'tol_max', 'tol_min'] },
        nivel: { type: String, enum: ['leve', 'importante', 'critico'] },
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

