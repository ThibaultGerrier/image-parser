import { JpegProcessor } from "./jpeg.js";
import { PngProcessor } from "./png.js";

(document.getElementById("button") as HTMLButtonElement).addEventListener(
  "click",
  async () => {
    const input = (document.getElementById("input") as HTMLInputElement).value;
    console.log(input);
    try {
      await loadImage(input);
    } catch (e: any) {
      setError(e);
    }
  }
);

(document.getElementById("random") as HTMLButtonElement).addEventListener(
  "click",
  async () => {
    const filename = await randomFile();
    console.log(filename);
    const input = document.getElementById("input") as HTMLInputElement;
    input.value = filename;
    try {
      await loadImage(filename);
    } catch (e: any) {
      setError(e);
    }
  }
);

async function randomFile() {
  const req = await fetch("http://localhost:3000/randomfile");
  const filename = await req.text();
  return filename;
}

function setError(text: string) {
  if (text) console.error(text);
  const el = document.getElementById("error");
  if (!el) return;
  el.innerText = text;
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function loadImage(url: string) {
  setError("");
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  canvas.style.display = "block";
  const context = canvas.getContext("2d");
  context?.clearRect(0, 0, canvas.width, canvas.height);
  const res = await fetch(url);
  if (!res.body || !res.ok) {
    setError("file not found");
    return;
  }
  const fileName = url.split("/").pop()?.toLocaleLowerCase() as string;
  const el = document.getElementById("title");
  const buf = await res.arrayBuffer();
  if (el) {
    el.innerText = `${fileName} (${(buf.byteLength / 1024**2).toPrecision(2)} MB)`;
  }
  await sleep(10);
  if (fileName.endsWith(".jpeg") || fileName.endsWith(".jpg")) {
    const jpeg = new JpegProcessor();
    jpeg.processDataChunk(new Uint8Array(buf));
  } else if (fileName.endsWith(".png")) {
    const png = new PngProcessor();
    png.processDataChunk(new Uint8Array(buf));
  } else {
    setError(`unkown file: ${fileName}`);
  }
}
