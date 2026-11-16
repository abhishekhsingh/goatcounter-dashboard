// Country helpers: names to ISO codes (GoatCounter reports English names), flags, and the lazy map loader.
export const COUNTRY_FLAGS = {
  'India':'🇮🇳','United States':'🇺🇸','United Kingdom':'🇬🇧','Germany':'🇩🇪','France':'🇫🇷','Japan':'🇯🇵',
  'Canada':'🇨🇦','Australia':'🇦🇺','Brazil':'🇧🇷','China':'🇨🇳','Russia':'🇷🇺','Spain':'🇪🇸','Italy':'🇮🇹',
  'Netherlands':'🇳🇱','Sweden':'🇸🇪','Norway':'🇳🇴','Switzerland':'🇨🇭','Singapore':'🇸🇬','Mexico':'🇲🇽',
  'United Arab Emirates':'🇦🇪','Pakistan':'🇵🇰','Bangladesh':'🇧🇩','Indonesia':'🇮🇩','Turkey':'🇹🇷',
  'South Korea':'🇰🇷','Vietnam':'🇻🇳','Poland':'🇵🇱','Argentina':'🇦🇷','Saudi Arabia':'🇸🇦',
  'South Africa':'🇿🇦','Egypt':'🇪🇬','Israel':'🇮🇱','Ireland':'🇮🇪','Belgium':'🇧🇪','Denmark':'🇩🇰',
  'Finland':'🇫🇮','Portugal':'🇵🇹','Greece':'🇬🇷','Czech Republic':'🇨🇿','Czechia':'🇨🇿','Romania':'🇷🇴',
  'Ukraine':'🇺🇦','New Zealand':'🇳🇿','Hong Kong':'🇭🇰','Taiwan':'🇹🇼','Thailand':'🇹🇭','Philippines':'🇵🇭',
  'Malaysia':'🇲🇾','Chile':'🇨🇱','Colombia':'🇨🇴','Austria':'🇦🇹','Hungary':'🇭🇺',
};

export const COUNTRY_NAME_TO_CODE = {
  'United States':'US','United States of America':'US',
  'United Kingdom':'GB','Great Britain':'GB','England':'GB',
  'Russia':'RU','Russian Federation':'RU',
  'South Korea':'KR','Korea, Republic of':'KR','Republic of Korea':'KR',
  'North Korea':'KP','Korea, Democratic People’s Republic of':'KP',
  'Czech Republic':'CZ','Czechia':'CZ',
  'Vietnam':'VN','Viet Nam':'VN',
  'Iran':'IR','Iran, Islamic Republic of':'IR',
  'Syria':'SY','Syrian Arab Republic':'SY',
  'Tanzania':'TZ','Tanzania, United Republic of':'TZ',
  'Bolivia':'BO','Bolivia (Plurinational State of)':'BO',
  'Venezuela':'VE','Venezuela (Bolivarian Republic of)':'VE',
  'Moldova':'MD','Republic of Moldova':'MD',
  'Laos':'LA','Lao People’s Democratic Republic':'LA',
  'Brunei':'BN','Brunei Darussalam':'BN',
  'Macedonia':'MK','North Macedonia':'MK','Republic of Macedonia':'MK',
  'Ivory Coast':'CI','Cote d’Ivoire':'CI','Côte d’Ivoire':'CI',
  'Cape Verde':'CV','Cabo Verde':'CV',
  'East Timor':'TL','Timor-Leste':'TL',
  'Swaziland':'SZ','Eswatini':'SZ','eSwatini':'SZ',
  'Burma':'MM','Myanmar':'MM',
  'Falkland Islands':'FK','Falkland Is.':'FK',
  'DR Congo':'CD','Democratic Republic of the Congo':'CD','Congo (Kinshasa)':'CD',
  'Republic of the Congo':'CG','Congo':'CG','Congo (Brazzaville)':'CG',
  'Palestine':'PS','State of Palestine':'PS','Palestinian Territory':'PS',
  'Hong Kong':'HK','Macao':'MO','Macau':'MO',
  'Taiwan':'TW','Taiwan, Province of China':'TW',
  'Vatican':'VA','Holy See':'VA','Vatican City':'VA',
  'Kosovo':'XK',
};

export function flagFor(name) { return COUNTRY_FLAGS[name] || '\u{1F310}'; }

// Resolve a row from /stats/locations to an ISO alpha-2 code. Tries the id, then the name tables.
export function countryCode(row) {
  const names = (typeof window !== 'undefined' && window.WORLD_MAP_NAMES) || {};
  const paths = (typeof window !== 'undefined' && window.WORLD_MAP_PATHS) || {};
  if (row.id && /^[A-Za-z]{2}$/.test(row.id) && paths[row.id.toUpperCase()]) return row.id.toUpperCase();
  const n = (row.name || '').trim();
  return COUNTRY_NAME_TO_CODE[n] || names[n] || null;
}

// The map data is a plain script that sets window globals. It loads only when the countries card is near the viewport.
let mapPromise = null;
export function loadWorldMap() {
  if (typeof window !== 'undefined' && window.WORLD_MAP_PATHS) return Promise.resolve();
  if (!mapPromise) mapPromise = new Promise((res) => { const el = document.createElement('script'); el.src = 'assets/world-map.js'; el.onload = res; el.onerror = res; document.head.append(el); });
  return mapPromise;
}
