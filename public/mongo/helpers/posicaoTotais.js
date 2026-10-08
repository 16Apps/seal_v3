/**
 * Totais e status da posição.
 * - total_itens: previsto (informado) ou fallback itens.length
 * - total_concluido: qtd de itens com status === 'concluido'
 * - status: pendente | parcial | concluido (não força aberta/partida)
 */

function contarConcluidos(itens) {
    const lista = Array.isArray(itens) ? itens : [];
    let n = 0;
    for (let i = 0; i < lista.length; i++) {
        const it = lista[i];
        if (!it) continue;
        if (String(it.status || '').toLowerCase() === 'concluido') n += 1;
    }
    return n;
}

/**
 * @param {object} posicao - documento ou plain object com itens / total_itens
 * @param {object} [opts]
 * @param {number} [opts.total_itens_informado] - sobrescreve/atualiza o previsto (ex.: body da integração)
 * @returns {{ total_itens: number, total_concluido: number, status: string }}
 */
function normalizarTotaisPosicao(posicao, opts) {
    opts = opts || {};
    const itens = (posicao && posicao.itens) || [];
    const totalConcluido = contarConcluidos(itens);

    // Nunca reduz o previsto já gravado; usa o maior entre: informado, armazenado, itens.length
    const informadoBody = opts.total_itens_informado != null
        ? Number(opts.total_itens_informado)
        : NaN;
    const armazenado = Number(posicao && posicao.total_itens);
    const candidatos = [itens.length];
    if (Number.isFinite(informadoBody) && informadoBody > 0) candidatos.push(informadoBody);
    if (Number.isFinite(armazenado) && armazenado > 0) candidatos.push(armazenado);
    const totalItens = Math.max.apply(null, candidatos);

    let status = 'pendente';
    if (totalItens > 0 && totalConcluido >= totalItens) status = 'concluido';
    else if (totalConcluido > 0) status = 'parcial';

    return {
        total_itens: totalItens,
        total_concluido: totalConcluido,
        status: status
    };
}

/**
 * Aplica totais no objeto posicao.
 * Preserva status aberta/partida (fluxo operacional), a menos que opts.forcarStatus.
 */
function aplicarTotaisNaPosicao(posicao, opts) {
    opts = opts || {};
    if (!posicao) return null;

    const t = normalizarTotaisPosicao(posicao, opts);
    posicao.total_itens = t.total_itens;
    posicao.total_concluido = t.total_concluido;

    const stAtual = String(posicao.status || '').toLowerCase();
    const preservar = !opts.forcarStatus && (stAtual === 'aberta' || stAtual === 'partida');
    if (!preservar) {
        posicao.status = t.status;
    }

    return {
        total_itens: posicao.total_itens,
        total_concluido: posicao.total_concluido,
        status: posicao.status
    };
}

/** Compat: status só a partir dos itens (legado) — usa totais quando possível */
function statusOrdemPorItensPosicao(itens, posicaoRef) {
    const base = posicaoRef && typeof posicaoRef === 'object'
        ? { ...posicaoRef, itens: itens || posicaoRef.itens }
        : { itens: itens || [] };
    return normalizarTotaisPosicao(base).status;
}

module.exports = {
    contarConcluidos,
    normalizarTotaisPosicao,
    aplicarTotaisNaPosicao,
    statusOrdemPorItensPosicao
};
