const input = document.getElementById('city-input');
const searchBtn = document.getElementById('search-btn');
const resultsBox = document.getElementById('results');
const card = document.getElementById('weather-card');

// Escapa texto de las APIs antes de insertarlo como HTML
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Códigos WMO de Open-Meteo -> texto
function describirClima(code) {
  if (code === 0) return '☀️ Despejado';
  if (code <= 2) return '🌤️ Parcialmente nublado';
  if (code === 3) return '☁️ Nublado';
  if (code === 45 || code === 48) return '🌫️ Niebla';
  if (code >= 51 && code <= 57) return '🌦️ Llovizna';
  if (code >= 61 && code <= 67) return '🌧️ Lluvia';
  if (code >= 71 && code <= 77) return '❄️ Nieve';
  if (code >= 80 && code <= 82) return '🌧️ Chubascos';
  if (code >= 85 && code <= 86) return '🌨️ Chubascos de nieve';
  if (code >= 95) return '⛈️ Tormenta eléctrica';
  return 'Sin datos';
}

const iconoClima = (code) => describirClima(code).split(' ')[0];

// Tira horaria de hoy + mínima y máxima del día
function pronosticoHtml(d) {
  if (!d.hourly || !d.daily) return '';
  const ahora = d.current.time;
  const horas = d.hourly.time.map((t, i) => {
    const estado = t.slice(0, 13) === ahora.slice(0, 13) ? 'actual' : (t < ahora ? 'pasada' : '');
    const lluvia = d.hourly.precipitation_probability[i];
    return `<li class="hora ${estado}" style="--i:${i}">
      <span class="h">${estado === 'actual' ? 'Ahora' : t.slice(11, 16)}</span>
      <span class="ico" aria-hidden="true">${iconoClima(d.hourly.weather_code[i])}</span>
      <strong>${Math.round(d.hourly.temperature_2m[i])}°</strong>
      <span class="lluvia">💧 ${lluvia ?? 0}%</span>
    </li>`;
  }).join('');
  return `
    <div class="pronostico">
      <h5>Pronóstico de hoy</h5>
      <p class="resumen-dia">Mínima <strong>${Math.round(d.daily.temperature_2m_min[0])}°</strong>
        · Máxima <strong>${Math.round(d.daily.temperature_2m_max[0])}°</strong>
        · Lluvia hasta <strong>${d.daily.precipitation_probability_max[0] ?? 0}%</strong></p>
      <ul class="horas" aria-label="Pronóstico hora por hora">${horas}</ul>
    </div>`;
}

// Centra la hora actual en la tira (sin mover la página)
function centrarHoraActual() {
  const tira = card.querySelector('.horas');
  const actual = card.querySelector('.hora.actual');
  if (!tira || !actual) return;
  tira.scrollLeft = actual.offsetLeft - (tira.clientWidth - actual.clientWidth) / 2;
}

const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Cuenta desde 0 hasta la temperatura real
function animarTemperatura() {
  const el = card.querySelector('[data-temp]');
  if (!el || sinMovimiento) return;
  const destino = Number(el.dataset.temp);
  const duracion = 900;
  const inicio = performance.now();
  (function paso(ahora) {
    const t = Math.min((ahora - inicio) / duracion, 1);
    const suave = 1 - Math.pow(1 - t, 3); // ease-out
    el.textContent = Math.round(destino * suave) + '°';
    if (t < 1) requestAnimationFrame(paso);
  })(inicio);
}

function mostrarError(msg) {
  card.innerHTML = `<p class="error">❌ ${esc(msg)}</p>`;
}

// 1) Nominatim: búsqueda de lugares (hasta 5 resultados)
async function buscarLugares(texto) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1' +
    `&accept-language=es&q=${encodeURIComponent(texto)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Nominatim respondió con error ' + res.status);
  return res.json();
}

// 2) Open-Meteo: clima actual real según coordenadas
async function obtenerClima(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code' +
    '&hourly=temperature_2m,weather_code,precipitation_probability' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&forecast_days=1&timezone=auto';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Open-Meteo respondió con error ' + res.status);
  return res.json();
}

// 3) Mapa embebido de OpenStreetMap con marcador
function urlMapa(lugar) {
  const [s, n, w, e] = lugar.boundingbox.map(Number);
  const pad = 0.01; // margen mínimo para lugares puntuales
  const bbox = [w - pad, s - pad, e + pad, n + pad].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lugar.lat},${lugar.lon}`;
}

