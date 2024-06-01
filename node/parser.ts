import fs from "fs";
import zlib from 'zlib';

class IteratorDoneError extends Error {}

function take<T>(iter: IterableIterator<T>, num: number): T[] {
  const res: T[] = [];
  for (let i = 0; i < num; i++) {
    const val = iter.next();
    res.push(val.value);
    if (val.done) {
      throw new IteratorDoneError();
    }
  }
  return res;
}

function takeUntil<T>(
  iter: IterableIterator<T>,
  until: (t: T) => boolean
): T[] {
  const result: T[] = [];
  for (const item of iter) {
    if (until(item)) {
      break;
    }
    result.push(item);
  }
  return result;
}

function takeAsNum(iter: IterableIterator<number>, num: number) {
  return bytesToNum(take(iter, num));
}

function printIntArr(arr: number[]) {
  console.log(arr.map((n) => n.toString(16)).join(" "));
}

function bytesToNum(arr: number[]) {
  return arr.reverse().reduce((acc, cur, i) => acc + cur * 16 ** (i * 2), 0);
}

function bytesToStr(arr: number[]) {
  return String.fromCharCode(...arr);
}

type Chunk = ReturnType<typeof parseChunk>;

function parseChunk(iter: IterableIterator<number>) {
  try {
    const lengthBytes = take(iter, 4);
    const length = bytesToNum(lengthBytes);
    const typeBytes = take(iter, 4);
    const type = bytesToStr(typeBytes);
    const contentBytes = take(iter, length);
    const checkBytes = take(iter, 4);
    return {
      length,
      type,
      content: contentBytes,
      check: checkBytes,
    };
  } catch (err) {
    if (err instanceof IteratorDoneError) {
      return undefined;
    }
    throw err;
  }
}

function parsePng(bytes: Uint8Array) {
  const iter = bytes.values();
  const header = take(iter, 8);

  let chunk: Chunk;
  while ((chunk = parseChunk(iter))) {
    if (chunk.type === "IHDR") {
      const contentAsIter = chunk.content.values();
      const width = takeAsNum(contentAsIter, 4);
      const height = takeAsNum(contentAsIter, 4);
      const bitDepthBytes = take(contentAsIter, 1);
      const colorTypeBytes = take(contentAsIter, 1);
      const compressionMethodBytes = take(contentAsIter, 1);
      const filterMethodBytes = take(contentAsIter, 1);
      const interlaceMethodBytes = take(contentAsIter, 1);

      const pngInfo = {
        width,
        height,
      };
      console.log(pngInfo);
    } else if (chunk.type === "IEND") {
      console.log("png end, exiting");
      break;
    } else if (chunk.type === "pHYs") {
      const content = chunk.content.values();
      const ppuX = takeAsNum(content, 4);
      const ppuY = takeAsNum(content, 4);
      const unit = content.next().value;
      console.log({ ppuX, ppuY, unit });
      // TODO
    } else if (chunk.type === "tIME") {
      const content = chunk.content.values();
      const year = takeAsNum(content, 2);
      const month = takeAsNum(content, 1);
      const day = takeAsNum(content, 1);
      const hour = takeAsNum(content, 1);
      const minute = takeAsNum(content, 1);
      const second = takeAsNum(content, 1);
      const date = new Date(
        Date.UTC(year, month - 1, day, hour, minute, second)
      );
      console.log(date.toLocaleString());
    } else if (chunk.type === "tEXt") {
      const content = chunk.content.values();
      const keyworkBytes = takeUntil(content, (v) => v === 0);
      const textBytes = [...content];
      const decoder = new TextDecoder("iso-8859-1");
      const keyword = decoder.decode(Uint8Array.from(keyworkBytes));
      const text = decoder.decode(Uint8Array.from(textBytes));
      console.log({keyword, text})
    } else if (chunk.type === 'IDAT') {
console.log('CDAT')
    //   console.log(chunk.content)  
      console.log(chunk.content.length)  
      const a = zlib.inflateSync(Uint8Array.from(chunk.content));

      console.log(a);
    } else {
      console.log("unknown type:", chunk.type);
    }
  }

  return;
}

parsePng(fs.readFileSync(".\\pngs\\1.png"));
// parsePng(fs.readFileSync("D:\\Libraries\\Dekstop\\tiny29.png"));
// parsePng(fs.readFileSync("D:\\Libraries\\Dekstop\\tiny.png"));
// parsePng(fs.readFileSync("D:\\Libraries\\Pictures\\Capture2.PNG"));
