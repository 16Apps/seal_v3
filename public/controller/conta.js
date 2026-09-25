
app.controller('contaCtrl', function ($scope, $http, params, uteisService, $location) {


    $scope.options = {
        headers: { 'Content-Type': 'application/json' }
    };

    $scope._await = false;
    $scope._recSenha = false

    $scope.isAdmin = false;
    $scope._regConta = {
        _id: uteisService.onGetID(),
        ativo: 1,
        nome: '',
        apelido: '',
        cnpj: '',
        contato_responsavel: '',
        contato_celular: '',
        contato_responsavel_email: '',
        logo: '../assets/img/logo_conta.png',
        _logo: '../assets/img/logo_conta.png',
        telefone: '',
        celular: '',
        email: '',
        senha: '',
        site: '',
        cep: '',
        logradouro: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        estado: '',
        tokem_api: '',
        params_nomenclatura_itens: {
            sku: 'SKU',
            itens: 'Item',
            categorias: 'Categoria',
            enderecos: 'Site',
            coletores: 'Dispositivo',
        },
    
        plano_monitoramento: {
            software: 'seal',
            posicao_esperada: 0,
            painel_alertas: 0,
            interacao: 0,
            regs_associados: 0,
            portal: 0,
        },
    
        plano_conta: {
            valor: 0,
            representante: '',
            suporte_celular: '',
        }
    }

    $scope._regColaborador = {
        _id: uteisService.onGetID(),
        id_conta: $scope._regConta._id,
        ativo: '1',
        foto: '',
        _foto: '../assets/images/icon_avatar.png',
        nome: '',
        apelido: '',
        id_funcao: null,
        tag: '',
        cpf: '',
        perfil: 'admin',
        email: '',
        celular: '',
        login: '',
        senha: '',
        _senha: '',
        cep: '',
        logradouro: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        estado: '',
        acesso_modulos: []
    }

    $scope._regLimpeza = {
        email: '',
        tipo_limpeza: ''
    }

    $scope._regExtras = 'fusos'

    $scope.isCadastro = false;

    $scope.$watch('$viewContentLoaded', async function () {

        const currentUrl = $location.absUrl();
        let url = currentUrl.split('/')

        if (url[3].includes('profile')) {

            if (url[3].includes('admin') || url[3].includes('ADMIN')) {
                $scope.isAdmin = true
            }

            setTimeout(() => {
                $scope._regColaborador = undefined;
                $scope.$apply();

            }, 2000);


            $scope._regConta = uteisService.getCookie('_conta');
            $scope._regConta = uteisService.normalizarConta($scope._regConta);

            $scope._regConta['_logo'] = '../assets/images/logo_default.fw.png'
            if ($scope._regConta.logo && $scope._regConta.logo.includes('logo_conta') == false) {
                let _url = uteisService.apiUrl_();
                $scope._regConta._logo = _url + '/image/' + $scope._regConta.logo;
            };

            $scope._regConta.ativo = "" + $scope._regConta.ativo;

            // Inicializa campos aninhados se não existirem
            if (!$scope._regConta.params_nomenclatura_itens) {
                $scope._regConta.params_nomenclatura_itens = {
                    sku: 'SKU',
                    itens: 'Item',
                    categorias: 'Categoria',
                    enderecos: 'Site',
                    coletores: 'Dispositivo',
                };
            }
            if (!$scope._regConta.plano_monitoramento) {
                $scope._regConta.plano_monitoramento = {
                    software: 'seal',
                    posicao_esperada: "0",
                    painel_alertas: "0",
                    interacao: "0",
                    regs_associados: "0",
                    portal: "0",
                };
            } else {
                // Garante que os valores sejam números
                $scope._regConta.plano_monitoramento.software = $scope._regConta.plano_monitoramento.software || 'seal';
                $scope._regConta.plano_monitoramento.posicao_esperada = "" + parseInt($scope._regConta.plano_monitoramento.posicao_esperada) || 0;
                $scope._regConta.plano_monitoramento.painel_alertas = "" + parseInt($scope._regConta.plano_monitoramento.painel_alertas) || 0;
                $scope._regConta.plano_monitoramento.interacao = "" + parseInt($scope._regConta.plano_monitoramento.interacao) || 0;
                $scope._regConta.plano_monitoramento.regs_associados = "" + parseInt($scope._regConta.plano_monitoramento.regs_associados) || "0";
                $scope._regConta.plano_monitoramento.portal = "" + parseInt($scope._regConta.plano_monitoramento.portal) || "0";
            }
            if (!$scope._regConta.plano_conta) {
                $scope._regConta.plano_conta = {
                    valor: 0,
                    representante: '',
                    suporte_celular: '',
                };
            } else {
                // Garante que o valor seja número
                $scope._regConta.plano_conta.valor = parseFloat($scope._regConta.plano_conta.valor) || 0;
            }
            $scope.onCarregaColaboradores();
            $scope.onLogs();


            $scope._regConta.alerta_email_criterio_leve = $scope._regConta.alerta_email_criterio.substring(0, 1) == '1' ? true : false;
            $scope._regConta.alerta_email_criterio_importante = $scope._regConta.alerta_email_criterio.substring(1, 2) == '1' ? true : false;
            $scope._regConta.alerta_email_criterio_critico = $scope._regConta.alerta_email_criterio.substring(2, 3) == '1' ? true : false;

            $scope._regConta.alerta_celular_criterio_leve = $scope._regConta.alerta_celular_criterio.substring(0, 1) == '1' ? true : false;
            $scope._regConta.alerta_celular_criterio_importante = $scope._regConta.alerta_celular_criterio.substring(1, 2) == '1' ? true : false;
            $scope._regConta.alerta_celular_criterio_critico = $scope._regConta.alerta_celular_criterio.substring(2, 3) == '1' ? true : false;

            $scope._regColaborador = undefined; 


           
     
            $scope.$apply();

            // $scope.onFusoEditar(undefined);
            // $scope.onProcessoEditar(undefined);
            // $scope.onFusoRegistros();
            // $scope.onProcessoRegistros();

        } else if (url[3].includes("token")) {

            let _token = url[3].split("=")
            let _email = decodeURIComponent(atob(_token[1]));
            $scope.onValidaTokenRecuperarSenha(_email)

        }
    });

    // *.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.
    // acesso

    $scope.onEntrar = async function () {

        if ($scope._regConta.email == '') {
            uteisService.onToast('Ops .. faltou informar o email.', 'error', 2000, 'top-end');

        } else if ($scope._regConta.senha == '') {
            uteisService.onToast('Informe a sua senha.', 'error', 2000, 'top-end');

        } else {

            $scope._await = true;

            await uteisService.getBase('/_bd?c=colaborador&login=' + $scope._regConta.email + '&senha=' + $scope._regConta.senha + '&pop=id_conta')
                .then((res) => {
                    

                    if (res.length == 0) {

                        uteisService.onMsgBox('Atenção!', 'Não encontramos sua conta, com os dados informado.', 'error');
                        $scope.$apply(function () {
                            $scope._await = false
                        });

                    } else {

                 
                        // uteisService.setCookie('_conta', JSON.stringify($scope._regConta), 365);
                        // uteisService.setCookie('_colaborador', JSON.stringify($scope._regColaborador), 365);

                        res[0].id_conta.widget_layout = []  
                        uteisService.setCookie('_conta', JSON.stringify(res[0].id_conta), 365);                  
                        res[0].id_conta = []        
                  
                           
                        uteisService.setCookie('_colaborador', JSON.stringify(res[0]), 365);


                        setTimeout(() => {
                            $scope.$apply(function () {
                                $scope._await = false
                            });
                            uteisService.onToast('Olá! Bem-vindo, ' + res[0].nome + '.', 'info', 2000, 'top-end');
                            window.location.assign("/widget");
                        }, 2000);
                    };
                })
                .catch((error) => {
                    uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
                });

        };
    };

    $scope.onCadastrar = async function () {


        if ($scope._regConta.nome == '') {
            uteisService.onToast('Ops .. informe o nome da Empresa', 'error', 2000, 'top-end');

        } else if ($scope._regColaborador.nome == '') {
            uteisService.onToast('Qual o seu nome ?', 'error', 2000, 'top-end');

        } else if ($scope._regConta.email == '') {
            uteisService.onToast('Informe o seu e-mail mais utilizado.', 'error', 2000, 'top-end');

        } else if ($scope._regConta.senha == '') {
            uteisService.onToast('Sem a senha ? ', 'error', 2000, 'top-end');

        } else {

            $scope._await = true;

            await uteisService.getBase('/_bd?c=conta&email=' + $scope._regConta.email)
                .then((res) => {

                    if (res.length > 0) {

                        uteisService.onMsgBox('Atenção!', 'O e-mail informado já está vinculado a uma conta', 'error');

                    } else {

                        let apelido = $scope._regConta.nome.split(' ');

                        $scope._regConta.apelido = apelido[0];

                        uteisService.patchBase('/conta', $scope._regConta)
                            .then((res) => {

                                $scope._regColaborador.login = $scope._regConta.email
                                $scope._regColaborador.senha = $scope._regConta.senha

                                $scope._regConta.contato_responsavel = $scope._regColaborador.nome;
                                $scope._regConta.contato_celular = $scope._regConta.celular;
                                $scope._regConta.contato_responsavel_email = $scope._regConta.email;

                                uteisService.patchBase('/colaborador', $scope._regColaborador)
                                uteisService.setCookie('_conta', JSON.stringify($scope._regConta), 365);
                                uteisService.setCookie('_colaborador', JSON.stringify($scope._regColaborador), 365);

                                setTimeout(() => {
                                    $scope.$apply(function () {
                                        $scope._await = false
                                    });
                                    uteisService.onToast('Tudo certo! Conta criada.', 'info', 2000, 'top-end');
                                    window.location.assign("/widget");
                                }, 2200);

                            })
                            .catch((error) => {
                                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
                            });

                    }
                })
                .catch((error) => {
                    uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
                });
        };
    };


    $scope.onEsqueciSenha = async function () {

        if ($scope._regConta.email == '') {
            uteisService.onToast('Informe o e-mail cadastrado.', 'error', 2000, 'top-end');

        } else {

            $scope._await = true;

            await uteisService.getBase('/_bd?c=conta&email=' + $scope._regConta.email)
                .then((res) => {

                    if (res.length == 0) {
                        uteisService.onMsgBox('Atenção!', 'O e-mail informado não consta em nossa base.', 'error');
                    } else {

                        let _token = btoa(encodeURIComponent($scope._regConta.email));

                        let _sendMail = {
                            "to": $scope._regConta.email,
                            "subject": "Recuperação de Senha - Air Tracking Seal",
                            "message": "<!DOCTYPE html><html lang='pt-BR'><head><meta charset='UTF-8'><title>Recuperação de Senha - Air Tracking Seal</title><style>body{font-family:'Segoe UI',Roboto,Arial,sans-serif;background-color:#f5f7fa;margin:0;padding:0}.container{max-width:600px;margin:40px auto;background:#fff;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.08);overflow:hidden}.header{background-color:#f8f9fa;padding:30px;text-align:center;color:#01497c}.header img{width:110px;margin-bottom:12px}.content{padding:36px;color:#333;font-size:15px;line-height:1.7}.footer{text-align:center;font-size:12px;color:#888;padding:20px;background-color:#f1f1f1;border-top:1px solid #e0e0e0}</style></head><body><div class='container'><div class='header'><img src='https://www.seal.com.br/build/images/seal.png' alt='Seal Logo'><h2>Redefinição de Senha</h2></div><div class='content'><p>Olá <strong>Bráulio</strong>,</p><p>Recebemos uma solicitação para redefinir a senha da sua conta <strong>Air Tracking Seal</strong>.</p><p>Para criar uma nova senha com segurança, clique no botão abaixo. Este link é válido por <strong>10 minutos</strong>.</p><p style='text-align:center;margin:28px 0'><a href='https://seal-3b8487bafac8.herokuapp.com/resetpassword?token=" + _token + " style='display:inline-block;background-color:#0077b6;color:#ffffff!important;text-decoration:none;padding:14px 24px;border-radius:6px;font-weight:600;letter-spacing:0.5px;transition:background-color 0.2s;font-family:\"Segoe UI\",Roboto,Arial,sans-serif;'>Redefinir Senha</a></p><p>Se você não solicitou essa alteração, nenhuma ação é necessária. Sua senha atual permanecerá inalterada.</p><p>Por segurança, nunca compartilhe este link ou sua senha com ninguém.</p><p>Atenciosamente,<br><strong>Equipe Air Tracking Seal</strong></p></div><div class='footer'><p>© 2025 Air Tracking Seal — Todos os direitos reservados.<br><a href='https://www.seal.com.br'>seal.com.br</a></p></div></div></body></html>"
                        }

                        $http.post(uteisService.apiUrl_() + '/send-email', _sendMail, { headers: { 'Content-Type': 'application/json' } })
                            .then(function (res) {
                                uteisService.onToast('Siga as instruções enviadas para o seu email.', 'info', 2000, 'top-end');

                                $scope.$apply(function () {
                                    $scope._await = false
                                });

                            }, function (error) { });


                    };
                });

        };
    };

    $scope.onValidaTokenRecuperarSenha = async function (_email) {

        $scope._await = true

        await uteisService.getBase('/_bd?c=colaborador&login=' + _email)
            .then((res) => {

                if (res.length == 0) {
                    uteisService.onToast('Link inválido!', 'error', 2000, 'top-end');
                } else {

                    uteisService.onToast('Cadastre sua nova senha.', 'info', 2000, 'top-end');

                    $scope.$apply(function () {
                        res[0].senha = '';
                        $scope._regColaborador = res[0];
                        $scope._await = false
                    })
                };
            });
    };


    $scope.onResetarSenha = async function () {

        if ($scope._regColaborador.senha != $scope._regColaborador._senha) {
            uteisService.onToast('As senhas não conferem.', 'error', 2000, 'top-end');

        } else {

            $scope._await = true

            uteisService.patchBase('/colaborador', $scope._regColaborador)
                .then((res) => {

                    setTimeout(() => {
                        $scope.$apply(function () {
                            uteisService.onToast($scope._regColaborador.nome + ', sua nova senha foi criada.', 'success', 2000, 'top-end');
                            window.location.assign("/");
                            $scope._await = false
                        })
                    }, 2000);
                })
        }
    }



    // final acesso
    // *.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.*.



    $scope.onBuscaCep = async function () {

        let cep = $scope._regConta.cep.replace('.', '').replace('-', '').trim();

        await uteisService.getCep(cep)
            .then((res) => {

                console.log(JSON.stringify(res))

                $scope.$apply(function () {
                    $scope._regConta.logradouro = res.logradouro;
                    $scope._regConta.bairro = res.bairro;
                    $scope._regConta.cidade = res.localidade;
                    $scope._regConta.estado = res.uf;
                    $scope._regConta.pais = "Brasil"
                })


            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

    };

    $scope.onAtualizar = async function () {

        if ($scope._regConta.nome == '') {
            uteisService.onToast('Ops .. o nome é importante.', 'error', 2000, 'top-end');

        } else if ($scope._regConta.email == '') {
            uteisService.onToast('Informe o seu e-mail mais utilizado.', 'error', 2000, 'top-end');

        } else if ($scope._regConta.senha == '') {
            uteisService.onToast('Sem a senha ? ', 'error', 2000, 'top-end');

        } else {

            let apelido = $scope._regConta.nome.split(' ');
            $scope._regConta.apelido = apelido[0];

            let _reg = JSON.parse(JSON.stringify($scope._regConta))
            _reg._foto = "";

            _reg.alerta_email_criterio = $scope._regConta.alerta_email_criterio_leve ? '1' : '0'
            _reg.alerta_email_criterio += $scope._regConta.alerta_email_criterio_importante ? '1' : '0'
            _reg.alerta_email_criterio += $scope._regConta.alerta_email_criterio_critico ? '1' : '0'

            _reg.alerta_celular_criterio = $scope._regConta.alerta_celular_criterio_leve ? '1' : '0'
            _reg.alerta_celular_criterio += $scope._regConta.alerta_celular_criterio_importante ? '1' : '0'
            _reg.alerta_celular_criterio += $scope._regConta.alerta_celular_criterio_critico ? '1' : '0'

            uteisService.patchBase('/conta', _reg)
                .then((res) => {

                    uteisService.onToast('Dados atualizados!', 'info', 2000, 'top-end');
                    uteisService.setCookie('_conta', JSON.stringify(_reg), 365);

                })
                .catch((error) => {
                    uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
                });

        };
    };

    $scope.onGetFoto = function () {
        document.getElementById('imgload').click();

        document.getElementById('imgload').onchange = function () {
            // Seta o gif temporário
            $scope.$apply(() => {
                $scope._regConta._logo = "assets/images/carregando_icon.gif";
            });

            setTimeout(() => {
                const file = this.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        // Atualiza o logo com a imagem carregada
                        $scope.$apply(() => {
                            $scope._regConta._logo = e.target.result;
                            $scope.onPostFoto(e.target.result);
                        });
                    };
                    reader.readAsDataURL(file);
                }
            }, 1200);

        };
    };

    $scope.onPostFoto = function (foto) {

        let reg = [];
        reg.push({
            foto: foto
        })

        let _url = uteisService.apiUrl_()

        $http.post(_url + '/image/save', reg, $scope.options)
            .then(function (res) {

                $scope._regConta.logo = res.data[0].id_foto
                $scope._regConta._logo = _url + '/image/' + res.data[0].id_foto

            }, function (error) {
                // alert(JSON.stringify(error))
                // $scope.msgBox("Ops.. erro", JSON.stringify(error), "error");
            });

    };

    // Colaboradores

    $scope.onCarregaColaboradores = async function () {

        let _url = '/_bd?c=colaborador&id_conta=' + $scope._regConta._id;
        _url += '&sort=nome'

        await uteisService.getBase(_url)
            .then((res) => {

                res.map((item) => {

                    item['_foto'] = '../assets/images/icon_avatar.png'

                    if (item.foto && !item.foto.includes('assets')) {
                        item._foto = uteisService.apiUrl_() + '/image/' + item.foto
                    };

                });


                $scope._listColaboradores = res
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

    }

    $scope.onEditarColaborador = async function (_reg) {

        if (_reg == undefined) {

            $scope._regColaborador = {
                _id: uteisService.onGetID(),
                id_conta: $scope._regConta._id,
                ativo: '1',
                foto: '',
                _foto: '../assets/images/icon_avatar.png',
                nome: '',
                apelido: '',
                id_funcao: null,
                tag: '',
                cpf: '',
                perfil: 'admin',
                email: '',
                celular: '',
                login: '',
                senha: '',
                _senha: '',
                cep: '',
                logradouro: '',
                numero: '',
                complemento: '',
                bairro: '',
                cidade: '',
                estado: '',
                acesso_modulos: []
            }

        } else {

            $scope._regColaborador = JSON.parse(JSON.stringify(_reg))
            $scope._regColaborador.ativo = "" + $scope._regColaborador.ativo;
            

            $scope._regColaborador['_foto'] = '../assets/images/icon_avatar.png'
            if ($scope._regColaborador.foto) {
                if ($scope._regColaborador.foto.includes("avatar") == false) {
                    $scope._regColaborador._foto = uteisService.apiUrl_() + '/image/' + $scope._regColaborador.foto
                }
            };
        };
    };

    $scope.onSalvarColaborador = async function () {

        if ($scope._regColaborador.nome == '') {
            uteisService.onToast('Ops .. o nome é importante.', 'error', 2000, 'top-end');

        } else {

            let _reg = JSON.parse(JSON.stringify($scope._regColaborador))
            _reg._foto = "";

            uteisService.patchBase('/colaborador', _reg)
                .then((res) => {

                    uteisService.onToast('Colaborador, registrado!', 'info', 2000, 'top-end');
                    $scope.onCarregaColaboradores();
                    $scope._regColaborador = undefined;

                })
                .catch((error) => {
                    uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
                });

        };
    };

    $scope.onGetFotoColoborador = function () {
        document.getElementById('imgload').click();

        document.getElementById('imgload').onchange = function () {
            // Seta o gif temporário
            $scope.$apply(() => {
                $scope._regColaborador._foto = "assets/images/carregando_icon.gif";
            });

            setTimeout(() => {
                const file = this.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        // Atualiza o logo com a imagem carregada
                        $scope.$apply(() => {
                            $scope._regColaborador._foto = e.target.result;
                            $scope.onPostFotoColoborador(e.target.result);
                        });
                    };
                    reader.readAsDataURL(file);
                }
            }, 1200);

        };
    };

    $scope.onPostFotoColoborador = function (foto) {

        let reg = [];
        reg.push({
            foto: foto
        })

        let _url = uteisService.apiUrl_()

        $http.post(_url + '/image/save', reg, $scope.options)
            .then(function (res) {

                $scope._regColaborador.foto = res.data[0].id_foto
                $scope._regColaborador._foto = _url + '/image/' + res.data[0].id_foto

            }, function (error) {
                // alert(JSON.stringify(error))
                // $scope.msgBox("Ops.. erro", JSON.stringify(error), "error");
            });

    };

    $scope.formatarCargo = function (value) {

        if (!value) return '';

        // Substitui underscores por espaços
        let texto = value.replace(/_/g, ' ');

        // Coloca a primeira letra de cada palavra em maiúscula
        texto = texto.replace(/\b\w/g, l => l.toUpperCase());

        return texto;
    }

    // Final Colaboradores

    $scope.onLimpaBase = async function () {

        alert($scope._regLimpeza.email +"="+ $scope._regConta.email)

        if ($scope._regLimpeza.email == $scope._regConta.email) {


            if (!$scope._regLimpeza.tipo_limpeza) {
                uteisService.onToast('Escolha a melhor qual o Tipo de Limpeza', 'error', 2000, 'top-end');
                return;
            }


            if($scope._regLimpeza.tipo_limpeza == 'skus') {
                uteisService.delBase('item/id_conta/' + $scope._regConta._id).then((res) => {
                    uteisService.onToast('A base de SKUs foi limpa com sucesso', 'success', 2000, 'top-end');
                }).catch((error) => {
                    uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
                });
                return;
            }

            let limpeza = $scope._regLimpeza.tipo_limpeza == 'completa' ? true : false
            let msgLimpeza = limpeza ? ' toda a sua base?' : ' as movimentações ?	'

            uteisService.onQuestion("Atenção!", "Deseja realmente limpar " + msgLimpeza)
                .then(async (res) => {
                    if (res) {

                        await uteisService.getBase('/_bd/limpa_base/' + $scope._regConta._id + '/' + limpeza)
                            .then((res) => {

                                if (limpeza) {
                                    uteisService.onToast('Toda sua base de dados foi limpa com sucesso', 'success', 2000, 'top-end');
                                } else {
                                    uteisService.onToast('A base de Movimentação foi limpa com sucesso', 'success', 2000, 'top-end');
                                };
                            });
                    } else {

                        $scope._regLimpeza.email= "";
                        $scope._regLimpeza.tipo_limpeza = ""
                        $scope.$apply();

                    }
                });

        } else {
            uteisService.onToast('Dados incorretos', 'error', 2000, 'top-end');
        };

    };


    $scope.onLimpaBaseBkp = async function () {
        await uteisService.delBase('/movimentacao/id_conta/' + $scope._regConta._id)
        await uteisService.delBase('/movimentacao_item/id_conta/' + $scope._regConta._id)
        await uteisService.delBase('/movimentacao_itens_base/id_conta/' + $scope._regConta._id)
        await uteisService.delBase('/movimentacao_mov_item/id_conta/' + $scope._regConta._id)
        await uteisService.delBase('/movimentacao_mov/id_conta/' + $scope._regConta._id)

        await uteisService.delBase('/processos/id_conta/' + $scope._regConta._id)
        await uteisService.delBase('/registro/id_conta/' + $scope._regConta._id)

        await uteisService.delBase('/item/id_conta/' + $scope._regConta._id)

        uteisService.onToast('A base de Movimentação foi limpa com sucesso', 'success', 2000, 'top-end');
    };

    $scope.onMudaExtra = async function (extra) {

        $scope._regExtras = extra;
        $scope.$apply();
    };

    $scope.onFusoEditar = async function (reg) {

        if (reg == undefined) {
            $scope._editFuso = {
                _id: uteisService.onGetID(),
                id_conta: $scope._regConta._id,
                descricao: '',
                inicio: '',
                termino: '',
            };
        } else {
            $scope._editFuso = JSON.parse(JSON.stringify(reg));
        }

    };

    $scope.onFusoSalvar = async function () {

        if ($scope._editFuso.descricao == '') {
            uteisService.onToast('Ops .. a descrição é importante.', 'error', 2000, 'top-end');

        } else if ($scope._editFuso.inicio == '' || $scope._editFuso.termino == '') {
            uteisService.onToast('Informe o intervalo do Turno', 'error', 2000, 'top-end');
        } else {

            $scope._editFuso.inicio = $scope._editFuso.inicio.slice(0, 2) + ':' + $scope._editFuso.inicio.slice(2)
            $scope._editFuso.termino = $scope._editFuso.termino.slice(0, 2) + ':' + $scope._editFuso.termino.slice(2)

            uteisService.patchBase('/fusos', $scope._editFuso)
                .then((res) => {

                    uteisService.onToast('Fuso registrado!', 'info', 2000, 'top-end');
                    $scope.onFusoRegistros();
                    $scope.onFusoEditar();

                })
                .catch((error) => {
                    uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
                });

        };
    };

    $scope.onFusoRegistros = async function () {

        await uteisService.getBase('/_bd?c=fusos&id_conta=' + $scope._regConta._id + '&sort=inicio')
            .then((res) => {
                $scope._regFusos = res;

                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

    };


    $scope.onFusoExcluir = async function (reg) {

        uteisService.onQuestion('Atenção!', 'Deseja realmente excluir esse Fuso?').then(async (res) => {

            if (res) {

                await uteisService.delBase('fusos/_id/' + reg._id)
                    .then((res) => {
                        uteisService.onToast('Fuso excluido.', 'info', 2000, 'top-end');
                        $scope.onFusoRegistros();
                    })

            }
        })


    };

    $scope.onProcessoEditar = async function (reg) {

        if (reg == undefined) {
            $scope._editProcesso = {
                _id: uteisService.onGetID(),
                id_conta: $scope._regConta._id,
                descricao: '',
                acao_mov: '',
                modo: ''
            };
        } else {
            $scope._editProcesso = JSON.parse(JSON.stringify(reg));
        }

    };

    $scope.onProcessoSalvar = async function () {

        if ($scope._editProcesso.descricao == '') {
            uteisService.onToast('Ops .. a descrição é importante.', 'error', 2000, 'top-end');

        } else if ($scope._editProcesso.acao_mov == '') {
            uteisService.onToast('Selecione qual a Movimentação desse Processo.', 'error', 2000, 'top-end');
        } else {

            uteisService.patchBase('/processos', $scope._editProcesso)
                .then((res) => {

                    uteisService.onToast('Processo registrado!', 'info', 2000, 'top-end');
                    $scope.onProcessoRegistros();
                    $scope.onProcessoEditar(undefined);
                })
                .catch((error) => {
                    uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
                });

        };
    };

    $scope.onLogs = async function () {

        // Desconecta socket anterior se existir
        if ($scope.socket) {
            $scope.socket.disconnect();
            $scope.socket = null;
        };

        // Limpa leituras anteriores
        $scope._regLeituras = [];

        // Cria nova conexão socket
        $scope.socket = io(); // conexão padrão

        $scope.socket.on($scope._regConta._id, function (data) {

           
            try {
                // Se os dados vierem como string JSON, converte para objeto
                let leitura = {}
                leitura._timestamp_recebido = new Date().toISOString();
                leitura._dados = JSON.stringify(data)

                // Adiciona no início da lista (mais recente primeiro)
                $scope._regLeituras.unshift(leitura);

                // Mantém apenas os 50 últimos registros
                if ($scope._regLeituras.length > 50) {
                    $scope._regLeituras = $scope._regLeituras.slice(0, 50);
                }
                $scope.$apply();

            } catch (error) {
                console.error('Erro ao processar leitura:', error, data);
            }
        });

    };

    $scope._regLogsPdi = [];
    $scope._logPdiSelecionado = null;
    $scope._logPdiJson = '';
    $scope._awaitLogsPdi = false;

    $scope.onCarregaLogsPdi = async function () {
        if (!$scope._regConta || !$scope._regConta._id) return;

        $scope._awaitLogsPdi = true;
        $scope._logPdiSelecionado = null;
        $scope._logPdiJson = '';

        let _url = '/_bd?c=log&id_conta=' + $scope._regConta._id;
        _url += '&_sort=data_registro';
        _url += '&limit=200';
        _url += '&pop=id_colaborador&pop=id_gateway&pop=id_item&pop=id_posicao&pop=id_registro';

        await uteisService.getBase(_url)
            .then((res) => {
                $scope._regLogsPdi = Array.isArray(res) ? res : [];
                $scope._awaitLogsPdi = false;
                $scope.$apply();
            })
            .catch((error) => {
                console.error('Erro ao carregar Log PDI:', error);
                $scope._regLogsPdi = [];
                $scope._awaitLogsPdi = false;
                uteisService.onToast('Erro ao carregar Log PDI.', 'error', 2000, 'top-end');
                $scope.$apply();
            });
    };

    $scope.onSelecionaLogPdi = function (log) {
        $scope._logPdiSelecionado = log;
        try {
            $scope._logPdiJson = JSON.stringify(log, null, 2);
        } catch (e) {
            $scope._logPdiJson = String(log);
        }
    };

    $scope.onProcessoRegistros = async function () {

        await uteisService.getBase('/_bd?c=processos&id_conta=' + $scope._regConta._id + '&sort=descricao')
            .then((res) => {
                $scope._regProcessos = res;
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

    };

    $scope.onProcessoExcluir = async function (reg) {

        uteisService.onQuestion('Atenção!', 'Deseja realmente excluir esse Processo?').then(async (res) => {

            if (res) {
                await uteisService.delBase('processos/_id/' + reg._id)
                    .then((res) => {
                        uteisService.onToast('Processo excluido.', 'normal', 2000, 'top-end');
                        $scope.onProcessoRegistros();
                    })
            };
        });

    };



    $scope.formataDataHora = function (data) {
        if (!data) return '-';
        const date = new Date(data);
        // Subtrai 3 horas
        date.setHours(date.getHours() - 3);
        return date.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      };


    $scope._onMessage = async function () {

        // uteisService.onMsgBox('Olá','teste','error')
        uteisService.onQuestion('Está tudo certo...', 'info', 2000, 'top-end')

    };

    $scope.onEntrarMicrosoft = async function () {
        window.location.href = '/auth/microsoft';
    };

});