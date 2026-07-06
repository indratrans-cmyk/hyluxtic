/* Browser polyfill untuk global Node yang dibutuhkan @solana/spl-token.
   HARUS diimpor paling pertama di setiap entry point frontend. */
import { Buffer } from "buffer";

const g = globalThis as unknown as { Buffer?: typeof Buffer };
g.Buffer ??= Buffer;
