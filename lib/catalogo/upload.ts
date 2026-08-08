import { criarClientNavegador } from '@/lib/supabase/client';

const BUCKET = 'imagens-cardapio';

/** Sobe uma imagem do catálogo (produto, opção, logo, capa) pro Storage e
 * devolve a URL pública. Cada arquivo fica em `<loja_id>/...` — é essa
 * pasta que as policies do bucket usam pra garantir que cada dono só
 * escreve dentro da própria loja. */
export async function subirImagemCatalogo(
  sb: ReturnType<typeof criarClientNavegador>,
  lojaId: string,
  file: File,
  prefixo?: string
) {
  const nomeSanitizado = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const caminho = `${lojaId}/${prefixo ? prefixo + '-' : ''}${Date.now()}-${nomeSanitizado}`;
  const { error } = await sb.storage.from(BUCKET).upload(caminho, file);
  if (error) throw error;
  return sb.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl as string;
}
