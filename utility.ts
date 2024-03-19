import * as crypto from "crypto";
import fs from "fs";

export function hashObject(obj: Object) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

export function makeStringTitleCase(str: string) {
  return str
    .toLocaleLowerCase()
    .split(" ")
    .map((word) => `${word[0].toUpperCase()}${word.substring(1)}`)
    .join(" ");
}

export function duplicateFile(
  sourceFilePath: string,
  destinationFilePath: string
): void {
  const data = fs.readFileSync(sourceFilePath);
  fs.writeFileSync(destinationFilePath, data);
}
