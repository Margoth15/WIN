/**
 * WIN Wi-Fi Scanner Web - Frontend Logic v3
 * Medición REAL: señal WiFi (dBm) / Ethernet (link speed),
 * descarga real vía Cloudflare, subida vía POST local,
 * ping/jitter vía fetch Google 204.
 * Calificación por semáforo (sin score numérico).
 */

document.addEventListener("DOMContentLoaded", () => {

  // ============================================================
  // ID ANÓNIMO DE DISPOSITIVO
  // ============================================================
  const DEVICE_ID = (() => {
    const key = "win_device_id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = (typeof crypto.randomUUID === "function")
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
          });
      localStorage.setItem(key, id);
    }
    return id;
  })();

  // ============================================================
  // ESTADO
  // ============================================================
  const state = {
    selectedRoom: null,
    isScanning: false,
    measurements: [],
  };

  // ============================================================
  // REFERENCIAS DOM
  // ============================================================
  const roomDropdown  = document.getElementById("room-dropdown");
  const customInput   = document.getElementById("custom-room-input");
  const btnAddCustom  = document.getElementById("btn-add-custom-room");

  const bannerIcon    = document.getElementById("current-measuring-icon");
  const bannerName    = document.getElementById("current-measuring-name");
  const bannerHint    = document.getElementById("current-measuring-hint");
  const liveBadge     = document.getElementById("scan-live-badge");
  const progressText  = document.getElementById("measuring-progress-text");
  const statusMsg     = document.getElementById("scan-status-message");

  const metricDL      = document.getElementById("metric-download");
  const metricUL      = document.getElementById("metric-upload");
  const metricPing    = document.getElementById("metric-ping");
  const metricJitter  = document.getElementById("metric-jitter");

  const verdictCard   = document.getElementById("verdict-card");
  const verdictLabel  = document.getElementById("verdict-label");
  const verdictMsg    = document.getElementById("verdict-msg");

  const btnScan       = document.getElementById("btn-start-scan");
  const btnScanText   = document.getElementById("btn-start-scan-text");

  const roomsList     = document.getElementById("scanned-rooms-list");
  const countBadge    = document.getElementById("scanned-count-badge");
  const summaryBar    = document.getElementById("scan-summary-bar");
  const listActions   = document.getElementById("list-actions");
  const sumTotal      = document.getElementById("summary-total");
  const sumGood       = document.getElementById("summary-good");
  const sumWarn       = document.getElementById("summary-warn");
  const sumBad        = document.getElementById("summary-bad");
  const btnPrint      = document.getElementById("btn-print-report");
  const btnClear      = document.getElementById("btn-clear-list");

  const diagSection   = document.getElementById("diagnosis-section");
  const diagIcon      = document.getElementById("diag-icon");
  const diagText      = document.getElementById("diag-text");
  const sendSection   = document.getElementById("send-section");
  const btnSend       = document.getElementById("btn-send-report");
  const btnClearHist  = document.getElementById("btn-clear-history");
  const deviceIdEl    = document.getElementById("device-id-display");

  if (deviceIdEl) deviceIdEl.textContent = DEVICE_ID.slice(0, 8) + "…";

  // ============================================================
  // SELECTOR DESPLEGABLE DE AMBIENTES
  // ============================================================
  const ROOM_ICONS = {
    sala:           "🛋️",
    dorm_principal: "🛏️",
    estudio:        "💻",
    cocina:         "🍳",
    piso2:          "🪢",
    bano:           "🚿",
    garage:         "🚗",
    jardin:         "🌿",
    comedor:        "🍽️",
    lavanderia:     "🧺",
  };

  roomDropdown.addEventListener("change", () => {
    if (state.isScanning) return;
    const val = roomDropdown.value;
    if (!val) {
      state.selectedRoom = null;
      btnScan.disabled = true;
      btnScanText.textContent = "Selecciona un ambiente";
      bannerIcon.textContent = "📡";
      bannerName.textContent = "Listo para escanear";
      bannerHint.textContent = "Selecciona un ambiente arriba y presiona Iniciar Escaneo";
      return;
    }
    const parts    = val.split("|");
    const id       = parts[0];
    const name     = parts[1] || val;
    const isRouter = parts[2] === "true";
    const icon     = ROOM_ICONS[id] || "📍";

    state.selectedRoom = { id, name, icon, isRouter };
    updateBanner();
    enableScanButton();
  });

  function addCustomOption() {
    const name = customInput.value.trim();
    if (!name) return;
    const customId = "custom_" + Date.now();
    const optValue = customId + "|" + name + "|false";
    const opt      = document.createElement("option");
    opt.value       = optValue;
    opt.textContent = "📍 " + name;
    const grp = roomDropdown.querySelector("optgroup");
    if (grp) grp.appendChild(opt);
    else roomDropdown.appendChild(opt);
    roomDropdown.value = optValue;
    customInput.value  = "";
    roomDropdown.dispatchEvent(new Event("change"));
  }

  btnAddCustom.addEventListener("click", addCustomOption);
  customInput.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); addCustomOption(); }
  });

  function updateBanner() {
    if (!state.selectedRoom) return;
    bannerIcon.textContent = state.selectedRoom.icon;
    bannerName.textContent = state.selectedRoom.name;
    bannerHint.textContent = state.selectedRoom.isRouter
      ? "Ubicación junto al Router WIN (Medición de Referencia)"
      : "Posiciónate en " + state.selectedRoom.name + " con tu dispositivo";
  }

  function enableScanButton() {
    btnScan.disabled = false;
    btnScanText.textContent = "Iniciar Escaneo";
  }

  // ============================================================
  // MEDICIÓN REAL DE RED (100% Real: Descarga, Subida, Ping, Jitter)
  // ============================================================

  async function measureDownload() {
    try {
      const url = "https://speed.cloudflare.com/__down?bytes=10000000&_=" + Date.now();
      const t0  = performance.now();
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      await res.arrayBuffer();
      const t1      = performance.now();
      const seconds = (t1 - t0) / 1000;
      const bytes   = 10 * 1024 * 1024;
      const mbps    = (bytes * 8) / (seconds * 1000000);
      return Math.round(mbps * 10) / 10;
    } catch (_) {
      return null;
    }
  }

  async function measureUpload() {
    try {
      const SIZE = 2 * 1024 * 1024;
      const data = new Uint8Array(SIZE);
      const t0   = performance.now();
      const res  = await fetch("/api/speedtest-upload?_=" + Date.now(), {
        method: "POST",
        body:   data,
        cache:  "no-store",
      });
      if (!res.ok) return null;
      await res.text();
      const t1      = performance.now();
      const seconds = (t1 - t0) / 1000;
      const mbps    = (SIZE * 8) / (seconds * 1000000);
      return Math.round(mbps * 10) / 10;
    } catch (_) {
      return null;
    }
  }

  async function measureLatency(samples) {
    if (!samples) samples = 6;
    const ENDPOINT = "https://www.google.com/generate_204";
    const times = [];
    for (let i = 0; i < samples; i++) {
      const t0 = performance.now();
      try {
        await fetch(ENDPOINT + "?_=" + Date.now(), { method: "GET", mode: "no-cors", cache: "no-store" });
      } catch (_) {}
      times.push(performance.now() - t0);
      await new Promise(r => setTimeout(r, 120));
    }
    if (times.length > 3) times.splice(times.indexOf(Math.max.apply(null, times)), 1);
    const avg      = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / times.length;
    return { ping: Math.round(avg), jitter: Math.round(Math.sqrt(variance)) };
  }

  // ============================================================
  // CALIFICACIÓN REAL (sin simulación, sin puntos de semáforo)
  // ============================================================
  function calcVerdict(opts) {
    const download = opts.download;
    const upload   = opts.upload;
    const ping     = opts.ping;
    const jitter   = opts.jitter;

    let points = 0;
    let maxPoints = 0;

    // Descarga real (45 pts)
    maxPoints += 45;
    if (download !== null && download !== undefined) {
      if      (download >= 60) points += 45;
      else if (download >= 30) points += 35;
      else if (download >= 15) points += 24;
      else if (download >= 5)  points += 12;
      else                     points += 3;
    }

    // Subida real (20 pts)
    maxPoints += 20;
    if (upload !== null && upload !== undefined) {
      if      (upload >= 20) points += 20;
      else if (upload >= 10) points += 15;
      else if (upload >= 3)  points += 8;
      else                   points += 2;
    }

    // Latencia real / Ping (25 pts)
    maxPoints += 25;
    if      (ping <= 15)  points += 25;
    else if (ping <= 30)  points += 20;
    else if (ping <= 60)  points += 12;
    else if (ping <= 100) points += 6;
    else                  points += 1;

    // Jitter real / Estabilidad (10 pts)
    maxPoints += 10;
    if      (jitter <= 3)  points += 10;
    else if (jitter <= 8)  points += 7;
    else if (jitter <= 15) points += 4;
    else                   points += 1;

    const pct = maxPoints > 0 ? (points / maxPoints) * 100 : 0;

    if (pct >= 75) return { label: "Excelente", cls: "score-excellent" };
    if (pct >= 55) return { label: "Buena",     cls: "score-good" };
    if (pct >= 35) return { label: "Regular",   cls: "score-regular" };
    return               { label: "Débil",     cls: "score-weak" };
  }

  function verdictMessage(verdictCls, roomName) {
    switch (verdictCls) {
      case "score-excellent": return "Conexión excelente en " + roomName + ". Máxima velocidad y respuesta inmediata para streaming 4K, gaming y trabajo remoto.";
      case "score-good":      return "Buena conexión en " + roomName + ". Fluida y estable para trabajo remoto y navegación sin interrupciones.";
      case "score-regular":   return "Conexión moderada en " + roomName + ". Puede experimentar ralentizaciones con varios dispositivos conectados.";
      default:                return "Conexión débil en " + roomName + ". Se recomienda evaluar la ubicación del router o instalar un repetidor Wi-Fi WIN.";
    }
  }

  // ============================================================
  // HISTORIAL LOCAL
  // ============================================================
  function histKey(roomId) { return "win_hist_" + roomId; }
  function getHistory(roomId) {
    try { return JSON.parse(localStorage.getItem(histKey(roomId)) || "[]"); }
    catch (_) { return []; }
  }
  function saveHistory(roomId, entry) {
    const hist = getHistory(roomId);
    hist.push(entry);
    if (hist.length > 10) hist.shift();
    localStorage.setItem(histKey(roomId), JSON.stringify(hist));
  }
  function clearAllHistory() {
    Object.keys(localStorage).filter(k => k.startsWith("win_hist_")).forEach(k => localStorage.removeItem(k));
  }

  const VERDICT_RANK   = { "score-excellent": 4, "score-good": 3, "score-regular": 2, "score-weak": 1 };
  const VERDICT_LABELS = { "score-excellent": "Excelente", "score-good": "Buena", "score-regular": "Regular", "score-weak": "Débil" };

  function getDelta(roomId, currentVerdictCls) {
    const hist = getHistory(roomId);
    if (hist.length === 0) return null;
    const prev = hist[hist.length - 1];
    if (!prev.verdict) return null;
    const prevRank = VERDICT_RANK[prev.verdict] || 0;
    const currRank = VERDICT_RANK[currentVerdictCls] || 0;
    const diff     = currRank - prevRank;
    const arrow    = diff > 0 ? "📈" : diff < 0 ? "📉" : "➡️";
    return {
      prevLabel:    VERDICT_LABELS[prev.verdict]    || prev.verdict,
      currentLabel: VERDICT_LABELS[currentVerdictCls],
      diff,
      text:     (VERDICT_LABELS[prev.verdict] || "?") + " → " + VERDICT_LABELS[currentVerdictCls] + " " + arrow,
      improved: diff > 0,
    };
  }

  // ============================================================
  // BOTÓN ESCANEAR
  // ============================================================
  btnScan.addEventListener("click", () => {
    if (!state.selectedRoom || state.isScanning) return;
    startScan();
  });

  async function startScan() {
    state.isScanning = true;
    btnScan.disabled = true;
    liveBadge.style.display = "flex";
    progressText.textContent = state.selectedRoom.name;

    if (verdictCard) verdictCard.style.display = "none";

    if (metricDL)     metricDL.textContent     = "--";
    if (metricUL)     metricUL.textContent     = "--";
    if (metricPing)   metricPing.textContent   = "--";
    if (metricJitter) metricJitter.textContent = "--";

    statusMsg.textContent = "Midiendo descarga (10 MB reales de Cloudflare)…";
    const download = await measureDownload();
    if (download !== null && metricDL) animateNumber(metricDL, 0, download, 600);
    else if (metricDL) metricDL.textContent = "—";

    statusMsg.textContent = "Midiendo subida (2 MB reales)…";
    const upload = await measureUpload();
    if (upload !== null && metricUL) animateNumber(metricUL, 0, upload, 600);
    else if (metricUL) metricUL.textContent = "—";

    statusMsg.textContent = "Midiendo latencia y jitter reales…";
    const latency = await measureLatency(6);
    const ping    = latency.ping;
    const jitter  = latency.jitter;
    if (metricPing)   metricPing.textContent   = ping;
    if (metricJitter) metricJitter.textContent = jitter;

    statusMsg.textContent = "Evaluando desempeño de conexión…";
    await delay(300);

    const verdict = calcVerdict({ download, upload, ping, jitter });

    const room    = state.selectedRoom;
    const delta   = getDelta(room.id, verdict.cls);
    const message = verdictMessage(verdict.cls, room.name);

    saveHistory(room.id, {
      verdict:  verdict.cls,
      ping, jitter,
      download: download !== undefined ? download : null,
      upload:   upload   !== undefined ? upload   : null,
      date: new Date().toISOString(),
    });

    await delay(300);
    statusMsg.textContent = "¡Medición completada!";

    finishScan({ ping, jitter, download, upload, verdict, message, delta });
  }

  function finishScan(metrics) {
    state.isScanning = false;
    liveBadge.style.display = "none";

    const entry = {
      room:    state.selectedRoom,
      metrics,
      ts: new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }),
    };
    state.measurements.push(entry);

    if (verdictCard) {
      if (verdictLabel) {
        verdictLabel.textContent = metrics.verdict.label;
        verdictLabel.className = "verdict-label " + metrics.verdict.cls;
      }
      if (verdictMsg) verdictMsg.textContent = metrics.message;
      verdictCard.style.display = "flex";
    }

    renderCartSorted();
    updateSummary();
    updateDiagnosis();
    updateSendSection();

    roomDropdown.value = "";
    state.selectedRoom = null;
    btnScan.disabled = true;
    btnScanText.textContent = "Selecciona un ambiente";
    bannerIcon.textContent = "📡";
    bannerName.textContent = "Ambiente escaneado";
    bannerHint.textContent = "Selecciona otro ambiente para continuar midiendo";
    statusMsg.textContent  = "Medición completada. Selecciona otro ambiente para continuar.";
  }

  // ============================================================
  // LISTA COMPARATIVA ORDENADA
  // ============================================================
  function renderCartSorted() {
    roomsList.innerHTML = "";
    if (state.measurements.length === 0) {
      const empty = document.createElement("div");
      empty.className = "scanned-empty-state";
      empty.id        = "scanned-empty-state";
      empty.innerHTML = "<span class=\"empty-icon\">🏠</span><span class=\"empty-text\">Aún no has escaneado ningún ambiente</span>";
      roomsList.appendChild(empty);
      return;
    }
    const sorted = [...state.measurements].sort((a, b) =>
      (VERDICT_RANK[b.metrics.verdict.cls] || 0) - (VERDICT_RANK[a.metrics.verdict.cls] || 0)
    );
    sorted.forEach((entry, rank) => {
      addCartItem(entry, state.measurements.indexOf(entry), rank + 1);
    });
  }

  function addCartItem(entry, originalIdx, rank) {
    const { room, metrics, ts } = entry;
    const v = metrics.verdict;

    const badgeClass = { "score-excellent": "res-good", "score-good": "res-good", "score-regular": "res-warn", "score-weak": "res-bad" }[v.cls] || "res-warn";

    let deltaHtml = "";
    if (metrics.delta) {
      const d = metrics.delta;
      const color = d.improved ? "var(--fiber-green)" : "var(--status-red)";
      deltaHtml = "<span class=\"cart-item-delta\" style=\"color:" + color + "\">" + escapeHtml(d.text) + "</span>";
    }

    const parts = [
      "⏱ Ping " + metrics.ping + "ms",
      "Jitter " + metrics.jitter + "ms",
    ];
    if (metrics.download !== null && metrics.download !== undefined) {
      parts.push("⬇ " + metrics.download + " Mbps");
    }
    if (metrics.upload !== null && metrics.upload !== undefined) {
      parts.push("⬆ " + metrics.upload + " Mbps");
    }

    const item = document.createElement("div");
    item.className = "cart-item";
    item.dataset.originalIdx = originalIdx;
    item.innerHTML =
      "<div class=\"cart-item-rank\">" + rank + "</div>" +
      "<div class=\"cart-item-left\">" +
        "<span class=\"cart-item-icon\">" + room.icon + "</span>" +
        "<div class=\"cart-item-info\">" +
          "<span class=\"cart-item-name\">" + escapeHtml(room.name) + "</span>" +
          "<span class=\"cart-item-metrics\">" + parts.join(" &bull; ") + "</span>" +
          deltaHtml +
          "<span class=\"cart-item-time\">" + ts + "</span>" +
        "</div>" +
      "</div>" +
      "<div class=\"cart-item-right\">" +
        "<span class=\"room-res-badge " + badgeClass + "\">" + v.label + "</span>" +
        "<button class=\"cart-remove-btn\" data-original-idx=\"" + originalIdx + "\" title=\"Eliminar\">&#10005;</button>" +
      "</div>";

    roomsList.appendChild(item);
    requestAnimationFrame(() => item.classList.add("cart-item-in"));
  }

  roomsList.addEventListener("click", e => {
    const btn = e.target.closest(".cart-remove-btn");
    if (!btn) return;
    const idx = parseInt(btn.dataset.originalIdx, 10);
    state.measurements.splice(idx, 1);
    renderCartSorted();
    updateSummary();
    updateDiagnosis();
    updateSendSection();
  });

  // ============================================================
  // DIAGNÓSTICO GENERAL
  // ============================================================
  function updateDiagnosis() {
    if (!diagSection) return;
    const n = state.measurements.length;
    if (n < 2) { diagSection.style.display = "none"; return; }

    const ranks    = state.measurements.map(e => VERDICT_RANK[e.metrics.verdict.cls] || 0);
    const maxRank  = Math.max.apply(null, ranks);
    const minRank  = Math.min.apply(null, ranks);
    const bestEntry  = state.measurements.find(e => (VERDICT_RANK[e.metrics.verdict.cls] || 0) === maxRank);
    const worstEntry = state.measurements.find(e => (VERDICT_RANK[e.metrics.verdict.cls] || 0) === minRank);
    const bestLabel  = bestEntry  ? bestEntry.metrics.verdict.label  : "";
    const worstLabel = worstEntry ? worstEntry.metrics.verdict.label : "";

    let icon, text, borderColor;
    if (maxRank - minRank >= 2) {
      icon = "⚠️"; borderColor = "var(--status-amber)";
      text = "Cobertura <strong>desigual</strong>: el mejor ambiente tiene conexión <strong>" + bestLabel + "</strong> y el peor <strong>" + worstLabel + "</strong>. Considera reubicar el router a un lugar más central o agregar un repetidor/extensor Wi-Fi.";
    } else if (maxRank <= 1) {
      icon = "🚨"; borderColor = "var(--status-red)";
      text = "Todos los ambientes muestran conexión <strong>débil</strong>. Esto puede indicar una falla del servicio o problemas con el router. Contactá a soporte de WIN.";
    } else if (minRank >= 3) {
      icon = "✅"; borderColor = "var(--fiber-green)";
      text = "<strong>Excelente cobertura</strong> en todos los ambientes escaneados. Tu red está en perfecto estado.";
    } else {
      icon = "📶"; borderColor = "var(--win-orange)";
      text = "Cobertura <strong>aceptable</strong> en general, con margen de mejora. El mejor registra <strong>" + bestLabel + "</strong> y el peor <strong>" + worstLabel + "</strong>.";
    }

    diagIcon.textContent = icon;
    diagText.innerHTML   = text;
    diagSection.style.borderLeftColor = borderColor;
    diagSection.style.display = "block";
  }

  // ============================================================
  // SECCIÓN DE ENVÍO
  // ============================================================
  function updateSendSection() {
    if (!sendSection) return;
    sendSection.style.display = state.measurements.length > 0 ? "block" : "none";
  }

  // ============================================================
  // DATOS DE OFERTAS WIN (embebidos para funcionar sin backend)
  // ============================================================
  const WIN_OFFERS = {
    "score-excellent": {
      titulo: "Tu conexión es EXCELENTE — ¡Lleva tu experiencia al siguiente nivel!",
      intro: "Ya tienes una conexión top. Con WIN XGSPON o Gamer llevarás gaming, streaming 4K y trabajo remoto a otro nivel.",
      ofertas: [
        {
          nombre: "XGSPON 2500 Mbps",
          precio: "S/ 239.00/mes",
          pitch: "La tecnología más avanzada del mercado. Ideal para hogares con 10+ dispositivos y trabajo pesado en la nube.",
          incluye: "2 Mesh + hasta 10 Gbps de capacidad"
        },
        {
          nombre: "XGSPON 2000 Mbps + WIN TV (100 canales)",
          precio: "S/ 199.90/mes (Promo MDT: S/ 99.90 x 2 meses)",
          pitch: "Velocidad extrema más entretenimiento completo. El paquete perfecto para el hogar conectado del futuro.",
          incluye: "2 Mesh + 100 canales de TV premium"
        },
        {
          nombre: "Plan Gamer 1000 Mbps + WIN TV Premium",
          precio: "S/ 159.90/mes",
          pitch: "Tu conexión ya es excelente; con ruta ExitLag y NAT 1/2 tu ping en juegos bajará aún más.",
          incluye: "1-2 Mesh + Nitro (duplica velocidad 120h/mes)"
        },
      ]
    },
    "score-good": {
      titulo: "Conexión BUENA — Un pequeño upgrade marca la diferencia",
      intro: "Tu conexión funciona bien, pero existe margen para alcanzar velocidades simétricas de primer nivel con WIN Fibra Óptica.",
      ofertas: [
        {
          nombre: "MONO WIN 1000 Mbps (1 Gbps)",
          precio: "S/ 139.00/mes",
          pitch: "Da el salto al Gigabit puro. Simétrico, sin compartir, con 1 Mesh incluido a solicitud.",
          incluye: "1 Mesh a solicitud"
        },
        {
          nombre: "HB 1000 Mbps + WIN TV Premium",
          precio: "S/ 139.90/mes",
          pitch: "Por prácticamente el mismo precio que el plan básico de 1 Gbps, suma más de 80 canales premium.",
          incluye: "WIN TV Premium (+80 canales)"
        },
        {
          nombre: "Plan Gamer 600 Mbps",
          precio: "S/ 129.00/mes (50% dto x 1 mes en campaña)",
          pitch: "Si juegas online, la ruta ExitLag y NAT 1/2 potenciarán tu experiencia al máximo nivel.",
          incluye: "Nitro + 1-2 routers Mesh"
        },
      ]
    },
    "score-regular": {
      titulo: "Conexión REGULAR — Es hora de una mejora real",
      intro: "Tu velocidad actual limita la experiencia de múltiples dispositivos. WIN Fibra Óptica representa un salto radical en calidad.",
      ofertas: [
        {
          nombre: "MONO WIN 850 Mbps (El más popular)",
          precio: "S/ 119.00/mes",
          pitch: "Con 850 Mbps simétricos acabas con los bufferings y cortes para siempre, para todos en casa.",
          incluye: "Internet 100% Fibra Óptica FTTH Simétrica"
        },
        {
          nombre: "HB 850 Mbps + L1MAX Premium (Fútbol Peruano)",
          precio: "S/ 129.90/mes",
          pitch: "Mejora tu internet y nunca te pierdas un partido de la Liga 1 con la mejor calidad de imagen.",
          incluye: "L1MAX Premium + Fibra Óptica Simétrica"
        },
        {
          nombre: "HB 850 Mbps + DGO Hogar",
          precio: "S/ 139.90/mes",
          pitch: "Velocidad premium más TV por streaming. El combo ideal para hogares modernos.",
          incluye: "DGO Hogar (TV streaming)"
        },
      ]
    },
    "score-weak": {
      titulo: "Conexión DÉBIL — ¡WIN es la solución que necesitas!",
      intro: "Tu conexión actual es insuficiente. Cualquier plan WIN representa una mejora radical: hasta 70x más velocidad con cero cortes.",
      ofertas: [
        {
          nombre: "MONO WIN 750 Mbps",
          precio: "S/ 109.00/mes",
          pitch: "Pasa de tu conexión débil a 750 Mbps SIMÉTRICOS. Hasta 70x más rápido, estable para toda la familia.",
          incluye: "Fibra Óptica FTTH 100% Simétrica"
        },
        {
          nombre: "HB 750 Mbps + WIN TV Premium (+80 canales)",
          precio: "S/ 109.90/mes",
          pitch: "Por solo S/ 0.90 adicional, multiplica tu velocidad Y suma más de 80 canales de TV premium.",
          incluye: "WIN TV Premium (+80 canales)"
        },
        {
          nombre: "Plan Gamer 600 Mbps",
          precio: "S/ 129.00/mes (50% dto x 1 mes en campaña)",
          pitch: "Ese ping alto y jitter inestable arruinan tu gaming. WIN Gamer baja tu ping a un solo dígito local.",
          incluye: "ExitLag + NAT 1/2 + Nitro + 1-2 Mesh"
        },
      ]
    }
  };

  // ============================================================
  // DETERMINAR EL NIVEL GENERAL DE SEÑAL
  // ============================================================
  function getOverallVerdictCls() {
    if (state.measurements.length === 0) return null;
    // Usar el peor resultado como base de recomendación
    const ranks = state.measurements.map(e => VERDICT_RANK[e.metrics.verdict.cls] || 0);
    const minRank = Math.min.apply(null, ranks);
    const entry = state.measurements.find(e => (VERDICT_RANK[e.metrics.verdict.cls] || 0) === minRank);
    return entry ? entry.metrics.verdict.cls : null;
  }

  // ============================================================
  // GENERADOR DE REPORTE PDF
  // ============================================================
  function generatePDFReport() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const sorted = [...state.measurements].sort((a, b) =>
      (VERDICT_RANK[b.metrics.verdict.cls] || 0) - (VERDICT_RANK[a.metrics.verdict.cls] || 0)
    );
    const ahora = new Date().toLocaleString("es-PE", {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });

    const orange = [255, 107, 0];
    const dark   = [18,  18,  30];
    const gray   = [120, 120, 140];
    const white  = [255, 255, 255];
    const green  = [0,   200, 100];
    const red    = [220,  53,  69];
    const amber  = [255, 193,   7];
    const blue   = [13,  110, 253];

    const PW = 210; // page width mm
    let y = 0;

    // ── HEADER BANNER ─────────────────────────────────────────
    doc.setFillColor(...orange);
    doc.rect(0, 0, PW, 28, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...white);
    doc.text("WIN Wi-Fi Scanner", 14, 13);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Reporte de Diagnóstico de Señal", 14, 20);
    doc.text("Tecnología 100% Fibra Óptica", PW - 14, 20, { align: "right" });

    y = 36;

    // ── META INFO ─────────────────────────────────────────────
    doc.setFontSize(8);
    doc.setTextColor(...gray);
    doc.text("Fecha: " + ahora, 14, y);
    doc.text("ID Dispositivo: " + DEVICE_ID.slice(0, 8) + "…", PW - 14, y, { align: "right" });
    y += 4;
    doc.setDrawColor(220, 220, 235);
    doc.setLineWidth(0.3);
    doc.line(14, y, PW - 14, y);
    y += 8;

    // ── TÍTULO SECCIÓN 1 ──────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...dark);
    doc.text("RESULTADOS POR AMBIENTE", 14, y);
    y += 7;

    // ── TABLA DE MÉTRICAS ─────────────────────────────────────
    const tableBody = sorted.map((e, i) => {
      const m = e.metrics;
      const verdictLabel = m.verdict ? m.verdict.label : "—";
      return [
        String(i + 1),
        e.room.icon + " " + e.room.name,
        verdictLabel,
        m.ping + " ms",
        m.jitter + " ms",
        (m.download !== null && m.download !== undefined ? m.download + " Mbps" : "—"),
        (m.upload   !== null && m.upload   !== undefined ? m.upload   + " Mbps" : "—"),
      ];
    });

    doc.autoTable({
      startY: y,
      head: [["#", "Ambiente", "Calidad", "Ping", "Jitter", "Descarga", "Subida"]],
      body: tableBody,
      theme: "grid",
      headStyles: {
        fillColor: orange,
        textColor: white,
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: { fontSize: 8.5, textColor: dark },
      columnStyles: {
        0: { cellWidth: 8,  halign: "center" },
        2: { halign: "center" },
        3: { halign: "center" },
        4: { halign: "center" },
        5: { halign: "center" },
        6: { halign: "center" },
      },
      alternateRowStyles: { fillColor: [248, 248, 253] },
      margin: { left: 14, right: 14 },
      didParseCell: function(data) {
        if (data.section === "body" && data.column.index === 2) {
          const val = data.cell.raw;
          if (val === "Excelente") data.cell.styles.textColor = [0, 180, 80];
          else if (val === "Buena") data.cell.styles.textColor = [13, 110, 253];
          else if (val === "Regular") data.cell.styles.textColor = [230, 140, 0];
          else if (val === "Débil") data.cell.styles.textColor = [220, 53, 69];
        }
      },
    });

    y = doc.lastAutoTable.finalY + 10;

    // ── DIAGNÓSTICO GENERAL ───────────────────────────────────
    if (state.measurements.length >= 2) {
      const ranks   = state.measurements.map(e => VERDICT_RANK[e.metrics.verdict.cls] || 0);
      const maxRank = Math.max.apply(null, ranks);
      const minRank = Math.min.apply(null, ranks);
      const bestEntry  = state.measurements.find(e => (VERDICT_RANK[e.metrics.verdict.cls] || 0) === maxRank);
      const worstEntry = state.measurements.find(e => (VERDICT_RANK[e.metrics.verdict.cls] || 0) === minRank);

      let diagText, diagColor;
      if (maxRank - minRank >= 2) {
        diagColor = amber;
        diagText = "Cobertura DESIGUAL: el mejor ambiente (" + bestEntry.room.name + ") registra \""
          + bestEntry.metrics.verdict.label + "\" y el peor (" + worstEntry.room.name + ") registra \""
          + worstEntry.metrics.verdict.label + "\". Se recomienda reubicar el router o agregar un extensor Wi-Fi WIN.";
      } else if (maxRank <= 1) {
        diagColor = red;
        diagText = "Todos los ambientes muestran conexión DÉBIL. Puede indicar una falla del servicio o problemas con el router. Contacta a soporte WIN.";
      } else if (minRank >= 3) {
        diagColor = green;
        diagText = "Excelente cobertura en todos los ambientes escaneados. Tu red está en perfecto estado.";
      } else {
        diagColor = [255, 150, 0];
        diagText = "Cobertura ACEPTABLE en general, con margen de mejora. El mejor ambiente registra \""
          + bestEntry.metrics.verdict.label + "\" y el peor \"" + worstEntry.metrics.verdict.label + "\".";
      }

      // Check page space
      if (y + 22 > 280) { doc.addPage(); y = 20; }

      doc.setFillColor(...diagColor);
      doc.roundedRect(14, y, PW - 28, 18, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...white);
      doc.text("DIAGNÓSTICO GENERAL", 20, y + 6);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const diagLines = doc.splitTextToSize(diagText, PW - 44);
      doc.text(diagLines, 20, y + 12);
      y += 22 + (diagLines.length - 1) * 4;
    }

    y += 8;
    if (y > 260) { doc.addPage(); y = 20; }

    // ── SECCIÓN OFERTAS WIN ───────────────────────────────────
    const overallCls = getOverallVerdictCls();
    const offerData  = WIN_OFFERS[overallCls] || WIN_OFFERS["score-weak"];

    // Separador
    doc.setDrawColor(...orange);
    doc.setLineWidth(0.8);
    doc.line(14, y, PW - 14, y);
    y += 7;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...orange);
    doc.text("OFERTAS WIN RECOMENDADAS PARA TI", 14, y);
    y += 7;

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...gray);
    const introLines = doc.splitTextToSize(offerData.titulo, PW - 28);
    doc.text(introLines, 14, y);
    y += introLines.length * 5 + 1;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const introText = doc.splitTextToSize(offerData.intro, PW - 28);
    doc.text(introText, 14, y);
    y += introText.length * 4.5 + 5;

    // Tabla de ofertas
    const offerRows = offerData.ofertas.map((o, i) => [
      String(i + 1),
      o.nombre,
      o.precio,
      o.pitch,
      o.incluye,
    ]);

    doc.autoTable({
      startY: y,
      head: [["#", "Plan", "Precio", "¿Por qué te conviene?", "Incluye"]],
      body: offerRows,
      theme: "striped",
      headStyles: {
        fillColor: dark,
        textColor: white,
        fontStyle: "bold",
        fontSize: 8.5,
      },
      bodyStyles: { fontSize: 8, textColor: dark },
      columnStyles: {
        0: { cellWidth: 8,  halign: "center" },
        1: { cellWidth: 40, fontStyle: "bold" },
        2: { cellWidth: 35 },
        3: { cellWidth: 60 },
        4: { cellWidth: 35 },
      },
      alternateRowStyles: { fillColor: [255, 245, 235] },
      margin: { left: 14, right: 14 },
    });

    y = doc.lastAutoTable.finalY + 10;

    // ── FOOTER ────────────────────────────────────────────────
    if (y + 18 > 285) { doc.addPage(); y = 20; }

    doc.setDrawColor(220, 220, 235);
    doc.setLineWidth(0.3);
    doc.line(14, y, PW - 14, y);
    y += 5;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...gray);
    doc.text("Soy cliente de WIN Fibra Óptica. Comparto este diagnóstico para mejorar mi experiencia de conexión.", 14, y);
    y += 4;
    doc.text("Generado por WIN Wi-Fi Scanner Web — " + ahora, 14, y);

    // Número de páginas
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(...gray);
      doc.text("Página " + p + " de " + totalPages, PW - 14, 290, { align: "right" });
    }

    const filename = "reporte-wifi-win-" + new Date().toISOString().slice(0, 10) + ".pdf";
    doc.save(filename);
  }

  if (btnSend) {
    btnSend.addEventListener("click", () => {
      const waNumber = "51940061937";
      window.open("https://wa.me/" + waNumber + "?text=" + encodeURIComponent(buildReportText()), "_blank");
    });
  }

  if (btnClearHist) {
    btnClearHist.addEventListener("click", () => {
      if (confirm("¿Borrar todo el historial de escaneos guardado?\nEsta acción no se puede deshacer.")) {
        clearAllHistory();
        btnClearHist.textContent = "✓ Historial borrado";
        btnClearHist.disabled = true;
        setTimeout(() => { btnClearHist.textContent = "Borrar historial"; btnClearHist.disabled = false; }, 2500);
      }
    });
  }

  // ============================================================
  // RESUMEN / SUMMARY BAR
  // ============================================================
  function updateSummary() {
    const total = state.measurements.length;
    if (countBadge) countBadge.textContent = total;
    let good = 0, warn = 0, bad = 0;
    state.measurements.forEach(e => {
      const r = VERDICT_RANK[e.metrics.verdict.cls] || 0;
      if (r >= 3) good++; else if (r === 2) warn++; else bad++;
    });
    if (sumTotal) sumTotal.textContent = total;
    if (sumGood)  sumGood.textContent  = good;
    if (sumWarn)  sumWarn.textContent  = warn;
    if (sumBad)   sumBad.textContent   = bad;
    const hasItems = total > 0;
    if (summaryBar)  summaryBar.style.display  = hasItems ? "flex" : "none";
    if (listActions) listActions.style.display = hasItems ? "flex" : "none";
  }

  if (btnClear) {
    btnClear.addEventListener("click", () => {
      state.measurements = [];
      renderCartSorted(); updateSummary(); updateDiagnosis(); updateSendSection();
      roomDropdown.value = "";
    });
  }

  if (btnPrint) {
    btnPrint.addEventListener("click", () => {
      generatePDFReport();
    });
  }

  // ============================================================
  // HELPERS
  // ============================================================
  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  function animateNumber(element, start, end, duration) {
    const startTime = performance.now();
    function update(time) {
      const elapsed  = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      element.textContent = Math.floor(start + (end - start) * progress);
      if (progress < 1) requestAnimationFrame(update);
      else element.textContent = end;
    }
    requestAnimationFrame(update);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // Init
  renderCartSorted();
  updateSendSection();

});
