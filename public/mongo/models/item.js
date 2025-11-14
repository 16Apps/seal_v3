const mongoose = require('mongoose');
const shortid = require('shortid');

const ItemSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    id_categoria: { type: String, ref: 'Categoria' },
    id_externo: { type: String },
    status: { type: String, enum: ['ativo', 'inativo', 'manutencao', 'descartado', 'emtransporte', 'perca'], default: 'ativo' },
    foto: { type: String },
    tag: { type: String },
    tag_secundaria: { type: String },
    descricao: { type: String },
    inf_compl1: { type: String },
    inf_compl2: { type: String },
    inf_compl3: { type: String },
    inf_compl4: { type: String },
    inf_compl5: { type: String },
    id_nivel_loc1: { type: String, ref: 'Localizacao' },
    id_nivel_loc2: { type: String, ref: 'Localizacao' },
    id_nivel_loc3: { type: String, ref: 'Localizacao' },
    id_nivel_loc4: { type: String, ref: 'Localizacao' },
    observacao: { type: String },
    registro_atual: { type: Object },
    registro_anterior: { type: Object },
    registro_mov: { type: Object },

    mov_livre:  { type: Number, enum: [0, 1], default: 1 },
    mov_acao: { type: String },
    mov_colaborador: { type: String , ref: 'Colaborador' },
    mov_local: { type: String , ref: 'Localizacao' },
    mov_data_hora: { type: Date },

}, {
    versionKey: false,
    timestamps: true
});

module.exports = mongoose.model('Item', ItemSchema);
