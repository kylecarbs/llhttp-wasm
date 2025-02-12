import * as constants from "./constants";

// createParser returns a new llhttp parser instance.
// Override the `on` handlers to handle events from `execute`.
export const createParser = (type: number): Parser => {
  if (!mod) {
    initializeWasm();
  }
  const pointer = instance.exports.llhttp_alloc(constants.TYPE[type]);
  const parser = new Parser(pointer);
  parsers[pointer] = parser;
  return parser;
};

// Parser is a wrapper around the llhttp WASM instance.
export class Parser {
  // Override these to handle events from `execute`.
  public onMessageBegin?: () => number;
  public onHeadersComplete?: (msg: HeadersComplete) => number;
  public onMessageComplete?: () => number;
  public onBody?: (data: Uint8Array) => number;

  // Set by the WASM while parsing.
  public url: string = "";
  public headerFields: string[] = [];
  public headerValues: string[] = [];
  public statusMessage?: string;

  private lastDataPointer?: number;

  constructor(private readonly pointer: number) {}

  // execute runs the parser on the given data.
  public execute(data: Uint8Array): number {
    this.lastDataPointer = instance.exports.malloc(data.length);
    const u8 = new Uint8Array(instance.exports.memory.buffer);
    u8.set(data, this.lastDataPointer);
    const ret = instance.exports.llhttp_execute(
      this.pointer,
      this.lastDataPointer,
      data.length
    );
    instance.exports.free(this.lastDataPointer);
    return ret;
  }

  // getErrorReason returns the error reason for a non-OK
  // return code from `execute`.
  public getErrorReason(code: number): string | undefined {
    if (code === constants.ERROR.OK) {
      return undefined;
    }
    const ptr = instance.exports.llhttp_get_error_reason(this.pointer);
    const u8 = new Uint8Array(instance.exports.memory.buffer);
    const len = u8.indexOf(0, ptr) - ptr;
    return cstr(ptr, len);
  }

  // getErrorPosition returns the number of bytes parsed before the error.
  public getErrorPosition(): number {
    if (!this.lastDataPointer) {
      return 0;
    }
    return (
      instance.exports.llhttp_get_error_pos(this.pointer) - this.lastDataPointer
    );
  }

  // getErrorName returns the `HPE_` name for a given error code.
  public getErrorName(code: number): string | undefined {
    if (code === constants.ERROR.OK) {
      return undefined;
    }
    const ptr = instance.exports.llhttp_errno_name(code);
    const u8 = new Uint8Array(instance.exports.memory.buffer);
    const len = u8.indexOf(0, ptr) - ptr;
    return cstr(ptr, len);
  }

  public reset(): void {
    instance.exports.llhttp_reset(this.pointer);
  }

  public finish(): number {
    return instance.exports.llhttp_finish(this.pointer);
  }

  public pause(): void {
    instance.exports.llhttp_pause(this.pointer);
  }

  public resume(): void {
    instance.exports.llhttp_resume(this.pointer);
  }

  public resumeAfterUpgrade(): void {
    instance.exports.llhttp_resume_after_upgrade(this.pointer);
  }

  public destroy() {
    instance.exports.free(this.pointer);
    delete parsers[this.pointer];
  }
}

export const destroy = () => {
  if (mod) {
    for (const parser of Object.values(parsers)) {
      parser.destroy();
    }
  }
};

export interface HeadersComplete {
  versionMajor: number;
  versionMinor: number;
  rawHeaders: string[];
  // method is undefined for responses.
  method?: number;
  // url is undefined for responses.
  url?: string;
  // statusCode is undefined for requests.
  statusCode?: number;
  // statusMessage is undefined for requests.
  statusMessage?: string;
  upgrade: boolean;
  shouldKeepAlive: boolean;
}

const cstr = (at: number, len: number) => {
  const u8 = new Uint8Array(instance.exports.memory.buffer);
  return new TextDecoder().decode(u8.subarray(at, at + len));
};

// parsers is a map of pointers to parsers.
// It allows numerous parsers to share the same WASM instance.
const parsers: Record<number, Parser> = {};

