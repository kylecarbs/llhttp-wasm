import { describe, test, expect } from "bun:test";
import { createParser } from "../out";
import constants from "../src/constants";
import { METHODS } from "../src/constants";

// *Requires the outputs to be built first*
// $ bun run build

const cases: HttpTestCase[] = [
  {
    name: "basic GET request",
    input: ["GET / HTTP/1.1", "Host: example.com", "", ""],
    expect: {
      method: "GET",
      url: "/",
      version: "1.1",
      headers: {
        Host: "example.com",
      },
    },
  },
  {
    name: "POST request with body",
    input: [
      "POST /submit HTTP/1.1",
      "Host: example.com",
      "Content-Length: 11",
      "",
      "hello world",
    ],
    expect: {
      method: "POST",
      url: "/submit",
      version: "1.1",
      headers: {
        Host: "example.com",
        "Content-Length": "11",
      },
      body: "hello world",
    },
  },
  {
    name: "malformed request",
    input: ["INVALID / HTTP/1.1", "", ""],
    expect: {
      error: "Invalid method encountered",
    },
  },
  {
    name: "GET request with unexpected body",
    input: ["GET / HTTP/1.1", "Host: example.com", "", "surprise body!"],
    expect: {
      error: "Invalid method encountered",
    },
  },
  {
    name: "GET request with Content-Length",
    input: [
      "GET / HTTP/1.1",
      "Host: example.com",
      "Content-Length: 11",
      "",
      "hello world",
    ],
    expect: {
      method: "GET",
      url: "/",
      version: "1.1",
      headers: {
        Host: "example.com",
        "Content-Length": "11",
      },
      body: "hello world",
    },
  },
  {
    name: "missing HTTP version",
    input: ["GET /", "Host: example.com", "", ""],
    expect: {
      method: "GET",
      url: "/",
      version: "0.9",
    },
  },
  {
    name: "invalid Content-Length",
    input: [
      "POST / HTTP/1.1",
      "Host: example.com",
      "Content-Length: not_a_number",
      "",
      "body",
    ],
    expect: {
      error: "Invalid character in Content-Length",
    },
  },
  {
    name: "mismatched Content-Length",
    input: [
      "POST / HTTP/1.1",
      "Host: example.com",
      "Content-Length: 10",
      "",
      "too short",
    ],
    expect: {
      headers: {
        Host: "example.com",
        "Content-Length": "10",
      },
      body: "too short",
    },
  },
  {
    name: "request with query parameters",
    input: ["GET /search?q=test&page=1 HTTP/1.1", "Host: example.com", "", ""],
    expect: {
      method: "GET",
      url: "/search?q=test&page=1",
      version: "1.1",
      headers: {
        Host: "example.com",
      },
    },
  },
  {
    name: "request with multiple headers",
    input: [
      "POST /submit HTTP/1.1",
      "Host: example.com",
      "Content-Type: application/json",
      "User-Agent: test-client",
      "Accept: */*",
      "Content-Length: 18",
      "",
      '{"status":"ok"}',
    ],
    expect: {
      method: "POST",
      url: "/submit",
      version: "1.1",
      headers: {
        Host: "example.com",
        "Content-Type": "application/json",
        "User-Agent": "test-client",
        Accept: "*/*",
        "Content-Length": "18",
      },
      body: '{"status":"ok"}',
    },
  },
  {
    name: "request with duplicate headers",
    input: [
      "GET / HTTP/1.1",
      "Host: example.com",
      "Accept: text/html",
      "Accept: application/json",
      "",
      "",
    ],
    expect: {
      headers: {
        Host: "example.com",
        Accept: "text/html, application/json",
      },
    },
  },
  {
    name: "request with empty header value",
    input: ["GET / HTTP/1.1", "Host:", "", ""],
    expect: {
      method: "GET",
      url: "/",
      version: "1.1",
      headers: {
        Host: "",
      },
    },
  },
  {
    name: "request with malformed header",
    input: ["GET / HTTP/1.1", "BadHeader", "", ""],
    expect: {
      error: "Invalid header token",
    },
  },
  {
    name: "basic 200 response",
    input: ["HTTP/1.1 200 OK", "Server: test", "", ""],
    expect: {
      statusCode: 200,
      version: "1.1",
      headers: {
        Server: "test",
      },
    },
  },
  {
    name: "404 response with body",
    input: [
      "HTTP/1.1 404 Not Found",
      "Content-Type: text/plain",
      "Content-Length: 19",
      "",
      "Resource not found.",
    ],
    expect: {
      statusCode: 404,
      version: "1.1",
      headers: {
        "Content-Type": "text/plain",
        "Content-Length": "19",
      },
      body: "Resource not found.",
    },
  },
  {
    name: "response with custom status code",
    input: ["HTTP/1.1 418 I'm a teapot", "Server: teapot/1.0", "", ""],
    expect: {
      statusCode: 418,
      version: "1.1",
      headers: {
        Server: "teapot/1.0",
      },
    },
  },
  {
    name: "response with no reason phrase",
    input: ["HTTP/1.1 204", "", ""],
    expect: {
      statusCode: 204,
      version: "1.1",
    },
  },
  {
    name: "response with invalid status code",
    input: ["HTTP/1.1 999 Invalid", "", ""],
    expect: {
      statusCode: 999,
      statusMessage: "Invalid",
      version: "1.1",
    },
  },
  {
    name: "chunked response",
    input: [
      "HTTP/1.1 200 OK",
      "Transfer-Encoding: chunked",
      "",
      "7",
      "Mozilla",
      "9",
      "Developer",
      "7",
      "Network",
      "0",
      "",
    ],
    expect: {
      statusCode: 200,
      version: "1.1",
      headers: {
        "Transfer-Encoding": "chunked",
      },
      body: "MozillaDeveloperNetwork",
    },
  },
  {
    name: "response with multiple headers and JSON body",
    input: [
      "HTTP/1.1 200 OK",
      "Content-Type: application/json",
      "Cache-Control: no-cache",
      "Content-Length: 27",
      "",
      '{"message":"Hello World!"}',
    ],
    expect: {
      statusCode: 200,
      version: "1.1",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "Content-Length": "27",
      },
      body: '{"message":"Hello World!"}',
    },
  },
  {
    name: "response with invalid HTTP version",
    input: ["HTTP/9.9 200 OK", "", ""],
    expect: {
      error: "Invalid HTTP version",
    },
  },
  {
    name: "response with missing status line",
    input: ["Server: test", "", ""],
    expect: {
      error: "Invalid method encountered",
    },
  },
  {
    name: "response with duplicate headers",
    input: ["HTTP/1.1 200 OK", "Server: test1", "Server: test2", "", ""],
    expect: {
      statusCode: 200,
      version: "1.1",
      headers: {
        Server: "test1, test2",
      },
    },
  },
];

