(function () {
  'use strict';

  var DEFAULT_CATS = [
    { id: 'sport', name: '运动', icon: '🏀', color: '#FF6B6B' },
    { id: 'english', name: '英语', icon: '🔤', color: '#4ECDC4' },
    { id: 'poem', name: '古诗', icon: '📜', color: '#A78BFA' },
    { id: 'char', name: '识字', icon: '🔡', color: '#FFB703' },
    { id: 'read', name: '阅读', icon: '📚', color: '#06D6A0' },
    { id: 'vocal', name: '声乐', icon: '🎵', color: '#EF476F' },
    { id: 'speech', name: '口才', icon: '🎤', color: '#118AB2' }
  ];

  var ui = {
    catId: null,
    rows: [{ content: '', minutes: '' }],
    recDate: fmtDate(new Date()),
    statsRange: 'week',
    statsDate: fmtDate(new Date()),
    panoRange: 'all',
    panoScale: 1
  };
  var currentView = 'record';
  var suppressClick = false;
  var store = createLocalStore();
  var state = store.getState(); // 与 store 内部 cache 同一引用，原地修改

  /* ---------------- helpers ---------------- */
  function uid() { return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function fmtDate(d) {
    var y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  function parseDate(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function weekDays(ref) {
    var r = parseDate(ref), dow = r.getDay(), diff = (dow + 6) % 7;
    var mon = new Date(r); mon.setDate(r.getDate() - diff);
    var arr = [];
    for (var i = 0; i < 7; i++) { var d = new Date(mon); d.setDate(mon.getDate() + i); arr.push(fmtDate(d)); }
    return arr;
  }
  function monthDays(ref) {
    var p = ref.split('-'); var y = +p[0], m = +p[1];
    var n = new Date(y, m, 0).getDate(); var arr = [];
    for (var i = 1; i <= n; i++) arr.push(y + '-' + String(m).padStart(2, '0') + '-' + String(i).padStart(2, '0'));
    return arr;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; });
  }
  function findCat(id) { for (var i = 0; i < state.categories.length; i++) if (state.categories[i].id === id) return state.categories[i]; return null; }

  /* 长按拖动排序辅助 */
  function chipUnderPoint(container, x, y, self) {
    var best = null;
    container.querySelectorAll('.chip').forEach(function (c) {
      if (c === self) return;
      var r = c.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) best = c;
    });
    return best;
  }
  function commitChipOrder(container) {
    var ids = [];
    container.querySelectorAll('.chip').forEach(function (c) { ids.push(c.dataset.cat); });
    store.op('reorderCats', { order: ids });
  }

  /* ---------------- local store (无云端) ---------------- */
  function createLocalStore() {
    var KEY = 'ks_state_v1';
    var cache = load();
    var onChange = null;

    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function load() {
      try {
        var raw = localStorage.getItem(KEY);
        if (raw) { var d = JSON.parse(raw); if (d && d.categories) return d; }
      } catch (e) {}
      return { categories: clone(DEFAULT_CATS), records: [] };
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) {} }

    function getState() { return cache; }
    function getSpace() { return null; }
    function getShareLink() { return ''; }
    function setStatus() {}

    function applyLocal(type, payload) {
      var now = Date.now();
      switch (type) {
        case 'addRecord': {
          var r = clone(payload.record); if (!r.id) r.id = uid(); r.updatedAt = now;
          if (!cache.records.find(function (x) { return x.id === r.id; })) cache.records.push(r); break;
        }
        case 'updateRecord': {
          var rr = cache.records.find(function (x) { return x.id === payload.id; });
          if (rr) { Object.assign(rr, payload.fields || {}); rr.updatedAt = now; } break;
        }
        case 'deleteRecord': cache.records = cache.records.filter(function (x) { return x.id !== payload.id; }); break;
        case 'addCat': if (payload.cat && !cache.categories.find(function (x) { return x.id === payload.cat.id; })) cache.categories.push(payload.cat); break;
        case 'updateCat': { var c = cache.categories.find(function (x) { return x.id === payload.id; }); if (c) Object.assign(c, payload.fields || {}); break; }
        case 'deleteCat': cache.categories = cache.categories.filter(function (x) { return x.id !== payload.id; }); cache.records = cache.records.filter(function (x) { return x.catId !== payload.id; }); break;
        case 'reorderCats': {
          var ord = payload.order || []; var cmap = {};
          cache.categories.forEach(function (c) { cmap[c.id] = c; });
          var narr = [];
          ord.forEach(function (id) { if (cmap[id]) { narr.push(cmap[id]); delete cmap[id]; } });
          Object.keys(cmap).forEach(function (id) { narr.push(cmap[id]); });
          cache.categories = narr; break;
        }
        case 'resetSpace': cache.categories = clone(DEFAULT_CATS); cache.records = []; break;
      }
    }

    function op(type, payload) {
      applyLocal(type, payload);
      save();
      if (onChange) onChange();
    }

    function init(cb) { onChange = cb; if (onChange) onChange(); }

    return { getState: getState, getSpace: getSpace, getShareLink: getShareLink, op: op, init: init, setStatus: setStatus };
  }

  /* ---------------- tabs ---------------- */
  function showView(v) {
    currentView = v;
    var views = document.querySelectorAll('.tab-view');
    for (var i = 0; i < views.length; i++) views[i].classList.remove('active');
    document.getElementById('view-' + v).classList.add('active');
    var tabs = document.querySelectorAll('.tabbar button');
    for (var j = 0; j < tabs.length; j++) tabs[j].classList.toggle('active', tabs[j].dataset.view === v);
    if (v === 'record') renderRecord();
    else if (v === 'stats') renderStats();
    else if (v === 'settings') renderSettings();
  }

  /* ---------------- record view ---------------- */
  function rangeDates() {
    if (ui.statsRange === 'day') return [ui.statsDate];
    if (ui.statsRange === 'week') return weekDays(ui.statsDate);
    return monthDays(ui.statsDate);
  }

  function buildRecordListHTML() {
    var recs = state.records.filter(function (r) { return r.date === ui.recDate; })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    if (!recs.length) return '<li class="rec-empty">这一天还没有记录，开始添加吧～</li>';
    return recs.map(function (r) {
      var c = findCat(r.catId);
      return '<li class="rec-item">' +
        '<span class="rec-dot" style="background:' + (c ? c.color : '#999') + '"></span>' +
        '<div class="rec-main"><div class="rec-title">' + esc(r.content || '') + '</div>' +
        '<div class="rec-meta">' + (c ? c.icon + c.name : '') + ' · ' + r.date + '</div></div>' +
        '<div class="rec-time">' + r.minutes + '分</div>' +
        '<div class="rec-actions">' +
        '<button class="rec-edit" data-edit="' + r.id + '" title="编辑">✎</button>' +
        '<button class="rec-del" data-del="' + r.id + '" title="删除">✕</button>' +
        '</div></li>';
    }).join('');
  }

  function renderRecord() {
    var root = document.getElementById('view-record');
    var cats = state.categories;
    if (!ui.catId && cats.length) ui.catId = cats[0].id;

    var chips = cats.map(function (c) {
      return '<button class="chip ' + (c.id === ui.catId ? 'active' : '') + '" data-cat="' + c.id + '" style="--c:' + c.color + '">' + c.icon + ' ' + esc(c.name) + '</button>';
    }).join('');

    root.innerHTML =
      '<div class="card">' +
      '<label class="lbl">日期</label>' +
      '<input type="date" id="recDate" value="' + ui.recDate + '">' +
      '<label class="lbl">大类</label>' +
      '<div class="chips">' + chips + '</div>' +
      '<p class="tip" style="padding:4px 2px 0">长按大类图标可拖动排序</p>' +
      '<div id="recRows" class="rec-rows"></div>' +
      '<button class="btn-ghost add-row" id="addRow">＋ 新增事项</button>' +
      '<button class="btn-primary" id="recSave">保存记录</button>' +
      '</div>' +
      '<div class="rec-nav">' +
      '<div class="rec-nav-title" id="recDateTitle">' + ui.recDate + ' 的记录</div>' +
      '<div class="rec-nav-btns">' +
      '<button class="rec-nav-btn" id="dayPrev" type="button">‹ 前一天</button>' +
      '<button class="rec-nav-btn" id="dayNext" type="button">后一天 ›</button>' +
      '</div></div>' +
      '<ul class="rec-list" id="recList">' + buildRecordListHTML() + '</ul>';

    root.querySelector('#recDate').addEventListener('change', function (e) {
      ui.recDate = e.target.value;
      var t = document.getElementById('recDateTitle'); if (t) t.textContent = ui.recDate + ' 的记录';
      refreshRecordList();
    });
    root.querySelectorAll('[data-cat]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (suppressClick) return;
        ui.catId = b.dataset.cat; renderRecord();
      });
    });
    /* 长按拖动排序（首页大类图标） */
    (function setupChipDrag() {
      var chipsEl = root.querySelector('.chips');
      if (!chipsEl) return;
      suppressClick = false;
      chipsEl.querySelectorAll('.chip').forEach(function (chip) {
        var pressTimer = null, longFired = false, startX = 0, startY = 0;
        chip.addEventListener('pointerdown', function (e) {
          if (e.button && e.button !== 0) return;
          startX = e.clientX; startY = e.clientY; longFired = false;
          pressTimer = setTimeout(function () {
            longFired = true;
            chip.classList.add('dragging');
            chipsEl.classList.add('reordering');
            if (chip.setPointerCapture) { try { chip.setPointerCapture(e.pointerId); } catch (_) {} }
          }, 450);
          function onMove(ev) {
            if (!longFired) {
              var dx = ev.clientX - startX, dy = ev.clientY - startY;
              if (Math.abs(dx) > 10 || Math.abs(dy) > 10) { clearTimeout(pressTimer); detach(); }
              return;
            }
            ev.preventDefault();
            var target = chipUnderPoint(chipsEl, ev.clientX, ev.clientY, chip);
            if (target && target !== chip) {
              var r = target.getBoundingClientRect();
              if ((ev.clientX - r.left) > r.width / 2) chipsEl.insertBefore(chip, target.nextSibling);
              else chipsEl.insertBefore(chip, target);
            }
          }
          function onUp() {
            clearTimeout(pressTimer);
            if (longFired) {
              chip.classList.remove('dragging');
              chipsEl.classList.remove('reordering');
              commitChipOrder(chipsEl);
              suppressClick = true;
              setTimeout(function () { suppressClick = false; }, 60);
            }
            detach();
          }
          function detach() {
            chip.removeEventListener('pointermove', onMove);
            chip.removeEventListener('pointerup', onUp);
            chip.removeEventListener('pointercancel', onUp);
          }
          chip.addEventListener('pointermove', onMove);
          chip.addEventListener('pointerup', onUp);
          chip.addEventListener('pointercancel', onUp);
        });
      });
    })();
    root.querySelector('#addRow').addEventListener('click', function () { ui.rows.push({ content: '', minutes: '' }); renderRows(); });
    root.querySelector('#recSave').addEventListener('click', saveRecord);
    root.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { store.op('deleteRecord', { id: b.dataset.del }); });
    });
    root.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openEditModal(b.dataset.edit); });
    });
    var dp = root.querySelector('#dayPrev'); if (dp) dp.addEventListener('click', function () { navigateDay(-1); });
    var dn = root.querySelector('#dayNext'); if (dn) dn.addEventListener('click', function () { navigateDay(1); });
    renderRows();
  }

  function renderRows() {
    var box = document.getElementById('recRows');
    if (!box) return;
    if (!ui.rows.length) ui.rows = [{ content: '', minutes: '' }];
    box.innerHTML = ui.rows.map(function (row, i) {
      var showDel = ui.rows.length > 1;
      return '<div class="rec-row">' +
        '<div class="ri-field"><label class="ri-lbl">事项</label>' +
        '<input type="text" class="ri-content" data-row="' + i + '" placeholder="如：跳绳100个" value="' + esc(row.content) + '"></div>' +
        '<div class="ri-field ri-min"><label class="ri-lbl">分钟</label>' +
        '<input type="number" class="ri-minutes" data-row="' + i + '" min="1" placeholder="如 20" value="' + esc(row.minutes) + '"></div>' +
        (showDel ? '<button type="button" class="ri-del" data-delrow="' + i + '">✕</button>' : '') +
        '</div>';
    }).join('');
    box.querySelectorAll('.ri-content').forEach(function (inp) {
      inp.addEventListener('input', function () { ui.rows[+inp.dataset.row].content = inp.value; });
    });
    box.querySelectorAll('.ri-minutes').forEach(function (inp) {
      inp.addEventListener('input', function () { ui.rows[+inp.dataset.row].minutes = inp.value; });
    });
    box.querySelectorAll('.ri-del').forEach(function (b) {
      b.addEventListener('click', function () { ui.rows.splice(+b.dataset.delrow, 1); renderRows(); });
    });
  }

  function navigateDay(delta) {
    var d = parseDate(ui.recDate);
    d.setDate(d.getDate() + delta);
    ui.recDate = fmtDate(d);
    var inp = document.getElementById('recDate');
    if (inp) inp.value = ui.recDate;
    refreshRecordList();
  }

  function refreshRecordList() {
    var list = document.getElementById('recList');
    var title = document.getElementById('recDateTitle');
    if (list) list.innerHTML = buildRecordListHTML();
    if (title) title.textContent = ui.recDate + ' 的记录';
  }

  function saveRecord() {
    if (!ui.catId) { alert('请选择大类'); return; }
    var toSave = [];
    for (var i = 0; i < ui.rows.length; i++) {
      var row = ui.rows[i];
      var content = (row.content || '').trim();
      var minutesRaw = String(row.minutes || '').trim();
      var minutes = parseInt(minutesRaw, 10);
      var hasContent = !!content;
      var hasMin = !!minutesRaw;
      if (!hasContent && !hasMin) continue; // 整行空白 → 跳过
      if (!hasContent) { alert('第 ' + (i + 1) + ' 行：事项内容必填'); return; }
      if (!hasMin || isNaN(minutes) || minutes <= 0) { alert('第 ' + (i + 1) + ' 行：时长需填写有效的分钟数'); return; }
      toSave.push({ content: content, minutes: minutes });
    }
    if (!toSave.length) { alert('请至少填写一行「事项 + 分钟」'); return; }
    toSave.forEach(function (item) {
      store.op('addRecord', { record: { id: uid(), date: ui.recDate, catId: ui.catId, content: item.content, minutes: item.minutes, createdAt: Date.now() } });
    });
    ui.rows = [{ content: '', minutes: '' }];
    renderRows();
    refreshRecordList();
  }

  function openEditModal(id) {
    var r = null;
    for (var i = 0; i < state.records.length; i++) if (state.records[i].id === id) { r = state.records[i]; break; }
    if (!r) return;
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    var catChips = state.categories.map(function (c) {
      return '<button type="button" class="chip ' + (c.id === r.catId ? 'active' : '') + '" data-cat="' + c.id + '" style="--c:' + c.color + '">' + c.icon + ' ' + esc(c.name) + '</button>';
    }).join('');
    overlay.innerHTML =
      '<div class="modal-box">' +
      '<h3 class="modal-title">编辑记录</h3>' +
      '<label class="lbl">分类</label>' +
      '<div class="chips" id="editCats">' + catChips + '</div>' +
      '<label class="lbl">事项</label>' +
      '<input type="text" id="editContent" class="modal-input" value="' + esc(r.content || '') + '" placeholder="如：跳绳100个">' +
      '<label class="lbl">分钟</label>' +
      '<input type="number" id="editMinutes" class="modal-input" min="1" value="' + esc(r.minutes) + '" placeholder="如 20">' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn-ghost" id="editCancel">取消</button>' +
      '<button type="button" class="btn-primary" id="editSave">保存</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    var selCat = r.catId;
    var contentEl = overlay.querySelector('#editContent');
    contentEl.focus();
    overlay.querySelectorAll('#editCats .chip').forEach(function (b) {
      b.addEventListener('click', function () {
        selCat = b.dataset.cat;
        overlay.querySelectorAll('#editCats .chip').forEach(function (x) { x.classList.toggle('active', x === b); });
      });
    });
    function close() { if (overlay.parentNode) document.body.removeChild(overlay); }
    overlay.querySelector('#editCancel').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('#editSave').addEventListener('click', function () {
      var content = (contentEl.value || '').trim();
      var minutesRaw = (overlay.querySelector('#editMinutes').value || '').trim();
      var minutes = parseInt(minutesRaw, 10);
      if (!selCat) { alert('请选择分类'); return; }
      if (!content) { alert('事项必填'); contentEl.focus(); return; }
      if (!minutesRaw || isNaN(minutes) || minutes <= 0) { alert('请填写有效的分钟数'); return; }
      store.op('updateRecord', { id: r.id, fields: { catId: selCat, content: content, minutes: minutes } });
      close();
    });
  }

  /* ---------------- stats view ---------------- */
  function renderStats() {
    var root = document.getElementById('view-stats');
    var dates = rangeDates();
    var recs = state.records.filter(function (r) { return dates.indexOf(r.date) >= 0; });
    var totalMin = recs.reduce(function (s, r) { return s + r.minutes; }, 0);
    var catSet = {}, daySet = {};
    recs.forEach(function (r) { catSet[r.catId] = 1; daySet[r.date] = 1; });
    var catKeys = Object.keys(catSet), dayKeys = Object.keys(daySet);

    var byCat = state.categories.map(function (c) {
      var m = recs.filter(function (r) { return r.catId === c.id; }).reduce(function (s, r) { return s + r.minutes; }, 0);
      return { name: c.name, value: m, color: c.color };
    }).filter(function (x) { return x.value > 0; });

    var byDayLabels = dates.map(function (d) {
      if (ui.statsRange === 'week') { var wd = ['一', '二', '三', '四', '五', '六', '日']; return '周' + wd[(parseDate(d).getDay() + 6) % 7]; }
      return d.slice(5);
    });
    var byDayVals = dates.map(function (d) { return recs.filter(function (r) { return r.date === d; }).reduce(function (s, r) { return s + r.minutes; }, 0); });

    var single = dates.length === 1;
    var barLabels, barVals, barColors;
    if (single) { barLabels = byCat.map(function (x) { return x.name; }); barVals = byCat.map(function (x) { return x.value; }); barColors = byCat.map(function (x) { return x.color; }); }
    else { barLabels = byDayLabels; barVals = byDayVals; barColors = null; }

    root.innerHTML =
      '<div class="card stats-head">' +
      '<div class="range-tabs">' +
      '<button data-r="day" class="' + (ui.statsRange === 'day' ? 'active' : '') + '">日</button>' +
      '<button data-r="week" class="' + (ui.statsRange === 'week' ? 'active' : '') + '">周</button>' +
      '<button data-r="month" class="' + (ui.statsRange === 'month' ? 'active' : '') + '">月</button>' +
      '</div>' +
      '<input type="date" id="statsDate" value="' + ui.statsDate + '">' +
      '</div>' +
      '<div class="summary">' +
      sumCard(totalMin, '总时长(分)') + sumCard(recs.length, '记录数') + sumCard(catKeys.length, '涉及分类') + sumCard(dayKeys.length, '天数') +
      '</div>' +
      '<div class="card"><h3 class="section-title">' + (single ? '当日分类占比' : '分类占比') + '</h3>' +
      '<canvas id="chartCat" class="chart"></canvas><div id="legendCat" class="legend"></div></div>' +
      '<div class="card"><h3 class="section-title">' + (single ? '当日各分类时长' : '每日时长') + '</h3>' +
      '<canvas id="chartBar" class="chart"></canvas></div>' +
      '<div class="card"><h3 class="section-title">时长趋势</h3>' +
      '<canvas id="chartLine" class="chart"></canvas></div>' +
      '<div class="card"><div class="pano-head"><h3 class="section-title">全景图</h3>' +
      '<div class="pano-head-right">' +
      '<select id="panoRange" class="pano-select">' +
      '<option value="all">全部</option>' +
      '<option value="7">近7天</option>' +
      '<option value="30">近30天</option>' +
      '<option value="month">本月</option>' +
      '<option value="year">今年</option>' +
      '</select>' +
      '<button class="pano-zoom" id="panoZoom" type="button" title="放大横屏查看">⛶ 放大</button>' +
      '</div></div>' +
      '<p class="tip" style="padding:2px 2px 8px">上下滑动看全部日期（含无记录日），左右可滑动看更多大类；点格子看当日具体事项 · 单位：分钟</p>' +
      '<div class="pano-scroll"><div class="pano-grid" id="panoGrid"></div></div>' +
      '<p class="tip" style="padding:8px 2px 0">空白表示该天该大类无记录。</p>' +
      '<div class="modal-overlay pano-modal" id="panoModal" hidden>' +
        '<div class="pano-modal-box">' +
          '<div class="pano-modal-head"><h3>全景图 · 横屏查看更清晰</h3>' +
          '<div class="pano-zoom-ctrl">' +
            '<button class="pzc" id="panoZoomOut" type="button" title="缩小">A−</button>' +
            '<span class="pzv" id="panoZoomVal">100%</span>' +
            '<button class="pzc" id="panoZoomIn" type="button" title="放大">A+</button>' +
            '<button class="pzc" id="panoZoomFit" type="button" title="适应屏幕">适应</button>' +
            '<button class="modal-close pano-modal-close" id="panoModalClose" type="button" title="关闭">✕</button>' +
          '</div></div>' +
          '<p class="tip pano-modal-tip">左右滑动看全部大类 · 点格子看具体事项 · 单位：分钟</p>' +
          '<p class="land-hint">📱 建议将手机横过来，看得更清楚</p>' +
          '<div class="pano-modal-scroll"><div class="pano-grid pano-grid-lg" id="panoModalGrid"></div></div>' +
        '</div>' +
      '</div></div>';

    var rtabs = root.querySelectorAll('[data-r]');
    rtabs.forEach(function (b) { b.addEventListener('click', function () { ui.statsRange = b.dataset.r; renderStats(); }); });
    root.querySelector('#statsDate').addEventListener('change', function (e) { ui.statsDate = e.target.value; renderStats(); });

    drawDoughnut(document.getElementById('chartCat'), byCat);
    drawLegend(document.getElementById('legendCat'), byCat);
    drawBars(document.getElementById('chartBar'), barLabels, barVals, barColors);
    drawLine(document.getElementById('chartLine'), byDayLabels, byDayVals);
    var pg = document.getElementById('panoGrid');
    buildPano(pg);
    if (pg) pg.addEventListener('click', function (e) {
      var cell = e.target.closest('[data-date]');
      if (cell) showPanoDetail(cell.dataset.date, cell.dataset.cat || '');
    });
    var pr = root.querySelector('#panoRange');
    if (pr) { pr.value = ui.panoRange; pr.addEventListener('change', function () { ui.panoRange = pr.value; buildPano(document.getElementById('panoGrid')); }); }

    var pz = root.querySelector('#panoZoom');
    var pmo = root.querySelector('#panoModal');
    if (pz && pmo) {
      pz.addEventListener('click', function () {
        var mg = document.getElementById('panoModalGrid');
        buildPano(mg, true);
        mg.onclick = function (e) { var cell = e.target.closest('[data-date]'); if (cell) showPanoDetail(cell.dataset.date, cell.dataset.cat || ''); };
        pmo.hidden = false;
        var pmc = document.getElementById('panoModalClose');
        if (pmc) pmc.onclick = function () { pmo.hidden = true; };
        pmo.onclick = function (e) { if (e.target === pmo) pmo.hidden = true; };
      });
    }
    function applyPanoScale() {
      var mg = document.getElementById('panoModalGrid');
      if (mg) buildPano(mg, true);
      var v = root.querySelector('#panoZoomVal');
      if (v) v.textContent = Math.round((ui.panoScale || 1) * 100) + '%';
    }
    var zin = root.querySelector('#panoZoomIn');
    var zout = root.querySelector('#panoZoomOut');
    var zfit = root.querySelector('#panoZoomFit');
    if (zin) zin.addEventListener('click', function () { ui.panoScale = Math.min(1.8, (ui.panoScale || 1) + 0.1); applyPanoScale(); });
    if (zout) zout.addEventListener('click', function () { ui.panoScale = Math.max(0.6, (ui.panoScale || 1) - 0.1); applyPanoScale(); });
    if (zfit) zfit.addEventListener('click', function () { ui.panoScale = 1; applyPanoScale(); });
  }

  function addDays(base, n) { var d = new Date(base.getFullYear(), base.getMonth(), base.getDate()); d.setDate(d.getDate() + n); return d; }
  function firstOfMonth(base) { return new Date(base.getFullYear(), base.getMonth(), 1); }
  function datesBetween(s, e) {
    var arr = [], d = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    var end = new Date(e.getFullYear(), e.getMonth(), e.getDate());
    while (d <= end) { arr.push(fmtDate(d)); d.setDate(d.getDate() + 1); }
    return arr;
  }
  function panoRangeDates() {
    var ref = new Date(); ref.setHours(0, 0, 0, 0);
    var start, end = ref;
    if (ui.panoRange === '7') start = addDays(ref, -6);
    else if (ui.panoRange === '30') start = addDays(ref, -29);
    else if (ui.panoRange === 'month') { start = firstOfMonth(ref); end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0); }
    else if (ui.panoRange === 'year') { start = new Date(ref.getFullYear(), 0, 1); end = new Date(ref.getFullYear(), 11, 31); }
    else {
      var ds = state.records.map(function (r) { return r.date; });
      if (!ds.length) start = addDays(ref, -6);
      else { var min = ds.reduce(function (a, b) { return a < b ? a : b; }); start = parseDate(min); }
    }
    return datesBetween(start, end);
  }

  function buildPano(el, large) {
    if (!el) return;
    el.classList.toggle('pano-grid-lg', !!large);
    var cats = state.categories;
    var dates = panoRangeDates().slice().reverse(); // 最新在上
    if (!dates.length) { el.innerHTML = '<div class="pano-empty">该时间段还没有记录</div>'; el.style.gridTemplateColumns = ''; return; }
    var wdNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    var html = '';
    // 表头
    html += '<div class="wg-cell wg-h wg-sticky-col">日期</div>';
    cats.forEach(function (c) { html += '<div class="wg-cell wg-h">' + esc(c.name) + '</div>'; });
    html += '<div class="wg-cell wg-h">合计</div>';
    // 每日一行（含无记录日）
    dates.forEach(function (d) {
      var recs = state.records.filter(function (r) { return r.date === d; });
      var rowTotal = 0;
      html += '<div class="wg-cell wg-day wg-sticky-col" data-date="' + d + '" data-cat="">' + d.slice(5) + '<br><span class="wg-date">' + wdNames[parseDate(d).getDay()] + '</span></div>';
      cats.forEach(function (c) {
        var m = recs.filter(function (r) { return r.catId === c.id; }).reduce(function (s, r) { return s + r.minutes; }, 0);
        rowTotal += m;
        if (m > 0) html += '<div class="wg-cell has wg-click" data-date="' + d + '" data-cat="' + c.id + '" style="background:' + c.color + '22;color:' + c.color + '">' + m + '</div>';
        else html += '<div class="wg-cell wg-zero" data-date="' + d + '" data-cat="' + c.id + '">·</div>';
      });
      html += '<div class="wg-cell wg-total">' + (rowTotal > 0 ? rowTotal : '·') + '</div>';
    });
    // 合计行
    var catTotals = cats.map(function (c) {
      return dates.reduce(function (s, d) {
        return s + state.records.filter(function (r) { return r.date === d && r.catId === c.id; }).reduce(function (a, r) { return a + r.minutes; }, 0);
      }, 0);
    });
    var grand = catTotals.reduce(function (s, v) { return s + v; }, 0);
    html += '<div class="wg-cell wg-foot wg-sticky-col">合计</div>';
    catTotals.forEach(function (v) { html += '<div class="wg-cell wg-foot">' + (v > 0 ? v : '·') + '</div>'; });
    html += '<div class="wg-cell wg-foot">' + (grand > 0 ? grand : '·') + '</div>';
    el.innerHTML = html;
    if (large) {
      var scale = ui.panoScale || 1;
      // 弹性列：所有大类均分剩余宽度，保证在横屏下覆盖全部列、无需横滑
      el.style.gridTemplateColumns = '100px repeat(' + cats.length + ', minmax(40px, 1fr)) 64px';
      el.style.fontSize = (15 * scale) + 'px';
    } else {
      el.style.gridTemplateColumns = '92px repeat(' + cats.length + ', minmax(72px, 1fr)) 56px';
    }
  }

  function showPanoDetail(date, catId) {
    var recs = state.records.filter(function (r) { return r.date === date && (!catId || r.catId === catId); })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    var c = catId ? findCat(catId) : null;
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    var body;
    if (!recs.length) {
      body = '<p class="modal-empty">' + date + (c ? ' · ' + esc(c.name) : '') + ' 暂无记录</p>';
    } else {
      body = '<ul class="modal-rec-list">' + recs.map(function (r) {
        var cc = findCat(r.catId);
        return '<li class="mr-item">' +
          '<span class="rec-dot" style="background:' + (cc ? cc.color : '#999') + '"></span>' +
          '<div class="mr-main"><div class="mr-title">' + esc(r.content || '') + '</div>' +
          '<div class="mr-meta">' + (cc ? esc(cc.name) : '') + '</div></div>' +
          '<div class="mr-min">' + r.minutes + '分</div></li>';
      }).join('') + '</ul>';
    }
    overlay.innerHTML =
      '<div class="modal-box">' +
      '<div class="modal-title-row"><h3 class="modal-title">' + date + (c ? ' · ' + esc(c.name) : ' · 当日全部') + '</h3>' +
      '<button class="modal-close" id="pdClose" type="button">✕</button></div>' +
      body +
      '<div class="modal-actions"><button type="button" class="btn-primary" id="pdOk">知道了</button></div></div>';
    document.body.appendChild(overlay);
    function close() { if (overlay.parentNode) document.body.removeChild(overlay); }
    overlay.querySelector('#pdClose').addEventListener('click', close);
    overlay.querySelector('#pdOk').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  }

  function sumCard(num, lbl) { return '<div class="sum-card"><div class="sum-num">' + num + '</div><div class="sum-lbl">' + lbl + '</div></div>'; }

  /* ---------------- settings view ---------------- */
  function renderSettings() {
    var root = document.getElementById('view-settings');
    var cats = state.categories.map(function (c) {
      return '<div class="cat-manage">' +
        '<div class="cm-head"><span class="cm-icon" style="background:' + c.color + '">' + c.icon + '</span>' +
        '<input class="cm-name" value="' + esc(c.name) + '" data-rename="' + c.id + '">' +
        '<button class="cm-del" data-delcat="' + c.id + '">删除</button></div></div>';
    }).join('');

    root.innerHTML =
      '<div class="card"><h3 class="section-title">分类管理（大类）</h3>' + cats +
      '<button class="btn-ghost" id="addCat">＋ 新增大类</button></div>' +
      '<div class="card"><h3 class="section-title">数据</h3>' +
      '<button class="btn-ghost" id="exportBtn">导出数据 (JSON)</button>' +
      '<button class="btn-ghost" id="importBtn">导入数据 (JSON)</button>' +
      '<button class="btn-danger" id="resetBtn">清空全部数据</button></div>' +
      '<p class="tip">数据保存在本机浏览器（localStorage）。换设备、清缓存或换浏览器前，请先「导出数据」备份；导入会覆盖当前数据。</p>';

    var renames = root.querySelectorAll('[data-rename]');
    renames.forEach(function (inp) { inp.addEventListener('change', function () { store.op('updateCat', { id: inp.dataset.rename, fields: { name: inp.value.trim() || findCat(inp.dataset.rename).name } }); }); });
    var delcat = root.querySelectorAll('[data-delcat]');
    delcat.forEach(function (b) { b.addEventListener('click', function () { if (confirm('删除该大类及其下所有记录？')) store.op('deleteCat', { id: b.dataset.delcat }); }); });
    root.querySelector('#addCat').addEventListener('click', addCatHandler);
    root.querySelector('#exportBtn').addEventListener('click', exportData);
    root.querySelector('#importBtn').addEventListener('click', importData);
    root.querySelector('#resetBtn').addEventListener('click', function () {
      if (confirm('确定清空所有分类和记录？此操作不可恢复。')) store.op('resetSpace', {});
    });
  }

  function addCatHandler() {
    var name = prompt('新增大类名称：'); if (!name) return;
    var colors = ['#FF6B6B', '#4ECDC4', '#A78BFA', '#FFB703', '#06D6A0', '#EF476F', '#118AB2', '#F78C6B'];
    var icons = ['⭐', '🌟', '🎯', '🚀', '🌈', '💡', '🔥', '🍀'];
    var i = state.categories.length;
    store.op('addCat', { cat: { id: uid(), name: name.trim(), icon: icons[i % icons.length], color: colors[i % colors.length] } });
  }

  function exportData() {
    var blob = new Blob([JSON.stringify({ categories: state.categories, records: state.records }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '成长记录_' + fmtDate(new Date()) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function importData() {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json';
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var d = JSON.parse(rd.result);
          if (d && d.categories) {
            if (confirm('导入将覆盖当前数据，确定？')) {
              store.op('resetSpace', {});
              d.categories.forEach(function (c) { var nc = Object.assign({}, c); delete nc.subs; store.op('addCat', { cat: nc }); });
              (d.records || []).forEach(function (r) { store.op('addRecord', { record: r }); });
              alert('导入成功');
            }
          } else alert('文件格式不正确');
        } catch (e) { alert('解析失败'); }
      };
      rd.readAsText(f);
    };
    inp.click();
  }

  /* ---------------- charts (canvas) ---------------- */
  function setupCanvas(canvas) {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = rect.width || canvas.clientWidth || 300;
    var h = rect.height || 210;
    canvas.width = w * dpr; canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }
  function drawDoughnut(canvas, data) {
    var c = setupCanvas(canvas), ctx = c.ctx, w = c.w, h = c.h;
    var total = data.reduce(function (s, d) { return s + d.value; }, 0);
    if (total <= 0) { ctx.fillStyle = '#b7c0cf'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('暂无数据', w / 2, h / 2); return; }
    var cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 8, ir = r * 0.58;
    var start = -Math.PI / 2;
    data.forEach(function (d) {
      var ang = (d.value / total) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, start, start + ang); ctx.closePath();
      ctx.fillStyle = d.color; ctx.fill(); start += ang;
    });
    ctx.beginPath(); ctx.arc(cx, cy, ir, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.fillStyle = '#2b3442'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 20px sans-serif'; ctx.fillText(total + '分', cx, cy - 6);
    ctx.fillStyle = '#8a94a6'; ctx.font = '11px sans-serif'; ctx.fillText('总时长', cx, cy + 14);
  }
  function drawLegend(el, data) {
    if (!data.length) { el.innerHTML = ''; return; }
    el.innerHTML = data.map(function (d) {
      return '<span class="lg"><i style="background:' + d.color + '"></i>' + esc(d.name) + ' <b>' + d.value + '分</b></span>';
    }).join('');
  }
  function drawBars(canvas, labels, values, color) {
    var c = setupCanvas(canvas), ctx = c.ctx, w = c.w, h = c.h;
    var max = Math.max.apply(null, values.concat([1]));
    var padL = 32, padR = 10, padT = 12, padB = 24, cw = w - padL - padR, ch = h - padT - padB;
    ctx.strokeStyle = '#eef2f8'; ctx.fillStyle = '#9aa4b4'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var i = 0; i <= 4; i++) {
      var y = padT + ch - (i / 4) * ch;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillText(Math.round((i / 4) * max), padL - 5, y);
    }
    if (values.every(function (v) { return v === 0; })) { ctx.fillStyle = '#b7c0cf'; ctx.textAlign = 'center'; ctx.fillText('暂无数据', w / 2, h / 2); return; }
    var n = labels.length;
    var bw = Math.min(38, cw / n * 0.62);
    var gap = (cw - bw * n) / (n + 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    labels.forEach(function (lb, i) {
      var x = padL + gap + (bw + gap) * i;
      var bh = (values[i] / max) * ch; var y = padT + ch - bh;
      ctx.fillStyle = Array.isArray(color) ? color[i] : (color || '#5b8def');
      if (bh > 0) { roundRect(ctx, x, y, bw, bh, 4); ctx.fill(); }
      ctx.fillStyle = '#6b7585'; ctx.fillText(lb, x + bw / 2, padT + ch + 5);
      if (values[i] > 0) { ctx.fillStyle = '#2b3442'; ctx.font = '10px sans-serif'; ctx.fillText(values[i], x + bw / 2, y - 12); ctx.font = '10px sans-serif'; }
    });
  }
  function roundRect(ctx, x, y, w, h, r) {
    if (h < r * 2) r = h / 2; if (w < r * 2) r = w / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawLine(canvas, labels, values) {
    var c = setupCanvas(canvas), ctx = c.ctx, w = c.w, h = c.h;
    var max = Math.max.apply(null, values.concat([1]));
    var padL = 32, padR = 10, padT = 12, padB = 24, cw = w - padL - padR, ch = h - padT - padB;
    ctx.strokeStyle = '#eef2f8'; ctx.fillStyle = '#9aa4b4'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var i = 0; i <= 4; i++) {
      var y = padT + ch - (i / 4) * ch;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillText(Math.round((i / 4) * max), padL - 5, y);
    }
    if (values.every(function (v) { return v === 0; })) { ctx.fillStyle = '#b7c0cf'; ctx.textAlign = 'center'; ctx.fillText('暂无数据', w / 2, h / 2); return; }
    var n = labels.length, stepX = n > 1 ? cw / (n - 1) : 0;
    var pts = values.map(function (v, i) { return { x: padL + (n > 1 ? stepX * i : cw / 2), y: padT + ch - (v / max) * ch }; });
    ctx.beginPath(); ctx.moveTo(pts[0].x, padT + ch);
    pts.forEach(function (p) { ctx.lineTo(p.x, p.y); }); ctx.lineTo(pts[pts.length - 1].x, padT + ch); ctx.closePath();
    var grad = ctx.createLinearGradient(0, padT, 0, padT + ch);
    grad.addColorStop(0, 'rgba(91,141,239,0.28)'); grad.addColorStop(1, 'rgba(91,141,239,0.02)');
    ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.strokeStyle = '#5b8def'; ctx.lineWidth = 2; ctx.stroke();
    pts.forEach(function (p) { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fillStyle = '#5b8def'; ctx.fill(); });
    ctx.fillStyle = '#6b7585'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    labels.forEach(function (lb, i) { ctx.fillText(lb, n > 1 ? padL + stepX * i : cw / 2 + padL, padT + ch + 5); });
  }

  /* ---------------- init ---------------- */
  function init() {
    var tabs = document.querySelectorAll('.tabbar button');
    tabs.forEach(function (b) { b.addEventListener('click', function () { showView(b.dataset.view); }); });
    showView('record');
    store.init(function () {
      if (currentView === 'stats') renderStats();
      else if (currentView === 'record') refreshRecordList();
      else if (currentView === 'settings') renderSettings();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
