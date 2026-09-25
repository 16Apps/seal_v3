app.controller('itemCtrl', function ($scope, $http, params, uteisService) {

    $scope._regConta = {};
    $scope._regColaborador = []
    $scope._listItens = []
    $scope._listItensBase = []
    $scope._pesquisa = ''
    $scope._filtroLocalizacao = {
        id_nivel_loc1: '',
        id_nivel_loc2: '',
        id_nivel_loc3: '',
        id_nivel_loc4: '',
        agrupado: '',
        status: ''
    };
    $scope._listNivel1Filtro = [];
    $scope._listNivel2Filtro = [];
    $scope._listNivel3Filtro = [];
    $scope._listNivel4Filtro = [];
    $scope._listItensAgrupados = [];
    $scope._agrupadoSelecionado = '';
    $scope._listOcupacaoLocais = [];
    $scope._ocupacaoSelecionada = '';
    $scope._carregandoOcupacao = false;
    $scope._filtroPermanencia = {
        dias: 0,
        horas: 0,
        minutos: 0
    };
    $scope._totaisAgrupamento = {
        total: 0,
        ativo: 0,
        emtransporte: 0,
        perda: 0
    };
    $scope.sortField = 'id_categoria.descricao';
    $scope.sortReverse = false;
    $scope._labelInf1 = '';

    var modalInstance = undefined;

    $scope.$watch('$viewContentLoaded', async function () {
        $scope._regConta = uteisService.getCookie('_conta');
        $scope._regConta['_logo'] = '../assets/images/logo_default.fw.png'
        if ($scope._regConta.logo && $scope._regConta.logo.includes('logo_conta') == false) {
            let _url = uteisService.apiUrl_();
            $scope._regConta._logo = _url + '/image/' + $scope._regConta.logo;
        };

        $scope._regConta = uteisService.normalizarConta($scope._regConta);

        $scope._regColaborador = uteisService.getCookie('_colaborador');

        $scope.onCarregaRegistros()
    });

    $scope.onCarregaRegistros = async function () {

        // Alinha id_categoria_reg1 a partir de categoria.id_nivel_cat1 (quando estiver vazio)
        try {
            await uteisService.getBase(
                '/_bd/item/alinhar-categoria-reg1?id_conta=' + $scope._regConta._id
            );
        } catch (e) {
            console.warn('Falha ao alinhar id_categoria_reg1 dos itens:', e);
        }

        let _url = '/_bd?c=item&id_conta=' + $scope._regConta._id;
        _url += '&pop=id_categoria&pop=id_nivel_loc1&pop=id_nivel_loc2&pop=id_nivel_loc3&pop=id_nivel_loc4';
        _url += '&pop=id_categoria_reg1'
        _url += '&_sort=registro_atual.data_registro'

        await uteisService.getBase(_url)
            .then((res) => {

                $scope._labelInf1 = '';

                res.map((item) => {

                    const categoria = item.id_categoria;
                    const labelInf1 = categoria && typeof categoria === 'object'
                        ? categoria.labelInf1
                        : '';
                    if (!$scope._labelInf1 && labelInf1) {
                        $scope._labelInf1 = labelInf1;
                    }

                    item['_foto'] = '../assets/images/icon_cadastro.fw.png'

                    if (item.foto && !item.foto.includes('assets')) {
                        item._foto = uteisService.apiUrl_() + '/image/' + item.foto
                    } else {
                        if (item.id_categoria && item.id_categoria.foto && !item.id_categoria.foto.includes('assets')) {
                            item._foto = uteisService.apiUrl_() + '/image/' + item.id_categoria.foto
                        }
                    }

        
                });


                $scope._listItensBase = res
                $scope.atualizarOpcoesFiltroLocalizacao();
                $scope.onPesquisa();
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });
    };

    const normaliza = (v) =>
        (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    const getId = (obj) => (obj && obj._id ? obj._id : '');

    const getLocalizacaoTexto = (item) =>
        normaliza(
            [
                item.id_nivel_loc1?.descricao,
                item.id_nivel_loc2?.descricao,
                item.id_nivel_loc3?.descricao,
                item.id_nivel_loc4?.descricao
            ].filter(Boolean).join(' ')
        );

    const getLabelStatus = (status) => {
        const s = normaliza(status);
        if (s === 'ativo') return 'Ativo';
        if (s === 'inativo') return 'Inativo';
        if (s === 'ausente') return 'Ausente';
        if (s === 'perda' || s === 'perca') return 'Ausente';
        if (s === 'emtransporte') return 'Em Transporte';
        if (s === 'manutencao') return 'Manutenção';
        if (s === 'descartado') return 'Descartado';
        if (!s) return 'Sem Status';
        return status;
    };

    const getChaveStatus = (status) => {
        const s = normaliza(status);
        if (s === 'perca' || s === 'ausente') return 'perda';
        return s || '__sem_status__';
    };

    const getValorAgrupamento = (item, agrupado) => {
        if (agrupado === 'sku') {
            const cat = item.id_categoria;
            return {
                chave: getId(cat) || '__sem_sku__',
                descricao: cat?.descricao || 'Sem Associação'
            };
        }
        if (agrupado === 'tipo') {
            const reg = item.id_categoria_reg1;
            const label = $scope._regConta?.params_nomenclatura_itens?.categorias || 'Tipo';
            return {
                chave: getId(reg) || '__sem_tipo__',
                descricao: reg?.descricao || ('Sem ' + label)
            };
        }
        if (agrupado === 'inf1') {
            const valor = String(item.id_externo || item.inf_compl1 || '').trim();
            return {
                chave: valor || '__sem_inf1__',
                descricao: valor || 'Sem Inf. 1'
            };
        }
        if (agrupado === 'status') {
            return {
                chave: getChaveStatus(item.status),
                descricao: getLabelStatus(item.status)
            };
        }
        return { chave: '', descricao: '' };
    };

    const itemPertenceLocal = (item, idLocal) => {
        if (!idLocal) return true;
        return [item.id_nivel_loc1, item.id_nivel_loc2, item.id_nivel_loc3, item.id_nivel_loc4]
            .some((loc) => getId(loc) === idLocal);
    };

    const getContextoOcupacao = (filtro) => {
        if (filtro.id_nivel_loc4) return { paiId: filtro.id_nivel_loc4, buscarFilhos: false };
        if (filtro.id_nivel_loc3) return { paiId: filtro.id_nivel_loc3, buscarFilhos: true };
        if (filtro.id_nivel_loc2) return { paiId: filtro.id_nivel_loc2, buscarFilhos: true };
        if (filtro.id_nivel_loc1) return { paiId: filtro.id_nivel_loc1, buscarFilhos: true };
        return null;
    };

    const montarCardOcupacao = (dados) => ({
        chave: dados.id_localizacao,
        descricao: dados.descricao || dados.tag || 'Sem descrição',
        tag: dados.tag || '',
        total: Number(dados.total_itens) || 0,
        capacidade_maxima: Number(dados.capacidade_maxima) || 0,
        capacidade_minima: Number(dados.capacidade_minima) || 0,
        percentual: dados.percentual != null ? Number(dados.percentual) : null,
        excede: !!dados.excede,
        abaixoMin: !!dados.abaixoMin,
        vagas_livres: dados.vagas_livres != null ? Number(dados.vagas_livres) : null
    });

    const calcularPercentualOcupacao = (total, max) => {
        if (!max || max <= 0) return null;
        return Math.round((total / max) * 10000) / 100;
    };

    const parseDataPermanencia = (data) => {
        if (!data) return null;
        let inicio = moment(data, ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DDTHH:mm:ss', moment.ISO_8601], true);
        if (!inicio.isValid()) inicio = moment(data);
        if (!inicio.isValid()) return null;
        return inicio.subtract(3, 'hours');
    };

    const getMsPermanenciaItem = (item) => {
        const inicio = parseDataPermanencia(item.registro_atual?.data_permanecia);
        if (!inicio) return null;
        const agora = moment().subtract(3, 'hours');
        const diff = agora.diff(inicio);
        return diff < 0 ? 0 : diff;
    };

    const getMsFiltroPermanencia = () => {
        const p = $scope._filtroPermanencia || {};
        const dias = Math.max(0, parseInt(p.dias, 10) || 0);
        const horas = Math.max(0, parseInt(p.horas, 10) || 0);
        const minutos = Math.max(0, parseInt(p.minutos, 10) || 0);
        return ((dias * 24 + horas) * 60 + minutos) * 60 * 1000;
    };

    const getIdLocEfetiva = (item) => {
        if (getId(item.id_nivel_loc4)) return getId(item.id_nivel_loc4);
        if (getId(item.id_nivel_loc3)) return getId(item.id_nivel_loc3);
        if (getId(item.id_nivel_loc2)) return getId(item.id_nivel_loc2);
        if (getId(item.id_nivel_loc1)) return getId(item.id_nivel_loc1);
        return '__sem_local__';
    };

    const getDescricaoLocEfetiva = (item) => {
        const loc = item.id_nivel_loc4 || item.id_nivel_loc3 || item.id_nivel_loc2 || item.id_nivel_loc1;
        return loc?.descricao || 'Sem localização';
    };

    const formatarDuracaoMs = (diffMs) => {
        if (diffMs == null || diffMs < 0) return '';
        if (diffMs < 60000) return 'menos de 1 minuto';

        const dur = moment.duration(diffMs);
        const dias = Math.floor(dur.asDays());
        const horas = dur.hours();
        const minutos = dur.minutes();
        const partes = [];

        if (dias > 0) partes.push(dias + (dias === 1 ? ' dia' : ' dias'));
        if (horas > 0) partes.push(horas + (horas === 1 ? ' hora' : ' horas'));
        if (minutos > 0 && (dias > 0 || horas > 0 || diffMs < 3600000)) {
            partes.push(minutos + (minutos === 1 ? ' minuto' : ' minutos'));
        }
        if (!partes.length) return 'menos de 1 minuto';
        if (partes.length === 1) return partes[0];
        if (partes.length === 2) return partes[0] + ' e ' + partes[1];
        return partes.slice(0, -1).join(', ') + ' e ' + partes[partes.length - 1];
    };

    const montarListaAgrupadosPermanencia = (itens) => {
        const mapa = new Map();

        itens.forEach((item) => {
            const chave = getIdLocEfetiva(item);
            const descricao = getDescricaoLocEfetiva(item);
            const msPerm = getMsPermanenciaItem(item);

            if (!mapa.has(chave)) {
                mapa.set(chave, {
                    chave,
                    descricao,
                    subtitulo: '',
                    total: 0,
                    totalAtivo: 0,
                    totalAlerta: 0,
                    totalProblema: 0,
                    permanenciaMaxMs: 0,
                    ultimaData: null
                });
            }

            const grupo = mapa.get(chave);
            grupo.total += 1;

            const tipoStatus = classificarStatusGrupo(item.status);
            if (tipoStatus === 'ativo') grupo.totalAtivo += 1;
            else if (tipoStatus === 'alerta') grupo.totalAlerta += 1;
            else grupo.totalProblema += 1;

            if (msPerm != null && msPerm > grupo.permanenciaMaxMs) {
                grupo.permanenciaMaxMs = msPerm;
                grupo.subtitulo = 'até ' + formatarDuracaoMs(msPerm);
            }

            const dt = item.registro_atual?.data_registro || item.registro_atual?.data_permanecia;
            if (dt && (!grupo.ultimaData || moment(dt).isAfter(moment(grupo.ultimaData)))) {
                grupo.ultimaData = dt;
            }
        });

        return Array.from(mapa.values()).sort((a, b) => {
            if (b.total !== a.total) return b.total - a.total;
            return a.descricao.localeCompare(b.descricao, 'pt-BR', { numeric: true });
        });
    };

    const filtrarItens = (ignorarSelecaoLateral) => {
        const pesquisa = $scope._pesquisa ? normaliza($scope._pesquisa) : '';
        const filtro = $scope._filtroLocalizacao;
        const agrupado = filtro.agrupado;
        const chaveSelecionada = $scope._agrupadoSelecionado;
        const ocupacaoAtiva = $scope.modoOcupacaoAtivo();
        const permanenciaAtiva = $scope.ehModoPermanencia();
        const minPermanenciaMs = getMsFiltroPermanencia();

        return $scope._listItensBase.filter((item) => {
            const id1 = getId(item.id_nivel_loc1);
            const id2 = getId(item.id_nivel_loc2);
            const id3 = getId(item.id_nivel_loc3);
            const id4 = getId(item.id_nivel_loc4);

            const matchNivel =
                (!filtro.id_nivel_loc1 || id1 === filtro.id_nivel_loc1) &&
                (!filtro.id_nivel_loc2 || id2 === filtro.id_nivel_loc2) &&
                (!filtro.id_nivel_loc3 || id3 === filtro.id_nivel_loc3) &&
                (!filtro.id_nivel_loc4 || id4 === filtro.id_nivel_loc4);

            if (!matchNivel) return false;

            if (filtro.status) {
                const statusItem = normaliza(item.status);
                const statusFiltro = normaliza(filtro.status);
                const matchStatus = statusFiltro === 'perda'
                    ? (statusItem === 'perda' || statusItem === 'perca')
                    : statusItem === statusFiltro;
                if (!matchStatus) return false;
            }

            if (permanenciaAtiva) {
                const msPerm = getMsPermanenciaItem(item);
                if (msPerm == null) return false;
                if (minPermanenciaMs > 0 && msPerm < minPermanenciaMs) return false;
            }

            if (!ignorarSelecaoLateral && ocupacaoAtiva && $scope._ocupacaoSelecionada) {
                if (!itemPertenceLocal(item, $scope._ocupacaoSelecionada)) return false;
            }

            if (!ignorarSelecaoLateral && permanenciaAtiva && chaveSelecionada) {
                if (getIdLocEfetiva(item) !== chaveSelecionada) return false;
            }

            if (!ignorarSelecaoLateral && !ocupacaoAtiva && !permanenciaAtiva && agrupado && chaveSelecionada) {
                const { chave } = getValorAgrupamento(item, agrupado);
                if (chave !== chaveSelecionada) return false;
            }

            if (pesquisa === '') return true;

            const catDesc = normaliza(item.id_categoria?.descricao);
            const catItemDesc = normaliza(item.id_categoria_reg1?.descricao);
            const tag = normaliza(item.tag);
            const id_externo = normaliza(item.id_externo);
            const localizacaoTexto = getLocalizacaoTexto(item);
            const inf1 = normaliza(item.inf_compl1);
            const inf2 = normaliza(item.inf_compl2);
            const inf3 = normaliza(item.inf_compl3);
            const inf4 = normaliza(item.inf_compl4);

            return (
                catDesc.includes(pesquisa) ||
                catItemDesc.includes(pesquisa) ||
                id_externo.includes(pesquisa) ||
                tag.includes(pesquisa) ||
                inf1.includes(pesquisa) ||
                inf2.includes(pesquisa) ||
                inf3.includes(pesquisa) ||
                inf4.includes(pesquisa) ||
                localizacaoTexto.includes(pesquisa)
            );
        });
    };

    const classificarStatusGrupo = (status) => {
        const s = normaliza(status);
        if (s === 'ativo') return 'ativo';
        if (s === 'emtransporte' || s === 'manutencao') return 'alerta';
        return 'problema';
    };

    const enriquecerGrupo = (grupo, item, agrupado) => {
        grupo.foto = item._foto || grupo.foto;
        grupo.codigo = item.id_externo || item.tag || grupo.codigo;

        if (agrupado === 'sku') {
            grupo.subtitulo = item.id_categoria_reg1?.descricao || item.inf_compl1 || '';
        } else if (agrupado === 'tipo') {
            grupo.subtitulo = item.id_categoria?.descricao || '';
        } else if (agrupado === 'inf1') {
            grupo.subtitulo = item.id_categoria?.descricao || item.id_categoria_reg1?.descricao || '';
        }
    };

    const atualizarUltimaDataGrupo = (grupo, item) => {
        const dt = item.registro_atual?.data_registro || item.registro_atual?.data_permanecia;
        if (!dt) return;
        if (!grupo.ultimaData || moment(dt).isAfter(moment(grupo.ultimaData))) {
            grupo.ultimaData = dt;
        }
    };

    const montarListaAgrupados = (itens, agrupado) => {
        const mapa = new Map();

        itens.forEach((item) => {
            const { chave, descricao } = getValorAgrupamento(item, agrupado);
            if (!mapa.has(chave)) {
                mapa.set(chave, {
                    chave,
                    descricao,
                    subtitulo: '',
                    codigo: '',
                    foto: '../assets/images/icon_cadastro.fw.png',
                    total: 0,
                    totalAtivo: 0,
                    totalAlerta: 0,
                    totalProblema: 0,
                    ultimaData: null
                });
            }

            const grupo = mapa.get(chave);
            const primeiroDoGrupo = grupo.total === 0;
            grupo.total += 1;

            const tipoStatus = classificarStatusGrupo(item.status);
            if (tipoStatus === 'ativo') grupo.totalAtivo += 1;
            else if (tipoStatus === 'alerta') grupo.totalAlerta += 1;
            else grupo.totalProblema += 1;

            if (primeiroDoGrupo) enriquecerGrupo(grupo, item, agrupado);
            atualizarUltimaDataGrupo(grupo, item);
        });

        return Array.from(mapa.values()).sort((a, b) =>
            a.descricao.localeCompare(b.descricao, 'pt-BR', { numeric: true })
        );
    };

    const calcularTotaisAgrupamento = (itens) => {
        const totais = {
            total: itens.length,
            ativo: 0,
            emtransporte: 0,
            perda: 0
        };

        itens.forEach((item) => {
            const s = normaliza(item.status);
            if (s === 'ativo') totais.ativo += 1;
            else if (s === 'emtransporte') totais.emtransporte += 1;
            else if (s === 'perda' || s === 'perca' || s === 'ausente') totais.perda += 1;
        });

        return totais;
    };

    const buscarNivelFiltro = (lista, id) =>
        (lista || []).find((n) => n && n._id === id);

    $scope.getFiltrosLocalizacaoAtivos = function () {
        const f = $scope._filtroLocalizacao;
        const niveis = [];

        const n1 = buscarNivelFiltro($scope._listNivel1Filtro, f.id_nivel_loc1);
        const n2 = buscarNivelFiltro($scope._listNivel2Filtro, f.id_nivel_loc2);
        const n3 = buscarNivelFiltro($scope._listNivel3Filtro, f.id_nivel_loc3);
        const n4 = buscarNivelFiltro($scope._listNivel4Filtro, f.id_nivel_loc4);

        if (n1?.descricao) niveis.push({ nivel: 1, descricao: n1.descricao });
        if (n2?.descricao) niveis.push({ nivel: 2, descricao: n2.descricao });
        if (n3?.descricao) niveis.push({ nivel: 3, descricao: n3.descricao });
        if (n4?.descricao) niveis.push({ nivel: 4, descricao: n4.descricao });

        return niveis;
    };

    $scope.atualizarOpcoesFiltroLocalizacao = function () {
        const idsUnicos = {
            n1: new Set(),
            n2: new Set(),
            n3: new Set(),
            n4: new Set()
        };

        const opcoes = {
            n1: [],
            n2: [],
            n3: [],
            n4: []
        };

        $scope._listItensBase.forEach((item) => {
            const id1 = getId(item.id_nivel_loc1);
            const id2 = getId(item.id_nivel_loc2);
            const id3 = getId(item.id_nivel_loc3);
            const id4 = getId(item.id_nivel_loc4);

            if (id1 && !idsUnicos.n1.has(id1)) {
                idsUnicos.n1.add(id1);
                opcoes.n1.push(item.id_nivel_loc1);
            }

            if ($scope._filtroLocalizacao.id_nivel_loc1 && id1 !== $scope._filtroLocalizacao.id_nivel_loc1) return;
            if (id2 && !idsUnicos.n2.has(id2)) {
                idsUnicos.n2.add(id2);
                opcoes.n2.push(item.id_nivel_loc2);
            }

            if ($scope._filtroLocalizacao.id_nivel_loc2 && id2 !== $scope._filtroLocalizacao.id_nivel_loc2) return;
            if (id3 && !idsUnicos.n3.has(id3)) {
                idsUnicos.n3.add(id3);
                opcoes.n3.push(item.id_nivel_loc3);
            }

            if ($scope._filtroLocalizacao.id_nivel_loc3 && id3 !== $scope._filtroLocalizacao.id_nivel_loc3) return;
            if (id4 && !idsUnicos.n4.has(id4)) {
                idsUnicos.n4.add(id4);
                opcoes.n4.push(item.id_nivel_loc4);
            }
        });

        $scope._listNivel1Filtro = opcoes.n1;
        $scope._listNivel2Filtro = opcoes.n2;
        $scope._listNivel3Filtro = opcoes.n3;
        $scope._listNivel4Filtro = opcoes.n4;
    };

    $scope.onFiltroLocalizacaoChange = function (nivel) {
        if (nivel === 1) {
            $scope._filtroLocalizacao.id_nivel_loc2 = '';
            $scope._filtroLocalizacao.id_nivel_loc3 = '';
            $scope._filtroLocalizacao.id_nivel_loc4 = '';
        }
        if (nivel === 2) {
            $scope._filtroLocalizacao.id_nivel_loc3 = '';
            $scope._filtroLocalizacao.id_nivel_loc4 = '';
        }
        if (nivel === 3) {
            $scope._filtroLocalizacao.id_nivel_loc4 = '';
        }

        $scope.atualizarOpcoesFiltroLocalizacao();
        $scope.onPesquisa();
    };

    $scope.getLabelAgrupamento = function () {
        const agrupado = $scope._filtroLocalizacao.agrupado;
        if (agrupado === 'sku') {
            return $scope._regConta?.params_nomenclatura_itens?.itens || 'SKU';
        }
        if (agrupado === 'tipo') {
            return $scope._regConta?.params_nomenclatura_itens?.categorias || 'Tipo';
        }
        if (agrupado === 'inf1') return $scope._labelInf1 || 'Inf. 1';
        if (agrupado === 'status') return 'Status';
        if (agrupado === 'ocupacao') return 'Ocupação';
        if (agrupado === 'permanencia') return 'Permanência';
        return '';
    };

    const temFiltroLocalizacao = (filtro) =>
        !!(filtro.id_nivel_loc1 || filtro.id_nivel_loc2 || filtro.id_nivel_loc3 || filtro.id_nivel_loc4);

    $scope.ehModoOcupacao = function () {
        return $scope._filtroLocalizacao.agrupado === 'ocupacao';
    };

    $scope.ehModoPermanencia = function () {
        return $scope._filtroLocalizacao.agrupado === 'permanencia';
    };

    $scope.ehAgrupamentoClassico = function () {
        const agrupado = $scope._filtroLocalizacao.agrupado;
        return !!agrupado && agrupado !== 'ocupacao' && agrupado !== 'permanencia';
    };

    $scope.getResumoFiltroPermanencia = function () {
        const ms = getMsFiltroPermanencia();
        if (ms <= 0) return 'Com tempo de permanência registrado';
        return 'Acima de ' + formatarDuracaoMs(ms);
    };

    $scope.onPermanenciaFiltroChange = function () {
        $scope._agrupadoSelecionado = '';
        $scope.onPesquisa();
    };

    $scope.getLabelTotalAgrupamento = function () {
        const sku = $scope._regConta?.params_nomenclatura_itens?.sku || 'IBC';
        return sku + '(s)';
    };

    $scope.modoOcupacaoAtivo = function () {
        const f = $scope._filtroLocalizacao;
        return f.agrupado === 'ocupacao' && temFiltroLocalizacao(f);
    };

    $scope.mostrarColunaLateral = function () {
        return !!$scope._filtroLocalizacao.agrupado;
    };

    $scope.getClasseBarraOcupacao = function (local) {
        if (!local) return '';
        if (local.excede) return 'item-ocupacao-bar__fill--excede';
        if (local.abaixoMin) return 'item-ocupacao-bar__fill--abaixo';
        const pct = local.percentual;
        if (pct == null) return 'item-ocupacao-bar__fill--neutro';
        if (pct >= 90) return 'item-ocupacao-bar__fill--alto';
        if (pct >= 60) return 'item-ocupacao-bar__fill--medio';
        return 'item-ocupacao-bar__fill--baixo';
    };

    $scope.getLarguraBarraOcupacao = function (local) {
        if (!local || local.percentual == null) return 0;
        return Math.min(100, Math.max(0, local.percentual));
    };

    $scope.onAgrupadoChange = function () {
        $scope._agrupadoSelecionado = '';
        $scope._ocupacaoSelecionada = '';

        const f = $scope._filtroLocalizacao;
        if (f.agrupado === 'ocupacao' && !temFiltroLocalizacao(f)) {
            uteisService.onToast(
                'Selecione um nível de localização para visualizar a ocupação.',
                'warning',
                3000,
                'top-end'
            );
        }

        $scope.onPesquisa();
    };

    $scope.onFiltroStatusChange = function () {
        $scope._agrupadoSelecionado = '';
        $scope._ocupacaoSelecionada = '';
        $scope.onPesquisa();
    };

    $scope.atualizarListaOcupacao = async function () {
        const f = $scope._filtroLocalizacao;
        if (!$scope.modoOcupacaoAtivo()) {
            $scope._listOcupacaoLocais = [];
            return;
        }

        $scope._carregandoOcupacao = true;
        try {
            let url = '/kpi/itens_por_local_capacidade?id_conta=' + encodeURIComponent($scope._regConta._id);
            if (f.id_nivel_loc1) url += '&id_nivel_loc1=' + encodeURIComponent(f.id_nivel_loc1);
            if (f.id_nivel_loc2) url += '&id_nivel_loc2=' + encodeURIComponent(f.id_nivel_loc2);
            if (f.id_nivel_loc3) url += '&id_nivel_loc3=' + encodeURIComponent(f.id_nivel_loc3);
            if (f.id_nivel_loc4) url += '&id_nivel_loc4=' + encodeURIComponent(f.id_nivel_loc4);

            const res = await uteisService.getBase(url);
            const mapa = new Map();

            (res.por_local || []).forEach((row) => {
                const max = Number(row.capacidade_maxima) || 0;
                const total = Number(row.total_itens) || 0;
                let pct = row.percentual_ocupacao;
                if ((pct == null || pct === '') && max > 0) {
                    pct = calcularPercentualOcupacao(total, max);
                }
                mapa.set(row.id_localizacao, montarCardOcupacao({
                    id_localizacao: row.id_localizacao,
                    descricao: row.descricao,
                    tag: row.tag,
                    total_itens: total,
                    capacidade_maxima: max,
                    capacidade_minima: row.capacidade_minima,
                    percentual: pct,
                    excede: row.excede_capacidade,
                    abaixoMin: row.abaixo_capacidade_minima,
                    vagas_livres: row.vagas_livres
                }));
            });

            const ctx = getContextoOcupacao(f);
            if (ctx && ctx.buscarFilhos) {
                const urlFilhos =
                    '/_bd?c=localizacao&id_conta=' + encodeURIComponent($scope._regConta._id) +
                    '&id_nivel=' + encodeURIComponent(ctx.paiId) +
                    '&ativo=1';
                const filhos = await uteisService.getBase(urlFilhos);
                (filhos || []).forEach((loc) => {
                    if (!loc || !loc._id || mapa.has(loc._id)) return;
                    const max = Number(loc.capacidade_maxima) || 0;
                    const min = Number(loc.capacidade_minima) || 0;
                    mapa.set(loc._id, montarCardOcupacao({
                        id_localizacao: loc._id,
                        descricao: loc.descricao,
                        tag: loc.tag,
                        total_itens: 0,
                        capacidade_maxima: max,
                        capacidade_minima: min,
                        percentual: max > 0 ? 0 : null,
                        excede: false,
                        abaixoMin: min > 0,
                        vagas_livres: max > 0 ? max : null
                    }));
                });
            }

            $scope._listOcupacaoLocais = Array.from(mapa.values()).sort((a, b) => {
                const pctA = a.percentual != null ? a.percentual : -1;
                const pctB = b.percentual != null ? b.percentual : -1;
                if (pctB !== pctA) return pctB - pctA;
                return a.descricao.localeCompare(b.descricao, 'pt-BR', { numeric: true });
            });
        } catch (err) {
            $scope._listOcupacaoLocais = [];
            uteisService.onToast('Não foi possível carregar a ocupação dos endereços.', 'error', 2500, 'top-end');
        } finally {
            $scope._carregandoOcupacao = false;
        }
    };

    $scope.onVerLocalOcupacao = function (local) {
        $scope._ocupacaoSelecionada = local.chave;
        $scope._listItens = filtrarItens(false);
    };

    $scope.onVerGrupo = function (grupo) {
        $scope._agrupadoSelecionado = grupo.chave;
        $scope.onPesquisa();
    };

    $scope.formataDataGrupo = function (data) {
        if (!data) return '—';
        return moment(data, 'YYYY-MM-DD HH:mm:ss')
            .subtract(3, 'hours')
            .format('DD/MMM HH:mm');
    };

    $scope.onPesquisa = function () {
        const agrupado = $scope._filtroLocalizacao.agrupado;
        const ocupacaoAtiva = $scope.modoOcupacaoAtivo();

        const finalizarLista = () => {
            $scope._listItens = filtrarItens(false);
        };

        const atualizarAgrupamento = () => {
            const permanenciaAtiva = $scope.ehModoPermanencia();
            const agrupamentoClassico = agrupado && agrupado !== 'ocupacao' && agrupado !== 'permanencia';

            if (permanenciaAtiva && !ocupacaoAtiva) {
                const itensBase = filtrarItens(true);
                $scope._listItensAgrupados = montarListaAgrupadosPermanencia(itensBase);
                $scope._totaisAgrupamento = calcularTotaisAgrupamento(itensBase);
            } else if (agrupamentoClassico && !ocupacaoAtiva) {
                const itensBase = filtrarItens(true);
                $scope._listItensAgrupados = montarListaAgrupados(itensBase, agrupado);
                $scope._totaisAgrupamento = calcularTotaisAgrupamento(itensBase);
            } else {
                $scope._listItensAgrupados = [];
                $scope._agrupadoSelecionado = '';
                const itensBase = filtrarItens(true);
                $scope._totaisAgrupamento = calcularTotaisAgrupamento(itensBase);
            }
            finalizarLista();
        };

        if (ocupacaoAtiva) {
            $scope.atualizarListaOcupacao()
                .then(() => {
                    atualizarAgrupamento();
                    $scope.$apply();
                })
                .catch(() => {
                    atualizarAgrupamento();
                    $scope.$apply();
                });
            return;
        }

        $scope._listOcupacaoLocais = [];
        $scope._ocupacaoSelecionada = '';
        atualizarAgrupamento();
    };


  

    $scope.formataDataHora = function (data) {
        const date = moment(data, 'YYYY-MM-DD HH:mm:ss')
            .subtract(0, 'hours'); // Remove 3 horas
    
        return date.format('DDMMM HH[h]mm:ss');
    };

    $scope.formataTempoDesdePermanencia = function (data) {
        const inicio = parseDataPermanencia(data);
        if (!inicio) return '';
        const agora = moment().subtract(6, 'hours');
        const diffMs = agora.diff(inicio);
        if (diffMs < 0 || diffMs < 60000) return 'agora';
        return formatarDuracaoMs(diffMs);
    };


    $scope.sortBy = function (field) {
        if ($scope.sortField === field) {
            $scope.sortReverse = !$scope.sortReverse;
        } else {
            $scope.sortField = field;
            $scope.sortReverse = false;
        }
    };

    $scope.onExportarCSV = function () {
        const lista = Array.isArray($scope._listItens) ? $scope._listItens.slice() : [];
        if (!lista.length) {
            uteisService.onToast('Nenhum registro para exportar.', 'warning', 2500, 'top-end');
            return;
        }

        const field = $scope.sortField;
        const reverse = $scope.sortReverse ? -1 : 1;
        const getCampo = (obj, path) => {
            if (!obj || !path) return '';
            const partes = String(path).split('.');
            let cur = obj;
            for (let i = 0; i < partes.length; i++) {
                if (cur == null) return '';
                cur = cur[partes[i]];
            }
            return cur == null ? '' : cur;
        };
        lista.sort((a, b) => {
            const va = getCampo(a, field);
            const vb = getCampo(b, field);
            if (va === vb) return 0;
            if (va === '' || va == null) return 1 * reverse;
            if (vb === '' || vb == null) return -1 * reverse;
            return (String(va).localeCompare(String(vb), 'pt-BR', { numeric: true })) * reverse;
        });

        const nomeItem = $scope._regConta?.params_nomenclatura_itens?.itens || 'Item';
        const nomeCategoria = $scope._regConta?.params_nomenclatura_itens?.categorias || 'Categoria';

        const cabecalho = [
            nomeItem,
            'Status',
            nomeCategoria,
            'Inf. 1',
            'Inf. 1 (label)',
            'Tag',
            'Nivel 1',
            'Nivel 2',
            'Nivel 3',
            'Nivel 4',
            'Data Permanencia',
            'Data Registro'
        ];

        const escapeCSV = (valor) => {
            const v = valor == null ? '' : String(valor);
            const precisaAspas = /[";\r\n]/.test(v);
            const escapado = v.replace(/"/g, '""');
            return precisaAspas ? `"${escapado}"` : escapado;
        };

        const fmtData = (d) => {
            if (!d) return '';
            try {
                return moment(d).format('YYYY-MM-DD HH:mm:ss');
            } catch (e) {
                return String(d);
            }
        };

        const linhas = lista.map((item) => {
            return [
                item.id_categoria?.descricao || 'Sem Associacao',
                item.status || '',
                item.id_categoria_reg1?.descricao || '',
                item.id_externo || item.inf_compl1 || '',
                item.id_categoria?.labelInf1 || '',
                item.tag || '',
                item.id_nivel_loc1?.descricao || '',
                item.id_nivel_loc2?.descricao || '',
                item.id_nivel_loc3?.descricao || '',
                item.id_nivel_loc4?.descricao || '',
                fmtData(item.registro_atual?.data_permanecia),
                fmtData(item.registro_atual?.data_registro)
            ].map(escapeCSV).join(';');
        });

        const conteudo = [cabecalho.map(escapeCSV).join(';'), ...linhas].join('\r\n');
        const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const stamp = moment().format('YYYYMMDD_HHmmss');
        const nomeArquivo = 'itens_' + stamp + '.csv';

        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);

        uteisService.onToast('Arquivo exportado: ' + nomeArquivo, 'success', 2500, 'top-end');
    };

    $scope.onItem = async function (_acao, _edit) {

        if (modalInstance != undefined) {
            modalInstance.hide();
            modalInstance = undefined

            $scope.onCarregaRegistros()
            $scope.funcaoLoc = '';
            $scope.editLoc = undefined;

            $scope.$apply();

        } else {

            let _tratComponente = JSON.parse(JSON.stringify(_edit || {}));

            if (_acao == 'edit') {
                _tratComponente.id_categoria = _tratComponente.id_categoria ? _tratComponente.id_categoria._id : '0'
                _tratComponente.id_categoria_reg1 = _tratComponente.id_categoria_reg1 ? _tratComponente.id_categoria_reg1._id : null

                _tratComponente.id_nivel_loc1 = _tratComponente.id_nivel_loc1 ? _tratComponente.id_nivel_loc1._id : null
                _tratComponente.id_nivel_loc2 = _tratComponente.id_nivel_loc2 ? _tratComponente.id_nivel_loc2._id : null
                _tratComponente.id_nivel_loc3 = _tratComponente.id_nivel_loc3 ? _tratComponente.id_nivel_loc3._id : null
                _tratComponente.id_nivel_loc4 = _tratComponente.id_nivel_loc4 ? _tratComponente.id_nivel_loc4._id : null
            };

            $scope.funcaoLoc = _acao;
            $scope.editLoc = _tratComponente;

            modalInstance = new bootstrap.Modal(document.getElementById('modalItem'));
            modalInstance.show();
        }

    };
});