for (const t of cases) {
  test(t.name, () => {
    const parser = createParser(constants.TYPE.REQUEST);
    const result = {
      headers: {} as Record<string, string>,
      body: "",
      method: undefined as number | undefined,
      url: undefined as string | undefined,
      version: undefined as string | undefined,
      error: undefined as string | undefined,
      statusCode: undefined as number | undefined,
      statusMessage: undefined as string | undefined,
    };

    parser.onHeadersComplete = (msg) => {
      result.method = msg.method;
      result.url = msg.url;
      result.version = `${msg.versionMajor}.${msg.versionMinor}`;
      result.statusCode = msg.statusCode;
      result.statusMessage = msg.statusMessage;
      for (let i = 0; i < msg.rawHeaders.length; i += 2) {
        if (result.headers[msg.rawHeaders[i]]) {
          result.headers[msg.rawHeaders[i]] += `, ${msg.rawHeaders[i + 1]}`;
        } else {
          result.headers[msg.rawHeaders[i]] = msg.rawHeaders[i + 1];
        }
      }
    };

    parser.onBody = (chunk) => {
      result.body += new TextDecoder().decode(chunk);
    };

    const ret = parser.execute(new TextEncoder().encode(t.input.join("\r\n")));
    if (ret !== 0) {
      result.error = parser.getErrorReason(ret);
    }

    if (!t.expect) return;

    if (t.expect.error) {
      expect(result.error).toBe(t.expect.error);
      return;
    }

    expect(result.error).toBeUndefined();
    if (t.expect.method) expect(result.method).toBe(METHODS[t.expect.method]);
    if (t.expect.url) expect(result.url).toBe(t.expect.url);
    if (t.expect.version) expect(result.version).toBe(t.expect.version);
    if (t.expect.headers) expect(result.headers).toEqual(t.expect.headers);
    if (t.expect.statusCode)
      expect(result.statusCode).toBe(t.expect.statusCode);
    if (t.expect.statusMessage)
      expect(result.statusMessage).toBe(t.expect.statusMessage);
    if (t.expect.body) expect(result.body).toBe(t.expect.body);
  });
}

test("error name", () => {
  const parser = createParser(constants.TYPE.REQUEST);
  const res = parser.execute(new TextEncoder().encode("GET / HaTTP/1.1\r\n\r\n"));
  expect(parser.getErrorName(res)).toBe("HPE_INVALID_CONSTANT");
  expect(parser.getErrorPosition()).toBe(7);
});

interface HttpTestCase {
  name: string;
  input: string[];
  expect?: {
    method?: keyof typeof METHODS;
    url?: string;
    version?: string;
    headers?: Record<string, string>;
    body?: string;
    statusCode?: number;
    statusMessage?: string;
    error?: string;
  };
}
