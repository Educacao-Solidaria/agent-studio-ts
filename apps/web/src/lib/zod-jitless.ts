import { config } from "zod";

// Sem `jitless`, o zod 4 testa `new Function` ao criar o 1º schema de objeto (o contrato SSE, que
// o leitor baixa sob demanda), e a CSP do nginx (sem 'unsafe-eval') reporta a violação no console
// mesmo com o erro engolido. O parse segue igual, pelo caminho interpretado. É o 1º import do
// main.tsx: vale antes de qualquer schema, em qualquer pedaço.
config({ jitless: true });
