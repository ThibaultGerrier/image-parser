(document.getElementById("button") as HTMLButtonElement).addEventListener(
  "click",
  () => {
    const input = (document.getElementById("input") as HTMLInputElement).value;
    console.log(input);
    loadImage(input);
  }
);

async function loadImage(url: string) {
  const res = await fetch(url);
  // const res = await fetch("../pngs/tiny.png");
  if (!res.body || !res.ok) {
    console.error("file not found");
    return;
  }
  const jpeg = new JpegProcessor();
  const buf = await res.arrayBuffer();
  jpeg.processDataChunk(new Uint8Array(buf));
  console.log(jpeg);
}

// loadImage("http://localhost:8081/samples/Untitled.jpg");
// loadImage("http://localhost:8081/samples/profile.jpg");

const markerMapping: Record<number, string> = {
  0xffd8: "Start of Image",
  0xffe0: "Application Default Header",
  0xffdb: "Quantization Table",
  0xffc0: "Start of Frame",
  0xffc4: "Define Huffman Table",
  0xffda: "Start of Scan",
  0xffd9: "End of Image",
  0xfffe: "Comment",
};

class JpegProcessor {
  quant: Record<number, Uint8Array> = {};
  huffmanTables: Record<number, HuffmanTable> = {};
  quantMapping: number[] = [];
  height: number;
  width: number;

  processDataChunk(data: Uint8Array) {
    const dv = new DataView(data.buffer);
    let pos = 0;
    while (true) {
      const marker = dv.getUint16(pos);
      console.log(markerMapping[marker] ?? marker.toString(16));
      pos += 2;
      if (marker === 0xffd8) {
        // start, just skip marker
      } else if (marker === 0xffd9) {
        // end
        console.log("done");
        return;
      } else if (marker === 0xfffe) {
        // comment
        const len = dv.getUint16(pos);
        const commentData = data.subarray(pos + 2, pos + len);
        const comment = new TextDecoder("utf-8").decode(commentData);
        console.log({ comment });
        pos += len;
      } else if (marker === 0xffc4) {
        // huffman table
        const len = dv.getUint16(pos);
        const huffmanData = data.subarray(pos + 2, pos + len);
        this.decodeHuffman(huffmanData);
        pos += len;
      } else if (marker === 0xffdb) {
        // quantization table
        const len = dv.getUint16(pos);
        const quantizationData = data.subarray(pos + 2, pos + len);
        this.decodeQuantization(quantizationData);
        pos += len;
      } else if (marker === 0xffc0) {
        // frame data
        const len = dv.getUint16(pos);
        this.decodeFrameData(data.subarray(pos + 2, pos + len), pos + 2);
        pos += len;
      } else if (marker === 0xffda) {
        // scan data
        const len = dv.getUint16(pos);
        this.decodeScanData(data.slice(pos + 2, data.length - 2), len - 2);
        pos = data.length - 2;
      } else {
        // unknown data
        const len = dv.getUint16(pos);
        pos += len;
      }
    }
  }

  decodeHuffman(data: Uint8Array) {
    let pos = 0;
    const header = data[pos];
    pos++;
    const lengths = data.subarray(pos, pos + 16);
    pos += 16;
    const elements: number[] = [];
    for (const l of lengths) {
      elements.push(...Array.from(data.slice(pos, pos + l)));
      pos += l;
    }
    const hf = new HuffmanTable();
    hf.getHuffmanBits(lengths, elements);
    this.huffmanTables[header] = hf;
  }

  decodeQuantization(data: Uint8Array) {
    const hdr = data[0];
    this.quant[hdr] = data.subarray(1, 1 + 64);
  }

  decodeFrameData(data: Uint8Array, pos: number) {
    const dv = new DataView(data.buffer, pos);
    const precision = data[0];
    const height = dv.getUint16(1);
    const width = dv.getUint16(3);
    const numComponents = data[5];
    let p = 6;
    for (let c = 0; c < numComponents; c++) {
      const id = dv.getUint8(p++);
      const samp = dv.getUint8(p++);
      const qtbId = dv.getUint8(p++);
      this.quantMapping.push(qtbId);
    }
    this.height = height;
    this.width = width;
  }

