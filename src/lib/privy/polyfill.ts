import { Buffer } from "buffer";

const target = globalThis as unknown as { Buffer?: typeof Buffer };

if (typeof target.Buffer === "undefined") {
  target.Buffer = Buffer;
}
