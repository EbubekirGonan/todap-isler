import { config } from "../config.js";
import { query, withTransaction } from "../db.js";
import { sendLoginMail } from "./mailer.js";
import { createLinkToken, createLoginCode, hashSecret, safeEqualHex } from "./tokens.js";

const TOKEN_TTL_MINUTES = 15;
// Bir kullanıcıya TOKEN_TTL_MINUTES içinde en fazla bu kadar giriş e-postası gider.
const MAX_REQUESTS_PER_WINDOW = 3;
// Yanlış kod sayısı bu değere ulaşınca o kod artık denenemez.
const MAX_CODE_ATTEMPTS = 5;

type UserRow = { id: string };

// Aktif kullanıcıyı e-postayla bulur. E-posta büyük/küçük harf duyarsızdır.
async function findActiveUserId(email: string): Promise<string | null> {
  const result = await query<UserRow>(
    "SELECT id FROM users WHERE lower(email) = lower($1) AND active",
    [email],
  );
  return result.rows[0]?.id ?? null;
}

// Yanıt, e-posta kayıtlı olsun olmasın aynıdır; bu fonksiyon sadece iç işi yapar.
export async function requestLogin(email: string): Promise<void> {
  const userId = await findActiveUserId(email);
  if (!userId) {
    return;
  }

  const recent = await query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM login_tokens
      WHERE user_id = $1
        AND created_at > now() - ($2::int * interval '1 minute')`,
    [userId, TOKEN_TTL_MINUTES],
  );
  if ((recent.rows[0]?.n ?? 0) >= MAX_REQUESTS_PER_WINDOW) {
    return;
  }

  const linkToken = createLinkToken();
  const code = createLoginCode();

  await query(
    `INSERT INTO login_tokens (user_id, token_hash, code_hash, expires_at)
     VALUES ($1, $2, $3, now() + ($4::int * interval '1 minute'))`,
    [userId, hashSecret(linkToken), hashSecret(code), TOKEN_TTL_MINUTES],
  );

  // Token fragment (#) ile gönderilir; sunucu günlüklerine ve Referer başlığına düşmez.
  const link = `${config.appBaseUrl.replace(/\/$/, "")}/giris#token=${linkToken}`;
  try {
    await sendLoginMail({ to: email, link, code });
  } catch (err) {
    console.error("Giriş e-postası gönderilemedi:", err);
  }
}

// Bağlantıdaki token tek kullanımlıktır. Atomik UPDATE ile iki kez kullanılamaz.
export async function consumeLinkToken(token: string): Promise<string | null> {
  const result = await query<UserRow>(
    `UPDATE login_tokens
        SET used_at = now()
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > now()
        AND user_id IN (SELECT id FROM users WHERE active)
      RETURNING user_id AS id`,
    [hashSecret(token)],
  );
  return result.rows[0]?.id ?? null;
}

type CodeRow = {
  id: string;
  user_id: string;
  code_hash: string;
  attempts: number;
};

// Yalnızca kullanıcının en son gönderilen, süresi dolmamış ve kullanılmamış kodu geçerlidir.
export async function consumeLoginCode(email: string, code: string): Promise<string | null> {
  return withTransaction(async (client) => {
    const result = await client.query<CodeRow>(
      `SELECT lt.id, lt.user_id, lt.code_hash, lt.attempts
         FROM login_tokens lt
         JOIN users u ON u.id = lt.user_id
        WHERE lower(u.email) = lower($1)
          AND u.active
          AND lt.used_at IS NULL
          AND lt.expires_at > now()
        ORDER BY lt.created_at DESC, lt.id DESC
        LIMIT 1
          FOR UPDATE OF lt`,
      [email],
    );

    const row = result.rows[0];
    if (!row || row.attempts >= MAX_CODE_ATTEMPTS) {
      return null;
    }

    if (!safeEqualHex(row.code_hash, hashSecret(code))) {
      // Hata döndürülmeden commit edilir; böylece deneme sayacı kaybolmaz.
      await client.query("UPDATE login_tokens SET attempts = attempts + 1 WHERE id = $1", [row.id]);
      return null;
    }

    await client.query("UPDATE login_tokens SET used_at = now() WHERE id = $1", [row.id]);
    return row.user_id;
  });
}
