// ====== ISI DI SINI (anon/publishable key saja, JANGAN service_role) ======
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
// ==========================================================================

const BUCKET = "listing-images";
const MAX_SIZE = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const $ = (id) => document.getElementById(id);

const configured = !SUPABASE_URL.startsWith("YOUR_") && !SUPABASE_ANON_KEY.startsWith("YOUR_");
const db = configured ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let listings = [];
let activeGame = "";
let busy = false;

const rupiah = (n) => "Rp " + new Intl.NumberFormat("id-ID").format(Number(n) || 0);

function normalizeWA(raw) {
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return d;
}

// Hanya izinkan URL https untuk gambar
const safeUrl = (u) => (typeof u === "string" && u.startsWith("https://") ? u : "");

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text; // textContent = aman dari XSS
  return e;
}

function card(l, i) {
  const c = el("article", "card");
  c.style.animationDelay = Math.min(i, 8) * 0.05 + "s";
  const img = el("img");
  img.src = safeUrl(l.image_url);
  img.alt = "Foto " + l.account_name;
  img.loading = "lazy";
  const b = el("div", "cb");
  b.append(
    el("span", "game", l.game),
    el("h3", "", l.account_name),
    el("p", "", l.description || ""),
    el("div", "price", rupiah(l.price)),
    el("div", "seller", "Seller: " + l.seller_name)
  );
  const acts = el("div", "acts");
  const wa = normalizeWA(l.whatsapp);
  const text = encodeURIComponent("Halo, saya tertarik dengan akun " + l.account_name + " di DZ.X.");
  const link = (label, cls) => {
    const a = el("a", "btn " + cls, label);
    a.href = "https://wa.me/" + wa + "?text=" + text;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  };
  acts.append(link("Beli / Hubungi Seller", ""), link("💬 WhatsApp", "wa"));
  b.append(acts);
  c.append(img, b);
  return c;
}

function render() {
  const q = $("search").value.trim().toLowerCase();
  const max = Number($("maxPrice").value) || 0;
  const sort = $("sort").value;
  let list = listings.filter((l) => {
    if (activeGame && l.game !== activeGame) return false;
    if (max && Number(l.price) > max) return false;
    if (!q) return true;
    return [l.account_name, l.game, l.description, l.seller_name].join(" ").toLowerCase().includes(q);
  });
  if (sort === "asc") list.sort((a, b) => a.price - b.price);
  else if (sort === "desc") list.sort((a, b) => b.price - a.price);
  else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const grid = $("grid");
  grid.replaceChildren(...list.map(card));
  $("empty").hidden = list.length > 0;
}

function stats(ok) {
  $("statAkun").textContent = listings.length;
  $("statGame").textContent = new Set(listings.map((l) => l.game)).size;
  $("statStatus").textContent = ok ? "Online" : "Offline";
}

async function load() {
  if (!db) {
    stats(false);
    $("empty").hidden = false;
    $("empty").textContent = "Isi SUPABASE_URL dan SUPABASE_ANON_KEY di script.js.";
    return;
  }
  const { data, error } = await db.from("listings").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    stats(false);
    $("empty").hidden = false;
    $("empty").textContent = "Gagal memuat listing. Coba lagi.";
    return;
  }
  listings = data || [];
  stats(true);
  render();
}

function say(text, type) {
  const m = $("msg");
  m.textContent = text;
  m.className = "msg " + (type || "");
}

function validate() {
  const f = $("photo").files[0];
  if (!$("game").value) return "Pilih game dulu.";
  if (!$("name").value.trim()) return "Nama akun wajib diisi.";
  const p = Number($("price").value);
  if (!$("price").value || !Number.isFinite(p) || p <= 0) return "Harga harus berupa angka lebih dari 0.";
  if (!$("seller").value.trim()) return "Nama seller wajib diisi.";
  const wa = normalizeWA($("wa").value);
  if (!/^62\d{8,13}$/.test(wa)) return "Nomor WhatsApp tidak valid. Contoh: 628123456789.";
  if (!f) return "Foto akun wajib diupload.";
  if (!TYPES.includes(f.type)) return "Foto harus JPG, JPEG, PNG, atau WEBP.";
  if (f.size > MAX_SIZE) return "Ukuran foto maksimal 5 MB.";
  return "";
}

async function submit(e) {
  e.preventDefault();
  if (busy) return;
  if (!db) return say("Supabase belum dikonfigurasi di script.js.", "err");
  const err = validate();
  if (err) return say(err, "err");

  busy = true;
  const btn = $("submit");
  btn.disabled = true;
  say("Sedang mengupload...");

  const file = $("photo").files[0];
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
  const path = crypto.randomUUID() + "." + ext;

  try {
    const up = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (up.error) {
      console.error(up.error);
      say("Upload foto gagal: " + up.error.message, "err");
      return;
    }
    const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const { error } = await db.from("listings").insert({
      game: $("game").value,
      account_name: $("name").value.trim(),
      description: $("desc").value.trim(),
      price: Math.round(Number($("price").value)),
      seller_name: $("seller").value.trim(),
      whatsapp: normalizeWA($("wa").value),
      image_url: url,
    });
    if (error) {
      console.error(error);
      say("Listing gagal dipublikasikan. Coba lagi.", "err");
      return;
    }
    say("Listing berhasil dipublikasikan.", "ok");
    $("form").reset();
    $("preview").hidden = true;
    await load();
  } catch (x) {
    console.error(x);
    say("Listing gagal dipublikasikan. Coba lagi.", "err");
  } finally {
    busy = false;
    btn.disabled = false;
  }
}

// ====== Event ======
$("search").addEventListener("input", render);
$("sort").addEventListener("change", render);
$("maxPrice").addEventListener("input", render);
$("chips").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  document.querySelectorAll(".chip").forEach((c) => c.classList.remove("on"));
  b.classList.add("on");
  activeGame = b.dataset.g;
  render();
});
$("burger").addEventListener("click", () => {
  const open = $("menu").classList.toggle("open");
  $("burger").setAttribute("aria-expanded", open);
});
$("menu").addEventListener("click", () => $("menu").classList.remove("open"));
$("photo").addEventListener("change", () => {
  const f = $("photo").files[0];
  const p = $("preview");
  if (f && TYPES.includes(f.type)) {
    p.src = URL.createObjectURL(f);
    p.hidden = false;
  } else p.hidden = true;
});
$("form").addEventListener("submit", submit);
$("yr").textContent = new Date().getFullYear();

load();
if (db) {
  db.channel("listings-live")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "listings" }, load)
    .subscribe();
}
