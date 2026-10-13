export function canCreatePrintfulDraft(config) {
  return config.printful.enabled && config.printful.orderMode === 'api-draft' && Boolean(config.printful.token);
}

export async function createPrintfulDraft({ recipient, items, externalId }, config) {
  if (!canCreatePrintfulDraft(config)) throw new Error('Printful draft creation is disabled.');
  if (!Array.isArray(items) || items.length === 0) throw new Error('A Printful draft needs at least one mapped item.');

  const headers = {
    Authorization: `Bearer ${config.printful.token}`,
    'Content-Type': 'application/json',
  };
  if (config.printful.storeId) headers['X-PF-Store-Id'] = config.printful.storeId;

  const response = await fetch(`${config.printful.baseUrl}/v2/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ external_id: externalId, recipient, order_items: items }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || body?.result || 'Printful rejected the draft order.');
  if (body?.data?.status && String(body.data.status).toLowerCase() !== 'draft') throw new Error('Printful returned an unexpected non-draft status.');
  return body.data;
}
