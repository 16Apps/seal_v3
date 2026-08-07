/**
 * Simulador Konva (gateways / caixas) — lógica isolada neste controller.
 * A view injeta Konva e estilos via contentFor no layout.
 */
function sealEmulatorBootstrap($scope, $timeout, uteisService) {
    var STORAGE_KEY = 'simulador-konva-layout-v1';
    var container = document.getElementById('emulatorKonvaContainer');
    if (!container || typeof Konva === 'undefined') {
        return angular.noop;
    }
    $scope.emulator = $scope.emulator || {};
    $scope.emulator.form = $scope.emulator.form || { objName: '', objType: '', objRange: '', itemTag: '' };
    $scope.emulator.historyOptions = $scope.emulator.historyOptions || [];
    $scope.emulator.historyItemId = $scope.emulator.historyItemId || '';
    $scope.emulator.statusText = $scope.emulator.statusText || 'Nenhum objeto selecionado';
    $scope.emulator.history = $scope.emulator.history || {
        currentText: '—',
        currentSub: '',
        totals: [],
        logEntries: [],
        emptyText: 'Adicione uma caixa ao cenário.'
    };
    $scope.emulator.selectedGateway = $scope.emulator.selectedGateway || null;
    $scope.emulator.gatewayItemsInRange = $scope.emulator.gatewayItemsInRange || [];

    var width = container.clientWidth;
    var height = container.clientHeight;

    var stage = new Konva.Stage({
        container: 'emulatorKonvaContainer',
        width: width,
        height: height
    });

    var backgroundLayer = new Konva.Layer();
    var mainLayer = new Konva.Layer();
    var uiLayer = new Konva.Layer();

    stage.add(backgroundLayer);
    stage.add(mainLayer);
    stage.add(uiLayer);

    var transformer = new Konva.Transformer({
        rotateEnabled: false,
        ignoreStroke: true,
        padding: 6,
        borderStroke: '#10b981',
        anchorStroke: '#10b981',
        anchorFill: '#ffffff',
        anchorSize: 10,
        enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right']
    });

    uiLayer.add(transformer);

    var selectedGroups = [];
    var idCounter = 1;

    var MAX_HISTORY_EVENTS = 120;
    var itemTracking = {};
    var rafId = null;
    var REGISTRO_POLL_MS = 5000;
    var registroIntervalId = null;
    var gatewayItemsModalEl = document.getElementById('emulatorGatewayItemsModal');
    var gatewayItemsModal = null;
    var gatewayPickerModalEl = document.getElementById('emulatorGatewayPickerModal');
    var gatewayPickerModal = null;
    var itemPickerModalEl = document.getElementById('emulatorItemPickerModal');
    var itemPickerModal = null;

    function buildRegistroPayload(gatewayLabel, itemMeta) {
        return {
            tokem: gatewayLabel,
            tag: (itemMeta.tag || itemMeta.id),
            data_leitura: new Date().toISOString(),
            antena: '0',
            rssi: -58,
            bateria: '0',
            temperatura: '0',
            latitude: '',
            longitude: '',
            id_nivel_loc1: '',
            id_nivel_loc2: '',
            id_nivel_loc3: '',
            id_nivel_loc4: '',
            id_nivel_loc1_final: '',
            id_nivel_loc2_final: '',
            id_nivel_loc3_final: '',
            id_nivel_loc4_final: ''
        };
    }

    function flushRegistrosInsideGateways() {
        if ($scope.$$destroyed) return;
        if (!uteisService || !angular.isFunction(uteisService.posthBase)) return;

        var gateways = mainLayer.find('.sim-object').filter(function (node) {
            return node.getAttr('meta').type === 'gateway';
        });
        var items = mainLayer.find('.sim-object').filter(function (node) {
            return node.getAttr('meta').type === 'item';
        });
        if (!gateways.length || !items.length) return;

        var bodies = [];
        items.forEach(function (item) {
            var meta = item.getAttr('meta');
            var place = resolvePlace(item, gateways);
            if (place.key === 'outside') return;
            bodies.push(buildRegistroPayload(place.label, meta));
        });
        if (!bodies.length) return;

        $scope.$applyAsync(function () {
            if ($scope.$$destroyed) return;
            bodies.forEach(function (body) {
                uteisService.posthBase('/registro', body)
                    .then(function (res) {
                        console.log(res);
                    })
                    .catch(function (error) {
                        console.log(error);
                    });
            });
        });
    }

    function formatDurationMs(ms) {
        if (ms < 0) ms = 0;
        if (ms < 1000) return Math.round(ms) + ' ms';
        var sec = Math.floor(ms / 1000);
        if (sec < 60) return sec + ' s';
        var min = Math.floor(sec / 60);
        var s = sec % 60;
        if (min < 60) return min + ' min ' + s + ' s';
        var h = Math.floor(min / 60);
        var m = min % 60;
        return h + ' h ' + m + ' min';
    }

    function formatEventTime(ts) {
        try {
            return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch (e) {
            return '';
        }
    }

    function ensureItemTracking(itemId) {
        if (!itemTracking[itemId]) {
            itemTracking[itemId] = {
                placeKey: null,
                placeLabel: '',
                segmentStartPerf: null,
                segmentStartWall: null,
                completedSegments: [],
                totalsByPlace: {},
                placeLabels: {}
            };
        }
        return itemTracking[itemId];
    }

    function getDistance(a, b) {
        var dx = a.x() - b.x();
        var dy = a.y() - b.y();
        return Math.sqrt(dx * dx + dy * dy);
    }

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    function distancePointToRect(px, py, rect) {
        var cx = clamp(px, rect.x, rect.x + rect.width);
        var cy = clamp(py, rect.y, rect.y + rect.height);
        var dx = px - cx;
        var dy = py - cy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function getContainingGateways(item, gateways) {
        var list = [];
        gateways.forEach(function (gw) {
            var meta = gw.getAttr('meta');
            var effectiveRange = Number(meta.range || 120) * ((gw.scaleX() + gw.scaleY()) / 2);
            // Usa apenas o corpo da caixa (Rect), ignorando labels/texto para não falsear.
            var itemBox = item.findOne('Rect');
            var itemRect = itemBox
                ? itemBox.getClientRect({ relativeTo: mainLayer })
                : item.getClientRect({ relativeTo: mainLayer });
            var d = distancePointToRect(gw.x(), gw.y(), itemRect);
            if (d <= effectiveRange) {
                list.push({ gw: gw, meta: meta, distance: d });
            }
        });
        return list;
    }

    function resolvePlace(item, gateways) {
        var list = getContainingGateways(item, gateways);
        if (list.length === 0) {
            return { key: 'outside', label: 'Fora' };
        }
        list.sort(function (a, b) { return a.distance - b.distance; });
        var meta = list[0].meta;
        return { key: 'gateway:' + meta.id, label: meta.name || meta.id };
    }

    function isItemInsideAnyGateway(item, gateways) {
        return getContainingGateways(item, gateways).length > 0;
    }

    function getItemsInsideGateway(gatewayGroup) {
        if (!gatewayGroup) return [];
        var gwMeta = gatewayGroup.getAttr('meta') || {};
        var gwId = gwMeta.id;
        var items = mainLayer.find('.sim-object').filter(function (node) {
            return node.getAttr('meta').type === 'item';
        });
        var inside = [];
        items.forEach(function (itemNode) {
            var list = getContainingGateways(itemNode, [gatewayGroup]);
            if (!list.length) return;
            var meta = itemNode.getAttr('meta') || {};
            inside.push({
                id: meta.id,
                name: meta.name || meta.id || 'SKU',
                tag: meta.tag || meta.id || '-',
                gatewayId: gwId,
                distanceText: Math.round(list[0].distance) + ' px'
            });
        });
        inside.sort(function (a, b) { return a.name.localeCompare(b.name, 'pt'); });
        return inside;
    }

    function syncSelectedGatewayState() {
        var group = getPrimarySelection();
        if (!group || selectedGroups.length !== 1) {
            $scope.emulator.selectedGateway = null;
            $scope.emulator.gatewayItemsInRange = [];
            $scope.$applyAsync();
            return;
        }
        var meta = group.getAttr('meta') || {};
        if (meta.type !== 'gateway') {
            $scope.emulator.selectedGateway = null;
            $scope.emulator.gatewayItemsInRange = [];
            $scope.$applyAsync();
            return;
        }
        $scope.emulator.selectedGateway = {
            id: meta.id,
            name: meta.name || meta.id
        };
        $scope.emulator.gatewayItemsInRange = getItemsInsideGateway(group);
        $scope.$applyAsync();
    }

    function closeSegment(track, endPerf, endWallMs) {
        var durationMs = endPerf - track.segmentStartPerf;
        var seg = {
            placeKey: track.placeKey,
            label: track.placeLabel,
            startWallMs: track.segmentStartWall,
            endWallMs: endWallMs,
            durationMs: durationMs
        };
        track.completedSegments.unshift(seg);
        if (track.completedSegments.length > MAX_HISTORY_EVENTS) track.completedSegments.pop();
        track.totalsByPlace[track.placeKey] = (track.totalsByPlace[track.placeKey] || 0) + durationMs;
        track.placeLabels[track.placeKey] = track.placeLabel;
    }

    function tickMovementHistory() {
        var gateways = mainLayer.find('.sim-object').filter(function (node) {
            return node.getAttr('meta').type === 'gateway';
        });
        var items = mainLayer.find('.sim-object').filter(function (node) {
            return node.getAttr('meta').type === 'item';
        });
        var now = performance.now();

        items.forEach(function (item) {
            var meta = item.getAttr('meta');
            var id = meta.id;
            var track = ensureItemTracking(id);
            var place = resolvePlace(item, gateways);

            if (track.segmentStartPerf === null) {
                track.placeKey = place.key;
                track.placeLabel = place.label;
                track.segmentStartPerf = now;
                track.segmentStartWall = Date.now();
                track.placeLabels[place.key] = place.label;
                return;
            }

            if (track.placeKey !== place.key) {
                var wall = Date.now();
                var origemKey = track.placeKey;
                var origemLabel = track.placeLabel;
                var destinoKey = place.key;
                var destinoLabel = place.label;
                closeSegment(track, now, wall);

                (function (payload) {
                    $scope.$applyAsync(function () {
                        if ($scope.$$destroyed) return;
                        if (uteisService && angular.isFunction(uteisService.onToast)) {
                            uteisService.onToast(
                                'Origem: ' + payload.origemLabel + ' → ' + payload.destinoLabel +
                                ' | Tag: ' + (payload.meta.tag || payload.meta.id),
                                'info',
                                2000,
                                'top-end'
                            );
                        }
                        if (angular.isFunction($scope.onEmulatorPlaceChange)) {
                            $scope.onEmulatorPlaceChange(payload);
                        }
                    });
                })({
                    origemKey: origemKey,
                    origemLabel: origemLabel,
                    destinoKey: destinoKey,
                    destinoLabel: destinoLabel,
                    meta: angular.copy(meta)
                });

                track.placeKey = place.key;
                track.placeLabel = place.label;
                track.segmentStartPerf = now;
                track.segmentStartWall = wall;
                track.placeLabels[place.key] = place.label;
                if ($scope.emulator.historyItemId === id) renderHistoryLog();
            }
        });

        updateHistoryTotals();
    }

    function clearAllItemTracking() {
        Object.keys(itemTracking).forEach(function (k) { delete itemTracking[k]; });
    }

    function resetTrackingForItemId(itemId) {
        delete itemTracking[itemId];
        populateHistorySelect();
        updateHistoryTotals();
        renderHistoryLog();
    }

    function populateHistorySelect() {
        var items = mainLayer.find('.sim-object').filter(function (node) {
            return node.getAttr('meta').type === 'item';
        });
        var prev = $scope.emulator.historyItemId;
        var options = [];
        items.forEach(function (node, i) {
            var meta = node.getAttr('meta');
            options.push({
                id: meta.id,
                label: (meta.name || 'Caixa') + ' (' + (meta.tag || meta.id) + ')'
            });
        });
        if (items.length === 0) {
            options.push({ id: '', label: 'Nenhuma caixa' });
            $scope.emulator.historyOptions = options;
            $scope.emulator.historyItemId = '';
            $scope.$applyAsync();
            return;
        }
        var still = items.some(function (n) { return n.getAttr('meta').id === prev; });
        $scope.emulator.historyOptions = options;
        $scope.emulator.historyItemId = still ? prev : items[0].getAttr('meta').id;
        $scope.$applyAsync();
    }

    function getLiveTotalMs(track, placeKey, nowPerf) {
        var base = track.totalsByPlace[placeKey] || 0;
        if (track.placeKey === placeKey && track.segmentStartPerf != null) {
            base += nowPerf - track.segmentStartPerf;
        }
        return base;
    }

    function labelForPlaceKey(track, key) {
        if (key === 'outside') return 'Fora';
        return track.placeLabels[key] || key.replace(/^gateway:/, '');
    }

    function updateHistoryTotals() {
        var itemId = $scope.emulator.historyItemId;
        var nowPerf = performance.now();
        if (!itemId || !itemTracking[itemId]) {
            $scope.emulator.history.currentText = '—';
            $scope.emulator.history.currentSub = '';
            $scope.emulator.history.totals = [];
            return;
        }
        var track = itemTracking[itemId];
        if (track.segmentStartPerf === null) {
            $scope.emulator.history.currentText = '—';
            $scope.emulator.history.currentSub = '';
            $scope.emulator.history.totals = [];
            return;
        }

        var elapsed = nowPerf - track.segmentStartPerf;
        $scope.emulator.history.currentText = track.placeLabel + ' — há ' + formatDurationMs(elapsed);
        $scope.emulator.history.currentSub = 'Desde ' + formatEventTime(track.segmentStartWall);

        var keyMap = {};
        Object.keys(track.totalsByPlace).forEach(function (k) { keyMap[k] = true; });
        if (track.placeKey) keyMap[track.placeKey] = true;
        var sorted = Object.keys(keyMap).sort(function (a, b) {
            if (a === 'outside') return -1;
            if (b === 'outside') return 1;
            return labelForPlaceKey(track, a).localeCompare(labelForPlaceKey(track, b), 'pt');
        });

        $scope.emulator.history.totals = sorted.map(function (key) {
            var label = labelForPlaceKey(track, key);
            var total = getLiveTotalMs(track, key, nowPerf);
            return { label: label, totalText: formatDurationMs(total) };
        });
    }

    function renderHistoryLog() {
        var itemId = $scope.emulator.historyItemId;
        var items = mainLayer.find('.sim-object').filter(function (node) {
            return node.getAttr('meta').type === 'item';
        });
        if (!items.length) {
            $scope.emulator.history.logEntries = [];
            $scope.emulator.history.emptyText = 'Adicione uma caixa ao cenário.';
            return;
        }
        if (!itemId || !itemTracking[itemId]) {
            $scope.emulator.history.logEntries = [];
            $scope.emulator.history.emptyText = 'Selecione uma caixa.';
            return;
        }
        var track = itemTracking[itemId];
        if (!track.completedSegments.length) {
            $scope.emulator.history.logEntries = [];
            $scope.emulator.history.emptyText = 'Nenhum trecho finalizado ainda (o local atual aparece acima).';
            return;
        }
        $scope.emulator.history.logEntries = track.completedSegments.map(function (seg) {
            var start = formatEventTime(seg.startWallMs);
            var end = formatEventTime(seg.endWallMs);
            return {
                endText: end,
                label: seg.label,
                durationText: formatDurationMs(seg.durationMs),
                periodText: 'de ' + start + ' até ' + end
            };
        });
    }

    function clampGroupPosition(group) {
        var box = group.getClientRect({ relativeTo: mainLayer });
        var dx = 0;
        var dy = 0;

        if (box.x < 0) dx = -box.x;
        if (box.y < 0) dy = -box.y;
        if (box.x + box.width > stage.width()) dx = stage.width() - (box.x + box.width);
        if (box.y + box.height > stage.height()) dy = stage.height() - (box.y + box.height);

        if (dx || dy) {
            group.x(group.x() + dx);
            group.y(group.y() + dy);
        }
    }

    function updateStatus(text) {
        $scope.emulator.statusText = text;
        $scope.$applyAsync();
    }

    function generateId(prefix) {
        return prefix + '-' + (idCounter++);
    }

    function getPrimarySelection() {
        return selectedGroups.length ? selectedGroups[0] : null;
    }

    function updateSelectionStatus() {
        var group = getPrimarySelection();
        if (!group) {
            updateStatus('Nenhum objeto selecionado');
            return;
        }
        if (selectedGroups.length === 1) {
            var meta = group.getAttr('meta');
            updateStatus('Selecionado: ' + meta.name + ' (' + meta.type + ')');
            return;
        }
        updateStatus(selectedGroups.length + ' objetos selecionados');
    }

    function setSelectedGroups(groups) {
        var list = (groups || []).filter(function (g, idx, arr) {
            return !!g && arr.indexOf(g) === idx;
        });
        selectedGroups = list;
        transformer.nodes(list);
        fillForm(list.length === 1 ? list[0] : null);
        updateSelectionStatus();
        syncSelectedGatewayState();
        uiLayer.draw();
    }

    function toggleSelectedGroup(group) {
        var i = selectedGroups.indexOf(group);
        if (i >= 0) {
            var next = selectedGroups.slice();
            next.splice(i, 1);
            setSelectedGroups(next);
            return;
        }
        setSelectedGroups(selectedGroups.concat(group));
    }

    function fillForm(group) {
        if (!group) {
            $scope.emulator.form.objName = '';
            $scope.emulator.form.objType = '';
            $scope.emulator.form.objRange = '';
            $scope.emulator.form.itemTag = '';
            $scope.$applyAsync();
            return;
        }

        var meta = group.getAttr('meta');
        $scope.emulator.form.objName = meta.name || '';
        $scope.emulator.form.objType = meta.type || '';
        $scope.emulator.form.objRange = meta.range || '';
        $scope.emulator.form.itemTag = meta.tag || '';
        $scope.$applyAsync();
    }

    function updateItemMetaName(canvasItemId, newName) {
        if (!canvasItemId || !newName) return;
        mainLayer.find('.sim-object').forEach(function (node) {
            var m = node.getAttr('meta');
            if (!m || m.type !== 'item' || m.id !== canvasItemId) return;
            var next = angular.extend({}, m, { name: newName });
            node.setAttr('meta', next);
            updateGroupVisuals(node);
        });
        mainLayer.draw();
    }

    function updateGroupVisuals(group) {
        var meta = group.getAttr('meta');
        var label = group.findOne('.label');
        var sublabel = group.findOne('.sublabel');

        if (label) label.text(meta.name || meta.type);

        if (meta.type === 'gateway') {
            var rangeCircle = group.findOne('.range-circle');
            if (rangeCircle) rangeCircle.radius(Number(meta.range || 120));
            if (sublabel) sublabel.text('alcance: ' + (meta.range || 120) + 'px');
        }

        if (meta.type === 'item') {
            if (sublabel) sublabel.text(meta.tag || 'sem tag');
        }

        mainLayer.draw();
    }

    function baseGroupConfig(meta, x, y) {
        return new Konva.Group({
            x: x,
            y: y,
            draggable: true,
            name: 'sim-object',
            meta: meta
        });
    }

    function attachCommonEvents(group) {
        group.on('click tap', function (e) {
            e.cancelBubble = true;
            var evt = e && e.evt ? e.evt : null;
            var appendMode = !!(evt && (evt.ctrlKey || evt.metaKey || evt.shiftKey));
            if (appendMode) {
                toggleSelectedGroup(group);
                return;
            }
            setSelectedGroups([group]);
        });

        group.on('dragstart', function () {
            if (selectedGroups.length <= 1 || selectedGroups.indexOf(group) === -1) return;
            var driverStart = { x: group.x(), y: group.y() };
            group.setAttr('_dragDriverStart', driverStart);
            selectedGroups.forEach(function (g) {
                g.setAttr('_dragSelectionStart', { x: g.x(), y: g.y() });
            });
        });

        group.on('dragmove', function () {
            if (selectedGroups.length > 1 && selectedGroups.indexOf(group) >= 0) {
                var driverStart = group.getAttr('_dragDriverStart');
                if (driverStart) {
                    var dx = group.x() - driverStart.x;
                    var dy = group.y() - driverStart.y;
                    selectedGroups.forEach(function (g) {
                        if (g === group) return;
                        var start = g.getAttr('_dragSelectionStart');
                        if (!start) return;
                        g.x(start.x + dx);
                        g.y(start.y + dy);
                        clampGroupPosition(g);
                    });
                }
            }
            clampGroupPosition(group);
            checkGatewayProximity();
        });

        group.on('dragend transformend', function () {
            group.setAttr('_dragDriverStart', null);
            selectedGroups.forEach(function (g) {
                g.setAttr('_dragSelectionStart', null);
            });
            clampGroupPosition(group);
            updateGroupVisuals(group);
            checkGatewayProximity();
            saveLayoutSilently();
        });

        group.on('transform', function () {
            if (group.getAttr('meta').type === 'gateway') {
                var circle = group.findOne('.range-circle');
                var baseRadius = Number(group.getAttr('meta').range || 120);
                var avgScale = (group.scaleX() + group.scaleY()) / 2;
                circle.radius(baseRadius * avgScale);
            }
        });
    }

    function createGateway(config) {
        config = config || {};
        var meta = {
            id: config.id || generateId('gateway'),
            type: 'gateway',
            name: config.name || ('Gateway ' + idCounter),
            tag: config.tag || '',
            range: Number(config.range || 120)
        };

        var gx = config.x !== undefined ? config.x : 180;
        var gy = config.y !== undefined ? config.y : 180;
        var group = baseGroupConfig(meta, gx, gy);

        var rangeCircle = new Konva.Circle({
            x: 0,
            y: 0,
            radius: meta.range,
            fill: 'rgba(37, 99, 235, 0.10)',
            stroke: 'rgba(37, 99, 235, 0.35)',
            strokeWidth: 2,
            dash: [10, 6],
            name: 'range-circle',
            listening: false
        });

        var body = new Konva.Rect({
            x: -50,
            y: -24,
            width: 100,
            height: 48,
            cornerRadius: 12,
            fill: '#2563eb',
            stroke: '#1d4ed8',
            strokeWidth: 2,
            shadowColor: 'rgba(0,0,0,.25)',
            shadowBlur: 10,
            shadowOffsetY: 4
        });

        var antennaLeft = new Konva.Line({
            points: [-55, -18, -72, -30],
            stroke: '#1d4ed8',
            strokeWidth: 3,
            lineCap: 'round'
        });

        var antennaRight = new Konva.Line({
            points: [55, -18, 72, -30],
            stroke: '#1d4ed8',
            strokeWidth: 3,
            lineCap: 'round'
        });

        var label = new Konva.Text({
            x: -70,
            y: -8,
            width: 140,
            align: 'center',
            text: meta.name,
            fontSize: 14,
            fontStyle: 'bold',
            fill: '#ffffff',
            listening: false,
            name: 'label'
        });

        var sublabel = new Konva.Text({
            x: -80,
            y: 34,
            width: 160,
            align: 'center',
            text: 'alcance: ' + meta.range + 'px',
            fontSize: 12,
            fill: '#1f2937',
            listening: false,
            name: 'sublabel'
        });

        group.add(rangeCircle, antennaLeft, antennaRight, body, label, sublabel);
        attachCommonEvents(group);
        mainLayer.add(group);
        mainLayer.draw();
        return group;
    }

    function createItem(config) {
        config = config || {};
        var meta = {
            id: config.id || generateId('item'),
            type: 'item',
            name: config.name || ('Caixa ' + idCounter),
            tag: config.tag || ('CX-' + (function (n) {
                var s = String(n);
                while (s.length < 4) s = '0' + s;
                return s;
            })(idCounter)),
            range: null
        };

        var ix = config.x !== undefined ? config.x : 360;
        var iy = config.y !== undefined ? config.y : 220;
        var group = baseGroupConfig(meta, ix, iy);

        var box = new Konva.Rect({
            x: -46,
            y: -36,
            width: 92,
            height: 72,
            cornerRadius: 8,
            fill: '#f59e0b',
            stroke: '#d97706',
            strokeWidth: 2,
            shadowColor: 'rgba(0,0,0,.18)',
            shadowBlur: 10,
            shadowOffsetY: 4
        });

        var topFlap = new Konva.Line({
            points: [-46, -8, 0, -28, 46, -8],
            stroke: '#b45309',
            strokeWidth: 2,
            lineJoin: 'round'
        });

        var centerLine = new Konva.Line({
            points: [0, -28, 0, 36],
            stroke: '#b45309',
            strokeWidth: 2
        });

        var label = new Konva.Text({
            x: -70,
            y: 42,
            width: 140,
            align: 'center',
            text: meta.name,
            fontSize: 14,
            fontStyle: 'bold',
            fill: '#111827',
            listening: false,
            name: 'label'
        });

        var sublabel = new Konva.Text({
            x: -70,
            y: 58,
            width: 140,
            align: 'center',
            text: meta.tag,
            fontSize: 12,
            fill: '#6b7280',
            listening: false,
            name: 'sublabel'
        });

        group.add(box, topFlap, centerLine, label, sublabel);
        attachCommonEvents(group);
        mainLayer.add(group);
        mainLayer.draw();
        return group;
    }

    function checkGatewayProximity() {
        var gateways = mainLayer.find('.sim-object').filter(function (node) {
            return node.getAttr('meta').type === 'gateway';
        });
        var items = mainLayer.find('.sim-object').filter(function (node) {
            return node.getAttr('meta').type === 'item';
        });

        items.forEach(function (item) {
            var box = item.findOne('Rect');
            var found = isItemInsideAnyGateway(item, gateways);
            var place = resolvePlace(item, gateways);
            var sublabel = item.findOne('.sublabel');
            var meta = item.getAttr('meta') || {};

            box.fill(found ? '#22c55e' : '#f59e0b');
            box.stroke(found ? '#16a34a' : '#d97706');

            if (sublabel) {
                var tag = meta.tag || 'sem tag';
                sublabel.text(tag + ' • ' + (place.label || 'Fora'));
            }
        });

        mainLayer.batchDraw();
        syncSelectedGatewayState();
    }

    function getSerializableState() {
        var objects = mainLayer.find('.sim-object').map(function (group) {
            var meta = group.getAttr('meta');
            return {
                id: meta.id,
                type: meta.type,
                name: meta.name,
                tag: meta.tag,
                range: meta.range,
                x: group.x(),
                y: group.y(),
                scaleX: group.scaleX(),
                scaleY: group.scaleY()
            };
        });

        return { objects: objects };
    }

    function rebuildFromState(state) {
        mainLayer.destroyChildren();
        clearAllItemTracking();

        var objects = (state && state.objects) || [];
        var highest = 0;

        objects.forEach(function (obj) {
            var group = obj.type === 'gateway' ? createGateway(obj) : createItem(obj);
            group.scaleX(obj.scaleX || 1);
            group.scaleY(obj.scaleY || 1);
            updateGroupVisuals(group);

            var num = Number(String(obj.id || '').split('-').pop());
            if (!isNaN(num)) highest = Math.max(highest, num);
        });

        idCounter = Math.max(idCounter, highest + 1);
        setSelectedGroups([]);
        populateHistorySelect();
        updateHistoryTotals();
        renderHistoryLog();
        checkGatewayProximity();
        mainLayer.draw();
    }

    function saveLayoutSilently() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(getSerializableState()));
        } catch (e) { /* ignore */ }
    }

    function saveLayout() {
        saveLayoutSilently();
        updateStatus('Layout salvo no navegador');
    }

    function loadLayout() {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            window.alert('Nenhum layout salvo foi encontrado.');
            return;
        }

        rebuildFromState(JSON.parse(raw));
        updateStatus('Layout carregado com sucesso');
    }

    function exportLayout() {
        var json = JSON.stringify(getSerializableState(), null, 2);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(json)
                .then(function () { window.alert('JSON copiado para a área de transferência.'); })
                .catch(function () { window.alert(json); });
        } else {
            window.alert(json);
        }
    }

    function deleteSelected() {
        if (!selectedGroups.length) return;
        selectedGroups.forEach(function (group) {
            var meta = group.getAttr('meta');
            if (meta.type === 'item') delete itemTracking[meta.id];
            group.destroy();
        });
        setSelectedGroups([]);
        mainLayer.draw();
        populateHistorySelect();
        updateHistoryTotals();
        renderHistoryLog();
        checkGatewayProximity();
        saveLayoutSilently();
    }

    function clearAll() {
        // if (!window.confirm('Deseja realmente limpar todos os objetos?')) return;
        mainLayer.destroyChildren();
        clearAllItemTracking();
        setSelectedGroups([]);
        mainLayer.draw();
        populateHistorySelect();
        updateHistoryTotals();
        renderHistoryLog();
        localStorage.removeItem(STORAGE_KEY);
        updateStatus('Área limpa');
    }

    function applyChanges() {
        var selectedGroup = getPrimarySelection();
        if (!selectedGroup) return;

        var meta = selectedGroup.getAttr('meta');
        meta.name = (($scope.emulator.form.objName || '') + '').trim() || meta.name;
        meta.tag = (($scope.emulator.form.itemTag || '') + '').trim();

        if (meta.type === 'gateway') {
            var parsedRange = Number($scope.emulator.form.objRange || meta.range || 120);
            meta.range = Math.max(40, parsedRange);
        }

        selectedGroup.setAttr('meta', meta);
        updateGroupVisuals(selectedGroup);
        checkGatewayProximity();
        saveLayoutSilently();
        fillForm(selectedGroups.length === 1 ? selectedGroup : null);
        updateStatus('Alterações aplicadas em ' + meta.name);
    }

    function onResize() {
        width = container.clientWidth;
        height = container.clientHeight;
        stage.width(width);
        stage.height(height);
        mainLayer.find('.sim-object').forEach(function (g) { clampGroupPosition(g); });
        checkGatewayProximity();
        stage.draw();
    }

    function rafLoop() {
        tickMovementHistory();
        rafId = window.requestAnimationFrame(rafLoop);
    }

    function onAddGateway() {
        var list = $scope._listGateways || [];
        if (!list.length) {
            if (uteisService && angular.isFunction(uteisService.onToast)) {
                uteisService.onToast('Nenhum gateway cadastrado para seleção.', 'warning', 2500, 'top-end');
            }
            return;
        }

        if (!$scope.emulator.gatewayPicker) $scope.emulator.gatewayPicker = {};
        if (!$scope.emulator.gatewayPicker.selectedId) {
            $scope.emulator.gatewayPicker.selectedId = list[0]._id;
        }

        if (gatewayPickerModalEl && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            gatewayPickerModal = gatewayPickerModal || new bootstrap.Modal(gatewayPickerModalEl);
            gatewayPickerModal.show();
        }
    }

    function onConfirmAddGateway() {
        var list = $scope._listGateways || [];
        if (!list.length) return;

        var selectedId = $scope.emulator.gatewayPicker && $scope.emulator.gatewayPicker.selectedId;
        var reg = list.find(function (g) { return g._id === selectedId; }) || list[0];
        if (!reg) return;

        var tokem = reg.tokem || reg.descricao || reg._id || ('Gateway ' + idCounter);
        var group = createGateway({
            name: tokem,
            tag: reg.tokem || ''
        });
        setSelectedGroups([group]);
        saveLayoutSilently();

        if (gatewayPickerModal) gatewayPickerModal.hide();
    }

    function itemRegistroTemCategoria(it) {
        if (!it) return false;
        var c = it.id_categoria;
        if (c == null || c === '') return false;
        if (typeof c === 'string') return c.length > 0;
        if (typeof c === 'object' && c._id) return true;
        return false;
    }

    function onAddItem() {
        var list = $scope._listItens || [];
        if (!list.length) {
            if (uteisService && angular.isFunction(uteisService.onToast)) {
                uteisService.onToast('Nenhum SKU cadastrado para seleção.', 'warning', 2500, 'top-end');
            }
            return;
        }

        if (!$scope.emulator.itemPicker) $scope.emulator.itemPicker = { selectedId: '', search: '', categoriaPickId: '' };
        if ($scope.emulator.itemPicker.categoriaPickId === undefined) $scope.emulator.itemPicker.categoriaPickId = '';
        if (!$scope.emulator.itemPicker.selectedId) {
            $scope.emulator.itemPicker.selectedId = list[0]._id;
        }

        if (itemPickerModalEl && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            itemPickerModal = itemPickerModal || new bootstrap.Modal(itemPickerModalEl);
            itemPickerModal.show();
        }
    }

    function onConfirmAddItem() {
        var list = $scope._listItens || [];
        if (!list.length) return;

        var selectedId = $scope.emulator.itemPicker && $scope.emulator.itemPicker.selectedId;
        var reg = list.find(function (i) { return i._id === selectedId; }) || list[0];
        if (!reg) return;

        if (!itemRegistroTemCategoria(reg)) {
            if (uteisService && angular.isFunction(uteisService.onToast)) {
                uteisService.onToast('Este SKU não está vinculado a um Item. Vincule abaixo antes de incluir.', 'warning', 4500, 'top-end');
            }
            return;
        }

        var nomeCategoria = reg.id_categoria && reg.id_categoria.descricao
            ? reg.id_categoria.descricao
            : (reg.descricao || reg.tag || ('Caixa ' + idCounter));
        var tagItem = reg.tag || reg.ean || reg._id;

        var group = createItem({
            name: nomeCategoria,
            tag: tagItem
        });
        setSelectedGroups([group]);
        populateHistorySelect();
        updateHistoryTotals();
        renderHistoryLog();
        checkGatewayProximity();
        saveLayoutSilently();

        if (itemPickerModal) itemPickerModal.hide();
    }

    function onHistoryItemChange() {
        updateHistoryTotals();
        renderHistoryLog();
    }

    function onResetHistory() {
        var id = $scope.emulator.historyItemId;
        if (!id) return;
        resetTrackingForItemId(id);
    }

    function onOpenGatewayItemsModal() {

        $scope.emulator.phoneModalView = 'tags';

        $scope.onBasePosicao();

        $timeout(function () {
            if (gatewayItemsModalEl && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                gatewayItemsModal = gatewayItemsModal || new bootstrap.Modal(gatewayItemsModalEl);
                gatewayItemsModal.show();
            }
            $timeout(function () {
                if (angular.isFunction($scope.refreshGatewayItemsDbInfo)) {
                    $scope.refreshGatewayItemsDbInfo();
                }
            }, 200);
        });
    }

    $scope._emulatorApi = {
        updateItemMetaName: updateItemMetaName,
        onAddGateway: onAddGateway,
        onConfirmAddGateway: onConfirmAddGateway,
        onAddItem: onAddItem,
        onConfirmAddItem: onConfirmAddItem,
        onHistoryItemChange: onHistoryItemChange,
        onResetHistory: onResetHistory,
        onOpenGatewayItemsModal: onOpenGatewayItemsModal,
        onApplyChanges: applyChanges,
        onDeleteSelected: deleteSelected,
        onClearAll: clearAll,
        onSaveLayout: saveLayout,
        onLoadLayout: loadLayout,
        onExportLayout: exportLayout
    };

    stage.on('click tap', function (e) {
        if (e.target === stage) setSelectedGroups([]);
    });

    transformer.boundBoxFunc(function (oldBox, newBox) {
        if (newBox.width < 50 || newBox.height < 40) return oldBox;
        return newBox;
    });

    window.addEventListener('resize', onResize);

    rafId = window.requestAnimationFrame(rafLoop);

    registroIntervalId = window.setInterval(flushRegistrosInsideGateways, REGISTRO_POLL_MS);

    mainLayer.draw();

    return function destroySealEmulator() {
        if (registroIntervalId) {
            window.clearInterval(registroIntervalId);
            registroIntervalId = null;
        }
        delete $scope._emulatorApi;
        $scope.emulator.selectedGateway = null;
        $scope.emulator.gatewayItemsInRange = [];
        if (gatewayItemsModal) {
            gatewayItemsModal.hide();
            gatewayItemsModal = null;
        }
        if (gatewayPickerModal) {
            gatewayPickerModal.hide();
            gatewayPickerModal = null;
        }
        if (itemPickerModal) {
            itemPickerModal.hide();
            itemPickerModal = null;
        }
        if (rafId) {
            window.cancelAnimationFrame(rafId);
            rafId = null;
        }
        window.removeEventListener('resize', onResize);
        try {
            stage.destroy();
        } catch (e) { /* ignore */ }
    };
}

