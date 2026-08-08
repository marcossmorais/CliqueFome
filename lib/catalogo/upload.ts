import { criarClientNavegador } from '@/lib/supabase/client';

const BUCKET = 'imagens-cardapio';

/** 3 MB. Foto de cardápio não precisa de mais que isso, e o limite evita
 * que uma loja encha o Storage com originais de câmera. */
const TAMANHO_MAXIMO = 3 * 1024 * 1024;

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/**
 * Assinatura real do arquivo (magic bytes). O `file.type` vem do navegador
 * e é trivial de forjar: basta renomear um .html pra .png. Como o bucket é
 * público e serve o que estiver lá, um arquivo ativo entregue como imagem
 * viraria conteúdo executável num domínio confiável.
 */
const ASSINATURAS: { tipo: string; bytes: number[]; deslocamento?: number }[] = [
  { tipo: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { tipo: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { tipo: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  // WEBP: "RIFF" nos bytes 0-3 e "WEBP" nos bytes 8-11.
  { tipo: 'image/webp', bytes: [0x57, 0x45, 0x42, 0x50], deslocamento: 8 },
];

async function tipoReal(file: File): Promise<string | null> {
  const cabecalho = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  for (const { tipo, bytes, deslocamento = 0 } of ASSINATURAS) {
    if (bytes.every((b, i) => cabecalho[deslocamento + i] === b)) return tipo;
  }
  return null;
}

/**
 * Sobe uma imagem do catálogo (produto, opção, logo, capa) pro Storage e
 * devolve a URL pública. Cada arquivo fica em `<loja_id>/...` — é essa
 * pasta que as policies do bucket usam pra garantir que cada dono só
 * escreve dentro da própria loja.
 *
 * As checagens abaixo são de UX e primeira barreira: a fronteira que vale
 * é `file_size_limit` + `allowed_mime_types` no bucket, porque qualquer um
 * com a chave anon pode chamar a API de Storage direto, sem passar por
 * este código.
 */
export async function subirImagemCatalogo(
  sb: ReturnType<typeof criarClientNavegador>,
  lojaId: string,
  file: File,
  prefixo?: string
) {
  if (file.size === 0) throw new Error('O arquivo está vazio.');
  if (file.size > TAMANHO_MAXIMO) {
    throw new Error(
      `A imagem tem ${(file.size / 1024 / 1024).toFixed(1)} MB. O limite é ${TAMANHO_MAXIMO / 1024 / 1024} MB.`
    );
  }

  const tipo = await tipoReal(file);
  if (!tipo || !TIPOS_ACEITOS.includes(tipo as (typeof TIPOS_ACEITOS)[number])) {
    throw new Error('Formato não aceito. Envie uma imagem JPG, PNG, WEBP ou GIF.');
  }

  const nomeSanitizado = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(-80);
  const caminho = `${lojaId}/${prefixo ? prefixo + '-' : ''}${Date.now()}-${nomeSanitizado}`;
  const { error } = await sb.storage.from(BUCKET).upload(caminho, file, {
    // Não deixa o navegador ditar o Content-Type de entrega: o tipo é o que
    // os magic bytes disseram.
    contentType: tipo,
  });
  if (error) throw error;
  return sb.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl as string;
}
