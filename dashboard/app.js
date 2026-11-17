// Token launch radar dashboard. All data comes from data.js (window.RADAR);
// this page makes no network requests.
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) return;

  var rows = D.rows;
  var live = D.live;

  // --- small helpers ---------------------------------------------------------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shortMoney(v) {
    if (v === null || v === undefined) return '—';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + v;
  }
  function fullMoney(v) {
    if (v === null || v === undefined) return '—';
    return '$' + Math.round(v).toLocaleString('en-US');
  }
  function pct(v) {
    if (v === null || v === undefined) return '—';
    var s = (v > 0 ? '+' : '') + v.toFixed(2) + '%';
    return s;
  }
  function pctClass(v) {
    if (v === null || v === undefined) return '';
    return v >= 0 ? 'up' : 'down';
  }
  function ageText(a) {
    if (a === null || a === undefined) return '—';
    return a + 'd';
  }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  // --- page header -----------------------------------------------------------
  function moneyFloor(v) { return shortMoney(v); }
  document.getElementById('subtitle').textContent =
    'Snapshot ' + D.as_of + ' · ' + D.source + ' · watchlist floor ' + moneyFloor(D.floor_usd);
  document.getElementById('summary').innerHTML =
    stat(D.board_size, 'board rows') +
    stat(D.watchlist_size, 'on watchlist') +
    stat(D.early_size, 'early finds') +
    stat(D.live_size, 'live set aside');
  function stat(v, label) {
    return '<div class="stat"><b>' + v + '</b><span>' + esc(label) + '</span></div>';
  }
  document.getElementById('formula').textContent =
    'implied = TVL × category multiple × growth × maturity × chain   ·   ' +
    'growth = 1 + clamp(7d change, -50, 100) / 100 × 0.6   ·   ' +
    'maturity = 0.7 + min(age, 1095) / 1095 × 0.3   ·   ' +
    'chain = 1 + 0.02 × min(chains − 1, 5)   ·   ' +
    'category multiple = median mcap / TVL of live-token protocols in the category ' +
    '(at least 3, otherwise the global median ' + D.global_multiple + 'x), clamped 0.05x – 2.5x.';

  // --- filter controls -------------------------------------------------------
  var qEl = document.getElementById('q');
  var catEl = document.getElementById('category');
  var chainEl = document.getElementById('chain');
  var minTvlEl = document.getElementById('min-tvl');
  var wlEl = document.getElementById('watchlist-only');

  var cats = {};
  var chains = {};
  rows.forEach(function (r) {
    if (r.category) cats[r.category] = true;
    r.chains.forEach(function (c) { chains[c] = true; });
  });
  Object.keys(cats).sort().forEach(function (c) {
    catEl.add(new Option(c, c));
  });
  Object.keys(chains).sort().forEach(function (c) {
    chainEl.add(new Option(c, c));
  });

  var state = { sortKey: 'rank', sortDir: 1, tab: 'board' };

  function filteredRows() {
    var q = qEl.value.trim().toLowerCase();
    var cat = catEl.value;
    var ch = chainEl.value;
    var minTvl = Number(minTvlEl.value);
    var wlOnly = wlEl.checked;
    var out = rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.indexOf(q) === -1) return false;
      if (cat && r.category !== cat) return false;
      if (ch && r.chains.indexOf(ch) === -1) return false;
      if (minTvl && r.tvl_usd < minTvl) return false;
      if (wlOnly && !r.on_watchlist) return false;
      return true;
    });
    return sortRows(out, state.sortKey, state.sortDir);
  }

  function sortRows(list, key, dir) {
    var copy = list.slice();
    copy.sort(function (a, b) {
      var av = sortVal(a, key), bv = sortVal(b, key);
      if (av === bv) return a.slug < b.slug ? -1 : 1;
      return (av < bv ? -1 : 1) * dir;
    });
    return copy;
  }
  function sortVal(r, key) {
    if (key === 'chain') return r.chains[0] || '';
    if (key === 'age') return r.age_days === null ? -1 : r.age_days;
    if (key === 'change') return r.change_7d === null ? -9999 : r.change_7d;
    if (key === 'name' || key === 'category') return (r[key] || '').toLowerCase();
    return r[key];
  }

  // --- board table -----------------------------------------------------------
  var boardCols = [
    { key: 'rank', label: '#', num: true },
    { key: 'name', label: 'Protocol' },
    { key: 'category', label: 'Category' },
    { key: 'chain', label: 'Chain' },
    { key: 'tvl', label: 'TVL', num: true },
    { key: 'change', label: '7d', num: true },
    { key: 'age', label: 'Age', num: true },
    { key: 'implied', label: 'Implied value', num: true },
  ];
  // data rows carry tvl_usd / implied_value_usd; map the short keys.
  function boardVal(r, key) {
    if (key === 'tvl') return r.tvl_usd;
    if (key === 'implied') return r.implied_value_usd;
    return sortVal(r, key);
  }
  var boardHead = document.getElementById('board-head');
  boardHead.innerHTML = boardCols.map(function (c) {
    return '<th data-key="' + c.key + '" class="sortable' + (c.num ? ' num' : '') + '">' + c.label + '</th>';
  }).join('');
  var boardBody = document.querySelector('#board tbody');

  function renderBoard() {
    var list = filteredRows();
    document.getElementById('count').textContent =
      list.length + ' of ' + rows.length + ' protocols' +
      (list.length !== rows.length ? ' match the filters' : '');
    boardHead.querySelectorAll('th').forEach(function (th) {
      th.classList.toggle('sorted', th.dataset.key === state.sortKey);
      var arrow = th.dataset.key === state.sortKey ? (state.sortDir === 1 ? ' ▲' : ' ▼') : '';
      var col = boardCols.filter(function (c) { return c.key === th.dataset.key; })[0];
      th.textContent = col.label + arrow;
    });
    boardBody.innerHTML = list.map(function (r) {
      var chainCell = esc(r.chains[0]) + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '');
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + (r.on_watchlist ? ' <span class="wl" title="On the watchlist">●</span>' : '') + '</td>' +
        '<td>' + esc(r.name) + '</td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + chainCell + '</td>' +
        '<td class="num">' + shortMoney(r.tvl_usd) + '</td>' +
        '<td class="num ' + pctClass(r.change_7d) + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num"><b>' + shortMoney(r.implied_value_usd) + '</b></td>' +
        '</tr>';
    }).join('');
  }
  boardHead.addEventListener('click', function (e) {
    var th = e.target.closest('th');
    if (!th) return;
    var key = th.dataset.key;
    if (state.sortKey === key) state.sortDir = -state.sortDir;
    else { state.sortKey = key; state.sortDir = key === 'name' || key === 'category' || key === 'chain' ? 1 : -1; }
    renderBoard();
  });
  boardBody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr');
    if (tr) openDetail(tr.dataset.slug);
  });

  // --- live table ------------------------------------------------------------
  var liveCols = [
    { key: 'name', label: 'Protocol' },
    { key: 'category', label: 'Category' },
    { key: 'chain', label: 'Chain' },
    { key: 'tvl', label: 'TVL', num: true },
    { key: 'mcap', label: 'Market cap', num: true },
    { key: 'ratio', label: 'Mcap / TVL', num: true },
    { key: 'change', label: '7d', num: true },
  ];
  var liveHead = document.getElementById('live-head');
  liveHead.innerHTML = liveCols.map(function (c) {
    return '<th data-key="' + c.key + '" class="sortable' + (c.num ? ' num' : '') + '">' + c.label + '</th>';
  }).join('');
  var liveBody = document.querySelector('#live tbody');
  var liveSort = { key: 'mcap', dir: -1 };
  function renderLive() {
    var list = live.slice();
    list.sort(function (a, b) {
      var av = liveVal(a, liveSort.key), bv = liveVal(b, liveSort.key);
      if (av === bv) return a.slug < b.slug ? -1 : 1;
      return (av < bv ? -1 : 1) * liveSort.dir;
    });
    liveHead.querySelectorAll('th').forEach(function (th) {
      th.classList.toggle('sorted', th.dataset.key === liveSort.key);
      var col = liveCols.filter(function (c) { return c.key === th.dataset.key; })[0];
      th.textContent = col.label + (th.dataset.key === liveSort.key ? (liveSort.dir === 1 ? ' ▲' : ' ▼') : '');
    });
    liveBody.innerHTML = list.map(function (r) {
      return '<tr>' +
        '<td>' + esc(r.name) + '</td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains[0]) + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '') + '</td>' +
        '<td class="num">' + shortMoney(r.tvl_usd) + '</td>' +
        '<td class="num">' + shortMoney(r.mcap_usd) + '</td>' +
        '<td class="num">' + (r.mcap_usd / r.tvl_usd).toFixed(4) + 'x</td>' +
        '<td class="num ' + pctClass(r.change_7d) + '">' + pct(r.change_7d) + '</td>' +
        '</tr>';
    }).join('');
  }
  function liveVal(r, key) {
    if (key === 'tvl') return r.tvl_usd;
    if (key === 'mcap') return r.mcap_usd;
    if (key === 'ratio') return r.mcap_usd / r.tvl_usd;
    if (key === 'change') return r.change_7d === null ? -9999 : r.change_7d;
    if (key === 'chain') return r.chains[0] || '';
    return (r[key] || '').toLowerCase();
  }
  liveHead.addEventListener('click', function (e) {
    var th = e.target.closest('th');
    if (!th) return;
    var key = th.dataset.key;
    if (liveSort.key === key) liveSort.dir = -liveSort.dir;
    else { liveSort.key = key; liveSort.dir = key === 'name' || key === 'category' || key === 'chain' ? 1 : -1; }
    renderLive();
  });

  // --- tabs ------------------------------------------------------------------
  var tabBoard = document.getElementById('tab-board');
  var tabLive = document.getElementById('tab-live');
  function showTab(tab) {
    state.tab = tab;
    tabBoard.classList.toggle('active', tab === 'board');
    tabLive.classList.toggle('active', tab === 'live');
    document.getElementById('board-view').hidden = tab !== 'board';
    document.getElementById('live-view').hidden = tab !== 'live';
    if (tab === 'live') renderLive();
  }
  tabBoard.addEventListener('click', function () { showTab('board'); });
  tabLive.addEventListener('click', function () { showTab('live'); });

  [qEl, catEl, chainEl, minTvlEl, wlEl].forEach(function (el) {
    el.addEventListener('input', renderBoard);
    el.addEventListener('change', renderBoard);
  });

  // --- multiples table -------------------------------------------------------
  document.querySelector('#multiples tbody').innerHTML = D.multiples.map(function (m) {
    return '<tr><td>' + esc(m.category) + '</td><td class="num">' + m.n + '</td><td class="num">' + m.median.toFixed(4) + 'x</td></tr>';
  }).join('');

  // --- farm plan (rebuilt in the browser from the same record fields) --------
  var VAULT = { 'Risk Curators': 1, 'Onchain Capital Allocator': 1 };
  var SUPPLY = { 'Lending': 1, 'CDP': 1, 'Collateral Markets': 1, 'Uncollateralized Lending': 1 };
  var LIQ = { 'Dexs': 1, 'Indexes': 1, 'Leveraged Farming': 1, 'Yield': 1, 'Yield Aggregator': 1 };
  var MARGIN = { 'Derivatives': 1, 'Interest Rate Derivatives': 1 };
  var STAKE = { 'Restaking': 1, 'Staking Pool': 1 };
  var STABLE = { 'Dual-Token Stablecoin': 1, 'Stablecoin Wrapper': 1 };

  function farmTier(tvl) {
    if (tvl >= 1e9) return 150;
    if (tvl >= 1e8) return 100;
    return 50;
  }
  function farmHold(age) {
    var eff = age === null ? D.model.unknown_age_days : age;
    if (eff < 180) return 60;
    if (eff < 365) return 45;
    return 30;
  }
  function farmAction(r, tier) {
    var chain = r.chains[0], name = r.name, cat = r.category;
    if (VAULT[cat]) return 'Deposit $' + tier + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares in the same wallet.';
    if (SUPPLY[cat]) return 'Supply $' + tier + ' of USDC to ' + name + ' on ' + chain + ', then borrow a small amount against it so both sides of the position are active.';
    if (LIQ[cat]) return 'Provide $' + tier + ' of liquidity to ' + name + '\'s main pool on ' + chain + ' in a narrow range and keep the position open.';
    if (MARGIN[cat]) return 'Deposit $' + tier + ' of USDC as margin on ' + name + ' and open one small hedged trade, then close it the same week.';
    if (cat === 'RWA') return 'Mint $' + tier + ' of the protocol\'s yield-bearing asset on ' + chain + ' and hold it without moving it between wallets.';
    if (STABLE[cat]) return 'Mint or deposit $' + tier + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it for the full period.';
    if (STAKE[cat]) return 'Stake $' + tier + ' of the chain\'s staking asset through ' + name + ' and keep the receipt token in the same wallet.';
    if (cat === 'Chain') return 'Bridge $' + tier + ' to ' + name + ' on ' + chain + ', use one of its native apps, and keep the funds there.';
    if (cat === 'Payments') return 'Send $' + tier + ' through ' + name + ' on ' + chain + ' for a real payment and keep the receipt.';
    if (cat === 'Insurance') return 'Buy $' + tier + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active for the full period.';
    if (cat === 'Prediction Market') return 'Fund $' + tier + ' on ' + name + ' and place one small market position, then settle it before the market resolves.';
    return 'Deposit $' + tier + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function farmRisk(cat) {
    var tail = ' Cost: nothing to check, and it can save the whole position. Time: 10 minutes to read the docs.';
    if (SUPPLY[cat]) return 'A sharp price drop can liquidate a borrow, so keep the loan small next to the supplied collateral and watch the health factor.' + tail;
    if (MARGIN[cat]) return 'Leverage can wipe margin fast, so keep the trade small, use an isolated margin account and set a stop before you open it.' + tail;
    if (LIQ[cat]) return 'Impermanent loss can eat the yield if the pair moves hard, so use a stable pair or a narrow range and check the position weekly.' + tail;
    if (cat === 'RWA') return 'The underlying asset can be frozen or revalued, so read what backs the token before you mint.' + tail;
    if (STAKE[cat]) return 'Staked funds can be locked or slashed, so check the unbonding period before you stake anything.' + tail;
    if (cat === 'Insurance') return 'Cover pays only for the events it names, so read the policy terms before you buy.' + tail;
    return 'Smart contract risk applies to every protocol, so never farm with funds you cannot afford to lose and check the protocol\'s audits first.' + tail;
  }
  function farmPlan(r) {
    var tier = farmTier(r.tvl_usd);
    var gas = tier >= 150 ? 8 : 4;
    var hold = farmHold(r.age_days);
    return [
      'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper. Cost: under $3 of gas for the first transaction. Time: 5 minutes.',
      farmAction(r, tier) + ' Cost: $' + tier + ' of capital and about $' + gas + ' of gas. Time: 15 minutes to set up.',
      'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and keep doing it while the position is open. Cost: about $2 of gas a week. Time: 10 minutes a week.',
      'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot. Cost: the $' + tier + ' stays in the position. Time: ' + hold + ' days.',
      farmRisk(r.category),
      'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes, and never pay a fee to claim. Cost: no fee to check. Time: 10 minutes.',
      'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it later. Cost: nothing but the log. Time: 5 minutes.',
    ];
  }

  // --- detail view -----------------------------------------------------------
  var dlg = document.getElementById('detail');
  var detailBody = document.getElementById('detail-body');

  function recompute(r) {
    var change = r.change_7d === null ? 0 : r.change_7d;
    var growth = 1 + clamp(change, -50, 100) / 100 * 0.6;
    var eff = r.age_days === null ? D.model.unknown_age_days : r.age_days;
    var maturity = 0.7 + Math.min(eff, 1095) / 1095 * 0.3;
    var chain = 1 + 0.02 * Math.min(r.chains.length - 1, 5);
    return Math.max(1, Math.round(r.tvl_usd * r.category_multiple * growth * maturity * chain));
  }

  function openDetail(slug) {
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) { r = rows[i]; break; }
    if (!r) return;
    var again = recompute(r);
    var same = again === r.implied_value_usd;
    var peers = live.filter(function (l) { return l.category === r.category; })
      .sort(function (a, b) { return b.mcap_usd - a.mcap_usd; }).slice(0, 3);
    var peerHtml;
    if (peers.length) {
      peerHtml = '<table class="small"><thead><tr><th>Live protocol</th><th class="num">Market cap</th><th class="num">Mcap / TVL</th></tr></thead><tbody>' +
        peers.map(function (p) {
          return '<tr><td>' + esc(p.name) + '</td><td class="num">' + shortMoney(p.mcap_usd) + '</td><td class="num">' + (p.mcap_usd / p.tvl_usd).toFixed(4) + 'x</td></tr>';
        }).join('') + '</tbody></table>';
    } else {
      peerHtml = '<p class="muted">No live-token protocol from this category is in the top-24 live set, so there is no same-category comparable to show.</p>';
    }
    var steps = farmPlan(r).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    detailBody.innerHTML =
      '<h2>' + esc(r.name) + '</h2>' +
      '<p class="sub">Rank #' + r.rank + ' · ' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ')) +
      (r.on_watchlist ? ' · <span class="wl">On the watchlist</span>' : '') + '</p>' +
      '<div class="kv">' +
      '<div><b>' + fullMoney(r.implied_value_usd) + '</b><span>implied value</span></div>' +
      '<div><b>' + fullMoney(r.tvl_usd) + '</b><span>TVL</span></div>' +
      '<div><b class="' + pctClass(r.change_7d) + '">' + pct(r.change_7d) + '</b><span>7d change</span></div>' +
      '<div><b>' + ageText(r.age_days) + '</b><span>tracked' + (r.age_days === null ? ' (start unknown)' : '') + '</span></div>' +
      '</div>' +
      '<h3>Model breakdown</h3>' +
      '<div class="breakdown">' +
      factor('Base · TVL × multiple', r.tvl_usd * r.category_multiple, r.category_multiple.toFixed(4) + 'x') +
      factor('Growth · 7d ' + pct(r.change_7d), r.growth_multiplier, '×' + r.growth_multiplier.toFixed(4)) +
      factor('Maturity · ' + ageText(r.age_days), r.maturity_multiplier, '×' + r.maturity_multiplier.toFixed(4)) +
      factor('Chains · ' + r.chains.length, r.chain_multiplier, '×' + r.chain_multiplier.toFixed(2)) +
      '</div>' +
      '<p class="recompute">Recompute from the snapshot figures: <b>' + fullMoney(again) + '</b> — ' +
      (same ? '<b class="match">the same number board.json carries.</b>' : '<b class="miss">differs from board.json (' + fullMoney(r.implied_value_usd) + ').</b>') + '</p>' +
      '<h3>Live comparables · ' + esc(r.category || 'Uncategorised') + '</h3>' + peerHtml +
      '<h3>How to farm it</h3>' +
      '<ol class="farm">' + steps + '</ol>' +
      '<p class="muted">This protocol records no token in the snapshot dated ' + D.as_of + '. That is what the record says, not proof that no token exists.</p>';
    if (!dlg.open) dlg.showModal();
    try { history.replaceState(null, '', '#p=' + r.slug); } catch (e) { /* file URLs may refuse */ }
  }
  function factor(label, value, shown) {
    var width = Math.max(2, Math.min(100, value / 3));
    return '<div class="factor"><span>' + esc(label) + '</span><span class="bar"><i style="width:' + width.toFixed(1) + '%"></i></span><span class="val">' + esc(shown) + '</span></div>';
  }

  dlg.addEventListener('close', function () {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  });

  // --- deep links ------------------------------------------------------------
  function applyHash() {
    var h = location.hash.replace(/^#/, '');
    var parts = h.split('&');
    var params = {};
    parts.forEach(function (p) {
      var kv = p.split('=');
      if (kv[0]) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    if (params.category) {
      var found = false;
      for (var i = 0; i < catEl.options.length; i++) {
        if (catEl.options[i].value === params.category) { found = true; break; }
      }
      if (found) { catEl.value = params.category; renderBoard(); }
    }
    if (params.p) openDetail(params.p);
  }
  window.addEventListener('hashchange', applyHash);

  renderBoard();
  applyHash();
})();
