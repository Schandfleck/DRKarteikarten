/** Verhält sich wie ein Browser: merkt sich alle Cookies (Betreuer- und Kinder-Anmeldung getrennt). */
export class Client {
  static base = '';
  cookies = new Map<string, string>();

  get cookie() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(Client.base + url, {
      method,
      redirect: 'manual',
      headers: { ...(body !== undefined && !(body instanceof Buffer) ? { 'content-type': 'application/json' } : {}), ...(this.cookies.size ? { cookie: this.cookie } : {}), ...headers },
      body: body instanceof Buffer ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const [name, ...value] = pair!.split('=');
      const expired = attrs.some((a) => /expires=thu, 01 jan 1970/i.test(a.trim()));
      if (expired || value.join('=') === '') this.cookies.delete(name!.trim());
      else this.cookies.set(name!.trim(), value.join('='));
    }
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json, text, headers: res.headers };
  }

  login(username: string, password: string, app?: 'betreuer' | 'kinder') {
    return this.req('POST', '/api/auth/login', { username, password, ...(app ? { app } : {}) });
  }
}
