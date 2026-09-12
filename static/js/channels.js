/**
 * WIN Wi-Fi Scanner Web - Channel Spectrum Visualizer (Canvas Nativo)
 * Dibuja las curvas parabólicas del espectro Wi-Fi para las bandas 2.4 GHz y 5 GHz.
 */

class ChannelSpectrum {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.activeBand = '2.4';
    this.networks = [];

    // Ajustar resolución por DPI
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.draw();
  }

  setBand(band) {
    this.activeBand = band;
    this.draw();
  }

  updateData(networks) {
    this.networks = networks || [];
    this.draw();
    this.updateRecommendation();
  }

  draw() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const ctx = this.ctx;

    // Limpiar canvas
    ctx.clearRect(0, 0, width, height);

    if (this.activeBand === '2.4') {
      this.draw24GHzSpectrum(width, height);
    } else {
      this.draw5GHzSpectrum(width, height);
    }
  }

  draw24GHzSpectrum(width, height) {
    const ctx = this.ctx;
    const paddingLeft = 40;
    const paddingRight = 40;
    const paddingTop = 30;
    const paddingBottom = 40;
    const graphWidth = width - paddingLeft - paddingRight;
    const graphHeight = height - paddingTop - paddingBottom;

    // Canales 1 a 14
    const minCh = 1;
    const maxCh = 14;

    const channelToX = (ch) => {
      return paddingLeft + ((ch - minCh) / (maxCh - minCh)) * graphWidth;
    };

    // Cuadrícula y Líneas de Fondo
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;

    for (let i = 0; i <= 4; i++) {
      const y = paddingTop + (graphHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();

      // Porcentajes en el eje Y
      const pct = 100 - i * 25;
      ctx.fillStyle = '#64748b';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${pct}%`, paddingLeft - 8, y + 3);
    }

    // Dibujar Canales en el Eje X (1 a 14)
    for (let ch = 1; ch <= 14; ch++) {
      const x = channelToX(ch);
      
      // Resaltar canales no superpuestos estándar (1, 6, 11)
      const isStandard = (ch === 1 || ch === 6 || ch === 11);
      ctx.strokeStyle = isStandard ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255, 255, 255, 0.04)';
      ctx.beginPath();
      ctx.moveTo(x, paddingTop);
      ctx.lineTo(x, height - paddingBottom);
      ctx.stroke();

      ctx.fillStyle = isStandard ? '#06b6d4' : '#94a3b8';
      ctx.font = isStandard ? 'bold 11px Outfit, sans-serif' : '10px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`CH ${ch}`, x, height - paddingBottom + 18);
    }

    // Filtrar redes de 2.4 GHz
    const nets24 = this.networks.filter(n => {
      const ch = parseInt(n.channel, 10);
      return ch >= 1 && ch <= 14;
    });

    // Dibujar curvas parabólicas para cada red Wi-Fi
    nets24.forEach(net => {
      const ch = parseInt(net.channel, 10) || 1;
      const sig = Math.max(10, Math.min(100, net.signal || 50));
      const centerX = channelToX(ch);
      const curveHeight = (sig / 100) * graphHeight;
      const curveY = paddingTop + graphHeight - curveHeight;

      // Ancho aproximado del canal: 2 canales a cada lado (canal de 20/22 MHz)
      const leftX = channelToX(Math.max(0, ch - 2));
      const rightX = channelToX(Math.min(15, ch + 2));
      const halfWidth = (rightX - leftX) / 2;

      // Color dinámico según intensidad
      let strokeColor = 'rgba(6, 182, 212, 0.85)';
      let fillColor = 'rgba(6, 182, 212, 0.12)';
      if (sig >= 75) {
        strokeColor = 'rgba(16, 185, 129, 0.9)';
        fillColor = 'rgba(16, 185, 129, 0.15)';
      } else if (sig < 45) {
        strokeColor = 'rgba(239, 68, 68, 0.8)';
        fillColor = 'rgba(239, 68, 68, 0.12)';
      }

      // Dibujar curva parabólica
      ctx.beginPath();
      ctx.moveTo(centerX - halfWidth, paddingTop + graphHeight);
      ctx.quadraticCurveTo(centerX, curveY, centerX + halfWidth, paddingTop + graphHeight);
      ctx.closePath();

      ctx.fillStyle = fillColor;
      ctx.fill();

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Etiqueta del SSID en la cúspide
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px Outfit, sans-serif';
      ctx.textAlign = 'center';
      const label = net.ssid.length > 14 ? net.ssid.substring(0, 12) + '…' : net.ssid;
      ctx.fillText(`${label} (${sig}%)`, centerX, Math.max(paddingTop + 10, curveY - 6));
    });
  }

  draw5GHzSpectrum(width, height) {
    const ctx = this.ctx;
    const paddingLeft = 45;
    const paddingRight = 45;
    const paddingTop = 30;
    const paddingBottom = 40;
    const graphWidth = width - paddingLeft - paddingRight;
    const graphHeight = height - paddingTop - paddingBottom;

    // Canales representativos de 5 GHz: 36 a 165
    const channels5G = [36, 40, 44, 48, 52, 56, 60, 64, 100, 108, 116, 132, 149, 153, 157, 161, 165];

    const getXForChannel = (ch) => {
      const idx = channels5G.indexOf(ch);
      if (idx !== -1) {
        return paddingLeft + (idx / (channels5G.length - 1)) * graphWidth;
      }
      // Aproximar si no está en la lista estándar
      const min = 36;
      const max = 165;
      return paddingLeft + ((Math.max(min, Math.min(max, ch)) - min) / (max - min)) * graphWidth;
    };

    // Cuadrícula Y
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = paddingTop + (graphHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();

      const pct = 100 - i * 25;
      ctx.fillStyle = '#64748b';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${pct}%`, paddingLeft - 8, y + 3);
    }

    // Dibujar canales principales 5G
    channels5G.forEach(ch => {
      const x = getXForChannel(ch);
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.15)';
      ctx.beginPath();
      ctx.moveTo(x, paddingTop);
      ctx.lineTo(x, height - paddingBottom);
      ctx.stroke();

      ctx.fillStyle = '#a855f7';
      ctx.font = '10px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${ch}`, x, height - paddingBottom + 18);
    });

    // Filtrar redes 5 GHz
    const nets5G = this.networks.filter(n => {
      const ch = parseInt(n.channel, 10);
      return ch >= 32;
    });

    // Dibujar curvas para 5 GHz
    nets5G.forEach(net => {
      const ch = parseInt(net.channel, 10) || 36;
      const sig = Math.max(10, Math.min(100, net.signal || 50));
      const centerX = getXForChannel(ch);
      const curveHeight = (sig / 100) * graphHeight;
      const curveY = paddingTop + graphHeight - curveHeight;

      const curveWidth = 35; // Curva más estrecha y limpia para 5 GHz

      ctx.beginPath();
      ctx.moveTo(centerX - curveWidth, paddingTop + graphHeight);
      ctx.quadraticCurveTo(centerX, curveY, centerX + curveWidth, paddingTop + graphHeight);
      ctx.closePath();

      ctx.fillStyle = 'rgba(168, 85, 247, 0.18)';
      ctx.fill();

      ctx.strokeStyle = 'rgba(168, 85, 247, 0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '10px Outfit, sans-serif';
      ctx.textAlign = 'center';
      const label = net.ssid.length > 14 ? net.ssid.substring(0, 12) + '…' : net.ssid;
      ctx.fillText(`${label} (${sig}%)`, centerX, Math.max(paddingTop + 10, curveY - 6));
    });
  }

  updateRecommendation() {
    const el = document.getElementById('channel-recommendation');
    if (!el) return;

    // Calcular ocupación en canales 2.4 GHz (1, 6, 11)
    const counts = { 1: 0, 6: 0, 11: 0 };
    this.networks.forEach(net => {
      const ch = parseInt(net.channel, 10);
      if (ch <= 3) counts[1] += (net.signal || 50);
      else if (ch >= 4 && ch <= 8) counts[6] += (net.signal || 50);
      else if (ch >= 9 && ch <= 14) counts[11] += (net.signal || 50);
    });

    // Elegir el canal con menor carga de interferencia
    let bestCh = 1;
    let minScore = counts[1];
    if (counts[6] < minScore) {
      minScore = counts[6];
      bestCh = 6;
    }
    if (counts[11] < minScore) {
      minScore = counts[11];
      bestCh = 11;
    }

    el.innerHTML = `💡 <strong>Canal recomendado en 2.4 GHz:</strong> Canal <strong>${bestCh}</strong> (Menor interferencia en tu entorno).`;
  }
}
