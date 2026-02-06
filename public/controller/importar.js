app.controller('importarCtrl', function ($scope, $http, params, uteisService) {

    $scope._regConta = {};
    $scope._regColaborador = []
    $scope._dadosImportacao = null;
    $scope.tipoImportacao = 'completo'; // 'completo' ou 'secundario'

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

                    // Modo Secundário: apenas 3 colunas (A, B, C)
                    if ($scope.tipoImportacao === 'secundario') {
                        if (coluna[0]) { // Coluna A - Item
                            dados.itens.push({
                                "categoria": coluna[0].replace('"', '').replace('"', '').trim(), // Item (A)
                                "ean": coluna[1] ? coluna[1].replace('"', '').replace('"', '').trim() : null, // EAN (B)
                                "categoria_item": coluna[2] ? coluna[2].replace('"', '').replace('"', '').trim() : null, // Categoria (C)
                                "categoria_epc": coluna[3] ? coluna[3].replace('"', '').replace('"', '').trim() : null, // Categoria EPC (D)
                                "_foto": '../assets/images/icon_cadastro.fw.png',
                            });
                        }
                    } else {
                        // Modo Completo: todas as colunas (A-Q)
                        if( coluna[1]){
                            let _tag = coluna[1].replace('"', '').replace('"', '').trim()
                            if (!_tag.includes(':')) {
        
                                _tag = $scope.gerarSGTIN96({
                                    companyPrefix: '7891260',
                                    itemReference: String(_tag).slice(-6),
                                    serial: index,
                                    filter: coluna[16]
                                });
        
                            }
        
                            dados.itens.push({
                                "id_interno": coluna[0],
                                "tag": _tag,
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
                                "_foto": '../assets/images/icon_cadastro.fw.png',
                                "categoria_item": coluna[15] ? coluna[15] : null,
                                "categoria_item_id": coluna[16] ? coluna[16] : null,
                            });
                        }
                    }
                    
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

        let _url = '/importar-csv-itens'
        if($scope.tipoImportacao === 'secundario') {
            _url = '/importar-csv-secundarios'
        };

        uteisService.posthBase(_url, $scope._dadosImportacao).then((res) => {
            uteisService.onToast('Tudo importado, com sucesso!', 'success', 2000, 'top-end');
            $scope.$apply(() => {
                $scope._dadosImportacao = []
            });

            setTimeout(() => {
                window.location.assign("/item");
            }, 2000);
        })

    };
    $scope.gerarSGTIN96 = function ({ companyPrefix, itemReference, serial, filter }) {

        // Header SGTIN-96
        const HEADER = 0x30; // 00110000

        // Partition table (prefixo 7 dígitos → partition 5)
        const PARTITION = 5;

        const PARTITION_TABLE = {
            5: { cpBits: 24, irBits: 20 } // 7 dígitos empresa
        };

        const { cpBits, irBits } = PARTITION_TABLE[PARTITION];

        function toBinary(value, bits) {
            return value.toString(2).padStart(bits, '0');
        }

        const headerBin = toBinary(HEADER, 8);
        const filterBin = toBinary(filter, 3);
        const partitionBin = toBinary(PARTITION, 3);
        const companyBin = toBinary(parseInt(companyPrefix), cpBits);
        const itemBin = toBinary(parseInt(itemReference), irBits);
        const serialBin = toBinary(serial, 38);

        const epcBin =
            headerBin +
            filterBin +
            partitionBin +
            companyBin +
            itemBin +
            serialBin;

        // Converter binário para HEX
        let epcHex = '';
        for (let i = 0; i < epcBin.length; i += 4) {
            epcHex += parseInt(epcBin.substr(i, 4), 2).toString(16);
        }

        return epcHex.toUpperCase();
    }

});
