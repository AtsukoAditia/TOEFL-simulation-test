/**
 * supabase-config.js — isi kredensial dari Supabase Dashboard > Project Settings > API
 *
 * Langkah setup:
 *   1. Buat project di https://supabase.com (free tier cukup)
 *   2. Ambil Project URL + anon public key
 *   3. Tempel di bawah
 *   4. Jalankan SQL di data/supabase-schema.sql (Supabase SQL Editor)
 *   5. Auth > Providers > Google: aktifkan + isi Client ID/Secret dari Google Cloud
 *   6. Auth > URL Configuration:
 *        Site URL: https://toeflyuk.my.id
 *        Redirect URLs tambahkan: https://toeflyuk.my.id/login.html
 */
window.SUPABASE_CONFIG = {
  url: "https://poblxqvzokhujwjxqcam.supabase.co",
  anonKey: "sb_publishable_yyQT7jBkuyKkvlvvCI3MVQ_RktPxNyY"
};
