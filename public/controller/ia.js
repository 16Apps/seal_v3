app.controller('iaCtrl', function ($scope, $http, $timeout, uteisService) {
    $scope._regConta = {};
    $scope.messages = [];
    $scope.userMessage = '';
    $scope.loading = false;
    $scope.chatMeta = {
        session_id: null,
        mode: 'assistido',
        lastAction: null,
        pendingConfirmation: false
    };

    function pushBotMessage(text, meta) {
        $scope.messages.push({
            from: 'bot',
            text: text,
            meta: meta || {},
            createdAt: new Date()
        });
    }

    function pushSystemSummary(meta) {
        if (!meta) return;

        $scope.chatMeta.lastAction = meta.action || null;
        $scope.chatMeta.pendingConfirmation = !!meta.awaiting_confirmation;
        if (meta.session_id) $scope.chatMeta.session_id = meta.session_id;
    }

    function initialBotMessage() {
        pushBotMessage(
            'Olá! Sou o assistente inteligente do Seal RTI. Posso entender sua necessidade, consultar dados, preparar cadastros e também executar configurações com segurança. Me diga o que você precisa, por exemplo: "quero cadastrar uma nova localização", "quero criar uma categoria de carrinhos" ou "me mostre os registros de hoje".'
        );
    }

    $scope.$watch('$viewContentLoaded', function () {
        $scope._regConta = uteisService.getCookie('_conta') || {};
        $scope._regConta._logo = '../assets/images/logo_default.fw.png';

        if ($scope._regConta.logo && $scope._regConta.logo.indexOf('logo_conta') === -1) {
            var _url = uteisService.apiUrl_();
            $scope._regConta._logo = _url + '/image/' + $scope._regConta.logo;
        }

        initialBotMessage();
        $scope.$applyAsync();
    });

    $scope.quickPrompts = [
        'Quero cadastrar uma nova categoria de carrinhos',
        'Quero cadastrar um item com tag RFID',
        'Liste minhas localizações cadastradas',
        'Me mostre um resumo dos registros de hoje',
        'Quero configurar um gateway fixo no portal',
        'Quero criar um processo de tracking entre produção e expedição'
    ];

    $scope.usePrompt = function (prompt) {
        if ($scope.loading) return;
        $scope.userMessage = prompt;
        $timeout(function () {
            var input = document.getElementById('chatInputIA');
            if (input) input.focus();
        }, 50);
    };

    function normalizeHistory() {
        return $scope.messages
            .filter(function (m) { return m.from === 'user' || m.from === 'bot'; })
            .map(function (m) {
                return {
                    role: m.from === 'user' ? 'user' : 'assistant',
                    content: m.text
                };
            });
    }

    $scope.sendMessage = async function () {
        if (!$scope.userMessage || !$scope.userMessage.trim() || $scope.loading) return;

        var text = $scope.userMessage.trim();
        $scope.messages.push({ from: 'user', text: text, createdAt: new Date() });
        $scope.userMessage = '';
        $scope.loading = true;
        $scope.$applyAsync();

        try {
            var body = {
                message: text,
                history: normalizeHistory(),
                id_conta: $scope._regConta && $scope._regConta._id ? $scope._regConta._id : null,
                session_id: $scope.chatMeta.session_id,
                mode: $scope.chatMeta.mode
            };

            var res = await $http.post('/ia/chat', body);
            var data = res && res.data ? res.data : {};

            if (data.reply) {
                pushBotMessage(data.reply, data.meta || {});
                pushSystemSummary(data.meta || {});
            } else {
                pushBotMessage('Não consegui interpretar a resposta do servidor. Tente novamente em alguns instantes.');
            }
        } catch (err) {
            console.error(err);
            var msg = 'Ocorreu um erro ao falar com o assistente. Verifique sua conexão ou tente novamente.';
            if (err && err.data && err.data.error) msg = err.data.error;
            pushBotMessage(msg);
        } finally {
            $scope.loading = false;
            $scope.$applyAsync();
            $timeout(function () {
                var container = document.getElementById('chatMessagesIA');
                if (container) container.scrollTop = container.scrollHeight + 999;
            }, 30);
        }
    };

    $scope.onEnter = function ($event) {
        if ($event.shiftKey) return;
        $event.preventDefault();
        $scope.sendMessage();
    };
});
