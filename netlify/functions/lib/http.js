class UpstreamError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.code = code;
    this.details = details;
  }
}

async function request(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new UpstreamError('fetch_unavailable', '云端运行环境不支持 fetch');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 8000);
  try {
    const response = await fetchImpl(url, {
      method: options.method || 'GET',
      headers: {
        accept: options.accept || '*/*',
        'user-agent': 'AStock-Monitor/2.0',
        ...(options.headers || {})
      },
      body: options.body,
      signal: controller.signal
    });
    if (!response.ok) throw new UpstreamError('upstream_http', `上游接口返回 HTTP ${response.status}`, { status: response.status, url });
    return response;
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (error?.name === 'AbortError') throw new UpstreamError('upstream_timeout', '上游行情请求超时', { url });
    throw new UpstreamError('upstream_network', error?.message || '上游行情网络失败', { url });
  } finally {
    clearTimeout(timeout);
  }
}

async function getJson(url, options = {}) {
  const response = await request(url, { ...options, accept: 'application/json,text/plain,*/*' });
  try {
    return await response.json();
  } catch {
    throw new UpstreamError('invalid_json', '上游行情返回了无效 JSON', { url });
  }
}

async function getText(url, options = {}) {
  const response = await request(url, options);
  return response.text();
}

async function getBuffer(url, options = {}) {
  const response = await request(url, options);
  return response.arrayBuffer();
}

module.exports = { UpstreamError, request, getJson, getText, getBuffer };
