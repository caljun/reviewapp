export async function authenticatedFetch(
  user: { getIdToken(forceRefresh?: boolean): Promise<string> },
  url: string,
  init: RequestInit = {},
  send: typeof fetch = fetch,
) {
  const request = async (force: boolean) => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${await user.getIdToken(force)}`);
    return send(url, { ...init, headers, cache: 'no-store' });
  };
  const response = await request(false);
  return response.status === 401 ? request(true) : response;
}
