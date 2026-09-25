const express = require('express');
const OpenAI = require('openai');
const crypto = require('crypto');

const Conta = require('../models/conta');
const Categoria = require('../models/categoria');
const CategoriaItem = require('../models/categoria_item');
const Item = require('../models/item');
const Localizacao = require('../models/localizacao');
const Gateway = require('../models/gateway');
const Processos = require('../models/processos');
const Registro = require('../models/registro');
const Colaborador = require('../models/colaborador');
const Funcao = require('../models/funcao');
const Posicao = require('../models/posicao');


const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const sessionStore = new Map();
const MAX_HISTORY = 20;

function makeSessionId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function getSession(sessionId, idConta) {
  const finalSessionId = sessionId || makeSessionId();
  if (!sessionStore.has(finalSessionId)) {
    sessionStore.set(finalSessionId, {
      id: finalSessionId,
      id_conta: idConta,
      intent: null,
      entity: null,
      operation: null,
      awaiting_confirmation: false,
      draft_payload: null,
      collected_data: {},
      updatedAt: new Date()
    });
  }

  const session = sessionStore.get(finalSessionId);
  if (idConta) session.id_conta = idConta;
  session.updatedAt = new Date();
  return session;
}

function sanitizeText(value) {
  if (value == null) return '';
  return String(value).trim();
}

