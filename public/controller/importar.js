app.controller('importarCtrl', function ($scope, $http, params, uteisService) {

    $scope._regConta = {};
    $scope._regColaborador = []
    $scope._dadosImportacao = null;

    var modalInstance = undefined;

    $scope.$watch('$viewContentLoaded', async function () {
        $scope._regConta = uteisService.getCookie('_conta');
        $scope._regConta['_logo'] = '../assets/images/logo_default.fw.png'
        if ($scope._regConta.logo && $scope._regConta.logo.includes('logo_conta') == false) {
            let _url = uteisService.apiUrl_();
            $scope._regConta._logo = _url + '/image/' + $scope._regConta.logo;
        };

        $scope._regColaborador = uteisService.getCookie('_colaborador');

    });

    // ======================================================
    // 1️⃣ Ler e converter o CSV para JSON
    // ======================================================
    $scope.onLerArquivoImportacao = function (event) {
        const file = event.target.files[0];
        if (!file) return alert('Selecione um arquivo CSV primeiro.');

        const reader = new FileReader();

        reader.onload = function (e) {

            // Monta o JSON final no formato esperado
            let dados = {
                id_conta: $scope._regConta._id,
                itens: []
            };

            const csv = e.target.result;
            const linhas = csv.split(/\r?\n/).filter(l => l.trim() !== '');

            linhas.map((item, index,) => {
                if (index > 0) {
                    let coluna = item.split(';')
                    dados.itens.push({
                        "id_interno": coluna[0],
                        "tag": coluna[1].replace('"', '').replace('"', '').trim(),
                        "categoria": coluna[2],
                        "label1": coluna[3],
                        "label2": coluna[4],
                        "label3": coluna[5],
                        "label4": coluna[6],
                        "inf1": coluna[7],
                        "inf2": coluna[8],
                        "inf3": coluna[9],
                        "inf4": coluna[10],
                        "loc_nivel1": coluna[11] ? coluna[11] : null,
                        "loc_nivel2": coluna[12] ? coluna[12] : null,
                        "loc_nivel3": coluna[13] ? coluna[13] : null,
                        "loc_nivel4": coluna[14] ? coluna[14] : null,
                        "_foto": '../assets/images/icon_cadastro.fw.png'
                    });
                }

            })


            // Extrai cabeçalhos
            const cabecalho = linhas[0].split(',').map(h => h.trim());

            // Mapeia as linhas restantes para objetos
            const itens = linhas.slice(1).map(linha => {
                const cols = linha.split(',');
                const obj = {};
                cabecalho.forEach((key, i) => {
                    obj[key.trim()] = (cols[i] || '').trim();
                });
                return obj;
            });



            // Atualiza o escopo
            $scope.$apply(() => {
                $scope._dadosImportacao = dados;
            });
            console.log('✅ JSON gerado:', dados);
            uteisService.onToast('Arquivo lido! Pronto para importar.', 'success', 2000, 'top-end');
        };

        reader.readAsText(file, 'UTF-8');
    };

    // -------------------------------------------------------------
    // 2️⃣ Enviar JSON para o endpoint via POST
    // -------------------------------------------------------------
    $scope.onExecutarImportacao = async function () {
        if (!$scope._dadosImportacao) {
            uteisService.onToast('Nenhum arquivo foi lido, ainda.', 'info', 2000, 'top-end');
            return;
        };

        uteisService.posthBase('/importar-csv-itens', $scope._dadosImportacao).then((res) => {
            uteisService.onToast('Tudo importado, com sucesso!', 'success', 2000, 'top-end');
            $scope.$apply(() => {
                $scope._dadosImportacao = []
            });

            setTimeout(() => {
                window.location.assign("/item");
            }, 2000);
        })

    };

});
