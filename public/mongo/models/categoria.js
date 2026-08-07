const mongoose = require('mongoose');
const shortid = require('shortid');

const CategoriaSchema = new mongoose.Schema({
    _id: { type: String, default: shortid.generate },
    id_conta: { type: String, ref: 'Conta' },
    ativo: { type: Number, enum: [0, 1], default: 1 },
    descricao: { type: String },
    ean: { type: String },
   
    foto: { type: String },
    observacao: { type: String },
    labelInf1: { type: String },
    labelInf2: { type: String },
    labelInf3: { type: String },
    labelInf4: { type: String },
    labelInf5: { type: String },
    valor_labelInf1: { type: String },
    valor_labelInf2: { type: String },
    valor_labelInf3: { type: String },
    valor_labelInf4: { type: String },
    valor_labelInf5: { type: String },

    estoque_minimo: { type: Number, default: 0 },
    estoque_maximo: { type: Number, default: 0 },
    valor: { type: Number, default: 0 },

    id_nivel_cat1: { type: String, ref: 'CategoriaItem' },
    id_nivel_cat2: { type: String, ref: 'CategoriaItem' },
    id_nivel_cat3: { type: String, ref: 'CategoriaItem' },
    id_nivel_cat41: { type: String, ref: 'CategoriaItem' },
    
    id_nivel_loc1: { type: String, ref: 'Localizacao' },
    id_nivel_loc2: { type: String, ref: 'Localizacao' },
    id_nivel_loc3: { type: String, ref: 'Localizacao' },
    id_nivel_loc4: { type: String, ref: 'Localizacao' },

}, {
    versionKey: false
});

module.exports = mongoose.model('Categoria', CategoriaSchema);


