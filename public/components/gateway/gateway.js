app.component('gateway', {
  bindings: {
    acao: '@',         // Pai ➜ Filho (valor literal)
    funcao: '<',
    edit: '<',        // recebe dados do pai (objeto ou boolean)
    idUser: '<',      // recebe um valor (ID do usuário)
    onFechar: '&'    // callback (pai define o que acontece quando algo retorna)
  },

  controller: function (uteisService, $http, $timeout) {
    const $ctrl = this

    $ctrl._editGateway = {};
    $ctrl._regConta = {};
    $ctrl._listCategorias = [];
    $ctrl._listNivel1 = [];
    $ctrl._listNivel2 = [];
    $ctrl._listNivel3 = [];
    $ctrl._listNivel4 = [];
    $ctrl._regLeituras = [];
    $ctrl.socket = null;

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

      await $ctrl.onCarregaColaboradores();
      await $ctrl.onCarregaNiveis('01');

      if (reg == undefined) {

        $ctrl._editGateway = {
          _id: uteisService.onGetID(),
          id_conta: $ctrl._regConta._id,
          ativo: '1',
          descricao: '',
          tokem: gerarChaveAleatoria(),
          modo: 'fixo',

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

        $ctrl._editGateway = reg;
        $ctrl._editGateway.ativo = "" + $ctrl._editGateway.ativo;
        $ctrl._editGateway.id_categoria = $ctrl._editGateway.id_categoria;

        $ctrl._editGateway['_foto'] = '../assets/images/icon_cadastro.fw.png'
        if ($ctrl._editGateway.foto) {
          $ctrl._editGateway._foto = uteisService.apiUrl_() + '/image/' + $ctrl._editGateway.foto
        };

        if ($ctrl._editGateway.id_nivel_loc1) {
          await $ctrl.onCarregaNiveis('02')

          if ($ctrl._editGateway.id_nivel_loc2) {
            await $ctrl.onCarregaNiveis('03')

            if ($ctrl._editGateway.id_nivel_loc3) {
              await $ctrl.onCarregaNiveis('04')
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

    $ctrl.onCarregaNiveis = async function (nivel) {

      let id_nivel = null;
      if (nivel == '02') {
        id_nivel = $ctrl._editGateway.id_nivel_loc1
      } else if (nivel == '03') {
        id_nivel = $ctrl._editGateway.id_nivel_loc2
      } else if (nivel == '04') {
        id_nivel = $ctrl._editGateway.id_nivel_loc3
      }

      let _url = '/_bd?c=localizacao&id_conta=' + $ctrl._regConta._id + '&id_nivel=' + id_nivel
      _url += '&sort=descricao'

      await uteisService.getBase(_url)
        .then((res) => {

          $timeout(() => {
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
          }, 700)
        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });
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

    // Função para formatar data/hora
    $ctrl.formataDataHora = function (data) {
      if (!data) return '-';
      const date = new Date(data);
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    };

    // Limpa socket ao fechar o componente
    $ctrl.$onDestroy = function () {
      if ($ctrl.socket) {
        $ctrl.socket.disconnect();
        $ctrl.socket = null;
      }
    };


    $ctrl.fechar = function () {
      // dispara o callback do pai
      $ctrl.onFechar();
    };

  },
  templateUrl: 'components/gateway/gateway.html'
});