async function mostrarLugar(lugar, consulta) {
  card.innerHTML = '<p class="loading">Consultando el clima…</p>';
  let climaHtml;
  try {
    const datos = await obtenerClima(lugar.lat, lugar.lon);
    const c = datos.current;
    climaHtml = `
      <div class="temp-hero">
        <strong data-temp="${Math.round(c.temperature_2m)}">${Math.round(c.temperature_2m)}°</strong>
        <div>
          <span>${esc(describirClima(c.weather_code))}</span>
          <small>Sensación térmica de ${Math.round(c.apparent_temperature)} °C</small>
        </div>
      </div>
      <div class="weather-grid">
        <div><span>Humedad</span><strong>${c.relative_humidity_2m} %</strong></div>
        <div><span>Viento</span><strong>${c.wind_speed_10m} km/h</strong></div>
      </div>
      ${pronosticoHtml(datos)}`;
  } catch (err) {
    console.error(err);
    climaHtml = '<p class="error">No se pudo obtener el clima en este momento.</p>';
  }

  const nominatimUi = `https://nominatim.openstreetmap.org/ui/search.html?q=${encodeURIComponent(consulta)}`;
  const osmLink = `https://www.openstreetmap.org/?mlat=${lugar.lat}&mlon=${lugar.lon}#map=14/${lugar.lat}/${lugar.lon}`;

  card.innerHTML = `
    <iframe class="map-frame" title="Mapa de ${esc(lugar.name || consulta)}" src="${urlMapa(lugar)}" loading="lazy"></iframe>
    <div class="card-body">
      <h3>${esc(lugar.name || consulta)}</h3>
      <p class="description">${esc(lugar.display_name)}</p>
      <div class="geo-data">
        <p><strong>Lat</strong> ${Number(lugar.lat).toFixed(5)}</p>
        <p><strong>Lon</strong> ${Number(lugar.lon).toFixed(5)}</p>
        <p><strong>Tipo</strong> ${esc(lugar.type)}</p>
      </div>
      <div class="weather-data">
        <h4>Clima ahora</h4>
        ${climaHtml}
      </div>
      <div class="links">
        <a href="${osmLink}" target="_blank" rel="noopener">Abrir en OpenStreetMap</a>
        <a href="${nominatimUi}" target="_blank" rel="noopener">Ver en Nominatim</a>
      </div>
      <div class="success-footer">Datos: © colaboradores de OpenStreetMap · Open-Meteo</div>
    </div>`;
  animarTemperatura();
  centrarHoraActual();
}

function mostrarLista(lugares, consulta) {
  resultsBox.innerHTML = '<p>Se encontraron varios lugares. Elige uno:</p>';
  lugares.forEach((lugar, i) => {
    const b = document.createElement('button');
    b.className = 'result-btn';
    b.style.setProperty('--i', i);
    b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
    b.innerHTML = `${esc(lugar.display_name)}<small>${esc(lugar.type)}</small>`;
    b.addEventListener('click', () => {
      resultsBox.querySelectorAll('.result-btn').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      mostrarLugar(lugar, consulta);
    });
    resultsBox.appendChild(b);
  });
  resultsBox.hidden = false;
}

async function buscar() {
  const consulta = input.value.trim();
  resultsBox.hidden = true;
  resultsBox.innerHTML = '';

  if (!consulta) {
    mostrarError('Escribe un lugar para buscar.');
    return;
  }

  searchBtn.disabled = true;
  card.innerHTML = '<p class="loading">Buscando ubicación…</p>';
  try {
    const lugares = await buscarLugares(consulta);
    if (lugares.length === 0) {
      mostrarError('No se encontraron resultados. Prueba con otro nombre o agrega el país.');
      return;
    }
    if (lugares.length > 1) mostrarLista(lugares, consulta);
    await mostrarLugar(lugares[0], consulta);
  } catch (err) {
    console.error(err);
    mostrarError('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
  } finally {
    searchBtn.disabled = false;
  }
}

searchBtn.addEventListener('click', buscar);
input.addEventListener('keydown', (e) => { if (e.key === 'Enter') buscar(); });