// initializeWasm loads the WASM module from the base64 string.
// It also sets up the WASM instance to call back into the JS code.
const initializeWasm = () => {
  const bytes = Uint8Array.from(atob(binaryString), (c) => c.charCodeAt(0));
  mod = new WebAssembly.Module(bytes);
  instance = new WebAssembly.Instance(mod, {
    env: {
      wasm_on_message_begin: (pointer: number) => {
        const parser = parsers[pointer];
        parser.url = "";
        parser.headerFields = [];
        parser.headerValues = [];
        parser.statusMessage = undefined;
        return parser?.onMessageBegin?.() ?? 0;
      },
      wasm_on_url: (pointer: number, at: number, length: number) => {
        const parser = parsers[pointer];
        if (parser) {
          parser.url = cstr(at, length);
        }
      },
      wasm_on_status: (pointer: number, at: number, length: number) => {
        const parser = parsers[pointer];
        if (parser) {
          parser.statusMessage = cstr(at, length);
        }
      },
      wasm_on_header_field: (pointer: number, at: number, length: number) => {
        const parser = parsers[pointer];
        if (parser) {
          parser.headerFields.push(cstr(at, length));
        }
      },
      wasm_on_header_value: (pointer: number, at: number, length: number) => {
        const parser = parsers[pointer];
        if (parser) {
          parser.headerValues.push(cstr(at, length));
        }
      },
      wasm_on_headers_complete: (pointer: number) => {
        const parser = parsers[pointer];
        if (!parser) {
          return;
        }
        const type = instance.exports.llhttp_get_type(pointer);
        const versionMajor = instance.exports.llhttp_get_http_major(pointer);
        const versionMinor = instance.exports.llhttp_get_http_minor(pointer);
        const rawHeaders: string[] = [];
        let method: number | undefined;
        let url: string | undefined;
        let statusCode: number | undefined;
        let statusMessage: string | undefined;
        const upgrade = instance.exports.llhttp_get_upgrade(pointer) === 1;
        const shouldKeepAlive =
          instance.exports.llhttp_should_keep_alive(pointer) === 1;

        for (let c = 0; c < parser.headerFields.length; c++) {
          rawHeaders.push(parser.headerFields[c], parser.headerValues[c]);
        }
        if (type === constants.TYPE.REQUEST) {
          method = instance.exports.llhttp_get_method(pointer);
          url = parser.url;
        } else if (type === constants.TYPE.RESPONSE) {
          statusCode = instance.exports.llhttp_get_status_code(pointer);
          statusMessage = parser.statusMessage;
        }
        return (
          parser.onHeadersComplete?.({
            versionMajor,
            versionMinor,
            rawHeaders,
            method,
            url,
            statusCode,
            statusMessage,
            upgrade,
            shouldKeepAlive,
          }) ?? 0
        );
      },
      wasm_on_body: (pointer: number, at: number, length: number) => {
        const parser = parsers[pointer];
        return (
          parser?.onBody?.(
            new Uint8Array(
              instance.exports.memory.buffer.slice(at, at + length)
            )
          ) ?? 0
        );
      },
      wasm_on_message_complete: (pointer: number) => {
        const parser = parsers[pointer];
        return parser?.onMessageComplete?.() ?? 0;
      },
    },
  }) as typeof instance;

  instance.exports._initialize();
};

let mod: WebAssembly.Module;
let instance: WebAssembly.Instance & {
  exports: {
    memory: WebAssembly.Memory;
    llhttp_alloc: (type: number) => number;
    // malloc returns a pointer to the allocated memory.
    malloc: (size: number) => number;
    llhttp_execute: (pointer: number, at: number, length: number) => number;
    llhttp_get_type: (pointer: number) => number;
    llhttp_get_upgrade: (pointer: number) => number;
    llhttp_should_keep_alive: (pointer: number) => number;
    llhttp_get_method: (pointer: number) => number;
    llhttp_get_status_code: (pointer: number) => number;
    llhttp_get_http_minor: (pointer: number) => number;
    llhttp_get_http_major: (pointer: number) => number;
    llhttp_get_error_reason: (pointer: number) => number;
    llhttp_resume_after_upgrade: (pointer: number) => void;
    llhttp_resume: (pointer: number) => void;
    llhttp_pause: (pointer: number) => void;
    llhttp_finish: (pointer: number) => number;
    llhttp_reset: (pointer: number) => void;
    llhttp_errno_name: (err: number) => number;
    llhttp_get_error_pos: (pointer: number) => number;
    free: (pointer: number) => void;
    _initialize: () => void;
  };
};

export const TYPE = constants.TYPE;
export const METHODS = constants.METHODS;

let binaryString = "BASE64_WASM_INJECTED_AT_BUILD";
