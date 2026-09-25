const fs = require('fs');
const axios = require('axios'); // HTTP para OpenAI
const moment = require('moment');
const mongoose = require('mongoose');

// Exemplos de modelos internos do RTI (ajuste conforme necessário)
const item = require('../models/item');
const registro = require('../models/registro');

/**
 * Helper para chamar a API de chat completions da OpenAI com suporte a function calling.
 * Aqui usamos Chat Completions por ser estável; a migração para Responses mantém a mesma
 * ideia de tools/function calling.
 */
async function callOpenAIWithTools({ history, userMessage, id_conta, toolResults }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY não configurada nas variáveis de ambiente.');
  }

  const systemPrompt = `
Você é um assistente especializado no sistema Seal RTI (rastreamento e telemetria de itens).
Seu papel:
- Entender o que o usuário deseja fazer no RTI (consultar, cadastrar, entender regras, etc.).
- Fazer perguntas de esclarecimento quando necessário.
- Quando precisar de dados reais ou executar ações, usar as funções disponíveis (tools) em vez de inventar.
- Explicar para o usuário, em português claro e curto, o que você está fazendo e quais próximos passos ele precisa dar.

Contexto importante:
- Cada conversa está associada a uma conta (id_conta: ${id_conta || 'desconhecido'}).
- Você nunca deve expor IDs internos diretamente se não for necessário; prefira descrições.
- Se uma função retornar erro, explique ao usuário o que aconteceu e sugira alternativas.
  `.trim();

  const messages = [
    { role: 'system', content: systemPrompt },
    ...(history || [])
      .filter(m => m && m.role && m.content)
      .map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ];

  // Definições de tools (functions) que o modelo pode chamar.
  const tools = [
    {
      type: 'function',
      function: {
        name: 'listar_itens_por_conta',
        description:
          'Lista até 20 itens cadastrados para uma conta no RTI, opcionalmente filtrando por trecho do nome/descrição.',
        parameters: {
          type: 'object',
          properties: {
            id_conta: {
              type: 'string',
              description: 'ID da conta do RTI em que o usuário está logado.'
            },
            termo_busca: {
              type: 'string',
              description: 'Trecho do nome/descrição para filtrar itens (opcional).'
            }
          },
          required: ['id_conta']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'resumo_registros_ultimas_horas',
        description:
          'Retorna um resumo de quantos registros (leituras) ocorreram nas últimas N horas para uma conta.',
        parameters: {
          type: 'object',
          properties: {
            id_conta: {
              type: 'string',
              description: 'ID da conta do RTI.'
            },
            horas: {
              type: 'integer',
              description: 'Quantidade de horas para trás a partir de agora.',
              default: 24,
              minimum: 1,
              maximum: 168
            }
          },
          required: ['id_conta']
        }
      }
    }
  ];

  const body = {
    model: 'gpt-4.1-mini',
    messages,
    tools,
    tool_choice: 'auto'
  };

  if (toolResults && toolResults.length > 0) {
    body.messages = [
      ...body.messages,
      ...toolResults.map(r => ({
        role: 'tool',
        tool_call_id: r.tool_call_id,
        name: r.name,
        content: JSON.stringify(r.result)
      }))
    ];
  }

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    body,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }
  );

  return response.data;
}

// Executores das funções que o modelo pode chamar
async function executarTool_ListarItensPorConta(args) {
  const { id_conta, termo_busca } = args;

  const query = { id_conta };
  if (termo_busca && termo_busca.trim() !== '') {
    query.descricao = { $regex: termo_busca.trim(), $options: 'i' };
  }

  const itens = await item
    .find(query)
    .limit(20)
    .select('_id descricao tag id_conta')
    .lean();

  return {
    total_encontrado: itens.length,
    itens: itens.map(i => ({
      id: i._id,
      descricao: i.descricao,
      tag: i.tag
    }))
  };
}

async function executarTool_ResumoRegistrosUltimasHoras(args) {
  const { id_conta, horas = 24 } = args;

  const ate = new Date();
  const de = moment(ate).subtract(horas, 'hours').toDate();

  const total = await registro.countDocuments({
    id_conta,
    data_registro: { $gte: de, $lte: ate }
  });

  return {
    id_conta,
    horas,
    periodo_inicio: de,
    periodo_fim: ate,
    total_registros: total
  };
}

module.exports = (app, dbConnection) => {
  /**
   * Rota principal de chat da IA.
   * Espera:
   *  - message: string (fala atual do usuário)
   *  - history: [{ role: 'user' | 'assistant', content: string }]
   *  - id_conta: string (opcional, mas recomendado)
   */
  app.post('/ia/chat', async (req, res) => {
    try {
      const { message, history, id_conta } = req.body || {};

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'message é obrigatório.' });
      }

      // 1ª chamada para a OpenAI (o modelo pode ou não acionar tools)
      const primeiraResposta = await callOpenAIWithTools({
        history: history || [],
        userMessage: message,
        id_conta: id_conta || null
      });

      const choice = primeiraResposta.choices?.[0];
      if (!choice) {
        return res.status(500).json({ error: 'Resposta inesperada da OpenAI.' });
      }

      const msg = choice.message;

      // Se não houve tool_call, já devolve a resposta direta para o usuário
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return res.json({
          reply: msg.content || 'Não consegui gerar uma resposta no momento.',
          debug: {
            used_tools: false
          }
        });
      }

      // Houve tool_call: executa as funções requisitadas
      const toolResults = [];

      for (const tc of msg.tool_calls) {
        const name = tc.function?.name;
        let args = {};
        try {
          args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch (err) {
          args = {};
        }

        let result;
        try {
          if (name === 'listar_itens_por_conta') {
            result = await executarTool_ListarItensPorConta(args);
          } else if (name === 'resumo_registros_ultimas_horas') {
            result = await executarTool_ResumoRegistrosUltimasHoras(args);
          } else {
            result = { error: `Função ${name} não implementada no backend.` };
          }
        } catch (err) {
          console.error('Erro ao executar tool', name, err);
          result = {
            error: `Erro ao executar a função ${name}.`,
            details: err.message
          };
        }

        toolResults.push({
          tool_call_id: tc.id,
          name,
          result
        });
      }

      // 2ª chamada para a OpenAI, agora com os resultados das tools
      const segundaResposta = await callOpenAIWithTools({
        history: [...(history || []), { role: 'user', content: message }],
        userMessage: 'Use os resultados das chamadas de função anteriores para responder ao usuário de forma clara.',
        id_conta: id_conta || null,
        toolResults
      });

      const finalChoice = segundaResposta.choices?.[0];
      const finalMsg = finalChoice?.message;

      return res.json({
        reply: finalMsg?.content || 'Não consegui gerar uma resposta no momento.',
        debug: {
          used_tools: true,
          tools_called: toolResults.map(t => t.name)
        }
      });
    } catch (err) {
      console.error('Erro em /ia/chat', err);
      return res.status(500).json({
        error: 'Erro ao processar a interação com o assistente.',
        details: err.message
      });
    }
  });
};