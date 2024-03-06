import * as crypto from "crypto";

export function hashObject(obj: Object) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}
