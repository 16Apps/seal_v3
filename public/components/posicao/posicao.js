app.component('posicao', {
  bindings: {
    acao: '@',         // Pai ➜ Filho (valor literal)
    funcao: '<',
    edit: '<',        // recebe dados do pai (objeto ou boolean)
    tipo: '<',        // inventario | conferencia (vindo da página)
    idUser: '<',      // recebe um valor (ID do usuário)
    onFechar: '&'    // callback (pai define o que acontece quando algo retorna)
  },

  controller: function (uteisService, $http, $timeout, $scope) {
    const $ctrl = this

    $ctrl._editPosicao = {};
    $ctrl._regConta = {};
    $ctrl._guiaDestino = true;
    $ctrl._analisePosicao = {
      total: 0,
      alertas: [],
      statusGeral: 'aberta',
      statusCor: 'primary',
      ehConferencia: false
    };

    $ctrl._regAddItem = {
      id_ref: 'item',
      id_item: '',
      id_categoria: '',
      quantidade: 1
    };

    $ctrl.options = {
      headers: { 'Content-Type': 'application/json' }
    };

    $ctrl.$onInit = function () {
      $ctrl._regConta = uteisService.getCookie('_conta');
      $ctrl._regConta = uteisService.normalizarConta($ctrl._regConta);

      $scope.$watchCollection(function () {
        var itens = ($ctrl._editPosicao && $ctrl._editPosicao.itens) || [];
        return Array.isArray(itens) ? itens : [];
      }, function () {
        $ctrl.atualizarAnalisePosicao();
      });

      $scope.$watch(function () {
        var p = $ctrl._editPosicao || {};
        return (p.tipo || '') + '|' + (p.status || '');
      }, function () {
        $ctrl.atualizarAnalisePosicao();
      });
    };

    $ctrl.$onChanges = function (changes) {

      if ($ctrl.funcao == 'add') {
        $ctrl.onEditar(undefined)
      } else if ($ctrl.funcao == 'edit') {
        $ctrl.onEditar($ctrl.edit)
      };

    };

    $ctrl.onEditar = async function (reg) {

      await $ctrl.onCarregaNiveis('01');
      await $ctrl.onCarregaNiveisDestino('01')
      await $ctrl.onCarregaItens();
      await $ctrl.onCarregaCategorias();
      await $ctrl.onCarregaCategoriasTipos();

      const tabTrigger = document.querySelector('#categorias-a-tab');
      const tab = new bootstrap.Tab(tabTrigger);
      tab.show();

      if (reg == undefined) {

        $ctrl._editPosicao = {

          _id: uteisService.onGetID(),
          id_conta: $ctrl._regConta._id,
          ativo: '1',
          id_doc: '',
          descricao: '',
          observacao: '',
          tipo: $ctrl.tipo || 'inventario',

          icone: '',
          _icone: '../assets/images/icon_cadastro.fw.png',

          partida_data: '',
          tolerancia: 30,

          status: 'aberta',
          status_data: '',

          id_nivel_loc1: '',
          id_nivel_loc2: '',
          id_nivel_loc3: '',
          id_nivel_loc4: '',

          itens: [],

          previsao_chegada_data: '',
          previsao_chegada_tolerancia: 30,

          id_nivel_loc1_destino: '',
          id_nivel_loc2_destino: '',
          id_nivel_loc3_destino: '',
          id_nivel_loc4_destino: '',
        };

      } else {

        $ctrl._editPosicao = reg;
        $ctrl._editPosicao.ativo = "" + $ctrl._editPosicao.ativo;
        $ctrl._editPosicao._partida_data = $ctrl._editPosicao.partida_data;
        // Cópia bruta da previsão cadastrada (para exibição na lista quando ainda não há chegada real).

        // datetime-local no Angular 1 usa Date no ng-model; string ISO costuma não renderizar.
        // Zerar ms evita exibir milissegundos (ex.: ",949" em pt-BR).
        var mp = moment($ctrl._editPosicao.partida_data);
        if (mp.isValid()) {
          $ctrl._editPosicao.partida_data = mp.add(0, 'hours').millisecond(0).toDate();
        }

        var mprev = moment($ctrl._editPosicao.previsao_chegada_data);
        if (mprev.isValid()) {
          $ctrl._editPosicao.previsao_chegada_data = mprev.add(0, 'hours').millisecond(0).toDate();
        }


        $ctrl._editPosicao['_foto'] = '../assets/images/icon_cadastro.fw.png'
        if ($ctrl._editPosicao.foto) {
          $ctrl._editPosicao._foto = uteisService.apiUrl_() + '/image/' + $ctrl._editPosicao.foto
        };

        if ($ctrl._editPosicao.id_nivel_loc1) {

          await $ctrl.onCarregaNiveis('02')

          $timeout(async () => {
            if ($ctrl._editPosicao.id_nivel_loc2) {
              await $ctrl.onCarregaNiveis('03')

              $timeout(async () => {
                if ($ctrl._editPosicao.id_nivel_loc3) {
                  await $ctrl.onCarregaNiveis('04')
                };
              }, 200)
            }
          }, 200)
        }

        if ($ctrl._editPosicao.id_nivel_loc1_destino) {

          await $ctrl.onCarregaNiveisDestino('02')

          $timeout(async () => {
            if ($ctrl._editPosicao.id_nivel_loc2_destino) {
              await $ctrl.onCarregaNiveisDestino('03')

              $timeout(async () => {
                if ($ctrl._editPosicao.id_nivel_loc3_destino) {
                  await $ctrl.onCarregaNiveisDestino('04')
                };
              }, 200)
            }
          }, 200)
        }



      };

      $ctrl.atualizarAnalisePosicao();

    };

    $ctrl.onCarregaCategorias = async function () {

      let _url = '/_bd?c=categoria&id_conta=' + $ctrl._regConta._id
      _url += '&sort=descricao'

      await uteisService.getBase(_url)
        .then((res) => {

          $timeout(() => {
            $ctrl._listCategorias = res
          }, 10);

        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });
    };

    $ctrl.onCarregaCategoriasTipos = async function () {

      let _url = '/_bd?c=categoria_item&id_conta=' + $ctrl._regConta._id
      _url += '&sort=descricao'

      await uteisService.getBase(_url)
        .then((res) => {

          $timeout(() => {
            $ctrl._listCategoriasTipos = res
          }, 10);

        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });
    };

    $ctrl.onCarregaItens = async function () {

      let _url = '/_bd?c=item&id_conta=' + $ctrl._regConta._id
      _url += '&pop=id_categoria';

      await uteisService.getBase(_url)
        .then((res) => {

          $timeout(() => {
            $ctrl._listItens = res
          }, 10);

        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });
    };

    const getIdRef = (obj) => (obj && obj._id ? obj._id : (obj || ''));

    const montarItemPosicao = function (item) {
      return {
        _id: uteisService.onGetID(),
        id_item: item._id,
        id_categoria: '',

        tag: item.tag,
        ean: '',
        rssi: '',

        quantidade: 1,
        status: 'pendente',
        status_data: '',
        id_gatweway: '',
        id_colaborador: '',

        inf_compl_1: item.inf_compl1,
        inf_compl_2: item.inf_compl2,
        inf_compl_3: item.inf_compl3,
        inf_compl_4: item.inf_compl4,
        inf_compl_5: item.inf_compl5,

        status_destino: '',
        status_destino_data: '',
      };
    };

    const limparNiveisFilhos = function (nivel) {
      if (nivel === '02') {
        $ctrl._editPosicao.id_nivel_loc2 = '';
        $ctrl._editPosicao.id_nivel_loc3 = '';
        $ctrl._editPosicao.id_nivel_loc4 = '';
      } else if (nivel === '03') {
        $ctrl._editPosicao.id_nivel_loc3 = '';
        $ctrl._editPosicao.id_nivel_loc4 = '';
      } else if (nivel === '04') {
        $ctrl._editPosicao.id_nivel_loc4 = '';
      }
    };

    const limparNiveisFilhosDestino = function (nivel) {
      if (nivel === '02') {
        $ctrl._editPosicao.id_nivel_loc2_destino = '';
        $ctrl._editPosicao.id_nivel_loc3_destino = '';
        $ctrl._editPosicao.id_nivel_loc4_destino = '';
      } else if (nivel === '03') {
        $ctrl._editPosicao.id_nivel_loc3_destino = '';
        $ctrl._editPosicao.id_nivel_loc4_destino = '';
      } else if (nivel === '04') {
        $ctrl._editPosicao.id_nivel_loc4_destino = '';
      }
    };

    $ctrl.onNivelLocChange = async function (nivel) {
      limparNiveisFilhos(nivel);
      await $ctrl.onCarregaNiveis(nivel);
    };

    $ctrl.onNivelLocDestinoChange = async function (nivel) {
      limparNiveisFilhosDestino(nivel);
      await $ctrl.onCarregaNiveisDestino(nivel);
    };

    $ctrl.onCarregaItensInventario = async function () {
      if ($ctrl._editPosicao.tipo !== 'inventario') return;
      if (!$ctrl._editPosicao.id_nivel_loc1) {
        $ctrl._editPosicao.itens = [];
        return;
      }

      let _url = '/_bd?c=item&id_conta=' + $ctrl._regConta._id;
      _url += '&pop=id_categoria';
      _url += '&id_nivel_loc1=' + encodeURIComponent($ctrl._editPosicao.id_nivel_loc1);

      if ($ctrl._editPosicao.id_nivel_loc2) {
        _url += '&id_nivel_loc2=' + encodeURIComponent($ctrl._editPosicao.id_nivel_loc2);
      }
      if ($ctrl._editPosicao.id_nivel_loc3) {
        _url += '&id_nivel_loc3=' + encodeURIComponent($ctrl._editPosicao.id_nivel_loc3);
      }
      if ($ctrl._editPosicao.id_nivel_loc4) {
        _url += '&id_nivel_loc4=' + encodeURIComponent($ctrl._editPosicao.id_nivel_loc4);
      }

      try {
        const res = await uteisService.getBase(_url);
        const itensEncontrados = Array.isArray(res) ? res : [];
        const existentes = {};

        ($ctrl._editPosicao.itens || []).forEach((item) => {
          if (item && item.id_item) existentes[item.id_item] = item;
        });

        $ctrl._editPosicao.itens = itensEncontrados.map((item) => {
          if (existentes[item._id]) return existentes[item._id];
          return montarItemPosicao(item);
        });

        $timeout(() => {
          $ctrl._listItens = itensEncontrados;
        }, 10);
      } catch (error) {
        uteisService.onToast('Não foi possível carregar os itens do endereço.', 'error', 2000, 'top-end');
      }
    };

    $ctrl.onCarregaNiveis = async function (nivel) {

      let id_nivel = null;
      if (nivel == '02') {
        id_nivel = $ctrl._editPosicao.id_nivel_loc1
      } else if (nivel == '03') {
        id_nivel = $ctrl._editPosicao.id_nivel_loc2
      } else if (nivel == '04') {
        id_nivel = $ctrl._editPosicao.id_nivel_loc3
      }

      let _url = '/_bd?c=localizacao&id_conta=' + $ctrl._regConta._id + '&id_nivel=' + id_nivel
      _url += '&sort=descricao'

      await uteisService.getBase(_url)
        .then(async (res) => {

          $timeout(async () => {
            if (nivel == '01') {
              $ctrl._listNivel1 = res
              $ctrl._listNivel2 = []
              $ctrl._listNivel3 = [];
              $ctrl._listNivel4 = [];
            } else if (nivel == '02') {
              $ctrl._listNivel2 = res
              $ctrl._listNivel3 = [];
              $ctrl._listNivel4 = [];
            } else if (nivel == '03') {
              $ctrl._listNivel3 = res
              $ctrl._listNivel4 = [];

            } else if (nivel == '04') {
              $ctrl._listNivel4 = res
            };

            if ($ctrl._editPosicao.tipo === 'inventario' && nivel !== '01') {
              await $ctrl.onCarregaItensInventario();
            }
          }, 900)
        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });
    };

    $ctrl.onCarregaNiveisDestino = async function (nivel) {

      let id_nivel = null;
      if (nivel == '02') {
        id_nivel = $ctrl._editPosicao.id_nivel_loc1_destino
      } else if (nivel == '03') {
        id_nivel = $ctrl._editPosicao.id_nivel_loc2_destino
      } else if (nivel == '04') {
        id_nivel = $ctrl._editPosicao.id_nivel_loc3_destino
      }

      let _url = '/_bd?c=localizacao&id_conta=' + $ctrl._regConta._id + '&id_nivel=' + id_nivel
      _url += '&sort=descricao'

      await uteisService.getBase(_url)
        .then((res) => {

          $timeout(() => {
            if (nivel == '01') {
              $ctrl._listNivel1Destino = res
              $ctrl._listNivel2Destino = []
              $ctrl._listNivel3Destino = [];
              $ctrl._listNivel4Destino = [];
            } else if (nivel == '02') {
              $ctrl._listNivel2Destino = res
              $ctrl._listNivel3Destino = [];
              $ctrl._listNivel4Destino = [];
            } else if (nivel == '03') {
              $ctrl._listNivel3Destino = res
              $ctrl._listNivel4Destino = [];

            } else if (nivel == '04') {
              $ctrl._listNivel4Destino = res
            };
          }, 900)
        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });
    };

    $ctrl.onDefineLocal = async function (_setar) {

      if (_setar) {
        let iFind = $ctrl._listItens.findIndex((item) => item._id == $ctrl._regAddItem.id_item)
        $ctrl._editPosicao.id_nivel_loc1 = $ctrl._listItens[iFind].id_nivel_loc1
        $ctrl._editPosicao.id_nivel_loc2 = $ctrl._listItens[iFind].id_nivel_loc2
        $ctrl._editPosicao.id_nivel_loc3 = $ctrl._listItens[iFind].id_nivel_loc3
        $ctrl._editPosicao.id_nivel_loc4 = $ctrl._listItens[iFind].id_nivel_loc4

        if ($ctrl._editPosicao.id_nivel_loc1) {

          await $ctrl.onCarregaNiveis('02')

          $timeout(async () => {
            if ($ctrl._editPosicao.id_nivel_loc2) {
              await $ctrl.onCarregaNiveis('03')

              $timeout(async () => {
                if ($ctrl._editPosicao.id_nivel_loc3) {
                  await $ctrl.onCarregaNiveis('04')
                };
              }, 200)
            }
          }, 200)
        }

      } else {
        $ctrl._editPosicao.id_nivel_loc1 = ''
        $ctrl._editPosicao.id_nivel_loc2 = ''
        $ctrl._editPosicao.id_nivel_loc3 = ''
        $ctrl._editPosicao.id_nivel_loc4 = ''
      }

    }

    $ctrl.onAddItem = async function () {

      if ($ctrl._regAddItem.id_ref == 'item') {

        let iFind = $ctrl._editPosicao.itens.findIndex((item) => item.id_item == $ctrl._regAddItem.id_item)
        let iFindItem = $ctrl._listItens.findIndex((item) => item._id == $ctrl._regAddItem.id_item)
   
        if (iFind == -1) {
          $ctrl._editPosicao.itens.push({
            _id: uteisService.onGetID(),
            id_item: $ctrl._regAddItem.id_item,
            id_categoria: '',

            tag: $ctrl._listItens[iFindItem].tag,
            ean: '',
            rssi: '',

            quantidade: 1,
            status: 'pendente',
            status_data: '',
            id_gatweway: '',
            id_colaborador: '',

            inf_compl_1: $ctrl._listItens[iFindItem].inf_compl1,
            inf_compl_2: $ctrl._listItens[iFindItem].inf_compl2,
            inf_compl_3: $ctrl._listItens[iFindItem].inf_compl3,
            inf_compl_4: $ctrl._listItens[iFindItem].inf_compl4,
            inf_compl_5: $ctrl._listItens[iFindItem].inf_compl5,

            status_destino: '',
            status_destino_data: '',

          })
        } else {
          $ctrl._editPosicao.itens[iFind].quantidade = $ctrl._regAddItem.quantidade
        }

      } else {


        let iFind = $ctrl._editPosicao.itens.findIndex((item) => item.id_categoria == $ctrl._regAddItem.id_categoria)
        if (iFind == -1) {
          $ctrl._editPosicao.itens.push({
            _id: uteisService.onGetID(),
            id_item: '',
            id_categoria: $ctrl._regAddItem.id_categoria,
            quantidade: $ctrl._regAddItem.quantidade,
            status: 'pendente',
            status_data: '',
            id_gatweway: '',
            id_colaborador: '',
          })
        } else {
          $ctrl._editPosicao.itens[iFind].quantidade = $ctrl._regAddItem.quantidade
        }

      }


    };

    $ctrl.onGetFoto = function () {

      document.getElementById('imgLogo').click();
      document.getElementById('imgLogo').onchange = function () {

        $ctrl._editPosicao._foto = "assets/images/carregando_icon.gif";

        const file = this.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function (e) {

            $http.post(uteisService.apiUrl_() + '/image/save', [{ foto: e.target.result }], $ctrl.options)
              .then(function (res) {
                $timeout(() => {
                  $ctrl._editPosicao._foto = e.target.result;
                  $ctrl._editPosicao.foto = res.data[0].id_foto
                }, 2000)

              }, function (error) { });

          };
          reader.readAsDataURL(file);
        }

      };
    };


    $ctrl.onSalvar = function () {

      alert($ctrl._editPosicao.tipo);

      if ($ctrl._editPosicao.id_doc == '') {
        uteisService.onToast('Informe um iD para identificar o Documento.', 'warning', 3000, 'top-end');
        const tabTrigger = document.querySelector('#categorias-a-tab');
        const tab = new bootstrap.Tab(tabTrigger);
        tab.show();
        return;
      };

      if ($ctrl._editPosicao.partida_data == '') {
        uteisService.onToast('Informe a data de partida.', 'warning', 3000, 'top-end');
        const tabTrigger = document.querySelector('#categorias-a-tab');
        const tab = new bootstrap.Tab(tabTrigger);
        tab.show();
        return;
      };

      if ($ctrl._editPosicao.itens.length == 0) {
        uteisService.onToast('Selecione os itens que serão Movimentados.', 'warning', 3000, 'top-end');
        const tabTrigger = document.querySelector('#categorias-b-tab');
        const tab = new bootstrap.Tab(tabTrigger);
        tab.show();
        return;
      };

      if ($ctrl._editPosicao.previsao_chegada_data == '' && $ctrl._editPosicao.tipo == 'conferencia') {
        uteisService.onToast('Informe a data de previsão de chegada.', 'warning', 3000, 'top-end');
        const tabTrigger = document.querySelector('#categorias-c-tab');
        const tab = new bootstrap.Tab(tabTrigger);
        tab.show();
        return;
      };


      if ($ctrl._editPosicao.id_nivel_loc1_destino == '' && $ctrl._editPosicao.tipo == 'conferencia') {
        uteisService.onToast('Selecione o Local de destino.', 'warning', 3000, 'top-end');
        const tabTrigger = document.querySelector('#categorias-c-tab');
        const tab = new bootstrap.Tab(tabTrigger);
        tab.show();
        return;
      };

      uteisService.patchBase('/posicao', $ctrl._editPosicao)
        .then((res) => {
          uteisService.onToast('Registrado!', 'success', 3000, 'top-end');
          $ctrl.onFechar();
        })

    };

    $ctrl.onExcluir = function () {

      uteisService.onQuestion("Atenção!", "Deseja realmente excluir esse Registro?")
        .then(async (res) => {
          if (res) {
            uteisService.delBase('posicao/_id/' + $ctrl._editPosicao._id)
            uteisService.onToast('Registrado excuido!', 'success', 3000, 'top-end');
            $ctrl.fechar();
          }
        })
    }


    $ctrl.descricaoNivelLoc = function (nivel) {
      const id = $ctrl._editPosicao['id_nivel_loc' + nivel];
      if (!id) return 'Não definido';

      const lista = $ctrl['_listNivel' + nivel];
      if (!Array.isArray(lista)) return 'Não definido';

      const found = lista.find((item) => item && item._id === id);
      if (!found) return 'Não definido';

      return found.descricao || found.tag || id;
    };

    $ctrl.idItemDescricao = function (_idItem, _idCategoria, desc) {

      if (_idItem != '') {
        let iFind = $ctrl._listItens.findIndex((item) => item._id == _idItem)
        if (iFind != -1) {
          if (desc) {
            return $ctrl._listItens[iFind].id_categoria.descricao;
          } else {
            return $ctrl._listItens[iFind].tag
          }
        } else {
          return 'SKU N/A'
        }

      } else {
        let iFind = $ctrl._listCategorias.findIndex((item) => item._id == _idCategoria)
        if (iFind != -1) {
          if (desc) {
            return $ctrl._listCategorias[iFind].descricao;
          } else {
            return $ctrl._listCategorias[iFind].ean
          }
        } else {
          return 'Item N/A'
        }

      };

    };

    $ctrl.idItemTipoDescricao = function (_idItem) {

      let iFind = $ctrl._listItens.findIndex((item) => item._id == _idItem)
      let iFindTipo = $ctrl._listCategoriasTipos.findIndex((item) => item._id == $ctrl._listItens[iFind].id_categoria_reg1)
      if (iFindTipo != -1) {
        return $ctrl._listCategoriasTipos[iFindTipo].descricao
      } else {
        return 'Tipo de Item N/A'
      }


    }

    $ctrl.formataDataHora = function (data) {
      if (!data) return '';
      var date = moment(data, [
        'YYYY-MM-DD HH:mm:ss',
        'YYYY-MM-DDTHH:mm:ss',
        'YYYY-MM-DDTHH:mm:ss.SSS',
        moment.ISO_8601
      ], true);
      if (!date.isValid()) date = moment(data);
      if (!date.isValid()) return '';
      return date.add(0, 'hours').format('DDMMM HH[h]mm');
    };

    /** Enquanto nenhum item tiver data de chegada ao destino, a UI usa a previsão cadastrada. */
    $ctrl.semStatusDestinoDataNosItens = function () {
      var itens = ($ctrl._editPosicao && $ctrl._editPosicao.itens) || [];
      for (var i = 0; i < itens.length; i++) {
        if (itens[i] && itens[i].status_destino_data) return false;
      }
      return true;
    };

    const parseDataPosicao = function (data) {
      if (!data) return null;
      var date = moment(data, [
        'YYYY-MM-DD HH:mm:ss',
        'YYYY-MM-DDTHH:mm:ss',
        'YYYY-MM-DDTHH:mm:ss.SSS',
        moment.ISO_8601
      ], true);
      if (!date.isValid()) date = moment(data);
      return date.isValid() ? date : null;
    };

    const formatarDuracaoLeitura = function (ms) {
      if (ms == null || ms < 0) return '—';
      var dur = moment.duration(ms);
      var h = Math.floor(dur.asHours());
      var m = dur.minutes();
      var s = dur.seconds();
      if (h > 0) return h + 'h ' + m + 'min';
      if (m > 0) return m + ' min ' + s + 's';
      return s + 's';
    };

    $ctrl.atualizarAnalisePosicao = function () {
      var itens = ($ctrl._editPosicao && $ctrl._editPosicao.itens) || [];
      if (!Array.isArray(itens)) itens = [];
      var total = itens.length;
      var concluido = 0;
      var pendente = 0;
      var excedente = 0;
      var naoEncontrado = 0;
      var destinoConcluido = 0;
      var destinoPendente = 0;
      var quantidadeTotal = 0;
      var datasLeitura = [];

      itens.forEach(function (item) {
        if (!item) return;
        quantidadeTotal += Number(item.quantidade) || 1;

        var st = String(item.status || 'pendente').toLowerCase();
        if (st === 'concluido') concluido += 1;
        else if (st === 'excedente') excedente += 1;
        else if (st === 'nao_encontrado') naoEncontrado += 1;
        else pendente += 1;

        var std = String(item.status_destino || 'pendente').toLowerCase();
        if (std === 'concluido') destinoConcluido += 1;
        else destinoPendente += 1;

        var dt = parseDataPosicao(item.status_data);
        if (dt) datasLeitura.push(dt);
      });

      var pct = total > 0 ? Math.round((concluido / total) * 100) : 0;
      var pctDestino = total > 0 ? Math.round((destinoConcluido / total) * 100) : 0;

      var primeiraLeitura = null;
      var ultimaLeitura = null;
      var tempoLeitura = '—';

      if (datasLeitura.length >= 1) {
        datasLeitura.sort(function (a, b) { return a.valueOf() - b.valueOf(); });
        primeiraLeitura = datasLeitura[0];
        ultimaLeitura = datasLeitura[datasLeitura.length - 1];
        if (datasLeitura.length >= 2) {
          tempoLeitura = formatarDuracaoLeitura(ultimaLeitura.diff(primeiraLeitura));
        } else {
          tempoLeitura = '0s';
        }
      }

      var alertas = [];
      if (total === 0) {
        alertas.push({ tipo: 'secondary', icon: 'bi-inbox', msg: 'Nenhum item vinculado a este registro ainda.' });
      }
      if (pendente > 0) {
        alertas.push({ tipo: 'warning', icon: 'bi-hourglass-split', msg: pendente + ' item(ns) aguardando leitura na origem.' });
      }
      if (naoEncontrado > 0) {
        alertas.push({ tipo: 'danger', icon: 'bi-exclamation-triangle', msg: naoEncontrado + ' item(ns) não encontrado(s).' });
      }
      if (excedente > 0) {
        alertas.push({ tipo: 'info', icon: 'bi-plus-circle', msg: excedente + ' leitura(s) excedente(s) registrada(s).' });
      }

      var ehConferencia = $ctrl._editPosicao && $ctrl._editPosicao.tipo === 'conferencia';
      if (ehConferencia && total > 0) {
        if (destinoPendente > 0) {
          alertas.push({
            tipo: 'warning',
            icon: 'bi-geo-alt',
            msg: destinoPendente + ' item(ns) sem confirmação de leitura no destino.'
          });
        }
        if (concluido === total && destinoPendente > 0) {
          alertas.push({
            tipo: 'danger',
            icon: 'bi-signpost-split',
            msg: 'Origem concluída — aguardando leituras no destino.'
          });
        }
        if (destinoConcluido === total && total > 0) {
          alertas.push({
            tipo: 'success',
            icon: 'bi-check-circle',
            msg: 'Todos os itens confirmados no destino.'
          });
        }
      }

      if (pct === 100 && total > 0 && !ehConferencia) {
        alertas.push({ tipo: 'success', icon: 'bi-check-all', msg: 'Inventário concluído — 100% dos itens lidos.' });
      }

      var statusGeral = ($ctrl._editPosicao && $ctrl._editPosicao.status) || 'aberta';
      var statusCor = 'secondary';
      if (statusGeral === 'concluido') statusCor = 'success';
      else if (statusGeral === 'parcial') statusCor = 'warning';
      else if (statusGeral === 'partida') statusCor = 'info';
      else if (statusGeral === 'aberta') statusCor = 'primary';

      $ctrl._analisePosicao = {
        total: total,
        quantidadeTotal: quantidadeTotal,
        concluido: concluido,
        pendente: pendente,
        excedente: excedente,
        naoEncontrado: naoEncontrado,
        pct: pct,
        pctDestino: pctDestino,
        destinoConcluido: destinoConcluido,
        destinoPendente: destinoPendente,
        tempoLeitura: tempoLeitura,
        primeiraLeituraFmt: primeiraLeitura ? primeiraLeitura.format('DD/MMM HH:mm:ss') : '—',
        ultimaLeituraFmt: ultimaLeitura ? ultimaLeitura.format('DD/MMM HH:mm:ss') : '—',
        temLeituras: datasLeitura.length > 0,
        alertas: alertas,
        statusGeral: statusGeral,
        statusCor: statusCor,
        ehConferencia: ehConferencia,
        segmentos: [
          { label: 'Concluído', valor: concluido, cor: 'success' },
          { label: 'Pendente', valor: pendente, cor: 'danger' },
          { label: 'Excedente', valor: excedente, cor: 'purple' },
          { label: 'Não enc.', valor: naoEncontrado, cor: 'warning' }
        ].filter(function (s) { return s.valor > 0; })
      };
    };

    $ctrl.fechar = function () {
      // dispara o callback do pai

      $timeout(() => {
        $ctrl._listNivel1 = [];
        $ctrl._listNivel2 = [];
        $ctrl._listNivel3 = [];
        $ctrl._listNivel4 = [];
        $ctrl._listNivel1Destino = []
        $ctrl._listNivel2Destino = []
        $ctrl._listNivel3Destino = [];
        $ctrl._listNivel4Destino = [];
      }, 100);

      $ctrl.onFechar();
    };

  },
  templateUrl: 'components/posicao/posicao.html'
});