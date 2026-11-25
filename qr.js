/* Minimal QR Code generator (byte mode, error correction level M, versions 1-10: up to 213 bytes).
   makeQR(text) returns the module matrix (array of rows of booleans, true = dark).
   Follows ISO/IEC 18004: Reed-Solomon over GF(256), function patterns, zigzag placement, best of 8 masks. */
var makeQR = (function () {
  // Level M, per version: [error correction codewords per block, blocks of group 1, data codewords per block of group 1, blocks of group 2]
  // (group 2 blocks hold one data codeword more than group 1)
  var EC_M = [null, [10,1,16,0], [16,1,28,0], [26,1,44,0], [18,2,32,0], [24,2,43,0],
              [16,4,27,0], [18,4,31,0], [22,2,38,2], [22,3,36,2], [26,4,43,1]];
  var ALIGN = [null, [], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38], [6,24,42], [6,26,46], [6,28,50]];

  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(degree) {
    var res = [], root = 1, i, j;
    for (i = 0; i < degree - 1; i++) res.push(0);
    res.push(1);
    for (i = 0; i < degree; i++) {
      for (j = 0; j < degree; j++) {
        res[j] = gfMul(res[j], root);
        if (j + 1 < degree) res[j] ^= res[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return res;
  }
  function rsRemainder(data, divisor) {
    var res = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ res.shift();
      res.push(0);
      divisor.forEach(function (coef, i) { res[i] ^= gfMul(coef, factor); });
    });
    return res;
  }
  function utf8(text) {
    var s = unescape(encodeURIComponent(text)), out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  // Data + error correction codewords, interleaved
  function codewords(bytes, ver) {
    var t = EC_M[ver], ecLen = t[0];
    var dataLen = t[1] * t[2] + t[3] * (t[2] + 1);
    var bits = [];
    function put(val, n) { for (var i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(4, 4); // byte mode
    put(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, dataLen * 8 - bits.length)); // terminator
    while (bits.length % 8) bits.push(0);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (var pad = 0xEC; data.length < dataLen; pad ^= 0xEC ^ 0x11) data.push(pad);

    var blocks = [], ecc = [], div = rsDivisor(ecLen), pos = 0, nBlocks = t[1] + t[3];
    for (var b = 0; b < nBlocks; b++) {
      var len = t[2] + (b < t[1] ? 0 : 1);
      var blk = data.slice(pos, pos + len);
      pos += len;
      blocks.push(blk);
      ecc.push(rsRemainder(blk, div));
    }
    var out = [], k;
    for (i = 0; i <= t[2]; i++) for (k = 0; k < nBlocks; k++) if (i < blocks[k].length) out.push(blocks[k][i]);
    for (i = 0; i < ecLen; i++) for (k = 0; k < nBlocks; k++) out.push(ecc[k][i]);
    return out;
  }

  function bch(value, poly, polyBits, shift) {
    var rem = value << shift;
    for (var i = 31 - Math.clz32(rem); i >= polyBits - 1; i--) if ((rem >>> i) & 1) rem ^= poly << (i - polyBits + 1);
    return (value << shift) | rem;
  }

  function build(cw, ver, mask) {
    var size = ver * 4 + 17, m = [], fn = [], x, y, i;
    for (y = 0; y < size; y++) { m.push([]); fn.push([]); for (x = 0; x < size; x++) { m[y].push(false); fn[y].push(false); } }
    function set(x, y, dark) { m[y][x] = dark; fn[y][x] = true; }

    for (i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); } // timing
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) { // finders + separators
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var xx = c[0] + dx, yy = c[1] + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4);
      }
    });
    var al = ALIGN[ver], last = al.length - 1;
    al.forEach(function (ay, a) { al.forEach(function (ax, b) {
      if ((a === 0 && b === 0) || (a === 0 && b === last) || (a === last && b === 0)) return;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++)
        set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }); });

    // format info (level M = 00), two copies, plus the dark module
    var f = bch(mask, 0x537, 11, 10) ^ 0x5412;
    function fb(i) { return ((f >>> i) & 1) === 1; }
    for (i = 0; i <= 5; i++) set(8, i, fb(i));
    set(8, 7, fb(6)); set(8, 8, fb(7)); set(7, 8, fb(8));
    for (i = 9; i < 15; i++) set(14 - i, 8, fb(i));
    for (i = 0; i < 8; i++) set(size - 1 - i, 8, fb(i));
    for (i = 8; i < 15; i++) set(8, size - 15 + i, fb(i));
    set(8, size - 8, true);

    if (ver >= 7) { // version info, two copies
      var v = bch(ver, 0x1F25, 13, 12);
      for (i = 0; i < 18; i++) {
        var bit = ((v >>> i) & 1) === 1, a = size - 11 + i % 3, b = Math.floor(i / 3);
        set(a, b, bit); set(b, a, bit);
      }
    }

    // codewords in the zigzag order, masked
    var n = 0, total = cw.length * 8;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (var j = 0; j < 2; j++) {
        x = right - j;
        y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (fn[y][x]) continue;
        var dark = n < total && ((cw[n >>> 3] >>> (7 - (n & 7))) & 1) === 1;
        n++;
        m[y][x] = dark !== maskBit(mask, x, y);
      }
    }
    return m;
  }

  function maskBit(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return x * y % 2 + x * y % 3 === 0;
      case 6: return (x * y % 2 + x * y % 3) % 2 === 0;
      default: return ((x + y) % 2 + x * y % 3) % 2 === 0;
    }
  }

  // Penalty score of a candidate (lower = easier to scan)
  function penalty(m) {
    var size = m.length, p = 0, dark = 0, x, y;
    function line(get) {
      for (var a = 0; a < size; a++) {
        var run = 1, s = '';
        for (var b = 0; b < size; b++) {
          s += get(a, b) ? '1' : '0';
          if (b > 0 && get(a, b) === get(a, b - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
          else run = 1;
        }
        s = '0000' + s + '0000';
        p += 40 * ((s.match(/(?=10111010000)/g) || []).length + (s.match(/(?=00001011101)/g) || []).length);
      }
    }
    line(function (a, b) { return m[a][b]; });
    line(function (a, b) { return m[b][a]; });
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) {
      if (m[y][x]) dark++;
      if (x < size - 1 && y < size - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    }
    p += 10 * Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size));
    return p;
  }

  return function (text) {
    var bytes = utf8(text), ver;
    for (ver = 1; ver <= 10; ver++) {
      var t = EC_M[ver], cap = t[1] * t[2] + t[3] * (t[2] + 1);
      if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= cap * 8) break;
    }
    if (ver > 10) throw new Error('QR: text too long');
    var cw = codewords(bytes, ver), best = null, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var m = build(cw, ver, mask), s = penalty(m);
      if (s < bestScore) { best = m; bestScore = s; }
    }
    return best;
  };
})();
