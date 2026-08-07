app.controller('trackingCtrl', function ($scope, $http, params, uteisService, $timeout, $interval) {

  $scope._regConta = {};
  $scope._listRegistros = []
  $scope.socket = null;

  $scope._regColaborador = []
  $scope._regResumoItens = []

  $scope._filtroNivel1 = ""
  $scope._filtroNivel2 = ""
  $scope._filtroNivel3 = ""
  $scope._filtroNivel4 = ""

  $scope.cores = ['primary', 'success', 'warning', 'danger', 'info'];
  $scope.limite = 3;

  $scope.id_nivel = ""
  $scope.id_nivelPlanta = ""
  $scope.id_nivelPosicao = ""
  var modalInstance = undefined;
  let chartAgrupadoLocal1 = null;

  let chartAlocacao = null;
  let chartAlocacaoCategorias = null;
  let chartRegDia = null;

  $scope.$watch('$viewContentLoaded', async function () {
    $scope._regConta = uteisService.getCookie('_conta');
    $scope._regConta['_logo'] = '../assets/images/logo_default.fw.png'
    if ($scope._regConta.logo && $scope._regConta.logo.includes('logo_conta') == false) {
      let _url = uteisService.apiUrl_();
      $scope._regConta._logo = _url + '/image/' + $scope._regConta.logo;
    };
    $scope._regConta = uteisService.normalizarConta($scope._regConta);
    $scope._regColaborador = uteisService.getCookie('_colaborador');


    $scope.onSocket();

    $scope.onCarregaNiveis1();
    $scope.onCarregaNiveis('01');
    $scope.onCarregaTotalItens();


  });

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

        $scope.onCarregaRegistros();
      })

  };

  $scope.onCarregaNiveis = async function (nivel) {

    let id_nivel = null;
    if (nivel == '02') {
      id_nivel = $scope._filtroNivel1
    } else if (nivel == '03') {
      id_nivel = $scope._filtroNivel2
    } else if (nivel == '04') {
      id_nivel = $scope._filtroNivel3
    }

    let _url = '/_bd?c=localizacao&id_conta=' + $scope._regConta._id + '&id_nivel=' + id_nivel
    _url += '&sort=descricao'

    await uteisService.getBase(_url)
      .then((res) => {

        $timeout(() => {
          if (nivel == '01') {
            $scope._listNivel1 = res
            $scope._listNivel2 = []
            $scope._listNivel3 = [];
            $scope._listNivel4 = [];
          } else if (nivel == '02') {
            $scope._listNivel2 = res
            $scope._listNivel3 = [];
            $scope._listNivel4 = [];
          } else if (nivel == '03') {
            $scope._listNivel3 = res
            $scope._listNivel4 = [];

          } else if (nivel == '04') {
            $scope._listNivel4 = res
          };

          $scope.onCarregaTotalItens();
          $scope.onCarregaResumoItens()

        }, 900)
      })
      .catch((error) => {
        uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
      });
  };


  $scope.onCarregaRegistros = async function () {

    _url = '/relatorio/tags-ultimos-enderecos/' + $scope._regConta._id

    await uteisService.getBase(_url)
      .then((res) => {

        res.registros.map((item) => {
          item['_foto'] = '../assets/images/icon_cadastro.fw.png'
          if (item.categoria_foto && !item.categoria_foto.includes('assets')) {
            item._foto = uteisService.apiUrl_() + '/image/' + item.categoria_foto
          };
        });


        const listaRegistros = Array.isArray(res) ? res : (Array.isArray(res?.registros) ? res.registros : []);
        $scope._totalRegistros = Number(res?.total_registros || 0);

        const formatarMinutosTexto = (minutos) => {
          if (minutos <= 0) return '0 minuto';
          if (minutos < 1) {
            const segundos = Math.floor(minutos * 60);
            return segundos === 1 ? '1 segundo' : `${segundos} segundos`;
          }

          const minutosInteiros = Math.floor(minutos);
          const segundos = Math.floor((minutos - minutosInteiros) * 60);

          let texto = minutosInteiros === 1 ? '1 minuto' : `${minutosInteiros} minutos`;

          if (segundos > 0) {
            texto += segundos === 1 ? ` e 1 segundo` : ` e ${segundos} segundos`;
          }

          return texto;
        };

        const registrosComTempo = listaRegistros.map((item) => {
          const locaisComTempo = (Array.isArray(item.locais) ? item.locais : []).map((local, index, locais) => {
            const proximoLocal = locais[index + 1];
            let tempoDeslocamentoMin = 0;

            if (proximoLocal?.data_registro && local?.data_registro) {
              const dataAtual = new Date(local.data_registro);
              const dataProximo = new Date(proximoLocal.data_registro);
              const diffMs = dataAtual - dataProximo;

              tempoDeslocamentoMin = diffMs > 0 ? diffMs / 60000 : 0;
            }

            return {
              ...local,
              _tempo_deslocamento_min: Number(tempoDeslocamentoMin.toFixed(2)),
              _tempo_deslocamento_texto: formatarMinutosTexto(tempoDeslocamentoMin),
            };
          });

          return {
            ...item,
            locais: locaisComTempo,
          };
        });

        $scope._listRegistros = registrosComTempo
        $scope._listRegistros['total_registros'] = res.total_registros
        $scope.$apply();
      })
      .catch((error) => {
        uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
      });

  };

  $scope.onCarregaResumoItens = async function () {

    let _url = '/itens/total/' + $scope._regConta._id + '/' + $scope._filtroNivel1

    await uteisService.getBase(_url)
      .then((res) => {

        $scope._regResumoItens = res
        $scope.$apply();
      })
      .catch((error) => {
        uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
      });

  };


  $scope.onSocket = async function () {

    // Desconecta socket anterior se existir
    if ($scope.socket) {
      $scope.socket.disconnect();
      $scope.socket = null;
    }

    // Cria nova conexão socket
    $scope.socket = io(); // conexão padrão

    $scope.socket.on($scope._regConta._id, function (data) {
      try {
  

        $scope.onCarregaRegistros();
        $scope.onCarregaTotalItens();
        $scope.onCarregaResumoItens()

      } catch (error) {
        console.error('Erro ao processar leitura:', error, data);
      }
    });

  };

































  // Função para carregar o total de itens baseado nos filtros de nível
  $scope.onCarregaTotalItens = async function () {
    if (!$scope._regConta || !$scope._regConta._id) {
      return;
    }


    let _url = '/itens/total/' + $scope._regConta._id;

    // Adiciona os parâmetros de filtro se existirem
    const params = [];
    if ($scope._filtroNivel1) {
      params.push('nivel1=' + $scope._filtroNivel1);
    }
    if ($scope._filtroNivel2) {
      params.push('nivel2=' + $scope._filtroNivel2);
    }
    if ($scope._filtroNivel3) {
      params.push('nivel3=' + $scope._filtroNivel3);
    }
    if ($scope._filtroNivel4) {
      params.push('nivel4=' + $scope._filtroNivel4);
    }

    if (params.length > 0) {
      _url += '?' + params.join('&');
    }

    await uteisService.getBase(_url)
      .then((res) => {
        $scope._totalItensFiltrado = res;
        $scope.onGraficoAlocacao()
        $scope.$apply();
      })
      .catch((error) => {
        console.error('Erro ao carregar total de itens:', error);
      });
  };

  $scope.onGraficoAlocacao = function () {

    // Verifica se há dados para exibir
    if (!$scope._totalItensFiltrado || !$scope._totalItensFiltrado.localizacoes || $scope._totalItensFiltrado.localizacoes.length === 0) {
      // Destrói o gráfico se existir
      if (chartAlocacao) {
        chartAlocacao.destroy();
        chartAlocacao = null;
      }
      return;
    }

    let enderecos = []
    let enderecos_totais = []

    for (let i = 0; i < $scope._totalItensFiltrado.localizacoes.length; i++) {
      enderecos.push($scope._totalItensFiltrado.localizacoes[i].descricao)
      enderecos_totais.push($scope._totalItensFiltrado.localizacoes[i].total_itens)
    }

    const el = document.querySelector("#grafico-alocacao");
    if (!el) return console.warn("Elemento #grafico-alocacao não encontrado.");

    // 🔹 Se já existe gráfico, apenas atualiza
    if (chartAlocacao) {
      chartAlocacao.updateOptions({
        series: [
          {
            name: $scope._regConta.params_nomenclatura_itens.sku + 's',
            data: enderecos_totais
          }
        ],
        xaxis: {
          categories: enderecos
        }
      });
      return;
    }

    // 🔹 Caso contrário, cria a primeira vez
    var options = {
      chart: {
        height: 218,
        type: "bar",
        toolbar: {
          show: false,
        },
      },

      plotOptions: {
        bar: {
          columnWidth: "40%",
          borderRadius: 12,
          distributed: true,
          dataLabels: {
            position: "top",
            style: {
              fontSize: '30px',
              fontWeight: 'bold',
              colors: ['#fff']
            }
          },
        },
      },
      series: [
        {
          name: $scope._regConta.params_nomenclatura_itens.sku + 's',
          data: enderecos_totais,
        },
      ],
      legend: {
        show: false,
      },
      xaxis: {
        categories: enderecos,
        axisBorder: {
          show: false,
        },
        yaxis: {
          show: false,
        },

        tooltip: {
          enabled: true,
        },
        labels: {
          show: true,
          rotate: -45,
          rotateAlways: true,
        },
      },
      grid: {
        borderColor: "#575e6d",
        strokeDashArray: 5,
        xaxis: {
          lines: {
            show: true,
          },
        },
        yaxis: {
          lines: {
            show: false,
          },
        },
        padding: {
          top: 0,
          right: 10,
          left: 20,
          bottom: -20,
        },
      },
      tooltip: {
        y: {
          formatter: function (val) {
            return val;
          },
        },
      },
      colors: [
        "#005f73",
        "#0a9396",
        "#94d2bd",
        "#e9d8a6",
        "#ee9b00",
        "#ca6702",
        "#bb3e03",
      ],
    };

    chartAlocacao = new ApexCharts(el, options);
    chartAlocacao.render();
  };


  // Função para carregar o total de itens baseado nos filtros de nível
  $scope.onCarregaTotalCategoriasItens = async function () {
    if (!$scope._regConta || !$scope._regConta._id) {
      return;
    }

    let _url = '/itens_categorias/total?id_conta=' + $scope._regConta._id;

    // Adiciona os parâmetros de filtro se existirem
    const params = [];
    if ($scope._filtroNivel1) {
      _url += '&id_nivel_loc1=' + $scope._filtroNivel1;
    }
    if ($scope._filtroNivel2) {
      _url += '&id_nivel_loc2=' + $scope._filtroNivel2;
    }
    if ($scope._filtroNivel3) {
      _url += '&id_nivel_loc3=' + $scope._filtroNivel3;
    }
    if ($scope._filtroNivel4) {
      _url += '&id_nivel_loc4=' + $scope._filtroNivel4;
    }


    await uteisService.getBase(_url)
      .then((res) => {
        $scope._totalItensCategoriasFiltrado = res;
        $scope.onGraficoAlocacaoCategorias()
        $scope.$apply();
      })
      .catch((error) => {
        console.error('Erro ao carregar total de itens:', error);
      });
  };

  $scope.onGraficoAlocacaoCategorias = function () {

    // Verifica se há dados para exibir
    if (!$scope._totalItensCategoriasFiltrado || $scope._totalItensCategoriasFiltrado.length === 0) {
      // Destrói o gráfico se existir
      if (chartAlocacaoCategorias) {
        chartAlocacaoCategorias.destroy();
        chartAlocacaoCategorias = null;
      }
      return;
    };

    let enderecos = [];
    let enderecos_totais = [];

    for (let i = 0; i < $scope._totalItensCategoriasFiltrado.length; i++) {
      enderecos.push($scope._totalItensCategoriasFiltrado[i].descricao)
      enderecos_totais.push($scope._totalItensCategoriasFiltrado[i].total)
    }


    const el = document.querySelector("#grafico-alocacao-categorias");
    if (!el) return console.warn("Elemento #grafico-alocacao-categorias não encontrado.");

    // 🔹 Se já existe gráfico, apenas atualiza
    if (chartAlocacaoCategorias) {
      chartAlocacaoCategorias.updateOptions({
        series: [
          {
            name: $scope._regConta.params_nomenclatura_itens.sku + 's',
            data: enderecos_totais
          }
        ],
        xaxis: {
          categories: enderecos
        }
      });
      return;
    }

    // 🔹 Caso contrário, cria a primeira vez
    var options = {
      chart: {
        height: 218,
        type: "bar",
        toolbar: {
          show: false,
        },
      },

      plotOptions: {
        bar: {
          columnWidth: "40%",
          borderRadius: 12,
          distributed: true,
          dataLabels: {
            position: "top",
            style: {
              fontSize: '30px',
              fontWeight: 'bold',
              colors: ['#fff']
            }
          },
        },
      },
      series: [
        {
          name: $scope._regConta.params_nomenclatura_itens.sku + 's',
          data: enderecos_totais,
        },
      ],
      legend: {
        show: false,
      },
      xaxis: {
        categories: enderecos,
        axisBorder: {
          show: false,
        },
        yaxis: {
          show: false,
        },

        tooltip: {
          enabled: true,
        },
        labels: {
          show: true,
          rotate: -45,
          rotateAlways: true,
        },
      },
      grid: {
        borderColor: "#575e6d",
        strokeDashArray: 5,
        xaxis: {
          lines: {
            show: true,
          },
        },
        yaxis: {
          lines: {
            show: false,
          },
        },
        padding: {
          top: 0,
          right: 10,
          left: 20,
          bottom: -20,
        },
      },
      tooltip: {
        y: {
          formatter: function (val) {
            return val;
          },
        },
      },
      colors: [
        "#c9184a",
        "#ff4d6d",
        "#ff758f",
        "#e27396",
        "#ef476f",
        "#e5989b",
        "#b5838d",
      ],
    };

    chartAlocacaoCategorias = new ApexCharts(el, options);
    chartAlocacaoCategorias.render();
  };


  // Função para carregar o total de itens baseado nos filtros de nível
  $scope.onCarregaRegistrosRecentes = async function () {
    if (!$scope._regConta || !$scope._regConta._id) {
      return;
    }

    let _url = '/registro/ultimos-por-item?id_conta=' + $scope._regConta._id;

    // Adiciona os parâmetros de filtro se existirem
    const params = [];
    if ($scope._filtroNivel1) {
      _url += '&id_nivel_loc1=' + $scope._filtroNivel1;
    }
    if ($scope._filtroNivel2) {
      _url += '&id_nivel_loc2=' + $scope._filtroNivel2;
    }
    if ($scope._filtroNivel3) {
      _url += '&id_nivel_loc3=' + $scope._filtroNivel3;
    }
    if ($scope._filtroNivel4) {
      _url += '&id_nivel_loc4=' + $scope._filtroNivel4;
    }


    await uteisService.getBase(_url)
      .then((res) => {
        $scope._registrosRecentes = res;
        // $scope.onGraficoAlocacaoCategorias()
        $scope.$apply();
      })
      .catch((error) => {
        console.error('Erro ao carregar total de itens:', error);
      });
  };

  // Função para carregar o total de itens baseado nos filtros de nível
  $scope.onCarregaRegistrosRecentesLocalizacao = async function () {
    if (!$scope._regConta || !$scope._regConta._id) {
      return;
    }

    let _url = '/registro/ultimos-por_localizacao?id_conta=' + $scope._regConta._id;

    // Adiciona os parâmetros de filtro se existirem
    const params = [];
    if ($scope._filtroNivel1) {
      _url += '&id_nivel_loc1=' + $scope._filtroNivel1;
    }
    if ($scope._filtroNivel2) {
      _url += '&id_nivel_loc2=' + $scope._filtroNivel2;
    }
    if ($scope._filtroNivel3) {
      _url += '&id_nivel_loc3=' + $scope._filtroNivel3;
    }
    if ($scope._filtroNivel4) {
      _url += '&id_nivel_loc4=' + $scope._filtroNivel4;
    }


    await uteisService.getBase(_url)
      .then((res) => {
        $scope._registrosRecentesLocalizacao = res;
        // $scope.onGraficoAlocacaoCategorias()
        $scope.$apply();
      })
      .catch((error) => {
        console.error('Erro ao carregar total de itens:', error);
      });
  };

  // Função para carregar o total de itens baseado nos filtros de nível
  $scope.onCarregaRegistrosDia = async function () {
    if (!$scope._regConta || !$scope._regConta._id) {
      return;
    }

    let _url = '/registro/total-diario?id_conta=' + $scope._regConta._id;

    // Adiciona os parâmetros de filtro se existirem
    const params = [];
    if ($scope._filtroNivel1) {
      _url += '&id_nivel_loc1=' + $scope._filtroNivel1;
    }
    if ($scope._filtroNivel2) {
      _url += '&id_nivel_loc2=' + $scope._filtroNivel2;
    }
    if ($scope._filtroNivel3) {
      _url += '&id_nivel_loc3=' + $scope._filtroNivel3;
    }
    if ($scope._filtroNivel4) {
      _url += '&id_nivel_loc4=' + $scope._filtroNivel4;
    }

    await uteisService.getBase(_url)
      .then((res) => {
        $scope._registrosDia = res;
        $scope._registrosDiaResumo = resumoRegistrosDiarios(res);
        $scope.onGraficoMovimentacoes()
        $scope.onGraficoRegistros();
        $scope.$apply();
      })
      .catch((error) => {
        console.error('Erro ao carregar total de itens:', error);
      });
  };

  function resumoRegistrosDiarios(lista, opts = {}) {
    const {
      tz = 'America/Sao_Paulo',
      topN = 5,
      hoje = null, // opcional: 'YYYY-MM-DD' pra testar
    } = opts;

    // garante mapa por data
    const map = new Map();
    for (const it of Array.isArray(lista) ? lista : []) {
      if (!it || !it.data) continue;
      map.set(it.data, Number(it.total || 0));
    }

    // pega "hoje" e "ontem" em YYYY-MM-DD (no fuso)
    const pad2 = (n) => String(n).padStart(2, '0');

    const toYMD = (d) => {
      // Converte para data no fuso usando Intl (sem libs)
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(d);

      const y = parts.find(p => p.type === 'year')?.value;
      const m = parts.find(p => p.type === 'month')?.value;
      const dd = parts.find(p => p.type === 'day')?.value;
      return `${y}-${m}-${dd}`;
    };

    const addDays = (ymd, delta) => {
      // ymd -> Date (UTC) e ajusta dias; suficiente pq só precisamos de YMD final no tz
      const [Y, M, D] = ymd.split('-').map(Number);
      const dt = new Date(Date.UTC(Y, M - 1, D));
      dt.setUTCDate(dt.getUTCDate() + delta);
      return toYMD(dt);
    };

    const hojeYMD = hoje || toYMD(new Date());
    const ontemYMD = addDays(hojeYMD, -1);

    const totalHoje = map.get(hojeYMD) ?? 0;
    const totalOntem = map.get(ontemYMD) ?? 0;

    // dias anteriores com mais registros (exclui hoje e ontem)
    const topDias = (Array.isArray(lista) ? lista : [])
      .filter(it => it?.data && it.data !== hojeYMD && it.data !== ontemYMD)
      .slice() // copia
      .sort((a, b) => (Number(b.total || 0) - Number(a.total || 0)))
      .slice(0, topN);

    return {
      hoje: hojeYMD,
      ontem: ontemYMD,
      totalHoje,
      totalOntem,
      topDias
    };
  }

  $scope.onGraficoMovimentacoes = function () {

    if (!$scope._registrosDia || $scope._registrosDia.length === 0) {
      // Destrói o gráfico se existir
      if (chartRegDia) {
        chartRegDia.destroy();
        chartRegDia = null;
      }
      return;
    }

    let dias = [];
    let quantidades = [];

    let _registrosDia = JSON.parse(JSON.stringify($scope._registrosDia));
    _registrosDia = _registrosDia.slice(0, 7);

    for (let i = 0; i < _registrosDia.length; i++) {
      dias.push(_registrosDia[i].data);
      quantidades.push(_registrosDia[i].total);
    }


    var options = {
      series: [
        {
          name: "Registros",
          data: quantidades,
        },
      ],
      chart: {
        height: 270,
        type: "area",
        toolbar: {
          show: false,
        },
      },
      dataLabels: {
        enabled: false,
      },
      stroke: {
        curve: "smooth",
        width: 3,
      },
      grid: {
        borderColor: "#575e6d",
        strokeDashArray: 5,
        xaxis: {
          lines: {
            show: true,
          },
        },
        yaxis: {
          lines: {
            show: false,
          },
        },
        padding: {
          top: 0,
          right: 0,
          bottom: 10,
          left: 0,
        },
      },
      xaxis: {
        type: "day",
        categories: dias,
      },
      yaxis: {
        labels: {
          show: false,
        },
      },
      colors: ["#ef8354", "#1791bd"],
      markers: {
        size: 6,
        opacity: 0.3,
        colors: ["#ef8354", "#1791bd"],
        strokeColor: "#ffffff",
        strokeWidth: 2,
        hover: {
          size: 7,
        },
      },

    };

    var chart = new ApexCharts(document.querySelector("#visitors"), options);
    chart.render();

  }


  // Função para carregar o total de itens baseado nos filtros de nível
  $scope.onCarregaRegistrosRecentes2 = async function () {
    if (!$scope._regConta || !$scope._regConta._id) {
      return;
    }

    let _url = '/registro/ultimos-por-item?id_conta=' + $scope._regConta._id;

    // Adiciona os parâmetros de filtro se existirem
    const params = [];
    if ($scope._filtroNivel1) {
      _url += '&id_nivel_loc1=' + $scope._filtroNivel1;
    }
    if ($scope._filtroNivel2) {
      _url += '&id_nivel_loc2=' + $scope._filtroNivel2;
    }
    if ($scope._filtroNivel3) {
      _url += '&id_nivel_loc3=' + $scope._filtroNivel3;
    }
    if ($scope._filtroNivel4) {
      _url += '&id_nivel_loc4=' + $scope._filtroNivel4;
    }


    await uteisService.getBase(_url)
      .then((res) => {
        $scope._registrosRecentes = res;
        // $scope.onGraficoAlocacaoCategorias()
        $scope.$apply();
      })
      .catch((error) => {
        console.error('Erro ao carregar total de itens:', error);
      });
  };

  $scope.onGraficoRegistros = function () {
    var options = {
      series: [$scope._registrosDiaResumo.totalHoje],
      chart: {
        height: 230,
        type: 'radialBar',
        offsetY: 0,
      },

      stroke: {
        dashArray: 25,
        curve: 'smooth',
        lineCap: 'round',
      },
      grid: {
        padding: {
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        },
      },
      plotOptions: {
        radialBar: {
          startAngle: -135,
          endAngle: 135,
          hollow: {
            size: '75%',
            image: 'assets/images/ellipse-bg.svg',
            imageWidth: 140,
            imageHeight: 140,
            imageClipped: false,
          },
          track: {
            show: true,
            background: '#303641',
            strokeWidth: '97%',
            opacity: 0.4,
          },
          dataLabels: {
            show: true,
            name: {
              show: true,
              fontSize: '15px',
              fontFamily: undefined,
              fontWeight: 700,
              color: undefined,
              offsetY: -10,
            },
            value: {
              show: true,
              colors: '#1791bd',
              fontSize: '21px',
              fontWeight: 700,
              offsetY: 6,
              formatter: function (val) {
                return val + '';
              },
            },
          },
        },
      },
      labels: ['Hoje', 'Yesterday: 60'],
      colors: ["#1791bd", "#6A90FF", "#83A3FF", "#9DB6FF", "#B7C9FF", "#D0DCFF", "#EAEFFF"],
      legend: {
        show: false,
        position: 'bottom',
        fontSize: '14px',
        fontWeight: 500,
        markers: {
          width: 18,
          height: 18,
          strokeWidth: 5,
        },
        onItemClick: {
          toggleDataSeries: false,
        },
        onItemHover: {
          highlightDataSeries: false,
        },
      },
    };

    var chart = new ApexCharts(document.querySelector("#tasks"), options);
    chart.render();

  }

































  // Watchers para atualizar o total quando os filtros mudarem
  $scope.$watch('_filtroNivel1', function (newVal, oldVal) {
    if (newVal !== oldVal && $scope._regConta && $scope._regConta._id) {
      $scope.onCarregaTotalItens();
    }
  });

  $scope.$watch('_filtroNivel2', function (newVal, oldVal) {
    if (newVal !== oldVal && $scope._regConta && $scope._regConta._id) {
      $scope.onCarregaTotalItens();
    }
  });

  $scope.$watch('_filtroNivel3', function (newVal, oldVal) {
    if (newVal !== oldVal && $scope._regConta && $scope._regConta._id) {
      $scope.onCarregaTotalItens();
    }
  });

  $scope.$watch('_filtroNivel4', function (newVal, oldVal) {
    if (newVal !== oldVal && $scope._regConta && $scope._regConta._id) {
      $scope.onCarregaTotalItens();
    }
  });























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

  $scope.formataDataHoraSeg = function (data) {
    return moment(data)
      .subtract(0, 'hours')
      .format('DDMMM HH:mm:ss');
  };


  $scope.formataData = function (data) {
    return moment(data)
      .subtract(0, 'hours')
      .format('DDMMM');
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