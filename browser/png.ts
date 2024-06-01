// @ts-ignore
import { Inflate } from "https://unpkg.com/pako@2.1.0/dist/pako.esm.mjs";

type ChunkHeader = {
  type: string;
  length: number;
};

export class PngProcessor {
  state: "magic" = "magic";
  position = 0;
  inflator = new Inflate();

  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  compressionMethod: number;
  filterMethod: number;
  interlaceMethod: number;
  ppuX: number;
  ppuY: number;
  ppUnit: number;
  date: Date;
  meta: Record<string, string> = {};

  pixelData: Uint8Array;

  parseChunkHeader(dataChunk: Uint8Array) {
    const dv = new DataView(dataChunk.buffer);
    const length = dv.getUint32(this.position);
    this.position += 4;
    const type = this.readString(dv, 4);
    this.position += 4;
    return { type, length };
  }

  processDataChunk(dataChunk: Uint8Array) {
    const dv = new DataView(dataChunk.buffer);

    if (this.position === 0) {
      const magicBytes = dataChunk.subarray(0, 8);
      this.position += 8;
      const str = magicBytes.join(" ");
      if (str !== "137 80 78 71 13 10 26 10") {
        console.log(dataChunk);
        throw new Error("not a valid PNG");
      }
    }

    console.log(this);

    while (true) {
      const content = this.parseChunkHeader(dataChunk);
      switch (content.type) {
        case "IHDR":
          this.parseIHDR(dv);
          break;
        case "pHYs":
          this.parsePHYS(dv);
          break;
        case "tIME":
          this.parseTIME(dv);
          break;
        case "tEXt":
          this.parseTEXT(dataChunk, content.length);
          break;
        case "IDAT":
          this.parseIDAT(dataChunk, content.length);
          break;
        case "IEND":
          this.drawImage();
          return;
        default:
          console.log("unknown type: ", content.type);
          this.position += content.length;
          this.advanceChunkEnd();
      }
    }
  }

  drawImage() {
    if (!this.pixelData) {
      console.warn("missing image data");
      return;
    }
    const image = this.toImageData(this.pixelData);
    const canvas = document.getElementById("canvas") as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    canvas.width = this.width;
    canvas.height = this.height;
    ctx?.putImageData(image, 0, 0);
  }

  parseIHDR(dv: DataView) {
    this.width = dv.getUint32(this.position);
    this.position += 4;
    this.height = dv.getUint32(this.position);
    this.position += 4;
    this.bitDepth = dv.getUint8(this.position++);
    this.colorType = dv.getUint8(this.position++);
    this.compressionMethod = dv.getUint8(this.position++);
    this.filterMethod = dv.getUint8(this.position++);
    this.interlaceMethod = dv.getUint8(this.position++);
    this.advanceChunkEnd();
  }

  parsePHYS(dv: DataView) {
    this.ppuX = dv.getUint32(this.position);
    this.position += 4;
    this.ppuY = dv.getUint32(this.position);
    this.position += 4;
    this.ppUnit = dv.getUint8(this.position++);
    this.advanceChunkEnd();
  }

  parseTIME(dv: DataView) {
    const year = dv.getUint16(this.position);
    this.position += 2;
    const month = dv.getUint8(this.position++);
    const day = dv.getUint8(this.position++);
    const hour = dv.getUint8(this.position++);
    const minute = dv.getUint8(this.position++);
    const second = dv.getUint8(this.position++);
    this.date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    this.advanceChunkEnd();
  }

  parseTEXT(arr: Uint8Array, chunkLen: number) {
    const zeroIndex = arr
      .subarray(this.position, this.position + chunkLen)
      .findIndex((n) => n === 0);
    const decoder = new TextDecoder("iso-8859-1");
    const keyword = decoder.decode(
      arr.subarray(this.position, this.position + zeroIndex)
    );
    const text = decoder.decode(
      arr.subarray(this.position + zeroIndex + 1, this.position + chunkLen)
    );
    this.meta[keyword] = text;
    this.position += chunkLen;
    this.advanceChunkEnd();
  }