function parseJsonSafe(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function summarizeDocs(docs, mapFn) {
  return docs.map(mapFn);
}

async function loadAccountOverview(id_conta) {
  const [
    conta,
    totalCategorias,
    totalCategoriasItem,
    totalItens,
    totalLocalizacoes,
    totalGateways,
    totalProcessos,
    totalRegistros24h
  ] = await Promise.all([
    Conta.findById(id_conta).lean(),
    Categoria.countDocuments({ id_conta }),
    CategoriaItem.countDocuments({ id_conta }),
    Item.countDocuments({ id_conta }),
    Localizacao.countDocuments({ id_conta }),
    Gateway.countDocuments({ id_conta }),
    Processos.countDocuments({ id_conta }),
    Registro.countDocuments({ id_conta, data_registro: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
  ]);

  return {
    conta: conta ? {
      _id: conta._id,
      nome: conta.nome,
      apelido: conta.apelido,
      cidade: conta.cidade,
      estado: conta.estado,
      ativo: conta.ativo
    } : null,
    metricas: {
      categorias: totalCategorias,
      categorias_item: totalCategoriasItem,
      itens: totalItens,
      localizacoes: totalLocalizacoes,
      gateways: totalGateways,
      processos: totalProcessos,
      registros_ultimas_24h: totalRegistros24h
    }
  };
}

function buildSystemPrompt(session, overview) {
  return `
Você é o Assistente Inteligente de Implantação do Seal RTI.

Seu objetivo é entender a necessidade operacional do usuário e conduzir o cadastro correto das estruturas do sistema.

Você atua como um especialista em implantação logística e rastreamento RFID.

━━━━━━━━━━━━━━━━━━━━━━━━
🌐 REGRA GLOBAL DE MULTIEMPRESA
━━━━━━━━━━━━━━━━━━━━━━━━

- A conta atual é: ${session.id_conta}
- Toda consulta, validação e cadastro deve considerar obrigatoriamente o id_conta atual.
- Nunca utilizar registros de outra conta.
- Nunca cadastrar registros sem id_conta.
- Sempre validar vínculos dentro da mesma conta.

REGRA CRÍTICA DE NOMENCLATURA

Ao conversar com o usuário e ao escolher ferramentas, considere SEMPRE a nomenclatura do front-end.

Nomenclatura do usuário:
- SKU = registro da collection Item
- Item = registro da collection Categoria
- Categoria = registro da collection CategoriaItem
- Localização = registro da collection Localizacao
- Gateway = registro da collection Gateway

Regra obrigatória:
- Quando o usuário pedir para listar ou cadastrar Categorias, você deve usar exclusivamente as tools de CategoriaItem.
- Quando o usuário pedir para listar ou cadastrar Itens, você deve usar exclusivamente as tools de Categoria.
- Quando o usuário pedir para listar ou cadastrar SKUs, você deve usar exclusivamente as tools de Item.
- Nunca escolher tool pelo nome técnico da collection.
- Sempre escolher tool pelo significado no front-end.

Nunca mencionar nomes técnicos ao usuário, exceto em modo diagnóstico.

━━━━━━━━━━━━━━━━━━━━━━━━
🔗 RELACIONAMENTOS OPERACIONAIS
━━━━━━━━━━━━━━━━━━━━━━━━

- Um SKU deve obrigatoriamente possuir um Item principal.
- Um SKU pode possuir Categorias auxiliares.
- Um SKU pode possuir vínculo com níveis de Localização.
- Um Gateway pode possuir vínculo com níveis de Localização.
- Categorias podem possuir hierarquia.
- Localizações possuem hierarquia.

━━━━━━━━━━━━━━━━━━━━━━━━
🌳 HIERARQUIA DE LOCALIZAÇÕES
━━━━━━━━━━━━━━━━━━━━━━━━

- Cada Localização possui um campo _id próprio.
- O campo id_nivel recebe o _id da Localização pai.
- Localização raiz não possui id_nivel.
- Nunca inventar id_nivel.
- Sempre consultar antes de vincular.
- Hierarquia máxima: 4 níveis.

Fluxo obrigatório:

1 entender a nova localização
2 verificar se possui pai
3 consultar pai existente
4 usar _id do pai em id_nivel
5 mostrar resumo
6 somente cadastrar após confirmação

━━━━━━━━━━━━━━━━━━━━━━━━
📦 HIERARQUIA DE CATEGORIAS
━━━━━━━━━━━━━━━━━━━━━━━━

- Categorias também podem possuir estrutura hierárquica via id_nivel.
- Sempre validar pai antes de cadastrar.
- Nunca gerar id_nivel automaticamente.

━━━━━━━━━━━━━━━━━━━━━━━━
🧩 REGRAS DE CADASTRO POR ENTIDADE
━━━━━━━━━━━━━━━━━━━━━━━━

ITEM (front) / Categoria (banco)
- campo obrigatório: descricao

SKU (front) / Item (banco)
- campos obrigatórios:
  - descricao
  - id_categoria (Item principal)

CATEGORIA (front) / CategoriaItem (banco)
- campo obrigatório: descricao

LOCALIZAÇÃO
- campo obrigatório: descricao

GATEWAY
- campos obrigatórios:
  - descricao
  - modo (fixo | movel | fluxo)

━━━━━━━━━━━━━━━━━━━━━━━━
🛡️ REGRAS DE CONDUTA DO ASSISTENTE
━━━━━━━━━━━━━━━━━━━━━━━━

- Nunca inventar IDs
- Nunca assumir vínculos
- Sempre consultar antes de vincular
- Sempre mostrar resumo antes de cadastrar
- Se houver dúvida → perguntar
- Se houver duplicidade → avisar
- Se usuário quiser apenas entender → não cadastrar
- Seja humanizado, claro e operacional

━━━━━━━━━━━━━━━━━━━━━━━━
📊 VISÃO DA CONTA
━━━━━━━━━━━━━━━━━━━━━━━━
${JSON.stringify(overview, null, 2)}

━━━━━━━━━━━━━━━━━━━━━━━━
📌 ESTADO DA SESSÃO
━━━━━━━━━━━━━━━━━━━━━━━━
${JSON.stringify({
  session_id: session.id,
  intent: session.intent,
  entity: session.entity,
  operation: session.operation,
  awaiting_confirmation: session.awaiting_confirmation,
  draft_payload: session.draft_payload,
  collected_data: session.collected_data
}, null, 2)}

Sempre responda em português do Brasil.
`;
}

const tools = [
  {
    type: 'function',
    name: 'obter_visao_geral_conta',
    description: 'Retorna visão geral da conta atual com métricas de implantação.',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    type: 'function',
    name: 'listar_categorias',
    description: 'Lista categorias da conta, com busca opcional por descrição.',
    parameters: {
      type: 'object',
      properties: { termo: { type: 'string' } },
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'criar_categoria',
    description: 'Cria uma categoria na conta atual.',
    parameters: {
      type: 'object',
      properties: {
        descricao: { type: 'string' },
        observacao: { type: 'string' },
        ean: { type: 'string' }
      },
      required: ['descricao'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'listar_localizacoes',
    description: 'Lista localizações da conta com filtro opcional por descrição.',
    parameters: {
      type: 'object',
      properties: { termo: { type: 'string' } },
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "criar_localizacao",
    description: "Cria uma localização. Se for localização filha, o campo id_nivel deve receber o _id da localização pai.",
    parameters: {
      type: "object",
      properties: {
        id_conta: { type: "string", description: "ID da conta" },
        descricao: { type: "string", description: "Descrição da localização" },
        id_nivel: {
          type: ["string", "null"],
          description: "Se informado, representa o _id da localização pai"
        },
        observacao: { type: "string", description: "Observações da localização" },
        ativo: { type: "number", description: "0 ou 1", enum: [0, 1] }
      },
      required: ["id_conta", "descricao"],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'listar_itens',
    description: 'Lista itens da conta, com filtro opcional por descrição ou tag.',
    parameters: {
      type: 'object',
      properties: { termo: { type: 'string' } },
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'criar_item',
    description: 'Cria um item na conta atual.',
    parameters: {
      type: 'object',
      properties: {
        descricao: { type: 'string' },
        id_categoria: { type: 'string' },
        tag: { type: 'string' },
        tag_secundaria: { type: 'string' },
        status: { type: 'string', enum: ['ativo', 'inativo', 'manutencao', 'descartado', 'emtransporte'] },
        id_nivel_loc1: { type: 'string' },
        id_nivel_loc2: { type: 'string' },
        id_nivel_loc3: { type: 'string' },
        id_nivel_loc4: { type: 'string' },
        observacao: { type: 'string' }
      },
      required: ['descricao', 'id_categoria'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'listar_gateways',
    description: 'Lista gateways da conta.',
    parameters: {
      type: 'object',
      properties: { termo: { type: 'string' } },
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'criar_gateway',
    description: 'Cria um gateway na conta atual.',
    parameters: {
      type: 'object',
      properties: {
        descricao: { type: 'string' },
        modo: { type: 'string', enum: ['fixo', 'movel', 'fluxo'] },
        id_nivel_loc1: { type: 'string' },
        id_nivel_loc2: { type: 'string' },
        id_nivel_loc3: { type: 'string' },
        id_nivel_loc4: { type: 'string' },
        leitor: { type: 'string' },
        leitor_mac: { type: 'string' },
        watch_regra: { type: 'string' },
        watch_valor: { type: 'string' },
        observacao: { type: 'string' }
      },
      required: ['descricao', 'modo'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'listar_processos',
    description: 'Lista processos da conta.',
    parameters: {
      type: 'object',
      properties: { termo: { type: 'string' } },
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'criar_processo',
    description: 'Cria um processo operacional da conta atual.',
    parameters: {
      type: 'object',
      properties: {
        descricao: { type: 'string' },
        modo: { type: 'string' },
        acao_mov: { type: 'string' }
      },
      required: ['descricao'],
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'consultar_registros',
    description: 'Consulta registros recentes por período em horas, item ou tag.',
    parameters: {
      type: 'object',
      properties: {
        horas: { type: 'number' },
        id_item: { type: 'string' },
        tag: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'diagnosticar_implantacao',
    description: 'Mostra o que já existe e o que falta para operar a conta.',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  }
];

async function executeTool(name, args, session) {
  const id_conta = session.id_conta;
  if (!id_conta) {
    return { ok: false, error: 'id_conta ausente na sessão.' };
  }

  switch (name) {
    case 'obter_visao_geral_conta': {
      const overview = await loadAccountOverview(id_conta);
      return { ok: true, data: overview };
    }

    case 'listar_categorias': {
      const termo = sanitizeText(args.termo);
      const filter = { id_conta };
      if (termo) filter.descricao = { $regex: termo, $options: 'i' };
      const docs = await Categoria.find(filter).sort({ descricao: 1 }).limit(50).lean();
      return {
        ok: true,
        total: docs.length,
        data: summarizeDocs(docs, doc => ({ _id: doc._id, descricao: doc.descricao, ean: doc.ean || '', ativo: doc.ativo }))
      };
    }

    case 'criar_categoria': {
      const descricao = sanitizeText(args.descricao);
      if (!descricao) return { ok: false, error: 'descricao é obrigatória.' };

      const exists = await Categoria.findOne({ id_conta, descricao: new RegExp(`^${descricao}$`, 'i') }).lean();
      if (exists) return { ok: false, error: 'Já existe uma categoria com essa descrição.', data: exists };

      const doc = await Categoria.create({
        id_conta,
        descricao,
        observacao: sanitizeText(args.observacao),
        ean: sanitizeText(args.ean)
      });

      return { ok: true, data: { _id: doc._id, descricao: doc.descricao } };
    }

    case 'listar_localizacoes': {
      const termo = sanitizeText(args.termo);
      const filter = { id_conta };
      if (termo) filter.descricao = { $regex: termo, $options: 'i' };
      const docs = await Localizacao.find(filter).sort({ descricao: 1 }).limit(100).lean();
      return {
        ok: true,
        total: docs.length,
        data: summarizeDocs(docs, doc => ({ _id: doc._id, descricao: doc.descricao, tag: doc.tag || '', cidade: doc.cidade || '', estado: doc.estado || '' }))
      };
    }

    case 'criar_localizacao': {
      const descricao = sanitizeText(args.descricao);
      if (!descricao) return { ok: false, error: 'descricao é obrigatória.' };

      const exists = await Localizacao.findOne({ id_conta, descricao: new RegExp(`^${descricao}$`, 'i') }).lean();
      if (exists) return { ok: false, error: 'Já existe uma localização com essa descrição.', data: exists };

      if (args.id_nivel) {
        const pai = await Localizacao.findOne({
           _id: args.id_nivel,
           id_conta
        });
     
        if (!pai) {
           return { ok:false, error:'Localização pai não encontrada na conta atual' };
        }
     }

      const doc = await Localizacao.create({
        id_conta,
        descricao,
        id_nivel: args.id_nivel || null,
        tag: sanitizeText(args.tag),
        cidade: sanitizeText(args.cidade),
        estado: sanitizeText(args.estado),
        observacao: sanitizeText(args.observacao)
     });

      return { ok: true, data: { _id: doc._id, descricao: doc.descricao } };
    }

    case 'listar_itens': {
      const termo = sanitizeText(args.termo);
      const filter = { id_conta };
      if (termo) {
        filter.$or = [
          { descricao: { $regex: termo, $options: 'i' } },
          { tag: { $regex: termo, $options: 'i' } }
        ];
      }
      const docs = await Item.find(filter).sort({ descricao: 1 }).limit(100).lean();
      return {
        ok: true,
        total: docs.length,
        data: summarizeDocs(docs, doc => ({
          _id: doc._id,
          descricao: doc.descricao,
          tag: doc.tag || '',
          id_categoria: doc.id_categoria || '',
          status: doc.status || 'ativo'
        }))
      };
    }

    case 'criar_item': {
      const descricao = sanitizeText(args.descricao);
      const id_categoria = sanitizeText(args.id_categoria);
      if (!descricao || !id_categoria) {
        return { ok: false, error: 'descricao e id_categoria são obrigatórios.' };
      }

      const categoria = await Categoria.findOne({ _id: id_categoria, id_conta }).lean();
      if (!categoria) return { ok: false, error: 'Categoria não encontrada para a conta atual.' };

      const tag = sanitizeText(args.tag);
      if (tag) {
        const tagExists = await Item.findOne({ id_conta, tag }).lean();
        if (tagExists) return { ok: false, error: 'Já existe um item com esta tag.', data: tagExists };
      }

      const locIds = ['id_nivel_loc1', 'id_nivel_loc2', 'id_nivel_loc3', 'id_nivel_loc4']
        .map(key => sanitizeText(args[key]))
        .filter(Boolean);

      if (locIds.length) {
        const countLocs = await Localizacao.countDocuments({ _id: { $in: locIds }, id_conta });
        if (countLocs !== locIds.length) {
          return { ok: false, error: 'Uma ou mais localizações informadas não pertencem à conta atual.' };
        }
      }

      const doc = await Item.create({
        id_conta,
        descricao,
        id_categoria,
        tag,
        tag_secundaria: sanitizeText(args.tag_secundaria),
        status: sanitizeText(args.status) || 'ativo',
        id_nivel_loc1: sanitizeText(args.id_nivel_loc1),
        id_nivel_loc2: sanitizeText(args.id_nivel_loc2),
        id_nivel_loc3: sanitizeText(args.id_nivel_loc3),
        id_nivel_loc4: sanitizeText(args.id_nivel_loc4),
        observacao: sanitizeText(args.observacao)
      });

      return {
        ok: true,
        data: {
          _id: doc._id,
          descricao: doc.descricao,
          tag: doc.tag || '',
          id_categoria: doc.id_categoria,
          status: doc.status
        }
      };
    }

    case 'listar_gateways': {
      const termo = sanitizeText(args.termo);
      const filter = { id_conta };
      if (termo) filter.descricao = { $regex: termo, $options: 'i' };
      const docs = await Gateway.find(filter).sort({ descricao: 1 }).limit(100).lean();
      return {
        ok: true,
        total: docs.length,
        data: summarizeDocs(docs, doc => ({ _id: doc._id, descricao: doc.descricao, modo: doc.modo, leitor: doc.leitor || '' }))
      };
    }

    case 'criar_gateway': {
      const descricao = sanitizeText(args.descricao);
      const modo = sanitizeText(args.modo);
      if (!descricao || !modo) return { ok: false, error: 'descricao e modo são obrigatórios.' };

      const exists = await Gateway.findOne({ id_conta, descricao: new RegExp(`^${descricao}$`, 'i') }).lean();
      if (exists) return { ok: false, error: 'Já existe um gateway com essa descrição.', data: exists };

      const doc = await Gateway.create({
        id_conta,
        descricao,
        modo,
        id_nivel_loc1: sanitizeText(args.id_nivel_loc1),
        id_nivel_loc2: sanitizeText(args.id_nivel_loc2),
        id_nivel_loc3: sanitizeText(args.id_nivel_loc3),
        id_nivel_loc4: sanitizeText(args.id_nivel_loc4),
        leitor: sanitizeText(args.leitor),
        leitor_mac: sanitizeText(args.leitor_mac),
        watch_regra: sanitizeText(args.watch_regra),
        watch_valor: sanitizeText(args.watch_valor)
      });

      return { ok: true, data: { _id: doc._id, descricao: doc.descricao, modo: doc.modo } };
    }

    case 'listar_processos': {
      const termo = sanitizeText(args.termo);
      const filter = { id_conta };
      if (termo) filter.descricao = { $regex: termo, $options: 'i' };
      const docs = await Processos.find(filter).sort({ descricao: 1 }).limit(100).lean();
      return {
        ok: true,
        total: docs.length,
        data: summarizeDocs(docs, doc => ({ _id: doc._id, descricao: doc.descricao, modo: doc.modo || '', acao_mov: doc.acao_mov || '' }))
      };
    }

    case 'criar_processo': {
      const descricao = sanitizeText(args.descricao);
      if (!descricao) return { ok: false, error: 'descricao é obrigatória.' };

      const exists = await Processos.findOne({ id_conta, descricao: new RegExp(`^${descricao}$`, 'i') }).lean();
      if (exists) return { ok: false, error: 'Já existe um processo com essa descrição.', data: exists };

      const doc = await Processos.create({
        id_conta,
        descricao,
        modo: sanitizeText(args.modo),
        acao_mov: sanitizeText(args.acao_mov)
      });

      return { ok: true, data: { _id: doc._id, descricao: doc.descricao, modo: doc.modo || '', acao_mov: doc.acao_mov || '' } };
    }

    case 'consultar_registros': {
      const horas = Number(args.horas || 24);
      const filter = {
        id_conta,
        data_registro: { $gte: new Date(Date.now() - horas * 60 * 60 * 1000) }
      };
      if (sanitizeText(args.id_item)) filter.id_item = sanitizeText(args.id_item);
      if (sanitizeText(args.tag)) filter.tag = sanitizeText(args.tag);

      const docs = await Registro.find(filter).sort({ data_registro: -1 }).limit(100).lean();
      return {
        ok: true,
        total: docs.length,
        data: summarizeDocs(docs, doc => ({
          _id: doc._id,
          id_item: doc.id_item || '',
          tag: doc.tag || '',
          status: doc.status || 'neutro',
          id_gateway: doc.id_gateway || '',
          data_registro: doc.data_registro
        }))
      };
    }

    case 'diagnosticar_implantacao': {
      const overview = await loadAccountOverview(id_conta);
      const faltantes = [];
      if (!overview.metricas.localizacoes) faltantes.push('Cadastrar ao menos uma localização');
      if (!overview.metricas.categorias) faltantes.push('Cadastrar ao menos uma categoria');
      if (!overview.metricas.itens) faltantes.push('Cadastrar itens rastreáveis');
      if (!overview.metricas.gateways) faltantes.push('Cadastrar ao menos um gateway');
      if (!overview.metricas.processos) faltantes.push('Cadastrar ao menos um processo operacional');

      return {
        ok: true,
        data: {
          overview,
          prontidao_operacional: faltantes.length === 0 ? 'estrutura mínima pronta' : 'estrutura incompleta',
          faltantes
        }
      };
    }

    default:
      return { ok: false, error: `Tool não implementada: ${name}` };
  }
}

async function runAgentLoop({ input, session, overview }) {
  let response = await openai.responses.create({
    model: 'gpt-5.4',
    input,
    tools,
    temperature: 0.2,
    instructions: buildSystemPrompt(session, overview)
  });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const outputs = [];
    const items = Array.isArray(response.output) ? response.output : [];
    const toolCalls = items.filter(item => item.type === 'function_call');

    if (!toolCalls.length) return response;

    for (const call of toolCalls) {
      const args = parseJsonSafe(call.arguments, {});
      const result = await executeTool(call.name, args, session);
      outputs.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(result)
      });
    }

    response = await openai.responses.create({
      model: 'gpt-5.4',
      previous_response_id: response.id,
      input: outputs,
      tools,
      temperature: 0.2,
      instructions: buildSystemPrompt(session, overview)
    });
  }

  return response;
}

function extractText(response) {
  if (response.output_text) return response.output_text;
  const items = Array.isArray(response.output) ? response.output : [];
  const texts = [];
  for (const item of items) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const content of item.content) {
        if (content.type === 'output_text' && content.text) texts.push(content.text);
      }
    }
  }
  return texts.join('\n').trim();
}
module.exports = (app, dbConnection) => {
app.post('/ia/chat', async (req, res) => {
  try {
    const { message, history = [], id_conta, session_id } = req.body || {};

    // if (!process.env.OPENAI_API_KEY) {
    //   return res.status(500).json({ error: 'OPENAI_API_KEY não configurada no servidor.' });
    // }

    if (!id_conta) {
      return res.status(400).json({ error: 'id_conta é obrigatório para utilizar o assistente.' });
    }

    if (!sanitizeText(message)) {
      return res.status(400).json({ error: 'message é obrigatória.' });
    }

    const conta = await Conta.findById(id_conta).lean();
    if (!conta) {
      return res.status(404).json({ error: 'Conta não encontrada.' });
    }

    const session = getSession(session_id, id_conta);
    const overview = await loadAccountOverview(id_conta);

    const normalizedHistory = Array.isArray(history)
      ? history.slice(-MAX_HISTORY).map(h => ({
          role: h.role === 'assistant' ? 'assistant' : 'user',
          content: sanitizeText(h.content)
        })).filter(h => h.content)
      : [];

    const input = [
      ...normalizedHistory,
      { role: 'user', content: sanitizeText(message) }
    ];

    const response = await runAgentLoop({ input, session, overview });
    const reply = extractText(response) || 'Consegui processar sua solicitação, mas não consegui montar uma resposta textual adequada.';

    res.json({
      ok: true,
      reply,
      meta: {
        session_id: session.id,
        action: session.operation || null,
        intent: session.intent || null,
        entity: session.entity || null,
        awaiting_confirmation: !!session.awaiting_confirmation
      }
    });
  } catch (error) {
    console.error('Erro em /ia/chat:', error);
    res.status(500).json({
      ok: false,
      error: 'Falha ao processar a solicitação do assistente.',
      details: error && error.message ? error.message : 'erro interno'
    });
  }
});

}