app.controller('emulatorCtrl', function ($scope, $http, $timeout, uteisService) {
    $scope._regConta = {};
    $scope.emulator = {
        form: { objName: '', objType: '', objRange: '', itemTag: '' },
        historyOptions: [],
        historyItemId: '',
        statusText: 'Nenhum objeto selecionado',
        history: {
            currentText: '—',
            currentSub: '',
            totals: [],
            logEntries: [],
            emptyText: 'Adicione uma caixa ao cenário.'
        },
        selectedGateway: null,
        gatewayItemsInRange: [],
        gatewayPicker: { selectedId: '' },
        itemPicker: { selectedId: '', search: '', categoriaPickId: '' },
        posicaoDraftLoading: false,
        posicaoDraftReady: false,
        destinoPicker: null,
        phoneModalView: 'tags',
        destinoDrill: { chain: [], search: '' }
    };
    var destroyEmulator = angular.noop;

    function callEmulatorApi(method) {
        if (!$scope._emulatorApi || !angular.isFunction($scope._emulatorApi[method])) return;
        $scope._emulatorApi[method]();
    }

    $scope.onAddGateway = function () { callEmulatorApi('onAddGateway'); };
    $scope.onConfirmAddGateway = function () { callEmulatorApi('onConfirmAddGateway'); };
    $scope.onAddItem = function () { callEmulatorApi('onAddItem'); };
    $scope.onConfirmAddItem = function () { callEmulatorApi('onConfirmAddItem'); };
    $scope.onHistoryItemChange = function () { callEmulatorApi('onHistoryItemChange'); };
    $scope.onResetHistory = function () { callEmulatorApi('onResetHistory'); };
    $scope.onApplyChanges = function () { callEmulatorApi('onApplyChanges'); };
    $scope.onOpenGatewayItemsModal = function () { callEmulatorApi('onOpenGatewayItemsModal'); };
    $scope.onDeleteSelected = function () { callEmulatorApi('onDeleteSelected'); };
    $scope.onClearAll = function () { callEmulatorApi('onClearAll'); };
    $scope.onSaveLayout = function () { callEmulatorApi('onSaveLayout'); };
    $scope.onLoadLayout = function () { callEmulatorApi('onLoadLayout'); };
    $scope.onExportLayout = function () { callEmulatorApi('onExportLayout'); };

    async function syncContaLogo() {
        $scope._regConta = uteisService.getCookie('_conta') || {};
        $scope._regConta._logo = '../assets/images/logo_default.fw.png';

        if ($scope._regConta.logo && $scope._regConta.logo.indexOf('logo_conta') === -1) {
            var _url = uteisService.apiUrl_();
            $scope._regConta._logo = _url + '/image/' + $scope._regConta.logo;
        }

        _url = '/_bd?c=gateway&id_conta=' + $scope._regConta._id
        _url += '&_sort=descricao'

        await uteisService.getBase(_url)
            .then((res) => {
                $scope._listGateways = res;
                if (!$scope.emulator.gatewayPicker.selectedId && res && res.length) {
                    $scope.emulator.gatewayPicker.selectedId = res[0]._id;
                }

            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

        _url = '/_bd?c=item&id_conta=' + $scope._regConta._id;
        _url += '&pop=id_categoria&pop=id_nivel_loc1&pop=id_nivel_loc2&pop=id_nivel_loc3&pop=id_nivel_loc4';
        _url += '&pop=id_categoria_reg1';
        _url += '&_sort=tag';

        await uteisService.getBase(_url)
            .then((res) => {

                $scope._listItens = res || [];
                if (!$scope.emulator.itemPicker.selectedId && $scope._listItens.length) {
                    $scope.emulator.itemPicker.selectedId = $scope._listItens[0]._id;
                }

            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });


        _url = '/_bd?c=localizacao&id_conta=' + $scope._regConta._id

        await uteisService.getBase(_url)
            .then((res) => {
                $scope._listLocalizacoes = res;
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

        _url = '/_bd?c=categoria&id_conta=' + $scope._regConta._id + '&sort=descricao';

        await uteisService.getBase(_url)
            .then((res) => {
                $scope._listCategorias = res;
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });
    }

    function flattenItemRefsForPatch(payload) {
        if (!payload) return payload;
        ['id_nivel_loc1', 'id_nivel_loc2', 'id_nivel_loc3', 'id_nivel_loc4',
            'id_categoria', 'id_categoria_reg1', 'id_categoria_reg2', 'id_categoria_reg3', 'id_categoria_reg4'
        ].forEach(function (k) {
            var v = payload[k];
            if (v && typeof v === 'object' && v._id !== undefined) payload[k] = v._id;
        });
        return payload;
    }

    function itemRegistroTemCategoria(it) {
        if (!it) return false;
        var c = it.id_categoria;
        if (c == null || c === '') return false;
        if (typeof c === 'string') return c.length > 0;
        if (typeof c === 'object' && c._id) return true;
        return false;
    }

    $scope.itemPickerSelectedSemCategoria = function () {
        var pick = $scope.emulator.itemPicker;
        if (!pick || !pick.selectedId || !$scope._listItens) return null;
        var row = $scope._listItens.find(function (x) { return x._id === pick.selectedId; });
        if (!row || itemRegistroTemCategoria(row)) return null;
        return row;
    };

    $scope.onVincularCategoriaNoItemPicker = function () {
        var pick = $scope.emulator.itemPicker;
        var row = $scope.itemPickerSelectedSemCategoria();
        if (!row || !pick || !pick.categoriaPickId) return;
        row._savingCategoriaPicker = true;
        var payload = angular.copy(row);
        flattenItemRefsForPatch(payload);
        payload.id_categoria = pick.categoriaPickId;
        uteisService.patchBase('/item', payload)
            .then(function (doc) {
                row._savingCategoriaPicker = false;
                angular.extend(row, doc);
                var cat = ($scope._listCategorias || []).find(function (c) { return c._id === pick.categoriaPickId; });
                if (cat) row.id_categoria = angular.extend({ _id: cat._id }, cat);
                pick.categoriaPickId = '';
                uteisService.onToast('Categoria vinculada. Agora você pode incluir o SKU na planta.', 'success', 3500, 'top-end');
                $scope.$applyAsync();
            })
            .catch(function () {
                row._savingCategoriaPicker = false;
                uteisService.onToast('Não foi possível vincular a categoria.', 'error', 3500, 'top-end');
                $scope.$applyAsync();
            });
    };

    $scope.refreshGatewayItemsDbInfo = function () {
        var list = $scope.emulator.gatewayItemsInRange;
        if (!list || !list.length || !$scope._regConta || !$scope._regConta._id) {
            $scope.$applyAsync();
            return;
        }
        list.forEach(function (it) {
            it.gwItemDbLoading = true;
        });
        $scope.$applyAsync();

        var jobs = list.map(function (it) {
            var url = '/_bd?c=item&id_conta=' + $scope._regConta._id + '&tag=' + encodeURIComponent(it.tag);
            return uteisService.getBase(url)
                .then(function (res) {
                    var row = res && res[0];
                    it.gwItemDbLoading = false;
                    if (!row) {
                        it.itemMissingInDb = true;
                        it.needsCategoria = false;
                        return;
                    }
                    it.itemMissingInDb = false;
                    it._itemDb = angular.copy(row);
                    var cat = row.id_categoria;
                    var catId = (cat && typeof cat === 'object' && cat._id) ? cat._id : cat;
                    it.needsCategoria = !catId || catId === '';
                    if (it.categoriaPickId === undefined) it.categoriaPickId = '';
                    it.savingCategoria = false;
                })
                .catch(function () {
                    it.gwItemDbLoading = false;
                    it.itemMissingInDb = true;
                    it.needsCategoria = false;
                });
        });

        Promise.all(jobs).then(function () {
            $scope.$applyAsync();
        });
    };

    $scope.onVincularCategoriaGatewayItem = function (it) {
        if (!it || !it.categoriaPickId || !it._itemDb || it.savingCategoria) return;
        it.savingCategoria = true;
        var payload = angular.copy(it._itemDb);
        flattenItemRefsForPatch(payload);
        payload.id_categoria = it.categoriaPickId;
        uteisService.patchBase('/item', payload)
            .then(function (doc) {
                it.savingCategoria = false;
                it.needsCategoria = false;
                it._itemDb = angular.copy(doc);
                var cat = ($scope._listCategorias || []).find(function (c) { return c._id === it.categoriaPickId; });
                var nome = cat ? cat.descricao : (it.name || 'SKU');
                it.name = nome;
                if ($scope._emulatorApi && angular.isFunction($scope._emulatorApi.updateItemMetaName)) {
                    $scope._emulatorApi.updateItemMetaName(it.id, nome);
                }
                uteisService.onToast('Categoria vinculada ao item.', 'success', 2500, 'top-end');
                $scope.$applyAsync();
            })
            .catch(function () {
                it.savingCategoria = false;
                uteisService.onToast('Não foi possível vincular a categoria.', 'error', 3500, 'top-end');
                $scope.$applyAsync();
            });
    };

    $scope.onBasePosicao = async function () {

        $scope._gatewway = undefined;

        _url = '/_bd?c=gateway&id_conta=' + $scope._regConta._id;
        _url += '&tokem=' + $scope.emulator.selectedGateway.name;
        _url += '&pop=id_nivel_loc1&pop=id_nivel_loc2&pop=id_nivel_loc3&pop=id_nivel_loc4'

        await uteisService.getBase(_url)
            .then(async (res) => {
                $scope._gatewway = res[0]

                let _nivel = '';

                if ($scope._gatewway.id_nivel_loc4) {
                    _nivel = $scope._gatewway.id_nivel_loc4._id
                } else if ($scope._gatewway.id_nivel_loc3) {
                    _nivel = $scope._gatewway.id_nivel_loc3._id
                } else if ($scope._gatewway.id_nivel_loc2) {
                    _nivel = $scope._gatewway.id_nivel_loc2._id
                } else if ($scope._gatewway.id_nivel_loc1) {
                    _nivel = $scope._gatewway.id_nivel_loc1._id
                }

                _url = '/_bd?c=localizacao&id_conta=' + $scope._regConta._id;
                _url += '&_id=' + _nivel

                await uteisService.getBase(_url)
                    .then((res) => {

                        $scope._localizacaoCheck = res[0]
                        $scope._localizacaoCheck['processo_app_destino'] = $scope._localizacaoCheck.processo_app_destino ? $scope._localizacaoCheck.processo_app_destino : 'checar';
                        $scope.onNovaPosicao();

                    });
            })

    }

    function idNivelPai(loc) {
        var p = loc.id_nivel;
        if (p && typeof p === 'object' && p._id) return p._id;
        return p;
    }

    function isRootLocalizacao(loc) {
        var p = loc.id_nivel;
        if (p && typeof p === 'object') return false;
        return p == null || p === '' || p === undefined;
    }

    function localizacaoFilhos(list, parentId) {
        if (!list || !list.length) return [];
        var out = list.filter(function (l) {
            if (parentId == null || parentId === '') return isRootLocalizacao(l);
            return idNivelPai(l) === parentId;
        });
        out.sort(function (a, b) {
            return (a.descricao || '').localeCompare(b.descricao || '', 'pt');
        });
        return out;
    }

    function initDestinoPicker() {
        $scope.emulator.destinoPicker = {
            selectedIds: [null, null, null, null]
        };
        $scope.emulator.destinoDrill = { chain: [], search: '' };
    }

    function applyDestinoIdsFromLocArray(locArr) {
        var dp = $scope.emulator.destinoPicker;
        if (!dp) return;
        for (var i = 0; i < 4; i++) {
            dp.selectedIds[i] = locArr[i] ? locArr[i]._id : null;
        }
    }

    $scope.destinoPhoneLocHasChildren = function (loc) {
        if (!loc) return false;
        var list = $scope._listLocalizacoes || [];
        return localizacaoFilhos(list, loc._id).length > 0;
    };

    $scope.destinoPhoneListItems = function () {
        var list = $scope._listLocalizacoes || [];
        var ch = ($scope.emulator.destinoDrill && $scope.emulator.destinoDrill.chain) || [];
        var parentId = ch.length ? ch[ch.length - 1]._id : null;
        var items = localizacaoFilhos(list, parentId);
        var q = ($scope.emulator.destinoDrill && $scope.emulator.destinoDrill.search || '').trim().toLowerCase();
        if (!q) return items;
        return items.filter(function (l) {
            return (l.descricao || '').toLowerCase().indexOf(q) !== -1
                || (l.tag || '').toLowerCase().indexOf(q) !== -1;
        });
    };

    $scope.destinoPhoneCrumbDisplay = function () {
        var ch = ($scope.emulator.destinoDrill && $scope.emulator.destinoDrill.chain) || [];
        if (!ch.length) return 'Níveis principais';
        return ch.map(function (l) { return l.descricao || l._id; }).join(' > ') + ' >';
    };

    $scope.destinoPhoneRowIconClass = function () {
        var ch = ($scope.emulator.destinoDrill && $scope.emulator.destinoDrill.chain) || [];
        return ch.length === 0 ? 'bi-building' : 'bi-box-seam';
    };

    $scope.destinoPhoneRowIsSelected = function (loc) {
        if (!loc || !$scope.emulator.destinoPicker) return false;
        var ids = $scope.emulator.destinoPicker.selectedIds;
        for (var i = 3; i >= 0; i--) {
            if (ids[i]) return ids[i] === loc._id;
        }
        return false;
    };

    $scope.onDestinoPhoneRowClick = function (loc) {
        if (!loc) return;
        var ch = $scope.emulator.destinoDrill.chain;
        if ($scope.destinoPhoneLocHasChildren(loc) && ch.length < 3) {
            ch.push(loc);
            for (var c = 0; c < 4; c++) {
                $scope.emulator.destinoPicker.selectedIds[c] = null;
            }
            return;
        }
        var full = ch.concat([loc]);
        applyDestinoIdsFromLocArray(full);
    };

    $scope.onDestinoPhoneUseCurrentFolder = function () {
        var ch = $scope.emulator.destinoDrill.chain;
        if (!ch || !ch.length) return;
        applyDestinoIdsFromLocArray(ch);
    };

    $scope.onDestinoPhoneCrumbBarClick = function () {
        var ch = $scope.emulator.destinoDrill.chain;
        if (ch && ch.length) ch.pop();
    };

    $scope.onPhoneDestinoBackToTags = function () {
        $scope.emulator.phoneModalView = 'tags';
        if ($scope.emulator.destinoDrill) {
            $scope.emulator.destinoDrill.chain = [];
            $scope.emulator.destinoDrill.search = '';
        }
    };

    $scope.onConfirmarDestinoPosicao = function () {
        var dp = $scope.emulator.destinoPicker;
        if (!dp || !dp.selectedIds[0]) {
            uteisService.onToast('Selecione o local de destino (toque em um item sem subníveis ou em “Usar este nível”).', 'warning', 4000, 'top-end');
            return;
        }
        if (!$scope._editPosicao) return;

        $scope._editPosicao.id_nivel_loc1_destino = dp.selectedIds[0] || '';
        $scope._editPosicao.id_nivel_loc2_destino = dp.selectedIds[1] || '';
        $scope._editPosicao.id_nivel_loc3_destino = dp.selectedIds[2] || '';
        $scope._editPosicao.id_nivel_loc4_destino = dp.selectedIds[3] || '';

        $scope.onSalvaPosicao()
    };

    $scope.onSalvaPosicao = async function () {

        uteisService.patchBase('/posicao', $scope._editPosicao)
            .then(function () {
                uteisService.onToast('Posição registrada com sucesso!', 'success', 3000, 'top-end');
                $scope.emulator.phoneModalView = 'tags';
                if ($scope.emulator.destinoDrill) {
                    $scope.emulator.destinoDrill.chain = [];
                    $scope.emulator.destinoDrill.search = '';
                    // $scope.onClearAll()
                }
                var gwEl = document.getElementById('emulatorGatewayItemsModal');
                if (gwEl && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                    var gwi = bootstrap.Modal.getInstance(gwEl);
                    if (gwi) gwi.hide();
                }
            })
            .catch(function () {
                uteisService.onToast('Não foi possível salvar a posição.', 'error', 4000, 'top-end');
            });

    }


    $scope.onNovaPosicao = async function () {

        $scope._editPosicao = undefined;
        var agora = moment().format('YYYY-MM-DD HH:mm:ss');

        // Checar se Ordem para esse Local
        let _url = '/posicao/buscar-destino';
        _url += '?id_nivel_loc1=' + ($scope._gatewway?.id_nivel_loc1?._id || '');
        _url += '&id_nivel_loc2=' + ($scope._gatewway?.id_nivel_loc2?._id || '');
        _url += '&id_nivel_loc3=' + ($scope._gatewway?.id_nivel_loc3?._id || '');
        _url += '&id_nivel_loc4=' + ($scope._gatewway?.id_nivel_loc4?._id || '');
        _url += '&tag=' + ($scope.emulator.gatewayItemsInRange?.[0]?.tag || '');

        await uteisService.getBase(_url)
            .then((res) => {
                if (!res || res.message === 'Nenhum registro encontrado' || !angular.isArray(res.itens)) {
                    $scope._editPosicao = undefined;
                    return;
                }
                $scope._editPosicao = res;
                $scope._editPosicao.status = 'concluido';
                $scope._editPosicao.status_data = moment().format('YYYY-MM-DD HH:mm:ss');
                $scope._editPosicao.previsao_chegada_data = moment().format('YYYY-MM-DD HH:mm:ss');
                for (let i = 0; i < $scope._editPosicao.itens.length; i++) {
                    $scope._editPosicao.itens[i].status_destino = 'concluido';
                    $scope._editPosicao.itens[i].status_destino_data = moment().format('YYYY-MM-DD HH:mm:ss');
                }
            })
            .catch(function () {
                $scope._editPosicao = undefined;
            });

        $scope.emulator.posicaoDraftLoading = true;
        $scope.emulator.posicaoDraftReady = false;
        $scope.$applyAsync();

        if (!$scope._gatewway) {
            $scope.emulator.posicaoDraftLoading = false;
            $scope.$applyAsync();
            return;
        }

        if ($scope._editPosicao !== undefined) {
            $scope.emulator.posicaoDraftLoading = false;
            $scope.emulator.posicaoDraftReady = true;
            $scope.$applyAsync();
            return
        }

        $scope._editPosicao = {

            _id: uteisService.onGetID(),
            id_conta: $scope._regConta._id,
            ativo: '1',
            id_doc: uteisService.onGetID(),
            descricao: '',
            observacao: '',

            icone: '',
            _icone: '../assets/images/icon_cadastro.fw.png',

            partida_data: agora,
            tolerancia: 30,

            status: 'aberta',
            status_data: '',

            id_nivel_loc1: $scope._gatewway.id_nivel_loc1 ? $scope._gatewway.id_nivel_loc1._id : '',
            id_nivel_loc2: $scope._gatewway.id_nivel_loc2 ? $scope._gatewway.id_nivel_loc2._id : '',
            id_nivel_loc3: $scope._gatewway.id_nivel_loc3 ? $scope._gatewway.id_nivel_loc3._id : '',
            id_nivel_loc4: $scope._gatewway.id_nivel_loc4 ? $scope._gatewway.id_nivel_loc4._id : '',

            itens: [],

            previsao_chegada_data: moment().add(1, 'hours').format('YYYY-MM-DD HH:mm:ss'),
            previsao_chegada_tolerancia: 30,

            id_nivel_loc1_destino: '',
            id_nivel_loc2_destino: '',
            id_nivel_loc3_destino: '',
            id_nivel_loc4_destino: '',
        };

        var faltouCategoria = false;
        try {
            for (let i = 0; i < $scope.emulator.gatewayItemsInRange.length; i++) {

                _url = '/_bd?c=item&id_conta=' + $scope._regConta._id;
                _url += '&tag=' + encodeURIComponent($scope.emulator.gatewayItemsInRange[i].tag);
                _url += '&pop=id_categoria';

                var resItem = await uteisService.getBase(_url);
                var _item = resItem && resItem[0];
                if (!_item) {
                    continue;
                }
                var catRaw = _item.id_categoria;
                var catId = (catRaw && typeof catRaw === 'object' && catRaw._id) ? catRaw._id : catRaw;
                if (!catId || catId === '') {
                    faltouCategoria = true;
                    var tagAv = $scope.emulator.gatewayItemsInRange[i].tag || '';
                    uteisService.onToast(
                        'O SKU com tag ' + tagAv + ' não tem categoria. Vincule no painel de leitura do gateway ou em “Selecionar SKU” antes de finalizar.',
                        'warning',
                        7500,
                        'top-end'
                    );
                    break;
                }
                var eanVal = (catRaw && typeof catRaw === 'object' && catRaw.ean) ? catRaw.ean : '';

                $scope._editPosicao.itens.push({
                    _id: uteisService.onGetID(),
                    id_item: _item._id,
                    id_categoria: catId,

                    tag: _item.tag,
                    ean: eanVal,
                    rssi: $scope.emulator.gatewayItemsInRange[i].distanceText.replace(' px', '').trim(),

                    quantidade: 1,
                    status: 'concluido',
                    status_data: moment().format('YYYY-MM-DD HH:mm:ss'),
                    id_gatweway: $scope._gatewway._id,
                    id_colaborador: '',

                    status_destino: $scope._localizacaoCheck.processo_app_destino == 'finaliza' ? 'concluido' : 'pendente',
                    status_destino_data: $scope._localizacaoCheck.processo_app_destino == 'finaliza' ? moment().format('YYYY-MM-DD HH:mm:ss') : '',

                });

            }

            if (faltouCategoria) {
                $scope._editPosicao.itens = [];
            }

        } finally {
            $scope.emulator.posicaoDraftLoading = false;
            $scope.emulator.posicaoDraftReady = true;
            $scope.$applyAsync();
        }

    }

    $scope.onFinalizaPosicao = function () {

        if (!$scope._editPosicao || !$scope._editPosicao._id) {
            uteisService.onToast('Dados da posição ainda não estão prontos. Abra novamente a leitura do gateway.', 'warning', 4500, 'top-end');
            return;
        }
        if ($scope.emulator.posicaoDraftLoading) {
            uteisService.onToast('Aguarde o carregamento dos itens…', 'info', 2800, 'top-end');
            return;
        }
        if (!$scope._listLocalizacoes || !$scope._listLocalizacoes.length) {
            uteisService.onToast('Não há localizações cadastradas nesta conta.', 'warning', 4000, 'top-end');
            return;
        }

        if (!$scope._editPosicao.itens || !$scope._editPosicao.itens.length) {
            uteisService.onToast('Não há itens válidos na posição (verifique categorias dos SKUs).', 'warning', 5000, 'top-end');
            return;
        }

        if ($scope._editPosicao.status == 'concluido') {
            $scope.onSalvaPosicao();
            return;
        }


        // if ($scope._localizacaoCheck.processo_app_destino == 'checar') {
        //     $scope.onSalvaPosicao();
        //     return;
        // }

        initDestinoPicker();
        $scope.emulator.phoneModalView = 'destino';
        $scope.$applyAsync();
    }


    function startEmulatorOnce() {
        if (startEmulatorOnce._started) return;
        startEmulatorOnce._started = true;

        syncContaLogo();
        $scope.$applyAsync();

        destroyEmulator();
        $timeout(function () {
            destroyEmulator = sealEmulatorBootstrap($scope, $timeout, uteisService) || angular.noop;
        }, 0);
    }

    $scope.$watch('$viewContentLoaded', startEmulatorOnce);
    $timeout(startEmulatorOnce, 0);

    $scope.$on('$destroy', function () {
        destroyEmulator();
        destroyEmulator = angular.noop;
        startEmulatorOnce._started = false;
    });
});
