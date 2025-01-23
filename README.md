# llhttp-wasm

![NPM Version](https://img.shields.io/npm/v/llhttp-wasm)

Use [llhttp](https://github.com/nodejs/llhttp) anywhere with WebAssembly.

- No polyfills or dependencies.
- 20KB gzipped.
- Embeds the WASM so you don't have to.

## Installation

```
pnpm i llhttp-wasm
```

## Usage

```ts
import { createParser, TYPE } from "llhttp-wasm";

const parser = createParser(TYPE.REQUEST);
parser.onHeadersComplete = (msg) => {
    console.log(msg);
}
const ret = parser.execute(new TextEncoder().encode("GET / HTTP/1.1\r\nHost: example.com\r\nContent-Length: 12\r\n\r\nbananarama\r\n"));
const msg = parser.getErrorMessage(ret);
console.log(msg);
```

## Development

```
bun run build
bun test
```