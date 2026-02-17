type CommandContext = {
  args?: string[];
  text?: string;
  reply: (message: string) => Promise<void> | void;
};

type CommandHandler = (context: CommandContext) => Promise<void>;

type PluginApi = {
  env?: Record<string, string | undefined>;
  registerCommand: (command: string, handler: CommandHandler) => void;
};

type OpsMethod = 'GET' | 'POST';

const parseValue = (raw: string): string | number | boolean => {
  const normalized = raw.trim().toLowerCase();

  if (['true', 'on', 'yes', '1'].includes(normalized)) {
    return true;
  }

  if (['false', 'off', 'no', '0'].includes(normalized)) {
    return false;
  }

  const numeric = Number(raw);
  if (!Number.isNaN(numeric) && raw.trim() !== '') {
    return numeric;
  }

  return raw;
};

const resolveRuntime = (api: PluginApi) => {
  const engineUrl = api.env?.VANGUARD_ENGINE_URL ?? process.env.VANGUARD_ENGINE_URL;
  const token = api.env?.VANGUARD_TOKEN ?? process.env.VANGUARD_TOKEN;

  if (!engineUrl || !token) {
    throw new Error('VANGUARD_ENGINE_URL and VANGUARD_TOKEN are required for plugin runtime');
  }

  return { engineUrl, token };
};

const callOps = async (
  engineUrl: string,
  token: string,
  method: OpsMethod,
  endpoint: string,
  body?: Record<string, string | number | boolean | null>,
): Promise<unknown> => {
  const requestInit: RequestInit = {
    method,
    headers: {
      'content-type': 'application/json',
      'x-vanguard-token': token,
    },
  };

  if (body) {
    requestInit.body = JSON.stringify(body);
  }

  const response = await fetch(`${engineUrl}${endpoint}`, requestInit);

  const contentType = response.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
    throw new Error(`Engine call failed (${response.status}) ${endpoint}: ${serialized}`);
  }

  return payload;
};

const replyWithPayload = async (context: CommandContext, payload: unknown): Promise<void> => {
  const message = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  await context.reply(message);
};

const register = (api: PluginApi, command: string, method: OpsMethod, endpoint: string): void => {
  api.registerCommand(command, async (context: CommandContext) => {
    const { engineUrl, token } = resolveRuntime(api);
    const payload = await callOps(engineUrl, token, method, endpoint);
    await replyWithPayload(context, payload);
  });
};

const plugin = (api: PluginApi): void => {
  register(api, '/status', 'GET', '/ops/status');
  register(api, '/arm', 'POST', '/ops/arm');
  register(api, '/disarm', 'POST', '/ops/disarm');
  register(api, '/kill', 'POST', '/ops/kill');
  register(api, '/unkill', 'POST', '/ops/unkill');

  api.registerCommand('/set', async (context: CommandContext) => {
    const [key, rawValue] = context.args ?? [];

    if (!key || rawValue === undefined) {
      await context.reply('Usage: /set <key> <value>');
      return;
    }

    const { engineUrl, token } = resolveRuntime(api);
    const payload = await callOps(engineUrl, token, 'POST', '/ops/config', {
      key,
      value: parseValue(rawValue),
    });

    await replyWithPayload(context, payload);
  });
};

export default plugin;
