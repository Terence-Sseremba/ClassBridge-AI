import dns from 'node:dns/promises'
import net from 'node:net'
import tls from 'node:tls'

const host = 'api.meta.ai'
const safeCodes = new Set([
  'EACCES',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
])

function result(stage, details) {
  process.stdout.write(`${JSON.stringify({ stage, ...details })}\n`)
}

function code(error) {
  return safeCodes.has(error?.code) ? error.code : 'UNCLASSIFIED'
}

function connect(secure) {
  return new Promise((resolve) => {
    const socket = secure
      ? tls.connect({
          host,
          port: 443,
          servername: host,
          rejectUnauthorized: true,
        })
      : net.connect({ host, port: 443 })
    const stage = secure ? 'tls' : 'tcp'
    let done = false
    function finish(details) {
      if (done) return
      done = true
      result(stage, details)
      socket.destroy()
      resolve(details.ok)
    }
    socket.setTimeout(10000, () =>
      finish({ ok: false, errorCode: 'ETIMEDOUT' }),
    )
    socket.once('error', (error) =>
      finish({ ok: false, errorCode: code(error) }),
    )
    socket.once(secure ? 'secureConnect' : 'connect', () =>
      finish({ ok: true }),
    )
  })
}

result('proxy_environment', {
  httpsProxyConfigured: Boolean(
    process.env.HTTPS_PROXY || process.env.https_proxy,
  ),
  httpProxyConfigured: Boolean(
    process.env.HTTP_PROXY || process.env.http_proxy,
  ),
})

try {
  const addresses = await dns.lookup(host, { all: true })
  result('dns', { ok: true, addressCount: addresses.length })
  if (await connect(false)) {
    if (!(await connect(true))) process.exitCode = 1
  } else {
    process.exitCode = 1
  }
} catch (error) {
  result('dns', { ok: false, errorCode: code(error) })
  process.exitCode = 1
}
