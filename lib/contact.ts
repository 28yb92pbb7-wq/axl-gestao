export function whatsappNumber(value: string) {
  let n = value.replace(/\D/g, "");
  if (n.length === 10 || n.length === 11) n = "55" + n;
  if (!/^[1-9]\d{7,14}$/.test(n))
    throw new Error("Informe telefone com DDI e DDD (ex.: 55 19 99999-9999).");
  return n;
}
export function whatsappLink(number: string, text: string) {
  return (
    "https://wa.me/" +
    whatsappNumber(number) +
    "?text=" +
    encodeURIComponent(text)
  );
}
