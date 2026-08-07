app.controller('posicaoCtrl', function ($scope, $http, params, uteisService,  $location) {

    $scope._regConta = {};
    $scope._regColaborador = []
    $scope._listPosicoes = []
    $scope.sortField = 'id_doc';
    $scope.sortReverse = false;
    $scope._tipo = 'conferencia';

    var modalInstance = undefined;

    var inicioSemanaAtual = moment().startOf('isoWeek').format('YYYY-MM-DD');
    var fimSemanaAtual = moment().endOf('isoWeek').format('YYYY-MM-DD');

    document.getElementById('_pesquisa.data_de').value = inicioSemanaAtual;
    document.getElementById('_pesquisa.data_a').value = fimSemanaAtual;

    $scope._pesquisa = {
        status: '',
        data_de: inicioSemanaAtual,
        data_a: fimSemanaAtual,
        pesquisa: '',
    }

    $scope.$watch('$viewContentLoaded', async function () {

        const currentUrl = $location.absUrl();
        let url = currentUrl.split('/')
      
        if(url[url.length - 1].includes('inventario')) {
            $scope._tipo = 'inventario'
        } else {
            $scope._tipo = 'conferencia'
        }

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

        let _url = '/_bd?c=posicao&id_conta=' + $scope._regConta._id;

        _url += '&tipo=' + $scope._tipo
        
        if($scope._pesquisa.status) {
            _url += '&status=' + $scope._pesquisa.status
        };

        if($scope._pesquisa.data_de && $scope._pesquisa.data_a) {
            _url += '&partida_data=*dtP' + moment($scope._pesquisa.data_de).format('YYYY-MM-DD') + '|' + moment($scope._pesquisa.data_a).format('YYYY-MM-DD')
        };

        if($scope._pesquisa.pesquisa) {
            _url += '&id_doc=*like'+ $scope._pesquisa.pesquisa
        };


        _url += '&pop=id_nivel_loc1&pop=id_nivel_loc2&pop=id_nivel_loc3&pop=id_nivel_loc4';
        _url += '&pop=id_nivel_loc1_destino&pop=id_nivel_loc2_destino&pop=id_nivel_loc3_destino&pop=id_nivel_loc4_destino';

        await uteisService.getBase(_url)
            .then((res) => {
                

                res.map((item) => {

                    item['_icone'] = '../assets/images/icon_cadastro.fw.png'

                    // if (item.icone && !item.foto.includes('assets')) {
                    //     item._icone = uteisService.apiUrl_() + '/image/' + item.icone
                    // };

                    item['_previsao_chegada_data'] = item.previsao_chegada_data
                    item['_previsao_chegada_data_status'] = false

                    let _chegadaReal = item.itens.find(item => item.status_destino_data);
                    if (_chegadaReal) {
 
                      item['_previsao_chegada_data'] = _chegadaReal.status_destino_data;
                      item['_previsao_chegada_data_status'] = true
                    }

                    var contagem = $scope.contagemItensPosicao(item);
                    item['_itensConcluido'] = contagem.concluido;
                    item['_itensPendente'] = contagem.pendente;

                });


                $scope._listPosicoes = res
                $scope.$apply();
            })
            .catch((error) => {
                alert(JSON.stringify(error))
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

    };

    $scope.contagemItensPosicao = function (posicao) {
        var itens = (posicao && posicao.itens) || [];
        if (!Array.isArray(itens)) itens = [];

        var concluido = 0;
        var pendente = 0;

        itens.forEach(function (item) {
            if (!item) return;
            var st = String(item.status || 'pendente').toLowerCase();
            if (st === 'concluido') concluido += 1;
            else pendente += 1;
        });

        return { concluido: concluido, pendente: pendente };
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
        const lista = Array.isArray($scope._listPosicoes) ? $scope._listPosicoes.slice() : [];
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

        const cabecalho = [
            'iD Doc',
            'Criado em',
            'Status',
            'Partida (Data)',
            'Origem Nivel 1',
            'Origem Nivel 2',
            'Origem Nivel 3',
            'Origem Nivel 4',
            'Qtd Itens',
            'Chegada Prevista',
            'Chegada Real',
            'Destino Nivel 1',
            'Destino Nivel 2',
            'Destino Nivel 3',
            'Destino Nivel 4'
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
            const qtdItens = Array.isArray(item.itens) ? item.itens.length : 0;
            return [
                item.id_doc || '',
                fmtData(item.createdAt),
                item.status || '',
                fmtData(item.partida_data),
                item.id_nivel_loc1?.descricao || '',
                item.id_nivel_loc2?.descricao || '',
                item.id_nivel_loc3?.descricao || '',
                item.id_nivel_loc4?.descricao || '',
                qtdItens,
                fmtData(item.previsao_chegada_data),
                item._previsao_chegada_data_status ? fmtData(item._previsao_chegada_data) : '',
                item.id_nivel_loc1_destino?.descricao || '',
                item.id_nivel_loc2_destino?.descricao || '',
                item.id_nivel_loc3_destino?.descricao || '',
                item.id_nivel_loc4_destino?.descricao || ''
            ].map(escapeCSV).join(';');
        });

        const conteudo = [cabecalho.map(escapeCSV).join(';'), ...linhas].join('\r\n');
        const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const stamp = moment().format('YYYYMMDD_HHmmss');
        const nomeArquivo = 'posicoes_' + stamp + '.csv';

        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);

        uteisService.onToast('Arquivo exportado: ' + nomeArquivo, 'success', 2500, 'top-end');
    };


    $scope.onPosicao = async function (_acao, _edit) {

        if (modalInstance != undefined) {
            modalInstance.hide();
            modalInstance = undefined

            $scope.onCarregaRegistros()
            $scope.funcaoLoc = '';
            $scope.editLoc = undefined;

            $scope.$apply();
        } else {

            let _tratComponente = JSON.parse(JSON.stringify(_edit || {}));
            _tratComponente.id_nivel_loc1 = _tratComponente.id_nivel_loc1 ? _tratComponente.id_nivel_loc1._id : null
            _tratComponente.id_nivel_loc2 = _tratComponente.id_nivel_loc2 ? _tratComponente.id_nivel_loc2._id : null
            _tratComponente.id_nivel_loc3 = _tratComponente.id_nivel_loc3 ? _tratComponente.id_nivel_loc3._id : null
            _tratComponente.id_nivel_loc4 = _tratComponente.id_nivel_loc4 ? _tratComponente.id_nivel_loc4._id : null

            _tratComponente.id_nivel_loc1_destino = _tratComponente.id_nivel_loc1_destino ? _tratComponente.id_nivel_loc1_destino._id : null
            _tratComponente.id_nivel_loc2_destino = _tratComponente.id_nivel_loc2_destino ? _tratComponente.id_nivel_loc2_destino._id : null
            _tratComponente.id_nivel_loc3_destino = _tratComponente.id_nivel_loc3_destino ? _tratComponente.id_nivel_loc3_destino._id : null
            _tratComponente.id_nivel_loc4_destino = _tratComponente.id_nivel_loc4_destino ? _tratComponente.id_nivel_loc4_destino._id : null

            $scope.funcaoLoc = _acao;
            $scope.editLoc = _tratComponente;

            modalInstance = new bootstrap.Modal(document.getElementById('modalPosicao'));
            modalInstance.show();
        }

    };

$scope.formataDataHora = function (data) {
    const date = moment(data, 'YYYY-MM-DD HH:mm:ss')
        .subtract(3, 'hours'); // Remove 3 horas

    return date.format('DDMMM HH[h]mm');
};


$scope.formataDataHoraString = function (data) {
    if (!data) return '-';

    // Aceita string em ISO, com milissegundos, com espaço ou Date.
    var date = moment(data, [
        'YYYY-MM-DD HH:mm:ss',
        'YYYY-MM-DDTHH:mm:ss',
        'YYYY-MM-DDTHH:mm:ss.SSS',
        moment.ISO_8601
    ], true);

    if (!date.isValid()) {
        date = moment(data);
    }

    if (!date.isValid()) return '-';
    return date.format('DDMMM HH[h]mm');
};

});