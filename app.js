(function () {
  'use strict';

  var DEFAULT_CATS = [
    { id: 'sport', name: '运动', icon: '🏀', color: '#FF6B6B', subs: [{ id: 'sp_b', name: '篮球' }, { id: 'sp_d', name: '街舞' }, { id: 'sp_r', name: '跳绳' }] },
    { id: 'english', name: '英语', icon: '🔤', color: '#4ECDC4', subs: [{ id: 'en_r', name: '阅读' }, { id: 'en_l', name: '听力' }, { id: 'en_s', name: '口语' }, { id: 'en_v', name: '视频' }] },
    { id: 'poem', name: '古诗', icon: '📜', color: '#A78BFA', subs: [{ id: 'pm_r', name: '背诵' }, { id: 'pm_a', name: '赏析' }] },
    { id: 'char', name: '识字', icon: '🔡', color: '#FFB703', subs: [] },
    { id: 'read', name: '阅读', icon: '📚', color: '#06D6A0', subs: [] },
    { id: 'vocal', name: '声乐', icon: '🎵', color: '#EF476F', subs: [] },
    { id: 'speech', name: '口才', icon: '🎤', color: '#118AB2', subs: [] }
  ];

  var ui = {
    catId: null,
    subId: null,
    recDate: fmtDate(new Date()),
    statsRange: 'week',
    statsDate: fmtDate(new Date())
  };
  var currentView = 'record';
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
  function getSub(cat, id) { if (!cat) return null; for (var i = 0; i < cat.subs.length; i++) if (cat.subs[i].id === id) return cat.subs[i]; return null; }

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
        case 'addSub': { var c2 = cache.categories.find(function (x) { return x.id === payload.catId; }); if (c2 && !c2.subs.find(function (s) { return s.id === payload.sub.id; })) c2.subs.push(payload.sub); break; }
        case 'deleteSub': { var c3 = cache.categories.find(function (x) { return x.id === payload.catId; }); if (c3) c3.subs = c3.subs.filter(function (s) { return s.id !== payload.id; }); break; }
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
      var c = findCat(r.catId), sub = getSub(c, r.subId);
      return '<li class="rec-item">' +
        '<span class="rec-dot" style="background:' + (c ? c.color : '#999') + '"></span>' +
        '<div class="rec-main"><div class="rec-title">' + esc(r.content || '') + '</div>' +
        '<div class="rec-meta">' + (c ? c.icon + c.name : '') + ' · ' + (sub ? esc(sub.name) : '') + ' · ' + r.date + '</div></div>' +
        '<div class="rec-time">' + r.minutes + '分</div>' +
        '<button class="rec-del" data-del="' + r.id + '">✕</button></li>';
    }).join('');
  }

  function renderRecord() {
    var root = document.getElementById('view-record');
    var cats = state.categories;
    if (!ui.catId && cats.length) ui.catId = cats[0].id;
    var cat = findCat(ui.catId);

    var chips = cats.map(function (c) {
      return '<button class="chip ' + (c.id === ui.catId ? 'active' : '') + '" data-cat="' + c.id + '" style="--c:' + c.color + '">' + c.icon + ' ' + esc(c.name) + '</button>';
    }).join('');

    var subArea = '';
    if (cat) {
      var subs = cat.subs.map(function (s) {
        return '<button class="subchip ' + (s.id === ui.subId ? 'active' : '') + '" data-sub="' + s.id + '">' + esc(s.name) + '</button>';
      }).join('');
      subArea = '<div class="subchips">' + subs + '<button class="subchip add" data-add-sub="1">＋ 小类</button></div>';
    }

    root.innerHTML =
      '<div class="card">' +
      '<label class="lbl">日期</label>' +
      '<input type="date" id="recDate" value="' + ui.recDate + '">' +
      '<label class="lbl">大类</label>' +
      '<div class="chips">' + chips + '</div>' +
      '<label class="lbl">小类</label>' + subArea +
      '<label class="lbl">事项内容</label>' +
      '<input type="text" id="recContent" placeholder="例如：跳绳100个 / 背古诗《静夜思》">' +
      '<label class="lbl">时长（分钟）<span class="req">*</span></label>' +
      '<input type="number" id="recMinutes" min="1" placeholder="必填，如 20">' +
      '<button class="btn-primary" id="recSave">保存记录</button>' +
      '</div>' +
      '<h3 class="section-title" id="recDateTitle">' + ui.recDate + ' 的记录</h3>' +
      '<ul class="rec-list" id="recList">' + buildRecordListHTML() + '</ul>';

    root.querySelector('#recDate').addEventListener('change', function (e) { ui.recDate = e.target.value; document.getElementById('recDateTitle').textContent = ui.recDate + ' 的记录'; document.getElementById('recList').innerHTML = buildRecordListHTML(); });
    var catBtns = root.querySelectorAll('[data-cat]');
    catBtns.forEach(function (b) { b.addEventListener('click', function () { ui.catId = b.dataset.cat; ui.subId = null; renderRecord(); }); });
    var subBtns = root.querySelectorAll('[data-sub]');
    subBtns.forEach(function (b) { b.addEventListener('click', function () { ui.subId = (ui.subId === b.dataset.sub) ? null : b.dataset.sub; renderRecord(); }); });
    var addSub = root.querySelector('[data-add-sub]');
    if (addSub) addSub.addEventListener('click', addSubFromRecord);
    root.querySelector('#recSave').addEventListener('click', saveRecord);
    var delBtns = root.querySelectorAll('[data-del]');
    delBtns.forEach(function (b) { b.addEventListener('click', function () { store.op('deleteRecord', { id: b.dataset.del }); }); });
  }

  function refreshRecordList() {
    var list = document.getElementById('recList');
    var title = document.getElementById('recDateTitle');
    if (list) list.innerHTML = buildRecordListHTML();
    if (title) title.textContent = ui.recDate + ' 的记录';
  }

  function addSubFromRecord() {
    var c = findCat(ui.catId); if (!c) return;
    var name = prompt('为「' + c.name + '」新增小类：'); if (!name) return;
    store.op('addSub', { catId: c.id, sub: { id: uid(), name: name.trim() } });
    ui.subId = null; renderRecord();
  }

  function saveRecord() {
    var content = document.getElementById('recContent').value.trim();
    var minutes = parseInt(document.getElementById('recMinutes').value, 10);
    if (!ui.catId) { alert('请选择大类'); return; }
    if (!ui.subId) { alert('请选择小类（可点击「＋ 小类」新增）'); return; }
    if (!content) { alert('请填写事项内容'); return; }
    if (!minutes || minutes <= 0) { alert('请填写有效的时长（分钟）'); return; }
    store.op('addRecord', { record: { id: uid(), date: ui.recDate, catId: ui.catId, subId: ui.subId, content: content, minutes: minutes, createdAt: Date.now() } });
    document.getElementById('recContent').value = '';
    document.getElementById('recMinutes').value = '';
    refreshRecordList();
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
      '<canvas id="chartLine" class="chart"></canvas></div>';

    var rtabs = root.querySelectorAll('[data-r]');
    rtabs.forEach(function (b) { b.addEventListener('click', function () { ui.statsRange = b.dataset.r; renderStats(); }); });
    root.querySelector('#statsDate').addEventListener('change', function (e) { ui.statsDate = e.target.value; renderStats(); });

    drawDoughnut(document.getElementById('chartCat'), byCat);
    drawLegend(document.getElementById('legendCat'), byCat);
    drawBars(document.getElementById('chartBar'), barLabels, barVals, barColors);
    drawLine(document.getElementById('chartLine'), byDayLabels, byDayVals);
  }

  function sumCard(num, lbl) { return '<div class="sum-card"><div class="sum-num">' + num + '</div><div class="sum-lbl">' + lbl + '</div></div>'; }

  /* ---------------- settings view ---------------- */
  function renderSettings() {
    var root = document.getElementById('view-settings');
    var cats = state.categories.map(function (c) {
      var subs = c.subs.length
        ? c.subs.map(function (s) { return '<span class="tag">' + esc(s.name) + ' <button class="tag-x" data-delsub="' + c.id + '|' + s.id + '">✕</button></span>'; }).join('')
        : '<span class="muted">暂无小类</span>';
      return '<div class="cat-manage">' +
        '<div class="cm-head"><span class="cm-icon" style="background:' + c.color + '">' + c.icon + '</span>' +
        '<input class="cm-name" value="' + esc(c.name) + '" data-rename="' + c.id + '">' +
        '<button class="cm-del" data-delcat="' + c.id + '">删除</button></div>' +
        '<div class="cm-subs">' + subs + '<button class="tag add" data-addsub="' + c.id + '">＋ 小类</button></div></div>';
    }).join('');

    root.innerHTML =
      '<div class="card"><h3 class="section-title">分类管理</h3>' + cats +
      '<button class="btn-ghost" id="addCat">＋ 新增大类</button></div>' +
      '<div class="card"><h3 class="section-title">数据</h3>' +
      '<button class="btn-ghost" id="exportBtn">导出数据 (JSON)</button>' +
      '<button class="btn-ghost" id="importBtn">导入数据 (JSON)</button>' +
      '<button class="btn-danger" id="resetBtn">清空全部数据</button></div>' +
      '<p class="tip">数据保存在本机浏览器（localStorage）。换设备、清缓存或换浏览器前，请先「导出数据」备份；导入会覆盖当前数据。</p>';

    var renames = root.querySelectorAll('[data-rename]');
    renames.forEach(function (inp) { inp.addEventListener('change', function () { store.op('updateCat', { id: inp.dataset.rename, fields: { name: inp.value.trim() || findCat(inp.dataset.rename).name } }); }); });
    var delsub = root.querySelectorAll('[data-delsub]');
    delsub.forEach(function (b) { b.addEventListener('click', function () { var p = b.dataset.delsub.split('|'); store.op('deleteSub', { catId: p[0], id: p[1] }); }); });
    var delcat = root.querySelectorAll('[data-delcat]');
    delcat.forEach(function (b) { b.addEventListener('click', function () { if (confirm('删除该大类及其下所有小类与记录？')) store.op('deleteCat', { id: b.dataset.delcat }); }); });
    var addsub = root.querySelectorAll('[data-addsub]');
    addsub.forEach(function (b) { b.addEventListener('click', function () { var c = findCat(b.dataset.addsub); var name = prompt('新增小类名称：'); if (!name) return; store.op('addSub', { catId: b.dataset.addsub, sub: { id: uid(), name: name.trim() } }); }); });
    root.querySelector('#addCat').addEventListener('click', function () {
      var name = prompt('新增大类名称：'); if (!name) return;
      var colors = ['#FF6B6B', '#4ECDC4', '#A78BFA', '#FFB703', '#06D6A0', '#EF476F', '#118AB2', '#F78C6B'];
      var icons = ['⭐', '🌟', '🎯', '🚀', '🌈', '💡', '🔥', '🍀'];
      var i = state.categories.length;
      store.op('addCat', { cat: { id: uid(), name: name.trim(), icon: icons[i % icons.length], color: colors[i % colors.length], subs: [] } });
    });
    root.querySelector('#exportBtn').addEventListener('click', exportData);
    root.querySelector('#importBtn').addEventListener('click', importData);
    root.querySelector('#resetBtn').addEventListener('click', function () {
      if (confirm('确定清空所有分类和记录？此操作不可恢复。')) store.op('resetSpace', {});
    });
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
              d.categories.forEach(function (c) { store.op('addCat', { cat: c }); });
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
