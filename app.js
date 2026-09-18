(function () {
  'use strict';

  var DEFAULT_CATS = [
    { id: 'sport', name: '运动', icon: '🏀', color: '#FF6B6B', seq: 1 },
    { id: 'english', name: '英语', icon: '🔤', color: '#4ECDC4', seq: 2 },
    { id: 'poem', name: '古诗', icon: '📜', color: '#A78BFA', seq: 3 },
    { id: 'char', name: '识字', icon: '🔡', color: '#FFB703', seq: 4 },
    { id: 'read', name: '阅读', icon: '📚', color: '#06D6A0', seq: 5 },
    { id: 'vocal', name: '声乐', icon: '🎵', color: '#EF476F', seq: 6 },
    { id: 'speech', name: '口才', icon: '🎤', color: '#118AB2', seq: 7 }
  ];

  /* 分类可选图标库（24 个互不相同，适合启蒙学习场景） */
  var ICON_LIBRARY = ['🏀', '🔤', '📜', '🔡', '📚', '🎵', '🎤', '⭐', '🌟', '🎯', '🚀', '🌈',
                     '💡', '🔥', '🍀', '🧩', '🎨', '🏆', '🌱', '🦄', '🍎', '⚽', '🎹', '🐝'];
  /* 新增大类时的默认配色（与图标数量匹配，避免循环重复） */
  var CAT_COLORS = ['#FF6B6B', '#4ECDC4', '#A78BFA', '#FFB703', '#06D6A0', '#EF476F', '#118AB2', '#F78C6B',
                   '#9B5DE5', '#00BBF9', '#F15BB5', '#FEE440', '#2EC4B6', '#E71D36', '#8338EC', '#3A86FF',
                   '#FB5607', '#FF006E', '#06A77D', '#C77DFF', '#FCA311', '#43AA8B', '#7209B7', '#FFD166'];

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
  var settingsPage = 'main';
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
  /* 按序号( seq )升序返回分类副本；序号相同则保持原数组顺序（稳定排序） */
  function sortedCats() {
    return state.categories.slice().sort(function (a, b) {
      var sa = (typeof a.seq === 'number') ? a.seq : 9999;
      var sb = (typeof b.seq === 'number') ? b.seq : 9999;
      return sa - sb;
    });
  }

  /* 图表命中检测（点击柱状用） */
  var barHitData = [];
  var chartData = null;

  /* 主题：根据系统深色模式选择图表配色，并显式填充背景，保证夜间模式可读 */
  function isDark() { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
  function chartTheme() {
    if (isDark()) return {
      bg: '#182135', text: '#eaf0fb', muted: '#9aa6bd', grid: 'rgba(255,255,255,0.10)',
      label: '#c7d2e6', value: '#f2f6fd', line: '#7aa2ff',
      lfTop: 'rgba(122,162,255,0.30)', lfBot: 'rgba(122,162,255,0.02)'
    };
    return {
      bg: '#ffffff', text: '#2b3442', muted: '#9aa4b4', grid: '#eef2f8',
      label: '#6b7585', value: '#2b3442', line: '#5b8def',
      lfTop: 'rgba(91,141,239,0.28)', lfBot: 'rgba(91,141,239,0.02)'
    };
  }

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
    /* 拖动排序直接写入序号(seq)，让首页图标顺序与「分类管理」里的序号保持一致 */
    var seqs = [];
    container.querySelectorAll('.chip').forEach(function (c, i) { seqs.push({ id: c.dataset.cat, seq: i + 1 }); });
    store.op('setSeqs', { seqs: seqs });
  }

  /* ---------------- local store (无云端) ---------------- */
  function createLocalStore() {
    var KEY = 'ks_state_v1';
    var cache = load();
    var onChange = null;

    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    /* 为缺失序号的旧数据按当前顺序补上 seq（1..N），并在有变化时落盘 */
    function ensureSeq(cats) {
      var changed = false;
      cats.forEach(function (c, i) {
        if (typeof c.seq !== 'number' || isNaN(c.seq)) { c.seq = i + 1; changed = true; }
      });
      return changed;
    }
    function load() {
      try {
        var raw = localStorage.getItem(KEY);
        if (raw) { var d = JSON.parse(raw); if (d && d.categories) { var ch = ensureSeq(d.categories); if (ch) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} } return d; } }
      } catch (e) {}
      return { categories: clone(DEFAULT_CATS), records: [] };
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) {} }
    function silentSave() { save(); }

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
        case 'setSeqs': {
          var sm = {};
          (payload.seqs || []).forEach(function (s) { sm[s.id] = s.seq; });
          cache.categories.forEach(function (c) { if (sm.hasOwnProperty(c.id)) c.seq = sm[c.id]; });
          break;
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

    return { getState: getState, getSpace: getSpace, getShareLink: getShareLink, op: op, init: init, setStatus: setStatus, silentSave: silentSave };
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
    else if (v === 'settings') { settingsPage = 'main'; renderSettings(); }
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
        '<div class="rec-time">' + r.minutes + ' min</div>' +
        '<div class="rec-actions">' +
        '<button class="rec-edit" data-edit="' + r.id + '" title="编辑">✎</button>' +
        '<button class="rec-del" data-del="' + r.id + '" title="删除">✕</button>' +
        '</div></li>';
    }).join('');
  }

  /* 首页看板：今日总时长 / 本周总时长 / 连续打卡天数 */
  function computeStreak() {
    var has = {};
    state.records.forEach(function (r) { has[r.date] = true; });
    var d = new Date();
    var today = fmtDate(d);
    var y = new Date(d); y.setDate(d.getDate() - 1); var yest = fmtDate(y);
    var anchor;
    if (has[today]) anchor = d;
    else if (has[yest]) anchor = y; // 今天还没记但昨天记了，连续未断
    else return 0;
    var streak = 0, cur = new Date(anchor);
    while (has[fmtDate(cur)]) { streak++; cur.setDate(cur.getDate() - 1); }
    return streak;
  }
  function dashboardHTML() {
    var today = fmtDate(new Date());
    var week = weekDays(today);
    var todayTotal = state.records.filter(function (r) { return r.date === today; }).reduce(function (s, r) { return s + r.minutes; }, 0);
    var weekTotal = state.records.filter(function (r) { return week.indexOf(r.date) >= 0; }).reduce(function (s, r) { return s + r.minutes; }, 0);
    var streak = computeStreak();
    return '<div class="dash-card"><div class="dash-num">' + todayTotal + '</div><div class="dash-lbl">今日(min)</div></div>' +
      '<div class="dash-card"><div class="dash-num">' + weekTotal + '</div><div class="dash-lbl">本周(min)</div></div>' +
      '<div class="dash-card"><div class="dash-num">' + streak + '</div><div class="dash-lbl">连续(天)</div></div>';
  }
  function renderDashboard() {
    var el = document.getElementById('dash');
    if (el) el.innerHTML = dashboardHTML();
  }

  function renderRecord() {
    var root = document.getElementById('view-record');
    var cats = sortedCats();
    if (!ui.catId && cats.length) ui.catId = cats[0].id;

    var chips = cats.map(function (c) {
      return '<button class="chip ' + (c.id === ui.catId ? 'active' : '') + '" data-cat="' + c.id + '" style="--c:' + c.color + '">' + c.icon + ' ' + esc(c.name) + '</button>';
    }).join('');

    root.innerHTML =
      '<div class="dash" id="dash">' + dashboardHTML() + '</div>' +
      '<div class="card">' +
      '<label class="lbl">日期</label>' +
      '<input type="date" id="recDate" value="' + ui.recDate + '">' +
      '<label class="lbl">大类</label>' +
      '<div class="chips">' + chips + '</div>' +
      '<div id="recRows" class="rec-rows"></div>' +
      '<button type="button" class="btn-add-row" id="addRow">＋ 新增事项</button>' +
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
      /* 阻止长按弹出的「全选/复制」菜单拦截拖动 */
      chipsEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      chipsEl.querySelectorAll('.chip').forEach(function (chip) {
        var pressTimer = null, longFired = false, startX = 0, startY = 0;
        chip.addEventListener('pointerdown', function (e) {
          if (e.button && e.button !== 0) return;
          startX = e.clientX; startY = e.clientY; longFired = false;
          pressTimer = setTimeout(function () {
            longFired = true;
            if (window.getSelection) { try { window.getSelection().removeAllRanges(); } catch (_) {} }
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
    root.querySelector('#recSave').addEventListener('click', saveRecord);
    var addBtn = root.querySelector('#addRow');
    if (addBtn) addBtn.addEventListener('click', function () { ui.rows.push({ content: '', minutes: '' }); renderRows(ui.rows.length - 1); });
    bindListButtons();
    var dp = root.querySelector('#dayPrev'); if (dp) dp.addEventListener('click', function () { navigateDay(-1); });
    var dn = root.querySelector('#dayNext'); if (dn) dn.addEventListener('click', function () { navigateDay(1); });
    renderRows();
  }

  function renderRows(focusIdx) {
    var box = document.getElementById('recRows');
    if (!box) return;
    if (!ui.rows.length) ui.rows = [{ content: '', minutes: '' }];
    box.innerHTML = ui.rows.map(function (row, i) {
      var showDel = ui.rows.length > 1;
      return '<div class="rec-row">' +
        '<div class="ri-field"><label class="ri-lbl">事项</label>' +
        '<textarea class="ri-content" data-row="' + i + '" rows="1" placeholder="如：跳绳100个">' + esc(row.content) + '</textarea></div>' +
        '<div class="ri-field ri-min"><label class="ri-lbl">min</label>' +
        '<input type="number" class="ri-minutes" data-row="' + i + '" min="1" placeholder="如 20" value="' + esc(row.minutes) + '"></div>' +
        (showDel ? '<button type="button" class="ri-del" data-delrow="' + i + '">✕</button>' : '') +
        '</div>';
    }).join('');
    box.querySelectorAll('.ri-content').forEach(function (inp) {
      inp.addEventListener('input', function () { ui.rows[+inp.dataset.row].content = inp.value; autoGrow(inp); });
    });
    box.querySelectorAll('.ri-minutes').forEach(function (inp) {
      inp.addEventListener('input', function () { ui.rows[+inp.dataset.row].minutes = inp.value; });
    });
    box.querySelectorAll('.ri-del').forEach(function (b) {
      b.addEventListener('click', function () { ui.rows.splice(+b.dataset.delrow, 1); renderRows(); });
    });
    /* 渲染后按内容自适应高度（默认单行，输入换行/超出时再撑高） */
    box.querySelectorAll('.ri-content').forEach(function (inp) { autoGrow(inp); });
    if (focusIdx != null && focusIdx >= 0) {
      var fEl = box.querySelector('.ri-content[data-row="' + focusIdx + '"]');
      if (fEl) { fEl.focus(); var len = fEl.value.length; try { fEl.setSelectionRange(len, len); } catch (e) {} }
    }
  }
  /* 文本框随内容增长高度：默认只有一行，输入换行/文字变长才变高（不再自动冒出空行） */
  function autoGrow(el) {
    el.style.height = 'auto';
    var max = 68; /* 最多两行高度 */
    el.style.height = Math.min(el.scrollHeight, max) + 'px';
  }

  function navigateDay(delta) {
    var d = parseDate(ui.recDate);
    d.setDate(d.getDate() + delta);
    ui.recDate = fmtDate(d);
    var inp = document.getElementById('recDate');
    if (inp) inp.value = ui.recDate;
    refreshRecordList();
  }

  /* 绑定记录列表里的编辑/删除按钮。每次列表 innerHTML 被重建后都必须重新调用，
     否则会出现「首次进入页面编辑按钮无反应」的问题（store.init 回调用 refreshRecordList 重建了列表）。 */
  function bindListButtons() {
    var root = document.getElementById('view-record');
    if (!root) return;
    root.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (confirm('确定删除这条记录吗？删除后不可恢复。')) store.op('deleteRecord', { id: b.dataset.del });
      });
    });
    root.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openEditModal(b.dataset.edit); });
    });
  }

  function refreshRecordList() {
    var list = document.getElementById('recList');
    var title = document.getElementById('recDateTitle');
    if (list) list.innerHTML = buildRecordListHTML();
    if (title) title.textContent = ui.recDate + ' 的记录';
    bindListButtons();
    renderDashboard();
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
      return '<button type="button" class="chip ' + (c.id === r.catId ? 'active' : '') + '" data-cat="' + c.id + '" style="--c:' + c.color + '">' + esc(c.name) + '</button>';
    }).join('');
    overlay.innerHTML =
      '<div class="modal-box">' +
      '<h3 class="modal-title">编辑记录</h3>' +
      '<label class="lbl">分类</label>' +
      '<div class="chips" id="editCats">' + catChips + '</div>' +
      '<label class="lbl">事项</label>' +
      '<textarea id="editContent" class="modal-input modal-textarea" rows="1" placeholder="如：跳绳100个">' + esc(r.content || '') + '</textarea>' +
      '<label class="lbl">min</label>' +
      '<input type="number" id="editMinutes" class="modal-input" min="1" value="' + esc(r.minutes) + '" placeholder="如 20">' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn-ghost" id="editCancel">取消</button>' +
      '<button type="button" class="btn-primary" id="editSave">保存</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    var selCat = r.catId;
    var contentEl = overlay.querySelector('#editContent');
    contentEl.focus();
    autoGrow(contentEl);
    contentEl.addEventListener('input', function () { autoGrow(contentEl); });
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
      return { id: c.id, name: c.name, value: m, color: c.color, icon: c.icon };
    }).filter(function (x) { return x.value > 0; });
    byCat = distinctColors(byCat);
    byCat.sort(function (a, b) { return b.value - a.value; });

    var byDayLabels = dates.map(function (d) {
      if (ui.statsRange === 'week') { var wd = ['一', '二', '三', '四', '五', '六', '日']; return '周' + wd[(parseDate(d).getDay() + 6) % 7]; }
      var p = parseDate(d); return (p.getMonth() + 1) + '/' + p.getDate();
    });
    var byDayVals = dates.map(function (d) { return recs.filter(function (r) { return r.date === d; }).reduce(function (s, r) { return s + r.minutes; }, 0); });

    /* 月视图横轴只标 1日/8日/15日/23日/最后1日，避免 30 天日期挤成一团乱码 */
    var labelShow = null;
    if (ui.statsRange === 'month') {
      labelShow = dates.map(function (d, i) {
        var dom = parseDate(d).getDate();
        return dom === 1 || dom === 8 || dom === 15 || dom === 23 || i === dates.length - 1;
      });
    }

    var single = dates.length === 1;
    var barLabels, barVals, barColors, barDates, barCats;
    if (single) {
      barLabels = byCat.map(function (x) { return x.name; });
      barVals = byCat.map(function (x) { return x.value; });
      barColors = byCat.map(function (x) { return x.color; });
      barDates = byCat.map(function () { return ui.statsDate; });
      barCats = byCat.map(function (x) { return x.id; });
    } else {
      barLabels = byDayLabels;
      barVals = byDayVals;
      barColors = dates.map(function () { return '#5b8def'; });
      barDates = dates.slice();
      barCats = dates.map(function () { return null; });
    }

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
      sumCard(totalMin, '总时长(min)') + sumCard(recs.length, '记录数') + sumCard(catKeys.length, '涉及分类') + sumCard(dayKeys.length, '天数') +
      '</div>' +
      '<div class="card"><h3 class="section-title">' + (single ? '当日分类占比' : '分类占比') + '</h3>' +
      '<div id="catTableBox"></div></div>' +
      '<div class="card"><h3 class="section-title">' + (single ? '当日各分类时长' : '每日时长') + '</h3>' +
      '<div class="zoom-bar" id="zoomBar" hidden><span>已放大 · 双指缩放 / 拖动</span><button type="button" class="zoom-reset" id="zoomReset">查看全部</button></div>' +
      '<canvas id="chartBar" class="chart"></canvas></div>' +
      '<div class="card"><div class="pano-head"><h3 class="section-title">全景图</h3>' +
      '<div class="pano-head-right">' +
      '<select id="panoRange" class="pano-select">' +
      '<option value="all">全部</option>' +
      '<option value="7">近7天</option>' +
      '<option value="30">近30天</option>' +
      '<option value="month">本月</option>' +
      '<option value="year">今年</option>' +
      '</select>' +
      '<button class="pano-zoom" id="panoZoom" type="button" title="横屏查看表格"><svg class="rot-ico" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 L19 5"/><polyline points="9 19 5 19 5 15"/><polyline points="15 5 19 5 19 9"/></svg> 横屏</button>' +
      '</div></div>' +
      '<p class="tip" style="padding:2px 2px 8px">点格子看当日明细 · 单位：min</p>' +
      '<div class="pano-scroll"><div class="pano-grid" id="panoGrid"></div></div>' +
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
          '<p class="tip pano-modal-tip">点格子看明细 · 单位：min</p>' +
          '<div class="pano-modal-scroll"><div class="pano-grid pano-grid-lg" id="panoModalGrid"></div></div>' +
        '</div>' +
      '</div></div>';

    var rtabs = root.querySelectorAll('[data-r]');
    rtabs.forEach(function (b) { b.addEventListener('click', function () { ui.statsRange = b.dataset.r; renderStats(); }); });
    root.querySelector('#statsDate').addEventListener('change', function (e) { ui.statsDate = e.target.value; renderStats(); });

    renderCatTable(document.getElementById('catTableBox'), byCat, { single: single, date: single ? ui.statsDate : null });
    ui.zoom = null;
    chartData = { fullLen: dates.length, dates: dates, byDayLabels: byDayLabels, byDayVals: byDayVals, barLabels: barLabels, barVals: barVals, barColors: barColors, barDates: barDates, barCats: barCats, labelShow: labelShow };
    var vChart = sliceView(dates, byDayLabels, byDayVals, barLabels, barVals, barColors, barDates, barCats, labelShow);
    drawBars(document.getElementById('chartBar'), vChart.barLabels, vChart.barVals, vChart.barColors, vChart.barDates, vChart.barCats, vChart.labelShow);
    var canvasBar = document.getElementById('chartBar');
    if (canvasBar) canvasBar.addEventListener('click', function (e) {
      if (!barHitData.length) return;
      var r = canvasBar.getBoundingClientRect(); var px = e.clientX - r.left;
      var hit = null;
      for (var i = 0; i < barHitData.length; i++) { var b = barHitData[i]; if (px >= b.x - 4 && px <= b.x + b.w + 4) { hit = b; break; } }
      if (hit && hit.date) showDayBreakdown(hit.date, hit.cat);
    });
    attachChartZoom(canvasBar);
    var zr = root.querySelector('#zoomReset');
    if (zr) zr.addEventListener('click', function () { ui.zoom = null; redrawStatsCharts(); });
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
        tryLandscape(pmo);
        var pmc = document.getElementById('panoModalClose');
        if (pmc) pmc.onclick = function () { exitLandscape(); pmo.hidden = true; };
        pmo.onclick = function (e) { if (e.target === pmo) { exitLandscape(); pmo.hidden = true; } };
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

  function buildPano(el, large, opts) {
    if (!el) return;
    el.classList.toggle('pano-grid-lg', !!large);
    var cats = ((opts && opts.categories) ? opts.categories : state.categories).slice().sort(function (a, b) {
      var sa = (typeof a.seq === 'number') ? a.seq : 9999;
      var sb = (typeof b.seq === 'number') ? b.seq : 9999;
      return sa - sb;
    });
    var data = (opts && opts.records) ? opts.records : state.records;
    var rawDates = (opts && opts.dates) ? opts.dates : panoRangeDates();
    var dates = rawDates.slice().reverse(); // 最新在上
    if (!dates.length) { el.innerHTML = '<div class="pano-empty">该时间段还没有记录</div>'; el.style.gridTemplateColumns = ''; return; }
    var wdNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    var html = '';
    // 表头
    html += '<div class="wg-cell wg-h wg-sticky-col">日期</div>';
    cats.forEach(function (c) { html += '<div class="wg-cell wg-h">' + esc(c.name) + '</div>'; });
    html += '<div class="wg-cell wg-h">合计</div>';
    // 每日一行（含无记录日）
    dates.forEach(function (d) {
      var dayRecs = data.filter(function (r) { return r.date === d; });
      var rowTotal = 0;
      html += '<div class="wg-cell wg-day wg-sticky-col" data-date="' + d + '" data-cat="">' + d.slice(5) + ' ' + wdNames[parseDate(d).getDay()] + '</div>';
      cats.forEach(function (c) {
        var m = dayRecs.filter(function (r) { return r.catId === c.id; }).reduce(function (s, r) { return s + r.minutes; }, 0);
        rowTotal += m;
        if (m > 0) html += '<div class="wg-cell has wg-click" data-date="' + d + '" data-cat="' + c.id + '" style="background:' + c.color + '22;color:' + c.color + '">' + m + '</div>';
        else html += '<div class="wg-cell wg-zero" data-date="' + d + '" data-cat="' + c.id + '">·</div>';
      });
      html += '<div class="wg-cell wg-total">' + (rowTotal > 0 ? rowTotal : '·') + '</div>';
    });
    // 合计行
    var catTotals = cats.map(function (c) {
      return dates.reduce(function (s, d) {
        return s + data.filter(function (r) { return r.date === d && r.catId === c.id; }).reduce(function (a, r) { return a + r.minutes; }, 0);
      }, 0);
    });
    var grand = catTotals.reduce(function (s, v) { return s + v; }, 0);
    html += '<div class="wg-cell wg-foot wg-sticky-col">合计</div>';
    catTotals.forEach(function (v) { html += '<div class="wg-cell wg-foot">' + (v > 0 ? v : '·') + '</div>'; });
    html += '<div class="wg-cell wg-foot">' + (grand > 0 ? grand : '·') + '</div>';
    el.innerHTML = html;
    if (large) {
      var scale = ui.panoScale || 1;
      // 弹性列：所有大类均分剩余宽度；缩放时列宽与字号同步变化
      el.style.gridTemplateColumns = (100 * scale) + 'px repeat(' + cats.length + ', minmax(' + Math.round(54 * scale) + 'px, 1fr)) ' + Math.round(64 * scale) + 'px';
      el.style.fontSize = (15 * scale) + 'px';
    } else {
      el.style.gridTemplateColumns = '92px repeat(' + cats.length + ', minmax(72px, 1fr)) 56px';
    }
  }

  function showPanoDetail(date, catId, recsOverride) {
    var recs = (recsOverride || state.records).filter(function (r) { return r.date === date && (!catId || r.catId === catId); })
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
          '<div class="mr-min">' + r.minutes + ' min</div></li>';
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

  /* 关键字「记录图」：只展示匹配关键字的记录在各日期 / 各分类下的分布（类似全景图） */
  function showKeywordChart(keyword) {
    var kw = (keyword || '').trim().toLowerCase();
    if (!kw) { alert('请先在上方输入关键字'); return; }
    var matched = state.records.filter(function (r) {
      var c = findCat(r.catId);
      return (r.content || '').toLowerCase().indexOf(kw) >= 0 || (c && c.name.toLowerCase().indexOf(kw) >= 0);
    });
    if (!matched.length) { alert('未找到匹配「' + keyword + '」的记录'); return; }
    var ds = matched.map(function (r) { return r.date; }).sort();
    var dates = datesBetween(parseDate(ds[0]), parseDate(ds[ds.length - 1]));
    var usedMap = {};
    matched.forEach(function (r) { usedMap[r.catId] = true; });
    var usedCats = state.categories.filter(function (c) { return usedMap[c.id]; });
    var total = matched.reduce(function (s, r) { return s + r.minutes; }, 0);
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal-box kw-chart-box">' +
      '<div class="modal-title-row"><h3 class="modal-title">「' + esc(keyword) + '」记录分布 · 共 ' + total + ' min</h3>' +
      '<button class="modal-close" id="kwClose" type="button" title="关闭">✕</button></div>' +
      '<p class="tip" style="padding:0 2px 8px">点格子看该日匹配明细 · 单位：min</p>' +
      '<div class="pano-scroll"><div class="pano-grid" id="kwGrid"></div></div></div>';
    document.body.appendChild(overlay);
    var grid = overlay.querySelector('#kwGrid');
    buildPano(grid, false, { records: matched, dates: dates, categories: usedCats });
    grid.onclick = function (e) {
      var cell = e.target.closest('[data-date]');
      if (cell) showPanoDetail(cell.dataset.date, cell.dataset.cat || '', matched);
    };
    function close() { if (overlay.parentNode) document.body.removeChild(overlay); }
    overlay.querySelector('#kwClose').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  }

  /* 横屏显示：尽量全屏 + 方向锁定（不支持时退化为自适应宽表格） */
  function tryLandscape(modalEl) {
    try {
      var el = modalEl || document.getElementById('panoModal');
      if (el && el.requestFullscreen) el.requestFullscreen().catch(function () {});
      if (window.screen && screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(function () {});
      }
    } catch (e) {}
  }
  function exitLandscape() {
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {}); } catch (e) {}
    try { if (window.screen && screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
  }

  /* 点击柱状/折线：显示某日各分类学习时长明细（按大类分组：大类名+总时长 → 横线 → 具体事项） */
  function showDayBreakdown(date, catId) {
    var recs = state.records.filter(function (r) { return r.date === date && (!catId || r.catId === catId); });
    var c = catId ? findCat(catId) : null;
    var groups = {};
    recs.forEach(function (r) { (groups[r.catId] = groups[r.catId] || []).push(r); });
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    var groupHtml = '';
    state.categories.forEach(function (cat) {
      if (catId && cat.id !== catId) return;
      var grp = (groups[cat.id] || []).slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      if (!grp.length) return;
      var gTotal = grp.reduce(function (s, r) { return s + r.minutes; }, 0);
      var items = grp.map(function (r) {
        return '<li class="mr-item">' +
          '<div class="mr-main"><div class="mr-title">' + esc(r.content || '') + '</div></div>' +
          '<div class="mr-min">' + r.minutes + ' min</div></li>';
      }).join('');
      groupHtml += '<div class="bd-group">' +
        '<div class="bd-group-head"><span class="bd-dot" style="background:' + cat.color + '"></span>' + esc(cat.name) + '<b>' + gTotal + ' min</b></div>' +
        '<div class="bd-rule"></div>' +
        '<ul class="bd-items">' + items + '</ul>' +
        '</div>';
    });
    if (!groupHtml) groupHtml = '<p class="modal-empty">' + date + (c ? ' · ' + esc(c.name) : '') + ' 暂无记录</p>';
    overlay.innerHTML =
      '<div class="modal-box">' +
      '<div class="modal-title-row"><h3 class="modal-title">' + date + (c ? ' · ' + esc(c.name) : ' · 当日明细') + '</h3>' +
      '<button class="modal-close" id="bdClose" type="button">✕</button></div>' +
      groupHtml +
      '<div class="modal-actions"><button type="button" class="btn-primary" id="bdOk">知道了</button></div></div>';
    document.body.appendChild(overlay);
    function close() { if (overlay.parentNode) document.body.removeChild(overlay); }
    overlay.querySelector('#bdClose').addEventListener('click', close);
    overlay.querySelector('#bdOk').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  }

  function sumCard(num, lbl) { return '<div class="sum-card"><div class="sum-num">' + num + '</div><div class="sum-lbl">' + lbl + '</div></div>'; }

  /* ---------------- settings view ---------------- */
  function renderSettings() {
    var root = document.getElementById('view-settings');
    if (settingsPage === 'cats') { renderCatManage(root); return; }

    root.innerHTML =
      '<div class="card">' +
      '<div class="search-row">' +
      '<input type="text" id="searchInput" class="modal-input" placeholder="输入关键字，如：跳绳 / 英语" style="margin:0">' +
      '<button class="btn-primary" id="genChartBtn" type="button" style="margin:0; width:auto; padding:12px 16px; white-space:nowrap">生成记录图</button>' +
      '</div>' +
      '<div id="searchResults" class="search-results"></div></div>' +
      '<button class="btn-primary" id="openCatManage" type="button">分类管理</button>' +
      '<div class="card"><h3 class="section-title">数据</h3>' +
      '<button class="btn-ghost" id="exportBtn">导出数据 (JSON)</button>' +
      '<button class="btn-ghost" id="importBtn">导入数据 (JSON)</button>' +
      '<button class="btn-danger" id="resetBtn">清空全部数据</button></div>' +
      '<p class="tip">数据保存在本机浏览器（localStorage）。换设备、清缓存或换浏览器前，请先「导出数据」备份；导入会覆盖当前数据。</p>';

    root.querySelector('#openCatManage').addEventListener('click', function () { settingsPage = 'cats'; renderSettings(); });
    root.querySelector('#exportBtn').addEventListener('click', exportData);
    root.querySelector('#importBtn').addEventListener('click', importData);
    root.querySelector('#resetBtn').addEventListener('click', function () {
      if (confirm('确定清空所有分类和记录？此操作不可恢复。')) store.op('resetSpace', {});
    });

    /* 搜索：输入关键字列出所有相关记录，并可生成「记录图」分布表 */
    var sInp = root.querySelector('#searchInput');
    var sRes = root.querySelector('#searchResults');
    function doSearch() {
      var kw = (sInp.value || '').trim().toLowerCase();
      if (!kw) { sRes.innerHTML = ''; return; }
      var matched = state.records.filter(function (r) {
        var c = findCat(r.catId);
        return (r.content || '').toLowerCase().indexOf(kw) >= 0 || (c && c.name.toLowerCase().indexOf(kw) >= 0);
      }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      if (!matched.length) { sRes.innerHTML = '<p class="modal-empty">未找到匹配「' + esc(sInp.value) + '」的记录</p>'; return; }
      sRes.innerHTML = '<ul class="modal-rec-list">' + matched.map(function (r) {
        var cc = findCat(r.catId);
        return '<li class="mr-item" data-edit="' + r.id + '" style="cursor:pointer">' +
          '<span class="rec-dot" style="background:' + (cc ? cc.color : '#999') + '"></span>' +
          '<div class="mr-main"><div class="mr-title">' + esc(r.content || '') + '</div>' +
          '<div class="mr-meta">' + (cc ? esc(cc.name) : '') + ' · ' + r.date + '</div></div>' +
          '<div class="mr-min">' + r.minutes + ' min</div></li>';
      }).join('') + '</ul>';
      sRes.querySelectorAll('[data-edit]').forEach(function (b) {
        b.addEventListener('click', function () { openEditModal(b.dataset.edit); });
      });
    }
    if (sInp) sInp.addEventListener('input', doSearch);
    var genBtn = root.querySelector('#genChartBtn');
    if (genBtn) genBtn.addEventListener('click', function () { showKeywordChart(sInp ? sInp.value : ''); });
  }

  /* 分类管理子页：编辑 / 删除 / 新增，支持返回 */
  function renderCatManage(root) {
    var cats = sortedCats();
    var catsHtml = cats.map(function (c) {
      return '<div class="cat-manage">' +
        '<div class="cm-row">' +
        '<span class="cm-icon cm-pickicon" style="background:' + c.color + '" data-pickicon="' + c.id + '" title="点击更换图标">' + c.icon + '</span>' +
        '<span class="cm-name">' + esc(c.name) + '</span>' +
        '<div class="cm-seq"><label>序号</label>' +
        '<input type="number" class="cm-seq-input" data-seqcat="' + c.id + '" value="' + (typeof c.seq === 'number' ? c.seq : '') + '" min="1" placeholder="序号"></div>' +
        '<div class="cm-actions">' +
        '<button class="cm-edit" data-editcat="' + c.id + '" type="button">编辑</button>' +
        '<button class="cm-del" data-delcat="' + c.id + '" type="button">删除</button></div>' +
        '</div></div>';
    }).join('');
    root.innerHTML =
      '<div class="cat-manage-head">' +
      '<button class="btn-ghost cat-back" id="catBack" type="button">‹ 返回</button>' +
      '<h3 class="section-title" style="margin:0; text-align:center; flex:1 1 auto">分类管理</h3>' +
      '<button class="btn-primary cat-add" id="addCat" type="button" style="margin:0; width:auto; padding:8px 14px; white-space:nowrap">＋ 新增</button></div>' +
      '<div class="card cat-list">' + (catsHtml || '<p class="modal-empty">还没有大类</p>') + '</div>';
    root.querySelector('#catBack').addEventListener('click', function () { settingsPage = 'main'; renderSettings(); });
    root.querySelector('#addCat').addEventListener('click', addCatHandler);

    /* 序号输入：直接改内存并静默落盘（不触发整页重渲染，避免输入时丢焦点）；实时标红重复序号 */
    function refreshSeqConflicts() {
      var inputs = root.querySelectorAll('.cm-seq-input');
      var byVal = {};
      inputs.forEach(function (inp) {
        inp.classList.remove('seq-conflict');
        var v = (inp.value || '').trim();
        if (v === '' || isNaN(+v)) return;
        (byVal[v] = byVal[v] || []).push(inp);
      });
      Object.keys(byVal).forEach(function (v) {
        if (byVal[v].length > 1) byVal[v].forEach(function (inp) { inp.classList.add('seq-conflict'); });
      });
    }
    root.querySelectorAll('.cm-seq-input').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var raw = (inp.value || '').trim();
        var id = inp.dataset.seqcat;
        var cat = findCat(id); if (!cat) return;
        if (raw === '' || isNaN(+raw)) { cat.seq = null; }
        else { cat.seq = parseInt(raw, 10); }
        store.silentSave();           // 持久化但不重渲染，保持输入焦点
        refreshSeqConflicts();
      });
    });
    refreshSeqConflicts();

    root.querySelectorAll('[data-delcat]').forEach(function (b) {
      b.addEventListener('click', function () { if (confirm('删除该大类及其下所有记录？')) store.op('deleteCat', { id: b.dataset.delcat }); });
    });
    root.querySelectorAll('[data-editcat]').forEach(function (b) {
      b.addEventListener('click', function () { openCatEditModal(b.dataset.editcat); });
    });
    root.querySelectorAll('[data-pickicon]').forEach(function (b) {
      b.addEventListener('click', function () { openIconPicker(b.dataset.pickicon); });
    });
  }

  /* 点击分类管理里的图标，直接弹出图标选择浮层，选完即改 */
  function openIconPicker(catId) {
    var c = findCat(catId); if (!c) return;
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal-box icon-pick-pop">' +
      '<h3 class="modal-title">选择图标</h3>' +
      '<div class="icon-pick" id="pickIcons">' +
      ICON_LIBRARY.map(function (ic) { return '<button type="button" class="ip' + (ic === c.icon ? ' active' : '') + '" data-ic="' + ic + '">' + ic + '</button>'; }).join('') +
      '</div>' +
      '<div class="modal-actions"><button type="button" class="btn-ghost" id="pickCancel">取消</button></div></div>';
    document.body.appendChild(overlay);
    function close() { if (overlay.parentNode) document.body.removeChild(overlay); }
    overlay.querySelectorAll('#pickIcons .ip').forEach(function (b) {
      b.addEventListener('click', function () { store.op('updateCat', { id: catId, fields: { icon: b.dataset.ic } }); close(); });
    });
    overlay.querySelector('#pickCancel').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  }

  function openCatEditModal(id) {
    var c = findCat(id); if (!c) return;
    var iconOpts = ICON_LIBRARY;
    var colorOpts = CAT_COLORS;
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal-box cat-edit-box">' +
      '<h3 class="modal-title">编辑大类</h3>' +
      '<label class="lbl">名称</label>' +
      '<input type="text" id="catName" class="modal-input" value="' + esc(c.name) + '" placeholder="如：运动">' +
      '<label class="lbl">序号（首页按序号从小到大排列，相同序号会冲突）</label>' +
      '<input type="number" id="catSeq" class="modal-input" value="' + (typeof c.seq === 'number' ? c.seq : '') + '" min="1" placeholder="如 1">' +
      '<label class="lbl">图标</label><div class="icon-pick" id="catIcons">' +
      iconOpts.map(function (ic) { return '<button type="button" class="ip' + (ic === c.icon ? ' active' : '') + '" data-ic="' + ic + '">' + ic + '</button>'; }).join('') +
      '</div>' +
      '<label class="lbl">颜色</label><div class="color-pick" id="catColors">' +
      colorOpts.map(function (col) { return '<button type="button" class="cp' + (col === c.color ? ' active' : '') + '" data-col="' + col + '" style="background:' + col + '"></button>'; }).join('') +
      '</div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn-ghost" id="catCancel">取消</button>' +
      '<button type="button" class="btn-primary" id="catSave">保存</button></div></div>';
    document.body.appendChild(overlay);
    var selIcon = c.icon, selColor = c.color;
    overlay.querySelectorAll('#catIcons .ip').forEach(function (b) {
      b.addEventListener('click', function () { selIcon = b.dataset.ic; overlay.querySelectorAll('#catIcons .ip').forEach(function (x) { x.classList.toggle('active', x === b); }); });
    });
    overlay.querySelectorAll('#catColors .cp').forEach(function (b) {
      b.addEventListener('click', function () { selColor = b.dataset.col; overlay.querySelectorAll('#catColors .cp').forEach(function (x) { x.classList.toggle('active', x === b); }); });
    });
    function close() { if (overlay.parentNode) document.body.removeChild(overlay); }
    overlay.querySelector('#catCancel').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('#catSave').addEventListener('click', function () {
      var nm = (overlay.querySelector('#catName').value || '').trim();
      if (!nm) { alert('名称必填'); return; }
      var seqRaw = (overlay.querySelector('#catSeq').value || '').trim();
      var seqVal = null;
      if (seqRaw !== '') {
        seqVal = parseInt(seqRaw, 10);
        if (isNaN(seqVal) || seqVal < 1) { alert('序号需为大于 0 的整数'); return; }
        /* 与其他分类的重号检查（允许与自身相同） */
        var dup = state.categories.filter(function (x) { return x.id !== id && x.seq === seqVal; });
        if (dup.length) { alert('序号 ' + seqVal + ' 与「' + dup[0].name + '」冲突，请换一个'); return; }
      }
      store.op('updateCat', { id: id, fields: { name: nm, icon: selIcon, color: selColor, seq: seqVal } });
      close();
    });
  }

  function addCatHandler() {
    var name = prompt('新增大类名称：'); if (!name) return;
    var i = state.categories.length;
    var maxSeq = 0;
    state.categories.forEach(function (c) { if (typeof c.seq === 'number' && c.seq > maxSeq) maxSeq = c.seq; });
    store.op('addCat', { cat: { id: uid(), name: name.trim(), icon: ICON_LIBRARY[i % ICON_LIBRARY.length], color: CAT_COLORS[i % CAT_COLORS.length], seq: maxSeq + 1 } });
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
  /* 保证传给饼图/图例的颜色互不重复：优先用分类自身颜色，冲突时从调色板取未用过的 */
  function distinctColors(items) {
    var used = {}, palette = CAT_COLORS;
    return items.map(function (it) {
      var col = it.color;
      if (!col || used[col]) {
        col = palette.filter(function (p) { return !used[p]; })[0] || col || '#5b8def';
      }
      used[col] = 1;
      return { id: it.id, name: it.name, value: it.value, color: col, icon: it.icon };
    });
  }
  function renderCatTable(el, data, opts) {
    opts = opts || {};
    if (!el) return;
    if (!data.length) { el.innerHTML = '<p class="modal-empty">该范围暂无记录</p>'; return; }
    var total = data.reduce(function (s, d) { return s + d.value; }, 0) || 1;
    var clickable = (opts.single && opts.date);
    var rows = data.map(function (d) {
      var pct = d.value / total * 100;
      var pctText = Math.round(pct * 10) / 10;
      pctText = (pctText % 1 === 0) ? String(pctText) : pctText.toFixed(1);
      var catCls = clickable ? 'ct-cat ct-clickable' : 'ct-cat';
      var catAttr = clickable ? ' data-cat="' + d.id + '" title="点击查看当日该分类明细"' : '';
      return '<tr>' +
        '<td class="' + catCls + '"' + catAttr + '><span class="ct-emoji">' + (d.icon || '') + '</span>' + esc(d.name) + '</td>' +
        '<td class="ct-time">' + d.value + '<span class="ct-unit">min</span></td>' +
        '<td class="ct-pct"><div class="ct-pct-inner"><span class="ct-num">' + pctText + '%</span>' +
        '<span class="ct-track"><span class="ct-bar" style="width:' + pct.toFixed(1) + '%"></span></span></div></td>' +
        '</tr>';
    }).join('');
    el.innerHTML =
      '<table class="cat-table">' +
      '<thead><tr><th>分类</th><th>时间</th><th class="ct-pct-h">占比</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table>';
    if (clickable) {
      el.querySelectorAll('[data-cat]').forEach(function (cell) {
        var open = function () { showDayBreakdown(opts.date, cell.getAttribute('data-cat')); };
        cell.addEventListener('click', open);
        cell.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      });
    }
  }
  function drawBars(canvas, labels, values, color, datesArr, catsArr, labelShow) {
    barHitData = [];
    var c = setupCanvas(canvas), ctx = c.ctx, w = c.w, h = c.h;
    var th = chartTheme();
    ctx.fillStyle = th.bg; ctx.fillRect(0, 0, w, h);
    var max = Math.max.apply(null, values.concat([1]));
    var padL = 32, padR = 10, padT = 14, padB = 26, cw = w - padL - padR, ch = h - padT - padB;
    ctx.strokeStyle = th.grid; ctx.fillStyle = th.muted; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var i = 0; i <= 4; i++) {
      var y = padT + ch - (i / 4) * ch;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillText(Math.round((i / 4) * max), padL - 5, y);
    }
    if (values.every(function (v) { return v === 0; })) { ctx.fillStyle = th.muted; ctx.textAlign = 'center'; ctx.fillText('暂无数据', w / 2, h / 2); return; }
    var n = labels.length;
    var bw = Math.min(34, cw / n * 0.62);
    var gap = (cw - bw * n) / (n + 1);
    var step = n > 14 ? Math.ceil(n / 12) : 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    labels.forEach(function (lb, i) {
      var x = padL + gap + (bw + gap) * i;
      var bh = (values[i] / max) * ch; var y = padT + ch - bh;
      ctx.fillStyle = Array.isArray(color) ? color[i] : (color || th.line);
      if (bh > 0) { roundRect(ctx, x, y, bw, bh, 4); ctx.fill(); }
      if ((n <= 14 || (labelShow && labelShow[i])) && values[i] > 0) { ctx.fillStyle = th.value; ctx.font = '10px sans-serif'; ctx.fillText(values[i], x + bw / 2, y - 12); ctx.font = '10px sans-serif'; }
      if (labelShow ? labelShow[i] : (i % step === 0 || i === n - 1)) { ctx.fillStyle = th.label; var lx = Math.max(padL + 14, Math.min(w - padR - 14, x + bw / 2)); ctx.fillText(lb, lx, padT + ch + 6); }
      barHitData.push({ x: x, w: bw, top: padT, bottom: padT + ch, date: datesArr ? datesArr[i] : null, cat: catsArr ? catsArr[i] : null });
    });
  }
  function roundRect(ctx, x, y, w, h, r) {
    if (h < r * 2) r = h / 2; if (w < r * 2) r = w / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  /* 统计图表缩放（双指捏合 / 鼠标滚轮 / 拖动平移），仅改变可见日期窗口，不改变汇总 */
  function sliceView(dates, byDayLabels, byDayVals, barLabels, barVals, barColors, barDates, barCats, labelShow) {
    var n = dates.length;
    var z = ui.zoom;
    if (!z || n <= 2) return { dates: dates, byDayLabels: byDayLabels, byDayVals: byDayVals, barLabels: barLabels, barVals: barVals, barColors: barColors, barDates: barDates, barCats: barCats, labelShow: labelShow };
    var ia = Math.max(0, Math.floor(z.a));
    var ib = Math.min(n, Math.ceil(z.b));
    if (ib - ia < 2) ib = Math.min(n, ia + 2);
    return {
      dates: dates.slice(ia, ib),
      byDayLabels: byDayLabels.slice(ia, ib),
      byDayVals: byDayVals.slice(ia, ib),
      barLabels: barLabels.slice(ia, ib),
      barVals: barVals.slice(ia, ib),
      barColors: barColors.slice(ia, ib),
      barDates: barDates.slice(ia, ib),
      barCats: barCats.slice(ia, ib),
      labelShow: labelShow ? labelShow.slice(ia, ib) : null
    };
  }
  function statsZoomApply() {
    var n = chartData ? chartData.fullLen : 0;
    if (!ui.zoom || n <= 2) { ui.zoom = { a: 0, b: n }; return; }
    var z = ui.zoom;
    if (z.b - z.a < 2) z.b = z.a + 2;
    if (z.a < 0) z.a = 0;
    if (z.b > n) z.b = n;
    if (z.b - z.a > n) { z.a = 0; z.b = n; }
  }
  function zoomAt(centerFrac, factor) {
    if (!chartData) return;
    var n = chartData.fullLen;
    if (!ui.zoom || n <= 2) ui.zoom = { a: 0, b: n };
    var z = ui.zoom;
    var len = z.b - z.a;
    var center = z.a + centerFrac * len;
    var newLen = Math.max(2, Math.min(n, len / factor));
    var newA = center - centerFrac * newLen;
    var newB = newA + newLen;
    if (newA < 0) { newB -= newA; newA = 0; }
    if (newB > n) { newA -= (newB - n); newB = n; }
    ui.zoom = { a: newA, b: newB };
    statsZoomApply();
    redrawStatsCharts();
  }
  function panByFrac(df) {
    if (!chartData) return;
    var n = chartData.fullLen;
    if (!ui.zoom || n <= 2) ui.zoom = { a: 0, b: n };
    var z = ui.zoom;
    var len = z.b - z.a;
    var na = z.a + df * len;
    na = Math.max(0, Math.min(n - len, na));
    ui.zoom = { a: na, b: na + len };
    statsZoomApply();
    redrawStatsCharts();
  }
  function redrawStatsCharts() {
    if (!chartData) return;
    var c = chartData;
    var v = sliceView(c.dates, c.byDayLabels, c.byDayVals, c.barLabels, c.barVals, c.barColors, c.barDates, c.barCats, c.labelShow);
    drawBars(document.getElementById('chartBar'), v.barLabels, v.barVals, v.barColors, v.barDates, v.barCats, v.labelShow);
    updateZoomUI();
  }
  function updateZoomUI() {
    var bar = document.getElementById('zoomBar');
    if (!bar) return;
    var zoomed = ui.zoom && chartData && (ui.zoom.a > 0.05 || ui.zoom.b < chartData.fullLen - 0.05);
    bar.hidden = !zoomed;
  }
  function attachChartZoom(canvas) {
    if (!canvas) return;
    canvas.style.touchAction = 'none';
    var pts = new Map();
    var pinchDist = 0;
    function curDist() { var a = Array.from(pts.values()); if (a.length < 2) return 0; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
    function midFrac() {
      var a = Array.from(pts.values());
      if (a.length < 2) return 0.5;
      var rect = canvas.getBoundingClientRect();
      var cx = (a[0].x + a[1].x) / 2 - rect.left;
      return Math.max(0, Math.min(1, cx / rect.width));
    }
    canvas.addEventListener('pointerdown', function (e) {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) pinchDist = curDist();
      if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (_) {} }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!pts.has(e.pointerId)) return;
      var prev = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        e.preventDefault();
        var d = curDist();
        if (pinchDist > 0) { var factor = d / pinchDist; if (factor > 0 && isFinite(factor)) zoomAt(midFrac(), factor); }
        pinchDist = d;
      } else if (pts.size === 1) {
        e.preventDefault();
        var rect = canvas.getBoundingClientRect();
        var dx = e.clientX - prev.x;
        panByFrac(-dx / rect.width);
      }
    });
    function up(e) { pts.delete(e.pointerId); if (pts.size < 2) pinchDist = 0; }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var rect = canvas.getBoundingClientRect();
      var frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      zoomAt(frac, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });
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
