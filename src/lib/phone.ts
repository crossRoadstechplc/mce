// Ethiopian mobile numbers: Ethio Telecom (09…) and Safaricom (07…).
// Accepts 0911234567, 911234567, 251911234567, +251 91 123 4567.
// Returns the international form without "+" (2519XXXXXXXX), or null if invalid.
export function normalizeEthPhone(input: string): string | null {
  let d = (input || "").replace(/[\s\-().]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00251")) d = d.slice(2);
  if (/^251[79]\d{8}$/.test(d)) return d;
  if (/^0[79]\d{8}$/.test(d)) return "251" + d.slice(1);
  if (/^[79]\d{8}$/.test(d)) return "251" + d;
  return null;
}

// 251911234567 -> +251 91 123 4567
export function formatEthPhone(p: string): string {
  const m = /^251(\d{2})(\d{3})(\d{4})$/.exec(p);
  return m ? `+251 ${m[1]} ${m[2]} ${m[3]}` : p;
}
