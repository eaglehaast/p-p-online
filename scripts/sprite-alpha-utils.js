'use strict';

// Чтение альфы из png — для тестов, которые сверяют вырезы в стилях с настоящими
// картинками. Держится отдельно, потому что таких тестов уже два: листы морд и листы
// жестов, и оба меряют одно и то же одинаково.
//
// Читает только 8-битный RGBA без чересстрочности: все листы в проекте такие, а полная
// читалка png тут была бы куда больше самих проверок.

const fs = require('fs');
const zlib = require('zlib');

const ПОРОГ_АЛЬФЫ = 16; // ниже — невидимый мусор от экспорта, в замерах не участвует

function читатьАльфу(путь){
  const buf = fs.readFileSync(путь);
  if(!buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))){
    throw new Error('это не png: ' + путь);
  }
  let pos = 8;
  let width = 0, height = 0;
  const данные = [];
  while(pos < buf.length){
    const len = buf.readUInt32BE(pos);
    const тип = buf.slice(pos + 4, pos + 8).toString('latin1');
    const тело = buf.slice(pos + 8, pos + 8 + len);
    if(тип === 'IHDR'){
      width = тело.readUInt32BE(0);
      height = тело.readUInt32BE(4);
      if(!(тело[8] === 8 && тело[9] === 6 && тело[12] === 0)){
        throw new Error(`${путь} перестал быть 8-битным RGBA без чересстрочности — читалка `
          + 'рассчитана только на такой');
      }
    } else if(тип === 'IDAT'){
      данные.push(тело);
    } else if(тип === 'IEND'){
      break;
    }
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(данные));
  const bpp = 4;
  const строка = width * bpp;
  const alpha = new Uint8Array(width * height);
  let prev = Buffer.alloc(строка);
  for(let y = 0; y < height; y += 1){
    const фильтр = raw[y * (строка + 1)];
    const cur = Buffer.from(raw.slice(y * (строка + 1) + 1, y * (строка + 1) + 1 + строка));
    for(let i = 0; i < строка; i += 1){
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = cur[i];
      if(фильтр === 1) v += a;
      else if(фильтр === 2) v += b;
      else if(фильтр === 3) v += (a + b) >> 1;
      else if(фильтр === 4){
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 0xff;
    }
    for(let x = 0; x < width; x += 1) alpha[y * width + x] = cur[x * bpp + 3];
    prev = cur;
  }
  return { width, height, alpha };
}

// Рамка непрозрачного внутри прямоугольника. null, если там пусто.
function рамка(лист, x0, y0, x1, y1, порог = ПОРОГ_АЛЬФЫ){
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for(let y = y0; y < y1; y += 1){
    for(let x = x0; x < x1; x += 1){
      if(лист.alpha[y * лист.width + x] <= порог) continue;
      if(x < minX) minX = x;
      if(y < minY) minY = y;
      if(x > maxX) maxX = x;
      if(y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1 };
}

// Полосы непустых СТРОК в столбце x0..x1 — так на листе отделяются друг от друга
// картинки, лежащие одна над другой.
function полосы(лист, x0, x1, порог = ПОРОГ_АЛЬФЫ){
  const найдено = [];
  let нач = null;
  for(let y = 0; y <= лист.height; y += 1){
    let есть = false;
    for(let x = x0; x < x1 && !есть; x += 1){
      if(y < лист.height && лист.alpha[y * лист.width + x] > порог) есть = true;
    }
    if(есть && нач === null) нач = y;
    if(!есть && нач !== null){
      найдено.push(рамка(лист, x0, нач, x1, y, порог));
      нач = null;
    }
  }
  return найдено;
}

module.exports = { читатьАльфу, рамка, полосы, ПОРОГ_АЛЬФЫ };
