// Fyll inn disse to verdiene fra Supabase-prosjektet deres.
const SUPABASE_URL = "https://prgsrrpmdybwdsovjwce.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByZ3NycnBtZHlid2Rzb3Zqd2NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NzM0MTgsImV4cCI6MjEwNjE0OTQxOH0.KWCDRB8U3asWVlepU_9E2zH3f0F-x6CwyhGAmZXB-6U";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
let currentUser = null;
let currentRole = null;
let selectedFile = null;

async function init() {
  if (SUPABASE_URL.startsWith("LIM_INN")) {
    $("loginError").textContent = "Fyll inn Supabase URL og anon key i app.js først.";
    return;
  }
  const { data } = await supabase.auth.getSession();
  if (data.session) await showApp(data.session.user);
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session) await showApp(session.user);
    else showLogin();
  });
}
function showLogin() {
  currentUser = null; currentRole = null;
  $("loginView").hidden = false; $("appView").hidden = true;
}
async function showApp(user) {
  currentUser = user;
  $("loginView").hidden = true; $("appView").hidden = false;
  $("userLabel").textContent = user.email || "";
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  currentRole = profile?.role || "scanner";
  $("adminCard").hidden = currentRole !== "admin";
  if (currentRole === "admin") loadReceipts();
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginError").textContent = "";
  const { error } = await supabase.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("password").value
  });
  if (error) $("loginError").textContent = error.message;
});

$("logoutBtn").addEventListener("click", () => supabase.auth.signOut());
$("refreshBtn").addEventListener("click", loadReceipts);

$("receiptFile").addEventListener("change", async (e) => {
  selectedFile = e.target.files?.[0] || null;
  $("uploadBtn").disabled = !selectedFile;
  if (!selectedFile) return;
  $("ocrStatus").textContent = "Leser kvitteringen…";
  try {
    const result = await Tesseract.recognize(selectedFile, "nor+eng", {
      logger: m => {
        if (m.status === "recognizing text") {
          $("ocrStatus").textContent = `OCR: ${Math.round((m.progress || 0) * 100)} %`;
        }
      }
    });
    const text = result.data.text;
    parseReceipt(text);
    $("ocrStatus").textContent = "OCR ferdig – kontroller feltene.";
  } catch (err) {
    console.error(err);
    $("ocrStatus").textContent = "OCR kunne ikke leses. Fyll inn feltene manuelt.";
  }
});

function parseReceipt(text) {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const amountMatches = [...text.matchAll(/(\d{1,5}[,.]\d{2})\s*(?:kr)?/gi)]
    .map(m => parseFloat(m[1].replace(",", ".")))
    .filter(n => Number.isFinite(n));
  if (amountMatches.length) $("amount").value = amountMatches.sort((a,b)=>b-a)[0].toFixed(2).replace(".", ",");

  const date = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (date) $("receiptDate").value = `${date[1]}-${String(date[2]).padStart(2,"0")}-${String(date[3]).padStart(2,"0")}`;

  const merchantLine = lines.find(l => /[A-Za-zÆØÅæøå]{3,}/.test(l) && l.length < 40);
  if (merchantLine) $("merchant").value = merchantLine;
}

$("uploadBtn").addEventListener("click", uploadReceipt);

async function uploadReceipt() {
  if (!selectedFile || !currentUser) return;
  $("uploadBtn").disabled = true;
  $("uploadStatus").textContent = "Laster opp…";
  try {
    const ext = (selectedFile.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${currentUser.id}/${crypto.randomUUID()}.${ext}`;

    const { error: storageError } = await supabase.storage.from("receipts").upload(path, selectedFile, {
      contentType: selectedFile.type || "image/jpeg",
      upsert: false
    });
    if (storageError) throw storageError;

    const amount = parseFloat($("amount").value.replace(",", ".").replace(/[^\d.]/g, ""));
    const { error: dbError } = await supabase.from("receipts").insert({
      user_id: currentUser.id,
      storage_path: path,
      merchant: $("merchant").value.trim() || null,
      receipt_date: $("receiptDate").value || null,
      amount: Number.isFinite(amount) ? amount : null
    });
    if (dbError) throw dbError;

    $("uploadStatus").textContent = "✅ Kvitteringen er lagret.";
    $("receiptFile").value = "";
    selectedFile = null;
    $("uploadBtn").disabled = true;
    $("merchant").value = "";
    $("receiptDate").value = "";
    $("amount").value = "";
    $("ocrStatus").textContent = "";
    if (currentRole === "admin") loadReceipts();
  } catch (err) {
    console.error(err);
    $("uploadStatus").textContent = "❌ Kunne ikke lagre: " + (err.message || err);
    $("uploadBtn").disabled = false;
  }
}

async function loadReceipts() {
  const list = $("receiptList");
  list.innerHTML = "<p class='muted'>Laster…</p>";
  const { data, error } = await supabase
    .from("receipts")
    .select("id, storage_path, merchant, receipt_date, amount, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    list.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
    return;
  }
  if (!data.length) {
    list.innerHTML = "<p class='muted'>Ingen kvitteringer ennå.</p>";
    return;
  }
  list.innerHTML = "";
  for (const r of data) {
    const { data: signed } = await supabase.storage.from("receipts").createSignedUrl(r.storage_path, 3600);
    const div = document.createElement("div");
    div.className = "receipt";
    div.innerHTML = `
      <img src="${signed?.signedUrl || ""}" alt="Kvittering">
      <div>
        <strong>${escapeHtml(r.merchant || "Ukjent butikk")}</strong>
        <div>${r.receipt_date || "Ukjent dato"}</div>
        <div>${r.amount != null ? Number(r.amount).toFixed(2).replace(".", ",") + " kr" : "Ukjent beløp"}</div>
      </div>
      <div class="open">${signed?.signedUrl ? `<a href="${signed.signedUrl}" target="_blank" rel="noopener">Åpne bilde</a>` : ""}</div>
    `;
    list.appendChild(div);
  }
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
init();
console.log("APP.JS KJØRER");
