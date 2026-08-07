const OpenAI = require('openai');
const crypto = require('crypto');

const Conta = require('../models/conta');
const Categoria = require('../models/categoria'); // Item no front
const CategoriaItem = require('../models/categoria_item'); // Categoria no front
const Item = require('../models/item'); // SKU no front
const Localizacao = require('../models/localizacao');
const Gateway = require('../models/gateway');
const Posicao = require('../models/posicao');
const Alerta = require('../models/alerta');
const Colaborador = require('../models/colaborador');
const Interacao = require('../models/interacao');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

module.exports = (app) => {
  const sessionStore = new Map();
  const MAX_HISTORY = 20;

  function makeSessionId() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString('hex');
  }

  function getSession(sessionId, idConta) {
    const finalSessionId = sessionId || makeSessionId();

    if (!sessionStore.has(finalSessionId)) {
      sessionStore.set(finalSessionId, {
        id: finalSessionId,
        id_conta: idConta,
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

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function summarizeDocs(docs, mapFn) {
    return docs.map(mapFn);
  }

  async function loadAccountOverview(id_conta) {
    const [
      conta,
      totalItensFront,
      totalCategoriasFront,
      totalSkus,
      totalLocalizacoes,
      totalGateways,
      totalPosicoes,  
      totalAlertas,
      totalInteracoes,
    ] = await Promise.all([
      Conta.findById(id_conta).lean(),
      Categoria.countDocuments({ id_conta }),
      CategoriaItem.countDocuments({ id_conta }),
      Item.countDocuments({ id_conta }),
      Localizacao.countDocuments({ id_conta }),
      Gateway.countDocuments({ id_conta }),
      Posicao.countDocuments({ id_conta }),
      Alerta.countDocuments({ id_conta }),
      Interacao.countDocuments({ id_conta })
    ]);

    return {
      conta: conta
        ? {
          _id: conta._id,
          nome: conta.nome,
          apelido: conta.apelido,
          cidade: conta.cidade,
          estado: conta.estado,
          ativo: conta.ativo
        }
        : null,
      metricas: {
        itens_front: totalItensFront,
        categorias_front: totalCategoriasFront,
        skus: totalSkus,
        localizacoes: totalLocalizacoes,
        gateways: totalGateways,
        posicoes: totalPosicoes,
        alertas: totalAlertas,
        interacoes: totalInteracoes
      }
    };
  }

  function buildSystemPrompt(session, overview) {
    return `
Você é o Assistente de Implantação do Seal RTI.

Seu objetivo é compreender a necessidade do usuário, orientar a implantação, consultar dados e preparar ou executar cadastros com segurança.

━━━━━━━━━━━━━━━━━━━━━━━━
REGRA GLOBAL DE MULTIEMPRESA
━━━━━━━━━━━━━━━━━━━━━━━━

- A conta atual é: ${session.id_conta}
- Toda consulta, validação, edição e cadastro deve considerar obrigatoriamente o id_conta atual.
- Nunca utilizar registros de outra conta.
- Nunca cadastrar registros sem id_conta.
- Sempre validar vínculos dentro da mesma conta.

━━━━━━━━━━━━━━━━━━━━━━━━
NOMENCLATURA DO FRONT-END
━━━━━━━━━━━━━━━━━━━━━━━━

Ao conversar com o usuário, use esta nomenclatura:

- SKU = ativo individual rastreável
- Item = tipo principal do SKU
- Categoria = classificação auxiliar do Item
- Localização = estrutura física operacional
- Gateway = ponto de leitura RFID ou fluxo
- Posição = processo/log de deslocamento entre origem e destino com SKU ou Item vinculados
- Alerta = regra operacional monitorada por localização e ações de evento
- Interação = regra de automação acionada por movimento, equipamento e comando

━━━━━━━━━━━━━━━━━━━━━━━━
MAPEAMENTO TÉCNICO OBRIGATÓRIO
━━━━━━━━━━━━━━━━━━━━━━━━

- SKU no front corresponde à collection Item
- Item no front corresponde à collection Categoria
- Categoria no front corresponde à collection CategoriaItem
- Endereço no front corresponde à collection Localizacao
- Coletor no front corresponde à collection Gateway
- Alerta no front corresponde à collection Alerta

Regras obrigatórias:
- Quando o usuário pedir para listar, criar ou editar SKUs, use somente as tools de Item.
- Quando o usuário pedir para listar, criar ou editar Itens, use somente as tools de Categoria.
- Quando o usuário pedir para listar, criar ou editar Categorias, use somente as tools de CategoriaItem.
- Quando o usuário pedir para listar, criar ou editar Coletores, use somente as tools de Gateway.
- Quando o usuário pedir para listar, criar ou editar Endereços, use somente as tools de Localizacao.
- Nunca decidir pela collection com base no nome técnico.
- Sempre decidir com base no significado do front-end.

━━━━━━━━━━━━━━━━━━━━━━━━
RELACIONAMENTOS OPERACIONAIS
━━━━━━━━━━━━━━━━━━━━━━━━

- Um SKU deve possuir um Item principal.
- Um SKU pode possuir vínculo com níveis de Localização.
- Um Gateway pode possuir vínculo com níveis de Localização.
- Categorias podem possuir hierarquia.
- Localizações possuem hierarquia.


━━━━━━━━━━━━━━━━━━━━━━━━
HIERARQUIA DE LOCALIZAÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━

- Cada Localização possui seu próprio _id.
- O campo id_nivel guarda o _id da Localização pai.
- id_nivel NÃO representa o número do nível.
- Se a Localização for raiz, id_nivel deve ser null, vazio ou não informado.
- Se a Localização for filha, id_nivel deve receber exatamente o _id do pai.
- Nunca inventar ids.
- Sempre consultar a Localização pai antes de criar ou editar.
- Sempre validar a Localização pai dentro da mesma conta.
- Não permitir que uma Localização seja pai dela mesma.
- Se houver mais de uma opção de pai, pedir confirmação.
- Sempre mostrar resumo antes de cadastrar ou editar.

━━━━━━━━━━━━━━━━━━━━━━━━
HIERARQUIA DE CATEGORIA
━━━━━━━━━━━━━━━━━━━━━━━━

- Categoria no front corresponde à collection CategoriaItem.
- Categoria pode possuir pai por meio do campo id_nivel.
- Se for raiz, id_nivel deve ser null, vazio ou não informado.
- Se for filha, id_nivel deve receber o _id da Categoria pai.
- Nunca inventar ids.
- Sempre validar a Categoria pai dentro da mesma conta.
- Não permitir que uma Categoria seja pai dela mesma.

━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS DE CONDUTA
━━━━━━━━━━━━━━━━━━━━━━━━

- Nunca invente IDs.
- Nunca assuma que um cadastro existe sem consultar.
- Antes de criar ou editar qualquer registro, colete os campos necessários.
- Antes de gravar, mostre um resumo objetivo.
- Só execute criação ou edição quando o usuário deixar claro que deseja confirmar.
- Se existirem opções parecidas, liste e peça confirmação.
- Se o usuário quiser apenas consultar ou entender, não tente cadastrar.
- Seja objetivo, humanizado e operacional.
- Uma Posição pode possuir origem e destino.
- Uma Posição pode possuir múltiplos itens.
- Cada item da Posição pode referenciar um SKU por id_item.
- Antes de criar ou editar uma Posição, sempre validar Localizações e itens dentro da mesma conta.
- Um Alerta pertence sempre à conta atual.
- Um Alerta pode estar vinculado a níveis de Localização.
- Um Alerta possui uma ou mais ações.
- Cada ação pode possuir referências por SKU (Item) e por Item principal (Categoria).
- Antes de criar ou editar um Alerta, validar localização, SKU e Item principal dentro da mesma conta.
- Nunca inventar ids.
- Se houver dúvida sobre a ação, listar as opções válidas.
- Uma Interação pertence à conta atual.
- Uma Interação pode estar vinculada a níveis de Localização.
- Uma Interação pode disparar e-mail e WhatsApp.
- Uma Interação possui uma ou mais ações.
- Cada ação define movimento, equipamento, ação e comando.
- Antes de criar ou editar uma Interação, validar Localizações e Colaborador dentro da mesma conta.
- Nunca inventar ids.

━━━━━━━━━━━━━━━━━━━━━━━━
CAMPOS OBRIGATÓRIOS
━━━━━━━━━━━━━━━━━━━━━━━━

- Item (front) / Categoria (banco): descricao
- Categoria (front) / CategoriaItem (banco): descricao
- SKU (front) / Item (banco): tag, id_categoria
- Localização: descricao
- Gateway: descricao, modo
- Posição: id_doc, id_nivel_loc1
- Alerta: descricao, id_nivel_loc1, acoes
- Interação: descricao, id_nivel_loc1, acoes
Para Interação, id_colaborador é opcional.
Só deve ser informado quando houver necessidade de vínculo com um colaborador específico.
━━━━━━━━━━━━━━━━━━━━━━━━
CAMPOS OPCIONAIS SKU
━━━━━━━━━━━━━━━━━━━━━━━━
- Para SKU, descricao é opcional.
- Nunca solicitar descricao como campo obrigatório.
- Se tag e id_categoria estiverem informados, já é possível executar o cadastro.
- Se status não for informado, assumir "ativo".


CONSULTAS ANALÍTICAS DE SKU

- Quando o usuário perguntar sobre quantidade, distribuição, maior volume, menor volume, percentual, concentração ou comparação de SKUs por endereço, Item ou Categoria, trate como consulta analítica.
- Nessas situações, não usar tools de cadastro.
- Priorizar consultas sobre a collection Item, pois SKU no front corresponde à collection Item.
- Quando houver referência a Item, considerar item.id_categoria.
- Quando houver referência a Categoria, considerar item.id_categoria_reg1, se disponível no banco.
- Sempre responder com quantidades absolutas e percentuais quando possível.


━━━━━━━━━━━━━━━━━━━━━━━━
VISÃO DA CONTA
━━━━━━━━━━━━━━━━━━━━━━━━
${JSON.stringify(overview, null, 2)}

Sempre responda em português do Brasil.
`.trim();
  }

  const tools = [
    {
      type: 'function',
      name: 'obter_visao_geral_conta',
      description: 'Retorna visão geral da conta atual com métricas principais.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    },

    {
      type: 'function',
      name: 'listar_itens_front',
      description:
        'Lista Itens do front-end. Item no front corresponde à collection Categoria.',
      parameters: {
        type: 'object',
        properties: {
          termo: { type: 'string' }
        },
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'criar_item_front',
      description:
        'Cria um Item do front-end. Item no front corresponde à collection Categoria.',
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
      name: 'editar_item_front',
      description:
        'Edita um Item do front-end. Item no front corresponde à collection Categoria.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          descricao: { type: 'string' },
          observacao: { type: 'string' },
          ean: { type: 'string' },
          ativo: { type: 'number', enum: [0, 1] }
        },
        required: ['id'],
        additionalProperties: false
      }
    },

    {
      type: 'function',
      name: 'listar_categorias_front',
      description:
        'Lista Categorias do front-end. Categoria no front corresponde à collection CategoriaItem.',
      parameters: {
        type: 'object',
        properties: {
          termo: { type: 'string' }
        },
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'criar_categoria_front',
      description:
        'Cria uma Categoria do front-end. Categoria no front corresponde à collection CategoriaItem.',
      parameters: {
        type: 'object',
        properties: {
          descricao: { type: 'string' },
          id_nivel: { type: ['string', 'null'] },
          observacao: { type: 'string' }
        },
        required: ['descricao'],
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'editar_categoria_front',
      description:
        'Edita uma Categoria do front-end. Categoria no front corresponde à collection CategoriaItem.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          descricao: { type: 'string' },
          id_nivel: { type: ['string', 'null'] },
          observacao: { type: 'string' },
          ativo: { type: 'number', enum: [0, 1] }
        },
        required: ['id'],
        additionalProperties: false
      }
    },

    {
      type: 'function',
      name: 'listar_skus',
      description:
        'Lista SKUs do front-end. SKU no front corresponde à collection Item.',
      parameters: {
        type: 'object',
        properties: {
          termo: { type: 'string' }
        },
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'criar_sku',
      description:
        'Cria um SKU do front-end. SKU no front corresponde à collection Item.',
      parameters: {
        type: 'object',
        properties: {
          descricao: { type: 'string' },
          id_categoria: {
            type: 'string',
            description: 'ID do Item principal do front, tecnicamente Categoria'
          },
          id_categoria_reg1: {
            type: 'string',
            description: 'ID da Categoria do front, tecnicamente CategoriaItem, salva em item.id_categoria_reg1'
          },
          tag: { type: 'string' },
          tag_secundaria: { type: 'string' },
          status: {
            type: 'string',
            enum: ['ativo', 'inativo', 'manutencao', 'descartado', 'emtransporte']
          },
          id_nivel_loc1: { type: 'string' },
          id_nivel_loc2: { type: 'string' },
          id_nivel_loc3: { type: 'string' },
          id_nivel_loc4: { type: 'string' },
          observacao: { type: 'string' }
        },
        required: ['tag', 'id_categoria'],
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'editar_sku',
      description:
        'Edita um SKU do front-end. SKU no front corresponde à collection Item.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          descricao: { type: 'string' },
          id_categoria: { type: 'string' },
          id_categoria_reg1: {
            type: 'string',
            description: 'ID da Categoria do front, tecnicamente CategoriaItem, salva em item.id_categoria_reg1'
          },
          tag: { type: 'string' },
          tag_secundaria: { type: 'string' },
          status: {
            type: 'string',
            enum: ['ativo', 'inativo', 'manutencao', 'descartado', 'emtransporte']
          },
          id_nivel_loc1: { type: 'string' },
          id_nivel_loc2: { type: 'string' },
          id_nivel_loc3: { type: 'string' },
          id_nivel_loc4: { type: 'string' },
          observacao: { type: 'string' },
          ativo: { type: 'number', enum: [0, 1] }
        },
        required: ['id'],
        additionalProperties: false
      }
    },

    {
      type: 'function',
      name: 'listar_enderecos',
      description: 'Lista Localizações da conta atual.',
      parameters: {
        type: 'object',
        properties: {
          termo: { type: 'string' }
        },
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'criar_endereco',
      description:
        'Cria uma Localização. Se for filha, id_nivel deve receber o _id do pai.',
      parameters: {
        type: 'object',
        properties: {
          descricao: { type: 'string' },
          id_nivel: { type: ['string', 'null'] },
          tag: { type: 'string' },
          cidade: { type: 'string' },
          estado: { type: 'string' },
          observacao: { type: 'string' }
        },
        required: ['descricao'],
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'editar_endereco',
      description:
        'Edita uma Localização. Se houver id_nivel, ele deve ser o _id do pai.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          descricao: { type: 'string' },
          id_nivel: { type: ['string', 'null'] },
          tag: { type: 'string' },
          cidade: { type: 'string' },
          estado: { type: 'string' },
          observacao: { type: 'string' },
          ativo: { type: 'number', enum: [0, 1] }
        },
        required: ['id'],
        additionalProperties: false
      }
    },

    {
      type: 'function',
      name: 'listar_coletores',
      description: 'Lista Gateways da conta atual.',
      parameters: {
        type: 'object',
        properties: {
          termo: { type: 'string' }
        },
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'criar_coletor',
      description: 'Cria um Gateway.',
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
      name: 'editar_coletor',
      description: 'Edita um Gateway.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
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
          observacao: { type: 'string' },
          ativo: { type: 'number', enum: [0, 1] }
        },
        required: ['id'],
        additionalProperties: false
      }
    },

    {
      type: 'function',
      name: 'listar_posicoes',
      description: 'Lista Posições da conta atual.',
      parameters: {
        type: 'object',
        properties: {
          termo: { type: 'string' }
        },
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'criar_posicao',
      description: 'Cria uma Posição com origem, destino e itens.',
      parameters: {
        type: 'object',
        properties: {
          descricao: { type: 'string' },
          id_doc: { type: 'string' },
          id_colaborador: { type: 'string' },
          icone: { type: 'string' },
          partida_data: { type: 'string', description: 'Data ISO' },
          tolerancia: { type: 'number' },
          previsao_chegada_data: { type: 'string', description: 'Data ISO' },
          previsao_chegada_tolerancia: { type: 'number' },
          status: { type: 'string', enum: ['aberta', 'parcial', 'concluido', 'partida'	] },
    
          id_nivel_loc1: { type: 'string' },
          id_nivel_loc2: { type: 'string' },
          id_nivel_loc3: { type: 'string' },
          id_nivel_loc4: { type: 'string' },
    
          id_nivel_loc1_destino: { type: 'string' },
          id_nivel_loc2_destino: { type: 'string' },
          id_nivel_loc3_destino: { type: 'string' },
          id_nivel_loc4_destino: { type: 'string' },
    
          itens: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id_item: { type: 'string' },
                id_categoria: { type: 'string' },
                tag: { type: 'string' },
                ean: { type: 'string' },
                rssi: { type: 'string' },
                quantidade: { type: 'number' },
                status: { type: 'string' },
                id_gateway: { type: 'string' },
                id_colaborador: { type: 'string' },
                status_destino: { type: 'string' }
              },
              additionalProperties: false
            }
          },
    
          observacao: { type: 'string' }
        },
        required: ['id_doc', 'itens'],
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'editar_posicao',
      description: 'Edita uma Posição existente.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          descricao: { type: 'string' },
          id_doc: { type: 'string' },
          id_colaborador: { type: 'string' },
          icone: { type: 'string' },
          partida_data: { type: 'string' },
          tolerancia: { type: 'number' },
          previsao_chegada_data: { type: 'string' },
          previsao_chegada_tolerancia: { type: 'number' },
          status: { type: 'string', enum: ['aberta', 'parcial', 'concluido', 'partida'	] },
    
          id_nivel_loc1: { type: 'string' },
          id_nivel_loc2: { type: 'string' },
          id_nivel_loc3: { type: 'string' },
          id_nivel_loc4: { type: 'string' },
    
          id_nivel_loc1_destino: { type: 'string' },
          id_nivel_loc2_destino: { type: 'string' },
          id_nivel_loc3_destino: { type: 'string' },
          id_nivel_loc4_destino: { type: 'string' },
    
          itens: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                _id: { type: 'string' },
                id_item: { type: 'string' },
                id_categoria: { type: 'string' },
                tag: { type: 'string' },
                ean: { type: 'string' },
                rssi: { type: 'string' },
                quantidade: { type: 'number' },
                status: { type: 'string' , enum: ['pendente',  'concluido'	] },
                id_gateway: { type: 'string' },
                id_colaborador: { type: 'string' },
                status_destino: { type: 'string', enum: ['pendente',  'concluido'	] }
              },
              additionalProperties: false
            }
          }
        },
        required: ['id'],
        additionalProperties: false
      }
    },

    {
      type: 'function',
      name: 'listar_alertas',
      description: 'Lista Alertas da conta atual.',
      parameters: {
        type: 'object',
        properties: {
          termo: { type: 'string' }
        },
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'criar_alerta',
      description: 'Cria um Alerta da conta atual.',
      parameters: {
        type: 'object',
        properties: {
          descricao: { type: 'string' },
          icone: { type: 'string' },
          ativo: { type: 'number', enum: [0, 1] },
    
          id_colaborador: { type: 'string' },
    
          id_nivel_loc1: { type: 'string' },
          id_nivel_loc2: { type: 'string' },
          id_nivel_loc3: { type: 'string' },
          id_nivel_loc4: { type: 'string' },
    
          acoes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                acao: {
                  type: 'string',
                  enum: ['aproximar', 'distanciar', 'sair', 'itens_fixo', 'tol_max', 'tol_min']
                },
                nivel: {
                  type: 'string',
                  enum: ['leve', 'importante', 'critico']
                },
                referencia: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      valor: { type: 'string' },
                      id_item: { type: 'string' },
                      id_categoria: { type: 'string' }
                    },
                    additionalProperties: false
                  }
                }
              },
              required: ['acao', 'nivel'],
              additionalProperties: false
            }
          }
        },
        required: ['descricao'],
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'editar_alerta',
      description: 'Edita um Alerta existente.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          descricao: { type: 'string' },
          icone: { type: 'string' },
          ativo: { type: 'number', enum: [0, 1] },
    
          id_colaborador: { type: 'string' },
    
          id_nivel_loc1: { type: 'string' },
          id_nivel_loc2: { type: 'string' },
          id_nivel_loc3: { type: 'string' },
          id_nivel_loc4: { type: 'string' },
    
          acoes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                _id: { type: 'string' },
                acao: {
                  type: 'string',
                  enum: ['aproximar', 'distanciar', 'sair', 'itens_fixo', 'tol_max', 'tol_min']
                },
                nivel: {
                  type: 'string',
                  enum: ['leve', 'importante', 'critico']
                },
                referencia: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      valor: { type: 'string' },
                      id_item: { type: 'string' },
                      id_categoria: { type: 'string' }
                    },
                    additionalProperties: false
                  }
                }
              },
              required: ['acao', 'nivel'],
              additionalProperties: false
            }
          }
        },
        required: ['id'],
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'listar_interacoes',
      description: 'Lista Interações da conta atual.',
      parameters: {
        type: 'object',
        properties: {
          termo: { type: 'string' }
        },
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'criar_interacao',
      description: 'Cria uma Interação da conta atual.',
      parameters: {
        type: 'object',
        properties: {
          descricao: { type: 'string' },
          icone: { type: 'string' },
          ativo: { type: 'number', enum: [0, 1] },
          id_colaborador: { type: 'string' },
    
          id_nivel_loc1: { type: 'string' },
          id_nivel_loc2: { type: 'string' },
          id_nivel_loc3: { type: 'string' },
          id_nivel_loc4: { type: 'string' },
    
          enviar_email: { type: 'number', enum: [0, 1] },
          enviar_whats: { type: 'number', enum: [0, 1] },
    
          acoes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                movimento: {
                  type: 'string',
                  enum: ['entrada', 'entrada_i', 'saida', 'saida_i']
                },
                equipamento: {
                  type: 'string',
                  enum: ['pdi', 'pdi_vinculado', 'tuya', 'endpoint']
                },
                serial: { type: 'string' },
                acao: {
                  type: 'string',
                  enum: [
                    'tuya_on',
                    'tuya_off',
                    'pdi_display',
                    'pdi_led_vr',
                    'pdi_led_vm',
                    'pdi_bt_1',
                    'pdi_bt_2',
                    'endpoint_get',
                    'endpoint_post',
                    'endpoint_patch',
                    'endpoint_delete'
                  ]
                },
                comando: { type: 'string' }
              },
              required: ['movimento', 'equipamento', 'acao'],
              additionalProperties: false
            }
          }
        },
        required: ['descricao'],
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'editar_interacao',
      description: 'Edita uma Interação existente.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          descricao: { type: 'string' },
          icone: { type: 'string' },
          ativo: { type: 'number', enum: [0, 1] },
          id_colaborador: { type: 'string' },
    
          id_nivel_loc1: { type: 'string' },
          id_nivel_loc2: { type: 'string' },
          id_nivel_loc3: { type: 'string' },
          id_nivel_loc4: { type: 'string' },
    
          enviar_email: { type: 'number', enum: [0, 1] },
          enviar_whats: { type: 'number', enum: [0, 1] },
    
          acoes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                _id: { type: 'string' },
                movimento: {
                  type: 'string',
                  enum: ['entrada', 'entrada_i', 'saida', 'saida_i']
                },
                equipamento: {
                  type: 'string',
                  enum: ['pdi', 'pdi_vinculado', 'tuya', 'endpoint']
                },
                serial: { type: 'string' },
                acao: {
                  type: 'string',
                  enum: [
                    'tuya_on',
                    'tuya_off',
                    'pdi_display',
                    'pdi_led_vr',
                    'pdi_led_vm',
                    'pdi_bt_1',
                    'pdi_bt_2',
                    'endpoint_get',
                    'endpoint_post',
                    'endpoint_patch',
                    'endpoint_delete'
                  ]
                },
                comando: { type: 'string' }
              },
              required: ['movimento', 'equipamento', 'acao'],
              additionalProperties: false
            }
          }
        },
        required: ['id'],
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'consultar_skus_por_endereco',
      description: 'Retorna o total de SKUs em um endereço específico.',
      parameters: {
        type: 'object',
        properties: {
          id_localizacao: { type: 'string' },
          nivel: { type: 'number', enum: [1, 2, 3, 4] }
        },
        required: ['id_localizacao'],
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'ranking_itens_no_endereco',
      description: 'Retorna os Itens com maior e menor volume de SKUs em um endereço.',
      parameters: {
        type: 'object',
        properties: {
          id_localizacao: { type: 'string' },
          nivel: { type: 'number', enum: [1, 2, 3, 4] }
        },
        required: ['id_localizacao'],
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'ranking_categorias_no_endereco',
      description: 'Retorna as Categorias com maior e menor volume de SKUs em um endereço.',
      parameters: {
        type: 'object',
        properties: {
          id_localizacao: { type: 'string' },
          nivel: { type: 'number', enum: [1, 2, 3, 4] }
        },
        required: ['id_localizacao'],
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'ranking_enderecos_por_skus',
      description: 'Retorna os endereços com maior e menor quantidade de SKUs.',
      parameters: {
        type: 'object',
        properties: {
          nivel: { type: 'number', enum: [1, 2, 3, 4] }
        },
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'comparativo_enderecos_item',
      description: 'Compara em quais endereços há maior concentração de SKUs de um Item específico.',
      parameters: {
        type: 'object',
        properties: {
          id_categoria: { type: 'string' },
          nivel: { type: 'number', enum: [1, 2, 3, 4] }
        },
        required: ['id_categoria'],
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'ranking_itens_total',
      description: 'Retorna o ranking geral de Itens com maior e menor volume de SKUs na conta.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    }

  ];

  async function validateAlertActions(acoes, id_conta) {
    if (!Array.isArray(acoes) || !acoes.length) {
      return { ok: true };
    }
  
    for (const acao of acoes) {
      const referencias = Array.isArray(acao.referencia) ? acao.referencia : [];
  
      const idsItens = referencias
        .map((ref) => sanitizeText(ref.id_item))
        .filter(Boolean);
  
      if (idsItens.length) {
        const countItens = await Item.countDocuments({
          _id: { $in: idsItens },
          id_conta
        });
  
        if (countItens !== idsItens.length) {
          return {
            ok: false,
            error: 'Um ou mais SKUs informados no alerta não pertencem à conta atual.'
          };
        }
      }
  
      const idsCategorias = referencias
        .map((ref) => sanitizeText(ref.id_categoria))
        .filter(Boolean);
  
      if (idsCategorias.length) {
        const countCategorias = await Categoria.countDocuments({
          _id: { $in: idsCategorias },
          id_conta
        });
  
        if (countCategorias !== idsCategorias.length) {
          return {
            ok: false,
            error: 'Um ou mais Itens principais informados no alerta não pertencem à conta atual.'
          };
        }
      }
    }
  
    return { ok: true };
  };

  async function validateColaborador(id_colaborador, id_conta) {
    const id = sanitizeText(id_colaborador);
    if (!id) return { ok: true };
  
    const exists = await Colaborador.findOne({ _id: id, id_conta }).lean();
    if (!exists) {
      return {
        ok: false,
        error: 'Colaborador não encontrado na conta atual.'
      };
    }
  
    return { ok: true };
  };

  function validateInteractionActions(acoes) {
    if (!Array.isArray(acoes) || !acoes.length) {
      return { ok: true };
    }
  
    for (const acao of acoes) {
      const movimento = sanitizeText(acao.movimento);
      const equipamento = sanitizeText(acao.equipamento);
      const acaoExec = sanitizeText(acao.acao);
  
      if (!movimento || !equipamento || !acaoExec) {
        return {
          ok: false,
          error: 'Cada ação da interação deve informar movimento, equipamento e acao.'
        };
      }
    }
  
    return { ok: true };
  }

  async function validateLocationLevels(args, id_conta, skipEmpty = true) {
    const locIds = ['id_nivel_loc1', 'id_nivel_loc2', 'id_nivel_loc3', 'id_nivel_loc4']
      .map((key) => sanitizeText(args[key]))
      .filter((value) => (skipEmpty ? !!value : true));

    if (!locIds.length) return { ok: true };

    const count = await Localizacao.countDocuments({
      _id: { $in: locIds },
      id_conta
    });

    if (count !== locIds.length) {
      return {
        ok: false,
        error: 'Uma ou mais Localizações informadas não pertencem à conta atual.'
      };
    }

    return { ok: true };
  }

  async function validateDestinationLevels(args, id_conta, skipEmpty = true) {
    const locIds = [
      'id_nivel_loc1_destino',
      'id_nivel_loc2_destino',
      'id_nivel_loc3_destino',
      'id_nivel_loc4_destino'
    ]
      .map((key) => sanitizeText(args[key]))
      .filter((value) => (skipEmpty ? !!value : true));
  
    if (!locIds.length) return { ok: true };
  
    const count = await Localizacao.countDocuments({
      _id: { $in: locIds },
      id_conta
    });
  
    if (count !== locIds.length) {
      return {
        ok: false,
        error: 'Uma ou mais Localizações de destino não pertencem à conta atual.'
      };
    }
  
    return { ok: true };
  }

  async function validatePosicaoItens(itens, id_conta) {
    if (!Array.isArray(itens) || !itens.length) return { ok: true };
  
    const idsItens = itens
      .map((it) => sanitizeText(it.id_item))
      .filter(Boolean);
  
    if (idsItens.length) {
      const countItens = await Item.countDocuments({
        _id: { $in: idsItens },
        id_conta
      });
  
      if (countItens !== idsItens.length) {
        return {
          ok: false,
          error: 'Um ou mais SKUs informados na posição não pertencem à conta atual.'
        };
      }
    }
  
    const idsCategorias = itens
      .map((it) => sanitizeText(it.id_categoria))
      .filter(Boolean);
  
    if (idsCategorias.length) {
      const countCategorias = await Categoria.countDocuments({
        _id: { $in: idsCategorias },
        id_conta
      });
  
      if (countCategorias !== idsCategorias.length) {
        return {
          ok: false,
          error: 'Um ou mais Itens principais informados na posição não pertencem à conta atual.'
        };
      }
    }
  
    return { ok: true };
  }



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

      case 'listar_itens_front': {
        const termo = sanitizeText(args.termo);
        const filter = { id_conta };

        if (termo) {
          filter.descricao = { $regex: termo, $options: 'i' };
        }

        const docs = await Categoria.find(filter)
          .sort({ descricao: 1 })
          .limit(100)
          .lean();

        return {
          ok: true,
          total: docs.length,
          data: summarizeDocs(docs, (doc) => ({
            _id: doc._id,
            descricao: doc.descricao,
            ean: doc.ean || '',
            ativo: doc.ativo
          }))
        };
      }

      case 'criar_item_front': {
        const descricao = sanitizeText(args.descricao);
        if (!descricao) {
          return { ok: false, error: 'descricao é obrigatória.' };
        }

        const exists = await Categoria.findOne({
          id_conta,
          descricao: new RegExp(`^${escapeRegex(descricao)}$`, 'i')
        }).lean();

        if (exists) {
          return {
            ok: false,
            error: 'Já existe um Item com essa descrição.',
            data: exists
          };
        }

        const doc = await Categoria.create({
          id_conta,
          descricao,
          observacao: sanitizeText(args.observacao),
          ean: sanitizeText(args.ean)
        });

        return {
          ok: true,
          data: {
            _id: doc._id,
            descricao: doc.descricao
          }
        };
      }

      case 'editar_item_front': {
        const id = sanitizeText(args.id);
        if (!id) {
          return { ok: false, error: 'id é obrigatório.' };
        }

        const doc = await Categoria.findOne({ _id: id, id_conta });
        if (!doc) {
          return { ok: false, error: 'Item não encontrado na conta atual.' };
        }

        if (args.descricao != null) doc.descricao = sanitizeText(args.descricao);
        if (args.observacao != null) doc.observacao = sanitizeText(args.observacao);
        if (args.ean != null) doc.ean = sanitizeText(args.ean);
        if (args.ativo != null) doc.ativo = args.ativo;

        await doc.save();

        return {
          ok: true,
          data: {
            _id: doc._id,
            descricao: doc.descricao
          }
        };
      }

      case 'listar_categorias_front': {
        const termo = sanitizeText(args.termo);
        const filter = { id_conta };

        if (termo) {
          filter.descricao = { $regex: termo, $options: 'i' };
        }

        const docs = await CategoriaItem.find(filter)
          .sort({ descricao: 1 })
          .limit(100)
          .lean();

        return {
          ok: true,
          total: docs.length,
          data: summarizeDocs(docs, (doc) => ({
            _id: doc._id,
            descricao: doc.descricao,
            id_nivel: doc.id_nivel || null,
            ativo: doc.ativo
          }))
        };
      }

      case 'criar_categoria_front': {
        const descricao = sanitizeText(args.descricao);
        const id_nivel = sanitizeText(args.id_nivel);

        if (!descricao) {
          return { ok: false, error: 'descricao é obrigatória.' };
        }

        if (id_nivel) {
          const pai = await CategoriaItem.findOne({ _id: id_nivel, id_conta }).lean();
          if (!pai) {
            return {
              ok: false,
              error: 'Categoria pai não encontrada na conta atual.'
            };
          }
        }

        const exists = await CategoriaItem.findOne({
          id_conta,
          descricao: new RegExp(`^${escapeRegex(descricao)}$`, 'i')
        }).lean();

        if (exists) {
          return {
            ok: false,
            error: 'Já existe uma Categoria com essa descrição.',
            data: exists
          };
        }

        const doc = await CategoriaItem.create({
          id_conta,
          descricao,
          id_nivel: id_nivel || null,
          observacao: sanitizeText(args.observacao)
        });

        return {
          ok: true,
          data: {
            _id: doc._id,
            descricao: doc.descricao,
            id_nivel: doc.id_nivel || null
          }
        };
      }

      case 'editar_categoria_front': {
        const id = sanitizeText(args.id);
        if (!id) {
          return { ok: false, error: 'id é obrigatório.' };
        }

        const doc = await CategoriaItem.findOne({ _id: id, id_conta });
        if (!doc) {
          return { ok: false, error: 'Categoria não encontrada na conta atual.' };
        }

        const novoPai =
          args.id_nivel === null ? null : sanitizeText(args.id_nivel);

        if (novoPai) {
          if (novoPai === id) {
            return {
              ok: false,
              error: 'Uma Categoria não pode ser pai dela mesma.'
            };
          }

          const pai = await CategoriaItem.findOne({
            _id: novoPai,
            id_conta
          }).lean();

          if (!pai) {
            return {
              ok: false,
              error: 'Categoria pai não encontrada na conta atual.'
            };
          }
        }

        if (args.descricao != null) doc.descricao = sanitizeText(args.descricao);
        if (args.id_nivel !== undefined) doc.id_nivel = novoPai;
        if (args.observacao != null) doc.observacao = sanitizeText(args.observacao);
        if (args.ativo != null) doc.ativo = args.ativo;

        await doc.save();

        return {
          ok: true,
          data: {
            _id: doc._id,
            descricao: doc.descricao,
            id_nivel: doc.id_nivel || null
          }
        };
      }

      case 'listar_skus': {
        const termo = sanitizeText(args.termo);
        const filter = { id_conta };

        if (termo) {
          filter.$or = [
            { descricao: { $regex: termo, $options: 'i' } },
            { tag: { $regex: termo, $options: 'i' } }
          ];
        }

        const docs = await Item.find(filter)
          .sort({ descricao: 1 })
          .limit(100)
          .lean();

        return {
          ok: true,
          total: docs.length,
          data: summarizeDocs(docs, (doc) => ({
            _id: doc._id,
            descricao: doc.descricao,
            tag: doc.tag || '',
            id_categoria: doc.id_categoria || '',
            status: doc.status || 'ativo',
            ativo: doc.ativo
          }))
        };
      }

      case 'criar_sku': {
        const descricao = sanitizeText(args.descricao);
        const id_categoria = sanitizeText(args.id_categoria);
        const id_categoria_reg1 = sanitizeText(args.id_categoria_reg1);

        if (id_categoria_reg1) {
          const categoriaAux = await CategoriaItem.findOne({
            _id: id_categoria_reg1,
            id_conta
          }).lean();

          if (!categoriaAux) {
            return {
              ok: false,
              error: 'Categoria não encontrada na conta atual.'
            };
          }
        }

        // if (!descricao || !id_categoria) {
          if (!id_categoria) {
          return {
            ok: false,
            error: 'id_categoria são obrigatórios.'
          };
        }

        const itemPrincipal = await Categoria.findOne({
          _id: id_categoria,
          id_conta
        }).lean();

        if (!itemPrincipal) {
          return {
            ok: false,
            error: 'Item principal não encontrado na conta atual.'
          };
        }

        const tag = sanitizeText(args.tag);
        if (tag) {
          const tagExists = await Item.findOne({ id_conta, tag }).lean();
          if (tagExists) {
            return {
              ok: false,
              error: 'Já existe um SKU com esta tag.',
              data: tagExists
            };
          }
        }

        const locValidation = await validateLocationLevels(args, id_conta);
        if (!locValidation.ok) return locValidation;

        const doc = await Item.create({
          id_conta,
          descricao,
          id_categoria,
          id_categoria_reg1: id_categoria_reg1 || '',
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

      case 'editar_sku': {
        const id = sanitizeText(args.id);
        if (!id) {
          return { ok: false, error: 'id é obrigatório.' };
        }

        const doc = await Item.findOne({ _id: id, id_conta });
        if (!doc) {
          return { ok: false, error: 'SKU não encontrado na conta atual.' };
        }

        if (args.id_categoria != null) {
          const novoItemPrincipal = sanitizeText(args.id_categoria);

          const itemPrincipal = await Categoria.findOne({
            _id: novoItemPrincipal,
            id_conta
          }).lean();

          if (!itemPrincipal) {
            return {
              ok: false,
              error: 'Item principal não encontrado na conta atual.'
            };
          }

          doc.id_categoria = novoItemPrincipal;
        }

        if (args.id_categoria_reg1 != null) {
          const novaCategoriaAux = sanitizeText(args.id_categoria_reg1);
        
          if (novaCategoriaAux) {
            const categoriaAux = await CategoriaItem.findOne({
              _id: novaCategoriaAux,
              id_conta
            }).lean();
        
            if (!categoriaAux) {
              return {
                ok: false,
                error: 'Categoria não encontrada na conta atual.'
              };
            }
          }
        
          doc.id_categoria_reg1 = novaCategoriaAux;
        }

        if (args.tag != null) {
          const novaTag = sanitizeText(args.tag);

          if (novaTag) {
            const tagExists = await Item.findOne({
              _id: { $ne: id },
              id_conta,
              tag: novaTag
            }).lean();

            if (tagExists) {
              return {
                ok: false,
                error: 'Já existe outro SKU com esta tag.'
              };
            }
          }

          doc.tag = novaTag;
        }

        const locValidation = await validateLocationLevels(args, id_conta);
        if (!locValidation.ok) return locValidation;

        if (args.descricao != null) doc.descricao = sanitizeText(args.descricao);
        if (args.tag_secundaria != null) doc.tag_secundaria = sanitizeText(args.tag_secundaria);
        if (args.status != null) doc.status = sanitizeText(args.status);
        if (args.id_nivel_loc1 != null) doc.id_nivel_loc1 = sanitizeText(args.id_nivel_loc1);
        if (args.id_nivel_loc2 != null) doc.id_nivel_loc2 = sanitizeText(args.id_nivel_loc2);
        if (args.id_nivel_loc3 != null) doc.id_nivel_loc3 = sanitizeText(args.id_nivel_loc3);
        if (args.id_nivel_loc4 != null) doc.id_nivel_loc4 = sanitizeText(args.id_nivel_loc4);
        if (args.observacao != null) doc.observacao = sanitizeText(args.observacao);
        if (args.ativo != null) doc.ativo = args.ativo;

        await doc.save();

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

      case 'listar_enderecos': {
        const termo = sanitizeText(args.termo);
        const filter = { id_conta };

        if (termo) {
          filter.descricao = { $regex: termo, $options: 'i' };
        }

        const docs = await Localizacao.find(filter)
          .sort({ descricao: 1 })
          .limit(100)
          .lean();

        return {
          ok: true,
          total: docs.length,
          data: summarizeDocs(docs, (doc) => ({
            _id: doc._id,
            descricao: doc.descricao,
            id_nivel: doc.id_nivel || null,
            tag: doc.tag || '',
            cidade: doc.cidade || '',
            estado: doc.estado || '',
            ativo: doc.ativo
          }))
        };
      }

      case 'criar_endereco': {
        const descricao = sanitizeText(args.descricao);
        const id_nivel = sanitizeText(args.id_nivel);

        if (!descricao) {
          return { ok: false, error: 'descricao é obrigatória.' };
        }

        if (id_nivel) {
          const pai = await Localizacao.findOne({ _id: id_nivel, id_conta }).lean();
          if (!pai) {
            return {
              ok: false,
              error: 'Localização pai não encontrada na conta atual.'
            };
          }
        }

        const exists = await Localizacao.findOne({
          id_conta,
          descricao: new RegExp(`^${escapeRegex(descricao)}$`, 'i')
        }).lean();

        if (exists) {
          return {
            ok: false,
            error: 'Já existe uma Localização com essa descrição.',
            data: exists
          };
        }

        const doc = await Localizacao.create({
          id_conta,
          descricao,
          id_nivel: id_nivel || null,
          tag: sanitizeText(args.tag),
          cidade: sanitizeText(args.cidade),
          estado: sanitizeText(args.estado),
          observacao: sanitizeText(args.observacao)
        });

        return {
          ok: true,
          data: {
            _id: doc._id,
            descricao: doc.descricao,
            id_nivel: doc.id_nivel || null
          }
        };
      }

      case 'editar_endereco': {
        const id = sanitizeText(args.id);
        if (!id) {
          return { ok: false, error: 'id é obrigatório.' };
        }

        const doc = await Localizacao.findOne({ _id: id, id_conta });
        if (!doc) {
          return { ok: false, error: 'Localização não encontrada na conta atual.' };
        }

        const novoPai =
          args.id_nivel === null ? null : sanitizeText(args.id_nivel);

        if (novoPai) {
          if (novoPai === id) {
            return {
              ok: false,
              error: 'Uma Localização não pode ser pai dela mesma.'
            };
          }

          const pai = await Localizacao.findOne({
            _id: novoPai,
            id_conta
          }).lean();

          if (!pai) {
            return {
              ok: false,
              error: 'Localização pai não encontrada na conta atual.'
            };
          }
        }

        if (args.descricao != null) doc.descricao = sanitizeText(args.descricao);
        if (args.id_nivel !== undefined) doc.id_nivel = novoPai;
        if (args.tag != null) doc.tag = sanitizeText(args.tag);
        if (args.cidade != null) doc.cidade = sanitizeText(args.cidade);
        if (args.estado != null) doc.estado = sanitizeText(args.estado);
        if (args.observacao != null) doc.observacao = sanitizeText(args.observacao);
        if (args.ativo != null) doc.ativo = args.ativo;

        await doc.save();

        return {
          ok: true,
          data: {
            _id: doc._id,
            descricao: doc.descricao,
            id_nivel: doc.id_nivel || null
          }
        };
      }

      case 'listar_coletores': {
        const termo = sanitizeText(args.termo);
        const filter = { id_conta };

        if (termo) {
          filter.descricao = { $regex: termo, $options: 'i' };
        }

        const docs = await Gateway.find(filter)
          .sort({ descricao: 1 })
          .limit(100)
          .lean();

        return {
          ok: true,
          total: docs.length,
          data: summarizeDocs(docs, (doc) => ({
            _id: doc._id,
            descricao: doc.descricao,
            modo: doc.modo,
            leitor: doc.leitor || '',
            ativo: doc.ativo
          }))
        };
      }

      case 'criar_coletor': {
        const descricao = sanitizeText(args.descricao);
        const modo = sanitizeText(args.modo);

        if (!descricao || !modo) {
          return {
            ok: false,
            error: 'descricao e modo são obrigatórios.'
          };
        }

        const exists = await Gateway.findOne({
          id_conta,
          descricao: new RegExp(`^${escapeRegex(descricao)}$`, 'i')
        }).lean();

        if (exists) {
          return {
            ok: false,
            error: 'Já existe um Gateway com essa descrição.',
            data: exists
          };
        }

        const locValidation = await validateLocationLevels(args, id_conta);
        if (!locValidation.ok) return locValidation;

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
          watch_valor: sanitizeText(args.watch_valor),
          observacao: sanitizeText(args.observacao)
        });

        return {
          ok: true,
          data: {
            _id: doc._id,
            descricao: doc.descricao,
            modo: doc.modo
          }
        };
      }

      case 'editar_coletor': {
        const id = sanitizeText(args.id);
        if (!id) {
          return { ok: false, error: 'id é obrigatório.' };
        }

        const doc = await Gateway.findOne({ _id: id, id_conta });
        if (!doc) {
          return { ok: false, error: 'Gateway não encontrado na conta atual.' };
        }

        const locValidation = await validateLocationLevels(args, id_conta);
        if (!locValidation.ok) return locValidation;

        if (args.descricao != null) doc.descricao = sanitizeText(args.descricao);
        if (args.modo != null) doc.modo = sanitizeText(args.modo);
        if (args.id_nivel_loc1 != null) doc.id_nivel_loc1 = sanitizeText(args.id_nivel_loc1);
        if (args.id_nivel_loc2 != null) doc.id_nivel_loc2 = sanitizeText(args.id_nivel_loc2);
        if (args.id_nivel_loc3 != null) doc.id_nivel_loc3 = sanitizeText(args.id_nivel_loc3);
        if (args.id_nivel_loc4 != null) doc.id_nivel_loc4 = sanitizeText(args.id_nivel_loc4);
        if (args.leitor != null) doc.leitor = sanitizeText(args.leitor);
        if (args.leitor_mac != null) doc.leitor_mac = sanitizeText(args.leitor_mac);
        if (args.watch_regra != null) doc.watch_regra = sanitizeText(args.watch_regra);
        if (args.watch_valor != null) doc.watch_valor = sanitizeText(args.watch_valor);
        if (args.observacao != null) doc.observacao = sanitizeText(args.observacao);
        if (args.ativo != null) doc.ativo = args.ativo;

        await doc.save();

        return {
          ok: true,
          data: {
            _id: doc._id,
            descricao: doc.descricao,
            modo: doc.modo
          }
        };
      }

      case 'listar_posicoes': {
        const termo = sanitizeText(args.termo);
        const filter = { id_conta };
      
        if (termo) {
          filter.$or = [
            { descricao: { $regex: termo, $options: 'i' } },
            { id_doc: { $regex: termo, $options: 'i' } }
          ];
        }
      
        const docs = await Posicao.find(filter)
          .sort({ createdAt: -1 })
          .limit(100)
          .lean();
      
        return {
          ok: true,
          total: docs.length,
          data: docs.map((doc) => ({
            _id: doc._id,
            descricao: doc.descricao || '',
            id_doc: doc.id_doc || '',
            status: doc.status || '',
            previsao_chegada_data: doc.previsao_chegada_data || null,
            total_itens: Array.isArray(doc.itens) ? doc.itens.length : 0
          }))
        };
      }

      case 'criar_posicao': {
        const descricao = sanitizeText(args.descricao);
        const itens = Array.isArray(args.itens) ? args.itens : [];
        const status = sanitizeText(args.status) || 'pendente';
      
        if (!descricao) {
          return { ok: false, error: 'descricao é obrigatória.' };
        }
      
        const locOrigemValidation = await validateLocationLevels(args, id_conta);
        if (!locOrigemValidation.ok) return locOrigemValidation;
      
        const locDestinoValidation = await validateDestinationLevels(args, id_conta);
        if (!locDestinoValidation.ok) return locDestinoValidation;
      
        const itensValidation = await validatePosicaoItens(itens, id_conta);
        if (!itensValidation.ok) return itensValidation;
      
        const doc = await Posicao.create({
          id_conta,
          id_colaborador: sanitizeText(args.id_colaborador),
          ativo: sanitizeText(args.ativo) || '1',
          id_doc: sanitizeText(args.id_doc),
          descricao,
          status,
          icone: sanitizeText(args.icone),
      
          partida_data: args.partida_data ? new Date(args.partida_data) : null,
          tolerancia: args.tolerancia ?? 0,
      
          previsao_chegada_data: args.previsao_chegada_data
            ? new Date(args.previsao_chegada_data)
            : null,
          previsao_chegada_tolerancia: args.previsao_chegada_tolerancia ?? 0,
      
          status: sanitizeText(args.status) || 'pendente',
          status_data: new Date(),
      
          id_nivel_loc1: sanitizeText(args.id_nivel_loc1),
          id_nivel_loc2: sanitizeText(args.id_nivel_loc2),
          id_nivel_loc3: sanitizeText(args.id_nivel_loc3),
          id_nivel_loc4: sanitizeText(args.id_nivel_loc4),
      
          id_nivel_loc1_destino: sanitizeText(args.id_nivel_loc1_destino),
          id_nivel_loc2_destino: sanitizeText(args.id_nivel_loc2_destino),
          id_nivel_loc3_destino: sanitizeText(args.id_nivel_loc3_destino),
          id_nivel_loc4_destino: sanitizeText(args.id_nivel_loc4_destino),
      
          itens: itens.map((it) => ({
            id_item: sanitizeText(it.id_item),
            id_categoria: sanitizeText(it.id_categoria),
            tag: sanitizeText(it.tag),
            ean: sanitizeText(it.ean),
            rssi: sanitizeText(it.rssi),
            quantidade: Number(it.quantidade || 0),
            status: sanitizeText(it.status) || 'pendente',
            status_data: new Date(),
            id_gateway: sanitizeText(it.id_gateway),
            id_colaborador: sanitizeText(it.id_colaborador),
            status_destino: sanitizeText(it.status_destino) || 'pendente',
            status_destino_data: new Date()
          }))
        });
      
        return {
          ok: true,
          data: {
            _id: doc._id,
            descricao: doc.descricao,
            status: doc.status,
            total_itens: Array.isArray(doc.itens) ? doc.itens.length : 0
          }
        };
      }

      case 'editar_posicao': {
        const id = sanitizeText(args.id);
        if (!id) {
          return { ok: false, error: 'id é obrigatório.' };
        }
      
        const doc = await Posicao.findOne({ _id: id, id_conta });
        if (!doc) {
          return { ok: false, error: 'Posição não encontrada na conta atual.' };
        }
      
        const locOrigemValidation = await validateLocationLevels(args, id_conta);
        if (!locOrigemValidation.ok) return locOrigemValidation;
      
        const locDestinoValidation = await validateDestinationLevels(args, id_conta);
        if (!locDestinoValidation.ok) return locDestinoValidation;
      
        if (args.itens != null) {
          const itensValidation = await validatePosicaoItens(args.itens, id_conta);
          if (!itensValidation.ok) return itensValidation;
      
          doc.itens = (Array.isArray(args.itens) ? args.itens : []).map((it) => ({
            _id: sanitizeText(it._id) || undefined,
            id_item: sanitizeText(it.id_item),
            id_categoria: sanitizeText(it.id_categoria),
            tag: sanitizeText(it.tag),
            ean: sanitizeText(it.ean),
            rssi: sanitizeText(it.rssi),
            quantidade: Number(it.quantidade || 0),
            status: sanitizeText(it.status),
            status_data: new Date(),
            id_gateway: sanitizeText(it.id_gateway),
            id_colaborador: sanitizeText(it.id_colaborador),
            status_destino: sanitizeText(it.status_destino),
            status_destino_data: new Date()
          }));
        }
      
        if (args.descricao != null) doc.descricao = sanitizeText(args.descricao);
        if (args.id_doc != null) doc.id_doc = sanitizeText(args.id_doc);
        if (args.id_colaborador != null) doc.id_colaborador = sanitizeText(args.id_colaborador);
        if (args.icone != null) doc.icone = sanitizeText(args.icone);
        if (args.partida_data != null) doc.partida_data = args.partida_data ? new Date(args.partida_data) : null;
        if (args.tolerancia != null) doc.tolerancia = args.tolerancia;
        if (args.previsao_chegada_data != null) {
          doc.previsao_chegada_data = args.previsao_chegada_data ? new Date(args.previsao_chegada_data) : null;
        }
        if (args.previsao_chegada_tolerancia != null) {
          doc.previsao_chegada_tolerancia = args.previsao_chegada_tolerancia;
        }
        if (args.status != null) {
          doc.status = sanitizeText(args.status);
          doc.status_data = new Date();
        }
      
        if (args.id_nivel_loc1 != null) doc.id_nivel_loc1 = sanitizeText(args.id_nivel_loc1);
        if (args.id_nivel_loc2 != null) doc.id_nivel_loc2 = sanitizeText(args.id_nivel_loc2);
        if (args.id_nivel_loc3 != null) doc.id_nivel_loc3 = sanitizeText(args.id_nivel_loc3);
        if (args.id_nivel_loc4 != null) doc.id_nivel_loc4 = sanitizeText(args.id_nivel_loc4);
      
        if (args.id_nivel_loc1_destino != null) doc.id_nivel_loc1_destino = sanitizeText(args.id_nivel_loc1_destino);
        if (args.id_nivel_loc2_destino != null) doc.id_nivel_loc2_destino = sanitizeText(args.id_nivel_loc2_destino);
        if (args.id_nivel_loc3_destino != null) doc.id_nivel_loc3_destino = sanitizeText(args.id_nivel_loc3_destino);
        if (args.id_nivel_loc4_destino != null) doc.id_nivel_loc4_destino = sanitizeText(args.id_nivel_loc4_destino);
      
        await doc.save();
      
        return {
          ok: true,
          data: {
            _id: doc._id,
            descricao: doc.descricao,
            status: doc.status,
            total_itens: Array.isArray(doc.itens) ? doc.itens.length : 0
          }
        };
      }

      case 'listar_alertas': {
        const termo = sanitizeText(args.termo);
        const filter = { id_conta };
      
        if (termo) {
          filter.descricao = { $regex: termo, $options: 'i' };
        }
      
        const docs = await Alerta.find(filter)
          .sort({ descricao: 1 })
          .limit(100)
          .lean();
      
        return {
          ok: true,
          total: docs.length,
          data: docs.map((doc) => ({
            _id: doc._id,
            descricao: doc.descricao || '',
            ativo: doc.ativo,
            total_acoes: Array.isArray(doc.acoes) ? doc.acoes.length : 0
          }))
        };
      }

      case 'criar_alerta': {
        const descricao = sanitizeText(args.descricao);
        const acoes = Array.isArray(args.acoes) ? args.acoes : [];
      
        if (!descricao) {
          return { ok: false, error: 'descricao é obrigatória.' };
        }
      
        const locValidation = await validateLocationLevels(args, id_conta);
        if (!locValidation.ok) return locValidation;
      
        const colValidation = await validateColaborador(args.id_colaborador, id_conta);
        if (!colValidation.ok) return colValidation;
      
        const actionValidation = await validateAlertActions(acoes, id_conta);
        if (!actionValidation.ok) return actionValidation;
      
        const doc = await Alerta.create({
          id_conta,
          id_colaborador: sanitizeText(args.id_colaborador),
          ativo: args.ativo != null ? args.ativo : 1,
          descricao,
          // icone: sanitizeText(args.icone) || '',
          icone: '',
      
          id_nivel_loc1: sanitizeText(args.id_nivel_loc1),
          id_nivel_loc2: sanitizeText(args.id_nivel_loc2),
          id_nivel_loc3: sanitizeText(args.id_nivel_loc3),
          id_nivel_loc4: sanitizeText(args.id_nivel_loc4),
      
          acoes: acoes.map((acao) => ({
            acao: sanitizeText(acao.acao),
            nivel: sanitizeText(acao.nivel),
            referencia: (Array.isArray(acao.referencia) ? acao.referencia : []).map((ref) => ({
              valor: sanitizeText(ref.valor),
              id_item: sanitizeText(ref.id_item),
              id_categoria: sanitizeText(ref.id_categoria)
            }))
          }))
        });
      
        return {
          ok: true,
          data: {
            _id: doc._id,
            descricao: doc.descricao,
            ativo: doc.ativo,
            total_acoes: Array.isArray(doc.acoes) ? doc.acoes.length : 0
          }
        };
      }

      case 'editar_alerta': {
        const id = sanitizeText(args.id);
        if (!id) {
          return { ok: false, error: 'id é obrigatório.' };
        }
      
        const doc = await Alerta.findOne({ _id: id, id_conta });
        if (!doc) {
          return { ok: false, error: 'Alerta não encontrado na conta atual.' };
        }
      
        const locValidation = await validateLocationLevels(args, id_conta);
        if (!locValidation.ok) return locValidation;
      
        const colValidation = await validateColaborador(args.id_colaborador, id_conta);
        if (!colValidation.ok) return colValidation;
      
        if (args.acoes != null) {
          const acoes = Array.isArray(args.acoes) ? args.acoes : [];
          const actionValidation = await validateAlertActions(acoes, id_conta);
          if (!actionValidation.ok) return actionValidation;
      
          doc.acoes = acoes.map((acao) => ({
            _id: sanitizeText(acao._id) || undefined,
            acao: sanitizeText(acao.acao),
            nivel: sanitizeText(acao.nivel),
            referencia: (Array.isArray(acao.referencia) ? acao.referencia : []).map((ref) => ({
              valor: sanitizeText(ref.valor),
              id_item: sanitizeText(ref.id_item),
              id_categoria: sanitizeText(ref.id_categoria)
            }))
          }));
        }
      
        if (args.descricao != null) doc.descricao = sanitizeText(args.descricao);
        if (args.icone != null) doc.icone = sanitizeText(args.icone);
        if (args.ativo != null) doc.ativo = args.ativo;
        if (args.id_colaborador != null) doc.id_colaborador = sanitizeText(args.id_colaborador);
      
        if (args.id_nivel_loc1 != null) doc.id_nivel_loc1 = sanitizeText(args.id_nivel_loc1);
        if (args.id_nivel_loc2 != null) doc.id_nivel_loc2 = sanitizeText(args.id_nivel_loc2);
        if (args.id_nivel_loc3 != null) doc.id_nivel_loc3 = sanitizeText(args.id_nivel_loc3);
        if (args.id_nivel_loc4 != null) doc.id_nivel_loc4 = sanitizeText(args.id_nivel_loc4);
      
        await doc.save();
      
        return {
          ok: true,
          data: {
            _id: doc._id,
            descricao: doc.descricao,
            ativo: doc.ativo,
            total_acoes: Array.isArray(doc.acoes) ? doc.acoes.length : 0
          }
        };
      }

      case 'listar_interacoes': {
        const termo = sanitizeText(args.termo);
        const filter = { id_conta };
      
        if (termo) {
          filter.descricao = { $regex: termo, $options: 'i' };
        }
      
        const docs = await Interacao.find(filter)
          .sort({ descricao: 1 })
          .limit(100)
          .lean();
      
        return {
          ok: true,
          total: docs.length,
          data: docs.map((doc) => ({
            _id: doc._id,
            descricao: doc.descricao || '',
            ativo: doc.ativo,
            enviar_email: doc.enviar_email || 0,
            enviar_whats: doc.enviar_whats || 0,
            total_acoes: Array.isArray(doc.acoes) ? doc.acoes.length : 0
          }))
        };
      }

      case 'listar_interacoes': {
        const termo = sanitizeText(args.termo);
        const filter = { id_conta };
      
        if (termo) {
          filter.descricao = { $regex: termo, $options: 'i' };
        }
      
        const docs = await Interacao.find(filter)
          .sort({ descricao: 1 })
          .limit(100)
          .lean();
      
        return {
          ok: true,
          total: docs.length,
          data: docs.map((doc) => ({
            _id: doc._id,
            descricao: doc.descricao || '',
            ativo: doc.ativo,
            enviar_email: doc.enviar_email || 0,
            enviar_whats: doc.enviar_whats || 0,
            total_acoes: Array.isArray(doc.acoes) ? doc.acoes.length : 0
          }))
        };
      }

      case 'criar_interacao': {

        const descricao = sanitizeText(args.descricao);
        const acoes = Array.isArray(args.acoes) ? args.acoes : [];
      
        if (!descricao) {
          return { ok: false, error: 'descricao é obrigatória.' };
        }
      
        const locValidation = await validateLocationLevels(args, id_conta);
        if (!locValidation.ok) return locValidation;
      
        const colValidation = await validateColaborador(args.id_colaborador, id_conta);
        if (!colValidation.ok) return colValidation;
      
        const actionValidation = validateInteractionActions(acoes);
        if (!actionValidation.ok) return actionValidation;
      
        const doc = await Interacao.create({
          id_conta,
          id_colaborador: sanitizeText(args.id_colaborador),
          ativo: args.ativo != null ? args.ativo : 1,
          descricao,
          icone: '',
      
          id_nivel_loc1: sanitizeText(args.id_nivel_loc1),
          id_nivel_loc2: sanitizeText(args.id_nivel_loc2),
          id_nivel_loc3: sanitizeText(args.id_nivel_loc3),
          id_nivel_loc4: sanitizeText(args.id_nivel_loc4),
      
          enviar_email: args.enviar_email ?? 0,
          enviar_whats: args.enviar_whats ?? 0,
      
          acoes: acoes.map(a => ({
            movimento: sanitizeText(a.movimento),
            equipamento: sanitizeText(a.equipamento),
            serial: sanitizeText(a.serial),
            acao: sanitizeText(a.acao),
            comando: sanitizeText(a.comando)
          }))
        });
      
        return {
          ok: true,
          data: {
            _id: doc._id,
            descricao: doc.descricao,
            total_acoes: doc.acoes.length
          }
        };
      }

      case 'editar_interacao': {
        const id = sanitizeText(args.id);
        if (!id) {
          return { ok: false, error: 'id é obrigatório.' };
        }
      
        const doc = await Interacao.findOne({ _id: id, id_conta });
        if (!doc) {
          return { ok: false, error: 'Interação não encontrada na conta atual.' };
        }
      
        const locValidation = await validateLocationLevels(args, id_conta);
        if (!locValidation.ok) return locValidation;
      
        const colValidation = await validateColaborador(args.id_colaborador, id_conta);
        if (!colValidation.ok) return colValidation;
      
        if (args.acoes != null) {
          const acoes = Array.isArray(args.acoes) ? args.acoes : [];
          const actionValidation = validateInteractionActions(acoes);
          if (!actionValidation.ok) return actionValidation;
      
          doc.acoes = acoes.map((acao) => ({
            _id: sanitizeText(acao._id) || undefined,
            movimento: sanitizeText(acao.movimento),
            equipamento: sanitizeText(acao.equipamento),
            serial: sanitizeText(acao.serial) || '',
            acao: sanitizeText(acao.acao),
            comando: sanitizeText(acao.comando) || ''
          }));
        }
      
        if (args.descricao != null) doc.descricao = sanitizeText(args.descricao);
        if (args.icone != null) doc.icone = sanitizeText(args.icone) || '';
        if (args.ativo != null) doc.ativo = args.ativo;
        if (args.id_colaborador != null) doc.id_colaborador = sanitizeText(args.id_colaborador);
      
        if (args.id_nivel_loc1 != null) doc.id_nivel_loc1 = sanitizeText(args.id_nivel_loc1);
        if (args.id_nivel_loc2 != null) doc.id_nivel_loc2 = sanitizeText(args.id_nivel_loc2);
        if (args.id_nivel_loc3 != null) doc.id_nivel_loc3 = sanitizeText(args.id_nivel_loc3);
        if (args.id_nivel_loc4 != null) doc.id_nivel_loc4 = sanitizeText(args.id_nivel_loc4);
      
        if (args.enviar_email != null) doc.enviar_email = args.enviar_email;
        if (args.enviar_whats != null) doc.enviar_whats = args.enviar_whats;
      
        await doc.save();
      
        return {
          ok: true,
          data: {
            _id: doc._id,
            descricao: doc.descricao,
            ativo: doc.ativo,
            enviar_email: doc.enviar_email,
            enviar_whats: doc.enviar_whats,
            total_acoes: Array.isArray(doc.acoes) ? doc.acoes.length : 0
          }
        };
      }

      case 'ranking_itens_no_endereco': {
        const id_localizacao = sanitizeText(args.id_localizacao);
        const nivel = Number(args.nivel || 1);
      
        if (!id_localizacao) {
          return { ok: false, error: 'id_localizacao é obrigatório.' };
        }
      
        const campoNivel = `id_nivel_loc${nivel}`;
      
        const endereco = await Localizacao.findOne({
          _id: id_localizacao,
          id_conta
        }).lean();
      
        if (!endereco) {
          return { ok: false, error: 'Endereço não encontrado na conta atual.' };
        }
      
        const pipeline = [
          {
            $match: {
              id_conta,
              [campoNivel]: id_localizacao
            }
          },
          {
            $group: {
              _id: '$id_categoria',
              quantidade: { $sum: 1 }
            }
          },
          {
            $lookup: {
              from: 'categorias',
              localField: '_id',
              foreignField: '_id',
              as: 'item'
            }
          },
          {
            $unwind: {
              path: '$item',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $project: {
              _id: 0,
              id_item_front: '$_id',
              descricao: { $ifNull: ['$item.descricao', 'Sem item'] },
              quantidade: 1
            }
          },
          {
            $sort: { quantidade: -1, descricao: 1 }
          }
        ];
      
        const ranking = await Item.aggregate(pipeline);
      
        const total = ranking.reduce((soma, r) => soma + r.quantidade, 0);
      
        const rankingFinal = ranking.map((r) => ({
          ...r,
          percentual: total > 0
            ? Number(((r.quantidade / total) * 100).toFixed(2))
            : 0
        }));
      
        return {
          ok: true,
          data: {
            endereco: {
              _id: endereco._id,
              descricao: endereco.descricao
            },
            total_skus: total,
            ranking: rankingFinal
          }
        };
      }

      case 'consultar_skus_por_endereco': {
        const id_localizacao = sanitizeText(args.id_localizacao);
        const nivel = Number(args.nivel || 1);
      
        if (!id_localizacao) {
          return { ok: false, error: 'id_localizacao é obrigatório.' };
        }
      
        const campoNivel = `id_nivel_loc${nivel}`;
      
        const endereco = await Localizacao.findOne({
          _id: id_localizacao,
          id_conta
        }).lean();
      
        if (!endereco) {
          return { ok: false, error: 'Endereço não encontrado na conta atual.' };
        }
      
        const total = await Item.countDocuments({
          id_conta,
          [campoNivel]: id_localizacao
        });
      
        return {
          ok: true,
          data: {
            endereco: {
              _id: endereco._id,
              descricao: endereco.descricao
            },
            total_skus: total
          }
        };
      }
      
      case 'ranking_itens_total': {
        const pipeline = [
          {
            $match: { id_conta }
          },
          {
            $group: {
              _id: '$id_categoria',
              quantidade: { $sum: 1 }
            }
          },
          {
            $lookup: {
              from: 'categorias',
              localField: '_id',
              foreignField: '_id',
              as: 'item'
            }
          },
          {
            $unwind: {
              path: '$item',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $project: {
              _id: 0,
              id_item_front: '$_id',
              descricao: { $ifNull: ['$item.descricao', 'Sem item'] },
              quantidade: 1
            }
          },
          {
            $sort: { quantidade: -1, descricao: 1 }
          }
        ];
      
        const ranking = await Item.aggregate(pipeline);
        const total = ranking.reduce((soma, r) => soma + r.quantidade, 0);
      
        return {
          ok: true,
          data: {
            total_skus: total,
            ranking: ranking.map((r) => ({
              ...r,
              percentual: total > 0
                ? Number(((r.quantidade / total) * 100).toFixed(2))
                : 0
            }))
          }
        };
      }
      
      case 'ranking_categorias_no_endereco': {
        const id_localizacao = sanitizeText(args.id_localizacao);
        const nivel = Number(args.nivel || 1);
      
        if (!id_localizacao) {
          return { ok: false, error: 'id_localizacao é obrigatório.' };
        }
      
        const campoNivel = `id_nivel_loc${nivel}`;
      
        const endereco = await Localizacao.findOne({
          _id: id_localizacao,
          id_conta
        }).lean();
      
        if (!endereco) {
          return { ok: false, error: 'Endereço não encontrado na conta atual.' };
        }
      
        const pipeline = [
          {
            $match: {
              id_conta,
              [campoNivel]: id_localizacao
            }
          },
          {
            $group: {
              _id: '$id_categoria_reg1',
              quantidade: { $sum: 1 }
            }
          },
          {
            $lookup: {
              from: 'categoriaitems',
              localField: '_id',
              foreignField: '_id',
              as: 'categoria'
            }
          },
          {
            $unwind: {
              path: '$categoria',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $project: {
              _id: 0,
              id_categoria_front: '$_id',
              descricao: { $ifNull: ['$categoria.descricao', 'Sem categoria'] },
              quantidade: 1
            }
          },
          {
            $sort: { quantidade: -1, descricao: 1 }
          }
        ];
      
        const ranking = await Item.aggregate(pipeline);
        const total = ranking.reduce((soma, r) => soma + r.quantidade, 0);
      
        return {
          ok: true,
          data: {
            endereco: {
              _id: endereco._id,
              descricao: endereco.descricao
            },
            total_skus: total,
            ranking: ranking.map((r) => ({
              ...r,
              percentual: total > 0
                ? Number(((r.quantidade / total) * 100).toFixed(2))
                : 0
            }))
          }
        };
      }
      
      case 'ranking_enderecos_por_skus': {
        const nivel = Number(args.nivel || 1);
        const campoNivel = `id_nivel_loc${nivel}`;
      
        const pipeline = [
          {
            $match: {
              id_conta,
              [campoNivel]: { $nin: [null, ''] }
            }
          },
          {
            $group: {
              _id: `$${campoNivel}`,
              quantidade: { $sum: 1 }
            }
          },
          {
            $lookup: {
              from: 'localizacaos',
              localField: '_id',
              foreignField: '_id',
              as: 'endereco'
            }
          },
          {
            $unwind: {
              path: '$endereco',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $project: {
              _id: 0,
              id_localizacao: '$_id',
              descricao: { $ifNull: ['$endereco.descricao', 'Sem endereço'] },
              quantidade: 1
            }
          },
          {
            $sort: { quantidade: -1, descricao: 1 }
          }
        ];
      
        const ranking = await Item.aggregate(pipeline);
        const total = ranking.reduce((soma, r) => soma + r.quantidade, 0);
      
        return {
          ok: true,
          data: {
            total_skus: total,
            ranking: ranking.map((r) => ({
              ...r,
              percentual: total > 0
                ? Number(((r.quantidade / total) * 100).toFixed(2))
                : 0
            }))
          }
        };
      }
      
      case 'comparativo_enderecos_item': {
        const id_categoria = sanitizeText(args.id_categoria);
        const nivel = Number(args.nivel || 1);
      
        if (!id_categoria) {
          return { ok: false, error: 'id_categoria é obrigatório.' };
        }
      
        const itemPrincipal = await Categoria.findOne({
          _id: id_categoria,
          id_conta
        }).lean();
      
        if (!itemPrincipal) {
          return { ok: false, error: 'Item principal não encontrado na conta atual.' };
        }
      
        const campoNivel = `id_nivel_loc${nivel}`;
      
        const pipeline = [
          {
            $match: {
              id_conta,
              id_categoria,
              [campoNivel]: { $nin: [null, ''] }
            }
          },
          {
            $group: {
              _id: `$${campoNivel}`,
              quantidade: { $sum: 1 }
            }
          },
          {
            $lookup: {
              from: 'localizacaos',
              localField: '_id',
              foreignField: '_id',
              as: 'endereco'
            }
          },
          {
            $unwind: {
              path: '$endereco',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $project: {
              _id: 0,
              id_localizacao: '$_id',
              descricao: { $ifNull: ['$endereco.descricao', 'Sem endereço'] },
              quantidade: 1
            }
          },
          {
            $sort: { quantidade: -1, descricao: 1 }
          }
        ];
      
        const ranking = await Item.aggregate(pipeline);
        const total = ranking.reduce((soma, r) => soma + r.quantidade, 0);
      
        return {
          ok: true,
          data: {
            item: {
              _id: itemPrincipal._id,
              descricao: itemPrincipal.descricao
            },
            total_skus: total,
            ranking: ranking.map((r) => ({
              ...r,
              percentual: total > 0
                ? Number(((r.quantidade / total) * 100).toFixed(2))
                : 0
            }))
          }
        };
      }

      default:
        return {
          ok: false,
          error: `Tool não implementada: ${name}`
        };
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
      const toolCalls = items.filter((item) => item.type === 'function_call');

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
          if (content.type === 'output_text' && content.text) {
            texts.push(content.text);
          }
        }
      }
    }

    return texts.join('\n').trim();
  }

  app.post('/ia/chat', async (req, res) => {
    try {
      const {
        message,
        mensagem,
        history = [],
        id_conta,
        session_id
      } = req.body || {};

      const finalMessage = sanitizeText(message || mensagem);

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({
          ok: false,
          error: 'OPENAI_API_KEY não configurada no servidor.'
        });
      }

      if (!id_conta) {
        return res.status(400).json({
          ok: false,
          error: 'id_conta é obrigatório para utilizar o assistente.'
        });
      }

      if (!finalMessage) {
        return res.status(400).json({
          ok: false,
          error: 'message é obrigatória.'
        });
      }

      const conta = await Conta.findById(id_conta).lean();
      if (!conta) {
        return res.status(404).json({
          ok: false,
          error: 'Conta não encontrada.'
        });
      }

      const session = getSession(session_id, id_conta);
      const overview = await loadAccountOverview(id_conta);

      const normalizedHistory = Array.isArray(history)
        ? history
          .slice(-MAX_HISTORY)
          .map((h) => ({
            role: h.role === 'assistant' ? 'assistant' : 'user',
            content: sanitizeText(h.content)
          }))
          .filter((h) => h.content)
        : [];

      const input = [
        ...normalizedHistory,
        { role: 'user', content: finalMessage }
      ];

      const response = await runAgentLoop({
        input,
        session,
        overview
      });

      const reply =
        extractText(response) ||
        'Consegui processar sua solicitação, mas não consegui montar uma resposta textual adequada.';

      return res.json({
        ok: true,
        reply,
        meta: {
          session_id: session.id
        }
      });
    } catch (error) {
      console.error('Erro em /ia/chat:', error);

      return res.status(500).json({
        ok: false,
        error: 'Falha ao processar a solicitação do assistente.',
        details: error && error.message ? error.message : 'erro interno'
      });
    }
  });
};