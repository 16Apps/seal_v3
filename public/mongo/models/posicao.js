const mongoose = require('mongoose');
const shortid = require('shortid');

const PosicaoSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    id_colaborador: { type: String, ref: 'Colaborador' },

    ativo: { type: String },
    id_doc: { type: String },
    descricao: { type: String },
    icone: { type: String },

    partida_data: { type: Date },
    tolerancia: { type: Number },

    previsao_chegada_data: { type: Date },
    previsao_chegada_tolerancia: { type: Number },

    status: { type: String },
    status_data: { type: Date },

    id_nivel_loc1: { type: String, ref: 'Localizacao' },
    id_nivel_loc2: { type: String, ref: 'Localizacao' },
    id_nivel_loc3: { type: String, ref: 'Localizacao' },
    id_nivel_loc4: { type: String, ref: 'Localizacao' },

    itens: [{
        _id: { type: String, default: shortid.generate },
        id_item: { type: String, ref: 'Item' },
        id_categoria: { type: String, ref: 'Categoria' },
        quantidade: { type: Number },
        status: { type: String },
        status_data: { type: Date },
        id_gatweway: { type: String, ref: 'Gateway' },
        id_colaborador: { type: String, ref: 'Colaborador' },
    }],

    id_nivel_loc1_destino: { type: String, ref: 'Localizacao' },
    id_nivel_loc2_destino: { type: String, ref: 'Localizacao' },
    id_nivel_loc3_destino: { type: String, ref: 'Localizacao' },
    id_nivel_loc4_destino: { type: String, ref: 'Localizacao' },

    // caso tenha mais um processo, replica do registro com nivel_destino como origem

}, {
    versionKey: false,
    timestamps: true
});

module.exports = mongoose.model('Posicao', PosicaoSchema);
