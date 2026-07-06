/* HYLUXTIC embed loader — put UNIT-01 on any website:
   <script src="https://YOUR-DOMAIN/embed.js" data-owner="YOUR_WALLET" data-theme="spectra"></script>
   Attributes: data-owner (wallet billed for AI usage), data-theme
   (spectra|violet|aurum|verdant), data-width, data-height. */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var host = s.src.replace(/\/embed\.js.*$/, "");
  var q = new URLSearchParams();
  if (s.dataset.owner) q.set("owner", s.dataset.owner);
  if (s.dataset.theme) q.set("theme", s.dataset.theme);
  var f = document.createElement("iframe");
  f.src = host + "/embed" + (q.toString() ? "?" + q.toString() : "");
  f.title = "UNIT-01 — Hyluxtic AI worker";
  f.loading = "lazy";
  f.allow = "clipboard-write";
  f.style.cssText =
    "width:" +
    (s.dataset.width || "380px") +
    ";height:" +
    (s.dataset.height || "540px") +
    ";border:0;border-radius:16px;overflow:hidden;" +
    "box-shadow:0 24px 70px rgba(0,0,0,.5);background:#04070d";
  s.parentNode.insertBefore(f, s);
})();
