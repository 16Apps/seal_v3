app.component('localizacao', {
  bindings: {
    acao: '@',         // Pai ➜ Filho (valor literal)
    funcao: '<',
    edit: '<',        // recebe dados do pai (objeto ou boolean)
    idUser: '<',      // recebe um valor (ID do usuário)
    onFechar: '&'    // callback (pai define o que acontece quando algo retorna)
  },

  controller: function (uteisService, $http, $timeout) {
    const $ctrl = this

    $ctrl._idNivelEdit = '';
    $ctrl._listNivel2 = [];
    $ctrl._listNivel3 = [];
    $ctrl._listNivel4 = [];

    $ctrl._editNivelSub2 = undefined;
    $ctrl._editNivelSub3 = undefined;
    $ctrl._editNivelSub4 = undefined;

    $ctrl.plantaSrc = ''; // sua planta
    $ctrl.imgW = 0; $ctrl.imgH = 0;
    $ctrl.centroide = (points) => centroide(points);

    $ctrl._regPlanta = { areasData: [] }; // inicial vazio
    $ctrl.zoomStep = 0.2; // quanto aumenta/diminui por clique
    $ctrl.zoom = 1.4;               // fator de escala
    $ctrl.pan = { x: 0, y: 0 };  // deslocamento
    $ctrl.panning = false;        // arrastando?
    let panStart = { x: 0, y: 0 };
    let mouseStart = { x: 0, y: 0 };

    $ctrl.drawing = false;
    $ctrl.currentPoints = [];     // pontos do polígono em edição
    $ctrl.areas = [];

    //mapa
    let map;
    let drawingManager;

    // ap site survey
    $ctrl._editAP = {
      // _id: "",
      descricao: "",
      mac: "",
      rssi: "",
      range: "",
      // full_aps: true
    };
    $ctrl._listAPs = [];
    $ctrl._editApModo = false;
    $ctrl._nivelAp2 = "";
    $ctrl._nivelAp3 = "";
    $ctrl._nivelAp4 = "";

    $ctrl._nivelItens2 = "";
    $ctrl._nivelItens3 = "";
    $ctrl._nivelItens4 = "";

    $ctrl._regTotais = {
      itens: 0,
      parado: 0,
      movimento: 0,
      gateways_ativo: 0,
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
        $ctrl.onEditar(undefined, '1', undefined)
      } else if ($ctrl.funcao == 'edit') {
        $ctrl.onEditar($ctrl.edit, '1', undefined)
      }


    };

    $ctrl.onEditar = async function (reg, nivel, nivelPai) {

      $ctrl._idNivelEdit = nivel;
      $ctrl._nivelEditPai = nivelPai;
      if (nivelPai) {
        $ctrl._nivelEditPai['nivel'] = nivel
      }

      if (reg == undefined) {

        let _editNivel = {
          _id: uteisService.onGetID(),
          id_conta: $ctrl._regConta._id,
          id_nivel: nivelPai ? nivelPai : null,
          ativo: '1',
          descricao: '',
          tag: '',

          foto: '',
          _foto: '../assets/images/icon_cadastro.fw.png',

          planta_baixa: '',
          _planta_baixa: '../assets/images/planta_baixa.fw.png',

          cep: '',
          logradouro: '',
          numero: '',
          complemento: '',
          bairro: '',
          cidade: '',
          estado: '',
          pais: '',
          latitude: '',
          longitude: '',

          processo_app: '',

          observacao: ''
        };

        if (nivel == "1") {
          $ctrl._editNivel = _editNivel
          $ctrl._listNivel2 = [];
          $ctrl._listNivel3 = [];
          $ctrl._listNivel4 = [];
        } else {
          $ctrl['_editNivelSub' + nivel] = _editNivel
        }

      } else {

        if (nivel == "1") {
          $ctrl._editNivel = reg;
          $ctrl._editNivel.ativo = "" + $ctrl._editNivel.ativo;

          $ctrl._editNivel['_foto'] = '../assets/images/icon_cadastro.fw.png'
          if ($ctrl._editNivel.foto) {
            $ctrl._editNivel._foto = uteisService.apiUrl_() + '/image/' + $ctrl._editNivel.foto
          };

          $timeout(() => {
            $ctrl._editNivel['_planta_baixa'] = ''
            $ctrl.plantaSrc = '';

            if ($ctrl._editNivel.planta_baixa) {
              $ctrl._editNivel._planta_baixa = uteisService.apiUrl_() + '/image/' + $ctrl._editNivel.planta_baixa

              $ctrl.onCarregaPlanta();
            };

          }, 10)



          $ctrl.onCarregaSubNiveis('02', $ctrl._editNivel._id)

        } else {

          $ctrl['_editNivelSub' + nivel] = reg;

          if (nivel == "2") {
            $ctrl.onCarregaSubNiveis('03', $ctrl._editNivelSub2._id)
          } else if (nivel == "3") {
            $ctrl.onCarregaSubNiveis('04', $ctrl._editNivelSub3._id)
          };

        };
      };

    };

    $ctrl.onCarregaSubNiveis = async function (nivel, _idPai) {

      let _url = '/_bd?c=localizacao&id_conta=' + $ctrl._regConta._id + '&id_nivel=' + _idPai

      //_url += '&sort=descricao'
      await uteisService.getBase(_url)
        .then((res) => {

          $timeout(() => {
            if (nivel == '02') {
              $timeout(() => {
                $ctrl._listNivel2 = res
                $ctrl._listNivel3 = [];
                $ctrl._listNivel4 = [];
              }, 10);

            } else if (nivel == '03') {
              $ctrl._listNivel3 = res
              $ctrl._listNivel4 = [];

            } else if (nivel == '04') {
              $ctrl._listNivel4 = res
            };
          }, 10)

          // $ctrl.$apply();
        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });
    };

    $ctrl.onCancelarEditSub = function (nivel) {

      $timeout(() => {
        $ctrl['_editNivelSub' + nivel] = undefined;

        if (nivel == "2") {
          $ctrl._editNivelSub3 = undefined;
          $ctrl._editNivelSub4 = undefined;
          $ctrl._idNivelEdit = ""

        } else if (nivel == "3") {
          $ctrl._editNivelSub4 = undefined;
          $ctrl._idNivelEdit = "2"

        } else if (nivel == "4") {
          $ctrl._idNivelEdit = "3"
        }

      }, 10)

    };

    $ctrl.onGetFoto = function () {

      document.getElementById('imgLogo').click();
      document.getElementById('imgLogo').onchange = function () {

        $ctrl._editNivel._foto = "assets/images/carregando_icon.gif";

        const file = this.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function (e) {

            $http.post(uteisService.apiUrl_() + '/image/save', [{ foto: e.target.result }], $ctrl.options)
              .then(function (res) {
                $timeout(() => {
                  $ctrl._editNivel._foto = e.target.result;
                  $ctrl._editNivel.foto = res.data[0].id_foto
                }, 2000)

              }, function (error) { });

          };
          reader.readAsDataURL(file);
        }


      };
    };


    $ctrl.onSalvar = function (nivel) {

      let _regNivel = $ctrl._editNivel
      if (nivel != "1") {
        _regNivel = $ctrl['_editNivelSub' + nivel]
      }

      uteisService.patchBase('/localizacao', _regNivel)
        .then((res) => {
          uteisService.onToast('Registrado!', 'success', 3000, 'top-end');
          if (nivel == "1") {
            $ctrl.onFechar();
          } else {
            $timeout(() => {
              $ctrl['_editNivelSub' + nivel] = undefined;

              $ctrl.onCarregaSubNiveis('0' + nivel, _regNivel.id_nivel);

            }, 10)
          }
        })

    };

    $ctrl.onExcluir = function () {

      uteisService.onQuestion("Atenção!", "Deseja realmente excluir esse Registro?")
        .then(async (res) => {
          if (res) {
            uteisService.delBase('localizacao/_id/' + $ctrl._regNivel._id)
            uteisService.onToast('Registrado excuido!', 'success', 3000, 'top-end');
            $ctrl.fechar();
          }
        })
    }

    $ctrl.onGetCEP = async function () {

      if ($ctrl._editNivel.cep.length == 9) {
        $http.get(`https://viacep.com.br/ws/${$ctrl._editNivel.cep}/json`, uteisService.options)
          .then((res) => {
            if (res.data.erro) {
              uteisService.onToast('CEP inválido, digite novamente por favor.', 'error', 2000, 'top-end');
            } else {
              $ctrl._editNivel.logradouro = res.data.logradouro
              $ctrl._editNivel.bairro = res.data.bairro
              $ctrl._editNivel.cidade = res.data.localidade
              $ctrl._editNivel.estado = res.data.estado
              $ctrl._editNivel.pais = "Brasil"
            }

            // $ctrl.$apply()
          })
          .catch((error) => {
            console.log(error);
            //reject(error);
          })
      } else {
        $ctrl._editNivel.logradouro = ""
        $ctrl._editNivel.numero = ""
        $ctrl._editNivel.complemento = ""
        $ctrl._editNivel.bairro = ""
        $ctrl._editNivel.cidade = ""
        $ctrl._editNivel.estado = ""
        $ctrl._editNivel.pais = ""
      }
    };

    // Final do Cadastro

    // Planta Baixa
    document.getElementById('imgPlanta').onchange = function () {

      $ctrl._editNivel._planta_baixa = "../assets/img/carregando_capa.gif";

      setTimeout(() => {
        const file = this.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function (e) {
            // Atualiza o logo com a imagem carregada

            $ctrl._editNivel._planta_baixa = e.target.result;
            $ctrl.onPostPlanta(e.target.result);

          };
          reader.readAsDataURL(file);
        }
      }, 2000);

    };

    $ctrl.onPostPlanta = function (foto) {

      let reg = [];
      reg.push({
        foto: foto
      })

      let _url = uteisService.apiUrl_()

      $http.post(_url + '/image/save', reg, $ctrl.options)
        .then(function (res) {

          $ctrl._editNivel.planta_baixa = res.data[0].id_foto
          $ctrl._editNivel._planta_baixa = _url + '/image/' + res.data[0].id_foto;

          $ctrl.onCarregaPlanta();

        }, function (error) {
          // alert(JSON.stringify(error))
          // $ctrl.msgBox("Ops.. erro", JSON.stringify(error), "error");
        });

    };

    $ctrl.onCarregaPlanta = async function () {

      // let iFind = $ctrl._listNivel1.findIndex((item) => item._id == $ctrl._editPlanta.id_nivel_mapa)
      $ctrl.plantaSrc = $ctrl._editNivel._planta_baixa
      $ctrl.initPlanta();

    }

    $ctrl.initPlanta = function () {
      const img = new Image();
      img.onload = () => {
        $timeout(() => {
          $ctrl.imgW = img.naturalWidth;
          $ctrl.imgH = img.naturalHeight;
          $ctrl.loadPlanta('abc123'); // 👈 aqui você chama o carregamento da planta

        }, 500);
      };
      img.src = $ctrl.plantaSrc;

    };

    $ctrl.onCarregaPlantaZonas = async function (plantaId) {

      $ctrl._regPlanta = [{
        "areasData": []
      }]

      let _nivelFiltro = '';
      let _listaNivel
      if ($ctrl._nivelPlanta4) {
        _nivelFiltro = '4'
        _listaNivel = $ctrl._listPlantaNivel4.filter((item) => item._id == $ctrl._nivelPlanta4);

      } else if ($ctrl._nivelPlanta3) {
        if ($ctrl._listPlantaNivel4.length > 0) {
          _nivelFiltro = '4'
          _listaNivel = $ctrl._listPlantaNivel4
        } else {
          _nivelFiltro = '3'
          _listaNivel = $ctrl._listPlantaNivel3.filter((item) => item._id == $ctrl._nivelPlanta3);
        }

      } else if ($ctrl._nivelPlanta2) {
        if ($ctrl._listPlantaNivel3.length > 0) {
          _nivelFiltro = '3'
          _listaNivel = $ctrl._listPlantaNivel3
        } else {
          _nivelFiltro = '2'
          _listaNivel = $ctrl._listPlantaNivel2.filter((item) => item._id == $ctrl._nivelPlanta2);
        }

      } else if (!$ctrl._nivelPlanta2) {
        _nivelFiltro = '2';
        _listaNivel = $ctrl._listPlantaNivel1

      }

      for (let i = 0; i < _listaNivel.length; i++) {
        const nivel = _listaNivel[i];

        // 🔎 Verifica se areasData existe e tem pelo menos 1 item
        if (nivel?.areasData?.length > 0 && Array.isArray(nivel.areasData[0].points)) {

          // 🔎 Garante que o destino também está pronto
          if (!$ctrl._regPlanta[0].areasData) {
            $ctrl._regPlanta[0].areasData = [];
          }

          // 🔹 Faz o push com segurança
          $ctrl._regPlanta[0].areasData.push({
            _id: nivel._id,
            descricao: nivel.descricao,
            points: nivel.areasData[0].points
          });

        } else {
          console.warn(`⚠️ Nível ${i} sem dados válidos de área:`, nivel);
        }
      }

      $ctrl._regPlanta = $ctrl._regPlanta[0]
      $ctrl.loadPlanta();

    }

    $ctrl.loadPlanta = async function (plantaId) {

      uteisService.getBase('/localizacao/com-planta/' + $ctrl._regConta._id) // + '&id_nivel=null'
        .then((res) => {
          let locaisItens = res || [];

          try {

            const planta = $ctrl._regPlanta; // ou conforme sua API retorna

            $ctrl.areas = [];

            (planta.areasData || []).forEach((a, idx) => {

              let totalItem = 0
              let qntItem = locaisItens.findIndex((item) => item._id == a._id)
              if (qntItem >= 0) {
                totalItem = locaisItens[qntItem].total_itens
              }


              $ctrl.areas.push({
                points: a.points.map(p => ({ x: Number(p.x), y: Number(p.y) })),
                addressId1: a._id || null,
                nome: a.descricao ? a.descricao : ('Área ' + (idx + 1)),
                fillColor: 'rgba(0,128,255,0.15)',  // cor padrão
                strokeColor: '#0080ff',
                textColor: '#004080',
                icon: 'wifi',        // material-symbols-rounded
                valor: totalItem
              });
            });

            console.log('Planta carregada com', $ctrl.areas.length, 'áreas');
          } catch (err) {
            console.error('Erro ao carregar planta:', err);
          }


        })


    };

    // ===== Helpers =====
    function clientToImageCoords(evt) {
      const viewport = document.getElementById('viewport').getBoundingClientRect();
      const xScreen = evt.clientX - viewport.left;
      const yScreen = evt.clientY - viewport.top;
      // inverte o transform do stage: (p - pan) / zoom
      const xImg = (xScreen - $ctrl.pan.x) / $ctrl.zoom;
      const yImg = (yScreen - $ctrl.pan.y) / $ctrl.zoom;
      return {
        x: Math.max(0, Math.min($ctrl.imgW, xImg)),
        y: Math.max(0, Math.min($ctrl.imgH, yImg))
      };
    }

    $ctrl.polyToAttr = (pts) => pts.map(p => `${p.x},${p.y}`).join(' ');

    // ===== Zoom (centrado no cursor) =====
    $ctrl.onWheel = function (evt) {


      evt.preventDefault();
      const oldZoom = $ctrl.zoom;
      const delta = evt.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(4, Math.max(0.4, oldZoom * delta));

      // manter o ponto do cursor fixo ao dar zoom
      const before = clientToImageCoords(evt); // coords na imagem antes do zoom
      $ctrl.zoom = newZoom;
      const after = clientToImageCoords(evt);  // coords na imagem depois do zoom

      $ctrl.pan.x += (after.x - before.x) * newZoom;
      $ctrl.pan.y += (after.y - before.y) * newZoom;


      //$ctrl.$applyAsync();
    };

    // ===== Pan (arrastar) =====
    $ctrl.onMouseDown = function (evt) {
      // se estiver desenhando, o click será tratado no onStageClick
      if ($ctrl.drawing) return;
      $ctrl.panning = true;
      panStart = { ...$ctrl.pan };
      mouseStart = { x: evt.clientX, y: evt.clientY };
    };
    $ctrl.onMouseMove = function (evt) {
      if (!$ctrl.panning) return;
      $ctrl.pan.x = panStart.x + (evt.clientX - mouseStart.x);
      $ctrl.pan.y = panStart.y + (evt.clientY - mouseStart.y);

      //$ctrl.$applyAsync();
    };

    $ctrl.onMouseUp = function () { $ctrl.panning = false; };

    // ===== Desenho do polígono =====
    $ctrl.startDrawing = function () {
      $ctrl.drawing = true;
      $ctrl.currentPoints = [];
    };
    $ctrl.cancelDrawing = function () {
      $ctrl.drawing = false;
      $ctrl.currentPoints = [];
    };

    $ctrl.onStageClick = function (evt) {
      $timeout(() => {
        if (!$ctrl.drawing) return;
        const p = clientToImageCoords(evt);

        // se já tem ponto, clique próximo ao primeiro fecha o polígono
        if ($ctrl.currentPoints.length > 2) {
          const first = $ctrl.currentPoints[0];
          const dx = p.x - first.x, dy = p.y - first.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 12) { // tolerância (px na imagem)
            $ctrl.finishDrawing();
            return;
          }
        }

        $ctrl.currentPoints.push({ x: Math.round(p.x), y: Math.round(p.y) });
      }, 500)
      //$ctrl.$applyAsync();
    };

    function centroide(points) {
      const x = points.reduce((a, p) => a + p.x, 0) / points.length;
      const y = points.reduce((a, p) => a + p.y, 0) / points.length;
      return { x, y };
    }

    $ctrl.finishDrawing = function () {
      if ($ctrl.currentPoints.length < 3) return;

      let _local
      if ($ctrl._nivelPlanta4) {
        let iFind = $ctrl._listPlantaNivel4.findIndex((item) => item._id == $ctrl._nivelPlanta4)
        _local = $ctrl._listPlantaNivel4[iFind]
      } else if ($ctrl._nivelPlanta3) {
        let iFind = $ctrl._listPlantaNivel3.findIndex((item) => item._id == $ctrl._nivelPlanta3)
        _local = $ctrl._listPlantaNivel3[iFind]
      } else if ($ctrl._nivelPlanta2) {
        let iFind = $ctrl._listPlantaNivel2.findIndex((item) => item._id == $ctrl._nivelPlanta2)
        _local = $ctrl._listPlantaNivel2[iFind]
      }

      //let iFind = $ctrl._listNivel2.findIndex((item) => item._id == $ctrl._editPlanta.id_nivel_loc2)

      const area = {
        points: angular.copy($ctrl.currentPoints),
        addressId1: _local._id,
        nome: _local.descricao, // 👈 nome automático
        fillColor: 'rgba(0,128,255,0.15)',  // cor padrão
        strokeColor: '#0080ff',
        textColor: '#004080'
      };

      if (!_local.areasData) {
        _local.areasData = [];
      }

      if (!_local.areasData[0]) {
        _local.areasData.push({});
      }

      // if (!$ctrl._listNivel2[iFind].areasData) {
      //   $ctrl._listNivel2[iFind].areasData = [];
      // }

      // if (!$ctrl._listNivel2[iFind].areasData[0]) {
      //   $ctrl._listNivel2[iFind].areasData.push({});
      // }

      _local.areasData[0].points = area.points;

      uteisService.patchBase('/localizacao', _local)

      $ctrl.areas.push(area);
      $ctrl.drawing = false;
      $ctrl.currentPoints = [];
    };

    $ctrl.setAreaStyle = function (areaIdOrIndex, options = {}) {
      // Buscar a área por índice ou ID
      $timeout(() => {
        const area = typeof areaIdOrIndex === 'number'
          ? $ctrl.areas[areaIdOrIndex]
          : $ctrl.areas.find(a => a.addressId1 === areaIdOrIndex);

        if (!area) return;

        // 🔹 Atualiza propriedades passadas
        if (options.fillColor) area.fillColor = options.fillColor;
        if (options.textColor) area.textColor = options.textColor;
        if (options.strokeColor) area.strokeColor = options.strokeColor;
        if (options.nome) area.nome = options.nome;
      }, 500)
      // Atualiza a view
      //$ctrl.$applyAsync();
    };

    $ctrl.onSelectArea = function (area, evt) {
      $timeout(() => {
        evt.stopPropagation(); // evita conflito com clique de desenho
        $ctrl.areas.forEach(a => a.fillColor = 'rgba(0,128,255,0.15)');
        area.fillColor = 'rgba(255,255,0,0.25)';
        area.textColor = '#000';
      }, 500)
      //$ctrl.$applyAsync();
    };

    $ctrl.zoomIn = function () {

      $ctrl.setAreaStyle('idLocal01', {
        fillColor: 'rgba(0,255,0,0.25)',
        textColor: '#006400',
        nome: 'Recebimento'
      });

      $ctrl.zoom = Math.min(4, $ctrl.zoom + $ctrl.zoomStep);
    };

    $ctrl.zoomOut = function () {

      $ctrl.zoom = Math.max(0.4, $ctrl.zoom - $ctrl.zoomStep);
    };

    $ctrl.onCarregaNiveisPlanta = async function (nivel) {

      let id_nivel = null;
      if (nivel == '02') {
        id_nivel = $ctrl._editNivel._id

        await uteisService.getBase('/localizacao/subniveis/' + id_nivel)
          .then((res) => {
            $ctrl._listPlantaNivel1 = res.niveis
          })

      } else if (nivel == '03') {
        id_nivel = $ctrl._nivelPlanta2
      } else if (nivel == '04') {
        id_nivel = $ctrl._nivelPlanta3
      }
      let _url = '/_bd?c=localizacao&id_conta=' + $ctrl._regConta._id + '&id_nivel=' + id_nivel
      _url += '&sort=descricao'
      await uteisService.getBase('/_bd?c=localizacao&id_conta=' + $ctrl._regConta._id + '&id_nivel=' + id_nivel)
        .then((res) => {

          $timeout(() => {
            if (nivel == '02') {
              $ctrl._listPlantaNivel2 = res
              $ctrl._listPlantaNivel3 = [];
              $ctrl._listPlantaNivel4 = [];


            } else if (nivel == '03') {
              $ctrl._listPlantaNivel3 = res
              $ctrl._listPlantaNivel4 = [];

            } else if (nivel == '04') {
              $ctrl._listPlantaNivel4 = res
            };
          }, 10)

        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });
    };

    // Final Planta Baixa


    // Mapa Google

    $ctrl.initMap2 = function () {

      //$ctrl.autoInitMap2();
      $ctrl._regTotais.itens = 0
      $ctrl._regTotais.parado = 0;
      // $ctrl.ultimaLeitura = moment(data, 'YYYY-MM-DD HH:mm:ss');

      const latitude = parseFloat($ctrl._editNivel.latitude)
      const longitude = parseFloat($ctrl._editNivel.longitude);

      map = new google.maps.Map(document.getElementById('map2'), {
        center: { lat: latitude, lng: longitude },
        zoom: 17,
        mapTypeId: "roadmap",
        disableDefaultUI: true,
        styles: [
          // Oculta textos e labels
          { elementType: "labels", stylers: [{ visibility: "off" }] },
          { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
          { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
          { featureType: "administrative", elementType: "labels", stylers: [{ visibility: "off" }] },
          { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },

          // // Fundo geral escuro (blueprint)
          // { elementType: "geometry", stylers: [{ color: "#778da9" }] },
          { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#0b1f36" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a2342" }] },

          // Ruas com traçado azul
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#0f2c52" }] },
          { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#15518a" }] },

          // Trilhos / linhas de transporte
          { featureType: "transit.line", elementType: "geometry", stylers: [{ color: "#124c7d" }] },

          // Contornos administrativos
          { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#1e4e8c" }] },

          // 🔹 Áreas construídas (edifícios)
          {
            featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [
              { color: "#132b4a" },   // tom mais claro que o fundo
              { lightness: 10 }       // realce leve
            ]
          },
          {
            featureType: "poi.business", elementType: "geometry.fill", stylers: [
              { color: "#1a3a6e" },   // cor de edifícios e quarteirões
              { visibility: "on" },
              { saturation: -20 }
            ]
          },
          {
            featureType: "poi.business", elementType: "geometry.stroke", stylers: [
              { color: "#245d9a" },
              { weight: 0.5 },
              { visibility: "on" }
            ]
          }
        ]
      });

      drawingManager = new google.maps.drawing.DrawingManager({
        drawingMode: google.maps.drawing.OverlayType.POLYGON,
        drawingControl: false, //true
        drawingControlOptions: {
          position: google.maps.ControlPosition.TOP_CENTER,
          drawingModes: ['polygon']
        },
        polygonOptions: {
          fillColor: '#778da9',
          fillOpacity: 0.35,
          strokeWeight: 2,
          strokeColor: '#415a77',
          clickable: true,
          editable: true,
          zIndex: 1
        }
      });
      drawingManager.setMap(map);

      // 🔹 Carrega as áreas já salvas no banco
      //if ($ctrl._nivelPlanta2 != '') {

      uteisService.getBase('/localizacao/com-areas/' + $ctrl._regConta._id) // + '&id_nivel=null'
        .then((res) => {
          let locais = res || [];
          locais = locais.filter((item) => item.nivel_id != null)
          // alert(JSON.stringify(locais))

          // // if ($ctrl._nivelPlanta2 != "") {
          // //   locais = locais.filter((item) => item._id == $ctrl._nivelPlanta2)
          // // } else if ($ctrl._nivelPlanta2 != "") {
          // //   locais = locais.filter((item) => item._id == $ctrl._editMapa.id_nivel_loc1 || item.nivel_id == $ctrl._editMapa.id_nivel_loc1)
          // // }

          // alert(JSON.stringify(locais))

          $ctrl._regTotais.itens = 0
          let c = 0


          const areaColors = [
            { stroke: '#1d3557', fill: '#457b9d' }, // Azul
            { stroke: '#78290f', fill: '#e76f51' }, // Vermelho terroso
            { stroke: '#2a9d8f', fill: '#99d98c' }, // Verde água
            { stroke: '#ffb703', fill: '#f4d35e' }, // Amarelo mostarda
            { stroke: '#7209b7', fill: '#b388eb' }  // Roxo suave
          ];

          locais.forEach(loc => {

            if (!loc.areasData || !loc.areasData.length) return;



            loc.areasData.forEach((area, i) => {
              const pontos = area.pointsLatLng || [];
              if (pontos.length === 0) return;

              const color = areaColors[c]; // alterna entre 5 cores
              c++;
              if (c >= areaColors.length) c = 0;


              const polygon = new google.maps.Polygon({
                paths: pontos,
                strokeColor: color.stroke,
                strokeOpacity: 0.9,
                strokeWeight: 2,
                fillColor: color.fill,
                fillOpacity: 0.4,  // opaco e elegante
                map: map
              });

              // 🔹 Calcula o centro da área
              const bounds = new google.maps.LatLngBounds();
              polygon.getPath().forEach(p => bounds.extend(p));
              const labelPos = bounds.getCenter();

              // ✅ Nome fixo da área
              new google.maps.Marker({
                position: labelPos,
                map: map,
                label: {
                  text: loc.descricao,
                  color: "#343a40",
                  fontWeight: "bold",
                  fontSize: "13px"
                },
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 0
                }
              });

              // 🔹 InfoWindow ao clicar
              const info = new google.maps.InfoWindow({
                content: `<b>${loc.descricao}</b>`,
                position: labelPos
              });
              polygon.addListener('click', () => info.open(map));

              // 🔸 GERA PINS ALEATÓRIOS DENTRO DO POLÍGONO
              $ctrl._regTotais.itens = $ctrl._regTotais.itens + loc.total_itens;
              $ctrl._regTotais.parado = $ctrl._regTotais.parado + loc.total_itens;
              const numPins = loc.total_itens;
              if (google.maps.geometry && google.maps.geometry.poly) {
                for (let i = 0; i < numPins; i++) {
                  let randomPoint;
                  let attempts = 0;
                  do {
                    const lat = bounds.getSouthWest().lat() + Math.random() * (bounds.getNorthEast().lat() - bounds.getSouthWest().lat());
                    const lng = bounds.getSouthWest().lng() + Math.random() * (bounds.getNorthEast().lng() - bounds.getSouthWest().lng());
                    randomPoint = new google.maps.LatLng(lat, lng);
                    attempts++;
                  } while (!google.maps.geometry.poly.containsLocation(randomPoint, polygon) && attempts < 30);

                  if (google.maps.geometry.poly.containsLocation(randomPoint, polygon)) {

                    new google.maps.Marker({
                      position: randomPoint,
                      map: map,
                      icon: {
                        url: "../assets/images/icon_cadeira.fw.png", // ou "https://example.com/pin.svg"
                        scaledSize: new google.maps.Size(42, 42), // ajusta o tamanho
                        anchor: new google.maps.Point(16, 32) // centraliza a base
                      }
                    });

                    // new google.maps.Marker({
                    //     position: randomPoint,
                    //     map: map,
                    //     icon: {
                    //         path: google.maps.SymbolPath.CIRCLE,
                    //         scale: 10,
                    //         fillColor: "#f77f00",
                    //         fillOpacity: 1,
                    //         strokeColor: "#e9ecef",
                    //         strokeWeight: 1
                    //     }
                    // });
                  }
                }
              } else {
                console.warn('Biblioteca geometry não carregada. Adicione "&libraries=drawing,geometry" no script do Maps.');
              }
            });
          });

        });
      //}

      // 🔹 Evento para desenhar novas áreas
      google.maps.event.addListener(drawingManager, 'overlaycomplete', event => {
        drawingManager.setDrawingMode(null);

        const polygon = event.overlay;
        const vertices = polygon.getPath().getArray().map(v => ({
          lat: v.lat(),
          lng: v.lng()
        }));

        // const nome = prompt("Nome do local:");
        // if (!nome) {
        //     polygon.setMap(null);
        //     return;
        // }


        let _editNivel;
        if ($ctrl._nivelPlanta4) {
          _editNivel = $ctrl._listPlantaNivel4.filter((item) => item._id == $ctrl._nivelPlanta4)
        } else if ($ctrl._nivelPlanta3) {
          _editNivel = $ctrl._listPlantaNivel3.filter((item) => item._id == $ctrl._nivelPlanta3)
        } else if ($ctrl._nivelPlanta2) {
          _editNivel = $ctrl._listPlantaNivel2.filter((item) => item._id == $ctrl._nivelPlanta2)
        }

        _editNivel = _editNivel[0]

        // Exibe rótulo
        const bounds = new google.maps.LatLngBounds();
        polygon.getPath().forEach(p => bounds.extend(p));
        const labelPos = bounds.getCenter();

        new google.maps.InfoWindow({
          content: `<b>${_editNivel.descricao}</b>`,
          position: labelPos
        }).open(map);

        // Envia para o backend
        const payload = {
          descricao: _editNivel.descricao,
          planta: 'aeroporto_congonhas',
          pontos: vertices
        };

        let areasData = [];
        areasData.push({
          pointsLatLng: payload.pontos
        })

        _editNivel['areasData'] = areasData

        uteisService.patchBase('/localizacao', _editNivel)

          .then((res) => {
            uteisService.onToast('Área salva com sucesso!', 'success', 2000, 'top-end');
          })
        // .catch(() => alert('Erro ao salvar área'));
      });
    };

    $ctrl.ativarMarcacao = function () {
      if (!$ctrl._nivelPlanta2 || !$ctrl._nivelPlanta3) {
        uteisService.onToast('Selecione o andar e a zona antes de ativar a marcação.', 'info', 2000, 'top-end');
        return;
      }

      uteisService.onToast('Modo de marcação ativado! Agora clique no mapa para desenhar a área.', 'info', 2000, 'top-end');
      drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
    };

    // Final Mapa Google


    // Site Survey

    $ctrl.onCarregaNiveisAp = async function (nivel) {

      let id_nivel = null;
      if (nivel == '02') {
        id_nivel = $ctrl._editNivel._id

        await uteisService.getBase('/localizacao/subniveis/' + id_nivel)
          .then((res) => {
            $ctrl._listPlantaNivel1 = res.niveis
          })

      } else if (nivel == '03') {
        id_nivel = $ctrl._nivelAp2
      } else if (nivel == '04') {
        id_nivel = $ctrl._nivelAp3
      }
      let _url = '/_bd?c=localizacao&id_conta=' + $ctrl._regConta._id + '&id_nivel=' + id_nivel
      _url += '&sort=descricao'
      await uteisService.getBase('/_bd?c=localizacao&id_conta=' + $ctrl._regConta._id + '&id_nivel=' + id_nivel)
        .then((res) => {

          $timeout(() => {
            if (nivel == '02') {
              $ctrl._listApNivel2 = res
              $ctrl._listApNivel3 = [];
              $ctrl._listApNivel4 = [];

            } else if (nivel == '03') {
              $ctrl._listApNivel3 = res
              $ctrl._listApNivel4 = [];

            } else if (nivel == '04') {
              $ctrl._listApNivel4 = res
            };

            $ctrl.onListaAPLocal()
          }, 10)

        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });
    };

    $ctrl.onListaAPLocal = function () {

      let _local
      if ($ctrl._nivelAp4) {
        let iFind = $ctrl._listApNivel4.findIndex((item) => item._id == $ctrl._nivelAp4)
        _local = $ctrl._listApNivel4[iFind]
      } else if ($ctrl._nivelAp3) {
        let iFind = $ctrl._listApNivel3.findIndex((item) => item._id == $ctrl._nivelAp3)
        _local = $ctrl._listApNivel3[iFind]
      } else if ($ctrl._nivelAp2) {
        let iFind = $ctrl._listApNivel2.findIndex((item) => item._id == $ctrl._nivelAp2)
        _local = $ctrl._listApNivel2[iFind]
      }

      $ctrl._listAPs = _local;
      $ctrl._editAP = {
        descricao: "",
        mac: "",
        rssi: "",
        range: "",
        // full_aps: true
      };

    };

    $ctrl.onEditarApLocal = function (item) {
      $timeout(() => {
        $ctrl._editAP = JSON.parse(JSON.stringify(item));
        $ctrl._editApModo = true;
      }, 10)
    }

    $ctrl.onApagarApLocal = function () {
      $timeout(() => {
        let _local
        if ($ctrl._nivelAp4) {
          let iFind = $ctrl._listApNivel4.findIndex((item) => item._id == $ctrl._nivelAp4)
          _local = $ctrl._listApNivel4[iFind]
        } else if ($ctrl._nivelAp3) {
          let iFind = $ctrl._listApNivel3.findIndex((item) => item._id == $ctrl._nivelAp3)
          _local = $ctrl._listApNivel3[iFind]
        } else if ($ctrl._nivelAp2) {
          let iFind = $ctrl._listApNivel2.findIndex((item) => item._id == $ctrl._nivelAp2)
          _local = $ctrl._listApNivel2[iFind]
        }

        _local.areasData[0].pointsAps = _local.areasData[0].pointsAps.filter((item) => item.mac != $ctrl._editAP.mac);
        $ctrl._listAPs = _local;

        uteisService.patchBase('/localizacao', _local)
          .then((res) => {
            uteisService.onToast('Ponto de acesso removido com sucesso!', 'success', 2000, 'top-end');
            $timeout(() => {
              $ctrl._editApModo = false;
              $ctrl._editAP = {
                descricao: "",
                mac: "",
                rssi: "",
                range: "",
                // full_aps: true
              };
            }, 10)

          })

      }, 10)
    };

    $ctrl.onNovoApLocal = function () {

      if ($ctrl._nivelAp2 == "") {
        uteisService.onToast('Selecione ao menos um sub nível', 'info', 2000, 'top-end');
        return;
      };

      $timeout(() => {
        $ctrl._editApModo = true;
        $ctrl._editAP = {
          descricao: "",
          mac: "",
          rssi: "",
          range: ""
        };
      }, 10)

    }


    $ctrl.onSalvarAP = function () {

      if ($ctrl._nivelAp2 == "") {
        uteisService.onToast('Selecione ao menos um sub nível', 'info', 2000, 'top-end');
        return;
      };

      if ($ctrl._editAP.descricao == "" || $ctrl._editAP.mac == "" || $ctrl._editAP.rssi == "") {
        uteisService.onToast('Preencha todos os campos antes de salvar o ponto de acesso.', 'info', 2000, 'top-end');
        return;
      };

      let _local
      if ($ctrl._nivelAp4) {
        let iFind = $ctrl._listApNivel4.findIndex((item) => item._id == $ctrl._nivelAp4)
        _local = $ctrl._listApNivel4[iFind]
      } else if ($ctrl._nivelAp3) {
        let iFind = $ctrl._listApNivel3.findIndex((item) => item._id == $ctrl._nivelAp3)
        _local = $ctrl._listApNivel3[iFind]
      } else if ($ctrl._nivelAp2) {
        let iFind = $ctrl._listApNivel2.findIndex((item) => item._id == $ctrl._nivelAp2)
        _local = $ctrl._listApNivel2[iFind]
      }

      if (!_local.areasData) {
        _local.areasData = [];
      };

      if (!_local.areasData[0]) {
        _local.areasData.push({});
      };

      if (!_local.areasData[0].pointsAps) {
        _local.areasData[0].pointsAps = [];
      }

      // if ($ctrl._editAP._id == "") {
      //   $ctrl._editAP._id = uteisService.onGetID();
      // }

      let iFind = _local.areasData[0].pointsAps.findIndex((item) => item.mac == $ctrl._editAP.mac);
      if (iFind >= 0) {
        _local.areasData[0].pointsAps[iFind] = $ctrl._editAP
      } else {
        _local.areasData[0].pointsAps.push($ctrl._editAP)
      }

      uteisService.patchBase('/localizacao', _local)
        .then((res) => {
          uteisService.onToast('Ponto de acesso salvo com sucesso!', 'success', 2000, 'top-end');
          $timeout(() => {
            $ctrl._editApModo = false;
            $ctrl._editAP = {
              descricao: "",
              mac: "",
              rssi: "",
              // range: "",
              // full_aps: true
            };
          }, 10)

        })

    }
    // Final Site Survey

    // Início Itens

    $ctrl.onCarregaNiveisItens = async function (nivel) {

      let id_nivel = null;
      if (nivel == '02') {
        id_nivel = $ctrl._editNivel._id
      } else if (nivel == '03') {
        id_nivel = $ctrl._nivelItens2
      } else if (nivel == '04') {
        id_nivel = $ctrl._nivelItens3
      }
      let _url = '/_bd?c=localizacao&id_conta=' + $ctrl._regConta._id + '&id_nivel=' + id_nivel
      _url += '&sort=descricao'
      await uteisService.getBase(_url)
        .then((res) => {

          $timeout(() => {
            if (nivel == '02') {
              $ctrl._listItensNivel2 = res
              $ctrl._listItensNivel3 = [];
              $ctrl._listItensNivel4 = [];

            } else if (nivel == '03') {
              $ctrl._listItensNivel3 = res
              $ctrl._listItensNivel4 = [];

            } else if (nivel == '04') {
              $ctrl._listItensNivel4 = res
            };

            $ctrl.onListaItensLocal()
          }, 10)

        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });
    };

    $ctrl.onListaItensLocal = async function () {

      $timeout(() => {
        $ctrl._listItensLocal = []
      }, 10)

      let _url = '/_bd?c=item&id_conta=' + $ctrl._regConta._id

      if ($ctrl._nivelItens4 != '') {
        _url += "&id_nivel_loc4=" + $ctrl._nivelItens4

      } else if ($ctrl._nivelItens3 != '') {
        _url += "&id_nivel_loc3=" + $ctrl._nivelItens3

      } else if ($ctrl._nivelItens2 != '') {
        _url += "&id_nivel_loc2=" + $ctrl._nivelItens2

      } else if ($ctrl._nivelItens2 == '') {
        _url += "&id_nivel_loc1=" + $ctrl._editNivel._id
      }

      _url += "&pop=id_categoria"
      _url += "&pop=id_nivel_loc2"
      _url += "&pop=id_nivel_loc3"
      _url += "&pop=id_nivel_loc4"

      await uteisService.getBase(_url)
        .then((res) => {
          $timeout(() => {
            $ctrl._listItensLocal = res
          }, 10)


        })
    };

    // Final Itens


    $ctrl.fechar = function () {
      // dispara o callback do pai
      $ctrl.onFechar();
    };

    ///////// final




    $ctrl.onCarregaAtividade = async function () {

      let _url = '/_bd?c=parceiros_sustentabilidade';
      _url += "&id_parceiro=" + $ctrl._editRegistro._id;
      _url += "&pop=id_sustentabilidade"


      uteisService.getBase(_url)
        .then((res) => {

          $ctrl._editRegistro._sustentabilidades = res;


        })



      _url = '/_bd?c=parceiros_atividades';
      _url += "&id_parceiro=" + $ctrl._editRegistro._id;
      _url += "&pop=id_atividade"

      uteisService.getBase(_url)
        .then((res) => {
          $ctrl._editRegistro._atividades = res;
        })




    };




    $ctrl.onCarregaBancos = async function () {
      await uteisService.getBancos().then((res) => {
        $ctrl._listaBancos = res
      })
    };

    $ctrl.onIAHelp = async function () {
      $ctrl.loadingIA = true;


      await uteisService.getBase('/marketing_ai/sobre+cidade+' + $ctrl._editRegistro.cidade + '+' + $ctrl._editRegistro.estado)
        .then((res) => {
          $ctrl._editRegistro.descricao = res.texto_gerado.replace(/"/g, '');
          $timeout(() => {
            document.querySelector('#trix-content').value = $ctrl._editRegistro.descricao;
            document.querySelector('trix-editor').editor.loadHTML($ctrl._editRegistro.descricao);
          });

          uteisService.onToast('Confira as descrição gerada!', 'info', 2000, 'top-end');
          setTimeout(() => {
            $ctrl.loadingIA = false; // volta para ícone normal
          }, 1000);

        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        })
        .finally(() => {
          setTimeout(() => {
            $ctrl.loadingIA = false; // volta para ícone normal
          }, 1000);
        });
    };

    $ctrl.onGetCapa = function () {

      document.getElementById('imgCapa').click();
      document.getElementById('imgCapa').onchange = function () {

        $timeout(() => {
          $ctrl._editRegistro._capa = "../assets/img/icons/carregando_capa.gif";
        }, 100)

        $timeout(() => {
          const file = this.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {

              $ctrl._editRegistro._capa = e.target.result;
              $http.post(uteisService.apiUrl_() + '/image/save', [{ foto: e.target.result }], $ctrl.options)
                .then(function (res) {
                  $timeout(() => {
                    $ctrl._editRegistro.capa = res.data[0].id_foto
                  }, 1000)

                }, function (error) { });

            };
            reader.readAsDataURL(file);
          }
        }, 200);

      };
    };

    $ctrl.onImagemIA = async function () {

      $timeout(() => {
        $ctrl.loadingIACapa = true;
        $ctrl._editRegistro._capa = "../assets/img/icons/carregando_capa.gif";
      }, 100)


      setTimeout(async () => {
        let _url = '/_fotoia/buscaFoto/'
        _url += 'cidade+' + $ctrl._editRegistro.cidade + '+' + $ctrl._editRegistro.estado

        await uteisService.getBase(_url)
          .then(async (res) => {
            $timeout(() => {
              $ctrl._editRegistro.capa = res.imagens[0];
              $ctrl._editRegistro._capa = res.imagens[0];
              $ctrl.loadingIACapa = false; // volta para ícone normal
            }, 1000);

          })
          .finally(() => {
            $timeout(() => {
              $ctrl.loadingIACapa = false; // volta para ícone normal
            }, 1000);
          });
      }, 200);


    };

    $ctrl.onRegistroFoto = function () {

      document.getElementById('imgFoto').click();
      document.getElementById('imgFoto').onchange = function () {

        $timeout(() => {
          if (!$ctrl._editRegistro.galeria_foto1) {
            $ctrl._editRegistro._galeria_foto1 = '../assets/img/icons/carregando_icon.gif';
          } else if (!$ctrl._editRegistro.galeria_foto2) {
            $ctrl._editRegistro._galeria_foto2 = '../assets/img/icons/carregando_icon.gif';
          } else if (!$ctrl._editRegistro.galeria_foto3) {
            $ctrl._editRegistro._galeria_foto3 = '../assets/img/icons/carregando_icon.gif';
          };
        }, 200);

        $timeout(() => {
          const file = this.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {

              if (!$ctrl._editRegistro.galeria_foto1) {
                $ctrl._editRegistro._galeria_foto1 = e.target.result;

              } else if (!$ctrl._editRegistro.galeria_foto2) {
                $ctrl._editRegistro._galeria_foto2 = e.target.result;

              } else if (!$ctrl._editRegistro.galeria_foto3) {
                $ctrl._editRegistro._galeria_foto3 = e.target.result;
              };

              $http.post(uteisService.apiUrl_() + '/image/save', [{ foto: e.target.result }], $ctrl.options)
                .then(function (res) {

                  if (!$ctrl._editRegistro.galeria_foto1) {
                    $ctrl._editRegistro.galeria_foto1 = res.data[0].id_foto;

                  } else if (!$ctrl._editRegistro.galeria_foto2) {
                    $ctrl._editRegistro.galeria_foto2 = res.data[0].id_foto;

                  } else if (!$ctrl._editRegistro.galeria_foto3) {
                    $ctrl._editRegistro.galeria_foto3 = res.data[0].id_foto;
                  };


                }, function (error) { });

            };
            reader.readAsDataURL(file);
          }
        }, 600);

      };
    };

    $ctrl.onRemoveFoto = function (galeria) {

      $timeout(() => {
        if (galeria == '1') {
          $ctrl._editRegistro.galeria_foto1 = '';
          $ctrl._editRegistro._galeria_foto1 = '';

        } else if (galeria == '2') {
          $ctrl._editRegistro.galeria_foto2 = '';
          $ctrl._editRegistro._galeria_foto2 = '';

        } else if (galeria == '3') {
          $ctrl._editRegistro.galeria_foto3 = '';
          $ctrl._editRegistro._galeria_foto3 = '';
        };
      }, 100)

    };


    $ctrl.onRetorno = function () {
      $ctrl.onRetorno('atualizar');
    };

  },
  templateUrl: 'components/localizacao/localizacao.html'
});