  decodeScanData(data: Uint8Array, headerLength: number) {
    const data1 = data
      .subarray(headerLength)
      .filter((v, i, arr) => !(v === 0 && arr[i - 1] == 0xff));
    const stream = new BitStream(data1);
    let oldLumDCoef = 0;
    let oldCrDCoef = 0;
    let oldCbDCoef = 0;
    for (let y = 0; y < Math.floor(this.height / 8); y++) {
      for (let x = 0; x < Math.floor(this.width / 8); x++) {
        const [matL, lumDCoef] = this.buildMatrix(
          stream,
          0,
          this.quant[this.quantMapping[0]],
          oldLumDCoef
        );
        const [matCr, crDCoef] = this.buildMatrix(
          stream,
          1,
          this.quant[this.quantMapping[1]],
          oldCrDCoef
        );
        const [matCb, cbDCoef] = this.buildMatrix(
          stream,
          1,
          this.quant[this.quantMapping[2]],
          oldCbDCoef
        );
        oldLumDCoef = lumDCoef;
        oldCrDCoef = crDCoef;
        oldCbDCoef = cbDCoef;

        const image = this.drawMatrix(x, y, matL.out, matCb.out, matCr.out);
        const canvas = document.getElementById("canvas") as HTMLCanvasElement;
        const ctx = canvas.getContext("2d");
        ctx?.putImageData(image, x * 8, y * 8);
      }
    }
  }

  buildMatrix(
    stream: BitStream,
    index: number,
    quant: Uint8Array,
    oldDCoef: number
  ): [IDCT, number] {
    const i = new IDCT();
    let code = this.huffmanTables[0 + index].getCode(stream);
    let bits = stream.getNBits(code);
    let dcCoef = decodeNumber(code, bits) + oldDCoef;
    i.base[0] = dcCoef * quant[0];
    let l = 1;
    while (l < 64) {
      code = this.huffmanTables[16 + index].getCode(stream);
      if (code === 0) {
        break;
      }
      if (code > 15) {
        l += code >> 4;
        code = code & 0x0f;
      }
      bits = stream.getNBits(code);
      if (l < 64) {
        const coef = decodeNumber(code, bits);
        i.base[l] = coef * quant[l];
        l++;
      }
    }
    i.rearangeUsingZigZag();
    i.performIDCT();
    return [i, dcCoef];
  }

  drawMatrix(
    x: number,
    y: number,
    matL: number[][],
    matCb: number[][],
    matCr: number[][]
  ) {
    const dataArray = new Uint8ClampedArray(64 * 4);
    for (let xx = 0; xx < 8; xx++) {
      for (let yy = 0; yy < 8; yy++) {
        const [r, g, b] = colorConversion(
          matL[yy][xx],
          matCb[yy][xx],
          matCr[yy][xx]
        );
        const i = (yy * 8 + xx) * 4;
        dataArray[i] = r;
        dataArray[i + 1] = g;
        dataArray[i + 2] = b;
        dataArray[i + 3] = 255;
      }
    }
    return new ImageData(dataArray, 8, 8);
  }
}

function printMatrix2D(mat: number[][]) {
  console.log("======================");
  let str = "";
  for (let row of mat) {
    str += row.join(" ") + "\n";
  }
  console.log(str);
  console.log("======================");
}

function printMatrixUint8(mat: Uint8Array) {
  printMatrix(Array.from(mat));
}
function printMatrix(mat: number[]) {
  console.log("======================");
  let str = "";
  const rows = Math.sqrt(mat.length);
  for (let i = 0; i < rows; i++) {
    const row = mat.slice(i * rows, (i + 1) * rows);
    const formattedRow = row.join(" ");
    str += formattedRow + "\n";
  }
  console.log(str);
  console.log("======================");
}

function clamp(col: number) {
  return Math.min(Math.max(0, Math.round(col)), 255);
}

