const { handler } = require('../netlify/functions/state');

function queryParameters(query = {}) {
  return Object.fromEntries(Object.entries(query).map(([key, value]) => [
    key,
    Array.isArray(value) ? value[0] : value
  ]));
}

module.exports = async function stateApi(request, response) {
  const result = await handler({
    httpMethod: request.method,
    queryStringParameters: queryParameters(request.query),
    headers: request.headers || {},
    body: request.body
  });

  for (const [name, value] of Object.entries(result.headers || {})) {
    response.setHeader(name, value);
  }
  response.status(result.statusCode || 200);
  if (!result.body) return response.end();
  return response.send(result.body);
};

module.exports._test = { queryParameters };
