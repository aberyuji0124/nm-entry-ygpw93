/* NMエントリー支援 — 画面と動作。ビルド不要（このファイルをそのまま配信する）。
   個人情報（プロフィール・参加ログ）は、この端末の localStorage にだけ保存し、外部へは送らない。 */
(function () {
'use strict';

/* ---------- 設定・定義 ---------- */
var APP_VERSION = '1.0.0';
var STALE_DAYS = 3;                      // これより古いデータは「最新ではない」と表示
var DOW = ['日', '月', '火', '水', '木', '金', '土'];
var MEMBER_TYPES = ['会員', '準役員', '主催', '幹事', '幹事候補', '事務局長', 'ゲスト'];
var PROFILE_FIELDS = [
  { k: 'name', label: 'お名前', req: 1, ph: '例：山田 太郎', ac: 'name' },
  { k: 'kana', label: 'ふりがな', req: 1, ph: '例：やまだ たろう' },
  { k: 'email', label: 'メールアドレス', req: 1, type: 'email', ac: 'email' },
  { k: 'phone', label: '電話番号（携帯）', req: 1, type: 'tel', ac: 'tel' },
  { k: 'company', label: '会社名・屋号', ac: 'organization' },
  { k: 'memberType', label: '会員区分', select: MEMBER_TYPES },
  { k: 'branch', label: '所属支部' },
  { k: 'officeRole', label: '運営支部・役職' },
  { k: 'nmid', label: 'NMナンバー（NM-ID会員番号）' },
  { k: 'facebook', label: 'FacebookのURL', ph: 'https://www.facebook.com/…' },
  { k: 'category', label: 'カテゴリー（業種・専門分野）' },
  { k: 'business', label: '業務詳細', area: 1 },
  { k: 'wish', label: '希望紹介先・つながりたい方', area: 1 },
  { k: 'circle', label: '協業できる業種・コンタクトサークル', area: 1 },
  { k: 'memo', label: '自由メモ（メール・LINEの申込文に入れる一言）', area: 1 }
];
var FIELD_LABEL = {}; PROFILE_FIELDS.forEach(function (f) { FIELD_LABEL[f.k] = f.label; });

var ICONS = {
  calendar: '<path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
  send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  warn: '<path d="M12 3 2 21h20zM12 10v5M12 18h.01"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  filter: '<path d="M4 5h16l-6 8v6l-4-2v-4z"/>',
  check: '<path d="M5 12l5 5 9-10"/>'
};
function ico(n) { return '<span class="ico"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n] + '</svg></span>'; }

/* ---------- 保存（端末の中だけ） ---------- */
var store = {
  get: function (k, d) { try { var v = localStorage.getItem('nm.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem('nm.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del: function (k) { try { localStorage.removeItem('nm.' + k); } catch (e) {} }
};

var S = {
  data: null, status: null, loadError: false,
  tab: 'search', view: 'cal', month: ym(new Date()), day: '',
  f: { q: '', dow: [], area: '', mode: '', stars: '' },
  profile: store.get('profile', {}), log: store.get('log', [])
};

/* ---------- 小さな道具 ---------- */
function $(s, r) { return (r || document).querySelector(s); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function ym(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function pd(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function today() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function dayDiff(a, b) { return Math.round((a - b) / 86400000); }
function fmtMD(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + DOW[d.getDay()] + '）'; }
function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200); }
function norm(s) { return String(s || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase(); }
function stars(n) { return n ? '★'.repeat(n) + '（星' + n + '）' : ''; }

function copyText(t, label) {
  function done() { toast((label ? label + ' を' : '') + 'コピーしました'); }
  function fallback() {
    var a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;top:0;opacity:0';
    document.body.appendChild(a); a.focus(); a.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('コピーできませんでした'); }
    document.body.removeChild(a);
  }
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
}

/* ---------- データ読み込み ---------- */
function loadData() {
  var bust = '?t=' + Math.floor(Date.now() / 600000);
  return Promise.all([
    fetch('data/schedule.json' + bust).then(function (r) { if (!r.ok) throw 0; return r.json(); }),
    fetch('data/status.json' + bust).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
  ]).then(function (a) {
    S.data = a[0]; S.status = a[1]; S.loadError = false; prepare();
  }).catch(function () { S.loadError = true; });
}

function areasOf(area) {
  var m = area.match(/^ネット[（(](.*)[）)]$/);
  if (m) return m[1].split(/[･・,、\/]/).map(function (s) { return s.trim(); }).filter(Boolean);
  return [area];
}
function prepare() {
  var d = S.data;
  d.events.forEach(function (e) {
    var det = d.details && d.details[e.url];
    e.d = det && det.date === e.date ? det : null;
    e.net = /^ネット/.test(e.area);
    e.areas = areasOf(e.area);
    e.key = e.url + '|' + e.date;
    e.dt = pd(e.date);
    e.deadline = null;
    if (e.d && e.d.deadline_days != null) e.deadline = addDays(e.dt, -e.d.deadline_days);
  });
  d.events.sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; });
}

function dataIsStale() {
  if (!S.data) return true;
  var g = new Date(S.data.generated_at);
  return (Date.now() - g.getTime()) > STALE_DAYS * 86400000;
}

/* ---------- 絞り込み ---------- */
function filtered(opts) {
  opts = opts || {};
  var f = S.f, q = norm(f.q);
  return S.data.events.filter(function (e) {
    if (!opts.allMonths && S.month !== 'all' && e.date.slice(0, 7) !== S.month) return false;
    if (q && norm(e.name + e.area).indexOf(q) < 0) return false;
    if (f.dow.length && f.dow.indexOf(e.dt.getDay()) < 0) return false;
    if (f.mode === 'net' && !e.net) return false;
    if (f.mode === 'real' && e.net) return false;
    if (f.stars && String(e.stars) !== f.stars) return false;
    if (f.area && e.areas.indexOf(f.area) < 0) return false;
    return true;
  });
}
function activeFilterTags() {
  var f = S.f, t = [];
  if (f.q) t.push('支部名：' + f.q);
  if (f.dow.length) t.push('曜日：' + f.dow.slice().sort().map(function (i) { return DOW[i]; }).join('・'));
  if (f.mode) t.push(f.mode === 'net' ? 'ネット' : 'リアル');
  if (f.stars) t.push('星' + f.stars);
  if (f.area) t.push('エリア：' + f.area);
  return t;
}

/* ---------- 締切 ---------- */
function deadlineInfo(e) {
  if (!e.deadline) return { cls: '', text: e.d ? '締切は支部ページで確認' : '申込窓口は公開前', days: null };
  var n = dayDiff(e.deadline, today()), md = (e.deadline.getMonth() + 1) + '/' + e.deadline.getDate();
  if (n < 0) return { cls: 'late', text: '締切を過ぎています（' + md + '）', days: n };
  if (n === 0) return { cls: 'urgent', text: '本日が締切！', days: n };
  if (n <= 3) return { cls: 'urgent', text: '締切まであと' + n + '日（' + md + '）', days: n };
  if (n <= 7) return { cls: 'soon', text: '締切まであと' + n + '日（' + md + '）', days: n };
  return { cls: '', text: '締切 ' + md + '（あと' + n + '日）', days: n };
}
var METHOD = { google: 'Googleフォーム', form: 'フォーム', mail: 'メール', line: 'LINE', none: '窓口未確認' };
function methodOf(e) { return e.d ? (e.d.apply_type || 'none') : null; }
function applied(e) { return S.log.some(function (l) { return l.key === e.key; }); }

/* ---------- 画面：共通 ---------- */
var viewEl = $('#view');
function setTitle(t) { $('#title').textContent = t; }
function renderNotice() {
  var n = $('#notice'), h = '';
  if (S.loadError) h = '<div class="notice err" role="alert">' + ico('warn') + '<div>最新情報を取得できませんでした。<br><span class="sub" style="color:inherit">通信状況をご確認のうえ、画面を開き直してください。</span></div></div>';
  else if (S.status && S.status.ok === false) h = '<div class="notice err" role="alert">' + ico('warn') + '<div>最新情報を取得できませんでした。前回取得した日程を表示しています。<br><span style="font-weight:600">（管理者が原因を確認しています）</span></div></div>';
  else if (dataIsStale()) h = '<div class="notice warn" role="alert">' + ico('warn') + '<div>日程が古い可能性があります。最終更新：' + esc(fmtUpdated()) + '</div></div>';
  n.innerHTML = h;
}
function fmtUpdated() { if (!S.data) return '不明'; var g = new Date(S.data.generated_at); return (g.getMonth() + 1) + '月' + g.getDate() + '日 ' + pad(g.getHours()) + ':' + pad(g.getMinutes()); }

function render() {
  document.querySelectorAll('.tabbar button').forEach(function (b) { b.setAttribute('aria-current', b.dataset.tab === S.tab ? 'page' : 'false'); });
  document.querySelectorAll('[data-ico]').forEach(function (s) { if (!s.firstChild) s.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[s.dataset.ico] + '</svg>'; });
  renderNotice();
  ({ search: vSearch, apply: vApply, log: vLog, settings: vSettings })[S.tab]();
}

/* ---------- 画面：さがす ---------- */
function vSearch() {
  setTitle('月例会を さがす');
  if (!S.data) { viewEl.innerHTML = S.loadError ? '<div class="empty-msg">日程を読み込めませんでした。</div>' : '<div class="empty-msg">読み込み中…</div>'; return; }
  var tags = activeFilterTags();
  var h = '';
  if (!hasRequiredProfile()) {
    h += '<div class="notice warn" style="margin:0 0 12px">' + ico('warn') + '<div>はじめに、お名前などを1回だけ登録しましょう。<button class="btn accent small" data-act="tab" data-tab="settings" style="margin-top:8px">プロフィールを登録する</button></div></div>';
  }
  h += '<div class="searchbar"><input class="field" id="q" type="search" placeholder="支部名で さがす" value="' + esc(S.f.q) + '" aria-label="支部名で探す" enterkeyhint="search">' +
    '<button class="btn ghost small filterbtn" data-act="filters" aria-label="絞り込み条件を開く">' + ico('filter') + '絞り込み</button></div>';
  h += '<div class="activefilters" id="tags">' + tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + (tags.length ? '<button class="chip" style="min-height:32px;padding:0 12px" data-act="clearf">条件をクリア</button>' : '') + '</div>';
  h += '<div class="seg" role="group" aria-label="表示の切り替え"><button data-act="view" data-v="cal" aria-pressed="' + (S.view === 'cal') + '">カレンダー</button><button data-act="view" data-v="list" aria-pressed="' + (S.view === 'list') + '">リスト</button></div>';
  h += '<div id="results"></div>';
  viewEl.innerHTML = h;
  var q = $('#q'); q.addEventListener('input', function () { S.f.q = q.value; renderResults(); updateTags(); });
  renderResults();
}
function updateTags() {
  var tags = activeFilterTags(), el = $('#tags'); if (!el) return;
  el.innerHTML = tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + (tags.length ? '<button class="chip" style="min-height:32px;padding:0 12px" data-act="clearf">条件をクリア</button>' : '');
}
function monthNav() {
  var d = S.month === 'all' ? new Date() : pd(S.month + '-01');
  var p = new Date(d.getFullYear(), d.getMonth() - 1, 1), n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return '<div class="monthnav"><button data-act="month" data-m="' + ym(p) + '" aria-label="前の月へ">‹ ' + (p.getMonth() + 1) + '月</button><strong>' + d.getFullYear() + '年' + (d.getMonth() + 1) + '月</strong><button data-act="month" data-m="' + ym(n) + '" aria-label="次の月へ">' + (n.getMonth() + 1) + '月 ›</button></div>';
}
function evCard(e) {
  var di = deadlineInfo(e), m = methodOf(e), t = today();
  var past = e.dt < t;
  var b = '';
  if (e.net) b += '<span class="badge net">ネット</span>';
  if (applied(e)) b += '<span class="badge done">✓ 申込操作ずみ</span>';
  if (!past) b += '<span class="badge ' + di.cls + '">' + (di.cls === 'urgent' ? '⚠ ' : '') + esc(di.text) + '</span>';
  if (m) b += '<span class="badge">' + METHOD[m] + '</span>';
  return '<button class="ev" data-act="detail" data-key="' + esc(e.key) + '"><div class="tm">' + esc(e.time || '--:--') + '<small>' + fmtMD(e.dt).replace(/^\d+月/, '') + '</small></div>' +
    '<div><div class="nm">' + esc(e.name) + '</div><div class="meta">' + esc(e.area) + (e.stars ? ' ・ ' + '★'.repeat(e.stars) + ' 星' + e.stars : '') + '</div><div class="badges">' + b + '</div></div></button>';
}
function renderResults() {
  var el = $('#results'); if (!el) return;
  if (S.view === 'list') {
    var list = filtered();
    var h = monthSelect() + '<p class="sub" style="margin-top:8px">' + list.length + '件</p>';
    if (!list.length) h += '<div class="empty-msg">条件に合う月例会がありません。<br>絞り込みを変えてみてください。</div>';
    else {
      h += '<div class="evlist">'; var last = '';
      list.forEach(function (e) { if (e.date !== last) { last = e.date; h += '<div class="daytitle">' + fmtMD(e.dt) + '</div>'; } h += evCard(e); });
      h += '</div>';
    }
    el.innerHTML = h; return;
  }
  if (S.month === 'all') S.month = ym(new Date());
  var evs = filtered(), by = {}; evs.forEach(function (e) { (by[e.date] = by[e.date] || []).push(e); });
  var first = pd(S.month + '-01'), days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(), tdy = ymd(today());
  var h2 = monthNav() + '<div class="cal" role="grid">';
  DOW.forEach(function (w, i) { h2 += '<div class="dow ' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + w + '</div>'; });
  for (var i = 0; i < first.getDay(); i++) h2 += '<div class="day empty"></div>';
  for (var d = 1; d <= days; d++) {
    var k = S.month + '-' + pad(d), c = (by[k] || []).length;
    h2 += '<button class="day ' + (c ? '' : 'none') + (k === tdy ? ' today' : '') + '" data-act="day" data-d="' + k + '" aria-pressed="' + (S.day === k) + '" aria-label="' + (first.getMonth() + 1) + '月' + d + '日 ' + c + '件"><span class="n">' + d + '</span>' + (c ? '<span class="c">' + c + '件</span>' : '') + '</button>';
  }
  h2 += '</div>';
  var sel = S.day && S.day.slice(0, 7) === S.month ? S.day : '';
  if (sel) {
    var l2 = by[sel] || [];
    h2 += '<div class="daytitle">' + fmtMD(pd(sel)) + ' の月例会（' + l2.length + '件）</div>';
    h2 += l2.length ? '<div class="evlist">' + l2.map(evCard).join('') + '</div>' : '<div class="empty-msg">この日の月例会はありません。</div>';
  } else {
    h2 += '<p class="sub" style="text-align:center">日付をタップすると、その日の月例会が出ます。<br>この月は全部で ' + evs.length + '件。</p>';
    h2 += '<button class="btn ghost" data-act="view" data-v="list">この月を リストで見る</button>';
  }
  el.innerHTML = h2;
}
function monthSelect() {
  var months = {}; S.data.events.forEach(function (e) { months[e.date.slice(0, 7)] = 1; });
  var o = '<option value="all"' + (S.month === 'all' ? ' selected' : '') + '>すべての月</option>';
  Object.keys(months).sort().forEach(function (m) { o += '<option value="' + m + '"' + (S.month === m ? ' selected' : '') + '>' + m.slice(0, 4) + '年' + (+m.slice(5)) + '月</option>'; });
  return '<label class="sub" for="msel">月</label><select class="field" id="msel" data-bind="month">' + o + '</select>';
}

/* ---------- 絞り込みシート ---------- */
function openFilters() {
  var areas = {}, maxStar = 0;
  S.data.events.forEach(function (e) { e.areas.forEach(function (a) { areas[a] = (areas[a] || 0) + 1; }); if (e.stars > maxStar) maxStar = e.stars; });
  var f = S.f;
  var h = '<div class="grip"></div><h3>絞り込み</h3>';
  h += '<div class="fld"><label>曜日</label><div class="chips">' + DOW.map(function (w, i) { return '<button class="chip" data-act="fdow" data-i="' + i + '" aria-pressed="' + (f.dow.indexOf(i) >= 0) + '">' + w + '</button>'; }).join('') + '</div></div>';
  h += '<div class="fld"><label>リアル／ネット</label><div class="chips">' + [['', 'すべて'], ['real', 'リアル'], ['net', 'ネット']].map(function (o) { return '<button class="chip" data-act="fmode" data-v="' + o[0] + '" aria-pressed="' + (f.mode === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div></div>';
  var st = '<button class="chip" data-act="fstars" data-v="" aria-pressed="' + (f.stars === '') + '">すべて</button>';
  for (var i = 1; i <= maxStar; i++) st += '<button class="chip" data-act="fstars" data-v="' + i + '" aria-pressed="' + (f.stars === String(i)) + '">星' + i + '</button>';
  h += '<div class="fld"><label>星の数</label><div class="chips">' + st + '</div></div>';
  h += '<div class="fld"><label for="farea">エリア</label><select class="field" id="farea" data-bind="area"><option value="">すべて</option>' +
    Object.keys(areas).sort(function (a, b) { return a.localeCompare(b, 'ja'); }).map(function (a) { return '<option' + (f.area === a ? ' selected' : '') + '>' + esc(a) + '</option>'; }).join('') + '</select></div>';
  h += '<div class="fld"><label for="msel2">月</label><select class="field" id="msel2" data-bind="month">' + monthOptions() + '</select><p class="sub">カレンダー表示では、表示中の月で絞り込みます。</p></div>';
  h += '<div class="row" style="margin-top:16px"><button class="btn ghost" data-act="clearf">条件をクリア</button><button class="btn" data-act="closeov" id="fres">結果を見る</button></div>';
  showSheet(h);
  updateFres();
}
function monthOptions() {
  var months = {}; S.data.events.forEach(function (e) { months[e.date.slice(0, 7)] = 1; });
  var o = '<option value="all"' + (S.month === 'all' ? ' selected' : '') + '>すべての月</option>';
  Object.keys(months).sort().forEach(function (m) { o += '<option value="' + m + '"' + (S.month === m ? ' selected' : '') + '>' + m.slice(0, 4) + '年' + (+m.slice(5)) + '月</option>'; });
  return o;
}
function updateFres() { var b = $('#fres'); if (b) b.textContent = '結果を見る（' + filtered().length + '件）'; }

/* ---------- シート ---------- */
var ov = $('#overlay');
function showSheet(html, full) {
  ov.hidden = false; ov.innerHTML = '<div class="sheet' + (full ? ' full' : '') + '" role="dialog" aria-modal="true">' + html + '</div>';
  document.body.style.overflow = 'hidden'; $('.sheet', ov).scrollTop = 0;
}
function closeSheet() { ov.hidden = true; ov.innerHTML = ''; document.body.style.overflow = ''; render(); }
ov.addEventListener('click', function (e) { if (e.target === ov && !$('.sheet.full', ov)) closeSheet(); });

function findEvent(key) { return S.data.events.filter(function (e) { return e.key === key; })[0]; }

function openDetail(key) {
  var e = findEvent(key); if (!e) return;
  var di = deadlineInfo(e), m = methodOf(e), d = e.d;
  var h = '<div class="grip"></div><h3>' + esc(e.name) + '</h3>';
  h += '<dl class="kv"><dt>日時</dt><dd>' + fmtMD(e.dt) + ' ' + esc(e.time) + '〜</dd><dt>エリア</dt><dd>' + esc(e.area) + '</dd>' +
    (e.stars ? '<dt>星</dt><dd>' + '★'.repeat(e.stars) + '（星' + e.stars + '）</dd>' : '') +
    (d && d.station ? '<dt>最寄駅</dt><dd>' + esc(d.station) + '</dd>' : '') +
    '<dt>参加締切</dt><dd><span class="badge ' + di.cls + '">' + (di.cls === 'urgent' ? '⚠ ' : '') + esc(di.text) + '</span>' +
    (d && d.guest_deadline_days != null ? '<div class="sub">ゲストの方は' + d.guest_deadline_days + '日前</div>' : '') + '</dd>' +
    '<dt>申込方法</dt><dd>' + (m ? METHOD[m] : '公開前') + '</dd></dl>';
  if (applied(e)) h += '<p><span class="badge done">✓ この月例会は申込操作ずみです</span></p>';
  if (!d) h += '<div class="notice warn" style="margin:8px 0">' + ico('warn') + '<div>この回の申込窓口は、まだ公式サイトに出ていません。公開されると毎日の更新で反映されます。</div></div>';
  h += '<div class="stack" style="margin-top:14px">';
  h += '<button class="btn accent" data-act="apply" data-key="' + esc(key) + '"' + (d ? '' : ' disabled') + '>' + ico('send') + 'この支部に申し込む</button>';
  h += '<a class="btn ghost" href="' + esc(e.url) + '" target="_blank" rel="noopener noreferrer">' + ico('open') + '公式の支部ページを見る</a>';
  h += '<button class="btn ghost" data-act="closeov">とじる</button></div>';
  showSheet(h);
}

/* ---------- 申込補助 ---------- */
function hasRequiredProfile() { var p = S.profile; return !!(p.name && p.kana && p.email && p.phone); }

function startApply(key) {
  var e = findEvent(key); if (!e || !e.d) return;
  if (!hasRequiredProfile()) {
    closeOv(); S.tab = 'settings'; render();
    toast('先にプロフィールを登録してください'); return;
  }
  var t = e.d.apply_type, h = '';
  h += '<button class="back" data-act="closeov">' + ico('back') + 'もどる</button>';
  h += '<div class="notsent" role="alert">' + ico('warn') + '<div>まだ送信されていません。<br>内容を確認して送信してください。</div></div>';
  h += '<h3>' + esc(e.name) + '</h3><p class="sub">' + fmtMD(e.dt) + ' ' + esc(e.time) + '〜 ／ ' + esc(e.area) + '</p>';
  var di = deadlineInfo(e);
  if (di.days != null && di.days < 0) h += '<div class="notice err" style="margin:8px 0">' + ico('warn') + '<div>参加締切を過ぎています。申込できるか、支部ページでご確認ください。</div></div>';
  else if (di.days != null && di.days <= 3) h += '<div class="notice warn" style="margin:8px 0">' + ico('warn') + '<div>' + esc(di.text) + '</div></div>';

  if (t === 'google') {
    var pf = googlePrefill(e);
    if (pf) h += applyGoogle(e, pf); else h += applyCopy(e, '入力済みで開くための情報を読み取れなかったため、下のコピー方式でご利用ください。');
  } else if (t === 'mail') h += applyMail(e);
  else if (t === 'line') h += applyLine(e);
  else h += applyCopy(e, t === 'form' ? '' : '申込窓口を自動では判別できませんでした。支部ページで申込方法をご確認ください。');

  h += '<div style="margin-top:18px"><a class="btn ghost" href="' + esc(e.url) + '" target="_blank" rel="noopener noreferrer">' + ico('open') + '公式の支部ページを開く</a></div>';
  showSheet(h, true);
}
function closeOv() { ov.hidden = true; ov.innerHTML = ''; document.body.style.overflow = ''; }

function logApply(e, method) {
  var now = new Date().toISOString(), ex = S.log.filter(function (l) { return l.key === e.key; })[0];
  if (ex) { ex.at = now; ex.method = method; }
  else S.log.push({ key: e.key, name: e.name, date: e.date, time: e.time, area: e.area, method: method, at: now, url: e.url });
  store.set('log', S.log);
}

/* Googleフォーム：質問名 → プロフィール項目 */
function matchKey(title) {
  var t = norm(title);
  if (/ふりがな|フリガナ|ふり仮名|よみがな/.test(t)) return 'kana';
  if (/メール|mail/.test(t)) return 'email';
  if (/電話|携帯|tel/.test(t)) return 'phone';
  if (/facebook|フェイスブック/.test(t)) return 'facebook';
  if (/nm-?id|nmid|nm会員|nmナンバー|会員番号|会員id|nm番号/.test(t)) return 'nmid';
  if (/運営支部|役職/.test(t)) return 'officeRole';
  if (/所属支部/.test(t)) return 'branch';
  if (/属性|会員区分/.test(t)) return 'memberType';
  if (/会社|屋号|法人|団体/.test(t)) return 'company';
  if (/カテゴリ/.test(t)) return 'category';
  if (/業務詳細|事業内容/.test(t)) return 'business';
  if (/希望紹介先|繋がりたい|つながりたい/.test(t)) return 'wish';
  if (/協業|コンタクトサークル/.test(t)) return 'circle';
  if (/業種|専門分野/.test(t)) return 'category';
  if (/お名前|氏名|名前/.test(t)) return 'name';
  return null;
}
function googlePrefill(e) {
  var form = S.data.forms && S.data.forms[e.d.apply_target];
  if (!form || !form.fields || !form.fields.length) return null;
  var p = S.profile, filled = [], todo = [], params = [];
  form.fields.forEach(function (f) {
    var k = matchKey(f.title), v = k ? (p[k] || '') : '';
    var hasOpts = f.options && f.options.length;
    if (v && hasOpts) { var o = f.options.filter(function (x) { return x === v; })[0] || f.options.filter(function (x) { return norm(x).indexOf(norm(v)) >= 0 || norm(v).indexOf(norm(x)) >= 0; })[0]; v = o || ''; }
    if (v && f.type !== 9 && f.type !== 10) { filled.push({ title: f.title, value: v }); params.push('entry.' + f.entry + '=' + encodeURIComponent(v)); }
    else todo.push({ title: f.title, required: f.required });
  });
  if (p.email) params.push('emailAddress=' + encodeURIComponent(p.email));
  return { url: form.action + '?usp=pp_url&' + params.join('&'), filled: filled, todo: todo };
}
function applyGoogle(e, pf) {
  var h = '<div class="card"><div class="step"><span class="no">1</span><div><b>入力済みのフォームを開きます</b><div class="sub">下の内容が、自動で入った状態で開きます。</div></div></div>';
  h += '<div style="margin-top:8px">' + pf.filled.map(function (x) { return '<div class="fillrow"><div><div class="lb">' + esc(x.title) + '</div><div class="vl">' + esc(x.value) + '</div></div></div>'; }).join('') + '</div></div>';
  h += '<div class="card" style="margin-top:12px"><div class="step"><span class="no">2</span><div><b>あなたが入力・選ぶ項目</b><div class="sub">フォームが開いたら、次の項目を確認してください。</div></div></div><ul class="todo">' +
    pf.todo.map(function (x) { return '<li>' + esc(x.title.split('\n')[0].slice(0, 60)) + (x.required ? ' <span class="req">必須</span>' : '') + '</li>'; }).join('') + '</ul></div>';
  h += '<div class="card" style="margin-top:12px"><div class="step"><span class="no">3</span><div><b>内容を確認して、ご自分で「送信」を押します</b><div class="sub">このアプリは送信しません。</div></div></div></div>';
  h += '<div style="margin-top:14px"><a class="btn accent" href="' + esc(pf.url) + '" target="_blank" rel="noopener noreferrer" data-act="logopen" data-key="' + esc(e.key) + '" data-m="google">' + ico('open') + '入力済みのフォームを開く</a></div>';
  return h;
}
function profileRows(keys) {
  var p = S.profile, h = '';
  keys.forEach(function (k) { if (p[k]) h += '<div class="fillrow"><div><div class="lb">' + esc(FIELD_LABEL[k]) + '</div><div class="vl">' + esc(p[k]) + '</div></div><button class="btn ghost small" data-act="copy" data-k="' + k + '" aria-label="' + esc(FIELD_LABEL[k]) + 'をコピー">' + ico('copy') + 'コピー</button></div>'; });
  return h;
}
function applyCopy(e, note) {
  var keys = PROFILE_FIELDS.map(function (f) { return f.k; }).filter(function (k) { return k !== 'memo'; });
  var h = note ? '<div class="notice warn" style="margin:8px 0">' + ico('warn') + '<div>' + esc(note) + '</div></div>' : '';
  var url = e.d.apply_type === 'form' || e.d.apply_type === 'google' ? e.d.apply_target : '';
  h += '<div class="card"><div class="step"><span class="no">1</span><div><b>フォームを開きます</b></div></div>';
  if (url) h += '<div style="margin-top:10px"><a class="btn accent" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" data-act="logopen" data-key="' + esc(e.key) + '" data-m="form">' + ico('open') + '申込フォームを開く</a></div>';
  h += '</div><div class="card" style="margin-top:12px"><div class="step"><span class="no">2</span><div><b>項目ごとに「コピー」→ フォームに貼りつけ</b><div class="sub">フォームの項目名に合わせて、必要なものだけコピーしてください。</div></div></div>' + profileRows(keys) + '</div>';
  h += '<div class="card" style="margin-top:12px"><div class="step"><span class="no">3</span><div><b>内容を確認して、ご自分で「送信」を押します</b><div class="sub">このアプリは送信しません。</div></div></div></div>';
  return h;
}
function bodyText(e, greeting) {
  var p = S.profile, L = [];
  L.push(greeting);
  L.push('');
  L.push(e.dt.getMonth() + 1 + '月' + e.dt.getDate() + '日（' + DOW[e.dt.getDay()] + '）' + e.time + '〜の月例会に、参加を申し込みます。');
  L.push('');
  [['name', 'お名前'], ['kana', 'ふりがな'], ['company', '会社名'], ['memberType', '会員区分'], ['branch', '所属支部'], ['email', 'メールアドレス'], ['phone', '電話番号']].forEach(function (x) { if (p[x[0]]) L.push(x[1] + '：' + p[x[0]]); });
  if (p.memo) { L.push(''); L.push(p.memo); }
  L.push(''); L.push('どうぞよろしくお願いいたします。');
  return L.join('\n');
}
function applyMail(e) {
  var body = bodyText(e, e.name + ' 担当者様\nお世話になっております。');
  var h = '<div class="card"><div class="step"><span class="no">1</span><div><b>公式の支部ページで、メールの宛先を確認します</b><div class="sub">この支部はメールで申し込みます。宛先は、支部ページに載っています。</div></div></div>' +
    '<div style="margin-top:10px"><a class="btn accent" href="' + esc(e.url) + '" target="_blank" rel="noopener noreferrer" data-act="logopen" data-key="' + esc(e.key) + '" data-m="mail">' + ico('open') + '支部ページを開く</a></div></div>';
  h += '<div class="card" style="margin-top:12px"><div class="step"><span class="no">2</span><div><b>申込文をコピーして、メールに貼りつけます</b><div class="sub">内容は直せます。</div></div></div>' +
    '<div class="fld"><textarea class="field" id="mbody" aria-label="申込文" style="min-height:260px">' + esc(body) + '</textarea></div>' +
    '<button class="btn ghost" data-act="copyfield" data-from="mbody">' + ico('copy') + '申込文をコピー</button></div>';
  h += '<div class="card" style="margin-top:12px"><div class="step"><span class="no">3</span><div><b>内容を確認して、ご自分で送信します</b><div class="sub">このアプリは送信しません。</div></div></div></div>';
  return h;
}
function applyLine(e) {
  var body = bodyText(e, e.name + ' ご担当者様\nお世話になっております。');
  var u = e.d.apply_target;
  var h = '<div class="card"><div class="fld"><label for="lbody">申込文（直せます）</label><textarea class="field" id="lbody" style="min-height:260px">' + esc(body) + '</textarea></div></div>';
  h += '<div class="stack" style="margin-top:14px"><button class="btn accent" data-act="lineopen" data-key="' + esc(e.key) + '" data-u="' + esc(u) + '">' + ico('copy') + '申込文をコピーして LINE を開く</button></div>';
  h += '<p class="sub">LINEが開いたら、トークに貼りつけて内容を確認し、ご自分で送信してください。</p>';
  return h;
}

/* ---------- 画面：申込 ---------- */
function vApply() {
  setTitle('申込できる月例会');
  if (!S.data) { viewEl.innerHTML = '<div class="empty-msg">読み込み中…</div>'; return; }
  var t = today();
  var list = S.data.events.filter(function (e) { return e.d && e.dt >= t && (!e.deadline || e.deadline >= t); });
  list.sort(function (a, b) { var da = a.deadline || a.dt, db = b.deadline || b.dt; return da - db; });
  var h = '<p class="sub">申込窓口が公開されていて、締切前のものを、締切が近い順に並べています。タップして申込に進みます。</p>';
  h += list.length ? '<div class="evlist">' + list.slice(0, 60).map(evCard).join('') + '</div>' : '<div class="empty-msg">いま申込できる月例会は見つかりませんでした。</div>';
  viewEl.innerHTML = h;
}

/* ---------- 画面：記録 ---------- */
function vLog() {
  setTitle('申込の記録');
  var h = '<p class="sub">申込の操作をした支部と日時を、この端末の中だけに記録しています。（実際に送信したかどうかではなく、申込画面を開いた時点の記録です）</p>';
  h += '<input class="field" id="lq" type="search" placeholder="支部名・日付で さがす" aria-label="記録を検索" value="">';
  h += '<div id="loglist"></div>';
  viewEl.innerHTML = h;
  var q = $('#lq'); q.addEventListener('input', renderLog); renderLog();
}
function renderLog() {
  var q = norm(($('#lq') || {}).value), el = $('#loglist'); if (!el) return;
  var list = S.log.slice().sort(function (a, b) { return a.at < b.at ? 1 : -1; }).filter(function (l) { return !q || norm(l.name + l.date + l.area + (METHOD[l.method] || '')).indexOf(q) >= 0; });
  if (!list.length) { el.innerHTML = '<div class="empty-msg" style="margin-top:12px">' + (S.log.length ? '該当する記録がありません。' : 'まだ記録はありません。<br>申込の操作をすると、ここに残ります。') + '</div>'; return; }
  el.innerHTML = '<p class="sub" style="margin-top:12px">' + list.length + '件</p><div class="evlist">' + list.map(function (l) {
    var a = new Date(l.at), d = pd(l.date);
    return '<div class="card"><div class="nm" style="font-weight:800">' + esc(l.name) + '</div><div class="meta sub">開催：' + fmtMD(d) + ' ' + esc(l.time || '') + '</div><div class="badges"><span class="badge done">✓ 申込操作 ' + (a.getMonth() + 1) + '/' + a.getDate() + ' ' + pad(a.getHours()) + ':' + pad(a.getMinutes()) + '</span><span class="badge">' + esc(METHOD[l.method] || l.method) + '</span></div>' +
      '<div style="margin-top:8px"><button class="btn danger small" data-act="dellog" data-key="' + esc(l.key) + '">この記録を削除</button></div></div>';
  }).join('') + '</div>';
}

/* ---------- 画面：設定 ---------- */
function vSettings() {
  setTitle('設定');
  var p = S.profile, h = '';
  h += '<div class="notice ok" style="margin:0 0 8px">' + ico('check') + '<div>入力した情報は、この端末の中だけに保存されます。外部には送られません。</div></div>';
  h += '<h2>プロフィール</h2><p class="sub">申込のときに自動で使います。入力すると自動で保存されます。</p>';
  function fld(f) {
    var id = 'pf_' + f.k, v = p[f.k] || '', ctl;
    if (f.select) ctl = '<select class="field" id="' + id + '" data-pf="' + f.k + '"><option value="">選択してください</option>' + f.select.map(function (o) { return '<option' + (v === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>';
    else if (f.area) ctl = '<textarea class="field" id="' + id + '" data-pf="' + f.k + '">' + esc(v) + '</textarea>';
    else ctl = '<input class="field" id="' + id + '" data-pf="' + f.k + '" type="' + (f.type || 'text') + '" value="' + esc(v) + '" placeholder="' + esc(f.ph || '') + '"' + (f.ac ? ' autocomplete="' + f.ac + '"' : '') + '>';
    return '<div class="fld"><label for="' + id + '">' + f.label + (f.req ? '<span class="req">必須</span>' : '') + '</label>' + ctl + '</div>';
  }
  h += '<h2 style="font-size:1rem;color:var(--navy)">まず登録する項目</h2>' + PROFILE_FIELDS.filter(function (f) { return f.req; }).map(fld).join('');
  h += '<details><summary>そのほかの項目（あとで入力してもOK）</summary>' + PROFILE_FIELDS.filter(function (f) { return !f.req; }).map(fld).join('') + '</details>';
  h += '<h2>バックアップ（機種変更のとき）</h2><div class="card stack"><p class="sub" style="margin:0">プロフィールと記録を、ファイルに書き出せます。新しい端末で「読み込む」と引き継げます。</p>' +
    '<button class="btn ghost" data-act="export">' + ico('open') + 'データを書き出す</button><button class="btn ghost" data-act="import">' + ico('copy') + 'データを読み込む</button><input type="file" id="impfile" accept=".json,application/json" hidden></div>';
  h += '<h2>ホーム画面に追加する</h2><details><summary>やり方を見る</summary><p><b>iPhone（Safari）</b><br>画面下の「共有」ボタン → 「ホーム画面に追加」</p><p><b>Android（Chrome）</b><br>右上の「︙」メニュー → 「ホーム画面に追加」</p><p class="sub">追加すると、アプリのようにワンタップで開けます。</p></details>';
  h += '<h2>このアプリについて</h2><div class="card sub">日程データの最終更新：' + esc(fmtUpdated()) + '<br>取り込み件数：' + (S.data ? S.data.events.length : 0) + '件<br>バージョン：' + APP_VERSION + '<br>日程は公式サイト（nm2014.jp）の公開情報を、1日1回取り込んでいます。このアプリは申込を自動送信しません。</div>';
  h += '<h2>データの削除</h2><button class="btn danger" data-act="wipe">この端末のデータをすべて削除</button>';
  viewEl.innerHTML = h;
}

/* バックアップ */
function exportData() {
  var o = { app: 'nm-entry-helper', version: 1, exportedAt: new Date().toISOString(), profile: S.profile, log: S.log };
  var blob = new Blob([JSON.stringify(o, null, 1)], { type: 'application/json' }), a = document.createElement('a');
  var n = new Date(); a.href = URL.createObjectURL(blob); a.download = 'nm-backup-' + n.getFullYear() + pad(n.getMonth() + 1) + pad(n.getDate()) + '.json';
  document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('書き出しました。ファイルを大切に保管してください');
}
function importData(file) {
  var r = new FileReader();
  r.onload = function () {
    try {
      var o = JSON.parse(r.result);
      if (o.app !== 'nm-entry-helper' || typeof o.profile !== 'object' || !Array.isArray(o.log)) throw 0;
      if (!confirm('いまの端末のデータを、読み込んだ内容で置き換えます。よろしいですか？')) return;
      S.profile = o.profile; S.log = o.log.filter(function (l) { return l && l.key; });
      store.set('profile', S.profile); store.set('log', S.log); toast('読み込みました'); render();
    } catch (e) { alert('このファイルは読み込めません。このアプリで書き出したファイルを選んでください。'); }
  };
  r.readAsText(file);
}

/* ---------- イベント ---------- */
document.addEventListener('click', function (ev) {
  var b = ev.target.closest('[data-act]'); if (!b) return;
  var a = b.dataset.act, D = b.dataset;
  switch (a) {
    case 'tab': S.tab = D.tab; closeOv(); render(); window.scrollTo(0, 0); break;
    case 'view': S.view = D.v; if (S.view === 'cal' && S.month === 'all') S.month = ym(new Date()); render(); break;
    case 'month': S.month = D.m; S.day = ''; renderResults(); break;
    case 'day': S.day = S.day === D.d ? '' : D.d; renderResults(); break;
    case 'filters': openFilters(); break;
    case 'closeov': closeSheet(); break;
    case 'clearf': S.f = { q: '', dow: [], area: '', mode: '', stars: '' }; if ($('#fres')) openFilters(); else render(); break;
    case 'fdow': var i = +D.i, ix = S.f.dow.indexOf(i); if (ix < 0) S.f.dow.push(i); else S.f.dow.splice(ix, 1); b.setAttribute('aria-pressed', ix < 0); updateFres(); break;
    case 'fmode': S.f.mode = D.v; openFilters(); break;
    case 'fstars': S.f.stars = D.v; openFilters(); break;
    case 'detail': openDetail(D.key); break;
    case 'apply': startApply(D.key); break;
    case 'copy': copyText(S.profile[D.k] || '', FIELD_LABEL[D.k]); break;
    case 'copyfield': copyText($('#' + D.from).value, '本文'); break;
    case 'logopen': var e1 = findEvent(D.key); if (e1) { logApply(e1, D.m); toast('申込の記録を残しました。まだ送信されていません'); } break;
    case 'lineopen':
      var e3 = findEvent(D.key), txt = $('#lbody').value; logApply(e3, 'line'); copyText(txt, '申込文');
      var url = /^https?:\/\/(line\.me|lin\.ee)\//.test(D.u) ? D.u : 'https://line.me/R/';
      setTimeout(function () { window.open(url, '_blank', 'noopener'); }, 400); break;
    case 'dellog': if (confirm('この記録を削除しますか？')) { S.log = S.log.filter(function (l) { return l.key !== D.key; }); store.set('log', S.log); renderLog(); } break;
    case 'export': exportData(); break;
    case 'import': $('#impfile').click(); break;
    case 'wipe': if (confirm('この端末のプロフィールと記録を、すべて削除します。元に戻せません。よろしいですか？') && confirm('本当に削除しますか？（バックアップはお済みですか？）')) { S.profile = {}; S.log = []; store.del('profile'); store.del('log'); toast('削除しました'); render(); } break;
  }
});
document.addEventListener('input', function (ev) {
  var t = ev.target;
  if (t.dataset && t.dataset.pf) { S.profile[t.dataset.pf] = t.value.trim(); store.set('profile', S.profile); }
});
document.addEventListener('change', function (ev) {
  var t = ev.target;
  if (t.id === 'impfile' && t.files[0]) { importData(t.files[0]); t.value = ''; }
  if (t.dataset && t.dataset.bind === 'month') { S.month = t.value; S.day = ''; if ($('#fres')) updateFres(); renderResults(); }
  if (t.dataset && t.dataset.bind === 'area') { S.f.area = t.value; updateFres(); updateTags(); renderResults(); }
});

/* ---------- 起動 ---------- */
function welcome() {
  if (store.get('welcomed', false)) return;
  store.set('welcomed', true);
  showSheet('<div class="grip"></div><h3>ようこそ！</h3><p>月例会への申込を、かんたんにするアプリです。</p>' +
    '<div class="card stack"><div class="step"><span class="no">1</span><div><b>支部を えらぶ</b></div></div><div class="step"><span class="no">2</span><div><b>「申し込む」を タップ</b></div></div><div class="step"><span class="no">3</span><div><b>内容を確認して、ご自分で送信</b><div class="sub">このアプリは勝手に送信しません</div></div></div></div>' +
    '<div class="stack" style="margin-top:14px"><button class="btn accent" data-act="tab" data-tab="settings">プロフィールを登録する</button><button class="btn ghost" data-act="closeov">あとで</button></div>');
}
render();
loadData().then(function () { render(); if (S.data) welcome(); });
if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
