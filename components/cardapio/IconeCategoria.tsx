import type { ReactNode } from 'react';

type Props = { nome: string; icone?: string | null; size?: number };
const paths: Record<string, ReactNode> = {
  hamburgueres: <><path d="M4 11h16"/><path d="M5 11c.4-4 3.2-6 7-6s6.6 2 7 6"/><path d="M4 14h16"/><path d="M6 14c.5 3 2.5 4 6 4s5.5-1 6-4"/></>,
  bebidas: <><path d="M8 3h8l-1 18H9L8 3Z"/><path d="M8.5 7h7"/><path d="M10 3V1h4v2"/></>,
  pizzas: <><path d="m3 4 18 8-8 9L3 4Z"/><path d="m7 8 4 2"/><circle cx="13" cy="14" r="1"/><circle cx="9" cy="12" r="1"/></>,
  porcoes: <><path d="M5 10h14l-1 10H6L5 10Z"/><path d="M4 10h16"/><path d="M8 7c0-2 1-3 2-4M12 7c0-2 1-3 2-4M16 7c0-2 1-3 2-4"/></>,
  sobremesas: <><path d="M5 10h14l-1 10H6L5 10Z"/><path d="M4 10h16"/><path d="M7 7c1-3 3-4 5-4s4 1 5 4"/><path d="M9 14h6"/></>,
  combos: <><path d="M4 8h16v12H4z"/><path d="M8 8V5h8v3M8 12h8M8 16h5"/></>,
  acai: <><path d="M6 7h12l-1 14H7L6 7Z"/><path d="M5 7h14"/><path d="M9 4c1-2 3-2 4 0"/><path d="M10 11h4"/></>,
  cafes: <><path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z"/><path d="M17 11h2a3 3 0 0 1 0 6h-2"/><path d="M8 5c-1-1 1-2 0-3M12 5c-1-1 1-2 0-3"/></>,
  saudaveis: <><path d="M12 20C5 17 4 11 5 6c5 0 10 2 7 14Z"/><path d="M12 20c0-6 3-10 8-12"/></>,
  generico: <><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></>,
};
function normalizar(v: string) { return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
export function chaveIconeCategoria(nome: string, icone?: string | null) {
  const key = normalizar(icone || '');
  if (key && paths[key]) return key;
  const n = normalizar(nome);
  if (n.includes('hamburg') || n.includes('lanche')) return 'hamburgueres';
  if (n.includes('bebida') || n.includes('refriger') || n.includes('suco')) return 'bebidas';
  if (n.includes('pizza')) return 'pizzas';
  if (n.includes('porcao') || n.includes('petisco') || n.includes('acompanh')) return 'porcoes';
  if (n.includes('sobremesa') || n.includes('doce') || n.includes('bolo')) return 'sobremesas';
  if (n.includes('combo') || n.includes('kit')) return 'combos';
  if (n.includes('acai')) return 'acai';
  if (n.includes('cafe') || n.includes('cafeter')) return 'cafes';
  if (n.includes('saudavel') || n.includes('salada')) return 'saudaveis';
  return 'generico';
}
export function IconeCategoria({ nome, icone, size = 22 }: Props) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[chaveIconeCategoria(nome, icone)]}</svg>;
}
