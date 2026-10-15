import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './createApp.js';
import { createPool, assertReadOnlyRole } from './db.js';

const production = process.env.NODE_ENV === 'production';
const pool = createPool();
const { app, warmMapColors } = await createApp(pool, {
  production,
  logger: true,
  trustCloudflare: process.env.TRUST_CLOUDFLARE === 'true',
});
if (production) {
  if (!pool) throw new Error('Credencial de leitura PostgreSQL obrigatória em produção.');
  if (!existsSync(resolve('dist/index.html'))) throw new Error('Frontend compilado ausente.');
  await assertReadOnlyRole(pool).catch(async (error: unknown) => {
    const rawCode = (error as { code?: unknown })?.code;
    const code =
      typeof rawCode === 'string' && /^[A-Z0-9_]{1,64}$/.test(rawCode)
        ? rawCode
        : 'DB_CHECK_FAILED';
    // Log only a diagnostic code; never log the original error or credentials.
    app.log.error({ code }, 'Verificação de produção do banco falhou');
    await pool.end();
    throw new Error(
      'Conexão de produção rejeitada: verifique disponibilidade e permissões mínimas do banco.',
    );
  });
}
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    void app.close();
  });
if (pool)
  await warmMapColors().catch(() =>
    app.log.warn('Cache inicial das cores indisponível; as consultas continuam sob demanda'),
  );
await app.listen({
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1'),
});
