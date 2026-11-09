(function () {
  "use strict";
  var KEY = "timeledger.v1";
  var CATS = { eleitoral: "Créditos eleitorais", ferias: "Férias remuneradas", coletiva: "Folgas coletivas", folga: "Folga do banco de horas", atestado: "Atestado" };
  var ICONS = {
    hoje: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    dias: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    folgas: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    conferir: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
    ajustes: '<path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="2"/>'
  };
  var TABS = [["hoje", "Hoje"], ["dias", "Dias"], ["folgas", "Folgas"], ["conferir", "Conferir"], ["ajustes", "Ajustes"]];
  var DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  var DOWL = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  var MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  function emptyState() {
    return { example: false, settings: { daily: 480, tolerance: 5, opening: 0, startDate: "", holidays: "" }, punches: {}, ledger: [], official: {} };
  }
  function sample() {
    var s = emptyState();
    s.example = true;
    s.settings.opening = 1200;
    s.settings.holidays = "02/11/2026 15/11/2026";
    s.punches = {
      "2026-10-26": ["08:00", "12:05", "13:00", "17:10"], "2026-10-27": ["08:02", "12:00", "13:00", "17:30"],
      "2026-10-28": ["07:55", "12:00", "13:05", "19:00"], "2026-10-29": ["08:00", "12:00", "13:00", "17:00"],
      "2026-11-03": ["08:00", "12:00", "13:00", "17:00"], "2026-11-04": ["08:00", "12:00", "13:00", "18:15"],
      "2026-11-06": ["08:10", "12:00", "13:00"]
    };
    s.ledger = [
      { id: "e1", cat: "eleitoral", kind: "credito", date: "2026-10-04", qty: 2, note: "Convocação eleitoral (exemplo)" },
      { id: "e2", cat: "eleitoral", kind: "uso", date: "2026-11-20", qty: 1, note: "Folga marcada (exemplo)" },
      { id: "e3", cat: "ferias", kind: "credito", date: "2026-01-01", qty: 30, note: "Período aquisitivo (exemplo)" },
      { id: "e4", cat: "ferias", kind: "uso", date: "2026-07-06", qty: 10, note: "Primeira parcela (exemplo)" },
      { id: "e5", cat: "coletiva", kind: "credito", date: "2026-01-01", qty: 3, note: "Calendário do órgão (exemplo)" },
      { id: "e6", cat: "coletiva", kind: "uso", date: "2026-12-24", qty: 1, note: "Véspera de Natal (exemplo)" },
      { id: "e7", cat: "folga", kind: "uso", date: "2026-11-05", qty: 1, note: "Compensação de horas (exemplo)" }
    ];
    s.official = { date: "2026-11-06", banco: "+4:10", eleitoral: "2", ferias: "20", coletiva: "2" };
    return s;
  }

  var state = loadLocal() || emptyState();
  var tab = "hoje";
  var pending = null;
  var showImport = false;
  var flash = { hoje: "", dias: "", folgas: "", conferir: "", ajustes: "" };
  var storageOk = true;

  /* ---------- storage: this browser only ---------- */
  function loadLocal() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { var s = JSON.parse(raw); if (s && s.settings && s.punches && s.ledger) { s.official = s.official || {}; return s; } }
    } catch (e) {}
    return null;
  }
  function setSync(text, cls) {
    var el = document.getElementById("sync");
    if (!el) return;
    el.textContent = text; el.className = cls || "";
  }
  function commit() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; setSync("Salvo neste aparelho", "ok"); }
    catch (e) { storageOk = false; setSync("Não foi possível salvar. Baixe um backup.", "bad"); }
  }
  function hasData(s) { return Object.keys(s.punches).length > 0 || s.ledger.length > 0; }

  /* ---------- helpers ---------- */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function isoOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function dateOf(iso) { var p = iso.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function br(iso) { var p = iso.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function toMin(t) { var p = t.split(":"); return +p[0] * 60 + +p[1]; }
  function hhmm(m) { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }
  function dur(m, signed) {
    var s = m < 0 ? "-" : (signed && m > 0 ? "+" : "");
    var a = Math.abs(Math.round(m));
    return s + Math.floor(a / 60) + "h" + pad(a % 60);
  }
  function parseDur(str) {
    if (str == null) return null;
    var t = String(str).trim().toLowerCase().replace(",", ".");
    if (!t) return null;
    var sign = 1;
    if (t[0] === "-") { sign = -1; t = t.slice(1); } else if (t[0] === "+") { t = t.slice(1); }
    var m = t.match(/^(\d+)\s*[:h]\s*(\d{1,2})?$/);
    if (m) return sign * (+m[1] * 60 + (m[2] ? +m[2] : 0));
    if (/^\d+(\.\d+)?$/.test(t)) return sign * Math.round(parseFloat(t) * 60);
    return null;
  }
  function numCls(v) { return v > 0 ? "pos" : (v < 0 ? "neg" : ""); }
  function holidaySet() {
    var set = {};
    (state.settings.holidays || "").split(/[\s,;]+/).forEach(function (h) {
      var m = h.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) set[m[3] + "-" + pad(+m[2]) + "-" + pad(+m[1])] = true;
    });
    return set;
  }
  function isWorkday(d, hol) { var w = d.getDay(); return w !== 0 && w !== 6 && !hol[isoOf(d)]; }
  function justifiedDays(hol) {
    var map = {};
    state.ledger.forEach(function (e) {
      if (e.kind !== "uso") return;
      var d = dateOf(e.date), left = Math.max(1, Math.round(e.qty)), guard = 0;
      while (left > 0 && guard < 800) {
        if (isWorkday(d, hol)) { map[isoOf(d)] = e.cat; left--; }
        d.setDate(d.getDate() + 1); guard++;
      }
    });
    return map;
  }
  function pairsWorked(pts) {
    var w = 0;
    for (var i = 0; i + 1 < pts.length; i += 2) w += toMin(pts[i + 1]) - toMin(pts[i]);
    return w;
  }

  /* ---------- calculation ---------- */
  function compute() {
    var hol = holidaySet(), just = justifiedDays(hol);
    var daily = +state.settings.daily || 0, tol = +state.settings.tolerance || 0;
    var tIso = isoOf(new Date());
    var y = new Date(); y.setDate(y.getDate() - 1);
    var yIso = isoOf(y);
    var dates = Object.keys(state.punches).sort();
    var past = dates.filter(function (d) { return d <= yIso; });
    var rows = [], alerts = [], extra = 0, debit = 0, faltas = [], incompletas = [];
    if (past.length) {
      var start = state.settings.startDate && state.settings.startDate < past[0] ? state.settings.startDate : past[0];
      var d = dateOf(start), last = dateOf(past[past.length - 1]);
      while (d <= last) {
        var iso = isoOf(d), pts = state.punches[iso] || [];
        var sat = d.getDay() === 6, satMin = +state.settings.sat || 0;
        var weekend = d.getDay() === 0 || (sat && !satMin), holiday = !!hol[iso], j = just[iso];
        var expected = (weekend || holiday || (j && j !== "folga")) ? 0 : (sat ? satMin : daily);
        var worked = pairsWorked(pts), odd = pts.length % 2 === 1;
        var delta = worked - expected;
        if (Math.abs(delta) <= tol && expected > 0 && worked > 0) delta = 0;
        var status, label;
        if (pts.length) {
          if (odd) { status = "bad"; label = "Marcação incompleta"; incompletas.push(iso); }
          else if (delta > 0) { status = "ok"; label = "Hora extra"; }
          else if (delta < 0) { status = "warn"; label = "Horas devidas"; }
          else { status = "ok"; label = "Em dia"; }
        } else if (holiday) { status = "plain"; label = "Feriado"; }
        else if (j) { status = "plain"; label = CATS[j]; }
        else if (weekend) { status = "plain"; label = "Fim de semana"; }
        else { status = "bad"; label = "Falta"; faltas.push(iso); }
        var quiet = !pts.length && (weekend || holiday);
        if (!quiet) { if (delta > 0) extra += delta; else debit += -delta; }
        rows.push({ iso: iso, pts: pts, worked: worked, delta: delta, status: status, label: label, has: !!state.punches[iso], hidden: quiet });
        d.setDate(d.getDate() + 1);
      }
    }
    if (state.punches[tIso]) {
      rows.push({ iso: tIso, pts: state.punches[tIso], worked: pairsWorked(state.punches[tIso]), delta: 0, status: "plain", label: "Em andamento", has: true, today: true });
    }
    var opening = +state.settings.opening || 0;
    var banco = opening + extra - debit;
    var cats = {};
    ["eleitoral", "ferias", "coletiva"].forEach(function (c) {
      var cr = 0, us = 0;
      state.ledger.forEach(function (e) { if (e.cat === c) { if (e.kind === "credito") cr += e.qty; else us += e.qty; } });
      cats[c] = { credit: cr, used: us, saldo: cr - us };
    });
    var off = state.official || {}, checks = [], ob = parseDur(off.banco);
    if (ob !== null) checks.push({ key: "banco", name: "Banco de horas", mine: banco, official: ob, diff: banco - ob, hours: true, ok: Math.abs(banco - ob) <= tol });
    ["eleitoral", "ferias", "coletiva"].forEach(function (c) {
      var v = off[c];
      if (v !== undefined && String(v).trim() !== "" && !isNaN(parseFloat(v))) {
        var o = parseFloat(v);
        checks.push({ key: c, name: CATS[c], mine: cats[c].saldo, official: o, diff: cats[c].saldo - o, hours: false, ok: cats[c].saldo === o });
      }
    });
    checks.forEach(function (c) {
      if (!c.ok) {
        var f = function (v) { return c.hours ? dur(v, true) : v + " d"; };
        alerts.push({ level: "bad", text: "<b>" + esc(c.name) + ":</b> seu controle mostra " + esc(f(c.mine)) + " e o oficial " + esc(f(c.official)) + ". Diferença de " + esc(c.hours ? dur(c.diff, true) : (c.diff > 0 ? "+" : "") + c.diff + " d") + "." });
      }
    });
    if (faltas.length) alerts.push({ level: "bad", text: "<b>" + faltas.length + (faltas.length === 1 ? " falta" : " faltas") + " sem justificativa:</b> " + faltas.map(br).join(", ") + ". Lance uma folga ou férias se for o caso." });
    if (incompletas.length) alerts.push({ level: "warn", text: "<b>Marcação incompleta</b> em " + incompletas.map(br).join(", ") + ". Só os pares de entrada e saída entram na conta." });
    ["eleitoral", "ferias", "coletiva"].forEach(function (c) {
      if (cats[c].saldo < 0) alerts.push({ level: "bad", text: "<b>" + esc(CATS[c]) + ":</b> você usou " + (-cats[c].saldo) + " d a mais do que o crédito lançado." });
    });
    if (banco < 0) alerts.push({ level: "warn", text: "<b>Banco de horas negativo:</b> " + dur(banco, true) + "." });
    return { rows: rows, extra: extra, debit: debit, opening: opening, banco: banco, cats: cats, checks: checks, alerts: alerts, dates: dates };
  }

  function todayInfo() {
    var now = new Date(), iso = isoOf(now), nowM = now.getHours() * 60 + now.getMinutes();
    var pts = state.punches[iso] || [];
    var hol = holidaySet(), just = justifiedDays(hol), j = just[iso];
    var sat = now.getDay() === 6, satMin = +state.settings.sat || 0;
    var weekend = now.getDay() === 0 || (sat && !satMin), holiday = !!hol[iso];
    var daily = +state.settings.daily || 0;
    var expected = (weekend || holiday || (j && j !== "folga")) ? 0 : (sat ? satMin : daily);
    var open = pts.length % 2 === 1;
    var worked = pairsWorked(pts);
    if (open) worked += Math.max(0, nowM - toMin(pts[pts.length - 1]));
    var kind = holiday ? "Feriado" : (weekend ? "Fim de semana" : (j ? CATS[j] : "Dia útil"));
    var exitAt = (open && expected - worked > 0) ? nowM + (expected - worked) : null;
    return { iso: iso, pts: pts, worked: worked, expected: expected, open: open, kind: kind, exitAt: exitAt, now: now };
  }

  /* ---------- views ---------- */
  function exampleNotice() {
    return '<div class="notice"><span>Você está vendo dados de exemplo.</span><button class="btn ghost" data-act="clear-example">Limpar exemplo</button></div>';
  }
  function statusOf(ck) {
    if (!ck) return '<span class="pill plain">Sem dado oficial</span>';
    return ck.ok ? '<span class="pill">Confere</span>' : '<span class="pill bad">Diverge</span>';
  }
  function pillHtml(s, label) { return '<span class="pill ' + (s === "ok" ? "" : s) + '">' + esc(label) + "</span>"; }

  function viewHoje(c) {
    var t = todayInfo(), n = t.now, h = "";
    if (state.example) h += exampleNotice();
    h += '<section class="card hero"><div class="between"><span class="label">' + esc(DOWL[n.getDay()] + ", " + n.getDate() + " de " + MONTHS[n.getMonth()]) + '</span><span class="pill plain">' + esc(t.kind) + "</span></div>";
    h += '<div class="clock" id="clock">' + pad(n.getHours()) + ":" + pad(n.getMinutes()) + ":" + pad(n.getSeconds()) + "</div>";
    h += '<button class="btn punch" data-act="punch">' + (t.open ? "Registrar saída" : "Registrar entrada") + "</button>";
    h += '<div class="msg" id="msg-hoje">' + esc(flash.hoje) + "</div>";
    if (t.pts.length) {
      h += '<div class="chips">';
      t.pts.forEach(function (p, i) {
        h += '<span class="chip">' + (i % 2 === 0 ? "ent " : "sai ") + esc(p) + '<button data-act="del-punch" data-id="' + esc(p) + '" aria-label="Remover ' + esc(p) + '">' + (pending === "t" + p ? '<span class="confirm">Remover?</span>' : "×") + "</button></span>";
      });
      h += "</div>";
    } else { h += '<p class="hint">Nenhum registro hoje.</p>'; }
    h += '<div class="between"><span class="muted">Trabalhado hoje</span><span class="mono"><b id="tw">' + dur(t.worked) + '</b> <span class="muted">de ' + dur(t.expected) + "</span></span></div>";
    h += '<div class="between" id="exitrow"' + (t.exitAt === null ? " hidden" : "") + '><span class="muted">Saída prevista, sem mais pausas</span><b class="mono" id="exitat">' + (t.exitAt === null ? "" : hhmm(t.exitAt)) + "</b></div>";
    h += '<p class="hint">Este registro é só seu e não substitui o ponto oficial.</p></section>';

    h += '<section class="card"><h2>Alertas</h2><div class="stack">';
    if (c.alerts.length) c.alerts.forEach(function (a) { h += '<div class="alert ' + a.level + '">' + a.text + "</div>"; });
    else h += '<div class="alert ok"><b>Tudo conferido.</b> Nenhuma divergência ou pendência.</div>';
    h += "</div></section>";

    if (!hasData(state)) {
      h += '<section class="card empty"><h2>Comece por aqui</h2><p class="muted">Registre a primeira batida acima, importe o espelho de ponto na aba Dias, ou veja o app com dados de exemplo.</p><button class="btn ghost" data-act="load-example">Ver exemplo</button></section>';
      return h;
    }

    var inn = c.extra + (c.opening > 0 ? c.opening : 0), out = c.debit + (c.opening < 0 ? -c.opening : 0);
    var cb = c.checks.filter(function (x) { return x.key === "banco"; })[0];
    h += '<section class="card"><div class="between"><span class="label">Banco de horas, até ontem</span>' + statusOf(cb) + "</div>";
    h += '<div class="big ' + numCls(c.banco) + '">' + dur(c.banco, true) + "</div>";
    h += '<div class="between hint"><span>Entradas ' + dur(inn) + "</span><span>Saídas " + dur(out) + "</span>" + (cb ? "<span>Oficial " + dur(cb.official, true) + "</span>" : "") + "</div></section>";
    ["eleitoral", "ferias", "coletiva"].forEach(function (k) {
      var x = c.cats[k], ck = c.checks.filter(function (y) { return y.key === k; })[0];
      h += '<section class="card"><div class="between"><span class="label">' + esc(CATS[k]) + "</span>" + statusOf(ck) + "</div>";
      h += '<div class="big ' + numCls(x.saldo) + '">' + x.saldo + " d</div>";
      h += '<div class="between hint"><span>Créditos ' + x.credit + " d</span><span>Usados " + x.used + " d</span>" + (ck ? "<span>Oficial " + ck.official + " d</span>" : "") + "</div></section>";
    });

    h += '<section class="card"><h2>Lançar horário esquecido</h2><div class="row"><div class="field"><label for="t-date">Data</label><input type="date" id="t-date" value="' + t.iso + '"></div><div class="field"><label for="t-time">Hora</label><input type="time" id="t-time"></div></div><button class="btn ghost" data-act="add-time">Adicionar horário</button></section>';
    return h;
  }

  function viewDias(c) {
    var h = "";
    if (state.example) h += exampleNotice();
    h += '<section class="card"><div class="between"><h2>Importar marcações</h2><button class="link" data-act="toggle-import">' + (showImport ? "Fechar" : "Abrir") + "</button></div>";
    if (showImport) {
      h += '<p class="hint">Cole o espelho de ponto, uma linha por dia: a data e os horários, como <span class="mono">09/11/2026 08:00 12:00 13:00 17:30</span>. Aceita dd/mm/aaaa ou aaaa-mm-dd, separados por espaço, vírgula ou ponto e vírgula. Importar o mesmo dia de novo substitui o anterior.</p>';
      h += '<textarea id="imp" placeholder="09/11/2026 08:00 12:00 13:00 17:30&#10;10/11/2026;08:05;12:00;13:00;17:20" spellcheck="false"></textarea>';
      h += '<button class="btn" data-act="import">Importar</button>';
      h += '<div class="field"><label for="fileimp">Ou escolha um arquivo CSV ou TXT</label><input type="file" id="fileimp" accept=".csv,.txt,text/plain,text/csv"></div>';
    }
    h += '<div class="msg" id="msg-dias">' + esc(flash.dias) + "</div></section>";
    h += '<section class="card"><h2>Dias do período</h2>';
    var rows = c.rows.filter(function (r) { return !r.hidden; }).slice().reverse();
    if (!rows.length) h += '<p class="hint">Nenhuma marcação ainda.</p>';
    else {
      rows.forEach(function (r) {
        h += '<div class="item"><div><div class="mono"><b>' + br(r.iso).slice(0, 5) + '</b> <span class="muted">' + DOW[dateOf(r.iso).getDay()] + '</span></div><div class="mono hint">' + (r.pts.length ? esc(r.pts.join("  ")) : "sem marcações") + '</div></div><div class="right"><div class="mono ' + numCls(r.delta) + '">' + (r.today ? dur(r.worked) : dur(r.delta, true)) + "</div><div>" + pillHtml(r.status, r.label) + "</div>";
        if (r.has) h += '<button class="link danger" data-act="del-day" data-id="' + r.iso + '">' + (pending === "d" + r.iso ? "Confirmar" : "Excluir") + "</button>";
        h += "</div></div>";
      });
    }
    h += "</section>";
    return h;
  }

  function viewFolgas() {
    var h = "";
    if (state.example) h += exampleNotice();
    h += '<section class="card"><h2>Novo lançamento</h2>';
    h += '<div class="field"><label for="f-cat">Conta</label><select id="f-cat"><option value="eleitoral">Créditos eleitorais</option><option value="ferias">Férias remuneradas</option><option value="coletiva">Folgas coletivas</option><option value="folga">Folga do banco de horas</option><option value="atestado">Atestado</option></select></div>';
    h += '<div class="row"><div class="field"><label for="f-kind">Tipo</label><select id="f-kind"><option value="credito">Crédito recebido</option><option value="uso">Dias usados</option></select></div>';
    h += '<div class="field"><label for="f-qty">Dias</label><input type="number" id="f-qty" min="1" step="1" value="1" inputmode="numeric"></div></div>';
    h += '<div class="field"><label for="f-date">Data</label><input type="date" id="f-date" value="' + isoOf(new Date()) + '"></div>';
    h += '<div class="field"><label for="f-note">Observação</label><input type="text" id="f-note" placeholder="Ex.: mesário no 2º turno"></div>';
    h += '<button class="btn" data-act="add-entry">Lançar</button>';
    h += '<p class="hint">Dias usados contam a partir da data, pulando fins de semana e feriados. A folga do banco de horas aceita só dias usados: o dia deixa de ser falta e as horas saem do banco. O atestado justifica o dia sem tirar horas.</p>';
    h += '<div class="msg" id="msg-folgas">' + esc(flash.folgas) + "</div></section>";
    h += '<section class="card"><h2>Razão</h2>';
    var list = state.ledger.slice().sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
    if (!list.length) h += '<p class="hint">Nenhum lançamento ainda.</p>';
    list.forEach(function (e) {
      h += '<div class="item"><div><div><b>' + esc(CATS[e.cat]) + '</b></div><div class="hint mono">' + br(e.date) + "</div>" + (e.note ? '<div class="hint">' + esc(e.note) + "</div>" : "") + '</div><div class="right"><div class="mono ' + (e.kind === "credito" ? "pos" : "neg") + '"><b>' + (e.kind === "credito" ? "+" : "−") + e.qty + " d</b></div><button class='link danger' data-act='del-entry' data-id='" + esc(e.id) + "'>" + (pending === "e" + e.id ? "Confirmar" : "Excluir") + "</button></div></div>";
    });
    h += "</section>";
    return h;
  }

  function viewConferir(c) {
    var o = state.official || {}, h = "";
    if (state.example) h += exampleNotice();
    h += '<section class="card"><h2>Saldos oficiais</h2><p class="hint">Digite o que o sistema oficial mostra hoje. O TimeLedger compara com o seu controle e avisa quando houver diferença. O banco de horas aceita formatos como +4:10, -1h30 ou 12.</p>';
    h += '<div class="field"><label for="o-date">Consulta feita em</label><input type="date" id="o-date" value="' + esc(o.date || "") + '"></div>';
    h += '<div class="field"><label for="o-banco">Banco de horas</label><input type="text" id="o-banco" value="' + esc(o.banco || "") + '" placeholder="+4:10"></div>';
    h += '<div class="row"><div class="field"><label for="o-eleitoral">Eleitorais (dias)</label><input type="number" step="1" id="o-eleitoral" inputmode="numeric" value="' + esc(o.eleitoral || "") + '"></div>';
    h += '<div class="field"><label for="o-ferias">Férias (dias)</label><input type="number" step="1" id="o-ferias" inputmode="numeric" value="' + esc(o.ferias || "") + '"></div>';
    h += '<div class="field"><label for="o-coletiva">Coletivas (dias)</label><input type="number" step="1" id="o-coletiva" inputmode="numeric" value="' + esc(o.coletiva || "") + '"></div></div>';
    h += '<button class="btn" data-act="save-official">Comparar</button><div class="msg" id="msg-conferir">' + esc(flash.conferir) + "</div></section>";
    h += '<section class="card"><h2>Resultado</h2>';
    if (!c.checks.length) h += '<p class="hint">Preencha ao menos um saldo oficial acima.</p>';
    else {
      c.checks.forEach(function (k) {
        var f = function (v) { return k.hours ? dur(v, true) : (v > 0 ? "+" : "") + v + " d"; };
        h += '<div class="item"><div><div><b>' + esc(k.name) + '</b></div><div class="hint mono">Seu controle ' + f(k.mine) + " · Oficial " + f(k.official) + '</div></div><div class="right"><div class="mono ' + (k.ok ? "" : "neg") + '"><b>' + f(k.diff) + "</b></div>" + (k.ok ? '<span class="pill">Confere</span>' : '<span class="pill bad">Diverge</span>') + "</div></div>";
      });
      if (o.date) h += '<p class="hint">Última consulta oficial: ' + br(o.date) + ". Seu saldo conta até ontem.</p>";
    }
    h += "</section>";
    return h;
  }

  function viewAjustes() {
    var s = state.settings, h = "";
    h += '<section class="card"><h2>Jornada e regras</h2>';
    h += '<div class="row"><div class="field"><label for="s-daily">Jornada diária (horas)</label><input type="text" id="s-daily" inputmode="decimal" value="' + esc((s.daily / 60).toString().replace(".", ",")) + '"></div>';
    h += '<div class="field"><label for="s-tol">Tolerância (min)</label><input type="number" min="0" step="1" id="s-tol" inputmode="numeric" value="' + esc(s.tolerance) + '"></div></div>';
    h += '<div class="field"><label for="s-sat">Jornada de sábado (horas, 0 se não trabalha)</label><input type="text" id="s-sat" inputmode="decimal" value="' + esc(((s.sat || 0) / 60).toString().replace(".", ",")) + '"></div>';
    h += '<div class="row"><div class="field"><label for="s-open">Saldo anterior do banco</label><input type="text" id="s-open" value="' + esc(dur(s.opening, true)) + '" placeholder="+20:00"></div>';
    h += '<div class="field"><label for="s-start">Contar a partir de</label><input type="date" id="s-start" value="' + esc(s.startDate || "") + '"></div></div>';
    h += '<div class="field"><label for="s-hol">Feriados e pontos facultativos (dd/mm/aaaa)</label><textarea id="s-hol" style="min-height:70px" spellcheck="false">' + esc(s.holidays || "") + "</textarea></div>";
    h += '<button class="btn" data-act="save-settings">Salvar ajustes</button>';
    h += '<p class="hint">O saldo anterior vale a partir do primeiro dia registrado. Dias úteis sem marcação e sem lançamento viram falta. O dia de hoje só entra no banco amanhã.</p>';
    h += '<div class="msg" id="msg-ajustes">' + esc(flash.ajustes) + "</div></section>";
    h += '<section class="card"><h2>Cópia de segurança</h2><p class="hint">Seus dados ficam só neste aparelho, dentro do navegador. Se você limpar os dados do site ou trocar de aparelho, eles somem. Baixe um backup de vez em quando e restaure por aqui quando precisar.</p>';
    h += '<button class="btn ghost" data-act="download">Baixar backup</button>';
    h += '<div class="field"><label for="filerestore">Restaurar de um arquivo de backup</label><input type="file" id="filerestore" accept=".json,application/json"></div>';
    h += '<button class="btn danger" data-act="reset">' + (pending === "reset" ? "Confirmar: apagar tudo" : "Apagar todos os dados") + "</button></section>";
    return h;
  }

  var ROUTES = { hoje: 1, dias: 1, folgas: 1, conferir: 1, ajustes: 1 };
  function render() {
    var c = compute();
    var nav = "";
    TABS.forEach(function (t) {
      nav += '<button role="tab" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[t[0]] + "</svg>" + t[1] + (t[0] === "hoje" && c.alerts.length ? '<span class="dot">' + c.alerts.length + "</span>" : "") + "</button>";
    });
    document.getElementById("tabs").innerHTML = nav;
    var html;
    if (tab === "hoje") html = viewHoje(c);
    else if (tab === "dias") html = viewDias(c);
    else if (tab === "folgas") html = viewFolgas();
    else if (tab === "conferir") html = viewConferir(c);
    else html = viewAjustes();
    document.getElementById("app").innerHTML = html;
  }
  function say(name, text) { flash[name] = text; render(); }

  /* live clock: updates text only, never re-renders */
  setInterval(function () {
    var el = document.getElementById("clock");
    if (!el) return;
    var t = todayInfo(), n = t.now;
    el.textContent = pad(n.getHours()) + ":" + pad(n.getMinutes()) + ":" + pad(n.getSeconds());
    var tw = document.getElementById("tw"); if (tw) tw.textContent = dur(t.worked);
    var row = document.getElementById("exitrow"), ex = document.getElementById("exitat");
    if (row && ex) { row.hidden = t.exitAt === null; ex.textContent = t.exitAt === null ? "" : hhmm(t.exitAt); }
  }, 1000);

  /* ---------- import / backup ---------- */
  function parseImport(text) {
    var added = 0, skipped = 0, out = {};
    text.split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      var iso = null, rest = line;
      var m = line.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (m) { iso = m[1] + "-" + m[2] + "-" + m[3]; rest = line.replace(m[0], " "); }
      else {
        m = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (m) { var yy = m[3].length === 2 ? "20" + m[3] : m[3]; iso = yy + "-" + pad(+m[2]) + "-" + pad(+m[1]); rest = line.replace(m[0], " "); }
      }
      if (!iso || isNaN(dateOf(iso).getTime()) || isoOf(dateOf(iso)) !== iso) { skipped++; return; }
      var times = [], re = /(\d{1,2}):(\d{2})/g, t;
      while ((t = re.exec(rest))) { if (+t[1] < 24 && +t[2] < 60) times.push(pad(+t[1]) + ":" + t[2]); }
      if (!times.length) { skipped++; return; }
      times.sort(); out[iso] = times; added++;
    });
    return { out: out, added: added, skipped: skipped };
  }
  function applyImport(text) {
    var r = parseImport(text);
    Object.keys(r.out).forEach(function (k) { state.punches[k] = r.out[k]; });
    if (r.added) commit();
    say("dias", r.added ? r.added + (r.added === 1 ? " dia importado." : " dias importados.") + (r.skipped ? " " + r.skipped + (r.skipped === 1 ? " linha ignorada" : " linhas ignoradas") + " por falta de data ou horário." : "") : "Nada importado. Cada linha precisa de uma data e ao menos um horário.");
  }
  function addPunch(iso, time) {
    var list = (state.punches[iso] || []).slice();
    if (list.indexOf(time) >= 0) return false;
    list.push(time); list.sort();
    state.punches[iso] = list;
    return true;
  }
  function downloadBackup() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "timeledger-backup-" + isoOf(new Date()) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    say("ajustes", "Backup baixado.");
  }

  /* ---------- events ---------- */
  document.addEventListener("click", function (ev) {
    var tb = ev.target.closest("[data-tab]");
    if (tb) { tab = tb.getAttribute("data-tab"); pending = null; try { history.replaceState(null, "", "#" + tab); } catch (e) {} render(); window.scrollTo(0, 0); return; }
    var b = ev.target.closest("[data-act]");
    if (!b) return;
    var act = b.getAttribute("data-act"), id = b.getAttribute("data-id");
    if (act === "punch") {
      var n = new Date(), time = pad(n.getHours()) + ":" + pad(n.getMinutes());
      var iso = isoOf(n), wasOpen = (state.punches[iso] || []).length % 2 === 1;
      if (!addPunch(iso, time)) { say("hoje", "Já existe um registro às " + time + "."); return; }
      commit(); say("hoje", (wasOpen ? "Saída" : "Entrada") + " registrada às " + time + ".");
    } else if (act === "del-punch") {
      var key = "t" + id;
      if (pending === key) {
        var iso2 = isoOf(new Date());
        state.punches[iso2] = (state.punches[iso2] || []).filter(function (p) { return p !== id; });
        if (!state.punches[iso2].length) delete state.punches[iso2];
        pending = null; commit(); render();
      } else { pending = key; render(); }
    } else if (act === "add-time") {
      var d = document.getElementById("t-date").value, tm = document.getElementById("t-time").value;
      if (!d || !tm) { say("hoje", "Informe a data e a hora."); return; }
      if (!addPunch(d, tm)) { say("hoje", "Esse horário já está registrado."); return; }
      commit(); say("hoje", "Horário de " + br(d) + " adicionado.");
    } else if (act === "load-example") {
      state = sample(); pending = null; commit(); render();
    } else if (act === "clear-example") {
      state = emptyState(); commit(); tab = "hoje"; render();
    } else if (act === "toggle-import") {
      showImport = !showImport; render();
    } else if (act === "import") {
      var ta = document.getElementById("imp"); applyImport(ta ? ta.value : "");
    } else if (act === "del-day") {
      if (pending === "d" + id) { delete state.punches[id]; pending = null; commit(); render(); } else { pending = "d" + id; render(); }
    } else if (act === "del-entry") {
      if (pending === "e" + id) { state.ledger = state.ledger.filter(function (e) { return e.id !== id; }); pending = null; commit(); render(); } else { pending = "e" + id; render(); }
    } else if (act === "add-entry") {
      var cat = document.getElementById("f-cat").value, kind = document.getElementById("f-kind").value;
      var date = document.getElementById("f-date").value, qty = parseInt(document.getElementById("f-qty").value, 10);
      var note = document.getElementById("f-note").value.trim();
      if ((cat === "folga" || cat === "atestado") && kind === "credito") { say("folgas", "Folga do banco de horas e atestado só aceitam dias usados."); return; }
      if (!date || !(qty >= 1)) { say("folgas", "Informe a data e ao menos 1 dia."); return; }
      state.ledger.push({ id: "l" + Date.now().toString(36) + Math.floor(Math.random() * 1000), cat: cat, kind: kind, date: date, qty: qty, note: note });
      commit(); say("folgas", "Lançamento salvo.");
    } else if (act === "save-official") {
      var g = function (k) { return document.getElementById("o-" + k).value.trim(); };
      if (g("banco") && parseDur(g("banco")) === null) { say("conferir", "Não entendi o banco de horas. Use algo como +4:10 ou -1h30."); return; }
      state.official = { date: g("date"), banco: g("banco"), eleitoral: g("eleitoral"), ferias: g("ferias"), coletiva: g("coletiva") };
      commit(); say("conferir", "Comparação atualizada.");
    } else if (act === "save-settings") {
      var daily = parseDur(document.getElementById("s-daily").value), op = parseDur(document.getElementById("s-open").value || "0"), satv = parseDur(document.getElementById("s-sat").value || "0");
      if (daily === null || daily <= 0 || op === null || satv === null || satv < 0) { say("ajustes", "Confira a jornada (ex.: 8 ou 8:30) e o saldo anterior (ex.: +20:00)."); return; }
      state.settings = { daily: daily, sat: satv, tolerance: Math.max(0, parseInt(document.getElementById("s-tol").value, 10) || 0), opening: op, startDate: document.getElementById("s-start").value, holidays: document.getElementById("s-hol").value.trim() };
      commit(); say("ajustes", "Ajustes salvos.");
    } else if (act === "download") {
      downloadBackup();
    } else if (act === "reset") {
      if (pending === "reset") { state = emptyState(); pending = null; commit(); say("ajustes", "Todos os dados foram apagados."); }
      else { pending = "reset"; render(); }
    }
  });
  document.addEventListener("change", function (ev) {
    var f = ev.target.files && ev.target.files[0];
    if (!f) return;
    var fr = new FileReader();
    if (ev.target.id === "fileimp") {
      fr.onload = function () { applyImport(String(fr.result || "")); };
      fr.onerror = function () { say("dias", "Não consegui ler o arquivo."); };
      fr.readAsText(f);
    } else if (ev.target.id === "filerestore") {
      fr.onload = function () {
        try {
          var s = JSON.parse(String(fr.result || ""));
          if (!s || !s.settings || !s.punches || !s.ledger) throw new Error("x");
          s.official = s.official || {}; s.example = false; state = s; commit(); say("ajustes", "Dados restaurados.");
        } catch (e) { say("ajustes", "Esse arquivo não parece um backup do TimeLedger."); }
      };
      fr.onerror = function () { say("ajustes", "Não consegui ler o arquivo."); };
      fr.readAsText(f);
    }
  });
  window.addEventListener("hashchange", function () {
    var h = location.hash.replace("#", "");
    if (ROUTES[h]) { tab = h; render(); }
  });

  (function () {
    var h = location.hash.replace("#", "");
    if (ROUTES[h]) tab = h;
    setSync(hasData(state) ? "Salvo neste aparelho" : "Dados ficam neste aparelho", "ok");
    render();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
    }
  })();
})();
