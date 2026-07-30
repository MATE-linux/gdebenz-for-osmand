// Саратовская область (центр + радиус)
const SARATOV = { lat: 51.5336, lon: 46.0342 };
const RADIUS_KM = 70; // 70 км покрывает почти всю область

// Хранилище кук в глобальной переменной (сбрасывается при холодном старте)
let cachedCookies = null;
let cookieExpiry = 0;

async function getCookies() {
  // Если куки есть и не истекли — используем их
  if (cachedCookies && Date.now() < cookieExpiry) {
    return cachedCookies;
  }

  // Получаем новые куки с главной страницы
  const resp = await fetch('https://gdebenz.ru/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    }
  });

  const setCookie = resp.headers.get('set-cookie') || '';
  // Извлекаем только __ddg8_, __ddg10_, __ddg9_
  const match = setCookie.match(/(__ddg8_=[^;]+; __ddg10_=[^;]+; __ddg9_=[^;]+)/);
  const cookies = match ? match[1] : setCookie;

  if (!cookies) {
    throw new Error('Failed to get cookies');
  }

  cachedCookies = cookies;
  cookieExpiry = Date.now() + 3600 * 1000; // 1 час
  return cookies;
}

async function fetchStations(cookies) {
  const url = `https://gdebenz.ru/api/nearby?lat=${SARATOV.lat}&lon=${SARATOV.lon}&radius_km=${RADIUS_KM}`;
  const resp = await fetch(url, {
    headers: {
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': 'https://gdebenz.ru/',
      'Origin': 'https://gdebenz.ru',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    }
  });

  if (!resp.ok) {
    throw new Error(`API error: ${resp.status}`);
  }

  const data = await resp.json();
  return data.stations || [];
}

// Конвертация в GeoJSON
function toGeoJSON(stations) {
  const features = stations.map(st => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [st.lon, st.lat]
    },
    properties: {
      id: st.osm_id,
      name: st.name || st.brand,
      brand: st.brand,
      status: st.status,
      fuels: st.fuels_now,
      confirmations: st.confirmations,
      addr: st.addr
    }
  }));

  return {
    type: 'FeatureCollection',
    features: features
  };
}

export default {
  async fetch(request, env) {
    try {
      // 1. Получаем куки
      const cookies = await getCookies();

      // 2. Запрашиваем станции
      const stations = await fetchStations(cookies);

      // 3. Преобразуем в GeoJSON
      const geojson = toGeoJSON(stations);

      // 4. Возвращаем с кэшированием на 5 минут
      return new Response(JSON.stringify(geojson, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300', // 5 минут
          'Access-Control-Allow-Origin': '*',
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
