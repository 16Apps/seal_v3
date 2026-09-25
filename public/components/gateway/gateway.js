app.component('gateway', {
  bindings: {
    acao: '@',         // Pai ➜ Filho (valor literal)
    funcao: '<',
    edit: '<',        // recebe dados do pai (objeto ou boolean)
    idUser: '<',      // recebe um valor (ID do usuário)
    onFechar: '&'    // callback (pai define o que acontece quando algo retorna)
  },

  controller: function (uteisService, $http, $timeout, params) {
    const $ctrl = this


    $ctrl._editGateway = {};
    $ctrl._regConta = {};
    $ctrl._listCategorias = [];
    $ctrl._listNivel1 = [];
    $ctrl._listNivel2 = [];
    $ctrl._listNivel3 = [];
    $ctrl._listNivel4 = [];

    $ctrl._listNivel1_destino = [];
    $ctrl._listNivel2_destino = [];
    $ctrl._listNivel3_destino = [];
    $ctrl._listNivel4_destino = [];

    // Sequência para ignorar respostas atrasadas (causa do "ora carrega ora não")
    $ctrl._seqNiveis = 0;
    $ctrl._seqNiveisDestino = 0;

    $ctrl._regLeituras = [];
    $ctrl.socket = null;

    function normalizaIdNivel(v) {
      if (v == null || v === '') return '';
      if (typeof v === 'object' && v._id) return String(v._id);
      return String(v);
    }

    $ctrl.options = {
      headers: { 'Content-Type': 'application/json' }
    };

    $ctrl.$onInit = function () {
      $ctrl._regConta = uteisService.getCookie('_conta');
      //$ctrl.onCarregaNiveisPlanta('01');
    };

    $ctrl.$onChanges = function (changes) {



      if ($ctrl.funcao == 'add') {
        $ctrl.onEditar(undefined)
      } else if ($ctrl.funcao == 'edit') {
        $ctrl.onEditar($ctrl.edit)
      }

    };

    $ctrl.onEditar = async function (reg) {

      const tabTrigger = document.querySelector('#gateways-a-tab');
      const tab = new bootstrap.Tab(tabTrigger);
      tab.show();

      await $ctrl.onCarregaColaboradores();


      if (reg == undefined) {

        $ctrl._seqNiveis += 1;
        $ctrl._seqNiveisDestino += 1;

        await $ctrl.onCarregaNiveis('01', false, $ctrl._seqNiveis);
        await $ctrl.onCarregaNiveisDestino('01', false, $ctrl._seqNiveisDestino);

        $ctrl._editGateway = {
          _id: uteisService.onGetID(),
          id_conta: $ctrl._regConta._id,
          ativo: '1',
          descricao: '',
          tokem: gerarChaveAleatoria(),
          tokem_associado: '',
          modo: 'fixo',

          posicao_esperada_auto: '0',
          id_colaborador_gateway: 'sem_id',
          id_colaborador: '',
          id_maquina: '',

          id_nivel_loc1: '',
          id_nivel_loc2: '',
          id_nivel_loc3: '',
          id_nivel_loc4: '',

          latitude: '',
          longitude: '',

          intervalo_ausencia: '60',
          intervalo_reg_gps: '180',
          intervalo_reg_rssi: '180',
          intervalo_reg_inventario: '60',
          gera_associao: '0',

          portal_acao: '0',
          portal_registro_ordem: '0',
          portal_alertas: '0',

          leitor: 'beacon',
          leitor_mac: '',
          leitor_potencia: '16',
          leitor_secao: '1',
          leitor_estado: 'a',
          codif_epc: 'manual',
          codif_epc_inicial: '8',
          codif_epc_comprimento: '13',

          watch_regra: 'sem_leitura',
          watch_valor: '30',
          leitura_base: [],

          foto: '',
          _foto: '../assets/images/icon_cadastro.fw.png'

        };


        $ctrl._modoFixo = true;

      } else {

        $ctrl._editGateway = angular.copy(reg);
        $ctrl._editGateway.ativo = "" + $ctrl._editGateway.ativo;
        $ctrl._editGateway.gera_associao = "" + $ctrl._editGateway.gera_associao;
        $ctrl._editGateway.posicao_esperada_auto = "" + $ctrl._editGateway.posicao_esperada_auto;
        $ctrl._editGateway.id_categoria = $ctrl._editGateway.id_categoria;

        // Garante IDs string para o select casar com value="{{ item._id }}"
        $ctrl._editGateway.id_nivel_loc1 = normalizaIdNivel($ctrl._editGateway.id_nivel_loc1);
        $ctrl._editGateway.id_nivel_loc2 = normalizaIdNivel($ctrl._editGateway.id_nivel_loc2);
        $ctrl._editGateway.id_nivel_loc3 = normalizaIdNivel($ctrl._editGateway.id_nivel_loc3);
        $ctrl._editGateway.id_nivel_loc4 = normalizaIdNivel($ctrl._editGateway.id_nivel_loc4);
        $ctrl._editGateway.id_nivel_loc1_destino = normalizaIdNivel($ctrl._editGateway.id_nivel_loc1_destino);
        $ctrl._editGateway.id_nivel_loc2_destino = normalizaIdNivel($ctrl._editGateway.id_nivel_loc2_destino);
        $ctrl._editGateway.id_nivel_loc3_destino = normalizaIdNivel($ctrl._editGateway.id_nivel_loc3_destino);
        $ctrl._editGateway.id_nivel_loc4_destino = normalizaIdNivel($ctrl._editGateway.id_nivel_loc4_destino);

        $ctrl._editGateway['_foto'] = '../assets/images/icon_cadastro.fw.png'
        if ($ctrl._editGateway.foto) {
          $ctrl._editGateway._foto = uteisService.apiUrl_() + '/image/' + $ctrl._editGateway.foto
        };

        // Cancela respostas atrasadas de edições anteriores
        $ctrl._seqNiveis += 1;
        $ctrl._seqNiveisDestino += 1;
        const seqOrigem = $ctrl._seqNiveis;
        const seqDestino = $ctrl._seqNiveisDestino;

        $ctrl._listNivel1 = [];
        $ctrl._listNivel2 = [];
        $ctrl._listNivel3 = [];
        $ctrl._listNivel4 = [];
        $ctrl._listNivel1_destino = [];
        $ctrl._listNivel2_destino = [];
        $ctrl._listNivel3_destino = [];
        $ctrl._listNivel4_destino = [];

        await $ctrl.onCarregaNiveis('01', true, seqOrigem);

        if ($ctrl._editGateway.id_nivel_loc1) {
          await $ctrl.onCarregaNiveis('02', true, seqOrigem);

          if ($ctrl._editGateway.id_nivel_loc2) {
            await $ctrl.onCarregaNiveis('03', true, seqOrigem);

            if ($ctrl._editGateway.id_nivel_loc3) {
              await $ctrl.onCarregaNiveis('04', true, seqOrigem);
            };
          }
        }

        await $ctrl.onCarregaNiveisDestino('01', true, seqDestino);
        if ($ctrl._editGateway.id_nivel_loc1_destino) {
          await $ctrl.onCarregaNiveisDestino('02', true, seqDestino);

          if ($ctrl._editGateway.id_nivel_loc2_destino) {
            await $ctrl.onCarregaNiveisDestino('03', true, seqDestino);

            if ($ctrl._editGateway.id_nivel_loc3_destino) {
              await $ctrl.onCarregaNiveisDestino('04', true, seqDestino);
            };
          }
        }

      };

      $ctrl.onLogs()

    };

    $ctrl.onMudaModo = async function () {
      $timeout(() => {
        $ctrl._editGateway.modo = $ctrl._modoFixo ? 'fixo' : 'movel';
      }, 10);
    };

    function gerarChaveAleatoria() {
      const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let chave = '';
      for (let i = 0; i < 5; i++) {
        const indice = Math.floor(Math.random() * caracteres.length);
        chave += caracteres.charAt(indice);
      }
      return chave;
    };

    $ctrl.onCarregaColaboradores = async function () {

      let _url = '/_bd?c=colaborador&id_conta=' + $ctrl._regConta._id
      _url += '&sort=nome'

      await uteisService.getBase(_url)
        .then((res) => {

          $timeout(() => {
            $ctrl._listColaboradores = res
          }, 10);

        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });
    };

    $ctrl.onMudaNivel = async function (nivel) {
      if (nivel === '02') {
        $ctrl._editGateway.id_nivel_loc2 = '';
        $ctrl._editGateway.id_nivel_loc3 = '';
        $ctrl._editGateway.id_nivel_loc4 = '';
      } else if (nivel === '03') {
        $ctrl._editGateway.id_nivel_loc3 = '';
        $ctrl._editGateway.id_nivel_loc4 = '';
      } else if (nivel === '04') {
        $ctrl._editGateway.id_nivel_loc4 = '';
      }
      $ctrl._seqNiveis += 1;
      await $ctrl.onCarregaNiveis(nivel, true, $ctrl._seqNiveis);
    };

    $ctrl.onMudaNivelDestino = async function (nivel) {
      if (nivel === '02') {
        $ctrl._editGateway.id_nivel_loc2_destino = '';
        $ctrl._editGateway.id_nivel_loc3_destino = '';
        $ctrl._editGateway.id_nivel_loc4_destino = '';
      } else if (nivel === '03') {
        $ctrl._editGateway.id_nivel_loc3_destino = '';
        $ctrl._editGateway.id_nivel_loc4_destino = '';
      } else if (nivel === '04') {
        $ctrl._editGateway.id_nivel_loc4_destino = '';
      }
      $ctrl._seqNiveisDestino += 1;
      await $ctrl.onCarregaNiveisDestino(nivel, true, $ctrl._seqNiveisDestino);
    };

    $ctrl.onCarregaNiveis = async function (nivel, limparFilhos, seq) {
      const seqAtual = seq != null ? seq : $ctrl._seqNiveis;

      let id_nivel = null;
      if (nivel == '02') {
        id_nivel = $ctrl._editGateway.id_nivel_loc1;
      } else if (nivel == '03') {
        id_nivel = $ctrl._editGateway.id_nivel_loc2;
      } else if (nivel == '04') {
        id_nivel = $ctrl._editGateway.id_nivel_loc3;
      }

      // Sem pai selecionado: só limpa filhos
      if (nivel !== '01' && !id_nivel) {
        if (nivel == '02') {
          $ctrl._listNivel2 = [];
          $ctrl._listNivel3 = [];
          $ctrl._listNivel4 = [];
        } else if (nivel == '03') {
          $ctrl._listNivel3 = [];
          $ctrl._listNivel4 = [];
        } else if (nivel == '04') {
          $ctrl._listNivel4 = [];
        }
        return;
      }

      let _url = '/_bd?c=localizacao&id_conta=' + $ctrl._regConta._id + '&id_nivel=' + id_nivel;
      _url += '&sort=descricao';

      try {
        const res = await uteisService.getBase(_url);
        // Resposta atrasada de outra edição → ignora
        if (seqAtual !== $ctrl._seqNiveis) return;

        const lista = Array.isArray(res) ? res : [];

        if (nivel == '01') {
          $ctrl._listNivel1 = lista;
          if (limparFilhos !== false) {
            $ctrl._listNivel2 = [];
            $ctrl._listNivel3 = [];
            $ctrl._listNivel4 = [];
          }
        } else if (nivel == '02') {
          $ctrl._listNivel2 = lista;
          if (limparFilhos !== false) {
            $ctrl._listNivel3 = [];
            $ctrl._listNivel4 = [];
          }
        } else if (nivel == '03') {
          $ctrl._listNivel3 = lista;
          if (limparFilhos !== false) {
            $ctrl._listNivel4 = [];
          }
        } else if (nivel == '04') {
          $ctrl._listNivel4 = lista;
        }
      } catch (error) {
        uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
      }
    };

    $ctrl.onCarregaNiveisDestino = async function (nivel, limparFilhos, seq) {
      const seqAtual = seq != null ? seq : $ctrl._seqNiveisDestino;

      let id_nivel = null;
      if (nivel == '02') {
        id_nivel = $ctrl._editGateway.id_nivel_loc1_destino;
      } else if (nivel == '03') {
        id_nivel = $ctrl._editGateway.id_nivel_loc2_destino;
      } else if (nivel == '04') {
        id_nivel = $ctrl._editGateway.id_nivel_loc3_destino;
      }

      if (nivel !== '01' && !id_nivel) {
        if (nivel == '02') {
          $ctrl._listNivel2_destino = [];
          $ctrl._listNivel3_destino = [];
          $ctrl._listNivel4_destino = [];
        } else if (nivel == '03') {
          $ctrl._listNivel3_destino = [];
          $ctrl._listNivel4_destino = [];
        } else if (nivel == '04') {
          $ctrl._listNivel4_destino = [];
        }
        return;
      }

      let _url = '/_bd?c=localizacao&id_conta=' + $ctrl._regConta._id + '&id_nivel=' + id_nivel;
      _url += '&sort=descricao';

      try {
        const res = await uteisService.getBase(_url);
        if (seqAtual !== $ctrl._seqNiveisDestino) return;

        const lista = Array.isArray(res) ? res : [];

        if (nivel == '01') {
          $ctrl._listNivel1_destino = lista;
          if (limparFilhos !== false) {
            $ctrl._listNivel2_destino = [];
            $ctrl._listNivel3_destino = [];
            $ctrl._listNivel4_destino = [];
          }
        } else if (nivel == '02') {
          $ctrl._listNivel2_destino = lista;
          if (limparFilhos !== false) {
            $ctrl._listNivel3_destino = [];
            $ctrl._listNivel4_destino = [];
          }
        } else if (nivel == '03') {
          $ctrl._listNivel3_destino = lista;
          if (limparFilhos !== false) {
            $ctrl._listNivel4_destino = [];
          }
        } else if (nivel == '04') {
          $ctrl._listNivel4_destino = lista;
        }
      } catch (error) {
        uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
      }
    };

    $ctrl.onGetFoto = function () {

      document.getElementById('imgLogo').click();
      document.getElementById('imgLogo').onchange = function () {

        $ctrl._editGateway._foto = "assets/images/carregando_icon.gif";

        const file = this.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function (e) {

            $http.post(uteisService.apiUrl_() + '/image/save', [{ foto: e.target.result }], $ctrl.options)
              .then(function (res) {
                $timeout(() => {
                  $ctrl._editGateway._foto = e.target.result;
                  $ctrl._editGateway.foto = res.data[0].id_foto
                }, 2000)

              }, function (error) { });

          };
          reader.readAsDataURL(file);
        }

      };
    };


    $ctrl.onSalvar = function () {

      if ($ctrl._editGateway.descricao == '') {
        uteisService.onToast('Informe uma descrição para o Gateway.', 'warning', 3000, 'top-end');
        return;
      };

      if ($ctrl._editGateway.tokem == '') {
        uteisService.onToast('O campo Tokem, é obrigatório.', 'warning', 3000, 'top-end');
        return;
      };

      if($ctrl._editGateway.modo == 'fixo' && $ctrl._editGateway.id_nivel_loc1 == '') {
        uteisService.onToast('Selecione ao menos um Nível da Localizacão.', 'warning', 3000, 'top-end');
        return;
      }

      if($ctrl._editGateway.modo != 'fixo') {
        $ctrl._editGateway.id_nivel_loc1 = '';
        $ctrl._editGateway.id_nivel_loc2 = '';
        $ctrl._editGateway.id_nivel_loc3 = '';
        $ctrl._editGateway.id_nivel_loc4 = '';
      }

      uteisService.patchBase('/gateway', $ctrl._editGateway)
        .then((res) => {
          uteisService.onToast('Registrado!', 'success', 3000, 'top-end');
          $ctrl.onFechar();
        })

    };

    $ctrl.onExcluir = function () {

      uteisService.onQuestion("Atenção!", "Deseja realmente excluir esse Registro?")
        .then(async (res) => {
          if (res) {
            uteisService.delBase('gateway/_id/' + $ctrl._editGateway._id)
            uteisService.onToast('Registrado excuido!', 'success', 3000, 'top-end');
            $ctrl.fechar();
          }
        })
    }

    $ctrl.onLogs = async function () {

      // Desconecta socket anterior se existir
      if ($ctrl.socket) {
        $ctrl.socket.disconnect();
        $ctrl.socket = null;
      }

      // Limpa leituras anteriores
      $ctrl._regLeituras = [];

      // Cria nova conexão socket
      $ctrl.socket = io(); // conexão padrão

      $ctrl.socket.on($ctrl._editGateway._id, function (data) {
        try {
          // Se os dados vierem como string JSON, converte para objeto
          let leitura = typeof data === 'string' ? JSON.parse(data) : data;

          // Adiciona timestamp de recebimento
          leitura._timestamp_recebido = new Date().toISOString();

          $timeout(() => {
            // Adiciona no início da lista (mais recente primeiro)
            $ctrl._regLeituras.unshift(leitura);

            // Mantém apenas os 50 últimos registros
            if ($ctrl._regLeituras.length > 50) {
              $ctrl._regLeituras = $ctrl._regLeituras.slice(0, 50);
            }
          }, 0);
        } catch (error) {
          console.error('Erro ao processar leitura:', error, data);
        }
      });

    };

    $ctrl.onAtualizaDados = async function () {
      if (!$ctrl._editGateway || !$ctrl._editGateway._id) {
        uteisService.onToast('Salve o gateway antes de atualizar os dados.', 'warning', 2500, 'top-end');
        return;
      }

      await uteisService.getBase('/_bd?c=gateway&_id=' + $ctrl._editGateway._id)
        .then((res) => {
          const reg = (res && res.length > 0) ? res[0] : null;
          $timeout(() => {
            $ctrl._editGateway.dados = (reg && Array.isArray(reg.dados)) ? reg.dados : [];
          }, 0);
        })
        .catch(() => {
          uteisService.onToast('Erro ao atualizar os dados do gateway.', 'error', 2500, 'top-end');
        });
    };


    $ctrl.formataDataHora = function (data) {
      const date = moment(data, 'YYYY-MM-DD HH:mm:ss')
        .add(params.timeAdd, 'hours'); // Remove 3 horas

      return date.format('DDMMM HH[h]mm:ss');
    };


    // Função para formatar data/hora
    // $ctrl.formataDataHora = function (data) {
    //   if (!data) return '-';
    //   const date = new Date(data);
    //   // Subtrai 3 horas
    //   date.setHours(date.getHours() - params.timeAdd);
    //   return date.toLocaleString('pt-BR', {
    //     day: '2-digit',
    //     month: '2-digit',
    //     year: 'numeric',
    //     hour: '2-digit',
    //     minute: '2-digit',
    //     second: '2-digit'
    //   });
    // };

    // Limpa socket ao fechar o componente
    $ctrl.$onDestroy = function () {
      if ($ctrl.socket) {
        $ctrl.socket.disconnect();
        $ctrl.socket = null;
      }
    };


    $ctrl.fechar = function () {
      // invalida qualquer carga em andamento
      $ctrl._seqNiveis += 1;
      $ctrl._seqNiveisDestino += 1;

      $ctrl._listNivel1 = [];
      $ctrl._listNivel2 = [];
      $ctrl._listNivel3 = [];
      $ctrl._listNivel4 = [];

      $ctrl._listNivel1_destino = [];
      $ctrl._listNivel2_destino = [];
      $ctrl._listNivel3_destino = [];
      $ctrl._listNivel4_destino = [];

      $ctrl.onFechar();
    };

  },
  templateUrl: 'components/gateway/gateway.html'
});