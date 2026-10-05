import fs from "node:fs";
import path from "node:path";
import { profileRoot, NetworkInputError } from "./network-config";
export function networkFilePath(id: string, relative: string) {
  const root = path.join(profileRoot(id), "data");
  if (!fs.existsSync(root))
    throw new NetworkInputError("Deploy this server before browsing files");
  if (typeof relative !== "string" || relative.includes("\0"))
    throw new NetworkInputError("Invalid file path");
  const resolved = path.resolve(root, relative || ".");
  if (resolved !== root && !resolved.startsWith(root + path.sep))
    throw new NetworkInputError("Path escapes server directory");
  let parent = resolved;
  while (true) {
    try {
      fs.lstatSync(/* turbopackIgnore: true */ parent);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      parent = path.dirname(parent);
    }
  }
  const real = fs.realpathSync(/* turbopackIgnore: true */ parent);
  const realRoot = fs.realpathSync(root);
  if (real !== realRoot && !real.startsWith(realRoot + path.sep))
    throw new NetworkInputError("Symlink escapes server directory");
  return resolved;
}
