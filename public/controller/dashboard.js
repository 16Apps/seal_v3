app.controller('dashboardCtrl', function ($scope, $http, params, uteisService, $timeout, $interval) {

    $scope._regConta = {};
    $scope._regColaborador = []
    $scope._regResumoItens = []

    $scope.cores = ['primary', 'success', 'warning', 'danger', 'info'];
    $scope.limite = 3;

    $scope.id_nivel = ""
    $scope.id_nivelPlanta = ""
    $scope.id_nivelPosicao = ""
    var modalInstance = undefined;
    let chartAgrupadoLocal1 = null;


    $scope.$watch('$viewContentLoaded', async function () {
        $scope._regConta = uteisService.getCookie('_conta');
        $scope._regConta['_logo'] = '../assets/images/logo_default.fw.png'
        if ($scope._regConta.logo && $scope._regConta.logo.includes('logo_conta') == false) {
            let _url = uteisService.apiUrl_();
            $scope._regConta._logo = _url + '/image/' + $scope._regConta.logo;
        };

        $scope._regColaborador = uteisService.getCookie('_colaborador');

        // $scope.onCarregaResumoItens();
        // $scope.onCarregaAgrupadoLocal1();
        // $scope.onCarregaItens();
        //$scope.onCarregaRegistros();

        // $interval(() => {
        //     $scope.onCarregaResumoItens();
        //     $scope.onCarregaAgrupadoLocal1();
        //     $scope.onCarregaItens();
        //     $scope.onCarregaRegistros();
        // }, 5000)

        $scope.onCarregaNiveis1();

    });


    $scope.onCarregaResumoItens = async function () {

        let _url = '/_bd/itens/resumo/' + $scope._regConta._id + '/' + $scope.id_nivelPosicao

        await uteisService.getBase(_url)
            .then((res) => {

                $scope._regResumoItens = res
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

    };

    $scope.onCarregaCiclosPosicao = async function () {

        let _url = '/_bd/posicao/relatorio-itens/' + $scope._regConta._id

        await uteisService.getBase(_url)
            .then((res) => {

                $scope._regCiclosPosicao = res.relatorio;
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

    };

    $scope.onCarregaAgrupadoLocal1 = async function () {

        let _url = '/_bd/itens/agrupados/' + $scope._regConta._id + '/' + $scope.id_nivelPosicao

        await uteisService.getBase(_url)
            .then((res) => {

                $scope._regAgrupadoLocal1 = res;
                $scope.onGraficoAgrupadoLocal1();
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

    };

    $scope.chunk = function (arr, size) {
        if (!arr) return [];
        const result = [];
        for (let i = 0; i < arr.length; i += size) {
            result.push(arr.slice(i, i + size));
        }
        return result;
    };

    $scope.onGraficoAgrupadoLocal1 = function () {
        let seriesAtivos = [];
        let seriesPerca = [];
        let labels = [];

        if (!$scope._regAgrupadoLocal1 || !$scope._regAgrupadoLocal1.resultado) {
            console.warn("Sem dados para gráfico agrupado");
            return;
        }

        // 🔹 Monta dados
        $scope._regAgrupadoLocal1.resultado.map((item, index) => {
            if (index < 6) {
                const ativos = Number(item.ativos) || 0;
                const perca = Number(item.perca) || 0;
                const desc = item.descricao || "Local não identificado";

                seriesAtivos.push(ativos);
                seriesPerca.push(perca);
                labels.push(desc);
            }
        });

        const el = document.querySelector("#grafico-local");
        if (!el) return console.warn("Elemento #grafico-local não encontrado.");

        // 🔹 Se já existe gráfico, apenas atualiza
        if (chartAgrupadoLocal1) {
            chartAgrupadoLocal1.updateOptions({
                series: [
                    { name: "Ativos", data: seriesAtivos },
                    { name: "Perda", data: seriesPerca },
                ],
                xaxis: { categories: labels }
            });
            return;
        }

        // 🔹 Caso contrário, cria a primeira vez
        const options = {
            chart: {
                height: 420,
                type: "bar",
                stacked: false,
                toolbar: { show: true },
            },
            plotOptions: {
                bar: {
                    horizontal: false,
                    columnWidth: "45%",
                    borderRadius: 8,
                },
            },
            dataLabels: {
                enabled: true,
                formatter: val => (val > 0 ? val : ""),
                style: { fontSize: "13px", fontWeight: "bold", colors: ["#fff"] },
            },
            stroke: { show: true, width: 2, colors: ["transparent"] },
            series: [
                { name: "Ativos", data: seriesAtivos },
                { name: "Perda", data: seriesPerca },
            ],
            xaxis: {
                categories: labels,
                labels: { rotate: -10, style: { fontSize: "13px", colors: "#ccc" } },
            },
            yaxis: {
                labels: { style: { colors: "#ccc" } },
                title: { text: "Quantidade de Itens", style: { color: "#ccc" } },
            },
            legend: { position: "top", horizontalAlign: "center", markers: { radius: 6 } },
            fill: { opacity: 1 },
            tooltip: {
                shared: true,
                intersect: false,
                y: { formatter: val => val + " itens" },
            },
            colors: ["#04a777", "#e63946"],
            grid: {
                borderColor: "#575e6d",
                strokeDashArray: 4,
                yaxis: { lines: { show: true } },
                xaxis: { lines: { show: false } },
            },
        };

        chartAgrupadoLocal1 = new ApexCharts(el, options);
        chartAgrupadoLocal1.render();
    };


    $scope.onCarregaItens = async function () {

        let _url = '/_bd?c=item&id_conta=' + $scope._regConta._id;
        if ($scope.id_nivelPosicao != '') {
            _url += '&id_nivel_loc1=' + $scope.id_nivelPosicao
        }
        _url += '&pop=id_categoria&pop=id_nivel_loc1&pop=id_nivel_loc2&pop=id_nivel_loc3&pop=id_nivel_loc4';
        // _url += '&pop=id_colaborador_retirada'

        await uteisService.getBase(_url)
            .then((res) => {

                res.map((item) => {

                    item['_foto'] = '../assets/images/icon_cadastro.fw.png'

                    if (item.foto && !item.foto.includes('assets')) {
                        item._foto = uteisService.apiUrl_() + '/image/' + item.foto
                    };

                   // 🔹 Calcula intervalo (em segundos)
let inicio = null;
let fim = null;

// prioridade: data do registro
if (item.registro_atual && item.registro_atual.data_registro) {
    inicio = new Date(item.registro_atual.data_registro);

    // usa a data de permanência registrada
    if (item.registro_atual.data_permanecia) {
        fim = new Date(item.registro_atual.data_permanecia);
    }
}
// fallback: não há data_registro
else if (item.updatedAt) {
    inicio = new Date(item.updatedAt);

    // data corrente como permanência
    fim = new Date();
}

if (inicio && fim) {
    const diffMs = fim - inicio; // diferença em milissegundos
    item._intervalo_segundos = diffMs > 0
        ? Math.floor(diffMs / 1000)
        : 0;
} else {
    item._intervalo_segundos = null;
}



                });

                // 🔹 Ordena do mais recente para o mais antigo (descendente)
                res.sort((a, b) => {
                    const dataA = a.registro_atual?.data_permanecia ? new Date(a.registro_atual.data_permanecia) : 0;
                    const dataB = b.registro_atual?.data_permanecia ? new Date(b.registro_atual.data_permanecia) : 0;
                    return dataB - dataA; // mais recente primeiro
                });

                $scope._listItens = res
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

    };

    $scope.onCarregaRegistros = async function () {

        _url = '/_bd?c=registro&id_conta=' + $scope._regConta._id + '&_sort=updatedAt'
        if ($scope.id_nivelPosicao != '') {
            _url += '&id_nivel_loc1=' + $scope.id_nivelPosicao
        }

        _url += '&pop=id_item&pop=id_categoria&pop=id_gateway'
        _url += '&pop=id_nivel_loc1&pop=id_nivel_loc2&pop=id_nivel_loc3&pop=id_nivel_loc4'
        _url += '&pop=id_nivel_loc1_final&pop=id_nivel_loc1_final&pop=id_nivel_loc1_final&pop=id_nivel_loc1_final'
        await uteisService.getBase(_url)
            .then((res) => {

                res.forEach(reg => {
                    if (reg.data_registro && reg.data_permanecia) {

                        const inicio = new Date(reg.data_registro);
                        const fim = new Date(reg.data_permanecia);
                        const diffMs = fim - inicio; // diferença em milissegundos
                        reg.intervalo_segundos = Math.floor(diffMs / 1000); // converte para segundos

                    } else {
                        reg.intervalo_segundos = null;
                    }
                });

                $scope._listRegistros = res
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

    }

    $scope.onCarregaNiveis1 = async function () {

        let _url = '/_bd?c=localizacao&id_conta=' + $scope._regConta._id
        _url += '&id_nivel=null'
        _url += '&sort=descricao'

        await uteisService.getBase(_url)
            .then((res) => {
                $scope._listNiveis1 = res

                $scope.id_nivel = res[0]._id
                $scope.id_nivelPlanta = res[0]._id
                $scope.id_nivelPosicao = res[0]._id

                $scope.onCarregaCiclosPosicao()
                $scope.onCarregaAgrupadoLocal1()
                $scope.onCarregaResumoItens();
                $scope.onCarregaItens();
                $scope.onCarregaRegistros();
            })

    };

    $scope.onMudaNivel1 = async function (nivel) {
        $scope.id_nivel = nivel;
        $scope.$apply();
    }


    $scope.onMudaNivel1Planta = async function (nivel) {
        $scope.id_nivelPlanta = nivel;
        $scope.$apply();
    }

    $scope.onMudaNivel1Posicao = async function (nivel) {
        $scope.id_nivelPosicao = nivel;
        $scope.id_nivel = nivel;
        $scope.id_nivelPlanta = nivel;

        $scope.onCarregaCiclosPosicao()
        $scope.onCarregaAgrupadoLocal1()
        $scope.onCarregaResumoItens();
        $scope.onCarregaItens();
        $scope.onCarregaRegistros();

        $scope.$apply();
    }

    $scope.getBgClass = function (index, isBox = false) {
        const cor = $scope.cores[index % $scope.cores.length];
        return isBox
            ? `bg-${cor} bg-opacity-10`
            : `bg-${cor}`;
    };

    $scope.getTextClass = function (index) {
        const cor = $scope.cores[index % $scope.cores.length];
        return `text-${cor}`;
    };

    $scope.formataDataHora = function (data) {
        return moment(data)
            .subtract(0, 'hours')
            .format('DDMMM HH[h]mm');
    };

    $scope.formatarTempo = function (segundos) {
        if (!segundos || segundos < 0) return "0s";

        // Se for abaixo de 60 segundos
        if (segundos < 60) {
            return segundos + "s";
        }

        // Se for abaixo de 1 hora (60 * 60)
        if (segundos < 3600) {
            const minutos = Math.floor(segundos / 60);
            const restoSeg = segundos % 60;
            return `${minutos}m${restoSeg.toString().padStart(2, '0')}s`;
        }

        // Se for 1 hora ou mais
        const horas = Math.floor(segundos / 3600);
        const minutos = Math.floor((segundos % 3600) / 60);
        const restoSeg = segundos % 60;
        return `${horas}h${minutos.toString().padStart(2, '0')}m${restoSeg.toString().padStart(2, '0')}s`;
    };

});