function colorConversion(y: number, cr: number, cb: number) {
  const r = cr * (2 - 2 * 0.299) + y;
  const b = cb * (2 - 2 * 0.114) + y;
  const g = (y - 0.114 * b - 0.299 * r) / 0.587;
  return [clamp(r + 128), clamp(g + 128), clamp(b + 128)];
}

function decodeNumber(code: number, bits: number) {
  const l = 2 ** (code - 1);
  if (bits >= l) {
    return bits;
  }
  return bits - (2 * l - 1);
}

class IDCT {
  base: number[] = new Array(64).fill(0);
  out: number[][];
  zigZag = [
    [0, 1, 5, 6, 14, 15, 27, 28],
    [2, 4, 7, 13, 16, 26, 29, 42],
    [3, 8, 12, 17, 25, 30, 41, 43],
    [9, 11, 18, 24, 31, 40, 44, 53],
    [10, 19, 23, 32, 39, 45, 52, 54],
    [20, 22, 33, 38, 46, 51, 55, 60],
    [21, 34, 37, 47, 50, 56, 59, 61],
    [35, 36, 48, 49, 57, 58, 62, 63],
  ];
  idctPrecision = 8;
  idctTable = this.buildIdctTable();

  buildIdctTable() {
    return new Array(this.idctPrecision)
      .fill([])
      .map((e1, u) =>
        new Array(this.idctPrecision)
          .fill(0)
          .map(
            (e2, x) =>
              this.normCoef(u) * Math.cos(((2 * x + 1) * u * Math.PI) / 16)
          )
      );
  }

  normCoef(n: number) {
    return n === 0 ? 1 / Math.sqrt(2) : 1;
  }

  rearangeUsingZigZag() {
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        this.zigZag[x][y] = this.base[this.zigZag[x][y]];
      }
    }
    return this.zigZag;
  }

  performIDCT() {
    const out = new Array(8).fill(0).map(() => new Array(8).fill(0));

    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        let localSum = 0;
        for (let u = 0; u < this.idctPrecision; u++) {
          for (let v = 0; v < this.idctPrecision; v++) {
            localSum +=
              this.zigZag[v][u] * this.idctTable[u][x] * this.idctTable[v][y];
          }
        }
        out[y][x] = Math.floor(localSum / 4);
      }
    }
    this.out = out;
  }
}

class HuffmanTable {
  root: any[] = [];
  elements: any[] = [];

  constructor() {}

  getHuffmanBits(lengths: Uint8Array, elements: number[]) {
    this.elements = elements;
    let ii = 0;
    for (let i = 0; i < lengths.length; i++) {
      for (let j = 0; j < lengths[i]; j++) {
        this.bitsFromLengths(this.root, elements[ii], i);
        ii++;
      }
    }
  }

  bitsFromLengths(root: any[], element: number, pos: number) {
    if (!Array.isArray(root)) {
      return false;
    }
    if (pos === 0) {
      if (root.length < 2) {
        root.push(element);
        return true;
      }
      return false;
    } else {
      for (const i of [0, 1]) {
        if (root.length === i) {
          root.push([]);
        }
        if (this.bitsFromLengths(root[i], element, pos - 1)) {
          return true;
        }
      }
    }
  }

  find(st: BitStream) {
    let r = this.root;
    if (r.length === 1) {
      return r[0];
    }
    while (Array.isArray(r)) {
      r = r[st.getBit()];
    }
    return r;
  }

  getCode(st: BitStream) {
    while (true) {
      let res = this.find(st);
      if (res === 0) {
        return 0;
      } else if (res != -1) {
        return res;
      }
    }
  }
}

class BitStream {
  pos = 0;
  data: Uint8Array;
  constructor(data: Uint8Array) {
    this.data = data;
  }

  getBit() {
    const b = this.data[this.pos >> 3];
    const s = 7 - (this.pos & 0x7);
    this.pos++;
    const a = (b >> s) & 1;
    return a;
  }

  getNBits(n: number) {
    let val = 0;
    for (let i = 0; i < n; i++) {
      val = val * 2 + this.getBit();
    }
    return val;
  }
}