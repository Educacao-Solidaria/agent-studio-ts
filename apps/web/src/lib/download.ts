/** Nome previsível e sem nada do usuário: `<prefixo>-AAAA-MM-DD.<extensão>`, na data local. */
export function datedFileName(prefix: string, extension: string, now: Date) {
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  return `${prefix}-${date.map((part) => String(part).padStart(2, "0")).join("-")}.${extension}`;
}

/** Baixa `content` como arquivo pelo próprio navegador: URL de blob + link temporário. */
export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Revogar já no clique cancela o download em alguns navegadores; o FileSaver.js espera 40 s.
  setTimeout(() => URL.revokeObjectURL(url), 40_000);
}
