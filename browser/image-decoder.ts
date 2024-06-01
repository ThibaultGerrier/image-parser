import { JpegProcessor } from "./jpeg.js";
import { PngProcessor } from "./png.js";

(document.getElementById("button") as HTMLButtonElement).addEventListener(
  "click",
  async () => {
    const input = (document.getElementById("input") as HTMLInputElement).value;
    console.log(input);
    setError("");

    const canvas = document.getElementById("canvas") as HTMLCanvasElement;
    canvas.style.display = 'block'
    try {
      await loadImage(input);
    } catch (e: any) {
      setError(e.message);
    }
  }
);

function setError(text: string) {
  if (text) console.error(text);
  const el = document.getElementById("error");
  if (!el) return;
  el.innerText = text;
}

async function loadImage(url: string) {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  const context = canvas.getContext("2d");
  context?.clearRect(0, 0, canvas.width, canvas.height);
  const res = await fetch(url);
  if (!res.body || !res.ok) {
    setError("file not found");
    return;
  }

  const fileName = url.split("/").pop()?.toLocaleLowerCase() as string;

  const el = document.getElementById("title");
  if (el) {
    el.innerText = fileName;
  }
  if (fileName.endsWith(".jpeg") || fileName.endsWith(".jpg")) {
    const jpeg = new JpegProcessor();
    const buf = await res.arrayBuffer();
    jpeg.processDataChunk(new Uint8Array(buf));
  } else if (fileName.endsWith(".png")) {
    const png = new PngProcessor();
    const buf = await res.arrayBuffer();
    png.processDataChunk(new Uint8Array(buf));
  } else {
    setError(`unkown file: ${fileName}`);
  }
}
