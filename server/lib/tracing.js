// Load before Express, HTTP, Redis, or database drivers.
let sdk = null;
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT && process.env.OTEL_SDK_DISABLED !== 'true') {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto');
  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || 'cricedge-api',
    metricReaders: [],
    logRecordProcessors: [],
    traceExporter: new OTLPTraceExporter({ timeoutMillis: 3000 }),
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: req => req.url?.startsWith('/api/health') || req.url?.startsWith('/socket.io'),
        ignoreOutgoingRequestHook: req => String(req.getHeader?.('host') || req.host || '').includes('api.telegram.org'),
        // Never export upstream session cookies, Telegram tokens, or URL queries.
        requestHook(span, req) {
          if (req.headers?.host?.includes('api.telegram.org') || String(req.path || req.url || '').includes('/bot')) {
            span.setAttribute('http.url', '[redacted]');
            span.setAttribute('url.full', '[redacted]');
            span.setAttribute('http.target', '[redacted]');
          }
        },
      },
      '@opentelemetry/instrumentation-ioredis': { dbStatementSerializer: () => '[redis command]' },
      '@opentelemetry/instrumentation-undici': { ignoreRequestHook:req=>req.origin.includes('api.telegram.org') },
    })],
  });
  sdk.start();
}
module.exports = { shutdown: () => sdk?.shutdown() ?? Promise.resolve() };
