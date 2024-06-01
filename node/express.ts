import express, { Request, Response } from "express";
import cors from "cors";
import { readdir } from "node:fs/promises";

const app = express();
const directoryPath = "D:\\Libraries\\Pictures";

function randomItemInArray<T>(array: T[]): T {
  const randomIndex = Math.floor(Math.random() * array.length);
  return array[randomIndex];
}

async function getRandomFile(dir: string) {
  const files = await readdir(dir, { recursive: true });
  const imageFiles = files.filter((n) => /\.(jpg|jpeg|png)$/i.test(n));
  return randomItemInArray(imageFiles);
}

app.use(cors());

app.get("/randomfile", async (req: Request, res: Response) => {
  const randomFilePath = await getRandomFile(directoryPath);
  res.send(`http://localhost:3000/files/${randomFilePath}`);
});

app.use('/files', express.static(directoryPath))

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
