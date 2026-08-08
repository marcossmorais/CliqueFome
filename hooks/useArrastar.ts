import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Arrastar pra reordenar. Porta do mecanismo do admin.html original:
 * Pointer Events em vez de HTML5 drag-and-drop porque o DnD nativo não
 * funciona em touch — e o painel roda em tablet no balcão.
 *
 * Manipula o DOM diretamente dentro do container (como o original), em vez
 * de estado do React a cada pixel de movimento — isso evitaria centenas de
 * re-renders por arrasto. O React só volta a controlar a árvore quando
 * `aoSoltar` chama setState no componente chamador.
 *
 * Usa callback ref (não useRef comum): quando a lista fica vazia e o grid
 * some da árvore — caso comum aqui, com "lista vazia" condicional — um
 * useRef normal não dispara de novo o efeito que liga os listeners no
 * elemento que reaparece depois. O callback ref resolve isso guardando o
 * nó em estado, então o efeito reengata sempre que o elemento é montado.
 *
 * `seletorItem` identifica os itens arrastáveis (ex: '.cat-item'); cada um
 * precisa ter `data-id`. Itens sem `data-id` (como "Todos os itens") ficam
 * de fora da nova ordem devolvida.
 */
export function useArrastar<T extends HTMLElement>(
  seletorItem: string,
  aoSoltar: (ids: string[]) => void
) {
  const [node, setNode] = useState<T | null>(null);
  const ref = useCallback((el: T | null) => setNode(el), []);

  // "Latest ref" pattern: guarda o callback mais recente sem precisar
  // reatar os listeners de pointer a cada render. A escrita acontece num
  // efeito (não durante o render) pra não violar as regras dos hooks.
  const aoSoltarRef = useRef(aoSoltar);
  useEffect(() => {
    aoSoltarRef.current = aoSoltar;
  });

  useEffect(() => {
    if (!node) return;
    const container = node;

    let item: HTMLElement | null = null;
    let moveu = false;

    function onPointerDown(e: PointerEvent) {
      const alvo = e.target as HTMLElement;
      const alca = alvo.closest('[data-arrastar]');
      if (!alca || !container.contains(alca)) return;
      item = alca.closest(seletorItem);
      if (!item) return;
      e.preventDefault();
      moveu = false;
      item.classList.add('arrastando');
      container.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e: PointerEvent) {
      if (!item) return;
      e.preventDefault();
      const candidatos = Array.from(container.querySelectorAll<HTMLElement>(seletorItem));
      const alvoEl = candidatos.find((el) => {
        if (el === item) return false;
        const r = el.getBoundingClientRect();
        return e.clientY >= r.top && e.clientY <= r.bottom && e.clientX >= r.left && e.clientX <= r.right;
      });
      if (!alvoEl) return;
      moveu = true;
      const r = alvoEl.getBoundingClientRect();
      // Se o vizinho está na mesma linha, o grid tem mais de uma coluna e a
      // decisão é horizontal; senão é uma lista e a decisão é vertical.
      const irmao = (alvoEl.nextElementSibling || alvoEl.previousElementSibling) as HTMLElement | null;
      const mesmaLinha = !!irmao && Math.abs(irmao.getBoundingClientRect().top - r.top) < 4;
      const antes = mesmaLinha ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
      container.insertBefore(item, antes ? alvoEl : alvoEl.nextSibling);
    }

    function encerrar(e: PointerEvent) {
      if (!item) return;
      item.classList.remove('arrastando');
      item = null;
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {
        // já liberado
      }
      if (!moveu) return;
      // Engole o clique que o navegador dispara logo depois do arrasto,
      // senão soltar em cima de um card abriria o modal de edição. O
      // setTimeout(0) desarma na próxima macrotarefa — sem isso, se o
      // re-render trocar o DOM antes do clique chegar, o engolidor ficava
      // armado e comia o próximo clique legítimo do usuário.
      const engolir = (ev: MouseEvent) => ev.stopPropagation();
      container.addEventListener('click', engolir, true);
      setTimeout(() => container.removeEventListener('click', engolir, true), 0);

      const ids = Array.from(container.querySelectorAll<HTMLElement>(seletorItem))
        .map((el) => el.dataset.id)
        .filter((id): id is string => !!id);
      aoSoltarRef.current(ids);
    }

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', encerrar);
    container.addEventListener('pointercancel', encerrar);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', encerrar);
      container.removeEventListener('pointercancel', encerrar);
    };
  }, [node, seletorItem]);

  return ref;
}