  parseIDAT(arr: Uint8Array, chunkLen: number) {
    const dataChunk = arr.subarray(this.position, this.position + chunkLen);
    // const decompressed = inflate(dataChunk);
    this.inflator.push(dataChunk);
    if (this.interlaceMethod !== 0) {
      throw new Error("Interlace method not supported");
    }
    if (this.inflator.ended) {
      this.pixelData = this.undoFilters(this.inflator.result);
    }
    this.position += chunkLen;
    this.advanceChunkEnd();
  }

  toImageData(pixelData: Uint8Array) {
    const dataArray = new Uint8ClampedArray(this.width * this.height * 4);
    if (this.colorType === 2) {
      for (let i = 0; i < this.width * this.height; i++) {
        const posTarget = i * 4;
        const posSource = i * 3;
        dataArray[posTarget] = pixelData[posSource];
        dataArray[posTarget + 1] = pixelData[posSource + 1];
        dataArray[posTarget + 2] = pixelData[posSource + 2];
        dataArray[posTarget + 3] = 255;
      }
    } else if (this.colorType === 6) {
      for (let i = 0; i < pixelData.length; i++) {
        dataArray[i] = pixelData[i];
      }
    } else {
      throw new Error(`unsupported color type ${this.colorType}`);
    }

    return new ImageData(dataArray, this.width, this.height);
  }

  undoFilters(data: Uint8Array) {
    if (this.filterMethod !== 0) {
      throw new Error("Unknown filter method");
    }
    const bytesPerPixel = this.bytesPerPixel();
    const pixelBytesPerRow = this.width * bytesPerPixel;
    const bytesPerRow = pixelBytesPerRow + 1;

    const result = new Uint8Array(data.length - this.height);

    for (let row = 0; row < this.height; row++) {
      const filterType = data[row * bytesPerRow];
      for (let col = 0; col < this.width * bytesPerPixel; col++) {
        const left = col < bytesPerPixel;
        const top = row === 0;
        const x = data[row * bytesPerRow + col + 1];
        const a = left
          ? 0
          : result[row * pixelBytesPerRow + col - bytesPerPixel];
        const b = top ? 0 : result[(row - 1) * pixelBytesPerRow + col];
        const c =
          top || left
            ? 0
            : result[(row - 1) * pixelBytesPerRow + col - bytesPerPixel];
        result[row * pixelBytesPerRow + col] =
          this.applyFilterType(filterType, x, a, b, c) % 256;
      }
    }
    return result;
  }

  applyFilterType(
    filterType: number,
    x: number,
    a: number,
    b: number,
    c: number
  ) {
    switch (filterType) {
      case 0:
        return x;
      case 1:
        return x + a;
      case 2:
        return x + b;
      case 3:
        return x + Math.trunc((a + b) / 2);
      case 4:
        return x + this.paethPredictor(a, b, c);
      default:
        throw new Error("unknown filter type");
    }
  }

  paethPredictor(a: number, b: number, c: number) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) {
      return a;
    }
    if (pb <= pc) {
      return b;
    }
    return c;
  }

  bytesPerPixel() {
    if (this.bitDepth < 8) {
      throw new Error(`Bitdepth ${this.bitDepth} not supported`);
    }
    const bytesDepth = this.bitDepth / 8; // 8->1, 16->2
    switch (this.colorType) {
      case 0: // greyscale
        return bytesDepth;
      case 2: // r, g, b
        return bytesDepth * 3;
      case 3: // palette index
        return bytesDepth;
      case 4: // greyscale alpha
        return bytesDepth * 2;
      case 6: // r, g, b, alpha
        return bytesDepth * 4;
      default:
        throw new Error("Unknown color type");
    }
  }

  readString(dataView: DataView, length: number) {
    const str = new Array(length)
      .fill("")
      .map((e, index) =>
        String.fromCharCode(dataView.getUint8(this.position + index))
      )
      .join("");
    return str;
  }

  advanceChunkEnd() {
    this.position += 4;
  }
}
