import { assistantRoute } from '../api.js';

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/assistant') return new Response('Not found', { status: 404 });
    return assistantRoute(request, url, env);
  },
};
